// Proxy support for AM-GUI.
//
// Every download (icons, categories, AppMan) goes through Electron's net.fetch,
// i.e. Chromium's own network stack: it already follows the proxy the machine is
// configured with, and it tunnels HTTPS correctly. The only thing it will not do
// by itself is send a password, so we answer the proxy's challenge the way a
// browser does.
//
// A password is asked for only when it is nowhere to be found: not remembered
// from a previous run, not in the desktop's settings, not in the proxy URL. It
// stays in memory for the session unless the user ticks the box, which stores it
// encrypted by the system keyring (see proxyCredentials.js).
//
// Behaviours measured on Electron 43, which drive this file:
//
//   1. net.fetch never emits a `login` event, so a failing fetch cannot trigger
//      the prompt. net.request does emit one, with no window needed. That single
//      request is how the credentials get into Chromium's cache; afterwards
//      every net.fetch (and the renderer's own fetch) reuses them.
//   2. On GNOME, Chromium ignores http_proxy/https_proxy and reads gsettings
//      only, so a proxy set through the environment is invisible to it. It is
//      pushed to Chromium when Chromium sees nothing (verified: without that,
//      resolveProxy answers DIRECT even with https_proxy set).
//   3. Chromium caches the answer we give it, wrong ones included, and replays it
//      without asking again: the auth cache has to be cleared after a refusal.
//   4. Chromium ignores the credentials stored in gsettings, so the desktop's
//      values are read here rather than relied upon there.
const DEFAULT_PROMPT_TIMEOUT_MS = 120000;
const DEFAULT_RESOLVE_TIMEOUT_MS = 5000;
const AUTH_RETRY_DELAY_MS = 30000;
const DEFAULT_SEED_TIMEOUT_MS = 20000;
const CHALLENGE_RESET_MS = 60000;

