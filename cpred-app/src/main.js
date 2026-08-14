const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');
const drive = require('./drive');

let mainWindow;
let server = null;
let serverPort = 8045;

// ── Storage settings ─────────────────────────────────────────────────
// Three places the character folders can live:
//   local  — this PC only, under userData (the original behaviour)
//   folder — any folder the GM picks; point it at Google Drive for Desktop,
//            Dropbox or a network share and that client does the syncing
//   drive  — Google Drive over its API, with userData as the working mirror
//
// Only the directory changes. Every reader below — the GM's own lists and the
// host server the player app talks to — keeps hitting the local disk, so
// nothing about hosting a session gets slower or needs a network.
const DEFAULT_SETTINGS = { storage: { mode: 'local', folderPath: '' } };
let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

function settingsFile() { return path.join(app.getPath('userData'), 'settings.json'); }

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = { ...DEFAULT_SETTINGS, ...raw, storage: { ...DEFAULT_SETTINGS.storage, ...(raw.storage || {}) } };
  } catch (e) { settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }
  // A custom folder that has gone away (unplugged drive, uninstalled Drive for
  // Desktop) must not silently become "no characters" — fall back to local and
  // say so rather than writing sheets into a path that isn't there.
  if (settings.storage.mode === 'folder' && !dirUsable(settings.storage.folderPath)) {
    settings.storage.mode = 'local';
    settings.storage.folderUnavailable = true;
  }
  return settings;
}

function saveSettings() {
  try {
    const out = { ...settings, storage: { ...settings.storage } };
    delete out.storage.folderUnavailable;   // derived each launch, never stored
    fs.writeFileSync(settingsFile(), JSON.stringify(out, null, 2));
    return true;
  } catch (e) { return false; }
}

function dirUsable(p) {
  if (!p) return false;
  try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
}

function storageMode() { return settings.storage.mode || 'local'; }
function driveMode() { return storageMode() === 'drive'; }

// ── Character store: folders under userData ─────────────────────────
function storeRoot() {
  const s = settings.storage;
  if (s.mode === 'folder' && dirUsable(s.folderPath)) return s.folderPath;
  return path.join(app.getPath('userData'), 'characters');
}
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

// Every file in `dir` that holds this character id. More than one means an
// older build wrote a second copy (renaming a character used to mint a new
// filename); saveToDir collapses them back down to one.
function filesForId(dir, id) {
  if (id === undefined || id === null || id === '') return [];
  const want = String(id);
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') || f.endsWith('.cpred'))
      .filter(f => {
        try { return String(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).id) === want; }
        catch (e) { return false; }
      });
  } catch (e) { return []; }
}

// One file per character, keyed by id. The filename tracks the character's
// current name, and any other file carrying the same id is removed, so
// renaming or re-saving never leaves a duplicate sheet behind.
function saveToDir(dir, char) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!char.id) char.id = String(Date.now());
  char.updatedAt = Date.now();
  const file = safeName(char.name) + '_' + char.id + '.json';
  const out = { ...char };
  delete out._kind; delete out._file;   // runtime-only routing fields
  fs.writeFileSync(path.join(dir, file), JSON.stringify(out, null, 2));
  filesForId(dir, char.id).forEach(f => {
    if (f === file) return;
    try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* already gone */ }
  });
  char._file = file;
  return file;
}

// Like saveToDir, but keeps the character's existing updatedAt instead of
// stamping "now". Moving a sheet between folders is not an edit to it — if a
// copy claimed to be fresh, the next Drive sync would let it beat a genuinely
// newer version saved somewhere else.
function copyToDir(dir, char) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const out = { ...char };
  delete out._kind; delete out._file;
  if (!out.id) out.id = String(Date.now());
  if (!out.updatedAt) out.updatedAt = Date.now();
  const file = safeName(out.name) + '_' + out.id + '.json';
  fs.writeFileSync(path.join(dir, file), JSON.stringify(out, null, 2));
  filesForId(dir, out.id).forEach(f => {
    if (f === file) return;
    try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* already gone */ }
  });
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

