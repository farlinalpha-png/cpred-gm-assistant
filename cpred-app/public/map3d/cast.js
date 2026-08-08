// ═══════════════════════════════════════════════════════════════════
// CP:RED 3D MAPS — PRESENT / CAST (GM side)
//
// Puts the map on the table's TV. The GM app already runs an HTTP server
// for the player companion app; this drives a second view on it:
//
//   GM laptop  ──push state──>  local HTTP server  ──SSE──>  /display.html
//
// Open that URL on the TV (built-in browser, a Chromecast-with-Google-TV
// browser, a stick, a tablet, or an HDMI cable) and it mirrors what the GM
// is showing. For an actual Chromecast dongle, open the same URL in Chrome
// and use Chrome's own "Cast this tab" — see the CAST section of the panel
// for exactly why that is the honest path here.
// ═══════════════════════════════════════════════════════════════════
import { THREE, districts } from './core.js';

const ipc = (typeof require !== 'undefined') ? require('electron').ipcRenderer : null;

// Escape hatch for running the GM page outside Electron (a browser tab pointed
// at an already-running GM server): ?castapi=http://host:port drives the same
// endpoints over HTTP instead of IPC.
const CAST_API = (() => {
  try { return (new URLSearchParams(location.search).get('castapi') || '').replace(/\/+$/, ''); }
  catch (e) { return ''; }
})();

