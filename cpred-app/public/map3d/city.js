// ═══════════════════════════════════════════════════════════════════
// CP:RED 3D MAPS — Mode 1: Night City
// The base layer is the real Night City Atlas map. Everything else is an
// overlay keyed to georeferenced pins, so districts, roads and bays line
// up with the printed map exactly.
// ═══════════════════════════════════════════════════════════════════
import { THREE, createStage, THEMES, PALETTE, THREAT_COLOR } from './core.js';

const D = () => (typeof NC_MAP_DATA !== 'undefined' ? NC_MAP_DATA : []);
const F = () => (typeof NC_FACTIONS !== 'undefined' ? NC_FACTIONS : []);
const LAYERS = () => (typeof NC_LAYERS !== 'undefined' ? NC_LAYERS : {});
const MAPMETA = () => (typeof NC_MAP !== 'undefined' ? NC_MAP
  : { image: 'assets/nightcity-map.jpg', worldW: 100, worldH: 148.394 });
const POLYS = () => (typeof NC_DISTRICT_POLYS !== 'undefined' ? NC_DISTRICT_POLYS : {});

const LS_KEY = 'cpred_map3d_city_prefs';

// One press of the on-screen zoom buttons, as a distance multiplier. Bigger
// than a wheel notch on purpose: a button click should visibly get somewhere.
const ZOOM_BUTTON_STEP = 1.7;

// Named neon palettes, like the reference site's colour modes.
const MODES = {
  neon:    { label: 'Neon',    tint: 0xffffff, exposure: 1.15, bloom: 0.55, ink: '#00e5ff' },
  noir:    { label: 'Noir',    tint: 0x9fb4c8, exposure: 0.95, bloom: 0.35, ink: '#9fb4c8' },
  toxic:   { label: 'Toxic',   tint: 0xa6ffb0, exposure: 1.10, bloom: 0.60, ink: '#69f0ae' },
  inferno: { label: 'Inferno', tint: 0xffb08a, exposure: 1.05, bloom: 0.65, ink: '#ff9100' },
  vapor:   { label: 'Vapor',   tint: 0xffb3ff, exposure: 1.12, bloom: 0.70, ink: '#ff6ec7' }
};

const CAT_META = {};   // key -> {label,color,group}
function buildCatMeta() {
  const L = LAYERS();
  Object.entries(L).forEach(([g, grp]) =>
    (grp.items || []).forEach(it => { CAT_META[it.key] = { ...it, group: g }; }));
}

