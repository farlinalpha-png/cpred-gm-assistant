// ═══════════════════════════════════════════════════════════════════
// CP:RED 3D MAPS — presentation scene (player-facing / TV)
// Builds the same city and encounter geometry the GM is looking at, but
// tuned for a screen you read from across the room: fatter neon, bigger
// labels, no GM chrome. Driven entirely by the state object the GM pushes.
// ═══════════════════════════════════════════════════════════════════
import { THREE, createStage, THEMES, PALETTE, districts, neonMaterial, seededRandom } from './core.js';

const CITY_CENTER = [60, 0, 50];
const CITY_HOME = { p: [60, 70, 112], t: [60, 0, 52] };

// ── Canvas text sprites ────────────────────────────────────────────
// Everything readable at TV distance goes through here so weight and
// glow stay consistent across district names, tokens and the spotlight.
const FONT_STACK = "'Orbitron','Rajdhani','Share Tech Mono','Consolas',monospace";

function textSprite(text, opts = {}) {
  const {
    color = '#e8f7ff', glow = '#00e5ff', px = 64, weight = 700,
    letter = 4, sub = '', worldHeight = 4.2, opacity = 1
  } = opts;
  const pad = Math.round(px * 0.5);
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `${weight} ${px}px ${FONT_STACK}`;
  const subPx = Math.round(px * 0.52);
  g.font = font;
  const spaced = letter ? String(text).split('').join(String.fromCharCode(8202)) : String(text);
  const w1 = g.measureText(spaced).width + letter * spaced.length;
  g.font = `500 ${subPx}px ${FONT_STACK}`;
  const w2 = sub ? g.measureText(sub).width + 2 * sub.length : 0;
  c.width = Math.ceil(Math.max(w1, w2) + pad * 2);
  c.height = Math.ceil(px * (sub ? 2.35 : 1.55) + pad);

  g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = glow;
  g.shadowBlur = px * 0.55;
  g.font = font;
  g.letterSpacing = letter + 'px';
  g.fillStyle = color;
  g.fillText(String(text).toUpperCase(), c.width / 2, px * 0.85);
  if (sub) {
    g.shadowBlur = px * 0.3;
    g.font = `500 ${subPx}px ${FONT_STACK}`;
    g.letterSpacing = '2px';
    g.fillStyle = 'rgba(200,225,240,0.85)';
    g.fillText(sub.toUpperCase(), c.width / 2, px * 1.72);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false, opacity
  });
  const sp = new THREE.Sprite(mat);
  sp.renderOrder = 20;
  const aspect = c.width / c.height;
  sp.scale.set(worldHeight * aspect, worldHeight, 1);
  sp.userData.baseScale = [worldHeight * aspect, worldHeight];
  return sp;
}

function disposeTree(obj) {
  obj.traverse(o => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    mats.forEach(m => { m.map?.dispose?.(); m.dispose?.(); });
  });
  obj.parent?.remove(obj);
}

