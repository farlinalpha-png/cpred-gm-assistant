// ═══════════════════════════════════════════════════════════════════
// CP:RED GM ASSISTANT — app.js
// ═══════════════════════════════════════════════════════════════════

// ── Electron IPC (graceful fallback for browser preview) ──────────
const ipc = (typeof require !== 'undefined') ? require('electron').ipcRenderer : null;
async function callIPC(channel, ...args) {
  if (ipc) return ipc.invoke(channel, ...args);
  return { success: false, error: 'Not running in Electron' };
}

// ── State ──────────────────────────────────────────────────────────
let char = newBlankChar();
let savedChars = JSON.parse(localStorage.getItem('cpred_chars') || '[]');
let npcRoster = JSON.parse(localStorage.getItem('cpred_npcs') || '[]');
let encRoster = JSON.parse(localStorage.getItem('cpred_encs') || '[]');
let wizardStep = 0;
let creationMethod = 'custom';
let selectedRole = 'Solo';
let selectedPregen = null;
let activeTopPanel = 'characters';
let activeSection = 'creation';
let activeWeaponCat = null;
let activeCWCat = null;
let activeGearCat = null;
let activeNetCat = null;

function newBlankChar() {
  return {
    id: Date.now().toString(),
    name: 'New Edgerunner', handle: 'Handle', role: 'Solo',
    age: 25, gender: '', aliases: '', notes: '',
    rep: 0, eddies: 500,
    stats: { INT:5, REF:5, DEX:5, TECH:5, COOL:5, WILL:5, LUCK:5, MOVE:5, BODY:5, EMP:5 },
    roleAbilityRank: 4, roleSubRanks: {}, medtechDrugs: [],
    skills: {}, skillSpecs: {}, skillMods: {},
    hp: 40, maxHp: 40, wounds: 0,
    humanity: 50, maxHumanity: 50,
    lifepath: {},
    friends: '', love: '', enemies: '', goals: '', roleSpecific: '',
    weapons: [], armor: { head:'', headSP:0, body:'', bodySP:0, shield:'', shieldSP:0 },
    cyberware: [], gear: [],
    ammoNotes: '', cash: 500, fashion: '', housing: '', rent: '', lifestyle: '',
    netDeck: '', netDeckCost: '', netSlotsU: 7, netSlotsP: 0, netSlotsH: 0,
    netPrograms: [], netHardware: '', netStealthNotes: '',
    trackerCrits: '', trackerAddictions: '', trackerIP: 0,
    trackerRepEvents: '', trackerNotes: '',
    portrait: null,
    lp_friends: '', lp_love: '', lp_enemies: '', lp_goals: '', lp_roleSpecific: ''
  };
}

// ── Notifications ──────────────────────────────────────────────────
function notify(msg, type = '') {
  const n = document.createElement('div');
  n.className = 'notification ' + type;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 3000);
}

// ── Claude API ─────────────────────────────────────────────────────
async function callClaude(system, user) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000,
        system, messages: [{ role: 'user', content: user }]
      })
    });
    const d = await r.json();
    return d.content?.[0]?.text || 'Error generating content.';
  } catch (e) {
    return 'Error: ' + e.message;
  }
}

