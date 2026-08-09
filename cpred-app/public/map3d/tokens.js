// ═══════════════════════════════════════════════════════════════════
// CP:RED 3D MAPS — token system
//
// Builds every physical thing that stands on an encounter map: player
// characters, NPCs, vehicles, set dressing, and user-supplied GLB models.
//
// Design notes
// ────────────
// • Characters are generated procedurally from the GM app's real sheet
//   data and are deterministic: seededRandom(char.id || char.name) drives
//   every colour, hair style and jitter, so a character never changes look.
// • Everything is authored as a list of (geometry, material, matrix) parts
//   and then merged per material. A humanoid built from ~50 primitives ends
//   up as 6-9 draw calls instead of 50, which is what makes 30 tokens cheap.
// • Base geometry is cached globally and shared. Materials are per-token so
//   that createStage().dispose() — which blindly disposes every material in
//   the scene — can never poison the cache for the next stage.
// • 1 unit = 1 metre. A humanoid is ~1.8 units tall. CP:RED encounter grid
//   squares are 2m, so a token base of r≈0.62 sits comfortably inside one.
//
// Public API
// ──────────
//   buildCharacterToken(char, opts)   -> THREE.Group
//   buildVehicleToken(spec, opts)     -> THREE.Group
//   buildPropToken(kind, opts)        -> THREE.Group
//   buildPropField(kind, places, o)   -> THREE.Group  (InstancedMesh, bonus)
//   loadCustomToken(fileOrBuffer, o)  -> Promise<THREE.Group>
//   loadLibraryToken(id, opts)        -> Promise<THREE.Group>
//   PROP_KINDS / VEHICLE_KINDS
//   tokenLibrary() / saveCustomToken() / deleteCustomToken()
//
// Every returned Group: feet at y=0, faces +Z, has userData
// { kind, id, name, sourceChar? }, a colour-coded base ring, .dispose()
// and an optional .update(t, dt) for its animated bits.
// ═══════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, THREAT_COLOR, neonMaterial, seededRandom, ipc } from './core.js';

// ═══════════════════════════════════════════════════════════════════
// 1. RESOURCE LAYER — cached geometry, cached textures, merged parts
// ═══════════════════════════════════════════════════════════════════

const _geoCache = new Map();
const _texCache = new Map();

function G(key, factory) {
  let g = _geoCache.get(key);
  if (!g) { g = factory(); g.name = key; _geoCache.set(key, g); }
  return g;
}

const TAU = Math.PI * 2;
const n = (v) => Math.round(v * 1000) / 1000; // key normaliser

// Shared primitive geometry. Segment counts are deliberately modest: these
// are 1-2 metre props seen from 10+ metres, and every extra ring multiplies
// across 30 tokens.
const Geo = {
  box: (w, h, d) => G(`box|${n(w)}|${n(h)}|${n(d)}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt, rb, h, rs = 12, hs = 1, open = false, ts = 0, tl = TAU) =>
    G(`cyl|${n(rt)}|${n(rb)}|${n(h)}|${rs}|${hs}|${open}|${n(ts)}|${n(tl)}`,
      () => new THREE.CylinderGeometry(rt, rb, h, rs, hs, open, ts, tl)),
  sph: (r, ws = 14, hs = 10, ps = 0, pl = TAU, ths = 0, thl = Math.PI) =>
    G(`sph|${n(r)}|${ws}|${hs}|${n(ps)}|${n(pl)}|${n(ths)}|${n(thl)}`,
      () => new THREE.SphereGeometry(r, ws, hs, ps, pl, ths, thl)),
  cap: (r, h, cs = 5, rs = 12) =>
    G(`cap|${n(r)}|${n(h)}|${cs}|${rs}`, () => new THREE.CapsuleGeometry(r, h, cs, rs)),
  torus: (r, t, rs = 8, ts = 18, arc = TAU) =>
    G(`tor|${n(r)}|${n(t)}|${rs}|${ts}|${n(arc)}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)),
  cone: (r, h, rs = 10, open = false) =>
    G(`cone|${n(r)}|${n(h)}|${rs}|${open}`, () => new THREE.ConeGeometry(r, h, rs, 1, open)),
  ring: (ri, ro, seg = 48, ts = 0, tl = TAU) =>
    G(`ring|${n(ri)}|${n(ro)}|${seg}|${n(ts)}|${n(tl)}`, () => new THREE.RingGeometry(ri, ro, seg, 1, ts, tl)),
  circle: (r, seg = 40) => G(`cir|${n(r)}|${seg}`, () => new THREE.CircleGeometry(r, seg)),
  plane: (w, h) => G(`pln|${n(w)}|${n(h)}`, () => new THREE.PlaneGeometry(w, h)),
  lathe: (key, pts, seg = 16, ps = 0, pl = TAU) =>
    G(`lat|${key}|${seg}|${n(ps)}|${n(pl)}`,
      () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg, ps, pl)),
  tube: (key, points, ts = 24, r = 0.02, rs = 6, closed = false) =>
    G(`tub|${key}|${ts}|${n(r)}|${rs}`, () => new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2]))), ts, r, rs, closed)),

  // Side-profile extrusion: author a 2D silhouette in (forward, up) and get a
  // solid, bevelled body of the given width. This is what makes the vehicles
  // read as vehicles rather than stacked boxes.
  side: (key, pts, width, bevel = 0.05) =>
    G(`side|${key}|${n(width)}|${n(bevel)}`, () => {
      const g = new THREE.ExtrudeGeometry(polyShape(pts), {
        depth: width, curveSegments: 3, steps: 1,
        bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
        bevelOffset: -bevel, bevelSegments: 2
      });
      g.rotateY(-Math.PI / 2);            // profile X -> world Z (forward)
      g.computeBoundingBox();
      const bb = g.boundingBox;
      g.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);  // centre the width
      return g;
    }),

  // Plan-view extrusion: author a top-down outline in (lateral, forward) and
  // get a slab of the given thickness. Used for the AV fuselage.
  plan: (key, pts, thick, bevel = 0.04) =>
    G(`plan|${key}|${n(thick)}|${n(bevel)}`, () => {
      const g = new THREE.ExtrudeGeometry(polyShape(pts), {
        depth: thick, curveSegments: 3, steps: 1,
        bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
        bevelOffset: -bevel, bevelSegments: 2
      });
      g.rotateX(-Math.PI / 2); g.rotateY(Math.PI);
      g.computeBoundingBox();
      const bb = g.boundingBox;
      g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      return g;
    })
};

function polyShape(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

// ── Transform helper ───────────────────────────────────────────────
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _sc = new THREE.Vector3();
function TRS(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(
    _v.set(px, py, pz), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _sc.set(sx, sy, sz));
}

// ═══════════════════════════════════════════════════════════════════
// 2. MATERIAL DESCRIPTORS
// A descriptor is { k, f, tr } — a cache key, a factory and a
// "transparent/emissive, don't cast shadows" flag. Merging buckets by k
// is what collapses a token down to a handful of draw calls.
// ═══════════════════════════════════════════════════════════════════

const hex = (c) => (typeof c === 'number' ? c : new THREE.Color(c).getHex());

const Mat = {
  // Matte-ish cloth / rubber / plastic
  cloth: (c, rough = 0.92) => ({ k: `cl|${hex(c)}|${n(rough)}`, f: () => new THREE.MeshStandardMaterial({ color: hex(c), roughness: rough, metalness: 0.02 }) }),
  // Skin: soft, slightly translucent-looking
  skin: (c) => ({ k: `sk|${hex(c)}`, f: () => new THREE.MeshStandardMaterial({ color: hex(c), roughness: 0.72, metalness: 0.0 }) }),
  // Worn leather / synthleather — the CP:RED jacket look
  leather: (c) => ({ k: `le|${hex(c)}`, f: () => new THREE.MeshStandardMaterial({ color: hex(c), roughness: 0.50, metalness: 0.10, envMap: envTexture(), envMapIntensity: 0.55 }) }),
  // Painted armour plate
  plate: (c) => ({ k: `pl|${hex(c)}`, f: () => new THREE.MeshStandardMaterial({ color: hex(c), roughness: 0.40, metalness: 0.48, envMap: envTexture(), envMapIntensity: 0.9 }) }),
  // Polished chrome — cyberware, rims, blades
  chrome: (c = 0xd8e2ee) => ({ k: `ch|${hex(c)}`, f: () => new THREE.MeshStandardMaterial({ color: hex(c), roughness: 0.20, metalness: 1.0, envMap: envTexture(), envMapIntensity: 1.25 }) }),
  // Dirty structural metal — props, frames, crates
  metal: (c, rough = 0.55) => ({ k: `mt|${hex(c)}|${n(rough)}`, f: () => new THREE.MeshStandardMaterial({ color: hex(c), roughness: rough, metalness: 0.62, envMap: envTexture(), envMapIntensity: 1.0 }) }),
  // Concrete / asphalt
  rough: (c) => ({ k: `ro|${hex(c)}`, f: () => new THREE.MeshStandardMaterial({ color: hex(c), roughness: 0.98, metalness: 0.0 }) }),
  // Tinted vehicle glass
  glass: (c = 0x0a0e18) => ({ k: `gl|${hex(c)}`, f: () => new THREE.MeshStandardMaterial({ color: hex(c), roughness: 0.08, metalness: 0.85, emissive: 0x11293a, emissiveIntensity: 0.7, envMap: envTexture(), envMapIntensity: 1.1 }) }),
  // Emissive neon — the thing that actually sells the art direction
  glow: (c, i = 2.4) => ({ k: `gw|${hex(c)}|${n(i)}`, tr: true, f: () => neonMaterial(hex(c), i) }),
  // Unlit additive sprite-ish surfaces (underglow, ground bloom)
  add: (c, op = 0.55, map = null) => ({
    k: `ad|${hex(c)}|${n(op)}|${map ? map.uuid : '-'}`, tr: true,
    f: () => new THREE.MeshBasicMaterial({ color: hex(c), map, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  }),
  // Flat unlit with a texture (screens, signage, decals)
  flat: (c, map = null, opts = {}) => ({
    k: `fl|${hex(c)}|${map ? map.uuid : '-'}|${opts.side || 0}|${n(opts.opacity ?? 1)}`, tr: !!opts.transparent,
    f: () => new THREE.MeshBasicMaterial({ color: hex(c), map, side: opts.side || THREE.FrontSide, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, depthWrite: opts.depthWrite !== false, alphaTest: opts.alphaTest || 0 })
  }),
  // Two-sided cloth for coats/jackets built from open cylinders
  coat: (c) => ({ k: `co|${hex(c)}`, f: () => new THREE.MeshStandardMaterial({ color: hex(c), roughness: 0.62, metalness: 0.08, side: THREE.DoubleSide }) }),
  // Cutout material for chain-link etc.
  cutout: (c, map) => ({
    k: `cu|${hex(c)}|${map.uuid}`,
    f: () => new THREE.MeshStandardMaterial({ color: hex(c), map, alphaMap: map, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.55, envMap: envTexture(), envMapIntensity: 0.9 })
  })
};

// ═══════════════════════════════════════════════════════════════════
// 3. PROCEDURAL TEXTURES
// All generated on a canvas, all cached, all tiny. These do most of the
// heavy lifting for "looks expensive" on props.
// ═══════════════════════════════════════════════════════════════════

function cv(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

function T(key, factory, srgb = true) {
  let t = _texCache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(factory());
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    _texCache.set(key, t);
  }
  return t;
}

const CSS = (c) => '#' + hex(c).toString(16).padStart(6, '0');

// Radial falloff used for ground glow discs and underglow.
const texGlowDisc = () => T('glowdisc', () => {
  const { c, x } = cv(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return c;
});

// Diagonal hazard stripes — barricades, ammo crates, industrial trim.
const texHazard = (a = 0xffd600, b = 0x14141a) => T(`haz|${hex(a)}|${hex(b)}`, () => {
  const { c, x } = cv(128, 128);
  x.fillStyle = CSS(b); x.fillRect(0, 0, 128, 128);
  x.strokeStyle = CSS(a); x.lineWidth = 22;
  for (let i = -128; i < 256; i += 44) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke(); }
  x.globalAlpha = 0.25; x.fillStyle = '#000';
  for (let i = 0; i < 220; i++) x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  return c;
});

// Chain-link diamond mesh as a cutout map.
const texChainLink = () => T('chain', () => {
  const { c, x } = cv(128, 128);
  x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#fff'; x.lineWidth = 7; x.lineCap = 'square';
  for (let i = -128; i <= 256; i += 32) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke();
    x.beginPath(); x.moveTo(i, 128); x.lineTo(i + 128, 0); x.stroke();
  }
  return c;
}, false);

// Server-rack front: rows of blinking status LEDs and drive bays.
const texRack = () => T('rack', () => {
  const { c, x } = cv(256, 512);
  x.fillStyle = '#0b0d14'; x.fillRect(0, 0, 256, 512);
  for (let r = 0; r < 16; r++) {
    const y = 8 + r * 31;
    x.fillStyle = '#161a26'; x.fillRect(10, y, 236, 26);
    x.fillStyle = '#0a0c12'; x.fillRect(14, y + 4, 150, 18);
    for (let i = 0; i < 5; i++) {
      const on = ((r * 7 + i * 3) % 4) !== 0;
      const col = i === 0 ? '#ff1744' : (i % 2 ? '#00e5ff' : '#69f0ae');
      x.fillStyle = on ? col : '#1b2030';
      x.shadowColor = col; x.shadowBlur = on ? 9 : 0;
      x.fillRect(180 + i * 13, y + 9, 7, 8);
      x.shadowBlur = 0;
    }
    x.strokeStyle = '#2a3040'; x.lineWidth = 1; x.strokeRect(10.5, y + 0.5, 235, 25);
  }
  return c;
});

// Terminal / kiosk screen — fake CP:RED UI.
const texScreen = (accent = 0x00e5ff) => T(`screen|${hex(accent)}`, () => {
  const { c, x } = cv(256, 192);
  x.fillStyle = '#04060c'; x.fillRect(0, 0, 256, 192);
  const a = CSS(accent);
  x.strokeStyle = a; x.lineWidth = 3; x.globalAlpha = 0.9;
  x.strokeRect(8, 8, 240, 176);
  x.fillStyle = a; x.globalAlpha = 0.18; x.fillRect(8, 8, 240, 26); x.globalAlpha = 1;
  x.fillStyle = a; x.font = 'bold 16px Consolas, monospace';
  x.fillText('NET//TERMINAL', 18, 27);
  x.font = '13px Consolas, monospace';
  const lines = ['> auth: DATAPOOL-7', '> status: OPEN', '> DV 13 INTERFACE', '> nodes: 4 active'];
  lines.forEach((l, i) => { x.globalAlpha = 0.55 + (i % 2) * 0.35; x.fillText(l, 20, 60 + i * 20); });
  x.globalAlpha = 1;
  for (let i = 0; i < 5; i++) { x.fillRect(20, 148 + 0, 8 + i * 22, 6); }
  x.globalAlpha = 0.12; x.fillStyle = '#000';
  for (let y = 0; y < 192; y += 3) x.fillRect(0, y, 256, 1); // scanlines
  return c;
});

// Neon shop sign faces.
const NEON_WORDS = ['RAMEN', 'OPEN 24H', 'CHROME', 'DATA', 'BAR', 'LIQUOR', 'CLINIC', 'AMMO', 'NO ENTRY', 'ARASAKA'];
const texNeonSign = (word, color) => T(`sign|${word}|${hex(color)}`, () => {
  const { c, x } = cv(512, 160);
  x.fillStyle = '#05060b'; x.fillRect(0, 0, 512, 160);
  const col = CSS(color);
  x.strokeStyle = col; x.lineWidth = 5; x.shadowColor = col; x.shadowBlur = 26;
  x.strokeRect(14, 14, 484, 132);
  x.fillStyle = col; x.font = 'bold 74px Impact, "Arial Black", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(word, 256, 84);
  x.shadowBlur = 40; x.fillText(word, 256, 84);
  return c;
});

// Grunge overlay used as a roughness break-up on large flat prop faces.
const texGrunge = () => T('grunge', () => {
  const { c, x } = cv(256, 256);
  x.fillStyle = '#8c8c8c'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 90 + Math.random() * 130 | 0;
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 5, 1 + Math.random() * 5);
  }
  return c;
}, false);

// Spray-can tag for walls / dumpsters.
const texTag = (color) => T(`tag|${hex(color)}`, () => {
  const { c, x } = cv(256, 128);
  x.clearRect(0, 0, 256, 128);
  const col = CSS(color);
  x.strokeStyle = col; x.lineWidth = 11; x.lineCap = 'round'; x.lineJoin = 'round';
  x.shadowColor = col; x.shadowBlur = 18;
  x.beginPath();
  x.moveTo(24, 96); x.lineTo(52, 30); x.lineTo(80, 96); x.moveTo(38, 68); x.lineTo(66, 68);
  x.moveTo(104, 96); x.lineTo(104, 30); x.lineTo(140, 30); x.lineTo(140, 62); x.lineTo(104, 62); x.lineTo(146, 96);
  x.moveTo(176, 30); x.lineTo(176, 96); x.lineTo(226, 96);
  x.stroke();
  return c;
});


// ── Environment map ────────────────────────────────────────────────
// Metals with nothing to reflect render black. The app's stage has no
// scene.environment, so tokens carry their own: a tiny equirectangular
// "night city" latlong that the renderer PMREM-filters on first use. It is
// what makes chrome cyberware, rims and vehicle paint read as metal.
let _envTex = null;
function envTexture() {
  if (_envTex) return _envTex;
  const { c, x } = cv(512, 256);
  const sky = x.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0.00, '#0a1024');
  sky.addColorStop(0.34, '#132a44');
  sky.addColorStop(0.47, '#27506b');
  sky.addColorStop(0.50, '#3d6b84');
  sky.addColorStop(0.53, '#101826');
  sky.addColorStop(1.00, '#070a12');
  x.fillStyle = sky; x.fillRect(0, 0, 512, 256);
  // horizon city glow: broad neon smears the chrome can pick up
  const smears = [[40, '#00e5ff', 90], [150, '#ff2d95', 70], [265, '#ffd600', 60], [360, '#7c4dff', 80], [455, '#69f0ae', 60]];
  for (const [px, col, w] of smears) {
    const g = x.createRadialGradient(px, 128, 0, px, 128, w);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = 0.55; x.fillStyle = g;
    x.fillRect(px - w, 128 - w * 0.55, w * 2, w * 1.1);
  }
  // vertical window strips = the specular sparkle on curved metal
  x.globalAlpha = 0.5;
  for (let i = 0; i < 90; i++) {
    const px = Math.random() * 512, h = 8 + Math.random() * 46;
    x.fillStyle = ['#8fd8ff', '#ffb0d8', '#ffe9a0', '#c3b0ff'][i % 4];
    x.fillRect(px, 128 - h, 2 + Math.random() * 3, h);
  }
  // overhead key bloom so top-lit surfaces are not flat
  x.globalAlpha = 0.35;
  const top = x.createRadialGradient(256, 10, 0, 256, 10, 190);
  top.addColorStop(0, '#cfefff'); top.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = top; x.fillRect(0, 0, 512, 120);
  x.globalAlpha = 1;
  _envTex = new THREE.CanvasTexture(c);
  _envTex.mapping = THREE.EquirectangularReflectionMapping;
  _envTex.colorSpace = THREE.SRGBColorSpace;
  _texCache.set('__env', _envTex);
  return _envTex;
}

