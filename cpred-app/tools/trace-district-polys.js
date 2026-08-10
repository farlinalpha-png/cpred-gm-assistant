// ═══════════════════════════════════════════════════════════════════
// Regenerates NC_DISTRICT_POLYS in public/mapdata.js.
//
// The Night City Atlas map draws district boundaries as red dotted lines.
// This traces that network into real polygons so zone/threat/faction shading
// follows the printed borders instead of a circle around each pin cluster.
//
//   node tools/trace-district-polys.js            report only, writes nothing
//   node tools/trace-district-polys.js --write     update public/mapdata.js
//   node tools/trace-district-polys.js --preview   also write a check image
//
// Pipeline:
//   1  decode the map JPEG to raw bytes (via PowerShell/System.Drawing —
//      Node has no image decoder and this app ships no image dependency)
//   2  red mask, max-pooled 2x down so the dots survive the downsample
//   3  dilate to close the gaps between dots; add the shoreline as a second
//      barrier, because along the coast the printed border simply stops
//   4  connected components of the space between the barriers
//   5  give each component to the district whose location pins sit in it
//   6  watershed the thickened border band back out, so neighbouring
//      districts meet on the line rather than leaving a gutter
//   7  marching squares + Douglas-Peucker into (u,v) rings
//
// Read the report it prints. "unseated" pins and "contested" components are
// the two things that mean the trace has gone wrong.
// ═══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const APP = path.resolve(__dirname, '..');
const MAPDATA = path.join(APP, 'public', 'mapdata.js');
const WRITE = process.argv.includes('--write');
const PREVIEW = process.argv.includes('--preview');

const DILATE = 4;        // working-res px; must exceed half the dot gap
const SIMPLIFY = 1.6;    // Douglas-Peucker tolerance, working-res px
const DOWN = 2;          // image downsample before tracing

// The Exec Zone is the one district with no mapped locations, so no pin can
// vote for it. On the map it is the second dotted ring nested inside Charter
// Hill, behind the Q1/Q2 checkpoint. Seed it by hand at a point inside it.
const SEEDS = { R: [0.734, 0.376] };

// ── 1. decode ──────────────────────────────────────────────────────
function decodeMap(imagePath) {
  const tmp = path.join(os.tmpdir(), 'nc-map-raw.bin');
  const ps = `
    Add-Type -AssemblyName System.Drawing
    $img = [System.Drawing.Image]::FromFile('${imagePath.replace(/\\/g, '\\\\')}')
    $w = $img.Width; $h = $img.Height
    $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp); $g.DrawImage($img, 0, 0, $w, $h)
    $g.Dispose(); $img.Dispose()
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
    $d = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $bytes = New-Object byte[] ($d.Stride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($d.Scan0, $bytes, 0, $bytes.Length)
    $bmp.UnlockBits($d); $bmp.Dispose()
    [System.IO.File]::WriteAllBytes('${tmp.replace(/\\/g, '\\\\')}', $bytes)
    Write-Output "$w $h $($d.Stride)"`;
  const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps],
    { encoding: 'utf8', maxBuffer: 1 << 20 }).trim().split(/\s+/).map(Number);
  const [w, h, stride] = out;
  const buf = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  // Format24bppRgb is BGR in memory.
  return { w, h, at: (x, y) => { const o = y * stride + x * 3; return [buf[o + 2], buf[o + 1], buf[o]]; } };
}

// ── run ────────────────────────────────────────────────────────────
const src = fs.readFileSync(MAPDATA, 'utf8');
const { NC_MAP, NC_MAP_DATA } = new Function(src + '; return { NC_MAP, NC_MAP_DATA };')();
const imagePath = path.join(APP, 'public', NC_MAP.image);

console.log('decoding', NC_MAP.image, '...');
const im = decodeMap(imagePath);
console.log(`  ${im.w}x${im.h}`);

// ── 2/3. barriers ──────────────────────────────────────────────────
const W = Math.floor(im.w / DOWN), H = Math.floor(im.h / DOWN), N = W * H;
const isRed = (r, g, b) => r - Math.max(g, b) > 25 && r > 70;
const isWater = (r, g, b) => b - r > 25 && b > 55;

