const { exec } = require('child_process');

async function isExternalUpdateRunning(pm) {
  return new Promise((resolve) => {
    const pat = `[/ ](am|appman) +(-[uU]|update|upgrade)`;
    exec(`ps aux | grep -v grep | grep -E -q "${pat}"`, (err) => resolve(!err));
  });
}

function registerUpdatesHandlers(ipcMain, deps) {
  const { tErr, detectPackageManager, invalidatePackageManagerCache, passwordWaiters, activeUpdates } = deps;

  ipcMain.handle('updates-start', async (event) => {
    const { pm } = await detectPackageManager();
    if (!pm) return { error: tErr('errNoPm', "No 'am' or 'appman' package manager found") };
    if (await isExternalUpdateRunning(pm)) return { error: 'external-update-running' };
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    let child;
    let output = '';
    const pty = require('node-pty');
    const env = Object.assign({}, process.env, {
      TERM: 'xterm',
      COLS: '80',
      ROWS: '30',
      FORCE_COLOR: '1'
    });
    try {
      child = pty.spawn(pm, ['-u'], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env
      });
    } catch (err) {
      invalidatePackageManagerCache();
      return { error: err?.message || tErr('errUnableStartUpdate', 'Unable to start the update.') };
    }
    activeUpdates.set(id, child);
    const wc = event.sender;
    const send = (payload) => {
      try { wc.send('updates-progress', Object.assign({ id }, payload)); }
      catch (_) { }
    };
    send({ kind: 'start' });
    const killTimer = setTimeout(() => { try { child.kill('SIGTERM'); } catch (_) { } }, 10 * 60 * 1000);
    passwordWaiters.set(id, (password) => {
      if (typeof password === 'string') {
        try { child.write(password + '\n'); } catch (_) { }
      } else {
        try { child.kill('SIGKILL'); } catch (_) { }
      }
    });
    child.onData((txt) => {
      output += txt;
      send({ kind: 'data', chunk: txt });
      if (/\[sudo\]|mot de passe.*:|password.*:/i.test(txt)) {
        try { wc.send('password-prompt', { id }); }
        catch (_) { }
      }
    });
    const cleanup = () => {
      clearTimeout(killTimer);
      activeUpdates.delete(id);
      passwordWaiters.delete(id);
    };
    child.onExit((evt) => {
      cleanup();
      send({ kind: 'done', code: evt?.exitCode ?? evt?.code ?? null, signal: evt?.signal ?? null, success: (evt?.exitCode ?? evt?.code ?? 0) === 0, output });
    });
    child.on?.('error', (err) => {
      const message = err?.message || '';
      const code = err?.code || '';
      if (code === 'EIO' || /EIO/.test(message)) {
        return;
      }
      cleanup();
      invalidatePackageManagerCache();
      send({ kind: 'error', message: message || tErr('errUnknown', 'Unknown error'), output });
    });
    return { id };
  });

  ipcMain.handle('updates-cancel', async (_event, id) => {
    if (!id) return { ok: false, error: tErr('errMissingIdShort', 'missing-id') };
    const proc = activeUpdates.get(id);
    if (!proc) return { ok: false, error: tErr('errNotFound', 'not-found') };
    try { proc.kill('SIGTERM'); }
    catch (_) { }
    activeUpdates.delete(id);
    passwordWaiters.delete(id);
    return { ok: true };
  });
}

module.exports = { isExternalUpdateRunning, registerUpdatesHandlers };
