// Draw 밤내 Bamnae as a surveyor would: contoured plan plus long sections.
//
// The Expanse rebuild shipped pictures before geometry, and this world needs
// that more, not less — its whole premise is elevation, and elevation is the
// one thing a plan view cannot show you. So: 2 m contours with 10 m index
// lines, the road network over the top, and two cut sections underneath.
//
// Pure Node, writes SVG, touches no runtime. Nothing here is the game; it is
// the drawing you approve before the game is built.
//
//   node tools/town-plan.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTownLayout } from '../src/world/town-layout.js';
import { createTownTerrain } from '../src/world/town-terrain.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', '_work', 'town-plan.svg');

const SCALE = 1.15;
const PAD = 58;
const SECTION_H = 150;
const SECTION_GAP = 34;

const INK = {
  page: '#0a0d14',
  frame: '#1d2836',
  text: '#cfdcec',
  dim: '#6d819a',
  faint: '#41536a',
  contour: '#24384a',
  contourIndex: '#3a5a72',
  ridge: '#4d7b63',
  water: '#16485c',
  waterEdge: '#2b7f9e',
  bank: '#1b3340',
  arterial: '#f2f6ff',
  street: '#a9bdd4',
  connector: '#7f93ab',
  alley: '#5e7288',
  bridge: '#ffd35c',
  wall: '#e8734a',
  spawn: '#ffd35c',
  landmark: '#4dc8ff',
};

const layout = generateTownLayout();
const terrain = createTownTerrain(layout);

const minX = layout.bounds.minX - layout.margin;
const maxX = layout.bounds.maxX + layout.margin;
const minZ = layout.bounds.minZ - layout.margin;
const maxZ = layout.bounds.maxZ + layout.margin;
const planW = (maxX - minX) * SCALE;
const planH = (maxZ - minZ) * SCALE;

const W = planW + PAD * 2;
const H = PAD + planH + SECTION_GAP + (SECTION_H + SECTION_GAP) * 2 + PAD;

const px = (x) => PAD + (x - minX) * SCALE;
const py = (z) => PAD + (z - minZ) * SCALE;
const n = (v) => Math.round(v * 10) / 10;

const parts = [];
const add = (s) => parts.push(s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- contours ---------------------------------------------------------------
// Marching squares over the height field. Segments only, not traced polylines:
// an SVG with ten thousand two-point paths still renders instantly and the
// code that produces it fits on a screen.
const CONTOUR_STEP = 2;
const INDEX_EVERY = 5; // every fifth contour, so 10 m

function contourSegments(grid, level) {
  const segs = [];
  const at = (c, r) => grid.heights[r * grid.cols + c];
  const wx = (c) => grid.minX + c * grid.cell;
  const wz = (r) => grid.minZ + r * grid.cell;
  const lerp = (a, b, va, vb) => a + (b - a) * ((level - va) / (vb - va));

  for (let r = 0; r < grid.rows - 1; r++) {
    for (let c = 0; c < grid.cols - 1; c++) {
      const v = [at(c, r), at(c + 1, r), at(c + 1, r + 1), at(c, r + 1)];
      let code = 0;
      for (let i = 0; i < 4; i++) if (v[i] > level) code |= 1 << i;
      if (code === 0 || code === 15) continue;

      // Crossing points on the four cell edges, in corner order.
      const e = [
        v[0] === v[1] ? null : { x: lerp(wx(c), wx(c + 1), v[0], v[1]), z: wz(r) },
        v[1] === v[2] ? null : { x: wx(c + 1), z: lerp(wz(r), wz(r + 1), v[1], v[2]) },
        v[3] === v[2] ? null : { x: lerp(wx(c), wx(c + 1), v[3], v[2]), z: wz(r + 1) },
        v[0] === v[3] ? null : { x: wx(c), z: lerp(wz(r), wz(r + 1), v[0], v[3]) },
      ];
      const join = (a, b) => { if (e[a] && e[b]) segs.push([e[a], e[b]]); };

      switch (code) {
        case 1: case 14: join(0, 3); break;
        case 2: case 13: join(0, 1); break;
        case 3: case 12: join(1, 3); break;
        case 4: case 11: join(1, 2); break;
        case 6: case 9: join(0, 2); break;
        case 7: case 8: join(2, 3); break;
        // Saddles: resolve with the cell average so neighbours agree.
        case 5: {
          const mid = (v[0] + v[1] + v[2] + v[3]) / 4;
          if (mid > level) { join(0, 1); join(2, 3); } else { join(0, 3); join(1, 2); }
          break;
        }
        case 10: {
          const mid = (v[0] + v[1] + v[2] + v[3]) / 4;
          if (mid > level) { join(0, 3); join(1, 2); } else { join(0, 1); join(2, 3); }
          break;
        }
        default: break;
      }
    }
  }
  return segs;
}

// ---- page -------------------------------------------------------------------
add(`<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}" viewBox="0 0 ${n(W)} ${n(H)}">`);
add(`<rect width="${n(W)}" height="${n(H)}" fill="${INK.page}"/>`);
add('<g font-family="ui-monospace, Menlo, Consolas, monospace">');

// ---- contours ---------------------------------------------------------------
const grid = terrain.sampleGrid(3);
add('<g stroke-linecap="round" fill="none">');
for (let level = Math.ceil(grid.min / CONTOUR_STEP) * CONTOUR_STEP; level <= grid.max; level += CONTOUR_STEP) {
  const isIndex = Math.round(level / CONTOUR_STEP) % INDEX_EVERY === 0;
  const segs = contourSegments(grid, level);
  if (!segs.length) continue;
  const d = segs.map(([a, b]) => `M${n(px(a.x))} ${n(py(a.z))}L${n(px(b.x))} ${n(py(b.z))}`).join('');
  add(`<path d="${d}" stroke="${isIndex ? INK.contourIndex : INK.contour}" stroke-width="${isIndex ? 1.1 : 0.55}"/>`);
}
add('</g>');

// index-contour labels up the ridge and out across the paddies
add(`<g fill="${INK.faint}" font-size="8">`);
for (const [x, z] of [[-210, -150], [-210, -120], [-210, -95], [180, 200], [-250, 60]]) {
  add(`<text x="${n(px(x))}" y="${n(py(z))}">${terrain.heightAt(x, z).toFixed(0)}m</text>`);
}
add('</g>');

// ---- the stream -------------------------------------------------------------
// Both banks, from the authored half-widths, plus the water itself.
function streamEdge(side) {
  const pts = layout.stream.points;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    out.push({ x: pts[i].x + (-dz / len) * pts[i].half * side, z: pts[i].z + (dx / len) * pts[i].half * side });
  }
  return out;
}
const left = streamEdge(1);
const right = streamEdge(-1).reverse();
const channel = [...left, ...right].map((p) => `${n(px(p.x))},${n(py(p.z))}`).join(' ');
add(`<polygon points="${channel}" fill="${INK.water}" stroke="${INK.waterEdge}" stroke-width="1"/>`);