const border = new Uint8Array(N), water = new Uint8Array(N);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let red = 0, wet = 0;
    for (let dy = 0; dy < DOWN; dy++)
      for (let dx = 0; dx < DOWN; dx++) {
        const [r, g, b] = im.at(x * DOWN + dx, y * DOWN + dy);
        if (isRed(r, g, b)) red = 1;
        else if (isWater(r, g, b)) wet = 1;
      }
    border[y * W + x] = red;
    water[y * W + x] = wet && !red;
  }
}

function dilate(mask, r) {
  const tmp = new Uint8Array(N), out = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let hit = 0;
      for (let d = -r; d <= r && !hit; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < W && mask[row + xx]) hit = 1;
      }
      tmp[row + x] = hit;
    }
  }
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      let hit = 0;
      for (let d = -r; d <= r && !hit; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < H && tmp[yy * W + x]) hit = 1;
      }
      out[y * W + x] = hit;
    }
  return out;
}

// Water gets a small dilation of its own to swallow the dark navy halo the map
// strokes around every shoreline; without it that halo is a free-space ring
// that joins every coastal district together.
const thick = (() => {
  const a = dilate(border, DILATE), b = dilate(water, 2), out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = a[i] | b[i];
  return out;
})();

// ── 4. components ──────────────────────────────────────────────────
const comp = new Int32Array(N).fill(-1);
const compSize = [];
const stack = new Int32Array(N);
let nComp = 0;
for (let i = 0; i < N; i++) {
  if (thick[i] || comp[i] >= 0) continue;
  const id = nComp++;
  let sp = 0, size = 0;
  stack[sp++] = i; comp[i] = id;
  while (sp) {
    const p = stack[--sp]; size++;
    const x = p % W, y = (p / W) | 0;
    const push = q => { if (!thick[q] && comp[q] < 0) { comp[q] = id; stack[sp++] = q; } };
    if (x > 0) push(p - 1);
    if (x < W - 1) push(p + 1);
    if (y > 0) push(p - W);
    if (y < H - 1) push(p + W);
  }
  compSize.push(size);
}

// The map's dark background wraps the whole city and reaches every image edge.
// No district does, so a component touching the border is never a district —
// without this rule one stray pin hands the entire backdrop to its district.
const rejected = new Uint8Array(nComp);
for (let x = 0; x < W; x++) {
  if (comp[x] >= 0) rejected[comp[x]] = 1;
  if (comp[(H - 1) * W + x] >= 0) rejected[comp[(H - 1) * W + x]] = 1;
}
for (let y = 0; y < H; y++) {
  if (comp[y * W] >= 0) rejected[comp[y * W]] = 1;
  if (comp[y * W + W - 1] >= 0) rejected[comp[y * W + W - 1]] = 1;
}

// ── 5. assign by pin vote ──────────────────────────────────────────
// Pins sit on the map's own red marker boxes, so the exact pixel is a barrier.
// Walk outward in a square spiral to find the free space the pin belongs to.
function compNear(px, py, maxR = 40) {
  for (let r = 0; r <= maxR; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = px + dx, y = py + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const c = comp[y * W + x];
        if (c >= 0 && !rejected[c]) return c;
      }
  return -1;
}

const votes = new Map();
const pinComp = [];
NC_MAP_DATA.forEach(d => d.locations.forEach(l => {
  if (l.u === undefined) return;
  const c = compNear(Math.round(l.u * W), Math.round(l.v * H));
  pinComp.push({ code: d.code, c, name: l.name });
  if (c < 0) return;
  if (!votes.has(c)) votes.set(c, new Map());
  const m = votes.get(c);
  m.set(d.code, (m.get(d.code) || 0) + 1);
}));

const compOwner = new Map();
const contested = [];
votes.forEach((m, c) => {
  const ranked = [...m.entries()].sort((a, b) => b[1] - a[1]);
  compOwner.set(c, ranked[0][0]);
  if (ranked.length > 1) contested.push({ c, size: compSize[c], ranked });
});
Object.entries(SEEDS).forEach(([code, [u, v]]) => {
  const c = compNear(Math.round(u * W), Math.round(v * H));
  if (c < 0) return console.log(`!! seed for ${code} found no region`);
  if (compOwner.has(c)) return console.log(`!! seed for ${code} hit ${compOwner.get(c)}'s region`);
  compOwner.set(c, code);
});

