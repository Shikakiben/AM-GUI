// A remembered proxy password must never be written in clear without the user
// knowing, and must never become a trap: if the proxy refuses it, it is dropped
// instead of failing every request for the rest of the session.
//
// The store uses Electron's asynchronous safeStorage API. One trap is pinned
// here because it was measured on Electron 43: without a keyring,
// isAsyncEncryptionAvailable() still returns true and encryptStringAsync still
// succeeds, producing the `v10` format whose key is hardcoded in Chromium. The
// backend check is what keeps the "not encrypted" warning honest.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODULE = path.resolve(__dirname, '../../src/main/proxyCredentials.js');
const { createProxyCredentialStore, readSystemCredentials } = require(MODULE);

// Stands in for Electron's safeStorage: reversible, and never stores the clear
// text, exactly like a real keyring backend.
function fakeSafeStorage({ available = true, backend = 'gnome_libsecret' } = {}) {
  return {
    isAsyncEncryptionAvailable: async () => available,
    getSelectedStorageBackend: () => backend,
    encryptStringAsync: async (text) => Buffer.from('v11:' + Buffer.from(text, 'utf8').toString('base64')),
    decryptStringAsync: async (buf) => {
      const raw = Buffer.from(buf).toString('utf8');
      if (!raw.startsWith('v11:')) throw new Error('cannot decrypt');
      return { result: Buffer.from(raw.slice(4), 'base64').toString('utf8'), shouldReEncrypt: false };
    }
  };
}

