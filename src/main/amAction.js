const { spawn } = require('child_process');

function registerAmActionHandler(ipcMain, deps) {
  const {
    tErr,
    detectPackageManager,
    invalidatePackageManagerCache,
    passwordWaiters,
    isExternalUpdateRunning
  } = deps;

  ipcMain.handle('am-action', async (event, action, software, scope) => {
    const { pm } = await detectPackageManager();
    if (!pm) return tErr('errNoPm', "No 'am' or 'appman' package manager found");

    if (action === '__update_all__') {
      if (await isExternalUpdateRunning(pm)) return tErr('errExternalUpdateRunning', 'AM/Appman update is already running in the background');
      return new Promise((resolve) => {
        const child = spawn(pm, ['-u']);
        let stdoutBuf = '';
        let stderrBuf = '';
        const killTimer = setTimeout(() => { try { child.kill('SIGTERM'); } catch (_) { } }, 5 * 60 * 1000);
        child.stdout.on('data', d => { stdoutBuf += d.toString(); });
        child.stderr.on('data', d => { stderrBuf += d.toString(); });
        child.on('close', (code) => {
          clearTimeout(killTimer);
          if (code === 0) return resolve(stdoutBuf || '');
          resolve(stderrBuf || stdoutBuf || tErr('errProcessFinishedCode', 'Process finished with code {code}', { code }));
        });
        child.on('error', (err) => {
          clearTimeout(killTimer);
          invalidatePackageManagerCache();
          resolve(err.message || tErr('errUnknown', 'Unknown error'));
        });
      });
    }

    let args;
    if (action === 'install') {
      args = scope === 'user' ? ['-i', '--user', software] : ['-i', software];
    }
    else if (action === 'uninstall') args = ['-R', software];
    else return tErr('errUnknownAction', 'Unknown action: {action}', { action });

    return new Promise((resolve) => {
      try {
        const pty = require('node-pty');
        const env = Object.assign({}, process.env, {
          TERM: 'xterm',
          COLS: '80',
          ROWS: '30',
          FORCE_COLOR: '1',
        });
        const child = pty.spawn(pm, args, {
          name: 'xterm-color',
          cols: 80,
          rows: 30,
          cwd: process.cwd(),
          env
        });
        let output = '';
        let done = false;
        let pathChoiceSent = false;
        const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        passwordWaiters.set(id, (password) => {
          if (typeof password === 'string') {
            try { child.write(password + '\n'); } catch (_) { }
          } else {
            try { child.kill('SIGKILL'); } catch (_) { }
          }
        });
        child.onData((txt) => {
          output += txt;
          if (/\[sudo\]|mot de passe.*:|password.*:/i.test(txt)) {
            if (event.sender) event.sender.send('password-prompt', { id });
          }
          if (!pathChoiceSent && output.includes('1.') && output.includes('2.')) {
            const pathOptions = (output.match(/\d+\.\s+\/\S+/g) || []);
            if (pathOptions.length >= 2) {
              let choice = '1';
              for (const pl of pathOptions) {
                const numMatch = pl.match(/^(\d+)\.\s+(\/\S+)/);
                if (!numMatch) continue;
                const isSystemPath = numMatch[2].startsWith('/opt');
                if (scope === 'user' && !isSystemPath) { choice = numMatch[1]; break; }
                if (scope !== 'user' && isSystemPath) { choice = numMatch[1]; break; }
              }
              pathChoiceSent = true;
              setTimeout(() => { try { child.write(choice + '\n'); } catch (_) { } }, 200);
            }
          }
        });
        child.onExit((evt) => {
          if (done) return;
          done = true;
          passwordWaiters.delete(id);
          resolve(output);
        });
        child.on?.('error', (err) => {
          if (done) return;
          done = true;
          passwordWaiters.delete(id);
          invalidatePackageManagerCache();
          if (err && err.message && err.message.includes('EIO')) {
            resolve(output || 'done');
          } else {
            resolve(err?.message || tErr('errUnknown', 'Unknown error'));
          }
        });
        setTimeout(() => {
          if (!done) {
            done = true;
            passwordWaiters.delete(id);
            try { child.kill('SIGKILL'); } catch (_) { }
            resolve(output || 'done');
          }
        }, 30000);
      } catch (e) {
        invalidatePackageManagerCache();
        return resolve(e && e.message ? e.message : String(e));
      }
    });
  });
}

module.exports = { registerAmActionHandler };