// ── 6. watershed the border band ───────────────────────────────────
const codes = NC_MAP_DATA.map(d => d.code);
const codeIdx = new Map(codes.map((c, i) => [c, i]));
const owner = new Int32Array(N).fill(-1);
for (let i = 0; i < N; i++) {
  const c = comp[i];
  if (c < 0) continue;
  const o = compOwner.get(c);
  if (o !== undefined) owner[i] = codeIdx.get(o);
}
{
  let frontier = [];
  for (let i = 0; i < N; i++) if (owner[i] >= 0) frontier.push(i);
  for (let step = 0; step < DILATE + 3 && frontier.length; step++) {
    const next = [];
    for (const p of frontier) {
      const o = owner[p], x = p % W, y = (p / W) | 0;
      // reclaim the thickened red line, never the sea
      const push = q => { if (thick[q] && !water[q] && owner[q] < 0) { owner[q] = o; next.push(q); } };
      if (x > 0) push(p - 1);
      if (x < W - 1) push(p + 1);
      if (y > 0) push(p - W);
      if (y < H - 1) push(p + W);
    }
    frontier = next;
  }
}

// ── 7. contours ────────────────────────────────────────────────────
const partOf = new Int32Array(N).fill(-1);
function componentsOf(idx) {
  partOf.fill(-1);
  const parts = [];
  for (let i = 0; i < N; i++) {
    if (owner[i] !== idx || partOf[i] >= 0) continue;
    const id = parts.length;
    let sp = 0, size = 0, top = i;
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    stack[sp++] = i; partOf[i] = id;
    while (sp) {
      const p = stack[--sp]; size++;
      if (p < top) top = p;
      const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const push = q => { if (owner[q] === idx && partOf[q] < 0) { partOf[q] = id; stack[sp++] = q; } };
      if (x > 0) push(p - 1);
      if (x < W - 1) push(p + 1);
      if (y > 0) push(p - W);
      if (y < H - 1) push(p + W);
    }
    parts.push({ id, size, top, x0, x1, y0, y1 });
  }
  return parts.sort((a, b) => b.size - a.size);
}

// Marching squares on the pixel *corners*, so the contour is the real crack
// between inside and outside rather than a walk over pixel centres. Travel
// always keeps an inside pixel on the left and an outside pixel on the right.
const DIRS = [[0, -1], [-1, 0], [0, 1], [1, 0]];        // U L D R
const VW = W + 1;
const seenEdge = new Uint8Array(VW * (H + 1) * 4);

function traceRing(inside, vx0, vy0, dir0) {
  let vx = vx0, vy = vy0, dir = dir0;
  const pts = [];
  let guard = 0;
  for (;;) {
    const key = ((vy * VW + vx) << 2) | dir;
    if (seenEdge[key]) break;
    seenEdge[key] = 1;
    pts.push([vx, vy]);
    vx += DIRS[dir][0]; vy += DIRS[dir][1];
    const tl = inside(vx - 1, vy - 1), tr = inside(vx, vy - 1);
    const bl = inside(vx - 1, vy), br = inside(vx, vy);
    const legal = [tl && !tr, bl && !tl, br && !bl, tr && !br];
    let nd = -1;
    // Prefer a right turn, then straight, then left, so saddle vertices always
    // resolve the same way and the walk never crosses itself.
    for (const cand of [(dir + 3) % 4, dir, (dir + 1) % 4, (dir + 2) % 4])
      if (legal[cand]) { nd = cand; break; }
    if (nd < 0) break;
    dir = nd;
    if (++guard > 400000) { console.log('   !! ring walk hit the guard'); break; }
  }
  return pts;
}

// Tracing every unused legal edge yields the part's outer boundary *and* every
// hole exactly once — which is what makes Charter Hill render as a ring around
// the Exec Zone instead of covering it.
function traceAllRings(inside, part) {
  seenEdge.fill(0);
  const rings = [];
  for (let vy = part.y0; vy <= part.y1 + 1; vy++)
    for (let vx = part.x0; vx <= part.x1 + 1; vx++) {
      const tl = inside(vx - 1, vy - 1), tr = inside(vx, vy - 1);
      const bl = inside(vx - 1, vy), br = inside(vx, vy);
      const legal = [tl && !tr, bl && !tl, br && !bl, tr && !br];
      for (let d = 0; d < 4; d++) {
        if (!legal[d] || seenEdge[((vy * VW + vx) << 2) | d]) continue;
        const ring = traceRing(inside, vx, vy, d);
        if (ring.length >= 8) rings.push(ring);
      }
    }
  return rings;
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L;
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}
// Closed rings have no endpoints, so split at the two farthest-apart vertices
// and simplify each half; otherwise RDP has nothing to anchor on.
function simplifyRing(ring, eps) {
  if (ring.length < 8) return ring;
  let a = 0, b = 0, best = -1;
  const step = Math.max(1, Math.floor(ring.length / 64));
  for (let i = 0; i < ring.length; i += step)
    for (let j = i + step; j < ring.length; j += step) {
      const d = (ring[i][0] - ring[j][0]) ** 2 + (ring[i][1] - ring[j][1]) ** 2;
      if (d > best) { best = d; a = i; b = j; }
    }
  const h1 = rdp(ring.slice(a, b + 1), eps);
  const h2 = rdp([...ring.slice(b), ...ring.slice(0, a + 1)], eps);
  return [...h1.slice(0, -1), ...h2.slice(0, -1)];
}
function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += (r[j][0] * r[i][1]) - (r[i][0] * r[j][1]);
  return a / 2;
}

