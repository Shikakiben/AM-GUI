if (!process.env.TERM) process.env.TERM = 'xterm-256color';
if (!process.env.COLORTERM) process.env.COLORTERM = 'truecolor';

const xdgBinHome = process.env.XDG_BIN_HOME || (process.env.HOME ? `${process.env.HOME}/.local/bin` : null);
if (xdgBinHome && !process.env.PATH.split(':').includes(xdgBinHome)) {
  process.env.PATH = `${process.env.PATH}:${xdgBinHome}`;
}

const { app, BrowserWindow, ipcMain, Menu, protocol, shell, session, net, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const fsp = fs.promises;

const { registerCategoryHandlers } = require('./src/main/categories');
const { initTray, destroyTray, setTrayLocale } = require('./src/main/tray');
const { getContextMenuLabels, tErr, setLocale } = require('./src/i18n/translations');
const { detectPackageManager, invalidatePackageManagerCache, translatePackageManagerLocale } = require('./src/main/packageManager');
const { createIconCacheManager } = require('./src/main/iconCache');
const { installAppManAuto } = require('./src/main/appManAuto');
const { registerGpuHandlers } = require('./src/main/gpu');
const { isExternalUpdateRunning, registerUpdatesHandlers } = require('./src/main/updates');
const { registerSandboxHandlers } = require('./src/main/sandbox');
const { registerInstallHandlers } = require('./src/main/install');
const { registerAppListHandlers } = require('./src/main/appList');
const { registerUninstallHandler } = require('./src/main/uninstall');
const { registerLaunchHandlers } = require('./src/main/launch');
const { PLA_INSTALL_SCHEME, extractPlaInstallUrl, parsePlaInstallUrl } = require('./src/main/plaInstall');
const { createProxySupport } = require('./src/main/proxy');
const { createProxyCredentialStore, readSystemCredentials } = require('./src/main/proxyCredentials');

const errorLogPath = path.join(app.getPath('userData'), 'error.log');
function logGlobalError(err) {
  const msg = `[${new Date().toISOString()}] ${err && err.stack ? err.stack : err}`;
  try { fs.appendFileSync(errorLogPath, msg + '\n'); } catch (_) {}
  console.error(msg);
}

process.on('uncaughtException', logGlobalError);
process.on('unhandledRejection', logGlobalError);

if (app.setName) app.setName('AM-GUI');

let mainWindow = null;
let currentLocale = 'en';
let currentProxyHost = ''; // shown in the proxy authentication window
const activeInstalls = new Map();
const activeUpdates = new Map();
const passwordWaiters = new Map();
let pendingPlaInstall = null; // pla-install:// URL received before the window is ready

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.setAlwaysOnTop(true);
      setTimeout(() => { if (mainWindow) mainWindow.setAlwaysOnTop(false); }, 100);
    }
    // A second instance may carry a pla-install:// URL (e.g. from the PLA website)
    const url = extractPlaInstallUrl(commandLine || process.argv);
    if (url) forwardPlaInstall(url);
  });
}

// GPU acceleration management
const hasDisableGpuFlag = process.argv.includes('--disable-gpu');
let disableGpuPref = false;
try {
  const prefPath = path.join(app.getPath('userData'), 'gpu-pref.json');
  if (fs.existsSync(prefPath)) {
    disableGpuPref = JSON.parse(fs.readFileSync(prefPath, 'utf8')).disableGpu === true;
  }
} catch (_) {}

const shouldDisableGpu = hasDisableGpuFlag || disableGpuPref;
if (shouldDisableGpu && typeof app.disableHardwareAcceleration === 'function') {
  app.disableHardwareAcceleration();
}
// NOTE: do not re-add 'disable-gpu-vsync' / 'disable-frame-rate-limit' here.
// They remove the frame rate cap, so any spinner left running (the "Run
// updates" button spins for the whole update) makes the compositor produce
// thousands of frames per second: ~95% CPU in the renderer, a busy GPU process
// and a machine that freezes while the update runs.

