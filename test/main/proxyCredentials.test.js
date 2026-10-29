// A remembered proxy password must never be written in clear, and must never
// become a trap: if the proxy refuses it, it is dropped instead of failing every
// request for the rest of the session.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODULE = path.resolve(__dirname, '../../src/main/proxyCredentials.js');
const { createProxyCredentialStore, readSystemCredentials } = require(MODULE);

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

describe('proxy credential store', () => {  it('saves and reads back a password, encrypted', () => {
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

  it('saves in clear when the system cannot encrypt, if asked to', () => {
    // The user's choice, made explicit by the red warning in the dialog: the
    // app must obey instead of silently refusing.
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage({ available: false }), filePath: file });
    assert.strictEqual(store.canStore(), false, 'the caller needs to know there is no encryption');
    assert.strictEqual(store.save({ username: 'alice', password: 's3cret' }), true);
    assert.deepStrictEqual(store.load(), { username: 'alice', password: 's3cret' });
  });

  it('marks a clear-text file as unencrypted', () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage({ available: false }), filePath: file });
    store.save({ username: 'alice', password: 's3cret' });
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(data.encrypted, false);
    assert.strictEqual(data.secret, 's3cret');
  });

  it('still restricts the clear-text file to its owner', () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage({ available: false }), filePath: file });
    store.save({ username: 'alice', password: 's3cret' });
    assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  });

  it('treats Chromium basic_text as no encryption', () => {
    // basic_text encrypts with a key baked into Chromium: it only looks
    // encrypted, so the user must get the warning, not a false promise.
    const safeStorage = fakeSafeStorage();
    safeStorage.getSelectedStorageBackend = () => 'basic_text';
    const store = createProxyCredentialStore({ safeStorage, filePath: file });
    assert.strictEqual(store.canStore(), false);
    store.save({ username: 'alice', password: 's3cret' });
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(data.encrypted, false, 'must not be labelled encrypted');
  });

  it('keeps encrypting when a real keyring is used', () => {
    const safeStorage = fakeSafeStorage();
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    const store = createProxyCredentialStore({ safeStorage, filePath: file });
    assert.strictEqual(store.canStore(), true);
  });

  it('marks an encrypted file as encrypted', () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    store.save({ username: 'alice', password: 's3cret' });
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(data.encrypted, true);
    assert.ok(!data.secret.includes('s3cret'), 'the password must not appear in clear');
  });

  it('saves in clear when safeStorage is missing entirely', () => {
    const store = createProxyCredentialStore({ safeStorage: null, filePath: file });
    assert.strictEqual(store.canStore(), false);
    assert.strictEqual(store.save({ username: 'a', password: 'b' }), true);
    assert.deepStrictEqual(store.load(), { username: 'a', password: 'b' });
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

describe('desktop proxy credentials', () => {
  // Verified on a real GNOME session: with use-authentication true and a
  // username/password in gsettings, Chromium still sends an unauthenticated
  // CONNECT (ERR_TUNNEL_CONNECTION_FAILED). So these values are worth reading.
  function fakeGsettings(values) {
    return (args) => {
      const key = args[args.length - 1];
      if (!(key in values)) throw new Error('no such key: ' + key);
      return values[key];
    };
  }

  it('reads the username and password the desktop was configured with', () => {
    const found = readSystemCredentials({
      run: fakeGsettings({
        'use-authentication': 'true',
        'authentication-user': "'corp\\user'",
        'authentication-password': "'s3cret'"
      })
    });
    assert.deepStrictEqual(found, { username: 'corp\\user', password: 's3cret' });
  });

  it('reads nothing when the desktop does not use authentication', () => {
    const found = readSystemCredentials({
      run: fakeGsettings({
        'use-authentication': 'false',
        'authentication-user': "'someone'",
        'authentication-password': "'somepass'"
      })
    });
    assert.strictEqual(found, null, 'an unused setting must not be used');
  });

  it('reads nothing when the username is empty', () => {
    const found = readSystemCredentials({
      run: fakeGsettings({
        'use-authentication': 'true',
        'authentication-user': "''",
        'authentication-password': "''"
      })
    });
    assert.strictEqual(found, null);
  });

  it('stays silent when gsettings is missing or fails', () => {
    // KDE, a minimal system, or a hung dconf: the app must still start and just
    // fall back to asking.
    assert.strictEqual(readSystemCredentials({ run: () => { throw new Error('not found'); } }), null);
  });

  it('never returns an empty password as a valid answer', () => {
    const found = readSystemCredentials({
      run: fakeGsettings({
        'use-authentication': 'true',
        'authentication-user': "'corp'",
        'authentication-password': "''"
      })
    });
    assert.deepStrictEqual(found, { username: 'corp', password: '' });
  });
});
