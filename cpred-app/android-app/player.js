// CP:RED Player Companion — player.js
let chars = JSON.parse(localStorage.getItem('cpp_chars') || '[]');
let cur = null;
let gmAddr = localStorage.getItem('cpp_gm') || '';
let connected = false;
let eqTab = 'weapons';
let syncTimer = null;

const EQ_TABS = [
  ['weapons', 'Weapons'], ['armorList', 'Armor'], ['cyberware', 'Cyberware'],
  ['gear', 'Gear'], ['netPrograms', 'Netrunning'], ['vehicles', 'Vehicles']
];

// Field schemas for custom items per equipment type
const CUSTOM_FIELDS = {
  weapons: [['name','Name'],['damage','Damage (e.g. 3d6)'],['rof','ROF'],['mag','Magazine'],['cost','Cost (eb)'],['features','Features/Notes']],
  armorList: [['name','Name'],['sp','SP'],['penalty','Penalty'],['cost','Cost (eb)'],['notes','Notes']],
  cyberware: [['name','Name'],['hl','Humanity Loss (e.g. 7 (2d6))'],['install','Install (Mall/Clinic/Hospital)'],['cost','Cost (eb)'],['description','Effect']],
  gear: [['name','Name'],['cost','Cost (eb)'],['description','Description']],
  netPrograms: [['name','Name'],['damage','Damage/Effect'],['cost','Cost (eb)'],['description','Description']],
  vehicles: [['name','Name'],['sdp','SDP'],['sp','SP'],['seats','Seats'],['cost','Cost (eb)'],['description','Notes']]
};

function notify(msg, err) {
  const n = document.createElement('div');
  n.className = 'notif' + (err ? ' err' : '');
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2500);
}

function blank() {
  return { id: String(Date.now()), name: 'New Edgerunner', handle: '', role: 'Solo',
    stats: { INT:5, REF:5, DEX:5, TECH:5, COOL:5, WILL:5, LUCK:5, MOVE:5, BODY:5, EMP:5 },
    skills: {}, eddies: 500, hp: 40, maxHp: 40, wounds: 0, notes: '',
    weapons: [], armorList: [], armor: { head:'', headSP:0, body:'', bodySP:0, shield:'', shieldSP:0 },
    cyberware: [], gear: [], netPrograms: [], vehicles: [], updatedAt: Date.now() };
}

function save() {
  if (cur) { cur.updatedAt = Date.now(); }
  localStorage.setItem('cpp_chars', JSON.stringify(chars));
  if (connected && cur) pushChar(cur);
}

function go(s, el) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.section').forEach(x => x.classList.remove('active'));
  document.getElementById('s-' + s).classList.add('active');
  if (s === 'equip') renderEquip();
}

// ── Character management ─────────────────────────────────────────────
function renderCharList() {
  const el = document.getElementById('char-list');
  el.innerHTML = chars.length ? chars.map((c, i) => `
    <div class="gear-item" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="openChar(${i})">
      <div><div class="gear-name">${c.name || 'Unnamed'} ${cur && cur.id === c.id ? '◀' : ''}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted)">"${c.handle||''}" · ${c.role} · €$${(c.eddies||0).toLocaleString()}</div></div>
      <span class="badge badge-neon">${c.role}</span>
    </div>`).join('') :
    '<div style="font-family:Share Tech Mono,monospace;font-size:10px;color:var(--dim)">No characters yet — create or import one</div>';
}

function newChar() { cur = blank(); chars.push(cur); save(); renderCharList(); fillEditor(); }
function openChar(i) { cur = chars[i]; renderCharList(); fillEditor(); }
function delChar() {
  if (!cur) return;
  chars = chars.filter(c => c.id !== cur.id); cur = null;
  save(); renderCharList();
  document.getElementById('char-editor').style.display = 'none';
}

