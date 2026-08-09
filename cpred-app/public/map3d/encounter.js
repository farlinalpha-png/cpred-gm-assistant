// ═══════════════════════════════════════════════════════════════════
// CP:RED 3D MAPS — MODE 2: ENCOUNTER MAP BUILDER
// Pick a Night City district + a theme, generate a seeded tactical map,
// drop the roster on it and run the firefight.
//
//  · 1 world unit = 1 metre. CP:RED tactical grid = 2 m squares.
//  · Everything is procedural + seeded, so prep survives a reload.
//  · Repeated set dressing is instanced; geometry/materials are pooled.
// ═══════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  THEMES, PALETTE, THREAT_COLOR, createStage, neonMaterial,
  districts, loadRoster, seededRandom
} from './core.js';

// ── Constants ──────────────────────────────────────────────────────
const CELL = 2;                                  // metres per tactical square
const STORE_KEY = 'cpred_map3d_encounters';
const PREF_KEY  = 'cpred_map3d_enc_prefs';

const SIZES = {
  small:  { m: 32, label: 'SMALL  16×16' },
  medium: { m: 48, label: 'MEDIUM 24×24' },
  large:  { m: 64, label: 'LARGE  32×32' },
  huge:   { m: 80, label: 'HUGE   40×40' }
};

// CP:RED ranged DV bands (Core rules p.170 range table).
const RANGE_BANDS = [
  [6, '0–6 m'], [12, '7–12 m'], [25, '13–25 m'], [50, '26–50 m'],
  [100, '51–100 m'], [200, '101–200 m'], [400, '201–400 m'], [800, '401–800 m']
];
function rangeBand(d) {
  for (const [max, label] of RANGE_BANDS) if (d <= max) return label;
  return 'out of range';
}

const NEONS = [0x00e5ff, 0xff2d95, 0xffd600, 0x69f0ae, 0x7c4dff, 0xff9100, 0xff1744, 0x00ffd5];

const FALLBACK_PROPS = [
  'crate', 'barrel', 'dumpster', 'barricade', 'sandbags', 'jersey',
  'terminal', 'desk', 'server', 'planter', 'fence', 'streetlamp',
  'sign', 'rubble', 'tank', 'pallet'
];
const FALLBACK_VEHICLES = ['sedan', 'van', 'truck', 'bike', 'av', 'buggy'];

// ── Tiny utils ─────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snapV = v => Math.floor(v / CELL) * CELL + CELL / 2;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 't' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

// Resource pools — one per mount, so a dispose() really frees everything.
function makePool() {
  const geo = new Map(), mat = new Map(), tex = new Map();
  const tag = v => { try { v.__pooled = true; } catch (e) { } return v; };
  return {
    geo(key, make) { let v = geo.get(key); if (!v) { v = tag(make()); geo.set(key, v); } return v; },
    mat(key, make) { let v = mat.get(key); if (!v) { v = tag(make()); mat.set(key, v); } return v; },
    tex(key, make) { let v = tex.get(key); if (!v) { v = tag(make()); tex.set(key, v); } return v; },
    dispose() {
      geo.forEach(g => g.dispose?.()); mat.forEach(m => m.dispose?.()); tex.forEach(t => t.dispose?.());
      geo.clear(); mat.clear(); tex.clear();
    }
  };
}

// Canvas → texture helper (cached by key through the pool).
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const _o3d = new THREE.Object3D();
const _col = new THREE.Color();
// Build an InstancedMesh from a list of {p:[x,y,z], r:[x,y,z], s:[x,y,z]|n, c:hex}
function instanced(geo, mat, list, shadow = true) {
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const wantColor = list.some(i => i.c !== undefined);
  list.forEach((it, i) => {
    _o3d.position.set(it.p[0], it.p[1], it.p[2]);
    _o3d.rotation.set(it.r ? it.r[0] : 0, it.r ? it.r[1] : 0, it.r ? it.r[2] : 0);
    const s = it.s;
    if (Array.isArray(s)) _o3d.scale.set(s[0], s[1], s[2]);
    else _o3d.scale.setScalar(s === undefined ? 1 : s);
    _o3d.updateMatrix();
    m.setMatrixAt(i, _o3d.matrix);
    if (wantColor) m.setColorAt(i, _col.set(it.c === undefined ? 0xffffff : it.c));
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = shadow; m.receiveShadow = shadow;
  m.frustumCulled = true;
  return m;
}

function box(pool, w, h, d, mat, x, y, z, ry = 0, shadow = true) {
  const m = new THREE.Mesh(pool.geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = shadow; m.receiveShadow = shadow;
  return m;
}
function cyl(pool, rt, rb, h, seg, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(pool.geo(`c${rt},${rb},${h},${seg}`,
    () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = shadow;
  return m;
}

// Standard surface materials, pooled by their defining numbers.
function surf(pool, color, rough = 0.85, metal = 0.1) {
  return pool.mat(`s${color},${rough},${metal}`, () =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
}
function glow(pool, color, i = 2.4) {
  return pool.mat(`g${color},${i}`, () => neonMaterial(color, i));
}
// Unlit emissive — punches through bloom without paying for lighting.
function raw(pool, color, mul = 1.6) {
  return pool.mat(`r${color},${mul}`, () => {
    const c = new THREE.Color(color).multiplyScalar(mul);
    return new THREE.MeshBasicMaterial({ color: c, toneMapped: false, fog: true });
  });
}

// ═══════════════════════════════════════════════════════════════════
// ATMOSPHERE — the haze, glow decals and light shafts that sell the mood
// ═══════════════════════════════════════════════════════════════════
function softDisc(pool, key, inner, stops) {
  return pool.tex(key, () => canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, w * inner, w / 2, h / 2, w / 2);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));
}

// Drifting haze cards. Cheap, additive, and the single biggest mood win.
function addHaze(ctx, count, color, scale, yLo, yHi, opacity = 0.09) {
  const tex = softDisc(ctx.pool, 'haze', 0.0, [[0, 'rgba(255,255,255,.85)'], [0.45, 'rgba(255,255,255,.22)'], [1, 'rgba(255,255,255,0)']]);
  const mat = new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const group = new THREE.Group();
  const items = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(mat);
    const sc = scale * (0.6 + ctx.rng() * 0.9);
    s.scale.set(sc, sc * 0.62, 1);
    s.position.set((ctx.rng() - 0.5) * ctx.M * 1.05, yLo + ctx.rng() * (yHi - yLo), (ctx.rng() - 0.5) * ctx.M * 1.05);
    s.renderOrder = -5;
    items.push({ s, sp: 0.25 + ctx.rng() * 0.6, ph: ctx.rng() * 6.28, ox: s.position.x, oz: s.position.z });
    group.add(s);
  }
  ctx.group.add(group);
  ctx.anim.push(t => {
    for (const it of items) {
      it.s.position.x = it.ox + Math.sin(t * 0.06 * it.sp + it.ph) * 6;
      it.s.position.z = it.oz + Math.cos(t * 0.045 * it.sp + it.ph) * 5;
    }
  });
  ctx.disposables.push(mat);
}

// Glow decal on the floor — puddle sheen, light pool, scorch mark.
function addGlowDecal(ctx, x, z, r, color, opacity = 0.3, y = 0.03) {
  const tex = softDisc(ctx.pool, 'decal', 0.02, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
  const mat = ctx.pool.mat(`decal${color},${opacity}`, () => new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: true
  }));
  const m = new THREE.Mesh(ctx.pool.geo('plane1', () => new THREE.PlaneGeometry(1, 1)), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.scale.set(r * 2, r * 2, 1);
  m.renderOrder = -3;
  ctx.group.add(m);
  return m;
}

// Volumetric shaft under a lamp / sign.
function addLightShaft(ctx, x, y, z, r, h, color, opacity = 0.055) {
  const geo = ctx.pool.geo(`shaft${r},${h}`, () => {
    const g = new THREE.CylinderGeometry(r * 0.22, r, h, 14, 1, true);
    g.translate(0, -h / 2, 0);
    return g;
  });
  const mat = ctx.pool.mat(`shaftm${color},${opacity}`, () => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: true
  }));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.renderOrder = -2;
  ctx.group.add(m);
  return m;
}

// Emissive strip — the workhorse for signage, edge-lighting and trim.
function strip(ctx, w, h, d, color, x, y, z, ry = 0, i = 2.6) {
  const m = box(ctx.pool, w, h, d, glow(ctx.pool, color, i), x, y, z, ry, false);
  return m;
}

// ── Signage art ────────────────────────────────────────────────────
const SIGN_WORDS = ['NOODLE', 'RIPPERDOC', 'BRAINDANCE', 'AMMO', 'CHROME', 'PACHINKO',
  'BAR', 'SYNTH-BURGER', 'CLINIC', 'GUNS', 'DOLLS', 'CYBERWARE', 'MOTEL', 'JOYTOY',
  'DELAMAIN', 'NIGHT CITY', 'KANG TAO', 'ARASAKA', 'MILITECH', 'TRAUMA TEAM'];
const KANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロ';

function signTexture(pool, text, color, vertical) {
  const key = `sign${text}${color}${vertical}`;
  return pool.tex(key, () => {
    const w = vertical ? 128 : 512, h = vertical ? 512 : 128;
    return canvasTex(w, h, (g) => {
      g.fillStyle = '#05060c'; g.fillRect(0, 0, w, h);
      const hex = '#' + new THREE.Color(color).getHexString();
      g.strokeStyle = hex; g.lineWidth = 5; g.globalAlpha = 0.85;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.globalAlpha = 1;
      g.fillStyle = hex; g.shadowColor = hex; g.shadowBlur = 28;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (vertical) {
        const chars = text.slice(0, 8).split('');
        const step = (h - 40) / chars.length;
        g.font = `700 ${Math.min(58, step * 0.86)}px "Share Tech Mono", monospace`;
        chars.forEach((ch, i) => g.fillText(ch, w / 2, 26 + step * (i + 0.5)));
      } else {
        g.font = `700 ${Math.min(74, (w - 40) / (text.length * 0.62))}px "Share Tech Mono", monospace`;
        g.fillText(text, w / 2, h / 2);
      }
    });
  });
}

function holoTexture(pool, title, sub, color) {
  const key = `holo${title}${sub}${color}`;
  return pool.tex(key, () => canvasTex(512, 256, (g, w, h) => {
    const hex = '#' + new THREE.Color(color).getHexString();
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(1, '#0b0c18');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = hex; g.globalAlpha = 0.10;
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 2);
    g.globalAlpha = 1;
    g.shadowColor = hex; g.shadowBlur = 26; g.fillStyle = hex;
    g.textAlign = 'center';
    g.font = '700 62px "Orbitron", "Share Tech Mono", monospace';
    g.fillText(String(title).slice(0, 16).toUpperCase(), w / 2, 110);
    g.font = '400 30px "Share Tech Mono", monospace';
    g.globalAlpha = 0.85;
    g.fillText(String(sub).slice(0, 34).toUpperCase(), w / 2, 165);
    g.globalAlpha = 0.5; g.shadowBlur = 10;
    g.font = '400 20px "Share Tech Mono", monospace';
    let kana = '';
    for (let i = 0; i < 22; i++) kana += KANA[(i * 7 + title.length * 3) % KANA.length];
    g.fillText(kana, w / 2, 215);
  }));
}

function graffitiTexture(pool, word, color) {
  return pool.tex(`gr${word}${color}`, () => canvasTex(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const hex = '#' + new THREE.Color(color).getHexString();
    g.translate(w / 2, h / 2); g.rotate(-0.09);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = hex; g.shadowBlur = 18;
    g.lineWidth = 9; g.strokeStyle = hex; g.globalAlpha = 0.9;
    g.font = `900 ${Math.min(120, 620 / Math.max(4, word.length))}px "Orbitron", sans-serif`;
    g.strokeText(word.toUpperCase(), 0, 0);
    g.globalAlpha = 0.35; g.fillStyle = hex;
    g.fillText(word.toUpperCase(), 0, 0);
  }));
}

// ═══════════════════════════════════════════════════════════════════
// TACTICAL GRID — 2 m squares, 10 m majors
// ═══════════════════════════════════════════════════════════════════
function gridRect(x0, x1, z0, z1, y, minor, major, opacity) {
  const pos = [], col = [];
  const cm = new THREE.Color(minor), cM = new THREE.Color(major);
  const a0 = Math.ceil(x0 / CELL) * CELL, a1 = Math.floor(x1 / CELL) * CELL;
  const b0 = Math.ceil(z0 / CELL) * CELL, b1 = Math.floor(z1 / CELL) * CELL;
  for (let x = a0; x <= a1 + 1e-6; x += CELL) {
    const c = (Math.round(x) % 10 === 0) ? cM : cm;
    pos.push(x, 0, z0, x, 0, z1);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  for (let z = b0; z <= b1 + 1e-6; z += CELL) {
    const c = (Math.round(z) % 10 === 0) ? cM : cm;
    pos.push(x0, 0, z, x1, 0, z);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity, depthWrite: false, toneMapped: false, fog: true
  }));
  m.position.y = y; m.renderOrder = 2;
  return m;
}

// ═══════════════════════════════════════════════════════════════════
// MAP BUILD CONTEXT
// ═══════════════════════════════════════════════════════════════════
function makeCtx(pool, opts) {
  const rng = seededRandom(opts.seed);
  const ctx = {
    pool, rng, M: opts.M, half: opts.M / 2,
    group: new THREE.Group(), theme: opts.theme, themeKey: opts.themeKey,
    district: opts.district, accent: opts.accent, seed: opts.seed,
    platforms: [],      // {x,z,w,d,y} standable surfaces
    surfaces: [],       // raycast targets for token drops
    anim: [], disposables: [], windows: [], brief: '', gridY: [],
    r(a, b) { return a + rng() * (b - a); },
    ri(a, b) { return Math.floor(a + rng() * (b - a + 1)); },
    one(arr) { return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]; },
    chance(p) { return rng() < p; },
    // Register a standable surface (invisible raycast target at height y).
    addPlatform(x, z, w, d, y, showGrid) {
      ctx.platforms.push({ x, z, w, d, y });
      const p = new THREE.Mesh(pool.geo('plane1', () => new THREE.PlaneGeometry(1, 1)),
        pool.mat('picker', () => new THREE.MeshBasicMaterial({ visible: false })));
      p.rotation.x = -Math.PI / 2; p.position.set(x, y + 0.01, z); p.scale.set(w, d, 1);
      p.visible = false;               // raycaster ignores .visible; renderer skips it
      p.userData.surfaceY = y;
      ctx.group.add(p); ctx.surfaces.push(p);
      if (showGrid !== false) ctx.gridY.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y: y + 0.02 });
    },
    // Lit window instance for the facade farm
    win(x, y, z, ry, w, h, color) { ctx.windows.push({ p: [x, y, z], r: [0, ry, 0], s: [w, h, 1], c: color }); }
  };
  return ctx;
}

function flushWindows(ctx) {
  if (!ctx.windows.length) return;
  const geo = ctx.pool.geo('winplane', () => new THREE.PlaneGeometry(1, 1));
  const mat = ctx.pool.mat('winmat', () => new THREE.MeshBasicMaterial({
    color: 0xffffff, toneMapped: false, fog: true, side: THREE.DoubleSide
  }));
  const m = instanced(geo, mat, ctx.windows, false);
  if (m) { m.castShadow = false; m.receiveShadow = false; ctx.group.add(m); }
  ctx.windows.length = 0;
}

// ── Static batching ────────────────────────────────────────────────
// Set dressing is generated as hundreds of small meshes because that is the
// readable way to author it; before it ever reaches the renderer we collapse
// everything that shares a material into a single buffer. Anything animated,
// instanced or used as a raycast surface opts out via userData.noBatch.
const BATCH_ATTRS = ['position', 'normal', 'uv'];
function batchStatics(ctx) {
  ctx.group.updateMatrixWorld(true);
  const buckets = new Map();
  ctx.group.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
    if (Array.isArray(o.material) || !o.material) return;
    if (!o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
    for (let q = o; q; q = q.parent) if (q.userData && q.userData.noBatch) return;
    const key = o.material.uuid + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + o.renderOrder;
    let b = buckets.get(key);
    if (!b) { b = { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, ro: o.renderOrder, list: [] }; buckets.set(key, b); }
    b.list.push(o);
  });
  let collapsed = 0;
  buckets.forEach(b => {
    if (b.list.length < 2) return;
    const geos = [];
    for (const m of b.list) {
      const src = m.geometry;
      const g = src.index ? src.toNonIndexed() : src.clone();
      g.applyMatrix4(m.matrixWorld);
      for (const name of Object.keys(g.attributes)) if (BATCH_ATTRS.indexOf(name) < 0) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      geos.push(g);
    }
    let out = null;
    try { out = mergeGeometries(geos, false); } catch (e) { out = null; }
    geos.forEach(g => g.dispose());
    if (!out) return;
    const mesh = new THREE.Mesh(out, b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.renderOrder = b.ro;
    ctx.group.add(mesh);
    collapsed += b.list.length - 1;
    b.list.forEach(m => m.removeFromParent());
  });
  return collapsed;
}

function addGround(ctx, color, rough, metal, size) {
  const M = size || ctx.M * 1.7;
  const g = new THREE.Mesh(
    ctx.pool.geo('groundplane', () => new THREE.PlaneGeometry(1, 1, 1, 1)),
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
  );
  g.rotation.x = -Math.PI / 2; g.scale.set(M, M, 1); g.position.y = 0;
  g.receiveShadow = true;
  g.userData.surfaceY = 0; g.userData.noBatch = true;
  ctx.group.add(g); ctx.surfaces.push(g);
  ctx.disposables.push(g.material);
  return g;
}

// Railing around a rectangle — reads instantly as "you can stand up there".
function railing(ctx, x, z, w, d, y, color, sides) {
  const mat = glow(ctx.pool, color, 2.2);
  const post = ctx.pool.geo('post', () => new THREE.BoxGeometry(0.08, 1.0, 0.08));
  const list = [];
  const rails = [];
  const edges = (sides || 'nsew').split('');
  for (const e of edges) {
    const horiz = (e === 'n' || e === 's');
    const len = horiz ? w : d;
    const cz = e === 'n' ? z - d / 2 : e === 's' ? z + d / 2 : z;
    const cx = e === 'e' ? x + w / 2 : e === 'w' ? x - w / 2 : x;
    const n = Math.max(2, Math.round(len / 2));
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (len * i) / n;
      list.push({ p: [horiz ? cx + t : cx, y + 0.5, horiz ? cz : cz + t] });
    }
    rails.push(box(ctx.pool, horiz ? len : 0.06, 0.06, horiz ? 0.06 : len, mat, cx, y + 1.0, cz, 0, false));
    rails.push(box(ctx.pool, horiz ? len : 0.05, 0.05, horiz ? 0.05 : len, mat, cx, y + 0.55, cz, 0, false));
  }
  const im = instanced(post, surf(ctx.pool, 0x2a2f3a, 0.5, 0.7), list, false);
  if (im) ctx.group.add(im);
  rails.forEach(r => ctx.group.add(r));
}

// A flight of stairs up onto a platform.
function stairs(ctx, x, z, y0, y1, w, dirZ) {
  const rise = 0.35, steps = Math.max(2, Math.round((y1 - y0) / rise));
  const mat = surf(ctx.pool, 0x2c3140, 0.8, 0.35);
  const side = surf(ctx.pool, 0x1a1d26, 0.9, 0.2);
  for (let i = 0; i < steps; i++) {
    const yy = y0 + ((y1 - y0) * (i + 1)) / steps;
    const zz = z + dirZ * (i * 0.42 + 0.21);
    ctx.group.add(box(ctx.pool, w, 0.14, 0.42, mat, x, yy, zz, 0, true));
    ctx.group.add(box(ctx.pool, w, Math.max(0.02, yy - y0), 0.42, side, x, y0 + (yy - y0) / 2, zz, 0, false));
  }
  ctx.group.add(strip(ctx, w, 0.04, 0.04, ctx.accent, x, y1 + 0.08, z + dirZ * (steps * 0.42), 0, 2.0));
}

// Ladder — vertical access to catwalks and container stacks.
function ladder(ctx, x, z, y0, y1, ry) {
  const mat = surf(ctx.pool, 0x3a4150, 0.55, 0.75);
  const g = new THREE.Group();
  const h = y1 - y0;
  g.add(box(ctx.pool, 0.06, h, 0.06, mat, -0.22, h / 2, 0, 0, false));
  g.add(box(ctx.pool, 0.06, h, 0.06, mat, 0.22, h / 2, 0, 0, false));
  const rungs = [];
  for (let yy = 0.3; yy < h; yy += 0.35) rungs.push({ p: [0, yy, 0] });
  const im = instanced(ctx.pool.geo('rung', () => new THREE.BoxGeometry(0.5, 0.045, 0.045)), mat, rungs, false);
  if (im) g.add(im);
  g.position.set(x, y0, z); g.rotation.y = ry || 0;
  ctx.group.add(g);
}