// ═══════════════════════════════════════════════════════════════════
// 4. PART LIST — collect primitives, merge by material, emit meshes
// ═══════════════════════════════════════════════════════════════════

function partList() {
  const buckets = new Map();
  const loose = [];
  return {
    // geo: shared cached BufferGeometry (never mutated), md: material descriptor
    add(geo, md, m) {
      let b = buckets.get(md.k);
      if (!b) { b = { md, geos: [] }; buckets.set(md.k, b); }
      const g = geo.clone();
      if (m) g.applyMatrix4(m);
      b.geos.push(g);
      return this;
    },
    addMesh(o) { loose.push(o); return this; },
    get count() { let c = 0; for (const b of buckets.values()) c += b.geos.length; return c; },

    // Merge each bucket into one geometry -> one mesh -> one draw call.
    flush(parent, owned, { cast = true, receive = false } = {}) {
      for (const b of buckets.values()) {
        let geos = b.geos;
        // mergeGeometries refuses to mix indexed and non-indexed sources.
        if (geos.some(g => g.index === null) && geos.some(g => g.index !== null)) {
          geos = geos.map(g => { if (g.index === null) return g; const nx = g.toNonIndexed(); g.dispose(); return nx; });
        }
        const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
        if (geos.length > 1) geos.forEach(g => g.dispose());
        if (!merged) continue;
        const mat = b.md.f();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = cast && !b.md.tr;
        mesh.receiveShadow = receive && !b.md.tr;
        if (b.md.tr) mesh.renderOrder = 2;
        parent.add(mesh);
        owned.geos.push(merged); owned.mats.push(mat);
      }
      buckets.clear();
      loose.forEach(o => parent.add(o));
      loose.length = 0;
      return parent;
    },

    // Instanced variant: one InstancedMesh per material, `places` transforms.
    flushInstanced(parent, owned, places, { cast = true, receive = false } = {}) {
      for (const b of buckets.values()) {
        let geos = b.geos;
        if (geos.some(g => g.index === null) && geos.some(g => g.index !== null)) {
          geos = geos.map(g => { if (g.index === null) return g; const nx = g.toNonIndexed(); g.dispose(); return nx; });
        }
        const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
        if (geos.length > 1) geos.forEach(g => g.dispose());
        if (!merged) continue;
        const mat = b.md.f();
        const im = new THREE.InstancedMesh(merged, mat, places.length);
        places.forEach((p, i) => im.setMatrixAt(i, p));
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = cast && !b.md.tr;
        im.receiveShadow = receive && !b.md.tr;
        im.frustumCulled = false;
        parent.add(im);
        owned.geos.push(merged); owned.mats.push(mat);
      }
      buckets.clear();
      return parent;
    }
  };
}

// Everything a token owns and must free.
function ownedBag() { return { geos: [], mats: [], texs: [] }; }

function finalize(group, meta, owned, animators) {
  group.userData = Object.assign({ kind: meta.kind, id: meta.id, name: meta.name }, meta.sourceChar ? { sourceChar: meta.sourceChar } : {});
  group.userData.animated = animators.length > 0;
  let disposed = false;
  group.dispose = function () {
    if (disposed) return; disposed = true;
    owned.geos.forEach(g => { try { g.dispose(); } catch (e) { } });
    owned.mats.forEach(m => { try { m.dispose(); } catch (e) { } });
    owned.texs.forEach(t => { try { t.dispose(); } catch (e) { } });
    owned.geos.length = owned.mats.length = owned.texs.length = 0;
    animators.length = 0;
    group.removeFromParent();
    group.clear();
  };
  group.update = function (t, dt) { for (let i = 0; i < animators.length; i++) animators[i](t, dt); };
  return group;
}

// ═══════════════════════════════════════════════════════════════════
// 5. BASE RING — the selection/ownership/HP furniture under every token
// ═══════════════════════════════════════════════════════════════════

const FACTION_COLOR = {
  pc: 0x00e5ff,       // --neon
  npc: 0xff1744,      // --red
  ally: 0x69f0ae,     // --green
  neutral: 0xffd600,  // --gold
  vehicle: 0x7c4dff,
  prop: 0x2a2a45,
  custom: 0xff2d95
};

function hpTint(f) {
  return f > 0.75 ? 0x69f0ae : f > 0.5 ? 0xffd600 : f > 0.25 ? 0xff9100 : 0xff1744;
}

/**
 * Ground furniture: soft glow, ownership ring, facing chevron, threat pips
 * and an HP arc. Returned object exposes setHP / setSelected / setThreat.
 */
function buildBase(owned, animators, opt = {}) {
  const radius = opt.radius ?? 0.62;
  const color = opt.color ?? FACTION_COLOR.neutral;
  const ex = opt.ellipseX ?? 1, ez = opt.ellipseZ ?? 1;
  const g = new THREE.Group();
  g.name = 'base';
  const parts = partList();

  // Soft bloom pool on the ground — reads instantly even at a steep angle.
  // Kept deliberately faint: createStage runs UnrealBloom at 0.9 strength, and
  // a hot ground disc will happily eat the whole token above it.
  if (opt.glow !== false) {
    const discMat = Mat.add(color, 0.085, texGlowDisc());
    parts.add(Geo.circle(radius * 1.35, 32), discMat, TRS(0, 0.006, 0, -Math.PI / 2, 0, 0));
  }
  // Dark footprint so the token separates from busy ground textures.
  parts.add(Geo.circle(radius * 0.94, 32), Mat.flat(0x05070e, null, { transparent: true, opacity: 0.5, depthWrite: false }),
    TRS(0, 0.008, 0, -Math.PI / 2, 0, 0));
  // Ownership ring. Stroke widths are absolute, not proportional: a 5 m
  // vehicle base with a proportional stroke turns into a glowing racetrack.
  const ringI = opt.ringIntensity ?? 0.85;
  const lw = Math.min(radius * 0.07, 0.05);
  parts.add(Geo.ring(radius - lw, radius, 64), Mat.glow(color, ringI), TRS(0, 0.013, 0, -Math.PI / 2, 0, 0));
  // Cardinal ticks — helps judge facing and reach on the grid.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    parts.add(Geo.box(lw * 0.7, 0.006, lw * 1.8), Mat.glow(color, ringI),
      TRS(Math.cos(a) * (radius + lw * 1.6), 0.012, Math.sin(a) * (radius + lw * 1.6), 0, -a, 0));
  }
  // Facing chevron at +Z. Flattened on its local Z (which becomes world Y
  // after the rotation) so the arrowhead never pokes through the ground.
  parts.add(Geo.cone(lw * 1.8, lw * 3.4, 3), Mat.glow(color, ringI),
    TRS(0, 0.014, radius + lw * 2.6, Math.PI / 2, 0, 0, 1, 1, 0.14));

  // Threat pips at the rear of the ring.
  const threat = Math.max(0, Math.min(4, opt.threat | 0));
  if (threat > 0) {
    const tc = THREAT_COLOR[threat];
    for (let i = 0; i < threat; i++) {
      const a = Math.PI * 0.5 + (i - (threat - 1) / 2) * 0.19;
      parts.add(Geo.box(lw * 1.1, 0.008, lw * 1.1), Mat.glow(tc, 1.6),
        TRS(Math.cos(a) * (radius + lw * 4.5), 0.012, Math.sin(a) * (radius + lw * 4.5), 0, 0, 0));
    }
  }
  parts.flush(g, owned, { cast: false, receive: false });

  // HP arc lives on its own mesh so it can be rebuilt cheaply on damage.
  let hpFrac = Math.max(0, Math.min(1, opt.hp ?? 1));
  const hpMat = new THREE.MeshStandardMaterial({
    color: hpTint(hpFrac), emissive: hpTint(hpFrac), emissiveIntensity: 0.85, roughness: 0.4, metalness: 0.1
  });
  owned.mats.push(hpMat);
  const hpMesh = new THREE.Mesh(hpArcGeo(radius, hpFrac, lw), hpMat);
  hpMesh.rotation.x = -Math.PI / 2; hpMesh.position.y = 0.011;
  hpMesh.renderOrder = 2;
  g.add(hpMesh);
  // Track HP arc geometry so dispose() frees whichever one is current.
  const hpGeoRef = { g: hpMesh.geometry };
  owned.geos.push({ dispose: () => hpGeoRef.g.dispose() });

  // Selection halo (hidden until asked for) + a slow pulse.
  const selMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide });
  owned.mats.push(selMat);
  const selGeo = new THREE.RingGeometry(radius + lw * 4.0, radius + lw * 6.2, 64);
  owned.geos.push(selGeo);
  const sel = new THREE.Mesh(selGeo, selMat);
  sel.rotation.x = -Math.PI / 2; sel.position.y = 0.016; sel.visible = false; sel.renderOrder = 3;
  g.add(sel);
  animators.push((t) => { if (sel.visible) selMat.opacity = 0.35 + Math.sin(t * 4) * 0.28; });

  g.scale.set(ex, 1, ez);

  return {
    group: g,
    radius,
    setHP(f) {
      hpFrac = Math.max(0, Math.min(1, f));
      hpGeoRef.g.dispose();
      hpGeoRef.g = hpArcGeo(radius, hpFrac, lw);
      hpMesh.geometry = hpGeoRef.g;
      const c = hpTint(hpFrac);
      hpMat.color.setHex(c); hpMat.emissive.setHex(c);
      hpMesh.visible = hpFrac > 0.001;
    },
    setSelected(on) { sel.visible = !!on; if (!on) selMat.opacity = 0; },
    setColor(c) { /* ownership colour is baked into the merged ring */ }
  };
}

function hpArcGeo(radius, frac, lw) {
  const f = Math.max(0.0001, Math.min(1, frac));
  const w = lw || Math.min(radius * 0.07, 0.05);
  const ri = radius + w * 1.1;
  // Start at the token's left and sweep forward so the bar grows toward +Z.
  return new THREE.RingGeometry(ri, ri + w * 1.5, Math.max(6, Math.ceil(64 * f)), 1, Math.PI * 0.5, f * TAU);
}

// ═══════════════════════════════════════════════════════════════════
// 6. LABELS & HOLO PORTRAIT
// ═══════════════════════════════════════════════════════════════════

const FONT_MONO = "'Share Tech Mono','Consolas','Courier New',monospace";
const FONT_DISPLAY = "'Rajdhani','Segoe UI',sans-serif";

function roundRect(x, rx, ry, w, h, r) {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.lineTo(rx + w - r, ry); x.quadraticCurveTo(rx + w, ry, rx + w, ry + r);
  x.lineTo(rx + w, ry + h - r); x.quadraticCurveTo(rx + w, ry + h, rx + w - r, ry + h);
  x.lineTo(rx + r, ry + h); x.quadraticCurveTo(rx, ry + h, rx, ry + h - r);
  x.lineTo(rx, ry + r); x.quadraticCurveTo(rx, ry, rx + r, ry);
  x.closePath();
}

/**
 * Floating name plate. Drawn at 4x the on-screen size with a heavy glow so
 * it stays legible at normal play distance / camera pitch.
 */
function buildLabel(owned, text, sub, color, opt = {}) {
  const W = 768, H = 208;
  const { c, x } = cv(W, H);
  const col = CSS(color);

  x.clearRect(0, 0, W, H);
  // chamfered plate
  x.fillStyle = 'rgba(5,7,14,0.86)';
  roundRect(x, 6, 6, W - 12, H - 12, 14); x.fill();
  x.strokeStyle = col; x.lineWidth = 4; x.globalAlpha = 0.95;
  roundRect(x, 6, 6, W - 12, H - 12, 14); x.stroke();
  // corner accents
  x.globalAlpha = 1; x.lineWidth = 7;
  [[24, 24, 1, 1], [W - 24, 24, -1, 1], [24, H - 24, 1, -1], [W - 24, H - 24, -1, -1]].forEach(([px, py, sx, sy]) => {
    x.beginPath(); x.moveTo(px + 34 * sx, py); x.lineTo(px, py); x.lineTo(px, py + 30 * sy); x.stroke();
  });
  // left ownership bar
  x.fillStyle = col; x.globalAlpha = 0.9; x.fillRect(20, 40, 8, H - 80);

  x.globalAlpha = 1; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.shadowColor = col; x.shadowBlur = 24;
  x.fillStyle = '#eaf6ff';
  x.font = `bold 72px ${FONT_DISPLAY}`;
  let name = String(text || '').toUpperCase();
  while (x.measureText(name).width > W - 90 && name.length > 3) name = name.slice(0, -1);
  x.fillText(name, 44, 96);
  x.shadowBlur = 10;
  x.fillStyle = col;
  x.font = `36px ${FONT_MONO}`;
  let s = String(sub || '');
  while (x.measureText(s).width > W - 90 && s.length > 3) s = s.slice(0, -1);
  x.fillText(s, 46, 156);
  x.shadowBlur = 0;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  owned.texs.push(tex);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: opt.depthTest !== false, sizeAttenuation: true });
  owned.mats.push(mat);
  const sp = new THREE.Sprite(mat);
  const w = opt.width ?? 1.5;
  sp.scale.set(w, w * (H / W), 1);
  sp.position.y = opt.y ?? 2.25;
  sp.renderOrder = 10;
  sp.name = 'label';
  return sp;
}

/**
 * Optional holo-plate that projects char.portrait above the token. The image
 * loads asynchronously; the frame renders immediately and the photo is
 * composited in when it arrives.
 */
function buildPortraitPlate(owned, dataUrl, color, opt = {}) {
  const W = 320, H = 400;
  const { c, x } = cv(W, H);
  const col = CSS(color);
  const draw = (img) => {
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(4,8,16,0.72)';
    roundRect(x, 8, 8, W - 16, H - 16, 10); x.fill();
    if (img) {
      x.save();
      roundRect(x, 22, 22, W - 44, H - 74, 6); x.clip();
      const s = Math.max((W - 44) / img.width, (H - 74) / img.height);
      x.globalAlpha = 0.92;
      x.drawImage(img, 22 + ((W - 44) - img.width * s) / 2, 22 + ((H - 74) - img.height * s) / 2, img.width * s, img.height * s);
      x.restore();
    }
    // holo scanlines + colour fringe
    x.globalAlpha = 0.20; x.fillStyle = col;
    for (let y = 22; y < H - 52; y += 4) x.fillRect(22, y, W - 44, 1);
    x.globalAlpha = 1;
    x.strokeStyle = col; x.lineWidth = 4; x.shadowColor = col; x.shadowBlur = 18;
    roundRect(x, 18, 18, W - 36, H - 66, 8); x.stroke();
    x.shadowBlur = 0;
    x.fillStyle = col; x.font = `26px ${FONT_MONO}`; x.textAlign = 'center';
    x.fillText('// ID VERIFIED', W / 2, H - 22);
    if (tex) tex.needsUpdate = true;
  };
  let tex = null;
  draw(null);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  owned.texs.push(tex);
  if (dataUrl) {
    const img = new Image();
    img.onload = () => draw(img);
    img.onerror = () => { };
    img.src = dataUrl;
  }
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  owned.mats.push(mat);
  const hh = opt.height ?? 0.72;
  const geo = new THREE.PlaneGeometry(hh * (W / H), hh);
  owned.geos.push(geo);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(opt.x ?? 0.62, opt.y ?? 1.62, 0);
  m.rotation.y = -0.35;
  m.renderOrder = 9;
  m.name = 'portrait';
  return m;
}

// ═══════════════════════════════════════════════════════════════════
// 7. HUMANOID RIG
// Built at a nominal 1.80 m and then scaled by BODY. Poses are defined by
// joint positions and filled in with capsules, which is what lets weapon
// stances and cyberlimbs drop in without re-authoring the whole body.
// ═══════════════════════════════════════════════════════════════════

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _up = new THREE.Vector3(0, 1, 0);

// A capsule spanning two points — the workhorse for limbs.
function bone(parts, md, a, b, r) {
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 1e-4) return;
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
  const m = new THREE.Matrix4().compose(mid, q, V(1, 1, 1));
  parts.add(Geo.cap(r, Math.max(0.02, len - r * 1.6), 5, 10), md, m);
}
function joint(parts, md, p, r, sx = 1, sy = 1, sz = 1) {
  parts.add(Geo.sph(r, 10, 8), md, TRS(p.x, p.y, p.z, 0, 0, 0, sx, sy, sz));
}

// Landmarks for a 1.80 m figure.
const L = {
  hip: 0.935, waist: 1.03, shoulderY: 1.44, shoulderX: 0.178,
  headY: 1.668, knee: 0.485, ankle: 0.115, legX: 0.105
};

const TORSO_PROFILE = [
  [0.02, 0.975], [0.146, 0.995], [0.152, 1.06], [0.149, 1.12], [0.158, 1.20],
  [0.172, 1.29], [0.180, 1.375], [0.171, 1.445], [0.138, 1.492], [0.072, 1.508], [0.02, 1.512]
];
const JACKET_PROFILE = TORSO_PROFILE.slice(1, 9).map(p => [p[0] + 0.026, p[1]]);
const VEST_PROFILE = [
  [0.166, 1.055], [0.176, 1.13], [0.192, 1.22], [0.204, 1.31], [0.208, 1.39], [0.196, 1.452], [0.150, 1.492]
];

// ── palettes ───────────────────────────────────────────────────────
const SKIN = [0xf4d3ba, 0xecbf96, 0xd8a273, 0xbc7f52, 0x93603a, 0x6d452b, 0x4b3020];
const HAIR_NATURAL = [0x14100e, 0x2b1e15, 0x4d3520, 0x7d5c30, 0xb59a6d, 0x8f8f96, 0xdedede];
const HAIR_NEON = [0x00e5ff, 0xff2d95, 0x69f0ae, 0xffd600, 0x7c4dff, 0xff5722, 0xff1744];