function fillEditor() {
  if (!cur) return;
  document.getElementById('char-editor').style.display = 'block';
  document.getElementById('c-name').value = cur.name || '';
  document.getElementById('c-handle').value = cur.handle || '';
  document.getElementById('c-role').value = cur.role || 'Solo';
  document.getElementById('c-eddies').value = cur.eddies || 0;
  document.getElementById('c-notes').value = cur.notes || '';
  document.getElementById('c-skills').value = Object.entries(cur.skills || {}).map(([k,v]) => k + ': ' + v).join(', ');
  document.getElementById('eq-char-name').textContent = cur.name || 'Unnamed';
  renderStats(); renderDerived();
}

function F(field, val) { if (!cur) return; cur[field] = val; save(); renderCharList(); }

function renderStats() {
  document.getElementById('stat-grid').innerHTML = CPRED_DATA.stats.map(s => `
    <div class="stat-box"><div class="stat-lbl">${s}</div>
    <input type="number" min="1" max="10" value="${cur.stats[s]||5}" style="text-align:center;font-family:Orbitron,monospace;font-weight:700;color:var(--neon);padding:4px 2px"
    oninput="cur.stats['${s}']=+this.value;save();renderDerived()"></div>`).join('');
}

function renderDerived() {
  const hp = 10 + 5 * (cur.stats.BODY || 5);
  cur.maxHp = hp;
  document.getElementById('derived').textContent =
    `HP ${hp} · Seriously Wounded ${Math.ceil(hp/2)} · Death Save ${cur.stats.BODY||5} · Humanity ${(cur.stats.EMP||5)*10}`;
}

function skillsFromText(txt) {
  if (!cur) return;
  cur.skills = {};
  txt.split(',').forEach(p => {
    const m = p.split(':');
    if (m.length === 2 && m[0].trim()) cur.skills[m[0].trim()] = parseInt(m[1]) || 0;
  });
  save();
}