// ── Panel Navigation ───────────────────────────────────────────────
function switchTopPanel(id, el) {
  document.querySelectorAll('.topnav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('[id^="panel-"]').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + id).classList.add('active');
  document.getElementById('sidebar').style.display = id === 'characters' ? 'flex' : 'none';
  activeTopPanel = id;
}

function switchSection(id, el) {
  document.querySelectorAll('.snav-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('[id^="section-"]').forEach(p => p.classList.remove('active'));
  const sec = document.getElementById('section-' + id);
  if (sec) sec.classList.add('active');
  activeSection = id;
  if (id === 'stats') renderStatsView();
  if (id === 'sheet') renderFullSheet();
  if (id === 'tracker') updateTracker();
  if (id === 'weapons') initWeaponBrowser();
  if (id === 'cyberware') initCWBrowser();
  if (id === 'gear') initGearBrowser();
  if (id === 'netrunning') initNetBrowser();
  if (id === 'lifepath') renderLifepathView();
  if (id === 'armor') initArmorBrowser();
}

// ── Sidebar Identity ───────────────────────────────────────────────
function updateSidebarIdentity() {
  // Source from char (kept live by the name/handle inputs) so every load path
  // — file, folder, session tracker — refreshes the sidebar correctly.
  document.getElementById('sb-name').textContent = char.name || 'New Edgerunner';
  document.getElementById('sb-handle').textContent = '"' + (char.handle || 'Handle') + '"';
  document.getElementById('sb-role').textContent = char.role || 'Solo';
}

// ═══════════════════════════════════════════════════════════════════
// CHARACTER CREATION WIZARD
// ═══════════════════════════════════════════════════════════════════
function initWizard() {
  // Build role select grid
  const rg = document.getElementById('role-select-grid');
  rg.innerHTML = CPRED_DATA.roles.map(r => `
    <div class="role-card" onclick="selectWizardRole('${r}',this)">
      <div class="role-card-name">${r}</div>
      <div class="role-card-desc">${(CPRED_DATA.templates[r]?.description||'').substring(0,60)}...</div>
    </div>`).join('');

  // Build pregen grid
  const pg = document.getElementById('pregen-grid');
  pg.innerHTML = CPRED_DATA.pregens.map((p,i) => `
    <div class="pregen-card" onclick="selectPregen(${i},this)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div style="font-family:'Orbitron',monospace;font-size:12px;color:var(--neon)">${p.name}</div>
        <span class="badge badge-neon">${p.role}</span>
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);margin-bottom:4px">"${p.handle}"</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:#666;line-height:1.6">${p.concept}</div>
    </div>`).join('');

  buildStatInputGrid();
  buildSkillInputTables();
  renderLifepathEditors();
}

function selectMethod(method, el) {
  creationMethod = method;
  document.querySelectorAll('#wizard-step-0 .role-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function setCreationMode(method) {
  creationMethod = method;
  if (method === 'pregen') goWizardStep(0);
  else goWizardStep(0);
}

function selectWizardRole(role, el) {
  selectedRole = role;
  char.role = role;
  document.querySelectorAll('#role-select-grid .role-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  updateSidebarIdentity();

  // If template mode, fill suggested stats
  if (creationMethod === 'template' && CPRED_DATA.templates[role]) {
    const t = CPRED_DATA.templates[role];
    char.stats = { ...t.recommendedStats };
    char.hp = char.maxHp = 10 + (5 * char.stats.BODY);
    char.humanity = char.maxHumanity = char.stats.EMP * 10;
    char.eddies = t.startingEddies || 500;
    updateStatInputValues();
    updateDerivedStats();
  }
}

function selectPregen(idx, el) {
  selectedPregen = idx;
  document.querySelectorAll('.pregen-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const p = CPRED_DATA.pregens[idx];
  char = { ...newBlankChar(), ...p, id: Date.now().toString(),
    maxHp: p.hp, maxHumanity: p.humanity,
    skills: Object.fromEntries(p.skills.map(s => [s.name, s.lvl])),
    gear: p.gear.map(g => ({ name: g, qty: 1 }))
  };
  char.role = p.role;
  selectedRole = p.role;
  updateSidebarIdentity();
}

function goWizardStep(step) {
  document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.wizard-step-dot').forEach((d, i) => {
    d.classList.remove('current', 'done');
    if (i < step) d.classList.add('done');
    if (i === step) d.classList.add('current');
  });
  document.getElementById('wizard-step-' + step).classList.add('active');
  wizardStep = step;

  // Show/hide pregen vs role section
  if (step === 1) {
    const isPregen = creationMethod === 'pregen';
    document.getElementById('step1-pregen-section').style.display = isPregen ? 'block' : 'none';
    document.getElementById('step1-role-section').style.display = isPregen ? 'none' : 'block';
  }
  if (step === 3) renderWizardRoleAlloc();
  if (step === 5) { renderLifepathEditors(); buildLifepathRelationships(); }
  if (step === 6) buildStartingGearList();
  if (step === 7) buildDoneSummary();
}

// Renders the role sub-ability allocation inside the wizard's stats step
function renderWizardRoleAlloc() {
  const box = document.getElementById('c-role-suballoc');
  if (!box) return;
  const rankInput = document.getElementById('c-role-rank');
  if (rankInput) char.roleAbilityRank = parseInt(rankInput.value) || char.roleAbilityRank || 4;
  box.innerHTML = CPRED_DATA.roleSubAbilities[char.role] ? roleSubAllocHTML('renderWizardRoleAlloc') : '';
}

function wizardNext() {
  const maxStep = 7;
  if (wizardStep < maxStep) {
    collectWizardStepData(wizardStep);
    goWizardStep(wizardStep + 1);
  }
}

function wizardPrev() {
  if (wizardStep > 0) goWizardStep(wizardStep - 1);
}

function collectWizardStepData(step) {
  if (step === 2) {
    char.name = document.getElementById('c-name').value || 'Unnamed';
    char.handle = document.getElementById('c-handle').value || 'Handle';
    char.age = parseInt(document.getElementById('c-age').value) || 25;
    char.gender = document.getElementById('c-gender').value;
    char.aliases = document.getElementById('c-aliases').value;
    char.rep = parseInt(document.getElementById('c-rep').value) || 0;
    char.eddies = parseInt(document.getElementById('c-eddies').value) || 500;
    char.notes = document.getElementById('c-notes').value;
    updateSidebarIdentity();
  }
  if (step === 3) {
    CPRED_DATA.stats.forEach(s => {
      const el = document.getElementById('stat-' + s);
      if (el) char.stats[s] = parseInt(el.value) || 5;
    });
    char.roleAbilityRank = parseInt(document.getElementById('c-role-rank').value) || 4;
    char.maxHp = char.hp = 10 + (5 * char.stats.BODY);
    char.maxHumanity = char.humanity = char.stats.EMP * 10;
  }
  if (step === 4) {
    Object.values(CPRED_DATA.skills).flat().forEach(sk => {
      const el = document.getElementById('skill-lvl-' + safeName(sk.name));
      if (el) char.skills[sk.name] = parseInt(el.value) || 0;
    });
  }
  if (step === 5) collectLifepathData();
}

function buildStatInputGrid() {
  const grid = document.getElementById('stat-input-grid');
  grid.innerHTML = CPRED_DATA.stats.map(s => `
    <div class="stat-box">
      <div class="stat-box-label">${s}</div>
      <input type="number" id="stat-${s}" class="stat-input" value="${char.stats[s]||5}" min="2" max="8"
        oninput="onStatChange('${s}',this.value)">
      <div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--dim);margin-top:2px">${CPRED_DATA.statDescriptions[s]?.split('—')[0]||''}</div>
    </div>`).join('');
}

function updateStatInputValues() {
  CPRED_DATA.stats.forEach(s => {
    const el = document.getElementById('stat-' + s);
    if (el) el.value = char.stats[s] || 5;
  });
  updateDerivedStats();
}

function onStatChange(stat, val) {
  char.stats[stat] = parseInt(val) || 2;
  updateDerivedStats();
  updatePointsRemaining();
}

function updateDerivedStats() {
  const body = char.stats.BODY || 5;
  const emp = char.stats.EMP || 5;
  const hp = 10 + (5 * body);
  const sw = Math.ceil(hp / 2);
  document.getElementById('derived-hp').textContent = hp;
  document.getElementById('derived-sw').textContent = sw;
  document.getElementById('derived-ds').textContent = body;
  document.getElementById('derived-hum').textContent = emp * 10;
}

function updatePointsRemaining() {
  const total = 62;
  const used = CPRED_DATA.stats.reduce((sum, s) => sum + (parseInt(document.getElementById('stat-' + s)?.value) || 5), 0);
  const rem = total - used;
  const el = document.getElementById('stat-points-remaining');
  if (el) {
    el.textContent = 'Points Remaining: ' + rem;
    el.style.color = rem < 0 ? 'var(--red)' : rem === 0 ? 'var(--green)' : 'var(--gold)';
  }
}

function buildSkillInputTables() {
  const container = document.getElementById('skill-input-tables');
  const { eff } = effectiveStats(char);
  const autoMods = autoSkillModDetail(char);
  container.innerHTML = Object.entries(CPRED_DATA.skills).map(([cat, skills]) => `
    <div>
      <div class="cs-title" style="margin-bottom:8px">${cat}</div>
      <table class="skill-table">
        <thead><tr><th>Skill</th><th>Stat</th><th>Lvl</th><th title="Other modifiers">Other</th><th>Total</th></tr></thead>
        <tbody>
          ${skills.map(sk => `
            <tr>
              <td class="skill-name">${sk.name}${sk.specialty ? ' *' : ''}</td>
              <td class="skill-stat">${sk.stat}</td>
              <td><input type="number" id="skill-lvl-${safeName(sk.name)}" class="skill-lvl-input"
                value="${char.skills[sk.name]||0}" min="0" max="6"
                oninput="onSkillChange('${sk.name}','${sk.stat}',this.value)"></td>
              <td>${otherModInput(sk.name)}</td>
              <td class="skill-base" id="skill-base-${safeName(sk.name)}" data-skill-total="${sk.name}">
                ${skillTotal(char, sk, eff, autoSkillMod(autoMods, sk.name))}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
}

function onSkillChange(name, stat, val) {
  char.skills[name] = parseInt(val) || 0;
  updateSkillTotalCells(name);
  updateSkillPointsRemaining();
}

function updateSkillPointsRemaining() {
  const total = 86;
  let used = 0;
  Object.values(CPRED_DATA.skills).flat().forEach(sk => {
    const lvl = char.skills[sk.name] || 0;
    const mult = sk.name.includes('(x2)') ? 2 : 1;
    used += lvl * mult;
  });
  const rem = total - used;
  const el = document.getElementById('skill-points-remaining');
  if (el) {
    el.textContent = 'Points Remaining: ' + rem;
    el.style.color = rem < 0 ? 'var(--red)' : rem === 0 ? 'var(--green)' : 'var(--gold)';
  }
}

// ── Lifepath ───────────────────────────────────────────────────────
const lifepathDefs = [
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
  { key: 'lifepathNotes', label: 'Lifepath Notes', free: true },
];

// The Lifepath view's own textareas, and the keys they edit. Shared with
// FORM_FIELDS so the collect and populate sides can never drift apart.
const LP_VIEW_FIELDS = {
  'lp-friends':'lp_friends','lp-love':'lp_love','lp-enemies':'lp_enemies',
  'lp-goals':'lp_goals','lp-role-specific':'lp_roleSpecific'
};

// The same 13 keys are edited on three surfaces at once — the wizard's step 5,
// the Lifepath view and the Full Sheet — so each surface prefixes its element
// ids and a write updates all of them.
const LP_SURFACES = { 'lifepath-fields':'lp-', 'view-lifepath-grid':'vlp-', 'sheet-lifepath-grid':'slp-' };
const LP_PREFIXES = Object.values(LP_SURFACES);
// The wizard commits at Finish or Save; the other two have no such step, and the
// sheet tells the user every field on it saves automatically.
const LP_AUTOSAVE = ['vlp-', 'slp-'];
const lpSave = prefix => (LP_AUTOSAVE.includes(prefix) ? ';saveToLocalStorage()' : '');

// "Other" lets a player write their own background instead of taking a table
// entry. It is a select sentinel only: char.lifepath[key] always holds the
// literal text, and "is this custom?" is derived by asking whether the text is
// in the table. Storing a flag instead would mean migrating every character
// already on disk.
const LP_OTHER = '__other__';
function isCustomLifepath(def, val) {
  if (!def || !def.options || !val) return false;
  return !(CPRED_DATA.lifepath[def.options] || []).includes(val);
}
const lpEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Write-through: the inputs are rebuilt from char whenever a surface is
// re-entered, so an edit that only lived in the DOM was thrown away by the next
// rebuild (Back then Next was enough to lose it). Mirror into the other
// surfaces' live elements rather than re-rendering them — a rebuild would yank
// focus out of whichever box is being typed in.
function setLifepath(key, val) {
  char.lifepath[key] = val;
  const def = lifepathDefs.find(d => d.key === key);
  const custom = isCustomLifepath(def, val);
  LP_PREFIXES.forEach(p => {
    const el = document.getElementById(p + key);
    if (!el) return;
    const shown = def && def.options && custom ? LP_OTHER : val;
    if (el.value !== shown) el.value = shown;
    const box = document.getElementById(p + key + '-other');
    if (box) box.style.display = custom ? '' : 'none';
    const cust = document.getElementById(p + key + '-custom');
    if (cust && cust.value !== (custom ? val : '')) cust.value = custom ? val : '';
  });
}

// The select cannot hold text that is not one of its options, so picking Other
// hands the field to the box beside it. Any table entry that was selected is
// dropped rather than left behind looking like the player's own words.
function setLifepathChoice(key, prefix, sel) {
  if (sel !== LP_OTHER) { setLifepath(key, sel); return; }
  const def = lifepathDefs.find(d => d.key === key);
  setLifepath(key, isCustomLifepath(def, char.lifepath[key]) ? char.lifepath[key] : '');
  const el = document.getElementById(prefix + key);
  if (el) el.value = LP_OTHER;
  const box = document.getElementById(prefix + key + '-other');
  if (box) box.style.display = '';
  const cust = document.getElementById(prefix + key + '-custom');
  if (cust) cust.focus();
}

// One editor, rendered per surface. A value that matches no table entry comes
// back as Other with the text restored — that round trip is what makes a custom
// value survive re-renders instead of silently blanking the select.
function lifepathFieldHTML(def, prefix) {
  const val = char.lifepath[def.key] || '';
  if (def.free) return `
    <div class="lp-item">
      <div class="lp-label">${def.label}</div>
      <input id="${prefix}${def.key}" value="${lpEsc(val)}" placeholder="Enter or randomize..." style="font-size:12px" oninput="setLifepath('${def.key}',this.value)${lpSave(prefix)}">
    </div>`;
  const opts = CPRED_DATA.lifepath[def.options] || [];
  const custom = isCustomLifepath(def, val);
  return `
    <div class="lp-item">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div class="lp-label">${def.label}</div>
        <button class="random-btn" onclick="randomizeField('${def.key}','${def.options}')">🎲</button>
      </div>
      <select id="${prefix}${def.key}" style="font-size:12px" onchange="setLifepathChoice('${def.key}','${prefix}',this.value)${lpSave(prefix)}">
        <option value="">— Select —</option>
        ${opts.map(o => `<option value="${lpEsc(o)}" ${!custom && val === o ? 'selected' : ''}>${o}</option>`).join('')}
        <option value="${LP_OTHER}" ${custom ? 'selected' : ''}>Other…</option>
      </select>
      <div id="${prefix}${def.key}-other" style="margin-top:4px;display:${custom ? '' : 'none'}">
        <input id="${prefix}${def.key}-custom" value="${lpEsc(custom ? val : '')}" placeholder="Your own ${def.label.toLowerCase()}..." style="font-size:12px" oninput="setLifepath('${def.key}',this.value)${lpSave(prefix)}">
      </div>
    </div>`;
}

const lifepathGridHTML = prefix => lifepathDefs.map(def => lifepathFieldHTML(def, prefix)).join('');

// Full rebuild from char — for when the character changes under the UI, not for
// individual edits (setLifepath mirrors those without touching markup).
function renderLifepathEditors() {
  Object.entries(LP_SURFACES).forEach(([id, prefix]) => {
    const box = document.getElementById(id);
    if (box) box.innerHTML = lifepathGridHTML(prefix);
  });
}

function renderLifepathView() {
  renderLifepathEditors();
  Object.entries(LP_VIEW_FIELDS).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.value = char[key] || '';
  });
}

// Rolls only ever come off the real table, never Other; setLifepath then clears
// any custom text that field was carrying so the two cannot disagree. A roll is
// a committed edit and the Lifepath view has no Finish step, so it saves itself
// (the store write is debounced, so a Randomize All is still one write).
function randomizeField(key, optKey) {
  const opts = CPRED_DATA.lifepath[optKey] || [];
  setLifepath(key, opts[Math.floor(Math.random() * opts.length)] || '');
  saveToLocalStorage();
}

function randomizeAllLifepath() {
  lifepathDefs.forEach(def => { if (def.options) randomizeField(def.key, def.options); });
}

// The wizard's select holds a sentinel when the player chose Other, so the real
// value has to come from the box beside it.
function lifepathInputValue(def, prefix) {
  const el = document.getElementById(prefix + def.key);
  if (!el) return char.lifepath[def.key] || '';
  if (!def.options || el.value !== LP_OTHER) return el.value;
  const cust = document.getElementById(prefix + def.key + '-custom');
  return cust ? cust.value : '';
}

function collectLifepathData() {
  lifepathDefs.forEach(def => {
    if (document.getElementById('lp-' + def.key)) char.lifepath[def.key] = lifepathInputValue(def, 'lp-');
  });
}

// ── Relationships + role-specific lifepath (in creation and the sheet) ──
// The seed prompts below are original generic writing prompts to inspire a
// player's own answer — not the rulebook's tables.
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

// Original one-line seeds keyed to each Role's flavor
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

function buildLifepathRelationships() {
  const box = document.getElementById('lifepath-relationships');
  if (!box) return;
  const roleSeeds = LP_ROLE_SEEDS[char.role] || [];
  box.innerHTML = `
    <div class="lp-grid">
      ${LP_REL_FIELDS.map(f => `
        <div class="lp-item">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div class="lp-label">${f.label}</div>
            <button class="random-btn" onclick="seedLifepathRel('${f.key}')">🎲</button>
          </div>
          <textarea id="wlp-${f.key}" placeholder="${f.placeholder}" style="min-height:48px;font-size:12px" oninput="setLifepathRel('${f.key}',this.value)">${char[f.key] || ''}</textarea>
        </div>`).join('')}
      <div class="lp-item">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div class="lp-label">${char.role || 'Role'} Lifepath (role-specific)</div>
          <button class="random-btn" onclick="seedLifepathRole()">🎲</button>
        </div>
        <textarea id="wlp-lp_roleSpecific" placeholder="A defining event tied to being a ${char.role || 'edgerunner'}..." style="min-height:48px;font-size:12px" oninput="setLifepathRel('lp_roleSpecific',this.value)">${char.lp_roleSpecific || ''}</textarea>
      </div>
    </div>`;
}

// These five keys have two editors — the wizard's wlp-* textareas and the
// Lifepath view's lp-* ones. Writing one has to update char AND the other, or
// the stale twin wins the next collectAllFormData() and wipes the edit.
function setLifepathRel(key, val) {
  char[key] = val;
  const viewId = Object.keys(LP_VIEW_FIELDS).find(id => LP_VIEW_FIELDS[id] === key);
  ['wlp-' + key, viewId].forEach(id => {
    const el = id && document.getElementById(id);
    if (el && el.value !== val) el.value = val;
  });
}

function seedLifepathRel(key) {
  const f = LP_REL_FIELDS.find(x => x.key === key);
  if (!f) return;
  setLifepathRel(key, f.seeds[Math.floor(Math.random() * f.seeds.length)]);
}

function seedLifepathRole() {
  const seeds = LP_ROLE_SEEDS[char.role] || [];
  if (!seeds.length) return;
  setLifepathRel('lp_roleSpecific', seeds[Math.floor(Math.random() * seeds.length)]);
}

// ── Starting Gear ──────────────────────────────────────────────────
function buildStartingGearList() {
  const tmpl = CPRED_DATA.templates[char.role];
  if (!tmpl) return;
  const el = document.getElementById('starting-gear-list');
  el.innerHTML = `<div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--muted);line-height:2">
    ${tmpl.startingGear.map(g => `<div>✓ ${g}</div>`).join('')}
    <div style="margin-top:8px;color:var(--gold)">Starting eddies: €$ ${tmpl.startingEddies}</div>
  </div>`;
  // Apply to char
  if (!char.gear || char.gear.length === 0) {
    char.gear = tmpl.startingGear.map(g => ({ name: g, qty: 1 }));
  }
  char.eddies = tmpl.startingEddies;
  document.getElementById('c-eddies').value = tmpl.startingEddies;
}

function buildDoneSummary() {
  const el = document.getElementById('creation-done-summary');
  const hp = 10 + (5 * (char.stats.BODY || 5));
  el.innerHTML = `
    ${char.name} · "${char.handle}" · ${char.role}<br>
    HP: ${hp} | Humanity: ${(char.stats.EMP||5)*10} | Eddies: €$ ${char.eddies}<br>
    Role Ability: ${CPRED_DATA.roleAbilities[char.role]} Rank ${char.roleAbilityRank}`;
  char.maxHp = char.hp = hp;
  char.maxHumanity = char.humanity = (char.stats.EMP || 5) * 10;
  updateSidebarIdentity();
  syncTrackerFromChar();
  saveToLocalStorage();
}

// ── Stats View ─────────────────────────────────────────────────────
function renderStatsView() {
  const grid = document.getElementById('view-stat-grid');
  grid.innerHTML = CPRED_DATA.stats.map(s => `
    <div class="stat-box">
      <div class="stat-box-label">${s}</div>
      <div class="stat-box-val">${char.stats[s]||5}</div>
    </div>`).join('');

  document.getElementById('view-hp').textContent = char.maxHp || 40;
  document.getElementById('view-sw').textContent = Math.ceil((char.maxHp || 40) / 2);
  document.getElementById('view-ds').textContent = char.stats.BODY || 5;
  document.getElementById('view-hum').textContent = char.maxHumanity || 50;

  const skillsContainer = document.getElementById('view-skills-tables');
  skillsContainer.innerHTML = Object.entries(CPRED_DATA.skills).map(([cat, skills]) => `
    <div>
      <div class="cs-title" style="margin-bottom:6px">${cat}</div>
      <table class="skill-table">
        <thead><tr><th>Skill</th><th>LVL</th><th>STAT</th><th>BASE</th></tr></thead>
        <tbody>
          ${skills.map(sk => {
            const lvl = char.skills[sk.name] || 0;
            const base = (char.stats[sk.stat] || 5) + lvl;
            return `<tr style="${lvl > 0 ? 'background:rgba(0,229,255,0.04)' : ''}">
              <td class="skill-name" style="${lvl > 0 ? 'color:var(--neon)' : ''}">${sk.name}</td>
              <td style="text-align:center;font-family:'Orbitron',monospace;font-size:11px;color:${lvl > 0 ? 'var(--neon)' : 'var(--dim)'}">${lvl||'—'}</td>
              <td class="skill-stat">${sk.stat}</td>
              <td class="skill-base">${lvl > 0 ? base : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`).join('');

  document.getElementById('view-role-ability').textContent = CPRED_DATA.roleAbilities[char.role] || '—';
  document.getElementById('view-role-rank').textContent = 'Rank ' + (char.roleAbilityRank || 4);
}

// ── Tracker ────────────────────────────────────────────────────────
function syncTrackerFromChar() {
  document.getElementById('tracker-hp').textContent = char.hp || char.maxHp || 40;
  document.getElementById('tracker-maxhp').textContent = char.maxHp || 40;
  document.getElementById('tracker-hum').textContent = char.humanity || char.maxHumanity || 50;
  document.getElementById('tracker-maxhum').textContent = char.maxHumanity || 50;
  document.getElementById('tracker-eddies').textContent = (char.eddies || 0).toLocaleString();
  document.getElementById('tracker-ip').value = char.trackerIP || 0;
  document.getElementById('tracker-rep').value = char.rep || 0;
  updateHPBar();
  updateHumBar();
  buildWoundTrack();
  buildLuckPips();
}

function updateTracker() {
  syncTrackerFromChar();
  document.getElementById('tracker-crits').value = char.trackerCrits || '';
  document.getElementById('tracker-addictions').value = char.trackerAddictions || '';
  document.getElementById('tracker-rep-events').value = char.trackerRepEvents || '';
  document.getElementById('tracker-notes').value = char.trackerNotes || '';
}

function adjTrackerHP(delta) {
  char.hp = Math.max(0, Math.min(char.maxHp, (char.hp || char.maxHp) + delta));
  document.getElementById('tracker-hp').textContent = char.hp;
  updateHPBar();
}

function adjTrackerHPCustom() {
  const v = parseInt(document.getElementById('custom-hp-adj').value) || 0;
  adjTrackerHP(v);
  document.getElementById('custom-hp-adj').value = '';
}

function adjTrackerHum(delta) {
  char.humanity = Math.max(0, Math.min(char.maxHumanity, (char.humanity || char.maxHumanity) + delta));
  document.getElementById('tracker-hum').textContent = char.humanity;
  updateHumBar();
}

function adjEddies(delta) {
  char.eddies = Math.max(0, (char.eddies || 0) + delta);
  document.getElementById('tracker-eddies').textContent = char.eddies.toLocaleString();
}

function updateHPBar() {
  const pct = Math.max(0, Math.min(100, ((char.hp || 0) / (char.maxHp || 40)) * 100));
  const bar = document.getElementById('tracker-hp-bar');
  bar.style.width = pct + '%';
  bar.style.background = pct > 60 ? 'var(--green)' : pct > 30 ? 'var(--gold)' : 'var(--red)';
}

function updateHumBar() {
  const pct = Math.max(0, Math.min(100, ((char.humanity || 0) / (char.maxHumanity || 50)) * 100));
  const bar = document.getElementById('tracker-hum-bar');
  bar.style.width = pct + '%';
  bar.style.background = pct > 50 ? 'var(--green)' : pct > 25 ? 'var(--gold)' : 'var(--red)';
}

function buildWoundTrack() {
  const container = document.getElementById('tracker-wounds');
  container.innerHTML = [...Array(12)].map((_, i) => `
    <div class="wound-box ${i < (char.wounds||0) ? (i>=10?'mortal':'filled') : ''}"
      onclick="toggleWound(${i})" title="${i>=10?'Mortal Wound':'Wound '+( i+1)}"></div>`).join('');
}

function toggleWound(idx) {
  char.wounds = (char.wounds === idx + 1) ? idx : idx + 1;
  buildWoundTrack();
}

function buildLuckPips() {
  const container = document.getElementById('luck-pips');
  const max = char.stats.LUCK || 5;
  let current = char.luckCurrent !== undefined ? char.luckCurrent : max;
  container.innerHTML = [...Array(max)].map((_, i) => `
    <div onclick="toggleLuck(${i})" style="width:18px;height:18px;border-radius:50%;border:2px solid ${i < current ? 'var(--gold)' : 'var(--border)'};background:${i < current ? 'rgba(255,214,0,0.3)' : 'var(--mid)'};cursor:pointer;transition:all 0.1s"></div>`).join('');
}

function toggleLuck(idx) {
  char.luckCurrent = (char.luckCurrent === idx + 1) ? idx : idx + 1;
  buildLuckPips();
}

// ═══════════════════════════════════════════════════════════════════
// EQUIPMENT BROWSERS
// ═══════════════════════════════════════════════════════════════════

// ── Weapons ────────────────────────────────────────────────────────
function initWeaponBrowser() {
  const cats = Object.keys(CPRED_DATA.weapons);
  if (!activeWeaponCat) activeWeaponCat = cats[0];

  const tabs = document.getElementById('weapon-category-tabs');
  tabs.innerHTML = cats.map(c => `
    <button class="tab ${c===activeWeaponCat?'active':''}" onclick="setWeaponCat('${c}',this)">${c}</button>`).join('');

  renderWeaponList('', activeWeaponCat);
  renderEquippedWeapons();
}

function setWeaponCat(cat, el) {
  activeWeaponCat = cat;
  document.querySelectorAll('#weapon-category-tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderWeaponList('', cat);
}

function renderWeaponList(search, cat) {
  const items = (CPRED_DATA.weapons[cat] || []).filter(w =>
    !search || w.name.toLowerCase().includes(search.toLowerCase()));
  document.getElementById('weapon-list-display').innerHTML = items.map(w => `
    <div class="gear-item" onclick="addWeapon(${JSON.stringify(JSON.stringify(w))})">
      <div class="gear-item-name">${w.name}</div>
      <div class="gear-item-meta">
        <span class="badge badge-red">DMG ${w.damage}</span>
        <span class="badge badge-neon">ROF ${w.rof}</span>
        ${w.concealable?'<span class="badge badge-green">Concealable</span>':''}
        <span class="badge badge-gold">${w.cost}</span>
      </div>
      ${w.features ? `<div class="gear-item-desc">${w.features}</div>` : ''}
      <div class="gear-item-source">Source: ${w.source}</div>
    </div>`).join('') || '<div style="color:var(--dim);font-family:Share Tech Mono,monospace;font-size:11px;padding:12px">No results</div>';
}

function filterGear(type, val) {
  if (type === 'weapons') renderWeaponList(val, activeWeaponCat);
}

function addWeapon(wStr) {
  const w = JSON.parse(wStr);
  char.weapons.push({ ...w, ammo: '', notes: '' });
  renderEquippedWeapons();
  notify('Added: ' + w.name, 'success');
}

function renderEquippedWeapons() {
  const el = document.getElementById('equipped-weapons-list');
  if (!char.weapons.length) { el.innerHTML = '<div style="color:var(--dim);font-family:Share Tech Mono,monospace;font-size:11px;padding:8px">No weapons equipped</div>'; return; }
  el.innerHTML = char.weapons.map((w, i) => `
    <div class="gear-list-item" style="flex-direction:column;align-items:flex-start;gap:6px">
      <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
        <div class="gear-list-name" style="color:var(--neon);font-family:'Orbitron',monospace;font-size:10px">${w.name}</div>
        <button class="btn btn-xs btn-red" onclick="removeWeapon(${i})">✕</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="badge badge-red">DMG ${w.damage}</span>
        <span class="badge badge-neon">ROF ${w.rof}</span>
        <span class="badge badge-gold">${w.cost}</span>
      </div>
      <div style="display:flex;gap:8px;width:100%">
        <div class="field" style="flex:1"><label>Ammo</label><input value="${w.ammo||''}" oninput="char.weapons[${i}].ammo=this.value" placeholder="Type / Count" style="font-size:11px"></div>
        <div class="field" style="flex:2"><label>Notes</label><input value="${w.notes||''}" oninput="char.weapons[${i}].notes=this.value" placeholder="Mods, attachments..." style="font-size:11px"></div>
      </div>
    </div>`).join('');
}

function removeWeapon(idx) {
  char.weapons.splice(idx, 1);
  renderEquippedWeapons();
}

// ── Armor ──────────────────────────────────────────────────────────
function initArmorBrowser() {
  renderArmorList('');
  // Sync from char
  document.getElementById('armor-head').value = char.armor?.head || '';
  document.getElementById('armor-head-sp').value = char.armor?.headSP || 0;
  document.getElementById('armor-body').value = char.armor?.body || '';
  document.getElementById('armor-body-sp').value = char.armor?.bodySP || 0;
  document.getElementById('armor-shield').value = char.armor?.shield || '';
  document.getElementById('armor-shield-sp').value = char.armor?.shieldSP || 0;

  ['armor-head','armor-head-sp','armor-body','armor-body-sp','armor-shield','armor-shield-sp'].forEach(id => {
    document.getElementById(id).addEventListener('input', syncArmorFromForm);
  });
}

function syncArmorFromForm() {
  char.armor = {
    head: document.getElementById('armor-head').value,
    headSP: parseInt(document.getElementById('armor-head-sp').value) || 0,
    body: document.getElementById('armor-body').value,
    bodySP: parseInt(document.getElementById('armor-body-sp').value) || 0,
    shield: document.getElementById('armor-shield').value,
    shieldSP: parseInt(document.getElementById('armor-shield-sp').value) || 0
  };
}

function renderArmorList(search) {
  const items = CPRED_DATA.armor.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()));
  document.getElementById('armor-list-display').innerHTML = items.map(a => `
    <div class="gear-item" onclick="equipArmor(${JSON.stringify(JSON.stringify(a))})">
      <div class="gear-item-name">${a.name}</div>
      <div class="gear-item-meta">
        <span class="badge badge-neon">SP ${a.sp}</span>
        ${a.penalty ? `<span class="badge badge-red">Penalty ${a.penalty}</span>` : ''}
        <span class="badge badge-gold">${a.cost}</span>
      </div>
      <div class="gear-item-desc">${a.notes}</div>
      <div class="gear-item-source">Source: ${a.source}</div>
    </div>`).join('');
}

function filterArmorList(val) { renderArmorList(val); }

function equipArmor(aStr) {
  const a = JSON.parse(aStr);
  const isHead = a.notes.toLowerCase().includes('head');
  const isShield = a.notes.toLowerCase().includes('shield');
  if (isShield) {
    char.armor.shield = a.name; char.armor.shieldSP = a.sp;
    document.getElementById('armor-shield').value = a.name;
    document.getElementById('armor-shield-sp').value = a.sp;
  } else if (isHead) {
    char.armor.head = a.name; char.armor.headSP = a.sp;
    document.getElementById('armor-head').value = a.name;
    document.getElementById('armor-head-sp').value = a.sp;
  } else {
    char.armor.body = a.name; char.armor.bodySP = a.sp;
    document.getElementById('armor-body').value = a.name;
    document.getElementById('armor-body-sp').value = a.sp;
  }
  notify('Equipped: ' + a.name, 'success');
}

// ── Cyberware ──────────────────────────────────────────────────────
function initCWBrowser() {
  const cats = Object.keys(CPRED_DATA.cyberware);
  if (!activeCWCat) activeCWCat = cats[0];

  const tabs = document.getElementById('cw-category-tabs');
  tabs.innerHTML = cats.map(c => `
    <button class="tab ${c===activeCWCat?'active':''}" onclick="setCWCat('${c}',this)">${c.replace('Cyber','')}</button>`).join('');

  renderCWList('', activeCWCat);
  renderInstalledCW();
}

function setCWCat(cat, el) {
  activeCWCat = cat;
  document.querySelectorAll('#cw-category-tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderCWList('', cat);
}

function renderCWList(search, cat) {
  const items = (CPRED_DATA.cyberware[cat] || []).filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()));
  document.getElementById('cw-list-display').innerHTML = items.map(c => `
    <div class="gear-item" onclick="installCW(${JSON.stringify(JSON.stringify(c))})">
      <div class="gear-item-name">${c.name}</div>
      <div class="gear-item-meta">
        <span class="badge badge-gold">${c.cost}</span>
        <span class="badge badge-red">HL: ${c.hl}</span>
        <span class="badge badge-neon">Install: ${c.install}</span>
      </div>
      <div class="gear-item-desc">${c.description}</div>
      <div class="gear-item-source">Source: ${c.source}</div>
    </div>`).join('') || '<div style="color:var(--dim);font-family:Share Tech Mono,monospace;font-size:11px;padding:12px">No results</div>';
}

function filterCyberwareList(val) { renderCWList(val, activeCWCat); }

function installCW(cStr) {
  const cw = JSON.parse(cStr);
  char.cyberware.push(cw);
  renderInstalledCW();
  notify('Installed: ' + cw.name, 'success');
}

function renderInstalledCW() {
  const el = document.getElementById('cw-installed-list');
  if (!char.cyberware.length) { el.innerHTML = '<div style="color:var(--dim);font-size:11px;font-family:Share Tech Mono,monospace;padding:8px">No cyberware installed</div>'; }
  else {
    el.innerHTML = char.cyberware.map((c, i) => `
      <div class="gear-list-item">
        <div style="flex:1;min-width:0">
          <div style="font-family:'Orbitron',monospace;font-size:9px;color:var(--neon)">${c.name}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--dim)">HL: ${c.hl} | ${c.install}</div>
        </div>
        <button class="btn btn-xs btn-red" onclick="removeCW(${i})">✕</button>
      </div>`).join('');
  }

  // Total HL
  let totalHL = 0;
  char.cyberware.forEach(c => {
    const m = c.hl.match(/\d+/);
    if (m) totalHL += parseInt(m[0]);
  });
  document.getElementById('total-hl').textContent = totalHL;
  const maxHum = (char.stats.EMP || 5) * 10;
  document.getElementById('current-humanity').textContent = Math.max(0, maxHum - totalHL);
}

function removeCW(idx) { char.cyberware.splice(idx, 1); renderInstalledCW(); }

// ── General Gear ───────────────────────────────────────────────────
function initGearBrowser() {
  const cats = Object.keys(CPRED_DATA.gear);
  if (!activeGearCat) activeGearCat = cats[0];

  const tabs = document.getElementById('gear-category-tabs');
  tabs.innerHTML = cats.map(c => `
    <button class="tab ${c===activeGearCat?'active':''}" onclick="setGearCat('${c}',this)">${c}</button>`).join('');

  renderGearList('', activeGearCat);
  renderCarriedGear();

  // Sync fields
  document.getElementById('ammo-notes').value = char.ammoNotes || '';
  document.getElementById('char-cash').value = char.cash || char.eddies || 500;
  document.getElementById('char-fashion').value = char.fashion || '';
  document.getElementById('char-housing').value = char.housing || '';
  document.getElementById('char-rent').value = char.rent || '';
  document.getElementById('char-lifestyle').value = char.lifestyle || '';
}

function setGearCat(cat, el) {
  activeGearCat = cat;
  document.querySelectorAll('#gear-category-tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderGearList('', cat);
}

function renderGearList(search, cat) {
  const items = (CPRED_DATA.gear[cat] || []).filter(g =>
    !search || g.name.toLowerCase().includes(search.toLowerCase()));
  document.getElementById('gear-list-display').innerHTML = items.map(g => `
    <div class="gear-item" onclick="addGearItem(${JSON.stringify(JSON.stringify(g))})">
      <div class="gear-item-name">${g.name}</div>
      <div class="gear-item-meta">
        <span class="badge badge-gold">${g.cost}</span>
      </div>
      <div class="gear-item-desc">${g.description}</div>
      <div class="gear-item-source">Source: ${g.source}</div>
    </div>`).join('') || '<div style="color:var(--dim);font-family:Share Tech Mono,monospace;font-size:11px;padding:12px">No results</div>';
}

function filterGearList(val) { renderGearList(val, activeGearCat); }

function addGearItem(gStr) {
  const g = JSON.parse(gStr);
  const existing = char.gear.find(i => i.name === g.name);
  if (existing) existing.qty = (existing.qty || 1) + 1;
  else char.gear.push({ name: g.name, qty: 1, notes: '' });
  renderCarriedGear();
  notify('Added: ' + g.name, 'success');
}

function renderCarriedGear() {
  const el = document.getElementById('carried-gear-list');
  if (!char.gear.length) { el.innerHTML = '<div style="color:var(--dim);font-size:11px;font-family:Share Tech Mono,monospace;padding:8px">No gear carried</div>'; return; }
  el.innerHTML = char.gear.map((g, i) => `
    <div class="gear-list-item">
      <div class="gear-list-name">${g.name}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <button style="background:transparent;border:1px solid var(--border);color:var(--muted);padding:1px 5px;cursor:pointer;border-radius:2px" onclick="adjGearQty(${i},-1)">−</button>
        <span class="gear-qty">${g.qty||1}</span>
        <button style="background:transparent;border:1px solid var(--border);color:var(--muted);padding:1px 5px;cursor:pointer;border-radius:2px" onclick="adjGearQty(${i},+1)">+</button>
        <button class="btn btn-xs btn-red" onclick="removeGear(${i})">✕</button>
      </div>
    </div>`).join('');
}

function adjGearQty(idx, delta) {
  char.gear[idx].qty = Math.max(0, (char.gear[idx].qty || 1) + delta);
  if (char.gear[idx].qty === 0) char.gear.splice(idx, 1);
  renderCarriedGear();
}

function removeGear(idx) { char.gear.splice(idx, 1); renderCarriedGear(); }

// ── Netrunning ─────────────────────────────────────────────────────
function initNetBrowser() {
  const cats = Object.keys(CPRED_DATA.netPrograms);
  if (!activeNetCat) activeNetCat = cats[0];

  const tabs = document.getElementById('net-category-tabs');
  tabs.innerHTML = cats.map(c => `
    <button class="tab ${c===activeNetCat?'active':''}" onclick="setNetCat('${c}',this)">${c}</button>`).join('');

  renderNetList('', activeNetCat);
  renderLoadedPrograms();

  document.getElementById('net-deck-name').value = char.netDeck || '';
  document.getElementById('net-deck-cost').value = char.netDeckCost || '';
  document.getElementById('net-slots-u').value = char.netSlotsU || 7;
  document.getElementById('net-slots-p').value = char.netSlotsP || 0;
  document.getElementById('net-slots-h').value = char.netSlotsH || 0;
  document.getElementById('net-hardware').value = char.netHardware || '';
  document.getElementById('net-stealth-notes').value = char.netStealthNotes || '';
}

function setNetCat(cat, el) {
  activeNetCat = cat;
  document.querySelectorAll('#net-category-tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderNetList('', cat);
}

function renderNetList(search, cat) {
  const items = (CPRED_DATA.netPrograms[cat] || []).filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()));
  document.getElementById('net-list-display').innerHTML = items.map(p => `
    <div class="gear-item" onclick="addNetProgram(${JSON.stringify(JSON.stringify(p))})">
      <div class="gear-item-name">${p.name}</div>
      <div class="gear-item-meta">
        ${p.damage ? `<span class="badge badge-red">DMG: ${p.damage}</span>` : ''}
        ${p.effect ? `<span class="badge badge-neon">${p.effect}</span>` : ''}
        ${p.type ? `<span class="badge badge-gold">${p.type}</span>` : ''}
        <span class="badge badge-gold">${p.cost}</span>
      </div>
      <div class="gear-item-desc">${p.description}</div>
      <div class="gear-item-source">Source: ${p.source}</div>
    </div>`).join('') || '<div style="color:var(--dim);font-family:Share Tech Mono,monospace;font-size:11px;padding:12px">No results</div>';
}

function filterNetList(val) { renderNetList(val, activeNetCat); }

function addNetProgram(pStr) {
  const p = JSON.parse(pStr);
  if (!char.netPrograms) char.netPrograms = [];
  char.netPrograms.push(p);
  renderLoadedPrograms();
  notify('Loaded: ' + p.name, 'success');
}

function renderLoadedPrograms() {
  const el = document.getElementById('net-programs-loaded');
  if (!char.netPrograms || !char.netPrograms.length) {
    el.innerHTML = '<div style="color:var(--dim);font-size:11px;font-family:Share Tech Mono,monospace">No programs loaded</div>'; return;
  }
  el.innerHTML = char.netPrograms.map((p, i) => `
    <div class="gear-list-item">
      <div style="flex:1"><div style="font-family:'Orbitron',monospace;font-size:9px;color:var(--neon)">${p.name}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--dim)">${p.type||'Program'} | ${p.cost}</div></div>
      <button class="btn btn-xs btn-red" onclick="removeNetProgram(${i})">✕</button>
    </div>`).join('');
}

function removeNetProgram(idx) { char.netPrograms.splice(idx, 1); renderLoadedPrograms(); }

// ═══════════════════════════════════════════════════════════════════
// SAVE / LOAD / EXPORT
// ═══════════════════════════════════════════════════════════════════
// Every id here is read back into char on every save/export, from whatever
// section it lives in — so populateAllForms() must repopulate ALL of them when
// a character is loaded. A field left holding the previous character's text
// (or the blank it was built with) is written straight back over the loaded
// one on the next save, which is how lifepath, netdeck, lifestyle and tracker
// notes were silently reverting.
const FORM_FIELDS = {
  'c-name':'name','c-handle':'handle','c-age':'age','c-gender':'gender',
  'c-aliases':'aliases','c-rep':'rep','c-eddies':'eddies','c-notes':'notes',
  ...LP_VIEW_FIELDS,
  'net-deck-name':'netDeck','net-deck-cost':'netDeckCost',
  'net-hardware':'netHardware','net-stealth-notes':'netStealthNotes',
  'ammo-notes':'ammoNotes','char-cash':'cash','char-fashion':'fashion',
  'char-housing':'housing','char-rent':'rent','char-lifestyle':'lifestyle',
  'tracker-crits':'trackerCrits','tracker-addictions':'trackerAddictions',
  'tracker-notes':'trackerNotes','tracker-rep-events':'trackerRepEvents'
};

function collectAllFormData() {
  Object.entries(FORM_FIELDS).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) char[key] = el.type === 'number' ? parseInt(el.value)||0 : el.value;
  });
  // Only pull the wizard's own inputs while the creation wizard is actually the
  // active view. They stay in the DOM behind the Full Sheet, so otherwise the
  // stale stats (default 5s) and stale lp-* fields clobber sheet edits.
  if (activeSection === 'creation') {
    collectLifepathData();
    if (!char.stats) char.stats = {};
    CPRED_DATA.stats.forEach(s => {
      const el = document.getElementById('stat-' + s);
      if (el) char.stats[s] = parseInt(el.value) || 5;
    });
  }
}

// Backfill any fields a loaded/imported/older character is missing so the
// sheet renders and edits persist (protects against undefined stats etc.)
function normalizeChar(c) {
  const b = newBlankChar();
  Object.keys(b).forEach(k => { if (c[k] === undefined || c[k] === null) c[k] = b[k]; });
  if (typeof c.stats !== 'object' || Array.isArray(c.stats)) c.stats = { ...b.stats };
  CPRED_DATA.stats.forEach(s => { if (typeof c.stats[s] !== 'number') c.stats[s] = c.stats[s] ? parseInt(c.stats[s]) || 5 : 5; });
  if (typeof c.skills !== 'object' || Array.isArray(c.skills)) c.skills = {};
  if (typeof c.skillMods !== 'object' || Array.isArray(c.skillMods)) c.skillMods = {};
  if (typeof c.lifepath !== 'object' || Array.isArray(c.lifepath)) c.lifepath = {};
  ['weapons', 'cyberware', 'gear', 'vehicles', 'netPrograms', 'medtechDrugs'].forEach(k => { if (!Array.isArray(c[k])) c[k] = []; });
  if (typeof c.armor !== 'object' || Array.isArray(c.armor)) c.armor = { ...b.armor };
  return c;
}

function saveToLocalStorage() {
  // Characters opened from the pcs/npcs folder store (e.g. via the Session
  // Tracker's Full Sheet button) save back to their folder, not localStorage
  if (ipc && (char._kind === 'pcs' || char._kind === 'npcs')) {
    callIPC('store-save', char._kind, char);
    return;
  }
  const existing = savedChars.findIndex(c => c.id === char.id);
  if (existing >= 0) savedChars[existing] = char;
  else savedChars.push(char);
  localStorage.setItem('cpred_chars', JSON.stringify(savedChars));
}

// "Save" writes the character to its one file in the app's character folder.
// Exporting a portable copy somewhere else is a separate, explicit action —
// saving must never produce a second file for the same character.
async function saveCharacter() {
  collectAllFormData();
  saveToLocalStorage();
  if (!ipc) { notify('Saved to browser storage', 'success'); return; }
  const kind = char._kind === 'npcs' ? 'npcs' : 'pcs';
  cancelQueuedStoreSave(char.id);   // the queued write would only repeat this one
  const r = await callIPC('store-save', kind, char);
  if (r.success) {
    char._kind = kind;
    if (r.file) char._file = r.file;
    notify('Saved ' + (char.name || 'character') + ' → ' + kind + '/' + r.file, 'success');
  } else notify('Save failed: ' + r.error, 'error');
}

// Export a standalone .cpred copy to a folder of the user's choosing. This is
// a copy for sharing/backup — the character's own file stays in the store.
async function exportCharacterFile() {
  collectAllFormData();
  const result = await callIPC('save-character', char);
  if (result.success) notify('Exported copy: ' + result.path, 'success');
  else if (result.error) notify('Export failed: ' + result.error, 'error');
}

async function loadCharacter() {
  const result = await callIPC('load-character');
  if (result.success && result.character) {
    char = normalizeChar(result.character);
    populateAllForms();
    notify('Loaded: ' + char.name, 'success');
  } else if (result.error) {
    notify('Load failed: ' + result.error, 'error');
  }
}

function populateAllForms() {
  // The whole harvest map, not just the identity fields — see FORM_FIELDS.
  // ?? rather than || so a legitimate 0 (rep, cash) still shows.
  Object.entries(FORM_FIELDS).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.value = char[key] ?? '';
  });
  renderLifepathView();          // rebuilds the wizard's lp-* inputs from the loaded char
  buildLifepathRelationships();  // and its relationship textareas
  updateSidebarIdentity();
  updateStatInputValues();     // keep the wizard's stat inputs in sync with the loaded char
  if (char.portrait) {
    document.getElementById('portrait-img').src = char.portrait;
    document.getElementById('portrait-img').style.display = 'block';
    document.getElementById('portrait-placeholder').style.display = 'none';
  } else {
    document.getElementById('portrait-img').style.display = 'none';
    document.getElementById('portrait-placeholder').style.display = 'flex';
  }
  syncTrackerFromChar();
}

// ═══════════════════════════════════════════════════════════════════
// PRINT / PDF CHARACTER SHEET
// ═══════════════════════════════════════════════════════════════════
// Built from `char`, never from the Full Sheet's DOM. The Full Sheet is an
// editor — every value there is an <input>, every list has a ✕ button, and the
// whole thing is prefaced by a "click any dashed-underline value" hint — so the
// old innerHTML scrape printed form widgets and UI copy instead of a character
// sheet. Rebuilding from the character makes the export typeset text by
// construction; there is no chrome left to strip.
//
// Format follows the official R. Talsorian sheet (Character Sheet.pdf is
// 828×648pt, DataPack is 792×612 — both LANDSCAPE): white stock, one red
// accent, hairline keylines, condensed all-caps labels sitting over black
// values, and a four-column flow so the page packs full instead of leaving the
// bottom third empty.

const psEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// An empty field prints as a rule to write on, the way the paper sheet does —
// a page of "—" reads as broken data rather than as a blank to fill in.
const psVal = v => (v === 0 || (v && String(v).trim())) ? psEsc(v) : '<i class="bl"></i>';
// n write-on rules — what the paper sheet prints where there is nothing to say yet
const psRules = n => `<div class="fill">${'<i></i>'.repeat(n)}</div>`;

function psStyles() {
  return `
  /* Letter LANDSCAPE, matching the official sheet's orientation. Margins are
     tight because the whole point is density; preferCSSPageSize in main.js
     makes this @page authoritative rather than the printer's own default. */
  @page{size:11in 8.5in;margin:.24in .28in .20in}
  *{box-sizing:border-box;margin:0;padding:0}
  /* No webfont link: the export renders in an offscreen window that may have no
     network. Bahnschrift ships with Windows and is the closest stock face to the
     sheet's condensed techno labels; the stack degrades to Arial Narrow / DIN. */
  :root{
    --ink:#0c0d11; --red:#c8102e; --rule:#98a1ae; --hair:#d3d8e0;
    --soft:#eef0f4; --mute:#5d6470;
    --sans:'Bahnschrift','Segoe UI',Arial,Helvetica,sans-serif;
    --cond:'Bahnschrift SemiCondensed','Bahnschrift','Arial Narrow','DIN Condensed',var(--sans);
    --num:'Consolas','Roboto Mono','Courier New',monospace;
  }
  html,body{background:#fff;color:var(--ink);font-family:var(--sans);font-size:8pt;line-height:1.28;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}

  /* ── masthead ─────────────────────────────────────────────── */
  .mast{display:flex;gap:8px;align-items:stretch;border:1.2pt solid var(--ink);
    border-left:4.5pt solid var(--red);padding:3px 7px;margin-bottom:6px}
  .mug{width:50px;height:50px;object-fit:cover;border:1pt solid var(--ink);flex:0 0 50px;align-self:center}
  .mug-x{width:50px;height:50px;border:1pt solid var(--hair);flex:0 0 50px;align-self:center}
  .who{flex:1 1 auto;min-width:0;align-self:center}
  .who h1{font-family:var(--cond);font-size:17pt;font-weight:700;line-height:1;letter-spacing:.2px;
    text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .who .alias{font-family:var(--cond);font-size:8pt;color:var(--red);letter-spacing:.6px;margin-top:1px}
  .who .meta{font-family:var(--cond);font-size:6pt;color:var(--mute);letter-spacing:.5px;
    text-transform:uppercase;margin-top:2px}
  .role-chip{display:inline-block;background:var(--red);color:#fff;font-family:var(--cond);font-size:8pt;
    font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:1px 7px;vertical-align:2px}
  /* Numbers the GM calls for constantly, kept on the top edge like the paper sheet. */
  .vitals{display:flex;gap:0;align-self:stretch;flex:0 0 auto}
  .vital{border-left:.6pt solid var(--rule);padding:1px 6px;text-align:center;min-width:48px;
    display:flex;flex-direction:column;justify-content:center}
  .vital b{font-family:var(--num);font-size:11pt;font-weight:700;line-height:1;display:block}
  .vital span{font-family:var(--cond);font-size:6pt;letter-spacing:.8px;color:var(--mute);
    text-transform:uppercase;display:block;margin-top:2px;white-space:nowrap}
  .vital.hot b{color:var(--red)}

  /* ── the four-column flow ─────────────────────────────────── */
  .flow{columns:4;column-gap:11px;column-rule:.4pt solid var(--hair)}
  section{break-inside:avoid;margin-bottom:7px}
  section.run{break-inside:auto}          /* skills are allowed to continue in the next column */
  h2{font-family:var(--cond);font-size:8pt;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;
    background:var(--ink);color:#fff;padding:1.5px 5px;break-after:avoid;margin-bottom:3px}
  /* The category rule already spans the column, so the column legend rides on
     its empty right-hand end — every category carries its own "STAT LVL BASE"
     for free, the way the printed sheet does, instead of one legend at the top
     that a reader three columns away can no longer see. */
  h3{display:flex;justify-content:space-between;align-items:baseline;
    font-family:var(--cond);font-size:7pt;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;
    color:var(--red);border-bottom:.8pt solid var(--red);margin:3px 0 1px;break-after:avoid}
  h3:first-child{margin-top:0}
  h3 u{font-size:6pt;font-weight:400;letter-spacing:.6px;color:var(--rule);text-decoration:none;
    flex:0 0 auto;padding-left:6px}

  /* generic label/value row: label left in condensed caps, value right */
  .r{display:flex;justify-content:space-between;gap:5px;align-items:baseline;
    border-bottom:.4pt solid var(--hair);padding:.8px 0;break-inside:avoid}
  .r>.k{font-family:var(--cond);font-size:7pt;letter-spacing:.5px;text-transform:uppercase;color:var(--mute);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .r>.v{font-family:var(--num);font-size:8pt;font-weight:700;white-space:nowrap}
  .r.wide>.k{flex:0 0 auto}
  .r.wide>.v{white-space:normal;text-align:right;min-width:0}
  .bl{display:inline-block;width:34px;border-bottom:.6pt solid var(--rule);height:7px}
  .lp .v .bl,.note .bl{display:block;width:100%;height:8px}

  /* stat ladder — mirrors the official sheet's left rail */
  .stat{display:flex;align-items:center;gap:4px;border-bottom:.4pt solid var(--hair);padding:1px 0}
  .stat .n{font-family:var(--cond);font-size:8pt;font-weight:700;letter-spacing:1.4px;flex:1 1 auto}
  .stat .b{font-family:var(--num);font-size:11pt;font-weight:700;min-width:17px;text-align:center;
    border:.7pt solid var(--ink);line-height:1.15}
  .stat .e{font-family:var(--cond);font-size:6pt;color:var(--red);text-align:right;white-space:nowrap}
  .stat.up .n{color:var(--red)}

  /* skills — name, linked stat, level, and the number you actually roll against */
  .sk{display:flex;align-items:baseline;gap:3px;padding:0;border-bottom:.35pt solid var(--hair);
    break-inside:avoid;font-size:7pt;line-height:1.18}
  .sk .nm{flex:1 1 auto;font-family:var(--cond);letter-spacing:.1px;white-space:nowrap;overflow:hidden;
    text-overflow:ellipsis;color:var(--mute)}
  .sk .st{font-family:var(--cond);font-size:6pt;color:var(--rule);width:22px;text-align:right;letter-spacing:.4px}
  .sk .lv{font-family:var(--num);width:11px;text-align:right;color:var(--rule)}
  .sk .bs{font-family:var(--num);font-weight:700;width:15px;text-align:right;color:var(--rule)}
  .sk.on .nm{color:var(--ink);font-weight:600}
  .sk.on .st{color:var(--mute)}
  .sk.on .lv{color:var(--ink)}
  .sk.on .bs{color:var(--red)}
  .sk .spec{font-style:italic;color:var(--red)}
  .skcat{break-inside:avoid;-webkit-column-break-inside:avoid}

  /* one-line item rows: twelve pieces of cyberware at two lines each is most of
     a column spent on the words "HL" */
  .cw{display:flex;justify-content:space-between;gap:4px;align-items:baseline;
    border-bottom:.4pt solid var(--hair);padding:.3px 0;break-inside:avoid}
  .cw .n{font-family:var(--cond);font-size:7pt;flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cw .h{font-family:var(--num);font-size:6pt;color:var(--mute);white-space:nowrap}

  /* two-line item blocks (weapons, vehicles) — the narrow-column pattern the
     official DataPack sheet uses, so nothing needs a wide table */
  .it{break-inside:avoid;padding:1.5px 0;border-bottom:.4pt solid var(--hair)}
  .it .t{font-family:var(--cond);font-size:8pt;font-weight:700;letter-spacing:.3px;text-transform:uppercase}
  .it .d{font-family:var(--num);font-size:6pt;color:var(--mute);line-height:1.25}
  .it .d b{color:var(--ink)}
  .it .up{font-family:var(--cond);font-size:6pt;color:var(--red);line-height:1.25}

  .gear{font-family:var(--cond);font-size:7pt;line-height:1.45}
  .gear span{display:block;border-bottom:.35pt solid var(--hair)}
  .gear i{font-style:normal;font-family:var(--num);float:right;font-weight:700}

  .lp{break-inside:avoid;border-bottom:.4pt solid var(--hair);padding:.5px 0;line-height:1.2}
  .lp .k{font-family:var(--cond);font-size:6pt;letter-spacing:.7px;text-transform:uppercase;color:var(--red);display:block}
  .lp .v{font-family:var(--cond);font-size:7pt;line-height:1.15;display:block}
  .note{font-size:7pt;line-height:1.35;white-space:pre-wrap}
  .fill i{display:block;height:${PS_PAGE.line - 1}px;border-bottom:.4pt solid var(--hair);break-inside:avoid}
  .fine{font-family:var(--cond);font-size:6pt;color:var(--mute);letter-spacing:.3px;margin-top:2px}
  `;
}

// A skill category that runs past a column boundary arrives in the next column
// with no heading on it, and CSS cannot repeat a heading across a column break.
// Categories therefore stay whole (break-inside:avoid) — but Education has 16
// skills and Technique 15, and holding blocks that tall together wastes about a
// fifth of the page in packing slack. So long categories are pre-split into
// labelled chunks small enough to place freely, which is the same "Education
// Skills … Education Skills" continuation the printed RTG sheet uses.
const PS_CHUNK = 6;
function psSkillChunks(cat, list) {
  const n = Math.ceil(list.length / PS_CHUNK) || 1;
  const per = Math.ceil(list.length / n);
  return Array.from({ length: n }, (_, i) => ({
    label: i ? cat + ' cont.' : cat,
    cont: i > 0,
    rows: list.slice(i * per, (i + 1) * per)
  })).filter(c => c.rows.length);
}

// The whole PDF payload for one character: a standalone document with no
// scripts, no form controls and no app stylesheet.
function buildPrintSheetHTML(c, fit = {}) {
  const { eff, statMods } = effectiveStats(c);
  const autoMods = autoSkillModDetail(c);
  const hp = 10 + 5 * (eff.BODY || 5);
  const cur = c.hp !== undefined ? c.hp : hp;
  const hl = totalHL(c);
  const hum = currentHumanity(c);
  const maxHum = (c.stats.EMP || 5) * 10;
  const det = CPRED_DATA.roleAbilityDetails[c.role] || {};

  const vital = (label, value, hot) =>
    `<div class="vital${hot ? ' hot' : ''}"><b>${psEsc(value)}</b><span>${psEsc(label)}</span></div>`;
  const row = (k, v) => `<div class="r"><span class="k">${psEsc(k)}</span><span class="v">${psVal(v)}</span></div>`;

  // ── masthead ──
  const meta = [c.age ? 'Age ' + c.age : '', c.gender, c.aliases ? 'AKA ' + c.aliases : '']
    .filter(Boolean).map(psEsc).join(' · ');
  const mast = `<div class="mast">
    ${c.portrait ? `<img class="mug" src="${psEsc(c.portrait)}">` : '<div class="mug-x"></div>'}
    <div class="who">
      <h1>${psEsc(c.name || 'Unnamed Edgerunner')}</h1>
      <div class="alias">${c.handle ? '&ldquo;' + psEsc(c.handle) + '&rdquo; &nbsp;' : ''}<span class="role-chip">${psEsc(c.role || '—')}</span></div>
      ${meta ? `<div class="meta">${meta}</div>` : ''}
    </div>
    <div class="vitals">
      ${vital('HP now', cur, cur <= Math.ceil(hp / 2))}
      ${vital('HP max', hp)}
      ${vital('Ser. wounded', Math.ceil(hp / 2))}
      ${vital('Death save', eff.BODY || 5)}
      ${vital('Humanity', hum + '/' + maxHum, hum < 20)}
      ${vital('Reputation', c.rep || 0)}
      ${vital('IP', c.trackerIP || 0)}
      ${vital('Eddies', '€$' + (c.eddies || 0))}
    </div>
  </div>`;

  // ── stats ──
  const stats = `<section><h2>Stats</h2>
    ${CPRED_DATA.stats.map(s => {
      const b = c.stats[s] || 5, e = eff[s] || b, d = (statMods[s] || 0);
      return `<div class="stat${d ? ' up' : ''}"><span class="n">${s}</span>
        <span class="e">${d ? `base ${b}` : ''}</span><span class="b">${e}</span></div>`;
    }).join('')}
  </section>`;

  // ── role ability ──
  const subs = (CPRED_DATA.roleSubAbilities[c.role] && c.roleSubRanks)
    ? CPRED_DATA.roleSubAbilities[c.role].subs
        .filter(([n]) => (c.roleSubRanks[n] || 0) > 0)
        .map(([n]) => `${n} ${c.roleSubRanks[n]}`).join(' · ')
    : '';
  // The full rules text runs to a paragraph; on a sheet you want the reminder,
  // not the rulebook. Cut at the last sentence end that fits, or failing that
  // the last clause, so it never stops mid-phrase on a dangling "and it".
  const how = (() => {
    const t = (det.how || '').trim();
    if (t.length <= 175) return t;
    const head = t.slice(0, 175);
    const at = Math.max(head.lastIndexOf('. '), head.lastIndexOf('; '));
    if (at > 60) return head.slice(0, at + 1);
    const comma = head.lastIndexOf(', ');
    return (comma > 60 ? head.slice(0, comma) : head.replace(/\s\S*$/, '')) + '…';
  })();
  const role = `<section><h2>Role Ability</h2>
    ${row(det.name || c.role || 'Role', 'Rank ' + (c.roleAbilityRank || 4))}
    ${subs ? `<div class="lp"><div class="k">Specialties</div><div class="v">${psEsc(subs)}</div></div>` : ''}
    ${how ? `<div class="fine">${psEsc(how)}</div>` : ''}
  </section>`;

  // ── skills: every skill, the way the printed sheet lists them ──
  const skills = `<section class="run"><h2>Skills</h2>
    <div class="fine" style="margin:0 0 2px">BASE = effective STAT + LVL + every equipment, role and manual modifier. Roll 1d10 + BASE.</div>
    ${Object.entries(CPRED_DATA.skills).flatMap(([cat, list]) => psSkillChunks(cat, list)).map(({ label, cont, rows }, ci) => `
      <div class="skcat">${!cont || !fit.keepLabels || fit.keepLabels.has(ci)
        ? `<h3>${psEsc(label)}<u>Stat &nbsp;Lvl &nbsp;Base</u></h3>` : ''}
      ${rows.map(sk => {
        const lvl = c.skills[sk.name] || 0;
        const mod = autoSkillMod(autoMods, sk.name) + otherSkillMod(c, sk.name);
        const base = (eff[sk.stat] || 5) + lvl + mod;
        const on = lvl > 0 || mod !== 0;
        const spec = (c.skillSpecs && c.skillSpecs[sk.name]) || '';
        return `<div class="sk${on ? ' on' : ''}"><span class="nm">${psEsc(sk.name)}${spec ? ` <span class="spec">${psEsc(spec)}</span>` : ''}</span>
          <span class="st">${sk.stat}</span><span class="lv">${lvl || '·'}</span><span class="bs">${on ? base : '·'}</span></div>`;
      }).join('')}</div>`).join('')}
  </section>`;

  // ── weapons / armor ──
  const weapons = `<section><h2>Weapons</h2>
    ${c.weapons.length ? c.weapons.map(w => `<div class="it">
      <div class="t">${psEsc(w.name)}</div>
      <div class="d"><b>${psEsc(w.damage || '—')}</b> dmg · ROF ${psEsc(w.rof || '—')} · Ammo ${psVal(w.ammo)}${w.notes ? '<br>' + psEsc(w.notes) : ''}</div>
    </div>`).join('') : psRules(4)}
  </section>
  <section><h2>Armor</h2>
    ${['head', 'body', 'shield'].map(k => {
      const sp = c.armor && c.armor[k + 'SP'];
      return `<div class="r wide"><span class="k">${k}${sp ? ' &nbsp;SP ' + sp : ''}</span><span class="v" style="font-family:var(--cond);font-weight:600">${psVal(c.armor && c.armor[k])}</span></div>`;
    }).join('')}
    <div class="fine">Armor penalty applies to REF, DEX and MOVE.</div>
  </section>
  <!-- The app tracks no critical injuries, but the official sheet gives them a
       box because they are written down mid-fight. Ruled space is the useful
       thing to print here, not an empty data field. -->
  <section><h2>Critical Injuries</h2>
    ${psRules(5)}
    <div class="fine">−2 to all Actions while Seriously Wounded (HP at or below ${Math.ceil(hp / 2)}).</div>
  </section>`;

  // ── cyberware / vehicles / gear ──
  // Every section prints whether or not the character has anything in it: an
  // empty list on a sheet about to be printed is not "no cyberware", it is room
  // to write cyberware in. The paper sheet is ruled space for exactly this.
  const cyber = `<section><h2>Cyberware &nbsp;<span style="font-weight:400">HL ${hl} · Humanity ${hum}/${maxHum}</span></h2>
    ${c.cyberware.length ? c.cyberware.map(cw => `<div class="cw"><span class="n">${psEsc(cw.name)}</span><span class="h">HL ${psEsc(cw.hl ?? 0)}</span></div>
      ${(cw.upgrades || []).length ? `<div class="it"><div class="up">${cw.upgrades.map(u => psEsc('◆ ' + u.name + (u.effect ? ' — ' + u.effect : ''))).join('<br>')}</div></div>` : ''}`).join('')
      : psRules(6)}
  </section>`;

  const vehicles = `<section><h2>Vehicles</h2>
    ${(c.vehicles && c.vehicles.length) ? c.vehicles.map(v => `<div class="it"><div class="t">${psEsc(v.name)}</div>
      <div class="d">SDP <b>${psEsc(v.curSDP !== undefined ? v.curSDP : v.sdp)}</b>/${psEsc(v.sdp)} · SP ${psEsc(v.sp)} · ${psEsc(v.seats)} seat${v.seats == 1 ? '' : 's'}${v.upgrades && v.upgrades.length ? '<br>' + psEsc(v.upgrades.join(', ')) : ''}</div>
    </div>`).join('') : psRules(3)}
  </section>`;

  const gear = `<section><h2>Gear</h2>
    ${c.gear.length ? `<div class="gear">${c.gear.map(g => `<span><i>${psEsc(g.qty || 1)}</i>${psEsc(g.name)}</span>`).join('')}</div>`
      : psRules(8)}
  </section>`;

  // ── lifepath / notes ──
  // The lifepath editor uses a `__other__` sentinel in its dropdown to mean
  // "typed in below". That is an editor concept: if one ever reaches the stored
  // value it must print as an unfilled field, not as the sentinel.
  const lpVal = v => (typeof v === 'string' && /^__.*__$/.test(v.trim())) ? '' : v;
  const lifepath = `<section class="run"><h2>Lifepath</h2>
    ${lifepathDefs.map(d => `<div class="lp"><div class="k">${psEsc(d.label)}</div>
      <div class="v">${psVal(lpVal(c.lifepath && c.lifepath[d.key]))}</div></div>`).join('')}
  </section>`;

  // Write-on rules, added by the fitter when the last page would otherwise stop
  // half way down. The paper sheet ends in ruled blank space too, so filling the
  // remainder this way reads as a form rather than as content that ran out.
  const filler = fit.lines > 0
    ? psRules(fit.lines) : '';
  const notes = `<section class="run"><h2>Notes</h2><div class="note">${psVal(c.notes)}</div>${filler}</section>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${psEsc(c.name || 'Character')} — Cyberpunk RED character sheet</title>
<style>${psStyles()}${fit.zoom && fit.zoom !== 1 ? `\nbody{zoom:${fit.zoom}}` : ''}</style></head><body>
${mast}
<div class="flow">${stats}${role}${skills}${weapons}${cyber}${vehicles}${gear}${lifepath}${notes}</div>
</body></html>`;
}

// Printed page geometry at 96dpi, kept in step with the @page rule above.
const PS_PAGE = { w: (11 - 0.56) * 96, h: (8.5 - 0.44) * 96, line: 11 };

// How full the pages come out depends on the exact height of a four-column
// flow, which only the layout engine can tell us. So lay the document out
// offscreen at the real printed content size and measure it: a small overshoot
// gets scaled back onto the page it nearly fitted, and a last page that would
// end early gets padded with write-on rules. Falls back to the unfitted
// document if anything about the measurement fails.
function measurePrintFlow(html) {
  return new Promise(resolve => {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = `position:fixed;left:-20000px;top:0;border:0;visibility:hidden;
      width:${PS_PAGE.w}px;height:${PS_PAGE.h}px`;
    let done = false;
    const finish = v => { if (done) return; done = true; f.remove(); resolve(v); };
    f.onload = () => {
      try {
        const d = f.contentDocument;
        const mast = d.querySelector('.mast'), flow = d.querySelector('.flow');
        // Appending the iframe fires one load for the empty document before
        // srcdoc is parsed; that one has nothing to measure, so wait for the next.
        if (!mast || !flow) return;
        const mastH = mast.getBoundingClientRect().height + parseFloat(getComputedStyle(mast).marginBottom || 0);
        const ncol = parseInt(getComputedStyle(flow).columnCount) || 4;
        // Which skill chunks landed at the top of a column. Every column in a
        // multicol starts at the flow's top edge, so that is the whole test.
        const top = flow.getBoundingClientRect().top;
        const starts = [...d.querySelectorAll('.skcat')]
          .map((el, i) => el.getBoundingClientRect().top - top < 3 ? i : -1).filter(i => i >= 0);
        finish({ colInk: flow.getBoundingClientRect().height * ncol, mastH, ncol, starts });
      } catch (e) { finish(null); }
    };
    document.body.appendChild(f);
    f.srcdoc = html;
    setTimeout(() => finish(null), 4000);
  });
}

async function fitPrintSheet(c) {
  // A continuation heading only earns its place at the top of a column. When a
  // chunk lands directly under its own first half, "Education cont." sitting
  // mid-column is noise — so lay it out, see which chunks actually began a
  // column, and keep a heading only for those and for each category's first
  // chunk. Dropping headings shortens the flow and moves chunks, so repeat
  // until the set stops growing; it only ever grows, so it terminates.
  let keep = null;
  for (let pass = 0; pass < 3; pass++) {
    const probe = await measurePrintFlow(buildPrintSheetHTML(c, { keepLabels: keep }));
    if (!probe || !probe.colInk) return buildPrintSheetHTML(c);
    const next = new Set(keep || []);
    const before = next.size;
    probe.starts.forEach(i => next.add(i));
    if (keep && next.size === before) break;
    keep = next;
  }
  const m = await measurePrintFlow(buildPrintSheetHTML(c, { keepLabels: keep }));
  if (!m || !m.colInk) return buildPrintSheetHTML(c, { keepLabels: keep });
  const cap1 = (PS_PAGE.h - m.mastH) * m.ncol;   // page 1 loses the masthead band
  const capN = PS_PAGE.h * m.ncol;
  const pagesFor = ink => ink <= cap1 ? 1 : 1 + Math.ceil((ink - cap1) / capN);
  const capFor = p => cap1 + (p - 1) * capN;

  let pages = pagesFor(m.colInk), zoom = 1;
  // A sheet that misses by a few percent is worth shrinking rather than paying a
  // whole extra page for; below 0.9 the type gets too small to read at the table.
  if (pages > 1) {
    const want = capFor(pages - 1) / m.colInk;
    if (want >= 0.9) { zoom = Math.floor(want * 200) / 200; pages -= 1; }
  }
  // Whatever page count we land on, pad the tail so the last page reads as full.
  // Everything here is in printed pixels: zooming the body shrinks the content,
  // so both the ink and each filler rule cost `zoom` times their CSS height.
  const slack = capFor(pages) - m.colInk * zoom;
  const lines = slack > capFor(pages) * 0.06
    ? Math.floor(slack * 0.96 / (PS_PAGE.line * zoom)) : 0;
  return buildPrintSheetHTML(c, { zoom, lines: Math.min(Math.max(lines, 0), 300), keepLabels: keep });
}

async function exportPDF() {
  collectAllFormData();
  const html = await fitPrintSheet(char);
  const result = await callIPC('export-pdf', html, (char.name || 'character') + ' sheet.pdf');
  if (result.success) notify('PDF exported!', 'success');
  else notify(result.error ? 'PDF export failed: ' + result.error : 'PDF export not available outside app', 'error');
}

async function exportJSON() {
  collectAllFormData();
  const result = await callIPC('export-json', char);
  if (result.success) notify('JSON exported!', 'success');
  else {
    const blob = new Blob([JSON.stringify(char, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (char.name || 'character') + '.json';
    a.click();
    notify('JSON downloaded', 'success');
  }
}

async function printChar() {
  const result = await callIPC('print');
  if (!result.success) window.print();
}

async function pickImage() {
  const result = await callIPC('pick-image');
  if (result.success && result.dataUrl) {
    char.portrait = result.dataUrl;
    document.getElementById('portrait-img').src = result.dataUrl;
    document.getElementById('portrait-img').style.display = 'block';
    document.getElementById('portrait-placeholder').style.display = 'none';
    notify('Portrait updated', 'success');
  } else {
    // Fallback: file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        char.portrait = ev.target.result;
        document.getElementById('portrait-img').src = ev.target.result;
        document.getElementById('portrait-img').style.display = 'block';
        document.getElementById('portrait-placeholder').style.display = 'none';
        notify('Portrait updated', 'success');
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }
}

function newCharacter() {
  char = newBlankChar();
  document.getElementById('portrait-img').style.display = 'none';
  document.getElementById('portrait-placeholder').style.display = 'flex';
  updateSidebarIdentity();
  goWizardStep(0);
  switchSection('creation', document.querySelector('[data-section=creation]'));
  notify('New character started', 'success');
}

// Create a fresh character and edit it entirely on the Full Sheet (no wizard)
function newBlankOnSheet() {
  char = newBlankChar();
  char.name = ''; char.handle = '';
  populateAllForms();
  const snavSheet = [...document.querySelectorAll('.snav-item')].find(n => (n.getAttribute('onclick') || '').includes("'sheet'"));
  switchSection('sheet', snavSheet);
  updateSidebarIdentity();
  saveToLocalStorage();
  notify('Blank character — edit any field on the sheet', 'success');
}

// ═══════════════════════════════════════════════════════════════════
// GM TOOLS: NPC + ENCOUNTER + QUICK REF
// ═══════════════════════════════════════════════════════════════════
function initGMPanels() {
  // NPC
  const npcRole = document.getElementById('npc-role');
  CPRED_DATA.roles.forEach(r => npcRole.add(new Option(r, r)));

  const npcAffil = document.getElementById('npc-affil');
  const affiliations = ['Independent', ...['Tyger Claws','Voodoo Boys','Maelstrom','6th Street','Valentinos','Prime-Time Players','Iron Sights','Piranhas','Bozos','Animals'],
    ...['Arasaka','Militech','Biotechnica','Petrochem','Zetatech','SovOil','Network 54','Trauma Team'], 'NCPD','Nomad Clan'];
  affiliations.forEach(a => npcAffil.add(new Option(a, a)));

  const npcDist = document.getElementById('npc-district');
  ['Watson','Kabuki','Pacifica','Santo Domingo','North Heywood','Charter Hill','Exec Zone','New Westbrook','Rancho Coronado','The Hot Zone'].forEach(d => npcDist.add(new Option(d,d)));

  // Encounter
  ['Ambush','Extraction','Heist','Bodyguard Gig','Gang War','Corporate Espionage','Street Brawl','Chase','Hostage Situation','Data Theft']
    .forEach(t => document.getElementById('enc-type').add(new Option(t,t)));
  ['Watson','Kabuki','Pacifica','Santo Domingo','North Heywood','Charter Hill','Exec Zone','New Westbrook','Rancho Coronado','The Hot Zone']
    .forEach(d => document.getElementById('enc-district').add(new Option(d,d)));

  // Render rosters
  renderNPCRoster();
  renderEncRoster();

  // Quick ref topics
  const topics = ['Critical Injuries','Cyberpsychosis & EMP loss','Netrunning basics','Healing & recovery','Armor penetration','Autofire rules','Facedown mechanic','Flash of Luck','Wound states','Stealth Netrunning'];
  document.getElementById('quick-topics-row').innerHTML = topics.map(t =>
    `<button class="chip" onclick="document.getElementById('ref-topic').value='${t}'">${t}</button>`).join('');
}

async function generateNPC() {
  const btn = document.getElementById('npc-gen-btn');
  btn.textContent = 'GENERATING...'; btn.disabled = true;
  const out = document.getElementById('npc-output');
  const card = document.getElementById('npc-output-card');
  card.style.display = 'block';
  out.className = 'output-box loading-pulse';
  out.textContent = '// Connecting to Night City archives...\n// Pulling profile data...\n// Compiling dossier...';

  const role = document.getElementById('npc-role').value;
  const affil = document.getElementById('npc-affil').value;
  const district = document.getElementById('npc-district').value;
  const tone = document.getElementById('npc-tone').value;
  const notes = document.getElementById('npc-notes').value;

  const sys = `You are a Cyberpunk RED TTRPG GM assistant. Generate detailed, atmospheric NPCs set in Night City, 2045 (Time of the Red). Output structured NPCs with these labeled sections on separate lines:
NAME: (street-ready name with handle in quotes)
ROLE: (Cyberpunk RED role)
APPEARANCE: (2-3 vivid sentences)
PERSONALITY: (2-3 sentences, attitude and quirks)
MOTIVATION: (what drives them right now)
STATS: INT X | REF X | COOL X | BODY X | TECH X | LUCK X | HP: XX | Armor: (type or None)
GEAR: (3-5 specific items with Cyberpunk RED pricing)
SKILLS: (4-6 key skills with ratings)
HOOK: (one specific plot hook connecting them to player characters)
Be punchy. Night City flavor throughout.`;
  const user = `Generate a ${tone.toLowerCase()}-disposition ${role} NPC affiliated with ${affil}, operating in ${district} district. ${notes ? 'Notes: ' + notes : ''}`;

  const text = await callClaude(sys, user);
  out.className = 'output-box';
  out.textContent = text;
  btn.textContent = '⚡ Generate NPC'; btn.disabled = false;
  document.getElementById('npc-save-btn').style.display = 'inline-flex';
  window._lastNPC = { role, affil, district, text };
}

function saveNPC() {
  if (!window._lastNPC) return;
  const nameLine = window._lastNPC.text.split('\n').find(l => l.startsWith('NAME:'));
  const name = nameLine ? nameLine.replace('NAME:', '').trim() : 'Unknown';
  npcRoster.unshift({ id: Date.now(), name, ...window._lastNPC });
  npcRoster = npcRoster.slice(0, 20);
  localStorage.setItem('cpred_npcs', JSON.stringify(npcRoster));
  renderNPCRoster();
  notify('Saved to roster', 'success');
}

function renderNPCRoster() {
  const card = document.getElementById('npc-roster-card');
  const list = document.getElementById('npc-roster-list');
  if (!npcRoster.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  list.innerHTML = npcRoster.map((n, i) => `
    <div class="npc-item">
      <div style="flex:1;min-width:0">
        <div class="npc-item-name">${n.name}</div>
        <div class="npc-item-sub">${n.role} · ${n.affil} · ${n.district}</div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" onclick="viewNPC(${i})">View</button>
        <button class="btn btn-xs btn-red" onclick="deleteNPC(${i})">✕</button>
      </div>
    </div>`).join('');
}

function viewNPC(i) {
  document.getElementById('npc-output').textContent = npcRoster[i].text;
  const card = document.getElementById('npc-output-card');
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteNPC(i) {
  npcRoster.splice(i, 1);
  localStorage.setItem('cpred_npcs', JSON.stringify(npcRoster));
  renderNPCRoster();
}

// ── Offline encounter generator (template + random tables, always available) ──
const ENC_DIFF = {
  'Easy': { count: [2, 3], statBump: -1 },
  'Medium': { count: [3, 4], statBump: 0 },
  'Hard': { count: [4, 6], statBump: 1 },
  'Brutal': { count: [6, 8], statBump: 2 },
  'Meat Grinder': { count: [8, 10], statBump: 3 }
};
const ENC_ENEMY_AFFILS = ['Tyger Claws', 'Maelstrom', '6th Street', 'Valentinos', 'Animals', 'Voodoo Boys', 'Arasaka Sec', 'Militech Sec', 'NCPD', 'Scavengers', 'Bozos', 'Iron Sights'];
const ENC_TERRAIN = ['a rain-slicked alley strung with tangled cable and flickering neon signage', 'a gutted parking structure, three levels of blind corners and rusted vehicle husks', 'a rooftop maze of AC units, water tanks, and a sagging fire escape', 'a flooded basement level with knee-deep water and exposed wiring (electrocution risk)', 'a crowded night market, stalls for cover but civilians in the crossfire', 'an abandoned corp office floor, cubicle mazes and shattered glass underfoot', 'a maglev platform with a train due in 4 rounds', 'a scrapyard of stacked AV wrecks and chain-link fencing'];
const ENC_COMPLICATIONS = ["Reinforcements arrive in 1d4 rounds if anyone fires a gun", "A rival gang shows up mid-fight, treating the scene as a free-for-all", "NCPD respond in 2d6 minutes if the noise isn't contained", "The area's lights cut out, imposing Dim/Total Darkness penalties", "A civilian bystander gets caught in the open", "An EMP grenade goes off, shorting nearby cyberware for 1 round", "The floor/structure is unstable and starts to give way"];
const ENC_OBJECTIVES = ['Extract the target/package and reach the exit', 'Neutralize or capture the key NPC without killing bystanders', 'Hold the position for 5 rounds until backup/extraction arrives', 'Retrieve a data shard from the compound and get out clean'];

function offlineEncounter(type, diff, district, players, ctx) {
  const r = a => a[Math.floor(Math.random() * a.length)];
  const d10 = () => Math.floor(Math.random() * 10) + 1;
  const cfg = ENC_DIFF[diff] || ENC_DIFF.Medium;
  const count = cfg.count[0] + Math.floor(Math.random() * (cfg.count[1] - cfg.count[0] + 1));
  const affil = r(ENC_ENEMY_AFFILS);
  const wpnPool = Object.values(CPRED_DATA.weapons).flat();
  const armorPool = CPRED_DATA.armor;
  const statFor = base => Math.max(2, Math.min(10, base + cfg.statBump + Math.floor(Math.random() * 3) - 1));

  const mookWpn = r(wpnPool), mookArmor = r(armorPool.filter(a => a.sp <= 13));
  const mookRef = statFor(5), mookBody = statFor(5), mookHp = 10 + 5 * mookBody;

  const includeBoss = diff === 'Hard' || diff === 'Brutal' || diff === 'Meat Grinder';
  const bossWpn = r(wpnPool), bossArmor = r(armorPool.filter(a => a.sp <= 15));
  const bossRef = statFor(7), bossBody = statFor(7), bossCool = statFor(7), bossHp = 15 + 5 * bossBody;

  const enemyBlock = `${count}x ${affil} Ganger — STATS: REF ${mookRef} | BODY ${mookBody} | HP ${mookHp} | ARMOR: ${mookArmor.name} (SP ${mookArmor.sp}) | WEAPON: ${mookWpn.name} (${mookWpn.damage} dmg, ROF ${mookWpn.rof})`
    + (includeBoss ? `\n1x ${affil} Lieutenant (Boss) — STATS: REF ${bossRef} | BODY ${bossBody} | COOL ${bossCool} | HP ${bossHp} | ARMOR: ${bossArmor.name} (SP ${bossArmor.sp}) | WEAPON: ${bossWpn.name} (${bossWpn.damage} dmg, ROF ${bossWpn.rof})` : '');

  const cwPool = Object.values(CPRED_DATA.cyberware || {}).flat();
  const lootPool = [`${200 + d10() * 100}eb in cash`, `${r(wpnPool).name} (looted, needs cleanup)`, `a data shard with a lead on the next job`, cwPool.length ? `${r(cwPool).name} (salvaged, needs a Tech check to reinstall)` : 'a stash of black-market components', 'an access fob to a nearby secure location'];
  const skillPool = [
    ['Perception (Notice ambush before it triggers)', 13 + cfg.statBump * 2],
    ['Stealth (Approach undetected)', 15 + cfg.statBump * 2],
    ['Athletics (Cross hazardous terrain)', 13 + cfg.statBump * 2],
    ['Persuasion (Talk down a hostile NPC)', 15 + cfg.statBump * 2],
    ['Electronics/Security (Bypass a lock/alarm)', 15 + cfg.statBump * 2],
    ['Concentration (Keep cool under fire)', 13 + cfg.statBump * 2]
  ].sort(() => Math.random() - 0.5).slice(0, 4);

  const title = `${type} — ${affil} in ${district}`;
  return `ENCOUNTER TITLE: ${title}
SETUP: The crew's ${ctx ? ctx : 'current job'} puts them right in ${affil}'s territory in ${district}. A ${type.toLowerCase()} kicks off before anyone's ready for it.
TERRAIN: ${r(ENC_TERRAIN)}.
ENEMIES:
${enemyBlock}
COMPLICATIONS:
- ${r(ENC_COMPLICATIONS)}
- ${r(ENC_COMPLICATIONS)}
OBJECTIVES:
- Primary: ${r(ENC_OBJECTIVES)}
- Optional: ${r(ENC_OBJECTIVES)} (bonus: +${100 + d10() * 50}eb)
SKILL CHECKS:
${skillPool.map(([s, dv]) => `- ${s} — DV ${dv}`).join('\n')}
LOOT: ${r(lootPool)}; ${r(lootPool)}
AFTERMATH: ${affil} marks the crew as a threat for ${players} — expect retaliation or a bounty within ${district}. Word travels fast.
[Generated offline — template + random tables]`;
}

async function generateEncounter() {
  const btn = document.getElementById('enc-gen-btn');
  btn.textContent = 'GENERATING...'; btn.disabled = true;
  const out = document.getElementById('enc-output');
  const card = document.getElementById('enc-output-card');
  card.style.display = 'block';
  out.className = 'output-box loading-pulse';
  out.textContent = '// Scanning Night City threat vectors...\n// Analyzing tactical terrain...\n// Deploying opposition forces...';

  const type = document.getElementById('enc-type').value;
  const diff = document.getElementById('enc-diff').value;
  const district = document.getElementById('enc-district').value;
  const players = document.getElementById('enc-players').value;
  const ctx = document.getElementById('enc-context').value;

  let text = null;
  const apiKey = localStorage.getItem('cpred_api_key');
  if (apiKey) {
    const sys = `You are a Cyberpunk RED TTRPG GM assistant. Create tactical one-off encounters for Night City 2045. Output with labeled sections:
ENCOUNTER TITLE: (punchy name)
SETUP: (2-3 sentences how players get pulled in)
TERRAIN: (specific environmental details, cover, hazards, lighting)
ENEMIES: (each enemy type on its own line with a full stat block: count, name/affiliation, REF, BODY, HP, ARMOR name + SP, WEAPON name + damage/ROF; use CP:R goon tiers)
COMPLICATIONS: (2-3 dynamic mid-encounter events)
OBJECTIVES: (primary + 1-2 optional with rewards)
SKILL CHECKS: (3-4 checks with DV numbers)
LOOT: (specific items and eddies)
AFTERMATH: (consequences and follow-up threads)
Be concrete. Use Night City gang names and CP:R rules language. Every entry under ENEMIES must include full stats (REF, BODY, HP, Armor SP, Weapon+damage) — never just a name.`;
    const user = `Create a ${diff} difficulty ${type} encounter for ${players} players in ${district}. ${ctx ? 'Context: ' + ctx : 'Standalone street-level encounter.'}`;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1200, system: sys, messages: [{ role: 'user', content: user }] })
      });
      const d = await r.json();
      if (d.content && d.content[0]) text = d.content[0].text;
    } catch (e) { /* fall through to offline */ }
  }
  if (!text) text = offlineEncounter(type, diff, district, players, ctx);

  out.className = 'output-box';
  out.textContent = text;
  btn.textContent = '⚡ Generate Encounter'; btn.disabled = false;
  document.getElementById('enc-save-btn').style.display = 'inline-flex';
  window._lastEnc = { type, diff, district, text };
  const titleLine = text.split('\n').find(l => l.startsWith('ENCOUNTER TITLE:'));
  window._lastEnc.title = titleLine ? titleLine.replace('ENCOUNTER TITLE:', '').trim() : type + ' in ' + district;
}

function saveEncounter() {
  if (!window._lastEnc) return;
  encRoster.unshift({ id: Date.now(), ...window._lastEnc });
  encRoster = encRoster.slice(0, 15);
  localStorage.setItem('cpred_encs', JSON.stringify(encRoster));
  renderEncRoster();
  notify('Encounter saved', 'success');
}

function renderEncRoster() {
  const card = document.getElementById('enc-roster-card');
  const list = document.getElementById('enc-roster-list');
  if (!encRoster.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  list.innerHTML = encRoster.map((e, i) => `
    <div class="npc-item">
      <div style="flex:1;min-width:0">
        <div class="npc-item-name">${e.title}</div>
        <div class="npc-item-sub">${e.type} · ${e.diff} · ${e.district}</div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" onclick="viewEnc(${i})">View</button>
        <button class="btn btn-xs btn-red" onclick="deleteEnc(${i})">✕</button>
      </div>
    </div>`).join('');
}

function viewEnc(i) {
  document.getElementById('enc-output').textContent = encRoster[i].text;
  const card = document.getElementById('enc-output-card');
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteEnc(i) {
  encRoster.splice(i, 1);
  localStorage.setItem('cpred_encs', JSON.stringify(encRoster));
  renderEncRoster();
}

async function lookupRule() {
  const topic = document.getElementById('ref-topic').value;
  if (!topic.trim()) return;
  const btn = document.getElementById('ref-btn');
  btn.textContent = '...'; btn.disabled = true;
  const out = document.getElementById('ref-output');
  document.getElementById('ref-output-card').style.display = 'block';
  out.className = 'output-box loading-pulse';
  out.textContent = '// Querying Night City archives...\n// Retrieving rules data...';

  const sys = 'You are a Cyberpunk RED TTRPG rules expert. Answer GM questions about Cyberpunk RED (2045, Time of the Red) clearly for use at the table. Format with ALL CAPS labels. Cite specific DVs and rules where possible. 200 words max.';
  const text = await callClaude(sys, 'Rules lookup: ' + topic);
  out.className = 'output-box';
  out.textContent = text;
  btn.textContent = 'Look Up'; btn.disabled = false;
}

// ── Utility ────────────────────────────────────────────────────────
function safeName(n) { return n.replace(/[^a-zA-Z0-9]/g, '_'); }

// ── App version + updates ──────────────────────────────────────────
async function loadAppVersion() {
  const el = document.getElementById('app-version');
  let v = '';
  if (ipc) { try { v = await callIPC('app-version'); } catch (e) { /* ignore */ } }
  if (el) el.textContent = '// assistant' + (v ? ' v' + v : '');
}

async function checkForUpdate() {
  const btn = document.getElementById('update-btn');
  if (!ipc) { notify('Updates only work in the installed app (not RUN-APP / browser preview)', 'error'); return; }
  const orig = btn.textContent;
  btn.textContent = 'Checking…'; btn.disabled = true;
  try {
    const r = await callIPC('check-for-updates');
    if (!r.success) notify(r.error || 'Update check failed', 'error');
    else if (r.updateAvailable) notify('Update found (v' + r.latest + ') — downloading; you\'ll be prompted to restart', 'success');
    else notify("You're on the latest version (v" + r.current + ')', 'success');
  } catch (e) { notify('Update check failed: ' + e.message, 'error'); }
  btn.textContent = orig; btn.disabled = false;
}

// ── Init ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initWizard();
  initGMPanels();
  initWeaponBrowser();
  initCWBrowser();
  initGearBrowser();
  initNetBrowser();
  initArmorBrowser();
  updateSidebarIdentity();
  loadAppVersion();

  // Load last char from localStorage
  const stored = localStorage.getItem('cpred_chars');
  if (stored) {
    const chars = JSON.parse(stored);
    if (chars.length) { char = normalizeChar(chars[chars.length - 1]); populateAllForms(); }
  }
});

// ═══════════════════════════════════════════════════════════════════
// v2.1 UPGRADE — buy/add economy, stat mods, vehicles, role ability,
// multi-character session tracker. Later function declarations
// override the earlier versions above.
// ═══════════════════════════════════════════════════════════════════

// ── Cost parsing & the buy economy ─────────────────────────────────
function parseCost(c) {
  if (!c) return 0;
  const m = String(c).replace(/,/g, '').match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

function acquireItem(listKey, itStr, buy) {
  const it = JSON.parse(itStr);
  if (buy) {
    const price = parseCost(it.cost || it.c);
    if (!price) { notify('No listed price — added for free', ''); }
    else if ((char.eddies || 0) < price) { notify(`Not enough eddies — need €$${price.toLocaleString()}, have €$${(char.eddies||0).toLocaleString()}`, 'error'); return; }
    else { char.eddies -= price; notify(`Bought ${it.name} for €$${price.toLocaleString()} — €$${char.eddies.toLocaleString()} left`, 'success'); }
  } else {
    notify('Added: ' + it.name, 'success');
  }
  if (listKey === 'weapons') { char.weapons.push({ ...it, ammo: '', notes: '' }); renderEquippedWeapons(); }
  else if (listKey === 'cyberware') { char.cyberware.push(it); renderInstalledCW(); }
  else if (listKey === 'netPrograms') { if (!char.netPrograms) char.netPrograms = []; char.netPrograms.push(it); renderLoadedPrograms(); }
  else if (listKey === 'gear') {
    const ex = char.gear.find(g => g.name === it.name);
    if (ex) ex.qty = (ex.qty || 1) + 1; else char.gear.push({ name: it.name, qty: 1 });
    renderCarriedGear();
  }
  saveToLocalStorage();
}

function buyBtns(listKey, item) {
  const j = JSON.stringify(JSON.stringify(item));
  const price = parseCost(item.cost || item.c);
  return `<div style="display:flex;gap:6px;margin-top:6px" onclick="event.stopPropagation()">
    <button class="btn btn-gold btn-xs" onclick='acquireItem("${listKey}",${j},true)'>Buy ${price ? '€$' + price.toLocaleString() : ''}</button>
    <button class="btn btn-outline btn-xs" onclick='acquireItem("${listKey}",${j},false)'>Add Free</button>
  </div>`;
}

// ── Effective stats (base + equipment/cyberware mods) ──────────────
// ── Item modifiers (custom stat/skill bonuses on equipment) ─────────
// Parse a free-text modifier string like "+1 REF, +2 Handgun, -1 Stealth"
// into { stats:{REF:1}, skills:{Handgun:2, Stealth:-1} } matching known
// stat and skill names.
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
    // tokens that match no known stat/skill are ignored
  });
  return mods;
}

// Human-readable summary of a mods object for display on item rows
function modsToStr(mods) {
  if (!mods) return '';
  const parts = [];
  Object.entries(mods.stats || {}).forEach(([s, a]) => a && parts.push(`${a > 0 ? '+' : ''}${a} ${s}`));
  Object.entries(mods.skills || {}).forEach(([n, a]) => a && parts.push(`${a > 0 ? '+' : ''}${a} ${n}`));
  return parts.join(', ');
}

// Every place a character carries equipment that can hold custom mods
function moddableItems(c) {
  return [
    ...(c.cyberware || []), ...(c.gear || []), ...(c.weapons || []),
    ...(c.vehicles || []), ...(c.customArmor || []), ...(c.armorList || [])
  ];
}

// Sum custom per-item skill modifiers → { skillName: totalDelta }
function effectiveSkillMods(c) {
  const out = {};
  const add = (n, a) => { if (a) out[n] = (out[n] || 0) + a; };
  moddableItems(c).forEach(item => {
    if (item.mods && item.mods.skills) Object.entries(item.mods.skills).forEach(([n, a]) => add(n, a));
    (item.upgrades || []).forEach(u => { if (u.mods && u.mods.skills) Object.entries(u.mods.skills).forEach(([n, a]) => add(n, a)); });
  });
  return out;
}

// ── Automatic skill modifiers (equipment + role ability) ───────────
// Everything the sheet can work out for itself, with a per-source breakdown
// so the MOD cell can explain where the number came from.
// → { skillName: { total, parts: ['Equipment +2', 'Field Expertise +3'] } }
function autoSkillModDetail(c) {
  const out = {};
  const add = (name, amt, label) => {
    if (!amt) return;
    if (!out[name]) out[name] = { total: 0, parts: [] };
    out[name].total += amt;
    out[name].parts.push(`${label} ${amt > 0 ? '+' : ''}${amt}`);
  };
  Object.entries(effectiveSkillMods(c)).forEach(([n, a]) => add(n, a, 'Equipment'));
  ((CPRED_DATA.roleSkillBonuses || {})[c.role] || []).forEach(b => {
    const rankInSub = (c.roleSubRanks && parseInt(c.roleSubRanks[b.sub])) || 0;
    if (!rankInSub) return;
    Object.values(CPRED_DATA.skills).flat().forEach(sk => {
      if (b.match.test(sk.name)) add(sk.name, rankInSub, b.sub);
    });
  });
  return out;
}

function autoSkillMod(detail, name) { return (detail[name] && detail[name].total) || 0; }
function autoSkillModWhy(detail, name) {
  return detail[name] ? detail[name].parts.join(' · ') : 'No automatic modifiers';
}

// Compact "Field Expertise +3 to Basic Tech, Cybertech, ..." lines for the
// modifier banner above the skill tables.
function roleSkillModList(c) {
  return ((CPRED_DATA.roleSkillBonuses || {})[c.role] || []).map(b => {
    const rankInSub = (c.roleSubRanks && parseInt(c.roleSubRanks[b.sub])) || 0;
    if (!rankInSub) return null;
    const names = Object.values(CPRED_DATA.skills).flat().filter(sk => b.match.test(sk.name)).map(sk => sk.name);
    return `${b.sub} +${rankInSub} to ${names.join(', ')}${b.note ? ` (${b.note})` : ''}`;
  }).filter(Boolean);
}

// ── "Other" skill modifiers ────────────────────────────────────────
// A free-form per-skill bonus/penalty the GM or player types in (role
// perks, cyberware the app doesn't model, temporary buffs, wound
// penalties...). It stacks on top of the equipment MOD and is part of
// the total check number: STAT + LVL + GEAR + OTHER.
function otherSkillMod(c, name) {
  const v = c && c.skillMods ? parseInt(c.skillMods[name]) : 0;
  return isNaN(v) ? 0 : v;
}

function setOtherSkillMod(name, val) {
  if (!char.skillMods) char.skillMods = {};
  const n = parseInt(val);
  if (!n || isNaN(n)) delete char.skillMods[name];
  else char.skillMods[name] = n;
  saveToLocalStorage();
}

// Total skill check number: effective STAT + skill level + gear + other
function skillTotal(c, sk, eff, autoMod) {
  return (eff[sk.stat] || 5) + (c.skills[sk.name] || 0) + (autoMod || 0) + otherSkillMod(c, sk.name);
}

// The editable "OTHER" cell, shared by the wizard, the Stats view and the
// full sheet so all three read and write the same number.
function otherModInput(name) {
  const v = (char.skillMods && char.skillMods[name]) || '';
  const esc = name.replace(/'/g, "\\'");
  return `<input type="number" value="${v}" placeholder="0" title="Other modifiers — adds to the total check number"
    style="width:38px;text-align:center;background:var(--mid);border:1px solid var(--border);border-radius:2px;
    color:${v ? 'var(--gold)' : 'var(--dim)'};font-family:'Orbitron',monospace;font-size:10px;padding:1px"
    onclick="event.stopPropagation()"
    oninput="setOtherSkillMod('${esc}', this.value);updateSkillTotalCells('${esc}')">`;
}

// Repaint every "total" cell for one skill in place. Used instead of a full
// re-render so typing in an OTHER box never steals focus from it.
function updateSkillTotalCells(name) {
  const sk = Object.values(CPRED_DATA.skills).flat().find(s => s.name === name);
  if (!sk) return;
  const { eff } = effectiveStats(char);
  const gear = autoSkillMod(autoSkillModDetail(char), name);
  const other = otherSkillMod(char, name);
  const lvl = char.skills[name] || 0;
  const total = (eff[sk.stat] || 5) + lvl + gear + other;
  const active = lvl > 0 || gear !== 0 || other !== 0;
  document.querySelectorAll('[data-skill-total]').forEach(el => {
    if (el.getAttribute('data-skill-total') !== name) return;
    // Views that dim untrained skills opt in with data-skill-total-blank
    el.textContent = (active || !el.hasAttribute('data-skill-total-blank')) ? total : '—';
    el.style.fontWeight = (gear || other) ? '800' : '';
    el.style.color = (gear || other) ? 'var(--green)' : 'var(--gold)';
  });
}

function effectiveStats(c) {
  const eff = { ...c.stats };
  const notes = [];
  const statMods = {}; // net delta per stat, for bolding modified stats
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

function totalHL(c) {
  let t = 0;
  (c.cyberware || []).forEach(cw => { const m = String(cw.hl || '').match(/\d+/); if (m) t += parseInt(m[0]); });
  return t;
}

function currentHumanity(c) { return Math.max(0, ((c.stats.EMP || 5) * 10) - totalHL(c)); }

// ── OVERRIDE: equipment browsers now show Buy / Add Free ───────────
function renderWeaponList(search, cat) {
  const items = (CPRED_DATA.weapons[cat] || []).filter(w => !search || w.name.toLowerCase().includes(search.toLowerCase()));
  document.getElementById('weapon-list-display').innerHTML = items.map(w => `
    <div class="gear-item" style="cursor:default">
      <div class="gear-item-name">${w.name}</div>
      <div class="gear-item-meta"><span class="badge badge-red">DMG ${w.damage}</span><span class="badge badge-neon">ROF ${w.rof}</span>${w.concealable?'<span class="badge badge-green">Concealable</span>':''}<span class="badge badge-gold">${w.cost}</span></div>
      ${w.features ? `<div class="gear-item-desc">${w.features}</div>` : ''}
      <div class="gear-item-source">Source: ${w.source}</div>
      ${buyBtns('weapons', w)}
    </div>`).join('') || '<div style="color:var(--dim);font-family:Share Tech Mono,monospace;font-size:11px;padding:12px">No results</div>';
}

function renderCWList(search, cat) {
  const items = (CPRED_DATA.cyberware[cat] || []).filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));
  document.getElementById('cw-list-display').innerHTML = items.map(c => {
    const mod = CPRED_DATA.itemMods[c.name];
    return `<div class="gear-item" style="cursor:default">
      <div class="gear-item-name">${c.name}</div>
      <div class="gear-item-meta"><span class="badge badge-gold">${c.cost}</span><span class="badge badge-red">HL: ${c.hl}</span><span class="badge badge-neon">${c.install}</span>${mod ? '<span class="badge badge-green">Stat Mod</span>' : ''}</div>
      <div class="gear-item-desc">${c.description}</div>
      <div class="gear-item-source">Source: ${c.source}</div>
      ${buyBtns('cyberware', c)}
    </div>`;
  }).join('') || '<div style="color:var(--dim);font-family:Share Tech Mono,monospace;font-size:11px;padding:12px">No results</div>';
}

function renderGearList(search, cat) {
  const items = (CPRED_DATA.gear[cat] || []).filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase()));
  document.getElementById('gear-list-display').innerHTML = items.map(g => `
    <div class="gear-item" style="cursor:default">
      <div class="gear-item-name">${g.name}</div>
      <div class="gear-item-meta"><span class="badge badge-gold">${g.cost}</span></div>
      <div class="gear-item-desc">${g.description}</div>
      <div class="gear-item-source">Source: ${g.source}</div>
      ${buyBtns('gear', g)}
    </div>`).join('') || '<div style="color:var(--dim);font-family:Share Tech Mono,monospace;font-size:11px;padding:12px">No results</div>';
}

function renderNetList(search, cat) {
  const items = (CPRED_DATA.netPrograms[cat] || []).filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  document.getElementById('net-list-display').innerHTML = items.map(p => `
    <div class="gear-item" style="cursor:default">
      <div class="gear-item-name">${p.name}</div>
      <div class="gear-item-meta">${p.damage?`<span class="badge badge-red">DMG: ${p.damage}</span>`:''}${p.effect?`<span class="badge badge-neon">${p.effect}</span>`:''}${p.type?`<span class="badge badge-gold">${p.type}</span>`:''}<span class="badge badge-gold">${p.cost}</span></div>
      <div class="gear-item-desc">${p.description}</div>
      <div class="gear-item-source">Source: ${p.source}</div>
      ${buyBtns('netPrograms', p)}
    </div>`).join('') || '<div style="color:var(--dim);font-family:Share Tech Mono,monospace;font-size:11px;padding:12px">No results</div>';
}

function renderArmorList(search) {
  const items = CPRED_DATA.armor.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));
  document.getElementById('armor-list-display').innerHTML = items.map(a => {
    const j = JSON.stringify(JSON.stringify(a));
    const price = parseCost(a.cost);
    return `<div class="gear-item" style="cursor:default">
      <div class="gear-item-name">${a.name}</div>
      <div class="gear-item-meta"><span class="badge badge-neon">SP ${a.sp}</span>${a.penalty?`<span class="badge badge-red">Penalty ${a.penalty}</span>`:''}<span class="badge badge-gold">${a.cost}</span></div>
      <div class="gear-item-desc">${a.notes}</div>
      <div class="gear-item-source">Source: ${a.source}</div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="btn btn-gold btn-xs" onclick='buyArmor(${j})'>Buy ${price?'€$'+price.toLocaleString():''} &amp; Equip</button>
        <button class="btn btn-outline btn-xs" onclick='equipArmor(${j})'>Equip Free</button>
      </div>
    </div>`;
  }).join('');
}

function buyArmor(aStr) {
  const a = JSON.parse(aStr);
  const price = parseCost(a.cost);
  if (price && (char.eddies || 0) < price) { notify(`Not enough eddies — need €$${price.toLocaleString()}`, 'error'); return; }
  char.eddies -= price;
  notify(`Bought ${a.name} for €$${price.toLocaleString()}`, 'success');
  equipArmor(aStr);
  saveToLocalStorage();
}

// ── VEHICLES ───────────────────────────────────────────────────────
let activeVehCat = null;
function initVehicleBrowser() {
  if (!char.vehicles) char.vehicles = [];
  const cats = [...Object.keys(CPRED_DATA.vehicles), 'Upgrades'];
  if (!activeVehCat) activeVehCat = cats[0];
  document.getElementById('veh-category-tabs').innerHTML = cats.map(c =>
    `<button class="tab ${c===activeVehCat?'active':''}" onclick="setVehCat('${c}',this)">${c}</button>`).join('');
  renderVehicleList('', activeVehCat);
  renderOwnedVehicles();
  renderNomadNote();
}

function setVehCat(cat, el) {
  activeVehCat = cat;
  document.querySelectorAll('#veh-category-tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderVehicleList('', cat);
}

function filterVehicleList(v) { renderVehicleList(v, activeVehCat); }

function renderVehicleList(search, cat) {
  const el = document.getElementById('veh-list-display');
  if (cat === 'Upgrades') {
    const items = CPRED_DATA.vehicleUpgrades.filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()));
    el.innerHTML = items.map(u => {
      const j = JSON.stringify(JSON.stringify(u));
      const price = parseCost(u.cost);
      const isNomad = char.role === 'Nomad';
      const nomadPrice = Math.ceil(price / 2);
      return `<div class="gear-item" style="cursor:default">
        <div class="gear-item-name">${u.name}</div>
        <div class="gear-item-meta"><span class="badge badge-neon">${u.effect}</span><span class="badge badge-gold">${u.cost}</span></div>
        <div class="gear-item-source">Source: ${u.source}${isNomad ? ' · Nomad installs at €$' + nomadPrice.toLocaleString() + ' materials (Moto)' : ''}</div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-gold btn-xs" onclick='buyUpgrade(${j},false)'>Buy €$${price.toLocaleString()}</button>
          ${isNomad ? `<button class="btn btn-outline btn-xs" onclick='buyUpgrade(${j},true)'>Nomad Install €$${nomadPrice.toLocaleString()}</button>` : ''}
          <button class="btn btn-ghost btn-xs" onclick='addUpgradeFree(${j})'>Add Free</button>
        </div>
      </div>`;
    }).join('');
    return;
  }
  const items = (CPRED_DATA.vehicles[cat] || []).filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()));
  el.innerHTML = items.map(v => {
    const j = JSON.stringify(JSON.stringify(v));
    const price = parseCost(v.cost);
    return `<div class="gear-item" style="cursor:default">
      <div class="gear-item-name">${v.name}</div>
      <div class="gear-item-meta"><span class="badge badge-neon">SDP ${v.sdp}</span><span class="badge badge-red">SP ${v.sp}</span><span class="badge badge-green">Seats ${v.seats}</span><span class="badge badge-gold">${v.cost}</span></div>
      <div class="gear-item-desc">${v.description}</div>
      <div class="gear-item-source">Source: ${v.source}</div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="btn btn-gold btn-xs" onclick='buyVehicle(${j})'>Buy ${price?'€$'+price.toLocaleString():''}</button>
        <button class="btn btn-outline btn-xs" onclick='addVehicle(${j})'>Add Free${char.role==='Nomad'?' (Moto)':''}</button>
      </div>
    </div>`;
  }).join('');
}

function buyVehicle(vStr) {
  const v = JSON.parse(vStr);
  const price = parseCost(v.cost);
  if (price && (char.eddies || 0) < price) { notify(`Not enough eddies — need €$${price.toLocaleString()}`, 'error'); return; }
  char.eddies -= price;
  notify(`Bought ${v.name}`, 'success');
  addVehicle(vStr, true);
}

function addVehicle(vStr, silent) {
  const v = JSON.parse(vStr);
  if (!char.vehicles) char.vehicles = [];
  char.vehicles.push({ ...v, upgrades: [], curSDP: v.sdp, notes: '' });
  if (!silent) notify('Added: ' + v.name, 'success');
  renderOwnedVehicles();
  saveToLocalStorage();
}

let upgradeTargetIdx = 0;
function buyUpgrade(uStr, nomadRate) {
  const u = JSON.parse(uStr);
  if (!char.vehicles || !char.vehicles.length) { notify('Add a vehicle first', 'error'); return; }
  const price = nomadRate ? Math.ceil(parseCost(u.cost) / 2) : parseCost(u.cost);
  if (price && (char.eddies || 0) < price) { notify(`Not enough eddies — need €$${price.toLocaleString()}`, 'error'); return; }
  char.eddies -= price;
  applyUpgrade(u, nomadRate);
}

function addUpgradeFree(uStr) {
  const u = JSON.parse(uStr);
  if (!char.vehicles || !char.vehicles.length) { notify('Add a vehicle first', 'error'); return; }
  applyUpgrade(u, false);
}

function applyUpgrade(u, nomad) {
  const idx = Math.min(upgradeTargetIdx, char.vehicles.length - 1);
  const veh = char.vehicles[idx];
  veh.upgrades.push(u.name + (nomad ? ' (Nomad install)' : ''));
  if (u.name === 'Armored Body') { veh.sp = Math.min((veh.sp || 0) + 5, 15); }
  if (u.name === 'Seating Upgrade') { veh.seats = (veh.seats || 1) + 2; }
  notify(`${u.name} installed on ${veh.name}${nomad ? ' — Vehicle Tech check DV13-17 applies' : ''}`, 'success');
  renderOwnedVehicles();
  saveToLocalStorage();
}

function renderOwnedVehicles() {
  const el = document.getElementById('owned-vehicles-list');
  if (!el) return;
  if (!char.vehicles || !char.vehicles.length) {
    el.innerHTML = '<div style="color:var(--dim);font-size:11px;font-family:Share Tech Mono,monospace;padding:8px">No vehicles — buy or add from the database</div>';
    return;
  }
  el.innerHTML = char.vehicles.map((v, i) => `
    <div class="gear-list-item" style="flex-direction:column;align-items:flex-start;gap:6px;${i===upgradeTargetIdx?'border-color:var(--neon)':''}" onclick="upgradeTargetIdx=${i};renderOwnedVehicles()">
      <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
        <div style="font-family:'Orbitron',monospace;font-size:10px;color:var(--neon)">${v.name} ${i===upgradeTargetIdx?'<span class="badge badge-neon" style="margin-left:6px">upgrade target</span>':''}</div>
        <button class="btn btn-xs btn-red" onclick="event.stopPropagation();removeVehicle(${i})">✕</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="badge badge-neon">SDP ${v.curSDP||v.sdp}/${v.sdp}</span><span class="badge badge-red">SP ${v.sp}</span><span class="badge badge-green">Seats ${v.seats}</span>
      </div>
      ${v.upgrades && v.upgrades.length ? `<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--gold)">Upgrades: ${v.upgrades.join(', ')}</div>` : ''}
      <div style="display:flex;gap:8px;width:100%;align-items:center" onclick="event.stopPropagation()">
        <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted)">Current SDP:</span>
        <input type="number" value="${v.curSDP !== undefined ? v.curSDP : v.sdp}" min="0" max="${v.sdp}" style="width:60px;text-align:center" oninput="char.vehicles[${i}].curSDP=+this.value;saveToLocalStorage()">
      </div>
    </div>`).join('');
}

function removeVehicle(i) { char.vehicles.splice(i, 1); if (upgradeTargetIdx >= char.vehicles.length) upgradeTargetIdx = 0; renderOwnedVehicles(); saveToLocalStorage(); }

function renderNomadNote() {
  const el = document.getElementById('nomad-note');
  if (!el) return;
  if (char.role === 'Nomad') {
    const r = char.roleAbilityRank || 4;
    el.innerHTML = `<div class="gm-note"><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#665500;margin-bottom:4px">MOTO — RANK ${r}</div>
      Your family grants vehicle access at Rank ${r}. You install upgrades at half materials cost with a Land/Sea/Air Vehicle Tech check (DV13-17). Select a vehicle above as the upgrade target, then use the Nomad Install button on any upgrade.</div>`;
  } else {
    el.innerHTML = `<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--dim)">Tip: Nomads (Moto ability) install vehicle upgrades at half cost. Techs can use Maker Upgrade Expertise.</div>`;
  }
}

// ── ROLE ABILITY VIEW ──────────────────────────────────────────────
// ── Role Ability sub-allocation (Tech/Maker, Medtech/Medicine) ───────
function ensureRoleSubRanks() { if (!char.roleSubRanks) char.roleSubRanks = {}; }

// A Rank-up grants 1 Rank in `perRank` DIFFERENT specialties (Maker gives two,
// Medicine gives one), so the pool is rank × perRank. Either way a single
// specialty can only ever gain 1 point per Rank-up, so none may exceed the
// rank — and some specialties carry their own hard cap on top of that.
function roleSubBudget(cfg, rank) {
  return { pool: rank * (cfg.perRank || 1), cap: rank };
}

function roleSubCap(cfg, rank, subName) {
  const entry = cfg.subs.find(([name]) => name === subName);
  const hardMax = entry && entry[2] && entry[2].max;
  return Math.min(rank, hardMax === undefined ? Infinity : hardMax);
}

function setRoleSubRank(sub, val, rerender) {
  ensureRoleSubRanks();
  const cfg = CPRED_DATA.roleSubAbilities[char.role];
  if (!cfg) return;
  const rank = char.roleAbilityRank || 4;
  const { pool } = roleSubBudget(cfg, rank);
  let v = Math.min(roleSubCap(cfg, rank, sub), Math.max(0, parseInt(val) || 0));
  const otherUsed = cfg.subs.reduce((t, [name]) => name === sub ? t : t + (char.roleSubRanks[name] || 0), 0);
  if (v + otherUsed > pool) v = Math.max(0, pool - otherUsed); // can't overspend the pool
  char.roleSubRanks[sub] = v;
  saveToLocalStorage();
  if (rerender && typeof window[rerender] === 'function') window[rerender]();
}

// ── Medtech: skills granted by the Medicine Specialties (Corebook pg. 149) ──
// Surgery Skill = 2 per Surgery point; Medical Tech Skill = Pharmaceuticals
// points + Cryosystem Operation points. Both cap at 10.
function medtechDerived(c) {
  const t = CPRED_DATA.medtechTables;
  const pts = n => (c.roleSubRanks && parseInt(c.roleSubRanks[n])) || 0;
  const surgeryPts = pts('Surgery'), pharmaPts = pts('Pharmaceuticals'), cryoPts = pts('Cryosystem Operation');
  return {
    surgeryPts, pharmaPts, cryoPts,
    surgerySkill: Math.min(t.surgerySkillMax, surgeryPts * t.surgerySkillPerPoint),
    surgeryCapped: surgeryPts * t.surgerySkillPerPoint > t.surgerySkillMax,
    medicalTechSkill: Math.min(t.medicalTechSkillMax, pharmaPts + cryoPts)
  };
}

// Renders the allocation grid; `rerender` is the global fn name to refresh after edits
function roleSubAllocHTML(rerender) {
  const cfg = CPRED_DATA.roleSubAbilities[char.role];
  if (!cfg) return '';
  ensureRoleSubRanks();
  const rank = char.roleAbilityRank || 4;
  const { pool } = roleSubBudget(cfg, rank);
  const used = cfg.subs.reduce((t, [name]) => t + (char.roleSubRanks[name] || 0), 0);
  const remaining = pool - used;
  const remColor = remaining < 0 ? 'var(--red)' : remaining > 0 ? 'var(--gold)' : 'var(--green)';
  return `
    <div class="section-label" style="margin-top:14px">Distribute ${cfg.ability} Specialty Ranks (${pool} point${pool === 1 ? '' : 's'} at ${cfg.ability} Rank ${rank}) — <span style="color:${remColor}">${remaining} remaining</span></div>
    <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);line-height:1.6;margin:4px 0 8px">${cfg.note}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${cfg.subs.map(([name, desc, opts]) => {
        const subCap = roleSubCap(cfg, rank, name);
        const hardMax = opts && opts.max;
        return `
        <div style="background:var(--mid);border:1px solid var(--border);border-radius:4px;padding:8px 10px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <span style="font-family:'Orbitron',monospace;font-size:10px;color:var(--gold)">${(opts && opts.label) || name}</span>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              <span style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--dim)" title="Most you can put here${hardMax !== undefined ? ` — this Specialty is capped at ${hardMax} by the rules` : ''}">max ${subCap}</span>
              <input type="number" min="0" max="${subCap}" value="${char.roleSubRanks[name]||0}" style="width:46px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:3px;color:var(--neon);font-family:'Orbitron',monospace;font-size:14px;padding:2px" oninput="setRoleSubRank('${name.replace(/'/g,"\\'")}', this.value, '${rerender||''}')">
            </div>
          </div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);margin-top:4px;line-height:1.5">${desc}</div>
        </div>`; }).join('')}
    </div>
    ${char.role === 'Medtech' ? medtechMedicineHTML(rerender) : ''}`;
}

// ── Medtech Medicine detail: granted skills + the three Specialty tables ────
function medtechMedicineHTML(rerender) {
  const t = CPRED_DATA.medtechTables;
  const d = medtechDerived(char);
  const owned = Array.isArray(char.medtechDrugs) ? char.medtechDrugs : [];
  const th = 'text-align:left;padding:4px 8px;font-family:\'Share Tech Mono\',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;border-bottom:1px solid var(--border)';
  const td = 'padding:5px 8px;border-bottom:1px solid rgba(42,42,69,0.5);font-family:\'Share Tech Mono\',monospace;font-size:10px;color:#b0b0c8;line-height:1.5;vertical-align:top';
  const lvlCell = 'padding:5px 8px;border-bottom:1px solid rgba(42,42,69,0.5);font-family:\'Orbitron\',monospace;font-size:11px;font-weight:700;text-align:center;width:34px';

  const skillBox = (label, val, note) => `
    <div style="background:var(--mid);border:1px solid ${val > 0 ? 'var(--neon)' : 'var(--border)'};border-radius:4px;padding:8px 10px;flex:1;min-width:180px">
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px">${label}</div>
      <div style="font-family:'Orbitron',monospace;font-size:20px;font-weight:700;color:${val > 0 ? 'var(--neon)' : 'var(--dim)'}">${val}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);line-height:1.5;margin-top:2px">${note}</div>
    </div>`;

  return `
    <div class="section-label" style="margin-top:14px">Skills Granted By Your Specialties</div>
    <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);margin-bottom:6px">Surgery and Medical Tech are Medtech-only TECH Skills — you get them from this Role Ability, not from your skill list. Roll TECH + the skill below + 1d10.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${skillBox('Surgery Skill', d.surgerySkill, `${d.surgeryPts} Surgery point${d.surgeryPts === 1 ? '' : 's'} × ${t.surgerySkillPerPoint}${d.surgeryCapped ? ` — capped at ${t.surgerySkillMax}, further points add nothing` : ` (max ${t.surgerySkillMax})`}`)}
      ${skillBox('Medical Tech Skill', d.medicalTechSkill, `Pharmaceuticals ${d.pharmaPts} + Cryosystem ${d.cryoPts} (max ${t.medicalTechSkillMax})`)}
    </div>

    <div class="section-label" style="margin-top:14px">Surgery — Skill Gained Per Point</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th style="${th}">Points In Surgery</th>${[1,2,3,4,5].map(n => `<th style="${th};text-align:center">${n}</th>`).join('')}</tr></thead>
      <tbody><tr><td style="${td}">Surgery Skill Level</td>
        ${[1,2,3,4,5].map(n => {
          const v = Math.min(t.surgerySkillMax, n * t.surgerySkillPerPoint);
          const here = d.surgeryPts === n;
          return `<td style="${lvlCell};color:${here ? 'var(--neon)' : 'var(--muted)'};background:${here ? 'rgba(0,229,255,0.08)' : 'transparent'}">${v}</td>`;
        }).join('')}
      </tr></tbody>
    </table>

    <div class="section-label" style="margin-top:14px">Medical Tech (Pharmaceuticals) — ${d.pharmaPts} point${d.pharmaPts === 1 ? '' : 's'}, <span style="color:${owned.length > d.pharmaPts ? 'var(--red)' : 'inherit'}">${owned.length}/${d.pharmaPts} unlocked${owned.length > d.pharmaPts ? ' — more unlocked than points spent, untick some' : ''}</span></div>
    <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);line-height:1.6;margin-bottom:6px">${t.pharmaNotes.map(n => '• ' + n).join('<br>')}</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th style="${th};width:26px"></th><th style="${th};width:110px">Pharmaceutical</th><th style="${th}">Effect</th></tr></thead>
      <tbody>
        ${t.pharmaceuticals.map(p => {
          const has = owned.includes(p.name);
          const full = !has && owned.length >= d.pharmaPts;
          return `<tr style="${has ? 'background:rgba(0,229,255,0.05)' : ''}">
            <td style="${td};text-align:center"><input type="checkbox" ${has ? 'checked' : ''} ${full ? 'disabled' : ''}
              title="${full ? 'You have unlocked as many as your Pharmaceuticals points allow' : 'Each point in Pharmaceuticals unlocks one'}"
              style="cursor:${full ? 'not-allowed' : 'pointer'}" onchange="toggleMedtechDrug('${p.name}', '${rerender || ''}')"></td>
            <td style="${td};color:${has ? 'var(--neon)' : 'var(--muted)'};font-weight:${has ? '700' : '400'}">${p.name}</td>
            <td style="${td}">${p.effect}</td></tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="section-label" style="margin-top:14px">Medical Tech (Cryosystem Operation) — ${d.cryoPts} point${d.cryoPts === 1 ? '' : 's'}</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th style="${th};width:44px">Level</th><th style="${th}">Benefit</th></tr></thead>
      <tbody>
        ${t.cryosystem.map(r => {
          const have = d.cryoPts >= r.level;
          return `<tr style="${have ? 'background:rgba(0,229,255,0.05)' : 'opacity:.55'}">
            <td style="${lvlCell};color:${have ? 'var(--neon)' : 'var(--dim)'}">${r.level}</td>
            <td style="${td}">${r.benefit}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);margin-top:6px">${t.cryoNote}</div>`;
}

// Unlock/relock one pharmaceutical, bounded by the points spent in the Specialty
function toggleMedtechDrug(name, rerender) {
  if (!Array.isArray(char.medtechDrugs)) char.medtechDrugs = [];
  const i = char.medtechDrugs.indexOf(name);
  if (i >= 0) char.medtechDrugs.splice(i, 1);
  else if (char.medtechDrugs.length < medtechDerived(char).pharmaPts) char.medtechDrugs.push(name);
  saveToLocalStorage();
  if (rerender && typeof window[rerender] === 'function') window[rerender]();
}

function renderRoleAbility() {
  const el = document.getElementById('roleability-view');
  if (!el) return;
  const role = char.role || 'Solo';
  const det = CPRED_DATA.roleAbilityDetails[role];
  const rank = char.roleAbilityRank || 4;
  el.innerHTML = `
    <div class="cs-section" style="border-color:var(--neon)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <div style="font-family:'Orbitron',monospace;font-size:18px;font-weight:700;color:var(--neon)">${det.name}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--muted);margin-top:2px">${role} Role Ability</div>
        </div>
        <div style="text-align:center">
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px">RANK</div>
          <input type="number" min="1" max="10" value="${rank}" style="width:64px;text-align:center;font-family:'Orbitron',monospace;font-size:20px;font-weight:700;color:var(--gold)" oninput="char.roleAbilityRank=+this.value;saveToLocalStorage()" onchange="renderRoleAbility()">
        </div>
      </div>
      <div class="divider"></div>
      <div class="section-label">How To Use It</div>
      <div style="font-size:13px;line-height:1.8;color:var(--text);margin-bottom:14px">${det.how}</div>
      ${roleSubAllocHTML('renderRoleAbility')}
      <div class="section-label">Rank Progression</div>
      <div style="font-size:13px;line-height:1.8;color:#b0b0c8">${det.ranks}</div>
      ${role === 'Nomad' ? `<div class="gm-note" style="margin-top:12px"><b>Vehicle modification:</b> open the Vehicles section — as a Nomad your Moto rank halves upgrade material costs and adds to Vehicle Tech installation checks.</div>` : ''}
      ${role === 'Tech' ? `<div class="gm-note" style="margin-top:12px"><b>Maker upgrades:</b> with Upgrade Expertise you can improve weapons, armor, and vehicles — materials typically cost 50% of item price, then make a Maker check vs the item DV.</div>` : ''}
    </div>
    <div class="cs-section">
      <div class="cs-title">All Role Abilities Reference</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${CPRED_DATA.roles.map(r => {
          const d = CPRED_DATA.roleAbilityDetails[r];
          return `<div style="background:var(--mid);border:1px solid ${r===role?'var(--neon)':'var(--border)'};border-radius:4px;padding:10px">
            <div style="font-family:'Orbitron',monospace;font-size:10px;color:${r===role?'var(--neon)':'var(--gold)'}">${r} — ${d.name}</div>
            <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);margin-top:4px;line-height:1.6">${d.how.substring(0,140)}...</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── OVERRIDE: stats view + full sheet use effective stats & auto HL ─
// Skills that require a player-chosen specialization (Language (Streetslang), Science (Chemistry), ...)
const SPEC_SKILL_RE = /^(Language|Local Expert|Science|Play Instrument)\b/;

function setSkillSpec(name, v) {
  if (!char.skillSpecs) char.skillSpecs = {};
  char.skillSpecs[name] = v;
  saveToLocalStorage();
}

function skillSpecInput(name, opts = {}) {
  const val = (char.skillSpecs && char.skillSpecs[name]) || '';
  return `<input value="${val.replace(/"/g, '&quot;')}" placeholder="${opts.placeholder || 'which one?'}"
    style="display:block;width:${opts.w || '95%'};margin-top:2px;background:transparent;border:none;border-bottom:1px dashed var(--gold);color:var(--gold);font-family:'Share Tech Mono',monospace;font-size:9px;padding:0 2px;outline:none"
    onclick="event.stopPropagation()" oninput="setSkillSpec('${name.replace(/'/g, "\\'")}', this.value)">`;
}

function renderStatsView() {
  const { eff, statMods } = effectiveStats(char);
  const grid = document.getElementById('view-stat-grid');
  grid.innerHTML = CPRED_DATA.stats.map(s => {
    const base = char.stats[s] || 5, e = eff[s] || base;
    const modded = (statMods[s] || 0) !== 0;
    return `<div class="stat-box">
      <div class="stat-box-label">${s}</div>
      <div class="stat-box-val" style="${modded ? 'font-weight:900;color:var(--green)' : ''}">${e}${modded ? `<span style="font-size:10px;color:var(--green)"> (${base}${e - base >= 0 ? '+' : ''}${e - base})</span>` : ''}</div>
    </div>`;
  }).join('');
  const hp = 10 + 5 * (eff.BODY || 5);
  document.getElementById('view-hp').textContent = hp;
  document.getElementById('view-sw').textContent = Math.ceil(hp / 2);
  document.getElementById('view-ds').textContent = eff.BODY || 5;
  document.getElementById('view-hum').textContent = currentHumanity(char) + ' / ' + ((char.stats.EMP||5)*10);

  const modList = equipmentModList(char).concat(roleSkillModList(char));
  const autoMods = autoSkillModDetail(char);
  const skillsContainer = document.getElementById('view-skills-tables');
  skillsContainer.innerHTML = (modList.length ? `<div class="gm-note" style="grid-column:1/-1">Active modifiers: ${modList.join(' · ')}</div>` : '') +
    Object.entries(CPRED_DATA.skills).map(([cat, skills]) => `
    <div><div class="cs-title" style="margin-bottom:6px">${cat}</div>
      <table class="skill-table"><thead><tr><th>Skill</th><th>LVL</th><th>STAT</th><th title="Automatic bonuses from equipment and your role ability">MOD</th><th title="Other modifiers — type any bonus or penalty">OTHER</th><th title="STAT + LVL + MOD + OTHER">TOTAL</th></tr></thead><tbody>
        ${skills.map(sk => {
          const lvl = char.skills[sk.name] || 0;
          const mod = autoSkillMod(autoMods, sk.name);
          const other = otherSkillMod(char, sk.name);
          const base = (eff[sk.stat] || 5) + lvl + mod + other;
          const active = lvl > 0 || mod !== 0 || other !== 0;
          const spec = SPEC_SKILL_RE.test(sk.name) && lvl > 0;
          return `<tr style="${active ? 'background:rgba(0,229,255,0.04)' : ''}">
            <td class="skill-name" style="${mod !== 0 ? 'color:var(--green);font-weight:800' : lvl > 0 ? 'color:var(--neon)' : ''}">${sk.name}${spec ? skillSpecInput(sk.name) : ''}</td>
            <td style="text-align:center;font-family:'Orbitron',monospace;font-size:11px;color:${lvl>0?'var(--neon)':'var(--dim)'}">${lvl||'—'}</td>
            <td class="skill-stat">${sk.stat}</td>
            <td title="${autoSkillModWhy(autoMods, sk.name)}" style="text-align:center;font-family:'Orbitron',monospace;font-size:11px;color:${mod>0?'var(--green)':mod<0?'var(--red)':'var(--dim)'}">${mod ? (mod > 0 ? '+' + mod : mod) : '—'}</td>
            <td style="text-align:center">${otherModInput(sk.name)}</td>
            <td class="skill-base" data-skill-total="${sk.name}" data-skill-total-blank="1" style="${(mod !== 0 || other !== 0) ? 'font-weight:800;color:var(--green)' : ''}">${active ? base : '—'}</td></tr>`;
        }).join('')}
      </tbody></table></div>`).join('');
  document.getElementById('view-role-ability').textContent = CPRED_DATA.roleAbilities[char.role] || '—';
  document.getElementById('view-role-rank').textContent = 'Rank ' + (char.roleAbilityRank || 4);
}

// Compact "Item: +1 REF, +2 Handgun" list of every active equipment modifier
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

// ── SESSION TRACKER IN ENCOUNTERS (multi-character, synced) ────────
let sessionCharIds = JSON.parse(localStorage.getItem('cpred_session_ids') || '[]');

function switchEncTab(tab) {
  document.getElementById('enc-tab-gen').classList.toggle('active', tab === 'gen');
  document.getElementById('enc-tab-session').classList.toggle('active', tab === 'session');
  document.getElementById('enc-generator-wrap').style.display = tab === 'gen' ? 'block' : 'none';
  document.getElementById('enc-session-wrap').style.display = tab === 'session' ? 'block' : 'none';
  if (tab === 'session') renderSessionTracker();
}

function refreshSavedChars() { savedChars = JSON.parse(localStorage.getItem('cpred_chars') || '[]'); }

function renderSessionTracker() {
  refreshSavedChars();
  // Picker
  const picker = document.getElementById('session-char-picker');
  picker.innerHTML = savedChars.length ? savedChars.map(c => {
    const inSession = sessionCharIds.includes(c.id);
    return `<button class="btn ${inSession ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="toggleSessionChar('${c.id}')">
      ${inSession ? '✓ ' : '+ '}${c.name || 'Unnamed'} "${c.handle || ''}"</button>`;
  }).join('') : '<div style="font-family:Share Tech Mono,monospace;font-size:11px;color:var(--dim)">No saved characters — create some in the Characters panel first</div>';

  // Cards
  const grid = document.getElementById('session-tracker-grid');
  const inSession = savedChars.filter(c => sessionCharIds.includes(c.id));
  grid.innerHTML = inSession.map(c => sessionCard(c)).join('');
}

// Ids arrive from markup as strings but older sessions stored numbers —
// compare as strings so a character is never added to the session twice.
function toggleSessionChar(id) {
  const key = String(id);
  if (sessionCharIds.some(x => String(x) === key)) sessionCharIds = sessionCharIds.filter(x => String(x) !== key);
  else sessionCharIds.push(key);
  localStorage.setItem('cpred_session_ids', JSON.stringify(sessionCharIds));
  renderSessionTracker();
}

function sessionCard(c, order) {
  const maxHp = c.maxHp || (10 + 5 * ((c.stats && c.stats.BODY) || 5));
  const hp = c.hp !== undefined ? c.hp : maxHp;
  const maxHum = (c.stats && c.stats.EMP || 5) * 10;
  const hum = Math.max(0, maxHum - totalHL(c) - (c.extraHumLoss || 0));
  const hpPct = Math.max(0, Math.min(100, hp / maxHp * 100));
  const hpColor = hpPct > 60 ? 'var(--green)' : hpPct > 30 ? 'var(--gold)' : 'var(--red)';
  const luck = (c.stats && c.stats.LUCK) || 5;
  const luckCur = c.luckCurrent !== undefined ? c.luckCurrent : luck;
  const hasInit = c.initiative !== undefined && c.initiative !== null;
  return `
  <div class="cs-section" style="margin-bottom:0;${hasInit && order === 1 ? 'border-color:var(--gold)' : ''}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:8px">
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <div title="Turn order" style="flex-shrink:0;width:26px;height:26px;border-radius:50%;border:2px solid ${hasInit ? 'var(--gold)' : 'var(--border)'};display:flex;align-items:center;justify-content:center;font-family:'Orbitron',monospace;font-size:11px;font-weight:700;color:${hasInit ? 'var(--gold)' : 'var(--dim)'}">${hasInit ? order : '–'}</div>
        <div style="min-width:0">
          <div style="font-family:'Orbitron',monospace;font-size:12px;font-weight:700;color:var(--neon);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name || 'Unnamed'}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted)">"${c.handle||''}" · ${c.role} · ${CPRED_DATA.roleAbilities[c.role]||''} R${c.roleAbilityRank||4}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <div style="text-align:center">
          <div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:1px">INIT</div>
          <input type="number" value="${hasInit ? c.initiative : ''}" placeholder="–" style="width:40px;font-size:12px;padding:2px 3px;text-align:center" onchange="sessSetInit('${c.id}',this.value)">
        </div>
        <button class="btn btn-xs btn-ghost" title="Roll 1d10 + REF" onclick="sessRollInit('${c.id}')">🎲</button>
        <button class="btn btn-xs btn-outline" title="View / edit the full character sheet" onclick="sessOpenSheet('${c.id}')">Sheet</button>
        <button class="btn btn-xs btn-ghost" title="Save this character sheet to a folder of your choosing" onclick="sessSaveToFolder('${c.id}')">Save↓</button>
        <button class="btn btn-xs" style="color:var(--red);border:1px solid rgba(255,23,68,0.4);background:rgba(255,23,68,0.1)" title="Remove from this session — the character sheet is kept" onclick="removeFromSession('${c.id}')">✕</button>
        ${c.portrait ? `<img src="${c.portrait}" style="width:32px;height:32px;border-radius:4px;object-fit:cover">` : ''}
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted)"><span>HP</span><span style="color:${hpColor}">${hp} / ${maxHp}</span></div>
    <div class="hp-bar"><div class="hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
    <div style="display:flex;gap:4px;justify-content:center;margin:4px 0 8px">
      ${[-10,-5,-1,1,5,10].map(d => `<button class="btn btn-xs ${d<0?'btn-red':''}" style="${d>0?'background:rgba(105,240,174,0.12);color:var(--green);border:1px solid rgba(105,240,174,0.3);':''}" onclick="sessAdj('${c.id}','hp',${d})">${d>0?'+':''}${d}</button>`).join('')}
    </div>

    <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);margin-bottom:4px">
      ARMOR — Head SP ${c.armor?.headSP||0} · Body SP ${c.armor?.bodySP||0}${c.armor?.shieldSP?' · Shield SP '+c.armor.shieldSP:''}
    </div>
    ${(c.weapons && c.weapons.length) ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
      ${c.weapons.map(w => `<span class="badge badge-red" title="${(w.notes||'').replace(/"/g,'&quot;')}">${w.name}${w.damage?' '+w.damage:''}${w.rof?' · ROF '+w.rof:''}</span>`).join('')}
    </div>` : '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;color:var(--dim);margin-bottom:8px">No weapons equipped</div>'}

    <div style="display:flex;justify-content:space-between;font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted)">
      <span>HUMANITY (auto-HL: ${totalHL(c)})</span><span style="color:${hum<20?'var(--red)':'var(--gold)'}">${hum} / ${maxHum}</span></div>
    <div style="display:flex;gap:4px;margin:2px 0 8px">
      <button class="btn btn-xs btn-red" onclick="sessAdj('${c.id}','hum',-1)">-1</button>
      <button class="btn btn-xs" style="background:rgba(105,240,174,0.12);color:var(--green);border:1px solid rgba(105,240,174,0.3)" onclick="sessAdj('${c.id}','hum',1)">+1</button>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--gold)">€$ ${(c.eddies||0).toLocaleString()}</span>
      <div style="display:flex;gap:3px">
        ${[-100,100,-500,500].sort((a,b)=>a-b).map(d => `<button class="btn btn-xs btn-ghost" onclick="sessAdj('${c.id}','eddies',${d})">${d>0?'+':''}${d}</button>`).join('')}
      </div>
    </div>

    <div class="section-label">Wounds</div>
    <div class="wound-track" style="margin-bottom:8px">
      ${[...Array(12)].map((_, i) => `<div class="wound-box ${i < (c.wounds||0) ? (i>=10?'mortal':'filled') : ''}" onclick="sessWound('${c.id}',${i})"></div>`).join('')}
    </div>

    <div class="section-label">Luck (${luckCur}/${luck})</div>
    <div style="display:flex;gap:4px;margin-bottom:8px">
      ${[...Array(luck)].map((_, i) => `<div onclick="sessLuck('${c.id}',${i})" style="width:16px;height:16px;border-radius:50%;cursor:pointer;border:2px solid ${i<luckCur?'var(--gold)':'var(--border)'};background:${i<luckCur?'rgba(255,214,0,0.3)':'var(--mid)'}"></div>`).join('')}
    </div>

    <div class="section-label">Critical Injuries</div>
    <textarea style="min-height:44px;font-size:10px;font-family:'Share Tech Mono',monospace;margin-bottom:6px" oninput="sessField('${c.id}','trackerCrits',this.value)" placeholder="Broken arm (-2 checks with arm)...">${c.trackerCrits||''}</textarea>
    <div class="section-label">Session Notes</div>
    <textarea style="min-height:44px;font-size:10px;font-family:'Share Tech Mono',monospace" oninput="sessField('${c.id}','trackerNotes',this.value)" placeholder="Contacts made, threads...">${c.trackerNotes||''}</textarea>
  </div>`;
}

function sessMutate(id, fn) {
  refreshSavedChars();
  const i = savedChars.findIndex(c => c.id === id);
  if (i < 0) return;
  fn(savedChars[i]);
  localStorage.setItem('cpred_chars', JSON.stringify(savedChars));
  // Sync live editing char if it's the same one
  if (char && char.id === id) { char = savedChars[i]; }
  renderSessionTracker();
}

function sessAdj(id, field, delta) {
  sessMutate(id, c => {
    if (field === 'hp') {
      const maxHp = c.maxHp || (10 + 5 * ((c.stats && c.stats.BODY) || 5));
      c.hp = Math.max(0, Math.min(maxHp, (c.hp !== undefined ? c.hp : maxHp) + delta));
    } else if (field === 'hum') {
      c.extraHumLoss = Math.max(0, (c.extraHumLoss || 0) - delta);
    } else if (field === 'eddies') {
      c.eddies = Math.max(0, (c.eddies || 0) + delta);
    }
  });
}

function sessWound(id, idx) { sessMutate(id, c => { c.wounds = (c.wounds === idx + 1) ? idx : idx + 1; }); }
function sessLuck(id, idx) { sessMutate(id, c => { const max = (c.stats && c.stats.LUCK) || 5; const cur = c.luckCurrent !== undefined ? c.luckCurrent : max; c.luckCurrent = (cur === idx + 1) ? idx : idx + 1; }); }

let sessFieldTimer = {};
function sessField(id, field, value) {
  clearTimeout(sessFieldTimer[id + field]);
  sessFieldTimer[id + field] = setTimeout(() => {
    refreshSavedChars();
    const i = savedChars.findIndex(c => c.id === id);
    if (i < 0) return;
    savedChars[i][field] = value;
    localStorage.setItem('cpred_chars', JSON.stringify(savedChars));
    if (char && char.id === id) char[field] = value;
  }, 400);
}

// ── OVERRIDE switchSection to route new sections ───────────────────
const _origSwitchSection = switchSection;
switchSection = function(id, el) {
  _origSwitchSection(id, el);
  if (id === 'vehicles') initVehicleBrowser();
  if (id === 'roleability') renderRoleAbility();
};

function showGearBrowser(type) { /* browser is always visible beside the equipped list */ }

// ═══════════════════════════════════════════════════════════════════
// v2.2 — Offline rules lookup, fully editable character sheet,
// weapon attachments. Later declarations override earlier ones.
// ═══════════════════════════════════════════════════════════════════

// ── OFFLINE-FIRST RULES LOOKUP ─────────────────────────────────────
// Searches the 36-entry official FAQ/rules DB first; falls back to AI.
function searchRulesDB(query) {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length > 2);
  return CPRED_DATA.rulesDB
    .map(r => {
      const text = (r.q + ' ' + r.a).toLowerCase();
      let score = 0;
      words.forEach(w => { if (text.includes(w)) score += (r.q.toLowerCase().includes(w) ? 3 : 1); });
      return { ...r, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

async function lookupRule() {
  const topic = document.getElementById('ref-topic').value;
  if (!topic.trim()) return;
  const btn = document.getElementById('ref-btn');
  const out = document.getElementById('ref-output');
  document.getElementById('ref-output-card').style.display = 'block';

  // 1. Offline DB first
  const hits = searchRulesDB(topic);
  if (hits.length) {
    out.className = 'output-box';
    out.innerHTML = '<div style="color:var(--gold);margin-bottom:8px">— OFFICIAL FAQ / SOURCE FILE RULINGS —</div>' +
      hits.map(h => `<div style="margin-bottom:14px"><span style="color:var(--neon)">Q: ${h.q}</span>\n<span style="color:#c0c0d8">A: ${h.a}</span></div>`).join('') +
      `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px;color:var(--dim)">Not what you needed? <span style="color:var(--neon);cursor:pointer;text-decoration:underline" onclick="lookupRuleAI()">Ask the AI oracle instead →</span></div>`;
    return;
  }
  // 2. Fall back to AI
  lookupRuleAI();
}

async function lookupRuleAI() {
  const topic = document.getElementById('ref-topic').value;
  if (!topic.trim()) return;
  const btn = document.getElementById('ref-btn');
  const out = document.getElementById('ref-output');
  document.getElementById('ref-output-card').style.display = 'block';
  btn.textContent = '...'; btn.disabled = true;
  out.className = 'output-box loading-pulse';
  out.textContent = '// Querying Night City archives...';
  const sys = 'You are a Cyberpunk RED TTRPG rules expert. Answer GM questions about Cyberpunk RED (2045, Time of the Red) clearly for use at the table. Format with ALL CAPS labels. Cite specific DVs and rules where possible. 200 words max.';
  const text = await callClaude(sys, 'Rules lookup: ' + topic);
  out.className = 'output-box';
  out.textContent = text;
  btn.textContent = 'Look Up'; btn.disabled = false;
}

// ── FULLY EDITABLE CHARACTER SHEET ─────────────────────────────────
// Every field on the Full Sheet is now an inline-editable control that
// writes straight back to the character and saves automatically.
function ed(field, value, opts = {}) {
  const w = opts.w || 'auto';
  const type = opts.num ? 'number' : 'text';
  return `<input type="${type}" value="${String(value ?? '').replace(/"/g, '&quot;')}"
    style="background:transparent;border:none;border-bottom:1px dashed var(--border);color:${opts.color || 'inherit'};
    font-family:inherit;font-size:inherit;font-weight:inherit;width:${w};padding:0 2px;text-align:${opts.center ? 'center' : 'left'}"
    onfocus="this.style.borderBottomColor='var(--neon)'"
    onblur="this.style.borderBottomColor='var(--border)'"
    oninput="sheetEdit('${field}', this.value, ${!!opts.num})">`;
}

function sheetEdit(path, value, isNum) {
  const v = isNum ? (parseInt(value) || 0) : value;
  const keys = path.split('.');
  let obj = char;
  for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
  obj[keys[keys.length - 1]] = v;
  saveToLocalStorage();
  updateSidebarIdentity();
  // Recompute derived on stat edits, or refresh the role sub-allocation when
  // the rank changes (debounced so typing doesn't steal focus)
  if (path.startsWith('stats.') || path === 'roleAbilityRank') {
    clearTimeout(window._sheetDeriveTimer);
    window._sheetDeriveTimer = setTimeout(() => renderFullSheet(), 900);
  }
}

function sheetEditSkill(name, value) {
  char.skills[name] = parseInt(value) || 0;
  updateSkillTotalCells(name);
  saveToLocalStorage();
}

function renderFullSheet() {
  const el = document.getElementById('full-sheet-view');
  const { eff, notes, statMods } = effectiveStats(char);
  const autoMods = autoSkillModDetail(char);
  const hp = 10 + 5 * (eff.BODY || 5);
  const hl = totalHL(char);
  const hum = currentHumanity(char);
  const det = CPRED_DATA.roleAbilityDetails[char.role] || {};

  el.innerHTML = `
    <div class="gm-note" style="margin-bottom:12px">✎ All fields on this sheet are editable — click any dashed-underline value to change it. Changes save automatically.</div>
    <div class="cs-section" style="background:var(--mid);border-color:var(--neon)">
      <div style="display:grid;grid-template-columns:120px 1fr;gap:14px;align-items:start">
        ${char.portrait ? `<img src="${char.portrait}" style="width:120px;height:120px;object-fit:cover;border:2px solid var(--neon);border-radius:4px;cursor:pointer" onclick="pickImage()" title="Click to change">` :
          `<div onclick="pickImage()" style="cursor:pointer;width:120px;height:120px;border:2px solid var(--border);border-radius:4px;display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:36px" title="Click to add portrait">◈</div>`}
        <div>
          <div style="font-family:'Orbitron',monospace;font-size:22px;font-weight:700;color:var(--neon)">${ed('name', char.name, {w:'320px', color:'var(--neon)'})}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:13px;color:var(--muted);margin:4px 0">
            "${ed('handle', char.handle, {w:'140px'})}"  ·
            <select style="background:var(--mid);border:1px solid var(--border);color:var(--gold);font-family:inherit;font-size:12px;padding:2px" onchange="sheetEdit('role', this.value); renderFullSheet()">
              ${CPRED_DATA.roles.map(r => `<option ${r===char.role?'selected':''}>${r}</option>`).join('')}
            </select>
          </div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--dim);line-height:2.2">
            Age: ${ed('age', char.age, {num:true, w:'50px', center:true})}  |
            Rep: ${ed('rep', char.rep||0, {num:true, w:'40px', center:true})}  |
            Eddies: €$ ${ed('eddies', char.eddies||0, {num:true, w:'90px', color:'var(--gold)'})}  |
            Aliases: ${ed('aliases', char.aliases||'', {w:'160px'})}
          </div>
          <div style="margin-top:6px">
            <span class="badge badge-gold">${det.name || '—'} Rank ${ed('roleAbilityRank', char.roleAbilityRank||4, {num:true, w:'34px', center:true, color:'var(--gold)'})}</span>
            <span class="badge badge-red" style="margin-left:6px">HL: ${hl} (auto)</span>
            <span class="badge badge-neon" style="margin-left:6px">Humanity: ${hum}/${(char.stats.EMP||5)*10}</span>
            <span class="badge badge-green" style="margin-left:6px">IP: ${ed('trackerIP', char.trackerIP||0, {num:true, w:'44px', center:true, color:'var(--green)'})}</span>
          </div>
        </div>
      </div>
    </div>

    ${(() => { const ml = equipmentModList(char).concat(roleSkillModList(char)); return ml.length ? `<div class="gm-note" style="margin-bottom:12px">Modifiers active: ${ml.join(' · ')}</div>` : ''; })()}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="cs-section">
        <div class="cs-title">Stats (base — effective shown when modified)</div>
        <div class="stat-grid">
          ${CPRED_DATA.stats.map(s => {
            const b = char.stats[s]||5, e = eff[s]||b;
            const modded = (statMods[s]||0) !== 0;
            return `<div class="stat-box"><div class="stat-box-label"${modded?' style="color:var(--green);font-weight:800"':''}>${s}</div>
              <div class="stat-box-val">${ed('stats.'+s, b, {num:true, w:'44px', center:true, color:modded?'var(--green)':'var(--neon)'})}${modded?`<div style="font-size:9px;color:var(--green);font-weight:800">eff ${e}</div>`:''}</div></div>`;
          }).join('')}
        </div>
        <div class="divider"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">
          <div class="stat-box"><div class="stat-box-label">HP (auto)</div><div class="stat-box-val" style="font-size:16px">${hp}</div></div>
          <div class="stat-box"><div class="stat-box-label">Current HP</div><div class="stat-box-val" style="font-size:16px">${ed('hp', char.hp !== undefined ? char.hp : hp, {num:true, w:'50px', center:true, color:'var(--neon)'})}</div></div>
          <div class="stat-box"><div class="stat-box-label">Death Save</div><div class="stat-box-val" style="font-size:16px">${eff.BODY||5}</div></div>
          <div class="stat-box"><div class="stat-box-label">Humanity</div><div class="stat-box-val" style="font-size:16px;color:${hum<20?'var(--red)':'var(--neon)'}">${hum}</div></div>
        </div>
      </div>

      <div class="cs-section">
        <div class="cs-title">Weapons & Armor (editable)</div>
        ${char.weapons.length ? char.weapons.map((w, i) => `
          <div style="background:var(--mid);border:1px solid var(--border);border-radius:3px;padding:7px 10px;margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="font-family:'Orbitron',monospace;font-size:10px;color:var(--neon)">${w.name}</div>
              <button class="btn btn-xs btn-red" onclick="char.weapons.splice(${i},1);saveToLocalStorage();renderFullSheet()">✕</button>
            </div>
            <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted)">DMG: ${w.damage} | ROF: ${w.rof} |
              Ammo: <input value="${(w.ammo||'').replace(/"/g,'&quot;')}" style="background:transparent;border:none;border-bottom:1px dashed var(--border);color:var(--muted);font-size:9px;width:80px" oninput="char.weapons[${i}].ammo=this.value;saveToLocalStorage()"> |
              Notes: <input value="${(w.notes||'').replace(/"/g,'&quot;')}" style="background:transparent;border:none;border-bottom:1px dashed var(--border);color:var(--muted);font-size:9px;width:120px" oninput="char.weapons[${i}].notes=this.value;saveToLocalStorage()"></div>
          </div>`).join('') : '<div style="color:var(--dim);font-size:11px;font-family:Share Tech Mono,monospace">No weapons — add from Weapons section</div>'}
        <div class="divider"></div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);line-height:2.4">
          Head: ${ed('armor.head', char.armor?.head||'', {w:'140px'})} SP ${ed('armor.headSP', char.armor?.headSP||0, {num:true, w:'36px', center:true})}<br>
          Body: ${ed('armor.body', char.armor?.body||'', {w:'140px'})} SP ${ed('armor.bodySP', char.armor?.bodySP||0, {num:true, w:'36px', center:true})}<br>
          Shield: ${ed('armor.shield', char.armor?.shield||'', {w:'140px'})} SP ${ed('armor.shieldSP', char.armor?.shieldSP||0, {num:true, w:'36px', center:true})}</div>
      </div>
    </div>

    <div class="cs-section">
      <div class="cs-title">Skills — STAT is the linked stat, at its effective value · LVL and OTHER editable · MOD = automatic equipment + role bonuses (hover it for the breakdown)</div>
      <!-- Multi-column, not grid: the categories are wildly uneven (Performance 2
           rows vs Education 16), and a grid row stretches to its tallest cell, so
           the short categories left a page-tall void under them. A column flow
           packs the next category straight into the gap. Category blocks are NOT
           break-inside:avoid — keeping them whole leaves a column short by up to
           a whole category, so instead the rows are the atoms and a category is
           allowed to continue in the next column, exactly like the printed RTG
           sheet does. break-after:avoid on the two heading rows stops a heading
           being orphaned at the foot of a column. columns:<width> <count> keeps
           it responsive — 3 columns wide, dropping to 2 then 1 as the pane narrows. -->
      <div style="columns:270px 3;column-gap:14px">
        ${Object.entries(CPRED_DATA.skills).map(([cat, skills], ci) => `
            <div style="break-after:avoid;break-inside:avoid;font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin:${ci?'12px':'0'} 0 4px">${cat}</div>
            <div style="break-after:avoid;break-inside:avoid;display:flex;justify-content:space-between;align-items:center;font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:1px;color:var(--dim);padding-bottom:2px">
              <span>SKILL</span>
              <span style="display:flex;align-items:center;gap:4px">
                <span style="width:44px;text-align:center">STAT</span>
                <span style="width:34px;text-align:center">LVL</span>
                <span style="min-width:20px;text-align:right">MOD</span>
                <span style="width:38px;text-align:center">OTHER</span>
                <span style="min-width:22px;text-align:right">TOTAL</span>
              </span>
            </div>
            ${skills.map(sk => {
              const lvl = char.skills[sk.name]||0;
              const mod = autoSkillMod(autoMods, sk.name);
              const other = otherSkillMod(char, sk.name);
              const base = (eff[sk.stat]||5) + lvl + mod + other;
              const active = lvl > 0 || mod !== 0 || other !== 0;
              const spec = SPEC_SKILL_RE.test(sk.name) && lvl > 0;
              // The linked STAT is the largest term in TOTAL, so it is shown
              // rather than left in a tooltip — otherwise the number the player
              // rolls against can't be checked against the sheet. Green when a
              // modifier moved it, matching the Stats box above.
              const statVal = eff[sk.stat] || 5;
              const statModded = (statMods[sk.stat] || 0) !== 0;
              return `<div style="break-inside:avoid;display:flex;justify-content:space-between;align-items:center;font-family:'Share Tech Mono',monospace;font-size:10px;padding:1px 0;border-bottom:1px solid rgba(42,42,69,0.4);${active?'background:rgba(0,229,255,0.04)':''}">
                <span style="${mod!==0?'color:var(--green);font-weight:800':lvl>0?'color:var(--neon)':''};overflow:hidden;max-width:34%" title="${sk.name} (${sk.stat})">${sk.name}${spec ? skillSpecInput(sk.name) : ''}</span>
                <span style="display:flex;align-items:center;gap:4px">
                  <span class="skill-stat" style="width:44px;text-align:center" title="${sk.name} rolls on ${sk.stat}${statModded?` — ${char.stats[sk.stat]||5} base, ${statVal} after modifiers`:''}">${sk.stat} <span style="color:${statModded?'var(--green)':'var(--neon)'}${statModded?';font-weight:800':''}">${statVal}</span></span>
                  <input type="number" min="0" max="10" value="${lvl}" style="width:34px;text-align:center;background:var(--mid);border:1px solid var(--border);border-radius:2px;color:var(--neon);font-size:10px;padding:1px" oninput="sheetEditSkill('${sk.name.replace(/'/g,"\\'")}', this.value)" onchange="renderFullSheet()">
                  <span title="${autoSkillModWhy(autoMods, sk.name)}" style="min-width:20px;text-align:right;color:${mod>0?'var(--green)':mod<0?'var(--red)':'var(--dim)'}">${mod?(mod>0?'+'+mod:mod):'·'}</span>
                  ${otherModInput(sk.name)}
                  <span data-skill-total="${sk.name}" data-skill-total-blank="1" style="min-width:22px;text-align:right;${(mod!==0||other!==0)?'font-weight:800;color:var(--green)':'color:var(--gold)'}">${active?base:'—'}</span>
                </span></div>`;
            }).join('')}`).join('')}
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);margin-top:8px">MOD is worked out for you from equipment and your role ability (a Tech's Field Expertise, for instance) — hover a MOD value to see what it is made of. OTHER is anything the sheet can't know about (temporary buffs, wound penalties, or backing out a bonus that doesn't apply to this roll). TOTAL = effective STAT + LVL + MOD + OTHER — the number you roll against.</div>
    </div>

    <div class="cs-section">
      <div class="cs-title">Role Ability: ${det.name || '—'} (Rank ${char.roleAbilityRank||4})</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#b0b0c8;line-height:1.8">${det.how || ''}</div>
      ${roleSubAllocHTML('renderFullSheet')}
    </div>

    ${char.cyberware.length ? `<div class="cs-section">
      <div class="cs-title">Cyberware — Total HL: ${hl} → Humanity ${hum}/${(char.stats.EMP||5)*10} (auto-calculated)</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        ${char.cyberware.map((c, i) => `<div style="background:var(--mid);border:1px solid var(--border);border-radius:3px;padding:7px 10px;position:relative">
          <button class="btn btn-xs btn-red" style="position:absolute;top:4px;right:4px" onclick="char.cyberware.splice(${i},1);saveToLocalStorage();renderFullSheet()">✕</button>
          <div style="font-family:'Orbitron',monospace;font-size:9px;color:var(--neon);padding-right:24px">${c.name}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--dim)">HL: ${c.hl}${CPRED_DATA.itemMods[c.name]?' · '+(CPRED_DATA.itemMods[c.name].skillNote||CPRED_DATA.itemMods[c.name].note||'stat mod'):''}</div>
          ${c.upgrades && c.upgrades.length ? `<div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--gold);margin-top:3px;padding-right:24px">◆ ${c.upgrades.map(u => u.name + (u.effect ? ' — ' + u.effect : '') + (u.mods && modsToStr(u.mods) ? ' [' + modsToStr(u.mods) + ']' : '')).join(' · ')}</div>` : ''}
        </div>`).join('')}</div></div>` : ''}

    ${char.vehicles && char.vehicles.length ? `<div class="cs-section">
      <div class="cs-title">Vehicles (SDP editable)</div>
      ${char.vehicles.map((v, i) => `<div style="background:var(--mid);border:1px solid var(--border);border-radius:3px;padding:7px 10px;margin-bottom:6px">
        <div style="font-family:'Orbitron',monospace;font-size:10px;color:var(--neon)">${v.name}</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted)">SDP
          <input type="number" value="${v.curSDP!==undefined?v.curSDP:v.sdp}" min="0" max="${v.sdp}" style="width:44px;text-align:center;background:var(--mid);border:1px solid var(--border);color:var(--neon);font-size:9px" oninput="char.vehicles[${i}].curSDP=+this.value;saveToLocalStorage()">/${v.sdp} | SP ${v.sp} | Seats ${v.seats}${v.upgrades&&v.upgrades.length?' | '+v.upgrades.join(', '):''}</div>
      </div>`).join('')}</div>` : ''}

    <div class="cs-section">
      <div class="cs-title">Gear (quantities editable)</div>
      ${char.gear.length ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
        ${char.gear.map((g, i) => `<div style="display:flex;justify-content:space-between;align-items:center;font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);background:var(--mid);padding:5px 8px;border-radius:3px">
          <span>${g.name}</span>
          <span style="display:flex;gap:4px;align-items:center">
            <input type="number" min="0" value="${g.qty||1}" style="width:36px;text-align:center;background:var(--surface);border:1px solid var(--border);color:var(--gold);font-size:10px" oninput="char.gear[${i}].qty=+this.value;saveToLocalStorage()">
            <button class="btn btn-xs btn-red" onclick="char.gear.splice(${i},1);saveToLocalStorage();renderFullSheet()">✕</button>
          </span></div>`).join('')}</div>` : '<div style="color:var(--dim);font-size:11px;font-family:Share Tech Mono,monospace">No gear</div>'}
    </div>

    <div class="cs-section">
      <div class="cs-title">Lifepath (all editable)</div>
      <div id="sheet-lifepath-grid" class="lp-grid">${lifepathGridHTML('slp-')}</div>
    </div>

    <div class="cs-section">
      <div class="cs-title">Notes (editable)</div>
      <textarea style="min-height:80px;font-family:'Share Tech Mono',monospace;font-size:11px;width:100%" oninput="char.notes=this.value;saveToLocalStorage()">${char.notes||''}</textarea>
    </div>`;
}

// ── WEAPON ATTACHMENTS in the Weapons browser ──────────────────────
const _origInitWeaponBrowser = initWeaponBrowser;
initWeaponBrowser = function() {
  _origInitWeaponBrowser();
  const tabs = document.getElementById('weapon-category-tabs');
  if (tabs && !tabs.querySelector('[data-attach]')) {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.setAttribute('data-attach', '1');
    btn.textContent = 'Attachments';
    btn.onclick = function() {
      document.querySelectorAll('#weapon-category-tabs .tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      renderAttachmentList('');
    };
    tabs.appendChild(btn);
  }
};

function renderAttachmentList(search) {
  const items = CPRED_DATA.weaponAttachments.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));
  document.getElementById('weapon-list-display').innerHTML = items.map(a => `
    <div class="gear-item" style="cursor:default">
      <div class="gear-item-name">${a.name}</div>
      <div class="gear-item-meta"><span class="badge badge-neon">${a.effect}</span><span class="badge badge-gold">${a.cost}</span><span class="badge badge-red">${a.slots} slot${a.slots>1?'s':''}</span></div>
      <div class="gear-item-source">Source: ${a.source} · Non-Exotic weapons have 3 attachment slots (Old Guns)</div>
      ${buyBtns('gear', { name: a.name + ' (attachment)', cost: a.cost })}
    </div>`).join('');
}