// Per-role look: base cloth colours, neon accent, bulk and default kit.
// Colours are deliberately mid-tone rather than "cyberpunk black": the shared
// lighting rig is a cool cyan key over a near-black ground, and anything below
// ~0x30 reads as an unlit silhouette at play distance.
const ROLE_STYLE = {
  Solo:      { cloth: [0x515c6b, 0x44505c, 0x5c6b50, 0x6b6350], jacket: [0x38414d, 0x4a5642, 0x59473c], accent: 0xff1744, bulk: 1.06, plateBias: 5, kit: 'solo' },
  Netrunner: { cloth: [0x39415a, 0x453a63, 0x2e4a5c],           jacket: [0x2c3350, 0x3d2c63, 0x24485c], accent: 0x00e5ff, bulk: 0.92, plateBias: 0, kit: 'netrunner' },
  Tech:      { cloth: [0x8a6a2e, 0x5a6152, 0x84532a], jacket: [0xa07523, 0x466a66, 0x7e5a22], accent: 0xff9100, bulk: 1.00, plateBias: 1, kit: 'tech' },
  Medtech:   { cloth: [0xe4eaef, 0xc3d0d6, 0x4f6f6d],           jacket: [0xeff4f7, 0x396b67, 0xd2dee2], accent: 0x69f0ae, bulk: 0.97, plateBias: 1, kit: 'medtech' },
  Media:     { cloth: [0x41527a, 0x545c73, 0x66495a],           jacket: [0x32477c, 0x593d63, 0x3a4f66], accent: 0xff2d95, bulk: 0.96, plateBias: 1, kit: 'media' },
  Exec:      { cloth: [0x3b4150, 0x4b4f5e, 0x413f57],           jacket: [0x2c313d, 0x454a58, 0x4e5568], accent: 0xffd600, bulk: 0.98, plateBias: 1, kit: 'exec' },
  Fixer:     { cloth: [0x6b3f52, 0x5e4030, 0x4a4460],           jacket: [0x8c3f33, 0x63305e, 0x59392a], accent: 0xffd600, bulk: 1.00, plateBias: 2, kit: 'fixer' },
  Lawman:    { cloth: [0x323d5c, 0x2b3760, 0x3b4568],           jacket: [0x252f57, 0x33447a],           accent: 0x2979ff, bulk: 1.05, plateBias: 6, kit: 'lawman' },
  Nomad:     { cloth: [0x9c6636, 0x7d4f2c, 0xa9743c],           jacket: [0xb87434, 0x8a5a2e, 0xc2803c], accent: 0xff9100, bulk: 1.04, plateBias: 3, kit: 'nomad' },
  Rockerboy: { cloth: [0x3a3a46, 0x4a374a, 0x30303c],           jacket: [0x2e2e3a, 0x552040, 0x3a2050], accent: 0xff2d95, bulk: 0.97, plateBias: 1, kit: 'rocker' }
};
const DEFAULT_STYLE = { cloth: [0x4c505e, 0x3e4350], jacket: [0x363b46], accent: 0x00e5ff, bulk: 1.0, plateBias: 1, kit: 'none' };

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length];

function shade(c, amt) {
  const col = new THREE.Color(hex(c));
  if (amt >= 0) col.lerp(new THREE.Color(0xffffff), amt); else col.lerp(new THREE.Color(0x000000), -amt);
  return col.getHex();
}

// ── sheet → visual spec ────────────────────────────────────────────
function weaponClass(w) {
  const s = `${(w && w.name) || ''} ${(w && w.damage) || ''}`;
  if (!s.trim()) return 'none';
  if (/lmg|hmg|grenade|launch|rocket|minigun|heavy weapon|\bheavy\b|flamethrow|railgun|autocannon/i.test(s)) return 'heavy';
  if (/sword|katana|blade|knife|axe|club|baton|machete|melee|spear|hammer|monoblade|scratcher|ripper|wolver|chainsaw|nunchaku|naginata|kendachi|brawl/i.test(s)) return 'melee';
  if (/rifle|carbine|shotgun|sniper|assault|shoulder arm|\bsmg\b|submachine|\bbow\b|crossbow/i.test(s)) return 'rifle';
  if (/pistol|revolver|hold ?out|handgun|\bgun\b|blaster|dart/i.test(s)) return 'pistol';
  return 'pistol';
}

function readSheet(char) {
  const stats = char.stats || {};
  const BODY = Math.max(1, Math.min(14, num(stats.BODY, 5)));
  const maxHp = num(char.maxHp, 0) || (10 + 5 * BODY);
  const hp = (char.hp === undefined || char.hp === null) ? maxHp : num(char.hp, maxHp);
  const armor = char.armor || {};
  const bodySP = num(armor.bodySP, 0), headSP = num(armor.headSP, 0);
  const cyberList = (char.cyberware || []).map(c => (typeof c === 'string' ? c : (c && c.name) || '')).join(' | ');
  const gearList = (char.gear || []).map(c => (typeof c === 'string' ? c : (c && c.name) || '')).join(' | ');
  const rawRole = String(char.role || '');
  const role = ROLE_STYLE[rawRole] ? rawRole
    : (Object.keys(ROLE_STYLE).find(r => new RegExp(r, 'i').test(rawRole)) || 'Solo');
  const w0 = (char.weapons || [])[0];
  return {
    role, BODY, hp, maxHp,
    hpFrac: maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 1,
    dead: hp <= 0,
    bodySP, headSP,
    isNPC: !!char.isNPC,
    weapon: weaponClass(w0),
    weaponName: (w0 && w0.name) || '',
    portrait: char.portrait || null,
    cy: {
      arm:    /cyber\s*arm|gorilla arm|big knuck|rippers?|wolvers|scratchers|slice n dice|shoulder cannon|popup/i.test(cyberList),
      leg:    /cyber\s*legs?\b|jump booster|talon|web foot|grip foot/i.test(cyberList),
      eye:    /cyber\s*(eye|optic)|kiroshi|optical|targeting scope|low ?light|image enhance|teleoptic|virtuality|anti-?dazzle/i.test(cyberList),
      neural: /neural|interface plug|chipware|data ?term|memory chip|sandevistan|kerenzikov|pain editor|olfactory/i.test(cyberList),
      borg:   /borg|linear frame|dragoon|artificial shoulder|grafted muscle|bone lace|skeleton|implanted linear/i.test(cyberList),
      skin:   /skin ?weave|subdermal|armor ?plating|toughened/i.test(cyberList),
      audio:  /cyber ?audio|amplified hearing|radio|scrambler|level damper|bug detect/i.test(cyberList)
    },
    gear: { shield: /shield/i.test(gearList) || /shield/i.test(armor.shield || '') }
  };
}

function paletteFor(st, rand) {
  const S = ROLE_STYLE[st.role] || DEFAULT_STYLE;
  const skin = pick(rand, SKIN);
  const neonHair = rand() < (S.kit === 'rocker' ? 0.7 : S.kit === 'netrunner' ? 0.45 : 0.16);
  const hairCol = neonHair ? pick(rand, HAIR_NEON) : pick(rand, HAIR_NATURAL);
  const cloth = pick(rand, S.cloth);
  const jacket = pick(rand, S.jacket);
  const pants = pick(rand, S.cloth);
  const accent = S.accent;
  return {
    accent,
    skin: Mat.skin(skin),
    shirt: Mat.cloth(cloth, 0.9),
    pants: Mat.cloth(pants === cloth ? shade(pants, -0.22) : pants, 0.93),
    // Deliberately few buckets: every distinct material is one more draw call
    // per token, and 30 tokens on screen is the design target. `jacket` doubles
    // as the coat (DoubleSide), `strap` doubles as every dark webbing part, and
    // glow/glowHot collapsed into a single accent emissive.
    jacket: Mat.coat(jacket),
    coat: Mat.coat(jacket),
    boot: Mat.leather(shade(jacket, -0.32)),
    dark: Mat.leather(0x3d434f),
    strap: Mat.leather(0x3d434f),
    plate: Mat.plate(shade(jacket, 0.16)),
    plateDark: Mat.plate(0x4e5665),
    chrome: Mat.chrome(0xd6e0ec),
    chromeDark: Mat.chrome(0xd6e0ec),
    gun: Mat.metal(0x4d5462, 0.42),
    hair: neonHair ? Mat.glow(hairCol, 0.9) : Mat.cloth(hairCol, 0.68),
    glow: Mat.glow(accent, 1.35),
    glowHot: Mat.glow(accent, 1.35),
    eye: Mat.cloth(0x14171f, 0.4)
  };
}

// ── weapons (local space: grip at origin, muzzle toward +Z) ────────
const mul = (a, b) => new THREE.Matrix4().multiplyMatrices(a, b);

function addPistol(parts, P, m) {
  const put = (g, md, mm) => parts.add(g, md, mul(m, mm));
  put(Geo.box(0.042, 0.052, 0.19), P.gun, TRS(0, 0.058, 0.055));
  put(Geo.box(0.036, 0.035, 0.055), P.gun, TRS(0, 0.062, 0.165));
  put(Geo.box(0.036, 0.105, 0.05), P.gun, TRS(0, -0.015, -0.022, 0.26, 0, 0));
  put(Geo.torus(0.028, 0.007, 6, 12), P.gun, TRS(0, 0.01, 0.02, 0, Math.PI / 2, 0));
  put(Geo.box(0.012, 0.008, 0.012), P.glowHot, TRS(0, 0.09, 0.135));
  put(Geo.box(0.008, 0.006, 0.07), P.glow, TRS(0.023, 0.04, 0.06));
}
function addRifle(parts, P, m) {
  const put = (g, md, mm) => parts.add(g, md, mul(m, mm));
  put(Geo.box(0.058, 0.10, 0.36), P.gun, TRS(0, 0, 0.02));
  put(Geo.cyl(0.017, 0.017, 0.34, 8), P.gun, TRS(0, 0.018, 0.35, Math.PI / 2, 0, 0));
  put(Geo.cyl(0.028, 0.024, 0.07, 8), P.gun, TRS(0, 0.018, 0.535, Math.PI / 2, 0, 0));
  put(Geo.box(0.048, 0.09, 0.24), P.gun, TRS(0, -0.012, -0.27));
  put(Geo.box(0.05, 0.16, 0.07), P.gun, TRS(0, -0.12, -0.05, -0.22, 0, 0));
  put(Geo.box(0.038, 0.10, 0.05), P.gun, TRS(0, -0.095, -0.14, 0.2, 0, 0));
  put(Geo.cyl(0.026, 0.026, 0.15, 8), P.gun, TRS(0, 0.085, 0.09, Math.PI / 2, 0, 0));
  put(Geo.cyl(0.021, 0.021, 0.012, 10), P.glowHot, TRS(0, 0.085, 0.166, Math.PI / 2, 0, 0));
  put(Geo.box(0.014, 0.007, 0.26), P.glow, TRS(0.031, 0.02, 0.06));
  put(Geo.box(0.014, 0.007, 0.26), P.glow, TRS(-0.031, 0.02, 0.06));
}
function addBlade(parts, P, m) {
  const put = (g, md, mm) => parts.add(g, md, mul(m, mm));
  put(Geo.box(0.013, 0.046, 0.70), P.chrome, TRS(0, 0, 0.46));
  put(Geo.cone(0.023, 0.10, 4), P.chrome, TRS(0, 0, 0.855, Math.PI / 2, 0, 0));
  put(Geo.box(0.004, 0.012, 0.72), P.glowHot, TRS(0.008, 0.024, 0.46));
  put(Geo.box(0.062, 0.016, 0.028), P.chromeDark, TRS(0, 0, 0.10));
  put(Geo.cyl(0.017, 0.019, 0.20, 8), P.strap, TRS(0, 0, -0.02, Math.PI / 2, 0, 0));
  put(Geo.sph(0.022, 8, 6), P.chromeDark, TRS(0, 0, -0.125));
}
function addHeavy(parts, P, m) {
  const put = (g, md, mm) => parts.add(g, md, mul(m, mm));
  put(Geo.box(0.10, 0.14, 0.50), P.gun, TRS(0, 0.01, 0.06));
  put(Geo.cyl(0.032, 0.032, 0.40, 8), P.gun, TRS(0, 0.03, 0.44, Math.PI / 2, 0, 0));
  put(Geo.cyl(0.05, 0.042, 0.10, 10), P.gun, TRS(0, 0.03, 0.66, Math.PI / 2, 0, 0));
  put(Geo.cyl(0.115, 0.115, 0.08, 12), P.gun, TRS(-0.085, -0.09, -0.04, 0, 0, Math.PI / 2));
  put(Geo.torus(0.10, 0.012, 6, 14), P.glow, TRS(-0.125, -0.09, -0.04, 0, 0, Math.PI / 2));
  put(Geo.box(0.045, 0.11, 0.05), P.gun, TRS(0, -0.10, -0.10, 0.18, 0, 0));
  put(Geo.box(0.02, 0.01, 0.30), P.glow, TRS(0.055, 0.085, 0.10));
}

// Weapon stance table: where the hands go + how to place the weapon.
function weaponRig(cls, P) {
  switch (cls) {
    case 'rifle': return {
      L: V(-0.150, 1.275, 0.42), R: V(0.115, 1.210, 0.17),
      place: (parts) => addRifle(parts, P, TRS(0.11, 1.215, 0.18, -0.13, -0.40, 0.06))
    };
    case 'heavy': return {
      L: V(-0.165, 1.045, 0.34), R: V(0.135, 0.99, 0.10),
      place: (parts) => addHeavy(parts, P, TRS(0.13, 1.02, 0.10, -0.05, -0.26, 0.02))
    };
    case 'melee': return {
      L: V(-0.245, 0.90, 0.02), R: V(0.245, 0.985, -0.10),
      place: (parts) => addBlade(parts, P, TRS(0.245, 0.985, -0.10, 0.62, 0.18, 0))
    };
    case 'pistol': return {
      L: V(-0.238, 0.895, 0.03), R: V(0.155, 1.115, 0.30),
      place: (parts) => addPistol(parts, P, TRS(0.155, 1.10, 0.30, -0.16, -0.16, 0))
    };
    default: return { L: V(-0.238, 0.895, 0.03), R: V(0.238, 0.895, 0.03), place: () => {} };
  }
}