export function mount(container, ctx) {
  buildCatMeta();
  const meta = MAPMETA();
  const W = meta.worldW, H = meta.worldH;
  const prefs = loadPrefs();

  // Height that fits the whole plan in view for the stage's 50° vertical FOV,
  // with a small margin. Recomputed on resize via fitHeight().
  const fitHeightFor = (w, d, margin = 1.06) => {
    const aspect = (container.clientWidth || 1) / (container.clientHeight || 1);
    const vFov = 50 * Math.PI / 180;
    const byD = (d / 2) / Math.tan(vFov / 2);
    const byW = (w / 2) / (Math.tan(vFov / 2) * aspect);
    return Math.max(12, Math.max(byD, byW) * margin);
  };
  const fitH = () => fitHeightFor(W, H);

  const stage = createStage(container, {
    theme: THEMES.street,
    // Straight down, like opening a map, at the same height the Fit button
    // gives — otherwise the view you start on is not the view you can get back.
    cameraPos: [W / 2, fitH(), H / 2 + 0.01],
    target: [W / 2, 0, H / 2],
    exposure: MODES[prefs.mode]?.exposure ?? 1.15,
    environment: false,
    // Every material in this mode is MeshBasicMaterial: the map art *is* the
    // lighting, so the rig contributes nothing and its 2048² shadow map was
    // being re-rendered every frame without changing a single pixel.
    unlit: true,
    // The glow here is a soft wash over a flat map, not rim light on geometry,
    // so a quarter-size bloom chain is indistinguishable and much cheaper.
    bloomScale: 0.5,
    // Nothing in this mode animates by itself. Redraw when the GM moves the
    // camera or changes what is shown, and leave the GPU alone the rest of
    // the time — this panel is open for the length of a session.
    onDemand: true
  });
  const { scene, camera, controls, renderer } = stage;
  scene.fog = null;                       // fog hides the map edges — not wanted here
  scene.background = new THREE.Color(0x05060c);
  stage.bloom.strength = MODES[prefs.mode]?.bloom ?? 0.55;

  // Map-style navigation: pan with the mouse, no orbiting under the ground.
  controls.screenSpacePanning = false;
  controls.enableRotate = !!prefs.tilt;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minDistance = 12;
  // One wheel notch is 0.95^zoomSpeed. At the default speed that is a 5% step,
  // so crossing the whole range took about fifty notches — which reads as the
  // zoom being broken rather than slow. 3.4 makes a notch ~1.2x, so the full
  // range is around eighteen.
  controls.zoomSpeed = 3.4;
  // Zoom toward whatever the pointer is over, the way every map behaves.
  // Without it, reaching a corner of the plan means alternating zoom and pan.
  controls.zoomToCursor = true;
  // Zoom-out headroom is set against the height that frames the whole plan, so
  // there is always somewhere to go from the resting view. A fixed multiple of
  // the map size left barely any room at wide aspects.
  const setZoomRange = () => { controls.maxDistance = fitH() * 1.6; };
  setZoomRange();
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

  const disposables = [];
  const track = o => { disposables.push(o); return o; };

  // ── Base layer: the real map ─────────────────────────────────────
  const loader = new THREE.TextureLoader();
  const groundMat = new THREE.MeshBasicMaterial({ color: 0x2a2a3a });
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(W, H)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(W / 2, 0, H / 2);
  scene.add(ground);

  loader.load(meta.image, tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    // The plan is viewed near-perpendicular, where anisotropic filtering buys
    // almost nothing but costs real fill rate on a 25-megapixel texture.
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    groundMat.map = tex;
    groundMat.color.setHex(MODES[prefs.mode]?.tint ?? 0xffffff);
    groundMat.needsUpdate = true;
    track(tex);
    backdropSource = tex.image;
    drawBackdrop();
  }, undefined, err => console.error('[city] map texture failed', err));

  // ── Backdrop ─────────────────────────────────────────────────────
  // The plan is half again as tall as it is wide, so on a wide panel it can
  // only ever fill the middle and the rest was flat black bars. Fill the frame
  // with a heavily blurred, darkened copy of the map instead and vignette it:
  // it reads as a lightbox the map is sitting on rather than as dead space.
  // Redrawn at the panel's own aspect, since three stretches a texture
  // background across the viewport without any fit of its own.
  const bdCanvas = document.createElement('canvas');
  const bdTex = track(new THREE.CanvasTexture(bdCanvas));
  bdTex.colorSpace = THREE.SRGBColorSpace;
  bdTex.minFilter = bdTex.magFilter = THREE.LinearFilter;
  bdTex.generateMipmaps = false;
  let backdropSource = null;
  let backdropTint = MODES[prefs.mode]?.ink || '#00e5ff';

  function drawBackdrop() {
    const cw = container.clientWidth || 1, ch = container.clientHeight || 1;
    const bw = 512, bh = Math.max(1, Math.round(512 * ch / cw));
    bdCanvas.width = bw; bdCanvas.height = bh;
    const g = bdCanvas.getContext('2d');
    const tint = backdropTint;

    g.fillStyle = '#05060c';
    g.fillRect(0, 0, bw, bh);
    if (backdropSource) {
      // Cover-fit, then pushed well in: a plain cover shows the map's own dead
      // margins, which blur to the same near-black as the bars this replaces.
      // Zooming to the city core gives the backdrop something to be made of.
      const s = Math.max(bw / backdropSource.width, bh / backdropSource.height) * 2.6;
      const dw = backdropSource.width * s, dh = backdropSource.height * s;
      g.save();
      g.filter = 'blur(14px) saturate(0.8)';
      g.drawImage(backdropSource, (bw - dw) / 2, (bh - dh) / 2, dw, dh);
      g.restore();
    }
    // knock it back so the map itself stays the brightest thing on screen
    g.fillStyle = 'rgba(5,6,12,0.72)';
    g.fillRect(0, 0, bw, bh);
    // a breath of the active colour mode, then a vignette to centre the eye
    g.save();
    g.globalCompositeOperation = 'lighter';
    const glow = g.createRadialGradient(bw / 2, bh / 2, 0, bw / 2, bh / 2, Math.max(bw, bh) * 0.6);
    glow.addColorStop(0, hexToRgba(tint, 0.10));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, bw, bh);
    g.restore();
    const vig = g.createRadialGradient(bw / 2, bh / 2, Math.min(bw, bh) * 0.25,
      bw / 2, bh / 2, Math.max(bw, bh) * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.62)');
    g.fillStyle = vig; g.fillRect(0, 0, bw, bh);

    bdTex.needsUpdate = true;
    scene.background = bdTex;
    stage.requestRender();
  }
  drawBackdrop();
  const bdObserver = new ResizeObserver(() => { drawBackdrop(); setZoomRange(); });
  bdObserver.observe(container);

  // ── Overlay groups ───────────────────────────────────────────────
  const gDistrict = new THREE.Group(); scene.add(gDistrict);   // zone / threat / faction tints
  const gPins     = new THREE.Group(); scene.add(gPins);       // location markers
  const gSelect   = new THREE.Group(); scene.add(gSelect);     // selection ring

  const districts = D();
  const factions = F();

  // ── District overlays ────────────────────────────────────────────
  // Real boundaries, traced from the map's own red dotted borders and the
  // shoreline (see NC_DISTRICT_POLYS in mapdata.js). Each district gets a
  // low-opacity fill plus a bright edge ribbon: the fill alone at any
  // readable opacity drowns the map art, and the edge alone reads as a
  // sketch rather than a zone.
  const polyData = POLYS();
  const overlays = new Map();       // code -> { fill, edge, fillMat, edgeMat, rings, bbox }

  districts.forEach(d => {
    const shapes = polyData[d.code];
    const built = shapes && shapes.length ? buildPolyOverlay(shapes) : buildDiscOverlay(d);
    if (!built) return;
    gDistrict.add(built.fill, built.edge);
    built.fill.userData = built.edge.userData = { code: d.code };
    overlays.set(d.code, built);
    track(built.fill.geometry); track(built.edge.geometry);
    track(built.fillMat); track(built.edgeMat);
  });

  // Rings arrive as normalised (u,v) on the map image; the ground plane puts
  // (u,v) at world (u*W, 0, v*H), so that is the only conversion needed.
  function toWorld(ring) { return ring.map(([u, v]) => [u * W, v * H]); }

  function buildPolyOverlay(shapes) {
    const rings = [];
    const geoShapes = shapes.map(sh => {
      const outer = toWorld(sh.o);
      rings.push(outer);
      // ShapeGeometry lives in XY and the mesh is laid flat by a -90° X
      // rotation, which sends local +y to world -z: hence the negated v.
      const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
      (sh.h || []).forEach(h => {
        const hole = toWorld(h);
        rings.push(hole);
        shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
      });
      return shape;
    });

    const fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true,
      opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const fill = new THREE.Mesh(new THREE.ShapeGeometry(geoShapes), fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    fill.renderOrder = 1;

    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true,
      opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const edge = new THREE.Mesh(ribbonGeometry(rings, EDGE_HALF_WIDTH), edgeMat);
    edge.position.y = 0.06;
    edge.renderOrder = 2;

    return { fill, edge, fillMat, edgeMat, rings, bbox: ringsBBox(rings) };
  }

  // Fallback for any district the tracer could not resolve: a circle around
  // the pin cluster, in the same shape as the traced data so it takes the
  // identical path. Better that than a district that silently stops
  // responding to the overlay switch.
  function buildDiscOverlay(d) {
    if (!d.anchor) return null;
    const r = Math.max(d.anchor.rx, d.anchor.rz) * 1.05 + 1;
    const o = [];
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2;
      o.push([(d.anchor.x + Math.cos(a) * r) / W, (d.anchor.z + Math.sin(a) * r) / H]);
    }
    return buildPolyOverlay([{ o }]);
  }

  // Location pins — one instanced mesh, coloured per category.
  const located = districts.flatMap(d => d.locations.filter(l => l.x !== undefined)
    .map(l => ({ ...l, district: d })));
  const pinGeo = track(new THREE.ConeGeometry(0.55, 1.7, 6));
  // No vertexColors here: InstancedMesh drives colour through instanceColor.
  // Setting vertexColors makes three look for a geometry colour attribute
  // that does not exist, and every pin renders black.
  const pinMat = track(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const pins = new THREE.InstancedMesh(pinGeo, pinMat, Math.max(1, located.length));
  pins.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(located.length * 3), 3);
  const dummy = new THREE.Object3D();
  const pinVisible = new Array(located.length).fill(true);
  function layoutPins() {
    let n = 0;
    located.forEach((l, i) => {
      const on = pinVisible[i];
      dummy.position.set(l.x, on ? 1.1 : -999, l.z);
      dummy.rotation.set(Math.PI, 0, 0);
      dummy.scale.setScalar(on ? 1 : 0.001);
      dummy.updateMatrix();
      pins.setMatrixAt(i, dummy.matrix);
      const c = new THREE.Color(CAT_META[l.cat]?.color || '#00e5ff');
      pins.instanceColor.setXYZ(i, c.r, c.g, c.b);
      if (on) n++;
    });
    pins.instanceMatrix.needsUpdate = true;
    pins.instanceColor.needsUpdate = true;
    return n;
  }
  layoutPins();
  gPins.add(pins);

  // Marker ring for a selected location. A selected *district* is picked out by
  // its own traced border going solid instead, which is far more legible than a
  // circle sitting somewhere near the middle of it. Neither pulses: a blinking
  // highlight would mean redrawing the whole panel forever to animate it, and
  // on a map a steady bright edge marks the selection perfectly well.
  const ringMat = track(new THREE.MeshBasicMaterial({ color: PALETTE.neon, transparent: true,
    opacity: 0.9, depthWrite: false, toneMapped: false }));
  const ring = new THREE.Mesh(track(new THREE.RingGeometry(0.94, 1, 64)), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.visible = false;
  ring.renderOrder = 3;
  gSelect.add(ring);

  // ── UI ───────────────────────────────────────────────────────────
  // state must exist before buildUI: it renders the faction list immediately.
  const state = { overlay: prefs.overlay || 'zones', faction: null, selected: null, mode: prefs.mode || 'neon' };
  const ui = buildUI(container, prefs);

  function activeCats() {
    const off = prefs.off || {};
    return new Set(Object.keys(CAT_META).filter(k => !off[k]));
  }

  function applyLayers() {
    const cats = activeCats();
    located.forEach((l, i) => { pinVisible[i] = cats.has(l.cat); });
    const shown = layoutPins();
    ui.count.textContent = `${shown} / ${located.length} pins`;
    paintDistricts();
    savePrefs();
  }

  // Fill opacity is deliberately low. Blending happens in linear space before
  // tone mapping, so over near-black map art a nominal 15% of a saturated neon
  // already lands around 45% on screen and swallows the streets underneath.
  // Weight is carried by the edge instead, which stays near-opaque.
  const FILL = { faction: 0.20, factionDim: 0.085, threatBase: 0.045, threatStep: 0.03, zone: 0.10 };

  function paintDistricts() {
    const off = prefs.off || {};
    districts.forEach(d => {
      const ov = overlays.get(d.code);
      if (!ov) return;
      let col = null, op = 0;
      if (state.overlay === 'factions') {
        if (state.faction) {
          const f = factions.find(x => x.name === state.faction);
          if (f && f.districts.includes(d.code)) { col = new THREE.Color(f.color); op = FILL.faction; }
        } else {
          const first = d.gangs[0] && factions.find(x => x.name === d.gangs[0]);
          if (first) { col = new THREE.Color(first.color); op = FILL.factionDim; }
        }
      } else if (state.overlay === 'threat') {
        if (!off.threat) {
          col = new THREE.Color(THREAT_COLOR[d.threat] ?? 0xffffff);
          op = FILL.threatBase + d.threat * FILL.threatStep;
        }
      } else if (state.overlay === 'zones') {
        const z = CAT_META[d.zone];
        if (z && !off[d.zone]) { col = new THREE.Color(z.color); op = FILL.zone; }
      }
      const on = !!col;
      ov.fill.visible = on;
      ov.edge.visible = on;
      if (!on) return;
      ov.fillMat.color.copy(col);
      ov.edgeMat.color.copy(col);
      // The selected district reads strongest: heavier fill, solid edge.
      const sel = state.selected === d.code;
      ov.fillMat.opacity = sel ? Math.min(0.34, op + 0.10) : op;
      ov.edgeMat.opacity = sel ? 1 : 0.72;
    });
    stage.requestRender();
  }

  // ── Interaction ──────────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  function pickAt(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const hitPin = ray.intersectObject(pins, false)[0];
    if (hitPin && pinVisible[hitPin.instanceId]) return { kind: 'loc', loc: located[hitPin.instanceId] };
    const hitGround = ray.intersectObject(ground, false)[0];
    if (!hitGround) return null;
    const d = districtAt(hitGround.point.x, hitGround.point.z);
    return d ? { kind: 'district', d } : null;
  }

  // Point-in-polygon against the traced borders. Holes fall out for free:
  // a point inside Charter Hill's Exec Zone crosses two rings, so the
  // even-odd test puts it outside Charter Hill — which is correct.
  function districtAt(x, z) {
    for (const d of districts) {
      const ov = overlays.get(d.code);
      if (!ov) continue;
      const b = ov.bbox;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      let inside = false;
      for (const r of ov.rings) if (pointInRing(x, z, r)) inside = !inside;
      if (inside) return d;
    }
    return null;
  }

  let hoverTimer = 0;
  function onMove(ev) {
    const now = performance.now();
    if (now - hoverTimer < 40) return;
    hoverTimer = now;
    const hit = pickAt(ev);
    if (!hit) { ui.tip.style.display = 'none'; renderer.domElement.style.cursor = 'grab'; return; }
    renderer.domElement.style.cursor = 'pointer';
    ui.tip.style.display = 'block';
    ui.tip.style.left = (ev.offsetX + 16) + 'px';
    ui.tip.style.top = (ev.offsetY + 14) + 'px';
    ui.tip.innerHTML = hit.kind === 'loc'
      ? `<b>${esc(hit.loc.name)}</b><span>${CAT_META[hit.loc.cat]?.label || hit.loc.cat} · ${esc(hit.loc.district.name)}</span>`
      : `<b>${esc(hit.d.name)}</b><span>${esc(hit.d.region)} · ${hit.d.locationCount} locations · threat ${hit.d.threat}</span>`;
  }
  function onClick(ev) {
    if (dragged) return;
    const hit = pickAt(ev);
    if (!hit) return;
    if (hit.kind === 'loc') showLocation(hit.loc);
    else selectDistrict(hit.d);
  }
  let dragged = false, downAt = null;
  const onDown = e => { dragged = false; downAt = [e.clientX, e.clientY]; };
  const onUp = e => { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) dragged = true; };
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('click', onClick);
  renderer.domElement.style.cursor = 'grab';

  function selectDistrict(d) {
    state.selected = d.code;
    ring.visible = false;
    const ov = overlays.get(d.code);
    if (ov) {
      // Frame the district's real extent rather than a guessed radius, so a
      // long thin district like the Port fills the view the same as a blocky one.
      const b = ov.bbox;
      flyTo(b.cx, b.cz, fitHeightFor(b.w, b.d, 1.35), true);
    } else if (d.anchor) {
      flyTo(d.anchor.x, d.anchor.z, Math.max(d.anchor.rx, d.anchor.rz) * 5 + 22);
    }
    paintDistricts();
    ui.showDistrict(d);
  }
  function showLocation(l) {
    ring.visible = true;
    ring.position.set(l.x, 0.14, l.z);
    ring.scale.setScalar(2.2);
    stage.requestRender();
    ui.showLocation(l);
    flyTo(l.x, l.z, 16);
  }

  // eased camera move
  let tween = null;
  function flyTo(x, z, dist, topDown) {
    const from = camera.position.clone(), fromT = controls.target.clone();
    const to = topDown
      ? new THREE.Vector3(x, dist, z + 0.01)
      : new THREE.Vector3(x, dist * 0.92, z + dist * 0.55);
    const toT = new THREE.Vector3(x, 0, z);
    tween = { t: 0, speed: 1.5, from, to, fromT, toT };
  }

  // Fixed zoom step about the current view centre, for the on-screen buttons.
  // The wheel dollies continuously; a button should make one predictable jump.
  function zoomStep(factor) {
    const dir = camera.position.clone().sub(controls.target);
    const d = Math.min(controls.maxDistance,
      Math.max(controls.minDistance, dir.length() * factor));
    tween = { t: 0, speed: 3.2,
      from: camera.position.clone(), to: controls.target.clone().add(dir.setLength(d)),
      fromT: controls.target.clone(), toT: controls.target.clone() };
  }
  // Frame the whole plan, straight down — the map's resting state.
  function fitAll() { flyTo(W / 2, H / 2, fitH(), true); }
  // Zooming toward the cursor walks the orbit target across the plan, and
  // enough of it near an edge leaves the GM staring at empty backdrop with no
  // way back but Fit. Keep the target on the map, shifting the camera by the
  // same amount so the correction is invisible.
  const TARGET_SLACK = 10;
  function clampTarget() {
    const t = controls.target;
    const x = Math.min(W + TARGET_SLACK, Math.max(-TARGET_SLACK, t.x));
    const z = Math.min(H + TARGET_SLACK, Math.max(-TARGET_SLACK, t.z));
    if (x === t.x && z === t.z) return;
    camera.position.x += x - t.x;
    camera.position.z += z - t.z;
    t.x = x; t.z = z;
    stage.requestRender();
  }

  stage.setFrame(dt => {
    clampTarget();
    if (tween) {
      tween.t = Math.min(1, tween.t + dt * tween.speed);
      const e = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - Math.pow(-2 * tween.t + 2, 2) / 2;
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.fromT, tween.toT, e);
      if (tween.t >= 1) tween = null;
      stage.requestRender();
    }
  });

  // ── UI construction ──────────────────────────────────────────────
  function buildUI(root, prefs) {
    const style = document.createElement('style');
    style.textContent = uiCSS();
    root.appendChild(style);

    const side = el('div', 'nc-side');
    const tip = el('div', 'nc-tip');
    const panel = el('div', 'nc-panel');
    root.append(side, tip, panel);

    // On-map zoom controls. Sits just clear of the sidebar rather than in the
    // usual bottom-right corner, because the district panel slides in over
    // that side and would bury it.
    const zoomBox = el('div', 'nc-zoom');
    const zIn = el('button', 'nc-zbtn'); zIn.textContent = '+'; zIn.title = 'Zoom in';
    const zOut = el('button', 'nc-zbtn'); zOut.textContent = '−'; zOut.title = 'Zoom out';
    const zFit = el('button', 'nc-zbtn nc-zfit'); zFit.textContent = '⤡'; zFit.title = 'Fit the whole map';
    zIn.onclick = () => zoomStep(1 / ZOOM_BUTTON_STEP);
    zOut.onclick = () => zoomStep(ZOOM_BUTTON_STEP);
    zFit.onclick = () => fitAll();
    zoomBox.append(zIn, zOut, zFit);
    root.appendChild(zoomBox);

    // Grey the buttons out at the ends of the range, so it is obvious the map
    // has stopped rather than the control having failed.
    function syncZoom() {
      const d = camera.position.distanceTo(controls.target);
      zIn.disabled = d <= controls.minDistance * 1.01;
      zOut.disabled = d >= controls.maxDistance * 0.99;
    }
    controls.addEventListener('change', syncZoom);
    syncZoom();

    // search
    const search = el('input', 'nc-search');
    search.placeholder = 'Search districts, locations, factions...';
    const results = el('div', 'nc-results');
    side.append(search, results);

    // colour mode
    const modeRow = el('div', 'nc-modes');
    Object.entries(MODES).forEach(([k, m]) => {
      const b = el('button', 'nc-mode' + (prefs.mode === k ? ' on' : ''));
      b.textContent = m.label; b.dataset.mode = k;
      b.onclick = () => setMode(k);
      modeRow.appendChild(b);
    });
    side.appendChild(modeRow);

    // overlay switch
    const ovRow = el('div', 'nc-ov');
    [['zones', 'Zones'], ['threat', 'Threat'], ['factions', 'Factions']].forEach(([k, lbl]) => {
      const b = el('button', 'nc-ovb' + ((prefs.overlay || 'zones') === k ? ' on' : ''));
      b.textContent = lbl; b.dataset.ov = k;
      b.onclick = () => { state.overlay = k; state.faction = null;
        ovRow.querySelectorAll('.nc-ovb').forEach(x => x.classList.toggle('on', x.dataset.ov === k));
        renderFactionList(); paintDistricts(); prefs.overlay = k; savePrefs(); };
      ovRow.appendChild(b);
    });
    side.appendChild(ovRow);

    // layer groups
    const layerWrap = el('div', 'nc-layers');
    const counts = {};
    located.forEach(l => counts[l.cat] = (counts[l.cat] || 0) + 1);
    Object.entries(LAYERS()).forEach(([gk, grp]) => {
      const g = el('div', 'nc-group');
      const head = el('div', 'nc-ghead');
      head.innerHTML = `<span>${grp.label}</span><span class="nc-caret">▾</span>`;
      const body = el('div', 'nc-gbody');
      head.onclick = () => { g.classList.toggle('closed'); };
      (grp.items || []).forEach(it => {
        if (it.key === 'factions') return;         // rendered as its own list
        const row = el('label', 'nc-layer');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !(prefs.off || {})[it.key];
        cb.onchange = () => { prefs.off = prefs.off || {}; prefs.off[it.key] = !cb.checked; applyLayers(); };
        const sw = el('i', 'nc-sw'); sw.style.background = it.color;
        const nm = el('span', 'nc-lname'); nm.textContent = it.label;
        const ct = el('span', 'nc-lcount'); ct.textContent = counts[it.key] ?? '';
        row.append(cb, sw, nm, ct);
        body.appendChild(row);
      });
      g.append(head, body); layerWrap.appendChild(g);
    });
    side.appendChild(layerWrap);

    const facWrap = el('div', 'nc-factions');
    side.appendChild(facWrap);

    const foot = el('div', 'nc-foot');
    const cnt = el('span', 'nc-pincount');
    const allOn = el('button', 'nc-mini'); allOn.textContent = 'All';
    const allOff = el('button', 'nc-mini'); allOff.textContent = 'None';
    const reset = el('button', 'nc-mini'); reset.textContent = 'Reset view';
    allOn.onclick = () => { prefs.off = {}; syncBoxes(); applyLayers(); };
    allOff.onclick = () => { prefs.off = {}; Object.keys(CAT_META).forEach(k => prefs.off[k] = true); syncBoxes(); applyLayers(); };
    reset.onclick = () => { ring.visible = false; state.selected = null; paintDistricts();
      panel.classList.remove('open'); fitAll(); };
    foot.append(cnt, allOn, allOff, reset);
    side.appendChild(foot);

    function syncBoxes() {
      layerWrap.querySelectorAll('.nc-layer').forEach((row, i) => { });
      layerWrap.querySelectorAll('input[type=checkbox]').forEach(cb => {});
      // rebuild checkbox states from prefs
      const rows = layerWrap.querySelectorAll('.nc-layer');
      let idx = 0;
      Object.entries(LAYERS()).forEach(([gk, grp]) => (grp.items || []).forEach(it => {
        if (it.key === 'factions') return;
        const row = rows[idx++]; if (!row) return;
        row.querySelector('input').checked = !(prefs.off || {})[it.key];
      }));
    }

    function renderFactionList() {
      if (state.overlay !== 'factions') { facWrap.innerHTML = ''; return; }
      facWrap.innerHTML = `<div class="nc-ghead static"><span>Factions</span><span class="nc-lcount">${factions.length}</span></div>`;
      const list = el('div', 'nc-flist');
      factions.forEach(f => {
        const r = el('button', 'nc-frow' + (state.faction === f.name ? ' on' : ''));
        r.innerHTML = `<i class="nc-sw" style="background:${f.color}"></i>
          <span class="nc-lname">${esc(f.name)}</span><span class="nc-lcount">${f.reach}</span>`;
        r.onclick = () => { state.faction = state.faction === f.name ? null : f.name;
          renderFactionList(); paintDistricts(); };
        list.appendChild(r);
      });
      facWrap.appendChild(list);
    }

    // search behaviour
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      results.innerHTML = '';
      if (q.length < 2) { results.style.display = 'none'; return; }
      const hits = [];
      districts.forEach(d => {
        if (d.name.toLowerCase().includes(q)) hits.push({ t: 'District', n: d.name, go: () => selectDistrict(d) });
        d.gangs.forEach(g => { if (g.toLowerCase().includes(q) && !hits.some(h => h.n === g))
          hits.push({ t: 'Faction', n: g, go: () => { state.overlay = 'factions'; state.faction = g;
            ovRow.querySelectorAll('.nc-ovb').forEach(x => x.classList.toggle('on', x.dataset.ov === 'factions'));
            renderFactionList(); paintDistricts(); } }); });
      });
      located.forEach(l => { if (l.name.toLowerCase().includes(q))
        hits.push({ t: CAT_META[l.cat]?.label || 'Location', n: l.name, sub: l.district.name, go: () => showLocation(l) }); });
      results.style.display = hits.length ? 'block' : 'none';
      hits.slice(0, 40).forEach(h => {
        const r = el('button', 'nc-res');
        r.innerHTML = `<span class="nc-rt">${h.t}</span><span>${esc(h.n)}</span>${h.sub ? `<em>${esc(h.sub)}</em>` : ''}`;
        r.onclick = () => { h.go(); results.style.display = 'none'; search.value = ''; };
        results.appendChild(r);
      });
    };

    function showDistrict(d) {
      panel.classList.add('open');
      const byCat = {};
      d.locations.forEach(l => (byCat[l.cat] = byCat[l.cat] || []).push(l));
      panel.innerHTML = `
        <button class="nc-close">✕</button>
        <div class="nc-ptitle">${esc(d.name)}</div>
        <div class="nc-psub">${esc(d.region)} · ${CAT_META[d.zone]?.label || d.zone}</div>
        <div class="nc-threat"><span>THREAT</span>
          <i style="--w:${d.threat / 4 * 100}%;--c:${hex(THREAT_COLOR[d.threat])}"></i><b>${d.threat}/4</b></div>
        <p class="nc-pdesc">${esc(d.description)}</p>
        <div class="nc-kv"><span>City Manager</span><b>${esc(d.cityManager || '—')}</b></div>
        <div class="nc-kv"><span>Security</span><b>${esc(d.securityProvider || '—')}</b></div>
        <div class="nc-secl">Factions Present</div>
        <div class="nc-badges">${d.gangs.length ? d.gangs.map(g => {
          const f = factions.find(x => x.name === g);
          return `<span class="nc-badge" style="border-color:${f ? f.color : '#555'};color:${f ? f.color : '#aaa'}">${esc(g)}</span>`;
        }).join('') : '<span class="nc-none">None</span>'}</div>
        <div class="nc-secl">Locations · ${d.locationCount}</div>
        <div class="nc-locs">${Object.entries(byCat).map(([c, ls]) => `
          <div class="nc-lcat"><i class="nc-sw" style="background:${CAT_META[c]?.color || '#666'}"></i>${CAT_META[c]?.label || c}</div>
          ${ls.map(l => `<div class="nc-loc" data-code="${l.code}"><b>${esc(l.name)}</b><span>${esc(l.desc)}</span></div>`).join('')}
        `).join('')}</div>`;
      panel.querySelector('.nc-close').onclick = () => panel.classList.remove('open');
      panel.querySelectorAll('.nc-loc').forEach(node => {
        node.onclick = () => {
          const l = located.find(x => x.code === node.dataset.code);
          if (l) flyTo(l.x, l.z, 14);
        };
      });
    }

    function showLocation(l) {
      panel.classList.add('open');
      panel.innerHTML = `
        <button class="nc-close">✕</button>
        <div class="nc-ptitle">${esc(l.name)}</div>
        <div class="nc-psub"><i class="nc-sw" style="background:${CAT_META[l.cat]?.color}"></i>
          ${CAT_META[l.cat]?.label || l.cat} · ${esc(l.district.name)}</div>
        <p class="nc-pdesc">${esc(l.desc)}</p>
        <button class="nc-jump">View district →</button>`;
      panel.querySelector('.nc-close').onclick = () => panel.classList.remove('open');
      panel.querySelector('.nc-jump').onclick = () => selectDistrict(l.district);
    }

    renderFactionList();
    return { side, tip, panel, zoomBox, count: cnt, showDistrict, showLocation,
      renderFactionList, syncBoxes };
  }

  function setMode(k) {
    state.mode = k; prefs.mode = k;
    const m = MODES[k];
    groundMat.color.setHex(m.tint);
    renderer.toneMappingExposure = m.exposure;
    stage.bloom.strength = m.bloom;
    ui.side.querySelectorAll('.nc-mode').forEach(b => b.classList.toggle('on', b.dataset.mode === k));
    backdropTint = m.ink;
    drawBackdrop();
    savePrefs();
  }

  function loadPrefs() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } }
  function savePrefs() { try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch {} }

  applyLayers();
  setMode(prefs.mode || 'neon');

  // Expose for tooling + the cast/display view
  stage.city = {
    districts, located, factions,
    select: code => { const d = districts.find(x => x.code === code); if (d) selectDistrict(d); },
    setOverlay: k => { state.overlay = k; paintDistricts(); },
    reset: () => fitAll(),
    step: (dt) => { stage.composer.render(); }
  };

  const origDispose = stage.dispose.bind(stage);
  stage.dispose = () => {
    bdObserver.disconnect();
    renderer.domElement.removeEventListener('pointermove', onMove);
    renderer.domElement.removeEventListener('pointerdown', onDown);
    renderer.domElement.removeEventListener('pointerup', onUp);
    renderer.domElement.removeEventListener('click', onClick);
    disposables.forEach(o => { try { o.dispose && o.dispose(); } catch {} });
    [ui.side, ui.tip, ui.panel, ui.zoomBox].forEach(n => n && n.remove());
    container.querySelectorAll('style').forEach(s => s.remove());
    origDispose();
  };
  return stage;
}

