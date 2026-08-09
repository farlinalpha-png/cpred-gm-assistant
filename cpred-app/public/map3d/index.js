// ═══════════════════════════════════════════════════════════════════
// CP:RED 3D MAPS — mode router
// Owns the panel lifecycle: mounts one mode at a time, disposes the
// previous stage so we never leak a WebGL context.
// ═══════════════════════════════════════════════════════════════════
import { THREE, createStage, THEMES, PALETTE, districts, neonMaterial } from './core.js';

const root = document.getElementById('map3d-root');
let active = null;      // { dispose() }
let activeMode = null;
let booted = false;
// Bumped on every mount request. An in-flight mount whose token is stale must
// throw its stage away instead of adopting it — see mount().
let mountToken = 0;

// ── Teardown ───────────────────────────────────────────────────────
// renderer.dispose() frees three's own caches but does NOT release the GPU
// context: the canvas keeps a live WebGL context until it is garbage
// collected, which is not deterministic. Chrome hard-caps ~16 live contexts
// per process, so without forceContextLoss() a GM who flips between the two
// tabs during a session hits "Too many active WebGL contexts", then
// getContext() starts returning null and the panel is dead until restart.
// Verified in the packaged-shape Electron app: eviction warnings from the
// 16th mount, null contexts by the ~27th.
function releaseStage(stage) {
  if (!stage) return;
  try { stage.dispose?.(); } catch (e) { console.error('[map3d] dispose failed', e); }
  const r = stage.renderer || (stage.stage && stage.stage.renderer);
  if (!r) return;
  try { r.forceContextLoss?.(); } catch (e) { /* already lost */ }
  try {
    const cv = r.domElement;
    if (cv) { cv.width = 1; cv.height = 1; cv.remove(); }
  } catch (e) { /* detached already */ }
}

function clearRoot() {
  releaseStage(active);
  active = null;
  // cast.js reads window.__map3d every 250ms while presenting; leaving a
  // disposed stage there makes it mirror a dead camera to the table display.
  window.__map3d = null;
  root.innerHTML = '';
}

function note(text, color = 'var(--dim)') {
  root.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;
    justify-content:center;font-family:'Share Tech Mono',monospace;font-size:11px;color:${color}">${text}</div>`;
}

function fail(err) {
  console.error('[map3d]', err);
  root.innerHTML = `<div style="position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;
    align-items:center;justify-content:center;font-family:'Share Tech Mono',monospace;font-size:11px;
    color:var(--red);text-align:center;padding:20px">
    <div>// render stage failed to start</div>
    <div style="color:var(--dim);max-width:520px;line-height:1.7">${String(err && err.message || err)}</div>
  </div>`;
}

// Modes are loaded lazily so a failure in one never blocks the other.
// The import error is re-surfaced rather than swallowed: silently substituting
// the bootstrap scene turns "city.js has a syntax error" into "the product
// shipped with a placeholder map and nobody noticed".
const MODES = {
  city: () => import('./city.js').catch(err => {
    console.error('[map3d] city.js failed to load — falling back to the bootstrap scene', err);
    return { mount: bootstrapCity, __fallback: err };
  }),
  encounter: () => import('./encounter.js').catch(err => {
    console.error('[map3d] encounter.js failed to load — falling back to a placeholder', err);
    return { mount: bootstrapPlaceholder('Encounter Builder'), __fallback: err };
  })
};

let pendingMode = null;

async function mount(mode) {
  const token = ++mountToken;
  clearRoot();
  activeMode = mode;
  pendingMode = mode;
  note('// building ' + (mode === 'city' ? 'night city' : 'encounter map') + '...');
  try {
    const mod = await MODES[mode]();
    if (token !== mountToken) return;              // superseded while importing
    root.innerHTML = '';                            // drop the loading note
    const stage = await mod.mount(root, { THREE, createStage, THEMES, PALETTE, districts, neonMaterial });
    if (token !== mountToken) {
      // A newer mount already ran clearRoot(). Adopting this stage now would
      // leave two live renderers in the panel, so bin it immediately.
      releaseStage(stage);
      return;
    }
    active = stage;
    pendingMode = null;
    // Debug/verification hook: lets tooling force a synchronous frame without
    // waiting on requestAnimationFrame (which is suspended in hidden windows).
    window.__map3d = { mode, stage: active, renderNow: () => active?.composer?.render() };
  } catch (err) {
    if (token !== mountToken) return;
    activeMode = null; pendingMode = null;   // let the GM click the tab again to retry
    fail(err);
  }
}

