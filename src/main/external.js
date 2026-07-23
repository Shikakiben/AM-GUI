const { shell } = require('electron');

function registerExternalHandlers(ipcMain, deps) {
  const { tErr } = deps;

  ipcMain.handle('open-external', async (_event, url) => {
    try {
      if (!url || typeof url !== 'string') return { ok: false, error: tErr('errInvalidUrl', 'invalid url') };
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: tErr('errSchemeNotAllowed', 'scheme not allowed') };
      await shell.openExternal(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
}

module.exports = { registerExternalHandlers };
