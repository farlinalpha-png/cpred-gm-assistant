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

function clearRoot() {
  if (active && active.dispose) { try { active.dispose(); } catch (e) { console.error(e); } }
  active = null;
  root.innerHTML = '';
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
const MODES = {
  city:      () => import('./city.js').catch(() => ({ mount: bootstrapCity })),
  encounter: () => import('./encounter.js').catch(() => ({ mount: bootstrapPlaceholder('Encounter Builder') }))
};

async function mount(mode) {
  clearRoot();
  activeMode = mode;
  try {
    const mod = await MODES[mode]();
    active = await mod.mount(root, { THREE, createStage, THEMES, PALETTE, districts, neonMaterial });
    // Debug/verification hook: lets tooling force a synchronous frame without
    // waiting on requestAnimationFrame (which is suspended in hidden windows).
    window.__map3d = { mode, stage: active, renderNow: () => active?.composer?.render() };
  } catch (err) { fail(err); }
}

window.map3dSwitch = function (mode) {
  if (mode === activeMode) return;
  document.getElementById('map3d-tab-city').classList.toggle('active', mode === 'city');
  document.getElementById('map3d-tab-enc').classList.toggle('active', mode === 'encounter');
  mount(mode);
};

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