// Electron 36+ defaults to GTK4 which crashes on mixed-GTK systems.
// Official Electron fix: https://www.electronjs.org/docs/latest/breaking-changes#changed-gtk-4-is-default-when-running-gnome
app.commandLine.appendSwitch('gtk-version', '3');
// Suppress VAAPI error on systems without libva (AM-GUI doesn't play video)
app.commandLine.appendSwitch('disable-features', 'VaapiVideoDecode');

function detectDesktopEnv() {
  const env = process.env;
  const xdg = (env.XDG_CURRENT_DESKTOP || '').toLowerCase();
  const session = (env.DESKTOP_SESSION || '').toLowerCase();
  if (xdg.includes('gnome') || session.includes('gnome')) return 'gnome';
  if (xdg.includes('kde') || xdg.includes('plasma') || session.includes('plasma') || session.includes('kde')) return 'plasma';
  if (xdg.includes('xfce') || session.includes('xfce')) return 'xfce';
  if (xdg.includes('cinnamon') || session.includes('cinnamon')) return 'cinnamon';
  if (xdg.includes('unity') || session.includes('unity')) return 'unity';
  return 'generic';
}

function createWindow() {
  const deTag = detectDesktopEnv();
  const sysLocale = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || (app.getLocale?.() || 'en');
  const iconPath = path.join(__dirname, 'AM-GUI.png');
  const win = new BrowserWindow({
    width: 1100, height: 750, frame: false,
    title: 'AM-GUI', icon: iconPath, backgroundColor: '#f6f8fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      // Keep the renderer at full speed when the window is hidden or occluded:
      // xterm parses its write buffer through setTimeout() and the updates log
      // is written there, so with the default throttling the backlog piles up
      // and the UI freezes when the window comes back, until it is parsed.
      backgroundThrottling: false,
      additionalArguments: [`--de=${deTag}`, `--locale=${sysLocale}`]
    }
  });

  try { Menu.setApplicationMenu(null); } catch (_) {}
  win.setMenuBarVisibility(false);
  win.loadFile('index.html');

  // DevTools shortcut
  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key && input.key.toLowerCase() === 'i') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Right-click context menu
  win.webContents.on('context-menu', (event, params) => {
    const ctxLabels = getContextMenuLabels(currentLocale);
    const { selectionText, isEditable } = params;
    const hasSelection = selectionText && selectionText.trim().length > 0;
    const template = [];
    if (isEditable) {
      template.push({ role: 'undo', label: ctxLabels.undo }, { role: 'redo', label: ctxLabels.redo }, { type: 'separator' },
        { role: 'cut', label: ctxLabels.cut }, { role: 'copy', label: ctxLabels.copy }, { role: 'paste', label: ctxLabels.paste },
        { role: 'delete', label: ctxLabels.del }, { type: 'separator' }, { role: 'selectAll', label: ctxLabels.selectAll });
    } else if (hasSelection) {
      template.push({ role: 'copy', label: ctxLabels.copy }, { type: 'separator' }, { role: 'selectAll', label: ctxLabels.selectAll });
    } else {
      template.push({ role: 'selectAll', label: ctxLabels.selectAll });
    }
    template.push({ type: 'separator' }, { role: 'toggleDevTools', label: ctxLabels.toggleDevTools });
    Menu.buildFromTemplate(template).popup({ window: win });
  });

  // Close confirmation for active installs
  win.on('close', (event) => {
    if (activeInstalls.size > 0) {
      event.preventDefault();
      win.webContents.send('before-close');
    }
  });

  mainWindow = win;
  return win;
}

// --- pla-install:// URL scheme (PLA website "Install" button) ---
function registerPlaInstallProtocol() {
  try {
    if (process.defaultApp) {
      // Dev mode: register with the Electron binary + the app entry script
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PLA_INSTALL_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient(PLA_INSTALL_SCHEME);
    }
  } catch (e) {
    console.warn('pla-install protocol registration failed:', e);
  }
}