// ── Quick-ref topics refresh: pull from rules DB categories ────────
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const row = document.getElementById('quick-topics-row');
    if (row) {
      const topics = ['Area attacks vs armor SP','Poor Quality weapon crit fail','Spot Weakness','Surprise attacks','EMP & Microwaver','Dodging bullets','Critical Injuries stacking','Cyberware reinstall HL','Kibble lifestyle','Night Market buying','Access Points','Jacking Out','Black ICE lying in wait','Lawman Backup timing','Armor repair skill','2020 weapon conversion','CBK Night Market app'];
      row.innerHTML = topics.map(t =>
        `<button class="chip" onclick="document.getElementById('ref-topic').value='${t}';lookupRule()">${t}</button>`).join('');
    }
  }, 300);
});

// ═══════════════════════════════════════════════════════════════════
// v2.3 — Master Gear Reference integration extras
// ═══════════════════════════════════════════════════════════════════

// Loot Box roller (M.R.A.M.A.Z.E. from Achievements_and_Loot_Boxes via spreadsheet)
function rollLootBox() {
  const d10 = String(Math.floor(Math.random() * 10) + 1);
  const box = CPRED_DATA.master.lootBoxes[d10];
  if (!box) { notify('No box data for roll ' + d10, 'error'); return; }
  const d6 = Math.floor(Math.random() * 6) + 1;
  const item = box.contents.find(c => c.d6 == String(d6)) || box.contents[0];
  const out = document.getElementById('enc-output');
  document.getElementById('enc-output-card').style.display = 'block';
  out.className = 'output-box';
  out.textContent = `MR. AMAZE'S LOOT BOX — d10: ${d10}\n\nBOX: ${box.desc}\n\nd6 ROLL: ${d6}\nCONTENTS: ${item.item}${item.notes ? '\nNOTES: ' + item.notes : ''}\n\n(All weapons arrive fully loaded. Opening the box is an Action.)`;
}

