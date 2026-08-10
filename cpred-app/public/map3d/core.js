// ═══════════════════════════════════════════════════════════════════
// CP:RED 3D MAPS — shared core
// The contract every mode builds against: art direction, renderer setup,
// and the bridge back to the GM app's character/NPC data.
// ═══════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE, OrbitControls };

// ── Art direction ──────────────────────────────────────────────────
// One palette drives every mode so the city map, encounter maps and
// tokens read as the same product. Matches the app's existing CSS vars.
export const PALETTE = {
  neon:    0x00e5ff,
  magenta: 0xff2d95,
  red:     0xff1744,
  gold:    0xffd600,
  green:   0x69f0ae,
  violet:  0x7c4dff,
  orange:  0xff9100,
  dark:    0x0a0a14,
  mid:     0x12121f,
  surface: 0x1a1a2e,
  border:  0x2a2a45,
  fog:     0x0a0a14
};

export const THREAT_COLOR = [0xffffff, 0x69f0ae, 0xffd600, 0xff9100, 0xff1744];

// Encounter map themes. Each mode reads these so themes stay consistent.
export const THEMES = {
  street:     { name: 'Neon Street',      ground: 0x14141f, fogNear: 40, fogFar: 160, key: 0x00e5ff, fill: 0xff2d95, bloom: 0.9 },
  corpo:      { name: 'Corpo Interior',   ground: 0x1b1e28, fogNear: 30, fogFar: 120, key: 0xdfe9f5, fill: 0x00e5ff, bloom: 0.45 },
  combatzone: { name: 'Combat Zone',      ground: 0x18120f, fogNear: 30, fogFar: 130, key: 0xff6a00, fill: 0xff1744, bloom: 0.7 },
  industrial: { name: 'Industrial',       ground: 0x14161a, fogNear: 35, fogFar: 140, key: 0xffd600, fill: 0x8d99ae, bloom: 0.6 },
  netrun:     { name: 'NET Architecture', ground: 0x05060f, fogNear: 20, fogFar: 200, key: 0x00ffd5, fill: 0x7c4dff, bloom: 1.6 },
  badlands:   { name: 'Badlands',         ground: 0x241d14, fogNear: 60, fogFar: 260, key: 0xffb45c, fill: 0xff7043, bloom: 0.35 }
};

// ── Renderer / scene factory ───────────────────────────────────────
// Every mode uses this so quality, tone mapping and bloom are identical.
export function createStage(container, opts = {}) {
  const theme = opts.theme || THEMES.street;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.ground);
  scene.fog = new THREE.Fog(theme.ground, theme.fogNear, theme.fogFar);

  const camera = new THREE.PerspectiveCamera(opts.fov || 50, 1, 0.1, 2000);
  camera.position.set(...(opts.cameraPos || [60, 70, 90]));

  // A stage whose materials are all MeshBasicMaterial gains nothing from the
  // lighting rig, and the shadow map it drives is re-rendered every frame for
  // no visible result. The city map is exactly that case.
  const unlit = opts.unlit === true;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = !unlit;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 1.0;
  container.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });

  // Give physical materials something to reflect (chrome/metal is black without it)
  if (opts.environment !== false) scene.environment = environmentMap(renderer);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.maxPolarAngle = Math.PI * 0.49; // never go under the ground plane
  if (opts.target) controls.target.set(...opts.target);

  // Lighting rig: cool key, warm neon fill, subtle ambient so nothing is pure black
  const key = new THREE.DirectionalLight(theme.key, 1.15);
  const fill = new THREE.DirectionalLight(theme.fill, 0.5);
  if (!unlit) {
    scene.add(new THREE.AmbientLight(0xffffff, opts.ambient ?? 0.28));
    // The shadow frustum must be centred on whatever the mode actually builds.
    // The city sits around (58,50), not the origin, so default to the camera
    // target and let a mode override the span.
    const sc = opts.shadowCenter || opts.target || [0, 0, 0];
    const sr = opts.shadowRadius ?? 120;
    key.position.set(sc[0] + 60, sc[1] + 110, sc[2] + 40);
    key.target.position.set(sc[0], sc[1], sc[2]);
    scene.add(key.target);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1; key.shadow.camera.far = 400 + sr;
    key.shadow.camera.left = -sr; key.shadow.camera.right = sr;
    key.shadow.camera.top = sr; key.shadow.camera.bottom = -sr;
    key.shadow.bias = -0.0004;
    key.shadow.camera.updateProjectionMatrix();
    scene.add(key);
    fill.position.set(-70, 40, -60);
    scene.add(fill);
    scene.add(new THREE.HemisphereLight(theme.key, theme.ground, 0.35));
  }

  // Bloom is what sells the neon. Keep strength theme-driven.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), theme.bloom ?? 0.8, 0.6, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // The bloom chain is the most expensive thing on screen — five downsample
  // and blur passes over the whole frame. A mode whose glow is soft anyway can
  // run it at a fraction of the frame size for the same look at a fraction of
  // the fill rate. UnrealBloomPass halves again internally.
  const bloomScale = opts.bloomScale ?? 1;

  // Render-on-demand. A mode with nothing moving in it — a map you are reading
  // rather than an animated scene — has no reason to redraw 60 times a second,
  // and this panel stays open for a whole session on laptops that need the GPU
  // for other things.
  //
  // The camera signal has to be the controls' own 'change' event, not the
  // return value of update() from the frame loop. OrbitControls calls update()
  // inside its wheel and pointer handlers, which consumes the movement and
  // records it as the new baseline; the loop's later update() then reports
  // nothing changed and the frame is never drawn. That is exactly how wheel
  // zoom ended up moving the camera without repainting.
  const onDemand = opts.onDemand === true;
  let dirty = true;
  const requestRender = () => { dirty = true; };
  controls.addEventListener('change', requestRender);

  function applyViewportSize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    // after composer.setSize, which resets the pass to the full frame size
    bloom.setSize(Math.max(2, w * bloomScale), Math.max(2, h * bloomScale));
    bloom.resolution.set(w, h);
  }
  const resize = () => { applyViewportSize(); dirty = true; };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  let running = true, onFrame = null;
  const clock = new THREE.Clock();
  (function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = clock.getDelta();
    controls.update();                       // marks the frame dirty via 'change'
    if (onFrame) onFrame(dt, clock.elapsedTime);
    if (!onDemand || dirty) { dirty = false; composer.render(); }
  })();

  return {
    scene, camera, renderer, controls, composer, bloom, resize, requestRender,
    setFrame(fn) { onFrame = fn; },
    setTheme(t) {
      scene.background = new THREE.Color(t.ground);
      if (scene.fog) { scene.fog.color.set(t.ground); scene.fog.near = t.fogNear; scene.fog.far = t.fogFar; }
      key.color.set(t.key); fill.color.set(t.fill); bloom.strength = t.bloom ?? 0.8;
    },
    dispose() {
      running = false; ro.disconnect(); controls.dispose();
      scene.traverse(o => { o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material?.dispose?.(); });
      scene.environment = null;
      disposeEnvironment(renderer);   // the probe belongs to this renderer only
      composer.dispose?.(); renderer.dispose();
      renderer.domElement.remove();
    }
  };
}