// ── the body ───────────────────────────────────────────────────────
function buildHumanoid(parts, P, st, rand, kit) {
  const cy = st.cy;
  const sp = st.bodySP + (ROLE_STYLE[st.role] || DEFAULT_STYLE).plateBias;
  const heavyArmor = sp >= 11, midArmor = sp >= 7, lightArmor = sp >= 4;
  const sleeveless = kit === 'solo' && rand() < 0.45;
  const hooded = (kit === 'netrunner' && rand() < 0.55) || (kit === 'nomad' && rand() < 0.25);
  const wr = weaponRig(st.weapon, P);

  // ── legs ──
  for (const s of [-1, 1]) {
    const stride = s > 0 ? 0.055 : -0.045;
    const legMat = cy.leg ? P.chromeDark : P.pants;
    const hipP  = V(s * L.legX, L.hip - 0.02, stride * 0.35);
    const kneeP = V(s * (L.legX + 0.012), L.knee, stride * 0.9);
    const ankP  = V(s * (L.legX + 0.006), L.ankle + 0.02, stride + 0.005);
    bone(parts, legMat, hipP, kneeP, 0.082);
    joint(parts, legMat, kneeP, 0.068, 1, 0.9, 1);
    bone(parts, legMat, kneeP, ankP, 0.060);
    if (cy.leg) {
      bone(parts, P.chrome, V(kneeP.x + s * 0.055, kneeP.y - 0.01, kneeP.z - 0.05),
                            V(ankP.x + s * 0.05, ankP.y + 0.06, ankP.z - 0.05), 0.016);
      parts.add(Geo.torus(0.062, 0.014, 6, 12), P.chrome, TRS(kneeP.x, kneeP.y, kneeP.z, 0, Math.PI / 2, 0));
      parts.add(Geo.sph(0.020, 8, 6), P.glowHot, TRS(kneeP.x + s * 0.062, kneeP.y, kneeP.z + 0.03));
    }
    const bz = stride + 0.03;
    parts.add(Geo.box(0.132, 0.135, 0.26), P.boot, TRS(s * L.legX, 0.072, bz, 0, s * 0.05, 0));
    parts.add(Geo.box(0.124, 0.085, 0.10), P.boot, TRS(s * L.legX, 0.052, bz + 0.155, 0, s * 0.05, 0));
    parts.add(Geo.box(0.144, 0.032, 0.38), P.dark, TRS(s * L.legX, 0.016, bz + 0.03, 0, s * 0.05, 0));
    if (heavyArmor) {
      // Plates are laid along the same joint chain as the limb they cover, so
      // they stay coaxial. Placing them by hand leaves the leg poking through
      // the shell in a scalloped pattern wherever the axes diverge.
      bone(parts, P.plate, hipP.clone().lerp(kneeP, 0.14), hipP.clone().lerp(kneeP, 0.86), 0.093);
      bone(parts, P.plateDark, kneeP.clone().lerp(ankP, 0.12), kneeP.clone().lerp(ankP, 0.82), 0.071);
      parts.add(Geo.sph(0.083, 10, 7, 0, TAU, 0, Math.PI * 0.55), P.plate,
        TRS(kneeP.x, kneeP.y + 0.008, kneeP.z + 0.018, 1.30, 0, 0));
    }
    if (kit === 'solo' || kit === 'lawman') {
      parts.add(Geo.box(0.075, 0.16, 0.055), P.strap, TRS(s * (L.legX + 0.085), 0.72, 0.03, 0, s * 0.2, 0));
      parts.add(Geo.box(0.05, 0.022, 0.012), P.glow, TRS(s * (L.legX + 0.085), 0.79, 0.062, 0, s * 0.2, 0));
    }
  }

  // ── pelvis + torso ──
  parts.add(Geo.cap(0.112, 0.055, 5, 12), P.pants, TRS(0, L.hip, 0, 0, 0, 0, 1.22, 1, 0.80));
  parts.add(Geo.lathe('torso', TORSO_PROFILE, 16), P.shirt, TRS(0, 0, 0, 0, 0, 0, 1, 1, 0.66));
  parts.add(Geo.torus(0.158, 0.026, 6, 20), P.strap, TRS(0, L.waist, 0, -Math.PI / 2, 0, 0, 1, 1, 0.70));
  parts.add(Geo.box(0.06, 0.048, 0.03), P.chromeDark, TRS(0, L.waist, 0.115));

  if (kit !== 'medtech' || rand() < 0.5) {
    parts.add(Geo.lathe('jacket', JACKET_PROFILE, 16, 0.44, TAU - 0.88), P.coat, TRS(0, 0, 0, 0, 0, 0, 1, 1, 0.68));
  }
  const longCoat = kit === 'exec' || kit === 'nomad' || kit === 'fixer'
    || (kit === 'netrunner' && rand() < 0.4) || (kit === 'rocker' && rand() < 0.35);
  if (longCoat) {
    parts.add(Geo.cyl(0.198, 0.285, 0.50, 16, 1, true, 0.5, TAU - 1.0), P.coat, TRS(0, 0.78, 0, 0, 0, 0, 1, 1, 0.82));
    parts.add(Geo.torus(0.20, 0.014, 5, 18, TAU - 1.0), P.coat, TRS(0, 1.03, 0, -Math.PI / 2, -0.5, 0, 1, 1, 0.82));
  }
  parts.add(Geo.cyl(0.118, 0.132, 0.15, 12, 1, true, 0.95, TAU - 1.9), P.coat, TRS(0, 1.545, 0, -0.12, 0, 0, 1, 1, 0.80));

  // ── armour plating driven by SP ──
  if (midArmor) {
    parts.add(Geo.lathe('vest', VEST_PROFILE, 14), P.plate, TRS(0, 0, 0, 0, 0, 0, 1, 1, 0.66));
    for (const s of [-1, 1]) {
      parts.add(Geo.sph(0.098, 12, 8, 0, TAU, 0, Math.PI * 0.56), P.plate,
        TRS(s * 0.188, 1.408, 0, 0, 0, -s * 0.20, 1.0, 0.90, 0.86));
      parts.add(Geo.torus(0.080, 0.011, 5, 12, Math.PI), P.plateDark, TRS(s * 0.188, 1.385, 0, 0, 0, -s * 0.20));
    }
    parts.add(Geo.box(0.10, 0.13, 0.035), P.plateDark, TRS(0, 1.30, 0.135, -0.08, 0, 0));
    parts.add(Geo.box(0.055, 0.012, 0.012), P.glow, TRS(0, 1.345, 0.156));
  } else if (lightArmor) {
    parts.add(Geo.box(0.30, 0.052, 0.02), P.strap, TRS(0, 1.28, 0.128, -0.06, 0, 0));
    parts.add(Geo.box(0.075, 0.10, 0.035), P.plateDark, TRS(0.078, 1.24, 0.13, -0.06, 0, 0));
    parts.add(Geo.box(0.075, 0.10, 0.035), P.plateDark, TRS(-0.078, 1.24, 0.13, -0.06, 0, 0));
  }
  if (heavyArmor) {
    // Gorget: kept low and short so the head still stands clear of the shoulders.
    parts.add(Geo.cyl(0.108, 0.116, 0.07, 12, 1, true), P.plateDark, TRS(0, 1.498, 0, 0, 0, 0, 1, 1, 0.85));
    for (let i = 0; i < 4; i++) parts.add(Geo.box(0.11, 0.035, 0.045), P.plateDark, TRS(0, 1.16 + i * 0.075, -0.128));
  }
  if (cy.borg) {
    for (let i = 0; i < 5; i++) parts.add(Geo.box(0.055, 0.03, 0.05), P.chromeDark, TRS(0, 1.10 + i * 0.085, -0.135));
    parts.add(Geo.box(0.014, 0.42, 0.014), P.glow, TRS(0.038, 1.28, -0.145));
    parts.add(Geo.box(0.014, 0.42, 0.014), P.glow, TRS(-0.038, 1.28, -0.145));
  }

  // ── arms ──
  for (const s of [-1, 1]) {
    const chromeArm = cy.arm && s > 0;
    const upperMat = chromeArm ? P.chrome : (sleeveless ? P.skin : (midArmor ? P.plate : P.jacket));
    const foreMat  = chromeArm ? P.chrome : (sleeveless ? P.skin : P.jacket);
    const handMat  = chromeArm ? P.chrome : ((kit === 'solo' || kit === 'lawman' || kit === 'nomad') ? P.strap : P.skin);
    const S = V(s * L.shoulderX, L.shoulderY, 0);
    const H = (s > 0 ? wr.R : wr.L).clone();
    const E = S.clone().add(H).multiplyScalar(0.5);
    E.x += s * 0.055; E.z -= 0.075; E.y -= 0.01;

    parts.add(Geo.sph(0.088, 12, 8), upperMat, TRS(S.x, S.y, S.z, 0, 0, 0, 1, 0.95, 0.95));
    bone(parts, upperMat, S, E, 0.058);
    joint(parts, foreMat, E, 0.052);
    bone(parts, foreMat, E, H, 0.048);
    parts.add(Geo.sph(0.056, 10, 8), handMat, TRS(H.x, H.y, H.z, 0, 0, 0, 0.85, 1.05, 0.72));

    if (chromeArm) {
      parts.add(Geo.torus(0.062, 0.014, 6, 12), P.chromeDark, TRS(S.x, S.y - 0.06, S.z, 0, 0, -s * 0.1));
      parts.add(Geo.torus(0.055, 0.013, 6, 12), P.chromeDark, TRS(E.x, E.y, E.z, 0, 0, -s * 0.1));
      const mid = E.clone().add(H).multiplyScalar(0.5);
      parts.add(Geo.box(0.012, 0.09, 0.012), P.glowHot, TRS(mid.x + s * 0.048, mid.y, mid.z));
      parts.add(Geo.sph(0.020, 8, 6), P.glowHot, TRS(E.x + s * 0.05, E.y + 0.01, E.z));
    } else if (midArmor) {
      bone(parts, P.plateDark, E.clone().lerp(H, 0.12), E.clone().lerp(H, 0.72), 0.059);
    }
  }
  wr.place(parts, P);

  if (st.weapon !== 'pistol' && st.weapon !== 'none') {
    parts.add(Geo.box(0.055, 0.14, 0.075), P.strap, TRS(-0.16, 0.94, -0.03, 0, -0.25, 0.1));
    parts.add(Geo.box(0.032, 0.05, 0.05), P.gun, TRS(-0.165, 1.02, -0.02, 0, -0.25, 0.1));
  }

  // ── neck + head ──
  parts.add(Geo.cyl(0.052, 0.058, 0.10, 10), P.skin, TRS(0, 1.53, 0));
  parts.add(Geo.sph(0.102, 14, 11), P.skin, TRS(0, L.headY, 0.004, 0, 0, 0, 1.0, 1.14, 1.06));
  parts.add(Geo.sph(0.079, 12, 9), P.skin, TRS(0, 1.598, 0.016, 0, 0, 0, 0.93, 0.80, 1.02));
  parts.add(Geo.cone(0.021, 0.048, 6), P.skin, TRS(0, 1.652, 0.098, Math.PI / 2, 0, 0));
  for (const s of [-1, 1]) parts.add(Geo.sph(0.028, 8, 6), P.skin, TRS(s * 0.099, 1.656, -0.004, 0, 0, 0, 0.45, 1, 0.85));

  const helmet = st.headSP >= 7;
  if (!helmet) {
    const eyeMat = cy.eye ? P.glowHot : P.eye;
    for (const s of [-1, 1]) {
      parts.add(Geo.sph(cy.eye ? 0.021 : 0.017, 8, 6), eyeMat, TRS(s * 0.038, 1.674, 0.086, 0, 0, 0, 1, 1, 0.6));
    }
    if (cy.eye) parts.add(Geo.box(0.135, 0.008, 0.008), P.glow, TRS(0, 1.706, 0.092));
    parts.add(Geo.box(0.132, 0.018, 0.028), P.hair, TRS(0, 1.716, 0.076));
    addHair(parts, P, rand, hooded, cy);
  } else {
    parts.add(Geo.sph(0.122, 14, 10, 0, TAU, 0, Math.PI * 0.62), P.plate, TRS(0, 1.666, -0.004, 0.08, 0, 0, 1.02, 1.1, 1.08));
    parts.add(Geo.torus(0.118, 0.016, 6, 16), P.plateDark, TRS(0, 1.678, -0.004, Math.PI / 2 - 0.1, 0, 0, 1.02, 1.06, 1));
    parts.add(Geo.sph(0.118, 14, 8, 0, TAU, Math.PI * 0.30, Math.PI * 0.24), Mat.glass(0x060a14), TRS(0, 1.666, 0.012, 0, 0, 0, 1.02, 1.12, 1.08));
    parts.add(Geo.box(0.15, 0.012, 0.012), P.glowHot, TRS(0, 1.664, 0.098));
    if (st.headSP >= 11) parts.add(Geo.box(0.115, 0.075, 0.06), P.plateDark, TRS(0, 1.578, 0.07, 0.1, 0, 0));
    if (cy.audio) for (const s of [-1, 1]) parts.add(Geo.cyl(0.036, 0.036, 0.035, 8), P.chromeDark, TRS(s * 0.112, 1.66, 0, 0, 0, Math.PI / 2));
  }
  if (hooded && !helmet) {
    parts.add(Geo.sph(0.152, 14, 10, 0, TAU, 0, Math.PI * 0.72), P.coat, TRS(0, 1.655, -0.028, 0.16, 0, 0, 1.0, 1.06, 1.14));
  }
  if (cy.neural) {
    for (let i = 0; i < 3; i++) parts.add(Geo.cyl(0.011, 0.011, 0.016, 6), P.chrome, TRS(-0.026 + i * 0.026, 1.556, -0.062, Math.PI / 2, 0, 0));
    parts.add(Geo.sph(0.010, 6, 5), P.glowHot, TRS(0.052, 1.556, -0.058));
  }
  if (cy.audio && !helmet) {
    parts.add(Geo.box(0.026, 0.055, 0.022), P.chromeDark, TRS(0.106, 1.652, -0.01));
    parts.add(Geo.sph(0.011, 6, 5), P.glow, TRS(0.118, 1.672, 0.006));
  }
  if (cy.skin) {
    for (const s of [-1, 1]) parts.add(Geo.box(0.05, 0.028, 0.006), P.chromeDark, TRS(s * 0.055, 1.61, 0.078, 0, 0, s * 0.3));
  }
  return { kit, hooded, helmet, midArmor, heavyArmor };
}

function addHair(parts, P, rand, hooded, cy) {
  if (hooded) return;
  const style = Math.floor(rand() * 7);
  const capTop = () => parts.add(Geo.sph(0.106, 14, 9, 0, TAU, 0, Math.PI * 0.44), P.hair, TRS(0, 1.672, -0.008, 0.10, 0, 0, 1.02, 1.06, 1.06));
  switch (style) {
    case 0: capTop(); break;                                   // buzz
    case 1:                                                    // mohawk
      parts.add(Geo.sph(0.104, 12, 8, 0, TAU, 0, Math.PI * 0.44), P.dark, TRS(0, 1.670, -0.006, 0.08, 0, 0, 1.02, 1.06, 1.06));
      for (let i = 0; i < 7; i++) {
        const t = i / 6, h = 0.09 + Math.sin(t * Math.PI) * 0.10;
        parts.add(Geo.box(0.036, h, 0.045), P.hair, TRS(0, 1.762 + h * 0.35, 0.075 - t * 0.155, -0.12 + t * 0.24, 0, 0));
      }
      break;
    case 2:                                                    // long
      capTop();
      parts.add(Geo.sph(0.118, 12, 9), P.hair, TRS(0, 1.60, -0.052, 0, 0, 0, 0.98, 1.25, 0.78));
      parts.add(Geo.cap(0.052, 0.14, 4, 8), P.hair, TRS(0, 1.48, -0.10, 0.1, 0, 0, 1.3, 1, 0.6));
      break;
    case 3:                                                    // topknot
      capTop();
      parts.add(Geo.sph(0.052, 10, 8), P.hair, TRS(0, 1.79, -0.062));
      parts.add(Geo.cap(0.026, 0.12, 4, 6), P.hair, TRS(0, 1.71, -0.10, -0.5, 0, 0));
      break;
    case 4:                                                    // spikes
      capTop();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU, r = 0.062 + rand() * 0.028;
        parts.add(Geo.cone(0.021, 0.10 + rand() * 0.06, 5), P.hair,
          TRS(Math.cos(a) * r, 1.76, Math.sin(a) * r - 0.006, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5));
      }
      break;
    case 5:                                                    // undercut sweep
      parts.add(Geo.sph(0.104, 12, 8, 0, TAU, 0, Math.PI * 0.42), P.dark, TRS(0, 1.668, -0.004, 0, 0, 0, 1.02, 1.1, 1.06));
      parts.add(Geo.sph(0.112, 12, 9, 0, Math.PI * 1.25, 0, Math.PI * 0.55), P.hair, TRS(0, 1.676, -0.004, 0.06, -0.6, 0.12, 1.02, 1.06, 1.06));
      break;
    default:                                                   // locs
      capTop();
      for (let i = 0; i < 10; i++) {
        const a = Math.PI * 0.15 + (i / 9) * Math.PI * 1.7;
        parts.add(Geo.cap(0.017, 0.13 + rand() * 0.07, 3, 6), P.hair,
          TRS(Math.cos(a) * 0.088, 1.62 - rand() * 0.05, Math.sin(a) * 0.082 - 0.01, 0.12, 0, 0));
      }
      break;
  }
  if (cy.borg) parts.add(Geo.sph(0.106, 12, 8, 0, TAU, 0, Math.PI * 0.34), P.chrome, TRS(0, 1.672, -0.03, 0.3, 0, 0, 1.02, 1.06, 1.02));
}

// ── role kit: the silhouette-defining extras ───────────────────────
function applyRoleKit(parts, P, st, rand, ctx, animators, rig, owned) {
  switch (ctx.kit) {
    case 'netrunner': {
      // cyberdeck on the lower back + interface cable running up to the nape
      parts.add(Geo.box(0.20, 0.24, 0.075), P.plateDark, TRS(0, 1.15, -0.185, 0.12, 0, 0));
      parts.add(Geo.box(0.155, 0.10, 0.012), P.glowHot, TRS(0, 1.20, -0.226, 0.12, 0, 0));
      for (let i = 0; i < 4; i++) parts.add(Geo.box(0.018, 0.018, 0.01), P.glow, TRS(-0.062 + i * 0.041, 1.085, -0.223, 0.12, 0, 0));
      parts.add(Geo.tube('netcable', [
        [0.048, 1.552, -0.058], [0.10, 1.50, -0.15], [0.115, 1.38, -0.235], [0.07, 1.27, -0.245], [0.02, 1.245, -0.228]
      ], 22, 0.012, 5), P.glowHot);
      if (!ctx.helmet) {
        parts.add(Geo.box(0.185, 0.052, 0.03), P.plateDark, TRS(0, 1.676, 0.078));
        parts.add(Geo.box(0.168, 0.018, 0.012), P.glowHot, TRS(0, 1.676, 0.096));
      }
      parts.add(Geo.box(0.09, 0.12, 0.045), P.plateDark, TRS(-0.175, 0.99, -0.02, 0, 0.3, 0));
      break;
    }
    case 'solo': {
      parts.add(Geo.box(0.34, 0.055, 0.024), P.strap, TRS(0, 1.155, 0.128, -0.03, 0, 0));
      for (let i = -1; i <= 1; i++) parts.add(Geo.box(0.072, 0.10, 0.05), P.plateDark, TRS(i * 0.095, 1.10, 0.135, -0.05, 0, 0));
      parts.add(Geo.box(0.032, 0.05, 0.006), P.chrome, TRS(0.045, 1.24, 0.148, 0, 0, 0.2));
      parts.add(Geo.box(0.055, 0.028, 0.045), P.plateDark, TRS(0.175, 1.44, -0.03));
      parts.add(Geo.box(0.012, 0.012, 0.012), P.glowHot, TRS(0.20, 1.455, -0.01));
      break;
    }
    case 'lawman': {
      parts.add(Geo.box(0.06, 0.075, 0.012), Mat.glow(0xffd600, 2.6), TRS(0.10, 1.33, 0.142, 0, 0, 0.1));
      parts.add(Geo.box(0.07, 0.11, 0.055), P.plateDark, TRS(-0.175, 1.44, -0.035));
      parts.add(Geo.cyl(0.008, 0.008, 0.20, 5), P.chromeDark, TRS(-0.175, 1.58, -0.05, 0.12, 0, 0.08));
      parts.add(Geo.sph(0.014, 6, 5), Mat.glow(0x2979ff, 1.8), TRS(-0.175, 1.685, -0.062));
      parts.add(Geo.box(0.20, 0.026, 0.008), Mat.glow(0x2979ff, 2.4), TRS(0, 1.245, 0.15));
      parts.add(Geo.box(0.075, 0.16, 0.055), P.strap, TRS(0.20, 0.94, 0.0, 0, 0.2, 0.08));
      break;
    }
    case 'medtech': {
      parts.add(Geo.box(0.055, 0.30, 0.028), P.strap, TRS(0.02, 1.26, 0.10, -0.06, 0, 0.55));
      parts.add(Geo.box(0.055, 0.30, 0.028), P.strap, TRS(0.02, 1.26, -0.11, 0.06, 0, 0.55));
      parts.add(Geo.box(0.22, 0.19, 0.115), Mat.cloth(0xe6ecef, 0.85), TRS(-0.235, 0.99, 0.02, 0, 0.18, 0));
      parts.add(Geo.box(0.085, 0.026, 0.008), Mat.glow(0x69f0ae, 1.6), TRS(-0.235, 1.00, 0.078, 0, 0.18, 0));
      parts.add(Geo.box(0.026, 0.085, 0.008), Mat.glow(0x69f0ae, 1.6), TRS(-0.235, 1.00, 0.078, 0, 0.18, 0));
      parts.add(Geo.box(0.05, 0.038, 0.05), P.chromeDark, TRS(0.185, 1.47, 0.02));
      parts.add(Geo.cyl(0.022, 0.026, 0.02, 8), Mat.glow(0xdfe9f5, 2.2), TRS(0.185, 1.47, 0.05, Math.PI / 2, 0, 0));
      break;
    }
    case 'media': {
      parts.add(Geo.box(0.075, 0.06, 0.12), P.plateDark, TRS(0.175, 1.50, 0.02));
      parts.add(Geo.cyl(0.028, 0.030, 0.05, 10), P.chromeDark, TRS(0.175, 1.50, 0.10, Math.PI / 2, 0, 0));
      parts.add(Geo.cyl(0.020, 0.020, 0.012, 10), Mat.glow(0x00e5ff, 1.6), TRS(0.175, 1.50, 0.128, Math.PI / 2, 0, 0));
      parts.add(Geo.sph(0.012, 6, 5), Mat.glow(0xff1744, 2.2), TRS(0.175, 1.545, 0.06));
      parts.add(Geo.box(0.24, 0.10, 0.02), P.plateDark, TRS(0, 1.30, 0.135, -0.05, 0, 0));
      parts.add(Geo.box(0.19, 0.02, 0.006), Mat.glow(0xff2d95, 2.8), TRS(0, 1.315, 0.147));
      const drone = buildDrone(owned);
      drone.position.set(-0.55, 1.95, -0.18);
      rig.add(drone);
      animators.push((t) => {
        drone.position.y = 1.95 + Math.sin(t * 1.7) * 0.07;
        drone.rotation.y = Math.sin(t * 0.6) * 0.5;
      });
      break;
    }
    case 'tech': {
      parts.add(Geo.box(0.26, 0.30, 0.14), P.plateDark, TRS(0, 1.24, -0.19, 0.08, 0, 0));
      parts.add(Geo.box(0.22, 0.055, 0.012), Mat.glow(0xff9100, 2.6), TRS(0, 1.34, -0.263, 0.08, 0, 0));
      for (let i = 0; i < 3; i++) parts.add(Geo.box(0.03, 0.13, 0.03), P.chromeDark, TRS(-0.07 + i * 0.07, 1.10, -0.265, 0.08, 0, 0));
      parts.add(Geo.cyl(0.008, 0.006, 0.42, 5), P.chromeDark, TRS(0.10, 1.58, -0.20, 0.1, 0, -0.12));
      parts.add(Geo.sph(0.017, 6, 5), Mat.glow(0xff9100, 1.8), TRS(0.075, 1.79, -0.185));
      if (!ctx.helmet && !ctx.hooded) {
        for (const s of [-1, 1]) {
          parts.add(Geo.cyl(0.034, 0.034, 0.042, 10), P.chromeDark, TRS(s * 0.045, 1.752, 0.060, Math.PI / 2 - 0.35, 0, 0));
          parts.add(Geo.cyl(0.024, 0.024, 0.008, 10), Mat.glow(0xff9100, 0.7), TRS(s * 0.045, 1.762, 0.077, Math.PI / 2 - 0.35, 0, 0));
        }
        parts.add(Geo.box(0.20, 0.03, 0.03), P.strap, TRS(0, 1.742, 0.03));
      }
      parts.add(Geo.box(0.15, 0.05, 0.05), P.strap, TRS(0, 1.03, -0.13));
      break;
    }
    case 'nomad': {
      parts.add(Geo.box(0.062, 0.36, 0.03), P.strap, TRS(0, 1.24, 0.10, -0.05, 0, 0.62));
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        parts.add(Geo.cyl(0.014, 0.014, 0.05, 6), Mat.metal(0xb08d3a, 0.35),
          TRS(-0.13 + t * 0.26, 1.42 - t * 0.35, 0.128, -0.05, 0, 0.62 + Math.PI / 2));
      }
      if (!ctx.helmet && !ctx.hooded) {
        for (const s of [-1, 1]) {
          parts.add(Geo.cyl(0.035, 0.035, 0.046, 10), P.strap, TRS(s * 0.047, 1.758, 0.056, Math.PI / 2 - 0.3, 0, 0));
          parts.add(Geo.cyl(0.025, 0.025, 0.008, 10), Mat.glow(0xff9100, 0.6), TRS(s * 0.047, 1.768, 0.075, Math.PI / 2 - 0.3, 0, 0));
        }
        parts.add(Geo.box(0.21, 0.032, 0.03), P.strap, TRS(0, 1.75, 0.026));
      }
      parts.add(Geo.box(0.13, 0.20, 0.09), P.strap, TRS(-0.20, 0.94, -0.05, 0, 0.35, 0));
      parts.add(Geo.box(0.10, 0.03, 0.006), Mat.glow(0xff9100, 2.2), TRS(-0.205, 0.995, -0.005, 0, 0.35, 0));
      break;
    }
    case 'exec': {
      parts.add(Geo.box(0.055, 0.30, 0.02), Mat.cloth(P.accent, 0.5), TRS(0, 1.31, 0.128, -0.05, 0, 0));
      parts.add(Geo.box(0.05, 0.05, 0.02), Mat.cloth(P.accent, 0.5), TRS(0, 1.48, 0.10, -0.2, 0, 0));
      parts.add(Geo.box(0.26, 0.20, 0.075), Mat.leather(0x181a20), TRS(-0.255, 0.755, 0.03, 0, 0.12, 0));
      parts.add(Geo.box(0.26, 0.018, 0.078), P.chromeDark, TRS(-0.255, 0.80, 0.03, 0, 0.12, 0));
      parts.add(Geo.box(0.045, 0.03, 0.008), Mat.glow(0xffd600, 2.4), TRS(-0.255, 0.80, 0.074, 0, 0.12, 0));
      parts.add(Geo.torus(0.035, 0.008, 5, 10, Math.PI), P.chromeDark, TRS(-0.255, 0.865, 0.03, 0, 0.12, 0));
      parts.add(Geo.box(0.035, 0.035, 0.008), Mat.glow(0xffd600, 2.0), TRS(0.10, 1.36, 0.144));
      break;
    }
    case 'fixer': {
      parts.add(Geo.box(0.055, 0.32, 0.026), P.strap, TRS(0, 1.24, 0.10, -0.05, 0, -0.6));
      parts.add(Geo.box(0.20, 0.16, 0.085), Mat.leather(0x2a1f1c), TRS(0.225, 0.98, 0.02, 0, -0.2, 0));
      parts.add(Geo.box(0.16, 0.02, 0.006), Mat.glow(0xffd600, 2.2), TRS(0.228, 1.02, 0.066, 0, -0.2, 0));
      parts.add(Geo.box(0.055, 0.10, 0.012), P.plateDark, TRS(-0.235, 0.93, 0.06, -0.4, 0.2, 0));
      parts.add(Geo.box(0.044, 0.085, 0.006), Mat.glow(0x00e5ff, 1.8), TRS(-0.233, 0.935, 0.070, -0.4, 0.2, 0));
      if (!ctx.helmet) parts.add(Geo.box(0.175, 0.028, 0.022), Mat.glass(0x0b0f18), TRS(0, 1.676, 0.084));
      break;
    }
    case 'rocker': {
      // guitar slung across the back — the strongest silhouette read of the lot
      const gm = TRS(-0.02, 1.15, -0.19, 0.10, 0, 0.62);
      const put = (g, md, mm) => parts.add(g, md, mul(gm, mm));
      put(Geo.cyl(0.155, 0.155, 0.055, 16), Mat.leather(0x8a1030), TRS(0, -0.14, 0, Math.PI / 2, 0, 0));
      put(Geo.cyl(0.115, 0.115, 0.055, 14), Mat.leather(0x8a1030), TRS(0, 0.05, 0, Math.PI / 2, 0, 0));
      put(Geo.box(0.30, 0.14, 0.056), Mat.leather(0x8a1030), TRS(0, -0.05, 0));
      put(Geo.cyl(0.145, 0.145, 0.008, 16), Mat.glow(P.accent, 1.6), TRS(0, -0.14, 0.031, Math.PI / 2, 0, 0));
      put(Geo.box(0.06, 0.62, 0.03), Mat.cloth(0x2a1a10, 0.6), TRS(0, 0.34, 0.016));
      put(Geo.box(0.085, 0.13, 0.028), Mat.cloth(0x14100c, 0.5), TRS(0.012, 0.70, 0.016));
      for (let i = 0; i < 6; i++) put(Geo.box(0.004, 0.60, 0.004), P.chrome, TRS(-0.021 + i * 0.0084, 0.33, 0.036));
      put(Geo.box(0.075, 0.03, 0.02), P.chromeDark, TRS(0, 0.02, 0.036));
      for (let i = 0; i < 10; i++) {
        const a = 0.6 + (i / 9) * (TAU - 1.2);
        parts.add(Geo.cone(0.012, 0.026, 4), P.chrome,
          TRS(Math.sin(a) * 0.192, 1.415, Math.cos(a) * 0.135, Math.PI / 2 - 0.2, a, 0));
      }
      parts.add(Geo.box(0.05, 0.06, 0.01), Mat.glow(P.accent, 3.0), TRS(-0.10, 1.33, 0.142));
      break;
    }
  }
  if (st.gear.shield) {
    parts.add(Geo.cyl(0.24, 0.24, 0.035, 14), P.plateDark, TRS(-0.30, 1.12, 0.10, 0, 0.35, 0.12));
    parts.add(Geo.torus(0.235, 0.014, 5, 18), Mat.glow(P.accent, 2.2), TRS(-0.30, 1.12, 0.12, 0, 0.35, 0.12));
  }
}