// Inject Loot Box button into the encounter generator actions row
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const btn = document.getElementById('enc-gen-btn');
    if (btn && !document.getElementById('loot-roll-btn')) {
      const loot = document.createElement('button');
      loot.id = 'loot-roll-btn';
      loot.className = 'btn btn-gold';
      loot.textContent = '🎲 Roll Loot Box';
      loot.onclick = rollLootBox;
      btn.parentNode.appendChild(loot);
    }
  }, 400);
});

// ═══════════════════════════════════════════════════════════════════
// v3.0 — GM host server, folder store, custom equipment, upgrades,
// NPC generator repair + manual creation, PC/NPC session tracker.
// ═══════════════════════════════════════════════════════════════════

// ── HOST SESSION ───────────────────────────────────────────────────
let hosting = false;
async function toggleHost() {
  const btn = document.getElementById('host-btn');
  const status = document.getElementById('host-status');
  if (!ipc) { notify('Hosting requires the desktop app', 'error'); return; }
  if (!hosting) {
    const r = await callIPC('server-start', 8045);
    if (r.success) {
      hosting = true;
      btn.textContent = 'Stop Hosting';
      btn.style.color = 'var(--red)';
      const addr = (r.ips && r.ips[0] ? r.ips[0] : 'localhost') + ':' + r.port;
      status.innerHTML = `<span style="color:var(--green)">● HOSTING</span> — players connect to: <span style="color:var(--neon)">${addr}</span> (or open http://${addr} in a browser)`;
      notify('Hosting on ' + addr, 'success');
    } else notify('Host failed: ' + r.error, 'error');
  } else {
    await callIPC('server-stop');
    hosting = false;
    btn.textContent = 'Host Session';
    btn.style.color = 'var(--gold)';
    status.textContent = '';
    notify('Stopped hosting', '');
  }
}

