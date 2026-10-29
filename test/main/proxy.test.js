// Proxy support: AM-GUI lets Chromium do the networking (net.fetch follows the
// machine's proxy), and only supplies the password, the way a browser does.
// Two measured behaviours are pinned here:
//   - net.fetch never emits `login`, net.request does: that is how the prompt
//     is reached at all;
//   - one answered prompt must serve every later request.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const {
  parseProxyUrl,
  parseResolvedProxy,
  readEnvProxy,
  proxyRulesFromEnv,
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

  // Stands in for net.request: emits `login` when the proxy asks, then a
  // response once the caller answered. Records every request it was given.
  function fakeRequestFactory(state) {
    return (url) => {
      state.requests.push(url);
      const handlers = { login: [], response: [], error: [] };
      const req = {
        on(event, handler) {
          (handlers[event] = handlers[event] || []).push(handler);
          return req;
        },
        end() {
          setImmediate(async () => {
            if (state.needsAuth) {
              const authInfo = { isProxy: true, host: 'proxy.corp', port: 3128, scheme: 'basic' };
              const answer = await new Promise((resolve) => {
                handlers.login.forEach((h) => h(authInfo, (u, p) => resolve(u ? { username: u, password: p } : null)));
              });
              state.answers.push(answer);
              if (!answer) {
                handlers.error.forEach((h) => h(new Error('net::ERR_TUNNEL_CONNECTION_FAILED')));
                return;
              }
            }
            const res = {
              on(event, handler) {
                if (event === 'end') setImmediate(handler);
                return res;
              }
            };
            handlers.response.forEach((h) => h(res));
          });
        }
      };
      return req;
    };
  }

  function makeState(overrides = {}) {
    return { requests: [], answers: [], needsAuth: true, ...overrides };
  }

  function makeSupport(state, options = {}) {
    return createProxySupport({
      getSession: () => fakeSession(options.resolved || 'PROXY proxy.corp:3128'),
      request: fakeRequestFactory(state),
      askCredentials: options.askCredentials || (async () => ({ username: 'alice', password: 's3cret' })),
      env: options.env || {},
      now: options.now,
      promptTimeoutMs: options.promptTimeoutMs
    });
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

  it('reuses credentials given in the environment instead of asking', async () => {
    const state = makeState();
    let asked = 0;
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY envproxy:8443'),
      request: fakeRequestFactory(state),
      env: { https_proxy: 'http://u:p@envproxy:8443' },
      askCredentials: async () => { asked += 1; return { username: 'alice', password: 's3cret' }; }
    });
    assert.strictEqual(await support.ensureProxyAuth('https://example.test/1.png'), true);
    assert.strictEqual(asked, 0, 'a password already in the proxy URL must not be asked for');
    assert.deepStrictEqual(state.answers[0], { username: 'u', password: 'p' });
  });

  it('uses the desktop credentials before asking the user', async () => {
    // Chromium ignores what GNOME stores (verified), so the app must read it.
    const state = makeState();
    let asked = 0;
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      request: fakeRequestFactory(state),
      getSystemCredentials: () => ({ username: 'desktop', password: 'fromkeyring' }),
      askCredentials: async () => { asked += 1; return { username: 'alice', password: 's3cret' }; },
      env: {}
    });
    assert.strictEqual(await support.ensureProxyAuth('https://example.test/1.png'), true);
    assert.strictEqual(asked, 0, 'the desktop already knows the password');
    assert.deepStrictEqual(state.answers[0], { username: 'desktop', password: 'fromkeyring' });
  });

  it('prefers what the user asked to remember over the desktop setting', async () => {
    const state = makeState();
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      request: fakeRequestFactory(state),
      getInitialCredentials: () => ({ username: 'mine', password: 'chosen' }),
      getSystemCredentials: () => ({ username: 'desktop', password: 'other' }),
      askCredentials: async () => null,
      env: {}
    });
    await support.ensureProxyAuth('https://example.test/1.png');
    assert.deepStrictEqual(state.answers[0], { username: 'mine', password: 'chosen' });
  });

  it('opens no window when nothing challenges the request', async () => {
    // Going direct means no 407 and therefore no login event: the seed request
    // must not turn into a password prompt.
    const state = makeState({ needsAuth: false });
    let asked = 0;
    const support = makeSupport(state, {
      resolved: 'DIRECT',
      askCredentials: async () => { asked += 1; return { username: 'alice', password: 's3cret' }; }
    });
    assert.strictEqual(await support.ensureProxyAuth('https://example.test/x.png'), true);
    assert.strictEqual(asked, 0, 'no challenge, no prompt');
  });

  it('makes the one request that can raise the prompt, then caches the answer', async () => {
    const state = makeState();
    const support = makeSupport(state);
    assert.strictEqual(await support.ensureProxyAuth('https://example.test/x.png'), true);
    assert.strictEqual(state.requests.length, 1, 'net.request is the only way to get a login event');
    assert.deepStrictEqual(state.answers[0], { username: 'alice', password: 's3cret' });
    assert.deepStrictEqual(support._credentials(), { username: 'alice', password: 's3cret' });

    // Every later download reuses it: no second window, no second request.
    assert.strictEqual(await support.ensureProxyAuth('https://example.test/y.png'), true);
    assert.strictEqual(state.requests.length, 1, 'the prompt is asked once per session');
  });

  it('opens a single window when many downloads fail together', async () => {
    let asked = 0;
    const state = makeState();
    const support = makeSupport(state, {
      askCredentials: async () => {
        asked += 1;
        await new Promise((r) => setTimeout(r, 20));
        return { username: 'alice', password: 's3cret' };
      }
    });
    const results = await Promise.all([
      support.ensureProxyAuth('https://example.test/1.png'),
      support.ensureProxyAuth('https://example.test/2.png'),
      support.ensureProxyAuth('https://example.test/3.png')
    ]);
    assert.strictEqual(asked, 1, 'concurrent failures share one prompt');
    assert.ok(results.every((r) => r === true));
  });

  it('does not reopen the window for every icon when the user cancels', async () => {
    let asked = 0;
    let clock = 1000;
    const state = makeState();
    const support = makeSupport(state, {
      now: () => clock,
      askCredentials: async () => { asked += 1; return null; }
    });
    assert.strictEqual(await support.ensureProxyAuth('https://example.test/1.png'), false);
    assert.strictEqual(await support.ensureProxyAuth('https://example.test/2.png'), false);
    assert.strictEqual(asked, 1, 'a cancelled prompt is remembered for a while');
    clock += 31000;
    await support.ensureProxyAuth('https://example.test/3.png');
    assert.strictEqual(asked, 2, 'the user gets another chance later');
  });

  it('never hangs when the window is never answered', async () => {
    const state = makeState();
    const support = makeSupport(state, {
      askCredentials: () => new Promise(() => {}), // the user walks away
      promptTimeoutMs: 30
    });
    assert.strictEqual(await support.ensureProxyAuth('https://example.test/1.png'), false);
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

  it('shares one answer between the main process and the renderer', async () => {
    const handlers = {};
    let asked = 0;
    const state = makeState();
    const support = makeSupport(state, {
      askCredentials: async () => { asked += 1; return { username: 'alice', password: 's3cret' }; }
    });
    support.installLoginHandler({ on: (e, h) => { handlers[e] = h; } });

    await support.ensureProxyAuth('https://example.test/1.png');
    const answer = await new Promise((resolve) => {
      handlers.login({ preventDefault() {} }, null, {}, { isProxy: true, host: 'proxy.corp', port: 3128 }, (u, p) => resolve({ u, p }));
    });
    assert.deepStrictEqual(answer, { u: 'alice', p: 's3cret' });
    assert.strictEqual(asked, 1, 'the renderer reuses the main process answer');
  });

  it('leaves website logins alone', () => {
    const handlers = {};
    const support = createProxySupport({ getSession: () => fakeSession('DIRECT') });
    support.installLoginHandler({ on: (e, h) => { handlers[e] = h; } });
    let prevented = false;
    handlers.login({ preventDefault() { prevented = true; } }, null, {}, { isProxy: false }, () => {});
    assert.strictEqual(prevented, false, 'must not hijack a website login');
  });

  it('keeps the password in memory only', async () => {
    const state = makeState();
    const support = makeSupport(state);
    await support.ensureProxyAuth('https://example.test/1.png');
    assert.deepStrictEqual(support._credentials(), { username: 'alice', password: 's3cret' });
  });

  it('uses a remembered password without asking', async () => {
    const state = makeState();
    let asked = 0;
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      request: fakeRequestFactory(state),
      getInitialCredentials: () => ({ username: 'stored', password: 'old' }),
      askCredentials: async () => { asked += 1; return { username: 'alice', password: 's3cret' }; },
      env: {}
    });
    assert.strictEqual(await support.ensureProxyAuth('https://example.test/1.png'), true);
    assert.strictEqual(asked, 0, 'a remembered password must not be asked for again');
    assert.deepStrictEqual(state.answers[0], { username: 'stored', password: 'old' });
  });

  it('forgets a remembered password the proxy refuses, then asks once', async () => {
    // Otherwise a password changed at the proxy would break every download for
    // good, with no way for the user to enter the new one.
    let refused = 0;
    let asked = 0;
    const state = makeState();
    let attempt = 0;
    const support = createProxySupport({
      getSession: () => fakeSession('PROXY proxy.corp:3128'),
      request: (url) => {
        // The stored password is rejected; the freshly typed one works.
        state.requests.push(url);
        attempt += 1;
        const handlers = { login: [], response: [], error: [] };
        const req = {
          on(event, handler) { (handlers[event] = handlers[event] || []).push(handler); return req; },
          end() {
            setImmediate(async () => {
              const answer = await new Promise((resolve) => {
                handlers.login.forEach((h) => h({ isProxy: true }, (u, p) => resolve(u ? { username: u, password: p } : null)));
              });
              state.answers.push(answer);
              if (attempt === 1) {
                handlers.error.forEach((h) => h(new Error('net::ERR_TUNNEL_CONNECTION_FAILED')));
                return;
              }
              const res = { on(event, handler) { if (event === 'end') setImmediate(handler); return res; } };
              handlers.response.forEach((h) => h(res));
            });
          }
        };
        return req;
      },
      getInitialCredentials: () => ({ username: 'stored', password: 'old' }),
      onCredentialsRefused: () => { refused += 1; },
      askCredentials: async () => { asked += 1; return { username: 'alice', password: 's3cret' }; },
      env: {}
    });
    assert.strictEqual(await support.ensureProxyAuth('https://example.test/1.png'), true);
    assert.strictEqual(refused, 1, 'the stored credentials must be forgotten');
    assert.strictEqual(asked, 1, 'the user is asked once for the new password');
    assert.deepStrictEqual(support._credentials(), { username: 'alice', password: 's3cret' });
  });

  it('does not keep the failed-attempt pause after a successful prompt', async () => {
    const state = makeState();
    const support = makeSupport(state);
    await support.ensureProxyAuth('https://example.test/1.png');
    assert.strictEqual(await support.ensureProxyAuth('https://example.test/2.png'), true);
    assert.strictEqual(state.requests.length, 1);
  });
});
