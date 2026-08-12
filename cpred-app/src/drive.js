// ═══════════════════════════════════════════════════════════════════
// Google Drive backing store for the character folders.
//
// Shape of the thing: the local folders stay the working copy and every read
// in the app still hits the disk. Drive is a mirror that is pushed to after a
// save and pulled from on a timer. Nothing in the GM app — and nothing the
// player app asks the host server for — ever blocks on a Google round-trip, so
// a session keeps running at LAN speed, and keeps running at all when the
// hotel Wi-Fi dies mid-firefight.
//
// Conflicts resolve by the character's own updatedAt, newest wins. That is the
// same rule main.js already applies to player uploads, so a character edited
// on a player's tablet, on the GM's laptop and on a second machine all settle
// the same way.
//
// No npm dependencies: Node's https/http/crypto do OAuth and Drive REST
// directly. Pulling in googleapis for six endpoints would add tens of
// megabytes to the installer for no reach we need.
// ═══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { shell, safeStorage } = require('electron');

const CFG = require('./drive-config');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ── module state ─────────────────────────────────────────────────────
let ctx = null;          // { userData, dirFor, onStatus, onPulled }
let tokens = null;       // { refresh_token, access_token, expiresAt }
let account = null;      // { email, name }
let folderIds = {};      // 'root' | 'pcs' | 'npcs'  ->  Drive file id
let fileIds = {};        // kind -> { charId -> Drive file id }
let pending = new Map(); // `${kind}:${id}` -> { kind, char }  awaiting push
let pushTimer = null;
let pollTimer = null;
let busy = false;
let lastSync = 0;
let lastError = null;
let authFlow = null;     // in-flight { server, timer } so a second click can cancel

function tokenFile() { return path.join(ctx.userData, 'drive-token.json'); }
function indexFile() { return path.join(ctx.userData, 'drive-index.json'); }

// ── init ─────────────────────────────────────────────────────────────
// context: { userData, dirFor(kind), onStatus(status), onPulled(n) }
function init(context) {
  ctx = context;
  loadTokens();
  loadIndex();
}

function isConfigured() { return !!(CFG.CLIENT_ID && CFG.CLIENT_ID.trim()); }
function isConnected() { return !!(tokens && tokens.refresh_token); }

function status() {
  return {
    configured: isConfigured(),
    connected: isConnected(),
    account: account || null,
    syncing: busy,
    queued: pending.size,
    lastSync,
    lastError,
    pollMs: CFG.POLL_MS
  };
}

function emit() { try { ctx && ctx.onStatus && ctx.onStatus(status()); } catch (e) { /* UI gone */ } }

// ── token persistence ────────────────────────────────────────────────
// safeStorage wraps the refresh token in OS-level encryption (DPAPI on
// Windows, Keychain on macOS) so a stray file copy is not a live Drive
// credential. Where that is unavailable we still write the file, because a
// GM who cannot reconnect every launch is worse off than one whose token sits
// in their own profile directory — but we mark it so the UI can say so.
function saveTokens() {
  try {
    const body = JSON.stringify({ tokens, account });
    let payload;
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      payload = { enc: 'safeStorage', data: safeStorage.encryptString(body).toString('base64') };
    } else {
      payload = { enc: 'plain', data: body };
    }
    fs.writeFileSync(tokenFile(), JSON.stringify(payload), { mode: 0o600 });
  } catch (e) { lastError = 'Could not save the Drive sign-in: ' + e.message; }
}

function loadTokens() {
  try {
    const raw = JSON.parse(fs.readFileSync(tokenFile(), 'utf8'));
    let body;
    if (raw.enc === 'safeStorage') {
      if (!safeStorage || !safeStorage.isEncryptionAvailable()) return;
      body = safeStorage.decryptString(Buffer.from(raw.data, 'base64'));
    } else {
      body = raw.data;
    }
    const parsed = JSON.parse(body);
    tokens = parsed.tokens || null;
    account = parsed.account || null;
  } catch (e) { tokens = null; account = null; }
}

function clearTokens() {
  tokens = null; account = null;
  try { fs.unlinkSync(tokenFile()); } catch (e) { /* never existed */ }
}

// The id map is a cache, not a source of truth — a lost or stale entry costs
// one extra listing, never a duplicate sheet, because pushes re-resolve
// through appProperties.cpredId.
function saveIndex() {
  try { fs.writeFileSync(indexFile(), JSON.stringify({ folderIds, fileIds })); }
  catch (e) { /* cache only */ }
}