const outPolys = {}, report = [];
codes.forEach((code, idx) => {
  const parts = componentsOf(idx);
  const total = parts.reduce((s, p) => s + p.size, 0);
  const shapes = [];
  parts.forEach(part => {
    if (part.size < total * 0.06 || part.size < 400) return;      // drop specks
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && partOf[y * W + x] === part.id;
    const rings = traceAllRings(inside, part)
      .map(r => simplifyRing(r, SIMPLIFY))
      .filter(r => r.length >= 4)
      .sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
    if (!rings.length) return;
    const outer = rings[0];                                        // one per 4-connected part
    if (Math.abs(ringArea(outer)) < 200) return;
    const holes = rings.slice(1).filter(r => Math.abs(ringArea(r)) > 900);
    if (ringArea(outer) < 0) outer.reverse();
    holes.forEach(h => { if (ringArea(h) > 0) h.reverse(); });
    shapes.push({ outer, holes });
  });
  outPolys[code] = shapes;
  report.push({ code, px: total, parts: parts.length, shapes: shapes.length,
    holes: shapes.reduce((s, sh) => s + sh.holes.length, 0),
    pts: shapes.reduce((s, sh) => s + sh.outer.length + sh.holes.reduce((t, h) => t + h.length, 0), 0) });
});

// ── report ─────────────────────────────────────────────────────────
const unseated = pinComp.filter(p => p.c < 0);
const foreign = pinComp.filter(p => p.c >= 0 && compOwner.get(p.c) !== p.code);
console.log(`\ntrace: ${W}x${H}, dilate ${DILATE}, simplify ${SIMPLIFY}, ${nComp} components`);
console.log(`pins:  ${pinComp.length} total, ${unseated.length} unseated, ${foreign.length} in a neighbour's region`);
foreign.forEach(p => console.log(`   ${p.code}: ${p.name} -> ${compOwner.get(p.c)}`));
if (contested.length) {
  console.log('contested components (two districts sharing one region):');
  contested.sort((a, b) => b.size - a.size).forEach(c =>
    console.log(`   size ${c.size}  ${c.ranked.map(r => r[0] + ':' + r[1]).join(' ')}`));
}
console.log('\ndistrict   px      parts shapes holes pts');
report.forEach(r => console.log(
  `  ${r.code.padEnd(3)}    ${String(r.px).padEnd(8)} ${String(r.parts).padEnd(5)} ` +
  `${String(r.shapes).padEnd(6)} ${String(r.holes).padEnd(5)} ${r.pts}`));
const empty = report.filter(r => r.shapes === 0);
if (empty.length) console.log('!! no polygon for: ' + empty.map(r => r.code).join(','));

{
  const cx = new Float64Array(nComp), cy = new Float64Array(nComp);
  for (let i = 0; i < N; i++) { const c = comp[i]; if (c >= 0) { cx[c] += i % W; cy[c] += (i / W) | 0; } }
  const free = [];
  for (let c = 0; c < nComp; c++)
    if (!rejected[c] && !compOwner.has(c) && compSize[c] > 6000)
      free.push({ c, size: compSize[c], u: cx[c] / compSize[c] / W, v: cy[c] / compSize[c] / H });
  if (free.length) {
    console.log('\nunclaimed enclosed regions (islands, or a district needing a SEED):');
    free.sort((a, b) => b.size - a.size).forEach(f =>
      console.log(`   size ${f.size} at u=${f.u.toFixed(3)} v=${f.v.toFixed(3)}`));
  }
}