function forwardPlaInstall(url) {
  const parsed = parsePlaInstallUrl(url);
  if (!parsed) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(true);
    setTimeout(() => { if (mainWindow) mainWindow.setAlwaysOnTop(false); }, 100);
    mainWindow.webContents.send('pla-install', parsed);
  } else {
    pendingPlaInstall = parsed;
  }
}

// A pla-install:// URL passed on the command line when the app starts
pendingPlaInstall = parsePlaInstallUrl(extractPlaInstallUrl(process.argv));

// macOS: URLs arrive via the open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url) forwardPlaInstall(url);
});

// Register IPC handlers
// The proxy password is asked for when the proxy demands it, like a browser
// does. It is kept in memory for the session, and only written to disk when the
// user ticks the box — encrypted by the system keyring, never in clear.
const proxyCredentialStore = createProxyCredentialStore({
  safeStorage,
  filePath: path.join(app.getPath('userData'), 'proxy-auth.json')
});
let proxyPromptSeq = 0;
async function askProxyCredentials() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return null;
  const id = `proxy-${++proxyPromptSeq}`;
  // Knowing whether the password can be encrypted may need the keyring, which
  // is asynchronous. It is read before the dialog opens, so the label is right.
  let encrypted = false;
  try { encrypted = await proxyCredentialStore.canStore(); } catch (_) { encrypted = false; }
  if (win.isDestroyed()) return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (answer) => {
      if (settled) return;
      settled = true;
      passwordWaiters.delete(id);
      resolve(answer);
    };
    passwordWaiters.set(id, (payload) => {
      if (payload && typeof payload === 'object' && payload.username) {
        const credentials = { username: payload.username, password: payload.password || '' };
        // Ticking the box stores it; unticking it forgets a previous one.
        if (payload.remember) {
          proxyCredentialStore.save(credentials).catch(() => {});
        } else {
          proxyCredentialStore.clear();
        }
        finish(credentials);
      } else {
        finish(null);
      }
    });
    try {
      win.webContents.send('password-prompt', {
        id,
        kind: 'proxy',
        host: currentProxyHost || '',
        // The box is always offered; `encrypted` decides whether the label
        // carries the "no encryption available" warning.
        canRemember: true,
        encrypted
      });
    } catch (_) {
      finish(null);
    }
  });
}

const proxySupport = createProxySupport({
  getSession: () => (typeof session !== 'undefined' ? session.defaultSession : null),
  askCredentials: askProxyCredentials,
  request: (url) => net.request(url),
  // Read on first use: safeStorage is only readable once the app is ready.
  getInitialCredentials: () => proxyCredentialStore.load(),
  getSystemCredentials: () => readSystemCredentials(),
  clearAuthCache: () => {
    const ses = typeof session !== 'undefined' ? session.defaultSession : null;
    if (ses && typeof ses.clearAuthCache === 'function') return ses.clearAuthCache();
    return Promise.resolve();
  },
  onCredentialsRefused: () => proxyCredentialStore.clear(),
  onAuthenticated: () => {
    // Retry what failed while the password was missing.
    try { mainWindow?.webContents?.send('proxy-authenticated'); } catch (_) {}
  },
  onProxyChallenge: (authInfo) => {
    currentProxyHost = [authInfo?.host, authInfo?.port].filter(Boolean).join(':');
  }
});

// Every main-process download (icons, categories, AppMan) goes through
// Chromium's network stack, which follows the proxy the machine is configured
// with. net.fetch cannot raise the password prompt by itself (measured), so the
// first failure asks for it once and then retries with Chromium's cached answer.
//
// The environment proxy is applied here, not on the startup path: a slow
// resolver must never delay the window. Downloads wait for it, the user does not.
let envProxyReady = null;
function ensureEnvProxy() {
  if (!envProxyReady) envProxyReady = proxySupport.configureFromEnvironment().catch(() => false);
  return envProxyReady;
}

