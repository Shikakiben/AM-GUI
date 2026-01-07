// Gestion de l'icône de notification (tray) pour AM-GUI
// Exporte initTray(mainWindow) et destroyTray().
const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;

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

function initTray(mainWindow, opts = {}) {
  try {
    if (tray) return tray;
    const icon = loadIcon();
    if (!icon) {
      console.warn('Tray: aucune icône trouvée dans src/assets/tray — tray non créé.');
      return null;
    }
    tray = new Tray(icon);
    const tooltip = opts.tooltip || 'AM-GUI';
    tray.setToolTip(tooltip);

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Ouvrir AM-GUI', click: () => { if (mainWindow) mainWindow.show(); } },
      { type: 'separator' },
      { label: 'Quitter', click: () => { app.quit(); } }
    ]);
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) mainWindow.hide();
      else { mainWindow.show(); mainWindow.focus(); }
    });

    return tray;
  } catch (e) {
    console.warn('Échec initTray:', e);
    return null;
  }
}

function destroyTray() {
  try {
    if (tray) { tray.destroy(); tray = null; }
  } catch (e) { /* ignore */ }
}

module.exports = { initTray, destroyTray };