// Live sync notifications from player uploads
if (ipc) {
  ipc.on('player-sync', (e, d) => {
    notify('Player sync: ' + (d.name || d.id), 'success');
    if (document.getElementById('enc-session-wrap')?.style.display === 'block') renderSessionTracker();
  });
}

// ── FOLDER STORE INTEGRATION ───────────────────────────────────────
// The character folders are the real store; localStorage stays as a cache for
// browser-mode previews. A character belongs to exactly one folder — the one
// it was loaded from (_kind), defaulting to pcs — so it can never end up as
// both a pcs file and an npcs file.
const _origSaveToLocalStorage = saveToLocalStorage;
const _storeSaveTimers = {};   // one pending folder write per character id

// Sheets save on every keystroke; coalesce those into one folder write so the
// store isn't rewritten dozens of times while a name is being typed. Timers
// are per character so switching sheets never drops a pending save.
function queueStoreSave(kind, c) {
  const key = String(c.id);
  clearTimeout(_storeSaveTimers[key]);
  _storeSaveTimers[key] = setTimeout(() => {
    delete _storeSaveTimers[key];
    callIPC('store-save', kind, c).then(r => {
      if (r && r.success) { c._kind = kind; if (r.file) c._file = r.file; }
    });
  }, 500);
}

function cancelQueuedStoreSave(id) {
  const key = String(id);
  clearTimeout(_storeSaveTimers[key]);
  delete _storeSaveTimers[key];
}