// Small companion drone (Media role, and reusable).
function buildDrone(owned) {
  const g = new THREE.Group();
  const parts = partList();
  parts.add(Geo.sph(0.085, 12, 9), Mat.plate(0x1b1f27), TRS(0, 0, 0, 0, 0, 0, 1, 0.72, 1));
  parts.add(Geo.cyl(0.032, 0.036, 0.03, 10), Mat.chrome(0x9aa5b2), TRS(0, -0.05, 0.02, Math.PI / 2 - 0.5, 0, 0));
  parts.add(Geo.cyl(0.022, 0.022, 0.01, 10), Mat.glow(0x00e5ff, 3.6), TRS(0, -0.062, 0.038, Math.PI / 2 - 0.5, 0, 0));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * TAU;
    const x = Math.cos(a) * 0.115, z = Math.sin(a) * 0.115;
    parts.add(Geo.box(0.10, 0.012, 0.02), Mat.plate(0x1b1f27), TRS(x * 0.5, 0.01, z * 0.5, 0, -a, 0));
    parts.add(Geo.torus(0.048, 0.008, 5, 12), Mat.chrome(0x6d7683), TRS(x, 0.02, z, Math.PI / 2, 0, 0));
    parts.add(Geo.box(0.08, 0.004, 0.014), Mat.cloth(0x2a3040, 0.5), TRS(x, 0.024, z, 0, a * 1.7, 0));
    parts.add(Geo.sph(0.008, 6, 5), Mat.glow(i % 2 ? 0xff1744 : 0x69f0ae, 4), TRS(x, -0.005, z));
  }
  parts.flush(g, owned, { cast: false });
  return g;
}

// ═══════════════════════════════════════════════════════════════════
// 8. buildCharacterToken
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a 3D token for a GM-app character or NPC.
 *
 * Deterministic: the same sheet always produces the same look, seeded from
 * char.id (falling back to char.name).
 *
 * What drives what:
 *   role      -> silhouette, kit, palette, bulk multiplier
 *   BODY      -> width/height scaling of the whole rig
 *   armor SP  -> visible plating (webbing < vest+pauldrons < full plate)
 *   headSP    -> helmet + visor instead of a bare head
 *   cyberware -> chrome arm / chrome legs+pistons / glowing eyes / nape ports
 *   weapons[0]-> held pistol, rifle, blade or heavy weapon + matching stance
 *   hp/maxHp  -> HP arc on the base ring
 *   isNPC     -> base ring colour + default threat pips
 *   portrait  -> optional holo ID plate (opts.portrait)
 *
 * @param {object} char
 * @param {object} [opts] scale, label, sublabel, labelWidth, portrait, faction
 *                        ('pc'|'npc'|'ally'|'neutral'), threat 0-4, hp (0..1),
 *                        selected, baseRadius, castShadow
 * @returns {THREE.Group} feet at y=0, facing +Z, with .dispose()/.update()/
 *                        .setHP()/.setSelected() and userData.
 */
export function buildCharacterToken(char = {}, opts = {}) {
  const seed = char.id || char.name || 'unnamed';
  const rand = seededRandom(seed);
  const st = readSheet(char);
  const owned = ownedBag();
  const animators = [];
  const group = new THREE.Group();
  group.name = `token:${char.name || 'character'}`;

  const rig = new THREE.Group();
  rig.name = 'rig';
  group.add(rig);

  const P = paletteFor(st, rand);
  const style = ROLE_STYLE[st.role] || DEFAULT_STYLE;
  const parts = partList();
  const ctx = buildHumanoid(parts, P, st, rand, style.kit);
  applyRoleKit(parts, P, st, rand, ctx, animators, rig, owned);
  parts.flush(rig, owned, { cast: opts.castShadow !== false, receive: false });

  // BODY drives build: width more than height, so a BODY 10 Solo reads as a
  // slab and a BODY 3 Netrunner reads as a wire without breaking the grid.
  const w = (0.93 + st.BODY * 0.0155) * style.bulk * (st.cy.borg ? 1.05 : 1);
  const h = 0.955 + st.BODY * 0.0105 + (rand() - 0.5) * 0.035;
  rig.scale.set(w, h, w);
  if (st.dead) { rig.rotation.x = -Math.PI / 2.15; rig.position.y = 0.24; }

  const faction = opts.faction || (st.isNPC ? 'npc' : 'pc');
  const fcol = FACTION_COLOR[faction] ?? FACTION_COLOR.neutral;
  const base = buildBase(owned, animators, {
    radius: opts.baseRadius ?? 0.62,
    color: fcol,
    threat: opts.threat ?? (st.isNPC ? Math.max(1, Math.min(4, Math.round(st.BODY / 3))) : 0),
    hp: opts.hp ?? st.hpFrac
  });
  group.add(base.group);

  if (opts.label !== false) {
    const sub = opts.sublabel ?? `${st.role.toUpperCase()}  ${st.hp}/${st.maxHp}${st.bodySP ? '  SP' + st.bodySP : ''}`;
    group.add(buildLabel(owned, char.name || 'UNKNOWN', sub, fcol, {
      width: opts.labelWidth ?? 1.45, y: 1.8 * h + 0.42
    }));
  }
  if (opts.portrait && st.portrait) {
    group.add(buildPortraitPlate(owned, st.portrait, fcol, { y: 1.35 * h, x: 0.66, height: 0.7 }));
  }

  if (opts.selected) base.setSelected(true);
  group.setHP = (f) => base.setHP(f);
  group.setSelected = (b) => base.setSelected(b);
  if (opts.scale) group.scale.setScalar(opts.scale);

  return finalize(group, {
    kind: 'character', id: char.id || seed, name: char.name || 'Unknown', sourceChar: char
  }, owned, animators);
}

// ═══════════════════════════════════════════════════════════════════
// 9. VEHICLES
// Side-profile extrusions (lower body + greenhouse) with torus tyres,
// emissive light bars and an underglow pool. Names/SDP are matched back to
// CPRED_DATA.vehicles when the caller passes a real sheet entry.
// ═══════════════════════════════════════════════════════════════════

export const VEHICLE_KINDS = [
  'Roadbike', 'Compact Groundcar', 'Sedan', 'Muscle Car', 'Pickup',
  'Van', 'Combat Cabb', 'Battle Truck', 'AV'
];

// kind -> geometry recipe. `low` is the belt-line-and-below silhouette,
// `cab` is the greenhouse, both authored in (forward, up) metres.
const VEH = {
  'Compact Groundcar': {
    w: 1.72, wheel: 0.32, axle: [-1.20, 1.24], sdp: 25, seats: 4,
    low: [[-1.86, 0.26], [-1.94, 0.52], [-1.88, 0.86], [-1.45, 0.93], [1.05, 0.93], [1.60, 0.86], [1.90, 0.74], [1.94, 0.50], [1.86, 0.24], [1.50, 0.17], [-1.50, 0.17]],
    cab: [[-1.55, 0.88], [-1.34, 1.24], [-0.80, 1.38], [0.28, 1.36], [0.80, 1.16], [1.06, 0.88]],
    roofY: 1.38, roofZ: [-1.05, 0.45]
  },
  'Sedan': {
    w: 1.86, wheel: 0.35, axle: [-1.48, 1.48], sdp: 30, seats: 5,
    low: [[-2.30, 0.26], [-2.40, 0.54], [-2.34, 0.90], [-1.90, 0.96], [1.45, 0.96], [2.02, 0.90], [2.36, 0.78], [2.42, 0.52], [2.32, 0.24], [1.90, 0.17], [-1.90, 0.17]],
    cab: [[-1.80, 0.92], [-1.56, 1.30], [-0.92, 1.46], [0.38, 1.44], [0.98, 1.22], [1.32, 0.92]],
    roofY: 1.46, roofZ: [-1.30, 0.60]
  },
  'Muscle Car': {
    w: 1.98, wheel: 0.38, axle: [-1.56, 1.60], sdp: 35, seats: 2, spoiler: true,
    low: [[-2.42, 0.26], [-2.52, 0.56], [-2.44, 0.92], [-2.00, 0.98], [1.20, 0.98], [2.10, 0.92], [2.50, 0.82], [2.56, 0.52], [2.44, 0.22], [2.00, 0.15], [-2.00, 0.15]],
    cab: [[-1.92, 0.94], [-1.70, 1.24], [-1.00, 1.36], [0.10, 1.34], [0.72, 1.10], [1.10, 0.94]],
    roofY: 1.36, roofZ: [-1.40, 0.05]
  },
  'Pickup': {
    w: 1.96, wheel: 0.42, axle: [-1.55, 1.55], sdp: 40, seats: 3,
    low: [[-2.55, 0.34], [-2.62, 0.62], [-2.58, 1.10], [-0.35, 1.10], [-0.35, 0.98], [1.55, 0.98], [2.16, 0.92], [2.50, 0.82], [2.56, 0.54], [2.46, 0.30], [2.00, 0.22], [-2.05, 0.22]],
    cab: [[-0.30, 1.02], [-0.10, 1.40], [0.30, 1.58], [1.02, 1.52], [1.34, 1.22], [1.52, 1.00]],
    roofY: 1.58, roofZ: [0.10, 1.10], bed: [-2.45, -0.40]
  },
  'Van': {
    w: 2.00, wheel: 0.38, axle: [-1.65, 1.55], sdp: 45, seats: 6,
    low: [[-2.62, 0.30], [-2.72, 0.60], [-2.68, 1.90], [-2.30, 2.06], [1.10, 2.06], [1.72, 1.86], [2.20, 1.20], [2.46, 0.86], [2.52, 0.56], [2.42, 0.28], [2.00, 0.20], [-2.10, 0.20]],
    cab: [[1.05, 1.10], [1.12, 1.86], [1.66, 1.80], [2.10, 1.20], [2.30, 0.98]],
    roofY: 2.08, roofZ: [-2.50, 1.20], slab: true
  },
  'Combat Cabb': {
    w: 1.92, wheel: 0.36, axle: [-1.50, 1.50], sdp: 50, seats: 4, taxi: true,
    low: [[-2.34, 0.26], [-2.46, 0.56], [-2.40, 0.98], [-1.94, 1.04], [1.50, 1.04], [2.10, 0.96], [2.44, 0.82], [2.52, 0.54], [2.40, 0.24], [1.96, 0.17], [-1.96, 0.17]],
    cab: [[-1.86, 1.00], [-1.62, 1.42], [-0.94, 1.60], [0.44, 1.58], [1.06, 1.32], [1.40, 1.00]],
    roofY: 1.60, roofZ: [-1.35, 0.70]
  },
  'Battle Truck': {
    w: 2.52, wheel: 0.60, axle: [-2.20, 2.05], sdp: 60, seats: 6, ram: true, turret: true,
    low: [[-3.30, 0.42], [-3.44, 0.80], [-3.38, 2.10], [-2.90, 2.34], [0.90, 2.34], [1.90, 2.10], [2.70, 1.60], [3.20, 1.10], [3.34, 0.74], [3.24, 0.36], [2.70, 0.26], [-2.80, 0.26]],
    cab: [[1.00, 1.30], [1.10, 2.08], [1.86, 2.02], [2.62, 1.56], [2.96, 1.28]],
    roofY: 2.36, roofZ: [-3.20, 1.10], slab: true
  }
};

const VEHICLE_ALIASES = [
  [/road ?bike|motor ?cycle|bike\b/i, 'Roadbike'],
  [/compact|kaukaz|thorton galena|mini/i, 'Compact Groundcar'],
  [/battle truck|nomad.*truck|convoy|rig\b/i, 'Battle Truck'],
  [/combat cabb|cab\b|taxi/i, 'Combat Cabb'],
  [/mackinaw|pickup|truck\b/i, 'Pickup'],
  [/van\b|delivery|transport/i, 'Van'],
  [/muscle|quadra|turbo|sport|racer/i, 'Muscle Car'],
  [/\bav-?\d*\b|aerodyne|aero ?dyne|flying|hover/i, 'AV'],
  [/sedan|groundcar|villefort|mizutani|saloon/i, 'Sedan']
];

/** Best-effort mapping from a CPRED_DATA vehicle entry (or free text) to a kind. */
export function vehicleKindFor(nameOrSpec) {
  const s = typeof nameOrSpec === 'string' ? nameOrSpec : ((nameOrSpec && (nameOrSpec.kind || nameOrSpec.name)) || '');
  if (VEHICLE_KINDS.includes(s)) return s;
  for (const [re, k] of VEHICLE_ALIASES) if (re.test(s)) return k;
  return 'Sedan';
}

/** Look a name up in CPRED_DATA.vehicles so SDP/seats come from the real book. */
function lookupVehicleData(name) {
  try {
    const db = (typeof CPRED_DATA !== 'undefined' && CPRED_DATA.vehicles) ? CPRED_DATA.vehicles : null;
    if (!db || !name) return null;
    for (const group of Object.values(db)) {
      const hit = group.find(v => v.name === name) || group.find(v => new RegExp(v.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(name));
      if (hit) return hit;
    }
  } catch (e) { /* data.js not loaded — fine */ }
  return null;
}

const VEH_PAINT = [0x3e4a5c, 0x5a3b48, 0x2d4a60, 0x5b543c, 0x74323a, 0x2f5a4c, 0x565d6c, 0x453458];

// Tyres: torus carcass + chromed rim + spokes + a brake-disc glow.
function addWheel(parts, M, x, z, r, w) {
  parts.add(Geo.torus(r * 0.78, r * 0.24, 8, 16), M.tyre, TRS(x, r, z, 0, Math.PI / 2, 0));
  parts.add(Geo.cyl(r * 0.56, r * 0.56, w * 0.64, 12), M.rim, TRS(x, r, z, 0, 0, Math.PI / 2));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    parts.add(Geo.box(w * 0.30, r * 0.92, 0.026), M.rim, TRS(x, r, z, a, Math.PI / 2, 0));
  }
  parts.add(Geo.cyl(r * 0.20, r * 0.20, w * 0.68, 10), M.glow, TRS(x, r, z, 0, 0, Math.PI / 2));
}