function exportChar() {
  if (!cur) return;
  const b = new Blob([JSON.stringify(cur, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = (cur.name || 'character') + '.json';
  a.click();
}

function importChar(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const c = JSON.parse(e.target.result);
      if (!c.id) c.id = String(Date.now());
      ['weapons','armorList','cyberware','gear','netPrograms','vehicles'].forEach(k => { if (!c[k]) c[k] = []; });
      chars.push(c); cur = c; save(); renderCharList(); fillEditor();
      notify('Imported: ' + c.name);
    } catch (err) { notify('Invalid file', true); }
  };
  r.readAsText(f);
}

// ── Equipment with database browse + custom + upgrades ───────────────
function renderEquip() {
  document.getElementById('eq-tabs').innerHTML = EQ_TABS.map(([k, l]) =>
    `<button class="subtab ${k===eqTab?'active':''}" onclick="eqTab='${k}';renderEquip()">${l}</button>`).join('');
  document.getElementById('eq-char-name').textContent = cur ? (cur.name || 'Unnamed') : 'select a character first';
  renderOwned();
  document.getElementById('eq-browse').style.display = 'none';
  document.getElementById('eq-custom').style.display = 'none';
}

function ownedList() {
  if (!cur) return [];
  if (!cur[eqTab]) cur[eqTab] = [];
  return cur[eqTab];
}

function renderOwned() {
  const el = document.getElementById('eq-owned');
  if (!cur) { el.innerHTML = '<div style="font-family:Share Tech Mono,monospace;font-size:10px;color:var(--dim)">Open a character in the Character tab first</div>'; return; }
  const list = ownedList();
  el.innerHTML = list.length ? list.map((it, i) => `
    <div class="gear-item">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="gear-name">${it.name}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);margin-top:2px">
            ${it.damage?'DMG '+it.damage+' · ':''}${it.rof?'ROF '+it.rof+' · ':''}${it.sp!==undefined&&it.sp!==''?'SP '+it.sp+' · ':''}${it.sdp?'SDP '+it.sdp+' · ':''}${it.hl?'HL '+it.hl+' · ':''}${it.cost||''}
          </div>
          ${it.description||it.features||it.notes ? `<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);margin-top:2px">${it.description||it.features||it.notes}</div>` : ''}
        </div>
        <button class="btn btn-red btn-xs" onclick="ownedList().splice(${i},1);save();renderOwned()">✕</button>
      </div>
      ${(it.upgrades||[]).map((u, ui) => `
        <div class="upgrade-row"><span>▸ ${u.name}${u.effect?' — '+u.effect:''}</span>
        <button class="btn btn-red btn-xs" onclick="ownedList()[${i}].upgrades.splice(${ui},1);save();renderOwned()">✕</button></div>`).join('')}
      <div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn btn-outline btn-xs" onclick="showUpgradePicker(${i})">+ Add Upgrade/Option</button>
        <button class="btn btn-ghost btn-xs" onclick="addCustomUpgrade(${i})">+ Add Other Upgrade</button>
      </div>
      <div id="upg-picker-${i}" style="display:none;margin-top:6px"></div>
    </div>`).join('') :
    '<div style="font-family:Share Tech Mono,monospace;font-size:10px;color:var(--dim)">Nothing equipped — browse the database or add a custom item</div>';
}

// Upgrade/option sources per equipment type
function upgradeSource() {
  if (eqTab === 'vehicles') return CPRED_DATA.vehicleUpgrades.map(u => ({ name: u.name, effect: u.effect, cost: u.cost }));
  if (eqTab === 'weapons') return CPRED_DATA.weaponAttachments.map(a => ({ name: a.name, effect: a.effect, cost: a.cost }));
  if (eqTab === 'cyberware') {
    // options = all cyberware entries (the player picks which option fits their foundation)
    return Object.values(CPRED_DATA.cyberware).flat().map(c => ({ name: c.name, effect: (c.description||'').slice(0,80), cost: c.cost }));
  }
  if (eqTab === 'armorList') return [
    { name: 'Reinforced Plating', effect: '+1 SP (GM approval)', cost: '500eb' },
    { name: 'Concealed Pockets', effect: 'Hidden storage, DV15 to spot', cost: '100eb' },
    { name: 'Style Upgrade', effect: '+1 Wardrobe & Style while worn', cost: '100eb' }
  ];
  return [];
}

function showUpgradePicker(i) {
  const el = document.getElementById('upg-picker-' + i);
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  const src = upgradeSource();
  el.style.display = 'block';
  el.innerHTML = src.length ? `
    <input placeholder="Filter upgrades..." style="margin-bottom:5px" oninput="filterUpg(${i}, this.value)">
    <div id="upg-list-${i}" style="max-height:180px;overflow-y:auto">${upgRows(i, src)}</div>` :
    '<div style="font-family:Share Tech Mono,monospace;font-size:9px;color:var(--dim)">No database upgrades for this type — use Add Other Upgrade</div>';
}

function upgRows(i, src) {
  return src.map(u => `
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:3px;padding:5px 8px;margin-bottom:3px">
      <span style="font-family:'Share Tech Mono',monospace;font-size:9px"><span style="color:var(--neon)">${u.name}</span> <span style="color:var(--dim)">${u.effect||''} ${u.cost?'· '+u.cost:''}</span></span>
      <button class="btn btn-gold btn-xs" onclick='attachUpgrade(${i}, ${JSON.stringify(JSON.stringify(u))})'>Add</button>
    </div>`).join('');
}

function filterUpg(i, q) {
  const src = upgradeSource().filter(u => !q || u.name.toLowerCase().includes(q.toLowerCase()));
  document.getElementById('upg-list-' + i).innerHTML = upgRows(i, src);
}

function attachUpgrade(i, uStr) {
  const u = JSON.parse(uStr);
  const it = ownedList()[i];
  if (!it.upgrades) it.upgrades = [];
  it.upgrades.push({ name: u.name, effect: u.effect || '' });
  save(); renderOwned();
  notify('Added ' + u.name);
}

function addCustomUpgrade(i) {
  const name = prompt('Upgrade / option name (e.g. Stealth Coating):');
  if (!name) return;
  const effect = prompt('Effect / notes (optional):') || '';
  const it = ownedList()[i];
  if (!it.upgrades) it.upgrades = [];
  it.upgrades.push({ name, effect, custom: true });
  save(); renderOwned();
  notify('Custom upgrade added');
}

// Browse database
function toggleBrowse() {
  const el = document.getElementById('eq-browse');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  if (el.style.display === 'block') renderBrowse('');
}

function dbFor() {
  if (eqTab === 'weapons') return Object.values(CPRED_DATA.weapons).flat();
  if (eqTab === 'armorList') return CPRED_DATA.armor;
  if (eqTab === 'cyberware') return Object.values(CPRED_DATA.cyberware).flat();
  if (eqTab === 'gear') return Object.values(CPRED_DATA.gear).flat();
  if (eqTab === 'netPrograms') return Object.values(CPRED_DATA.netPrograms).flat();
  if (eqTab === 'vehicles') return Object.values(CPRED_DATA.vehicles).flat();
  return [];
}

function renderBrowse(q) {
  const items = dbFor().filter(it => !q || it.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  document.getElementById('eq-browse-list').innerHTML = items.map(it => `
    <div class="gear-item" style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div class="gear-name">${it.name}</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted)">
          ${it.damage?'DMG '+it.damage+' · ':''}${it.sp!==undefined?'SP '+it.sp+' · ':''}${it.sdp?'SDP '+it.sdp+' · ':''}${it.hl?'HL '+it.hl+' · ':''}${it.cost||''} · ${it.source||''}</div>
      </div>
      <button class="btn btn-outline btn-xs" onclick='addFromDB(${JSON.stringify(JSON.stringify(it))})'>Add</button>
    </div>`).join('') || '<div style="font-family:Share Tech Mono,monospace;font-size:10px;color:var(--dim)">No results</div>';
}

function addFromDB(itStr) {
  if (!cur) { notify('Open a character first', true); return; }
  const it = JSON.parse(itStr);
  ownedList().push({ ...it, upgrades: [] });
  save(); renderOwned();
  notify('Added: ' + it.name);
}

// Custom item form
function toggleCustom() {
  const el = document.getElementById('eq-custom');
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  const fields = CUSTOM_FIELDS[eqTab] || CUSTOM_FIELDS.gear;
  el.style.display = 'block';
  el.innerHTML = `<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--neon);margin-bottom:6px;letter-spacing:1px">CUSTOM ${eqTab.toUpperCase()} — fill the matching stat fields</div>
    <div class="grid2">${fields.map(([k, l]) => `<div><label>${l}</label><input id="cf-${k}"></div>`).join('')}</div>
    <button class="btn btn-primary btn-xs" style="margin-top:8px" onclick="saveCustom()">Save Custom Item</button>`;
}

function saveCustom() {
  if (!cur) { notify('Open a character first', true); return; }
  const fields = CUSTOM_FIELDS[eqTab] || CUSTOM_FIELDS.gear;
  const it = { custom: true, source: 'Custom (player-made)', upgrades: [] };
  fields.forEach(([k]) => { const v = document.getElementById('cf-' + k).value; if (v) it[k] = v; });
  if (!it.name) { notify('Name is required', true); return; }
  ownedList().push(it);
  save(); renderOwned();
  document.getElementById('eq-custom').style.display = 'none';
  notify('Custom item saved to sheet');
}

// ── Rules lookup (offline) ───────────────────────────────────────────
function doLookup() {
  const q = document.getElementById('rule-q').value.trim();
  if (!q) return;
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const hits = CPRED_DATA.rulesDB.map(r => {
    const t = (r.q + ' ' + r.a).toLowerCase();
    let score = 0;
    words.forEach(w => { if (t.includes(w)) score += r.q.toLowerCase().includes(w) ? 3 : 1; });
    return { ...r, score };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  document.getElementById('rule-out').innerHTML = hits.length ?
    `<div class="output-box">${hits.map(h => `<div style="margin-bottom:12px"><span style="color:var(--neon)">Q: ${h.q}</span>\n<span>A: ${h.a}</span></div>`).join('')}</div>` :
    `<div class="output-box" style="border-left-color:var(--red)">No matching ruling found in the offline database. Ask your GM — their app has the AI oracle.</div>`;
}

// ── GM sync ──────────────────────────────────────────────────────────
async function connectGM() {
  gmAddr = document.getElementById('gm-addr').value.trim().replace(/^https?:\/\//, '');
  if (!gmAddr) return;
  localStorage.setItem('cpp_gm', gmAddr);
  const btn = document.getElementById('conn-btn');
  btn.textContent = '...';
  try {
    const r = await fetch('http://' + gmAddr + '/api/ping');
    const d = await r.json();
    if (d.ok) {
      connected = true;
      document.getElementById('sync-pill').textContent = 'SYNCED: ' + gmAddr;
      document.getElementById('sync-pill').classList.add('on');
      document.getElementById('sync-status').textContent = 'Connected to GM host. Characters sync automatically every 4 seconds.';
      startSync();
      notify('Connected to GM');
    }
  } catch (e) {
    connected = false;
    document.getElementById('sync-status').textContent = 'Connection failed: ' + e.message + ' — check the address and that the GM clicked Host Session.';
    notify('Connection failed', true);
  }
  btn.textContent = 'Connect';
}

async function pushChar(c) {
  try {
    await fetch('http://' + gmAddr + '/api/char', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c)
    });
  } catch (e) { /* offline — retry on next sync tick */ }
}

function uploadToGM() {
  if (!cur) return;
  if (!connected) { notify('Connect to GM first (GM Sync tab)', true); return; }
  pushChar(cur).then(() => notify('Uploaded to GM: ' + cur.name));
}

function startSync() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(async () => {
    if (!connected) return;
    try {
      // pull: fetch GM copy of each of my characters, take newer
      const r = await fetch('http://' + gmAddr + '/api/all');
      const d = await r.json();
      let changed = false;
      (d.pcs || []).forEach(gmChar => {
        const i = chars.findIndex(c => String(c.id) === String(gmChar.id));
        if (i >= 0 && (gmChar.updatedAt || 0) > (chars[i].updatedAt || 0)) {
          chars[i] = gmChar; changed = true;
          if (cur && cur.id === gmChar.id) { cur = gmChar; fillEditor(); }
        }
      });
      if (changed) { localStorage.setItem('cpp_chars', JSON.stringify(chars)); renderCharList(); renderOwned && renderOwned(); }
      // push my dirty chars
      chars.forEach(c => pushChar(c));
    } catch (e) {
      connected = false;
      document.getElementById('sync-pill').textContent = 'OFFLINE (retrying)';
      document.getElementById('sync-pill').classList.remove('on');
      setTimeout(() => { connectGMQuiet(); }, 5000);
    }
  }, 4000);
}

async function connectGMQuiet() {
  if (!gmAddr) return;
  try {
    const r = await fetch('http://' + gmAddr + '/api/ping');
    if ((await r.json()).ok) {
      connected = true;
      document.getElementById('sync-pill').textContent = 'SYNCED: ' + gmAddr;
      document.getElementById('sync-pill').classList.add('on');
    }
  } catch (e) {}
}

// ── Init ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const roleSel = document.getElementById('c-role');
  CPRED_DATA.roles.forEach(r => roleSel.add(new Option(r, r)));
  renderCharList();
  if (gmAddr) { document.getElementById('gm-addr').value = gmAddr; connectGMQuiet().then(() => { if (connected) startSync(); }); }
});

// ── v3.2 fixes: foundation-filtered cyberware options + inline Add Other ──
const CW_FOUNDATIONS_P = [
  ['Neural Link', /neural link/i], ['Cybereye', /cybereye|smart lens/i],
  ['Cyberaudio', /cyberaudio/i], ['Cyberarm', /cyberarm/i], ['Cyberleg', /cyberleg/i]
];

function cyberFoundationOfP(item) {
  if (!item || !item.name) return null;
  for (const [label, re] of CW_FOUNDATIONS_P) if (re.test(item.name)) return label;
  return null;
}

function upgradeSourceFor(item) {
  if (eqTab === 'vehicles') return CPRED_DATA.vehicleUpgrades.map(u => ({ name: u.name, effect: u.effect, cost: u.cost }));
  if (eqTab === 'weapons') return CPRED_DATA.weaponAttachments.map(a => ({ name: a.name, effect: a.effect, cost: a.cost }));
  if (eqTab === 'cyberware') {
    const f = cyberFoundationOfP(item);
    if (!f) return [];
    const f0 = f;
    const re = new RegExp(f + '\\s+Option', 'i');
    const re2 = new RegExp('Requires?\\s*:?\\s*(a\\s+)?' + f, 'i');
    return Object.values(CPRED_DATA.cyberware).flat()
      .filter(c => (re.test(c.description || '') || re2.test(c.description || '')) && !/Foundation/i.test(c.description || '') && !new RegExp('^' + f0.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')).test(c.name))
      .map(c => ({ name: c.name, effect: (c.description || '').replace(re, '').replace(/^\.\s*/, '').slice(0, 80), cost: c.cost }));
  }
  if (eqTab === 'armorList') return [
    { name: 'Reinforced Plating', effect: '+1 SP (GM approval)', cost: '500eb' },
    { name: 'Concealed Pockets', effect: 'Hidden storage, DV15 to spot', cost: '100eb' },
    { name: 'Style Upgrade', effect: '+1 Wardrobe & Style while worn', cost: '100eb' }
  ];
  return [];
}

function showUpgradePicker(i) {
  const el = document.getElementById('upg-picker-' + i);
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  const item = ownedList()[i];
  const src = upgradeSourceFor(item);
  el.style.display = 'block';
  const f = eqTab === 'cyberware' ? cyberFoundationOfP(item) : null;
  const head = eqTab === 'cyberware'
    ? (f ? `<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--gold);margin-bottom:4px">${f} options</div>`
         : `<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);margin-bottom:4px">"${item.name}" is not a foundation piece — options attach to Neural Link, Cybereyes, Cyberaudio, Cyberarms, or Cyberlegs. Use Add Other for custom notes.</div>`)
    : '';
  el.innerHTML = head + (src.length ? `
    <input placeholder="Filter upgrades..." style="margin-bottom:5px" oninput="filterUpg(${i}, this.value)">
    <div id="upg-list-${i}" style="max-height:180px;overflow-y:auto">${upgRows(i, src)}</div>` :
    (eqTab !== 'cyberware' || f ? '<div style="font-family:Share Tech Mono,monospace;font-size:9px;color:var(--dim)">No database upgrades for this — use Add Other Upgrade</div>' : ''));
}

