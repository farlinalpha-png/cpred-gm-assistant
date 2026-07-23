// CP:RED Player Companion — player.js
// Character flow mirrors the GM app's Characters section:
// creation method chooser (Pre-Generated / Template / Full Custom),
// Identity / Stats & Skills / Lifepath / Full Sheet sections.
let chars = JSON.parse(localStorage.getItem('cpp_chars') || '[]');
let cur = null;
let gmAddr = localStorage.getItem('cpp_gm') || '';
let connected = false;
let eqTab = 'weapons';
let syncTimer = null;
let charSub = 'identity';

const EQ_TABS = [
  ['weapons', 'Weapons'], ['armorList', 'Armor'], ['cyberware', 'Cyberware'],
  ['gear', 'Gear'], ['netPrograms', 'Netrunning'], ['vehicles', 'Vehicles']
];

// Field schemas for custom items per equipment type
const MODS_FIELD = ['mods', 'Modifiers to Stats / Skills (e.g. +1 REF, +2 Handgun)'];
const CUSTOM_FIELDS = {
  weapons: [['name','Name'],['damage','Damage (e.g. 3d6)'],['rof','ROF'],['mag','Magazine'],['cost','Cost (eb)'],['features','Features/Notes'],MODS_FIELD],
  armorList: [['name','Name'],['sp','SP'],['penalty','Penalty'],['cost','Cost (eb)'],['notes','Notes'],MODS_FIELD],
  cyberware: [['name','Name'],['hl','Humanity Loss (e.g. 7 (2d6))'],['install','Install (Mall/Clinic/Hospital)'],['cost','Cost (eb)'],['description','Effect'],MODS_FIELD],
  gear: [['name','Name'],['cost','Cost (eb)'],['description','Description'],MODS_FIELD],
  netPrograms: [['name','Name'],['damage','Damage/Effect'],['cost','Cost (eb)'],['description','Description'],MODS_FIELD],
  vehicles: [['name','Name'],['sdp','SDP'],['sp','SP'],['seats','Seats'],['cost','Cost (eb)'],['description','Notes'],MODS_FIELD]
};

// Same lifepath field list as the GM app's full sheet
const LIFEPATH_DEFS = [
  { key: 'culturalOrigins', label: 'Cultural Origins', options: 'culturalOrigins' },
  { key: 'personality', label: 'Personality', options: 'personalities' },
  { key: 'clothingStyle', label: 'Clothing Style', options: 'clothingStyles' },
  { key: 'hairStyle', label: 'Hairstyle', options: 'hairStyles' },
  { key: 'valueMost', label: 'What You Value Most', options: 'valueMost' },
  { key: 'feelingsPeople', label: 'Feelings About People', options: 'feelingsAboutPeople' },
  { key: 'mostValuedPerson', label: 'Most Valued Person', free: true },
  { key: 'mostValuedPossession', label: 'Most Valued Possession', free: true },
  { key: 'familyBackground', label: 'Family Background', options: 'familyBackground' },
  { key: 'childhoodEnv', label: 'Childhood Environment', options: 'childhoodEnvironment' },
  { key: 'familyCrisis', label: 'Family Crisis', free: true },
  { key: 'lifeGoals', label: 'Life Goals', free: true },
  { key: 'lifepathNotes', label: 'Lifepath Notes', free: true }
];

// Relationships + role-specific lifepath. The seed prompts are original
// generic writing prompts to inspire a player's own answer — not the
// rulebook's tables. Stored on cur.lp_* to match the GM app for sync.
const LP_REL_FIELDS = [
  { key: 'lp_friends', label: 'Friends', placeholder: 'Who has your back in Night City?', seeds: [
    'An old crew-mate who still owes you their life',
    'A fixer who throws you the jobs nobody else will take',
    'A ripperdoc who patches you up off the books',
    'A street kid you look out for like family',
    'A rival who respects you enough to warn you of trouble',
    'A bartender who hears everything and tells you most of it'
  ] },
  { key: 'lp_love', label: 'Tragic Love Affairs', placeholder: 'A romance that went sideways...', seeds: [
    'They vanished after a job went wrong — you never learned why',
    'A corp bought their loyalty and they walked away chromed and cold',
    'You loved each other but the life kept pulling you apart',
    'They died taking a bullet that was meant for you',
    'It ended in betrayal, and the wound still aches',
    'You had to leave them behind to keep them safe'
  ] },
  { key: 'lp_enemies', label: 'Enemies', placeholder: 'Who wants you dead or ruined?', seeds: [
    'A gang lieutenant you humiliated in front of their crew',
    'A corp exec whose deal you blew wide open',
    'A former partner who thinks you sold them out',
    'A bounty hunter working an old contract on your head',
    'A cop who is sure you got away with something',
    'A dealer you owe more eddies than you can ever pay'
  ] }
];
const LP_ROLE_SEEDS = {
  Solo: ['A war or gig left scars you don\'t talk about', 'You keep a private code about who you will and won\'t kill'],
  Netrunner: ['Something you found in the NET still hunts your dreams', 'You trust your Agent more than most people'],
  Tech: ['You built something once that got someone hurt', 'Your workshop is the only place you feel truly safe'],
  Medtech: ['You lost a patient you swore you\'d save', 'You keep treating people who can never pay you'],
  Media: ['A story you broke made you powerful enemies', 'You chase the truth even when it costs you everything'],
  Exec: ['You climbed over people to get here — some are still falling', 'Your corp owns more of you than you\'d like to admit'],
  Fixer: ['A deal gone bad still follows you around', 'You know where too many bodies are buried'],
  Lawman: ['You bent the law once and it saved a life — or ended one', 'The badge cost you people you loved'],
  Nomad: ['Your family and the city pull you in opposite directions', 'The road took something from you it never gave back'],
  Rockerboy: ['A song you wrote started something bigger than you meant', 'Fame gave you a stage and took your privacy']
};

// Skills that require a player-chosen specialization
const SPEC_SKILL_RE = /^(Language|Local Expert|Science|Play Instrument)\b/;

function notify(msg, err) {
  const n = document.createElement('div');
  n.className = 'notif' + (err ? ' err' : '');
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2500);
}

function blank() {
  return { id: String(Date.now()), name: 'New Edgerunner', handle: '', role: 'Solo',
    age: 25, gender: '', aliases: '', rep: 0, roleAbilityRank: 4, roleSubRanks: {}, trackerIP: 0,
    stats: { INT:5, REF:5, DEX:5, TECH:5, COOL:5, WILL:5, LUCK:5, MOVE:5, BODY:5, EMP:5 },
    skills: {}, skillSpecs: {}, eddies: 500, hp: 40, maxHp: 40, wounds: 0, notes: '', lifepath: {}, portrait: null,
    weapons: [], armorList: [], armor: { head:'', headSP:0, body:'', bodySP:0, shield:'', shieldSP:0 },
    cyberware: [], gear: [], netPrograms: [], vehicles: [], updatedAt: Date.now() };
}