function loadIndex() {
  try {
    const raw = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
    folderIds = raw.folderIds || {};
    fileIds = raw.fileIds || {};
  } catch (e) { folderIds = {}; fileIds = {}; }
}

// ── HTTP ─────────────────────────────────────────────────────────────
function httpError(code, buf) {
  let msg = '';
  try {
    const j = JSON.parse(buf.toString('utf8'));
    msg = (j.error && (j.error.message || j.error_description || j.error)) || '';
    if (typeof msg === 'object') msg = JSON.stringify(msg);
  } catch (e) { msg = buf.toString('utf8').slice(0, 200); }
  const err = new Error(`Google API ${code}${msg ? ': ' + msg : ''}`);
  err.statusCode = code;
  return err;
}

function request(method, url, opts = {}) {
  const { headers = {}, body = null, raw = false } = opts;
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(e); }
    const req = https.request(
      { method, hostname: u.hostname, path: u.pathname + u.search, headers },
      res => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (raw) return resolve(buf);
            if (!buf.length) return resolve({});
            try { resolve(JSON.parse(buf.toString('utf8'))); }
            catch (e) { reject(new Error('Unreadable response from Google')); }
          } else {
            reject(httpError(res.statusCode, buf));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Google request timed out')));
    if (body) req.write(body);
    req.end();
  });
}

function form(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
}

async function postForm(url, fields) {
  const body = form(fields);
  return request('POST', url, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    body
  });
}

// ── OAuth: PKCE + loopback ───────────────────────────────────────────
function b64url(buf) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

// Google refuses OAuth inside embedded webviews (disallowed_useragent), and it
// is the right call anyway — the GM signs in the same browser where they can
// see the address bar and their existing Google session.
function connect() {
  if (!isConfigured()) {
    return Promise.resolve({ success: false, error: 'Google Drive is not configured in this build — see DRIVE-SETUP.md.' });
  }
  if (authFlow) cancelAuth();

  return new Promise(resolve => {
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      cancelAuth();
      if (!result.success) { lastError = result.error; }
      emit();
      resolve(result);
    };

    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/oauth2callback') { res.writeHead(404); return res.end(); }

      const reply = (title, msg, ok) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="background:#0a0a14;color:#e0e0f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;max-width:420px;padding:24px">
<div style="font-size:40px;color:${ok ? '#69f0ae' : '#ff1744'}">${ok ? '◈' : '✕'}</div>
<h1 style="font-size:19px;letter-spacing:1px">${title}</h1>
<p style="color:#888;font-size:14px;line-height:1.5">${msg}</p>
</div></body>`);
      };

      // A denied consent screen comes back as ?error=access_denied — that is a
      // decision, not a failure, so it gets its own quiet message.
      if (u.searchParams.get('error')) {
        const e = u.searchParams.get('error');
        reply('Not connected', e === 'access_denied' ? 'You can close this tab and go back to the app.' : 'Google reported: ' + e, false);
        return finish({ success: false, error: e === 'access_denied' ? 'Sign-in was cancelled.' : e });
      }
      if (u.searchParams.get('state') !== state) {
        reply('Sign-in blocked', 'That response did not match the request this app started. Nothing was connected.', false);
        return finish({ success: false, error: 'OAuth state mismatch — sign-in was discarded.' });
      }
      const code = u.searchParams.get('code');
      if (!code) { reply('Sign-in failed', 'Google did not return an authorization code.', false); return finish({ success: false, error: 'no authorization code' }); }

      try {
        const port = server.address().port;
        const tok = await postForm(TOKEN_URL, {
          code,
          client_id: CFG.CLIENT_ID,
          client_secret: CFG.CLIENT_SECRET,   // omitted when blank
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: `http://127.0.0.1:${port}/oauth2callback`
        });
        if (!tok.refresh_token) throw new Error('Google did not return a refresh token. Remove this app at myaccount.google.com/permissions and connect again.');
        tokens = {
          refresh_token: tok.refresh_token,
          access_token: tok.access_token,
          expiresAt: Date.now() + (tok.expires_in || 3600) * 1000 - 60000
        };
        account = await fetchAccount();
        saveTokens();
        lastError = null;
        reply('Drive connected', `Signed in as ${account && account.email ? account.email : 'your Google account'}. You can close this tab.`, true);
        finish({ success: true, account });
        syncNow();               // first pull, in the background
      } catch (e) {
        reply('Sign-in failed', String(e.message || e), false);
        finish({ success: false, error: e.message });
      }
    });

    server.on('error', e => finish({ success: false, error: 'Could not open the sign-in listener: ' + e.message }));

    // Port 0 = the OS picks a free one. Google allows any port on a loopback
    // redirect, so nothing has to be registered in the console per machine.
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const url = AUTH_URL + '?' + form({
        client_id: CFG.CLIENT_ID,
        redirect_uri: `http://127.0.0.1:${port}/oauth2callback`,
        response_type: 'code',
        scope: CFG.SCOPE,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'consent'          // guarantees a refresh_token on re-consent
      });
      const timer = setTimeout(() => finish({ success: false, error: 'Sign-in timed out after 5 minutes.' }), 300000);
      if (timer.unref) timer.unref();
      authFlow = { server, timer };
      shell.openExternal(url).catch(e => finish({ success: false, error: 'Could not open your browser: ' + e.message }));
    });
  });
}

