// Arena Rush desktop shell (Electron). The game is served from an internal app:// origin
// so ES modules, model files and connections to online servers behave like on the web.
const { app, BrowserWindow, protocol, net, Menu, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const ROOT = path.join(__dirname, 'app');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 760, minWidth: 960, minHeight: 600,
    backgroundColor: '#0b0c1a', title: 'Arena Rush', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, devTools: !app.isPackaged },
  });
  Menu.setApplicationMenu(null);
  win.loadURL('app://game/index.html');
  // F11 toggles fullscreen; links to other sites open in the normal browser
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