saveToLocalStorage = function() {
  const kind = (char && (char._kind === 'npcs' ? 'npcs' : char._kind === 'pcs' ? 'pcs' : null));
  if (ipc && char && kind) { queueStoreSave(kind, char); return; }
  _origSaveToLocalStorage();
  if (ipc && char && char.name) queueStoreSave('pcs', char);
};

// One-time migration of existing localStorage characters into the pcs folder
async function migrateToFolders() {
  if (!ipc || localStorage.getItem('cpred_migrated_v3')) return;
  const stored = JSON.parse(localStorage.getItem('cpred_chars') || '[]');
  for (const c of stored) await callIPC('store-save', 'pcs', c);
  localStorage.setItem('cpred_migrated_v3', '1');
}
document.addEventListener('DOMContentLoaded', () => setTimeout(migrateToFolders, 800));

// ── CUSTOM EQUIPMENT ("Add Other") in every GM browser ────────────
const MODS_FIELD = ['mods', 'Modifiers to Stats / Skills (e.g. +1 REF, +2 Handgun)'];
const GM_CUSTOM_FIELDS = {
  weapons: [['name','Name'],['damage','Damage (e.g. 3d6)'],['rof','ROF'],['mag','Magazine'],['cost','Cost (eb)'],['features','Features / Notes'],MODS_FIELD],
  armor: [['name','Name'],['sp','SP'],['penalty','Penalty'],['cost','Cost (eb)'],['notes','Notes'],MODS_FIELD],
  cyberware: [['name','Name'],['hl','Humanity Loss (e.g. 7 (2d6))'],['install','Install'],['cost','Cost (eb)'],['description','Effect'],MODS_FIELD],
  gear: [['name','Name'],['cost','Cost (eb)'],['description','Description'],MODS_FIELD],
  netPrograms: [['name','Name'],['damage','Damage / Effect'],['cost','Cost (eb)'],['description','Description'],MODS_FIELD],
  vehicles: [['name','Name'],['sdp','SDP'],['sp','SP'],['seats','Seats'],['cost','Cost (eb)'],['description','Notes'],MODS_FIELD]
};