// ── City build ─────────────────────────────────────────────────────
function buildCity() {
  const root = new THREE.Group();
  root.name = 'city';
  const list = districts();
  const blocks = new Map();

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x090a12, roughness: 0.95, metalness: 0.1 })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(CITY_CENTER[0], -0.06, CITY_CENTER[2]);
  plate.receiveShadow = true;
  root.add(plate);

  const grid = new THREE.GridHelper(200, 50, PALETTE.neon, 0x1b2136);
  grid.position.set(CITY_CENTER[0], 0, CITY_CENTER[2]);
  grid.material.transparent = true;
  grid.material.opacity = 0.2;
  root.add(grid);
  root.userData.grid = grid;

  list.forEach(d => {
    const accent = new THREE.Color(d.accent || '#00e5ff').getHex();
    const h = 3 + (d.tier || 1) * 4.2;
    const g = new THREE.Group();
    g.position.set(d.x, 0, d.z);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(d.w, h, d.d),
      new THREE.MeshStandardMaterial({ color: 0x161829, roughness: 0.55, metalness: 0.45 })
    );
    body.position.y = h / 2;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(body.geometry),
      new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.55 })
    );
    edges.position.y = h / 2;
    g.add(edges);

    // Rooftop rim, not a filled slab: a solid glowing top face turns into a
    // white blob once bloom hits it at close camera range.
    const crownMat = neonMaterial(accent, 1.0);
    const T = 0.5;
    const rim = new THREE.Group();
    [[d.w * 1.04, T, 0, -d.d / 2], [d.w * 1.04, T, 0, d.d / 2],
     [T, d.d * 1.04, -d.w / 2, 0], [T, d.d * 1.04, d.w / 2, 0]].forEach(([bw, bd, bx, bz]) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.42, bd), crownMat);
      bar.position.set(bx, h + 0.2, bz);
      rim.add(bar);
    });
    g.add(rim);

    // Ground ring used for focus + spotlight targeting
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(d.w, d.d) * 0.62, Math.max(d.w, d.d) * 0.68, 64),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);

    // Location pips — one lit stub per location, deterministic placement
    const locs = d.locations || [];
    const rnd = seededRandom('loc' + d.code);
    locs.forEach((loc, i) => {
      const px = (rnd() - 0.5) * d.w * 0.78;
      const pz = (rnd() - 0.5) * d.d * 0.78;
      const ph = 1.2 + rnd() * 3.4;
      const pip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.3, ph, 6),
        neonMaterial(i % 3 === 0 ? PALETTE.gold : accent, 0.9)
      );
      pip.position.set(px, h + ph / 2 + 0.5, pz);
      g.add(pip);
    });

    const label = textSprite(d.name, {
      color: '#dff4ff', glow: '#' + accent.toString(16).padStart(6, '0'),
      px: 56, worldHeight: 3.4, sub: `${d.code} · ${d.region}`, opacity: 0.42
    });
    label.position.set(0, h + 9, 0);
    g.add(label);

    root.add(g);
    blocks.set(d.code, { group: g, body, crownMat, edges, ring, label, h, accent, data: d });
  });

  root.userData.blocks = blocks;
  return root;
}

// ── Encounter build ────────────────────────────────────────────────
function buildEncounter() {
  const root = new THREE.Group();
  root.name = 'encounter';
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x12141f, roughness: 0.9, metalness: 0.15 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const grid = new THREE.GridHelper(80, 40, PALETTE.neon, 0x232a40);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.position.y = 0.01;
  root.add(grid);
  root.userData.grid = grid;

  // A soft horizon band so the arena doesn't float in a void on a big screen
  const band = new THREE.Mesh(
    new THREE.RingGeometry(38, 41, 96),
    new THREE.MeshBasicMaterial({ color: PALETTE.neon, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
  );
  band.rotation.x = -Math.PI / 2;
  band.position.y = 0.02;
  root.add(band);
  root.userData.band = band;
  return root;
}

// ── Spotlight rig ──────────────────────────────────────────────────
function buildSpotlight() {
  const g = new THREE.Group();
  g.visible = false;

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 5.5, 46, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: PALETTE.gold, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  beam.position.y = 23;
  g.add(beam);

  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(
      new THREE.RingGeometry(3, 3.5, 64),
      new THREE.MeshBasicMaterial({
        color: PALETTE.gold, transparent: true, opacity: 0.8,
        side: THREE.DoubleSide, depthWrite: false
      })
    );
    r.rotation.x = -Math.PI / 2;
    r.position.y = 0.12;
    r.userData.phase = i / 3;
    g.add(r); rings.push(r);
  }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff3b0 })
  );
  core.position.y = 1.2;
  g.add(core);

  g.userData = { rings, beam, core, label: null };
  return g;
}

// ── Tokens ─────────────────────────────────────────────────────────
function makeToken(t) {
  const g = new THREE.Group();
  const color = new THREE.Color(t.color || (t.kind === 'pc' ? '#00e5ff' : '#ff1744')).getHex();

  const puck = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 0.45, 28),
    new THREE.MeshStandardMaterial({ color: 0x11131f, roughness: 0.5, metalness: 0.6 })
  );
  puck.position.y = 0.25;
  puck.castShadow = true;
  g.add(puck);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.13, 12, 40),
    neonMaterial(color, 1.9)
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.5;
  g.add(ring);

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 3.2, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  pillar.position.y = 1.9;
  g.add(pillar);

  const label = textSprite(t.name || t.id, {
    color: '#ffffff', glow: '#' + color.toString(16).padStart(6, '0'),
    px: 52, worldHeight: 2.6, sub: t.sub || ''
  });
  label.position.y = 5.4;
  g.add(label);

  g.userData = { ring, pillar, label, sig: tokenSig(t) };
  return g;
}

