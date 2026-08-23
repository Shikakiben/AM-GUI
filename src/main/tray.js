const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { getTrayLabels } = require('../i18n/translations');

let tray = null;
let currentMainWindow = null;
let currentLabels = getTrayLabels(null);

function loadIcon() {
  const candidatesDirs = [
    path.join(process.resourcesPath || '', 'assets', 'tray'),
    path.join(__dirname, '..', '..', 'assets', 'tray'),
    path.join(__dirname, '..', 'assets', 'tray')
  ];
  const names = ['icon-32.png', 'icon-16.png', 'icon-48.png', 'icon-32@2x.png'];
  for (const dir of candidatesDirs) {
    for (const name of names) {
      const p = path.join(dir, name);
      try {
        if (!fs.existsSync(p)) continue;
        const ni = nativeImage.createFromPath(p);
        if (!ni.isEmpty()) return ni;
      } catch (e) {
        // ignore
      }
    }
  }
  return null;
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: currentLabels.open, click: () => { if (currentMainWindow) currentMainWindow.show(); } },
    { type: 'separator' },
    { label: currentLabels.quit, click: () => { app.quit(); } }
  ]);
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildMenu());
}

function setTrayLocale(locale) {
  currentLabels = getTrayLabels(locale);
  rebuildTrayMenu();
}

function initTray(mainWindow, opts = {}) {
  try {
    if (tray) return tray;
    currentMainWindow = mainWindow;
    const icon = loadIcon();
    if (!icon) {
      console.warn('Tray: no icon found in src/assets/tray — tray not created.');
      return null;
    }
    tray = new Tray(icon);
    const tooltip = opts.tooltip || 'AM-GUI';
    tray.setToolTip(tooltip);
    tray.setContextMenu(buildMenu());
    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) mainWindow.hide();
      else { mainWindow.show(); mainWindow.focus(); }
    });
    return tray;
  } catch (e) {
    console.warn('initTray failed:', e);
    return null;
  }
}

function destroyTray() {
  try {
    if (tray) { tray.destroy(); tray = null; }
  } catch (e) { /* ignore */ }
}

module.exports = { initTray, destroyTray, setTrayLocale };