// Rain — one draw call, CPU-updated (cheap at these counts).
function addRain(ctx, count, color, opacity) {
  const pos = new Float32Array(count * 6);
  const vel = new Float32Array(count);
  const H = 26;
  for (let i = 0; i < count; i++) {
    const x = (ctx.rng() - 0.5) * ctx.M * 1.2, z = (ctx.rng() - 0.5) * ctx.M * 1.2, y = ctx.rng() * H;
    const len = 0.7 + ctx.rng() * 1.1;
    pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
    pos[i * 6 + 3] = x + 0.06; pos[i * 6 + 4] = y - len; pos[i * 6 + 5] = z;
    vel[i] = 16 + ctx.rng() * 14;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    color, transparent: true, opacity: opacity === undefined ? 0.22 : opacity,
    depthWrite: false, toneMapped: false, fog: true
  }));
  m.frustumCulled = false;
  ctx.group.add(m);
  ctx.anim.push((t, dt) => {
    const p = g.attributes.position.array;
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < count; i++) {
      const d = vel[i] * step;
      p[i * 6 + 1] -= d; p[i * 6 + 4] -= d;
      if (p[i * 6 + 4] < 0) {
        const len = p[i * 6 + 1] - p[i * 6 + 4];
        p[i * 6 + 1] = H; p[i * 6 + 4] = H - len;
      }
    }
    g.attributes.position.needsUpdate = true;
  });
}

// Flickering firelight / broken neon — one shared updater, few real lights.
function addFlicker(ctx, light, base, speed) {
  let ph = ctx.rng() * 10;
  ctx.anim.push(t => {
    const n = Math.sin(t * speed + ph) * 0.5 + Math.sin(t * speed * 2.7 + ph * 2) * 0.3 + Math.sin(t * speed * 6.1) * 0.2;
    light.intensity = base * (0.72 + 0.36 * (n * 0.5 + 0.5));
  });
}

// ═══════════════════════════════════════════════════════════════════
// SIGNAGE PIECES
// ═══════════════════════════════════════════════════════════════════
function texMat(pool, key, tex, mul, transparent) {
  return pool.mat(key, () => new THREE.MeshBasicMaterial({
    map: tex, color: new THREE.Color(mul, mul, mul), toneMapped: false,
    transparent: !!transparent, side: THREE.DoubleSide, fog: true,
    depthWrite: !transparent
  }));
}

// Vertical or horizontal lit sign hanging off a facade.
function signBlade(ctx, x, y, z, ry, text, color, vertical) {
  const w = vertical ? 0.95 : 3.2, h = vertical ? 3.6 : 1.05;
  const g = new THREE.Group();
  const frame = box(ctx.pool, w + 0.14, h + 0.14, 0.22, surf(ctx.pool, 0x0b0c14, 0.8, 0.4), 0, 0, 0, 0, false);
  g.add(frame);
  const tex = signTexture(ctx.pool, text, color, vertical);
  const face = new THREE.Mesh(ctx.pool.geo('plane1', () => new THREE.PlaneGeometry(1, 1)),
    texMat(ctx.pool, 'sm' + text + color + vertical, tex, 1.0, false));
  face.scale.set(w, h, 1); face.position.z = 0.13; g.add(face);
  const back = face.clone(); back.position.z = -0.13; back.rotation.y = Math.PI; g.add(back);
  // bracket back to the wall
  g.add(box(ctx.pool, 0.09, 0.09, 1.1, surf(ctx.pool, 0x15171f, 0.7, 0.6), 0, h / 2 - 0.2, -0.7, 0, false));
  g.position.set(x, y, z); g.rotation.y = ry;
  ctx.group.add(g);
  return g;
}

// Big animated holo billboard.
function holoBoard(ctx, x, y, z, ry, w, h, title, sub, color) {
  const tex = holoTexture(ctx.pool, title, sub, color);
  const t2 = tex.clone(); t2.needsUpdate = true;
  t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
  ctx.disposables.push(t2);
  const mat = new THREE.MeshBasicMaterial({ map: t2, toneMapped: false, side: THREE.DoubleSide, fog: true });
  mat.color.setScalar(0.7);
  ctx.disposables.push(mat);
  const g = new THREE.Group();
  g.add(box(ctx.pool, w + 0.35, h + 0.35, 0.2, surf(ctx.pool, 0x090a12, 0.85, 0.3), 0, 0, -0.14, 0, false));
  const face = new THREE.Mesh(ctx.pool.geo('plane1', () => new THREE.PlaneGeometry(1, 1)), mat);
  face.scale.set(w, h, 1); g.add(face);
  g.position.set(x, y, z); g.rotation.y = ry;
  ctx.group.add(g);
  let ph = ctx.rng() * 6;
  ctx.anim.push(t => {
    t2.offset.y = (t * 0.06) % 1;
    const f = (Math.sin(t * 9 + ph) > 0.985) ? 0.25 : 1;   // occasional glitch
    mat.color.setScalar(0.7 * f);
  });
  return g;
}

// Flat graffiti decal on a wall.
function graffiti(ctx, x, y, z, ry, word, color, w, h) {
  const tex = graffitiTexture(ctx.pool, word, color);
  const m = new THREE.Mesh(ctx.pool.geo('plane1', () => new THREE.PlaneGeometry(1, 1)),
    texMat(ctx.pool, 'gm' + word + color, tex, 1.15, true));
  m.scale.set(w || 4.4, h || 2.2, 1);
  m.position.set(x, y, z); m.rotation.y = ry;
  ctx.group.add(m);
  return m;
}

// ═══════════════════════════════════════════════════════════════════
// THEME 1 — NEON STREET : a rain-slick canyon of signage
// ═══════════════════════════════════════════════════════════════════
function genStreet(ctx) {
  const H = ctx.half, M = ctx.M;
  const roadHalf = H * 0.42, walkOuter = H * 0.60;
  const P = ctx.pool;

  addGround(ctx, 0x0d0e16, 0.3, 0.62);            // wet asphalt

  // centre line + crosswalk
  const dash = [];
  for (let z = -H; z < H; z += 4) dash.push({ p: [0, 0.02, z + 1], r: [-Math.PI / 2, 0, 0], s: [0.22, 2.2, 1] });
  const dm = instanced(P.geo('plane1', () => new THREE.PlaneGeometry(1, 1)), raw(P, 0xffd600, 0.34), dash, false);
  if (dm) ctx.group.add(dm);
  const cross = [];
  const cz = Math.round(ctx.r(-H * 0.5, H * 0.5) / 2) * 2;
  for (let x = -roadHalf + 0.7; x < roadHalf; x += 1.3) cross.push({ p: [x, 0.02, cz], r: [-Math.PI / 2, 0, 0], s: [0.5, 4.2, 1] });
  const cm = instanced(P.geo('plane1', () => new THREE.PlaneGeometry(1, 1)), raw(P, 0xdfe9f5, 0.3), cross, false);
  if (cm) ctx.group.add(cm);

  // sidewalks (a shallow but real elevation change)
  const walkW = walkOuter - roadHalf;
  const walkMat = surf(P, 0x1b1e28, 0.86, 0.12);
  for (const s of [-1, 1]) {
    const cx = s * (roadHalf + walkW / 2);
    ctx.group.add(box(P, walkW, 0.34, M * 1.3, walkMat, cx, 0.17, 0));
    ctx.group.add(strip(ctx, 0.1, 0.05, M * 1.3, ctx.accent, s * roadHalf, 0.35, 0, 0, 0.8));
    ctx.addPlatform(cx, 0, walkW, M * 1.3, 0.34, false);
  }

  // ── facades ──────────────────────────────────────────────────────
  const dark = surf(P, 0x11131d, 0.82, 0.28);
  const dark2 = surf(P, 0x171a26, 0.75, 0.35);
  const alleys = [];
  for (const s of [-1, 1]) {
    let z = -H * 1.25;
    const nAlley = ctx.ri(1, 2);
    const alleyZ = [];
    for (let i = 0; i < nAlley; i++) alleyZ.push(ctx.r(-H * 0.75, H * 0.75));
    while (z < H * 1.25) {
      const w = ctx.r(6, 13);
      const near = alleyZ.find(a => Math.abs(a - (z + w / 2)) < w / 2 + 2.6);
      if (near !== undefined) {                   // carve an alley
        alleys.push({ s, z: near });
        z = near + 2.6; continue;
      }
      const h = ctx.r(9, 27);
      const dep = ctx.r(9, 16);
      const cx = s * (walkOuter + dep / 2);
      const mat = ctx.chance(0.5) ? dark : dark2;
      ctx.group.add(box(P, dep, h, w, mat, cx, h / 2, z + w / 2));
      // parapet trim — on every roofline the skyline turns into one big glow
      if (ctx.chance(0.6)) ctx.group.add(strip(ctx, dep, 0.14, w, ctx.one(NEONS), cx, h + 0.1, z + w / 2, 0, 1.05));
      // lit windows on the street-facing wall
      const fx = s * (walkOuter + 0.06);
      const cols = Math.max(1, Math.floor(w / 1.9));
      const rows = Math.max(1, Math.floor((h - 2.4) / 2.3));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (ctx.chance(0.42)) continue;
          const wx = z + 0.95 + c * (w / cols);
          const wy = 2.6 + r * 2.3;
          const tint = ctx.chance(0.72)
            ? new THREE.Color(0xffb877).multiplyScalar(ctx.r(0.4, 1.0))
            : new THREE.Color(ctx.one(NEONS)).multiplyScalar(ctx.r(0.45, 1.1));
          ctx.win(fx, wy, wx, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0.82, 1.05, tint.getHex());
        }
      }
      // signage on the facade
      if (ctx.chance(0.75)) {
        signBlade(ctx, s * (walkOuter - 0.75), ctx.r(4, Math.min(11, h - 2)), z + w * ctx.r(0.25, 0.75),
          s > 0 ? -Math.PI / 2 : Math.PI / 2, ctx.one(SIGN_WORDS), ctx.one(NEONS), ctx.chance(0.6));
      }
      z += w + ctx.r(0.4, 1.6);
    }
  }
  flushWindows(ctx);

  // alley dressing + fire escapes (verticality)
  alleys.forEach((a, i) => {
    const cx = a.s * (walkOuter + 6);
    ctx.group.add(box(P, 12, 0.02, 5.2, surf(P, 0x0c0d14, 0.9, 0.1), cx, 0.36, a.z));
    addGlowDecal(ctx, a.s * (walkOuter + 1.5), a.z, 3.2, ctx.one(NEONS), 0.24, 0.38);
    staticProp(ctx, 'dumpster', a.s * (walkOuter + 3.2), a.z + ctx.r(-1.6, 1.6), 0.34, ctx.r(0, 3.14));
    if (i === 0) {
      const py = 4.2, pw = 2.4, pd = 6;
      const px = a.s * (walkOuter - pw / 2 + 0.1);
      ctx.group.add(box(P, pw, 0.18, pd, surf(P, 0x232833, 0.6, 0.7), px, py, a.z));
      railing(ctx, px, a.z, pw, pd, py + 0.09, ctx.accent, a.s > 0 ? 'nse' : 'nsw');
      ctx.addPlatform(px, a.z, pw, pd, py + 0.18);
      ladder(ctx, a.s * (walkOuter - 0.3), a.z + pd / 2 - 0.3, 0.34, py, a.s > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  });

  // ── skybridge across the canyon ─────────────────────────────────
  const bz = Math.round(ctx.r(-H * 0.45, H * 0.45) / 2) * 2;
  const by = 6.2, bw = walkOuter * 2 + 1.4;
  ctx.group.add(box(P, bw, 0.22, 3.6, surf(P, 0x1d2230, 0.55, 0.72), 0, by, bz));
  ctx.group.add(strip(ctx, bw, 0.07, 0.07, ctx.accent, 0, by + 0.14, bz - 1.8, 0, 2.4));
  ctx.group.add(strip(ctx, bw, 0.07, 0.07, ctx.accent, 0, by + 0.14, bz + 1.8, 0, 2.4));
  railing(ctx, 0, bz, bw, 3.6, by + 0.11, ctx.accent, 'ns');
  ctx.addPlatform(0, bz, bw, 3.6, by + 0.22);
  ladder(ctx, roadHalf + 0.6, bz + 1.6, 0.34, by, 0);
  ladder(ctx, -roadHalf - 0.6, bz - 1.6, 0.34, by, Math.PI);

  // ── overhead cables + lanterns ──────────────────────────────────
  const cableMat = surf(P, 0x05060a, 0.9, 0.3);
  const lant = [];
  for (let i = 0; i < 5; i++) {
    const z0 = ctx.r(-H, H), sag = ctx.r(1.2, 2.6), yy = ctx.r(7, 12);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-walkOuter, yy, z0),
      new THREE.Vector3(0, yy - sag, z0 + ctx.r(-1.5, 1.5)),
      new THREE.Vector3(walkOuter, yy, z0 + ctx.r(-2, 2))
    ]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.045, 5, false), cableMat);
    ctx.group.add(tube); ctx.disposables.push(tube.geometry);
    if (ctx.chance(0.7)) {
      for (let k = 1; k <= 5; k++) {
        const p = curve.getPoint(k / 6);
        lant.push({ p: [p.x, p.y - 0.25, p.z], c: new THREE.Color(ctx.one(NEONS)).multiplyScalar(0.95).getHex() });
      }
    }
  }
  const lm = instanced(P.geo('lantern', () => new THREE.SphereGeometry(0.12, 8, 6)),
    P.mat('lantm', () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: true })), lant, false);
  if (lm) ctx.group.add(lm);

  // ── street lamps ────────────────────────────────────────────────
  let realLights = 0;
  for (let z = -H + 4; z < H; z += ctx.r(9, 14)) {
    for (const s of [-1, 1]) {
      const x = s * (roadHalf + 0.8);
      ctx.group.add(cyl(P, 0.09, 0.12, 5.4, 8, surf(P, 0x1a1e28, 0.6, 0.7), x, 2.7 + 0.34, z, false));
      ctx.group.add(box(P, 1.6 * -s, 0.1, 0.1, surf(P, 0x1a1e28, 0.6, 0.7), x - s * 0.8, 5.9, z, 0, false));
      const head = strip(ctx, 1.1, 0.14, 0.34, 0xbfe9ff, x - s * 1.4, 5.8, z, 0, 1.5);
      ctx.group.add(head);
      addLightShaft(ctx, x - s * 1.4, 5.75, z, 2.0, 5.6, 0x9fdcff, 0.028);
      addGlowDecal(ctx, x - s * 1.4, z, 3.0, 0x8fd8ff, 0.16, 0.025);
      if (realLights < 3) {
        const pl = new THREE.PointLight(0xbfe9ff, 26, 22, 2);
        pl.position.set(x - s * 1.4, 5.6, z); ctx.group.add(pl); realLights++;
      }
    }
  }

  // ── holo billboards ─────────────────────────────────────────────
  const d = ctx.district;
  const gangs = (d && d.gangs) || ['MAELSTROM'];
  const boards = ctx.ri(2, 3);
  for (let i = 0; i < boards; i++) {
    const s = i % 2 ? 1 : -1;
    holoBoard(ctx, s * (walkOuter - 0.4), ctx.r(7, 15), ctx.r(-H * 0.8, H * 0.8),
      s > 0 ? -Math.PI / 2 : Math.PI / 2, ctx.r(6, 9), ctx.r(3.4, 5),
      i === 0 ? (d ? d.name : 'NIGHT CITY') : ctx.one(SIGN_WORDS),
      i === 0 ? (d ? d.region : 'NC') : ctx.one(gangs), ctx.one(NEONS));
  }
  graffiti(ctx, -walkOuter + 0.08, 2.0, ctx.r(-H * 0.7, H * 0.7), Math.PI / 2, ctx.one(gangs), ctx.one(NEONS), 5, 2.4);

  // ── street furniture ────────────────────────────────────────────
  for (let i = 0; i < ctx.ri(4, 7); i++) {
    const s = ctx.chance(0.5) ? -1 : 1;
    staticProp(ctx, ctx.one(['crate', 'barrel', 'jersey', 'terminal', 'planter', 'sign']),
      s * ctx.r(roadHalf + 0.6, walkOuter - 0.6), ctx.r(-H * 0.9, H * 0.9), 0.34, ctx.r(0, 6.28));
  }
  for (let i = 0; i < ctx.ri(3, 5); i++) {
    const s = ctx.chance(0.5) ? -1 : 1;
    staticVehicle(ctx, ctx.one(['sedan', 'sedan', 'van', 'bike']),
      s * (roadHalf - ctx.r(1.2, 2.4)), ctx.r(-H * 0.9, H * 0.9), s > 0 ? 0 : Math.PI, false);
  }
  // noodle stall — a landmark and a chunk of cover
  const nz = ctx.r(-H * 0.6, H * 0.6), ns = ctx.chance(0.5) ? -1 : 1;
  const nx = ns * (roadHalf + 1.6);
  ctx.group.add(box(P, 2.4, 1.1, 3.4, surf(P, 0x2a1a12, 0.85, 0.15), nx, 0.9, nz));
  ctx.group.add(box(P, 3.0, 0.12, 4.0, glow(P, 0xff2d95, 0.8), nx, 2.6, nz));
  ctx.group.add(strip(ctx, 0.1, 0.5, 3.6, 0xff2d95, nx + ns * 1.2, 2.2, nz, 0, 1.6));
  addGlowDecal(ctx, nx, nz, 3.4, 0xff2d95, 0.3, 0.03);
  signBlade(ctx, nx, 3.5, nz, ns > 0 ? -Math.PI / 2 : Math.PI / 2, 'NOODLE', 0xff9100, false);

  // ── weather + puddles ───────────────────────────────────────────
  for (let i = 0; i < 12; i++) {
    addGlowDecal(ctx, ctx.r(-roadHalf, roadHalf), ctx.r(-H, H), ctx.r(1.2, 3.4),
      ctx.one(NEONS), ctx.r(0.04, 0.11), 0.015);
  }
  // Big additive haze cards are pure overdraw; a few small ones read the same.
  addRain(ctx, 620, 0x9fd8ff, 0.18);
  addHaze(ctx, 5, 0x2b6ea8, 16, 2, 12, 0.05);

  ctx.brief = 'STREET CANYON · sidewalks +0.3m · fire escape +4.2m · skybridge +6.2m';
}