function tokenSig(t) {
  return [t.name, t.color, t.kind, t.sub].join('|');
}

// ── Presentation controller ────────────────────────────────────────
export function createPresentation(container) {
  const stage = createStage(container, {
    theme: THEMES.street,
    cameraPos: CITY_HOME.p,
    target: CITY_HOME.t,
    fov: 46,
    exposure: 1.05
  });
  stage.controls.enabled = false;      // the display never takes input
  stage.controls.enableDamping = false;

  // Broadcast grade. Two deliberate departures from the shared theme values,
  // both because a TV is a different viewing context to the GM's panel:
  //  · bloom is pulled back and its threshold raised, or the neon smears into
  //    a white sheet at wide framings;
  //  · the city shot needs far more fog depth than an encounter room — the
  //    theme's 160-unit fog swallows Night City whole from a wide camera.
  function tuneStage(theme, show) {
    stage.bloom.strength = Math.min(0.8, Math.max(0.3, (theme.bloom ?? 0.8) * 0.55));
    stage.bloom.threshold = 0.95;
    stage.bloom.radius = 0.5;
    if (show === 'encounter') {
      stage.scene.fog.near = theme.fogNear;
      stage.scene.fog.far = theme.fogFar;
    } else {
      stage.scene.fog.near = 70;
      stage.scene.fog.far = 420;
    }
  }
  tuneStage(THEMES.street, 'city');

  const city = buildCity();
  const enc = buildEncounter();
  const spot = buildSpotlight();
  const tokenRoot = new THREE.Group();
  enc.visible = false;
  stage.scene.add(city, enc, spot, tokenRoot);

  const tokens = new Map();
  let state = null;
  let focusCode = null;
  const desired = {
    p: new THREE.Vector3(...CITY_HOME.p),
    t: new THREE.Vector3(...CITY_HOME.t)
  };
  let autoOrbit = true, orbitAngle = 0;
  let spotLabel = null;

  function frameDistrict(code) {
    const b = city.userData.blocks.get(code);
    if (!b) return;
    const d = b.data;
    desired.t.set(d.x, 0, d.z);
    desired.p.set(d.x + 22, 34 + b.h, d.z + 34);
  }

  function applyTokens(list) {
    const seen = new Set();
    (list || []).forEach(t => {
      if (!t || t.id == null) return;
      const id = String(t.id);
      seen.add(id);
      let g = tokens.get(id);
      if (g && g.userData.sig !== tokenSig(t)) { disposeTree(g); tokens.delete(id); g = null; }
      if (!g) { g = makeToken(t); tokenRoot.add(g); tokens.set(id, g); }
      const y = t.y || 0;
      // First placement snaps; later moves glide (handled in the frame loop).
      if (!g.userData.placed) { g.position.set(t.x || 0, y, t.z || 0); g.userData.placed = true; }
      g.userData.goal = new THREE.Vector3(t.x || 0, y, t.z || 0);
      g.visible = !t.hidden;
      g.userData.dead = !!t.dead;
    });
    for (const [id, g] of Array.from(tokens)) {
      if (!seen.has(id)) { disposeTree(g); tokens.delete(id); }
    }
  }

  function apply(next) {
    const prev = state;
    state = next || null;
    if (!state) return;

    const theme = THEMES[state.theme] || THEMES.street;
    const show = state.show || 'standby';
    if (!prev || prev.theme !== state.theme) stage.setTheme(theme);
    if (!prev || prev.theme !== state.theme || prev.show !== state.show) tuneStage(theme, show);
    const standby = show === 'standby';
    city.visible = show !== 'encounter';
    enc.visible = show === 'encounter';
    // Standby is an attract loop, not a paused scene: the table should not be
    // reading last scene's tokens or spotlight through the slate.
    tokenRoot.visible = !standby;

    // District focus
    if (focusCode !== state.district) {
      focusCode = state.district || null;
      city.userData.blocks.forEach((b, code) => {
        const on = code === focusCode;
        b.label.material.opacity = on ? 1 : (focusCode ? 0.16 : 0.42);
        b.ring.material.opacity = on ? 0.85 : 0;
        b.edges.material.opacity = on ? 1 : (focusCode ? 0.22 : 0.55);
        b.crownMat.emissiveIntensity = on ? 2.1 : 1.0;
      });
    }

    // Camera
    autoOrbit = standby || !state.camera || state.camLock === false;
    if (!standby && state.camera && state.camLock !== false) {
      const p = state.camera.p || CITY_HOME.p, t = state.camera.t || CITY_HOME.t;
      desired.p.set(p[0], p[1], p[2]);
      desired.t.set(t[0], t[1], t[2]);
    } else if (show === 'encounter') {
      desired.t.set(0, 0, 0);
    } else if (focusCode) {
      frameDistrict(focusCode);
    } else {
      desired.t.set(CITY_HOME.t[0], CITY_HOME.t[1], CITY_HOME.t[2]);
    }

    // Spotlight
    const sl = state.spotlight || {};
    spot.visible = !!sl.on && !standby;
    if (sl.on) {
      spot.position.set(sl.x || 0, 0, sl.z || 0);
      const want = sl.label || '';
      if (spotLabel && spotLabel.userData.text !== want) { disposeTree(spotLabel); spotLabel = null; }
      if (want && !spotLabel) {
        spotLabel = textSprite(want, { color: '#fff6c9', glow: '#ffd600', px: 62, worldHeight: 4.4 });
        spotLabel.position.y = 12;
        spotLabel.userData.text = want;
        spot.add(spotLabel);
      }
      if (!want && spotLabel) { disposeTree(spotLabel); spotLabel = null; }
    }

    applyTokens(state.tokens);
  }

  function frame(dt, t) {
    // Camera easing keeps 4 Hz updates from looking like a slideshow.
    if (autoOrbit) {
      orbitAngle += dt * 0.06;
      const c = enc.visible ? [0, 0, 0] : CITY_CENTER;
      const rad = enc.visible ? 34 : 86;
      const hgt = enc.visible ? 26 : 62;
      desired.p.set(c[0] + Math.cos(orbitAngle) * rad, hgt, c[2] + Math.sin(orbitAngle) * rad);
      desired.t.set(c[0], 0, c[2]);
    }
    const k = 1 - Math.pow(0.0025, Math.min(dt, 0.1));
    stage.camera.position.lerp(desired.p, k);
    stage.controls.target.lerp(desired.t, k);
    stage.camera.lookAt(stage.controls.target);

    if (city.visible && city.userData.grid) {
      city.userData.grid.material.opacity = 0.14 + Math.sin(t * 1.1) * 0.05;
    }
    if (enc.visible && enc.userData.band) {
      enc.userData.band.material.opacity = 0.16 + Math.sin(t * 1.6) * 0.09;
    }
    if (spot.visible) {
      spot.userData.rings.forEach(r => {
        const ph = (t * 0.55 + r.userData.phase) % 1;
        const s = 0.5 + ph * 2.6;
        r.scale.set(s, s, s);
        r.material.opacity = 0.85 * (1 - ph);
      });
      spot.userData.beam.material.opacity = 0.12 + Math.sin(t * 2.4) * 0.05;
      spot.userData.core.scale.setScalar(1 + Math.sin(t * 3.1) * 0.14);
    }
    tokens.forEach(g => {
      if (g.userData.goal) g.position.lerp(g.userData.goal, k);
      g.userData.ring.rotation.z += dt * (g.userData.dead ? 0.2 : 1.1);
      g.userData.pillar.material.opacity = (g.userData.dead ? 0.12 : 0.28) + Math.sin(t * 2 + g.position.x) * 0.08;
    });
    // Labels always face the camera (sprites do this for free) but need a
    // distance-aware scale so they stay legible when the GM zooms out.
    const camDist = stage.camera.position.distanceTo(stage.controls.target);
    const boost = THREE.MathUtils.clamp(camDist / 120, 0.75, 2.4);
    city.userData.blocks.forEach(b => {
      const s = b.label.userData.baseScale;
      b.label.scale.set(s[0] * boost, s[1] * boost, 1);
    });
  }
  stage.setFrame(frame);

  // Manual advance + synchronous draw. requestAnimationFrame is suspended in a
  // hidden/offscreen window, so this is how automation (and a backgrounded TV
  // tab that just woke up) forces the scene to settle.
  let manualT = 0;
  function tick(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) { manualT += dt; frame(dt, manualT); }
    stage.composer.render();
  }

  return {
    stage,
    apply,
    tick,
    get state() { return state; },
    dispose() {
      tokens.forEach(g => disposeTree(g));
      tokens.clear();
      stage.dispose();
    }
  };
}