// ---- roads ------------------------------------------------------------------
const ROAD_INK = { arterial: INK.arterial, street: INK.street, connector: INK.connector, alley: INK.alley };
const ROAD_W = { arterial: 3.4, street: 2.3, connector: 1.6, alley: 1.1 };
add('<g fill="none" stroke-linecap="round" stroke-linejoin="round">');
for (const edge of layout.edges) {
  const d = edge.points.map((p, i) => `${i ? 'L' : 'M'}${n(px(p.x))} ${n(py(p.z))}`).join(' ');
  const stroke = edge.bridge ? INK.bridge : ROAD_INK[edge.kind];
  add(`<path d="${d}" stroke="${stroke}" stroke-width="${ROAD_W[edge.kind]}" opacity="${edge.bridge ? 1 : 0.92}"/>`);
}
add('</g>');

// ---- earthworks -------------------------------------------------------------
// Every place the surveyed road disagrees with the landform by more than two
// metres. These are the walls the art pass owes the town.
add(`<g fill="none" stroke="${INK.wall}" stroke-width="1.2">`);
const wallMarks = [];
for (const edge of layout.edges) {
  if (edge.bridge) continue;
  for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1];
    const b = edge.points[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 6));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const delta = terrain.cutFillAt(x, z);
      if (Math.abs(delta) < 2) continue;
      const r = 1.2 + Math.abs(delta) * 0.35;
      wallMarks.push(`<circle cx="${n(px(x))}" cy="${n(py(z))}" r="${n(r)}" opacity="0.5"/>`);
    }
  }
}
add(wallMarks.join(''));
add('</g>');

// ---- nodes, spawn, landmarks ------------------------------------------------
add(`<g fill="${INK.dim}">`);
for (const node of layout.nodes) add(`<circle cx="${n(px(node.position.x))}" cy="${n(py(node.position.z))}" r="1.7"/>`);
add('</g>');

add(`<g fill="${INK.landmark}" font-size="9">`);
for (const [id, p] of Object.entries(layout.landmarks)) {
  add(`<circle cx="${n(px(p.x))}" cy="${n(py(p.z))}" r="3" opacity="0.85"/>`);
  add(`<text x="${n(px(p.x) + 6)}" y="${n(py(p.z) + 3)}" fill="${INK.landmark}" opacity="0.8">${esc(id)}</text>`);
}
add('</g>');

