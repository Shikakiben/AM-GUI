function registerUninstallHandler(ipcMain, deps) {
  const { tErr, detectPackageManager, invalidatePackageManagerCache, passwordWaiters } = deps;

  ipcMain.handle('uninstall-app', async (event, appName) => {
    const { pm } = await detectPackageManager();
    if (!pm) return { error: tErr('errNoPm', "No 'am' or 'appman' package manager found") };
    if (!appName || typeof appName !== 'string') return { error: tErr('errInvalidName', 'Invalid name') };

    return new Promise((resolve) => {
      try {
        const pty = require('node-pty');
        const env = Object.assign({}, process.env, {
          TERM: 'xterm', COLS: '80', ROWS: '30', FORCE_COLOR: '1',
        });
        const child = pty.spawn(pm, ['-R', appName], {
          name: 'xterm-color', cols: 80, rows: 30, cwd: process.cwd(), env
        });

        let output = '';
        let done = false;
        const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

        passwordWaiters.set(id, (password) => {
          if (typeof password === 'string') {
            try { child.write(password + '\n'); } catch (_) {}
          } else {
            try { child.kill('SIGKILL'); } catch (_) {}
          }
        });

        child.onData((txt) => {
          output += txt;
          if (/\[sudo\]|mot de passe.*:|password.*:/i.test(txt)) {
            if (event.sender) event.sender.send('password-prompt', { id });
          }
        });

        child.onExit(() => {
          if (done) return;
          done = true;
          passwordWaiters.delete(id);
          resolve({ ok: true, output });
        });

        child.on?.('error', (err) => {
          if (done) return;
          done = true;
          passwordWaiters.delete(id);
          invalidatePackageManagerCache();
          resolve({ ok: false, error: err?.message || tErr('errUninstallFailed', 'Uninstall failed') });
        });

        setTimeout(() => {
          if (!done) {
            done = true;
            passwordWaiters.delete(id);
            try { child.kill('SIGKILL'); } catch (_) {}
            resolve({ ok: false, error: tErr('errUninstallTimeout', 'Uninstall timed out') });
          }
        }, 5 * 60 * 1000);
      } catch (e) {
        invalidatePackageManagerCache();
        resolve({ ok: false, error: e?.message || String(e) });
      }
    });
  });
}

module.exports = { registerUninstallHandler };