// Fill in anything missing on imported / synced / older characters
function normalize(c) {
  const b = blank();
  Object.keys(b).forEach(k => { if (c[k] === undefined || c[k] === null) c[k] = b[k]; });
  ['weapons','armorList','cyberware','gear','netPrograms','vehicles'].forEach(k => { if (!Array.isArray(c[k])) c[k] = []; });
  if (typeof c.skills !== 'object' || Array.isArray(c.skills)) c.skills = {};
  if (typeof c.lifepath !== 'object') c.lifepath = {};
  if (typeof c.armor !== 'object') c.armor = b.armor;
  return c;
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
  if (s === 'char' && cur) renderCharSub();
}

// ── Effective stats / humanity (ported from the GM app) ──────────────
// ── Item modifiers (custom stat/skill bonuses on equipment) ─────────
function parseItemMods(text) {
  const mods = { stats: {}, skills: {} };
  if (!text || typeof text !== 'string') return mods;
  const norm = s => s.toLowerCase().replace(/\(x2\)/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  const skillNames = Object.values(CPRED_DATA.skills).flat().map(s => s.name);
  text.split(/[,;]+/).forEach(tok => {
    tok = tok.trim(); if (!tok) return;
    const m = tok.match(/([+-]?\d+)/);
    if (!m) return;
    const amt = parseInt(m[1]);
    const name = tok.replace(m[0], '').replace(/[:+]/g, ' ').trim();
    if (!name) return;
    const stat = CPRED_DATA.stats.find(s => s.toLowerCase() === name.toLowerCase());
    if (stat) { mods.stats[stat] = (mods.stats[stat] || 0) + amt; return; }
    const skill = skillNames.find(sn => norm(sn) === norm(name));
    if (skill) mods.skills[skill] = (mods.skills[skill] || 0) + amt;
  });
  return mods;
}

function modsToStr(mods) {
  if (!mods) return '';
  const parts = [];
  Object.entries(mods.stats || {}).forEach(([s, a]) => a && parts.push(`${a > 0 ? '+' : ''}${a} ${s}`));
  Object.entries(mods.skills || {}).forEach(([n, a]) => a && parts.push(`${a > 0 ? '+' : ''}${a} ${n}`));
  return parts.join(', ');
}

function moddableItems(c) {
  return [...(c.cyberware || []), ...(c.gear || []), ...(c.weapons || []), ...(c.vehicles || []), ...(c.armorList || [])];
}

function effSkillMods(c) {
  const out = {};
  const add = (n, a) => { if (a) out[n] = (out[n] || 0) + a; };
  moddableItems(c).forEach(item => {
    if (item.mods && item.mods.skills) Object.entries(item.mods.skills).forEach(([n, a]) => add(n, a));
    (item.upgrades || []).forEach(u => { if (u.mods && u.mods.skills) Object.entries(u.mods.skills).forEach(([n, a]) => add(n, a)); });
  });
  return out;
}

function effStats(c) {
  const eff = { ...c.stats };
  const notes = [];
  const statMods = {};
  const bump = (s, amt, cap, label) => {
    eff[s] = (eff[s] || 5) + amt;
    if (cap) eff[s] = Math.min(eff[s], cap);
    statMods[s] = (statMods[s] || 0) + amt;
    notes.push(`${label}: ${amt > 0 ? '+' : ''}${amt} ${s}`);
  };
  const applyCustom = (src, label) => {
    if (src && src.stats) Object.entries(src.stats).forEach(([s, amt]) => { if (CPRED_DATA.stats.includes(s) && amt) bump(s, amt, null, label); });
  };
  moddableItems(c).forEach(item => {
    const mod = CPRED_DATA.itemMods[item.name];
    if (mod) {
      CPRED_DATA.stats.forEach(s => { if (mod[s]) bump(s, mod[s], mod.cap, item.name); });
      if (mod.skillNote) notes.push(`${item.name}: ${mod.skillNote}`);
      if (mod.note) notes.push(`${item.name}: ${mod.note}`);
    }
    applyCustom(item.mods, item.name);
    (item.upgrades || []).forEach(u => applyCustom(u.mods, item.name + ' · ' + u.name));
  });
  return { eff, notes, statMods };
}

// Compact list of every active equipment modifier for display
function equipmentModList(c) {
  const out = [];
  moddableItems(c).forEach(item => {
    const parts = [];
    const gm = CPRED_DATA.itemMods[item.name];
    if (gm) { CPRED_DATA.stats.forEach(s => { if (gm[s]) parts.push(`${gm[s] > 0 ? '+' : ''}${gm[s]} ${s}`); }); if (gm.skillNote) parts.push(gm.skillNote); }
    if (item.mods) { const s = modsToStr(item.mods); if (s) parts.push(s); }
    (item.upgrades || []).forEach(u => { if (u.mods) { const s = modsToStr(u.mods); if (s) parts.push(s); } });
    if (parts.length) out.push(`${item.name}: ${parts.join(', ')}`);
  });
  return out;
}

function totalHL(c) {
  let t = 0;
  (c.cyberware || []).forEach(cw => { const m = String(cw.hl || '').match(/\d+/); if (m) t += parseInt(m[0]); });
  return t;
}

function curHumanity(c) { return Math.max(0, ((c.stats.EMP || 5) * 10) - totalHL(c)); }

// ── Character list ───────────────────────────────────────────────────
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

// ── Creation chooser (mirrors GM wizard: Method → Pregen / Role) ─────
function newChar() {
  document.getElementById('char-view').style.display = 'none';
  document.getElementById('create-chooser').style.display = 'block';
  renderChooserMethod();
}

function renderChooserMethod() {
  document.getElementById('chooser-body').innerHTML = `
    <div class="grid3">
      <div class="method-card" onclick="chooserPregens()">
        <div class="m-title">Pre-Generated</div>
        <div class="m-desc">Choose from ${CPRED_DATA.pregens.length} ready-to-play edgerunners with full stats, gear and backstory hooks</div>
      </div>
      <div class="method-card" onclick="chooserTemplates()">
        <div class="m-title">Template</div>
        <div class="m-desc">Choose a role and get recommended stats, core skills and starting gear. Customize from there</div>
      </div>
      <div class="method-card" onclick="createCustom()">
        <div class="m-title">Full Custom</div>
        <div class="m-desc">Build your character from scratch — total control over every stat, skill and detail</div>
      </div>
    </div>`;
}

function chooserPregens() {
  document.getElementById('chooser-body').innerHTML = `
    <div class="grid3">
      ${CPRED_DATA.pregens.map((p, i) => `
        <div class="pick-card" onclick="createFromPregen(${i})">
          <div class="p-name">${p.name}</div>
          <div class="p-sub">${p.role} · "${p.handle}"</div>
          <div class="p-desc">${p.concept || ''}</div>
        </div>`).join('')}
    </div>
    <button class="btn btn-ghost btn-xs" style="margin-top:10px" onclick="renderChooserMethod()">← Back</button>`;
}

function chooserTemplates() {
  document.getElementById('chooser-body').innerHTML = `
    <div class="grid3">
      ${Object.entries(CPRED_DATA.templates).map(([role, t]) => `
        <div class="pick-card" onclick="createFromTemplate('${role}')">
          <div class="p-name">${role}</div>
          <div class="p-desc">${t.description || ''}</div>
        </div>`).join('')}
    </div>
    <button class="btn btn-ghost btn-xs" style="margin-top:10px" onclick="renderChooserMethod()">← Back</button>`;
}

function finishCreate(c) {
  cur = normalize(c);
  chars.push(cur);
  save();
  document.getElementById('create-chooser').style.display = 'none';
  renderCharList();
  openCharView('identity');
}

function createCustom() { finishCreate(blank()); }

// Create a fresh character and edit it entirely on the Full Sheet (no chooser)
function createBlankOnSheet() {
  const c = normalize(blank());
  c.name = ''; c.handle = '';
  chars.push(c); cur = c;
  localStorage.setItem('cpp_chars', JSON.stringify(chars));
  document.getElementById('create-chooser').style.display = 'none';
  renderCharList();
  openCharView('sheet');
  notify('Blank character — edit any field on the sheet');
}

function createFromPregen(i) {
  const p = CPRED_DATA.pregens[i];
  const c = { ...blank(), ...p, id: String(Date.now()),
    maxHp: p.hp,
    skills: Object.fromEntries((p.skills || []).map(s => [s.name, s.lvl])),
    gear: (p.gear || []).map(g => ({ name: g, qty: 1 }))
  };
  finishCreate(c);
  notify('Created from pregen: ' + p.name);
}

function createFromTemplate(role) {
  const t = CPRED_DATA.templates[role];
  const c = { ...blank(), role, stats: { ...t.recommendedStats } };
  c.hp = c.maxHp = 10 + 5 * (c.stats.BODY || 5);
  c.eddies = t.startingEddies || 500;
  (t.coreSkills || []).forEach(s => c.skills[s] = 4);
  c.gear = (t.startingGear || []).map(g => ({ name: g, qty: 1 }));
  finishCreate(c);
  notify(role + ' template — tweak stats and skills to taste');
}

// ── Open-character view with GM-style sections ───────────────────────
function openChar(i) { cur = normalize(chars[i]); renderCharList(); openCharView(charSub); }

function openCharView(sub) {
  document.getElementById('create-chooser').style.display = 'none';
  document.getElementById('char-view').style.display = 'block';
  const btn = document.querySelector(`#char-subtabs [data-t="${sub || 'identity'}"]`);
  subGo(sub || 'identity', btn);
}

function subGo(t, el) {
  charSub = t;
  document.querySelectorAll('#char-subtabs .subtab').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('#char-view .sub').forEach(x => x.classList.remove('active'));
  document.getElementById('sub-' + t).classList.add('active');
  renderCharSub();
}

function renderCharSub() {
  if (!cur) return;
  document.getElementById('eq-char-name').textContent = cur.name || 'Unnamed';
  if (charSub === 'identity') fillIdentity();
  if (charSub === 'stats') renderStatsSkills();
  if (charSub === 'lifepath') renderLifepath();
  if (charSub === 'sheet') renderSheet();
}

function F(field, val) { if (!cur) return; cur[field] = val; save(); renderCharList(); if (field === 'role') fillRoleBlurb(); }

function fillIdentity() {
  document.getElementById('c-name').value = cur.name || '';
  document.getElementById('c-handle').value = cur.handle || '';
  document.getElementById('c-role').value = cur.role || 'Solo';
  document.getElementById('c-rank').value = cur.roleAbilityRank || 4;
  document.getElementById('c-age').value = cur.age || 25;
  document.getElementById('c-rep').value = cur.rep || 0;
  document.getElementById('c-eddies').value = cur.eddies || 0;
  document.getElementById('c-ip').value = cur.trackerIP || 0;
  document.getElementById('c-gender').value = cur.gender || '';
  document.getElementById('c-aliases').value = cur.aliases || '';
  document.getElementById('c-notes').value = cur.notes || '';
  fillRoleBlurb();
}

function fillRoleBlurb() {
  const det = CPRED_DATA.roleAbilityDetails[cur.role] || {};
  document.getElementById('role-ability-blurb').innerHTML = det.name ?
    `<span class="badge badge-gold">${det.name}</span> ${det.how || ''}` : '';
}

// ── Role Ability sub-allocation (Tech/Maker, Medtech/Medicine) ───────
function setRoleSubRank(sub, val, rerender) {
  if (!cur.roleSubRanks) cur.roleSubRanks = {};
  const cfg = CPRED_DATA.roleSubAbilities[cur.role];
  if (!cfg) return;
  const rank = cur.roleAbilityRank || 4;
  let v = Math.max(0, parseInt(val) || 0);
  const otherUsed = cfg.subs.reduce((t, [name]) => name === sub ? t : t + (cur.roleSubRanks[name] || 0), 0);
  if (v + otherUsed > rank) v = Math.max(0, rank - otherUsed);
  cur.roleSubRanks[sub] = v;
  save();
  if (rerender && typeof window[rerender] === 'function') window[rerender]();
}

function roleSubAllocHTML(rerender) {
  const cfg = CPRED_DATA.roleSubAbilities[cur.role];
  if (!cfg) return '';
  if (!cur.roleSubRanks) cur.roleSubRanks = {};
  const rank = cur.roleAbilityRank || 4;
  const used = cfg.subs.reduce((t, [name]) => t + (cur.roleSubRanks[name] || 0), 0);
  const remaining = rank - used;
  const remColor = remaining < 0 ? 'var(--red)' : remaining > 0 ? 'var(--gold)' : 'var(--green)';
  return `
    <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin:12px 0 4px">Distribute ${cfg.ability} Rank (${rank} pts) — <span style="color:${remColor}">${remaining} remaining</span></div>
    <div class="grid2">
      ${cfg.subs.map(([name, desc]) => `
        <div style="background:var(--mid);border:1px solid var(--border);border-radius:4px;padding:8px 10px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <span style="font-family:'Orbitron',monospace;font-size:10px;color:var(--gold)">${name}</span>
            <input type="number" min="0" max="${rank}" value="${cur.roleSubRanks[name]||0}" style="width:46px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:3px;color:var(--neon);font-family:'Orbitron',monospace;font-size:14px;padding:2px" oninput="setRoleSubRank('${name.replace(/'/g,"\\'")}', this.value, '${rerender||''}')">
          </div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);margin-top:4px;line-height:1.5">${desc}</div>
        </div>`).join('')}
    </div>`;
}

