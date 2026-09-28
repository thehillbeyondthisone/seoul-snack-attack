// Gate for 밤내 Bamnae's plan and height field.
//
// The Expanse was flat, so nothing about it could be wrong vertically. This
// world's whole premise is elevation, which means a new class of silent
// failure: a junction that funnels, a lane at 20%, a road floating on an
// embankment, a stream filled in by the road that runs beside it. None of
// those look broken in a screenshot taken from the wrong angle. All of them
// ruin the drive.
//
// So every vertical claim town-layout.js and town-terrain.js make is measured
// here, before a single triangle is built.
//
//   node tools/bench/town-terrain-check.mjs
//   node tools/bench/town-terrain-check.mjs --verbose
import * as THREE from 'three';
import { generateTownLayout } from '../../src/world/town-layout.js';
import { createTownTerrain } from '../../src/world/town-terrain.js';
import { createRoadGraph, validateRoadGraph } from '../../src/world/road-network.js';

const verbose = process.argv.includes('--verbose');
const failures = [];
const notes = [];

function fail(message) { failures.push(message); }
function note(message) { notes.push(message); }

/**
 * Grade limits by road kind, as rise/run. A Korean hillside lane really does
 * hit 14%, and the pass really is 12%; everything else is a town street and
 * has no excuse. `edge.maxGrade` overrides per edge, for the pass.
 */
const GRADE_LIMIT = { arterial: 0.07, street: 0.09, connector: 0.14, alley: 0.10, track: 0.16 };

/**
 * Cut or fill past this reads as an embankment or a quarry rather than a road.
 *
 * Hillside lanes get a bigger allowance than town streets, and that is not a
 * fudge: a lane descending at 13% across a 25% hillside is a cut-and-fill
 * bench, and a bench has a retaining wall on its uphill side. 옹벽 of five or
 * six metres are ordinary in a Korean hillside village. A six-metre wall on
 * 중앙로 would not be, so main street and the town streets keep the tight
 * limit. Everything over WALL_THRESHOLD is reported, because it is the art
 * pass's list of where walls have to be drawn.
 */
// A track is held TIGHTER than a paved lane, not looser: the whole point of
// leaving it unpaved is that it follows the hill instead of benching into it,
// and a dirt track with a 6 m wall beside it is just an unfinished road.
const CUT_FILL_LIMIT = { arterial: 4.5, street: 4.5, connector: 6.5, alley: 4.5, track: 3.5 };
const WALL_THRESHOLD = 2.0;

/** The conform must reproduce the surveyed road exactly, not approximately. */
const CONFORM_TOLERANCE = 0.01;

/** Sample spacing along centrelines, metres. */
const STEP = 2;

const layout = generateTownLayout();
const terrain = createTownTerrain(layout);

// ---- 1. graph topology ------------------------------------------------------
const bounds = new THREE.Box3(
  new THREE.Vector3(layout.bounds.minX - layout.margin, -12, layout.bounds.minZ - layout.margin),
  new THREE.Vector3(layout.bounds.maxX + layout.margin, 80, layout.bounds.maxZ + layout.margin),
);
const graph = createRoadGraph({ nodes: layout.nodes, edges: layout.edges, bounds, roadWidth: 7 });
const topology = validateRoadGraph(graph);
if (!topology.ok) for (const error of topology.errors) fail(`graph: ${error}`);

// ---- 2. grades --------------------------------------------------------------
function walk(points, step = STEP) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    const count = Math.max(1, Math.ceil(run / step));
    for (let s = 0; s < count; s++) {
      const t = s / count;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  const last = points[points.length - 1];
  out.push({ x: last.x, z: last.z, y: last.y });
  return out;
}

const grades = [];
for (const edge of layout.edges) {
  const limit = edge.maxGrade ?? GRADE_LIMIT[edge.kind] ?? 0.09;
  let worst = 0;
  for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1];
    const b = edge.points[i];
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    if (run < 1e-3) { fail(`grade: ${edge.id} has a zero-length segment`); continue; }
    worst = Math.max(worst, Math.abs(b.y - a.y) / run);
  }
  grades.push({ id: edge.id, name: edge.name, kind: edge.kind, grade: worst, limit });
  if (worst > limit + 1e-6) {
    fail(`grade: ${edge.id} (${edge.name || edge.kind}) is ${(worst * 100).toFixed(1)}%, limit ${(limit * 100).toFixed(0)}%`);
  }
}