function cancelAuth() {
  if (!authFlow) return;
  clearTimeout(authFlow.timer);
  try { authFlow.server.close(); } catch (e) { /* already down */ }
  authFlow = null;
}

async function disconnect() {
  const rt = tokens && tokens.refresh_token;
  cancelAuth();
  stopAuto();
  pending.clear();
  clearTokens();
  folderIds = {}; fileIds = {};
  saveIndex();
  lastError = null;
  // Best effort — the local sign-in is already gone either way.
  if (rt) { try { await postForm(REVOKE_URL, { token: rt }); } catch (e) { /* revoked or offline */ } }
  emit();
  return { success: true };
}

async function accessToken() {
  if (!isConnected()) throw new Error('Google Drive is not connected.');
  if (tokens.access_token && Date.now() < tokens.expiresAt) return tokens.access_token;
  try {
    const tok = await postForm(TOKEN_URL, {
      client_id: CFG.CLIENT_ID,
      client_secret: CFG.CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token'
    });
    tokens.access_token = tok.access_token;
    tokens.expiresAt = Date.now() + (tok.expires_in || 3600) * 1000 - 60000;
    saveTokens();
    return tokens.access_token;
  } catch (e) {
    // A revoked or expired grant can never be refreshed — drop it so the UI
    // shows "connect" instead of retrying a dead token every 90 seconds.
    if (e.statusCode === 400 || e.statusCode === 401) {
      clearTokens();
      const dead = new Error('Google sign-in expired — connect Drive again.');
      dead.authFailed = true;
      throw dead;
    }
    throw e;
  }
}

async function api(method, url, opts = {}) {
  const send = async () => {
    const token = await accessToken();
    const headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
    return request(method, url, Object.assign({}, opts, { headers }));
  };
  try { return await send(); }
  catch (e) {
    // Revoking access at myaccount.google.com kills the cached access token
    // too, not just the refresh token — so the 401 lands here rather than on a
    // refresh. Drop the cached token and try once; if the re-mint also fails,
    // accessToken() clears the sign-in and says so, instead of the app
    // retrying a dead credential every 90 seconds for the next hour.
    if (e.statusCode === 401 && tokens) { tokens.access_token = ''; tokens.expiresAt = 0; return send(); }
    throw e;
  }
}

async function fetchAccount() {
  // about.get works under drive.file, so the signed-in address can be shown
  // without asking for a userinfo scope on top.
  try {
    const r = await api('GET', API + '/about?fields=user(displayName,emailAddress)');
    return { email: (r.user && r.user.emailAddress) || '', name: (r.user && r.user.displayName) || '' };
  } catch (e) { return null; }
}

// ── Drive folders ────────────────────────────────────────────────────
function q(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

async function findOrCreateFolder(name, parentId) {
  const query = `mimeType='${FOLDER_MIME}' and name='${q(name)}' and trashed=false and '${parentId}' in parents`;
  const found = await api('GET', API + '/files?' + form({ q: query, fields: 'files(id)', pageSize: 1, spaces: 'drive' }));
  if (found.files && found.files.length) return found.files[0].id;
  const body = JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] });
  const made = await api('POST', API + '/files?fields=id', {
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, body
  });
  return made.id;
}