// ═══ QR CODE ═══════════════════════════════════════════════════════
// Byte mode, versions 1-10, EC level M (falls back to L for long URLs).
// Written out here because the display URL has to reach a phone/TV with no
// internet: no library, no image service, no CDN.
const QR = (() => {
  const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
  const BLOCKS = {
    L: [null, [7,1,19,0,0], [10,1,34,0,0], [15,1,55,0,0], [20,1,80,0,0], [26,1,108,0,0],
        [18,2,68,0,0], [20,2,78,0,0], [24,2,97,0,0], [30,2,116,0,0], [18,2,68,2,69]],
    M: [null, [10,1,16,0,0], [16,1,28,0,0], [26,1,44,0,0], [18,2,32,0,0], [24,2,43,0,0],
        [16,4,27,0,0], [18,4,31,0,0], [22,2,38,2,39], [22,3,36,2,37], [26,4,43,1,44]]
  };
  const ALIGN = [null, [], [6,18], [6,22], [6,26], [6,30], [6,34],
                 [6,22,38], [6,24,42], [6,26,46], [6,28,50]];
  const REMAINDER = [0,0,7,7,7,7,7,0,0,0,0];
  const EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  function generator(n) {
    let poly = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];                    // * x
        next[j + 1] ^= mul(poly[j], EXP[i]);   // * a^i
      }
      poly = next;
    }
    return poly;
  }
  function ecc(data, n) {
    const gen = generator(n), res = new Array(n).fill(0);
    for (const d of data) {
      const f = d ^ res[0];
      res.shift(); res.push(0);
      for (let i = 0; i < n; i++) res[i] ^= mul(gen[i + 1], f);
    }
    return res;
  }
  function bch(data, poly, bits) {
    let v = data << bits;
    const len = 32 - Math.clz32(poly);
    while (32 - Math.clz32(v) >= len) v ^= poly << ((32 - Math.clz32(v)) - len);
    return (data << bits) | v;
  }
  const formatBits = (ecl, mask) => (bch((EC_BITS[ecl] << 3) | mask, 0x537, 10) ^ 0x5412) & 0x7fff;
  const versionBits = v => bch(v, 0x1f25, 12) & 0x3ffff;

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];

  function bytesOf(str) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str));
    const s = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return Array.from(s, ch => ch.charCodeAt(0) & 0xff);
  }
  function pickVersion(len, ecl) {
    for (let v = 1; v <= 10; v++) {
      const [, b1, d1, b2, d2] = BLOCKS[ecl][v];
      if (4 + 8 + len * 8 <= (b1 * d1 + b2 * d2) * 8) return v;
    }
    return 0;
  }
  function codewords(bytes, version, ecl) {
    const [ecLen, b1, d1, b2, d2] = BLOCKS[ecl][version];
    const dataCw = b1 * d1 + b2 * d2;
    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
    put(0b0100, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
    for (let i = 0; i < 4 && bits.length < dataCw * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    const PAD = [0xec, 0x11];
    for (let p = 0; data.length < dataCw; p++) data.push(PAD[p % 2]);
    const dBlocks = [], eBlocks = [];
    let off = 0;
    for (let i = 0; i < b1 + b2; i++) {
      const n = i < b1 ? d1 : d2;
      const blk = data.slice(off, off + n); off += n;
      dBlocks.push(blk); eBlocks.push(ecc(blk, ecLen));
    }
    const out = [];
    for (let i = 0; i < Math.max(d1, d2); i++) for (const b of dBlocks) if (i < b.length) out.push(b[i]);
    for (let i = 0; i < ecLen; i++) for (const b of eBlocks) out.push(b[i]);
    return out;
  }
  function skeleton(version) {
    const size = version * 4 + 17;
    const mods = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const fn = Array.from({ length: size }, () => new Uint8Array(size));
    const set = (r, c, v) => { if (r >= 0 && c >= 0 && r < size && c < size) { mods[r][c] = v; fn[r][c] = 1; } };
    for (const [br, bc] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const inner = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const on = inner && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(br + r, bc + c, on ? 1 : 0);
      }
    }
    for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0 ? 1 : 0); set(i, 6, i % 2 === 0 ? 1 : 0); }
    const ap = ALIGN[version];
    for (const r of ap) for (const c of ap) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
        set(r + dr, c + dc, (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) ? 1 : 0);
    }
    for (let i = 0; i <= 8; i++) { if (i !== 6) { set(8, i, 0); set(i, 8, 0); } }
    for (let i = 0; i < 8; i++) { set(8, size - 1 - i, 0); set(size - 1 - i, 8, 0); }
    if (version >= 7) {
      for (let i = 0; i < 18; i++) {
        const r = Math.floor(i / 3), c = i % 3;
        set(size - 11 + c, r, 0); set(r, size - 11 + c, 0);
      }
    }
    set(size - 8, 8, 1);
    return { size, mods, fn };
  }
  function place(m, cw, remainder) {
    const { size, mods, fn } = m;
    const bits = [];
    cw.forEach(b => { for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1); });
    for (let i = 0; i < remainder; i++) bits.push(0);
    let bi = 0, up = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) {
        const row = up ? size - 1 - v : v;
        for (const col of [right, right - 1]) {
          if (fn[row][col]) continue;
          mods[row][col] = bi < bits.length ? bits[bi] : 0;
          bi++;
        }
      }
      up = !up;
    }
    return m;
  }
  function penalty(m) {
    const { size, mods } = m;
    let p = 0;
    for (let i = 0; i < size; i++) for (const byRow of [true, false]) {
      let run = 1, prev = -1;
      for (let j = 0; j < size; j++) {
        const v = byRow ? mods[i][j] : mods[j][i];
        if (v === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
        else { prev = v; run = 1; }
      }
    }
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
      const v = mods[r][c];
      if (v === mods[r][c + 1] && v === mods[r + 1][c] && v === mods[r + 1][c + 1]) p += 3;
    }
    const A = [1,0,1,1,1,0,1,0,0,0,0], B = [0,0,0,0,1,0,1,1,1,0,1];
    for (let i = 0; i < size; i++) for (let j = 0; j + 10 < size; j++) for (const byRow of [true, false]) {
      let ma = true, mb = true;
      for (let k = 0; k < 11; k++) {
        const v = byRow ? mods[i][j + k] : mods[j + k][i];
        if (v !== A[k]) ma = false;
        if (v !== B[k]) mb = false;
      }
      if (ma) p += 40;
      if (mb) p += 40;
    }
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += mods[r][c];
    return p + Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  }
  function finish(m, version, ecl, mask) {
    const { size, mods, fn } = m;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
      if (!fn[r][c] && MASKS[mask](r, c)) mods[r][c] ^= 1;
    const f = formatBits(ecl, mask);
    for (let i = 0; i < 15; i++) {
      const b = (f >> i) & 1;
      if (i < 6) mods[i][8] = b; else if (i < 8) mods[i + 1][8] = b; else mods[size - 15 + i][8] = b;
      if (i < 8) mods[8][size - 1 - i] = b; else if (i === 8) mods[8][7] = b; else mods[8][14 - i] = b;
    }
    if (version >= 7) {
      const v = versionBits(version);
      for (let i = 0; i < 18; i++) {
        const b = (v >> i) & 1, r = Math.floor(i / 3), c = i % 3;
        mods[size - 11 + c][r] = b; mods[r][size - 11 + c] = b;
      }
    }
    mods[size - 8][8] = 1;
    return m;
  }

  function encode(text) {
    const bytes = bytesOf(text);
    let ecl = 'M', version = pickVersion(bytes.length, ecl);
    if (!version) { ecl = 'L'; version = pickVersion(bytes.length, ecl); }
    if (!version) throw new Error('url too long for an offline QR');
    const cw = codewords(bytes, version, ecl);
    let best = null, score = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const m = finish(place(skeleton(version), cw, REMAINDER[version]), version, ecl, mask);
      const s = penalty(m);
      if (s < score) { score = s; best = m; }
    }
    return { size: best.size, modules: best.mods, version, ecl };
  }

  // Draw at a whole-pixel module size so phone cameras get crisp edges.
  function draw(canvas, text, px) {
    const q = encode(text);
    const quiet = 4;
    const total = q.size + quiet * 2;
    const scale = Math.max(2, Math.floor(px / total));
    const side = scale * total;
    canvas.width = side; canvas.height = side;
    canvas.style.width = canvas.style.height = side + 'px';
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, side, side);
    g.fillStyle = '#06070d';
    for (let r = 0; r < q.size; r++) for (let c = 0; c < q.size; c++) {
      if (q.modules[r][c]) g.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
    return q;
  }

  return { encode, draw, TOTAL };
})();

