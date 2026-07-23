const { BrowserWindow } = require('electron');

function registerWindowHandlers(ipcMain) {
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
}

module.exports = { registerWindowHandlers };