// Verifies cached ids rather than trusting them: a folder the GM dragged to
// the bin would otherwise send every push into a file id that no longer
// resolves, and the sync would fail silently until a reinstall.
async function ensureFolders() {
  const check = async (id) => {
    if (!id) return false;
    try { const r = await api('GET', API + `/files/${id}?fields=id,trashed`); return !r.trashed; }
    // "I couldn't see it" means rebuild the folder; "you're signed out" must
    // travel, or it surfaces later as a far vaguer complaint.
    catch (e) { if (e.authFailed) throw e; return false; }
  };
  if (!(await check(folderIds.root))) {
    folderIds.root = await findOrCreateFolder(CFG.ROOT_FOLDER, 'root');
    folderIds.pcs = null; folderIds.npcs = null;
  }
  for (const kind of ['pcs', 'npcs']) {
    if (!(await check(folderIds[kind]))) folderIds[kind] = await findOrCreateFolder(kind, folderIds.root);
  }
  saveIndex();
  return folderIds;
}

// ── character files ──────────────────────────────────────────────────
function safeName(s) { return String(s || 'unnamed').replace(/[^a-zA-Z0-9_\- ]/g, '').slice(0, 60) || 'unnamed'; }
function fileNameFor(char) { return safeName(char.name) + '_' + char.id + '.json'; }