// ═══════════════════════════════════════════════════════════════════
// THEME 2 — CORPO INTERIOR : rooms, corridors, glass and a mezzanine
// ═══════════════════════════════════════════════════════════════════
function genCorpo(ctx) {
  const H = ctx.half, P = ctx.pool;
  addGround(ctx, 0x171a22, 0.2, 0.55);

  // polished floor sheen + corp seal
  addGlowDecal(ctx, 0, 0, H * 0.55, ctx.accent, 0.07, 0.012);

  // ── BSP floor plan ──────────────────────────────────────────────
  const rooms = [];
  const walls = [];
  (function split(x, z, w, d, depth) {
    const minR = 9;
    if (depth <= 0 || (w < minR * 1.9 && d < minR * 1.9)) { rooms.push({ x, z, w, d }); return; }
    const horiz = (d > w);
    const frac = ctx.r(0.38, 0.62);
    if (horiz) {
      const dz = d * frac;
      walls.push({ a: [x - w / 2, z - d / 2 + dz], b: [x + w / 2, z - d / 2 + dz] });
      split(x, z - d / 2 + dz / 2, w, dz, depth - 1);
      split(x, z + d / 2 - (d - dz) / 2, w, d - dz, depth - 1);
    } else {
      const dx = w * frac;
      walls.push({ a: [x - w / 2 + dx, z - d / 2], b: [x - w / 2 + dx, z + d / 2] });
      split(x - w / 2 + dx / 2, z, dx, d, depth - 1);
      split(x + w / 2 - (w - dx) / 2, z, w - dx, d, depth - 1);
    }
  })(0, 0, ctx.M * 0.92, ctx.M * 0.92, 3);

  // perimeter
  const R = ctx.M * 0.46;
  walls.push({ a: [-R, -R], b: [R, -R], solid: 1 }, { a: [R, -R], b: [R, R], solid: 1 },
    { a: [R, R], b: [-R, R], solid: 1 }, { a: [-R, R], b: [-R, -R], solid: 1 });

  const WH = 3.3;
  const wallMat = surf(P, 0x252a36, 0.72, 0.22);
  const trimMat = glow(P, ctx.accent, 0.95);
  const glassMat = P.mat('corpglass', () => new THREE.MeshStandardMaterial({
    color: 0x7fd8ff, transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0.9,
    emissive: 0x1a4a5a, emissiveIntensity: 0.6, side: THREE.DoubleSide
  }));

  for (const w of walls) {
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1) continue;
    const ang = Math.atan2(dx, dz);
    // door gaps
    const gaps = [];
    const nGaps = w.solid ? (len > 26 ? 1 : 0) : Math.max(1, Math.round(len / 16));
    for (let i = 0; i < nGaps; i++) gaps.push(ctx.r(0.18, 0.82) * len);
    gaps.sort((a, b) => a - b);
    let cursor = 0;
    const segs = [];
    for (const g of gaps) {
      const gw = 2.6;
      if (g - gw / 2 > cursor + 0.4) segs.push([cursor, g - gw / 2]);
      cursor = g + gw / 2;
    }
    if (len - cursor > 0.4) segs.push([cursor, len]);
    for (const [s0, s1] of segs) {
      const sl = s1 - s0, mid = (s0 + s1) / 2;
      const px = w.a[0] + (dx / len) * mid, pz = w.a[1] + (dz / len) * mid;
      const glassy = !w.solid && ctx.chance(0.38) && sl > 3;
      if (glassy) {
        ctx.group.add(box(P, 0.14, 1.0, sl, wallMat, px, 0.5, pz, ang, true));
        const gl = box(P, 0.06, WH - 1.35, sl - 0.1, glassMat, px, 1.0 + (WH - 1.35) / 2, pz, ang, false);
        ctx.group.add(gl);
        ctx.group.add(box(P, 0.16, 0.1, sl, trimMat, px, WH - 0.05, pz, ang, false));
      } else {
        ctx.group.add(box(P, 0.24, WH, sl, wallMat, px, WH / 2, pz, ang, true));
        ctx.group.add(box(P, 0.28, 0.06, sl, trimMat, px, WH - 0.12, pz, ang, false));
      }
    }
    // lit door frames
    for (const g of gaps) {
      for (const side of [-1, 1]) {
        const t = g + side * 1.3;
        const px = w.a[0] + (dx / len) * t, pz = w.a[1] + (dz / len) * t;
        ctx.group.add(box(P, 0.3, WH, 0.1, glow(P, ctx.accent, 1.7), px, WH / 2, pz, ang, false));
      }
    }
  }

  // ── room contents ───────────────────────────────────────────────
  rooms.sort((a, b) => b.w * b.d - a.w * a.d);
  const atrium = rooms[0];
  const kinds = ['office', 'office', 'server', 'meeting', 'lobby', 'lab'];
  rooms.forEach((rm, idx) => {
    // ceiling light strip + floor pool
    const ll = Math.min(rm.w, rm.d) * 0.7;
    const horiz = rm.w > rm.d;
    ctx.group.add(box(P, horiz ? Math.min(rm.w * 0.7, 12) : 0.28, 0.1, horiz ? 0.28 : Math.min(rm.d * 0.7, 12),
      glow(P, 0xdff2ff, 1.5), rm.x, 3.55, rm.z, 0, false));
    addGlowDecal(ctx, rm.x, rm.z, Math.min(rm.w, rm.d) * 0.42, 0xbfe6ff, 0.09, 0.02);
    if (idx === 0) return;                      // atrium stays clear
    const kind = kinds[idx % kinds.length];
    const n = Math.max(1, Math.round((rm.w * rm.d) / 34));
    for (let i = 0; i < n; i++) {
      const px = rm.x + ctx.r(-rm.w / 2 + 1.6, rm.w / 2 - 1.6);
      const pz = rm.z + ctx.r(-rm.d / 2 + 1.6, rm.d / 2 - 1.6);
      const ry = ctx.chance(0.5) ? 0 : Math.PI / 2;
      if (kind === 'server') staticProp(ctx, 'server', px, pz, 0, ry);
      else if (kind === 'meeting') staticProp(ctx, 'desk', px, pz, 0, ry);
      else if (kind === 'lobby') staticProp(ctx, ctx.one(['planter', 'desk', 'terminal']), px, pz, 0, ry);
      else if (kind === 'lab') staticProp(ctx, ctx.one(['terminal', 'server', 'crate']), px, pz, 0, ry);
      else staticProp(ctx, ctx.one(['desk', 'desk', 'terminal', 'planter']), px, pz, 0, ry);
    }
  });

  // ── atrium mezzanine (verticality) ──────────────────────────────
  if (atrium) {
    const my = 3.9, ww = 2.4;
    const slabs = [
      { x: atrium.x, z: atrium.z - atrium.d / 2 + ww / 2, w: atrium.w, d: ww },
      { x: atrium.x, z: atrium.z + atrium.d / 2 - ww / 2, w: atrium.w, d: ww },
      { x: atrium.x - atrium.w / 2 + ww / 2, z: atrium.z, w: ww, d: atrium.d - ww * 2 },
      { x: atrium.x + atrium.w / 2 - ww / 2, z: atrium.z, w: ww, d: atrium.d - ww * 2 }
    ];
    for (const s of slabs) {
      if (s.w < 0.5 || s.d < 0.5) continue;
      ctx.group.add(box(P, s.w, 0.2, s.d, surf(P, 0x2b303d, 0.5, 0.6), s.x, my, s.z));
      ctx.group.add(strip(ctx, s.w, 0.05, s.d * 0.02 + 0.05, ctx.accent, s.x, my + 0.12, s.z + (s.d > s.w ? 0 : s.d / 2), 0, 2.2));
      ctx.addPlatform(s.x, s.z, s.w, s.d, my + 0.2);
      railing(ctx, s.x, s.z, s.w, s.d, my + 0.2, ctx.accent,
        s.d > s.w ? (s.x < atrium.x ? 'e' : 'w') : (s.z < atrium.z ? 's' : 'n'));
    }
    stairs(ctx, atrium.x, atrium.z - atrium.d / 2 + ww + 0.3, 0, my, 2.2, 1);
    holoBoard(ctx, atrium.x, 5.6, atrium.z + atrium.d / 2 - 0.3, Math.PI, 6.4, 3.4,
      ctx.district ? ctx.district.name : 'ARASAKA', ctx.district ? ctx.district.securityProvider || 'SECURITY' : 'SECURITY', ctx.accent);
    for (let i = 0; i < 3; i++) {
      staticProp(ctx, 'planter', atrium.x + ctx.r(-atrium.w / 3, atrium.w / 3), atrium.z + ctx.r(-atrium.d / 3, atrium.d / 3), 0, 0);
    }
  }

  addHaze(ctx, 5, 0x5fa8c8, 14, 1.5, 5, 0.06);
  ctx.brief = 'CORPO FLOOR · ' + rooms.length + ' rooms · glass walls · mezzanine +3.9m';
}

// Rising embers / floating motes — additive Points, one draw call.
function addMotes(ctx, count, color, size, rise, spread, yMax) {
  const pos = new Float32Array(count * 3);
  const spd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (ctx.rng() - 0.5) * spread;
    pos[i * 3 + 1] = ctx.rng() * yMax;
    pos[i * 3 + 2] = (ctx.rng() - 0.5) * spread;
    spd[i] = 0.4 + ctx.rng() * 1.4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({
    color, size, transparent: true, opacity: 0.85, sizeAttenuation: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  }));
  m.frustumCulled = false;
  ctx.group.add(m);
  ctx.anim.push((t, dt) => {
    const p = g.attributes.position.array;
    const s = Math.min(dt, 0.05);
    for (let i = 0; i < count; i++) {
      p[i * 3 + 1] += spd[i] * rise * s;
      p[i * 3] += Math.sin(t * 0.6 + i) * 0.006;
      if (p[i * 3 + 1] > yMax) { p[i * 3 + 1] = 0.2; p[i * 3] = (ctx.rng() - 0.5) * spread; p[i * 3 + 2] = (ctx.rng() - 0.5) * spread; }
    }
    g.attributes.position.needsUpdate = true;
  });
}

// Barrel fire / campfire: emissive core, flicker light, ground pool, embers.
function fire(ctx, x, z, y, scale, withBarrel) {
  const P = ctx.pool;
  if (withBarrel) ctx.group.add(cyl(P, 0.34, 0.36, 0.9, 12, surf(P, 0x2b1a12, 0.95, 0.35), x, y + 0.45, z));
  const core = new THREE.Mesh(P.geo('flame', () => new THREE.ConeGeometry(0.32, 1.1, 8)),
    P.mat('flamem', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2b).multiplyScalar(2.4), toneMapped: false, transparent: true, opacity: 0.92 })));
  core.position.set(x, y + (withBarrel ? 1.35 : 0.55), z);
  core.scale.setScalar(scale);
  core.userData.noBatch = true;
  ctx.group.add(core);
  const pl = new THREE.PointLight(0xff7a22, 46 * scale, 26 * scale, 2);
  pl.position.set(x, y + (withBarrel ? 1.4 : 0.7), z);
  ctx.group.add(pl);
  addFlicker(ctx, pl, 46 * scale, 3.4);
  addGlowDecal(ctx, x, z, 3.4 * scale, 0xff7a22, 0.4, y + 0.02);
  let ph = ctx.rng() * 6;
  ctx.anim.push(t => {
    core.scale.set(scale * (0.86 + Math.sin(t * 11 + ph) * 0.12), scale * (0.9 + Math.sin(t * 7.3 + ph) * 0.16), scale);
  });
}

// Steam / smoke plume.
function plume(ctx, x, z, y, h, color, opacity) {
  const tex = softDisc(ctx.pool, 'haze', 0.0, [[0, 'rgba(255,255,255,.85)'], [0.45, 'rgba(255,255,255,.22)'], [1, 'rgba(255,255,255,0)']]);
  const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  ctx.disposables.push(mat);
  const items = [];
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(mat);
    const sc = 1.4 + i * 0.7;
    s.scale.set(sc, sc, 1);
    s.position.set(x, y + (i / 5) * h, z);
    items.push({ s, base: (i / 5) * h, ph: ctx.rng() * 6 });
    g.add(s);
  }
  ctx.group.add(g);
  ctx.anim.push(t => {
    items.forEach((it, i) => {
      const p = (it.base + t * 0.9) % h;
      it.s.position.y = y + p;
      it.s.position.x = x + Math.sin(t * 0.5 + it.ph) * (p * 0.12);
      it.s.material.opacity = opacity;
      const sc = 1.2 + p * 0.5;
      it.s.scale.set(sc, sc, 1);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// THEME 3 — COMBAT ZONE : rubble, burnt shells and barrel fires
// ═══════════════════════════════════════════════════════════════════
function genCombat(ctx) {
  const H = ctx.half, P = ctx.pool;
  addGround(ctx, 0x3d3026, 0.95, 0.06);
  // The theme key light is a low orange; on its own the zone goes to mud.
  // A warm bounce plus a cold sky fill keeps silhouettes readable.
  ctx.group.add(new THREE.AmbientLight(0xffc9a8, 0.55));
  const moon = new THREE.DirectionalLight(0x7fa8d8, 0.85);
  moon.position.set(-50, 70, -40);
  ctx.group.add(moon);

  const gangs = (ctx.district && ctx.district.gangs) || ['MAELSTROM', '6TH STREET'];
  const conc = surf(P, 0x4a4238, 0.94, 0.06);
  const conc2 = surf(P, 0x3b332b, 0.95, 0.05);
  const rust = surf(P, 0x6b452a, 0.92, 0.35);

  // ── ruined shells ───────────────────────────────────────────────
  const shells = ctx.ri(3, 5);
  for (let i = 0; i < shells; i++) {
    const bw = ctx.r(9, 16), bd = ctx.r(8, 14);
    const bx = ctx.r(-H * 0.78, H * 0.78), bz = ctx.r(-H * 0.78, H * 0.78);
    const ry = ctx.chance(0.5) ? 0 : ctx.r(-0.3, 0.3);
    const g = new THREE.Group(); g.position.set(bx, 0, bz); g.rotation.y = ry;
    // four walls made of ragged vertical slabs
    const edges = [[bw, 0, -bd / 2, 0], [bw, 0, bd / 2, 0], [bd, -bw / 2, 0, Math.PI / 2], [bd, bw / 2, 0, Math.PI / 2]];
    for (const [len, ex, ez, ea] of edges) {
      if (ctx.chance(0.2)) continue;              // a blown-out side
      let t = -len / 2;
      while (t < len / 2) {
        const sw = ctx.r(1.2, 2.6);
        const sh = ctx.chance(0.25) ? ctx.r(0.6, 1.8) : ctx.r(3.0, 6.4);
        const off = t + sw / 2;
        const px = ex + Math.cos(ea) * 0 + (ea ? 0 : off), pz = ez + (ea ? off : 0);
        g.add(box(P, ea ? 0.42 : sw, sh, ea ? sw : 0.42, ctx.chance(0.5) ? conc : conc2, px, sh / 2, pz, 0, true));
        t += sw + ctx.r(0.05, 0.5);
      }
    }
    // half-collapsed upper floor → real cover height
    if (ctx.chance(0.75)) {
      const fy = ctx.r(3.2, 4.2), fw = bw * ctx.r(0.45, 0.8), fd = bd * ctx.r(0.5, 0.85);
      const fx = ctx.r(-(bw - fw) / 2, (bw - fw) / 2), fz = ctx.r(-(bd - fd) / 2, (bd - fd) / 2);
      g.add(box(P, fw, 0.3, fd, conc, fx, fy, fz, 0, true));
      ctx.addPlatform(bx + Math.cos(ry) * fx - Math.sin(ry) * fz, bz + Math.sin(ry) * fx + Math.cos(ry) * fz, fw * 0.9, fd * 0.9, fy + 0.3);
      // rebar
      for (let k = 0; k < 5; k++) {
        g.add(box(P, 0.05, ctx.r(0.5, 1.4), 0.05, rust, fx + ctx.r(-fw / 2, fw / 2), fy + 0.5, fz + ctx.r(-fd / 2, fd / 2), 0, false));
      }
      ladder(ctx, bx + Math.cos(ry) * (fx + fw / 2 + 0.3), bz + fz, 0, fy, ry);
    }
    ctx.group.add(g);
    if (ctx.chance(0.8)) {
      graffiti(ctx, bx + Math.cos(ry) * ctx.r(-bw / 3, bw / 3), 1.9, bz - Math.cos(ry) * (bd / 2 - 0.24),
        ry, ctx.one(gangs), ctx.one([0xff1744, 0xff2d95, 0xffd600, 0x69f0ae]), 4.6, 2.3);
    }
  }

  // ── rubble field (instanced) ────────────────────────────────────
  const chunks = [];
  for (let i = 0; i < 170; i++) {
    const s = ctx.r(0.18, 0.85);
    chunks.push({
      p: [ctx.r(-H, H), s * 0.4, ctx.r(-H, H)],
      r: [ctx.r(0, 3), ctx.r(0, 3), ctx.r(0, 3)],
      s: [s, s * ctx.r(0.5, 1), s * ctx.r(0.7, 1.3)],
      c: ctx.one([0x585047, 0x453d34, 0x6b6259])
    });
  }
  const im = instanced(P.geo('chunk', () => new THREE.IcosahedronGeometry(1, 0)), surf(P, 0xffffff, 0.95, 0.05), chunks, true);
  if (im) ctx.group.add(im);

  // rubble ramp mounds → climbable high ground
  for (let i = 0; i < ctx.ri(1, 2); i++) {
    const mx = ctx.r(-H * 0.7, H * 0.7), mz = ctx.r(-H * 0.7, H * 0.7), mh = ctx.r(1.8, 2.6);
    const m = cyl(P, 2.4, 5.2, mh, 9, surf(P, 0x554c42, 0.96, 0.05), mx, mh / 2, mz);
    ctx.group.add(m);
    ctx.addPlatform(mx, mz, 4, 4, mh);
  }

  // ── barricades, wrecks, fires ───────────────────────────────────
  for (let i = 0; i < ctx.ri(5, 8); i++) {
    staticProp(ctx, ctx.one(['sandbags', 'jersey', 'barricade', 'barrel', 'crate', 'rubble']),
      ctx.r(-H * 0.9, H * 0.9), ctx.r(-H * 0.9, H * 0.9), 0, ctx.r(0, 6.28));
  }
  for (let i = 0; i < ctx.ri(3, 5); i++) {
    staticVehicle(ctx, ctx.one(['sedan', 'van', 'truck', 'buggy']),
      ctx.r(-H * 0.85, H * 0.85), ctx.r(-H * 0.85, H * 0.85), ctx.r(0, 6.28), true);
  }
  for (let i = 0; i < ctx.ri(3, 5); i++) {
    fire(ctx, ctx.r(-H * 0.8, H * 0.8), ctx.r(-H * 0.8, H * 0.8), 0, ctx.r(0.9, 1.3), true);
  }

  // chain-link fence run
  {
    const fz = ctx.r(-H * 0.8, H * 0.8), fa = ctx.chance(0.5) ? 0 : Math.PI / 2;
    const fmat = P.mat('chain', () => new THREE.MeshBasicMaterial({
      color: 0x6b7480, wireframe: true, transparent: true, opacity: 0.45, fog: true
    }));
    for (let t = -H * 0.8; t < H * 0.8; t += 3) {
      if (ctx.chance(0.22)) continue;
      const px = fa ? fz : t, pz = fa ? t : fz;
      const p = new THREE.Mesh(P.geo('chainpanel', () => new THREE.PlaneGeometry(3, 2.4, 6, 5)), fmat);
      p.position.set(px, 1.2, pz); p.rotation.y = fa;
      ctx.group.add(p);
      ctx.group.add(box(P, 0.08, 2.6, 0.08, surf(P, 0x30353d, 0.8, 0.5), fa ? px : px - 1.5, 1.3, fa ? pz - 1.5 : pz, 0, false));
    }
  }

  // broken neon on a surviving wall
  const bs = signBlade(ctx, ctx.r(-H * 0.6, H * 0.6), 4.6, ctx.r(-H * 0.6, H * 0.6), ctx.r(0, 6.28),
    ctx.one(SIGN_WORDS), 0xff2d95, true);
  bs.userData.noBatch = true;
  let ph = ctx.rng() * 6;
  ctx.anim.push(t => { bs.visible = !(Math.sin(t * 6.3 + ph) > 0.72 && Math.sin(t * 23 + ph) > 0); });

  addMotes(ctx, 260, 0xff9a3c, 0.16, 1.0, ctx.M * 1.2, 16);
  addRain(ctx, 320, 0xc8a888, 0.13);
  addHaze(ctx, 6, 0x8a4a22, 18, 1, 12, 0.07);
  ctx.brief = 'COMBAT ZONE · ' + shells + ' ruins · collapsed floors +3–4m · rubble ramps';
}

// ═══════════════════════════════════════════════════════════════════
// THEME 4 — INDUSTRIAL : containers, gantries, pipes, floodlights
// ═══════════════════════════════════════════════════════════════════
function genIndustrial(ctx) {
  const H = ctx.half, P = ctx.pool;
  addGround(ctx, 0x16181d, 0.9, 0.14);

  // hazard striping + bay markings
  for (let i = 0; i < 3; i++) {
    const z = ctx.r(-H * 0.8, H * 0.8);
    const marks = [];
    for (let x = -H * 0.85; x < H * 0.85; x += 1.4) marks.push({ p: [x, 0.02, z], r: [-Math.PI / 2, 0, 0.5], s: [0.5, 1.6, 1] });
    const m = instanced(P.geo('plane1', () => new THREE.PlaneGeometry(1, 1)), raw(P, 0xffd600, 0.32), marks, false);
    if (m) ctx.group.add(m);
  }

  // ── container stacks (instanced, climbable) ─────────────────────
  const CW = 6.1, CH = 2.6, CD = 2.44;
  const CCOL = [0xc2452b, 0x1f6f8b, 0x2f7d4a, 0xd08a1e, 0x6b3f8f, 0x8a8f96, 0x2b3d6b];
  const cont = [];
  const stacks = ctx.ri(7, 12);
  for (let i = 0; i < stacks; i++) {
    const rot = ctx.chance(0.5) ? 0 : Math.PI / 2;
    const bx = Math.round(ctx.r(-H * 0.8, H * 0.8) / 2) * 2;
    const bz = Math.round(ctx.r(-H * 0.8, H * 0.8) / 2) * 2;
    const n = ctx.ri(1, 3);
    for (let k = 0; k < n; k++) {
      const jitter = k === 0 ? 0 : ctx.r(-0.5, 0.5);
      cont.push({ p: [bx + jitter, CH / 2 + k * CH, bz], r: [0, rot, 0], c: ctx.one(CCOL) });
    }
    ctx.addPlatform(bx, bz, rot ? CD : CW, rot ? CW : CD, n * CH);
    if (n > 1) ladder(ctx, bx + (rot ? CD / 2 + 0.12 : CW / 2 + 0.12), bz, 0, n * CH, rot ? Math.PI / 2 : 0);
  }
  const cm = instanced(P.geo('cont', () => new THREE.BoxGeometry(CW, CH, CD)), surf(P, 0xffffff, 0.78, 0.42), cont, true);
  if (cm) ctx.group.add(cm);

  // ── gantry catwalk ──────────────────────────────────────────────
  const gy = 5.4, gw = 2.6;
  const gz = Math.round(ctx.r(-H * 0.5, H * 0.5) / 2) * 2;
  const glen = H * 1.9;
  ctx.group.add(box(P, glen, 0.14, gw, surf(P, 0x2f3542, 0.55, 0.78), 0, gy, gz));
  railing(ctx, 0, gz, glen, gw, gy + 0.07, 0xffd600, 'ns');
  ctx.addPlatform(0, gz, glen, gw, gy + 0.14);
  // support legs
  for (let x = -glen / 2 + 2; x <= glen / 2 - 2; x += 9) {
    ctx.group.add(box(P, 0.28, gy, 0.28, surf(P, 0x272c36, 0.7, 0.6), x, gy / 2, gz - gw / 2 + 0.2, 0, false));
    ctx.group.add(box(P, 0.28, gy, 0.28, surf(P, 0x272c36, 0.7, 0.6), x, gy / 2, gz + gw / 2 - 0.2, 0, false));
  }
  // a branch arm
  const bx2 = Math.round(ctx.r(-H * 0.4, H * 0.4) / 2) * 2;
  const blen = H * 0.9;
  ctx.group.add(box(P, gw, 0.14, blen, surf(P, 0x2f3542, 0.55, 0.78), bx2, gy, gz + blen / 2));
  railing(ctx, bx2, gz + blen / 2, gw, blen, gy + 0.07, 0xffd600, 'ew');
  ctx.addPlatform(bx2, gz + blen / 2, gw, blen, gy + 0.14);
  ladder(ctx, bx2, gz + blen - 0.3, 0, gy, 0);
  stairs(ctx, -glen / 2 + 1.2, gz + gw / 2 + 0.2, 0, gy, 2.0, 1);
  // strip lights under the catwalk
  ctx.group.add(strip(ctx, glen, 0.07, 0.07, 0xffd600, 0, gy - 0.12, gz, 0, 1.3));
  addGlowDecal(ctx, 0, gz, 6, 0xffd600, 0.07, 0.02);

  // ── overhead pipe runs ──────────────────────────────────────────
  const pipeMat = surf(P, 0x3d444f, 0.6, 0.75);
  const pipeMat2 = surf(P, 0x5a4030, 0.75, 0.55);
  for (let i = 0; i < 5; i++) {
    const py = ctx.r(6.6, 9.4), pz = ctx.r(-H, H), rad = ctx.r(0.16, 0.32);
    const p = cyl(P, rad, rad, H * 2.2, 10, ctx.chance(0.5) ? pipeMat : pipeMat2, 0, py, pz, false);
    p.rotation.z = Math.PI / 2;
    ctx.group.add(p);
    for (let k = -2; k <= 2; k++) {
      const jx = k * H * 0.45;
      ctx.group.add(cyl(P, rad * 1.35, rad * 1.35, 0.3, 10, surf(P, 0x2a2f38, 0.7, 0.6), jx, py, pz, false));
    }
    if (ctx.chance(0.6)) {
      const t = new THREE.Mesh(P.geo('valve', () => new THREE.TorusGeometry(0.42, 0.07, 6, 14)), surf(P, 0xb03a1e, 0.7, 0.4));
      t.position.set(ctx.r(-H * 0.7, H * 0.7), py + rad + 0.3, pz); t.rotation.x = Math.PI / 2;
      ctx.group.add(t);
    }
  }

  // ── tanks + silos ───────────────────────────────────────────────
  for (let i = 0; i < ctx.ri(2, 4); i++) {
    const r = ctx.r(1.6, 2.8), h = ctx.r(4, 8);
    const x = ctx.r(-H * 0.85, H * 0.85), z = ctx.r(-H * 0.85, H * 0.85);
    ctx.group.add(cyl(P, r, r, h, 16, surf(P, 0x474f5a, 0.68, 0.66), x, h / 2, z));
    ctx.group.add(cyl(P, r * 1.06, r * 1.06, 0.2, 16, glow(P, 0xffd600, 0.8), x, h + 0.1, z, false));
    ctx.group.add(cyl(P, r * 1.02, r * 1.02, 0.14, 16, surf(P, 0x2a2f38, 0.8, 0.4), x, h * 0.55, z, false));
    if (ctx.chance(0.5)) plume(ctx, x, z, h, 7, 0xbfd8e8, 0.13);
  }

  // ── floodlight masts ────────────────────────────────────────────
  let lights = 0;
  for (let i = 0; i < 4; i++) {
    const x = (i % 2 ? 1 : -1) * H * 0.82, z = (i < 2 ? 1 : -1) * H * 0.62;
    ctx.group.add(cyl(P, 0.12, 0.18, 9, 8, surf(P, 0x262b34, 0.7, 0.6), x, 4.5, z, false));
    const head = strip(ctx, 1.5, 0.55, 0.35, 0xfff0c8, x - Math.sign(x) * 0.5, 8.9, z, 0, 1.8);
    ctx.group.add(head);
    addLightShaft(ctx, x - Math.sign(x) * 0.5, 8.8, z, 5.2, 8.7, 0xffe6a8, 0.03);
    addGlowDecal(ctx, x - Math.sign(x) * 2.5, z, 8, 0xffdc9a, 0.11, 0.02);
    if (lights < 2) { const pl = new THREE.PointLight(0xffe0a0, 45, 34, 2); pl.position.set(x, 8.6, z); ctx.group.add(pl); lights++; }
  }

  // ── ground clutter ──────────────────────────────────────────────
  for (let i = 0; i < ctx.ri(6, 10); i++) {
    staticProp(ctx, ctx.one(['crate', 'barrel', 'pallet', 'jersey', 'tank', 'fence']),
      ctx.r(-H * 0.9, H * 0.9), ctx.r(-H * 0.9, H * 0.9), 0, ctx.r(0, 6.28));
  }
  for (let i = 0; i < ctx.ri(1, 3); i++) {
    staticVehicle(ctx, ctx.one(['truck', 'van']), ctx.r(-H * 0.8, H * 0.8), ctx.r(-H * 0.8, H * 0.8), ctx.r(0, 6.28), false);
  }
  plume(ctx, ctx.r(-H * 0.6, H * 0.6), ctx.r(-H * 0.6, H * 0.6), 0.2, 5, 0xdfe9f5, 0.16);
  addHaze(ctx, 6, 0x6a6250, 18, 2, 12, 0.09);
  ctx.brief = 'INDUSTRIAL YARD · ' + stacks + ' container stacks · gantry +5.4m';
}

// ═══════════════════════════════════════════════════════════════════
// THEME 5 — NET ARCHITECTURE : abstract neon geometry in the void
// ═══════════════════════════════════════════════════════════════════
function genNetrun(ctx) {
  const H = ctx.half, P = ctx.pool;

  // The "floor" is a luminous data plane, not real ground.
  const gridTex = P.tex('netgrid', () => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#02030a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#00ffd5'; g.lineWidth = 2; g.globalAlpha = 0.40;
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8) * w;
      g.beginPath(); g.moveTo(t, 0); g.lineTo(t, h); g.stroke();
      g.beginPath(); g.moveTo(0, t); g.lineTo(w, t); g.stroke();
    }
    g.globalAlpha = 0.11; g.strokeStyle = '#7c4dff'; g.lineWidth = 1;
    for (let i = 0; i <= 32; i++) {
      const t = (i / 32) * w;
      g.beginPath(); g.moveTo(t, 0); g.lineTo(t, h); g.stroke();
      g.beginPath(); g.moveTo(0, t); g.lineTo(w, t); g.stroke();
    }
  }));
  const gt = gridTex.clone(); gt.needsUpdate = true;
  gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(ctx.M / 8, ctx.M / 8);
  ctx.disposables.push(gt);
  const floorMat = new THREE.MeshBasicMaterial({ map: gt, toneMapped: false, transparent: true, opacity: 0.55, fog: true });
  ctx.disposables.push(floorMat);
  const floor = new THREE.Mesh(P.geo('plane1', () => new THREE.PlaneGeometry(1, 1)), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.scale.set(ctx.M * 1.6, ctx.M * 1.6, 1);
  ctx.group.add(floor);
  ctx.anim.push(t => { gt.offset.set(t * 0.012, t * 0.02); });
  ctx.addPlatform(0, 0, ctx.M * 1.5, ctx.M * 1.5, 0, false);   // base pick surface

  const NET = [0x00ffd5, 0x7c4dff, 0x00e5ff, 0xff2d95, 0x69f0ae];

  // ── floating data platforms (real verticality) ──────────────────
  const levels = [3.2, 6.4, 9.6];
  const plats = [];
  for (let i = 0; i < ctx.ri(5, 8); i++) {
    const w = Math.round(ctx.r(6, 14) / 2) * 2, d = Math.round(ctx.r(6, 14) / 2) * 2;
    const x = Math.round(ctx.r(-H * 0.75, H * 0.75) / 2) * 2;
    const z = Math.round(ctx.r(-H * 0.75, H * 0.75) / 2) * 2;
    const y = ctx.one(levels);
    const col = ctx.one(NET);
    ctx.group.add(box(P, w, 0.3, d, P.mat('netslab', () => new THREE.MeshStandardMaterial({
      color: 0x0a1024, roughness: 0.3, metalness: 0.7, emissive: 0x050a18, emissiveIntensity: 1
    })), x, y, z, 0, false));
    // luminous edge frame
    ctx.group.add(strip(ctx, w + 0.16, 0.1, 0.16, col, x, y + 0.2, z - d / 2, 0, 1.5));
    ctx.group.add(strip(ctx, w + 0.16, 0.1, 0.16, col, x, y + 0.2, z + d / 2, 0, 1.5));
    ctx.group.add(strip(ctx, 0.16, 0.1, d, col, x - w / 2, y + 0.2, z, 0, 1.5));
    ctx.group.add(strip(ctx, 0.16, 0.1, d, col, x + w / 2, y + 0.2, z, 0, 1.5));
    ctx.addPlatform(x, z, w, d, y + 0.3);
    addGlowDecal(ctx, x, z, Math.max(w, d) * 0.75, col, 0.15, 0.03);
    plats.push({ x, z, y, w, d, col });
    // light column tying it to the floor
    const col2 = new THREE.Mesh(P.geo('netcol', () => {
      const g = new THREE.CylinderGeometry(0.5, 1.2, 1, 10, 1, true); g.translate(0, 0.5, 0); return g;
    }), P.mat('netcolm' + col, () => new THREE.MeshBasicMaterial({
      color: new THREE.Color(col).multiplyScalar(1.0), transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    })));
    col2.position.set(x, 0.02, z); col2.scale.set(1, y, 1);
    ctx.group.add(col2);
  }

  // ── data bridges between platforms ──────────────────────────────
  for (let i = 0; i < plats.length - 1; i++) {
    const a = plats[i], b = plats[i + 1];
    if (Math.abs(a.y - b.y) > 0.1) continue;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len > 30) continue;
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    ctx.group.add(box(P, 2.2, 0.14, len, glow(P, a.col, 0.8), mx, a.y, mz, ang, false));
    ctx.addPlatform(mx, mz, Math.abs(Math.sin(ang)) * len + 2.2, Math.abs(Math.cos(ang)) * len + 2.2, a.y + 0.14, false);
  }

  // ── data pylons ─────────────────────────────────────────────────
  for (let i = 0; i < ctx.ri(5, 9); i++) {
    const x = ctx.r(-H * 0.95, H * 0.95), z = ctx.r(-H * 0.95, H * 0.95);
    const h = ctx.r(10, 26), w = ctx.r(1.2, 2.8);
    const col = ctx.one(NET);
    ctx.group.add(box(P, w, h, w, P.mat('pylon', () => new THREE.MeshStandardMaterial({
      color: 0x070c1c, roughness: 0.25, metalness: 0.85
    })), x, h / 2, z, ctx.r(0, 1.5), false));
    const bands = [];
    for (let y = 1; y < h; y += ctx.r(1.4, 3.2)) bands.push({ p: [x, y, z], s: [w * 1.08, 0.12, w * 1.08], c: new THREE.Color(col).multiplyScalar(0.95).getHex() });
    const bm = instanced(P.geo('bandbox', () => new THREE.BoxGeometry(1, 1, 1)),
      P.mat('bandm', () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: true })), bands, false);
    if (bm) { ctx.group.add(bm); ctx.anim.push(t => { bm.position.y = (Math.sin(t * 0.6 + x) * 0.6); }); }
    ctx.group.add(strip(ctx, w * 1.15, 0.22, w * 1.15, col, x, h, z, 0, 1.6));
  }

  // ── abstract constructs (wireframe) ─────────────────────────────
  const wireMats = NET.map(c => new THREE.MeshBasicMaterial({
    color: new THREE.Color(c).multiplyScalar(0.85), wireframe: true, toneMapped: false, transparent: true, opacity: 0.7, fog: true
  }));
  wireMats.forEach(m => ctx.disposables.push(m));
  const spin = [];
  for (let i = 0; i < ctx.ri(6, 10); i++) {
    const kind = ctx.ri(0, 2);
    const geo = kind === 0 ? P.geo('ico2', () => new THREE.IcosahedronGeometry(1, 1))
      : kind === 1 ? P.geo('torus1', () => new THREE.TorusGeometry(1, 0.35, 6, 14))
        : P.geo('octa', () => new THREE.OctahedronGeometry(1, 0));
    const m = new THREE.Mesh(geo, wireMats[ctx.ri(0, wireMats.length - 1)]);
    m.position.set(ctx.r(-H, H), ctx.r(4, 22), ctx.r(-H, H));
    m.scale.setScalar(ctx.r(1.2, 4.2));
    m.userData.noBatch = true;
    ctx.group.add(m);
    spin.push({ m, sx: ctx.r(-0.3, 0.3), sy: ctx.r(-0.4, 0.4), by: m.position.y, ph: ctx.rng() * 6 });
  }
  ctx.anim.push((t, dt) => {
    for (const s of spin) {
      s.m.rotation.x += s.sx * dt; s.m.rotation.y += s.sy * dt;
      s.m.position.y = s.by + Math.sin(t * 0.4 + s.ph) * 0.9;
    }
  });

  // ── ICE : hostile red constructs ────────────────────────────────
  const iceMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1744).multiplyScalar(1.05), wireframe: true, toneMapped: false, fog: true });
  ctx.disposables.push(iceMat);
  for (let i = 0; i < ctx.ri(2, 4); i++) {
    const m = new THREE.Mesh(P.geo('tetra', () => new THREE.TetrahedronGeometry(1, 0)), iceMat);
    m.position.set(ctx.r(-H * 0.9, H * 0.9), ctx.r(2, 10), ctx.r(-H * 0.9, H * 0.9));
    m.scale.setScalar(ctx.r(1.5, 3));
    m.userData.noBatch = true;
    ctx.group.add(m);
    addGlowDecal(ctx, m.position.x, m.position.z, 4, 0xff1744, 0.18, 0.04);
    spin.push({ m, sx: 0.6, sy: 0.9, by: m.position.y, ph: ctx.rng() * 6 });
  }

  addMotes(ctx, 320, 0x00ffd5, 0.12, 0.5, ctx.M * 1.5, 26);
  addHaze(ctx, 6, 0x2a1f6a, 30, 4, 22, 0.03);
  ctx.brief = 'NET ARCHITECTURE · floating platforms +3.2 / +6.4 / +9.6m · no cover, only geometry';
}

