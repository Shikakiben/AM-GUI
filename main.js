if (!process.env.TERM) process.env.TERM = 'xterm-256color';
if (!process.env.COLORTERM) process.env.COLORTERM = 'truecolor';

const xdgBinHome = process.env.XDG_BIN_HOME || (process.env.HOME ? `${process.env.HOME}/.local/bin` : null);
if (xdgBinHome && !process.env.PATH.split(':').includes(xdgBinHome)) {
  process.env.PATH = `${process.env.PATH}:${xdgBinHome}`;
}

const { app, BrowserWindow, ipcMain, Menu, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const fsp = fs.promises;

const { registerCategoryHandlers } = require('./src/main/categories');
const { initTray, destroyTray, setTrayLocale } = require('./src/main/tray');
const { getContextMenuLabels, tErr, setLocale } = require('./src/i18n/translations');
const { detectPackageManager, invalidatePackageManagerCache } = require('./src/main/packageManager');
const { createIconCacheManager } = require('./src/main/iconCache');
const { installAppManAuto } = require('./src/main/appManAuto');
const { registerGpuHandlers } = require('./src/main/gpu');
const { registerExternalHandlers } = require('./src/main/external');
const { registerWindowHandlers } = require('./src/main/window');
const { registerAmActionHandler } = require('./src/main/amAction');
const { isExternalUpdateRunning, registerUpdatesHandlers } = require('./src/main/updates');
const { registerSandboxHandlers } = require('./src/main/sandbox');
const { registerInstallHandlers } = require('./src/main/install');
const { registerAppListHandlers } = require('./src/main/appList');

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
const activeInstalls = new Map();
const activeUpdates = new Map();
const passwordWaiters = new Map();

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.setAlwaysOnTop(true);
      setTimeout(() => { if (mainWindow) mainWindow.setAlwaysOnTop(false); }, 100);
    }
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
} else {
  app.commandLine.appendSwitch('disable-gpu-vsync');
  app.commandLine.appendSwitch('disable-frame-rate-limit');
}

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

// Register IPC handlers
const deps = { tErr, detectPackageManager, invalidatePackageManagerCache, passwordWaiters, activeInstalls, activeUpdates, installAppManAuto, isExternalUpdateRunning, fsp };
registerGpuHandlers(ipcMain, app);
registerExternalHandlers(ipcMain, deps);
registerWindowHandlers(ipcMain);
registerAmActionHandler(ipcMain, deps);
registerUpdatesHandlers(ipcMain, deps);
registerSandboxHandlers(ipcMain, deps);
registerInstallHandlers(ipcMain, deps);
registerAppListHandlers(ipcMain, deps);

const iconCacheManager = createIconCacheManager(app);
registerCategoryHandlers(ipcMain, app.getPath('userData'));

ipcMain.handle('purge-icons-cache', async () => iconCacheManager.purgeCache());

// Tray locale
ipcMain.handle('set-tray-locale', (_event, locale) => {
  setTrayLocale(locale);
  if (locale && locale !== 'auto') currentLocale = locale;
  setLocale(locale);
});

// Frameless window controls (delegated to window module)
// Already registered via registerWindowHandlers above

app.whenReady().then(() => {
  try { iconCacheManager.registerProtocol(protocol); } catch (e) { console.warn('appicon protocol failed:', e); }
  const win = createWindow();
  try { initTray(win); } catch (e) { console.warn('initTray failed:', e); }
});

app.on('before-quit', () => { try { destroyTray(); } catch (_) {} });