// ---- 3. the conform reproduces the survey ----------------------------------
let worstConform = { edge: null, delta: 0 };
for (const edge of layout.edges) {
  if (edge.bridge) continue;
  for (const p of walk(edge.points)) {
    const delta = Math.abs(terrain.heightAt(p.x, p.z) - p.y);
    if (delta > worstConform.delta) worstConform = { edge: edge.id, delta, x: p.x, z: p.z };
  }
}
if (worstConform.delta > CONFORM_TOLERANCE) {
  fail(`conform: ${worstConform.edge} centreline is ${worstConform.delta.toFixed(3)} m off the surveyed height `
    + `at (${worstConform.x.toFixed(0)}, ${worstConform.z.toFixed(0)}); tolerance ${CONFORM_TOLERANCE} m`);
}

// ---- 4. cut and fill --------------------------------------------------------
const cuts = [];
const walls = [];
for (const edge of layout.edges) {
  if (edge.bridge) continue;
  const limit = CUT_FILL_LIMIT[edge.kind] ?? 4.5;
  let worst = 0;
  let at = null;
  for (const p of walk(edge.points)) {
    const delta = terrain.cutFillAt(p.x, p.z);
    if (Math.abs(delta) > Math.abs(worst)) { worst = delta; at = p; }
  }
  cuts.push({ id: edge.id, name: edge.name, kind: edge.kind, delta: worst, at, limit });
  if (Math.abs(worst) > WALL_THRESHOLD) {
    walls.push({ id: edge.id, name: edge.name, height: Math.abs(worst), kind: worst > 0 ? 'embankment' : 'retaining wall', at });
  }
  if (Math.abs(worst) > limit) {
    fail(`earthworks: ${edge.id} (${edge.name || edge.kind}) needs ${worst > 0 ? 'fill' : 'cut'} of `
      + `${Math.abs(worst).toFixed(1)} m at (${at.x.toFixed(0)}, ${at.z.toFixed(0)}); limit ${limit} m`);
  }
}
cuts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
walls.sort((a, b) => b.height - a.height);

// ---- 5. carriageways are not cambered into ditches --------------------------
// Inside a carriageway the field is the road, so the cross slope should be the
// road's own cross slope: near zero. A lateral offset that dives means the
// conform is losing against the landform where two corridors overlap.
// Junctions are excluded. Where two roads at different grades meet, the
// surface between them genuinely warps — real junctions do too — and measuring
// camber there says nothing about the carriageway you drive down.
// A sharp bend in a polyline warps its surface for the same reason and just as
// legitimately: a switchback hairpin IS a junction of two segments. Measuring
// camber four metres from a 145-degree bend measures the bend.
// The radius is the widest incident corridor, not a constant. An 11 m arterial
// blends out across a 6 m shoulder, so it warps the ground for ~17 m around
// each of its junctions; a 4.8 m lane warps it for 8. Using one number for
// both flagged a lane 11 m from main street's pass junction, which is inside
// main street's shoulder and therefore main street's business.
const BEND_TURN = Math.PI / 4;
function shoulderFor(width) { return Math.max(3.0, width * 0.55); }
const nodeRadius = new Map(layout.nodes.map((n) => [n.id, 0]));
for (const edge of layout.edges) {
  const reach = edge.width / 2 + shoulderFor(edge.width) + 3;
  for (const id of [edge.a, edge.b]) {
    if (reach > nodeRadius.get(id)) nodeRadius.set(id, reach);
  }
}
const warpPoints = layout.nodes.map((n) => ({ ...n.position, r: nodeRadius.get(n.id) }));
const bends = [];
for (const edge of layout.edges) {
  for (let i = 1; i < edge.points.length - 1; i++) {
    const a = edge.points[i - 1];
    const m = edge.points[i];
    const b = edge.points[i + 1];
    const inAngle = Math.atan2(m.z - a.z, m.x - a.x);
    const outAngle = Math.atan2(b.z - m.z, b.x - m.x);
    let turn = Math.abs(outAngle - inAngle);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    if (turn >= BEND_TURN) {
      warpPoints.push({ x: m.x, z: m.z, r: edge.width / 2 + shoulderFor(edge.width) + 3 });
      bends.push({ edge: edge.id, name: edge.name, turn, at: m });
    }
  }
}
bends.sort((a, b) => b.turn - a.turn);
function nearJunction(x, z) {
  return warpPoints.some((n) => Math.hypot(x - n.x, z - n.z) < n.r);
}

