const path = require('path');
const os = require('os');

const SANDBOX_DIR_KEYS = ['desktop', 'documents', 'downloads', 'games', 'music', 'pictures', 'videos'];
const SANDBOX_MARKER = 'aisap-am sandboxing script';

async function isExecutableFile(fsp, filePath) {
  if (!filePath) return false;
  try {
    const stats = await fsp.stat(filePath);
    if (!stats.isFile()) return false;
    await fsp.access(filePath, fsp.constants.X_OK);
    return true;
  } catch (_) { return false; }
}

async function resolveCommandPath(fsp, binName) {
  if (!binName || typeof binName !== 'string') return null;
  const trimmed = binName.trim();
  if (!trimmed) return null;
  if (trimmed.includes(path.sep)) {
    if (await isExecutableFile(fsp, trimmed)) return trimmed;
  }
  const envPath = process.env.PATH || '';
  const pathEntries = envPath.split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, trimmed);
    if (await isExecutableFile(fsp, candidate)) return candidate;
  }
  const homeDir = os.homedir();
  const candidates = new Set([
    path.join(homeDir, '.local/bin', trimmed),
    path.join(homeDir, 'bin', trimmed),
    path.join(homeDir, 'Applications', 'bin', trimmed),
    path.join(homeDir, 'Applications', trimmed, trimmed),
    path.join(homeDir, 'Applications', trimmed, `${trimmed}.sh`),
    path.join(homeDir, 'Applications', trimmed, `${trimmed}.AppImage`)
  ]);
  for (const candidate of candidates) {
    if (await isExecutableFile(fsp, candidate)) return candidate;
  }
  return null;
}

async function isSandboxWrapper(fsp, execPath) {
  if (!execPath) return false;
  try {
    const handle = await fsp.open(execPath, 'r');
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    await handle.close();
    if (!bytesRead) return false;
    const snippet = buffer.slice(0, bytesRead).toString('utf8');
    return snippet.includes(SANDBOX_MARKER);
  } catch (_) { return false; }
}

async function detectAppImageFromPath(fsp, execPath) {
  if (!execPath) return null;
  try {
    const handle = await fsp.open(execPath, 'r');
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    await handle.close();
    if (bytesRead < 12) return null;
    const isElf = buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46;
    if (!isElf) return null;
    const hasAppImageMagic = buffer[8] === 0x41 && buffer[9] === 0x49 && buffer[10] === 0x02;
    return hasAppImageMagic;
  } catch (_) { return null; }
}

function getForbiddenSandboxPaths() {
  const homeDir = os.homedir();
  const dataDir = process.env.XDG_DATA_HOME || path.join(homeDir, '.local/share');
  const configDir = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
  const binDir = process.env.XDG_BIN_HOME || path.join(homeDir, '.local/bin');
  return new Set([
    path.resolve('/'),
    path.resolve('/home'),
    path.resolve(homeDir),
    path.resolve(dataDir),
    path.resolve(configDir),
    path.resolve(binDir)
  ]);
}

function normalizeCustomSandboxPath(input) {
  if (!input || typeof input !== 'string') return '';
  let candidate = input.trim();
  if (!candidate) return '';
  if (candidate.startsWith('~/')) {
    candidate = path.join(os.homedir(), candidate.slice(2));
  } else if (candidate === '~') {
    candidate = os.homedir();
  }
  return path.resolve(candidate);
}

function buildSandboxAnswerScript(shouldConfigure, dirSelections, customPath) {
  if (!shouldConfigure) return 'n\n';
  const answers = ['y'];
  SANDBOX_DIR_KEYS.forEach((key) => {
    answers.push(dirSelections[key] ? 'y' : 'n');
  });
  if (customPath) {
    answers.push('y');
    answers.push(customPath);
  } else {
    answers.push('n');
  }
  return answers.map((ans) => `${ans ?? ''}\n`).join('');
}

