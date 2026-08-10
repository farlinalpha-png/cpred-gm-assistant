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

const LS_KEY = 'cpred_map3d_city_prefs';

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
  const fitH = () => {
    const aspect = (container.clientWidth || 1) / (container.clientHeight || 1);
    const vFov = 50 * Math.PI / 180;
    const byH = (H / 2) / Math.tan(vFov / 2);
    const byW = (W / 2) / (Math.tan(vFov / 2) * aspect);
    return Math.max(byH, byW) * 1.06;
  };

  const stage = createStage(container, {
    theme: THEMES.street,
    cameraPos: [W / 2, H * 0.95, H / 2 + 0.01],   // straight down, like opening a map
    target: [W / 2, 0, H / 2],
    shadowCenter: [W / 2, 0, H / 2], shadowRadius: Math.max(W, H) * 0.7,
    ambient: 0.9,            // the map art is the lighting; keep it flat and legible
    exposure: MODES[prefs.mode]?.exposure ?? 1.15,
    environment: false
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
  controls.maxDistance = Math.max(W, H) * 1.5;
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
    tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    groundMat.map = tex;
    groundMat.color.setHex(MODES[prefs.mode]?.tint ?? 0xffffff);
    groundMat.needsUpdate = true;
    track(tex);
  }, undefined, err => console.error('[city] map texture failed', err));

  // ── Overlay groups ───────────────────────────────────────────────
  const gDistrict = new THREE.Group(); scene.add(gDistrict);   // zone / threat / faction tints
  const gPins     = new THREE.Group(); scene.add(gPins);       // location markers
  const gSelect   = new THREE.Group(); scene.add(gSelect);     // selection ring

  const districts = D();
  const factions = F();

  // District discs, sized from the pin cluster. Used by every overlay.
  // Overlays are rings, not filled blobs: a filled disc at any readable
  // opacity drowns the map art underneath, which is the whole point here.
  const discGeo = track(new THREE.RingGeometry(0.955, 1, 72));
  const discs = new Map();
  districts.forEach(d => {
    if (!d.anchor) return;
    const r = Math.max(d.anchor.rx, d.anchor.rz) * 1.05 + 1;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true,
      opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(discGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(d.anchor.x, 0.05, d.anchor.z);
    m.scale.setScalar(r);
    m.userData = { code: d.code };
    gDistrict.add(m); discs.set(d.code, m); track(mat);
  });

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

  // Selection ring
  const ringMat = track(new THREE.MeshBasicMaterial({ color: PALETTE.neon, transparent: true, opacity: 0.9 }));
  const ring = new THREE.Mesh(track(new THREE.RingGeometry(0.94, 1, 64)), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.visible = false;
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

  function paintDistricts() {
    const off = prefs.off || {};
    districts.forEach(d => {
      const m = discs.get(d.code);
      if (!m) return;
      let col = null, op = 0;
      if (state.overlay === 'factions') {
        if (state.faction) {
          const f = factions.find(x => x.name === state.faction);
          if (f && f.districts.includes(d.code)) { col = new THREE.Color(f.color); op = 0.95; }
        } else {
          const first = d.gangs[0] && factions.find(x => x.name === d.gangs[0]);
          if (first) { col = new THREE.Color(first.color); op = 0.4; }
        }
      } else if (state.overlay === 'threat') {
        if (!off.threat) { col = new THREE.Color(THREAT_COLOR[d.threat] ?? 0xffffff); op = 0.25 + d.threat * 0.12; }
      } else if (state.overlay === 'zones') {
        const z = CAT_META[d.zone];
        if (z && !off[d.zone]) { col = new THREE.Color(z.color); op = 0.5; }
      }
      // the selected district always reads strongest
      if (state.selected === d.code && col) op = Math.min(1, op + 0.4);
      if (col) { m.material.color.copy(col); m.material.opacity = op; }
      else m.material.opacity = 0;
    });
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
    const p = hitGround.point;
    let best = null, bestD = Infinity;
    districts.forEach(d => {
      if (!d.anchor) return;
      const dist = Math.hypot(p.x - d.anchor.x, p.z - d.anchor.z);
      const reach = Math.max(d.anchor.rx, d.anchor.rz) * 1.1 + 1.5;
      if (dist < reach && dist < bestD) { bestD = dist; best = d; }
    });
    return best ? { kind: 'district', d: best } : null;
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
    if (d.anchor) {
      ring.visible = true;
      ring.position.set(d.anchor.x, 0.12, d.anchor.z);
      ring.scale.setScalar(Math.max(d.anchor.rx, d.anchor.rz) * 1.12 + 1.2);
      flyTo(d.anchor.x, d.anchor.z, Math.max(d.anchor.rx, d.anchor.rz) * 5 + 22);
    }
    ui.showDistrict(d);
  }
  function showLocation(l) {
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
    tween = { t: 0, from, to, fromT, toT };
  }
  // Frame the whole plan, straight down — the map's resting state.
  function fitAll() { flyTo(W / 2, H / 2, fitH(), true); }
  stage.setFrame(dt => {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt * 1.5);
      const e = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - Math.pow(-2 * tween.t + 2, 2) / 2;
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.fromT, tween.toT, e);
      if (tween.t >= 1) tween = null;
    }
    const t = performance.now() * 0.002;
    ringMat.opacity = 0.55 + Math.sin(t * 2) * 0.3;
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
    reset.onclick = () => { ring.visible = false; state.selected = null; panel.classList.remove('open'); fitAll(); };
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
    return { side, tip, panel, count: cnt, showDistrict, showLocation, renderFactionList, syncBoxes };
  }

  function setMode(k) {
    state.mode = k; prefs.mode = k;
    const m = MODES[k];
    groundMat.color.setHex(m.tint);
    renderer.toneMappingExposure = m.exposure;
    stage.bloom.strength = m.bloom;
    ui.side.querySelectorAll('.nc-mode').forEach(b => b.classList.toggle('on', b.dataset.mode === k));
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
    renderer.domElement.removeEventListener('pointermove', onMove);
    renderer.domElement.removeEventListener('pointerdown', onDown);
    renderer.domElement.removeEventListener('pointerup', onUp);
    renderer.domElement.removeEventListener('click', onClick);
    disposables.forEach(o => { try { o.dispose && o.dispose(); } catch {} });
    [ui.side, ui.tip, ui.panel].forEach(n => n && n.remove());
    container.querySelectorAll('style').forEach(s => s.remove());
    origDispose();
  };
  return stage;
}

// ── helpers ────────────────────────────────────────────────────────
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
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
