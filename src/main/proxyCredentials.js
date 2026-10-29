// Remembers a proxy password across restarts, if the user asks for it.
//
// The password is encrypted by the OS keyring through Electron's safeStorage
// (libsecret on GNOME, KWallet on KDE) whenever that is available. When it is
// not, the dialog still offers to remember it, but says so plainly and in red:
// the password is then written in clear, in a 0600 file. That is the user's
// decision to make, informed; the app must not decide silently for them.
//
// The asynchronous API is used throughout (the synchronous one is deprecated and
// goes away in Electron 46). One trap, measured on Electron 43: with
// `--password-store=basic`, isEncryptionAvailable() correctly says false, but
// isAsyncEncryptionAvailable() says **true** and encryptStringAsync succeeds —
// producing the `v10` format, encrypted with a key hardcoded in Chromium. Trusting
// it would label an unprotected file as "encrypted". The backend is therefore
// checked explicitly, and that check is what keeps the warning honest.
const fs = require('fs');
const { execFileSync } = require('child_process');

// Reads the proxy credentials the desktop itself was configured with (GNOME's
// proxy panel stores them in gsettings).
//
// Verified: Chromium does NOT use them. With use-authentication true and a
// username/password in gsettings, net.fetch still fails with
// ERR_TUNNEL_CONNECTION_FAILED and the proxy receives a CONNECT without any
// Authorization header. So when the desktop knows the credentials, the app has
// to read them itself — otherwise the user is asked for something the system
// already has.
function readSystemCredentials(options = {}) {
  const run = options.run || ((args) => execFileSync('gsettings', args, { encoding: 'utf8', timeout: 2000 }));
  const schema = 'org.gnome.system.proxy.http';
  const unquote = (raw) => {
    const value = String(raw == null ? '' : raw).trim();
    if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
    return value;
  };
  try {
    if (unquote(run(['get', schema, 'use-authentication'])) !== 'true') return null;
    const username = unquote(run(['get', schema, 'authentication-user']));
    const password = unquote(run(['get', schema, 'authentication-password']));
    if (!username) return null;
    return { username, password };
  } catch (_) {
    return null; // not GNOME, no gsettings, or a timeout: just ask the user
  }
}

function createProxyCredentialStore(options = {}) {
  const safeStorage = options.safeStorage || null;
  const filePath = options.filePath || null;
  const logger = options.logger || console;
  const fsImpl = options.fs || fs;

  // True when the system can really encrypt. Used to choose the warning shown
  // next to the "remember" box, not to forbid saving.
  async function canStore() {
    try {
      if (!safeStorage || typeof safeStorage.isAsyncEncryptionAvailable !== 'function') return false;
      if (!(await safeStorage.isAsyncEncryptionAvailable())) return false;
      // Measured on Electron 43: with no keyring, the async API still reports
      // "available" and encrypts in the `v10` format, whose key is hardcoded in
      // Chromium. That is not encryption, so it must never be presented as such.
      if (typeof safeStorage.getSelectedStorageBackend === 'function') {
        try {
          if (safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
        } catch (_) {}
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function load() {
    if (!filePath) return null;
    let raw;
    try {
      raw = fsImpl.readFileSync(filePath, 'utf8');
    } catch (_) {
      return null; // no file is the normal case
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return null;
    }
    if (!data || typeof data.username !== 'string' || typeof data.secret !== 'string') return null;
    // Written without a keyring, at the user's explicit request: read it back
    // as-is. Guessing from the content would break on any password that happens
    // to look like base64.
    if (data.encrypted === false) {
      return { username: data.username, password: data.secret };
    }
    if (!(await canStore())) return null;
    try {
      const decrypted = await safeStorage.decryptStringAsync(Buffer.from(data.secret, 'base64'));
      const credentials = { username: data.username, password: decrypted.result };
      // The key was rotated, or a better one is now available: rewrite the file
      // with the current key so it does not keep an outdated one.
      if (decrypted.shouldReEncrypt) {
        await save(credentials);
      }
      return credentials;
    } catch (error) {
      // The keyring changed, or the file came from another machine/user.
      logger.warn?.('[proxy] stored credentials cannot be read:', error?.message || error);
      return null;
    }
  }

  // Saves the credentials. Encrypted when the system can do it; otherwise in
  // clear, at the user's explicit request (the dialog warns about it). The file
  // is always 0600 and records which of the two was used, so reading back never
  // depends on guessing.
  async function save(credentials) {
    if (!credentials || !credentials.username || !filePath) return false;
    const encrypt = await canStore();
    try {
      let body;
      if (encrypt) {
        const secret = (await safeStorage.encryptStringAsync(credentials.password || '')).toString('base64');
        body = JSON.stringify({ username: credentials.username, encrypted: true, secret }, null, 2);
      } else {
        body = JSON.stringify({ username: credentials.username, encrypted: false, secret: credentials.password || '' }, null, 2);
      }
      const tmp = `${filePath}.tmp`;
      fsImpl.writeFileSync(tmp, body, { mode: 0o600 });
      fsImpl.renameSync(tmp, filePath);
      try { fsImpl.chmodSync(filePath, 0o600); } catch (_) {}
      return true;
    } catch (error) {
      logger.warn?.('[proxy] could not save credentials:', error?.message || error);
      try { fsImpl.unlinkSync(`${filePath}.tmp`); } catch (_) {}
      return false;
    }
  }

  function clear() {
    if (!filePath) return;
    try { fsImpl.unlinkSync(filePath); } catch (_) {}
  }

  return { canStore, load, save, clear };
}

module.exports = { createProxyCredentialStore, readSystemCredentials };