// Accepts "host:port", "http://host:port" and "http://user:pass@host:port".
function parseProxyUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let candidate = raw.trim();
  if (!candidate) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `http://${candidate}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (_) {
    return null;
  }
  if (!parsed.hostname) return null;
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  return {
    host: parsed.hostname,
    port,
    // Credentials written in the URL are honoured: if the user already told the
    // system where to log in, there is no reason to ask again.
    credentials: parsed.username
      ? { username: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password || '') }
      : null
  };
}

const ENV_PROXY_KEYS = ['https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY', 'http_proxy', 'HTTP_PROXY'];

function readEnvProxy(env) {
  for (const key of ENV_PROXY_KEYS) {
    const raw = env && env[key];
    if (!raw || !String(raw).trim()) continue;
    const parsed = parseProxyUrl(raw);
    if (parsed) return { ...parsed, source: `env:${key}` };
  }
  return null;
}

// Does this error mean "the proxy wants a password"?
//
// Measured: a 407 on a CONNECT tunnel surfaces as ERR_TUNNEL_CONNECTION_FAILED,
// and a 407 on a plain HTTP request comes back as a 407 response (handled by the
// caller). Everything else — DNS failure, no network, connection refused, our own
// timeout — must NOT open a password prompt: asking for a password because the
// Wi-Fi is off would be absurd, and the user could not fix it.
function looksLikeProxyAuthFailure(error) {
  if (!error) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return false;
  const message = String(error.message || error);
  return /ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_AUTH|Proxy Authentication Required/i.test(message);
}

// Parses what session.resolveProxy() returns: "PROXY host:port", "DIRECT", or
// "PROXY a:1; PROXY b:2; DIRECT".
function parseResolvedProxy(resolved) {
  if (!resolved || typeof resolved !== 'string') return [];
  const entries = [];
  for (const part of resolved.split(';')) {
    const tokens = part.trim().split(/\s+/);
    if (!tokens.length) continue;
    const type = tokens[0].toUpperCase();
    if (type === 'DIRECT') {
      entries.push({ type: 'DIRECT' });
      continue;
    }
    if (!tokens[1]) continue;
    const parsed = parseProxyUrl(tokens[1]);
    if (parsed) entries.push({ type, ...parsed });
  }
  return entries;
}

// Builds the "http=host:port;https=host:port" rule Chromium expects.
function proxyRulesFromEnv(env) {
  const https = readEnvProxy({ https_proxy: env?.https_proxy, HTTPS_PROXY: env?.HTTPS_PROXY });
  const http = readEnvProxy({ http_proxy: env?.http_proxy, HTTP_PROXY: env?.HTTP_PROXY }) || https;
  if (!http && !https) return null;
  const rules = [];
  if (http) rules.push(`http=${http.host}:${http.port}`);
  if (https) rules.push(`https=${https.host}:${https.port}`);
  return rules.join(';');
}

function createProxySupport(options = {}) {
  const getSession = options.getSession || (() => null);
  const env = options.env || process.env;
  // Resolves { username, password } or null when the user cancels.
  const askCredentials = options.askCredentials || null;
  // Called with Chromium's authInfo so the window can name the proxy.
  const onProxyChallenge = options.onProxyChallenge || null;
  // net.request, injectable so this file stays testable without Electron.
  const requestFn = options.request || null;
  // Supplies credentials remembered from a previous run, if any.
  const getInitialCredentials = options.getInitialCredentials || null;
  // Supplies the credentials the desktop itself was configured with.
  const getSystemCredentials = options.getSystemCredentials || null;
  // Clears Chromium's HTTP auth cache. Needed because Chromium caches whatever
  // answer we gave it, even a wrong one: without this, a refused password is
  // replayed for every later request and the prompt never comes back (measured).
  const clearAuthCache = options.clearAuthCache || null;
  // Called once the proxy accepts us, so the caller can retry what failed while
  // the password was still missing (icons downloaded before it gave up).
  const onAuthenticated = options.onAuthenticated || null;
  // Called when remembered credentials turn out to be refused, so the caller
  // can forget them instead of failing on every request.
  const onCredentialsRefused = options.onCredentialsRefused || null;
  // Called when the dialog is given up on, so the caller can close it instead of
  // leaving a dead window on screen.
  const onPromptTimeout = options.onPromptTimeout || null;
  const logger = options.logger || console;
  const promptTimeoutMs = options.promptTimeoutMs || DEFAULT_PROMPT_TIMEOUT_MS;
  const resolveTimeoutMs = options.resolveTimeoutMs || DEFAULT_RESOLVE_TIMEOUT_MS;
  const seedTimeoutMs = options.seedTimeoutMs || DEFAULT_SEED_TIMEOUT_MS;
  const now = options.now || (() => Date.now());

  let credentials = null;      // in-memory copy; the file, if any, is in proxyCredentials.js
  let credentialsRemembered = false; // came from the stored file, not from the user
  // Chromium keeps its own cache: knowing a password here is not enough, it has
  // to be handed over once before net.fetch will use it.
  let chromiumKnows = false;
  let storedLoaded = false;
  let pendingSeed = null;      // one authentication attempt at a time
  let pendingAsk = null;       // one dialog at a time, however many requests ask
  let lastAttemptFailedAt = 0; // download backoff, so icons do not hammer AM
  let pausedUntil = 0;         // the dialog itself must stay closed until then
  let refusedTyped = 0;        // consecutive wrong entries typed by the user
  let lastChallengeAt = 0;     // used to tell "still refusing" from "worked for a while"
  let envConfigured = false;
  // Which credentials were already sent to which proxy, so a second challenge
  // means they were refused.
  const answered = new Map();

  // Every place a password may already be known, in order of authority:
  //   1. what the user asked to remember last time;
  //   2. what the desktop was configured with;
  //   3. what the proxy URL itself carries (http://user:pass@host:port).
  // Only if all three are empty does the window open. Loaded lazily, on the
  // first request that needs it, so startup stays untouched.
  async function loadKnownCredentials() {
    if (storedLoaded) return;
    storedLoaded = true;
    const sources = [
      getInitialCredentials,
      getSystemCredentials,
      () => readEnvProxy(env)?.credentials || null
    ];
    for (const source of sources) {
      if (!source) continue;
      try {
        // Sources may be asynchronous: reading the keyring is.
        const found = await source();
        if (found && found.username) {
          credentials = found;
          credentialsRemembered = true; // not typed now: if refused, forget it
          return;
        }
      } catch (error) {
        logger.warn?.('[proxy] could not read stored credentials:', error?.message || error);
      }
    }
  }

  // Remembered credentials that the proxy refuses must be dropped, or every
  // request would keep failing on a password the user can no longer fix.
  function forgetRemembered() {
    if (!credentialsRemembered) return;
    credentials = null;
    credentialsRemembered = false;
    chromiumKnows = false;
    answered.clear();
    // A later success must be able to trigger the retry again.
    notifiedAuthenticated = false;
    try { if (typeof onCredentialsRefused === 'function') onCredentialsRefused(); } catch (_) {}
  }

  // Two separate brakes, because they protect against different things:
  //   - the dialog stays closed after a cancel or two wrong entries in a row;
  //   - downloads back off after a failure, so a hundred icons do not each try
  //     three times.
  // Conflating them blocked the one correction the user is entitled to.
  function dialogPaused() {
    return !!pausedUntil && now() < pausedUntil;
  }

  function pauseDialog() {
    pausedUntil = now() + AUTH_RETRY_DELAY_MS;
  }

  let notifiedAuthenticated = false;
  function notifyAuthenticated() {
    if (notifiedAuthenticated) return;
    notifiedAuthenticated = true;
    try { if (typeof onAuthenticated === 'function') onAuthenticated(); } catch (_) {}
  }

  function forgetChromiumCache() {
    if (typeof clearAuthCache !== 'function') return Promise.resolve();
    try {
      return Promise.resolve(clearAuthCache()).catch(() => {});
    } catch (_) {
      return Promise.resolve();
    }
  }

  async function resolveProxy(url) {
    const session = getSession();
    if (!session || typeof session.resolveProxy !== 'function') return null;
    // A PAC script can take seconds on a slow network; downloads must not wait
    // on it indefinitely. Past the bound, Chromium is treated as DIRECT.
    let timer = null;
    try {
      return await Promise.race([
        session.resolveProxy(url),
        new Promise((resolve) => {
          // Deliberately NOT unref'd: a safety timeout that cannot fire is not a
          // safety timeout. Measured in CI, an unref'd timer never fires when
          // nothing else keeps the event loop alive, and the promise then stays
          // pending for ever. It is cleared below as soon as Chromium answers,
          // so it never keeps the app alive for nothing.
          timer = setTimeout(() => {
            logger.warn?.('[proxy] proxy resolution took too long, assuming DIRECT');
            resolve('DIRECT');
          }, resolveTimeoutMs);
        })
      ]);
    } catch (_) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // True when Chromium is actually going through a proxy for this URL.
  async function hasProxy(url) {
    const entries = parseResolvedProxy(await resolveProxy(url));
    return entries.some((entry) => entry.type !== 'DIRECT');
  }

  // One dialog at a time. The login handler fires once per request, so several
  // descriptions loading together used to open several windows in a row, each
  // replacing the previous one, and leave the others waiting two minutes.
  function askOnce() {
    if (!askCredentials) return Promise.resolve(null);
    if (pendingAsk) return pendingAsk;
    pendingAsk = new Promise((resolve) => {
      let settled = false;
      const finish = (answer) => {
        if (settled) return;
        settled = true;
        pendingAsk = null;
        resolve(answer);
      };
      // A dialog nobody answers must not suspend every download forever.
      // Not unref'd, for the reason given above: it has to actually fire.
      const timer = setTimeout(() => {
        // Tell the caller, so it can close the window: leaving it on screen
        // after giving up means the user's answer goes nowhere.
        try { if (typeof onPromptTimeout === 'function') onPromptTimeout(); } catch (_) {}
        finish(null);
      }, promptTimeoutMs);
      Promise.resolve()
        .then(() => askCredentials())
        .then((answer) => {
          clearTimeout(timer);
          finish(answer && answer.username ? answer : null);
        })
        .catch((error) => {
          clearTimeout(timer);
          logger.warn?.('[proxy] could not ask for credentials:', error?.message || error);
          finish(null);
        });
    });
    return pendingAsk;
  }

  // One request whose only purpose is to make Chromium ask for the proxy
  // password. net.fetch cannot do it (measured: it emits no login event, and
  // either returns a bare 407 or fails with ERR_TUNNEL_CONNECTION_FAILED);
  // net.request can, and its answer lands in Chromium's credential cache.
  function seedOnce(url) {
    if (!requestFn) return Promise.resolve(false);
    return new Promise((resolve) => {
      let request;
      try {
        request = requestFn(url);
      } catch (error) {
        logger.warn?.('[proxy] cannot create the seed request:', error?.message || error);
        return resolve(false);
      }
      let done = false;
      let challenges = 0;
      // This request exists only to reach the proxy's challenge. It must never
      // hold the queue: measured, it can stay silent for ever when Chromium
      // keeps re-challenging, and then every later download waited on it.
      // Not unref'd: this is the only thing that ends the request when Chromium
      // keeps re-challenging, so it must be able to fire.
      const timer = setTimeout(() => {
        logger.warn?.('[proxy] authentication request timed out');
        try { request.abort(); } catch (_) {}
        finish(false);
      }, seedTimeoutMs);
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(ok);
      };
      request.on('login', (authInfo, callback) => {
        challenges += 1;
        // Chromium may re-challenge on the same request; answering more than
        // twice means the answer is wrong, and looping helps nobody.
        if (challenges > 2) {
          try { request.abort(); } catch (_) {}
          finish(false);
          return;
        }
        try {
          if (typeof onProxyChallenge === 'function') onProxyChallenge(authInfo);
        } catch (_) {}
        // Credentials already known (remembered, given in the proxy URL, or
        // answered for the renderer) are sent without opening a window.
        const reuse = !!credentials;
        const ready = reuse ? Promise.resolve(credentials) : askOnce();
        ready.then((answer) => {
          if (!answer) {
            // Cancelled: Chromium reports the failure, and the dialog must not
            // reopen for the next icon in the queue.
            if (!reuse) pauseDialog();
            return callback();
          }
          if (!reuse) {
            credentials = answer;
            credentialsRemembered = false; // typed now, not read from disk
          }
          callback(answer.username, answer.password);
        }).catch((error) => {
          // Never leave Chromium waiting: a thrown error here would keep the
          // request open until the seed timer aborts it.
          logger.warn?.('[proxy] seed answer failed:', error?.message || error);
          try { callback(); } catch (_) {}
          finish(false);
        });
      });
      request.on('response', (res) => {
        // Drain and drop the body: only the handshake matters here.
        res.on('data', () => {});
        res.on('end', () => finish(true));
        res.on('error', () => finish(false));
      });
      // An error means the request did not get through, even if a challenge was
      // answered: a password the proxy rejects lands here too.
      request.on('error', () => finish(false));
      try {
        request.end();
      } catch (_) {
        finish(false);
      }
    });
  }

  // Makes sure Chromium has the proxy credentials, asking the user once.
  // Returns true when a proxy was found and is now usable.
  async function ensureProxyAuth(url) {
    // The guard is taken synchronously, before any await: otherwise three
    // simultaneous downloads all pass it and open three dialogs (measured as a
    // regression when reading the keyring became asynchronous).
    if (pendingSeed) return pendingSeed;
    if (credentials && chromiumKnows) return true;
    if (dialogPaused()) return false;
    if (lastAttemptFailedAt && now() - lastAttemptFailedAt < AUTH_RETRY_DELAY_MS) return false;
    pendingSeed = (async () => {
      try {
        await loadKnownCredentials();
        if (credentials && chromiumKnows) return true;
        // No "is there a proxy?" check here: the caller only gets here after a
        // request failed with a 407, so a proxy is evidently involved. Asking
        // Chromium would add a resolution that can be slow or wrong.
        let ok = await seedOnce(url);
        if (!ok && credentialsRemembered) {
          // A remembered password the proxy rejects is useless: forget it and
          // ask once, instead of failing silently on every download.
          forgetRemembered();
          ok = await seedOnce(url);
        }
        if (!ok && !credentialsRemembered && !dialogPaused()) {
          // The user just typed something the proxy refused. Give exactly one
          // immediate chance to correct a typo; past that, back off, otherwise
          // the dialog reopens in a loop. The cache must be cleared first, or
          // Chromium silently replays the refused password instead of asking.
          credentials = null;
          chromiumKnows = false;
          answered.clear();
          await forgetChromiumCache();
          ok = await seedOnce(url);
        }
        if (ok) {
          chromiumKnows = true;
          refusedTyped = 0;
          pausedUntil = 0;
          lastAttemptFailedAt = 0; // no stale backoff once it works
          notifyAuthenticated();
        } else {
          lastAttemptFailedAt = now();
          // A wrong password typed by the user must not be reused for ever:
          // drop it so the next attempt (after the pause) asks again.
          if (!credentialsRemembered) {
            credentials = null;
            chromiumKnows = false;
            answered.clear();
          }
        }
        return ok;
      } catch (error) {
        logger.warn?.('[proxy] authentication attempt failed:', error?.message || error);
        lastAttemptFailedAt = now();
        return false;
      } finally {
        pendingSeed = null;
      }
    })();
    return pendingSeed;
  }

  // Chromium's side, for the renderer's own requests (descriptions, images).
  // It fires only when a page needs the proxy; the answer is shared with the
  // main process through Chromium's per-session credential cache.
  function installLoginHandler(app) {
    if (!app || typeof app.on !== 'function') return false;
    app.on('login', (event, _webContents, _details, authInfo, callback) => {
      if (!authInfo || !authInfo.isProxy) return; // leave website logins alone
      try {
        if (typeof onProxyChallenge === 'function') onProxyChallenge(authInfo);
      } catch (_) {}
      event.preventDefault();
      // Reading the keyring is asynchronous, so the whole decision is.
      (async () => {
        await loadKnownCredentials();
        // Answering is not succeeding: Chromium tells us nothing when it stops
        // challenging. Silence is therefore the only sign that the last answer
        // worked, so a long gap since the previous challenge means the user is
        // starting over — give them a full correction chance again.
        if (lastChallengeAt && now() - lastChallengeAt > CHALLENGE_RESET_MS) {
          refusedTyped = 0;
          pausedUntil = 0;
          answered.clear();
        }
        lastChallengeAt = now();
        const key = `${authInfo.host || ''}:${authInfo.port || ''}`;
        // A second challenge from the same proxy with the same answer means the
        // password was refused.
        const alreadyTried = credentials && answered.get(key) === credentials;
        if (alreadyTried) {
          refusedTyped += 1;
          forgetRemembered();
          // One wrong entry is normal: ask again straight away so the user can
          // correct it. A second one in a row means prompting again will not
          // help, so pause instead of reopening the window in a loop.
          if (refusedTyped >= 2) {
            credentials = null;
            answered.clear();
            pauseDialog();
            forgetChromiumCache();
            callback();
            return;
          }
        }
        const reuse = !!(credentials && !alreadyTried);
        // Paused after a cancel or two wrong entries: fail quietly. The download
        // backoff is deliberately not consulted here, or the user would be left
        // with no way to correct a single typo.
        if (!reuse && dialogPaused()) {
          callback();
          return;
        }
        const answer = reuse
          ? credentials
          : await forgetChromiumCache().then(() => askOnce());
        if (!answer) {
          pauseDialog(); // cancelled: do not insist
          callback();
          return;
        }
        if (!reuse) {
          credentials = answer;
          credentialsRemembered = false;
        }
        chromiumKnows = true;
        answered.set(key, answer);
        notifyAuthenticated();
        callback(answer.username, answer.password);
      })().catch((error) => {
        logger.warn?.('[proxy] login handling failed:', error?.message || error);
        callback();
      });
    });
    return true;
  }

  // Chromium reads http_proxy on XFCE/LXQt but not on GNOME (its gsettings
  // getter wins, even when it says "none"). Push the environment proxy when
  // Chromium sees nothing, so every desktop behaves the same. Never awaited on
  // the startup path: a slow resolver must not delay the window.
  async function configureFromEnvironment(url = 'https://portable-linux-apps.github.io/') {
    if (envConfigured) return false;
    envConfigured = true;
    const session = getSession();
    if (!session || typeof session.setProxy !== 'function') return false;
    const rules = proxyRulesFromEnv(env);
    if (!rules) return false;
    if (await hasProxy(url)) return false;
    try {
      await session.setProxy({ proxyRules: rules });
      logger.warn?.('[proxy] environment proxy applied:', rules);
      return true;
    } catch (error) {
      logger.warn?.('[proxy] could not apply environment proxy:', error?.message || error);
      return false;
    }
  }

  return {
    configureFromEnvironment,
    ensureProxyAuth,
    installLoginHandler,
    // exposed for tests
    _credentials: () => credentials
  };
}

module.exports = {
  createProxySupport,
  looksLikeProxyAuthFailure,
  parseProxyUrl,
  parseResolvedProxy,
  readEnvProxy,
  proxyRulesFromEnv
};
