// Proxy support: make every network path of AM-GUI work behind a proxy.
//
// Design (kept deliberately simple and predictable):
//   1. Where is the proxy?   -> Chromium already knows (gsettings on GNOME,
//      kioslaverc on KDE, environment on XFCE). We ask it with resolveProxy()
//      and reuse the answer for the main process too.
//   2. Who is allowed in?    -> we ASK THE USER, like every browser does when
//      the proxy answers 407. One small window, then the answer is reused for
//      the whole session (Chromium caches it, we cache it for undici).
//   3. The password is never written to disk. It lives in memory for the
//      session only, exactly like a browser tab's proxy credentials.
//
// Why not read a stored password: none exists that we could read. Chromium
// itself refuses to use the ones from the desktop settings ("ProxyConfig does
// not support authentication parameters, but Chrome will prompt for the
// password later", net/proxy_resolution/proxy_config_service_linux.cc), the
// GNOME proxy panel has no field to enter them, and on KDE the password lives
// in KWallet behind kpasswdserver. Asking is therefore the only path that works
// everywhere, and it is what users already expect from a browser.
const { execFileSync } = require('child_process');
const undici = require('undici');

const CREDENTIALS_TTL_MS = 5 * 60 * 1000;
const ENV_PROXY_KEYS = ['https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY', 'http_proxy', 'HTTP_PROXY'];

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
  const credentials = parsed.username
    ? {
        username: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password || '')
      }
    : null;
  return {
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port,
    url: `${parsed.protocol}//${parsed.hostname}:${port}`,
    credentials
  };
}

function readEnvProxy(env) {
  for (const key of ENV_PROXY_KEYS) {
    const raw = env && env[key];
    if (!raw || !String(raw).trim()) continue;
    const parsed = parseProxyUrl(raw);
    if (parsed) return { ...parsed, source: `env:${key}` };
  }
  return null;
}

// Parses the string returned by session.resolveProxy():
// "PROXY host:port", "DIRECT", or "PROXY a:1; PROXY b:2; DIRECT".
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