function customFormHTML(listKey) {
  const fields = GM_CUSTOM_FIELDS[listKey] || GM_CUSTOM_FIELDS.gear;
  return `<div id="custom-form-${listKey}" style="display:none;background:rgba(0,229,255,0.04);border:1px dashed var(--neon);border-radius:4px;padding:10px;margin-top:8px">
    <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--neon);letter-spacing:1px;margin-bottom:6px">CUSTOM ITEM — matching stat fields</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${fields.map(([k,l]) => `<div class="field"><label>${l}</label><input id="gmcf-${listKey}-${k}"></div>`).join('')}
    </div>
    <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="saveCustomItem('${listKey}')">Save To Character</button>
  </div>`;
}

function toggleCustomForm(listKey) {
  const el = document.getElementById('custom-form-' + listKey);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function saveCustomItem(listKey) {
  const fields = GM_CUSTOM_FIELDS[listKey] || GM_CUSTOM_FIELDS.gear;
  const it = { custom: true, source: 'Custom', upgrades: [] };
  fields.forEach(([k]) => { const v = document.getElementById(`gmcf-${listKey}-${k}`)?.value; if (v) it[k] = v; });
  if (!it.name) { notify('Name required', 'error'); return; }
  if (it.mods) it.mods = parseItemMods(it.mods); // "+1 REF, +2 Handgun" → structured
  if (listKey === 'armor') {
    char.armor.body = it.name; char.armor.bodySP = parseInt(it.sp) || 0;
    if (!char.customArmor) char.customArmor = [];
    char.customArmor.push(it);
    initArmorBrowser();
  } else if (listKey === 'vehicles') {
    if (!char.vehicles) char.vehicles = [];
    char.vehicles.push({ ...it, sdp: parseInt(it.sdp)||20, sp: parseInt(it.sp)||0, seats: parseInt(it.seats)||1, curSDP: parseInt(it.sdp)||20, upgrades: [] });
    renderOwnedVehicles();
  } else if (listKey === 'weapons') { char.weapons.push({ ...it, ammo:'', notes: it.features||'' }); renderEquippedWeapons(); }
  else if (listKey === 'cyberware') { char.cyberware.push(it); renderInstalledCW(); }
  else if (listKey === 'netPrograms') { if (!char.netPrograms) char.netPrograms = []; char.netPrograms.push(it); renderLoadedPrograms(); }
  else { char.gear.push({ name: it.name, qty: 1, notes: it.description||'', mods: it.mods }); renderCarriedGear(); }
  toggleCustomForm(listKey);
  saveToLocalStorage();
  const modStr = it.mods ? modsToStr(it.mods) : '';
  notify('Custom item added: ' + it.name + (modStr ? ' (' + modStr + ')' : ''), 'success');
  if (activeSection === 'stats') renderStatsView();
  if (activeSection === 'sheet') renderFullSheet();
}

// Inject "Add Custom" buttons + forms into each equipment section on load
document.addEventListener('DOMContentLoaded', () => setTimeout(() => {
  const spots = [
    ['equipped-weapons-list', 'weapons'], ['cw-installed-list', 'cyberware'],
    ['carried-gear-list', 'gear'], ['net-programs-loaded', 'netPrograms'],
    ['owned-vehicles-list', 'vehicles']
  ];
  spots.forEach(([id, key]) => {
    const anchor = document.getElementById(id);
    if (anchor && !document.getElementById('custom-form-' + key)) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<button class="btn btn-gold btn-sm" style="margin-top:8px" onclick="toggleCustomForm('${key}')">➕ Add Custom (not in database)</button>` + customFormHTML(key);
      anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    }
  });
  // Armor: custom form into the equipped armor card
  const armorCard = document.getElementById('armor-head');
  if (armorCard && !document.getElementById('custom-form-armor')) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<button class="btn btn-gold btn-sm" style="margin-top:8px" onclick="toggleCustomForm('armor')">➕ Add Custom Armor</button>` + customFormHTML('armor');
    armorCard.closest('.cs-section').appendChild(wrap);
  }
}, 600));

// ── UPGRADES / OPTIONS on owned items (GM app) ─────────────────────
function gmUpgradeSource(listKey) {
  if (listKey === 'vehicles') return CPRED_DATA.vehicleUpgrades.map(u => ({ name: u.name, effect: u.effect, cost: u.cost }));
  if (listKey === 'weapons') return CPRED_DATA.weaponAttachments.map(a => ({ name: a.name, effect: a.effect, cost: a.cost }));
  if (listKey === 'cyberware') return Object.values(CPRED_DATA.cyberware).flat().map(c => ({ name: c.name, effect: (c.description||'').slice(0, 70), cost: c.cost }));
  if (listKey === 'armor') return [
    { name: 'Reinforced Plating', effect: '+1 SP (GM approval)', cost: '500eb' },
    { name: 'Concealed Pockets', effect: 'Hidden storage, DV15 to spot', cost: '100eb' },
    { name: 'Style Upgrade', effect: '+1 Wardrobe & Style while worn', cost: '100eb' }
  ];
  return [];
}

function upgradePanelHTML(listKey, idx) {
  return `
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px">
      <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();gmShowUpgrades('${listKey}',${idx})">+ Upgrade/Option</button>
      <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();gmCustomUpgrade('${listKey}',${idx})">+ Add Other</button>
    </div>
    <div id="gm-upg-${listKey}-${idx}" style="display:none;margin-top:5px" onclick="event.stopPropagation()"></div>`;
}

function upgradeRowsHTML(item) {
  return (item.upgrades || []).map((u, ui) => {
    const modStr = u.mods ? modsToStr(u.mods) : '';
    return `
    <div style="background:rgba(255,214,0,0.05);border-left:2px solid var(--gold);padding:3px 8px;margin:2px 0 2px 10px;font-family:'Share Tech Mono',monospace;font-size:9px;color:#c0b060;display:flex;justify-content:space-between" onclick="event.stopPropagation()">
      <span>▸ ${u.name}${u.effect ? ' — ' + u.effect : ''}${modStr ? ` <span style="color:var(--green)">[${modStr}]</span>` : ''}${u.custom ? ' (custom)' : ''}</span>
      <span data-upg-remove="${ui}" style="cursor:pointer;color:var(--red)">✕</span>
    </div>`;
  }).join('');
}

function listForKey(listKey) {
  if (listKey === 'weapons') return char.weapons;
  if (listKey === 'cyberware') return char.cyberware;
  if (listKey === 'vehicles') return char.vehicles || [];
  return [];
}

function gmShowUpgrades(listKey, idx) {
  const panel = document.getElementById(`gm-upg-${listKey}-${idx}`);
  if (!panel) return;
  if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
  const src = gmUpgradeSource(listKey);
  panel.style.display = 'block';
  panel.innerHTML = `<input placeholder="Filter..." style="margin-bottom:4px;font-size:11px" oninput="gmFilterUpg('${listKey}',${idx},this.value)">
    <div id="gm-upg-list-${listKey}-${idx}" style="max-height:160px;overflow-y:auto">${gmUpgRows(listKey, idx, src)}</div>`;
}

function gmUpgRows(listKey, idx, src) {
  return src.map(u => `
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:3px;padding:4px 8px;margin-bottom:3px">
      <span style="font-family:'Share Tech Mono',monospace;font-size:9px"><span style="color:var(--neon)">${u.name}</span> <span style="color:var(--dim)">${u.effect||''} ${u.cost?'· '+u.cost:''}</span></span>
      <button class="btn btn-gold btn-xs" onclick='gmAttachUpgrade("${listKey}",${idx},${JSON.stringify(JSON.stringify(u))})'>Add</button>
    </div>`).join('') || '<div style="font-size:9px;color:var(--dim);font-family:Share Tech Mono,monospace">No database upgrades — use Add Other</div>';
}

function gmFilterUpg(listKey, idx, q) {
  const src = gmUpgradeSource(listKey).filter(u => !q || u.name.toLowerCase().includes(q.toLowerCase()));
  document.getElementById(`gm-upg-list-${listKey}-${idx}`).innerHTML = gmUpgRows(listKey, idx, src);
}

function gmAttachUpgrade(listKey, idx, uStr) {
  const u = JSON.parse(uStr);
  const it = listForKey(listKey)[idx];
  if (!it) return;
  if (!it.upgrades) it.upgrades = [];
  it.upgrades.push({ name: u.name, effect: u.effect || '' });
  saveToLocalStorage();
  refreshOwned(listKey);
  notify(u.name + ' added to ' + it.name, 'success');
}

function gmCustomUpgrade(listKey, idx) {
  const name = prompt('Upgrade / option name (e.g. Stealth Coating):');
  if (!name) return;
  const effect = prompt('Effect / notes (optional):') || '';
  const it = listForKey(listKey)[idx];
  if (!it) return;
  if (!it.upgrades) it.upgrades = [];
  it.upgrades.push({ name, effect, custom: true });
  saveToLocalStorage();
  refreshOwned(listKey);
  notify('Custom upgrade saved to sheet', 'success');
}

function refreshOwned(listKey) {
  if (listKey === 'weapons') renderEquippedWeapons();
  else if (listKey === 'cyberware') renderInstalledCW();
  else if (listKey === 'vehicles') renderOwnedVehicles();
}

// Delegate ✕ on upgrade rows (rows are re-rendered HTML)
document.addEventListener('click', e => {
  const rm = e.target.getAttribute && e.target.getAttribute('data-upg-remove');
  if (rm === null || rm === undefined) return;
  const host = e.target.closest('[data-upg-host]');
  if (!host) return;
  const [listKey, idx] = host.getAttribute('data-upg-host').split(':');
  const it = listForKey(listKey)[+idx];
  if (it && it.upgrades) { it.upgrades.splice(+rm, 1); saveToLocalStorage(); refreshOwned(listKey); }
});

// ── OVERRIDE owned renderers to include upgrades UI ────────────────
function renderEquippedWeapons() {
  const el = document.getElementById('equipped-weapons-list');
  if (!char.weapons.length) { el.innerHTML = '<div style="color:var(--dim);font-family:Share Tech Mono,monospace;font-size:11px;padding:8px">No weapons equipped</div>'; return; }
  el.innerHTML = char.weapons.map((w, i) => `
    <div class="gear-list-item" data-upg-host="weapons:${i}" style="flex-direction:column;align-items:flex-start;gap:6px">
      <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
        <div class="gear-list-name" style="color:var(--neon);font-family:'Orbitron',monospace;font-size:10px">${w.name}${w.custom?' <span class="badge badge-gold">custom</span>':''}</div>
        <button class="btn btn-xs btn-red" onclick="removeWeapon(${i})">✕</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="badge badge-red">DMG ${w.damage||'—'}</span><span class="badge badge-neon">ROF ${w.rof||'—'}</span><span class="badge badge-gold">${w.cost||''}</span>
      </div>
      ${upgradeRowsHTML(w)}
      <div style="display:flex;gap:8px;width:100%">
        <div class="field" style="flex:1"><label>Ammo</label><input value="${w.ammo||''}" oninput="char.weapons[${i}].ammo=this.value;saveToLocalStorage()" style="font-size:11px"></div>
        <div class="field" style="flex:2"><label>Notes</label><input value="${w.notes||''}" oninput="char.weapons[${i}].notes=this.value;saveToLocalStorage()" style="font-size:11px"></div>
      </div>
      ${upgradePanelHTML('weapons', i)}
    </div>`).join('');
}

function renderInstalledCW() {
  const el = document.getElementById('cw-installed-list');
  if (!char.cyberware.length) { el.innerHTML = '<div style="color:var(--dim);font-size:11px;font-family:Share Tech Mono,monospace;padding:8px">No cyberware installed</div>'; }
  else {
    el.innerHTML = char.cyberware.map((c, i) => {
      const slot = cyberSlotOf(c);
      const paired = CW_PAIRED[slot];
      const locPicker = paired ? `
        <select onchange="setCWLoc(${i}, this.value)" style="font-size:9px;padding:2px 4px;margin-top:2px;width:auto" title="Which side of the body?">
          <option value="" ${!c.bodyLoc?'selected':''}>Auto side</option>
          <option value="R" ${c.bodyLoc==='R'?'selected':''}>Right</option>
          <option value="L" ${c.bodyLoc==='L'?'selected':''}>Left</option>
        </select>` : '';
      return `
      <div class="gear-list-item" data-upg-host="cyberware:${i}" style="flex-direction:column;align-items:flex-start;gap:4px">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
          <div>
            <div style="font-family:'Orbitron',monospace;font-size:9px;color:var(--neon)">${c.name}${c.custom?' <span class="badge badge-gold">custom</span>':''}</div>
            <div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--dim)">HL: ${c.hl||'—'} | ${c.install||'—'}${slot?' | maps to '+CW_SLOT_LABEL[slot]:''}</div>
            ${locPicker}
          </div>
          <button class="btn btn-xs btn-red" onclick="removeCW(${i})">✕</button>
        </div>
        ${upgradeRowsHTML(c)}
        ${upgradePanelHTML('cyberware', i)}
      </div>`;
    }).join('');
  }
  let tHL = 0;
  char.cyberware.forEach(c => { const m = String(c.hl||'').match(/\d+/); if (m) tHL += parseInt(m[0]); });
  document.getElementById('total-hl').textContent = tHL;
  const maxHum = (char.stats.EMP || 5) * 10;
  document.getElementById('current-humanity').textContent = Math.max(0, maxHum - tHL);
  renderBodyMap();
}

// ── Cyberware → body location mapping ──────────────────────────────
const CW_PAIRED = { eye: ['bm-reye', 'bm-leye'], arm: ['bm-rarm', 'bm-larm'], leg: ['bm-rleg', 'bm-lleg'] };
const CW_SLOT_LABEL = { neural: 'Neural Link', audio: 'Cyberaudio', eye: 'Cybereye', arm: 'Cyberarm', leg: 'Cyberleg' };

// Which body location an installed piece of chrome maps to (by name)
function cyberSlotOf(item) {
  const n = (item && item.name || '').toLowerCase();
  if (/neural|sandevistan|kerenzikov|reflex co|nervous|synaptic|neuralware/.test(n)) return 'neural';
  if (/cyberaudio|audio suite|amplified hearing|radio comm|ear|hearing/.test(n)) return 'audio';
  if (/cybereye|smartlens|optic|targeting scope|eye/.test(n)) return 'eye';
  if (/cyberarm|arm/.test(n)) return 'arm';
  if (/cyberleg|leg/.test(n)) return 'leg';
  return null;
}

function setCWLoc(i, val) {
  if (!char.cyberware[i]) return;
  if (val) char.cyberware[i].bodyLoc = val; else delete char.cyberware[i].bodyLoc;
  saveToLocalStorage();
  renderInstalledCW();
}

function renderBodyMap() {
  const buckets = { 'bm-neural': [], 'bm-audio': [], 'bm-reye': [], 'bm-leye': [], 'bm-rarm': [], 'bm-larm': [], 'bm-rleg': [], 'bm-lleg': [] };
  const autoFill = { eye: 0, arm: 0, leg: 0 };
  (char.cyberware || []).forEach(item => {
    const slot = cyberSlotOf(item);
    if (!slot) return;
    if (slot === 'neural') { buckets['bm-neural'].push(item.name); return; }
    if (slot === 'audio') { buckets['bm-audio'].push(item.name); return; }
    const pair = CW_PAIRED[slot];
    let target;
    if (item.bodyLoc === 'R') target = pair[0];
    else if (item.bodyLoc === 'L') target = pair[1];
    else { target = pair[autoFill[slot] % 2]; autoFill[slot]++; } // auto: right then left
    buckets[target].push(item.name);
  });
  Object.entries(buckets).forEach(([id, arr]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = arr.length ? arr.join(', ') : '—';
  });
}

function renderOwnedVehicles() {
  const el = document.getElementById('owned-vehicles-list');
  if (!el) return;
  if (!char.vehicles || !char.vehicles.length) {
    el.innerHTML = '<div style="color:var(--dim);font-size:11px;font-family:Share Tech Mono,monospace;padding:8px">No vehicles — buy or add from the database</div>'; return;
  }
  el.innerHTML = char.vehicles.map((v, i) => `
    <div class="gear-list-item" data-upg-host="vehicles:${i}" style="flex-direction:column;align-items:flex-start;gap:6px;${i===upgradeTargetIdx?'border-color:var(--neon)':''}" onclick="upgradeTargetIdx=${i};renderOwnedVehicles()">
      <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
        <div style="font-family:'Orbitron',monospace;font-size:10px;color:var(--neon)">${v.name}${v.custom?' <span class="badge badge-gold">custom</span>':''} ${i===upgradeTargetIdx?'<span class="badge badge-neon" style="margin-left:6px">selected</span>':''}</div>
        <button class="btn btn-xs btn-red" onclick="event.stopPropagation();removeVehicle(${i})">✕</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="badge badge-neon">SDP ${v.curSDP!==undefined?v.curSDP:v.sdp}/${v.sdp}</span><span class="badge badge-red">SP ${v.sp||0}</span><span class="badge badge-green">Seats ${v.seats||1}</span>
      </div>
      ${upgradeRowsHTML(v)}
      <div style="display:flex;gap:8px;width:100%;align-items:center" onclick="event.stopPropagation()">
        <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted)">Current SDP:</span>
        <input type="number" value="${v.curSDP !== undefined ? v.curSDP : v.sdp}" min="0" max="${v.sdp}" style="width:60px;text-align:center" oninput="char.vehicles[${i}].curSDP=+this.value;saveToLocalStorage()">
      </div>
      ${upgradePanelHTML('vehicles', i)}
    </div>`).join('');
}

// ── NPC GENERATOR: REPAIRED (offline fallback + optional API key) ──
// The desktop app cannot use the keyless API that works inside claude.ai,
// which is why generation errored. Fix: offline procedural generator as
// the default, with an optional user-supplied API key for AI generation.
const NPC_NAMES_FIRST = ["Jax","Rogue","Nix","Dex","Vera","Kato","Suki","Marco","Elena","Dre","Yuri","Pilar","Kev","Ash","Rio","Zane","Mona","Trace","Kira","Bolt"];
const NPC_NAMES_LAST = ["Reyes","Volkov","Tanaka","Okafor","Silva","Nowak","Kim","Duarte","Ash","Novak","Carter","Ito","Marsh","Vega","Cruz","Petrov","Osei","Lam","Ryder","Stone"];
const NPC_HANDLES = ["Static","Razor","Ghost","Widow","Fuse","Havoc","Neon","Creep","Saint","Jinx","Viper","Echo","Drift","Hex","Blitz","Cinder","Patch","Snake","Lux","Grim"];
const NPC_QUIRKS = ["chain-smokes synth-cigs","never blinks (cheap cybereyes)","quotes old pre-War movies","collects victim's shoelaces","hums corporate jingles","won't use elevators","always eats mid-conversation","speaks in third person","terrified of AVs","owes everyone money"];
const NPC_MOTIVES = ["needs eddies for a dying sibling's biosculpt","wants revenge on a Militech officer","is skimming from their own gang","dreams of joining a Nomad family","is secretly an NCPD informant","wants to buy out their contract","is hunting the person who zeroed their partner","protects the block's kids fiercely","is one bad day from cyberpsychosis","just wants to see the ocean once"];

function offlineNPC(role, affil, district, tone, notes) {
  const r = a => a[Math.floor(Math.random() * a.length)];
  const d6 = () => Math.floor(Math.random() * 6) + 1;
  const statFor = base => Math.max(2, Math.min(8, base + Math.floor(Math.random() * 3) - 1));
  const tmpl = CPRED_DATA.templates[role] || CPRED_DATA.templates.Solo;
  const stats = {};
  Object.entries(tmpl.recommendedStats || {INT:5,REF:5,COOL:5,BODY:5,TECH:5,LUCK:5}).forEach(([k, v]) => stats[k] = statFor(v));
  const hp = 10 + 5 * (stats.BODY || 5);
  const wpnPool = Object.values(CPRED_DATA.weapons).flat();
  const wpn = r(wpnPool);
  const armor = r(CPRED_DATA.armor.filter(a => a.sp <= 13));
  const name = r(NPC_NAMES_FIRST) + ' ' + r(NPC_NAMES_LAST);
  const handle = r(NPC_HANDLES);
  const skills = (tmpl.coreSkills || []).slice(0, 4).map(s => s + ' +' + (d6() + 6)).join(', ');
  const netLine = role === 'Netrunner' ? `\nCYBERDECK: Standard Quality | PROGRAMS: Sword, Armor, Worm, See Ya | Interface ${Math.min(6, d6()+2)}` : '';
  return `NAME: ${name} "${handle}"
ROLE: ${role} (${affil})
DISTRICT: ${district} | DISPOSITION: ${tone}
APPEARANCE: ${r(['Wiry','Heavyset','Scarred','Chromed-out','Immaculate','Twitchy'])} ${role.toLowerCase()} with ${r(['a facial LED strip','mismatched cybereyes','gang ink up the neck','a battered armorjack','mirrored shades at night','a permanent sneer'])}.
QUIRK: ${r(NPC_QUIRKS)}
MOTIVATION: ${r(NPC_MOTIVES)}${notes ? '\nGM NOTES: ' + notes : ''}
STATS: INT ${stats.INT||5} | REF ${stats.REF||5} | COOL ${stats.COOL||5} | BODY ${stats.BODY||5} | TECH ${stats.TECH||5} | LUCK ${stats.LUCK||5} | HP: ${hp}
ARMOR: ${armor.name} (SP ${armor.sp})
WEAPON: ${wpn.name} — ${wpn.damage} DMG, ROF ${wpn.rof}
SKILLS: ${skills}${netLine}
HOOK: ${r(['Knows where the crew\'s last target is hiding','Owes a favor to one PC\'s contact','Saw something they shouldn\'t have last night','Is selling exactly what the crew needs — at a price','Recognizes a PC from a past job gone wrong','Has a data shard someone will kill for'])}
[Generated offline — template + random tables]`;
}

async function generateNPC() {
  const btn = document.getElementById('npc-gen-btn');
  btn.textContent = 'GENERATING...'; btn.disabled = true;
  const out = document.getElementById('npc-output');
  document.getElementById('npc-output-card').style.display = 'block';
  const role = document.getElementById('npc-role').value;
  const affil = document.getElementById('npc-affil').value;
  const district = document.getElementById('npc-district').value;
  const tone = document.getElementById('npc-tone').value;
  const notes = document.getElementById('npc-notes').value;

  let text = null;
  const apiKey = localStorage.getItem('cpred_api_key');
  if (apiKey) {
    out.className = 'output-box loading-pulse';
    out.textContent = '// Contacting AI oracle...';
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 900,
          system: 'Cyberpunk RED GM assistant. Generate an NPC with labeled lines: NAME, ROLE, APPEARANCE, PERSONALITY, MOTIVATION, STATS (INT/REF/COOL/BODY/TECH/LUCK, HP, Armor), GEAR, SKILLS, HOOK.',
          messages: [{ role: 'user', content: `${tone} ${role} NPC, affiliated ${affil}, in ${district}. ${notes||''}` }] })
      });
      const d = await r.json();
      if (d.content && d.content[0]) text = d.content[0].text;
    } catch (e) { /* fall through to offline */ }
  }
  if (!text) text = offlineNPC(role, affil, district, tone, notes);
  out.className = 'output-box';
  out.textContent = text;
  btn.textContent = '⚡ Generate NPC'; btn.disabled = false;
  document.getElementById('npc-save-btn').style.display = 'inline-flex';
  window._lastNPC = { role, affil, district, text };
}

// Save generated NPC to the npcs folder as a tracker-compatible character
function saveNPC() {
  if (!window._lastNPC) return;
  const t = window._lastNPC.text;
  const grab = label => { const m = t.match(new RegExp('^' + label + ':\\s*(.+)$', 'm')); return m ? m[1].trim() : ''; };
  const nameRaw = grab('NAME') || 'Unknown NPC';
  const statLine = grab('STATS');
  const num = k => { const m = statLine.match(new RegExp(k + '\\s+(\\d+)')); return m ? parseInt(m[1]) : 5; };
  const hpM = statLine.match(/HP:\s*(\d+)/);
  const npc = {
    id: 'npc_' + Date.now(), isNPC: true,
    name: nameRaw.replace(/"[^"]*"/, '').trim(), handle: (nameRaw.match(/"([^"]*)"/) || [,''])[1],
    role: window._lastNPC.role,
    stats: { INT:num('INT'), REF:num('REF'), DEX:5, TECH:num('TECH'), COOL:num('COOL'), WILL:5, LUCK:num('LUCK'), MOVE:5, BODY:num('BODY'), EMP:5 },
    hp: hpM ? +hpM[1] : 30, maxHp: hpM ? +hpM[1] : 30, wounds: 0, eddies: 0,
    skills: {}, weapons: [{ name: grab('WEAPON') || 'Sidearm', damage: '', rof: '', ammo:'', notes:'' }],
    armor: { head:'', headSP:0, body: grab('ARMOR'), bodySP: parseInt((grab('ARMOR').match(/SP\s*(\d+)/)||[,'11'])[1]), shield:'', shieldSP:0 },
    cyberware: [], gear: [], vehicles: [], netPrograms: [],
    notes: t, trackerNotes: '', trackerCrits: ''
  };
  if (ipc) callIPC('store-save', 'npcs', npc).then(() => notify('NPC saved to npcs folder', 'success'));
  npcRoster.unshift({ id: Date.now(), name: nameRaw, ...window._lastNPC });
  npcRoster = npcRoster.slice(0, 30);
  localStorage.setItem('cpred_npcs', JSON.stringify(npcRoster));
  renderNPCRoster();
}