function polyBounds(pts) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const p of pts) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); }
  return { back: a, front: b, low: c, high: d };
}

/**
 * Build a vehicle token.
 * @param {string|object} spec  A VEHICLE_KINDS name, a CPRED_DATA.vehicles
 *        entry ({name, sdp, sp, seats}), or {kind, name, color, accent, id}.
 * @param {object} [opts] scale, label, faction, threat, hp (0..1), selected,
 *                        color, accent, castShadow, baseRadius
 */
export function buildVehicleToken(spec = {}, opts = {}) {
  const raw = (typeof spec === 'string') ? { name: spec } : (spec || {});
  const name = raw.name || raw.kind || 'Sedan';
  const kind = vehicleKindFor(raw.kind || name);
  const book = lookupVehicleData(name) || {};
  const seed = raw.id || name || kind;
  const rand = seededRandom(seed);

  const owned = ownedBag();
  const animators = [];
  const group = new THREE.Group();
  group.name = `vehicle:${name}`;
  const rig = new THREE.Group();
  group.add(rig);

  const paint = hex(opts.color ?? raw.color ?? pick(rand, VEH_PAINT));
  const accent = hex(opts.accent ?? raw.accent ?? pick(rand, [0x00e5ff, 0xff2d95, 0xff9100, 0x69f0ae, 0x7c4dff]));
  const M = {
    body: Mat.plate(paint),
    trim: Mat.metal(shade(paint, -0.25), 0.5),
    dark: Mat.metal(0x2b313c, 0.6),
    glass: Mat.glass(0x080d16),
    tyre: Mat.cloth(0x2b2f38, 0.95),
    rim: Mat.chrome(0xb9c4d2),
    chrome: Mat.chrome(0xd6e0ec),
    glow: Mat.glow(accent, 0.9),
    head: Mat.glow(0xdff3ff, 1.5),
    tail: Mat.glow(0xff1744, 1.5)
  };
  const parts = partList();
  let footprint = { x: 2.2, z: 4.6 };

  if (kind === 'Roadbike') {
    buildRoadbike(parts, M, rand);
    footprint = { x: 0.95, z: 2.15 };
  } else if (kind === 'AV') {
    buildAV(parts, M, rand, rig, owned, animators);
    footprint = { x: 3.1, z: 3.4 };
  } else {
    const V0 = VEH[kind] || VEH['Sedan'];
    const b = polyBounds(V0.low);
    // The body is deliberately narrower than the track so the tyres stand
    // proud — otherwise the wheels vanish inside the extrusion and the whole
    // thing reads as a hovercraft.
    const BW = V0.w * 0.86;
    const TRACK = V0.w * 0.5;
    const cabZ = V0.cab ? (V0.cab[0][0] + V0.cab[V0.cab.length - 1][0]) / 2 : 0;
    const cabLen = V0.cab ? Math.abs(V0.cab[V0.cab.length - 1][0] - V0.cab[0][0]) : 1;
    const beltY = V0.cab ? V0.cab[0][1] : 0.95;

    parts.add(Geo.side(kind + ':low', V0.low, BW, 0.06), M.body);
    if (V0.cab) parts.add(Geo.side(kind + ':cab', V0.cab, BW * (V0.slab ? 0.99 : 0.94), 0.03), M.glass);
    if (V0.roofZ) {
      const rl = V0.roofZ[1] - V0.roofZ[0];
      parts.add(Geo.box(BW * (V0.slab ? 1.0 : 0.90), 0.075, rl), M.body,
        TRS(0, V0.roofY, (V0.roofZ[0] + V0.roofZ[1]) / 2));
      for (const s of [-1, 1]) for (const zz of V0.roofZ) {
        parts.add(Geo.box(0.055, 0.44, 0.075), M.body, TRS(s * BW * 0.46, V0.roofY - 0.24, zz));
      }
      // chrome belt-line that separates glass from body
      for (const s of [-1, 1]) parts.add(Geo.box(0.03, 0.035, cabLen * 0.95), M.chrome, TRS(s * BW * 0.475, beltY + 0.03, cabZ));
    }
    // rocker-panel neon — thin, or it turns into a light sabre under bloom
    for (const s of [-1, 1]) parts.add(Geo.box(0.022, 0.022, (b.front - b.back) * 0.58), M.glow, TRS(s * (BW * 0.5 + 0.012), 0.34, 0));
    // front light bar + headlights
    parts.add(Geo.box(BW * 0.66, 0.055, 0.05), M.head, TRS(0, 0.70, b.front - 0.02));
    for (const s of [-1, 1]) parts.add(Geo.box(0.22, 0.10, 0.07), M.head, TRS(s * BW * 0.32, 0.60, b.front - 0.05));
    for (let i = 0; i < 4; i++) parts.add(Geo.box(BW * 0.58, 0.028, 0.05), M.dark, TRS(0, 0.40 + i * 0.055, b.front - 0.04));
    // full-width tail bar
    parts.add(Geo.box(BW * 0.80, 0.075, 0.05), M.tail, TRS(0, 0.74, b.back + 0.03));
    parts.add(Geo.box(BW * 0.30, 0.16, 0.10), M.dark, TRS(0, 0.42, b.back + 0.02));
    for (const s of [-1, 1]) {
      parts.add(Geo.box(0.13, 0.075, 0.05), M.trim, TRS(s * (BW * 0.56), beltY + 0.12, cabZ + cabLen * 0.34, 0, s * 0.3, 0));
    }
    // wheels + arches
    const axles = V0.axle.slice();
    if (kind === 'Battle Truck') axles.push(V0.axle[0] + 1.35);
    for (const s of [-1, 1]) for (const z of axles) {
      addWheel(parts, M, s * TRACK, z, V0.wheel, 0.26);
      parts.add(Geo.torus(V0.wheel * 1.12, 0.065, 6, 14, Math.PI), M.body,
        TRS(s * (BW * 0.5 + 0.035), V0.wheel, z, 0, Math.PI / 2, 0, 1, 1, 1));
      parts.add(Geo.box(0.10, V0.wheel * 1.1, V0.wheel * 2.1), M.dark, TRS(s * (BW * 0.5 - 0.06), V0.wheel * 0.85, z));
    }
    // kind-specific dressing
    if (V0.spoiler) {
      parts.add(Geo.box(V0.w * 0.86, 0.05, 0.28), M.dark, TRS(0, 1.20, b.back + 0.30));
      for (const s of [-1, 1]) parts.add(Geo.box(0.05, 0.24, 0.20), M.dark, TRS(s * V0.w * 0.36, 1.08, b.back + 0.30));
      parts.add(Geo.box(V0.w * 0.80, 0.02, 0.02), M.glow, TRS(0, 1.23, b.back + 0.42));
    }
    if (V0.bed) {
      parts.add(Geo.box(V0.w * 0.86, 0.05, V0.bed[1] - V0.bed[0]), M.trim, TRS(0, 0.98, (V0.bed[0] + V0.bed[1]) / 2));
      for (let i = 0; i < 4; i++) parts.add(Geo.box(V0.w * 0.80, 0.03, 0.05), M.dark, TRS(0, 1.01, V0.bed[0] + 0.3 + i * 0.5));
    }
    if (V0.taxi) {
      parts.add(Geo.box(0.62, 0.16, 0.24), Mat.glow(0xffd600, 2.8), TRS(0, V0.roofY + 0.12, V0.roofZ[0] + 0.5));
      parts.add(Geo.box(V0.w * 0.98, 0.24, 0.10), Mat.glow(0xffd600, 1.6), TRS(0, 0.62, 0, 0, 0, 0));
    }
    if (V0.ram) {
      parts.add(Geo.box(V0.w * 1.02, 0.55, 0.16), M.trim, TRS(0, 0.62, b.front + 0.12, 0.18, 0, 0));
      for (let i = 0; i < 5; i++) parts.add(Geo.cone(0.075, 0.22, 4), M.chrome, TRS((i - 2) * V0.w * 0.22, 0.62, b.front + 0.26, Math.PI / 2, 0, 0));
      for (const s of [-1, 1]) parts.add(Geo.box(0.10, 0.10, 0.20), Mat.glow(0xffd600, 3.0), TRS(s * V0.w * 0.42, V0.roofY + 0.10, V0.roofZ[1] - 0.2));
    }
    if (V0.turret) {
      parts.add(Geo.cyl(0.42, 0.50, 0.22, 12), M.trim, TRS(0, V0.roofY + 0.14, -0.6));
      parts.add(Geo.box(0.30, 0.26, 0.42), M.dark, TRS(0, V0.roofY + 0.34, -0.5));
      parts.add(Geo.cyl(0.055, 0.055, 0.90, 8), M.dark, TRS(0, V0.roofY + 0.36, 0.05, Math.PI / 2, 0, 0));
      parts.add(Geo.cyl(0.085, 0.07, 0.14, 8), M.chrome, TRS(0, V0.roofY + 0.36, 0.52, Math.PI / 2, 0, 0));
      parts.add(Geo.box(0.34, 0.03, 0.03), M.glow, TRS(0, V0.roofY + 0.48, -0.42));
    }
    if (V0.slab) {
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
        parts.add(Geo.box(0.04, 0.30, 0.62), M.trim, TRS(s * V0.w * 0.51, 1.10 + i * 0.10, -1.4 + i * 1.2));
      }
    }
    footprint = { x: V0.w * 0.5 + V0.wheel * 0.35, z: (b.front - b.back) * 0.5 };
  }

  // underglow pool — cheap, and it is what makes these read as CP:RED
  const ug = new THREE.Mesh(
    Geo.circle(1, 28).clone(),
    new THREE.MeshBasicMaterial({ map: texGlowDisc(), color: accent, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  owned.geos.push(ug.geometry); owned.mats.push(ug.material);
  ug.rotation.x = -Math.PI / 2;
  ug.position.y = 0.02;
  ug.scale.set(footprint.x * 1.5, footprint.z * 1.25, 1);
  ug.renderOrder = 1;
  rig.add(ug);

  parts.flush(rig, owned, { cast: opts.castShadow !== false, receive: false });

  const faction = opts.faction || 'vehicle';
  const base = buildBase(owned, animators, {
    radius: opts.baseRadius ?? Math.max(footprint.x, footprint.z) * 1.02,
    ellipseX: footprint.x / Math.max(footprint.x, footprint.z),
    ellipseZ: footprint.z / Math.max(footprint.x, footprint.z),
    color: FACTION_COLOR[faction] ?? FACTION_COLOR.vehicle,
    threat: opts.threat ?? 0,
    hp: opts.hp ?? 1,
    glow: false,
    ringIntensity: 0.42
  });
  group.add(base.group);

  if (opts.label !== false) {
    const sdp = raw.sdp ?? book.sdp ?? (VEH[kind] || {}).sdp;
    const sp = raw.sp ?? book.sp;
    const sub = opts.sublabel ?? [kind.toUpperCase(), sdp ? 'SDP ' + sdp : '', sp ? 'SP ' + sp : ''].filter(Boolean).join('  ');
    group.add(buildLabel(owned, name, sub, FACTION_COLOR[faction] ?? FACTION_COLOR.vehicle,
      { width: 1.9, y: (kind === 'AV' ? 3.2 : kind === 'Battle Truck' ? 3.1 : 2.1) }));
  }
  if (opts.selected) base.setSelected(true);
  group.setHP = (f) => base.setHP(f);
  group.setSelected = (b) => base.setSelected(b);
  if (opts.scale) group.scale.setScalar(opts.scale);

  return finalize(group, {
    kind: 'vehicle', id: raw.id || seed, name,
    sourceChar: undefined
  }, owned, animators);
}

function buildRoadbike(parts, M, rand) {
  const R = 0.33;
  addWheel(parts, M, 0, -0.66, R, 0.14);
  addWheel(parts, M, 0, 0.66, R, 0.14);
  // frame spine
  parts.add(Geo.tube('bikeframe', [
    [0, 0.36, -0.66], [0, 0.60, -0.40], [0, 0.72, -0.05], [0, 0.78, 0.28], [0, 0.86, 0.52]
  ], 18, 0.045, 6), M.trim);
  parts.add(Geo.tube('bikefork', [
    [0, 0.86, 0.52], [0, 0.62, 0.62], [0, 0.36, 0.66]
  ], 10, 0.032, 6), M.chrome);
  // tank + seat + tail
  parts.add(Geo.sph(0.19, 12, 9), M.body, TRS(0, 0.80, 0.12, 0, 0, 0, 0.85, 0.72, 1.5));
  parts.add(Geo.box(0.24, 0.09, 0.46), M.dark, TRS(0, 0.80, -0.24, -0.08, 0, 0));
  parts.add(Geo.box(0.22, 0.20, 0.28), M.body, TRS(0, 0.86, -0.52, -0.25, 0, 0));
  parts.add(Geo.box(0.20, 0.04, 0.05), M.tail, TRS(0, 0.94, -0.64));
  // fairing + headlight
  parts.add(Geo.cone(0.20, 0.42, 8), M.body, TRS(0, 0.86, 0.50, 1.35, 0, 0));
  parts.add(Geo.cyl(0.10, 0.085, 0.05, 12), M.head, TRS(0, 0.86, 0.66, Math.PI / 2 - 0.2, 0, 0));
  // bars + mirrors
  parts.add(Geo.cyl(0.022, 0.022, 0.62, 8), M.chrome, TRS(0, 1.00, 0.40, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) parts.add(Geo.sph(0.045, 8, 6), M.dark, TRS(s * 0.30, 1.00, 0.40, 0, 0, 0, 1, 1, 0.5));
  // exhaust + engine block
  parts.add(Geo.box(0.26, 0.24, 0.34), M.dark, TRS(0, 0.55, 0.02));
  for (const s of [-1, 1]) parts.add(Geo.cyl(0.045, 0.055, 0.70, 8), M.chrome, TRS(s * 0.13, 0.40, -0.30, Math.PI / 2 - 0.05, 0, 0));
  // frame neon
  parts.add(Geo.box(0.30, 0.02, 0.55), M.glow, TRS(0, 0.30, -0.05));
}

function buildAV(parts, M, rand, rig, owned, animators) {
  const BODY_Y = 1.05;
  const plan = [
    [0, 2.55], [0.52, 1.70], [0.86, 0.55], [1.02, -0.60], [0.86, -1.55],
    [0.42, -2.05], [-0.42, -2.05], [-0.86, -1.55], [-1.02, -0.60], [-0.86, 0.55], [-0.52, 1.70]
  ];
  const fus = Geo.plan('avbody', plan, 0.92, 0.06);
  parts.add(fus, M.body, TRS(0, BODY_Y, 0));
  // canopy
  parts.add(Geo.sph(0.52, 14, 10), M.glass, TRS(0, BODY_Y + 0.72, 1.30, 0, 0, 0, 0.92, 0.62, 1.55));
  parts.add(Geo.box(0.10, 0.16, 1.5), M.body, TRS(0, BODY_Y + 0.92, 1.20, -0.12, 0, 0));
  // spine + tail fins
  parts.add(Geo.box(0.44, 0.30, 1.5), M.body, TRS(0, BODY_Y + 0.80, -1.05));
  for (const s of [-1, 1]) parts.add(Geo.box(0.06, 0.80, 0.62), M.trim, TRS(s * 0.42, BODY_Y + 1.10, -1.75, 0, 0, -s * 0.30));
  parts.add(Geo.box(1.30, 0.05, 0.42), M.trim, TRS(0, BODY_Y + 1.42, -1.85));
  // ducted fans
  const fanPos = [[-1.34, 1.30], [1.34, 1.30], [-1.34, -1.05], [1.34, -1.05]];
  for (const [fx, fz] of fanPos) {
    parts.add(Geo.box(0.70, 0.16, 0.28), M.body, TRS(fx * 0.55, BODY_Y + 0.05, fz, 0, 0, 0));
    parts.add(Geo.torus(0.60, 0.15, 8, 18), M.trim, TRS(fx, BODY_Y + 0.05, fz, Math.PI / 2, 0, 0));
    parts.add(Geo.torus(0.60, 0.045, 6, 18), M.glow, TRS(fx, BODY_Y - 0.10, fz, Math.PI / 2, 0, 0));
    const rot = new THREE.Group();
    const rp = partList();
    for (let i = 0; i < 4; i++) rp.add(Geo.box(1.05, 0.02, 0.16), M.chrome, TRS(0, 0, 0, 0, (i / 4) * Math.PI, 0.12));
    rp.add(Geo.cyl(0.10, 0.10, 0.14, 8), M.chrome, TRS(0, 0, 0));
    rp.flush(rot, owned, { cast: false });
    rot.position.set(fx, BODY_Y + 0.05, fz);
    rig.add(rot);
    animators.push((t, dt) => { rot.rotation.y += (dt || 0.016) * 14; });
  }
  // landing skids
  for (const s of [-1, 1]) {
    parts.add(Geo.box(0.10, 0.09, 2.6), M.trim, TRS(s * 0.95, 0.05, -0.10));
    for (const z of [0.85, -1.05]) parts.add(Geo.cyl(0.05, 0.05, BODY_Y - 0.18, 6), M.trim, TRS(s * 0.95, (BODY_Y - 0.10) / 2, z, 0, 0, s * 0.10));
  }
  // lights: nav strobes + landing lights
  parts.add(Geo.box(0.9, 0.06, 0.06), M.head, TRS(0, BODY_Y - 0.30, 2.10));
  const nav = [];
  for (const [px, col] of [[-1.34, 0xff1744], [1.34, 0x69f0ae]]) {
    const mm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 4, roughness: 0.4 });
    owned.mats.push(mm);
    const gg = Geo.sph(0.075, 8, 6).clone();
    owned.geos.push(gg);
    const mesh = new THREE.Mesh(gg, mm);
    mesh.position.set(px, BODY_Y + 0.30, -1.9);
    rig.add(mesh); nav.push(mm);
  }
  animators.push((t) => {
    const on = (t % 1.2) < 0.15 ? 6 : 0.4;
    nav.forEach(m => { m.emissiveIntensity = on; });
  });
}

// ═══════════════════════════════════════════════════════════════════
// 10. PROPS
// Set dressing for encounter maps. Every prop is authored as a part list,
// so the same recipe can be emitted either as a single merged Group
// (buildPropToken) or as InstancedMeshes for hundreds of copies
// (buildPropField) with no extra geometry.
// ═══════════════════════════════════════════════════════════════════

export const PROP_KINDS = [
  'crate', 'barrel', 'dumpster', 'streetlight', 'neon sign', 'barricade',
  'terminal', 'server rack', 'chain-link fence', 'car wreck', 'med station',
  'ammo crate', 'table', 'chair', 'door', 'cover wall'
];

const propKey = (k) => String(k || '').toLowerCase().replace(/[^a-z]/g, '');
const PROP_LOOKUP = PROP_KINDS.reduce((m, k) => { m[propKey(k)] = k; return m; }, {});

const matMapped = (c, map, rough = 0.72, metal = 0.18) => ({
  k: `mp|${hex(c)}|${map.uuid}|${n(rough)}|${n(metal)}`,
  f: () => new THREE.MeshStandardMaterial({ color: hex(c), map, roughness: rough, metalness: metal, envMap: envTexture(), envMapIntensity: 0.8 })
});

function propMats(accent) {
  return {
    steel: Mat.metal(0x8592a6, 0.52),
    steelDark: Mat.metal(0x4c5566, 0.58),
    steelLight: Mat.metal(0xb2bfd0, 0.44),
    rust: Mat.metal(0xa2664a, 0.88),
    olive: Mat.metal(0x707c4e, 0.72),
    concrete: Mat.rough(0x8e9198),
    concreteDark: Mat.rough(0x5f6167),
    plastic: Mat.cloth(0x515a68, 0.7),
    white: Mat.cloth(0xdfe6ea, 0.55),
    // car wreck reuses addWheel(), which expects tyre/rim on the material book
    tyre: Mat.cloth(0x2b2f38, 0.95),
    rim: Mat.chrome(0x8f9aa8),
    glass: Mat.glass(0x0a0f18),
    chrome: Mat.chrome(0xd2dbe6),
    glow: Mat.glow(accent, 2.8),
    glowSoft: Mat.glow(accent, 1.6),
    warn: Mat.glow(0xffd600, 2.6),
    red: Mat.glow(0xff1744, 3.0),
    green: Mat.glow(0x69f0ae, 3.0),
    lamp: Mat.glow(0xfff0c8, 3.2),
    accentC: accent
  };
}

// Each recipe: (parts, M, rand) -> {r} approximate footprint radius.
const PROP_DEFS = {
  crate(parts, M) {
    parts.add(Geo.box(1.02, 0.92, 1.02), M.steel, TRS(0, 0.47, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.add(Geo.box(0.10, 0.98, 0.10), M.steelDark, TRS(sx * 0.48, 0.49, sz * 0.48));
    }
    for (const y of [0.10, 0.86]) parts.add(Geo.box(1.06, 0.07, 1.06), M.steelDark, TRS(0, y, 0));
    parts.add(Geo.box(0.60, 0.14, 0.02), matMapped(0xffffff, texHazard(0xffd600, 0x1a1a20)), TRS(0, 0.60, 0.52));
    parts.add(Geo.box(0.24, 0.05, 0.015), M.glow, TRS(-0.28, 0.30, 0.52));
    parts.add(Geo.box(0.34, 0.10, 0.03), M.steelLight, TRS(0.22, 0.30, 0.52));
    return { r: 0.78 };
  },
  barrel(parts, M) {
    parts.add(Geo.lathe('barrel', [
      [0.0, 0.0], [0.27, 0.0], [0.30, 0.05], [0.315, 0.14], [0.315, 0.80],
      [0.30, 0.89], [0.27, 0.94], [0.0, 0.94]
    ], 16), M.rust);
    for (const y of [0.26, 0.64]) parts.add(Geo.torus(0.315, 0.028, 6, 16), M.steelDark, TRS(0, y, 0, Math.PI / 2, 0, 0));
    parts.add(Geo.torus(0.30, 0.030, 6, 16), M.steelLight, TRS(0, 0.925, 0, Math.PI / 2, 0, 0));
    parts.add(Geo.cyl(0.322, 0.322, 0.17, 16, 1, true), matMapped(0xffffff, texHazard(0xff9100, 0x14100c)), TRS(0, 0.45, 0));
    parts.add(Geo.cyl(0.075, 0.075, 0.035, 8), M.steelLight, TRS(0.13, 0.955, 0));
    parts.add(Geo.box(0.10, 0.03, 0.012), M.warn, TRS(-0.12, 0.955, 0.14));
    return { r: 0.36 };
  },
  dumpster(parts, M) {
    parts.add(Geo.side('dumpster', [
      [-0.88, 0.20], [-1.00, 1.05], [1.00, 1.05], [0.88, 0.20], [0.72, 0.14], [-0.72, 0.14]
    ], 1.15, 0.03), M.rust);
    parts.add(Geo.box(2.06, 0.08, 1.22), M.steelDark, TRS(0, 1.10, 0));
    parts.add(Geo.box(2.06, 0.06, 0.10), M.steelLight, TRS(0, 1.15, -0.56));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.add(Geo.cyl(0.09, 0.09, 0.07, 8), M.plastic, TRS(sx * 0.72, 0.09, sz * 0.44, 0, 0, Math.PI / 2));
    }
    parts.add(Geo.plane(1.5, 0.75), Mat.flat(0xffffff, texTag(0xff2d95), { transparent: true, side: THREE.DoubleSide, depthWrite: false }), TRS(0, 0.62, 0.585));
    parts.add(Geo.box(1.9, 0.03, 0.02), M.glowSoft, TRS(0, 1.02, 0.575));
    return { r: 1.25 };
  },
  streetlight(parts, M) {
    parts.add(Geo.cyl(0.20, 0.24, 0.20, 10), M.concreteDark, TRS(0, 0.10, 0));
    parts.add(Geo.cyl(0.075, 0.10, 4.30, 10), M.steelDark, TRS(0, 2.25, 0));
    parts.add(Geo.tube('lamparm', [[0, 4.30, 0], [0, 4.62, 0.28], [0, 4.70, 0.78], [0, 4.66, 1.20]], 14, 0.055, 6), M.steelDark);
    parts.add(Geo.box(0.34, 0.13, 0.62), M.steelLight, TRS(0, 4.60, 1.20));
    parts.add(Geo.box(0.28, 0.03, 0.54), M.lamp, TRS(0, 4.52, 1.20));
    parts.add(Geo.cone(0.62, 1.5, 12, true), Mat.add(0xfff0c8, 0.13, texGlowDisc()), TRS(0, 3.80, 1.20, Math.PI, 0, 0));
    // civic tech: camera + a small neon panel
    parts.add(Geo.box(0.16, 0.14, 0.24), M.plastic, TRS(0.14, 3.90, 0.06, 0, 0, 0));
    parts.add(Geo.cyl(0.05, 0.055, 0.05, 8), M.glass, TRS(0.14, 3.88, 0.20, Math.PI / 2, 0, 0));
    parts.add(Geo.sph(0.022, 6, 5), M.red, TRS(0.14, 3.98, 0.18));
    parts.add(Geo.box(0.32, 0.85, 0.05), M.steelDark, TRS(-0.16, 2.60, 0, 0, 0.3, 0));
    parts.add(Geo.box(0.26, 0.74, 0.02), M.glow, TRS(-0.185, 2.60, 0.02, 0, 0.3, 0));
    return { r: 0.9 };
  },
  'neon sign'(parts, M, rand) {
    const word = NEON_WORDS[Math.floor(rand() * NEON_WORDS.length) % NEON_WORDS.length];
    const col = [0xff2d95, 0x00e5ff, 0xffd600, 0x69f0ae, 0x7c4dff][Math.floor(rand() * 5) % 5];
    parts.add(Geo.cyl(0.055, 0.065, 3.0, 8), M.steelDark, TRS(0, 1.50, 0));
    parts.add(Geo.cyl(0.22, 0.26, 0.10, 10), M.concreteDark, TRS(0, 0.05, 0));
    parts.add(Geo.box(0.05, 0.05, 0.55), M.steelDark, TRS(0, 2.75, 0.28));
    parts.add(Geo.box(2.10, 0.72, 0.09), M.plastic, TRS(0, 2.60, 0.56));
    const face = Mat.flat(0xffffff, texNeonSign(word, col), { side: THREE.DoubleSide });
    parts.add(Geo.plane(2.0, 0.62), face, TRS(0, 2.60, 0.615));
    parts.add(Geo.plane(2.0, 0.62), face, TRS(0, 2.60, 0.505, 0, Math.PI, 0));
    parts.add(Geo.box(2.14, 0.03, 0.03), Mat.glow(col, 3.0), TRS(0, 2.98, 0.56));
    parts.add(Geo.box(2.14, 0.03, 0.03), Mat.glow(col, 3.0), TRS(0, 2.22, 0.56));
    parts.add(Geo.circle(1.4, 20), Mat.add(col, 0.22, texGlowDisc()), TRS(0, 2.60, 0.68));
    return { r: 1.15 };
  },
  barricade(parts, M) {
    const hz = matMapped(0xffffff, texHazard(0xff9100, 0x16161c));
    for (const s of [-1, 1]) {
      parts.add(Geo.box(0.09, 1.05, 0.09), M.steelDark, TRS(s * 0.80, 0.52, 0.22, 0.22, 0, 0));
      parts.add(Geo.box(0.09, 1.05, 0.09), M.steelDark, TRS(s * 0.80, 0.52, -0.22, -0.22, 0, 0));
      parts.add(Geo.box(0.14, 0.05, 0.60), M.steelDark, TRS(s * 0.80, 0.02, 0));
    }
    parts.add(Geo.box(1.85, 0.24, 0.07), hz, TRS(0, 0.92, 0));
    parts.add(Geo.box(1.85, 0.24, 0.07), hz, TRS(0, 0.52, 0));
    parts.add(Geo.box(1.70, 0.035, 0.035), M.warn, TRS(0, 1.06, 0));
    for (let i = -1; i <= 1; i++) parts.add(Geo.sph(0.045, 8, 6), M.red, TRS(i * 0.55, 0.73, 0.05, 0, 0, 0, 1, 1, 0.4));
    return { r: 1.05 };
  },
  terminal(parts, M) {
    parts.add(Geo.box(0.62, 1.02, 0.48), M.steelDark, TRS(0, 0.51, 0));
    parts.add(Geo.box(0.68, 0.06, 0.54), M.steelLight, TRS(0, 1.05, 0));
    parts.add(Geo.box(0.72, 0.58, 0.10), M.plastic, TRS(0, 1.36, 0.06, -0.38, 0, 0));
    parts.add(Geo.plane(0.62, 0.47), Mat.flat(0xffffff, texScreen(0x00e5ff)), TRS(0, 1.375, 0.125, -0.38, 0, 0));
    parts.add(Geo.box(0.68, 0.03, 0.03), M.glow, TRS(0, 1.66, -0.01, -0.38, 0, 0));
    for (let i = 0; i < 4; i++) parts.add(Geo.box(0.50, 0.02, 0.02), M.steelLight, TRS(0, 0.30 + i * 0.09, 0.245));
    parts.add(Geo.box(0.44, 0.05, 0.015), M.glow, TRS(0, 0.14, 0.245));
    parts.add(Geo.circle(0.55, 20), Mat.add(0x00e5ff, 0.3, texGlowDisc()), TRS(0, 0.02, 0, -Math.PI / 2, 0, 0));
    return { r: 0.55 };
  },
  'server rack'(parts, M) {
    parts.add(Geo.box(0.86, 2.00, 0.92), M.steelDark, TRS(0, 1.00, 0));
    parts.add(Geo.plane(0.76, 1.86), Mat.flat(0xffffff, texRack()), TRS(0, 1.00, 0.465));
    for (const sx of [-1, 1]) parts.add(Geo.box(0.06, 2.04, 0.96), M.steel, TRS(sx * 0.43, 1.02, 0));
    parts.add(Geo.box(0.92, 0.08, 0.98), M.steel, TRS(0, 2.02, 0));
    parts.add(Geo.box(0.70, 0.03, 0.03), M.glow, TRS(0, 2.07, 0.42));
    for (const sx of [-1, 1]) parts.add(Geo.box(0.02, 1.70, 0.03), M.glowSoft, TRS(sx * 0.462, 1.00, 0.42));
    parts.add(Geo.tube('rackcable', [[-0.3, 1.9, -0.5], [-0.1, 1.5, -0.68], [0.15, 0.9, -0.6], [0.3, 0.35, -0.5]], 16, 0.035, 5), M.plastic);
    parts.add(Geo.tube('rackcable2', [[0.25, 1.95, -0.48], [0.35, 1.4, -0.72], [0.1, 0.7, -0.62], [-0.2, 0.2, -0.48]], 16, 0.028, 5), M.glowSoft);
    return { r: 0.72 };
  },
  'chain-link fence'(parts, M) {
    const mesh = texChainLink();
    const t = mesh.clone(); // per-prop repeat without touching the cache entry
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 4); t.needsUpdate = true;
    for (const sx of [-1, 1]) parts.add(Geo.cyl(0.055, 0.055, 2.30, 8), M.steel, TRS(sx * 1.25, 1.15, 0));
    parts.add(Geo.cyl(0.045, 0.045, 2.55, 8), M.steel, TRS(0, 2.24, 0, 0, 0, Math.PI / 2));
    parts.add(Geo.plane(2.5, 2.05), Mat.cutout(0x8d99ae, t), TRS(0, 1.15, 0));
    for (const sx of [-1, 1]) parts.add(Geo.box(0.04, 0.34, 0.04), M.steel, TRS(sx * 1.25, 2.40, 0.10, 0.4, 0, 0));
    for (let i = 0; i < 3; i++) parts.add(Geo.cyl(0.018, 0.018, 2.5, 5), M.steelLight, TRS(0, 2.36 + i * 0.10, 0.04 + i * 0.06, 0, 0, Math.PI / 2));
    return { r: 1.35, texs: [t] };
  },
  'car wreck'(parts, M) {
    const burnt = Mat.metal(0x4a443f, 0.94);
    const V0 = VEH['Sedan'];
    parts.add(Geo.side('Sedan:low', V0.low, V0.w, 0.06), burnt, TRS(0, 0.12, 0, 0.05, 0, 0.10));
    parts.add(Geo.side('Sedan:cab', V0.cab, V0.w * 0.86, 0.03), burnt, TRS(0, 0.02, 0, 0.05, 0, 0.10, 1, 0.62, 1));
    parts.add(Geo.box(V0.w * 0.8, 0.06, 1.5), burnt, TRS(0.1, 1.02, -0.35, 0.12, 0.06, 0.16));
    addWheel(parts, M, -V0.w * 0.47, -1.48, 0.35, 0.26);
    addWheel(parts, M, V0.w * 0.47, 1.48, 0.34, 0.26);
    parts.add(Geo.torus(0.27, 0.09, 8, 14), M.plastic, TRS(1.35, 0.09, -1.05, Math.PI / 2, 0.4, 0));
    parts.add(Geo.torus(0.27, 0.09, 8, 14), M.plastic, TRS(-1.55, 0.09, 1.20, Math.PI / 2, -0.6, 0));
    parts.add(Geo.box(0.9, 0.05, 0.5), burnt, TRS(-1.5, 0.03, 2.05, 0, 0.5, 0.05));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      parts.add(Geo.box(0.10, 0.02, 0.14), Mat.glass(0x1b2430), TRS(Math.cos(a) * (0.8 + i * 0.18), 0.02, Math.sin(a) * (1.2 + i * 0.2), 0, a * 2, 0));
    }
    for (let i = 0; i < 5; i++) parts.add(Geo.sph(0.035, 6, 5), Mat.glow(0xff5722, 3.6), TRS(-0.4 + i * 0.32, 0.72 + (i % 2) * 0.2, 0.9 - i * 0.25));
    parts.add(Geo.circle(1.4, 20), Mat.add(0xff5722, 0.25, texGlowDisc()), TRS(0, 0.03, 0.4, -Math.PI / 2, 0, 0));
    return { r: 2.6 };
  },
  'med station'(parts, M) {
    parts.add(Geo.box(1.00, 1.70, 0.46), M.white, TRS(0, 0.85, 0));
    parts.add(Geo.box(1.06, 0.10, 0.52), M.steelLight, TRS(0, 1.74, 0));
    parts.add(Geo.box(0.94, 0.60, 0.03), M.plastic, TRS(0, 1.25, 0.235));
    parts.add(Geo.plane(0.72, 0.42), Mat.flat(0xffffff, texScreen(0x69f0ae)), TRS(0, 1.28, 0.255));
    parts.add(Geo.box(0.42, 0.13, 0.02), M.green, TRS(0, 0.70, 0.24));
    parts.add(Geo.box(0.13, 0.42, 0.02), M.green, TRS(0, 0.70, 0.24));
    parts.add(Geo.box(0.90, 0.04, 0.03), M.green, TRS(0, 1.79, 0.20));
    for (let i = 0; i < 3; i++) parts.add(Geo.box(0.26, 0.20, 0.03), M.steelLight, TRS(-0.30 + i * 0.30, 0.35, 0.245));
    parts.add(Geo.cyl(0.030, 0.030, 1.90, 8), M.chrome, TRS(0.72, 0.95, 0.05));
    parts.add(Geo.cyl(0.16, 0.16, 0.04, 10), M.steelDark, TRS(0.72, 0.02, 0.05));
    parts.add(Geo.box(0.20, 0.30, 0.08), Mat.glow(0xdff3ff, 1.2), TRS(0.72, 1.66, 0.05));
    parts.add(Geo.tube('ivline', [[0.72, 1.50, 0.05], [0.60, 1.20, 0.16], [0.52, 0.95, 0.20]], 10, 0.010, 5), M.green);
    return { r: 0.85 };
  },
  'ammo crate'(parts, M) {
    parts.add(Geo.box(1.10, 0.44, 0.62), M.olive, TRS(0, 0.24, 0));
    parts.add(Geo.box(1.14, 0.10, 0.66), M.olive, TRS(0, 0.50, 0));
    parts.add(Geo.box(1.16, 0.05, 0.05), M.steelDark, TRS(0, 0.44, 0.32));
    for (const sx of [-1, 1]) parts.add(Geo.box(0.10, 0.16, 0.08), M.steelLight, TRS(sx * 0.40, 0.44, 0.32));
    for (const sx of [-1, 1]) parts.add(Geo.torus(0.10, 0.018, 5, 10, Math.PI), M.steelDark, TRS(sx * 0.58, 0.30, 0, 0, Math.PI / 2, Math.PI));
    parts.add(Geo.box(0.68, 0.12, 0.015), matMapped(0xffffff, texHazard(0xffd600, 0x2a2a12)), TRS(0, 0.20, 0.315));
    parts.add(Geo.box(0.30, 0.04, 0.012), M.warn, TRS(-0.30, 0.36, 0.315));
    return { r: 0.66 };
  },
  table(parts, M) {
    parts.add(Geo.box(1.60, 0.07, 0.90), M.steelLight, TRS(0, 0.76, 0));
    parts.add(Geo.box(1.52, 0.05, 0.82), M.plastic, TRS(0, 0.71, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.add(Geo.box(0.07, 0.72, 0.07), M.steelDark, TRS(sx * 0.70, 0.36, sz * 0.36));
    }
    parts.add(Geo.box(1.40, 0.04, 0.04), M.steelDark, TRS(0, 0.20, 0));
    parts.add(Geo.box(1.50, 0.02, 0.02), M.glow, TRS(0, 0.70, 0.44));
    return { r: 0.95 };
  },
  chair(parts, M) {
    parts.add(Geo.box(0.48, 0.07, 0.46), M.plastic, TRS(0, 0.45, 0));
    parts.add(Geo.box(0.46, 0.52, 0.06), M.plastic, TRS(0, 0.72, -0.21, -0.12, 0, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.add(Geo.cyl(0.022, 0.026, 0.44, 6), M.steelDark, TRS(sx * 0.20, 0.22, sz * 0.19));
    }
    parts.add(Geo.box(0.40, 0.02, 0.02), M.glowSoft, TRS(0, 0.415, 0.22));
    return { r: 0.36 };
  },
  door(parts, M) {
    parts.add(Geo.box(0.14, 2.30, 0.22), M.steelDark, TRS(-0.62, 1.15, 0));
    parts.add(Geo.box(0.14, 2.30, 0.22), M.steelDark, TRS(0.62, 1.15, 0));
    parts.add(Geo.box(1.38, 0.16, 0.22), M.steelDark, TRS(0, 2.22, 0));
    parts.add(Geo.box(1.10, 2.12, 0.10), M.steel, TRS(0, 1.06, 0));
    parts.add(Geo.box(0.03, 2.06, 0.12), M.steelDark, TRS(0, 1.06, 0));
    for (const sx of [-1, 1]) parts.add(Geo.box(0.42, 0.10, 0.12), M.steelDark, TRS(sx * 0.30, 1.55, 0));
    parts.add(Geo.box(1.16, 0.05, 0.03), M.glow, TRS(0, 2.14, 0.12));
    parts.add(Geo.box(0.14, 0.22, 0.06), M.plastic, TRS(0.76, 1.20, 0.10));
    parts.add(Geo.box(0.09, 0.09, 0.02), M.green, TRS(0.76, 1.25, 0.14));
    parts.add(Geo.box(0.09, 0.02, 0.02), M.red, TRS(0.76, 1.12, 0.14));
    return { r: 0.80 };
  },
  'cover wall'(parts, M) {
    parts.add(Geo.box(2.40, 1.15, 0.34), M.concrete, TRS(0, 0.60, 0));
    parts.add(Geo.box(2.56, 0.16, 0.48), M.concreteDark, TRS(0, 0.08, 0));
    parts.add(Geo.box(2.46, 0.08, 0.40), M.concreteDark, TRS(0, 1.19, 0));
    for (let i = 0; i < 5; i++) parts.add(Geo.cyl(0.018, 0.018, 0.28, 5), M.rust, TRS(-0.95 + i * 0.48, 1.32, 0.02, 0.1 * (i % 2 ? 1 : -1), 0, 0.06 * (i % 3 - 1)));
    parts.add(Geo.plane(1.7, 0.85), Mat.flat(0xffffff, texTag(0x00e5ff), { transparent: true, side: THREE.DoubleSide, depthWrite: false }), TRS(-0.1, 0.62, 0.175));
    parts.add(Geo.box(2.30, 0.03, 0.02), M.glowSoft, TRS(0, 0.16, 0.175));
    parts.add(Geo.box(0.30, 0.22, 0.10), M.concreteDark, TRS(0.92, 1.06, 0.06, 0.3, 0.2, 0.4));
    return { r: 1.35 };
  }
};

/**
 * Build one prop as a standalone token.
 * @param {string} kind One of PROP_KINDS (case/punctuation insensitive).
 * @param {object} [opts] scale, rotation, seed, accent, base (bool),
 *                        label (bool), castShadow, receiveShadow
 */
export function buildPropToken(kind, opts = {}) {
  const canonical = PROP_LOOKUP[propKey(kind)];
  if (!canonical) throw new Error(`Unknown prop kind "${kind}". Known: ${PROP_KINDS.join(', ')}`);
  const rand = seededRandom(opts.seed ?? canonical);
  const owned = ownedBag();
  const animators = [];
  const group = new THREE.Group();
  group.name = `prop:${canonical}`;
  const M = propMats(hex(opts.accent ?? PALETTE.neon));
  const parts = partList();
  const info = PROP_DEFS[canonical](parts, M, rand) || { r: 1 };
  if (info.texs) info.texs.forEach(t => owned.texs.push(t));
  parts.flush(group, owned, { cast: opts.castShadow !== false, receive: opts.receiveShadow === true });

  if (opts.base) {
    const base = buildBase(owned, animators, {
      radius: opts.baseRadius ?? info.r, color: FACTION_COLOR.prop, glow: false, hp: 1, threat: 0
    });
    group.add(base.group);
    group.setSelected = (b) => base.setSelected(b);
  } else {
    group.setSelected = () => { };
  }
  if (opts.label) group.add(buildLabel(owned, canonical.toUpperCase(), 'PROP', PALETTE.neon, { width: 1.1, y: info.r + 1.4 }));
  if (opts.scale) group.scale.setScalar(opts.scale);
  if (opts.rotation) group.rotation.y = opts.rotation;

  return finalize(group, { kind: 'prop', id: opts.id || `${canonical}:${Math.random().toString(36).slice(2, 8)}`, name: canonical }, owned, animators);
}

/**
 * Instanced prop field — the cheap way to dress a whole encounter map.
 * @param {string} kind
 * @param {Array} placements  [{x,z,y?,ry?,scale?}] or THREE.Matrix4[]
 * @returns {THREE.Group} one InstancedMesh per material.
 */
export function buildPropField(kind, placements = [], opts = {}) {
  const canonical = PROP_LOOKUP[propKey(kind)];
  if (!canonical) throw new Error(`Unknown prop kind "${kind}"`);
  if (!placements.length) throw new Error('buildPropField needs at least one placement');
  const rand = seededRandom(opts.seed ?? canonical);
  const owned = ownedBag();
  const group = new THREE.Group();
  group.name = `propfield:${canonical}`;
  const M = propMats(hex(opts.accent ?? PALETTE.neon));
  const parts = partList();
  const info = PROP_DEFS[canonical](parts, M, rand) || { r: 1 };
  if (info.texs) info.texs.forEach(t => owned.texs.push(t));
  const mats = placements.map(p => p && p.isMatrix4 ? p
    : TRS(p.x || 0, p.y || 0, p.z || 0, 0, p.ry || 0, 0, p.scale || 1));
  parts.flushInstanced(group, owned, mats, { cast: opts.castShadow !== false, receive: opts.receiveShadow === true });
  return finalize(group, { kind: 'propfield', id: opts.id || canonical, name: `${canonical} x${placements.length}` }, owned, []);
}

// ═══════════════════════════════════════════════════════════════════
// 11. CUSTOM MODELS (GLB / GLTF) + LIBRARY
// ═══════════════════════════════════════════════════════════════════

export const MAX_MODEL_BYTES = 24 * 1024 * 1024;   // 24 MB hard cap
const MAX_MODEL_VERTS = 1500000;                   // refuse absurd meshes
const LS_INDEX = 'cpred_map3d_tokenlib';
const LS_ASSET = 'cpred_map3d_token:';
const LS_MAX_ASSET = 1.4 * 1024 * 1024;            // localStorage fallback cap

let _loader = null;
async function getLoader() {
  if (!_loader) {
    const mod = await import('three/addons/loaders/GLTFLoader.js');
    _loader = new mod.GLTFLoader();
  }
  return _loader;
}

function toArrayBuffer(input) {
  if (!input) return Promise.reject(new Error('No model data supplied.'));
  if (input instanceof ArrayBuffer) return Promise.resolve(input);
  if (ArrayBuffer.isView(input)) return Promise.resolve(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  if (typeof Blob !== 'undefined' && input instanceof Blob) return input.arrayBuffer();
  if (input && typeof input.arrayBuffer === 'function') return input.arrayBuffer();
  return Promise.reject(new Error('Unsupported model input — pass a File, Blob or ArrayBuffer.'));
}

function fmtBytes(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
  return b + ' bytes';
}

function sniff(buf) {
  const b = new Uint8Array(buf, 0, Math.min(buf.byteLength, 64));
  if (b[0] === 0x67 && b[1] === 0x6c && b[2] === 0x54 && b[3] === 0x46) return 'glb';   // "glTF"
  const head = new TextDecoder().decode(b).trimStart();
  if (head.startsWith('{')) return 'gltf';
  return null;
}

/**
 * Load a user-supplied GLB/GLTF and normalise it into a map token.
 *
 * Safety: size-capped, format-sniffed, vertex-capped, and every failure mode
 * throws a plain-English Error rather than leaving a half-built Group behind.
 *
 * @param {File|Blob|ArrayBuffer|Uint8Array} fileOrArrayBuffer
 * @param {object} [opts] name, targetSize (default 2), faction, label,
 *                        base (default true), baseRadius, scale
 */
export async function loadCustomToken(fileOrArrayBuffer, opts = {}) {
  const buf = await toArrayBuffer(fileOrArrayBuffer);
  const max = opts.maxBytes ?? MAX_MODEL_BYTES;
  if (buf.byteLength === 0) throw new Error('Model file is empty.');
  if (buf.byteLength > max) {
    throw new Error(`Model is ${fmtBytes(buf.byteLength)} — the limit is ${fmtBytes(max)}. Decimate it, or re-export as GLB with Draco off and textures resized.`);
  }
  const fmt = sniff(buf);
  if (!fmt) throw new Error('Not a glTF file. Only .glb (binary) or self-contained .gltf are supported.');

  const loader = await getLoader();
  let gltf;
  try {
    gltf = await loader.parseAsync(buf, '');
  } catch (err) {
    const m = String(err && err.message || err);
    if (/KHR_draco|DRACOLoader/i.test(m)) throw new Error('This GLB uses Draco compression, which needs a decoder this offline build does not ship. Re-export without Draco.');
    if (/KHR_texture_basisu|KTX2/i.test(m)) throw new Error('This GLB uses KTX2/Basis textures, which are not supported offline. Re-export with PNG/JPEG textures.');
    if (/\.bin|external|Failed to load buffer/i.test(m)) throw new Error('This .gltf references external files. Export a single self-contained .glb instead.');
    throw new Error('Could not parse the model: ' + m);
  }

  const src = gltf.scene || (gltf.scenes && gltf.scenes[0]);
  if (!src) throw new Error('The file parsed but contains no scene.');

  let meshes = 0, verts = 0;
  src.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { meshes++; verts += (o.geometry?.attributes?.position?.count) || 0; } });
  if (!meshes) throw new Error('The model contains no meshes.');
  if (verts > MAX_MODEL_VERTS) {
    disposeSubtree(src);
    throw new Error(`Model has ${verts.toLocaleString()} vertices — the limit is ${MAX_MODEL_VERTS.toLocaleString()}. Decimate it before importing.`);
  }

  const owned = ownedBag();
  const animators = [];
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  inner.add(src);

  // Normalise: centre on the origin in XZ, scale so the longest axis is
  // targetSize, then drop the lowest point onto y = 0.
  const box = new THREE.Box3().setFromObject(src);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const target = opts.targetSize ?? 2;
  const s = target / maxDim;
  src.position.set(-centre.x * s, -box.min.y * s, -centre.z * s);
  src.scale.setScalar(s);
  src.updateMatrixWorld(true);

  src.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = opts.castShadow !== false;
      o.receiveShadow = false;
      o.frustumCulled = true;
    }
  });

  // The loaded subtree is fully owned by this token.
  owned.geos.push({ dispose: () => disposeSubtree(src) });

  const footprint = Math.max(size.x, size.z) * s * 0.5;
  const faction = opts.faction || 'custom';
  const fcol = FACTION_COLOR[faction] ?? FACTION_COLOR.custom;
  const base = buildBase(owned, animators, {
    radius: opts.baseRadius ?? Math.max(0.55, footprint * 1.12),
    color: fcol, threat: opts.threat ?? 0, hp: opts.hp ?? 1, glow: opts.base !== false
  });
  if (opts.base !== false) group.add(base.group);

  const name = opts.name || (fileOrArrayBuffer && fileOrArrayBuffer.name) || 'Custom Token';
  if (opts.label) {
    group.add(buildLabel(owned, name.replace(/\.(glb|gltf)$/i, ''), 'CUSTOM MODEL', fcol,
      { width: 1.5, y: size.y * s + 0.42 }));
  }

  // Play the first embedded animation clip, if any.
  if (gltf.animations && gltf.animations.length) {
    const mixer = new THREE.AnimationMixer(src);
    mixer.clipAction(gltf.animations[0]).play();
    animators.push((t, dt) => mixer.update(dt || 0.016));
    group.userData.hasAnimation = true;
  }

  group.setHP = (f) => base.setHP(f);
  group.setSelected = (b) => base.setSelected(b);
  if (opts.selected) base.setSelected(true);
  if (opts.scale) group.scale.setScalar(opts.scale);

  const g = finalize(group, { kind: 'custom', id: opts.id || `custom:${name}`, name }, owned, animators);
  g.userData.stats = { meshes, verts, bytes: buf.byteLength, targetSize: target };
  return g;
}