// ── polygon helpers ────────────────────────────────────────────────
// Half-width of a district edge, in world units. GL line width is capped at
// 1px on every desktop driver, so the border is a flat ribbon instead: it
// keeps a constant weight on the map at any zoom, which is what makes the
// overlay read as cartography rather than as a wireframe.
const EDGE_HALF_WIDTH = 0.16;

// Closed quad strip around each ring, laid flat in XZ at y=0.
function ribbonGeometry(rings, hw) {
  const pos = [], idx = [];
  rings.forEach(pts => {
    const n = pts.length;
    if (n < 3) return;
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      const inN = segNormal(a, p), outN = segNormal(p, b);
      let nx = inN[0] + outN[0], nz = inN[1] + outN[1];
      const len = Math.hypot(nx, nz);
      if (len < 1e-6) { nx = outN[0]; nz = outN[1]; }
      else { nx /= len; nz /= len; }
      // Miter length grows as 1/cos(half-angle); clamp it so a hairpin in the
      // traced border does not fire a spike across the district.
      const cos = Math.max(0.3, nx * outN[0] + nz * outN[1]);
      const m = Math.min(2.5, 1 / cos) * hw;
      pos.push(p[0] + nx * m, 0, p[1] + nz * m);
      pos.push(p[0] - nx * m, 0, p[1] - nz * m);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2, b = a + 1;
      const c = base + ((i + 1) % n) * 2, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function segNormal(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return [-dz / l, dx / l];
}

function ringsBBox(rings) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  rings.forEach(r => r.forEach(([x, z]) => {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }));
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2,
    w: x1 - x0, d: z1 - z0 };
}

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ── helpers ────────────────────────────────────────────────────────
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function hexToRgba(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function hex(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6); }

function uiCSS() {
  return `
.nc-side{position:absolute;left:0;top:0;bottom:0;width:270px;overflow-y:auto;z-index:6;
  background:linear-gradient(180deg,rgba(10,10,20,.97),rgba(12,12,26,.94));
  border-right:1px solid var(--border);padding:10px;display:flex;flex-direction:column;gap:8px}
.nc-side::-webkit-scrollbar{width:6px}.nc-side::-webkit-scrollbar-thumb{background:var(--border)}
.nc-search{width:100%;background:var(--mid);border:1px solid var(--border);border-radius:4px;
  color:var(--text);padding:7px 9px;font-family:'Share Tech Mono',monospace;font-size:11px;outline:none}
.nc-search:focus{border-color:var(--neon)}
.nc-results{display:none;max-height:230px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;background:var(--surface)}
.nc-res{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid rgba(42,42,69,.6);
  color:var(--text);padding:6px 8px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:10px}
.nc-res:hover{background:rgba(0,229,255,.08)}
.nc-rt{color:var(--gold);margin-right:6px;font-size:8px;letter-spacing:1px;text-transform:uppercase}
.nc-res em{color:var(--dim);font-style:normal;margin-left:6px}
.nc-modes{display:flex;gap:3px;flex-wrap:wrap}
.nc-mode{flex:1;min-width:44px;background:var(--mid);border:1px solid var(--border);color:var(--muted);
  border-radius:3px;padding:4px 2px;font-family:'Share Tech Mono',monospace;font-size:8px;
  letter-spacing:1px;text-transform:uppercase;cursor:pointer}
.nc-mode.on{border-color:var(--neon);color:var(--neon);box-shadow:0 0 8px rgba(0,229,255,.25)}
.nc-ov{display:flex;gap:3px}
.nc-ovb{flex:1;background:var(--mid);border:1px solid var(--border);color:var(--muted);border-radius:3px;
  padding:6px 2px;font-family:'Orbitron',monospace;font-size:9px;cursor:pointer;letter-spacing:1px}
.nc-ovb.on{border-color:var(--gold);color:var(--gold)}
.nc-group{border:1px solid var(--border);border-radius:4px;overflow:hidden;background:rgba(26,26,46,.5)}
.nc-ghead{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;cursor:pointer;
  font-family:'Orbitron',monospace;font-size:9px;letter-spacing:2px;color:var(--gold);text-transform:uppercase;
  background:rgba(255,214,0,.06)}
.nc-ghead.static{cursor:default}
.nc-group.closed .nc-gbody{display:none}
.nc-group.closed .nc-caret{transform:rotate(-90deg)}
.nc-caret{transition:transform .15s}
.nc-gbody{padding:4px 6px}
.nc-layer{display:flex;align-items:center;gap:6px;padding:3px 2px;cursor:pointer;
  font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text)}
.nc-layer:hover{color:var(--neon)}
.nc-layer input{accent-color:#00e5ff;width:12px;height:12px;cursor:pointer}
.nc-sw{width:9px;height:9px;border-radius:2px;display:inline-block;flex:none;box-shadow:0 0 6px currentColor}
.nc-lname{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nc-lcount{color:var(--dim);font-size:9px}
.nc-flist{max-height:260px;overflow-y:auto}
.nc-frow{display:flex;align-items:center;gap:6px;width:100%;background:none;border:0;
  border-bottom:1px solid rgba(42,42,69,.5);color:var(--text);padding:5px 8px;cursor:pointer;
  font-family:'Share Tech Mono',monospace;font-size:10px;text-align:left}
.nc-frow:hover{background:rgba(255,45,149,.1)}
.nc-frow.on{background:rgba(255,45,149,.18);color:#fff}
.nc-foot{display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:auto;padding-top:6px}
.nc-pincount{flex:1;font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim)}
.nc-mini{background:var(--mid);border:1px solid var(--border);color:var(--muted);border-radius:3px;
  padding:4px 7px;font-family:'Share Tech Mono',monospace;font-size:9px;cursor:pointer}
.nc-mini:hover{border-color:var(--neon);color:var(--neon)}
.nc-zoom{position:absolute;left:282px;bottom:14px;z-index:6;display:flex;flex-direction:column;gap:4px}
.nc-zbtn{width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center;
  background:rgba(10,10,20,.92);border:1px solid var(--border);color:var(--neon);border-radius:4px;
  cursor:pointer;font-family:'Orbitron',monospace;font-size:16px;line-height:1;
  box-shadow:0 2px 10px rgba(0,0,0,.55)}
.nc-zbtn:hover:not(:disabled){border-color:var(--neon);background:rgba(0,229,255,.14);
  box-shadow:0 0 12px rgba(0,229,255,.3)}
.nc-zbtn:disabled{color:var(--dim);border-color:rgba(42,42,69,.6);cursor:default}
.nc-zfit{margin-top:4px;font-size:13px;color:var(--gold)}
.nc-zfit:hover:not(:disabled){border-color:var(--gold);background:rgba(255,214,0,.12);
  box-shadow:0 0 12px rgba(255,214,0,.25)}
.nc-tip{position:absolute;display:none;pointer-events:none;z-index:8;background:rgba(10,10,20,.95);
  border:1px solid var(--neon);border-radius:4px;padding:5px 9px;font-family:'Share Tech Mono',monospace;
  font-size:10px;color:var(--text);box-shadow:0 0 14px rgba(0,229,255,.25);max-width:260px}
.nc-tip b{display:block;color:var(--neon);font-family:'Orbitron',monospace;font-size:10px}
.nc-tip span{color:var(--muted);font-size:9px}
.nc-panel{position:absolute;right:0;top:0;bottom:0;width:330px;transform:translateX(105%);
  transition:transform .22s ease;z-index:7;overflow-y:auto;padding:14px 14px 20px;
  background:linear-gradient(180deg,rgba(10,10,20,.98),rgba(14,14,30,.96));border-left:1px solid var(--neon)}
.nc-panel.open{transform:none}
.nc-close{position:absolute;right:10px;top:10px;background:none;border:1px solid var(--border);
  color:var(--muted);border-radius:3px;width:22px;height:22px;cursor:pointer;font-size:11px}
.nc-close:hover{border-color:var(--red);color:var(--red)}
.nc-ptitle{font-family:'Orbitron',monospace;font-size:16px;font-weight:700;color:var(--neon);padding-right:28px}
.nc-psub{display:flex;align-items:center;gap:5px;font-family:'Share Tech Mono',monospace;font-size:10px;
  color:var(--gold);margin:3px 0 10px}
.nc-threat{display:flex;align-items:center;gap:7px;margin-bottom:10px;font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted)}
.nc-threat i{flex:1;height:5px;background:var(--mid);border-radius:3px;position:relative;overflow:hidden}
.nc-threat i::after{content:'';position:absolute;inset:0 auto 0 0;width:var(--w);background:var(--c);box-shadow:0 0 8px var(--c)}
.nc-threat b{color:var(--text)}
.nc-pdesc{font-family:'Share Tech Mono',monospace;font-size:11px;line-height:1.75;color:#b9b9cf;margin:0 0 10px}
.nc-kv{display:flex;justify-content:space-between;gap:8px;font-family:'Share Tech Mono',monospace;
  font-size:10px;padding:3px 0;border-bottom:1px solid rgba(42,42,69,.6)}
.nc-kv span{color:var(--muted)}.nc-kv b{color:var(--text);text-align:right;font-weight:500}
.nc-secl{font-family:'Orbitron',monospace;font-size:9px;letter-spacing:2px;color:var(--gold);
  text-transform:uppercase;margin:14px 0 6px}
.nc-badges{display:flex;flex-wrap:wrap;gap:4px}
.nc-badge{border:1px solid;border-radius:3px;padding:2px 7px;font-family:'Share Tech Mono',monospace;font-size:9px}
.nc-none{color:var(--dim);font-family:'Share Tech Mono',monospace;font-size:10px}
.nc-lcat{display:flex;align-items:center;gap:6px;margin:10px 0 4px;font-family:'Share Tech Mono',monospace;
  font-size:9px;letter-spacing:1px;color:var(--muted);text-transform:uppercase}
.nc-loc{padding:5px 7px;margin-bottom:3px;border-left:2px solid var(--border);cursor:pointer;background:rgba(26,26,46,.5)}
.nc-loc:hover{border-left-color:var(--neon);background:rgba(0,229,255,.07)}
.nc-loc b{display:block;font-family:'Orbitron',monospace;font-size:10px;color:var(--text)}
.nc-loc span{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);line-height:1.55}
.nc-jump{margin-top:12px;width:100%;background:rgba(0,229,255,.1);border:1px solid var(--neon);color:var(--neon);
  border-radius:4px;padding:7px;font-family:'Orbitron',monospace;font-size:9px;letter-spacing:1px;cursor:pointer}
`;
}