// ═══════════════════════════════════════════════════════════════════
// THEME 6 — BADLANDS : dunes, rock, wrecks, a nomad fire
// ═══════════════════════════════════════════════════════════════════
function genBadlands(ctx) {
  const H = ctx.half, P = ctx.pool;

  // value-noise dunes
  const res = 10, grid = [];
  for (let i = 0; i <= res; i++) { grid[i] = []; for (let j = 0; j <= res; j++) grid[i][j] = ctx.rng(); }
  const smooth = t => t * t * (3 - 2 * t);
  const noise = (u, v) => {
    const x = clamp(u, 0, 0.9999) * res, z = clamp(v, 0, 0.9999) * res;
    const i = Math.floor(x), j = Math.floor(z);
    const fx = smooth(x - i), fz = smooth(z - j);
    const a = grid[i][j], b = grid[i + 1][j], c = grid[i][j + 1], d = grid[i + 1][j + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  };
  const SEG = 54, EXT = ctx.M * 1.7;
  const tg = new THREE.PlaneGeometry(EXT, EXT, SEG, SEG);
  const pos = tg.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i);
    const u = px / EXT + 0.5, v = py / EXT + 0.5;
    const edge = Math.max(Math.abs(px), Math.abs(py)) / (EXT / 2);
    const rise = Math.pow(clamp((edge - 0.45) / 0.55, 0, 1), 2) * 7;
    pos.setZ(i, (noise(u * 2.1, v * 2.1) - 0.5) * 1.5 + (noise(u * 0.8, v * 0.8) - 0.5) * 2.2 + rise);
  }
  tg.computeVertexNormals();
  const terr = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.98, metalness: 0.02 }));
  terr.rotation.x = -Math.PI / 2; terr.receiveShadow = true; terr.userData.noBatch = true;
  ctx.group.add(terr); ctx.surfaces.push(terr);
  ctx.disposables.push(tg, terr.material);

  const sampleY = (x, z) => {
    const u = x / EXT + 0.5, v = -z / EXT + 0.5;
    const edge = Math.max(Math.abs(x), Math.abs(z)) / (EXT / 2);
    const rise = Math.pow(clamp((edge - 0.45) / 0.55, 0, 1), 2) * 7;
    return (noise(u * 2.1, v * 2.1) - 0.5) * 1.5 + (noise(u * 0.8, v * 0.8) - 0.5) * 2.2 + rise;
  };

  // ── the highway ─────────────────────────────────────────────────
  const roadA = ctx.chance(0.5) ? 0 : Math.PI / 2;
  const roadOff = ctx.r(-H * 0.4, H * 0.4);
  const roadMat = surf(P, 0x1d1c1e, 0.9, 0.08);
  const segs = 26;
  for (let i = 0; i < segs; i++) {
    const t = -EXT / 2 + (EXT / segs) * (i + 0.5);
    const x = roadA ? roadOff : t, z = roadA ? t : roadOff;
    const y = sampleY(x, z);
    ctx.group.add(box(P, roadA ? 9 : EXT / segs + 0.2, 0.18, roadA ? EXT / segs + 0.2 : 9, roadMat, x, y + 0.1, z, 0, false));
  }
  const dash = [];
  for (let t = -EXT / 2; t < EXT / 2; t += 5) {
    const x = roadA ? roadOff : t + 1.4, z = roadA ? t + 1.4 : roadOff;
    dash.push({ p: [x, sampleY(x, z) + 0.21, z], r: [-Math.PI / 2, 0, roadA ? 0 : Math.PI / 2], s: [0.3, 2.6, 1] });
  }
  const dm = instanced(P.geo('plane1', () => new THREE.PlaneGeometry(1, 1)), raw(P, 0xd8c48a, 0.34), dash, false);
  if (dm) ctx.group.add(dm);

  // ── rock formations ─────────────────────────────────────────────
  const rocks = [];
  for (let i = 0; i < 90; i++) {
    const x = ctx.r(-EXT / 2, EXT / 2), z = ctx.r(-EXT / 2, EXT / 2);
    const s = ctx.r(0.3, 1.6);
    rocks.push({
      p: [x, sampleY(x, z) + s * 0.35, z], r: [ctx.r(0, 3), ctx.r(0, 3), ctx.r(0, 3)],
      s: [s * ctx.r(0.8, 1.6), s, s * ctx.r(0.8, 1.6)], c: ctx.one([0x5a4632, 0x473828, 0x6b563c])
    });
  }
  const rm = instanced(P.geo('rock', () => new THREE.IcosahedronGeometry(1, 0)), surf(P, 0xffffff, 0.97, 0.03), rocks, true);
  if (rm) { rm.geometry.computeVertexNormals(); ctx.group.add(rm); }

  // mesas — climbable high ground
  for (let i = 0; i < ctx.ri(2, 3); i++) {
    const x = ctx.r(-H * 0.85, H * 0.85), z = ctx.r(-H * 0.85, H * 0.85);
    const y0 = sampleY(x, z), h = ctx.r(3.2, 5.4), r = ctx.r(3.4, 5.6);
    const m = cyl(P, r * 0.82, r, h, 7, surf(P, 0x54402c, 0.97, 0.03), x, y0 + h / 2, z);
    m.rotation.y = ctx.r(0, 3);
    ctx.group.add(m);
    ctx.group.add(cyl(P, r * 0.84, r * 0.84, 0.12, 7, surf(P, 0x634d36, 0.96, 0.03), x, y0 + h + 0.05, z, false));
    ctx.addPlatform(x, z, r * 1.1, r * 1.1, y0 + h + 0.1);
    // a scramble route up
    for (let k = 0; k < 4; k++) {
      const a = ctx.r(0, 6.28), rr = r * (1.0 + k * 0.06);
      ctx.group.add(box(P, 1.4, 0.5, 1.4, surf(P, 0x4d3a28, 0.97, 0.03),
        x + Math.cos(a) * rr, y0 + h * (k + 1) / 5, z + Math.sin(a) * rr, ctx.r(0, 1), true));
    }
  }

  // ── wrecks + nomad camp ─────────────────────────────────────────
  for (let i = 0; i < ctx.ri(3, 5); i++) {
    const x = ctx.r(-H * 0.85, H * 0.85), z = ctx.r(-H * 0.85, H * 0.85);
    staticVehicle(ctx, ctx.one(['sedan', 'truck', 'buggy', 'van']), x, z, ctx.r(0, 6.28), true, sampleY(x, z));
  }
  const camX = ctx.r(-H * 0.5, H * 0.5), camZ = ctx.r(-H * 0.5, H * 0.5);
  const camY = sampleY(camX, camZ);
  fire(ctx, camX, camZ, camY, 1.15, false);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.28 + ctx.r(0, 1);
    const vx = camX + Math.cos(a) * 6.5, vz = camZ + Math.sin(a) * 6.5;
    staticVehicle(ctx, ctx.one(['buggy', 'truck', 'van']), vx, vz, -a + Math.PI / 2, false, sampleY(vx, vz));
  }
  // awning
  ctx.group.add(box(P, 5, 0.08, 4, surf(P, 0x6b4a2a, 0.95, 0.05), camX + 4, camY + 2.4, camZ + 2, 0.06));
  for (const [ox, oz] of [[-2.4, -1.9], [2.4, -1.9], [-2.4, 1.9], [2.4, 1.9]]) {
    ctx.group.add(cyl(P, 0.06, 0.06, 2.4, 6, surf(P, 0x3a2c1e, 0.9, 0.1), camX + 4 + ox, camY + 1.2, camZ + 2 + oz, false));
  }
  ctx.group.add(strip(ctx, 4.6, 0.05, 0.05, 0xff9100, camX + 4, camY + 2.5, camZ + 0.1, 0, 2.4));
  signBlade(ctx, camX + 4, camY + 3.4, camZ, ctx.r(0, 6.28), 'AMMO', 0xff9100, false);

  // ── scrub + poles ───────────────────────────────────────────────
  const scrub = [];
  for (let i = 0; i < 140; i++) {
    const x = ctx.r(-EXT / 2, EXT / 2), z = ctx.r(-EXT / 2, EXT / 2), s = ctx.r(0.3, 0.9);
    scrub.push({ p: [x, sampleY(x, z) + s * 0.4, z], r: [0, ctx.r(0, 3), 0], s: [s, s * ctx.r(0.7, 1.4), s], c: ctx.one([0x4d5a32, 0x3d4526, 0x5c6b3a]) });
  }
  const sm = instanced(P.geo('scrub', () => new THREE.ConeGeometry(0.7, 1.2, 5)), surf(P, 0xffffff, 0.95, 0.02), scrub, false);
  if (sm) ctx.group.add(sm);

  for (let i = 0; i < ctx.ri(3, 6); i++) {
    const x = ctx.r(-H, H), z = ctx.r(-H, H);
    const y = sampleY(x, z);
    ctx.group.add(cyl(P, 0.1, 0.14, 7, 6, surf(P, 0x4a3a2a, 0.95, 0.05), x, y + 3.5, z, false));
    ctx.group.add(box(P, 2.2, 0.12, 0.12, surf(P, 0x4a3a2a, 0.95, 0.05), x, y + 6.6, z, ctx.r(0, 3), false));
  }
  for (let i = 0; i < ctx.ri(4, 7); i++) {
    const x = ctx.r(-H * 0.9, H * 0.9), z = ctx.r(-H * 0.9, H * 0.9);
    staticProp(ctx, ctx.one(['crate', 'barrel', 'sandbags', 'rubble', 'tank']), x, z, sampleY(x, z), ctx.r(0, 6.28));
  }

  addMotes(ctx, 300, 0xd8b070, 0.2, 0.25, ctx.M * 1.6, 14);
  addHaze(ctx, 8, 0x9c6a34, 26, 1, 14, 0.1);
  ctx.brief = 'BADLANDS · open dunes · mesas +3–5m · highway · nomad camp';
}