// ── MANUAL NPC CREATION (simplified sheet) ─────────────────────────
function injectManualNPCForm() {
  const panel = document.getElementById('panel-npcs');
  if (!panel || document.getElementById('manual-npc-card')) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'manual-npc-card';
  card.innerHTML = `
    <div class="card-title">◈ Create NPC Manually (simplified)</div>
    <div class="form-grid-2">
      <div class="field"><label>Name</label><input id="mnpc-name" placeholder="Street name + handle"></div>
      <div class="field"><label>Role</label><select id="mnpc-role" onchange="document.getElementById('mnpc-net-wrap').style.display=this.value==='Netrunner'?'block':'none'">${CPRED_DATA.roles.map(r=>`<option>${r}</option>`).join('')}</select></div>
    </div>
    <label style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase">Stats</label>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:6px 0 10px">
      ${['INT','REF','COOL','TECH','BODY','LUCK'].map(s=>`<div class="stat-box"><div class="stat-box-label">${s}</div><input type="number" id="mnpc-${s}" value="5" min="1" max="10" class="stat-input" style="font-size:13px;padding:4px 2px"></div>`).join('')}
    </div>
    <div class="form-grid-2">
      <div class="field"><label>Weapons (comma separated)</label><input id="mnpc-weapons" placeholder="Heavy Pistol 3d6, Chainknife 2d6"></div>
      <div class="field"><label>Armor</label><input id="mnpc-armor" placeholder="Light Armorjack SP 11"></div>
    </div>
    <div id="mnpc-net-wrap" style="display:none;margin-top:8px">
      <div class="form-grid-2">
        <div class="field"><label>Cyberdeck</label><input id="mnpc-deck" placeholder="Standard Quality Cyberdeck"></div>
        <div class="field"><label>Programs / Interface</label><input id="mnpc-programs" placeholder="Sword, Armor, Worm · Interface 4"></div>
      </div>
    </div>
    <div class="actions-row">
      <button class="btn btn-primary btn-sm" onclick="saveManualNPC()">Save NPC To Folder</button>
      <button class="btn btn-ghost btn-sm" onclick="if(ipc)callIPC('open-store-folder')">Open Characters Folder</button>
    </div>`;
  const firstCard = panel.querySelector('.card');
  firstCard.parentNode.insertBefore(card, firstCard.nextSibling);
}

function saveManualNPC() {
  const g = id => document.getElementById(id).value;
  const role = g('mnpc-role');
  if (!g('mnpc-name')) { notify('Name required', 'error'); return; }
  const stats = {};
  ['INT','REF','COOL','TECH','BODY','LUCK'].forEach(s => stats[s] = parseInt(g('mnpc-' + s)) || 5);
  stats.DEX = 5; stats.WILL = 5; stats.MOVE = 5; stats.EMP = 5;
  const hp = 10 + 5 * stats.BODY;
  const npc = {
    id: 'npc_' + Date.now(), isNPC: true,
    name: g('mnpc-name'), handle: '', role,
    stats, hp, maxHp: hp, wounds: 0, eddies: 0, skills: {},
    weapons: g('mnpc-weapons').split(',').filter(Boolean).map(w => ({ name: w.trim(), damage: (w.match(/\d+d6/)||[''])[0], rof: '', ammo:'', notes:'' })),
    armor: { head:'', headSP:0, body: g('mnpc-armor'), bodySP: parseInt((g('mnpc-armor').match(/\d+/)||['11'])[0]), shield:'', shieldSP:0 },
    cyberware: [], gear: [], vehicles: [],
    netPrograms: role === 'Netrunner' ? g('mnpc-programs').split(',').filter(Boolean).map(p => ({ name: p.trim() })) : [],
    netDeck: role === 'Netrunner' ? g('mnpc-deck') : '',
    notes: `Manual NPC · ${role}`, trackerNotes: '', trackerCrits: ''
  };
  if (ipc) callIPC('store-save', 'npcs', npc).then(r => notify(r.success ? 'NPC saved to npcs folder' : 'Save failed: ' + r.error, r.success ? 'success' : 'error'));
  else { savedChars.push(npc); localStorage.setItem('cpred_chars', JSON.stringify(savedChars)); notify('NPC saved (browser mode)', 'success'); }
}
document.addEventListener('DOMContentLoaded', () => setTimeout(injectManualNPCForm, 500));

// ── SESSION TRACKER: PCs + NPCs from folders + custom folder ───────
let customFolderChars = [];
let customFolderPath = '';
let sessionAutoTimer = null;
// Permanent character deletion is hidden behind this toggle so the tracker's
// everyday controls only ever add/remove characters from the current session.
let sessManageMode = false;

function sessToggleManage() {
  sessManageMode = !sessManageMode;
  sessDeleteArmed = null;
  renderSessionTracker();
}

async function folderChars() {
  if (!ipc) { refreshSavedChars(); return savedChars.map(c => ({ ...c, _kind: 'pcs' })); }
  const pcs = await callIPC('store-list', 'pcs');
  const npcs = await callIPC('store-list', 'npcs');
  return [
    ...(pcs.chars || []).map(c => ({ ...c, _kind: 'pcs' })),
    ...(npcs.chars || []).map(c => ({ ...c, _kind: 'npcs', isNPC: true })),
    ...customFolderChars.map(c => ({ ...c, _kind: 'custom' }))
  ];
}

async function renderSessionTracker() {
  const all = await folderChars();
  const { unique, dups } = dedupeList(all);
  // If a session character was itself a collapsed duplicate, move its session
  // membership onto the kept copy so its card/controls still appear.
  const keptIdByKey = {};
  unique.forEach(c => { keptIdByKey[dedupeKey(c)] = c.id; });
  let remapped = false;
  sessionCharIds = sessionCharIds.map(id => {
    const src = all.find(x => String(x.id) === String(id));
    if (!src) return id;
    const kept = keptIdByKey[dedupeKey(src)];
    if (kept !== undefined && String(kept) !== String(id)) { remapped = true; return kept; }
    return id;
  });
  if (remapped) { sessionCharIds = [...new Set(sessionCharIds.map(String))]; localStorage.setItem('cpred_session_ids', JSON.stringify(sessionCharIds)); }
  const inSessionSet = new Set(sessionCharIds.map(String));
  const picker = document.getElementById('session-char-picker');
  picker.innerHTML = `
    <div style="width:100%;display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button class="btn btn-outline btn-sm" onclick="pickCustomFolder()">📁 Load From Folder...</button>
      <button class="btn btn-ghost btn-sm" onclick="if(ipc)callIPC('open-store-folder')">Open Characters Folder</button>
      <button class="btn btn-ghost btn-sm" onclick="renderSessionTracker()">↻ Refresh</button>
      <button class="btn btn-outline btn-sm" onclick="sessRollInitAll()">🎲 Roll Initiative (All)</button>
      <button class="btn btn-ghost btn-sm" onclick="sessClearInitAll()">Clear Initiative</button>
      ${dups.length ? `<button class="btn btn-gold btn-sm" onclick="sessDedupe()" title="Remove duplicate characters/NPCs, keeping the newest of each">🧹 Dedupe (${dups.length})</button>` : ''}
      <button class="btn ${sessManageMode ? 'btn-red' : 'btn-ghost'} btn-sm" onclick="sessToggleManage()" title="Show controls that permanently delete a character from the character folders">${sessManageMode ? '✔ Done Managing' : '⚙ Manage Characters'}</button>
      ${customFolderPath ? `<span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--gold);align-self:center">Custom: ${customFolderPath}</span>` : ''}
    </div>
    <div style="width:100%;font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);margin-bottom:6px">Click a name to add/remove it from this session · ✕ = remove from the session (the character is kept)${sessManageMode ? ' · <span style="color:var(--red)">🗑 = permanently delete the character file (click twice)</span>' : ''}</div>` +
    (unique.length ? unique.map(c => {
      const inSession = inSessionSet.has(String(c.id));
      const tag = c.isNPC || c._kind === 'npcs' ? '<span class="badge badge-red" style="margin-left:4px">NPC</span>' : '<span class="badge badge-neon" style="margin-left:4px">PC</span>';
      const armed = String(sessDeleteArmed) === String(c.id);
      // Permanent deletion only shows in Manage mode — the everyday red button
      // beside a name must never destroy a character sheet.
      const trash = sessManageMode
        ? `<button class="btn btn-sm" style="background:${armed ? 'var(--red)' : 'rgba(255,23,68,0.1)'};color:${armed ? '#fff' : 'var(--red)'};border:1px solid rgba(255,23,68,0.4);border-left:none;border-top-left-radius:0;border-bottom-left-radius:0;padding:0 8px" title="Permanently delete this character (click twice to confirm)" onclick="sessArmDelete('${c.id}')">${armed ? 'Delete?' : '🗑'}</button>`
        : '';
      const roundRight = inSession || trash ? 'border-top-right-radius:0;border-bottom-right-radius:0' : '';
      const nameBtn = `<button class="btn ${inSession ? 'btn-primary' : 'btn-ghost'} btn-sm" style="${roundRight}" title="${inSession ? 'Remove from session' : 'Add to session'}" onclick="toggleSessionChar('${c.id}')">${inSession ? '✓ ' : '+ '}${c.name || 'Unnamed'}${tag}</button>`;
      const removeBtn = inSession ? `<button class="btn btn-sm" style="background:rgba(255,23,68,0.15);color:var(--red);border:1px solid rgba(255,23,68,0.4);border-left:none;${trash ? 'border-radius:0' : 'border-top-left-radius:0;border-bottom-left-radius:0'};padding:0 8px" title="Remove from session (the character is kept)" onclick="removeFromSession('${c.id}')">✕</button>` : '';
      return `<span style="display:inline-flex;align-items:stretch;margin:0 4px 4px 0">${nameBtn}${removeBtn}${trash}</span>`;
    }).join('') : '<div style="font-family:Share Tech Mono,monospace;font-size:11px;color:var(--dim)">No characters found — create PCs in Characters, NPCs in NPC Generator</div>');

  const grid = document.getElementById('session-tracker-grid');
  const inSession = unique.filter(c => inSessionSet.has(String(c.id)))
    .sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity));
  grid.innerHTML = inSession.map((c, i) => sessionCard(c, i + 1)).join('');

  // Auto-refresh while hosting so player edits appear live
  if (hosting && !sessionAutoTimer) {
    sessionAutoTimer = setInterval(() => {
      if (document.getElementById('enc-session-wrap')?.style.display === 'block') renderSessionTracker();
      else { clearInterval(sessionAutoTimer); sessionAutoTimer = null; }
    }, 4000);
  }
}

async function pickCustomFolder() {
  const r = await callIPC('pick-folder');
  if (r.success) {
    customFolderPath = r.dir;
    customFolderChars = r.chars || [];
    notify(`Loaded ${customFolderChars.length} character(s) from folder`, 'success');
    renderSessionTracker();
  }
}

// Session edits write back to the right store (folder or localStorage)
async function sessMutate(id, fn) {
  const all = await folderChars();
  const c = all.find(x => String(x.id) === String(id));
  if (!c) return;
  fn(c);
  if (ipc && (c._kind === 'pcs' || c._kind === 'npcs')) {
    await callIPC('store-save', c._kind, c);
  } else {
    refreshSavedChars();
    const i = savedChars.findIndex(x => x.id === id);
    if (i >= 0) { savedChars[i] = c; localStorage.setItem('cpred_chars', JSON.stringify(savedChars)); }
  }
  if (char && char.id === id) char = c;
  renderSessionTracker();
}

function sessField(id, field, value) {
  clearTimeout(sessFieldTimer[id + field]);
  sessFieldTimer[id + field] = setTimeout(async () => {
    const all = await folderChars();
    const c = all.find(x => String(x.id) === String(id));
    if (!c) return;
    c[field] = value;
    if (ipc && (c._kind === 'pcs' || c._kind === 'npcs')) await callIPC('store-save', c._kind, c);
    else {
      refreshSavedChars();
      const i = savedChars.findIndex(x => x.id === id);
      if (i >= 0) { savedChars[i][field] = value; localStorage.setItem('cpred_chars', JSON.stringify(savedChars)); }
    }
    if (char && char.id === id) char[field] = value;
  }, 500);
}

// ── SESSION TRACKER: Initiative (1d10 + REF, CP:R rules) ───────────
function sessRollInit(id) {
  sessMutate(id, c => {
    const ref = (c.stats && c.stats.REF) || 5;
    c.initiative = Math.floor(Math.random() * 10) + 1 + ref;
  });
}

function sessSetInit(id, value) {
  const v = value === '' ? null : parseInt(value);
  sessMutate(id, c => { c.initiative = (v === null || isNaN(v)) ? null : v; });
}

async function sessRollInitAll() {
  const all = await folderChars();
  const inSession = all.filter(c => sessionCharIds.some(x => String(x) === String(c.id)));
  for (const c of inSession) {
    const ref = (c.stats && c.stats.REF) || 5;
    await sessMutate(c.id, x => { x.initiative = Math.floor(Math.random() * 10) + 1 + ref; });
  }
}

async function sessClearInitAll() {
  const all = await folderChars();
  const inSession = all.filter(c => sessionCharIds.some(x => String(x) === String(c.id)));
  for (const c of inSession) await sessMutate(c.id, x => { x.initiative = null; });
}

// Open a session character's full sheet for mid-game viewing/editing.
// The char keeps its _kind so saveToLocalStorage routes edits back to
// the pcs/npcs folder store instead of localStorage.
// Save a session character's current sheet to a folder the GM picks
async function sessSaveToFolder(id) {
  const all = await folderChars();
  const c = all.find(x => String(x.id) === String(id));
  if (!c) { notify('Character not found', 'error'); return; }
  if (!ipc) { notify('Folder save only works in the installed app', 'error'); return; }
  const r = await callIPC('save-char-to-folder', c);
  if (r.success) notify(`Saved ${c.name || 'character'} → ${r.dir}`, 'success');
  else if (r.error) notify('Save failed: ' + r.error, 'error');
}

// Remove a character from the active session (does NOT delete the character)
function removeFromSession(id) {
  sessionCharIds = sessionCharIds.filter(x => String(x) !== String(id));
  localStorage.setItem('cpred_session_ids', JSON.stringify(sessionCharIds));
  renderSessionTracker();
}

// Dedupe key: same kind + name + role is treated as the same character
function dedupeKey(c) {
  return `${c._kind || 'pcs'}|${(c.name || '').trim().toLowerCase()}|${c.role || ''}`;
}

// Collapse duplicates, keeping the most-recently-updated copy of each
function dedupeList(list) {
  const seen = new Map();
  const dups = [];
  list.forEach(c => {
    const k = dedupeKey(c);
    const prev = seen.get(k);
    if (!prev) { seen.set(k, c); return; }
    const t = c.updatedAt || c.savedAt || 0, tp = prev.updatedAt || prev.savedAt || 0;
    if (t > tp) { dups.push(prev); seen.set(k, c); } else { dups.push(c); }
  });
  return { unique: [...seen.values()], dups };
}

// Delete one character/NPC from wherever it lives (folder store, custom
// folder list, or localStorage) and drop it from the active session.
async function deleteCharFromPool(c) {
  if (!c) return;
  sessionCharIds = sessionCharIds.filter(x => String(x) !== String(c.id));
  localStorage.setItem('cpred_session_ids', JSON.stringify(sessionCharIds));
  if (ipc && (c._kind === 'pcs' || c._kind === 'npcs')) {
    // Delete by id so every copy goes, whatever the file is called
    await callIPC('store-delete', c._kind, c.id);
  } else if (c._kind === 'custom') {
    customFolderChars = customFolderChars.filter(x => String(x.id) !== String(c.id));
  } else {
    refreshSavedChars();
    savedChars = savedChars.filter(x => String(x.id) !== String(c.id));
    localStorage.setItem('cpred_chars', JSON.stringify(savedChars));
  }
}

// Two-click confirm (Electron blocks window.confirm in some builds): first
// click arms the button, second click within 3s performs the delete.
let sessDeleteArmed = null;
function sessArmDelete(id) {
  if (sessDeleteArmed === id) { sessDeleteArmed = null; sessDeleteChar(id); return; }
  sessDeleteArmed = id;
  renderSessionTracker();
  setTimeout(() => { if (sessDeleteArmed === id) { sessDeleteArmed = null; renderSessionTracker(); } }, 3000);
}

// Remove a single character/NPC from the pool
async function sessDeleteChar(id) {
  const all = await folderChars();
  const c = all.find(x => String(x.id) === String(id));
  if (!c) return;
  await deleteCharFromPool(c);
  notify(`Deleted "${c.name || 'Unnamed'}" permanently`, 'success');
  renderSessionTracker();
}

// Remove every duplicate from the pool, keeping the newest of each
async function sessDedupe() {
  const all = await folderChars();
  const { dups } = dedupeList(all);
  if (!dups.length) { notify('No duplicates found', 'success'); return; }
  for (const c of dups) await deleteCharFromPool(c);
  notify(`Removed ${dups.length} duplicate${dups.length > 1 ? 's' : ''} from the pool`, 'success');
  renderSessionTracker();
}

async function sessOpenSheet(id) {
  const all = await folderChars();
  const c = all.find(x => String(x.id) === String(id));
  if (!c) { notify('Character not found', 'error'); return; }
  char = normalizeChar(c);
  populateAllForms();
  const navChars = [...document.querySelectorAll('.topnav-item')].find(n => (n.getAttribute('onclick') || '').includes("'characters'"));
  if (navChars) switchTopPanel('characters', navChars);
  const snavSheet = [...document.querySelectorAll('.snav-item')].find(n => (n.getAttribute('onclick') || '').includes("'sheet'"));
  switchSection('sheet', snavSheet);
  updateSidebarIdentity();
}

// ═══════════════════════════════════════════════════════════════════
// v3.2 FIXES — foundation-filtered cyberware options, working
// "Add Other" (Electron has no window.prompt), NPC save + to-tracker.
// ═══════════════════════════════════════════════════════════════════

// ── FIX 2: cyberware options only for their foundation ─────────────
const CW_FOUNDATIONS = [
  ['Neural Link', /neural link/i],
  ['Cybereye', /cybereye|smart lens/i],
  ['Cyberaudio', /cyberaudio/i],
  ['Cyberarm', /cyberarm/i],
  ['Cyberleg', /cyberleg/i]
];

function cyberFoundationOf(item) {
  if (!item || !item.name) return null;
  for (const [label, re] of CW_FOUNDATIONS) if (re.test(item.name)) return label;
  return null;
}

function cyberOptionsFor(foundation) {
  if (!foundation) return [];
  const f0 = foundation;
  const re = new RegExp(foundation + '\\s+Option', 'i');
  const re2 = new RegExp('Requires?\\s*:?\\s*(a\\s+)?' + foundation, 'i');
  return Object.values(CPRED_DATA.cyberware).flat()
    .filter(c => (re.test(c.description || '') || re2.test(c.description || '')) && !/Foundation/i.test(c.description || '') && !new RegExp('^' + f0.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')).test(c.name))
    .map(c => ({ name: c.name, effect: (c.description || '').replace(re, '').replace(/^\.\s*/, '').slice(0, 80), cost: c.cost, hl: c.hl }));
}

// Redeclare with item-aware filtering (later declaration wins)
function gmUpgradeSource(listKey, item) {
  if (listKey === 'vehicles') return CPRED_DATA.vehicleUpgrades.map(u => ({ name: u.name, effect: u.effect, cost: u.cost }));
  if (listKey === 'weapons') return CPRED_DATA.weaponAttachments.map(a => ({ name: a.name, effect: a.effect, cost: a.cost }));
  if (listKey === 'cyberware') return cyberOptionsFor(cyberFoundationOf(item));
  if (listKey === 'armor') return [
    { name: 'Reinforced Plating', effect: '+1 SP (GM approval)', cost: '500eb' },
    { name: 'Concealed Pockets', effect: 'Hidden storage, DV15 to spot', cost: '100eb' },
    { name: 'Style Upgrade', effect: '+1 Wardrobe & Style while worn', cost: '100eb' }
  ];
  return [];
}

function gmShowUpgrades(listKey, idx) {
  const panel = document.getElementById(`gm-upg-${listKey}-${idx}`);
  if (!panel) return;
  if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
  const item = listForKey(listKey)[idx];
  const src = gmUpgradeSource(listKey, item);
  panel.style.display = 'block';
  const foundation = listKey === 'cyberware' ? cyberFoundationOf(item) : null;
  const header = listKey === 'cyberware'
    ? (foundation
        ? `<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--gold);margin-bottom:4px">${foundation} options (${src.length} in database)</div>`
        : `<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);margin-bottom:4px">"${item.name}" is not a foundation piece — no database options attach to it. Use Add Other for custom notes.</div>`)
    : '';
  panel.innerHTML = header + (src.length ? `
    <input placeholder="Filter..." style="margin-bottom:4px;font-size:11px" oninput="gmFilterUpg('${listKey}',${idx},this.value)">
    <div id="gm-upg-list-${listKey}-${idx}" style="max-height:160px;overflow-y:auto">${gmUpgRows(listKey, idx, src)}</div>` :
    (listKey === 'cyberware' && foundation ? '<div style="font-size:9px;color:var(--dim);font-family:Share Tech Mono,monospace">No options found for this foundation</div>' :
     listKey !== 'cyberware' ? '<div style="font-size:9px;color:var(--dim);font-family:Share Tech Mono,monospace">No database upgrades — use Add Other</div>' : ''));
}

function gmFilterUpg(listKey, idx, q) {
  const item = listForKey(listKey)[idx];
  const src = gmUpgradeSource(listKey, item).filter(u => !q || u.name.toLowerCase().includes(q.toLowerCase()));
  const el = document.getElementById(`gm-upg-list-${listKey}-${idx}`);
  if (el) el.innerHTML = gmUpgRows(listKey, idx, src);
}

// ── FIX 3: "Add Other" — inline editable fields (no window.prompt) ─
function gmCustomUpgrade(listKey, idx) {
  const panel = document.getElementById(`gm-upg-${listKey}-${idx}`);
  if (!panel) return;
  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="background:rgba(0,229,255,0.04);border:1px dashed var(--neon);border-radius:4px;padding:8px">
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--neon);letter-spacing:1px;margin-bottom:6px">CUSTOM UPGRADE / OPTION — add as many as you like</div>
      <div class="field" style="margin-bottom:6px"><label>Name</label><input id="cust-upg-name-${listKey}-${idx}" placeholder="e.g. Stealth Coating"></div>
      <div class="field" style="margin-bottom:6px"><label>Effect / Notes</label><input id="cust-upg-eff-${listKey}-${idx}" placeholder="e.g. -2 to spot vehicle at night"></div>
      <div class="field" style="margin-bottom:6px"><label>Modifiers to Stats / Skills (e.g. +1 REF, +2 Handgun)</label><input id="cust-upg-mods-${listKey}-${idx}" placeholder="+1 COOL, +1 Stealth"></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-primary btn-xs" onclick="gmSaveCustomUpgrade('${listKey}',${idx})">Save To Sheet</button>
        <button class="btn btn-ghost btn-xs" onclick="document.getElementById('gm-upg-${listKey}-${idx}').style.display='none'">Close</button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById(`cust-upg-name-${listKey}-${idx}`)?.focus(), 50);
}

function gmSaveCustomUpgrade(listKey, idx) {
  const name = document.getElementById(`cust-upg-name-${listKey}-${idx}`)?.value.trim();
  const effect = document.getElementById(`cust-upg-eff-${listKey}-${idx}`)?.value.trim() || '';
  const modsRaw = document.getElementById(`cust-upg-mods-${listKey}-${idx}`)?.value.trim() || '';
  if (!name) { notify('Upgrade name required', 'error'); return; }
  const it = listForKey(listKey)[idx];
  if (!it) return;
  if (!it.upgrades) it.upgrades = [];
  const upg = { name, effect, custom: true };
  if (modsRaw) upg.mods = parseItemMods(modsRaw);
  it.upgrades.push(upg);
  saveToLocalStorage();
  refreshOwned(listKey);
  // Re-open the form so several options can be stacked quickly
  gmCustomUpgrade(listKey, idx);
  const modStr = upg.mods ? modsToStr(upg.mods) : '';
  notify('Option added: ' + name + (modStr ? ' (' + modStr + ')' : ''), 'success');
  if (activeSection === 'stats') renderStatsView();
  if (activeSection === 'sheet') renderFullSheet();
}

// ── FIX 1: NPC generator — Save + Send To Session Tracker ──────────
function buildNPCCharFromText() {
  if (!window._lastNPC) return null;
  const t = window._lastNPC.text;
  const grab = label => { const m = t.match(new RegExp('^' + label + ':\\s*(.+)$', 'm')); return m ? m[1].trim() : ''; };
  const nameRaw = grab('NAME') || 'Unknown NPC';
  const statLine = grab('STATS');
  const num = k => { const m = statLine.match(new RegExp(k + '\\s+(\\d+)')); return m ? parseInt(m[1]) : 5; };
  const hpM = statLine.match(/HP:\s*(\d+)/);
  return {
    id: 'npc_' + Date.now(), isNPC: true,
    name: nameRaw.replace(/"[^"]*"/, '').trim(), handle: (nameRaw.match(/"([^"]*)"/) || [,''])[1],
    role: window._lastNPC.role,
    stats: { INT:num('INT'), REF:num('REF'), DEX:5, TECH:num('TECH'), COOL:num('COOL'), WILL:5, LUCK:num('LUCK'), MOVE:5, BODY:num('BODY'), EMP:5 },
    hp: hpM ? +hpM[1] : 30, maxHp: hpM ? +hpM[1] : 30, wounds: 0, eddies: 0,
    skills: {}, weapons: [{ name: grab('WEAPON') || 'Sidearm', damage: '', rof: '', ammo:'', notes:'' }],
    armor: { head:'', headSP:0, body: grab('ARMOR'), bodySP: parseInt((grab('ARMOR').match(/SP\s*(\d+)/)||[,'11'])[1]), shield:'', shieldSP:0 },
    cyberware: [], gear: [], vehicles: [], netPrograms: [],
    notes: t, trackerNotes: '', trackerCrits: ''
  };
}

async function saveNPC() {
  // Saving the same generated NPC twice must update one file, not mint a second
  if (window._lastSavedNPCId) { notify('Already saved to the npcs folder', ''); return window._lastSavedNPCId; }
  const npc = buildNPCCharFromText();
  if (!npc) return;
  if (ipc) {
    const r = await callIPC('store-save', 'npcs', npc);
    notify(r.success ? 'NPC saved to npcs folder' : 'Save failed: ' + r.error, r.success ? 'success' : 'error');
  } else {
    savedChars.push(npc);
    localStorage.setItem('cpred_chars', JSON.stringify(savedChars));
    notify('NPC saved', 'success');
  }
  npcRoster.unshift({ id: Date.now(), name: npc.name + (npc.handle ? ' "' + npc.handle + '"' : ''), ...window._lastNPC });
  npcRoster = npcRoster.slice(0, 30);
  localStorage.setItem('cpred_npcs', JSON.stringify(npcRoster));
  renderNPCRoster();
  window._lastSavedNPCId = npc.id;
  return npc.id;
}

async function sendNPCToTracker() {
  // Save first (if not already), then add to the active session
  const id = window._lastSavedNPCId || await saveNPC();
  if (!id) return;
  if (!sessionCharIds.includes(id)) {
    sessionCharIds.push(id);
    localStorage.setItem('cpred_session_ids', JSON.stringify(sessionCharIds));
  }
  notify('NPC added to Session Tracker', 'success');
  // Jump straight there
  switchTopPanel('encounters', document.querySelector('[data-panel="encounters"]'));
  switchEncTab('session');
}

// Reset saved-id whenever a new NPC is generated, and inject the tracker button
const _origGenerateNPC_v32 = generateNPC;
generateNPC = async function() {
  window._lastSavedNPCId = null;
  await _origGenerateNPC_v32();
  injectNPCTrackerBtn();
};

function injectNPCTrackerBtn() {
  const saveBtn = document.getElementById('npc-save-btn');
  if (saveBtn && !document.getElementById('npc-tracker-btn')) {
    const b = document.createElement('button');
    b.id = 'npc-tracker-btn';
    b.className = 'btn btn-gold btn-sm';
    b.textContent = '→ Send To Session Tracker';
    b.onclick = sendNPCToTracker;
    saveBtn.parentNode.insertBefore(b, saveBtn.nextSibling);
  }
  const t = document.getElementById('npc-tracker-btn');
  if (t) t.style.display = 'inline-flex';
}