window.map3dSwitch = function (mode) {
  if (!MODES[mode]) return;
  document.getElementById('map3d-tab-city').classList.toggle('active', mode === 'city');
  document.getElementById('map3d-tab-enc').classList.toggle('active', mode === 'encounter');
  if (mode === pendingMode) return;            // this mount is already building
  if (mode === activeMode && active) return;   // already showing a live stage
  mount(mode);
};

// A tab left mid-session keeps a WebGL context and a rAF loop alive for the
// whole app lifetime. Release it when the window goes away.
addEventListener('pagehide', clearRoot);

// Only build the scene once the panel is actually visible — starting a
// WebGL context in a display:none container gives a 0x0 canvas.
function panelVisible() {
  const p = document.getElementById('panel-maps3d');
  return p && p.classList.contains('active');
}
const watcher = new MutationObserver(() => {
  if (!booted && panelVisible()) { booted = true; mount('city'); }
});
const panel = document.getElementById('panel-maps3d');
if (panel) {
  watcher.observe(panel, { attributes: true, attributeFilter: ['class'] });
  if (panelVisible()) { booted = true; mount('city'); }
}

// ── Fallback bootstrap scene ───────────────────────────────────────
// Used until city.js lands. Also proves the whole stack (importmap →
// three → bloom → resize loop) is wired correctly.
function bootstrapCity(container) {
  const stage = createStage(container, {
    theme: THEMES.street, cameraPos: [70, 85, 105], target: [50, 0, 55]
  });
  const { scene } = stage;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({ color: 0x0d0d16, roughness: 0.95, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(50, -0.05, 50);
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(220, 55, PALETTE.neon, 0x1d2233);
  grid.position.set(50, 0, 50);
  grid.material.transparent = true; grid.material.opacity = 0.22;
  scene.add(grid);

  const list = districts();
  const label = document.createElement('div');
  Object.assign(label.style, {
    position: 'absolute', left: '12px', top: '12px', pointerEvents: 'none',
    fontFamily: "'Share Tech Mono',monospace", fontSize: '10px', color: '#00e5ff',
    textShadow: '0 0 8px rgba(0,229,255,.6)', lineHeight: '1.8'
  });
  label.innerHTML = `NIGHT CITY // ${list.length} DISTRICTS · ${list.reduce((n, d) => n + d.locationCount, 0)} LOCATIONS<br>
    <span style="color:#666">bootstrap stage — full city module pending</span>`;
  container.appendChild(label);

  list.forEach(d => {
    const h = 2 + d.tier * 3.2;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(d.w, h, d.d),
      new THREE.MeshStandardMaterial({ color: 0x181a2b, roughness: 0.6, metalness: 0.35 })
    );
    block.position.set(d.x, h / 2, d.z);
    block.castShadow = true; block.receiveShadow = true;
    scene.add(block);

    // neon crown so each district reads at a glance
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(d.w * 1.02, 0.35, d.d * 1.02),
      neonMaterial(new THREE.Color(d.accent).getHex(), 2.6)
    );
    crown.position.set(d.x, h + 0.2, d.z);
    scene.add(crown);
  });

  stage.setFrame((dt, t) => {
    grid.material.opacity = 0.16 + Math.sin(t * 1.2) * 0.05;
  });

  return stage;
}

function bootstrapPlaceholder(name) {
  return function (container) {
    const stage = createStage(container, { theme: THEMES.corpo, cameraPos: [0, 30, 45], target: [0, 0, 0] });
    const g = new THREE.GridHelper(60, 30, PALETTE.gold, 0x22252f);
    g.material.transparent = true; g.material.opacity = 0.3;
    stage.scene.add(g);
    const note = document.createElement('div');
    Object.assign(note.style, {
      position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none', fontFamily: "'Share Tech Mono',monospace", fontSize: '12px', color: '#ffd600'
    });
    note.textContent = `// ${name} — module pending`;
    container.appendChild(note);
    return stage;
  };
}