// Load the presentation/cast controller into the GM window. Done from here so
// index.html stays untouched; the module wires its own button into the 3D Maps
// panel and no-ops if it is ever loaded twice.
app.on('browser-window-created', (e, win) => {
  win.webContents.on('did-finish-load', () => {
    try {
      if (!/index\.html($|[?#])/i.test(win.webContents.getURL() || '')) return;
      // Absolute URL from the document itself, plus a <script type=module>
      // fallback, so the loader does not depend on import() base-URL subtleties.
      win.webContents.executeJavaScript(`(() => {
        const u = new URL('map3d/cast.js', location.href).href;
        import(u).catch(err => {
          console.error('[cast] dynamic import failed, falling back to a script tag', err);
          const s = document.createElement('script');
          s.type = 'module'; s.src = u;
          s.onerror = e => console.error('[cast] could not load', u, e);
          document.body.appendChild(s);
        });
      })();`).catch(() => {});
    } catch (err) { /* never let this break window startup */ }
  });
});

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

// Report the real installed version (falls back to package.json when running unpackaged)
ipcMain.handle('app-version', () => {
  try { return app.getVersion(); }
  catch { return require('../package.json').version; }
});

// Force an update check. electron-updater sets downloadPromise when it finds a
// newer release and (autoDownload) begins pulling it; 'update-downloaded' then
// fires the restart prompt. Returns a clear result so the button can report back.
ipcMain.handle('check-for-updates', async () => {
  const current = app.getVersion();
  if (!app.isPackaged) return { success: false, error: 'Updates only work in the installed app — the RUN-APP / dev build has no update feed.', current };
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r && r.updateInfo ? r.updateInfo.version : current;
    const updateAvailable = !!(r && r.downloadPromise);
    return { success: true, current, latest, updateAvailable };
  } catch (e) {
    return { success: false, error: e.message, current };
  }
});

// ── Drive wiring ─────────────────────────────────────────────────────
function initDrive() {
  drive.init({
    userData: app.getPath('userData'),
    dirFor: kindDir,
    onStatus: (s) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('drive-status', s); },
    // A pull rewrote sheets underneath the UI — tell the renderer to re-read
    // rather than leaving the GM looking at a stale roster mid-session.
    onPulled: (n) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('store-changed', { source: 'drive', count: n }); }
  });
  if (driveMode()) drive.startAuto();
}