function filterUpg(i, q) {
  const src = upgradeSourceFor(ownedList()[i]).filter(u => !q || u.name.toLowerCase().includes(q.toLowerCase()));
  const el = document.getElementById('upg-list-' + i);
  if (el) el.innerHTML = upgRows(i, src);
}

// Inline editable form replaces prompt() (prompt is blocked in some WebViews)
function addCustomUpgrade(i) {
  const el = document.getElementById('upg-picker-' + i);
  el.style.display = 'block';
  el.innerHTML = `
    <div style="background:rgba(0,229,255,0.04);border:1px dashed var(--neon);border-radius:4px;padding:8px">
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--neon);letter-spacing:1px;margin-bottom:6px">CUSTOM UPGRADE / OPTION</div>
      <label>Name</label><input id="cup-name-${i}" placeholder="e.g. Stealth Coating" style="margin-bottom:6px">
      <label>Effect / Notes</label><input id="cup-eff-${i}" placeholder="e.g. -2 to spot vehicle at night" style="margin-bottom:8px">
      <div style="display:flex;gap:6px">
        <button class="btn btn-primary btn-xs" onclick="saveCustomUpgrade(${i})">Save To Sheet</button>
        <button class="btn btn-ghost btn-xs" onclick="document.getElementById('upg-picker-${i}').style.display='none'">Cancel</button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('cup-name-' + i)?.focus(), 50);
}

function saveCustomUpgrade(i) {
  const name = document.getElementById('cup-name-' + i)?.value.trim();
  const effect = document.getElementById('cup-eff-' + i)?.value.trim() || '';
  if (!name) { notify('Name required', true); return; }
  const it = ownedList()[i];
  if (!it.upgrades) it.upgrades = [];
  it.upgrades.push({ name, effect, custom: true });
  save(); renderOwned();
  notify('Custom upgrade saved');
}
