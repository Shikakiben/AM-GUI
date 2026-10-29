// Proxy support for AM-GUI.
//
// Every download (icons, categories, AppMan) goes through Electron's net.fetch,
// i.e. Chromium's own network stack: it already follows the proxy the machine is
// configured with, and it tunnels HTTPS correctly. The only thing it will not do
// by itself is send a password, so we answer the proxy's challenge the way a
// browser does: one window, credentials kept in memory, never written to disk.
//
// Two behaviours were measured, and they drive this file:
//
//   1. net.fetch never emits a `login` event, so a failing fetch cannot trigger
//      the prompt. net.request does emit one, with no window needed. That single
//      request is how the credentials get into Chromium's cache; afterwards
//      every net.fetch (and the renderer's own fetch) reuses them.
//   2. On GNOME, Chromium ignores http_proxy/https_proxy and reads gsettings
//      only, so a proxy set through the environment is invisible to it. It is
//      pushed to Chromium when Chromium sees nothing (verified: without that,
//      resolveProxy answers DIRECT even with https_proxy set).
const DEFAULT_PROMPT_TIMEOUT_MS = 120000;
const DEFAULT_RESOLVE_TIMEOUT_MS = 5000;
const AUTH_RETRY_DELAY_MS = 30000;

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
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port,
    url: `${parsed.protocol}//${parsed.hostname}:${port}`,
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
  // Called when remembered credentials turn out to be refused, so the caller
  // can forget them instead of failing on every request.
  const onCredentialsRefused = options.onCredentialsRefused || null;
  const logger = options.logger || console;
  const promptTimeoutMs = options.promptTimeoutMs || DEFAULT_PROMPT_TIMEOUT_MS;
  const resolveTimeoutMs = options.resolveTimeoutMs || DEFAULT_RESOLVE_TIMEOUT_MS;
  const now = options.now || (() => Date.now());

  let credentials = null;      // session only, never persisted
  let credentialsRemembered = false; // came from the stored file, not from the user
  // Chromium keeps its own cache: knowing a password here is not enough, it has
  // to be handed over once before net.fetch will use it.
  let chromiumKnows = false;
  let storedLoaded = false;
  let pendingSeed = null;      // one authentication attempt at a time
  let lastAttemptFailedAt = 0; // avoids a prompt storm when the user cancels
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
  function loadKnownCredentials() {
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
        const found = source();
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
    try { if (typeof onCredentialsRefused === 'function') onCredentialsRefused(); } catch (_) {}
  }

  async function resolveProxy(url) {
    const session = getSession();
    if (!session || typeof session.resolveProxy !== 'function') return null;
    try {
      // A PAC script can take seconds on a slow network; downloads must not
      // wait on it indefinitely. Past the bound, Chromium is treated as DIRECT.
      return await Promise.race([
        session.resolveProxy(url),
        new Promise((resolve) => {
          const timer = setTimeout(() => {
            logger.warn?.('[proxy] proxy resolution took too long, assuming DIRECT');
            resolve('DIRECT');
          }, resolveTimeoutMs);
          if (typeof timer.unref === 'function') timer.unref();
        })
      ]);
    } catch (_) {
      return null;
    }
  }

  // True when Chromium is actually going through a proxy for this URL.
  async function hasProxy(url) {
    const entries = parseResolvedProxy(await resolveProxy(url));
    return entries.some((entry) => entry.type !== 'DIRECT');
  }

  function askOnce() {
    if (!askCredentials) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (answer) => {
        if (settled) return;
        settled = true;
        resolve(answer);
      };
      // A dialog nobody answers must not suspend every download forever.
      const timer = setTimeout(() => finish(null), promptTimeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
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
      const finish = (ok) => {
        if (done) return;
        done = true;
        resolve(ok);
      };
      request.on('login', (authInfo, callback) => {
        try {
          if (typeof onProxyChallenge === 'function') onProxyChallenge(authInfo);
        } catch (_) {}
        // Credentials already known (remembered, given in the proxy URL, or
        // answered for the renderer) are sent without opening a window.
        const reuse = !!credentials;
        const ready = reuse ? Promise.resolve(credentials) : askOnce();
        ready.then((answer) => {
          if (!answer) return callback(); // cancelled: Chromium reports the failure
          if (!reuse) {
            credentials = answer;
            credentialsRemembered = false; // typed now, not read from disk
          }
          callback(answer.username, answer.password);
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
    if (pendingSeed) return pendingSeed;
    loadKnownCredentials();
    if (credentials && chromiumKnows) return true;
    // A cancelled or refused answer must not reopen the window for every icon
    // that fails next: one prompt, then a pause.
    if (lastAttemptFailedAt && now() - lastAttemptFailedAt < AUTH_RETRY_DELAY_MS) return false;
    pendingSeed = (async () => {
      try {
        // No "is there a proxy?" check here: the caller only gets here after a
        // request failed with a 407, so a proxy is evidently involved. Asking
        // Chromium would add a resolution that can be slow or wrong.
        let ok = await seedOnce(url);
        if (!ok) {
          // A remembered password the proxy rejects is useless: forget it and
          // ask once, instead of failing silently on every download.
          if (credentialsRemembered) {
            forgetRemembered();
            ok = await seedOnce(url);
          }
        }
        if (ok) chromiumKnows = true;
        else lastAttemptFailedAt = now();
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
      loadKnownCredentials();
      const key = `${authInfo.host || ''}:${authInfo.port || ''}`;
      // A second challenge from the same proxy with the same answer means the
      // password was refused: ask again instead of looping on a wrong one.
      const alreadyTried = credentials && answered.get(key) === credentials;
      if (alreadyTried) forgetRemembered();
      const reuse = !!(credentials && !alreadyTried);
      const ready = reuse ? Promise.resolve(credentials) : askOnce();
      ready.then((answer) => {
        if (!answer) return callback();
        if (!reuse) {
          credentials = answer;
          credentialsRemembered = false;
        }
        chromiumKnows = true;
        answered.set(key, answer);
        callback(answer.username, answer.password);
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
    resolveProxy,
    hasProxy,
    // exposed for tests
    _credentials: () => credentials
  };
}

module.exports = {
  createProxySupport,
  parseProxyUrl,
  parseResolvedProxy,
  readEnvProxy,
  proxyRulesFromEnv
};
