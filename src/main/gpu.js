const path = require('path');
const fs = require('fs');

function registerGpuHandlers(ipcMain, app) {
  ipcMain.handle('get-gpu-pref', async () => {
    try {
      const prefPath = path.join(app.getPath('userData'), 'gpu-pref.json');
      if (fs.existsSync(prefPath)) {
        const raw = fs.readFileSync(prefPath, 'utf8');
        return JSON.parse(raw).disableGpu === true;
      }
    } catch (_) { }
    return false;
  });

  ipcMain.handle('set-gpu-pref', async (_event, val) => {
    try {
      const prefPath = path.join(app.getPath('userData'), 'gpu-pref.json');
      fs.writeFileSync(prefPath, JSON.stringify({ disableGpu: !!val }));
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message || String(e) }; }
  });

  ipcMain.handle('restart-app', async () => {
    app.relaunch();
    app.quit();
  });
}

module.exports = { registerGpuHandlers };