// ── output ─────────────────────────────────────────────────────────
const uv = ring => ring.map(([x, y]) => [+(x / W).toFixed(4), +(y / H).toFixed(4)]);
const compact = {};
codes.forEach(code => {
  const shs = outPolys[code] || [];
  if (!shs.length) return;
  compact[code] = shs.map(sh => sh.holes.length
    ? { o: uv(sh.outer), h: sh.holes.map(uv) }
    : { o: uv(sh.outer) });
});

if (WRITE) {
  const block = `
// District boundaries traced from the map's own red dotted borders (and the
// shoreline, where the printed border stops over open water). Normalised (u,v)
// like the location pins: x = u * worldW, z = v * worldH. Each district is a
// list of shapes; "o" is the outer ring, "h" any holes.
// Regenerate with: node tools/trace-district-polys.js --write
const NC_DISTRICT_POLYS = ${JSON.stringify(compact)};
`;
  const marker = '\n// District boundaries traced';
  const i = src.indexOf(marker);
  const head = (i >= 0 ? src.slice(0, i) : src).replace(/\s*$/, '\n');
  fs.writeFileSync(MAPDATA, head + block);
  console.log(`\nwrote ${Object.keys(compact).length} districts into public/mapdata.js ` +
    `(${(fs.statSync(MAPDATA).size / 1024).toFixed(1)} KB total)`);
} else {
  console.log('\n(dry run — pass --write to update public/mapdata.js)');
}

// ── optional check image ───────────────────────────────────────────
// The failure mode here is a trace that reports fine and looks wrong, so the
// tool can draw what it produced over the map art for a human to inspect.
if (PREVIEW) {
  const P = 6, pw = Math.floor(im.w / P), ph = Math.floor(im.h / P);
  const rgb = new Uint8Array(pw * ph * 3);
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      const c = im.at(x * P, y * P), q = (y * pw + x) * 3;
      rgb[q] = c[0]; rgb[q + 1] = c[1]; rgb[q + 2] = c[2];
    }
  const hue = i => {
    const h = (i * 67) % 360, c = 0.85, xx = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = 1 - c;
    const t = [[c, xx, 0], [xx, c, 0], [0, c, xx], [0, xx, c], [xx, 0, c], [c, 0, xx]][Math.floor(h / 60) % 6];
    return t.map(u => Math.round((u + m * 0.15) * 255));
  };
  Object.keys(compact).forEach((code, ci) => {
    const col = hue(ci);
    compact[code].forEach(sh => {
      const rings = [sh.o, ...(sh.h || [])].map(r => r.map(([u, v]) => [u * pw, v * ph]));
      let y0 = 1e9, y1 = -1e9;
      rings.forEach(r => r.forEach(p => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }));
      for (let y = Math.max(0, y0 | 0); y <= Math.min(ph - 1, Math.ceil(y1)); y++) {
        const xs = [];
        rings.forEach(r => {
          for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
            const a = r[j], b = r[i];
            if ((a[1] > y + 0.5) !== (b[1] > y + 0.5))
              xs.push(a[0] + (y + 0.5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
          }
        });
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2)
          for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(pw - 1, Math.floor(xs[k + 1])); x++) {
            const q = (y * pw + x) * 3;
            for (let c = 0; c < 3; c++) rgb[q + c] = Math.round(rgb[q + c] * 0.8 + col[c] * 0.2);
          }
      }
      rings.forEach(r => {
        for (let i = 0; i < r.length; i++) {
          const a = r[i], b = r[(i + 1) % r.length];
          const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])) + 1;
          for (let s = 0; s <= n; s++) {
            const x = Math.round(a[0] + (b[0] - a[0]) * s / n), y = Math.round(a[1] + (b[1] - a[1]) * s / n);
            if (x < 0 || y < 0 || x >= pw || y >= ph) continue;
            const q = (y * pw + x) * 3;
            rgb[q] = col[0]; rgb[q + 1] = col[1]; rgb[q + 2] = col[2];
          }
        }
      });
    });
  });
  const out = path.join(APP, 'tools', 'district-polys-preview.png');
  writePNG(out, pw, ph, rgb);
  console.log('preview:', out);
}

// Minimal PNG writer — the app has no image dependency and this is only for
// eyeballing the trace.
function writePNG(file, w, h, rgb) {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  const crc32 = buf => {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    return (crc ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++)
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0))
  ]));
}