app.whenReady().then(() => { loadSettings(); ensureDirs(); initDrive(); createWindow(); initAutoUpdater(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });

// Give queued Drive uploads a chance to land before the process goes away, so
// the last edits of a session are not lost to an un-elapsed debounce.
let quitting = false;
app.on('before-quit', (e) => {
  if (quitting || !driveMode() || !drive.isConnected()) return;
  e.preventDefault();
  quitting = true;
  const bail = setTimeout(() => app.quit(), 4000);   // never hang the quit
  drive.flushNow().finally(() => { clearTimeout(bail); app.quit(); });
});

// ── IPC: store ───────────────────────────────────────────────────────
ipcMain.handle('store-list', (e, kindOrPath) => {
  const dir = (kindOrPath === 'pcs' || kindOrPath === 'npcs') ? kindDir(kindOrPath) : kindOrPath;
  return { success: true, chars: listDir(dir), dir };
});

ipcMain.handle('store-save', (e, kind, char) => {
  try {
    const f = saveToDir(kindDir(kind), char);
    // Local write already succeeded; the upload is fire-and-forget so a slow
    // or absent network never stalls a save.
    if (driveMode()) drive.queuePush(kind === 'npcs' ? 'npcs' : 'pcs', char);
    return { success: true, file: f };
  }
  catch (err) { return { success: false, error: err.message }; }
});

// Accepts a filename or a character id. Passing the id also sweeps up any
// stale copies left by older builds, so a delete really does delete.
ipcMain.handle('store-delete', (e, kind, fileOrId) => {
  const dir = kindDir(kind);
  try {
    const targets = new Set(filesForId(dir, fileOrId));
    // Only ever a bare filename inside the store — never a path
    if (typeof fileOrId === 'string' && /\.(json|cpred)$/i.test(fileOrId) && fileOrId === path.basename(fileOrId)) targets.add(fileOrId);
    if (!targets.size) return { success: false, error: 'character not found' };
    // Read the ids out before the files go, so the matching Drive copies can
    // be removed too — otherwise the next pull would resurrect the character.
    const ids = new Set();
    if (driveMode()) {
      targets.forEach(f => {
        try { const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (c && c.id !== undefined) ids.add(String(c.id)); }
        catch (err) { /* unreadable — nothing to match remotely */ }
      });
    }
    targets.forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (err) { /* already gone */ } });
    ids.forEach(id => { drive.remove(kind === 'npcs' ? 'npcs' : 'pcs', id).catch(() => {}); });
    return { success: true, removed: targets.size };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('pick-folder', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Select character folder', properties: ['openDirectory'] });
  if (!filePaths || !filePaths[0]) return { success: false };
  return { success: true, dir: filePaths[0], chars: listDir(filePaths[0]) };
});

// Save one character's sheet as a portable JSON into a folder the GM chooses.
// Strips runtime-only fields so the saved copy isn't tied back to the store.
ipcMain.handle('save-char-to-folder', async (e, character) => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a folder to save this character sheet', properties: ['openDirectory', 'createDirectory']
  });
  if (!filePaths || !filePaths[0]) return { success: false };
  try {
    const clean = { ...character };
    delete clean._kind; delete clean._file;
    clean.savedAt = Date.now();
    const file = safeName(clean.name) + '_' + (clean.id || Date.now()) + '.json';
    fs.writeFileSync(path.join(filePaths[0], file), JSON.stringify(clean, null, 2));
    return { success: true, dir: filePaths[0], file };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('open-store-folder', () => { shell.openPath(storeRoot()); return { success: true }; });

// ── IPC: storage location & Google Drive ─────────────────────────────
function storageInfo() {
  return {
    mode: storageMode(),
    folderPath: settings.storage.folderPath || '',
    folderUnavailable: !!settings.storage.folderUnavailable,
    root: storeRoot(),
    counts: { pcs: listDir(kindDir('pcs')).length, npcs: listDir(kindDir('npcs')).length },
    drive: drive.status()
  };
}

ipcMain.handle('storage-get', () => storageInfo());

ipcMain.handle('storage-set', async (e, next) => {
  const mode = ['local', 'folder', 'drive'].includes(next && next.mode) ? next.mode : 'local';
  if (mode === 'folder' && !dirUsable(next.folderPath)) {
    return { success: false, error: 'That folder could not be found.', info: storageInfo() };
  }
  if (mode === 'drive' && !drive.isConfigured()) {
    return { success: false, error: 'This build has no Google client ID — see DRIVE-SETUP.md.', info: storageInfo() };
  }
  settings.storage.mode = mode;
  if (mode === 'folder') settings.storage.folderPath = next.folderPath;
  delete settings.storage.folderUnavailable;
  saveSettings();
  ensureDirs();
  if (mode === 'drive') drive.startAuto(); else drive.stopAuto();
  return { success: true, info: storageInfo() };
});

// Separate from pick-folder: that one loads characters for a one-off session,
// this one repoints the store itself.
ipcMain.handle('pick-store-folder', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose the folder to keep characters in',
    properties: ['openDirectory', 'createDirectory']
  });
  if (!filePaths || !filePaths[0]) return { success: false };
  return { success: true, dir: filePaths[0] };
});