async function netFetch(input, init) {
  await ensureEnvProxy();
  const url = typeof input === 'string' ? input : input?.url;
  // A proxy that wants a password shows up in one of two ways, both observed:
  // a 407 response, or a thrown ERR_TUNNEL_CONNECTION_FAILED. Either way the
  // answer is the same: ask once, then replay the request.
  const retryWithAuth = async () => {
    if (!url) return false;
    try { return await proxySupport.ensureProxyAuth(url); } catch (_) { return false; }
  };

  let first;
  try {
    first = await net.fetch(input, init);
  } catch (error) {
    if (!(await retryWithAuth())) throw error;
    return net.fetch(input, init);
  }
  if (!first || first.status !== 407) return first;
  try { await first.body?.cancel?.(); } catch (_) {}
  if (!(await retryWithAuth())) return first;
  return net.fetch(input, init);
}

const deps = { tErr, detectPackageManager, invalidatePackageManagerCache, passwordWaiters, activeInstalls, activeUpdates, installAppManAuto: (opts) => installAppManAuto({ ...opts, fetch: netFetch }), isExternalUpdateRunning, fsp, userDataPath: app.getPath('userData') };
registerGpuHandlers(ipcMain, app);
registerUpdatesHandlers(ipcMain, deps);

// Inline handlers (too small to justify separate modules)
ipcMain.handle('open-external', async (_event, url) => {
  try {
    if (!url || typeof url !== 'string') return { ok: false, error: tErr('errInvalidUrl', 'invalid url') };
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: tErr('errSchemeNotAllowed', 'scheme not allowed') };
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) { return { ok: false, error: e?.message || String(e) }; }
});

ipcMain.handle('window-control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  switch (action) {
    case 'min': win.minimize(); break;
    case 'max': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
    case 'close': win.close(); break;
  }
});
ipcMain.handle('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.destroy();
});
registerSandboxHandlers(ipcMain, deps);
registerInstallHandlers(ipcMain, deps);
registerAppListHandlers(ipcMain, deps);
registerUninstallHandler(ipcMain, deps);
registerLaunchHandlers(ipcMain, { tErr });

// Apps cache (speeds up cold start)
ipcMain.handle('invalidate-apps-cache', async () => {
  const p = path.join(app.getPath('userData'), 'apps-cache.json');
  try { await fsp.unlink(p); } catch (_) {}
  return { ok: true };
});

const iconCacheManager = createIconCacheManager(app, { fetch: netFetch });
registerCategoryHandlers(ipcMain, app.getPath('userData'), { fetch: netFetch });

ipcMain.handle('purge-icons-cache', async () => iconCacheManager.purgeCache());

// Tray locale
ipcMain.handle('set-tray-locale', (_event, locale) => {
  setTrayLocale(locale);
  if (locale && locale !== 'auto') currentLocale = locale;
  setLocale(locale);
});

// Sync AM/AppMan locale (opt-in from the renderer settings)
ipcMain.handle('sync-am-locale', (_event, lang) => translatePackageManagerLocale(lang));

app.whenReady().then(async () => {
  try { iconCacheManager.registerProtocol(protocol); } catch (e) { console.warn('appicon protocol failed:', e); }
  registerPlaInstallProtocol();
  // Proxy: answer the proxy's password challenge like a browser does. The
  // window is created first, always: nothing network-related may delay it.
  try { proxySupport.installLoginHandler(app); } catch (e) { console.warn('proxy login handler failed:', e); }
  const win = createWindow();
  // Deliver a pending pla-install:// request once the page has finished loading
  win.webContents.on('did-finish-load', () => {
    if (pendingPlaInstall) {
      win.webContents.send('pla-install', pendingPlaInstall);
      pendingPlaInstall = null;
    }
  });
  try { initTray(win); } catch (e) { console.warn('initTray failed:', e); }
});

app.on('before-quit', () => { try { destroyTray(); } catch (_) {} });