function disposeSubtree(root) {
  root.traverse(o => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    mats.forEach(m => {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'clearcoatMap', 'sheenColorMap', 'specularMap', 'envMap']) {
        m[k]?.dispose?.();
      }
      m.dispose?.();
    });
  });
  root.removeFromParent();
}

// ── library persistence ────────────────────────────────────────────
// Electron (nodeIntegration is on in this app) writes real .glb files next to
// the character store. In a plain browser we fall back to base64 in
// localStorage, which is only viable for small models.

function nodeAPI() {
  try {
    if (typeof require === 'function') return { fs: require('fs'), path: require('path') };
  } catch (e) { /* not Electron */ }
  return null;
}

let _libIndex = [];
let _libDir = null;
let _libReady = null;

function libFile(fsx, dir) { return fsx.path.join(dir, 'index.json'); }

async function ensureLibrary() {
  if (_libReady) return _libReady;
  _libReady = (async () => {
    const api = nodeAPI();
    if (api && ipc) {
      try {
        // store-list hands back the pcs directory; the token library lives as a
        // sibling of `characters/` under the same userData root.
        const res = await ipc.invoke('store-list', 'pcs');
        const pcsDir = res && res.dir;
        if (pcsDir) {
          const userData = api.path.dirname(api.path.dirname(pcsDir));
          _libDir = api.path.join(userData, 'map3d-tokens');
          if (!api.fs.existsSync(_libDir)) api.fs.mkdirSync(_libDir, { recursive: true });
          const idx = libFile(api, _libDir);
          if (api.fs.existsSync(idx)) {
            _libIndex = JSON.parse(api.fs.readFileSync(idx, 'utf8')) || [];
          } else { _libIndex = []; }
          return { mode: 'fs', dir: _libDir };
        }
      } catch (e) { console.warn('[tokens] fs library unavailable, falling back to localStorage:', e.message); }
    }
    try { _libIndex = JSON.parse(localStorage.getItem(LS_INDEX) || '[]'); } catch (e) { _libIndex = []; }
    return { mode: 'localStorage' };
  })();
  return _libReady;
}
ensureLibrary().catch(() => { });