const GENERATORS = {
  street: genStreet, corpo: genCorpo, combatzone: genCombat,
  industrial: genIndustrial, netrun: genNetrun, badlands: genBadlands
};

// ═══════════════════════════════════════════════════════════════════
// TOKEN GEOMETRY
// tokens.js is built in parallel; we import it lazily and fall back to
// our own builders so this module always renders something good.
// ═══════════════════════════════════════════════════════════════════
let TOK = null;                       // null = untried, false = absent, object = module
async function tokensModule() {
  if (TOK !== null) return TOK;
  try {
    const m = await import('./tokens.js');
    TOK = (m && typeof m.buildCharacterToken === 'function') ? m : false;
  } catch (e) { TOK = false; }
  return TOK;
}
function tokKinds(which, fallback) {
  try {
    const v = TOK && TOK[which];
    if (Array.isArray(v) && v.length) return v;
    if (v && typeof v === 'object') return Object.keys(v);
  } catch (e) { /* ignore */ }
  return fallback;
}

const SKIN = [0xE8B48C, 0xC98A5E, 0x8D5524, 0xF1D0B4, 0x6b4227, 0xa9714b];
const JACKET = [0x1b2a4a, 0x3a1030, 0x14323a, 0x40200a, 0x2b2b38, 0x0d3b2e, 0x4a1420, 0x232a3a];

// ── Humanoid ───────────────────────────────────────────────────────
function fallbackCharacter(pool, char) {
  const rng = seededRandom((char.name || 'runner') + '|' + (char.handle || '') + '|' + (char.role || ''));
  const pick = a => a[Math.min(a.length - 1, Math.floor(rng() * a.length))];
  const g = new THREE.Group();
  const skin = surf(pool, pick(SKIN), 0.7, 0.05);
  const jc = pick(JACKET);
  const jacket = surf(pool, jc, 0.62, 0.28);
  const pants = surf(pool, 0x14161d, 0.8, 0.15);
  const boots = surf(pool, 0x0c0d12, 0.7, 0.3);
  const accent = char.isNPC ? 0xff1744 : 0x00e5ff;

  // legs
  for (const s of [-1, 1]) {
    g.add(cyl(pool, 0.105, 0.09, 0.72, 8, pants, s * 0.135, 0.42, 0, true));
    g.add(box(pool, 0.2, 0.12, 0.34, boots, s * 0.135, 0.06, 0.04, 0, false));
  }
  // torso
  const torso = new THREE.Mesh(pool.geo('capsule1', () => new THREE.CapsuleGeometry(0.235, 0.4, 4, 10)), jacket);
  torso.position.set(0, 1.08, 0); torso.castShadow = true;
  g.add(torso);
  g.add(box(pool, 0.6, 0.17, 0.3, jacket, 0, 1.4, 0, 0, true));
  // long coat on some
  if (rng() < 0.45) {
    const coat = new THREE.Mesh(pool.geo('coat', () => new THREE.CylinderGeometry(0.29, 0.44, 0.62, 10, 1, true)), jacket);
    coat.position.set(0, 0.84, 0); coat.material.side = THREE.DoubleSide;
    g.add(coat);
  }
  // arms
  for (const s of [-1, 1]) {
    const a = cyl(pool, 0.075, 0.065, 0.62, 7, rng() < 0.3 ? surf(pool, 0x8f97a3, 0.35, 0.9) : jacket, s * 0.315, 1.1, 0, false);
    a.rotation.z = s * 0.13;
    g.add(a);
  }
  // head + hair + optics
  const head = new THREE.Mesh(pool.geo('head', () => new THREE.SphereGeometry(0.145, 12, 10)), skin);
  head.position.set(0, 1.62, 0); head.castShadow = true;
  g.add(head);
  g.add(box(pool, 0.28, 0.11, 0.28, surf(pool, pick([0x101014, 0x2a1a10, 0x5a2a6a, 0x8a1f3a]), 0.75, 0.1), 0, 1.71, -0.01, 0, false));
  g.add(strip({ pool }, 0.2, 0.045, 0.05, accent, 0, 1.64, 0.13, 0, 3.2));      // optics visor
  // chrome arm / weapon silhouette
  if (rng() < 0.55) {
    const wpn = box(pool, 0.07, 0.07, 0.72, surf(pool, 0x2a2e36, 0.45, 0.85), 0.3, 1.02, 0.28, 0, false);
    wpn.rotation.x = -0.25; g.add(wpn);
    g.add(strip({ pool }, 0.05, 0.05, 0.06, 0xff9100, 0.3, 1.06, 0.62, 0, 3));
  }
  g.userData.tall = 1.8;
  return g;
}

// ── Vehicles ───────────────────────────────────────────────────────
const VEH_BODY = [0x1c2230, 0x3a1020, 0x0f2a2c, 0x2b2b34, 0x4a3010, 0x102040];
function fallbackVehicle(pool, kind, opts) {
  const o = opts || {};
  const rng = seededRandom(kind + (o.seed || ''));
  const burnt = !!o.burnt;
  const g = new THREE.Group();
  const bodyCol = burnt ? 0x14100e : (o.color !== undefined ? o.color : VEH_BODY[Math.floor(rng() * VEH_BODY.length)]);
  const body = surf(pool, bodyCol, burnt ? 0.98 : 0.42, burnt ? 0.1 : 0.72);
  const glass = pool.mat('vglass', () => new THREE.MeshStandardMaterial({
    color: 0x0a1a22, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.75
  }));
  const tyre = surf(pool, 0x0c0d10, 0.95, 0.05);
  const wheel = (x, z, r) => {
    const w = cyl(pool, r, r, 0.28, 12, tyre, x, r, z, true);
    w.rotation.z = Math.PI / 2;
    if (burnt && rng() < 0.4) return null;
    return w;
  };
  const add = m => { if (m) g.add(m); };

  if (kind === 'bike') {
    add(wheel(0, -0.75, 0.36)); add(wheel(0, 0.75, 0.36));
    add(box(pool, 0.34, 0.34, 1.5, body, 0, 0.62, 0));
    add(box(pool, 0.3, 0.2, 0.5, surf(pool, 0x1a1d24, 0.5, 0.8), 0, 0.86, -0.5));
    if (!burnt) { add(strip({ pool }, 0.26, 0.08, 0.06, 0x00e5ff, 0, 0.86, -0.78, 0, 3.4)); add(strip({ pool }, 0.22, 0.06, 0.05, 0xff1744, 0, 0.7, 0.78, 0, 3)); }
  } else if (kind === 'av') {
    add(box(pool, 1.9, 0.85, 5.2, body, 0, 1.3, 0));
    add(box(pool, 1.5, 0.55, 1.8, glass, 0, 1.75, -1.5));
    for (const s of [-1, 1]) {
      add(box(pool, 2.2, 0.18, 1.5, body, s * 1.9, 1.35, 0.4, s * 0.06));
      const n = cyl(pool, 0.42, 0.42, 1.2, 12, surf(pool, 0x2a3038, 0.4, 0.85), s * 2.7, 1.35, 0.4);
      n.rotation.x = Math.PI / 2; add(n);
      if (!burnt) add(strip({ pool }, 0.7, 0.7, 0.1, 0x00e5ff, s * 2.7, 1.35, 1.02, 0, 3.4));
    }
    if (!burnt) { add(strip({ pool }, 1.2, 0.1, 0.1, 0xffd600, 0, 1.0, -2.5, 0, 3)); }
  } else if (kind === 'buggy') {
    add(wheel(-1.0, -1.35, 0.55)); add(wheel(1.0, -1.35, 0.55));
    add(wheel(-1.0, 1.35, 0.55)); add(wheel(1.0, 1.35, 0.55));
    add(box(pool, 1.9, 0.4, 3.6, body, 0, 0.72, 0));
    // roll cage
    const bar = surf(pool, 0x3a4048, 0.5, 0.8);
    for (const s of [-1, 1]) {
      add(box(pool, 0.09, 1.1, 0.09, bar, s * 0.85, 1.45, -0.5));
      add(box(pool, 0.09, 1.1, 0.09, bar, s * 0.85, 1.45, 1.0));
      add(box(pool, 0.09, 0.09, 1.6, bar, s * 0.85, 1.98, 0.25));
    }
    add(box(pool, 1.8, 0.09, 0.09, bar, 0, 1.98, -0.5));
    add(box(pool, 1.8, 0.09, 0.09, bar, 0, 1.98, 1.0));
    if (!burnt) { add(strip({ pool }, 1.5, 0.12, 0.08, 0xffd600, 0, 1.0, -1.85, 0, 3.2)); }
  } else if (kind === 'truck') {
    add(wheel(-1.05, -2.2, 0.55)); add(wheel(1.05, -2.2, 0.55));
    add(wheel(-1.05, 1.9, 0.6)); add(wheel(1.05, 1.9, 0.6));
    add(box(pool, 2.3, 1.5, 2.2, body, 0, 1.35, -1.9));
    add(box(pool, 2.1, 0.7, 0.2, glass, 0, 1.75, -2.95));
    add(box(pool, 2.4, 1.9, 5.0, surf(pool, burnt ? 0x151210 : 0x2c313c, 0.8, 0.4), 0, 1.6, 1.2));
    if (!burnt) { add(strip({ pool }, 2.0, 0.12, 0.1, 0xffd600, 0, 0.9, -3.02, 0, 3.2)); add(strip({ pool }, 2.2, 0.06, 0.06, 0xff9100, 0, 2.55, 1.2, 0, 2.4)); }
  } else if (kind === 'van') {
    add(wheel(-0.95, -1.5, 0.42)); add(wheel(0.95, -1.5, 0.42));
    add(wheel(-0.95, 1.5, 0.42)); add(wheel(0.95, 1.5, 0.42));
    add(box(pool, 2.1, 1.7, 4.8, body, 0, 1.2, 0));
    add(box(pool, 1.9, 0.7, 0.2, glass, 0, 1.55, -2.42));
    add(box(pool, 0.2, 0.7, 1.4, glass, -1.06, 1.55, -1.2));
    add(box(pool, 0.2, 0.7, 1.4, glass, 1.06, 1.55, -1.2));
    if (!burnt) { add(strip({ pool }, 1.7, 0.12, 0.08, 0xdff2ff, 0, 0.72, -2.45, 0, 3.2)); add(strip({ pool }, 1.7, 0.1, 0.08, 0xff1744, 0, 1.5, 2.42, 0, 3)); }
  } else {  // sedan
    add(wheel(-0.85, -1.35, 0.36)); add(wheel(0.85, -1.35, 0.36));
    add(wheel(-0.85, 1.35, 0.36)); add(wheel(0.85, 1.35, 0.36));
    add(box(pool, 1.9, 0.62, 4.3, body, 0, 0.68, 0));
    add(box(pool, 1.72, 0.55, 2.1, glass, 0, 1.18, 0.1));
    add(box(pool, 1.8, 0.16, 2.3, body, 0, 1.44, 0.15));
    if (!burnt) {
      add(strip({ pool }, 1.5, 0.1, 0.06, 0xdff2ff, 0, 0.72, -2.17, 0, 3.4));
      add(strip({ pool }, 1.5, 0.09, 0.06, 0xff1744, 0, 0.78, 2.17, 0, 3.0));
    }
  }
  if (burnt) {
    g.rotation.z = (rng() - 0.5) * 0.16;
    g.rotation.x = (rng() - 0.5) * 0.1;
  }
  return g;
}

// ── Props ──────────────────────────────────────────────────────────
function fallbackProp(pool, kind, opts) {
  const o = opts || {};
  const rng = seededRandom(kind + (o.seed || ''));
  const g = new THREE.Group();
  const P = pool;
  const metal = surf(P, 0x333a45, 0.55, 0.75);
  const dark = surf(P, 0x1a1d25, 0.8, 0.35);
  const s = { pool: P };

  switch (kind) {
    case 'barrel': {
      g.add(cyl(P, 0.36, 0.36, 1.0, 14, surf(P, [0x2a4a3a, 0x4a2a20, 0x2a3a5a][Math.floor(rng() * 3)], 0.6, 0.6), 0, 0.5, 0));
      g.add(cyl(P, 0.38, 0.38, 0.06, 14, metal, 0, 0.28, 0, false));
      g.add(cyl(P, 0.38, 0.38, 0.06, 14, metal, 0, 0.74, 0, false));
      g.add(strip(s, 0.05, 0.05, 0.05, 0xffd600, 0.36, 0.86, 0, 0, 2));
      break;
    }
    case 'crate': {
      g.add(box(P, 1.2, 1.0, 1.2, surf(P, 0x3b3126, 0.85, 0.2), 0, 0.5, 0));
      g.add(box(P, 1.26, 0.08, 0.1, metal, 0, 0.94, 0, 0, false));
      g.add(strip(s, 0.5, 0.06, 0.06, 0x69f0ae, 0, 0.2, 0.61, 0, 2.2));
      break;
    }
    case 'pallet': {
      g.add(box(P, 1.4, 0.1, 1.2, surf(P, 0x4a3a26, 0.95, 0.05), 0, 0.05, 0));
      for (let i = -1; i <= 1; i++) g.add(box(P, 1.4, 0.12, 0.16, surf(P, 0x3a2c1c, 0.95, 0.05), 0, 0.16, i * 0.45, 0, false));
      g.add(box(P, 1.4, 0.08, 1.2, surf(P, 0x4a3a26, 0.95, 0.05), 0, 0.26, 0));
      break;
    }
    case 'dumpster': {
      g.add(box(P, 2.0, 1.05, 1.15, surf(P, 0x2a4436, 0.8, 0.4), 0, 0.6, 0));
      const lid = box(P, 2.05, 0.1, 1.2, surf(P, 0x1e3327, 0.8, 0.4), 0, 1.16, -0.05, 0, false);
      lid.rotation.x = -0.14; g.add(lid);
      g.add(strip(s, 1.4, 0.05, 0.05, 0xff2d95, 0, 0.9, 0.58, 0, 2));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(P, 0.09, 0.09, 0.08, 8, dark, sx * 0.85, 0.08, sz * 0.45, false));
      break;
    }
    case 'jersey': {
      g.add(box(P, 2.4, 0.55, 0.72, surf(P, 0x53565e, 0.95, 0.05), 0, 0.28, 0));
      g.add(box(P, 2.4, 0.5, 0.38, surf(P, 0x5b5e66, 0.95, 0.05), 0, 0.78, 0));
      g.add(strip(s, 0.5, 0.14, 0.05, 0xffd600, -0.7, 0.78, 0.2, 0, 2.2));
      g.add(strip(s, 0.5, 0.14, 0.05, 0xffd600, 0.7, 0.78, 0.2, 0, 2.2));
      break;
    }
    case 'sandbags': {
      const bags = [];
      for (let row = 0; row < 3; row++) {
        const n = 5 - row;
        for (let i = 0; i < n; i++) {
          bags.push({
            p: [(i - (n - 1) / 2) * 0.52 + (row % 2 ? 0.13 : 0), 0.17 + row * 0.3, (rng() - 0.5) * 0.1],
            r: [0, (rng() - 0.5) * 0.3, 0], s: [0.28, 0.16, 0.2], c: [0x5a5240, 0x4b4536, 0x655c48][Math.floor(rng() * 3)]
          });
        }
      }
      const im = instanced(P.geo('bag', () => new THREE.SphereGeometry(1, 7, 5)), surf(P, 0xffffff, 0.95, 0.05), bags, true);
      if (im) g.add(im);
      break;
    }
    case 'barricade': {
      for (const sx of [-1, 1]) {
        const leg = box(P, 0.08, 1.0, 0.08, metal, sx * 0.55, 0.5, 0, 0, false);
        leg.rotation.x = sx * 0.22; g.add(leg);
      }
      g.add(box(P, 1.4, 0.24, 0.08, surf(P, 0xd8d2c4, 0.9, 0.05), 0, 0.85, 0));
      g.add(strip(s, 1.42, 0.1, 0.05, 0xff9100, 0, 0.85, 0.05, 0, 2.4));
      g.add(box(P, 1.4, 0.2, 0.08, surf(P, 0xd8d2c4, 0.9, 0.05), 0, 0.5, 0));
      break;
    }
    case 'terminal': {
      g.add(box(P, 0.7, 1.35, 0.42, surf(P, 0x1d222c, 0.5, 0.75), 0, 0.68, 0));
      const scr = box(P, 0.56, 0.66, 0.05, glow(P, 0x00e5ff, 2.8), 0, 1.05, 0.22, 0, false);
      scr.rotation.x = -0.22; g.add(scr);
      g.add(strip(s, 0.6, 0.04, 0.04, 0x00e5ff, 0, 0.16, 0.22, 0, 2.4));
      break;
    }
    case 'desk': {
      g.add(box(P, 1.8, 0.08, 0.9, surf(P, 0x24282f, 0.4, 0.6), 0, 0.74, 0));
      for (const sx of [-1, 1]) g.add(box(P, 0.08, 0.72, 0.8, dark, sx * 0.82, 0.37, 0, 0, false));
      g.add(box(P, 0.7, 0.44, 0.05, surf(P, 0x101318, 0.3, 0.7), 0, 1.02, -0.22, 0, false));
      g.add(strip(s, 0.64, 0.38, 0.02, 0x00e5ff, 0, 1.02, -0.19, 0, 1.6));
      g.add(box(P, 0.44, 0.05, 0.2, dark, 0, 0.79, 0.16, 0, false));
      break;
    }
    case 'server': {
      g.add(box(P, 0.9, 2.0, 1.0, surf(P, 0x15181f, 0.5, 0.7), 0, 1.0, 0));
      const leds = [];
      for (let i = 0; i < 9; i++) leds.push({ p: [0, 0.22 + i * 0.2, 0.52], s: [0.62, 0.05, 0.03], c: [0x00e5ff, 0x69f0ae, 0xffd600][i % 3] });
      const im = instanced(P.geo('bandbox', () => new THREE.BoxGeometry(1, 1, 1)),
        P.mat('bandm', () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: true })), leds, false);
      if (im) g.add(im);
      break;
    }
    case 'planter': {
      g.add(box(P, 1.0, 0.55, 1.0, surf(P, 0x2b2f36, 0.85, 0.2), 0, 0.28, 0));
      for (let i = 0; i < 4; i++) {
        const c = cyl(P, 0.02, 0.16, 0.9 + rng() * 0.5, 6, surf(P, 0x2c5a34, 0.9, 0.05), (rng() - 0.5) * 0.5, 0.95, (rng() - 0.5) * 0.5, false);
        c.rotation.z = (rng() - 0.5) * 0.4; g.add(c);
      }
      break;
    }
    case 'fence': {
      const fm = P.mat('chain', () => new THREE.MeshBasicMaterial({ color: 0x6b7480, wireframe: true, transparent: true, opacity: 0.45, fog: true }));
      const p = new THREE.Mesh(P.geo('chainpanel', () => new THREE.PlaneGeometry(3, 2.4, 6, 5)), fm);
      p.position.y = 1.2; g.add(p);
      g.add(box(P, 0.08, 2.6, 0.08, metal, -1.5, 1.3, 0, 0, false));
      g.add(box(P, 0.08, 2.6, 0.08, metal, 1.5, 1.3, 0, 0, false));
      break;
    }
    case 'streetlamp': {
      g.add(cyl(P, 0.09, 0.12, 5.0, 8, surf(P, 0x1a1e28, 0.6, 0.7), 0, 2.5, 0, false));
      g.add(box(P, 1.4, 0.1, 0.1, surf(P, 0x1a1e28, 0.6, 0.7), 0.7, 4.95, 0, 0, false));
      g.add(strip(s, 1.0, 0.14, 0.32, 0xbfe9ff, 1.3, 4.85, 0, 0, 3.2));
      break;
    }
    case 'sign': {
      g.add(cyl(P, 0.06, 0.06, 2.6, 6, metal, 0, 1.3, 0, false));
      const word = SIGN_WORDS[Math.floor(rng() * SIGN_WORDS.length)];
      const col = NEONS[Math.floor(rng() * NEONS.length)];
      const tex = signTexture(P, word, col, false);
      const face = new THREE.Mesh(P.geo('plane1', () => new THREE.PlaneGeometry(1, 1)), texMat(P, 'sm' + word + col + 'false', tex, 1.9, false));
      face.scale.set(1.9, 0.62, 1); face.position.y = 2.5; g.add(face);
      break;
    }
    case 'tank': {
      const t = cyl(P, 0.6, 0.6, 2.6, 14, surf(P, 0x50585f, 0.6, 0.7), 0, 0.85, 0);
      t.rotation.z = Math.PI / 2; g.add(t);
      for (const sz of [-0.9, 0.9]) g.add(box(P, 0.3, 0.5, 0.9, surf(P, 0x2a2f38, 0.8, 0.4), 0, 0.25, sz, 0, false));
      g.add(strip(s, 1.6, 0.08, 0.08, 0xff9100, 0, 1.4, 0, 0, 2.2));
      break;
    }
    case 'rubble':
    default: {
      const chunks = [];
      for (let i = 0; i < 7; i++) {
        const sc = 0.2 + rng() * 0.5;
        chunks.push({
          p: [(rng() - 0.5) * 1.6, sc * 0.4, (rng() - 0.5) * 1.6],
          r: [rng() * 3, rng() * 3, rng() * 3], s: [sc, sc * 0.7, sc],
          c: [0x39332c, 0x2b2620, 0x4a423a][Math.floor(rng() * 3)]
        });
      }
      const im = instanced(P.geo('chunk', () => new THREE.IcosahedronGeometry(1, 0)), surf(P, 0xffffff, 0.95, 0.05), chunks, true);
      if (im) g.add(im);
      break;
    }
  }
  return g;
}

