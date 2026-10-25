// Proxy support: AM-GUI finds the proxy, then asks the user for credentials the
// way a browser does. Nothing is ever written to disk.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const {
  parseProxyUrl,
  parseResolvedProxy,
  readEnvProxy,
  proxyRulesFromEnv,
  basicToken,
  createProxySupport
} = require(path.join(repoRoot, 'src/main/proxy'));

describe('proxy URL parsing', () => {
  it('reads host and port from the bare form', () => {
    const parsed = parseProxyUrl('proxy.corp:3128');
    assert.strictEqual(parsed.host, 'proxy.corp');
    assert.strictEqual(parsed.port, '3128');
    assert.strictEqual(parsed.credentials, null);
  });

  it('reads credentials embedded in the URL', () => {
    const parsed = parseProxyUrl('http://user:p%40ss@proxy.corp:3128');
    assert.deepStrictEqual(parsed.credentials, { username: 'user', password: 'p@ss' });
  });

  it('rejects junk', () => {
    assert.strictEqual(parseProxyUrl(''), null);
    assert.strictEqual(parseProxyUrl(null), null);
    assert.strictEqual(parseProxyUrl('http://'), null);
  });
});

describe('Chromium proxy resolution', () => {
  it('parses PROXY, DIRECT and multi-hop answers', () => {
    assert.deepStrictEqual(parseResolvedProxy('DIRECT'), [{ type: 'DIRECT' }]);
    const single = parseResolvedProxy('PROXY 10.0.0.1:3128');
    assert.strictEqual(single[0].host, '10.0.0.1');
    assert.strictEqual(single[0].port, '3128');
    const fallback = parseResolvedProxy('PROXY a:1; PROXY b:2; DIRECT');
    assert.strictEqual(fallback.length, 3);
    assert.strictEqual(fallback[2].type, 'DIRECT');
  });

  it('tolerates an empty or malformed answer', () => {
    assert.deepStrictEqual(parseResolvedProxy(''), []);
    assert.deepStrictEqual(parseResolvedProxy(null), []);
    assert.deepStrictEqual(parseResolvedProxy('PROXY'), []);
  });
});

describe('environment proxy', () => {
  it('takes https_proxy first and keeps its credentials', () => {
    const found = readEnvProxy({ https_proxy: 'http://u:p@proxy:8443', http_proxy: 'http://other:1' });
    assert.strictEqual(found.host, 'proxy');
    assert.deepStrictEqual(found.credentials, { username: 'u', password: 'p' });
    assert.strictEqual(found.source, 'env:https_proxy');
  });

  it('ignores empty values', () => {
    assert.strictEqual(readEnvProxy({ https_proxy: '   ' }), null);
    assert.strictEqual(readEnvProxy({}), null);
  });

  it('builds the rule string Chromium expects', () => {
    assert.strictEqual(proxyRulesFromEnv({ http_proxy: 'http://a:1', https_proxy: 'http://b:2' }), 'http=a:1;https=b:2');
    assert.strictEqual(proxyRulesFromEnv({}), null);
  });
});

