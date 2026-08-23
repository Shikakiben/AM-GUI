const { exec } = require('child_process');

async function isExternalUpdateRunning(pm) {
  return new Promise((resolve) => {
    const pat = `[/ ](am|appman) +(-[uU]|update|upgrade|reinstall)`;
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

  ipcMain.handle('updates-bulk', async () => {
    const { pm } = await detectPackageManager();
    if (!pm) return { error: tErr('errNoPm', "No 'am' or 'appman' package manager found") };
    if (await isExternalUpdateRunning(pm)) return { error: 'external-update-running' };

    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const child = spawn(pm, ['-u']);
      let stdoutBuf = '';
      let stderrBuf = '';
      const killTimer = setTimeout(() => { try { child.kill('SIGTERM'); } catch (_) {} }, 10 * 60 * 1000);
      child.stdout.on('data', d => { stdoutBuf += d.toString(); });
      child.stderr.on('data', d => { stderrBuf += d.toString(); });
      child.on('close', (code) => {
        clearTimeout(killTimer);
        if (code === 0) return resolve({ ok: true, output: stdoutBuf || '' });
        resolve({ ok: false, error: stderrBuf || stdoutBuf || tErr('errProcessFinishedCode', 'Process finished with code {code}', { code }) });
      });
      child.on('error', (err) => {
        clearTimeout(killTimer);
        invalidatePackageManagerCache();
        resolve({ ok: false, error: err.message || tErr('errUnknown', 'Unknown error') });
      });
    });
  });

  ipcMain.handle('updates-cancel', async (_event, id) => {
    if (!id) return { ok: false, error: tErr('errMissingIdShort', 'missing-id') };
    const proc = activeUpdates.get(id) || activeUpdates.get('reinstall-' + id);
    if (!proc) return { ok: false, error: tErr('errNotFound', 'not-found') };
    try { proc.kill('SIGTERM'); }
    catch (_) { }
    activeUpdates.delete(id);
    activeUpdates.delete('reinstall-' + id);
    passwordWaiters.delete(id);
    passwordWaiters.delete('reinstall-' + id);
    return { ok: true };
  });

  ipcMain.handle('updates-reinstall-bulk', async (event, appNames) => {
    const { pm } = await detectPackageManager();
    if (!pm) return { ok: false, error: tErr('errNoPm', "No 'am' or 'appman' package manager found") };
    if (await isExternalUpdateRunning(pm)) return { ok: false, error: 'external-update-running' };

    const args = ['reinstall'];
    if (Array.isArray(appNames) && appNames.length > 0) {
      args.push(...appNames);
    }
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
      child = pty.spawn(pm, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env
      });
    } catch (err) {
      invalidatePackageManagerCache();
      return { ok: false, error: err?.message || tErr('errUnableStartUpdate', 'Unable to start the reinstall.') };
    }
    activeUpdates.set('reinstall-' + id, child);
    const wc = event.sender;
    const send = (payload) => {
      try { wc.send('reinstall-progress', Object.assign({ id }, payload)); }
      catch (_) { }
    };
    send({ kind: 'start' });
    passwordWaiters.set('reinstall-' + id, (password) => {
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
        try { wc.send('password-prompt', { id: 'reinstall-' + id }); }
        catch (_) { }
      }
    });
    const cleanup = () => {
      activeUpdates.delete('reinstall-' + id);
      passwordWaiters.delete('reinstall-' + id);
    };
    child.onExit((evt) => {
      cleanup();
      send({ kind: 'done', code: evt?.exitCode ?? evt?.code ?? null, signal: evt?.signal ?? null, success: (evt?.exitCode ?? evt?.code ?? 0) === 0, output });
    });
    child.on?.('error', (err) => {
      const message = err?.message || '';
      const code = err?.code || '';
      if (code === 'EIO' || /EIO/.test(message)) return;
      cleanup();
      invalidatePackageManagerCache();
      send({ kind: 'error', message: message || tErr('errUnknown', 'Unknown error'), output });
    });
    return { ok: true, id };
  });
}

module.exports = { isExternalUpdateRunning, registerUpdatesHandlers };
