// Seoul Expanse block and lot gate.
//
// M2 turns the street network into land and the land into building plots.
// The failures that matter here are geometric and would only show up as
// clipping, z-fighting or buildings standing in the road once M3 extrudes
// them, so they are all measured now, in Node, before any geometry exists.
import { generateExpanseLayout, RIVER } from '../../src/world/expanse-layout.js';
import { generateExpanseStreets } from '../../src/world/expanse-streets.js';
import {
  generateExpanseBlocks, DISTRICT_LOT_RULES, BLOCKS_SEED,
} from '../../src/world/expanse-blocks.js';

let failures = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

const layout = generateExpanseLayout();
const streets = generateExpanseStreets(layout);
const city = generateExpanseBlocks(streets);
const { blocks, lots, stats } = city;

// --- the face walk must recover the whole city -------------------------------

check('every bounded face of the network was found',
  stats.foundFaces === stats.expectedFaces,
  `${stats.foundFaces} found, Euler predicts ${stats.expectedFaces}`);
check('exactly one face is the outside world', stats.outerFaces === 1, `${stats.outerFaces}`);
check('the network needed no unexpected planarising',
  stats.crossingsSplit <= 1 && stats.weldedNodes <= 1,
  `${stats.crossingsSplit} crossing split, ${stats.weldedNodes} node welded (both inherited)`);
check('blocks were recovered', blocks.length >= 120, `${blocks.length} blocks`);
check('few faces are lost to geometry failures',
  stats.rejected.collapsed + stats.rejected.tangled <= 12,
  `${stats.rejected.collapsed} collapsed, ${stats.rejected.tangled} tangled, `
  + `${stats.rejected.water} water, ${stats.rejected.tiny} tiny`);

// --- lots ---------------------------------------------------------------------

// Density is only meaningful against the street network it fills. One building
// per 18 m of street is the floor for a city that reads as built-up from a
// moving vehicle; below that the frontages start to feel like scenery flats.
const streetMetresPerLot = (streets.stats.pavedKm * 1000) / Math.max(1, lots.length);
check('the city is densely built along its streets',
  streetMetresPerLot <= 18,
  `${lots.length} lots, one per ${streetMetresPerLot.toFixed(1)} m of street`);
check('every district is built out',
  Object.keys(DISTRICT_LOT_RULES).every((id) => (stats.perDistrict[id]?.lots || 0) >= 40),
  Object.entries(stats.perDistrict).map(([k, v]) => `${k} ${v.lots}`).join(' '));

const badSize = lots.filter((l) => l.width < 3.4 || l.depth < 3.4 || l.width > 34 || l.depth > 28);
check('every lot is a plausible building footprint', badSize.length === 0,
  `${badSize.length} out of range`);

const wet = lots.filter((l) => l.corners.some(
  (c) => c.x > RIVER.minX && c.x < RIVER.maxX && c.z > RIVER.minZ && c.z < RIVER.maxZ,
));
check('no lot stands in the river', wet.length === 0, `${wet.length} lots`);

// --- lot-versus-lot overlap ----------------------------------------------------

function axes(corners) {
  const out = [];
  for (let i = 0; i < 2; i++) {
    const a = corners[i];
    const b = corners[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    out.push({ x: -dz / len, z: dx / len });
  }
  return out;
}
function projectionOverlap(a, b, axis, slack) {
  let aMin = Infinity; let aMax = -Infinity; let bMin = Infinity; let bMax = -Infinity;
  for (const c of a) { const v = c.x * axis.x + c.z * axis.z; if (v < aMin) aMin = v; if (v > aMax) aMax = v; }
  for (const c of b) { const v = c.x * axis.x + c.z * axis.z; if (v < bMin) bMin = v; if (v > bMax) bMax = v; }
  return Math.min(aMax, bMax) - Math.max(aMin, bMin) > slack;
}
// A shared party wall is how a Seoul shop street is built, so touching is fine;
// a real overlap is one that eats into the neighbour's floor plan.
const OVERLAP_SLACK = 0.75;
function rectanglesOverlap(a, b) {
  for (const axis of [...axes(a), ...axes(b)]) {
    if (!projectionOverlap(a, b, axis, OVERLAP_SLACK)) return false;
  }
  return true;
}

const CELL = 24;
const buckets = new Map();
const keyOf = (x, z) => `${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`;
lots.forEach((lot, index) => {
  const seen = new Set();
  for (const c of lot.corners) {
    const key = keyOf(c.x, c.z);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  }
});
const overlapping = new Set();
const tested = new Set();
for (const bucket of buckets.values()) {
  for (let i = 0; i < bucket.length; i++) {
    for (let k = i + 1; k < bucket.length; k++) {
      const pair = bucket[i] < bucket[k] ? `${bucket[i]}|${bucket[k]}` : `${bucket[k]}|${bucket[i]}`;
      if (tested.has(pair)) continue;
      tested.add(pair);
      if (!rectanglesOverlap(lots[bucket[i]].corners, lots[bucket[k]].corners)) continue;
      overlapping.add(bucket[i]);
      overlapping.add(bucket[k]);
    }
  }
}
check('no building lot overlaps another', overlapping.size === 0,
  `${overlapping.size} of ${lots.length} lots overlap`);

// --- lots versus carriageways ---------------------------------------------------

const segments = [];
for (const edge of streets.edges) {
  for (let i = 1; i < edge.points.length; i++) {
    segments.push({
      ax: edge.points[i - 1].x, az: edge.points[i - 1].z,
      bx: edge.points[i].x, bz: edge.points[i].z,
      half: edge.width / 2,
    });
  }
}
const roadBuckets = new Map();
for (const s of segments) {
  const minX = Math.min(s.ax, s.bx) - s.half - 4;
  const maxX = Math.max(s.ax, s.bx) + s.half + 4;
  const minZ = Math.min(s.az, s.bz) - s.half - 4;
  const maxZ = Math.max(s.az, s.bz) + s.half + 4;
  for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++) {
    for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++) {
      const key = `${x}:${z}`;
      if (!roadBuckets.has(key)) roadBuckets.set(key, []);
      roadBuckets.get(key).push(s);
    }
  }
}
function distanceToSegment(px, pz, s) {
  const abx = s.bx - s.ax; const abz = s.bz - s.az;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * abx + (pz - s.az) * abz) / lenSq));
  return Math.hypot(px - (s.ax + abx * t), pz - (s.az + abz * t));
}
let inRoad = 0;
let worstIntrusion = 0;
for (const lot of lots) {
  for (const c of lot.corners) {
    const near = roadBuckets.get(keyOf(c.x, c.z));
    if (!near) continue;
    for (const s of near) {
      const intrusion = s.half - distanceToSegment(c.x, c.z, s);
      if (intrusion > 0.35 && intrusion > worstIntrusion) worstIntrusion = intrusion;
      if (intrusion > 0.35) { inRoad++; break; }
    }
  }
}
check('no lot stands in a carriageway', inRoad === 0,
  `${inRoad} corners inside a road, worst ${worstIntrusion.toFixed(2)} m`);