/** Await this if you need the library index to be populated before reading it. */
export function libraryReady() { return ensureLibrary(); }

/**
 * Saved custom-token metadata: [{ id, name, bytes, addedAt, file?, mode }].
 * Synchronous by contract; call `await libraryReady()` first on a cold start.
 */
export function tokenLibrary() { return _libIndex.slice(); }

function b64encode(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64decode(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * Persist a GLB so it survives a restart.
 * @param {string} name
 * @param {ArrayBuffer|Uint8Array|File|Blob} arrayBuffer
 * @returns {Promise<object>} the new library entry
 */
export async function saveCustomToken(name, arrayBuffer) {
  const mode = await ensureLibrary();
  const buf = await toArrayBuffer(arrayBuffer);
  if (buf.byteLength > MAX_MODEL_BYTES) throw new Error(`Model is ${fmtBytes(buf.byteLength)}, over the ${fmtBytes(MAX_MODEL_BYTES)} library limit.`);
  if (!sniff(buf)) throw new Error('Refusing to save: this is not a glTF/GLB file.');

  const id = 'tok_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  const entry = { id, name: String(name || 'Custom Token').slice(0, 80), bytes: buf.byteLength, addedAt: Date.now(), mode: mode.mode };

  if (mode.mode === 'fs') {
    const api = nodeAPI();
    entry.file = id + '.glb';
    api.fs.writeFileSync(api.path.join(_libDir, entry.file), Buffer.from(buf));
    _libIndex.push(entry);
    api.fs.writeFileSync(libFile(api, _libDir), JSON.stringify(_libIndex, null, 2));
  } else {
    if (buf.byteLength > LS_MAX_ASSET) {
      throw new Error(
        `This model is ${fmtBytes(buf.byteLength)}. Outside Electron the library falls back to localStorage, ` +
        `which caps out around ${fmtBytes(LS_MAX_ASSET)} per model. ` +
        `Run the desktop app, or add a dedicated binary-asset IPC handler in src/main.js.`);
    }
    try {
      localStorage.setItem(LS_ASSET + id, b64encode(buf));
    } catch (e) {
      throw new Error('localStorage is full — delete some custom tokens, or add a binary-asset IPC handler in src/main.js.');
    }
    _libIndex.push(entry);
    localStorage.setItem(LS_INDEX, JSON.stringify(_libIndex));
  }
  return entry;
}

/** Remove a saved token (and its asset) from the library. */
export async function deleteCustomToken(id) {
  const mode = await ensureLibrary();
  const i = _libIndex.findIndex(e => e.id === id);
  if (i < 0) return false;
  const entry = _libIndex[i];
  if (mode.mode === 'fs' && entry.file) {
    const api = nodeAPI();
    try { api.fs.unlinkSync(api.path.join(_libDir, entry.file)); } catch (e) { /* already gone */ }
    _libIndex.splice(i, 1);
    api.fs.writeFileSync(libFile(api, _libDir), JSON.stringify(_libIndex, null, 2));
  } else {
    try { localStorage.removeItem(LS_ASSET + id); } catch (e) { }
    _libIndex.splice(i, 1);
    try { localStorage.setItem(LS_INDEX, JSON.stringify(_libIndex)); } catch (e) { }
  }
  return true;
}

/** Rebuild a token from the saved library. */
export async function loadLibraryToken(id, opts = {}) {
  const mode = await ensureLibrary();
  const entry = _libIndex.find(e => e.id === id);
  if (!entry) throw new Error(`No saved token with id "${id}".`);
  let buf;
  if (mode.mode === 'fs' && entry.file) {
    const api = nodeAPI();
    const b = api.fs.readFileSync(api.path.join(_libDir, entry.file));
    buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  } else {
    const s = localStorage.getItem(LS_ASSET + id);
    if (!s) throw new Error(`Saved token "${entry.name}" is missing its asset data.`);
    buf = b64decode(s);
  }
  return loadCustomToken(buf, Object.assign({ name: entry.name, id: entry.id }, opts));
}

// ═══════════════════════════════════════════════════════════════════
// 12. HOUSEKEEPING
// ═══════════════════════════════════════════════════════════════════

/**
 * Free the module-level geometry/texture caches. Individual tokens own their
 * merged geometry and materials and free those in their own dispose(); this
 * is only needed when tearing the whole 3D panel down for good.
 */
export function disposeTokenCaches() {
  _envTex = null;
  _geoCache.forEach(g => g.dispose());
  _geoCache.clear();
  _texCache.forEach(t => t.dispose());
  _texCache.clear();
}

/** Cache stats — handy when profiling a busy encounter map. */
export function tokenCacheStats() {
  return { geometries: _geoCache.size, textures: _texCache.size };
}

/** Build a token straight off a roster entry, choosing the right builder. */
export function buildTokenFor(entry, opts = {}) {
  if (!entry) throw new Error('buildTokenFor needs an entry.');
  if (entry.stats || entry.role) return buildCharacterToken(entry, opts);
  if (entry.sdp || entry.seats || VEHICLE_KINDS.includes(entry.kind || entry.name)) return buildVehicleToken(entry, opts);
  if (PROP_LOOKUP[propKey(entry.kind || entry.name)]) return buildPropToken(entry.kind || entry.name, opts);
  return buildCharacterToken(entry, opts);
}