// ── Sub-skill (specialization) fields ────────────────────────────────
function setSkillSpec(name, v) {
  if (!cur.skillSpecs) cur.skillSpecs = {};
  cur.skillSpecs[name] = v;
  save();
}

function skillSpecInput(name) {
  const val = (cur.skillSpecs && cur.skillSpecs[name]) || '';
  return `<input value="${val.replace(/"/g, '&quot;')}" placeholder="which one?"
    style="display:block;width:95%;margin-top:2px;background:transparent;border:none;border-radius:0;border-bottom:1px dashed var(--gold);color:var(--gold);font-family:'Share Tech Mono',monospace;font-size:9px;padding:0 2px;outline:none"
    oninput="setSkillSpec('${name.replace(/'/g, "\\'")}', this.value)">`;
}

// ── Stats & Skills (full grid, like the GM app) ──────────────────────
function renderStatsSkills() {
  const { eff, statMods } = effStats(cur);
  const skillMods = effSkillMods(cur);
  const hp = 10 + 5 * (eff.BODY || 5);
  const modList = equipmentModList(cur);
  document.getElementById('sub-stats-body').innerHTML = `
    <div class="grid5" style="margin-bottom:8px">
      ${CPRED_DATA.stats.map(s => {
        const b = cur.stats[s] || 5, e = eff[s] || b;
        const modded = (statMods[s] || 0) !== 0;
        return `<div class="stat-box"><div class="stat-lbl" style="${modded ? 'color:var(--green);font-weight:800' : ''}">${s}</div>
          <input type="number" min="1" max="10" value="${b}" style="text-align:center;font-family:Orbitron,monospace;font-weight:700;color:${modded ? 'var(--green)' : 'var(--neon)'};padding:4px 2px"
            onchange="cur.stats['${s}']=+this.value;save();renderStatsSkills()">
          ${modded ? `<div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--green);font-weight:800">eff ${e}</div>` : ''}</div>`;
      }).join('')}
    </div>
    <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);margin-bottom:${modList.length ? '6px' : '12px'}">
      HP ${hp} · Seriously Wounded ${Math.ceil(hp / 2)} · Death Save ${eff.BODY || 5} · Humanity ${curHumanity(cur)}/${(cur.stats.EMP || 5) * 10}
    </div>
    ${modList.length ? `<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--green);background:rgba(105,240,174,0.06);border:1px solid rgba(105,240,174,0.25);border-radius:4px;padding:6px 8px;margin-bottom:12px;line-height:1.6">◆ Equipment modifiers: ${modList.join(' · ')}</div>` : ''}
    <div class="grid3">
      ${Object.entries(CPRED_DATA.skills).map(([cat, skills]) => `
        <div><div class="skill-cat">${cat}</div>
          <div class="skill-row" style="opacity:.6"><span style="font-size:8px;letter-spacing:1px">SKILL</span><span style="display:flex;gap:4px;font-size:8px;letter-spacing:1px"><span style="width:38px;text-align:center">LVL</span><span style="width:22px;text-align:right">MOD</span><span style="width:22px;text-align:right">BASE</span></span></div>
          ${skills.map(sk => {
            const lvl = cur.skills[sk.name] || 0;
            const mod = skillMods[sk.name] || 0;
            const base = (eff[sk.stat] || 5) + lvl + mod;
            const active = lvl > 0 || mod !== 0;
            const spec = SPEC_SKILL_RE.test(sk.name) && lvl > 0;
            return `<div class="skill-row" ${active ? 'style="background:rgba(0,229,255,0.04)"' : ''}>
              <span style="${mod !== 0 ? 'color:var(--green);font-weight:800;' : lvl > 0 ? 'color:var(--neon);' : ''}overflow:hidden;max-width:48%" title="${sk.name} (${sk.stat})">${sk.name}${spec ? skillSpecInput(sk.name) : ''}</span>
              <span style="display:flex;align-items:center;gap:4px">
                <input type="number" min="0" max="10" value="${lvl}" style="width:38px;text-align:center;font-size:10px;padding:2px"
                  onchange="setSkill('${sk.name.replace(/'/g, "\\'")}', this.value)">
                <span title="Equipment MOD" style="width:22px;text-align:right;color:${mod > 0 ? 'var(--green)' : mod < 0 ? 'var(--red)' : 'var(--dim)'}">${mod ? (mod > 0 ? '+' + mod : mod) : '·'}</span>
                <span style="width:22px;text-align:right;${mod !== 0 ? 'font-weight:800;color:var(--green)' : 'color:var(--gold)'}">${active ? base : '—'}</span>
              </span></div>`;
          }).join('')}</div>`).join('')}
    </div>
    <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);margin-top:8px">MOD is the equipment bonus. BASE = effective STAT + level + MOD.</div>`;
}

