// ═══════════════════════════════════════════════════════════════════
// CP:RED 3D MAPS — MODE 1: NIGHT CITY
// A holographic city plate. 24 districts built procedurally from
// NC_MAP_DATA, seeded so the skyline never changes between reloads.
//
// Draw-call budget (the whole point of the batching below):
//   sky 1 · stars 1 · water 2 · land 4 (merged per region)
//   rims 1 · crowns+streets 1 · district floor-glow 1 (all vertex-coloured,
//   so hover / threat recolour is an attribute write, not a rebuild)
//   buildings 24 (one InstancedMesh per district — needed for per-district
//   emissive tint) · rooftop lights 1 · spires 1 · location pins 1 (156
//   instances, ONE call) · beams 1 · rings 2 · dust 1 · labels 24 sprites
// ═══════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createStage, THREAT_COLOR, districts, seededRandom } from './core.js';

// ── Tunables ───────────────────────────────────────────────────────
const LAND_TOP   = 1.7;    // y of the district ground plate
const WATER_Y    = -0.5;
const CITY_MIN   = new THREE.Vector2(22, 5);
const CITY_MAX   = new THREE.Vector2(97, 95);
const CITY_MID   = new THREE.Vector3(59.5, 0, 50);
const DEFAULT_CAM = { pos: new THREE.Vector3(58, 78, 124), target: new THREE.Vector3(58, 2, 50) };

const THEME = {
  name: 'Night City', ground: 0x0d1428,
  // The city plate is only ~80 units across but fog started at 95, so nothing
  // was ever fogged and every district read equally sharp — the plate looked
  // like a flat tabletop model rather than a city seen through night air.
  fogNear: 52, fogFar: 235,
  key: 0x9fe4ff, fill: 0xff2d95, bloom: 0.78
};