// Map-dressing helpers used by the generators (hoisted function decls).
function staticProp(ctx, kind, x, z, y, ry) {
  const g = fallbackProp(ctx.pool, kind, { seed: ctx.seed + kind + x.toFixed(1) + z.toFixed(1) });
  g.position.set(x, y || 0, z); g.rotation.y = ry || 0;
  ctx.group.add(g);
  return g;
}
function staticVehicle(ctx, kind, x, z, ry, burnt, y) {
  const g = fallbackVehicle(ctx.pool, kind, { burnt, seed: ctx.seed + kind + x.toFixed(1) });
  g.position.set(x, y || 0, z); g.rotation.y = (ry || 0) + g.rotation.y;
  ctx.group.add(g);
  if (burnt && ctx.rng() < 0.5) plume(ctx, x, z, (y || 0) + 1.2, 5, 0x3a3a3a, 0.1);
  return g;
}

// ═══════════════════════════════════════════════════════════════════
// CONTROL PANEL STYLING
// ═══════════════════════════════════════════════════════════════════
const CSS = `
#e3-ui, #e3-ui * { box-sizing:border-box; }
#e3-ui { position:absolute; inset:0; pointer-events:none; font-family:'Share Tech Mono',monospace;
  color:#e0e0f0; font-size:11px; z-index:5; }
#e3-ui button, #e3-ui select, #e3-ui input { font-family:inherit; }
.e3-pane { position:absolute; background:rgba(14,15,26,.9); border:1px solid #2a2a45;
  border-radius:6px; pointer-events:auto; backdrop-filter:blur(9px); box-shadow:0 10px 34px rgba(0,0,0,.55); }
.e3-left { left:10px; top:10px; bottom:10px; width:286px; display:flex; flex-direction:column; }
.e3-left.collapsed { bottom:auto; height:34px; overflow:hidden; }
.e3-hd { display:flex; align-items:center; gap:6px; padding:8px 10px; border-bottom:1px solid #2a2a45;
  font-family:'Orbitron',monospace; font-size:9px; letter-spacing:2px; color:#00e5ff; flex-shrink:0; }
.e3-hd .e3-x { margin-left:auto; cursor:pointer; color:#666; padding:0 4px; }
.e3-hd .e3-x:hover { color:#00e5ff; }
.e3-body { overflow-y:auto; overflow-x:hidden; flex:1; padding:8px 10px 12px; }
.e3-body::-webkit-scrollbar { width:5px; } .e3-body::-webkit-scrollbar-thumb { background:#2a2a45; border-radius:3px; }
.e3-sec { margin-top:10px; }
.e3-sec:first-child { margin-top:2px; }
.e3-lab { font-family:'Orbitron',monospace; font-size:7.5px; letter-spacing:2px; color:#5a6070;
  text-transform:uppercase; margin-bottom:5px; display:flex; align-items:center; gap:6px; }
.e3-lab:after { content:''; flex:1; height:1px; background:linear-gradient(90deg,#2a2a45,transparent); }
.e3-row { display:flex; gap:5px; margin-bottom:5px; align-items:center; }
.e3-sel, .e3-in { flex:1; min-width:0; background:#0e0f1a; border:1px solid #2a2a45; color:#cfd6e6;
  border-radius:3px; padding:5px 6px; font-size:10.5px; outline:none; }
.e3-sel:focus, .e3-in:focus { border-color:#00e5ff; }
.e3-b { background:transparent; border:1px solid #2a2a45; color:#8a90a0; border-radius:3px;
  padding:5px 8px; font-size:8px; font-family:'Orbitron',monospace; letter-spacing:1.4px; text-transform:uppercase;
  cursor:pointer; transition:.13s; white-space:nowrap; }
.e3-b:hover { color:#00e5ff; border-color:#00e5ff; background:rgba(0,229,255,.07); }
.e3-b.on { color:#0a0a14; background:#00e5ff; border-color:#00e5ff; }
.e3-b.gold { color:#ffd600; border-color:rgba(255,214,0,.45); }
.e3-b.gold:hover { background:rgba(255,214,0,.14); }
.e3-b.gold.on { background:#ffd600; color:#0a0a14; }
.e3-b.red { color:#ff1744; border-color:rgba(255,23,68,.45); }
.e3-b.red:hover { background:rgba(255,23,68,.16); }
.e3-b.wide { flex:1; text-align:center; }
.e3-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px; }
.e3-grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px; }
.e3-list { max-height:216px; overflow-y:auto; border:1px solid #22243a; border-radius:4px; background:#0b0c15; }
.e3-list::-webkit-scrollbar { width:5px; } .e3-list::-webkit-scrollbar-thumb { background:#2a2a45; }
.e3-it { display:flex; align-items:center; gap:6px; padding:5px 7px; cursor:pointer; border-bottom:1px solid #16182a; }
.e3-it:last-child { border-bottom:none; }
.e3-it:hover { background:rgba(0,229,255,.08); }
.e3-it.armed { background:rgba(0,229,255,.16); box-shadow:inset 2px 0 0 #00e5ff; }
.e3-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; box-shadow:0 0 7px currentColor; background:currentColor; }
.e3-nm { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; color:#cfd6e6; }
.e3-mt { font-size:9px; color:#5f6678; white-space:nowrap; }
.e3-hint { color:#565c6e; font-size:9.5px; line-height:1.6; }
.e3-kbd { display:inline-block; border:1px solid #2a2a45; border-radius:3px; padding:0 4px; color:#8a90a0; font-size:9px; }

.e3-right { right:10px; top:10px; width:206px; max-height:calc(100% - 92px); display:flex; flex-direction:column; }
.e3-init { overflow-y:auto; }
.e3-init::-webkit-scrollbar { width:5px; } .e3-init::-webkit-scrollbar-thumb { background:#2a2a45; }
.e3-ir { display:flex; align-items:center; gap:6px; padding:5px 8px; border-bottom:1px solid #16182a; cursor:pointer; }
.e3-ir:hover { background:rgba(0,229,255,.07); }
.e3-ir.act { background:rgba(255,214,0,.14); box-shadow:inset 2px 0 0 #ffd600; }
.e3-iv { width:26px; text-align:center; color:#ffd600; font-size:12px; }
.e3-hpbar { height:3px; background:#22243a; border-radius:2px; overflow:hidden; margin-top:2px; }
.e3-hpf { height:100%; border-radius:2px; }

.e3-top { left:50%; transform:translateX(-50%); top:10px; padding:7px 16px; text-align:center; max-width:46%; }
.e3-title { font-family:'Orbitron',monospace; font-size:11px; letter-spacing:2.5px; color:#00e5ff;
  text-shadow:0 0 12px rgba(0,229,255,.55); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.e3-subtitle { font-size:9.5px; color:#6b7285; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

.e3-hud { left:50%; transform:translateX(-50%); bottom:10px; padding:7px 14px; display:flex; gap:14px; align-items:center; }
.e3-hud b { color:#ffd600; font-weight:400; }
.e3-hud .e3-sep { width:1px; height:14px; background:#2a2a45; }

.e3-insp { right:10px; bottom:10px; width:236px; padding:9px 10px; display:none; }
.e3-insp.show { display:block; }
.e3-ititle { font-family:'Orbitron',monospace; font-size:9px; letter-spacing:1.6px; color:#ffd600; margin-bottom:7px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.e3-sw { display:flex; gap:3px; margin:5px 0; }
.e3-swb { width:15px; height:15px; border-radius:3px; border:1px solid rgba(255,255,255,.18); cursor:pointer; }
.e3-swb:hover { transform:scale(1.16); }
.e3-toast { position:absolute; left:50%; transform:translateX(-50%); top:64px; padding:6px 14px; border-radius:4px;
  background:rgba(0,229,255,.16); border:1px solid #00e5ff; color:#00e5ff; font-size:10px; letter-spacing:1px;
  opacity:0; transition:opacity .25s; pointer-events:none; }
.e3-toast.show { opacity:1; }
`;