/** Flat list of every non-bridge road segment, for proximity tests. */
const segs = [];
for (const edge of layout.edges) {
  if (edge.bridge) continue;
  for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1];
    const b = edge.points[i];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-3) continue;
    segs.push({ edge: edge.id, half: edge.width / 2, a, b });
  }
}

function closestOn(seg, x, z) {
  const dx = seg.b.x - seg.a.x;
  const dz = seg.b.z - seg.a.z;
  const lenSq = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - seg.a.x) * dx + (z - seg.a.z) * dz) / lenSq));
  const cx = seg.a.x + dx * t;
  const cz = seg.a.z + dz * t;
  return { t, x: cx, z: cz, y: seg.a.y + (seg.b.y - seg.a.y) * t, d: Math.hypot(x - cx, z - cz) };
}

function nearestEdgeId(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const seg of segs) {
    const hit = closestOn(seg, x, z);
    if (hit.d < bestD) { bestD = hit.d; best = seg.edge; }
  }
  return best;
}

let worstCross = { edge: null, slope: 0 };
for (const edge of layout.edges) {
  if (edge.bridge) continue;
  const half = edge.width / 2;
  const offset = half * 0.8;
  for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1];
    const b = edge.points[i];
    // The real perpendicular, from THIS segment's direction. The first version
    // offset along +Z regardless of which way the road ran, so on an east-west
    // lane it sampled along the road and reported its grade as camber.
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) continue;
    const px = (-dz / len) * offset;
    const pz = (dx / len) * offset;
    const steps = Math.max(1, Math.ceil(len / 4));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      if (nearJunction(x, z)) continue;
      const centre = terrain.heightAt(x, z);
      for (const side of [-1, 1]) {
        const ox = x + px * side;
        const oz = z + pz * side;
        // If the offset lands on ANOTHER road, the height there is that road,
        // not this one's camber. Two roads passing that close at different
        // heights is a real problem, but it is a stacking problem, and the
        // check below is the one that owns it.
        if (nearestEdgeId(ox, oz) !== edge.id) continue;
        const slope = Math.abs(terrain.heightAt(ox, oz) - centre) / offset;
        if (slope > worstCross.slope) worstCross = { edge: edge.id, slope, x, z };
      }
    }
  }
}
if (worstCross.slope > 0.12) {
  fail(`camber: ${worstCross.edge} carries a ${(worstCross.slope * 100).toFixed(0)}% cross slope `
    + `at (${worstCross.x.toFixed(0)}, ${worstCross.z.toFixed(0)}); a carriageway should be under 12%`);
}

// ---- 6. nothing is stacked over anything else ------------------------------
// A height field has ONE Y per X/Z. Two roads that pass close together at
// different heights cannot both exist, and the field resolves it by averaging
// them into a ramp between the two — which is how a switchback hairbin whose
// legs are three metres apart becomes a mudslide. The fix is always layout:
// widen the bend, or separate the legs.
const STACK_HEIGHT = 1.0;
const edgeEnds = new Map(layout.edges.map((e) => [e.id, [e.a, e.b]]));
function sharesNode(idA, idB) {
  const a = edgeEnds.get(idA);
  const b = edgeEnds.get(idB);
  return a.some((n) => b.includes(n));
}
let worstStack = null;
for (let i = 0; i < segs.length; i++) {
  for (let j = i + 1; j < segs.length; j++) {
    const a = segs[i];
    const b = segs[j];
    if (a.edge === b.edge) continue;
    // Two edges leaving the same junction are close and diverging by
    // definition, and 16 m down two arms of a crossroads they are already at
    // different heights. That is a junction, not a stack.
    if (sharesNode(a.edge, b.edge)) continue;
    const reach = a.half + b.half + 2;
    for (const p of walk([a.a, a.b], 2)) {
      const hit = closestOn(b, p.x, p.z);
      if (hit.d > reach) continue;
      const drop = Math.abs(p.y - hit.y);
      if (drop < STACK_HEIGHT) continue;
      if (!worstStack || drop > worstStack.drop) {
        worstStack = { a: a.edge, b: b.edge, drop, gap: hit.d, x: p.x, z: p.z };
      }
    }
  }
}
if (worstStack) {
  fail(`stacking: ${worstStack.a} and ${worstStack.b} pass ${worstStack.gap.toFixed(1)} m apart `
    + `at (${worstStack.x.toFixed(0)}, ${worstStack.z.toFixed(0)}) with ${worstStack.drop.toFixed(1)} m `
    + `between them — a height field cannot hold both; widen the bend`);
}