// ═══ CAST CONTROLLER ═══════════════════════════════════════════════
function boot() {
  if (window.__cpredCast) return;          // idempotent: safe to load twice

  const state = {
    live: false, show: 'city', theme: 'street',
    district: null, caption: '', presenter: true,
    camLock: true, spotlight: { on: false, x: 0, z: 0, label: '' },
    markers: loadMarkers(), tool: 'off', markerKind: 'party',
    url: '', urls: [], port: 8045, viewers: 0, reload: 0
  };
  let pushTimer = null, infoTimer = null, lastSent = '';
  let boundCanvas = null;

  // ── styles ──────────────────────────────────────────────────────
  const css = document.createElement('style');
  css.textContent = `
  #cast-panel{position:fixed;top:56px;right:14px;width:378px;max-height:calc(100vh - 76px);
    display:none;flex-direction:column;background:var(--surface,#1a1a2e);border:1px solid var(--border,#2a2a45);
    border-radius:8px;box-shadow:0 18px 60px rgba(0,0,0,.7),0 0 0 1px rgba(0,229,255,.12);
    z-index:900;overflow:hidden;font-family:'Rajdhani',sans-serif}
  #cast-panel.open{display:flex}
  #cast-head{display:flex;align-items:center;gap:8px;padding:11px 13px;background:var(--mid,#12121f);
    border-bottom:1px solid var(--border,#2a2a45)}
  #cast-head .t{font-family:'Orbitron',monospace;font-size:10px;letter-spacing:2.4px;color:var(--neon,#00e5ff)}
  #cast-head .x{margin-left:auto;cursor:pointer;color:var(--muted,#888);font-size:16px;line-height:1;padding:0 4px}
  #cast-head .x:hover{color:var(--red,#ff1744)}
  #cast-body{padding:13px;overflow-y:auto;display:flex;flex-direction:column;gap:15px}
  .cast-sec{display:flex;flex-direction:column;gap:8px}
  .cast-lbl{font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;
    text-transform:uppercase;color:var(--dim,#444)}
  .cast-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .cast-seg{display:flex;border:1px solid var(--border,#2a2a45);border-radius:4px;overflow:hidden;width:100%}
  .cast-seg button{flex:1;padding:7px 4px;background:transparent;border:0;border-right:1px solid var(--border,#2a2a45);
    color:var(--muted,#888);font-family:'Orbitron',monospace;font-size:8px;letter-spacing:1.4px;
    text-transform:uppercase;cursor:pointer;transition:all .15s}
  .cast-seg button:last-child{border-right:0}
  .cast-seg button:hover{color:#ccc;background:rgba(255,255,255,.04)}
  .cast-seg button.on{background:var(--neon,#00e5ff);color:var(--dark,#0a0a14);font-weight:700}
  .cast-in{width:100%;padding:7px 9px;background:var(--dark,#0a0a14);border:1px solid var(--border,#2a2a45);
    border-radius:4px;color:var(--text,#e0e0f0);font-family:'Share Tech Mono',monospace;font-size:11px}
  .cast-in:focus{outline:0;border-color:var(--neon,#00e5ff)}
  select.cast-in{cursor:pointer}
  .cast-chk{display:flex;align-items:center;gap:8px;cursor:pointer;font-family:'Share Tech Mono',monospace;
    font-size:10px;letter-spacing:.6px;color:#b9c2d6;text-transform:uppercase}
  .cast-chk input{accent-color:var(--neon,#00e5ff);width:14px;height:14px;cursor:pointer}
  #cast-url{font-family:'Share Tech Mono',monospace;font-size:13px;color:var(--neon,#00e5ff);
    word-break:break-all;user-select:text;line-height:1.5}
  #cast-qrwrap{display:flex;gap:11px;align-items:center}
  #cast-qr{background:#fff;border-radius:4px;padding:0;image-rendering:pixelated;flex:0 0 auto}
  #cast-status{font-family:'Share Tech Mono',monospace;font-size:10px;line-height:1.7;color:var(--muted,#888)}
  #cast-status b{font-weight:400}
  .cast-note{font-family:'Share Tech Mono',monospace;font-size:9.5px;line-height:1.75;color:#7d879c}
  .cast-note b{color:var(--gold,#ffd600);font-weight:400}
  .cast-warn{border-left:2px solid var(--gold,#ffd600);padding-left:9px}
  #cast-markers{display:flex;flex-direction:column;gap:4px;max-height:132px;overflow-y:auto}
  .cast-mk{display:flex;align-items:center;gap:7px;font-family:'Share Tech Mono',monospace;font-size:10px;
    color:#b9c2d6;background:var(--dark,#0a0a14);border:1px solid var(--border,#2a2a45);
    border-radius:3px;padding:4px 7px}
  .cast-mk .sw{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
  .cast-mk .rm{margin-left:auto;cursor:pointer;color:var(--dim,#444)}
  .cast-mk .rm:hover{color:var(--red,#ff1744)}
  #cast-btn-live{display:inline-flex;align-items:center;gap:6px}
  #cast-dot{width:7px;height:7px;border-radius:50%;background:#3a3a55}
  #cast-dot.on{background:var(--red,#ff1744);box-shadow:0 0 8px var(--red,#ff1744);animation:castblip 1.5s infinite}
  @keyframes castblip{0%,100%{opacity:1}50%{opacity:.3}}
  #cast-toast{position:fixed;bottom:18px;right:18px;z-index:950;background:var(--surface,#1a1a2e);
    border:1px solid var(--neon,#00e5ff);border-radius:4px;padding:8px 14px;display:none;
    font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--neon,#00e5ff)}`;
  document.head.appendChild(css);

  // ── button in the panel header ──────────────────────────────────
  const actions = document.getElementById('map3d-actions');
  const btn = document.createElement('button');
  btn.className = 'btn btn-outline btn-sm';
  btn.id = 'cast-btn-live';
  btn.innerHTML = '<span id="cast-dot"></span><span id="cast-btn-text">Present / Cast</span>';
  btn.onclick = () => togglePanel();
  if (actions) actions.appendChild(btn);

  // ── panel ───────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'cast-panel';
  panel.innerHTML = `
    <div id="cast-head">
      <div class="t">Present / Cast</div>
      <div class="x" id="cast-close">×</div>
    </div>
    <div id="cast-body">
      <div class="cast-sec">
        <div class="cast-lbl">Feed</div>
        <div class="cast-row">
          <button class="btn btn-primary btn-sm" id="cast-start" style="flex:1">Start Presenting</button>
          <button class="btn btn-ghost btn-sm" id="cast-refresh" title="Force every connected display to reload">↻ TVs</button>
        </div>
        <div id="cast-status">offline</div>
      </div>

      <div class="cast-sec" id="cast-connect" style="display:none">
        <div class="cast-lbl">Open this on the TV</div>
        <div id="cast-url">—</div>
        <div id="cast-qrwrap">
          <canvas id="cast-qr" width="160" height="160"></canvas>
          <div style="display:flex;flex-direction:column;gap:6px;flex:1">
            <button class="btn btn-ghost btn-sm" id="cast-copy">Copy URL</button>
            <button class="btn btn-ghost btn-sm" id="cast-open">Open in Browser</button>
            <div class="cast-note">Scan with a phone, or type it into the TV browser.</div>
          </div>
        </div>
        <select class="cast-in" id="cast-ip" style="display:none"></select>
      </div>

      <div class="cast-sec">
        <div class="cast-lbl">Showing</div>
        <div class="cast-seg" id="cast-show">
          <button data-show="standby">Standby</button>
          <button data-show="city" class="on">City Map</button>
          <button data-show="encounter">Encounter</button>
        </div>
        <select class="cast-in" id="cast-district"><option value="">— whole city —</option></select>
      </div>

      <div class="cast-sec">
        <div class="cast-lbl">Camera</div>
        <label class="cast-chk"><input type="checkbox" id="cast-camlock" checked> Follow my camera</label>
        <div class="cast-note">Off = the display slowly orbits on its own (good for downtime).</div>
      </div>

      <div class="cast-sec">
        <div class="cast-lbl">Pointer</div>
        <div class="cast-seg" id="cast-tool">
          <button data-tool="off" class="on">Off</button>
          <button data-tool="spot">Spotlight</button>
          <button data-tool="mark">Drop Marker</button>
        </div>
        <div class="cast-row">
          <input class="cast-in" id="cast-spotlabel" placeholder="spotlight label (optional)" style="flex:1">
          <button class="btn btn-ghost btn-sm" id="cast-spotclear">Clear</button>
        </div>
        <div class="cast-seg" id="cast-mkkind">
          <button data-kind="party" class="on">Party</button>
          <button data-kind="hostile">Hostile</button>
          <button data-kind="objective">Objective</button>
        </div>
        <div id="cast-markers"></div>
        <div class="cast-note">Click the 3D map with a tool armed. Dragging still orbits.</div>
      </div>

      <div class="cast-sec">
        <div class="cast-lbl">Lower third</div>
        <input class="cast-in" id="cast-caption" placeholder="say something to the table…">
        <div class="cast-row">
          <button class="btn btn-gold btn-sm" id="cast-capsend" style="flex:1">Send</button>
          <button class="btn btn-ghost btn-sm" id="cast-capclear">Clear</button>
        </div>
      </div>

      <div class="cast-sec">
        <div class="cast-lbl">Presenter mode</div>
        <label class="cast-chk"><input type="checkbox" id="cast-presenter" checked> Hide GM-only info</label>
        <div class="cast-note" id="cast-presenter-note"></div>
      </div>

      <div class="cast-sec">
        <div class="cast-lbl">Chromecast</div>
        <div class="cast-note cast-warn" id="cast-castnote"></div>
      </div>
    </div>`;
  document.body.appendChild(panel);

  const toast = document.createElement('div');
  toast.id = 'cast-toast';
  document.body.appendChild(toast);

  const $ = id => document.getElementById(id);
  const say = msg => {
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(say._t);
    say._t = setTimeout(() => { toast.style.display = 'none'; }, 2600);
  };

  // district picker
  const dsel = $('cast-district');
  districts().forEach(d => {
    const o = document.createElement('option');
    o.value = d.code; o.textContent = `${d.code} — ${d.name}`;
    dsel.appendChild(o);
  });

  // ── Chromecast reality check ────────────────────────────────────
  // Detection only. No pretending: the Cast *sender* SDK is a Chrome
  // feature and needs a registered application id plus an HTTPS receiver,
  // neither of which an offline desktop app can conjure.
  const castApi = !!(window.chrome && window.chrome.cast);
  const castFw = !!(window.cast && window.cast.framework);
  $('cast-castnote').innerHTML = (castApi || castFw)
    ? `<b>Cast SDK detected</b> in this runtime, but casting a live 3D page still needs a
       registered Cast application ID and an HTTPS-hosted receiver — impossible offline.
       Use <b>Chrome ⋮ → Cast… → Cast tab</b> on the display URL instead. Everything else here
       works without a Chromecast at all.`
    : `No Cast SDK in this runtime (Electron has no Cast sender), so there is <b>no in-app
       Cast button</b> and there is no honest way to add one offline. Two paths that do work:<br>
       1. Open the URL above directly on the TV (smart-TV browser, Google TV browser, tablet, HDMI).<br>
       2. Open the URL in <b>Chrome</b> on this laptop, then <b>⋮ → Cast… → Sources: Cast tab</b>
       and pick the Chromecast.`;

  $('cast-presenter-note').innerHTML = `On: only atlas facts the players could look up
    (location names). Off: gang presence, security provider and threat ratings are pushed to
    the TV as well, and hidden markers become visible.`;

  // ── state plumbing ──────────────────────────────────────────────
  function loadMarkers() {
    try { return JSON.parse(localStorage.getItem('cpred_cast_markers') || '[]'); } catch (e) { return []; }
  }
  function saveMarkers() {
    try { localStorage.setItem('cpred_cast_markers', JSON.stringify(state.markers)); } catch (e) {}
  }

  const MARKER_STYLE = {
    party:     { color: '#00e5ff', label: 'Party' },
    hostile:   { color: '#ff1744', label: 'Hostile' },
    objective: { color: '#ffd600', label: 'Objective' }
  };

  function gmStage() {
    // Whatever a mode's mount() returns lands here. Only treat it as a stage
    // when it really carries a camera and orbit target.
    const m = window.__map3d;
    const s = m && m.stage;
    return (s && s.camera && s.controls && s.controls.target) ? s : null;
  }
  function gmMode() {
    const t = document.getElementById('map3d-tab-enc');
    return (t && t.classList.contains('active')) ? 'encounter' : 'city';
  }

  function publicNotes() {
    const d = state.district ? districts().find(x => x.code === state.district) : null;
    if (!d) return [];
    if (state.presenter) return (d.locations || []).map(l => l.name);
    return [
      `SECURITY: ${d.securityProvider || 'unknown'}`,
      `GANGS: ${(d.gangs || []).join(', ') || 'none recorded'}`,
      `THREAT: ${d.threat}/5`,
      `CITY MANAGER: ${d.cityManager || 'unknown'}`,
      ...(d.locations || []).map(l => l.name)
    ];
  }

  function tokensForFeed() {
    // Markers the GM dropped, plus anything a future mode chooses to expose
    // through the optional __map3d.presentTokens() hook.
    const out = state.markers
      .filter(m => state.presenter ? !m.secret : true)
      .map(m => ({
        id: m.id, name: m.name, kind: m.kind, x: m.x, z: m.z,
        color: MARKER_STYLE[m.kind] ? MARKER_STYLE[m.kind].color : '#00e5ff',
        sub: state.presenter ? (m.place || '') : [m.place, m.note].filter(Boolean).join(' · ')
      }));
    try {
      const hook = window.__map3d && window.__map3d.presentTokens;
      if (typeof hook === 'function') {
        const extra = hook({ presenter: state.presenter }) || [];
        extra.forEach(t => { if (t && t.id != null) out.push(t); });
      }
    } catch (e) { /* a mode's hook must never break the feed */ }
    return out;
  }

  function buildPatch(force) {
    const st = gmStage();
    const d = state.district ? districts().find(x => x.code === state.district) : null;
    const patch = {
      live: state.live,
      show: state.live ? state.show : 'standby',
      theme: state.theme,
      district: state.district,
      title: d ? d.name : 'NIGHT CITY',
      subtitle: d ? `${d.region} · sector ${d.code}` : `${districts().length} districts · ${districts().reduce((n, x) => n + (x.locationCount || 0), 0)} locations`,
      caption: state.caption,
      camLock: state.camLock,
      spotlight: state.spotlight,
      tokens: tokensForFeed(),
      notes: publicNotes(),
      presenter: state.presenter,
      reload: state.reload
    };
    // Only mirror the camera when the GM is actually looking at what is on
    // air — otherwise switching to the Encounter tab would fling the TV's
    // city camera to encounter-space coordinates.
    if (st && state.camLock && state.show === gmMode()) {
      const p = st.camera.position, t = st.controls.target;
      patch.camera = {
        p: [round(p.x), round(p.y), round(p.z)],
        t: [round(t.x), round(t.y), round(t.z)]
      };
    }
    const sig = JSON.stringify(patch);
    if (!force && sig === lastSent) return null;
    lastSent = sig;
    return patch;
  }
  const round = v => Math.round(v * 100) / 100;

  async function push(force) {
    const patch = buildPatch(force);
    if (!patch) return;
    try {
      if (ipc) {
        const r = await ipc.invoke('present-set', patch);
        if (r && typeof r.viewers === 'number') state.viewers = r.viewers;
      } else if (CAST_API) {
        await fetch(CAST_API + '/api/present', { method: 'POST', body: JSON.stringify(patch) });
      }
    } catch (e) { console.warn('[cast] push failed', e); }
  }

  function startLoop() {
    stopLoop();
    pushTimer = setInterval(() => push(false), 250);
    infoTimer = setInterval(refreshInfo, 3000);
  }
  function stopLoop() {
    if (pushTimer) { clearInterval(pushTimer); pushTimer = null; }
    if (infoTimer) { clearInterval(infoTimer); infoTimer = null; }
  }

  async function refreshInfo() {
    if (!ipc && !CAST_API) return null;
    try {
      const info = ipc ? await ipc.invoke('present-info') : await httpInfo();
      state.url = info.url; state.urls = info.urls || []; state.port = info.port;
      state.viewers = info.viewers;
      renderStatus(info);
      return info;
    } catch (e) { return null; }
  }

  async function refreshInfoRaw() {
    if (ipc) return ipc.invoke('present-info');
    try { return await httpInfo(); } catch (e) { return { running: false, port: 8045 }; }
  }

  async function httpInfo() {
    const r = await fetch(CAST_API + '/api/present', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const s = await r.json();
    const port = Number((CAST_API.split(':')[2] || '8045').replace(/\D/g, '')) || 8045;
    return { running: true, port, ips: [], url: CAST_API + '/display.html',
             urls: [CAST_API + '/display.html'], viewers: 0, seq: s.seq, live: !!s.live };
  }

  function renderStatus(info) {
    const running = info ? info.running : false;
    const dot = $('cast-dot');
    dot.classList.toggle('on', !!state.live);
    $('cast-btn-text').textContent = state.live ? 'Presenting' : 'Present / Cast';
    $('cast-start').textContent = state.live ? 'Stop Presenting' : 'Start Presenting';
    $('cast-start').className = 'btn btn-sm ' + (state.live ? 'btn-red' : 'btn-primary');
    $('cast-connect').style.display = running ? '' : 'none';
    if (!info) { $('cast-status').innerHTML = 'desktop app required'; return; }
    const v = info.viewers || 0;
    $('cast-status').innerHTML = running
      ? `<b style="color:${state.live ? 'var(--green)' : 'var(--gold)'}">${state.live ? '● ON AIR' : '● SERVER UP'}</b>
         &nbsp;port ${info.port} &nbsp;·&nbsp; ${v} display${v === 1 ? '' : 's'} connected`
      : `<b style="color:var(--muted)">○ offline</b> — press start`;
  }

  function renderUrl() {
    const urls = state.urls && state.urls.length ? state.urls : (state.url ? [state.url] : []);
    const url = state.url || urls[0] || '';
    $('cast-url').textContent = url || '—';
    const sel = $('cast-ip');
    if (urls.length > 1) {
      sel.style.display = '';
      sel.innerHTML = urls.map(u => `<option${u === url ? ' selected' : ''}>${u}</option>`).join('');
      sel.onchange = () => { state.url = sel.value; renderUrl(); };
    } else sel.style.display = 'none';
    try {
      if (url) QR.draw($('cast-qr'), url, 200);
    } catch (e) {
      console.warn('[cast] qr', e);
      const c = $('cast-qr'), g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    }
  }

  function renderMarkers() {
    const wrap = $('cast-markers');
    wrap.innerHTML = '';
    state.markers.forEach(m => {
      const row = document.createElement('div');
      row.className = 'cast-mk';
      const st = MARKER_STYLE[m.kind] || MARKER_STYLE.party;
      row.style.opacity = (m.secret && state.presenter) ? '0.45' : '1';
      row.innerHTML = `<span class="sw" style="background:${st.color}"></span>
        <span>${escapeHtml(m.name)}${m.place ? ' <span style="color:var(--dim)">' + escapeHtml(m.place) + '</span>' : ''}</span>
        <span style="color:var(--dim)">${Math.round(m.x)},${Math.round(m.z)}</span>
        <span class="rm" title="GM-only marker" style="margin-left:auto">${m.secret ? '◌' : '◉'}</span>
        <span class="rm" style="margin-left:4px">×</span>`;
      const [eye, del] = row.querySelectorAll('.rm');
      eye.onclick = () => { m.secret = !m.secret; saveMarkers(); renderMarkers(); push(true); };
      del.onclick = () => {
        state.markers = state.markers.filter(x => x.id !== m.id);
        saveMarkers(); renderMarkers(); push(true);
      };
      wrap.appendChild(row);
    });
  }
  const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ── map picking (spotlight / markers) ───────────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  function bindCanvas() {
    const st = gmStage();
    const el = st && st.renderer && st.renderer.domElement;
    if (!el || el === boundCanvas) return;
    boundCanvas = el;
    let downAt = null;
    el.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', e => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved > 5 || state.tool === 'off') return;   // that was an orbit drag
      const s = gmStage();
      if (!s) return;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, s.camera);
      if (!ray.ray.intersectPlane(groundPlane, hit)) return;
      onPick(hit.x, hit.z);
    });
  }

  function onPick(x, z) {
    if (state.tool === 'spot') {
      state.spotlight = { on: true, x: round(x), z: round(z), label: $('cast-spotlabel').value.trim() };
      say('Spotlight moved');
    } else if (state.tool === 'mark') {
      const kind = state.markerKind;
      const style = MARKER_STYLE[kind];
      const near = nearestDistrictLabel(x, z);
      state.markers.push({
        id: 'mk' + Date.now().toString(36),
        kind, name: style.label, place: near || '', x: round(x), z: round(z), note: ''
      });
      saveMarkers(); renderMarkers();
      say(style.label + ' marker dropped');
    }
    push(true);
  }

  function nearestDistrictLabel(x, z) {
    let best = null, bd = Infinity;
    districts().forEach(d => {
      const dist = Math.hypot(d.x - x, d.z - z);
      if (dist < bd) { bd = dist; best = d; }
    });
    return (best && bd < 14) ? best.name : null;
  }

  // ── wiring ──────────────────────────────────────────────────────
  function togglePanel(force) {
    const open = force !== undefined ? force : !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    if (open) { refreshInfo().then(renderUrl); renderMarkers(); }
  }
  $('cast-close').onclick = () => togglePanel(false);

  $('cast-start').onclick = async () => {
    if (!ipc && !CAST_API) { say('Presenting needs the desktop app'); return; }
    if (state.live) {
      state.live = false;
      await push(true);
      stopLoop();
      renderStatus(await refreshInfoRaw());
      say('Stopped presenting');
      return;
    }
    let info = await refreshInfoRaw();
    if (!info.running) {
      await ipc.invoke('present-detach');   // never strand a socket on the old server
      const r = await ipc.invoke('server-start', info.port || 8045);
      if (!r.success) { say('Server failed: ' + r.error); return; }
      info = await refreshInfoRaw();
    }
    state.live = true;
    state.show = gmMode();
    syncShowButtons();
    await push(true);
    startLoop();
    state.url = info.url; state.urls = info.urls || [];
    renderStatus(info); renderUrl();
    say('Presenting on ' + info.url);
  };

  $('cast-refresh').onclick = () => { state.reload = Date.now(); push(true); say('Displays reloading'); };

  $('cast-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(state.url); say('URL copied'); }
    catch (e) {
      const r = document.createRange();
      r.selectNode($('cast-url'));
      getSelection().removeAllRanges(); getSelection().addRange(r);
      say('URL selected — press Ctrl+C');
    }
  };
  $('cast-open').onclick = async () => {
    if (!state.url) return;
    if (ipc) {
      const r = await ipc.invoke('open-external', state.url);
      say(r && r.success ? 'Opened in your browser — use ⋮ → Cast… to reach a Chromecast' : 'Could not open browser');
    } else window.open(state.url, '_blank');
  };

  function syncShowButtons() {
    panel.querySelectorAll('#cast-show button').forEach(b =>
      b.classList.toggle('on', b.dataset.show === state.show));
  }
  panel.querySelectorAll('#cast-show button').forEach(b => {
    b.onclick = () => { state.show = b.dataset.show; syncShowButtons(); push(true); };
  });
  panel.querySelectorAll('#cast-tool button').forEach(b => {
    b.onclick = () => {
      state.tool = b.dataset.tool;
      panel.querySelectorAll('#cast-tool button').forEach(x => x.classList.toggle('on', x === b));
      bindCanvas();
      say(state.tool === 'off' ? 'Pointer off' : 'Click the map to place');
    };
  });
  panel.querySelectorAll('#cast-mkkind button').forEach(b => {
    b.onclick = () => {
      state.markerKind = b.dataset.kind;
      panel.querySelectorAll('#cast-mkkind button').forEach(x => x.classList.toggle('on', x === b));
    };
  });

  dsel.onchange = () => {
    state.district = dsel.value || null;
    const d = state.district ? districts().find(x => x.code === state.district) : null;
    if (d && state.tool !== 'off') state.spotlight = { on: true, x: d.x, z: d.z, label: d.name };
    // If the city mode exposes a selection API, drive the GM's own view too —
    // then the mirrored camera takes the TV along for the ride. Optional by
    // design: the panel works exactly the same when the hook is absent.
    try {
      const st = gmStage();
      if (st && st.city) {
        if (state.district && typeof st.city.select === 'function') st.city.select(state.district);
        else if (!state.district && typeof st.city.reset === 'function') st.city.reset();
      }
    } catch (e) { console.warn('[cast] city select hook', e); }
    push(true);
  };
  $('cast-camlock').onchange = e => { state.camLock = e.target.checked; push(true); };
  $('cast-presenter').onchange = e => { state.presenter = e.target.checked; renderMarkers(); push(true); };
  $('cast-spotclear').onclick = () => {
    state.spotlight = { on: false, x: 0, z: 0, label: '' };
    $('cast-spotlabel').value = '';
    push(true);
  };
  $('cast-spotlabel').oninput = () => {
    if (state.spotlight.on) { state.spotlight = { ...state.spotlight, label: $('cast-spotlabel').value.trim() }; push(true); }
  };
  const sendCaption = () => { state.caption = $('cast-caption').value.trim(); push(true); say(state.caption ? 'Sent to the table' : 'Cleared'); };
  $('cast-capsend').onclick = sendCaption;
  $('cast-caption').addEventListener('keydown', e => { if (e.key === 'Enter') sendCaption(); });
  $('cast-capclear').onclick = () => { $('cast-caption').value = ''; sendCaption(); };

  // Keep the canvas hook alive across mode switches (index.js rebuilds the stage).
  setInterval(bindCanvas, 1200);

  window.__cpredCast = {
    open: () => togglePanel(true),
    close: () => togglePanel(false),
    push, state, QR,
    // Test seam: drive a pick without a real pointer event.
    pick: (x, z) => onPick(x, z)
  };

  refreshInfo().then(renderUrl);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { QR };