function registerSandboxHandlers(ipcMain, deps) {
  const { fsp, tErr, detectPackageManager, invalidatePackageManagerCache, passwordWaiters } = deps;

  async function detectSandboxDependencies() {
    const [sasPath, aisapPath] = await Promise.all([
      resolveCommandPath(fsp, 'sas'),
      resolveCommandPath(fsp, 'aisap')
    ]);
    return { hasSas: !!sasPath, hasAisap: !!aisapPath };
  }

  async function validateCustomSandboxPath(input) {
    const normalized = normalizeCustomSandboxPath(input);
    if (!normalized) return { ok: true, value: '' };
    const forbidden = getForbiddenSandboxPaths();
    if (forbidden.has(path.normalize(normalized))) {
      return { ok: false, error: tErr('errForbiddenPath', 'forbidden-path') };
    }
    try {
      await fsp.stat(normalized);
    } catch (_) {
      return { ok: false, error: tErr('errMissingPath', 'missing-path') };
    }
    return { ok: true, value: normalized };
  }

  function runSandboxTask(sender, { pm, action, args, stdinScript, appName }) {
    return new Promise((resolve) => {
      const pty = require('node-pty');
      const id = `${action}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const env = Object.assign({}, process.env, {
        TERM: 'xterm', COLS: '80', ROWS: '30', FORCE_COLOR: '1'
      });
      let child;
      try {
        child = pty.spawn(pm, args, {
          name: 'xterm-color', cols: 80, rows: 30, cwd: process.cwd(), env
        });
      } catch (err) {
        invalidatePackageManagerCache();
        return resolve({ ok: false, error: err?.message || tErr('errUnableStartSandbox', 'Unable to start sandbox command.'), id });
      }
      let settled = false;
      let output = '';
      const passwordRegex = /\[sudo\]|mot de passe.*:|password.*:/i;
      const send = (payload) => {
        if (!sender) return;
        try { sender.send('sandbox-progress', Object.assign({ id, action, appName }, payload)); } catch (_) {}
      };
      const finish = (result) => {
        if (settled) return;
        settled = true;
        passwordWaiters.delete(id);
        resolve(result);
      };
      send({ kind: 'start' });
      passwordWaiters.set(id, (password) => {
        if (typeof password === 'string') { try { child.write(password + '\n'); } catch (_) {} }
        else { try { child.kill('SIGKILL'); } catch (_) {} }
      });
      child.onData((txt) => {
        output += txt;
        send({ kind: 'data', chunk: txt });
        if (passwordRegex.test(txt)) { try { sender?.send('password-prompt', { id }); } catch (_) {} }
      });
      child.onExit((evt) => {
        const code = typeof evt?.exitCode === 'number' ? evt.exitCode : evt?.code;
        const success = code === 0;
        send({ kind: 'done', code, success });
        finish({ ok: success, code, output, id });
      });
      child.on?.('error', (err) => {
        const message = err?.message || '';
        const code = err?.code || '';
        if (code === 'EIO' || /EIO/.test(message)) {
          send({ kind: 'debug', message: tErr('errSandboxPtyClosed', 'Sandbox PTY closed (EIO)') });
          return;
        }
        invalidatePackageManagerCache();
        send({ kind: 'error', message: message || tErr('errSandboxFailed', 'Sandbox command failed.') });
        finish({ ok: false, error: message || tErr('errSandboxFailed', 'Sandbox command failed.'), output, id });
      });
      if (stdinScript) {
        setTimeout(() => { try { child.write(stdinScript); } catch (_) {} }, 120);
      }
    });
  }

  ipcMain.handle('sandbox-info', async (_event, appName) => {
    const deps = await detectSandboxDependencies();
    const { pm } = await detectPackageManager();
    const response = { ok: true, dependencies: deps, pmFound: !!pm };
    if (!pm) {
      response.error = tErr('errMissingPm', 'missing-pm');
      response.info = { installed: false, sandboxed: false };
      return response;
    }
    const normalizedName = typeof appName === 'string' ? appName.trim() : '';
    if (!normalizedName) {
      response.info = { installed: false, sandboxed: false };
      return response;
    }
    const execPath = await resolveCommandPath(fsp, normalizedName);
    const sandboxed = await isSandboxWrapper(fsp, execPath);
    let isAppImage = sandboxed ? true : await detectAppImageFromPath(fsp, execPath);
    const selfExecPath = process.env.APPIMAGE || process.execPath;
    const isSelfAppImage = execPath && selfExecPath && path.resolve(execPath) === path.resolve(selfExecPath);
    if (isSelfAppImage) isAppImage = true;
    response.info = {
      appName: normalizedName,
      installed: !!execPath,
      sandboxed,
      execPath: execPath || null,
      dependenciesReady: deps.hasSas || deps.hasAisap,
      isAppImage,
      selfSandboxProhibited: isSelfAppImage,
      sandboxForbiddenReason: isSelfAppImage ? 'self' : null
    };
    return response;
  });

  ipcMain.handle('sandbox-configure', async (event, payload = {}) => {
    const { pm } = await detectPackageManager();
    if (!pm) return { ok: false, error: tErr('errMissingPm', 'missing-pm') };
    const deps = await detectSandboxDependencies();
    if (!deps.hasSas && !deps.hasAisap) {
      return { ok: false, error: tErr('errMissingDependency', 'missing-dependency') };
    }
    const normalizedName = typeof payload.appName === 'string' ? payload.appName.trim() : '';
    if (!normalizedName) return { ok: false, error: tErr('errInvalidApp', 'invalid-app') };
    const shareDirsInput = typeof payload.shareDirs === 'object' && payload.shareDirs !== null ? payload.shareDirs : {};
    const dirSelections = {};
    SANDBOX_DIR_KEYS.forEach((key) => { dirSelections[key] = !!shareDirsInput[key]; });
    const customCheck = await validateCustomSandboxPath(payload.customPath || '');
    if (!customCheck.ok) return { ok: false, error: customCheck.error };
    const hasDirSelection = SANDBOX_DIR_KEYS.some((key) => dirSelections[key]);
    const hasCustomPath = !!customCheck.value;
    let shouldConfigure;
    if (payload.configureDirs === true) shouldConfigure = true;
    else if (payload.configureDirs === false) shouldConfigure = false;
    else shouldConfigure = hasDirSelection || hasCustomPath;
    const stdinScript = buildSandboxAnswerScript(shouldConfigure, dirSelections, customCheck.value);
    const args = ['--sandbox', normalizedName];
    const result = await runSandboxTask(event.sender, { pm, action: 'configure', args, stdinScript, appName: normalizedName });
    if (!result.ok && !result.error) result.error = tErr('errSandboxConfigureFailed', 'sandbox-configure-failed');
    return result;
  });

  ipcMain.handle('sandbox-disable', async (event, payload = {}) => {
    const { pm } = await detectPackageManager();
    if (!pm) return { ok: false, error: tErr('errMissingPm', 'missing-pm') };
    const normalizedName = typeof payload.appName === 'string' ? payload.appName.trim() : '';
    if (!normalizedName) return { ok: false, error: tErr('errInvalidApp', 'invalid-app') };
    const args = ['--disable-sandbox', normalizedName];
    const result = await runSandboxTask(event.sender, { pm, action: 'disable', args, appName: normalizedName });
    if (!result.ok && !result.error) result.error = tErr('errSandboxDisableFailed', 'sandbox-disable-failed');
    return result;
  });
}

module.exports = { registerSandboxHandlers, normalizeCustomSandboxPath, buildSandboxAnswerScript, getForbiddenSandboxPaths, SANDBOX_DIR_KEYS };