function setSkill(name, v) {
  const n = parseInt(v) || 0;
  if (n <= 0) delete cur.skills[name]; else cur.skills[name] = n;
  save(); renderStatsSkills();
}

// ── Lifepath (same tables + dice as the GM app) ──────────────────────
function renderLifepath() {
  document.getElementById('sub-lifepath-body').innerHTML = LIFEPATH_DEFS.map(d => {
    const val = cur.lifepath[d.key] || '';
    if (d.free) return `<div class="lp-item">
      <div class="lp-label">${d.label}</div>
      <input value="${String(val).replace(/"/g, '&quot;')}" oninput="cur.lifepath['${d.key}']=this.value;save()">
    </div>`;
    const opts = CPRED_DATA.lifepath[d.options] || [];
    return `<div class="lp-item">
      <div class="lp-label">${d.label}</div>
      <div style="display:flex;gap:6px">
        <select style="flex:1" onchange="cur.lifepath['${d.key}']=this.value;save()">
          <option value="">— Select —</option>
          ${opts.map(o => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-xs" onclick="rollLifepath('${d.key}','${d.options}')">🎲</button>
      </div>
    </div>`;
  }).join('') + lifepathRelHTML();
}

// Friends / Tragic Love Affairs / Enemies / role-specific — bound to cur.lp_*
function lifepathRelHTML() {
  return `
    <div style="grid-column:1/-1;border-top:1px solid var(--border);margin:8px 0 4px;padding-top:8px">
      <div class="card-title" style="margin-bottom:8px">◈ Relationships &amp; Role Lifepath</div>
    </div>
    ${LP_REL_FIELDS.map(f => `
      <div class="lp-item">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="lp-label">${f.label}</div>
          <button class="btn btn-ghost btn-xs" onclick="seedLifepathRel('${f.key}')">🎲</button>
        </div>
        <textarea style="min-height:44px;font-size:12px" placeholder="${f.placeholder}" oninput="cur.${f.key}=this.value;save()">${cur[f.key] || ''}</textarea>
      </div>`).join('')}
    <div class="lp-item">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="lp-label">${cur.role || 'Role'} Lifepath (role-specific)</div>
        <button class="btn btn-ghost btn-xs" onclick="seedLifepathRole()">🎲</button>
      </div>
      <textarea style="min-height:44px;font-size:12px" placeholder="A defining event tied to being a ${cur.role || 'edgerunner'}..." oninput="cur.lp_roleSpecific=this.value;save()">${cur.lp_roleSpecific || ''}</textarea>
    </div>`;
}