// ---- 7. the stream survives ------------------------------------------------
for (const edge of layout.edges.filter((e) => e.bridge)) {
  // At the point the deck actually crosses the water — NOT the polyline's
  // middle element, which for a six-point deck sits 14 m downstream of the
  // channel and reported a healthy bed over a filled-in stream.
  let mid = edge.points[0];
  let deepest = Infinity;
  for (const p of walk(edge.points, 1)) {
    const bed = terrain.heightAt(p.x, p.z);
    if (bed < deepest) { deepest = bed; mid = p; }
  }
  const bed = deepest;
  const clearance = mid.y - bed;
  const water = terrain.waterAt(mid.x, mid.z);
  if (!water) {
    fail(`stream: ${edge.id} (${edge.name}) does not cross open water anywhere along its deck`);
  } else if (water.depth < 0.6) {
    fail(`stream: under ${edge.id} (${edge.name}) the water is only ${water.depth.toFixed(2)} m deep `
      + `(surface ${water.y.toFixed(2)} m, bed ${bed.toFixed(2)} m) — the channel has been filled in`);
  }
  if (clearance < 3.0) {
    fail(`stream: ${edge.id} (${edge.name}) clears its own bed by only ${clearance.toFixed(2)} m`);
  }
  // What a driver sees is the deck over the WATER. A country stream bridge is
  // low — that is the charm — but under 1.2 m it reads as a ford.
  if (water && mid.y - water.y < 1.2) {
    fail(`stream: ${edge.id} (${edge.name}) deck sits ${(mid.y - water.y).toFixed(2)} m over the water`);
  }
  if (edge.clearance && Math.abs(edge.clearance - (mid.y - water.y)) > 0.4) {
    fail(`stream: ${edge.id} (${edge.name}) declares ${edge.clearance} m of clearance but measures `
      + `${(mid.y - water.y).toFixed(2)} m over the water`);
  }
  note(`${edge.name}: deck ${mid.y.toFixed(1)} m, water ${water ? water.y.toFixed(1) : '?'} m, `
    + `bed ${bed.toFixed(1)} m, clearance ${clearance.toFixed(1)} m over ${water ? water.depth.toFixed(1) : '?'} m of water`);
}