describe('proxy support', () => {
  function fakeSession(resolved, calls = {}) {
    return {
      async resolveProxy(url) {
        calls.resolvedFor = url;
        return resolved;
      },
      async setProxy(config) {
        calls.setProxy = config;
      }
    };
  }

  it('does not touch Chromium when the proxy is already known', async () => {
    const calls = {};
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY 10.0.0.1:3128', calls),
      env: { http_proxy: 'http://envproxy:1' }
    });
    assert.strictEqual(await support.configureFromEnvironment(), false);
    assert.strictEqual(calls.setProxy, undefined);
  });

  it('pushes the environment proxy when Chromium sees none', async () => {
    const calls = {};
    const support = createProxySupport({
      getSession: () => fakeSession('DIRECT', calls),
      env: { https_proxy: 'http://envproxy:8443' }
    });
    assert.strictEqual(await support.configureFromEnvironment(), true);
    assert.strictEqual(calls.setProxy.proxyRules, 'http=envproxy:8443;https=envproxy:8443');
  });

  it('does nothing without a session or without an environment proxy', async () => {
    const noSession = createProxySupport({ getSession: () => null, env: { https_proxy: 'http://a:1' } });
    assert.strictEqual(await noSession.configureFromEnvironment(), false);
    const noEnv = createProxySupport({ getSession: () => fakeSession('DIRECT'), env: {} });
    assert.strictEqual(await noEnv.configureFromEnvironment(), false);
  });

  it('builds no dispatcher for a direct connection', async () => {
    const support = createProxySupport({ getSession: () => fakeSession('DIRECT'), env: {} });
    assert.strictEqual(await support.dispatcherFor('https://example.test/x.png'), null);
  });

  it('asks the user once, then reuses the answer', async () => {
    let asked = 0;
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      askCredentials: async () => { asked += 1; return { username: 'alice', password: 's3cret' }; }
    });
    const first = await support.credentialsForProxy();
    const second = await support.credentialsForProxy();
    assert.deepStrictEqual(first, { username: 'alice', password: 's3cret' });
    assert.strictEqual(second, first);
    assert.strictEqual(asked, 1, 'the window must not open twice');
  });

  it('opens a single window when several requests fail together', async () => {
    let asked = 0;
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      askCredentials: async () => {
        asked += 1;
        await new Promise((r) => setTimeout(r, 20));
        return { username: 'alice', password: 's3cret' };
      }
    });
    const answers = await Promise.all([
      support.credentialsForProxy(),
      support.credentialsForProxy(),
      support.credentialsForProxy()
    ]);
    assert.strictEqual(asked, 1, 'concurrent requests share one prompt');
    assert.ok(answers.every((a) => a && a.username === 'alice'));
  });

  it('remembers a cancellation instead of asking forever', async () => {
    let asked = 0;
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      askCredentials: async () => { asked += 1; return null; }
    });
    assert.strictEqual(await support.credentialsForProxy(), null);
    assert.strictEqual(await support.credentialsForProxy(), null);
    assert.strictEqual(asked, 2, 'a cancel is not cached, but must not loop');
  });

  it('keeps the password in memory only', async () => {
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      askCredentials: async () => ({ username: 'alice', password: 's3cret' })
    });
    await support.credentialsForProxy();
    // The credentials are exposed for the session, and expire.
    assert.deepStrictEqual(support._cachedCredentials(), { username: 'alice', password: 's3cret' });
  });

  it('expires the cached credentials after the TTL', async () => {
    let clock = 1000;
    let asked = 0;
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      now: () => clock,
      askCredentials: async () => { asked += 1; return { username: 'alice', password: 's3cret' }; }
    });
    await support.credentialsForProxy();
    clock += 6 * 60 * 1000;
    await support.credentialsForProxy();
    assert.strictEqual(asked, 2);
  });

  it('answers Chromium proxy challenges with the user answer', async () => {
    const handlers = {};
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      askCredentials: async () => ({ username: 'alice', password: 's3cret' })
    });
    assert.strictEqual(support.installLoginHandler({ on: (e, h) => { handlers[e] = h; } }), true);

    let prevented = false;
    const answer = await new Promise((resolve) => {
      handlers.login(
        { preventDefault() { prevented = true; } },
        null,
        { url: 'https://portable-linux-apps.github.io/app/x.json' },
        { isProxy: true, scheme: 'basic' },
        (username, password) => resolve({ username, password })
      );
    });
    assert.strictEqual(prevented, true);
    assert.deepStrictEqual(answer, { username: 'alice', password: 's3cret' });
  });

  it('answers a second challenge without asking again when it worked', async () => {
    const handlers = {};
    let asked = 0;
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      askCredentials: async () => { asked += 1; return { username: 'alice', password: 's3cret' }; }
    });
    support.installLoginHandler({ on: (e, h) => { handlers[e] = h; } });
    // Two different proxies: the first answer is reused without a new window.
    const fire = (host) => new Promise((resolve) => {
      handlers.login({ preventDefault() {} }, null, {}, { isProxy: true, host, port: 3128 }, (u, p) => resolve({ u, p }));
    });
    const first = await fire('proxy-a');
    const second = await fire('proxy-b');
    assert.deepStrictEqual(first, { u: 'alice', p: 's3cret' });
    assert.deepStrictEqual(second, { u: 'alice', p: 's3cret' });
    assert.strictEqual(asked, 1);
  });

  it('asks again when the password was refused', async () => {
    const handlers = {};
    let asked = 0;
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      askCredentials: async () => {
        asked += 1;
        return asked === 1
          ? { username: 'alice', password: 'wrong' }
          : { username: 'alice', password: 'right' };
      }
    });
    support.installLoginHandler({ on: (e, h) => { handlers[e] = h; } });
    const fire = () => new Promise((resolve) => {
      handlers.login({ preventDefault() {} }, null, {}, { isProxy: true, host: 'proxy.corp', port: 3128 }, (u, p) => resolve({ u, p }));
    });
    const first = await fire();
    const second = await fire(); // same proxy challenges again => refused
    assert.deepStrictEqual(first, { u: 'alice', p: 'wrong' });
    assert.deepStrictEqual(second, { u: 'alice', p: 'right' });
    assert.strictEqual(asked, 2);
  });

  it('reports the proxy to the caller so the window can name it', async () => {
    const handlers = {};
    let seen = null;
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      onProxyChallenge: (info) => { seen = info; },
      askCredentials: async () => null
    });
    support.installLoginHandler({ on: (e, h) => { handlers[e] = h; } });
    await new Promise((resolve) => {
      handlers.login({ preventDefault() {} }, null, {}, { isProxy: true, host: 'proxy.corp', port: 3128 }, () => resolve());
    });
    assert.deepStrictEqual(seen, { isProxy: true, host: 'proxy.corp', port: 3128 });
  });

  it('leaves server (non-proxy) authentication alone', async () => {
    const handlers = {};
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      askCredentials: async () => ({ username: 'alice', password: 's3cret' })
    });
    support.installLoginHandler({ on: (e, h) => { handlers[e] = h; } });
    let prevented = false;
    handlers.login({ preventDefault() { prevented = true; } }, null, {}, { isProxy: false }, () => {});
    assert.strictEqual(prevented, false, 'must not hijack a website login');
  });

  it('cancels cleanly when the user closes the window', async () => {
    const handlers = {};
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      askCredentials: async () => null
    });
    support.installLoginHandler({ on: (e, h) => { handlers[e] = h; } });
    const answer = await new Promise((resolve) => {
      handlers.login({ preventDefault() {} }, null, {}, { isProxy: true }, (...args) => resolve(args));
    });
    assert.deepStrictEqual(answer, [], 'callback() with no argument = cancelled');
  });

  it('builds a dispatcher carrying the credentials, and reuses it', async () => {
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      askCredentials: async () => ({ username: 'alice', password: 's3cret' })
    });
    await support.credentialsForProxy();
    const dispatcher = await support.dispatcherFor('https://example.test/x.png');
    assert.ok(dispatcher, 'dispatcher created');
    assert.strictEqual(await support.dispatcherFor('https://example.test/other.png'), dispatcher);
    await support.close();
  });

  it('drops pooled agents when the identity changes', async () => {
    let answer = { username: 'alice', password: 's3cret' };
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      askCredentials: async () => answer
    });
    await support.credentialsForProxy();
    const first = await support.dispatcherFor('https://example.test/x.png');
    answer = { username: 'bob', password: 'other' };
    // A refused password triggers a new prompt, which changes the identity.
    await support.credentialsForProxy(true);
    const second = await support.dispatcherFor('https://example.test/x.png');
    assert.notStrictEqual(first, second, 'a new identity must not reuse the old agent');
    await support.close();
  });

  it('falls back to a plain fetch when no proxy is configured', async () => {
    const support = createProxySupport({ getSession: () => fakeSession('DIRECT'), env: {} });
    let usedDispatcher = 'unset';
    const undici = require('undici');
    const original = undici.fetch;
    undici.fetch = async (_url, init = {}) => {
      usedDispatcher = init.dispatcher || null;
      return { ok: true, status: 200 };
    };
    try {
      await support.fetchWithProxy('https://example.test/x');
    } finally {
      undici.fetch = original;
    }
    assert.strictEqual(usedDispatcher, null);
  });

  it('encodes the Basic token from the credentials', () => {
    assert.strictEqual(
      basicToken({ username: 'alice', password: 's3cret' }),
      `Basic ${Buffer.from('alice:s3cret').toString('base64')}`
    );
    assert.strictEqual(basicToken(null), null);
    assert.strictEqual(basicToken({ username: '' }), null);
  });
});