// ── Shared environment map ─────────────────────────────────────────
// Physical materials need something to reflect: without scene.environment
// three shades metal/chrome pure black. One PMREM-filtered procedural
// "night city" probe is built once and reused by every mode.
// A PMREM result is a render-target texture: it lives in ONE renderer's GPU
// context and has no CPU-side image to re-upload. Caching it globally meant
// the next stage after a mode switch got a texture its renderer could not
// resolve, and every metal silently lost its reflections. Cache per renderer.
const _envByRenderer = new WeakMap();
export function environmentMap(renderer) {
  if (_envByRenderer.has(renderer)) return _envByRenderer.get(renderer);
  // Seeded so every renderer builds an identical probe — otherwise the city
  // and the encounter map would reflect different skies.
  const rnd = seededRandom('nightcity-env');
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  // horizon gradient: dark street below, cool haze above
  const sky = g.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0.0, '#0a1020');
  sky.addColorStop(0.45, '#16283f');
  sky.addColorStop(0.55, '#241a2e');
  sky.addColorStop(1.0, '#080810');
  g.fillStyle = sky; g.fillRect(0, 0, 256, 128);
  // scattered neon emitters so chrome picks up coloured highlights
  const hues = ['#00e5ff', '#ff2d95', '#ffd600', '#7c4dff', '#69f0ae'];
  for (let i = 0; i < 44; i++) {
    const x = rnd() * 256, y = 58 + rnd() * 54;
    const r = 3 + rnd() * 11;
    const col = hues[(rnd() * hues.length) | 0];
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose(); tex.dispose();
  _envByRenderer.set(renderer, env);
  return env;
}

// Release the probe belonging to a renderer that is going away.
export function disposeEnvironment(renderer) {
  const t = _envByRenderer.get(renderer);
  if (t) { t.dispose(); _envByRenderer.delete(renderer); }
}

// Emissive neon material helper — used for signage, edges and token rings
export function neonMaterial(color, intensity = 2.2) {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity,
    roughness: 0.35, metalness: 0.1
  });
}

// ── Bridge to the GM app's data ────────────────────────────────────
// The 3D module never owns character data; it reads what the app already has.
export const ipc = (typeof require !== 'undefined') ? require('electron').ipcRenderer : null;

export async function loadRoster() {
  // Electron: real pcs/npcs folder store. Browser/cast view: localStorage.
  if (ipc) {
    try {
      const [pcs, npcs] = await Promise.all([
        ipc.invoke('store-list', 'pcs'), ipc.invoke('store-list', 'npcs')
      ]);
      return [
        ...(pcs.chars || []).map(c => ({ ...c, _kind: 'pcs' })),
        ...(npcs.chars || []).map(c => ({ ...c, _kind: 'npcs', isNPC: true }))
      ];
    } catch (e) { /* fall through */ }
  }
  try { return JSON.parse(localStorage.getItem('cpred_chars') || '[]'); } catch { return []; }
}

export function districts() {
  return (typeof NC_MAP_DATA !== 'undefined') ? NC_MAP_DATA : [];
}

// Deterministic per-name RNG so a character's generated look never changes
export function seededRandom(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () {
    h += 0x6D2B79F5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