const THREAT_LABEL = ['SECURE', 'LOW', 'MODERATE', 'HIGH', 'EXTREME'];
// Four region tints, and these are now the *only* hues on the plate.
// mapdata gives all 24 districts their own accent; driving the map from those
// produced a rainbow that read as a colour-swatch chart, and it also silently
// contradicted this legend, which has always been region-based.
const REGIONS = {
  'The Island': { tint: 0x35d6ff, short: 'ISLAND' },
  'Northside':  { tint: 0xff4d94, short: 'NORTH'  },
  'Mainland':   { tint: 0x9d7bff, short: 'MAIN'   },
  'Southside':  { tint: 0xff9a3d, short: 'SOUTH'  }
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ═══════════════════════════════════════════════════════════════════
// Procedural textures — everything is generated, nothing is fetched.
// ═══════════════════════════════════════════════════════════════════
function makeWindowTexture(seed, cols, rows) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
  const rnd = seededRandom(seed);
  const cw = 128 / cols, ch = 256 / rows;
  // Roughly a third of the windows lit, and the lit ones biased bright.
  // At the old density (~66% lit, mostly mid-alpha) plus bloom, every tower
  // became one solid pastel block: the close-up read 100% lit / 0% dark and
  // the city had no night left in it.
  for (let y = 0; y < rows; y++) {
    const floorDark = rnd() < 0.22;      // whole unlit floors punch black bands
    for (let x = 0; x < cols; x++) {
      if (floorDark && rnd() < 0.82) continue;
      if (rnd() < 0.66) continue;
      const a = rnd() < 0.55 ? 0.25 + rnd() * 0.3 : 0.72 + rnd() * 0.28;
      g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      g.fillRect(x * cw + cw * 0.24, y * ch + ch * 0.26, cw * 0.52, ch * 0.42);
    }
  }
  // one bright signage band, not three
  {
    const y = Math.floor(rnd() * rows) * ch;
    g.fillStyle = `rgba(255,255,255,${(0.6 + rnd() * 0.4).toFixed(3)})`;
    g.fillRect(0, y + ch * 0.32, 128, ch * 0.18);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0.00, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  grd.addColorStop(0.72, 'rgba(255,255,255,0.10)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeLabelTexture(d) {
  const W = 512, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const accent = '#' + new THREE.Color(d.accent).getHexString();

  // bracket frame
  g.strokeStyle = accent; g.lineWidth = 3; g.globalAlpha = 0.9;
  const bx = 8, by = 26, bw = 34, bh = H - 52;
  g.beginPath();
  g.moveTo(bx + 14, by); g.lineTo(bx, by); g.lineTo(bx, by + bh); g.lineTo(bx + 14, by + bh);
  g.stroke();
  g.globalAlpha = 1;

  g.font = 'bold 40px Orbitron, Arial, sans-serif';
  g.fillStyle = accent;
  g.textBaseline = 'middle';
  g.shadowColor = accent; g.shadowBlur = 16;
  g.fillText(d.code, bx + 12, H / 2);
  g.shadowBlur = 10;
  g.fillStyle = '#eaf6ff';
  g.font = '30px "Share Tech Mono", monospace';
  g.fillText(String(d.name).toUpperCase(), bx + 58, H / 2 - 12);
  g.shadowBlur = 0;
  g.globalAlpha = 0.65;
  g.fillStyle = accent;
  g.font = '19px "Share Tech Mono", monospace';
  g.fillText(`${d.locationCount} LOC · T${d.tier}`, bx + 58, H / 2 + 18);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── Geometry helpers ───────────────────────────────────────────────
function roundedRectShape(w, h, r) {
  r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
  const x = -w / 2, y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function slabGeometry(w, d, h, r, bevel) {
  const bt = bevel == null ? 0.22 : bevel;
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w, d, r), {
    depth: Math.max(0.01, h - bt * 2), curveSegments: 5,
    bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelOffset: 0, bevelSegments: 2
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bt, 0);   // sit on y = 0 .. h
  return g;
}

// ── Per-mount reflection probe ─────────────────────────────────────
// core.environmentMap() memoises one PMREM *render target* for the page. A
// render-target texture has no CPU-side image, so the second renderer created
// after a mode switch cannot re-upload it and every metal in the scene loses
// its reflections. Measured: chrome mean RGB 157 on the first stage, 63 on the
// second. Each mount builds its own probe against its own renderer instead.
function buildCityEnv(renderer) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0.00, '#060a1c');
  sky.addColorStop(0.44, '#16243f');
  sky.addColorStop(0.52, '#2a2036');
  sky.addColorStop(1.00, '#05070f');
  g.fillStyle = sky; g.fillRect(0, 0, 256, 128);
  const hues = ['#35d6ff', '#ff4d94', '#9d7bff', '#ff9a3d', '#eaf6ff'];
  for (let i = 0; i < 48; i++) {
    const x = (i * 79.7) % 256, y = 54 + ((i * 37.3) % 60);
    const r = 3 + ((i * 23.9) % 13);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hues[i % hues.length]);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const src = new THREE.CanvasTexture(c);
  src.mapping = THREE.EquirectangularReflectionMapping;
  src.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromEquirectangular(src);
  pmrem.dispose(); src.dispose();
  return rt;
}

// A merged, vertex-coloured batch: one draw call, per-district recolour.
function makeBatch(entries, material) {
  const ranges = {};
  const geos = [];
  let off = 0;
  for (const e of entries) {
    const n = e.geo.attributes.position.count;
    ranges[e.code] = { start: off, count: n };
    off += n;
    geos.push(e.geo);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  merged.setAttribute('color', new THREE.BufferAttribute(new Float32Array(off * 3), 3));
  const mesh = new THREE.Mesh(merged, material);
  mesh.frustumCulled = false;
  const attr = merged.attributes.color;
  const tmp = new THREE.Color();
  return {
    mesh, ranges,
    set(code, color, mul) {
      const r = ranges[code]; if (!r) return;
      tmp.set(color);
      const m = mul == null ? 1 : mul;
      const a = attr.array;
      for (let i = r.start; i < r.start + r.count; i++) {
        a[i * 3] = tmp.r * m; a[i * 3 + 1] = tmp.g * m; a[i * 3 + 2] = tmp.b * m;
      }
      attr.needsUpdate = true;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════
export function mount(container, ctx) {
  const DATA = (ctx && ctx.districts ? ctx.districts() : districts()) || [];
  if (!DATA.length) throw new Error('NC_MAP_DATA is empty — mapdata.js did not load');
  const byCode = new Map();
  DATA.forEach(d => byCode.set(d.code, d));
  const UP = new THREE.Vector3(0, 1, 0);

  const stage = createStage(container, {
    theme: THEME, fov: 46,
    cameraPos: [DEFAULT_CAM.pos.x, DEFAULT_CAM.pos.y, DEFAULT_CAM.pos.z],
    target: [DEFAULT_CAM.target.x, DEFAULT_CAM.target.y, DEFAULT_CAM.target.z],
    exposure: 1.22
  });
  const { scene, camera, renderer, controls } = stage;

  let envRT = null;
  try { envRT = buildCityEnv(renderer); scene.environment = envRT.texture; }
  catch (e) { /* keep whatever core supplied */ }

  // Bloom tuned for neon rather than general glare. Threshold was 0.5, which
  // caught the whole facade of every tower once the emissive window map was
  // applied — that is what turned the close-up view into pastel soup.
  stage.bloom.strength = 0.82;
  stage.bloom.radius = 0.78;
  stage.bloom.threshold = 0.72;

  // Bloom at full resolution costs ~13ms on this scene. Half-res targets cut
  // that to ~3ms and the softer falloff actually reads better for neon.
  // core's ResizeObserver is registered first, so ours re-applies after it.
  const BLOOM_SCALE = 0.5;
  function shrinkBloom() {
    const w = Math.max(2, Math.round((container.clientWidth || 2) * BLOOM_SCALE));
    const h = Math.max(2, Math.round((container.clientHeight || 2) * BLOOM_SCALE));
    stage.bloom.setSize(w, h);
  }
  shrinkBloom();
  const bloomRO = new ResizeObserver(shrinkBloom);
  bloomRO.observe(container);

  controls.minDistance = 14;
  controls.maxDistance = 300;
  controls.rotateSpeed = 0.62;
  controls.zoomSpeed = 0.85;
  controls.panSpeed = 0.7;

  // Re-aim the shared lighting rig at the city centre, then freeze the
  // shadow map — the skyline never moves, so this is a one-shot cost.
  let keyLight = null, fillLight = null;
  scene.traverse(o => {
    if (o.isAmbientLight) o.intensity = 0.13;
    if (o.isHemisphereLight) o.intensity = 0.26;
    if (o.isDirectionalLight) (o.castShadow ? (keyLight = o) : (fillLight = o));
  });
  if (fillLight) {
    fillLight.position.set(CITY_MID.x - 90, 46, CITY_MID.z + 90);
    fillLight.target.position.copy(CITY_MID);
    scene.add(fillLight.target);
    fillLight.intensity = 0.62;
  }
  if (keyLight) {
    keyLight.position.set(CITY_MID.x + 74, 132, CITY_MID.z - 96);
    keyLight.target.position.copy(CITY_MID);
    scene.add(keyLight.target);
    const sc = keyLight.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95;
    sc.near = 1; sc.far = 460; sc.updateProjectionMatrix();
    keyLight.intensity = 1.25;
  }

  const disposables = [];      // textures / offscreen materials we own
  const track = o => { disposables.push(o); return o; };
  const world = new THREE.Group();
  scene.add(world);

  // ─────────────────────────────────────────────────────────────────
  // SKY DOME — dark indigo gradient with a bruised neon horizon
  // ─────────────────────────────────────────────────────────────────
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime:  { value: 0 },
      // Raised out of black. At 0x02030a/0x0b1024 there was effectively no sky:
      // the plate hung in a void with no horizon and nothing for the skyline to
      // silhouette against.
      uTop:   { value: new THREE.Color(0x050818) },
      uHoriz: { value: new THREE.Color(0x14203f) },
      uGlowA: { value: new THREE.Color(0x1d6f8f) },
      uGlowB: { value: new THREE.Color(0x5a1a44) },
      uCityGlow: { value: new THREE.Color(0x2a4e78) }
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uTop, uHoriz, uGlowA, uGlowB, uCityGlow;
      varying vec3 vDir;
      void main(){
        vec3 n = normalize(vDir);
        float h = n.y;
        vec3 col = mix(uHoriz, uTop, smoothstep(-0.04, 0.55, h));
        float band = pow(max(0.0, 1.0 - abs(h) * 4.2), 3.0);
        float side = n.x * 0.5 + 0.5;
        col += mix(uGlowB, uGlowA, side) * band * (0.85 + 0.15 * sin(uTime * 0.35));
        // light-pollution dome hugging the horizon — this is what gives a
        // night skyline something to be a silhouette against
        col += uCityGlow * pow(max(0.0, 1.0 - abs(h) * 7.5), 2.2) * 0.85;
        // faint vertical interference, keeps the dome from banding flat
        col += vec3(0.004, 0.008, 0.014) * sin(n.y * 90.0 + uTime * 0.6);
        gl_FragColor = vec4(max(col, 0.0), 1.0);
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 20), skyMat);
  sky.frustumCulled = false;
  world.add(sky);

  // Starfield
  {
    const N = 700, pos = new Float32Array(N * 3);
    const rnd = seededRandom('stars');
    for (let i = 0; i < N; i++) {
      const th = rnd() * TAU, ph = Math.acos(rnd() * 0.92 + 0.02), r = 480;
      pos[i * 3]     = Math.sin(ph) * Math.cos(th) * r + CITY_MID.x;
      pos[i * 3 + 1] = Math.cos(ph) * r * 0.75 + 40;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r + CITY_MID.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      color: 0x9fd8ff, size: 1.4, sizeAttenuation: false,
      transparent: true, opacity: 0.55, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending
    });
    world.add(new THREE.Points(g, m));
  }

  // ─────────────────────────────────────────────────────────────────
  // WATER — the void around The Island
  // ─────────────────────────────────────────────────────────────────
  // uGlow is filled in once the per-district metadata exists (see below);
  // mount() is synchronous up to that point, so it is set before frame 1.
  const waterUniforms = {
    uTime:   { value: 0 },
    // The water carries fog:false, so past the grid fade it used to reach pure
    // black and roughly half the wide shot was dead pixels. Deep water should
    // still read as water.
    uDeep:   { value: new THREE.Color(0x070c1c) },
    uShore:  { value: new THREE.Color(0x0a2440) },
    uNeon:   { value: new THREE.Color(0x00e5ff) },
    uMag:    { value: new THREE.Color(0xff2d95) },
    uCenter: { value: new THREE.Vector2(CITY_MID.x, CITY_MID.z) },
    uGlow:   { value: null },
    uMin:    { value: new THREE.Vector2(CITY_MIN.x, CITY_MIN.y) },
    uSpan:   { value: new THREE.Vector2(CITY_MAX.x - CITY_MIN.x, CITY_MAX.y - CITY_MIN.y) }
  };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms, fog: false,
    vertexShader: `
      varying vec3 vW;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uDeep, uShore, uNeon, uMag; uniform vec2 uCenter;
      uniform sampler2D uGlow; uniform vec2 uMin, uSpan;
      varying vec3 vW;
      float line(float c, float w){ return smoothstep(w, 0.0, abs(fract(c) - 0.5)); }
      void main(){
        float d = length(vW.xz - uCenter);
        float dn = d / 130.0;
        vec3 col = mix(uShore, uDeep, clamp(dn * 1.6, 0.0, 1.0));
        float fade = smoothstep(1.45, 0.02, dn);

        // reflected city glow, smeared vertically and rippled
        vec2 guv = (vW.xz - uMin) / uSpan;
        float ripple = sin(vW.z * 1.7 + uTime * 0.9) * 0.010
                     + sin(vW.x * 2.3 - uTime * 0.6) * 0.008;
        vec3 refl = vec3(0.0);
        for (int i = 0; i < 4; i++) {
          float o = float(i) * 0.018;
          vec2 uv = guv + vec2(ripple, o + ripple * 0.5);
          if (uv.x > -0.02 && uv.x < 1.02 && uv.y > -0.02 && uv.y < 1.02)
            refl += texture2D(uGlow, clamp(uv, 0.0, 1.0)).rgb;
        }
        col += refl * 0.115 * fade;
        // holo grid
        float g = max(line(vW.x / 6.0, 0.045), line(vW.z / 6.0, 0.045));
        col += uNeon * g * 0.055 * fade * (0.6 + 0.4 * sin(uTime * 0.8 - dn * 5.0));
        // coarse grid every 30 units
        float g2 = max(line(vW.x / 30.0, 0.012), line(vW.z / 30.0, 0.012));
        col += uNeon * g2 * 0.11 * fade;
        // slow radar sweep ring
        float ring = smoothstep(0.992, 1.0, cos((dn * 6.0 - uTime * 0.18) * 6.2831) * 0.5 + 0.5);
        col += mix(uMag, uNeon, 0.6) * ring * 0.10 * fade;
        gl_FragColor = vec4(max(col, 0.0), 1.0);
      }`
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(620, 620, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(CITY_MID.x, WATER_Y, CITY_MID.z);
  water.frustumCulled = false;
  world.add(water);

  // Low volumetric haze sitting on the water
  const glowTex = track(makeGlowTexture());
  {
    const hazeGeo = [];
    const rnd = seededRandom('haze');
    for (let i = 0; i < 6; i++) {
      const p = new THREE.PlaneGeometry(70 + rnd() * 70, 70 + rnd() * 70);
      p.rotateX(-Math.PI / 2);
      p.translate(
        CITY_MIN.x + rnd() * (CITY_MAX.x - CITY_MIN.x),
        WATER_Y + 0.4 + rnd() * 1.6,
        CITY_MIN.y + rnd() * (CITY_MAX.y - CITY_MIN.y));
      hazeGeo.push(p);
    }
    const merged = mergeGeometries(hazeGeo, false);
    hazeGeo.forEach(g => g.dispose());
    const m = new THREE.MeshBasicMaterial({
      map: glowTex, color: 0x0a4257, transparent: true, opacity: 0.17,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    const haze = new THREE.Mesh(merged, m);
    haze.frustumCulled = false;
    haze.renderOrder = 2;
    world.add(haze);
  }

  // ─────────────────────────────────────────────────────────────────
  // LAND / DISTRICT PLATES
  // Land slabs merge per region so the four landmasses read as land,
  // and the accent "rim" pokes out only where a district meets water.
  // ─────────────────────────────────────────────────────────────────
  const landByRegion = {};
  const rimEntries = [], crownEntries = [], glowEntries = [];
  const meta = {};   // per-district derived numbers

  DATA.forEach(d => {
    const maxH = 2.6 + d.tier * 3.6;
    // near-white accents blow out under bloom — pull them back a stop
    const tame = c => {
      const l = c.r * 0.3 + c.g * 0.6 + c.b * 0.1;
      if (l > 0.72) c.multiplyScalar(0.55 / l * 0.72 + 0.28);
      return c;
    };
    // One hue per region, with a small per-district value/saturation shift by
    // tier so neighbours are still separable. 24 saturated hues fighting each
    // other was the single loudest thing wrong with this map.
    const reg = REGIONS[d.region];
    const base = new THREE.Color(reg ? reg.tint : 0x35d6ff);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    const jitter = (seededRandom('acc' + d.code)() - 0.5);
    base.setHSL(
      (hsl.h + jitter * 0.022 + 1) % 1,
      clamp(hsl.s * (0.80 + d.tier * 0.055), 0, 1),
      clamp(hsl.l * (0.74 + d.tier * 0.075) + jitter * 0.02, 0.05, 0.78)
    );
    meta[d.code] = {
      maxH,
      accent: tame(base),
      threatColor: tame(new THREE.Color(THREAT_COLOR[d.threat] || 0xffffff))
    };

    // land plate
    const land = slabGeometry(d.w + 1.8, d.d + 1.8, LAND_TOP, 1.5, 0.24);
    land.translate(d.x, 0, d.z);
    (landByRegion[d.region] || (landByRegion[d.region] = [])).push(land);

    // neon rim, slightly wider and lower — the coastline
    const rim = slabGeometry(d.w + 3.0, d.d + 3.0, 0.55, 1.9, 0.14);
    rim.translate(d.x, 0.42, d.z);
    rimEntries.push({ code: d.code, geo: rim });

    // crown frame + street strips (boxes, merged per district)
    const cg = [];
    const fw = d.w + 1.4, fd = d.d + 1.4, t = 0.20, y = LAND_TOP + 0.06;
    const bar = (w, h, dd, x, yy, z) => {
      const b = new THREE.BoxGeometry(w, h, dd); b.translate(x, yy, z); return b;
    };
    cg.push(bar(fw, t, t, d.x, y, d.z - fd / 2));
    cg.push(bar(fw, t, t, d.x, y, d.z + fd / 2));
    cg.push(bar(t, t, fd, d.x - fw / 2, y, d.z));
    cg.push(bar(t, t, fd, d.x + fw / 2, y, d.z));
    // corner ticks rising off the plate
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      cg.push(bar(t, 1.1, t, d.x + sx * fw / 2, y + 0.55, d.z + sz * fd / 2));
    });
    // street glow lines
    const srnd = seededRandom('st' + d.code);
    const nStreet = 2 + Math.floor(srnd() * 2);
    for (let i = 0; i < nStreet; i++) {
      const along = srnd() < 0.5;
      const off = (srnd() - 0.5) * (along ? d.d : d.w) * 0.72;
      cg.push(along
        ? bar(d.w * 0.92, 0.06, 0.14, d.x, LAND_TOP + 0.03, d.z + off)
        : bar(0.14, 0.06, d.d * 0.92, d.x + off, LAND_TOP + 0.03, d.z));
    }
    crownEntries.push({ code: d.code, geo: mergeGeometries(cg, false) });
    cg.forEach(g => g.dispose());

    // floor glow disc (neon spill on the plate)
    const gp = new THREE.PlaneGeometry(d.w * 2.2, d.d * 2.2);
    gp.rotateX(-Math.PI / 2);
    gp.translate(d.x, LAND_TOP + 0.09, d.z);
    glowEntries.push({ code: d.code, geo: gp });
  });

  // A blurred top-down map of where the districts are and what colour they
  // glow. Sampled by the water shader it fakes the city's reflection in the
  // bay — without it the water was a bare grid on black and the city read as
  // a model floating over nothing.
  waterUniforms.uGlow.value = track((() => {
    const S = 96;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'lighter';
    const spanX = CITY_MAX.x - CITY_MIN.x, spanZ = CITY_MAX.y - CITY_MIN.y;
    DATA.forEach(d => {
      const u = ((d.x - CITY_MIN.x) / spanX) * S;
      const v = ((d.z - CITY_MIN.y) / spanZ) * S;
      const r = Math.max(3, (Math.max(d.w, d.d) / spanX) * S * 1.5);
      const col = meta[d.code].accent;
      const hex = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
      const rg = g.createRadialGradient(u, v, 0, u, v, r);
      rg.addColorStop(0, `rgba(${hex},0.95)`);
      rg.addColorStop(0.45, `rgba(${hex},0.34)`);
      rg.addColorStop(1, `rgba(${hex},0)`);
      g.fillStyle = rg;
      g.fillRect(u - r, v - r, r * 2, r * 2);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  })());

  const landMat = new THREE.MeshStandardMaterial({
    color: 0x0a0b15, roughness: 0.82, metalness: 0.32
  });
  Object.keys(landByRegion).forEach(region => {
    const merged = mergeGeometries(landByRegion[region], false);
    landByRegion[region].forEach(g => g.dispose());
    const m = new THREE.Mesh(merged, landMat);
    m.receiveShadow = true;
    m.frustumCulled = false;
    world.add(m);
  });

  const rimBatch = makeBatch(rimEntries, new THREE.MeshBasicMaterial({
    vertexColors: true, fog: false, toneMapped: true
  }));
  rimBatch.mesh.renderOrder = 1;
  world.add(rimBatch.mesh);

  const crownBatch = makeBatch(crownEntries, new THREE.MeshBasicMaterial({
    vertexColors: true, fog: false
  }));
  crownBatch.mesh.renderOrder = 3;
  world.add(crownBatch.mesh);

  const glowBatch = makeBatch(glowEntries, new THREE.MeshBasicMaterial({
    vertexColors: true, map: glowTex, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  glowBatch.mesh.renderOrder = 4;
  world.add(glowBatch.mesh);

  // ─────────────────────────────────────────────────────────────────
  // BUILDINGS — one InstancedMesh per district (per-district emissive)
  // plus two global instanced meshes for rooftop lights and spires.
  // ─────────────────────────────────────────────────────────────────
  const winTex = [
    track(makeWindowTexture('win-a', 9, 20)),
    track(makeWindowTexture('win-b', 11, 26)),
    track(makeWindowTexture('win-c', 7, 16))
  ];
  winTex[1].repeat.set(1, 2);
  winTex[2].repeat.set(2, 3);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const districtMesh = {};       // code -> InstancedMesh
  const districtMat = {};        // code -> material
  const roofPts = [], spirePts = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const tmpCol = new THREE.Color();
  let buildingCount = 0;

  DATA.forEach(d => {
    const rnd = seededRandom(d.code);
    const maxH = meta[d.code].maxH;
    const iw = d.w - 1.4, id = d.d - 1.4;
    const cell = 1.75;
    const cols = Math.max(3, Math.round(iw / cell));
    const rows = Math.max(3, Math.round(id / cell));
    const cw = iw / cols, cd = id / rows;
    const items = [];

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (rnd() < 0.12) continue;                    // street gaps
        const u = (i + 0.5) / cols - 0.5;
        const v = (j + 0.5) / rows - 0.5;
        // gentle bowl: taller toward the core, but the whole block stays built up
        const rad = Math.min(1, Math.hypot(u * 2, v * 2));
        const fall = Math.pow(clamp(1 - rad * 0.62, 0, 1), 1.25);
        const bw = cw * (0.62 + rnd() * 0.3);
        const bd = cd * (0.62 + rnd() * 0.3);
        let h = maxH * (0.26 + 0.62 * fall) * (0.62 + rnd() * 0.55);
        if (rnd() < 0.055) h *= 1.45 + rnd() * 0.5;    // rare landmark tower
        h = Math.max(1.1, h);
        const px = d.x + u * iw + (rnd() - 0.5) * cw * 0.22;
        const pz = d.z + v * id + (rnd() - 0.5) * cd * 0.22;
        items.push({ px, pz, bw, bd, h });
        // setback tier on the taller towers
        if (h > maxH * 0.62 && rnd() < 0.75) {
          const h2 = h * (0.12 + rnd() * 0.2);
          items.push({ px, pz, bw: bw * 0.68, bd: bd * 0.68, h: h2, base: h });
          if (rnd() < 0.45) items.push({ px, pz, bw: bw * 0.4, bd: bd * 0.4, h: h2 * 0.6, base: h + h2 });
        }
        if (h > maxH * 0.55 && rnd() < 0.5) roofPts.push({ x: px, z: pz, y: LAND_TOP + h + 0.3, code: d.code });
        if (h > maxH * 0.85 && rnd() < 0.6) spirePts.push({ x: px, z: pz, y: LAND_TOP + h, h: 1.4 + rnd() * 3.0, code: d.code });
      }
    }

    const tex = winTex[Math.abs(d.code.charCodeAt(0)) % winTex.length];
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0b0d17, roughness: 0.46, metalness: 0.62,
      emissive: meta[d.code].accent.clone(), emissiveMap: tex, emissiveIntensity: 1.15
    });
    const mesh = new THREE.InstancedMesh(boxGeo, mat, items.length);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const brnd = seededRandom('c' + d.code);
    items.forEach((b, k) => {
      const y = (b.base || 0) + LAND_TOP;
      P.set(b.px, y + b.h / 2, b.pz);
      S.set(b.bw, b.h, b.bd);
      M.compose(P, Q, S);
      mesh.setMatrixAt(k, M);
      const g = 0.55 + brnd() * 0.85;
      tmpCol.setRGB(g * 0.85, g * 0.9, g);
      mesh.setColorAt(k, tmpCol);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.userData.code = d.code;
    world.add(mesh);
    districtMesh[d.code] = mesh;
    districtMat[d.code] = mat;
    buildingCount += items.length;
  });

  // rooftop hazard lights (1 draw call)
  const roofMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.22, 0),
    new THREE.MeshBasicMaterial({ fog: false }), Math.max(1, roofPts.length));
  roofPts.forEach((p, i) => {
    P.set(p.x, p.y, p.z); S.set(1, 1, 1); M.compose(P, Q, S);
    roofMesh.setMatrixAt(i, M);
    // ×1.5 pushed these past white and, at close range, 300-odd of them read
    // as confetti scattered over the skyline rather than aircraft warning lights.
    roofMesh.setColorAt(i, tmpCol.copy(meta[p.code].accent).multiplyScalar(0.85));
  });
  roofMesh.count = roofPts.length;
  roofMesh.instanceMatrix.needsUpdate = true;
  if (roofMesh.instanceColor) roofMesh.instanceColor.needsUpdate = true;
  roofMesh.frustumCulled = false;
  world.add(roofMesh);

  // antenna spires (1 draw call)
  const spireGeo = new THREE.CylinderGeometry(0.03, 0.09, 1, 4, 1, true);
  spireGeo.translate(0, 0.5, 0);
  const spireMesh = new THREE.InstancedMesh(
    spireGeo, new THREE.MeshBasicMaterial({ fog: false, transparent: true, opacity: 0.9 }),
    Math.max(1, spirePts.length));
  spirePts.forEach((p, i) => {
    P.set(p.x, p.y, p.z); S.set(1, p.h, 1); M.compose(P, Q, S);
    spireMesh.setMatrixAt(i, M);
    spireMesh.setColorAt(i, tmpCol.copy(meta[p.code].accent).multiplyScalar(1.2));
  });
  spireMesh.count = spirePts.length;
  spireMesh.instanceMatrix.needsUpdate = true;
  if (spireMesh.instanceColor) spireMesh.instanceColor.needsUpdate = true;
  spireMesh.frustumCulled = false;
  world.add(spireMesh);

  // ─────────────────────────────────────────────────────────────────
  // LOCATION PINS — all 156, ONE InstancedMesh, one draw call
  // ─────────────────────────────────────────────────────────────────
  const pins = [];   // { d, loc, pos:Vector3, idx }
  DATA.forEach(d => {
    const locs = d.locations || [];
    const n = locs.length;
    const rx = d.w * 0.34, rz = d.d * 0.34;
    const base = LAND_TOP + meta[d.code].maxH * 0.9 + 2.2;
    const orn = seededRandom('pin' + d.code)() * TAU;
    locs.forEach((loc, i) => {
      const a = orn + (i / Math.max(1, n)) * TAU;
      const ring = (i % 2) ? 1.22 : 1.0;
      pins.push({
        d, loc, idx: pins.length,
        pos: new THREE.Vector3(
          d.x + Math.cos(a) * rx * ring,
          base + (i % 3) * 0.85,
          d.z + Math.sin(a) * rz * ring)
      });
    });
  });

  const pinMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.44, 0),
    new THREE.MeshBasicMaterial({ fog: false, transparent: true, opacity: 0.95 }),
    Math.max(1, pins.length));
  pinMesh.count = pins.length;
  pinMesh.frustumCulled = false;
  pinMesh.renderOrder = 5;
  world.add(pinMesh);

  const pinState = pins.map(() => ({ scale: 0.62, target: 0.62, tint: 1 }));
  function writePins(time) {
    for (let i = 0; i < pins.length; i++) {
      const st = pinState[i];
      st.scale += (st.target - st.scale) * 0.18;
      const bob = Math.sin(time * 1.6 + i * 0.7) * 0.16;
      P.copy(pins[i].pos); P.y += bob;
      Q.setFromAxisAngle(UP, time * 0.7 + i);
      S.setScalar(st.scale);
      M.compose(P, Q, S);
      pinMesh.setMatrixAt(i, M);
    }
    pinMesh.instanceMatrix.needsUpdate = true;
  }
  function paintPins() {
    for (let i = 0; i < pins.length; i++) {
      const c = colorFor(pins[i].d).clone().multiplyScalar(pinState[i].tint);
      pinMesh.setColorAt(i, c);
    }
    if (pinMesh.instanceColor) pinMesh.instanceColor.needsUpdate = true;
  }

  // Beams from plate up to the pins of the selected district
  const beamMat = new THREE.MeshBasicMaterial({
    fog: false, transparent: true, opacity: 0.20,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  let beamMesh = null;
  function buildBeams(d) {
    if (beamMesh) { world.remove(beamMesh); beamMesh.geometry.dispose(); beamMesh = null; }
    if (!d) return;
    const geos = [];
    pins.filter(p => p.d.code === d.code).forEach(p => {
      const h = p.pos.y - LAND_TOP;
      const g = new THREE.CylinderGeometry(0.055, 0.14, h, 5, 1, true);
      g.translate(p.pos.x, LAND_TOP + h / 2, p.pos.z);
      geos.push(g);
    });
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    beamMat.color.copy(colorFor(d)).multiplyScalar(0.85);
    beamMesh = new THREE.Mesh(merged, beamMat);
    beamMesh.frustumCulled = false;
    beamMesh.renderOrder = 5;
    world.add(beamMesh);
  }

  // ─────────────────────────────────────────────────────────────────
  // SELECTION / HOVER RINGS
  // ─────────────────────────────────────────────────────────────────
  function makeRing(inner, outer, seg) {
    const g = new THREE.RingGeometry(inner, outer, seg);
    g.rotateX(-Math.PI / 2);
    return g;
  }
  const selRing = new THREE.Mesh(makeRing(0.86, 1.0, 72), new THREE.MeshBasicMaterial({
    color: 0x00e5ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  selRing.visible = false; selRing.renderOrder = 6;
  world.add(selRing);

  const pulseRing = new THREE.Mesh(makeRing(0.94, 1.0, 72), new THREE.MeshBasicMaterial({
    color: 0x00e5ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  pulseRing.visible = false; pulseRing.renderOrder = 6;
  world.add(pulseRing);

  // ─────────────────────────────────────────────────────────────────
  // DUST — drifting atmosphere motes
  // ─────────────────────────────────────────────────────────────────
  {
    const N = 600;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    const rnd = seededRandom('dust');
    for (let i = 0; i < N; i++) {
      pos[i * 3]     = CITY_MIN.x - 15 + rnd() * (CITY_MAX.x - CITY_MIN.x + 30);
      pos[i * 3 + 1] = rnd() * 42;
      pos[i * 3 + 2] = CITY_MIN.y - 15 + rnd() * (CITY_MAX.y - CITY_MIN.y + 30);
      seed[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x63dcff) } },
      vertexShader: `
        attribute float aSeed; uniform float uTime; varying float vA;
        void main(){
          vec3 p = position;
          p.y = mod(p.y + uTime * (0.35 + aSeed * 0.9), 44.0);
          p.x += sin(uTime * 0.25 + aSeed * 31.0) * 1.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (14.0 + aSeed * 16.0) * (12.0 / max(1.0, -mv.z));
          vA = 0.15 + 0.55 * fract(aSeed * 7.31);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vA;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(d)) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * a, a);
        }`
    });
    const dust = new THREE.Points(g, m);
    dust.frustumCulled = false;
    dust.renderOrder = 7;
    world.add(dust);
    var dustMat = m;
  }

  // ─────────────────────────────────────────────────────────────────
  // 3D HOLO LABELS
  // ─────────────────────────────────────────────────────────────────
  const labelSprites = {};
  DATA.forEach(d => {
    const tex = track(makeLabelTexture(d));
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
      opacity: 0.0, fog: false
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(15, 3.75, 1);
    sp.position.set(d.x, LAND_TOP + meta[d.code].maxH + 8.5, d.z);
    sp.renderOrder = 20;
    sp.frustumCulled = false;
    world.add(sp);
    labelSprites[d.code] = sp;
  });

  // ─────────────────────────────────────────────────────────────────
  // PICK PROXIES — never added to the scene, so zero draw cost
  // ─────────────────────────────────────────────────────────────────
  // Flat ground plates only — a full-height column would shadow the districts
  // behind it. Buildings themselves are raycast too, so pointing at a tower
  // still resolves to its own district.
  const pickGeo = new THREE.BoxGeometry(1, 1, 1);
  const pickMat = new THREE.MeshBasicMaterial();
  const picks = DATA.map(d => {
    const m = new THREE.Mesh(pickGeo, pickMat);
    m.scale.set(d.w + 1.8, 2.0, d.d + 1.8);
    m.position.set(d.x, LAND_TOP - 0.6, d.z);
    m.userData.code = d.code;
    m.updateMatrixWorld(true);
    return m;
  });
  const hoverTargets = [pinMesh, ...Object.keys(districtMesh).map(k => districtMesh[k]), ...picks];

  // ═══════════════════════════════════════════════════════════════
  // STATE + VISUAL APPLICATION
  // ═══════════════════════════════════════════════════════════════
  let hoverCode = null, selectedCode = null;
  let threatMode = false, labelsOn = true;
  let regionFilter = 'ALL', queryText = '';
  let hoverPin = -1;
  const activeSet = new Set(DATA.map(d => d.code));

  const colorFor = d => threatMode ? meta[d.code].threatColor : meta[d.code].accent;

  function matches(d) {
    if (regionFilter !== 'ALL' && d.region !== regionFilter) return false;
    if (!queryText) return true;
    const q = queryText.toLowerCase();
    if (d.name.toLowerCase().includes(q)) return true;
    if (d.code.toLowerCase() === q) return true;
    if ((d.gangs || []).some(g => g.toLowerCase().includes(q))) return true;
    if ((d.locations || []).some(l => l.name.toLowerCase().includes(q))) return true;
    return false;
  }

  function applyVisuals() {
    activeSet.clear();
    DATA.forEach(d => { if (matches(d)) activeSet.add(d.code); });

    DATA.forEach(d => {
      const on = activeSet.has(d.code);
      const isHover = hoverCode === d.code;
      const isSel = selectedCode === d.code;
      const c = colorFor(d);
      const boost = isSel ? 2.5 : isHover ? 1.9 : 1.0;
      // focus mode: once something is picked, everything else steps back
      const focus = selectedCode && !isSel && !isHover ? 0.5 : 1;
      const dim = (on ? 1 : 0.16) * focus;

      // The rim is a boundary marker, not a light source: at ×1.05 the 24
      // outlines were the loudest thing on the plate and every district read
      // as a separate glowing tray rather than part of one city.
      rimBatch.set(d.code, c, boost * dim * 0.62);
      crownBatch.set(d.code, c, boost * dim * (isSel || isHover ? 1.15 : 0.58));
      glowBatch.set(d.code, c, dim * (isSel ? 1.3 : isHover ? 0.95 : 0.42));

      const mat = districtMat[d.code];
      mat.emissive.copy(c);
      mat.emissiveIntensity = (isSel ? 2.5 : isHover ? 2.0 : 1.15) * (on ? 1 : 0.14) * focus;
      const cl = on ? 0.035 : 0.012;
      mat.color.setRGB(cl * focus, cl * 1.08 * focus, cl * 1.55 * focus);

      const sp = labelSprites[d.code];
      sp.material.opacity = !labelsOn && !isHover && !isSel ? 0
        : (isSel ? 1 : isHover ? 0.95 : on ? 0.42 : 0.05);
      sp.material.color.setRGB(1, 1, 1);
    });

    // pins
    for (let i = 0; i < pins.length; i++) {
      const d = pins[i].d;
      const on = activeSet.has(d.code);
      const sel = selectedCode === d.code;
      const hov = hoverCode === d.code;
      pinState[i].target = !on ? 0.0 : (hoverPin === i ? 2.6 : sel ? 1.9 : hov ? 1.25 : 0.62);
      pinState[i].tint = hoverPin === i ? 3.2 : sel ? 2.0 : on ? 1.15 : 0.3;
    }
    paintPins();

    // rings
    const sd = selectedCode ? byCode.get(selectedCode) : null;
    if (sd) {
      const r = Math.max(sd.w, sd.d) * 0.72;
      selRing.visible = true;
      selRing.position.set(sd.x, LAND_TOP + 0.16, sd.z);
      selRing.scale.setScalar(r);
      selRing.material.color.copy(colorFor(sd));
      pulseRing.visible = true;
      pulseRing.position.copy(selRing.position);
      pulseRing.material.color.copy(colorFor(sd));
      pulseRing.userData.r = r;
    } else {
      selRing.visible = false; pulseRing.visible = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // UI
  // ═══════════════════════════════════════════════════════════════
  const styleEl = document.createElement('style');
  styleEl.textContent = `
.nc3d-ui{position:absolute;inset:0;pointer-events:none;font-family:'Share Tech Mono',monospace;color:#e0e0f0;z-index:5;}
.nc3d-ui *{box-sizing:border-box}
/* vignette must composite normally — under mix-blend-mode:screen black is a no-op */
.nc3d-vig{position:absolute;inset:0;pointer-events:none;z-index:3;
  background:radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 34%, rgba(3,5,12,.62) 100%);}
.nc3d-fx{position:absolute;inset:0;pointer-events:none;z-index:4;overflow:hidden;
  background:repeating-linear-gradient(180deg, rgba(0,229,255,.05) 0px, rgba(0,229,255,.05) 1px, transparent 1px, transparent 3px);
  mix-blend-mode:screen;opacity:.55;}
.nc3d-fx:after{content:'';position:absolute;left:0;right:0;height:130px;
  background:linear-gradient(180deg,rgba(0,229,255,0),rgba(0,229,255,.07),rgba(0,229,255,0));
  animation:nc3dSweep 7.5s linear infinite;}
@keyframes nc3dSweep{0%{top:-150px}100%{top:100%}}

.nc3d-hud{position:absolute;left:14px;top:12px;pointer-events:none;}
.nc3d-title{font-family:'Orbitron',monospace;font-size:17px;font-weight:700;letter-spacing:5px;
  color:#00e5ff;text-shadow:0 0 14px rgba(0,229,255,.75),0 0 34px rgba(0,229,255,.35);}
.nc3d-sub{font-size:9.5px;letter-spacing:2px;color:#4b6d7d;margin-top:3px;}
.nc3d-read{margin-top:9px;font-size:10px;line-height:1.75;color:#7fe9ff;min-height:44px;
  border-left:2px solid rgba(0,229,255,.35);padding-left:8px;text-shadow:0 0 8px rgba(0,229,255,.4);}
.nc3d-read b{font-family:'Orbitron',monospace;font-size:11px;letter-spacing:1.5px;color:#fff;display:block}
.nc3d-read i{font-style:normal;color:#556}

.nc3d-tools{position:absolute;right:14px;top:12px;width:262px;display:flex;flex-direction:column;gap:7px;
  pointer-events:auto;z-index:9;transition:transform .38s cubic-bezier(.22,1,.36,1);}
.nc3d-tools.shift{transform:translateX(-352px)}
.nc3d-field{position:relative}
.nc3d-input,.nc3d-select{width:100%;background:rgba(10,12,22,.86);border:1px solid #2a2a45;border-radius:4px;
  color:#e0e0f0;font-family:'Share Tech Mono',monospace;font-size:10.5px;letter-spacing:1px;padding:7px 9px;outline:none;
  transition:border-color .15s, box-shadow .15s;}
.nc3d-input:focus,.nc3d-select:focus{border-color:#00e5ff;box-shadow:0 0 0 1px rgba(0,229,255,.35),0 0 18px rgba(0,229,255,.22)}
.nc3d-input::placeholder{color:#4a4a63}
.nc3d-select option{background:#12121f;color:#e0e0f0}
.nc3d-results{position:absolute;left:0;right:0;top:100%;margin-top:4px;max-height:250px;overflow-y:auto;
  background:rgba(8,10,18,.96);border:1px solid #2a2a45;border-radius:4px;z-index:9;display:none;
  box-shadow:0 12px 34px rgba(0,0,0,.7)}
.nc3d-results.on{display:block}
.nc3d-res{padding:6px 9px;font-size:10px;cursor:pointer;border-left:2px solid transparent;color:#b9c6d4;
  display:flex;gap:7px;align-items:baseline;}
.nc3d-res:hover{background:rgba(0,229,255,.10);border-left-color:#00e5ff;color:#fff}
.nc3d-res .k{font-family:'Orbitron',monospace;font-size:9px;color:#ffd600;min-width:26px}
.nc3d-res .s{margin-left:auto;color:#4b5a66;font-size:8.5px;letter-spacing:1px}
.nc3d-btns{display:flex;gap:6px}
.nc3d-btn{flex:1;background:rgba(10,12,22,.86);border:1px solid #2a2a45;border-radius:4px;color:#8fa2b3;
  font-family:'Orbitron',monospace;font-size:8px;letter-spacing:1.6px;padding:7px 4px;cursor:pointer;
  text-transform:uppercase;transition:all .15s;white-space:nowrap}
.nc3d-btn:hover{color:#fff;border-color:#00e5ff;box-shadow:0 0 14px rgba(0,229,255,.28)}
.nc3d-btn.on{color:#0a0a14;background:#00e5ff;border-color:#00e5ff;box-shadow:0 0 18px rgba(0,229,255,.55)}
.nc3d-btn.warn.on{background:#ff1744;border-color:#ff1744;color:#fff;box-shadow:0 0 18px rgba(255,23,68,.55)}

.nc3d-legend{position:absolute;left:14px;bottom:12px;pointer-events:auto;background:rgba(8,10,18,.78);
  border:1px solid #2a2a45;border-radius:4px;padding:8px 10px;font-size:9px;letter-spacing:1px;
  backdrop-filter:blur(3px);}
.nc3d-legend h4{font-family:'Orbitron',monospace;font-size:8px;letter-spacing:2px;color:#00e5ff;margin-bottom:6px;font-weight:700}
.nc3d-lrow{display:flex;align-items:center;gap:6px;color:#93a3b3;line-height:1.9;cursor:default}
.nc3d-sw{width:9px;height:9px;border-radius:2px;flex:none;box-shadow:0 0 8px currentColor}
.nc3d-legend .hint{margin-top:7px;padding-top:6px;border-top:1px solid #21243a;color:#4d5566;font-size:8.5px;letter-spacing:.6px;line-height:1.7}

.nc3d-tip{position:absolute;pointer-events:none;transform:translate(-50%,-100%);z-index:8;
  background:rgba(6,8,15,.92);border:1px solid rgba(0,229,255,.5);border-radius:3px;padding:5px 9px;
  box-shadow:0 0 22px rgba(0,229,255,.25);display:none;white-space:nowrap}
.nc3d-tip .n{font-family:'Orbitron',monospace;font-size:10px;letter-spacing:1.6px;color:#fff}
.nc3d-tip .m{font-size:8.5px;letter-spacing:1px;color:#5f7d8c;margin-top:2px}

.nc3d-panel{position:absolute;right:0;top:0;bottom:0;width:340px;max-width:72%;pointer-events:auto;
  background:linear-gradient(180deg,rgba(16,17,32,.97),rgba(10,11,22,.97));
  border-left:1px solid #2a2a45;display:flex;flex-direction:column;
  transform:translateX(102%);transition:transform .38s cubic-bezier(.22,1,.36,1);
  box-shadow:-18px 0 50px rgba(0,0,0,.6);z-index:7}
.nc3d-panel.open{transform:translateX(0)}
.nc3d-ph{padding:12px 14px 10px;border-bottom:1px solid #21243a;position:relative;flex:none}
.nc3d-ph .code{font-family:'Orbitron',monospace;font-size:9px;letter-spacing:2px;padding:2px 7px;border-radius:3px;
  display:inline-block;color:#0a0a14;font-weight:700}
.nc3d-ph h2{font-family:'Orbitron',monospace;font-size:15px;letter-spacing:2px;margin:7px 0 3px;color:#fff;line-height:1.3}
.nc3d-ph .reg{font-size:9px;letter-spacing:2px;color:#5f7d8c}
.nc3d-close{position:absolute;right:10px;top:10px;width:22px;height:22px;border:1px solid #2a2a45;border-radius:3px;
  background:transparent;color:#7a889a;cursor:pointer;font-size:12px;line-height:1;transition:all .15s}
.nc3d-close:hover{color:#ff1744;border-color:#ff1744;box-shadow:0 0 12px rgba(255,23,68,.35)}
.nc3d-pb{flex:1;overflow-y:auto;padding:12px 14px 18px}
.nc3d-desc{font-size:10.5px;line-height:1.85;color:#a9b7c6;margin-bottom:12px}
.nc3d-kv{display:grid;grid-template-columns:78px 1fr;gap:4px 8px;font-size:9.5px;line-height:1.6;margin-bottom:12px}
.nc3d-kv .k{color:#4f5a6b;letter-spacing:1px;text-transform:uppercase;font-size:8.5px;padding-top:2px}
.nc3d-kv .v{color:#d5e3ef}
.nc3d-sec{font-family:'Orbitron',monospace;font-size:8px;letter-spacing:2.4px;color:#00e5ff;
  margin:14px 0 7px;padding-bottom:4px;border-bottom:1px solid #21243a}
.nc3d-badges{display:flex;flex-wrap:wrap;gap:5px}
.nc3d-badge{font-size:9px;letter-spacing:1px;padding:3px 7px;border-radius:3px;border:1px solid rgba(255,23,68,.45);
  color:#ff6b8a;background:rgba(255,23,68,.09)}
.nc3d-badge.none{border-color:#2a2a45;color:#4f5a6b;background:transparent}
.nc3d-threat{display:flex;align-items:center;gap:7px;font-size:10px;letter-spacing:1.5px}
.nc3d-tbar{flex:1;height:5px;background:#161a2c;border-radius:3px;overflow:hidden}
.nc3d-tbar i{display:block;height:100%;border-radius:3px;box-shadow:0 0 10px currentColor;background:currentColor}
.nc3d-loc{border:1px solid #21243a;border-radius:4px;padding:7px 9px;margin-bottom:5px;cursor:pointer;
  transition:all .14s;background:rgba(255,255,255,.012)}
.nc3d-loc:hover{border-color:#00e5ff;background:rgba(0,229,255,.07);transform:translateX(-2px)}
.nc3d-loc .h{display:flex;gap:7px;align-items:baseline}
.nc3d-loc .c{font-family:'Orbitron',monospace;font-size:8.5px;color:#ffd600;min-width:26px;letter-spacing:1px}
.nc3d-loc .n{font-size:10.5px;color:#e6f1fa;letter-spacing:.5px}
.nc3d-loc .d{font-size:9.5px;color:#77869a;line-height:1.65;margin-top:3px}
.nc3d-empty{color:#4f5a6b;font-size:10px;letter-spacing:1px;padding:6px 0}
.nc3d-ui ::-webkit-scrollbar{width:5px}
.nc3d-ui ::-webkit-scrollbar-thumb{background:#2a2a45;border-radius:3px}
.nc3d-ui ::-webkit-scrollbar-thumb:hover{background:#00e5ff}
`;
  container.appendChild(styleEl);

  const vig = document.createElement('div');
  vig.className = 'nc3d-vig';
  container.appendChild(vig);
  const fx = document.createElement('div');
  fx.className = 'nc3d-fx';
  container.appendChild(fx);

  const ui = document.createElement('div');
  ui.className = 'nc3d-ui';
  const totalLoc = DATA.reduce((n, d) => n + (d.locationCount || (d.locations || []).length), 0);
  ui.innerHTML = `
<div class="nc3d-hud">
  <div class="nc3d-title">NIGHT CITY</div>
  <div class="nc3d-sub">// ATLAS GRID · ${DATA.length} DISTRICTS · ${totalLoc} LOCATIONS</div>
  <div class="nc3d-read" id="nc3d-read"><b>&nbsp;</b><i>hover a district</i></div>
</div>
<div class="nc3d-tools">
  <div class="nc3d-field">
    <input class="nc3d-input" id="nc3d-search" placeholder="SEARCH DISTRICT / LOCATION / GANG" autocomplete="off" spellcheck="false">
    <div class="nc3d-results" id="nc3d-results"></div>
  </div>
  <select class="nc3d-select" id="nc3d-region">
    <option value="ALL">ALL REGIONS</option>
    ${Object.keys(REGIONS).map(r => `<option value="${esc(r)}">${esc(r.toUpperCase())}</option>`).join('')}
  </select>
  <div class="nc3d-btns">
    <button class="nc3d-btn warn" id="nc3d-threat">Threat</button>
    <button class="nc3d-btn on" id="nc3d-labels">Labels</button>
    <button class="nc3d-btn" id="nc3d-reset">Reset</button>
  </div>
</div>
<div class="nc3d-legend" id="nc3d-legend"></div>
<div class="nc3d-tip" id="nc3d-tip"><div class="n"></div><div class="m"></div></div>
<div class="nc3d-panel" id="nc3d-panel">
  <div class="nc3d-ph">
    <button class="nc3d-close" id="nc3d-close">&times;</button>
    <span class="code" id="nc3d-pcode">–</span>
    <h2 id="nc3d-pname">–</h2>
    <div class="reg" id="nc3d-preg">–</div>
  </div>
  <div class="nc3d-pb" id="nc3d-pbody"></div>
</div>`;
  container.appendChild(ui);

  const $ = id => ui.querySelector('#' + id);
  const elSearch = $('nc3d-search'), elResults = $('nc3d-results'), elRegion = $('nc3d-region');
  const elThreat = $('nc3d-threat'), elLabels = $('nc3d-labels'), elReset = $('nc3d-reset');
  const elTip = $('nc3d-tip'), elPanel = $('nc3d-panel'), elRead = $('nc3d-read');
  const elLegend = $('nc3d-legend'), elTools = ui.querySelector('.nc3d-tools');

  function renderLegend() {
    if (threatMode) {
      elLegend.innerHTML = `<h4>THREAT INDEX</h4>` + THREAT_LABEL.map((l, i) =>
        `<div class="nc3d-lrow"><span class="nc3d-sw" style="background:#${new THREE.Color(THREAT_COLOR[i]).getHexString()};color:#${new THREE.Color(THREAT_COLOR[i]).getHexString()}"></span>${l}</div>`
      ).join('') + `<div class="hint">drag orbit · scroll zoom · click district</div>`;
    } else {
      elLegend.innerHTML = `<h4>REGIONS</h4>` + Object.keys(REGIONS).map(r => {
        const hex = new THREE.Color(REGIONS[r].tint).getHexString();
        const n = DATA.filter(d => d.region === r).length;
        return `<div class="nc3d-lrow"><span class="nc3d-sw" style="background:#${hex};color:#${hex}"></span>${r.toUpperCase()} <span style="color:#4d5566">· ${n}</span></div>`;
      }).join('') + `<div class="hint">drag orbit · scroll zoom · click district<br>pins = registered locations</div>`;
    }
  }
  renderLegend();

  // ── Panel content ────────────────────────────────────────────────
  function openPanel(d) {
    const hex = '#' + new THREE.Color(d.accent).getHexString();
    const thex = '#' + new THREE.Color(THREAT_COLOR[d.threat] || 0xffffff).getHexString();
    $('nc3d-pcode').textContent = d.code;
    $('nc3d-pcode').style.background = hex;
    $('nc3d-pcode').style.boxShadow = `0 0 16px ${hex}88`;
    $('nc3d-pname').textContent = d.name;
    $('nc3d-preg').textContent = `// ${d.region.toUpperCase()} · TIER ${d.tier} · ${d.locationCount} LOCATIONS`;
    const gangs = (d.gangs || []);
    $('nc3d-pbody').innerHTML = `
<div class="nc3d-desc">${esc(d.description)}</div>
<div class="nc3d-threat">
  <span style="color:${thex};letter-spacing:2px;font-size:9px">${THREAT_LABEL[d.threat] || '—'}</span>
  <span class="nc3d-tbar"><i style="color:${thex};width:${((d.threat + 1) / 5 * 100).toFixed(0)}%"></i></span>
</div>
<div class="nc3d-sec">ADMINISTRATION</div>
<div class="nc3d-kv">
  <div class="k">City Mgr</div><div class="v">${esc(d.cityManager) || '—'}</div>
  <div class="k">Security</div><div class="v">${esc(d.securityProvider) || '—'}</div>
  <div class="k">Region</div><div class="v">${esc(d.region)}</div>
</div>
<div class="nc3d-sec">GANG PRESENCE</div>
<div class="nc3d-badges">${gangs.length
      ? gangs.map(g => `<span class="nc3d-badge">${esc(g)}</span>`).join('')
      : `<span class="nc3d-badge none">NO KNOWN PRESENCE</span>`}</div>
<div class="nc3d-sec">LOCATIONS · ${(d.locations || []).length}</div>
<div id="nc3d-locs">${(d.locations || []).length
      ? d.locations.map((l, i) => `<div class="nc3d-loc" data-i="${i}">
          <div class="h"><span class="c">${esc(l.code)}</span><span class="n">${esc(l.name)}</span></div>
          <div class="d">${esc(l.desc)}</div></div>`).join('')
      : `<div class="nc3d-empty">// no catalogued locations</div>`}</div>`;

    // location row interactions -> ping the matching pin
    const holder = $('nc3d-locs');
    if (holder) {
      holder.querySelectorAll('.nc3d-loc').forEach(row => {
        const i = +row.dataset.i;
        const pinIdx = pins.findIndex(p => p.d.code === d.code && p.loc === d.locations[i]);
        row.addEventListener('mouseenter', () => { hoverPin = pinIdx; applyVisuals(); });
        row.addEventListener('mouseleave', () => { if (hoverPin === pinIdx) { hoverPin = -1; applyVisuals(); } });
        row.addEventListener('click', () => {
          const p = pins[pinIdx];
          if (p) flyTo(p.pos.x, p.pos.y * 0.6, p.pos.z, 26, 0.95);
        });
      });
    }
    elPanel.classList.add('open');
    elTools.classList.add('shift');
  }
  function closePanel() {
    elPanel.classList.remove('open');
    elTools.classList.remove('shift');
  }

  // ── Selection ────────────────────────────────────────────────────
  function select(code, fly) {
    selectedCode = code;
    hoverPin = -1;
    const d = code ? byCode.get(code) : null;
    buildBeams(d);
    if (d) {
      openPanel(d);
      if (fly) {
        const dist = 30 + Math.max(d.w, d.d) * 1.9 + meta[d.code].maxH * 0.9;
        flyTo(d.x, LAND_TOP + meta[d.code].maxH * 0.4, d.z, dist);
      }
    } else closePanel();
    applyVisuals();
  }

  // ── Camera tween ─────────────────────────────────────────────────
  let tween = null;
  function flyTo(tx, ty, tz, dist, dur) {
    const fromT = controls.target.clone();
    const from = camera.position.clone();
    const to = new THREE.Vector3(tx, ty, tz);
    let dir = from.clone().sub(fromT);
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 1);
    dir.normalize();
    if (dir.y < 0.36) { dir.y = 0.36; dir.normalize(); }
    tween = { from, fromT, toT: to, to: to.clone().addScaledVector(dir, dist), t: 0, dur: dur || 1.15 };
    controls.enabled = false;
  }
  function resetView() {
    tween = {
      from: camera.position.clone(), fromT: controls.target.clone(),
      to: DEFAULT_CAM.pos.clone(), toT: DEFAULT_CAM.target.clone(), t: 0, dur: 1.2
    };
    controls.enabled = false;
  }
  function flyToRegion(region) {
    const ds = DATA.filter(d => d.region === region);
    if (!ds.length) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    ds.forEach(d => {
      x0 = Math.min(x0, d.x - d.w / 2); x1 = Math.max(x1, d.x + d.w / 2);
      z0 = Math.min(z0, d.z - d.d / 2); z1 = Math.max(z1, d.z + d.d / 2);
    });
    const span = Math.max(x1 - x0, z1 - z0);
    flyTo((x0 + x1) / 2, 6, (z0 + z1) / 2, span * 1.45 + 34, 1.25);
  }

  // ── Search dropdown ──────────────────────────────────────────────
  function buildResults() {
    const q = elSearch.value.trim().toLowerCase();
    if (!q) { elResults.classList.remove('on'); elResults.innerHTML = ''; return; }
    const rows = [];
    DATA.forEach(d => {
      if (regionFilter !== 'ALL' && d.region !== regionFilter) return;
      if (d.name.toLowerCase().includes(q) || d.code.toLowerCase() === q)
        rows.push({ k: d.code, n: d.name, s: d.region, code: d.code, pin: -1 });
    });
    DATA.forEach(d => {
      if (regionFilter !== 'ALL' && d.region !== regionFilter) return;
      (d.locations || []).forEach(l => {
        if (l.name.toLowerCase().includes(q) || String(l.code).toLowerCase() === q)
          rows.push({ k: l.code, n: l.name, s: d.name, code: d.code, loc: l });
      });
      (d.gangs || []).forEach(g => {
        if (g.toLowerCase().includes(q)) rows.push({ k: '▲', n: g, s: d.name, code: d.code });
      });
    });
    const list = rows.slice(0, 60);
    elResults.innerHTML = list.length
      ? list.map((r, i) => `<div class="nc3d-res" data-i="${i}"><span class="k">${esc(r.k)}</span><span>${esc(r.n)}</span><span class="s">${esc(r.s)}</span></div>`).join('')
      : `<div class="nc3d-res"><span class="s">// no match</span></div>`;
    elResults.classList.add('on');
    elResults.querySelectorAll('.nc3d-res[data-i]').forEach(el => {
      el.addEventListener('mousedown', ev => {
        ev.preventDefault();
        const r = list[+el.dataset.i];
        pickResult(r);
      });
    });
    elResults._list = list;
  }
  function pickResult(r) {
    if (!r) return;
    elSearch.value = '';
    queryText = '';
    elResults.classList.remove('on');
    select(r.code, true);
    if (r.loc) {
      const pi = pins.findIndex(p => p.d.code === r.code && p.loc === r.loc);
      if (pi >= 0) { hoverPin = pi; applyVisuals(); setTimeout(() => { hoverPin = -1; applyVisuals(); }, 2600); }
    }
  }

  // ── Events ───────────────────────────────────────────────────────
  const canvas = renderer.domElement;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let mouseX = 0, mouseY = 0, hasPointer = false, downX = 0, downY = 0;

  function updateHover() {
    if (!hasPointer) return;
    ray.setFromCamera(ndc, camera);
    let newHover = null, newPin = -1;

    const hits = ray.intersectObjects(hoverTargets, false);
    for (const h of hits) {
      if (h.object === pinMesh) {
        const i = h.instanceId;
        if (i != null && activeSet.has(pins[i].d.code)) { newPin = i; newHover = pins[i].d.code; break; }
        continue;
      }
      const code = h.object.userData.code;
      if (code && activeSet.has(code)) { newHover = code; newPin = -1; break; }
    }
    if (newHover !== hoverCode || newPin !== hoverPin) {
      hoverCode = newHover;
      hoverPin = newPin;
      applyVisuals();
      canvas.style.cursor = hoverCode ? 'pointer' : '';
      updateTip();
      updateReadout();
    } else if (hoverCode) updateTip();
  }

  function updateTip() {
    if (!hoverCode) { elTip.style.display = 'none'; return; }
    const d = byCode.get(hoverCode);
    const n = elTip.querySelector('.n'), m = elTip.querySelector('.m');
    if (hoverPin >= 0) {
      const p = pins[hoverPin];
      n.textContent = p.loc.name;
      m.textContent = `${p.loc.code} · ${d.name.toUpperCase()}`;
      n.style.color = '#ffd600';
    } else {
      n.textContent = d.name;
      n.style.color = '#fff';
      m.textContent = `${d.code} · ${d.region.toUpperCase()} · ${THREAT_LABEL[d.threat]} · ${d.locationCount} LOC`;
    }
    elTip.style.display = 'block';
    elTip.style.left = mouseX + 'px';
    elTip.style.top = (mouseY - 14) + 'px';
    elTip.style.borderColor = hoverPin >= 0 ? 'rgba(255,214,0,.6)' : ('#' + new THREE.Color(d.accent).getHexString());
  }

  function updateReadout() {
    const d = hoverCode ? byCode.get(hoverCode) : (selectedCode ? byCode.get(selectedCode) : null);
    if (!d) { elRead.innerHTML = '<b>&nbsp;</b><i>hover a district</i>'; return; }
    const hex = '#' + new THREE.Color(threatMode ? (THREAT_COLOR[d.threat] || 0xffffff) : d.accent).getHexString();
    elRead.style.borderLeftColor = hex;
    elRead.innerHTML = `<b style="color:${hex}">${esc(d.code)} · ${esc(d.name.toUpperCase())}</b>` +
      `${esc(d.region.toUpperCase())} · TIER ${d.tier}<br>` +
      `THREAT <span style="color:${'#' + new THREE.Color(THREAT_COLOR[d.threat] || 0xffffff).getHexString()}">${THREAT_LABEL[d.threat]}</span>` +
      ` · SEC ${esc((d.securityProvider || '—').split('(')[0].trim())}`;
  }

  function setNdc(ev) {
    const r = canvas.getBoundingClientRect();
    mouseX = ev.clientX - r.left; mouseY = ev.clientY - r.top;
    ndc.x = (mouseX / Math.max(1, r.width)) * 2 - 1;
    ndc.y = -(mouseY / Math.max(1, r.height)) * 2 + 1;
    hasPointer = true;
  }
  const onMove = ev => { setNdc(ev); updateHover(); };
  const onLeave = () => {
    hasPointer = false;
    if (hoverCode !== null || hoverPin !== -1) { hoverCode = null; hoverPin = -1; applyVisuals(); updateReadout(); }
    elTip.style.display = 'none';
  };
  const onDown = ev => { downX = ev.clientX; downY = ev.clientY; if (tween) { tween = null; controls.enabled = true; } };
  const onUp = ev => {
    if (Math.abs(ev.clientX - downX) > 4 || Math.abs(ev.clientY - downY) > 4) return;  // was an orbit drag
    setNdc(ev); updateHover();
    if (hoverCode) {
      if (hoverPin >= 0) {
        select(hoverCode, false);
        const p = pins[hoverPin];
        flyTo(p.pos.x, p.pos.y * 0.65, p.pos.z, 30, 1.0);
      } else select(hoverCode, false);
    } else select(null, false);
  };
  const onKey = ev => {
    if (ev.key === 'Escape') { select(null, false); elSearch.blur(); elResults.classList.remove('on'); }
    if (ev.key === 'r' && (ev.target === document.body)) resetView();
  };

  // Re-resolve hover after the camera settles too, not just on mouse motion.
  let hoverDirty = false;
  const onControls = () => { hoverDirty = true; };
  controls.addEventListener('change', onControls);

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);

  const onSearchInput = () => { queryText = elSearch.value.trim(); buildResults(); applyVisuals(); };
  const onSearchKey = ev => {
    if (ev.key === 'Enter') { pickResult((elResults._list || [])[0]); }
    if (ev.key === 'Escape') { elSearch.value = ''; queryText = ''; elResults.classList.remove('on'); applyVisuals(); }
  };
  const onSearchBlur = () => setTimeout(() => elResults.classList.remove('on'), 140);
  const onSearchFocus = () => { if (elSearch.value.trim()) elResults.classList.add('on'); };
  elSearch.addEventListener('input', onSearchInput);
  elSearch.addEventListener('keydown', onSearchKey);
  elSearch.addEventListener('blur', onSearchBlur);
  elSearch.addEventListener('focus', onSearchFocus);

  const onRegion = () => {
    regionFilter = elRegion.value;
    applyVisuals();
    if (regionFilter === 'ALL') resetView(); else flyToRegion(regionFilter);
  };
  elRegion.addEventListener('change', onRegion);

  const onThreat = () => {
    threatMode = !threatMode;
    elThreat.classList.toggle('on', threatMode);
    beamMat.color.copy(selectedCode ? colorFor(byCode.get(selectedCode)) : new THREE.Color(0x00e5ff));
    roofPts.forEach((p, i) => roofMesh.setColorAt(i, tmpCol.copy(colorFor(byCode.get(p.code))).multiplyScalar(1.5)));
    if (roofMesh.instanceColor) roofMesh.instanceColor.needsUpdate = true;
    renderLegend(); applyVisuals(); updateReadout();
  };
  const onLabels = () => { labelsOn = !labelsOn; elLabels.classList.toggle('on', labelsOn); applyVisuals(); };
  const onResetClick = () => {
    select(null, false);
    elRegion.value = 'ALL'; regionFilter = 'ALL';
    elSearch.value = ''; queryText = '';
    elResults.classList.remove('on');
    applyVisuals(); resetView();
  };
  elThreat.addEventListener('click', onThreat);
  elLabels.addEventListener('click', onLabels);
  elReset.addEventListener('click', onResetClick);
  $('nc3d-close').addEventListener('click', () => select(null, false));

  // ═══════════════════════════════════════════════════════════════
  // FRAME
  // ═══════════════════════════════════════════════════════════════
  let shadowFrames = 4;
  applyVisuals();
  writePins(0);
  paintPins();

  function frame(dt, t) {
    if (hoverDirty) { hoverDirty = false; updateHover(); }
    skyMat.uniforms.uTime.value = t;
    waterUniforms.uTime.value = t;
    if (dustMat) dustMat.uniforms.uTime.value = t;

    // camera tween
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      const e = easeInOut(tween.t);
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.fromT, tween.toT, e);
      camera.lookAt(controls.target);
      if (tween.t >= 1) { tween = null; controls.enabled = true; }
    }

    writePins(t);

    // selection rings
    if (selRing.visible) {
      selRing.rotation.y = t * 0.35;
      selRing.material.opacity = 0.55 + Math.sin(t * 2.6) * 0.28;
      const k = (t * 0.55) % 1;
      const r = pulseRing.userData.r || 6;
      pulseRing.scale.setScalar(r * (0.55 + k * 1.15));
      pulseRing.material.opacity = (1 - k) * 0.45;
    }

    // crown / glow breathing
    glowBatch.mesh.material.opacity = 0.46 + Math.sin(t * 0.9) * 0.09;
    if (beamMesh) beamMat.opacity = 0.15 + Math.sin(t * 3.1) * 0.07;

    // labels: fade with distance so a zoomed-out view doesn't turn to soup
    const dist = camera.position.distanceTo(controls.target);
    const far = clamp(1 - (dist - 70) / 150, 0.12, 1);
    for (const code in labelSprites) {
      const sp = labelSprites[code];
      const base = (code === selectedCode) ? 1 : (code === hoverCode) ? 0.95
        : labelsOn ? 0.42 * far : 0;
      sp.material.opacity += (base - sp.material.opacity) * 0.16;
      const s = clamp(dist * 0.115, 9, 22);
      sp.scale.set(s, s * 0.25, 1);
    }

    if (shadowFrames > 0 && keyLight) {
      keyLight.shadow.needsUpdate = true;
      if (--shadowFrames === 0) keyLight.shadow.autoUpdate = false;
    }
  }
  stage.setFrame(frame);

  // ═══════════════════════════════════════════════════════════════
  // DISPOSE
  // ═══════════════════════════════════════════════════════════════
  const baseDispose = stage.dispose.bind(stage);
  stage.dispose = function () {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    controls.removeEventListener('change', onControls);
    bloomRO.disconnect();
    elSearch.removeEventListener('input', onSearchInput);
    elSearch.removeEventListener('keydown', onSearchKey);
    elSearch.removeEventListener('blur', onSearchBlur);
    elSearch.removeEventListener('focus', onSearchFocus);
    elRegion.removeEventListener('change', onRegion);
    elThreat.removeEventListener('click', onThreat);
    elLabels.removeEventListener('click', onLabels);
    elReset.removeEventListener('click', onResetClick);
    if (envRT) { try { envRT.dispose(); } catch (e) { } envRT = null; }
    scene.environment = null;
    try { baseDispose(); } catch (e) { console.error('[city] stage dispose', e); }
    disposables.forEach(o => { try { o.dispose(); } catch (e) {} });
    pickGeo.dispose(); pickMat.dispose();
    boxGeo.dispose(); beamMat.dispose();
    ui.remove(); fx.remove(); vig.remove(); styleEl.remove();
  };

  // Debug/verification surface
  stage.city = {
    districts: DATA.length,
    buildings: buildingCount,
    pins: pins.length,
    rooftops: roofPts.length,
    spires: spirePts.length,
    select: code => select(code, true),
    reset: resetView,
    toggleThreat: onThreat,
    // lets verification tooling advance animation without requestAnimationFrame
    step: (dt, t) => frame(dt == null ? 1 / 60 : dt, t || 0)
  };

  return stage;
}
