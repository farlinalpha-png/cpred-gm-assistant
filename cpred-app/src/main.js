const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let server = null;
let serverPort = 8045;

// ── Character store: folders under userData ─────────────────────────
function storeRoot() { return path.join(app.getPath('userData'), 'characters'); }
function kindDir(kind) { return path.join(storeRoot(), kind === 'npcs' ? 'npcs' : 'pcs'); }

function ensureDirs() {
  [storeRoot(), kindDir('pcs'), kindDir('npcs')].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
}

function safeName(s) { return String(s || 'unnamed').replace(/[^a-zA-Z0-9_\- ]/g, '').slice(0, 60) || 'unnamed'; }

function listDir(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') || f.endsWith('.cpred'))
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          data._file = f;
          return data;
        } catch (e) { return null; }
      }).filter(Boolean);
  } catch (e) { return []; }
}

function saveToDir(dir, char) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  char.updatedAt = Date.now();
  const file = char._file || (safeName(char.name) + '_' + (char.id || Date.now()) + '.json');
  char._file = file;
  fs.writeFileSync(path.join(dir, file), JSON.stringify(char, null, 2));
  return file;
}

// ── Window ───────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 700,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false },
    backgroundColor: '#0a0a14', title: 'CP:RED GM Assistant v3.0'
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools();
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Auto-update (checks the GitHub Releases feed configured in package.json "build.publish") ──
function initAutoUpdater() {
  if (!app.isPackaged) return; // no update feed in dev — avoids noisy errors while running `npm start`
  autoUpdater.autoDownload = true;
  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `CP:RED GM Assistant ${info.version} has been downloaded.`,
      detail: 'Restart now to install it, or it will install automatically next time you quit.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0
    }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall(); });
  });
  autoUpdater.on('error', (err) => console.error('[autoUpdater]', err));
  autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error('[autoUpdater] check failed', err));
}

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { success: false, error: 'Updates are only checked in the packaged app.' };
  try { await autoUpdater.checkForUpdatesAndNotify(); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

app.whenReady().then(() => { ensureDirs(); createWindow(); initAutoUpdater(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });

// ── IPC: store ───────────────────────────────────────────────────────
ipcMain.handle('store-list', (e, kindOrPath) => {
  const dir = (kindOrPath === 'pcs' || kindOrPath === 'npcs') ? kindDir(kindOrPath) : kindOrPath;
  return { success: true, chars: listDir(dir), dir };
});

ipcMain.handle('store-save', (e, kind, char) => {
  try { const f = saveToDir(kindDir(kind), char); return { success: true, file: f }; }
  catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('store-delete', (e, kind, file) => {
  try { fs.unlinkSync(path.join(kindDir(kind), file)); return { success: true }; }
  catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('pick-folder', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Select character folder', properties: ['openDirectory'] });
  if (!filePaths || !filePaths[0]) return { success: false };
  return { success: true, dir: filePaths[0], chars: listDir(filePaths[0]) };
});

ipcMain.handle('open-store-folder', () => { shell.openPath(storeRoot()); return { success: true }; });

// ── IPC: legacy file save/load/pdf/image (unchanged behavior) ───────
ipcMain.handle('save-character', async (event, character) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Character', defaultPath: `${character.name || 'character'}.cpred`,
    filters: [{ name: 'CP:RED Character', extensions: ['cpred'] }, { name: 'JSON', extensions: ['json'] }]
  });
  if (!filePath) return { success: false };
  try { fs.writeFileSync(filePath, JSON.stringify(character, null, 2)); return { success: true, path: filePath }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('load-character', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Load Character', filters: [{ name: 'CP:RED Character', extensions: ['cpred', 'json'] }], properties: ['openFile']
  });
  if (!filePaths || !filePaths[0]) return { success: false };
  try { return { success: true, character: JSON.parse(fs.readFileSync(filePaths[0], 'utf8')) }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('export-pdf', async (event, html) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, { title: 'Export Character Sheet', defaultPath: 'character-sheet.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (!filePath) return { success: false };
  try {
    const win = new BrowserWindow({ show: false });
    await win.loadURL('data:text/html,' + encodeURIComponent(html));
    const pdfData = await win.webContents.printToPDF({ printBackground: true });
    fs.writeFileSync(filePath, pdfData);
    win.close(); shell.openPath(filePath);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('export-json', async (event, character) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, { title: 'Export as JSON', defaultPath: `${character.name || 'character'}-export.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!filePath) return { success: false };
  try { fs.writeFileSync(filePath, JSON.stringify(character, null, 2)); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('pick-image', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Select Character Image', filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }], properties: ['openFile'] });
  if (!filePaths || !filePaths[0]) return { success: false };
  try {
    const data = fs.readFileSync(filePaths[0]);
    const ext = path.extname(filePaths[0]).slice(1).toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    return { success: true, dataUrl: `data:${mime};base64,` + data.toString('base64') };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('print', async () => { mainWindow.webContents.print({ printBackground: true }); return { success: true }; });

// ── HOST SERVER for the Player Companion App ─────────────────────────
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(obj));
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    ensureDirs();
    server = http.createServer((req, res) => {
      if (req.method === 'OPTIONS') return json(res, 200, {});
      const url = req.url.split('?')[0];

      // Serve the player app + its assets
      if (req.method === 'GET' && (url === '/' || url === '/player.html')) {
        const pwaIndex = path.join(__dirname, '..', 'android-app', 'index.html');
        const p = fs.existsSync(pwaIndex) ? pwaIndex : path.join(__dirname, '..', 'player-app', 'player.html');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(fs.readFileSync(p));
      }
      if (req.method === 'GET' && url === '/data.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        return res.end(fs.readFileSync(path.join(__dirname, '..', 'public', 'data.js')));
      }

      // Android PWA assets (tablet install)
      const pwaFiles = {
        '/index.html': ['android-app/index.html', 'text/html'],
        '/player.js': ['player-app/player.js', 'application/javascript'],
        '/manifest.webmanifest': ['android-app/manifest.webmanifest', 'application/manifest+json'],
        '/sw.js': ['android-app/sw.js', 'application/javascript'],
        '/icon-192.png': ['android-app/icon-192.png', 'image/png'],
        '/icon-512.png': ['android-app/icon-512.png', 'image/png']
      };
      if (req.method === 'GET' && pwaFiles[url]) {
        const [rel, mime] = pwaFiles[url];
        const fp = path.join(__dirname, '..', rel);
        if (fs.existsSync(fp)) {
          res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
          return res.end(fs.readFileSync(fp));
        }
      }

      // API
      if (url === '/api/ping') return json(res, 200, { ok: true, app: 'CPRED-GM', time: Date.now() });

      if (req.method === 'GET' && url === '/api/all') {
        return json(res, 200, { pcs: listDir(kindDir('pcs')), npcs: listDir(kindDir('npcs')) });
      }

      if (req.method === 'GET' && url.startsWith('/api/char/')) {
        const id = decodeURIComponent(url.split('/api/char/')[1]);
        const all = listDir(kindDir('pcs'));
        const c = all.find(x => String(x.id) === id);
        return c ? json(res, 200, c) : json(res, 404, { error: 'not found' });
      }

      if (req.method === 'POST' && url === '/api/char') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
          try {
            const char = JSON.parse(body);
            if (!char.id) char.id = String(Date.now());
            // last-write-wins by updatedAt
            const existing = listDir(kindDir('pcs')).find(x => String(x.id) === String(char.id));
            if (existing && (existing.updatedAt || 0) > (char.updatedAt || 0)) {
              return json(res, 200, { success: true, kept: 'server', char: existing });
            }
            if (existing) char._file = existing._file;
            saveToDir(kindDir('pcs'), char);
            if (mainWindow) mainWindow.webContents.send('player-sync', { id: char.id, name: char.name });
            return json(res, 200, { success: true, kept: 'client', updatedAt: char.updatedAt });
          } catch (e) { return json(res, 400, { error: e.message }); }
        });
        return;
      }
      json(res, 404, { error: 'unknown endpoint' });
    });
    server.on('error', reject);
    server.listen(port, '0.0.0.0', () => resolve(port));
  });
}

ipcMain.handle('server-start', async (e, port) => {
  try {
    if (server) { server.close(); server = null; }
    serverPort = port || 8045;
    await startServer(serverPort);
    const nets = require('os').networkInterfaces();
    const ips = [];
    Object.values(nets).flat().forEach(n => { if (n && n.family === 'IPv4' && !n.internal) ips.push(n.address); });
    return { success: true, port: serverPort, ips };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('server-stop', () => {
  if (server) { server.close(); server = null; return { success: true }; }
  return { success: true };
});

ipcMain.handle('server-status', () => ({ running: !!server, port: serverPort }));
