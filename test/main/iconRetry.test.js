// A proxy that wants a password answers 407 to every request. Retrying the same
// request cannot help, and a measured session produced 97 requests in 40 s just
// for icons. A 407 must therefore fail fast; ordinary errors still retry.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODULE_PATH = path.resolve(__dirname, '../../src/main/iconCache.js');

let tempDir;
let attempts;

function makeManager(fetchImpl) {
  delete require.cache[require.resolve(MODULE_PATH)];
  const { createIconCacheManager } = require(MODULE_PATH);
  const app = {
    getPath(name) {
      if (name === 'userData') return tempDir;
      throw new Error('unexpected path: ' + name);
    }
  };
  const manager = createIconCacheManager(app, { fetch: fetchImpl });
  let handler = null;
  manager.registerProtocol({
    registerFileProtocol(scheme, fn) { handler = fn; }
  });
  // Resolves when the protocol handler answers, i.e. when the download gave up
  // or succeeded.
  return () => new Promise((resolve) => handler({ url: 'appicon://sample.png' }, resolve));
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-gui-icon407-'));
  attempts = 0;
});

afterEach(() => {
  delete require.cache[require.resolve(MODULE_PATH)];
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
});

describe('icon download retries', () => {
  it('does not retry a 407', async () => {
    const request = makeManager(async () => {
      attempts += 1;
      return { status: 407, headers: { get: () => null } };
    });
    await request();
    assert.strictEqual(attempts, 1, `407 must be tried once, got ${attempts} attempts`);
  });

  it('still retries a temporary failure', async () => {
    const request = makeManager(async () => {
      attempts += 1;
      if (attempts < 2) throw new Error('network hiccup');
      return {
        status: 200,
        headers: { get: () => null },
        async arrayBuffer() { return Buffer.alloc(600, 7).buffer; }
      };
    });
    await request();
    assert.strictEqual(attempts, 2, 'a transient error is worth retrying');
  });

  it('gives up after three attempts on a permanent error', async () => {
    const request = makeManager(async () => {
      attempts += 1;
      return { status: 500, headers: { get: () => null } };
    });
    await request();
    assert.strictEqual(attempts, 3, 'bounded retries, then stop');
  });
});