// ═══════════════════════════════════════════════════════════════════
// LABEL SPRITE
// ═══════════════════════════════════════════════════════════════════
function labelCanvas(name, hp, maxHp, colorHex, init) {
  const W = 256, H = 78;
  return canvasTex(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    const hex = '#' + new THREE.Color(colorHex).getHexString();
    const showHp = maxHp > 0;
    const bh = showHp ? 54 : 36;
    g.fillStyle = 'rgba(8,10,20,.82)';
    g.strokeStyle = hex; g.lineWidth = 2;
    const r = 8, x0 = 6, y0 = 8, w = W - 12, h = bh;
    g.beginPath();
    g.moveTo(x0 + r, y0); g.lineTo(x0 + w - r, y0); g.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    g.lineTo(x0 + w, y0 + h - r); g.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    g.lineTo(x0 + r, y0 + h); g.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    g.lineTo(x0, y0 + r); g.quadraticCurveTo(x0, y0, x0 + r, y0);
    g.closePath(); g.fill(); g.stroke();
    let tx = W / 2, left = x0 + 10;
    if (init !== null && init !== undefined && init !== '') {
      g.fillStyle = '#ffd600'; g.font = '700 24px "Share Tech Mono", monospace';
      g.textAlign = 'left'; g.fillText(String(init), left, y0 + 24);
      left += 30;
      g.fillStyle = 'rgba(255,214,0,.4)'; g.fillRect(left - 8, y0 + 6, 1, 22);
    }
    g.fillStyle = '#e6ecf7'; g.textAlign = 'left';
    let fs = 23, txt = String(name || '').slice(0, 18);
    g.font = `400 ${fs}px "Share Tech Mono", monospace`;
    while (g.measureText(txt).width > w - (left - x0) - 14 && fs > 12) {
      fs -= 1; g.font = `400 ${fs}px "Share Tech Mono", monospace`;
    }
    g.fillText(txt, left, y0 + 24);
    if (showHp) {
      const bw = w - 20, bx = x0 + 10, by = y0 + 34;
      const frac = clamp(hp / maxHp, 0, 1);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(bx, by, bw, 9);
      g.fillStyle = frac > 0.5 ? '#69f0ae' : frac > 0.25 ? '#ffd600' : '#ff1744';
      g.fillRect(bx, by, bw * frac, 9);
      g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '400 13px "Share Tech Mono", monospace';
      g.textAlign = 'right'; g.fillText(hp + '/' + maxHp, bx + bw - 2, by + 22);
      if (frac <= 0.5) {
        g.fillStyle = '#ff1744'; g.textAlign = 'left';
        g.fillText(frac <= 0 ? 'DEAD' : 'SERIOUSLY WOUNDED', bx, by + 22);
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// MOUNT
// ═══════════════════════════════════════════════════════════════════
export async function mount(container, ctx0) {
  const pool = makePool();
  const DISTRICTS = districts() || [];

  const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch (e) { return {}; } })();
  const S = {
    districtIdx: Math.min(DISTRICTS.length - 1, Math.max(0, prefs.districtIdx | 0)),
    theme: THEMES[prefs.theme] ? prefs.theme : 'street',
    size: SIZES[prefs.size] ? prefs.size : 'medium',
    seed: prefs.seed || (Date.now() % 100000),
    grid: prefs.grid !== false,
    snap: prefs.snap !== false,
    detail: prefs.detail === 'fast' ? 'fast' : 'hd',
    detailNagged: false,
    rings: !!prefs.rings,
    measuring: false,
    name: '',
    round: 1, turn: 0
  };
  const savePrefs = () => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        districtIdx: S.districtIdx, theme: S.theme, size: S.size, seed: S.seed,
        grid: S.grid, snap: S.snap, rings: S.rings, detail: S.detail
      }));
    } catch (e) { /* ignore */ }
  };

  // Bloom radius 0.6 smears wide-area glow across the whole frame once a map
  // carries hundreds of emitters, so we tighten it and scale strength per theme.
  const EXPOSURE = { street: 0.6, corpo: 1.05, combatzone: 1.5, industrial: 1.05, netrun: 0.95, badlands: 1.12 };
  const BLOOM_MUL = { street: 0.5, corpo: 0.75, combatzone: 0.9, industrial: 0.78, netrun: 0.45, badlands: 1.0 };
  const stage = createStage(container, {
    theme: THEMES[S.theme], fov: 48,
    cameraPos: [0, SIZES[S.size].m * 0.78, SIZES[S.size].m * 0.9], target: [0, 0, 0],
    exposure: EXPOSURE[S.theme]
  });
  const { scene, camera, renderer, controls } = stage;
  stage.bloom.radius = 0.34;
  stage.bloom.threshold = 0.9;
  // Nothing but tokens ever moves, so the shadow map is refreshed on demand
  // instead of every frame — it is the single biggest cost we control.
  renderer.shadowMap.autoUpdate = false;
  const shadowDirty = () => { renderer.shadowMap.needsUpdate = true; };
  function applyTheme(key) {
    stage.setTheme(THEMES[key]);
    stage.bloom.strength = (THEMES[key].bloom ?? 0.8) * (BLOOM_MUL[key] ?? 1);
    renderer.toneMappingExposure = EXPOSURE[key] ?? 1;
  }
  applyTheme(S.theme);

  // ── layers ───────────────────────────────────────────────────────
  const tokenLayer = new THREE.Group(); scene.add(tokenLayer);
  const fxLayer = new THREE.Group(); scene.add(fxLayer);
  let mapCtx = null, gridGroup = null;

  // reusable selection / turn markers
  const selRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.05, 8, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd600).multiplyScalar(2.2), toneMapped: false, transparent: true, opacity: 0.95 })
  );
  selRing.rotation.x = -Math.PI / 2; selRing.visible = false; selRing.renderOrder = 3;
  fxLayer.add(selRing);
  const turnRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.035, 6, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00e5ff).multiplyScalar(2.4), toneMapped: false, transparent: true, opacity: 0.9 })
  );
  turnRing.rotation.x = -Math.PI / 2; turnRing.visible = false; turnRing.renderOrder = 3;
  fxLayer.add(turnRing);

  // range bands around the selected token
  const rangeRings = new THREE.Group(); rangeRings.visible = false; fxLayer.add(rangeRings);
  [[6, 0x69f0ae], [12, 0x00e5ff], [25, 0xffd600], [50, 0xff9100]].forEach(([r, c]) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r + 0.06, 96),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.5), toneMapped: false, transparent: true, opacity: 0.42, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 3;
    rangeRings.add(m);
  });

  // measure line
  const measure = { a: null, b: null, live: false };
  const mLine = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd600).multiplyScalar(2.6), toneMapped: false }));
  mLine.visible = false; mLine.renderOrder = 4; fxLayer.add(mLine);
  const mCapGeo = new THREE.TorusGeometry(0.42, 0.05, 6, 24);
  const mCapMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd600).multiplyScalar(2.2), toneMapped: false });
  const mCapA = new THREE.Mesh(mCapGeo, mCapMat), mCapB = new THREE.Mesh(mCapGeo, mCapMat);
  mCapA.rotation.x = mCapB.rotation.x = -Math.PI / 2;
  mCapA.visible = mCapB.visible = false; fxLayer.add(mCapA); fxLayer.add(mCapB);

  // ── token model ──────────────────────────────────────────────────
  const tokens = [];
  const animTokens = [];          // tokens.js groups with their own animators
  let selected = null, armed = null, dragging = null;
  const ringGeo = new THREE.TorusGeometry(0.6, 0.052, 8, 32);
  const discGeo = new THREE.CircleGeometry(0.62, 32);
  const wedgeGeo = new THREE.ConeGeometry(0.15, 0.32, 3);
  [ringGeo, discGeo, wedgeGeo].forEach(g => { g.__pooled = true; });
  const discTex = softDisc(pool, 'tokendisc', 0.0, [[0, 'rgba(255,255,255,.10)'], [0.62, 'rgba(255,255,255,.34)'], [0.93, 'rgba(255,255,255,.95)'], [1, 'rgba(255,255,255,0)']]);

  function releaseGroup(g) {
    g.traverse(o => {
      if (o.geometry && !o.geometry.__pooled) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of ms) {
        if (!m || m.__pooled) continue;
        if (m.map && !m.map.__pooled) m.map.dispose();
        m.dispose();
      }
    });
  }

  function makeToken(spec) {
    const t = Object.assign({
      id: uid(), kind: 'char', name: 'Token', x: 0, y: 0, z: 0, rot: 0,
      hp: 0, maxHp: 0, initiative: null, color: 0x00e5ff, propKind: null, charId: null
    }, spec);
    const g = new THREE.Group();
    g.position.set(t.x, t.y, t.z); g.rotation.y = t.rot;

    // tokens.js owns its own resources and ships a base ring / label / HP arc,
    // so when it builds the model we skip our furniture and drive its API.
    let inner = null, external = false;
    try {
      if (TOK && S.detail !== 'fast') {
        if (t.kind === 'char' && TOK.buildCharacterToken) {
          inner = TOK.buildCharacterToken(t.char || { name: t.name }, {
            faction: t.faction || ((t.char && t.char.isNPC) ? 'npc' : 'pc'),
            hp: t.maxHp > 0 ? clamp(t.hp / t.maxHp, 0, 1) : 1
          });
        } else if (t.kind === 'vehicle' && TOK.buildVehicleToken) {
          inner = TOK.buildVehicleToken({ kind: t.propKind, name: t.propKind, id: t.id }, {});
        } else if (t.kind === 'prop' && TOK.buildPropToken) {
          inner = TOK.buildPropToken(t.propKind, { seed: t.id });
        }
        if (inner) external = true;
      }
    } catch (e) { inner = null; external = false; }
    if (!inner) {
      inner = t.kind === 'char' ? fallbackCharacter(pool, t.char || { name: t.name })
        : t.kind === 'vehicle' ? fallbackVehicle(pool, t.propKind, { seed: t.id })
          : fallbackProp(pool, t.propKind, { seed: t.id });
    }
    inner.__external = external;
    g.add(inner);
    t.inner = inner; t.external = external;
    if (external && inner.userData && inner.userData.animated) animTokens.push(inner);

    if (external) {
      // only add the initiative chip — tokens.js draws the rest
      if (t.kind === 'char') {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false }));
        spr.position.y = 2.72; spr.renderOrder = 21; spr.visible = false;
        g.add(spr); t.chip = spr;
        refreshLabel(t);
      }
    } else if (t.kind === 'char') {
      const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(t.color).multiplyScalar(2.0), toneMapped: false });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; ring.renderOrder = 2;
      g.add(ring); t.ring = ring;
      const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
        map: discTex, color: new THREE.Color(t.color).multiplyScalar(1.3), toneMapped: false,
        transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; disc.renderOrder = 1;
      g.add(disc);
      const wedge = new THREE.Mesh(wedgeGeo, ringMat);
      wedge.rotation.x = Math.PI / 2; wedge.position.set(0, 0.06, 0.78);
      g.add(wedge);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false }));
      spr.position.y = 2.42; spr.renderOrder = 20;
      g.add(spr); t.label = spr;
      refreshLabel(t);
    } else {
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(t.color).multiplyScalar(1.1), toneMapped: false, transparent: true, opacity: 0.4
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
      ring.scale.setScalar(t.kind === 'vehicle' ? 2.6 : 1.1);
      g.add(ring); t.ring = ring;
    }

    // cheap pick proxy: one cylinder per token instead of the whole hierarchy
    const pr = new THREE.Mesh(
      pool.geo('pickcyl', () => new THREE.CylinderGeometry(0.86, 0.86, 2.2, 8)),
      pool.mat('pickmat', () => new THREE.MeshBasicMaterial({ visible: false }))
    );
    pr.scale.set(t.kind === 'vehicle' ? 2.4 : 1, t.kind === 'char' ? 1 : 0.8, t.kind === 'vehicle' ? 2.4 : 1);
    pr.position.y = 1.0;
    pr.visible = false;
    pr.userData.token = t;
    g.add(pr); t.proxy = pr;

    t.group = g;
    tokenLayer.add(g);
    g.updateMatrixWorld(true);   // raycasts can happen before the next frame
    tokens.push(t);
    shadowDirty();
    return t;
  }

  function refreshLabel(t) {
    if (t.external) {
      if (t.inner && t.inner.setHP && t.maxHp > 0) { try { t.inner.setHP(clamp(t.hp / t.maxHp, 0, 1)); } catch (e) { } }
      if (t.chip) {
        const show = t.initiative !== null && t.initiative !== undefined && t.initiative !== '';
        t.chip.visible = show;
        if (show) {
          const old = t.chip.material.map;
          t.chip.material.map = canvasTex(96, 64, g => {
            g.clearRect(0, 0, 96, 64);
            g.fillStyle = 'rgba(8,10,20,.86)'; g.strokeStyle = '#ffd600'; g.lineWidth = 3;
            g.beginPath(); g.roundRect ? g.roundRect(6, 10, 84, 44, 9) : g.rect(6, 10, 84, 44);
            g.fill(); g.stroke();
            g.fillStyle = '#ffd600'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.font = '700 30px "Share Tech Mono", monospace';
            g.fillText(String(t.initiative), 48, 33);
          });
          t.chip.material.needsUpdate = true;
          if (old) old.dispose();
          t.chip.scale.set(0.72, 0.48, 1);
        }
      }
      return;
    }
    if (!t.label) return;
    const old = t.label.material.map;
    t.label.material.map = labelCanvas(t.name, t.hp, t.maxHp, t.color, t.initiative);
    t.label.material.needsUpdate = true;
    if (old) old.dispose();
    t.label.scale.set(2.7, 0.82, 1);
  }

  function removeToken(t) {
    const i = tokens.indexOf(t); if (i >= 0) tokens.splice(i, 1);
    tokenLayer.remove(t.group);
    if (t.label && t.label.material.map) t.label.material.map.dispose();
    if (t.chip && t.chip.material.map) t.chip.material.map.dispose();
    if (t.external && t.inner) {
      const ai = animTokens.indexOf(t.inner); if (ai >= 0) animTokens.splice(ai, 1);
      t.group.remove(t.inner);
      try { t.inner.dispose && t.inner.dispose(); } catch (e) { }
      t.inner = null;
    }
    releaseGroup(t.group);
    shadowDirty();
    if (selected === t) select(null);
    renderInit();
  }

  function select(t) {
    if (selected && selected !== t && selected.external && selected.inner && selected.inner.setSelected) {
      try { selected.inner.setSelected(false); } catch (e) { }
    }
    selected = t;
    if (t && t.external && t.inner && t.inner.setSelected) { try { t.inner.setSelected(true); } catch (e) { } }
    selRing.visible = !!t;
    rangeRings.visible = !!t && S.rings;
    if (t) {
      selRing.position.set(t.x, t.y + 0.05, t.z);
      rangeRings.position.set(t.x, t.y + 0.06, t.z);
    }
    renderInspector();
    renderRoster();
  }

  function setTokenPos(t, x, y, z) {
    t.x = x; t.y = y; t.z = z;
    t.group.position.set(x, y, z);
    t.group.updateMatrixWorld(true);
    shadowDirty();
    if (selected === t) { selRing.position.set(x, y + 0.05, z); rangeRings.position.set(x, y + 0.06, z); }
  }

  // ── map build ────────────────────────────────────────────────────
  function district() { return DISTRICTS[S.districtIdx] || null; }
  function accentHex() {
    const d = district();
    if (S.theme === 'netrun') return 0x00ffd5;
    if (S.theme === 'badlands') return 0xff9100;
    if (S.theme === 'combatzone') return 0xff1744;
    if (S.theme === 'industrial') return 0xffd600;
    try { return new THREE.Color(d ? d.accent : '#00e5ff').getHex(); } catch (e) { return 0x00e5ff; }
  }

  function buildMap() {
    if (mapCtx) {
      scene.remove(mapCtx.group);
      mapCtx.disposables.forEach(d => { try { d.dispose && d.dispose(); } catch (e) { } });
      releaseGroup(mapCtx.group);
      mapCtx = null;
    }
    const M = SIZES[S.size].m;
    const d = district();
    const seedStr = (d ? d.code : 'X') + '|' + S.theme + '|' + S.size + '|' + S.seed;
    mapCtx = makeCtx(pool, {
      M, theme: THEMES[S.theme], themeKey: S.theme, district: d,
      accent: accentHex(), seed: seedStr
    });
    try { GENERATORS[S.theme](mapCtx); }
    catch (err) { console.error('[encounter] generator failed', err); addGround(mapCtx, 0x14141f, 0.9, 0.1); }
    mapCtx.collapsed = batchStatics(mapCtx);
    scene.add(mapCtx.group);
    buildGrid();
    renderTitle();
    shadowDirty();
  }

  function buildGrid() {
    if (gridGroup) { scene.remove(gridGroup); releaseGroup(gridGroup); gridGroup = null; }
    if (!S.grid || !mapCtx) return;
    const M = SIZES[S.size].m, h = M / 2;
    const a = new THREE.Color(accentHex());
    const minor = a.clone().multiplyScalar(0.30), major = a.clone().multiplyScalar(1.05);
    gridGroup = new THREE.Group();
    gridGroup.add(gridRect(-h, h, -h, h, 0.035, minor, major, 0.4));
    mapCtx.gridY.forEach(p => gridGroup.add(gridRect(p.x0, p.x1, p.z0, p.z1, p.y, minor, major, 0.5)));
    // playable-area border
    const bg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-h, 0, -h), new THREE.Vector3(h, 0, -h),
      new THREE.Vector3(h, 0, h), new THREE.Vector3(-h, 0, h), new THREE.Vector3(-h, 0, -h)
    ]);
    const d = district();
    const threat = new THREE.Color(THREAT_COLOR[clamp(d ? d.threat : 0, 0, THREAT_COLOR.length - 1)]);
    const bl = new THREE.Line(bg, new THREE.LineBasicMaterial({
      color: threat.multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.85
    }));
    bl.position.y = 0.05; gridGroup.add(bl);
    scene.add(gridGroup);
  }

  function frameCamera() {
    const M = SIZES[S.size].m;
    camera.position.set(M * 0.05, M * 0.78, M * 0.9);
    controls.target.set(0, 0, 0);
    controls.minDistance = 5; controls.maxDistance = M * 2.6;
    controls.update();
  }

  // ═════════════════════════════════════════════════════════════════
  // UI
  // ═════════════════════════════════════════════════════════════════
  const styleEl = document.createElement('style');
  styleEl.id = 'e3-style'; styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  const ui = document.createElement('div');
  ui.id = 'e3-ui';
  ui.innerHTML = `
  <div class="e3-pane e3-left" id="e3-left">
    <div class="e3-hd">ENCOUNTER BUILDER<span class="e3-x" id="e3-collapse" title="collapse">&#9646;</span></div>
    <div class="e3-body">
      <div class="e3-sec">
        <div class="e3-lab">Map</div>
        <div class="e3-row"><select class="e3-sel" id="e3-district"></select></div>
        <div class="e3-row"><select class="e3-sel" id="e3-theme"></select></div>
        <div class="e3-row"><select class="e3-sel" id="e3-size"></select></div>
        <div class="e3-row">
          <input class="e3-in" id="e3-seed" style="flex:1" title="seed">
          <button class="e3-b" id="e3-reroll" title="new random seed">Re-roll</button>
        </div>
        <div class="e3-row"><button class="e3-b gold wide" id="e3-regen">Generate Map</button></div>
      </div>
      <div class="e3-sec">
        <div class="e3-lab">View</div>
        <div class="e3-grid">
          <button class="e3-b" id="e3-grid">Grid 2m</button>
          <button class="e3-b" id="e3-snap">Snap</button>
          <button class="e3-b gold" id="e3-measure">Measure</button>
          <button class="e3-b" id="e3-rings">Range Rings</button>
        </div>
        <div class="e3-grid3" style="margin-top:4px">
          <button class="e3-b" id="e3-cam">Camera</button>
          <button class="e3-b" id="e3-top">Top-Down</button>
          <button class="e3-b" id="e3-detail">Tokens HD</button>
        </div>
      </div>
      <div class="e3-sec">
        <div class="e3-lab">Roster</div>
        <div class="e3-row">
          <input class="e3-in" id="e3-search" placeholder="filter…">
          <button class="e3-b" id="e3-reload" title="reload roster">&#8635;</button>
        </div>
        <div class="e3-list" id="e3-roster"></div>
        <div class="e3-hint" style="margin-top:4px">click a name &rarr; click the map to drop</div>
      </div>
      <div class="e3-sec">
        <div class="e3-lab">Vehicles</div>
        <div class="e3-grid3" id="e3-veh"></div>
      </div>
      <div class="e3-sec">
        <div class="e3-lab">Props &amp; Cover</div>
        <div class="e3-grid3" id="e3-props"></div>
      </div>
      <div class="e3-sec" id="e3-libsec" style="display:none">
        <div class="e3-lab">Custom Tokens</div>
        <div class="e3-grid" id="e3-lib"></div>
      </div>
      <div class="e3-sec">
        <div class="e3-lab">Encounters</div>
        <div class="e3-row">
          <input class="e3-in" id="e3-encname" placeholder="encounter name">
          <button class="e3-b gold" id="e3-save">Save</button>
        </div>
        <div class="e3-list" id="e3-saves" style="max-height:150px"></div>
      </div>
      <div class="e3-sec">
        <div class="e3-lab">Keys</div>
        <div class="e3-hint">
          <span class="e3-kbd">G</span> grid &nbsp;<span class="e3-kbd">S</span> snap &nbsp;<span class="e3-kbd">M</span> measure<br>
          <span class="e3-kbd">Q</span>/<span class="e3-kbd">E</span> rotate &nbsp;<span class="e3-kbd">R</span>/<span class="e3-kbd">F</span> raise/lower<br>
          <span class="e3-kbd">Del</span> delete &nbsp;<span class="e3-kbd">Esc</span> cancel &nbsp;<span class="e3-kbd">Space</span> next turn
        </div>
      </div>
    </div>
  </div>

  <div class="e3-pane e3-top">
    <div class="e3-title" id="e3-titletext">—</div>
    <div class="e3-subtitle" id="e3-subtext"></div>
  </div>

  <div class="e3-pane e3-right" id="e3-right">
    <div class="e3-hd">INITIATIVE<span style="margin-left:auto;color:#ffd600" id="e3-roundlab">R1</span></div>
    <div class="e3-row" style="padding:6px 8px 4px;margin:0">
      <button class="e3-b wide" id="e3-next">Next Turn</button>
      <button class="e3-b wide" id="e3-resetinit">Reset</button>
    </div>
    <div class="e3-init" id="e3-initlist"></div>
  </div>

  <div class="e3-pane e3-hud">
    <span id="e3-hudmode">READY</span>
    <span class="e3-sep"></span>
    <span id="e3-hudinfo">&mdash;</span>
    <span class="e3-sep"></span>
    <span id="e3-hudcount">0 tokens</span>
  </div>

  <div class="e3-pane e3-insp" id="e3-insp"></div>
  <div class="e3-toast" id="e3-toast"></div>`;
  container.appendChild(ui);

  const $ = id => ui.querySelector('#' + id);
  let toastTimer = 0;
  function toast(msg) {
    const el = $('e3-toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }

  // populate selects
  $('e3-district').innerHTML = DISTRICTS.length
    ? DISTRICTS.map((d, i) => `<option value="${i}">${esc(d.name)} — ${esc(d.region)} (T${d.threat})</option>`).join('')
    : '<option value="0">No district data</option>';
  $('e3-district').value = String(S.districtIdx);
  $('e3-theme').innerHTML = Object.keys(THEMES).map(k => `<option value="${k}">${esc(THEMES[k].name)}</option>`).join('');
  $('e3-theme').value = S.theme;
  $('e3-size').innerHTML = Object.keys(SIZES).map(k => `<option value="${k}">${esc(SIZES[k].label)}</option>`).join('');
  $('e3-size').value = S.size;
  $('e3-seed').value = S.seed;

  function syncToggles() {
    $('e3-grid').classList.toggle('on', S.grid);
    $('e3-snap').classList.toggle('on', S.snap);
    $('e3-measure').classList.toggle('on', S.measuring);
    $('e3-rings').classList.toggle('on', S.rings);
    const d = $('e3-detail');
    if (d) { d.textContent = S.detail === 'fast' ? 'Tokens Fast' : 'Tokens HD'; d.classList.toggle('gold', S.detail === 'fast'); }
  }
  // Rebuild every token at the other detail level, keeping ids and state.
  function setDetail(mode) {
    if (S.detail === mode) return;
    S.detail = mode;
    const specs = tokens.map(t => ({
      id: t.id, kind: t.kind, name: t.name, char: t.char, charId: t.charId, propKind: t.propKind,
      x: t.x, y: t.y, z: t.z, rot: t.rot, hp: t.hp, maxHp: t.maxHp,
      initiative: t.initiative, color: t.color
    }));
    const selId = selected && selected.id;
    clearTokens();
    specs.forEach(sp => makeToken(sp));
    const again = tokens.find(t => t.id === selId);
    select(again || null);
    renderInit(); syncToggles(); savePrefs();
    toast(mode === 'fast' ? 'fast tokens — fewer draw calls' : 'HD tokens');
  }
  function renderTitle() {
    const d = district();
    const loc = d && d.locations && d.locations.length
      ? d.locations[Math.floor(seededRandom(S.seed + (d.code || ''))() * d.locations.length)] : null;
    const tc = '#' + new THREE.Color(THREAT_COLOR[clamp(d ? d.threat : 0, 0, THREAT_COLOR.length - 1)]).getHexString();
    $('e3-titletext').innerHTML =
      `<span style="color:${tc};text-shadow:0 0 8px ${tc}">&#9679;</span> ` +
      esc((d ? d.name.toUpperCase() : 'NIGHT CITY') + ' // ' + THEMES[S.theme].name.toUpperCase()) +
      (d ? ` <span style="color:${tc};font-size:9px">T${d.threat}</span>` : '');
    const gang = d && d.gangs && d.gangs.length ? d.gangs[Math.floor(seededRandom('g' + S.seed + (d.code || ''))() * d.gangs.length)] : null;
    $('e3-subtext').textContent = [loc ? loc.name : null, gang ? gang + ' presence' : null,
      mapCtx ? mapCtx.brief : null].filter(Boolean).join(' · ');
  }
  function setHud(mode, info) {
    if (mode !== undefined) $('e3-hudmode').textContent = mode;
    if (info !== undefined) $('e3-hudinfo').innerHTML = info;
    $('e3-hudcount').textContent = tokens.length + ' token' + (tokens.length === 1 ? '' : 's');
  }

  // ── roster ───────────────────────────────────────────────────────
  let roster = [];
  async function reloadRoster() {
    try { roster = (await loadRoster()) || []; } catch (e) { roster = []; }
    renderRoster();
  }
  function renderRoster() {
    const q = ($('e3-search').value || '').toLowerCase();
    const list = roster.filter(c => !q || String(c.name || '').toLowerCase().includes(q) ||
      String(c.handle || '').toLowerCase().includes(q) || String(c.role || '').toLowerCase().includes(q));
    if (!list.length) {
      $('e3-roster').innerHTML = `<div class="e3-it" style="cursor:default"><span class="e3-mt">${roster.length ? 'no match' : 'roster empty — create characters in the app'}</span></div>`;
      return;
    }
    $('e3-roster').innerHTML = list.map(c => {
      const col = c.isNPC ? '#ff1744' : '#00e5ff';
      const placed = tokens.some(t => t.charId && t.charId === c.id);
      return `<div class="e3-it${armed && armed.kind === 'char' && armed.data.id === c.id ? ' armed' : ''}" data-cid="${esc(c.id)}">
        <span class="e3-dot" style="color:${col}"></span>
        <span class="e3-nm">${esc(c.handle || c.name || 'Unnamed')}${placed ? ' <span style="color:#69f0ae">&#9679;</span>' : ''}</span>
        <span class="e3-mt">${esc(c.role || (c.isNPC ? 'NPC' : 'PC'))}${c.initiative != null ? ' · i' + c.initiative : ''}</span>
      </div>`;
    }).join('');
    $('e3-roster').querySelectorAll('.e3-it[data-cid]').forEach(el => {
      el.onclick = () => {
        const c = roster.find(x => String(x.id) === el.dataset.cid);
        if (!c) return;
        armed = (armed && armed.kind === 'char' && armed.data.id === c.id) ? null : { kind: 'char', data: c };
        setHud(armed ? 'PLACE: ' + (c.handle || c.name) : 'READY', armed ? 'click the map to drop' : '&mdash;');
        renderRoster();
      };
    });
  }

  // ── palettes ─────────────────────────────────────────────────────
  function renderPalettes() {
    const props = tokKinds('PROP_KINDS', FALLBACK_PROPS);
    const vehs = tokKinds('VEHICLE_KINDS', FALLBACK_VEHICLES);
    $('e3-props').innerHTML = props.map(k => `<button class="e3-b" data-prop="${esc(k)}">${esc(k)}</button>`).join('');
    $('e3-veh').innerHTML = vehs.map(k => `<button class="e3-b" data-veh="${esc(k)}">${esc(k)}</button>`).join('');
    const arm = (kind, k, el) => {
      const same = armed && armed.kind === kind && armed.data === k;
      armed = same ? null : { kind, data: k };
      ui.querySelectorAll('[data-prop],[data-veh]').forEach(b => b.classList.remove('on'));
      if (!same) el.classList.add('on');
      setHud(armed ? 'PLACE: ' + k.toUpperCase() : 'READY', armed ? 'click the map (shift = keep placing)' : '&mdash;');
      renderRoster();
    };
    $('e3-props').querySelectorAll('[data-prop]').forEach(b => b.onclick = () => arm('prop', b.dataset.prop, b));
    $('e3-veh').querySelectorAll('[data-veh]').forEach(b => b.onclick = () => arm('vehicle', b.dataset.veh, b));

    // custom token library, if tokens.js provides one
    try {
      if (TOK && typeof TOK.tokenLibrary === 'function') {
        const lib = TOK.tokenLibrary() || [];
        const items = Array.isArray(lib) ? lib : Object.keys(lib);
        if (items.length) {
          $('e3-libsec').style.display = '';
          $('e3-lib').innerHTML = items.map((it, i) => {
            const nm = typeof it === 'string' ? it : (it.name || it.id || ('token ' + i));
            return `<button class="e3-b" data-lib="${i}">${esc(nm)}</button>`;
          }).join('');
          $('e3-lib').querySelectorAll('[data-lib]').forEach(b => b.onclick = () => {
            armed = { kind: 'lib', data: items[+b.dataset.lib] };
            setHud('PLACE: CUSTOM', 'click the map to drop');
          });
        }
      }
    } catch (e) { /* library optional */ }
  }

  // ── initiative rail ──────────────────────────────────────────────
  function initOrder() {
    return tokens.filter(t => t.kind === 'char')
      .slice().sort((a, b) => (b.initiative == null ? -1e9 : b.initiative) - (a.initiative == null ? -1e9 : a.initiative));
  }
  function renderInit() {
    const order = initOrder();
    $('e3-roundlab').textContent = 'R' + S.round;
    if (!order.length) {
      $('e3-initlist').innerHTML = `<div style="padding:8px;color:#565c6e;font-size:9.5px">drop characters to build the order</div>`;
      turnRing.visible = false;
      setHud(); return;
    }
    if (S.turn >= order.length) S.turn = 0;
    $('e3-initlist').innerHTML = order.map((t, i) => {
      const frac = t.maxHp > 0 ? clamp(t.hp / t.maxHp, 0, 1) : 1;
      const c = frac > 0.5 ? '#69f0ae' : frac > 0.25 ? '#ffd600' : '#ff1744';
      return `<div class="e3-ir${i === S.turn ? ' act' : ''}" data-tid="${t.id}">
        <input class="e3-iv" data-init="${t.id}" value="${t.initiative == null ? '' : t.initiative}" title="initiative"
          style="background:transparent;border:none;outline:none;font-family:inherit">
        <div style="flex:1;min-width:0">
          <div class="e3-nm" style="font-size:10.5px">${esc(t.name)}</div>
          ${t.maxHp > 0 ? `<div class="e3-hpbar"><div class="e3-hpf" style="width:${frac * 100}%;background:${c}"></div></div>` : ''}
        </div>
        <span class="e3-mt" style="color:#${new THREE.Color(t.color).getHexString()}">&#9679;</span>
      </div>`;
    }).join('');
    $('e3-initlist').querySelectorAll('.e3-ir').forEach(el => {
      el.onclick = ev => {
        if (ev.target.dataset && ev.target.dataset.init) return;
        const t = tokens.find(x => x.id === el.dataset.tid);
        if (t) { select(t); focusOn(t); }
      };
    });
    $('e3-initlist').querySelectorAll('[data-init]').forEach(inp => {
      inp.onchange = () => {
        const t = tokens.find(x => x.id === inp.dataset.init);
        if (!t) return;
        const v = inp.value.trim();
        t.initiative = v === '' ? null : (parseInt(v, 10) || 0);
        refreshLabel(t); renderInit();
      };
      inp.onclick = e => e.stopPropagation();
    });
    const cur = order[S.turn];
    if (cur) { turnRing.visible = true; turnRing.position.set(cur.x, cur.y + 0.04, cur.z); }
    setHud();
  }
  function focusOn(t) {
    controls.target.set(t.x, t.y + 0.9, t.z);
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, Math.min(26, SIZES[S.size].m * 0.5));
    controls.update();
  }

  // ── inspector ────────────────────────────────────────────────────
  const SWATCH = [PALETTE.neon, PALETTE.red, PALETTE.gold, PALETTE.green,
    PALETTE.magenta, PALETTE.violet, PALETTE.orange, 0xdfe9f5];
  function renderInspector() {
    const el = $('e3-insp');
    if (!selected) { el.classList.remove('show'); el.innerHTML = ''; return; }
    const t = selected;
    el.classList.add('show');
    el.innerHTML = `
      <div class="e3-ititle">${esc(t.name)}</div>
      <div class="e3-mt" style="margin-bottom:6px">${esc(t.kind)}${t.propKind ? ' · ' + esc(t.propKind) : ''} &nbsp;
        x ${t.x.toFixed(1)} · z ${t.z.toFixed(1)} · <b style="color:#ffd600">+${t.y.toFixed(1)}m</b></div>
      <div class="e3-row"><button class="e3-b wide" data-a="rl">&#8630; 45&deg;</button>
        <button class="e3-b wide" data-a="rr">45&deg; &#8631;</button></div>
      <div class="e3-row"><button class="e3-b wide" data-a="up">Raise 1m</button>
        <button class="e3-b wide" data-a="dn">Lower 1m</button>
        <button class="e3-b wide" data-a="gnd">Drop</button></div>
      ${t.kind === 'char' ? `
      <div class="e3-row"><button class="e3-b red" data-a="h-5">-5</button><button class="e3-b red" data-a="h-1">-1</button>
        <input class="e3-in" id="e3-hp" value="${t.hp}" style="text-align:center">
        <button class="e3-b" data-a="h1">+1</button><button class="e3-b" data-a="h5">+5</button></div>
      <div class="e3-mt">max ${t.maxHp} · seriously wounded at ${Math.ceil(t.maxHp / 2)}</div>` : ''}
      <div class="e3-sw">${SWATCH.map(c => `<div class="e3-swb" data-c="${c}" style="background:#${new THREE.Color(c).getHexString()}"></div>`).join('')}</div>
      <div class="e3-row" style="margin-top:6px"><button class="e3-b wide" data-a="dup">Duplicate</button>
        <button class="e3-b red wide" data-a="del">Delete</button></div>`;
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'rl') { t.rot -= Math.PI / 4; t.group.rotation.y = t.rot; t.group.updateMatrixWorld(true); }
      else if (a === 'rr') { t.rot += Math.PI / 4; t.group.rotation.y = t.rot; t.group.updateMatrixWorld(true); }
      else if (a === 'up') setTokenPos(t, t.x, t.y + 1, t.z);
      else if (a === 'dn') setTokenPos(t, t.x, Math.max(0, t.y - 1), t.z);
      else if (a === 'gnd') setTokenPos(t, t.x, surfaceYAt(t.x, t.z), t.z);
      else if (a === 'del') { removeToken(t); return; }
      else if (a === 'dup') {
        const n = makeToken({
          kind: t.kind, name: t.name, char: t.char, charId: null, propKind: t.propKind,
          hp: t.hp, maxHp: t.maxHp, initiative: t.initiative, color: t.color,
          x: t.x + CELL, y: t.y, z: t.z, rot: t.rot
        });
        select(n); renderInit(); return;
      } else if (a[0] === 'h') {
        t.hp = clamp(t.hp + parseInt(a.slice(1), 10), 0, Math.max(t.maxHp, 999));
        refreshLabel(t); renderInit();
      }
      renderInspector();
    });
    const hpIn = el.querySelector('#e3-hp');
    if (hpIn) hpIn.onchange = () => { t.hp = clamp(parseInt(hpIn.value, 10) || 0, 0, 999); refreshLabel(t); renderInit(); renderInspector(); };
    el.querySelectorAll('[data-c]').forEach(sw => sw.onclick = () => {
      t.color = +sw.dataset.c;
      if (t.ring) t.ring.material.color.set(new THREE.Color(t.color).multiplyScalar(t.kind === 'char' ? 2.0 : 1.1));
      refreshLabel(t); renderInit();
    });
  }

  // ═════════════════════════════════════════════════════════════════
  // PICKING / INTERACTION
  // ═════════════════════════════════════════════════════════════════
  const ray = new THREE.Raycaster();
  const downRay = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const UP = new THREE.Vector3(0, 1, 0);

  function setNDC(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / Math.max(1, r.height)) * 2 + 1;
  }
  function pickSurface() {
    if (!mapCtx) return null;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(mapCtx.surfaces, false);
    if (!hits.length) return null;
    let best = hits[0];
    for (const h of hits) if (h.point.y > best.point.y) best = h;
    return best.point.clone();
  }
  function pickToken() {
    if (!tokens.length) return null;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(tokens.map(t => t.proxy), false);
    return hits.length ? hits[0].object.userData.token : null;
  }
  function surfaceYAt(x, z) {
    if (!mapCtx) return 0;
    downRay.set(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0));
    const hits = downRay.intersectObjects(mapCtx.surfaces, false);
    if (!hits.length) return 0;
    let y = hits[0].point.y;
    for (const h of hits) if (h.point.y > y) y = h.point.y;
    return y;
  }

  function placeAt(p, keepArmed) {
    if (!armed) return null;
    const x = S.snap ? snapV(p.x) : p.x;
    const z = S.snap ? snapV(p.z) : p.z;
    const y = S.snap ? surfaceYAt(x, z) : p.y;
    let t = null;
    if (armed.kind === 'char') {
      const c = armed.data;
      const maxHp = c.maxHp || c.hp || 0;
      t = makeToken({
        kind: 'char', name: c.handle || c.name || 'Runner', char: c, charId: c.id,
        hp: (c.hp != null ? c.hp : maxHp), maxHp,
        initiative: (c.initiative != null ? c.initiative : null),
        color: c.isNPC ? PALETTE.red : PALETTE.neon, x, y, z
      });
    } else if (armed.kind === 'vehicle') {
      t = makeToken({ kind: 'vehicle', name: String(armed.data), propKind: armed.data, color: PALETTE.gold, x, y, z });
    } else if (armed.kind === 'lib') {
      // drop a placeholder now, swap in the stored GLB when it decodes
      const entry = armed.data;
      t = makeToken({ kind: 'prop', name: entry.name || 'custom', propKind: '__lib', color: PALETTE.magenta, x, y, z });
      const target = t;
      if (TOK && typeof TOK.loadLibraryToken === 'function') {
        TOK.loadLibraryToken(entry.id, {}).then(model => {
          if (!model) return;
          if (!target.group || !target.group.parent) { try { model.dispose && model.dispose(); } catch (e) { } return; }
          if (target.inner) target.group.remove(target.inner);
          model.__external = true;
          target.inner = model; target.external = true;
          target.group.add(model);
          if (model.userData && model.userData.animated) animTokens.push(model);
        }).catch(() => toast('custom token failed to load'));
      }
    } else {
      t = makeToken({ kind: 'prop', name: String(armed.data), propKind: armed.data, color: PALETTE.green, x, y, z });
    }
    select(t); renderInit();
    if (S.detail === 'hd' && !S.detailNagged && tokens.length >= 20) {
      S.detailNagged = true;
      toast('20+ tokens — "Tokens Fast" keeps the framerate up');
    }
    if (!keepArmed) {
      armed = null;
      ui.querySelectorAll('[data-prop],[data-veh]').forEach(b => b.classList.remove('on'));
      setHud('READY', '&mdash;');
      renderRoster();
    }
    return t;
  }

  // ── measure tool ─────────────────────────────────────────────────
  function updateMeasure(livePoint) {
    const a = measure.a, b = livePoint || measure.b;
    if (!a) { mLine.visible = mCapA.visible = mCapB.visible = false; return; }
    mCapA.position.set(a.x, a.y + 0.07, a.z); mCapA.visible = true;
    if (!b) { mLine.visible = false; mCapB.visible = false; return; }
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 0.01) { mLine.visible = false; return; }
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mLine.position.set(mid.x, mid.y + 0.07, mid.z);
    mLine.scale.set(1, len, 1);
    mLine.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    mLine.visible = true;
    mCapB.position.set(b.x, b.y + 0.07, b.z); mCapB.visible = true;
    const dy = b.y - a.y;
    setHud('MEASURE', `<b>${len.toFixed(1)} m</b> · ${(len / CELL).toFixed(1)} sq · ${rangeBand(len)}` +
      (Math.abs(dy) > 0.3 ? ` · elev ${dy > 0 ? '+' : ''}${dy.toFixed(1)} m` : ''));
  }
  function clearMeasure() {
    measure.a = measure.b = null;
    mLine.visible = mCapA.visible = mCapB.visible = false;
  }

  // ── pointer plumbing (capture phase, so OrbitControls never sees it) ──
  function onDown(ev) {
    if (ev.button !== 0 || !mapCtx) return;
    setNDC(ev);
    if (S.measuring) {
      const p = pickSurface(); if (!p) return;
      if (!measure.a || measure.b) { measure.a = p; measure.b = null; }
      else measure.b = p;
      updateMeasure();
      ev.stopPropagation(); ev.preventDefault();
      return;
    }
    if (armed) {
      const p = pickSurface();
      if (p) { placeAt(p, ev.shiftKey); ev.stopPropagation(); ev.preventDefault(); }
      return;
    }
    const t = pickToken();
    if (t) {
      select(t);
      dragging = t;
      renderer.domElement.style.cursor = 'grabbing';
      ev.stopPropagation(); ev.preventDefault();
    } else if (selected) {
      select(null);
    }
  }
  function onMove(ev) {
    if (!mapCtx) return;
    setNDC(ev);
    if (dragging) {
      const p = pickSurface();
      if (p) {
        const x = S.snap ? snapV(p.x) : p.x, z = S.snap ? snapV(p.z) : p.z;
        setTokenPos(dragging, x, S.snap ? surfaceYAt(x, z) : p.y, z);
        if (turnRing.visible) { const o = initOrder()[S.turn]; if (o === dragging) turnRing.position.set(x, dragging.y + 0.04, z); }
      }
      return;
    }
    if (S.measuring && measure.a && !measure.b) {
      const p = pickSurface(); if (p) updateMeasure(p);
      return;
    }
    if (!armed) {
      const t = pickToken();
      renderer.domElement.style.cursor = t ? 'grab' : '';
    }
  }
  function onUp() {
    if (dragging) {
      renderer.domElement.style.cursor = '';
      renderInspector();
      dragging = null;
    }
  }
  container.addEventListener('pointerdown', onDown, true);
  container.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);

  function onKey(ev) {
    const panel = document.getElementById('panel-maps3d');
    if (panel && !panel.classList.contains('active')) return;
    const tag = (ev.target && ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const k = ev.key.toLowerCase();
    if (k === 'g') { S.grid = !S.grid; buildGrid(); syncToggles(); savePrefs(); }
    else if (k === 's') { S.snap = !S.snap; syncToggles(); savePrefs(); }
    else if (k === 'm') { setMeasure(!S.measuring); }
    else if (k === 'escape') { armed = null; clearMeasure(); setMeasure(false); select(null); setHud('READY', '&mdash;'); renderRoster(); ui.querySelectorAll('[data-prop],[data-veh]').forEach(b => b.classList.remove('on')); }
    else if (k === ' ') { nextTurn(); ev.preventDefault(); }
    else if (selected) {
      if (k === 'q') { selected.rot -= Math.PI / 4; selected.group.rotation.y = selected.rot; selected.group.updateMatrixWorld(true); }
      else if (k === 'e') { selected.rot += Math.PI / 4; selected.group.rotation.y = selected.rot; selected.group.updateMatrixWorld(true); }
      else if (k === 'r') { setTokenPos(selected, selected.x, selected.y + 1, selected.z); renderInspector(); }
      else if (k === 'f') { setTokenPos(selected, selected.x, Math.max(0, selected.y - 1), selected.z); renderInspector(); }
      else if (k === 'delete' || k === 'backspace') { removeToken(selected); ev.preventDefault(); }
      else return;
    } else return;
    ev.stopPropagation();
  }
  window.addEventListener('keydown', onKey, true);

  function setMeasure(on) {
    S.measuring = on;
    if (!on) { clearMeasure(); setHud('READY', '&mdash;'); }
    else { armed = null; select(null); setHud('MEASURE', 'click two points'); renderRoster(); }
    renderer.domElement.style.cursor = on ? 'crosshair' : '';
    syncToggles();
  }
  function nextTurn() {
    const order = initOrder();
    if (!order.length) return;
    S.turn++;
    if (S.turn >= order.length) { S.turn = 0; S.round++; toast('Round ' + S.round); }
    renderInit();
    const cur = order[S.turn];
    if (cur) { select(cur); }
  }

  // ═════════════════════════════════════════════════════════════════
  // SAVE / LOAD  (localStorage; no IPC needed)
  // ═════════════════════════════════════════════════════════════════
  function readSaves() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; } }
  function writeSaves(a) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(a)); return true; }
    catch (e) { toast('save failed — storage full'); return false; }
  }
  function serialize(name) {
    return {
      id: uid(), name: name || 'Untitled encounter', ts: Date.now(),
      districtIdx: S.districtIdx, theme: S.theme, size: S.size, seed: S.seed,
      round: S.round, turn: S.turn,
      cam: { p: camera.position.toArray(), t: controls.target.toArray() },
      tokens: tokens.map(t => ({
        kind: t.kind, name: t.name, propKind: t.propKind,
        x: +t.x.toFixed(3), y: +t.y.toFixed(3), z: +t.z.toFixed(3), rot: +t.rot.toFixed(4),
        hp: t.hp, maxHp: t.maxHp, initiative: t.initiative, color: t.color, charId: t.charId,
        char: t.char ? { id: t.char.id, name: t.char.name, handle: t.char.handle, role: t.char.role, isNPC: !!t.char.isNPC } : null
      }))
    };
  }
  function clearTokens() {
    while (tokens.length) removeToken(tokens[tokens.length - 1]);
    select(null); renderInit();
  }
  function applySave(rec) {
    S.districtIdx = clamp(rec.districtIdx | 0, 0, Math.max(0, DISTRICTS.length - 1));
    S.theme = THEMES[rec.theme] ? rec.theme : 'street';
    S.size = SIZES[rec.size] ? rec.size : 'medium';
    S.seed = rec.seed; S.round = rec.round || 1; S.turn = rec.turn || 0;
    S.name = rec.name || '';
    $('e3-district').value = String(S.districtIdx);
    $('e3-theme').value = S.theme; $('e3-size').value = S.size; $('e3-seed').value = S.seed;
    $('e3-encname').value = S.name;
    clearTokens();
    applyTheme(S.theme);
    buildMap();
    (rec.tokens || []).forEach(d => makeToken({
      kind: d.kind, name: d.name, propKind: d.propKind, char: d.char, charId: d.charId,
      x: d.x, y: d.y, z: d.z, rot: d.rot, hp: d.hp, maxHp: d.maxHp,
      initiative: d.initiative, color: d.color
    }));
    if (rec.cam) {
      camera.position.fromArray(rec.cam.p);
      controls.target.fromArray(rec.cam.t);
      controls.update();
    } else frameCamera();
    renderInit(); renderRoster(); setHud('READY', '&mdash;');
    toast('loaded · ' + rec.name);
  }
  function renderSaves() {
    const list = readSaves().sort((a, b) => b.ts - a.ts);
    if (!list.length) { $('e3-saves').innerHTML = `<div class="e3-it" style="cursor:default"><span class="e3-mt">nothing saved yet</span></div>`; return; }
    $('e3-saves').innerHTML = list.map(r => `<div class="e3-it" data-sid="${esc(r.id)}">
      <span class="e3-dot" style="color:#ffd600"></span>
      <span class="e3-nm">${esc(r.name)}</span>
      <span class="e3-mt">${(r.tokens || []).length}t</span>
      <span class="e3-mt" data-del="${esc(r.id)}" style="color:#ff1744;padding:0 3px" title="delete">&times;</span>
    </div>`).join('');
    $('e3-saves').querySelectorAll('[data-sid]').forEach(el => el.onclick = ev => {
      if (ev.target.dataset && ev.target.dataset.del) {
        writeSaves(readSaves().filter(x => x.id !== ev.target.dataset.del));
        renderSaves(); return;
      }
      const rec = readSaves().find(x => x.id === el.dataset.sid);
      if (rec) applySave(rec);
    });
  }

  // ═════════════════════════════════════════════════════════════════
  // WIRING
  // ═════════════════════════════════════════════════════════════════
  function regenerate(newSeed) {
    if (newSeed) { S.seed = Math.floor(Math.random() * 1e6); $('e3-seed').value = S.seed; }
    applyTheme(S.theme);
    buildMap();
    // re-seat every token on the new terrain
    tokens.forEach(t => setTokenPos(t, t.x, surfaceYAt(t.x, t.z), t.z));
    savePrefs();
  }

  $('e3-district').onchange = e => { S.districtIdx = +e.target.value; regenerate(false); };
  $('e3-theme').onchange = e => { S.theme = e.target.value; regenerate(false); frameCamera(); };
  $('e3-size').onchange = e => { S.size = e.target.value; regenerate(false); frameCamera(); };
  $('e3-seed').onchange = e => { S.seed = e.target.value.trim() || '1'; regenerate(false); };
  $('e3-reroll').onclick = () => regenerate(true);
  $('e3-regen').onclick = () => regenerate(false);
  $('e3-grid').onclick = () => { S.grid = !S.grid; buildGrid(); syncToggles(); savePrefs(); };
  $('e3-snap').onclick = () => { S.snap = !S.snap; syncToggles(); savePrefs(); };
  $('e3-measure').onclick = () => setMeasure(!S.measuring);
  $('e3-rings').onclick = () => { S.rings = !S.rings; rangeRings.visible = S.rings && !!selected; syncToggles(); savePrefs(); };
  $('e3-cam').onclick = () => frameCamera();
  $('e3-detail').onclick = () => setDetail(S.detail === 'hd' ? 'fast' : 'hd');
  $('e3-top').onclick = () => {
    const M = SIZES[S.size].m;
    camera.position.set(0.01, M * 1.15, 0.01); controls.target.set(0, 0, 0); controls.update();
  };
  $('e3-search').oninput = () => renderRoster();
  $('e3-reload').onclick = () => reloadRoster();
  $('e3-next').onclick = () => nextTurn();
  $('e3-resetinit').onclick = () => { S.round = 1; S.turn = 0; renderInit(); };
  $('e3-save').onclick = () => {
    const nm = ($('e3-encname').value || '').trim() ||
      ((district() ? district().name : 'Night City') + ' · ' + THEMES[S.theme].name);
    const list = readSaves();
    const existing = list.findIndex(r => r.name === nm);
    const rec = serialize(nm);
    if (existing >= 0) { rec.id = list[existing].id; list[existing] = rec; } else list.push(rec);
    if (writeSaves(list)) { toast('saved · ' + nm); renderSaves(); }
  };
  $('e3-collapse').onclick = () => $('e3-left').classList.toggle('collapsed');

  // ═════════════════════════════════════════════════════════════════
  // BOOT
  // ═════════════════════════════════════════════════════════════════
  await tokensModule();
  if (TOK && typeof TOK.libraryReady === 'function') { try { await TOK.libraryReady(); } catch (e) { } }
  buildMap();
  frameCamera();
  syncToggles();
  renderPalettes();
  renderSaves();
  renderInit();
  renderInspector();
  setHud('READY', '&mdash;');
  await reloadRoster();

  stage.setFrame((dt, t) => {
    if (mapCtx) { const a = mapCtx.anim; for (let i = 0; i < a.length; i++) a[i](t, dt); }
    for (let i = 0; i < animTokens.length; i++) { try { animTokens[i].update(t, dt); } catch (e) { } }
    if (selRing.visible) { const p = 1 + Math.sin(t * 3.4) * 0.045; selRing.scale.set(p, p, p); }
    if (turnRing.visible) {
      const p = 1 + Math.sin(t * 2.1) * 0.075;
      turnRing.scale.set(p, p, p);
      turnRing.material.opacity = 0.5 + (Math.sin(t * 2.1) * 0.5 + 0.5) * 0.45;
    }
  });

  // ── teardown ─────────────────────────────────────────────────────
  const origDispose = stage.dispose;
  stage.dispose = function () {
    container.removeEventListener('pointerdown', onDown, true);
    container.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('keydown', onKey, true);
    clearTimeout(toastTimer);
    tokens.forEach(t => {
      if (t.label && t.label.material.map) t.label.material.map.dispose();
      if (t.chip && t.chip.material.map) t.chip.material.map.dispose();
      if (t.external && t.inner) { try { t.inner.dispose && t.inner.dispose(); } catch (e) { } }
    });
    animTokens.length = 0;
    if (TOK && typeof TOK.disposeTokenCaches === 'function') { try { TOK.disposeTokenCaches(); } catch (e) { } }
    if (mapCtx) mapCtx.disposables.forEach(d => { try { d.dispose && d.dispose(); } catch (e) { } });
    try { origDispose(); } catch (e) { console.error(e); }
    pool.dispose();
    ui.remove();
    styleEl.remove();
  };

  // debug surface for the verification harness
  stage.__enc = {
    state: S, tokens, get map() { return mapCtx; },
    setTheme(k) { if (THEMES[k]) { S.theme = k; $('e3-theme').value = k; regenerate(false); } },
    setDetail,
    place(kind, data, x, z) { armed = { kind, data }; return placeAt(new THREE.Vector3(x, surfaceYAt(x, z), z), false); },
    stats() {
      let objs = 0, tris = 0;
      scene.traverse(o => {
        objs++;
        const g = o.geometry;
        if (g && g.index) tris += (g.index.count / 3) * (o.isInstancedMesh ? o.count : 1);
        else if (g && g.attributes && g.attributes.position) tris += (g.attributes.position.count / 3) * (o.isInstancedMesh ? o.count : 1);
      });
      return { objects: objs, tris: Math.round(tris), tokens: tokens.length, calls: renderer.info.render.calls, collapsed: mapCtx ? mapCtx.collapsed : 0 };
    }
  };

  return stage;
}