function basicToken(credentials) {
  if (!credentials || !credentials.username) return null;
  const pair = `${credentials.username}:${credentials.password || ''}`;
  return `Basic ${Buffer.from(pair, 'utf8').toString('base64')}`;
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
  // Supplied by main.js: it shows the same password window the app already uses.
  const askCredentials = options.askCredentials || null;
  // Called with Chromium's authInfo when a proxy asks for credentials, so the
  // caller can name the proxy in its window.
  const onProxyChallenge = options.onProxyChallenge || null;
  const logger = options.logger || console;
  const now = options.now || (() => Date.now());

  const dispatchers = new Map();
  let credentials = null;         // session-only, never persisted
  let credentialsAt = 0;
  let pendingAsk = null;
  let envConfigured = false;
  // Remembers which credentials were already sent to which proxy, so a second
  // challenge means they were refused and we must ask again instead of looping.
  const answered = new Map();

  function cachedCredentials() {
    if (credentials && now() - credentialsAt < CREDENTIALS_TTL_MS) return credentials;
    return null;
  }

  function rememberCredentials(next) {
    credentials = next;
    credentialsAt = now();
    // A new identity invalidates pooled agents built with the previous one.
    dispatchers.clear();
    answered.clear();
  }

  // One window at a time: several requests hitting the 407 together must not
  // open several dialogs. `rejected` forces a new prompt (wrong password).
  async function credentialsForProxy(rejected) {
    if (!rejected) {
      const cached = cachedCredentials();
      if (cached) return cached;
    }
    if (!askCredentials) return null;
    if (pendingAsk) return pendingAsk;
    pendingAsk = (async () => {
      try {
        const answer = await askCredentials();
        if (answer && answer.username) {
          rememberCredentials({ username: answer.username, password: answer.password || '' });
          return credentials;
        }
        return null;
      } catch (error) {
        logger.warn?.('[proxy] could not ask for proxy credentials:', error?.message || error);
        return null;
      } finally {
        pendingAsk = null;
      }
    })();
    return pendingAsk;
  }

  async function resolveProxy(url) {
    const session = getSession();
    if (!session || typeof session.resolveProxy !== 'function') return null;
    try {
      return await session.resolveProxy(url);
    } catch (_) {
      return null;
    }
  }

  // Chromium reads http_proxy on XFCE/LXQt but not on GNOME (its gsettings
  // getter wins, even when it says "none"). Push the environment proxy when
  // Chromium sees nothing, so every desktop behaves the same.
  async function configureFromEnvironment() {
    if (envConfigured) return false;
    envConfigured = true;
    const session = getSession();
    if (!session || typeof session.setProxy !== 'function') return false;
    const rules = proxyRulesFromEnv(env);
    if (!rules) return false;
    const probe = await resolveProxy('https://raw.githubusercontent.com/');
    const alreadyProxied = parseResolvedProxy(probe).some((entry) => entry.type !== 'DIRECT');
    if (alreadyProxied) return false;
    try {
      await session.setProxy({ proxyRules: rules });
      logger.warn?.('[proxy] environment proxy applied:', rules);
      return true;
    } catch (error) {
      logger.warn?.('[proxy] could not apply environment proxy:', error?.message || error);
      return false;
    }
  }

  async function dispatcherFor(url) {
    const entries = parseResolvedProxy(await resolveProxy(url));
    const proxy = entries.find((entry) => ['PROXY', 'HTTPS', 'SOCKS', 'SOCKS5'].includes(entry.type));
    if (!proxy) return null;

    const creds = cachedCredentials();
    const token = basicToken(creds);
    const key = `${proxy.type}|${proxy.url}|${token || ''}`;
    const existing = dispatchers.get(key);
    if (existing) return existing;

    const agentOptions = { uri: proxy.url };
    if (token) agentOptions.token = token;
    let agent;
    try {
      agent = new undici.ProxyAgent(agentOptions);
    } catch (error) {
      logger.warn?.('[proxy] cannot create proxy agent:', error?.message || error);
      return null;
    }
    dispatchers.set(key, agent);
    return agent;
  }

  // Drop-in replacement for undici.fetch that goes through the machine's proxy.
  async function fetchWithProxy(url, init = {}) {
    const dispatcher = await dispatcherFor(url).catch(() => null);
    if (!dispatcher) return undici.fetch(url, init);
    try {
      return await undici.fetch(url, { ...init, dispatcher });
    } catch (error) {
      // A pooled agent built without credentials cannot answer a 407: ask, then
      // retry once with the new identity.
      const isAuthFailure = error?.statusCode === 407 || error?.cause?.statusCode === 407;
      if (!isAuthFailure || cachedCredentials()) throw error;
      const asked = await credentialsForProxy();
      if (!asked) throw error;
      const retryDispatcher = await dispatcherFor(url).catch(() => null);
      if (!retryDispatcher) throw error;
      return undici.fetch(url, { ...init, dispatcher: retryDispatcher });
    }
  }

  // Chromium's side: answer the proxy's 407 with the user's answer. The callback
  // may be deferred (verified: Chromium waits), so a real dialog fits here.
  function installLoginHandler(app) {
    if (!app || typeof app.on !== 'function') return false;
    app.on('login', (event, _webContents, details, authInfo, callback) => {
      if (!authInfo || !authInfo.isProxy) return;
      // Remember which proxy asks, so the window can name it.
      try {
        if (typeof onProxyChallenge === 'function') onProxyChallenge(authInfo);
      } catch (_) {}
      const proxyKey = `${authInfo.host || ''}:${authInfo.port || ''}`;
      const cached = cachedCredentials();
      // Second challenge from the same proxy = the password was refused.
      const alreadyTried = cached && answered.get(proxyKey) === basicToken(cached);
      event.preventDefault();
      const credentialsReady = (cached && !alreadyTried) ? Promise.resolve(cached) : credentialsForProxy(alreadyTried);
      credentialsReady.then((answer) => {
        if (!answer) {
          callback(); // cancelled: Chromium reports the failure to the caller
          return;
        }
        answered.set(proxyKey, basicToken(answer));
        callback(answer.username, answer.password);
      });
    });
    return true;
  }

  async function close() {
    for (const agent of dispatchers.values()) {
      try {
        await agent.close();
      } catch (_) {}
    }
    dispatchers.clear();
  }

  return {
    configureFromEnvironment,
    dispatcherFor,
    fetchWithProxy,
    installLoginHandler,
    resolveProxy,
    credentialsForProxy,
    close,
    // exposed for tests
    _parseResolvedProxy: parseResolvedProxy,
    _cachedCredentials: cachedCredentials
  };
}

module.exports = {
  createProxySupport,
  parseProxyUrl,
  parseResolvedProxy,
  readEnvProxy,
  proxyRulesFromEnv,
  basicToken
};
