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

  // 159 of the 9090 apps have no icon upstream, and each 404 was tried three
  // times: the log showed 479 requests spent on icons that can never load.
  it('does not retry a 404, because the icon does not exist', async () => {
    const request = makeManager(async () => {
      attempts += 1;
      return { status: 404, headers: { get: () => null } };
    });
    await request();
    assert.strictEqual(attempts, 1, `404 must be tried once, got ${attempts} attempts`);
  });

  it('still retries a 408 and a 429, which are temporary', async () => {
    for (const status of [408, 429]) {
      attempts = 0;
      const request = makeManager(async () => {
        attempts += 1;
        return { status, headers: { get: () => null } };
      });
      await request();
      assert.strictEqual(attempts, 3, `${status} is temporary and must be retried`);
    }
  });

  // A cached icon older than the TTL used to be revalidated before answering,
  // so it cost the same as a missing one: measured 271-402 ms on disk versus
  // 0-1 ms. The file must be served at once and refreshed behind it.
  it('serves an expired icon from disk without waiting for the network', async () => {
    const dir = path.join(tempDir, 'icons-cache');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'sample.png');
    fs.writeFileSync(file, Buffer.alloc(600, 3));
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    fs.utimesSync(file, old, old);

    let fetchCalls = 0;
    // A slow network: if the handler waited for this, the assertion below fails.
    const request = makeManager(async () => {
      fetchCalls += 1;
      await new Promise((r) => setTimeout(r, 400));
      return { status: 304, headers: { get: () => null } };
    });

    const started = Date.now();
    const answered = await request();
    const elapsed = Date.now() - started;

    assert.strictEqual(answered, file, 'the file on disk must be served');
    assert.ok(elapsed < 200, `served in ${elapsed} ms, the network must not be waited on`);
    assert.strictEqual(fetchCalls, 1, 'a refresh must have been started in the background');

    // A 304 refreshes the mtime, so the icon is not considered expired again.
    await new Promise((r) => setTimeout(r, 600));
    assert.ok(fs.statSync(file).mtimeMs > old.getTime(), 'the 304 must refresh the mtime');
  });

  it('does not touch the network for a fresh icon', async () => {
    const dir = path.join(tempDir, 'icons-cache');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'sample.png');
    fs.writeFileSync(file, Buffer.alloc(600, 3));

    let fetchCalls = 0;
    const request = makeManager(async () => {
      fetchCalls += 1;
      return { status: 200, headers: { get: () => null }, async arrayBuffer() { return Buffer.alloc(600).buffer; } };
    });

    const answered = await request();
    assert.strictEqual(answered, file);
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(fetchCalls, 0, 'a fresh icon needs no request at all');
  });
});
