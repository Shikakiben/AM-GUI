const { contextBridge, ipcRenderer } = require('electron');

// Retrieve the --de=xxx argument injected by main
let desktopEnv = 'generic';
try {
  const arg = process.argv.find(a => a.startsWith('--de='));
  if (arg) desktopEnv = arg.slice(5);
} catch(_) {}

let systemLocale = null;
contextBridge.exposeInMainWorld('electronAPI', {
  listAppsDetailed: () => ipcRenderer.invoke('list-apps-detailed'),
  uninstallApp: (name) => ipcRenderer.invoke('uninstall-app', name),
  depInstall: (name) => ipcRenderer.invoke('dep-install', name),
  updatesBulk: () => ipcRenderer.invoke('updates-bulk'),
  windowControl: (action) => ipcRenderer.invoke('window-control', action),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  desktopEnv: () => desktopEnv,
  systemLocale: () => systemLocale,
  envLang: () => process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || null,
  installStart: (name, scope) => ipcRenderer.invoke('install-start', name, scope),
  installCancel: (id) => ipcRenderer.invoke('install-cancel', id, id),
  installSendChoice: (id, choice) => ipcRenderer.invoke('install-send-choice', id, choice),
  onInstallProgress: (cb) => ipcRenderer.on('install-progress', (e, msg) => cb && cb(msg)),
  startUpdates: () => ipcRenderer.invoke('updates-start'),
  cancelUpdates: (id) => ipcRenderer.invoke('updates-cancel', id),
  onUpdatesProgress: (cb) => ipcRenderer.on('updates-progress', (e, msg) => cb && cb(msg)),
  installAppManAuto: () => ipcRenderer.invoke('install-appman-auto'),
  purgeIconsCache: () => ipcRenderer.invoke('purge-icons-cache'),
  getGpuPref: () => ipcRenderer.invoke('get-gpu-pref'),
  setGpuPref: (val) => ipcRenderer.invoke('set-gpu-pref', val),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  fetchAllCategories: () => ipcRenderer.invoke('fetch-all-categories'),
  getCategoriesCache: () => ipcRenderer.invoke('get-categories-cache'),
  deleteCategoriesCache: () => ipcRenderer.invoke('delete-categories-cache'),
  // Added for sudo password management
  onPasswordPrompt: (cb) => ipcRenderer.on('password-prompt', (e, data) => cb && cb(data)),
  sendPassword: (payload) => ipcRenderer.send('password-response', payload),
  getSandboxInfo: (appName) => ipcRenderer.invoke('sandbox-info', appName),
  configureSandbox: (options) => ipcRenderer.invoke('sandbox-configure', options),
  disableSandbox: (payload) => {
    if (payload && typeof payload === 'object') {
      return ipcRenderer.invoke('sandbox-disable', payload);
    }
    return ipcRenderer.invoke('sandbox-disable', { appName: payload });
  },
  onSandboxProgress: (cb) => ipcRenderer.on('sandbox-progress', (e, data) => cb && cb(data)),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  onBeforeClose: (cb) => ipcRenderer.on('before-close', () => cb && cb()),
  setTrayLocale: (locale) => ipcRenderer.invoke('set-tray-locale', locale)
});
try {
  const lArg = process.argv.find(a => a.startsWith('--locale='));
  if (lArg) systemLocale = lArg.slice(9);
} catch(_) {}