function seedLifepathRel(key) {
  const f = LP_REL_FIELDS.find(x => x.key === key);
  if (!f) return;
  cur[key] = f.seeds[Math.floor(Math.random() * f.seeds.length)];
  save(); renderLifepath();
}

function seedLifepathRole() {
  const seeds = LP_ROLE_SEEDS[cur.role] || [];
  if (!seeds.length) return;
  cur.lp_roleSpecific = seeds[Math.floor(Math.random() * seeds.length)];
  save(); renderLifepath();
}

function rollLifepath(key, optKey) {
  const opts = CPRED_DATA.lifepath[optKey] || [];
  if (!opts.length) return;
  cur.lifepath[key] = opts[Math.floor(Math.random() * opts.length)];
  save(); renderLifepath();
}

function randomizeLifepath() {
  LIFEPATH_DEFS.forEach(d => {
    if (d.free) return;
    const opts = CPRED_DATA.lifepath[d.options] || [];
    if (opts.length) cur.lifepath[d.key] = opts[Math.floor(Math.random() * opts.length)];
  });
  save(); renderLifepath();
  notify('Lifepath randomized');
}

// ── Full Sheet (mirrors the GM app's full sheet, editable) ───────────
function setPathV(el, path, isNum) {
  if (!cur) return;
  const v = isNum ? (+el.value || 0) : el.value;
  const parts = path.split('.');
  let o = cur;
  for (let i = 0; i < parts.length - 1; i++) { if (!o[parts[i]]) o[parts[i]] = {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = v;
  save(); renderCharList();
  // Refresh the sheet when the role rank changes so the sub-allocation math
  // updates (debounced so typing doesn't steal focus)
  if (path === 'roleAbilityRank') {
    clearTimeout(window._sheetRankTimer);
    window._sheetRankTimer = setTimeout(() => { if (charSub === 'sheet') renderSheet(); }, 900);
  }
}

function edI(path, val, opts = {}) {
  return `<input type="${opts.num ? 'number' : 'text'}" class="ed-inline" value="${String(val ?? '').replace(/"/g, '&quot;')}"
    style="width:${opts.w || '110px'};${opts.center ? 'text-align:center;' : ''}${opts.color ? 'color:' + opts.color + ';' : ''}${opts.fs ? 'font-size:' + opts.fs + ';' : ''}"
    oninput="setPathV(this,'${path}',${!!opts.num})">`;
}

function renderSheet() {
  const el = document.getElementById('sub-sheet');
  const { eff, notes, statMods } = effStats(cur);
  const skillMods = effSkillMods(cur);
  const hp = 10 + 5 * (eff.BODY || 5);
  const hl = totalHL(cur);
  const hum = curHumanity(cur);
  const det = CPRED_DATA.roleAbilityDetails[cur.role] || {};

  el.innerHTML = `
    <div class="cs-section" style="border-color:var(--neon)">
      <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
        ${cur.portrait ?
          `<img src="${cur.portrait}" style="width:100px;height:100px;object-fit:cover;border:2px solid var(--neon);border-radius:4px;cursor:pointer" title="Click to change" onclick="document.getElementById('portrait-inp').click()">` :
          `<div onclick="document.getElementById('portrait-inp').click()" style="cursor:pointer;width:100px;height:100px;border:2px solid var(--border);border-radius:4px;display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:30px" title="Click to add portrait">◈</div>`}
        <input type="file" id="portrait-inp" accept="image/*" style="display:none" onchange="pickPortrait(this)">
        <div style="flex:1;min-width:220px">
          <div style="font-family:'Orbitron',monospace;font-size:18px;font-weight:700;color:var(--neon)">${edI('name', cur.name, { w: '250px', color: 'var(--neon)', fs: '16px' })}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--muted);margin:4px 0">
            "${edI('handle', cur.handle, { w: '120px' })}" ·
            <select style="width:auto;display:inline-block;padding:2px 6px;font-size:12px;color:var(--gold)" onchange="cur.role=this.value;save();renderSheet()">
              ${CPRED_DATA.roles.map(r => `<option ${r === cur.role ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--dim);line-height:2.2">
            Age: ${edI('age', cur.age, { num: true, w: '46px', center: true })} |
            Rep: ${edI('rep', cur.rep || 0, { num: true, w: '40px', center: true })} |
            Eddies: €$ ${edI('eddies', cur.eddies || 0, { num: true, w: '80px', color: 'var(--gold)' })} |
            Aliases: ${edI('aliases', cur.aliases || '', { w: '140px' })}
          </div>
          <div style="margin-top:6px">
            <span class="badge badge-gold">${det.name || '—'} Rank ${edI('roleAbilityRank', cur.roleAbilityRank || 4, { num: true, w: '32px', center: true, color: 'var(--gold)' })}</span>
            <span class="badge badge-red">HL: ${hl} (auto)</span>
            <span class="badge badge-neon">Humanity: ${hum}/${(cur.stats.EMP || 5) * 10}</span>
            <span class="badge badge-gold">IP: ${edI('trackerIP', cur.trackerIP || 0, { num: true, w: '44px', center: true, color: 'var(--gold)' })}</span>
          </div>
        </div>
      </div>
    </div>

    ${(() => { const ml = equipmentModList(cur); return ml.length ? `<div class="cs-section" style="padding:8px 14px;font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--green)">◆ Equipment modifiers active: ${ml.join(' · ')}</div>` : ''; })()}

    <div class="cs-section">
      <div class="cs-title">Stats (base — effective shown when modified)</div>
      <div class="grid5" style="margin-bottom:10px">
        ${CPRED_DATA.stats.map(s => {
          const b = cur.stats[s] || 5, e = eff[s] || b;
          const modded = (statMods[s] || 0) !== 0;
          return `<div class="stat-box"><div class="stat-lbl" style="${modded ? 'color:var(--green);font-weight:800' : ''}">${s}</div>
            <input type="number" min="1" max="10" value="${b}" style="text-align:center;font-family:Orbitron,monospace;font-weight:700;color:${modded ? 'var(--green)' : 'var(--neon)'};padding:4px 2px" onchange="cur.stats['${s}']=+this.value;save();renderSheet()">
            ${modded ? `<div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--green);font-weight:800">eff ${e}</div>` : ''}</div>`;
        }).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
        <div class="stat-box"><div class="stat-lbl">HP (auto)</div><div style="font-family:Orbitron,monospace;font-size:15px;font-weight:700">${hp}</div></div>
        <div class="stat-box"><div class="stat-lbl">Current HP</div><div>${edI('hp', cur.hp !== undefined ? cur.hp : hp, { num: true, w: '50px', center: true, color: 'var(--neon)', fs: '15px' })}</div></div>
        <div class="stat-box"><div class="stat-lbl">Death Save</div><div style="font-family:Orbitron,monospace;font-size:15px;font-weight:700">${eff.BODY || 5}</div></div>
        <div class="stat-box"><div class="stat-lbl">Humanity</div><div style="font-family:Orbitron,monospace;font-size:15px;font-weight:700;color:${hum < 20 ? 'var(--red)' : 'var(--neon)'}">${hum}</div></div>
      </div>
    </div>

    <div class="cs-section">
      <div class="cs-title">Weapons &amp; Armor (editable)</div>
      ${(cur.weapons || []).length ? cur.weapons.map((w, i) => `
        <div style="background:var(--mid);border:1px solid var(--border);border-radius:3px;padding:7px 10px;margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-family:'Orbitron',monospace;font-size:10px;color:var(--neon)">${w.name}</div>
            <button class="btn btn-red btn-xs" onclick="cur.weapons.splice(${i},1);save();renderSheet()">✕</button>
          </div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted)">DMG: ${w.damage || '—'} | ROF: ${w.rof || '—'} |
            Ammo: ${edI('weapons.' + i + '.ammo', w.ammo || '', { w: '70px', fs: '9px' })} |
            Notes: ${edI('weapons.' + i + '.notes', w.notes || '', { w: '120px', fs: '9px' })}</div>
          ${(w.upgrades || []).length ? `<div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--gold);margin-top:3px">◆ ${w.upgrades.map(u => u.name + (u.effect ? ' — ' + u.effect : '')).join(' · ')}</div>` : ''}
        </div>`).join('') : '<div style="color:var(--dim);font-size:10px;font-family:Share Tech Mono,monospace">No weapons — add from the Equipment tab</div>'}
      <div style="border-top:1px solid var(--border);margin:8px 0"></div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);line-height:2.4">
        Head: ${edI('armor.head', cur.armor.head || '', { w: '130px' })} SP ${edI('armor.headSP', cur.armor.headSP || 0, { num: true, w: '36px', center: true })}<br>
        Body: ${edI('armor.body', cur.armor.body || '', { w: '130px' })} SP ${edI('armor.bodySP', cur.armor.bodySP || 0, { num: true, w: '36px', center: true })}<br>
        Shield: ${edI('armor.shield', cur.armor.shield || '', { w: '130px' })} SP ${edI('armor.shieldSP', cur.armor.shieldSP || 0, { num: true, w: '36px', center: true })}
      </div>
    </div>

    <div class="cs-section">
      <div class="cs-title">Skills — every level editable · MOD = equipment bonus (bold = modified)</div>
      <div class="grid3">
        ${Object.entries(CPRED_DATA.skills).map(([cat, skills]) => `
          <div><div class="skill-cat">${cat}</div>
            <div class="skill-row" style="opacity:.6"><span style="font-size:8px;letter-spacing:1px">SKILL</span><span style="display:flex;gap:4px;font-size:8px;letter-spacing:1px"><span style="width:36px;text-align:center">LVL</span><span style="width:20px;text-align:right">MOD</span><span style="width:22px;text-align:right">BASE</span></span></div>
            ${skills.map(sk => {
              const lvl = cur.skills[sk.name] || 0;
              const mod = skillMods[sk.name] || 0;
              const base = (eff[sk.stat] || 5) + lvl + mod;
              const active = lvl > 0 || mod !== 0;
              const spec = SPEC_SKILL_RE.test(sk.name) && lvl > 0;
              return `<div class="skill-row" ${active ? 'style="background:rgba(0,229,255,0.04)"' : ''}>
                <span style="${mod !== 0 ? 'color:var(--green);font-weight:800;' : lvl > 0 ? 'color:var(--neon);' : ''}overflow:hidden;max-width:44%" title="${sk.name} (${sk.stat})">${sk.name}${spec ? skillSpecInput(sk.name) : ''}</span>
                <span style="display:flex;align-items:center;gap:4px">
                  <input type="number" min="0" max="10" value="${lvl}" style="width:36px;text-align:center;font-size:10px;padding:1px"
                    onchange="setSkillSheet('${sk.name.replace(/'/g, "\\'")}', this.value)">
                  <span title="Equipment MOD" style="width:20px;text-align:right;color:${mod > 0 ? 'var(--green)' : mod < 0 ? 'var(--red)' : 'var(--dim)'}">${mod ? (mod > 0 ? '+' + mod : mod) : '·'}</span>
                  <span style="width:22px;text-align:right;${mod !== 0 ? 'font-weight:800;color:var(--green)' : 'color:var(--gold)'}">${active ? base : '—'}</span>
                </span></div>`;
            }).join('')}</div>`).join('')}
      </div>
    </div>

    <div class="cs-section">
      <div class="cs-title">Role Ability: ${det.name || '—'} (Rank ${cur.roleAbilityRank || 4})</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#b0b0c8;line-height:1.8">${det.how || ''}</div>
      ${det.ranks ? `<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);line-height:1.7;margin-top:6px">${det.ranks}</div>` : ''}
      ${roleSubAllocHTML('renderSheet')}
    </div>

    ${(cur.cyberware || []).length ? `<div class="cs-section">
      <div class="cs-title">Cyberware — Total HL: ${hl} → Humanity ${hum}/${(cur.stats.EMP || 5) * 10} (auto-calculated)</div>
      <div class="grid3">
        ${cur.cyberware.map((c, i) => `<div style="background:var(--mid);border:1px solid var(--border);border-radius:3px;padding:7px 10px;position:relative">
          <button class="btn btn-red btn-xs" style="position:absolute;top:4px;right:4px" onclick="cur.cyberware.splice(${i},1);save();renderSheet()">✕</button>
          <div style="font-family:'Orbitron',monospace;font-size:9px;color:var(--neon);padding-right:24px">${c.name}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--dim)">HL: ${c.hl || '—'}${CPRED_DATA.itemMods[c.name] ? ' · ' + (CPRED_DATA.itemMods[c.name].skillNote || CPRED_DATA.itemMods[c.name].note || 'stat mod') : ''}</div>
          ${(c.upgrades || []).length ? `<div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--gold);margin-top:3px;padding-right:24px">◆ ${c.upgrades.map(u => u.name + (u.effect ? ' — ' + u.effect : '')).join(' · ')}</div>` : ''}
        </div>`).join('')}</div></div>` : ''}

    ${(cur.vehicles || []).length ? `<div class="cs-section">
      <div class="cs-title">Vehicles (SDP editable)</div>
      ${cur.vehicles.map((v, i) => `<div style="background:var(--mid);border:1px solid var(--border);border-radius:3px;padding:7px 10px;margin-bottom:6px">
        <div style="font-family:'Orbitron',monospace;font-size:10px;color:var(--neon)">${v.name}</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted)">SDP ${edI('vehicles.' + i + '.curSDP', v.curSDP !== undefined ? v.curSDP : v.sdp, { num: true, w: '44px', center: true, fs: '9px' })}/${v.sdp || '—'} | SP ${v.sp || '—'} | Seats ${v.seats || '—'}${(v.upgrades || []).length ? ' | ◆ ' + v.upgrades.map(u => u.name).join(', ') : ''}</div>
      </div>`).join('')}</div>` : ''}

    <div class="cs-section">
      <div class="cs-title">Gear (quantities editable)</div>
      ${(cur.gear || []).length ? `<div class="grid3">
        ${cur.gear.map((g, i) => `<div style="display:flex;justify-content:space-between;align-items:center;font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);background:var(--mid);padding:5px 8px;border-radius:3px">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.name}</span>
          <span style="display:flex;gap:4px;align-items:center;flex-shrink:0">
            ${edI('gear.' + i + '.qty', g.qty || 1, { num: true, w: '34px', center: true, color: 'var(--gold)', fs: '10px' })}
            <button class="btn btn-red btn-xs" onclick="cur.gear.splice(${i},1);save();renderSheet()">✕</button>
          </span></div>`).join('')}</div>` : '<div style="color:var(--dim);font-size:10px;font-family:Share Tech Mono,monospace">No gear</div>'}
    </div>

    ${(cur.netPrograms || []).length ? `<div class="cs-section">
      <div class="cs-title">Netrunning Programs</div>
      <div class="grid3">
        ${cur.netPrograms.map(p => `<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);background:var(--mid);padding:5px 8px;border-radius:3px">${p.name}${p.damage ? ' · ' + p.damage : ''}</div>`).join('')}</div></div>` : ''}

    <div class="cs-section">
      <div class="cs-title">Lifepath (all editable)</div>
      <div class="grid2">
        ${LIFEPATH_DEFS.map(d => `<div class="lp-item">
          <div class="lp-label">${d.label}</div>
          <input value="${String(cur.lifepath[d.key] || '').replace(/"/g, '&quot;')}" style="font-size:12px" oninput="cur.lifepath['${d.key}']=this.value;save()">
        </div>`).join('')}
      </div>
      <div style="border-top:1px solid var(--border);margin:10px 0 6px;padding-top:8px;font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--gold);letter-spacing:1px">RELATIONSHIPS &amp; ROLE LIFEPATH</div>
      <div class="grid2">
        ${LP_REL_FIELDS.map(f => `<div class="lp-item">
          <div style="display:flex;justify-content:space-between;align-items:center"><div class="lp-label">${f.label}</div><button class="btn btn-ghost btn-xs" onclick="seedLifepathRel('${f.key}')">🎲</button></div>
          <textarea style="min-height:40px;font-size:12px" placeholder="${f.placeholder}" oninput="cur.${f.key}=this.value;save()">${cur[f.key] || ''}</textarea>
        </div>`).join('')}
        <div class="lp-item">
          <div style="display:flex;justify-content:space-between;align-items:center"><div class="lp-label">${cur.role || 'Role'} Lifepath</div><button class="btn btn-ghost btn-xs" onclick="seedLifepathRole()">🎲</button></div>
          <textarea style="min-height:40px;font-size:12px" placeholder="A defining event tied to being a ${cur.role || 'edgerunner'}..." oninput="cur.lp_roleSpecific=this.value;save()">${cur.lp_roleSpecific || ''}</textarea>
        </div>
      </div>
    </div>

    <div class="cs-section">
      <div class="cs-title">Notes (editable)</div>
      <textarea style="min-height:70px;font-family:'Share Tech Mono',monospace;font-size:11px" oninput="cur.notes=this.value;save()">${cur.notes || ''}</textarea>
    </div>`;
}

function setSkillSheet(name, v) {
  const n = parseInt(v) || 0;
  if (n <= 0) delete cur.skills[name]; else cur.skills[name] = n;
  save(); renderSheet();
}

function pickPortrait(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => { cur.portrait = e.target.result; save(); renderSheet(); };
  r.readAsDataURL(f);
}

// ── Delete / export / import / upload ────────────────────────────────
function delChar() {
  if (!cur) return;
  chars = chars.filter(c => c.id !== cur.id); cur = null;
  save(); renderCharList();
  document.getElementById('char-view').style.display = 'none';
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
      const c = normalize(JSON.parse(e.target.result));
      if (!c.id) c.id = String(Date.now());
      chars.push(c); cur = c; save(); renderCharList(); openCharView('sheet');
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
          ${it.mods && modsToStr(it.mods) ? `<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--green);margin-top:2px">◆ ${modsToStr(it.mods)}</div>` : ''}
        </div>
        <button class="btn btn-red btn-xs" onclick="ownedList().splice(${i},1);save();renderOwned()">✕</button>
      </div>
      ${(it.upgrades||[]).map((u, ui) => `
        <div class="upgrade-row"><span>▸ ${u.name}${u.effect?' — '+u.effect:''}${u.mods && modsToStr(u.mods)?` <span style="color:var(--green)">[${modsToStr(u.mods)}]</span>`:''}</span>
        <button class="btn btn-red btn-xs" onclick="ownedList()[${i}].upgrades.splice(${ui},1);save();renderOwned()">✕</button></div>`).join('')}
      <div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn btn-outline btn-xs" onclick="showUpgradePicker(${i})">+ Add Upgrade/Option</button>
        <button class="btn btn-ghost btn-xs" onclick="addCustomUpgrade(${i})">+ Add Other Upgrade</button>
      </div>
      <div id="upg-picker-${i}" style="display:none;margin-top:6px"></div>
    </div>`).join('') :
    '<div style="font-family:Share Tech Mono,monospace;font-size:10px;color:var(--dim)">Nothing equipped — browse the database or add a custom item</div>';
}

function upgRows(i, src) {
  return src.map(u => `
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:3px;padding:5px 8px;margin-bottom:3px">
      <span style="font-family:'Share Tech Mono',monospace;font-size:9px"><span style="color:var(--neon)">${u.name}</span> <span style="color:var(--dim)">${u.effect||''} ${u.cost?'· '+u.cost:''}</span></span>
      <button class="btn btn-gold btn-xs" onclick='attachUpgrade(${i}, ${JSON.stringify(JSON.stringify(u))})'>Add</button>
    </div>`).join('');
}

function attachUpgrade(i, uStr) {
  const u = JSON.parse(uStr);
  const it = ownedList()[i];
  if (!it.upgrades) it.upgrades = [];
  it.upgrades.push({ name: u.name, effect: u.effect || '' });
  save(); renderOwned();
  notify('Added ' + u.name);
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
  if (it.mods) it.mods = parseItemMods(it.mods); // "+1 REF, +2 Handgun" → structured
  ownedList().push(it);
  save(); renderOwned();
  document.getElementById('eq-custom').style.display = 'none';
  const modStr = it.mods ? modsToStr(it.mods) : '';
  notify('Custom item saved' + (modStr ? ' (' + modStr + ')' : ''));
  if (charSub === 'stats') renderStatsSkills();
  if (charSub === 'sheet') renderSheet();
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
      refreshHostRoster();
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

// ── Host roster: pick which of the GM's loaded characters is yours ───
let hostPCs = [];

async function refreshHostRoster() {
  const card = document.getElementById('host-roster-card');
  const loader = document.getElementById('connected-loader');
  if (!connected) {
    if (card) card.style.display = 'none';
    if (loader) loader.style.display = 'none';
    return;
  }
  try {
    const r = await fetch('http://' + gmAddr + '/api/all');
    const d = await r.json();
    hostPCs = d.pcs || [];
  } catch (e) { hostPCs = []; }
  if (card) card.style.display = 'block';
  if (loader) loader.style.display = 'block';
  const mine = new Set(chars.map(c => String(c.id)));
  const html = hostPCs.length ? hostPCs.map((p, i) => `
    <div class="gear-item" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div style="min-width:0">
        <div class="gear-name">${p.name || 'Unnamed'}</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted)">"${p.handle || ''}" · ${p.role || '—'} · HP ${p.hp !== undefined ? p.hp : '—'}/${p.maxHp || '—'}</div>
      </div>
      <button class="btn ${mine.has(String(p.id)) ? 'btn-ghost' : 'btn-gold'} btn-xs" onclick="claimHostChar(${i})">
        ${mine.has(String(p.id)) ? 'Open' : '▶ Play This Character'}</button>
    </div>`).join('') :
    '<div style="font-family:Share Tech Mono,monospace;font-size:10px;color:var(--dim)">No characters loaded on the host yet — ask your GM to add PCs, or upload one of yours with ⇧ Upload to GM</div>';
  const hostEl = document.getElementById('host-roster');
  if (hostEl) hostEl.innerHTML = html;
  const connEl = document.getElementById('connected-roster');
  if (connEl) connEl.innerHTML = html;
}

function claimHostChar(i) {
  const p = normalize(JSON.parse(JSON.stringify(hostPCs[i])));
  const idx = chars.findIndex(c => String(c.id) === String(p.id));
  if (idx >= 0) {
    // Already mine — keep whichever copy is newer
    if ((p.updatedAt || 0) > (chars[idx].updatedAt || 0)) chars[idx] = p;
    cur = chars[idx];
  } else {
    chars.push(p);
    cur = p;
    notify('Now playing: ' + (p.name || 'Unnamed'));
  }
  localStorage.setItem('cpp_chars', JSON.stringify(chars));
  renderCharList();
  const charTab = document.querySelector('.tab-btn[data-s="char"]');
  go('char', charTab);
  openCharView('sheet');
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
          chars[i] = normalize(gmChar); changed = true;
          if (cur && cur.id === gmChar.id) { cur = chars[i]; renderCharSub(); }
        }
      });
      if (changed) { localStorage.setItem('cpp_chars', JSON.stringify(chars)); renderCharList(); renderOwned && renderOwned(); }
      // push my dirty chars
      chars.forEach(c => pushChar(c));
    } catch (e) {
      connected = false;
      document.getElementById('sync-pill').textContent = 'OFFLINE (retrying)';
      document.getElementById('sync-pill').classList.remove('on');
      const loader = document.getElementById('connected-loader');
      if (loader) loader.style.display = 'none';
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
      refreshHostRoster();
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

// ── Cyberware options: foundation-filtered (matches GM app) ──────────
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
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--neon);letter-spacing:1px;margin-bottom:6px">CUSTOM UPGRADE / OPTION — add as many as you like</div>
      <label>Name</label><input id="cup-name-${i}" placeholder="e.g. Stealth Coating" style="margin-bottom:6px">
      <label>Effect / Notes</label><input id="cup-eff-${i}" placeholder="e.g. -2 to spot vehicle at night" style="margin-bottom:6px">
      <label>Modifiers to Stats / Skills (e.g. +1 REF, +2 Handgun)</label><input id="cup-mods-${i}" placeholder="+1 COOL, +1 Stealth" style="margin-bottom:8px">
      <div style="display:flex;gap:6px">
        <button class="btn btn-primary btn-xs" onclick="saveCustomUpgrade(${i})">Save To Sheet</button>
        <button class="btn btn-ghost btn-xs" onclick="document.getElementById('upg-picker-${i}').style.display='none'">Close</button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('cup-name-' + i)?.focus(), 50);
}

function saveCustomUpgrade(i) {
  const name = document.getElementById('cup-name-' + i)?.value.trim();
  const effect = document.getElementById('cup-eff-' + i)?.value.trim() || '';
  const modsRaw = document.getElementById('cup-mods-' + i)?.value.trim() || '';
  if (!name) { notify('Name required', true); return; }
  const it = ownedList()[i];
  if (!it.upgrades) it.upgrades = [];
  const upg = { name, effect, custom: true };
  if (modsRaw) upg.mods = parseItemMods(modsRaw);
  it.upgrades.push(upg);
  save(); renderOwned();
  // Re-open the form so several options can be stacked quickly
  addCustomUpgrade(i);
  const modStr = upg.mods ? modsToStr(upg.mods) : '';
  notify('Option added' + (modStr ? ' (' + modStr + ')' : ''));
  if (charSub === 'stats') renderStatsSkills();
  if (charSub === 'sheet') renderSheet();
}