// Copies the characters that are here now into whatever folder is about to
// become the store, so switching locations doesn't look like losing everyone.
ipcMain.handle('storage-migrate', (e, targetDir) => {
  try {
    if (!dirUsable(targetDir)) return { success: false, error: 'That folder could not be found.' };
    let copied = 0;
    ['pcs', 'npcs'].forEach(kind => {
      const dest = path.join(targetDir, kind);
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      listDir(kindDir(kind)).forEach(c => {
        // Skip a character already there and not older, so re-running this
        // after a session can't roll newer sheets backwards.
        const existing = listDir(dest).find(x => String(x.id) === String(c.id));
        if (existing && (existing.updatedAt || 0) >= (c.updatedAt || 0)) return;
        copyToDir(dest, c);
        copied++;
      });
    });
    return { success: true, copied };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('drive-status', () => drive.status());
ipcMain.handle('drive-connect', async () => {
  const r = await drive.connect();
  if (r.success) { settings.storage.mode = 'drive'; saveSettings(); ensureDirs(); drive.startAuto(); }
  return { ...r, info: storageInfo() };
});
ipcMain.handle('drive-disconnect', async () => {
  await drive.disconnect();
  if (driveMode()) { settings.storage.mode = 'local'; saveSettings(); }
  return { success: true, info: storageInfo() };
});
ipcMain.handle('drive-sync', async () => {
  const r = await drive.syncNow();
  return { ...r, info: storageInfo() };
});

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

ipcMain.handle('export-pdf', async (event, html, suggestedName) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, { title: 'Export Character Sheet', defaultPath: suggestedName || 'character-sheet.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (!filePath) return { success: false };
  let tmp = null, win = null;
  try {
    // A data: URL truncates on long documents (a portrait alone is a megabyte of
    // base64), so the sheet goes through a real file instead.
    tmp = path.join(app.getPath('temp'), `cpred-sheet-${Date.now()}.html`);
    fs.writeFileSync(tmp, html, 'utf8');
    win = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
    await win.loadFile(tmp);
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      // The sheet declares `@page{size:11in 8.5in}` to match the official
      // landscape RTG sheet — honour it instead of imposing portrait Letter.
      preferCSSPageSize: true,
      landscape: true,
      pageSize: 'Letter',
      margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 }
    });
    fs.writeFileSync(filePath, pdfData);
    shell.openPath(filePath);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
  finally {
    if (win && !win.isDestroyed()) win.close();
    if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
  }
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

// ── PRESENTATION / CAST (additive) ───────────────────────────────────
// The GM pushes a small state object; TVs/tablets on the LAN open
// /display.html and follow it over SSE (with a plain-poll fallback).
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const PRESENT_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream'
};

// Only these paths are exposed to the LAN — the GM app itself stays private.
const PRESENT_FILES = new Set(['/display.html', '/mapdata.js']);
const PRESENT_DIRS = ['/map3d/', '/vendor/'];

function servePresentStatic(res, rawUrl) {
  let rel;
  try { rel = decodeURIComponent(rawUrl); } catch (e) { return false; }
  if (rel.indexOf('\0') !== -1) return false;
  // Resolve first, THEN check the whitelist: "/map3d/../app.js" must not pass
  // as a /map3d/ path and then quietly hand out the GM app.
  const target = path.resolve(PUBLIC_DIR, '.' + rel);
  if (!target.startsWith(PUBLIC_DIR + path.sep)) return false;
  const norm = '/' + path.relative(PUBLIC_DIR, target).split(path.sep).join('/');
  if (!PRESENT_FILES.has(norm) && !PRESENT_DIRS.some(d => norm.startsWith(d))) return false;
  try { if (!fs.statSync(target).isFile()) return false; } catch (e) { return false; }
  res.writeHead(200, {
    'Content-Type': PRESENT_MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(fs.readFileSync(target));
  return true;
}

function blankPresentState() {
  return {
    seq: 0, ts: Date.now(), live: false,
    show: 'standby',            // standby | city | encounter
    theme: 'street',
    title: 'NIGHT CITY', subtitle: '', caption: '',
    district: null, location: null,
    camera: null,               // { p:[x,y,z], t:[x,y,z] }
    camLock: true,
    spotlight: { on: false, x: 0, z: 0, label: '' },
    tokens: [], notes: [],
    reload: 0,                  // bumped by the GM to remote-refresh every display
    presenter: true             // GM-only info stripped before it leaves the app
  };
}

let presentState = blankPresentState();
const presentClients = new Set();

function presentPush() {
  const payload = 'data: ' + JSON.stringify(presentState) + '\n\n';
  for (const c of Array.from(presentClients)) {
    try { c.write(payload); } catch (e) { presentClients.delete(c); }
  }
}

function presentSet(patch) {
  if (patch && patch.reset) presentState = blankPresentState();
  else presentState = Object.assign({}, presentState, patch || {});
  presentState.seq = (presentState.seq || 0) + 1;
  presentState.ts = Date.now();
  presentPush();
  return presentState;
}

// Keep-alive so idle Wi-Fi links and the display's watchdog both stay happy.
// A named event (not a comment) so the display's watchdog can actually see it.
const presentHeartbeat = setInterval(() => {
  for (const c of Array.from(presentClients)) {
    try { c.write('event: hb\ndata: ' + Date.now() + '\n\n'); } catch (e) { presentClients.delete(c); }
  }
}, 5000);
if (presentHeartbeat.unref) presentHeartbeat.unref();

function lanAddresses() {
  const nets = require('os').networkInterfaces();
  const ips = [];
  Object.values(nets).flat().forEach(n => { if (n && n.family === 'IPv4' && !n.internal) ips.push(n.address); });
  return ips;
}

// Returns true when it has handled the request.
function handlePresentRoutes(req, res, url) {
  if (req.method === 'GET' && url === '/api/present') {
    return json(res, 200, presentState), true;
  }
  if (req.method === 'GET' && url === '/api/present/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 2000\n\n');
    res.write('data: ' + JSON.stringify(presentState) + '\n\n');
    presentClients.add(res);
    const drop = () => { presentClients.delete(res); clearTimeout(recycle); };
    // Bounded lifetime: the display's EventSource reconnects on its own, and a
    // recycled stream means a stopped/restarted server never leaves sockets behind.
    const recycle = setTimeout(() => { presentClients.delete(res); try { res.end(); } catch (e) {} }, 55000);
    if (recycle.unref) recycle.unref();
    req.on('close', drop); req.on('error', drop); res.on('error', drop);
    return true;
  }
  if (req.method === 'POST' && url === '/api/present') {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { json(res, 200, presentSet(JSON.parse(body || '{}'))); }
      catch (e) { json(res, 400, { error: e.message }); }
    });
    return true;
  }
  if (req.method === 'GET' && servePresentStatic(res, url)) return true;
  return false;
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
            saveToDir(kindDir('pcs'), char);
            // A player's edit is a save like any other — push it on to Drive so
            // the sheet they changed at the table is the one waiting next week.
            if (driveMode()) drive.queuePush('pcs', char);
            if (mainWindow) mainWindow.webContents.send('player-sync', { id: char.id, name: char.name });
            return json(res, 200, { success: true, kept: 'client', updatedAt: char.updatedAt });
          } catch (e) { return json(res, 400, { error: e.message }); }
        });
        return;
      }

      // Presentation / cast view (display.html + its modules + state feed)
      if (handlePresentRoutes(req, res, url)) return;

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

// ── IPC: presentation / cast (additive) ──────────────────────────────
ipcMain.handle('present-info', () => {
  const ips = lanAddresses();
  const host = ips[0] || 'localhost';
  return {
    running: !!server, port: serverPort, ips,
    url: `http://${host}:${serverPort}/display.html`,
    urls: ips.map(ip => `http://${ip}:${serverPort}/display.html`),
    viewers: presentClients.size,
    seq: presentState.seq, live: !!presentState.live
  };
});

ipcMain.handle('present-set', (e, patch) => {
  const s = presentSet(patch);
  return { success: true, seq: s.seq, viewers: presentClients.size };
});

ipcMain.handle('present-get', () => presentState);

// Ends every open display stream. Called before the HTTP server is restarted so
// no keep-alive socket outlives it; displays reconnect by themselves.
ipcMain.handle('present-detach', () => {
  const n = presentClients.size;
  for (const c of Array.from(presentClients)) { try { c.end(); } catch (err) {} }
  presentClients.clear();
  return { success: true, closed: n };
});

ipcMain.handle('open-external', async (e, url) => {
  try {
    if (!/^https?:\/\//i.test(String(url || ''))) return { success: false, error: 'only http(s) urls' };
    await shell.openExternal(url);
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});