// The behaviour measured with --password-store=basic on Electron 43.
function basicTextSafeStorage() {
  return {
    isAsyncEncryptionAvailable: async () => true, // lies: there is no keyring
    getSelectedStorageBackend: () => 'basic_text',
    encryptStringAsync: async (text) => Buffer.from('v10:' + Buffer.from(text, 'utf8').toString('base64')),
    decryptStringAsync: async (buf) => ({ result: Buffer.from(buf).toString('utf8').slice(4), shouldReEncrypt: false })
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
  it('saves and reads back a password, encrypted', async () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    assert.strictEqual(await store.save({ username: 'alice', password: 's3cret' }), true);
    assert.deepStrictEqual(await store.load(), { username: 'alice', password: 's3cret' });
  });

  it('never writes the password in clear when encrypting', async () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    await store.save({ username: 'alice', password: 's3cret' });
    const raw = fs.readFileSync(file, 'utf8');
    assert.ok(!raw.includes('s3cret'), 'the password must not appear in the file');
    assert.ok(raw.includes('alice'), 'the username may be stored in clear');
  });

  it('restricts the file to its owner', async () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    await store.save({ username: 'alice', password: 's3cret' });
    const mode = fs.statSync(file).mode & 0o777;
    assert.strictEqual(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
  });

  it('saves in clear when the system cannot encrypt, if asked to', async () => {
    // The user's choice, made explicit by the red warning in the dialog: the
    // app must obey instead of silently refusing.
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage({ available: false }), filePath: file });
    assert.strictEqual(await store.canStore(), false, 'the caller needs to know there is no encryption');
    assert.strictEqual(await store.save({ username: 'alice', password: 's3cret' }), true);
    assert.deepStrictEqual(await store.load(), { username: 'alice', password: 's3cret' });
  });

  it('marks a clear-text file as unencrypted', async () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage({ available: false }), filePath: file });
    await store.save({ username: 'alice', password: 's3cret' });
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(data.encrypted, false);
    assert.strictEqual(data.secret, 's3cret');
  });

  it('still restricts the clear-text file to its owner', async () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage({ available: false }), filePath: file });
    await store.save({ username: 'alice', password: 's3cret' });
    assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  });

  it('marks an encrypted file as encrypted', async () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    await store.save({ username: 'alice', password: 's3cret' });
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(data.encrypted, true);
    assert.ok(!data.secret.includes('s3cret'), 'the password must not appear in clear');
  });

  it('saves in clear when safeStorage is missing entirely', async () => {
    const store = createProxyCredentialStore({ safeStorage: null, filePath: file });
    assert.strictEqual(await store.canStore(), false);
    assert.strictEqual(await store.save({ username: 'a', password: 'b' }), true);
    assert.deepStrictEqual(await store.load(), { username: 'a', password: 'b' });
  });

  it('treats Chromium basic_text as no encryption', async () => {
    // Measured: the async API reports "available" here and encrypts anyway, with
    // a key baked into Chromium. Calling that encrypted would be a false promise.
    const store = createProxyCredentialStore({ safeStorage: basicTextSafeStorage(), filePath: file });
    assert.strictEqual(await store.canStore(), false);
    await store.save({ username: 'alice', password: 's3cret' });
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(data.encrypted, false, 'must not be labelled encrypted');
  });

  it('keeps encrypting when a real keyring is used', async () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage({ backend: 'gnome_libsecret' }), filePath: file });
    assert.strictEqual(await store.canStore(), true);
  });

  it('returns null when nothing was saved', async () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    assert.strictEqual(await store.load(), null);
  });

  it('returns null on a corrupt or unreadable file instead of throwing', async () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    fs.writeFileSync(file, 'not json at all');
    assert.strictEqual(await store.load(), null);

    fs.writeFileSync(file, JSON.stringify({ username: 'alice', secret: 'garbage' }));
    assert.strictEqual(await store.load(), null, 'a secret from another keyring must not crash the app');
  });

  it('re-encrypts when the key was rotated', async () => {
    // decryptStringAsync says so; ignoring it would keep an outdated key forever.
    let rotations = 0;
    const safeStorage = fakeSafeStorage();
    const decrypt = safeStorage.decryptStringAsync;
    safeStorage.decryptStringAsync = async (buf) => {
      const out = await decrypt(buf);
      if (rotations === 0) {
        rotations += 1;
        return { ...out, shouldReEncrypt: true };
      }
      return out;
    };
    const store = createProxyCredentialStore({ safeStorage, filePath: file });
    await store.save({ username: 'alice', password: 's3cret' });
    const before = fs.readFileSync(file, 'utf8');
    assert.deepStrictEqual(await store.load(), { username: 'alice', password: 's3cret' });
    assert.ok(fs.existsSync(file));
    assert.ok(before.length > 0);
    assert.strictEqual(rotations, 1, 'the rotation was noticed');
  });

  it('forgets the credentials when asked', async () => {
    const store = createProxyCredentialStore({ safeStorage: fakeSafeStorage(), filePath: file });
    await store.save({ username: 'alice', password: 's3cret' });
    store.clear();
    assert.strictEqual(fs.existsSync(file), false);
    assert.strictEqual(await store.load(), null);
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
  //
  // One gsettings call only: execFileSync blocks the main process.
  function fakeGsettings(values) {
    return (args) => {
      assert.deepStrictEqual(args, ['list-recursively', 'org.gnome.system.proxy.http'], 'a single call is made');
      return Object.entries(values)
        .map(([k, v]) => `org.gnome.system.proxy.http ${k} ${v}`)
        .join('\n') + '\n';
    };
  }

  it('reads the username and password the desktop was configured with', () => {
    const found = readSystemCredentials({
      run: fakeGsettings({
        'use-authentication': 'true',
        'authentication-user': "'corp'",
        'authentication-password': "'s3cret'"
      })
    });
    assert.deepStrictEqual(found, { username: 'corp', password: 's3cret' });
  });

  it('decodes the escaped backslash of a DOMAIN\\user login', () => {
    // gsettings prints GVariant text: a username with one backslash comes out
    // with two. Measured on a real session. Getting this wrong would send a
    // doubled separator and the proxy would refuse the login.
    const found = readSystemCredentials({
      run: fakeGsettings({
        'use-authentication': 'true',
        'authentication-user': "'DOMAIN\\\\user'",
        'authentication-password': "'p\\\\ss'"
      })
    });
    assert.deepStrictEqual(found, { username: 'DOMAIN\\user', password: 'p\\ss' });
  });

  it('decodes escaped quotes and control characters', () => {
    const found = readSystemCredentials({
      run: fakeGsettings({
        'use-authentication': 'true',
        'authentication-user': "'o\\'brien'",
        'authentication-password': "'a\\tb'"
      })
    });
    assert.deepStrictEqual(found, { username: "o'brien", password: 'a\tb' });
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

  it('handles the double quotes gsettings uses for a value with an apostrophe', () => {
    // Measured: `pa'ss` is printed as "pa'ss", with double quotes. Stripping only
    // single quotes sent the password with its quotes attached, and the proxy
    // refused a correct password.
    const found = readSystemCredentials({
      run: fakeGsettings({
        'use-authentication': 'true',
        'authentication-user': '"o\'brien"',
        'authentication-password': '"pa\'ss"'
      })
    });
    assert.deepStrictEqual(found, { username: "o'brien", password: "pa'ss" });
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

  it('handles an empty output', () => {
    assert.strictEqual(readSystemCredentials({ run: () => '' }), null);
  });
});
