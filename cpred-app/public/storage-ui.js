// ═══════════════════════════════════════════════════════════════════
// STORAGE — where characters and NPCs live.
//
// Loaded after app.js, so ipc / callIPC / notify are already on window. Kept
// out of app.js because that file is long enough, and this panel is entirely
// self-contained: one button, one dialog, no state anyone else reads.
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__cpredStorageUI) return;   // survives a double include
  window.__cpredStorageUI = true;

  let info = null;
  let chosenFolder = '';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function ago(ts) {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    return Math.round(s / 3600) + 'h ago';
  }

  // ── dialog shell ───────────────────────────────────────────────────
  function ensureModal() {
    let el = document.getElementById('storage-modal');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'storage-modal';
    el.style.cssText = 'position:fixed;inset:0;z-index:9000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);backdrop-filter:blur(3px)';
    el.innerHTML = `<div id="storage-modal-box" style="background:var(--surface);border:1px solid rgba(0,229,255,0.35);box-shadow:0 0 40px rgba(0,229,255,0.12);width:min(620px,92vw);max-height:88vh;overflow:auto;padding:22px 24px"></div>`;
    // Click-away closes, but only on the backdrop itself.
    el.addEventListener('click', e => { if (e.target === el) closeStorage(); });
    document.body.appendChild(el);
    return el;
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const el = document.getElementById('storage-modal');
      if (el && el.style.display === 'flex') closeStorage();
    }
  });

  function closeStorage() {
    const el = document.getElementById('storage-modal');
    if (el) el.style.display = 'none';
  }

  async function openStorage() {
    const el = ensureModal();
    el.style.display = 'flex';
    if (!ipc) { render(null); return; }
    info = await callIPC('storage-get');
    chosenFolder = (info && info.folderPath) || '';
    render(info);
  }

  // ── rendering ──────────────────────────────────────────────────────
  function optionRow(id, mode, title, body, extra) {
    const on = info && info.mode === mode;
    return `
      <label for="${id}" style="display:block;border:1px solid ${on ? 'var(--neon)' : 'rgba(255,255,255,0.09)'};background:${on ? 'rgba(0,229,255,0.06)' : 'transparent'};padding:12px 14px;margin-bottom:10px;cursor:pointer">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <input type="radio" id="${id}" name="storage-mode" value="${mode}" ${on ? 'checked' : ''} style="margin-top:3px;accent-color:var(--neon)">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;letter-spacing:0.5px;color:${on ? 'var(--neon)' : 'var(--text)'}">${title}</div>
            <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);line-height:1.55;margin-top:3px">${body}</div>
            ${extra || ''}
          </div>
        </div>
      </label>`;
  }

  function driveBlock() {
    const d = (info && info.drive) || {};
    if (!d.configured) {
      return `<div style="margin-top:10px;padding:9px 11px;border-left:2px solid var(--gold);background:rgba(255,214,0,0.06);font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--gold);line-height:1.55">
        Not configured in this build — no Google client ID was compiled in. See <b>DRIVE-SETUP.md</b> in the app folder.</div>`;
    }
    if (!d.connected) {
      return `<div style="margin-top:10px">
        <button class="btn btn-primary btn-sm" onclick="event.preventDefault();event.stopPropagation();storageDriveConnect()">Connect Google Drive</button>
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);margin-top:6px">Opens your browser to sign in. This app can only ever see the files it creates itself.</div>
      </div>`;
    }
    const who = d.account && d.account.email ? d.account.email : 'your Google account';
    const state = d.syncing ? '<span style="color:var(--gold)">syncing…</span>'
      : d.lastError ? `<span style="color:var(--red)">${esc(d.lastError)}</span>`
        : `<span style="color:var(--green)">● in sync</span> · last ${ago(d.lastSync)}`;
    return `<div style="margin-top:10px">
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text)">Signed in as <span style="color:var(--neon)">${esc(who)}</span></div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;margin:4px 0 8px">${state}${d.queued ? ` · ${d.queued} waiting to upload` : ''}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="event.preventDefault();event.stopPropagation();storageDriveSync()">↻ Sync now</button>
        <button class="btn btn-ghost btn-sm" onclick="event.preventDefault();event.stopPropagation();storageDriveDisconnect()">Sign out</button>
      </div>
    </div>`;
  }

  function folderBlock() {
    return `<div style="margin-top:10px">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="event.preventDefault();event.stopPropagation();storagePickFolder()">Browse…</button>
        <span style="font-family:'Share Tech Mono',monospace;font-size:10px;color:${chosenFolder ? 'var(--gold)' : 'var(--dim)'};word-break:break-all">${chosenFolder ? esc(chosenFolder) : 'no folder chosen'}</span>
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);margin-top:6px">Typically <b>G:\\My Drive\\…</b> with Google Drive for Desktop installed. Dropbox, OneDrive or a NAS share work the same way.</div>
    </div>`;
  }

  function render(i) {
    const box = document.getElementById('storage-modal-box');
    if (!i) {
      box.innerHTML = `<div style="font-size:17px;letter-spacing:1px;color:var(--neon);margin-bottom:10px">◈ STORAGE</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--muted);line-height:1.6">Storage settings need the desktop app — this is the browser preview.</div>
        <div style="margin-top:16px;text-align:right"><button class="btn btn-ghost btn-sm" onclick="storageClose()">Close</button></div>`;
      return;
    }
    const d = i.drive || {};
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
        <div style="font-size:17px;letter-spacing:1px;color:var(--neon)">◈ STORAGE</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim)">${i.counts.pcs} PC · ${i.counts.npcs} NPC</div>
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);margin-bottom:16px;line-height:1.6">
        Where character and NPC sheets are kept. Players always connect to <b>this</b> app when you host — they never need a Google account, and hosting keeps working with no internet.
      </div>

      ${i.folderUnavailable ? `<div style="padding:9px 11px;border-left:2px solid var(--red);background:rgba(255,23,68,0.07);font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--red);line-height:1.55;margin-bottom:12px">
        The custom folder set last time wasn't there at startup, so storage fell back to this PC. Nothing was deleted — reconnect the drive and pick it again.</div>` : ''}

      ${optionRow('sm-local', 'local', 'This PC only', 'Characters live in this app\'s own folder. No network, no accounts, nothing to set up.')}
      ${optionRow('sm-folder', 'folder', 'A folder I choose', 'Point it at a Google Drive for Desktop folder and Drive\'s own client syncs it. Works offline; conflicts are resolved by Drive, not by this app.', folderBlock())}
      ${optionRow('sm-drive', 'drive', 'Google Drive' + (d.connected ? '' : ' (sign in)'), 'This app talks to Drive directly — nothing extra to install, works from any machine you sign in on. Sheets are saved here first and uploaded in the background, so a save is never waiting on the network.', driveBlock())}

      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.08)">
        <button class="btn btn-ghost btn-sm" onclick="if(ipc)callIPC('open-store-folder')">Open current folder</button>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="storageClose()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="storageApply()">Apply</button>
        </div>
      </div>`;
  }

  // Re-render in place while the dialog is open, so a background sync shows its
  // progress without the GM poking anything.
  function refreshIfOpen() {
    const el = document.getElementById('storage-modal');
    if (!el || el.style.display !== 'flex' || !ipc) return;
    callIPC('storage-get').then(i => { info = i; render(i); });
  }

  // ── actions ────────────────────────────────────────────────────────
  async function storageApply() {
    const sel = document.querySelector('input[name="storage-mode"]:checked');
    const mode = sel ? sel.value : 'local';
    if (mode === 'folder' && !chosenFolder) { notify('Choose a folder first', 'error'); return; }
    if (mode === 'drive' && !(info.drive && info.drive.connected)) { notify('Connect Google Drive first', 'error'); return; }

    // Moving to a fresh folder with characters already here: offer to bring
    // them along rather than leaving the GM staring at an empty roster.
    if (mode === 'folder' && chosenFolder !== info.folderPath && (info.counts.pcs || info.counts.npcs)) {
      const total = info.counts.pcs + info.counts.npcs;
      if (confirm(`Copy the ${total} character(s) already here into that folder?\n\nOK = copy them across.\nCancel = switch without copying (nothing is deleted either way).`)) {
        const m = await callIPC('storage-migrate', chosenFolder);
        if (m.success) notify(`Copied ${m.copied} character(s)`, 'success');
        else notify('Copy failed: ' + m.error, 'error');
      }
    }

    const r = await callIPC('storage-set', { mode, folderPath: chosenFolder });
    if (!r.success) { notify(r.error || 'Could not change storage', 'error'); return; }
    info = r.info;
    notify(mode === 'drive' ? 'Characters now sync with Google Drive' : mode === 'folder' ? 'Characters now live in ' + chosenFolder : 'Characters now live on this PC only', 'success');
    closeStorage();
    if (typeof renderSessionTracker === 'function') renderSessionTracker();
  }

  async function storagePickFolder() {
    const r = await callIPC('pick-store-folder');
    if (r.success) {
      chosenFolder = r.dir;
      const radio = document.getElementById('sm-folder');
      if (radio) radio.checked = true;
      if (info) info.mode = 'folder';
      render(info);
    }
  }

  async function storageDriveConnect() {
    notify('Opening your browser to sign in…', '');
    const r = await callIPC('drive-connect');
    if (r.success) {
      info = r.info;
      render(info);
      notify('Google Drive connected', 'success');
    } else {
      notify(r.error || 'Could not connect', 'error');
      refreshIfOpen();
    }
  }

  async function storageDriveDisconnect() {
    if (!confirm('Sign out of Google Drive?\n\nCharacters already on this PC stay exactly where they are, and the copies in your Drive are left untouched.')) return;
    const r = await callIPC('drive-disconnect');
    info = r.info;
    render(info);
    notify('Signed out of Google Drive', '');
  }

  async function storageDriveSync() {
    const r = await callIPC('drive-sync');
    info = r.info;
    render(info);
    if (r.success) notify(r.pulled ? `Synced — ${r.pulled} character(s) updated from Drive` : 'Synced — everything up to date', 'success');
    else notify('Sync failed: ' + r.error, 'error');
    if (r.pulled && typeof renderSessionTracker === 'function') renderSessionTracker();
  }

  // ── main-process events ────────────────────────────────────────────
  if (ipc) {
    ipc.on('drive-status', () => refreshIfOpen());
    // A pull rewrote sheets on disk — repaint whatever is showing them.
    ipc.on('store-changed', (e, d) => {
      if (d && d.count) notify(`${d.count} character(s) updated from Google Drive`, 'success');
      if (typeof renderSessionTracker === 'function' &&
          document.getElementById('enc-session-wrap')?.style.display === 'block') renderSessionTracker();
      refreshIfOpen();
    });
  }

  // Exposed for the inline onclick handlers above.
  window.openStorage = openStorage;
  window.storageClose = closeStorage;
  window.storageApply = storageApply;
  window.storagePickFolder = storagePickFolder;
  window.storageDriveConnect = storageDriveConnect;
  window.storageDriveDisconnect = storageDriveDisconnect;
  window.storageDriveSync = storageDriveSync;
})();
