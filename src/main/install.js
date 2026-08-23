function registerInstallHandlers(ipcMain, deps) {
  const { tErr, detectPackageManager, invalidatePackageManagerCache, passwordWaiters, activeInstalls, installAppManAuto } = deps;

  ipcMain.on('password-response', (event, payload) => {
    if (!payload || !payload.id) return;
    const waiter = passwordWaiters.get(payload.id);
    if (waiter) {
      waiter(payload.password);
      passwordWaiters.delete(payload.id);
    }
  });

  ipcMain.handle('install-start', async (event, name, scope) => {
    const { pm } = await detectPackageManager();
    const installArgs = scope === 'user' ? ['-i', '--user', name] : ['-i', name];
    if (!pm) return { error: tErr('errNoPm', "No 'am' or 'appman' package manager found") };
    if (!name || typeof name !== 'string') return { error: tErr('errInvalidName', 'Invalid name') };
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    let output = '';
    const startedAt = Date.now();
    let stdoutRemainder = '';
    let stderrRemainder = '';
    const pty = require('node-pty');
    const env = Object.assign({}, process.env, {
      TERM: 'xterm', COLS: '80', ROWS: '30', FORCE_COLOR: '1'
    });
    let child;
    try {
      child = pty.spawn(pm, installArgs, {
        name: 'xterm-color', cols: 80, rows: 30, cwd: process.cwd(), env
      });
    } catch (err) {
      invalidatePackageManagerCache();
      return { error: err?.message || tErr('errUnableStartProcess', 'Unable to start the process.') };
    }
    activeInstalls.set(id, child);
    const wc = event.sender;
    const send = (payload) => { try { wc.send('install-progress', Object.assign({ id }, payload)); } catch (_) {} };
    send({ kind: 'start', name });
    const killTimer = setTimeout(() => { try { child.kill('SIGTERM'); } catch (_) {} }, 10 * 60 * 1000);

    function flushLines(chunk, isErr) {
      const txt = chunk.toString();
      output += txt;
      if (/\[sudo\]|mot de passe.*:|password.*:/i.test(txt)) {
        wc.send('password-prompt', { id });
        passwordWaiters.set(id, (password) => {
          if (typeof password === 'string') { try { child.write(password + '\n'); } catch (_) {} }
          else { try { child.kill('SIGKILL'); } catch (_) {} }
        });
      }
      send({ kind: 'line', raw: txt, stream: isErr ? 'stderr' : 'stdout' });
      let buffer = (isErr ? stderrRemainder : stdoutRemainder) + txt;
      const lines = buffer.split(/\r?\n/);
      if (lines.length > 1) {
        if (isErr) stderrRemainder = lines.pop();
        else stdoutRemainder = lines.pop();
        for (let idx = 0; idx < lines.length; idx++) {
          const line = lines[idx].trim();
          if (!line) continue;
          if ((/[:?]\s*$/.test(line)) && !/\?\d+$/.test(line)) {
            let hasNumberedOption = false;
            for (let peek = idx + 1; peek < Math.min(idx + 4, lines.length); peek++) {
              const pl = lines[peek]?.trim();
              if (!pl || /^[-=]+$/.test(pl)) continue;
              if (/^\s*\d+[\.|\)]/.test(pl)) { hasNumberedOption = true; break; }
              break;
            }
            if (!hasNumberedOption) continue;
            const options = [];
            for (let j = idx + 1; j < lines.length; j++) {
              let l = lines[j].trim();
              if (!l || /^[-=]+$/.test(l)) continue;
              if (l.includes('|')) {
                const parts = l.split('|').map(p => p.trim());
                parts.forEach(part => { if (/^\s*\d+[\.|\)]/.test(part)) options.push(part); });
              } else {
                if (/^\s*\d+[\.|\)]/.test(l)) {
                  let opt = l;
                  if (j + 1 < lines.length) {
                    let next = lines[j + 1].trim();
                    if (next && !/^\s*\d+[\.|\)]/.test(next) && !/^[-=]+$/.test(next)) { opt += ' ' + next; j++; }
                  }
                  options.push(opt);
                }
              }
            }
            options.sort((a, b) => {
              const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
              const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
              return na - nb;
            });
            send({ kind: 'choice-prompt', options, prompt: line });
          }
        }
      } else {
        if (isErr) stderrRemainder = lines[0];
        else stdoutRemainder = lines[0];
      }
    }

    child.onData((d) => flushLines(d, false));
    child.onExit((evt) => {
      clearTimeout(killTimer);
      if (stdoutRemainder && stdoutRemainder.trim()) send({ kind: 'line', line: stdoutRemainder.trim(), stream: 'stdout' });
      if (stderrRemainder && stderrRemainder.trim()) send({ kind: 'line', line: stderrRemainder.trim(), stream: 'stderr' });
      if (activeInstalls.has(id)) activeInstalls.delete(id);
      const duration = Date.now() - startedAt;
      const code = evt.exitCode;
      const success = code === 0;
      send({ kind: 'done', code, success, duration, output });
    });
    child.on?.('error', (err) => {
      clearTimeout(killTimer);
      invalidatePackageManagerCache();
      try { activeInstalls.delete(id); } catch (_) {}
      send({ kind: 'error', message: err?.message || tErr('errProcessError', 'Process error') });
    });
    return { id };
  });

  ipcMain.handle('install-cancel', async (event, installId) => {
    if (!installId) return { ok: false, error: tErr('errMissingId', 'Missing ID') };
    const child = activeInstalls.get(installId);
    if (!child) return { ok: false, error: tErr('errProcessNotFound', 'Process not found') };
    try {
      child.kill('SIGKILL');
      try { event.sender.send('install-progress', { id: installId, kind: 'cancelled' }); } catch (_) {}
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || tErr('errCancellationFailed', 'Cancellation failed') };
    }
  });

  ipcMain.handle('install-send-choice', async (_event, installId, choice) => {
    if (!installId) return { ok: false, error: tErr('errMissingId', 'Missing ID') };
    const child = activeInstalls.get(installId);
    if (!child) return { ok: false, error: tErr('errProcessNotFound', 'Process not found') };
    const normalizedChoice = (() => {
      if (typeof choice === 'number' && Number.isFinite(choice)) return String(choice);
      if (typeof choice === 'string') return choice.trim();
      return '';
    })();
    if (!normalizedChoice) return { ok: false, error: tErr('errInvalidChoice', 'Invalid choice') };
    try {
      child.write(normalizedChoice + '\n');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || tErr('errFailedSendChoice', 'Failed to send choice') };
    }
  });

  ipcMain.handle('dep-install', async (_event, name) => {
    const { pm } = await detectPackageManager();
    if (!pm) return { error: tErr('errNoPm', "No 'am' or 'appman' package manager found") };
    if (!name || typeof name !== 'string') return { error: tErr('errInvalidName', 'Invalid name') };

    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const child = spawn(pm, ['-i', name]);
      let stdoutBuf = '';
      let stderrBuf = '';
      const killTimer = setTimeout(() => { try { child.kill('SIGTERM'); } catch (_) {} }, 5 * 60 * 1000);
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
        resolve({ ok: false, error: err?.message || tErr('errUnknown', 'Unknown error') });
      });
    });
  });

  ipcMain.handle('install-appman-auto', async () => {
    try {
      const result = await installAppManAuto();
      invalidatePackageManagerCache();
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: error?.message || tErr('errAppmanInstall', 'AppMan installation failed.') };
    }
  });
}

module.exports = { registerInstallHandlers };