const sp = layout.spawn.position;
add(`<circle cx="${n(px(sp.x))}" cy="${n(py(sp.z))}" r="4.5" fill="none" stroke="${INK.spawn}" stroke-width="1.6"/>`);
add(`<text x="${n(px(sp.x) + 8)}" y="${n(py(sp.z) - 5)}" fill="${INK.spawn}" font-size="9">spawn</text>`);

// ---- street names -----------------------------------------------------------
const named = new Map();
for (const edge of layout.edges) {
  if (!edge.name || named.has(edge.name)) continue;
  named.set(edge.name, edge.points[Math.floor(edge.points.length / 2)]);
}
add(`<g fill="${INK.text}" font-size="9" opacity="0.72">`);
for (const [name, p] of named) {
  add(`<text x="${n(px(p.x) + 4)}" y="${n(py(p.z) - 4)}">${esc(name)}</text>`);
}
add('</g>');

// ---- frame and title --------------------------------------------------------
add(`<rect x="${PAD}" y="${PAD}" width="${n(planW)}" height="${n(planH)}" fill="none" stroke="${INK.frame}"/>`);
const bx = px(layout.bounds.minX);
const by = py(layout.bounds.minZ);
add(`<rect x="${n(bx)}" y="${n(by)}" width="${n((layout.bounds.maxX - layout.bounds.minX) * SCALE)}"`
  + ` height="${n((layout.bounds.maxZ - layout.bounds.minZ) * SCALE)}" fill="none" stroke="${INK.frame}"`
  + ` stroke-dasharray="4 4"/>`);
add(`<text x="${PAD}" y="${PAD - 30}" fill="${INK.text}" font-size="17">밤내 Bamnae — valley town plan</text>`);
add(`<text x="${PAD}" y="${PAD - 14}" fill="${INK.dim}" font-size="10">`
  + `600 x 450 m + ${layout.margin} m margin · 2 m contours, 10 m index ·`
  + ` ${layout.nodes.length} nodes / ${layout.edges.length} edges ·`
  + ` relief ${grid.min.toFixed(1)} to ${grid.max.toFixed(1)} m ·`
  + ` orange = cut or fill over 2 m</text>`);
add(`<text x="${n(W - PAD)}" y="${PAD - 14}" fill="${INK.dim}" font-size="10" text-anchor="end">north is -Z, up</text>`);

// ---- sections ---------------------------------------------------------------
// Vertically exaggerated, and labelled as such: a 46 m ridge over a 720 m
// valley drawn true to scale is a flat line with a bump on it.
function section(originY, title, samples, span) {
  const w = planW;
  const lo = Math.min(...samples.map((s) => s.y)) - 2;
  const hi = Math.max(...samples.map((s) => s.y)) + 2;
  const vScale = SECTION_H / (hi - lo);
  const sx = (t) => PAD + t * w;
  const sy = (y) => originY + SECTION_H - (y - lo) * vScale;
  const exaggeration = (vScale / SCALE).toFixed(1);

  add(`<rect x="${PAD}" y="${n(originY)}" width="${n(w)}" height="${SECTION_H}" fill="none" stroke="${INK.frame}"/>`);
  add(`<text x="${PAD}" y="${n(originY - 8)}" fill="${INK.text}" font-size="11">${esc(title)}</text>`);
  add(`<text x="${n(PAD + w)}" y="${n(originY - 8)}" fill="${INK.dim}" font-size="9" text-anchor="end">`
    + `${span.toFixed(0)} m across · vertical x${exaggeration}</text>`);

  // 10 m grid lines with labels
  add(`<g stroke="${INK.frame}" stroke-width="0.6">`);
  for (let y = Math.ceil(lo / 10) * 10; y <= hi; y += 10) {
    add(`<line x1="${PAD}" y1="${n(sy(y))}" x2="${n(PAD + w)}" y2="${n(sy(y))}"/>`);
  }
  add('</g>');
  add(`<g fill="${INK.faint}" font-size="8">`);
  for (let y = Math.ceil(lo / 10) * 10; y <= hi; y += 10) {
    add(`<text x="${PAD - 22}" y="${n(sy(y) + 3)}">${y}m</text>`);
  }
  add('</g>');

  const ground = samples.map((s, i) => `${i ? 'L' : 'M'}${n(sx(s.t))} ${n(sy(s.y))}`).join(' ');
  add(`<path d="${ground} L${n(sx(1))} ${n(originY + SECTION_H)} L${PAD} ${n(originY + SECTION_H)} Z"`
    + ` fill="${INK.ridge}" fill-opacity="0.13" stroke="${INK.ridge}" stroke-width="1.3"/>`);

  // water, where the section crosses the channel
  const wet = samples.filter((s) => s.water != null);
  if (wet.length) {
    for (const run of groupRuns(wet)) {
      const top = run[0].water;
      add(`<rect x="${n(sx(run[0].t))}" y="${n(sy(top))}" width="${n(sx(run.at(-1).t) - sx(run[0].t))}"`
        + ` height="${n(Math.max(1, originY + SECTION_H - sy(top)))}" fill="${INK.water}" fill-opacity="0.75"/>`);
    }
  }

  // where roads cross the section line
  add(`<g fill="${INK.arterial}">`);
  for (const s of samples) {
    if (!s.road) continue;
    add(`<circle cx="${n(sx(s.t))}" cy="${n(sy(s.y))}" r="1.9"/>`);
  }
  add('</g>');
  for (const label of samples.filter((s) => s.label)) {
    add(`<text x="${n(sx(label.t))}" y="${n(sy(label.y) - 7)}" fill="${INK.text}" font-size="8"`
      + ` text-anchor="middle" opacity="0.8">${esc(label.label)}</text>`);
  }
}