// One listing per kind gives the whole remote picture, because the id and the
// character's updatedAt both ride along in appProperties — so deciding what to
// pull costs no downloads at all, only what actually changed.
async function listRemote(kind) {
  const parent = folderIds[kind];
  const out = [];
  let pageToken = null;
  do {
    const r = await api('GET', API + '/files?' + form({
      q: `'${parent}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,modifiedTime,appProperties)',
      pageSize: 200, spaces: 'drive', pageToken
    }));
    (r.files || []).forEach(f => out.push(f));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

async function downloadChar(fileId) {
  const buf = await api('GET', API + `/files/${fileId}?alt=media`, { raw: true });
  return JSON.parse(buf.toString('utf8'));
}

async function uploadChar(kind, char, existingId) {
  const clean = { ...char };
  delete clean._kind; delete clean._file;
  const content = JSON.stringify(clean, null, 2);
  const meta = {
    name: fileNameFor(clean),
    appProperties: {
      cpredId: String(clean.id),
      cpredKind: kind,
      cpredUpdated: String(clean.updatedAt || 0)
    }
  };
  if (!existingId) meta.parents = [folderIds[kind]];

  const boundary = 'cpred' + crypto.randomBytes(12).toString('hex');
  const body = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n` +
    `--${boundary}--\r\n`, 'utf8');
  const headers = { 'Content-Type': `multipart/related; boundary=${boundary}`, 'Content-Length': body.length };

  const url = existingId
    ? `${UPLOAD}/files/${existingId}?uploadType=multipart&fields=id`
    : `${UPLOAD}/files?uploadType=multipart&fields=id`;
  const r = await api(existingId ? 'PATCH' : 'POST', url, { headers, body });
  return r.id;
}

// ── push ─────────────────────────────────────────────────────────────
// Saves land here on every keystroke-debounced write; coalescing by id means a
// character edited for a minute straight is one upload, not sixty.
function queuePush(kind, char) {
  if (!isConnected() || !char || char.id === undefined) return;
  pending.set(`${kind}:${char.id}`, { kind, char: { ...char } });
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { flush().catch(() => {}); }, 2500);
  if (pushTimer.unref) pushTimer.unref();
  emit();
}

async function flush() {
  if (busy || !pending.size || !isConnected()) return;
  busy = true; emit();
  const batch = Array.from(pending.values());
  pending.clear();
  try {
    await ensureFolders();
    for (const { kind, char } of batch) {
      try {
        fileIds[kind] = fileIds[kind] || {};
        let id = fileIds[kind][String(char.id)];
        if (!id) {
          // Never seen locally — look for it remotely before creating, or a
          // reinstalled app would fork every character into a second file.
          const remote = await listRemote(kind);
          remote.forEach(f => {
            const cid = f.appProperties && f.appProperties.cpredId;
            if (cid) { fileIds[kind][cid] = f.id; }
          });
          id = fileIds[kind][String(char.id)];
        }
        const newId = await uploadChar(kind, char, id);
        fileIds[kind][String(char.id)] = newId;
      } catch (e) {
        // A file deleted in Drive under us: forget the id and let the next
        // pass create it fresh rather than wedging the whole queue.
        if (e.statusCode === 404 && fileIds[kind]) delete fileIds[kind][String(char.id)];
        pending.set(`${kind}:${char.id}`, { kind, char });
        throw e;
      }
    }
    saveIndex();
    lastError = null;
    lastSync = Date.now();
  } catch (e) {
    lastError = e.message;
  } finally {
    busy = false; emit();
  }
}

async function remove(kind, charId) {
  if (!isConnected()) return;
  pending.delete(`${kind}:${charId}`);
  const id = fileIds[kind] && fileIds[kind][String(charId)];
  if (!id) return;
  try {
    await api('DELETE', API + `/files/${id}`);
    delete fileIds[kind][String(charId)];
    saveIndex();
  } catch (e) {
    if (e.statusCode === 404) { delete fileIds[kind][String(charId)]; saveIndex(); }
    else lastError = e.message;
  }
  emit();
}

// ── pull ─────────────────────────────────────────────────────────────
// Writes straight into the local store dir, so everything downstream — the
// GM's lists, the host server, the player app — picks the change up with no
// further plumbing.
async function pullKind(kind) {
  const dir = ctx.dirFor(kind);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const local = {};
  try {
    fs.readdirSync(dir).filter(f => /\.(json|cpred)$/i.test(f)).forEach(f => {
      try {
        const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (c && c.id !== undefined) local[String(c.id)] = { char: c, file: f };
      } catch (e) { /* unreadable sheet — leave it alone */ }
    });
  } catch (e) { /* empty store */ }

  const remote = await listRemote(kind);
  fileIds[kind] = fileIds[kind] || {};
  let pulled = 0;

  for (const f of remote) {
    const props = f.appProperties || {};
    const cid = props.cpredId;
    if (!cid) continue;                       // not one of ours
    fileIds[kind][cid] = f.id;

    const mine = local[cid];
    const remoteUpdated = Number(props.cpredUpdated || 0);
    const localUpdated = Number((mine && mine.char.updatedAt) || 0);

    // Same last-write-wins rule the player-sync endpoint uses. Equal stamps
    // mean the two sides already agree — downloading would only churn.
    if (mine && localUpdated >= remoteUpdated) continue;

    try {
      const char = await downloadChar(f.id);
      if (!char || char.id === undefined) continue;
      if (mine && Number(char.updatedAt || 0) <= localUpdated) continue;  // appProperties lied; trust the file
      delete char._kind; delete char._file;
      const name = safeName(char.name) + '_' + char.id + '.json';
      fs.writeFileSync(path.join(dir, name), JSON.stringify(char, null, 2));
      // A remote rename changes the filename; drop the old one so the store
      // keeps its one-file-per-character promise.
      if (mine && mine.file !== name) { try { fs.unlinkSync(path.join(dir, mine.file)); } catch (e) {} }
      pulled++;
    } catch (e) {
      if (e.statusCode === 404) delete fileIds[kind][cid];
      else throw e;
    }
  }
  return pulled;
}

async function syncNow() {
  if (!isConnected()) return { success: false, error: 'Google Drive is not connected.' };
  if (busy) return { success: true, busy: true };
  busy = true; emit();
  try {
    await ensureFolders();
    if (!account) { account = await fetchAccount(); if (account) saveTokens(); }
    let pulled = 0;
    for (const kind of ['pcs', 'npcs']) pulled += await pullKind(kind);
    saveIndex();
    lastError = null;
    lastSync = Date.now();
    busy = false; emit();
    if (pending.size) await flush();
    if (pulled && ctx.onPulled) { try { ctx.onPulled(pulled); } catch (e) {} }
    return { success: true, pulled };
  } catch (e) {
    lastError = e.message;
    busy = false; emit();
    return { success: false, error: e.message };
  }
}

// ── auto sync ────────────────────────────────────────────────────────
function startAuto() {
  stopAuto();
  if (!isConnected()) return;
  pollTimer = setInterval(() => { syncNow().catch(() => {}); }, CFG.POLL_MS);
  if (pollTimer.unref) pollTimer.unref();
  syncNow().catch(() => {});
}

function stopAuto() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  clearTimeout(pushTimer); pushTimer = null;
}

// Called on quit: one last drain so the final edits of a session are not lost
// to a debounce window that never elapsed.
async function flushNow() {
  clearTimeout(pushTimer); pushTimer = null;
  if (pending.size && isConnected()) { try { await flush(); } catch (e) {} }
}

module.exports = {
  init, status, isConfigured, isConnected,
  connect, disconnect, syncNow,
  queuePush, remove,
  startAuto, stopAuto, flushNow
};
