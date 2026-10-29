// Remembers a proxy password across restarts, if the user asks for it.
//
// The password is encrypted by the OS keyring through Electron's safeStorage
// (libsecret on GNOME, KWallet on KDE). Nothing is written in clear: when no
// keyring is available, saving is refused rather than downgraded to plain text,
// and the user is simply asked again next time.
const fs = require('fs');

function createProxyCredentialStore(options = {}) {
  const safeStorage = options.safeStorage || null;
  const filePath = options.filePath || null;
  const logger = options.logger || console;
  const fsImpl = options.fs || fs;

  // Only offered when the system can really encrypt: a file that merely looks
  // obfuscated would give the user a false sense of safety.
  function canStore() {
    try {
      return !!(safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable());
    } catch (_) {
      return false;
    }
  }

  function load() {
    if (!filePath || !canStore()) return null;
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
    try {
      const password = safeStorage.decryptString(Buffer.from(data.secret, 'base64'));
      return { username: data.username, password };
    } catch (error) {
      // The keyring changed, or the file came from another machine/user.
      logger.warn?.('[proxy] stored credentials cannot be read:', error?.message || error);
      return null;
    }
  }

  function save(credentials) {
    if (!credentials || !credentials.username || !filePath) return false;
    if (!canStore()) return false;
    try {
      const secret = safeStorage.encryptString(credentials.password || '').toString('base64');
      const body = JSON.stringify({ username: credentials.username, secret }, null, 2);
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

module.exports = { createProxyCredentialStore };