function groupRuns(list) {
  const runs = [];
  let current = null;
  for (const item of list) {
    if (current && item.index === current.at(-1).index + 1) current.push(item);
    else runs.push(current = [item]);
  }
  return runs.filter((r) => r.length > 1);
}

/** Is there a road within `reach` of this point? Used to dot the sections. */
function roadNear(x, z, reach = 6) {
  for (const edge of layout.edges) {
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lenSq = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lenSq));
      if (Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) <= reach) return edge;
    }
  }
  return null;
}

// Section A: north-south through the town centre, ridge to paddies.
const SECTION_A_X = -15;
const aSamples = [];
for (let i = 0; i <= 320; i++) {
  const t = i / 320;
  const z = minZ + (maxZ - minZ) * t;
  const water = terrain.waterAt(SECTION_A_X, z);
  aSamples.push({
    index: i, t, y: terrain.heightAt(SECTION_A_X, z),
    water: water ? water.y : null,
    road: !!roadNear(SECTION_A_X, z, 7),
  });
}
for (const [z, label] of [[-198, '정자'], [-128, '윗말2길'], [-92, '윗말1길'], [-27, '중앙로'], [44, '천변로'], [60, '밤내'], [100, '남길'], [152, '터미널']]) {
  const idx = Math.round(((z - minZ) / (maxZ - minZ)) * 320);
  if (aSamples[idx]) aSamples[idx].label = label;
}

// Section B: along 중앙로 itself, west gate to east pass. The signature drive.
const mainStreet = ['main_1', 'main_2', 'main_3', 'main_4', 'main_5', 'main_6', 'main_7', 'pass_climb']
  .map((id) => layout.edges.find((e) => e.id === id))
  .flatMap((e, i) => (i === 0 ? e.points : e.points.slice(1)));
let mainLength = 0;
const mainCum = [0];
for (let i = 1; i < mainStreet.length; i++) {
  mainLength += Math.hypot(mainStreet[i].x - mainStreet[i - 1].x, mainStreet[i].z - mainStreet[i - 1].z);
  mainCum.push(mainLength);
}
const bSamples = [];
for (let i = 0; i <= 320; i++) {
  const t = i / 320;
  const want = t * mainLength;
  let seg = 1;
  while (seg < mainCum.length - 1 && mainCum[seg] < want) seg++;
  const span = mainCum[seg] - mainCum[seg - 1] || 1;
  const local = (want - mainCum[seg - 1]) / span;
  const a = mainStreet[seg - 1];
  const b = mainStreet[seg];
  const x = a.x + (b.x - a.x) * local;
  const z = a.z + (b.z - a.z) * local;
  bSamples.push({ index: i, t, y: terrain.heightAt(x, z), water: null, road: false });
}
for (const [id, label] of [['west_gate', '서문'], ['main_nh', '윗말오름'], ['main_centre', '농협 · 중앙'], ['main_e', '동편오름'], ['east_pass', '고개']]) {
  const node = layout.nodes.find((nn) => nn.id === id).position;
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < mainStreet.length; i++) {
    const d = Math.hypot(mainStreet[i].x - node.x, mainStreet[i].z - node.z);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  const idx = Math.round((mainCum[bestI] / mainLength) * 320);
  if (bSamples[idx]) bSamples[idx].label = label;
}

const sectionAY = PAD + planH + SECTION_GAP + 14;
section(sectionAY, `Section A — north to south through the town centre (x = ${SECTION_A_X})`,
  aSamples, maxZ - minZ);
section(sectionAY + SECTION_H + SECTION_GAP + 14, 'Section B — 중앙로, west gate to east pass',
  bSamples, mainLength);

add('</g></svg>');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, parts.join('\n'), 'utf8');
console.log(`wrote ${out}`);
console.log(`  plan ${Math.round(planW)} x ${Math.round(planH)} px, relief ${grid.min.toFixed(1)} to ${grid.max.toFixed(1)} m`);
console.log(`  중앙로 runs ${mainLength.toFixed(0)} m end to end`);