// No non-bridge road may run through the water.
for (const edge of layout.edges) {
  if (edge.bridge) continue;
  for (const p of walk(edge.points, 4)) {
    if (terrain.inStream(p.x, p.z)) {
      fail(`stream: ${edge.id} (${edge.name || edge.kind}) runs through the channel at `
        + `(${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
      break;
    }
  }
}

// ---- 8. the field itself ----------------------------------------------------
const grid = terrain.sampleGrid(4);
let nonFinite = 0;
let worstStep = { step: 0 };
let steepCells = 0;
for (let r = 0; r < grid.rows; r++) {
  for (let c = 0; c < grid.cols; c++) {
    const y = grid.heights[r * grid.cols + c];
    if (!Number.isFinite(y)) { nonFinite++; continue; }
    if (c + 1 < grid.cols) {
      const step = Math.abs(grid.heights[r * grid.cols + c + 1] - y);
      if (step > worstStep.step) {
        worstStep = { step, x: grid.minX + c * grid.cell, z: grid.minZ + r * grid.cell };
      }
      if (step / grid.cell > 0.25) steepCells++;
    }
  }
}
if (nonFinite) fail(`field: ${nonFinite} non-finite samples in the height grid`);

const relief = grid.max - grid.min;
const steepFraction = steepCells / (grid.rows * grid.cols);

// A height field has no cliffs by construction, but the conform can make one
// where a road is deeply cut. 4 m over a 4 m cell is a 45-degree face and the
// point past which the ground mesh needs a retaining wall drawn on it.
// 6 m over a 4 m cell is a 56-degree face. Below that the hillside lanes'
// own benching accounts for it and the earthworks list above already names
// every wall; above it, something has gone wrong that no wall would explain.
if (worstStep.step > 6.0) {
  fail(`field: a ${worstStep.step.toFixed(1)} m step across one 4 m cell at `
    + `(${worstStep.x.toFixed(0)}, ${worstStep.z.toFixed(0)}) — steeper than any authored bench`);
}

// ---- 9. spawn and landmarks stand on the ground ----------------------------
const spawnGround = terrain.heightAt(layout.spawn.position.x, layout.spawn.position.z);
if (Math.abs(layout.spawn.position.y - spawnGround) > 1.5) {
  fail(`spawn: authored at ${layout.spawn.position.y.toFixed(1)} m but the ground is at `
    + `${spawnGround.toFixed(1)} m`);
}
for (const [id, p] of Object.entries(layout.landmarks)) {
  if (id === 'weir') continue; // the weir is IN the water, by definition
  const ground = terrain.heightAt(p.x, p.z);
  if (Math.abs(p.y - ground) > 3.0) {
    fail(`landmark: ${id} authored at ${p.y.toFixed(1)} m, ground is ${ground.toFixed(1)} m`);
  }
}

// ---- report -----------------------------------------------------------------
const drivable = layout.edges.reduce((sum, e) => {
  let len = 0;
  for (let i = 1; i < e.points.length; i++) {
    len += Math.hypot(e.points[i].x - e.points[i - 1].x, e.points[i].z - e.points[i - 1].z);
  }
  return sum + len;
}, 0);

console.log('밤내 Bamnae — plan and height field');
console.log('-'.repeat(64));
console.log(`  footprint      ${layout.bounds.maxX - layout.bounds.minX} x ${layout.bounds.maxZ - layout.bounds.minZ} m`
  + ` (+${layout.margin} m margin)`);
console.log(`  graph          ${layout.nodes.length} nodes, ${layout.edges.length} edges,`
  + ` ${(drivable / 1000).toFixed(2)} km of road`);
console.log(`  relief         ${grid.min.toFixed(1)} m to ${grid.max.toFixed(1)} m (${relief.toFixed(1)} m)`);
console.log(`  steep ground   ${(steepFraction * 100).toFixed(1)}% of cells over 25%`);
console.log(`  conform error  ${worstConform.delta.toFixed(4)} m worst (${worstConform.edge ?? 'none'})`);
console.log(`  worst camber   ${(worstCross.slope * 100).toFixed(1)}% (${worstCross.edge ?? 'none'})`);
console.log(`  worst cell     ${worstStep.step.toFixed(2)} m across 4 m`);
console.log('');
console.log('  steepest roads');
for (const g of [...grades].sort((a, b) => b.grade - a.grade).slice(0, 6)) {
  console.log(`    ${(g.grade * 100).toFixed(1).padStart(5)}%  / ${(g.limit * 100).toFixed(0).padStart(3)}%`
    + `   ${g.id.padEnd(16)} ${g.name || g.kind}`);
}
console.log('');
console.log('  sharpest bends');
for (const bend of bends.slice(0, 4)) {
  console.log(`    ${(bend.turn * 180 / Math.PI).toFixed(0).padStart(4)} deg  ${bend.edge.padEnd(16)}`
    + `${(bend.name || '').padEnd(10)} (${bend.at.x.toFixed(0)}, ${bend.at.z.toFixed(0)})`);
}
console.log('');
console.log(`  earthworks (${walls.length} over ${WALL_THRESHOLD} m — the art pass owes each of these a wall)`);
for (const w of walls.slice(0, 8)) {
  console.log(`    ${w.height.toFixed(1).padStart(4)} m ${w.kind.padEnd(15)} ${w.id.padEnd(16)}`
    + `${(w.name || '').padEnd(10)} (${w.at.x.toFixed(0)}, ${w.at.z.toFixed(0)})`);
}
if (notes.length) {
  console.log('');
  for (const n of notes) console.log(`  ${n}`);
}

if (verbose) {
  console.log('');
  console.log('  all edges');
  for (const g of grades) {
    console.log(`    ${g.id.padEnd(16)} ${g.kind.padEnd(10)} ${(g.grade * 100).toFixed(1).padStart(5)}%`);
  }
}

console.log('');
if (failures.length) {
  console.log(`FAIL — ${failures.length} problem${failures.length === 1 ? '' : 's'}`);
  for (const f of failures) console.log(`  x ${f}`);
  process.exit(1);
}
console.log('OK — plan and height field agree');
