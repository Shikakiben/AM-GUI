// A remembered proxy password must never be written in clear, and must never
// become a trap: if the proxy refuses it, it is dropped instead of failing every
// request for the rest of the session.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODULE = path.resolve(__dirname, '../../src/main/proxyCredentials.js');
const { createProxyCredentialStore } = require(MODULE);

// Stands in for Electron's safeStorage: reversible, and never stores the clear
// text, exactly like the real keyring backend.
function fakeSafeStorage({ available = true } = {}) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (text) => Buffer.from('v11:' + Buffer.from(text, 'utf8').toString('base64')),
    decryptString: (buf) => {
      const raw = Buffer.from(buf).toString('utf8');
      if (!raw.startsWith('v11:')) throw new Error('cannot decrypt');
      return Buffer.from(raw.slice(4), 'base64').toString('utf8');
    }
  };
}

let dir;
let file;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-gui-proxycred-'));
  file = path.join(dir, 'proxy-auth.json');
});

afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
});

describe('proxy credential store', () => {
  it('saves and reads back a password, encrypted', () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    assert.strictEqual(store.save({ username: 'alice', password: 's3cret' }), true);
    assert.deepStrictEqual(store.load(), { username: 'alice', password: 's3cret' });
  });

  it('never writes the password in clear', () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    store.save({ username: 'alice', password: 's3cret' });
    const raw = fs.readFileSync(file, 'utf8');
    assert.ok(!raw.includes('s3cret'), 'the password must not appear in the file');
    assert.ok(raw.includes('alice'), 'the username may be stored in clear');
  });

  it('restricts the file to its owner', () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    store.save({ username: 'alice', password: 's3cret' });
    const mode = fs.statSync(file).mode & 0o777;
    assert.strictEqual(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
  });

  it('refuses to save when the system cannot encrypt', () => {
    // No keyring: better to ask again next time than to store a password in
    // a file that only looks protected.
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage({ available: false }), filePath: file });
    assert.strictEqual(store.canStore(), false);
    assert.strictEqual(store.save({ username: 'alice', password: 's3cret' }), false);
    assert.strictEqual(fs.existsSync(file), false);
  });

  it('refuses to save without safeStorage at all', () => {
    const store = createProxyCredentialStore({ safeStorage: null, filePath: file });
    assert.strictEqual(store.canStore(), false);
    assert.strictEqual(store.save({ username: 'a', password: 'b' }), false);
  });

  it('returns null when nothing was saved', () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    assert.strictEqual(store.load(), null);
  });

  it('returns null on a corrupt or unreadable file instead of throwing', () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    fs.writeFileSync(file, 'not json at all');
    assert.strictEqual(store.load(), null);

    fs.writeFileSync(file, JSON.stringify({ username: 'alice', secret: 'garbage' }));
    assert.strictEqual(store.load(), null, 'a secret from another keyring must not crash the app');
  });

  it('forgets the credentials when asked', () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    store.save({ username: 'alice', password: 's3cret' });
    store.clear();
    assert.strictEqual(fs.existsSync(file), false);
    assert.strictEqual(store.load(), null);
  });

  it('does not throw when clearing what does not exist', () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    assert.doesNotThrow(() => store.clear());
  });
});