// --- every lot actually fronts a street ------------------------------------------

let orphan = 0;
for (const lot of lots) {
  const frontX = lot.center.x + lot.facing.x * (lot.depth / 2 + 3);
  const frontZ = lot.center.z + lot.facing.z * (lot.depth / 2 + 3);
  let nearest = Infinity;
  for (let x = Math.floor((frontX - 12) / CELL); x <= Math.floor((frontX + 12) / CELL); x++) {
    for (let z = Math.floor((frontZ - 12) / CELL); z <= Math.floor((frontZ + 12) / CELL); z++) {
      for (const s of roadBuckets.get(`${x}:${z}`) || []) {
        const d = distanceToSegment(frontX, frontZ, s) - s.half;
        if (d < nearest) nearest = d;
      }
    }
  }
  if (!(nearest <= 6)) orphan++;
}
check('every lot has a street at its front door', orphan === 0,
  `${orphan} lots front nothing`);

// --- dead land inside blocks ------------------------------------------------------

function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x; const zi = polygon[i].z;
    const xj = polygon[j].x; const zj = polygon[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const lotBuckets = buckets;
let blockSamples = 0;
let deadSamples = 0;
for (const block of blocks) {
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const p of block.inset) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  for (let x = minX; x <= maxX; x += 8) {
    for (let z = minZ; z <= maxZ; z += 8) {
      if (!pointInPolygon(x, z, block.inset)) continue;
      blockSamples++;
      let near = false;
      for (let cx = Math.floor((x - 25) / CELL); cx <= Math.floor((x + 25) / CELL) && !near; cx++) {
        for (let cz = Math.floor((z - 25) / CELL); cz <= Math.floor((z + 25) / CELL) && !near; cz++) {
          for (const index of lotBuckets.get(`${cx}:${cz}`) || []) {
            if (Math.hypot(lots[index].center.x - x, lots[index].center.z - z) <= 25) { near = true; break; }
          }
        }
      }
      if (!near) deadSamples++;
    }
  }
}
const deadPct = blockSamples ? (100 * deadSamples) / blockSamples : 0;
check('little block land sits beyond reach of any frontage',
  deadPct <= 12, `${deadPct.toFixed(1)}% of block land`);

// --- determinism -------------------------------------------------------------------

const again = generateExpanseBlocks(generateExpanseStreets(generateExpanseLayout()), BLOCKS_SEED);
check('generation is deterministic for a given seed',
  again.stats.blocks === stats.blocks
  && again.stats.lots === stats.lots
  && again.stats.shops === stats.shops);

console.log('');
console.log(`city: ${blocks.length} blocks, ${lots.length} lots `
  + `(${stats.shops} shopfronts, ${stats.corners} corner plots), `
  + `${(stats.blockArea / 1e6).toFixed(3)} km² of block land`);
console.log(`median block ${Math.round(stats.medianBlockArea)} m², `
  + `median footprint ${Math.round(stats.medianFootprint)} m², `
  + `built ${(stats.builtArea / 1000).toFixed(0)} × 10³ m²`);
console.log(`per district: ${Object.entries(stats.perDistrict)
  .map(([k, v]) => `${k} ${v.blocks}blk/${v.lots}lots`).join('  ')}`);
console.log(`${stats.courtyards} blocks keep a courtyard; `
  + `${stats.oversized} are too fat for frontage alone `
  + `(${(stats.oversizedArea / 1000).toFixed(0)} × 10³ m²)`);

process.exit(failures ? 1 : 0);
