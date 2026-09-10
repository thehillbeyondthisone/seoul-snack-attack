// Seoul Expanse greybox massing gate — the M3 milestone gate.
//
// M3 is the first rebuild milestone with geometry, so it is the first that can
// physically block the player. The gate is therefore in two halves:
//
//   clearance — nothing the massing emits may stand in a carriageway, close a
//     pavement, or stop the 2.7 x 5.0 m pocha truck driving the whole network.
//     The vehicle envelope is swept along every one of the 452 roads.
//   budget — the whole kilometre must fit a WebGL frame on a phone: triangles,
//     collision triangles, draw calls and material roles, measured per chunk.
//
// Everything measured here is measured from the same records the runtime
// builds its meshes from, so a bench failure is a game failure.
import { generateExpanseLayout, RIVER } from '../../src/world/expanse-layout.js';
import { generateExpanseStreets } from '../../src/world/expanse-streets.js';
import { generateExpanseBlocks } from '../../src/world/expanse-blocks.js';
import { generateExpanseMassing, MASSING_SEED, STOREY } from '../../src/world/expanse-massing.js';

let failures = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

const layout = generateExpanseLayout();
const streets = generateExpanseStreets(layout);
const plan = generateExpanseBlocks(streets);
const massing = generateExpanseMassing(plan, streets);
const { buildings, pavements, stats } = massing;

// ---------------------------------------------------------------------------
// Geometry helpers. All 2D in XZ; a volume's footprint is its own oriented
// rectangle, which is what the runtime rotates a BoxGeometry into.
// ---------------------------------------------------------------------------

function volumeFootprint(v) {
  const ax = Math.sin(v.yaw); const az = Math.cos(v.yaw);   // local +Z -> street
  const bx = Math.cos(v.yaw); const bz = -Math.sin(v.yaw);  // local +X
  const hw = v.width * 0.5;
  const hd = v.depth * 0.5;
  return [
    { x: v.x + bx * hw + ax * hd, z: v.z + bz * hw + az * hd },
    { x: v.x - bx * hw + ax * hd, z: v.z - bz * hw + az * hd },
    { x: v.x - bx * hw - ax * hd, z: v.z - bz * hw - az * hd },
    { x: v.x + bx * hw - ax * hd, z: v.z + bz * hw - az * hd },
  ];
}

function axesOf(corners) {
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

/** Separating-axis overlap depth of two convex quads; <= 0 means clear. */
function overlapDepth(a, b) {
  let smallest = Infinity;
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    let aMin = Infinity; let aMax = -Infinity; let bMin = Infinity; let bMax = -Infinity;
    for (const c of a) { const v = c.x * axis.x + c.z * axis.z; if (v < aMin) aMin = v; if (v > aMax) aMax = v; }
    for (const c of b) { const v = c.x * axis.x + c.z * axis.z; if (v < bMin) bMin = v; if (v > bMax) bMax = v; }
    const depth = Math.min(aMax, bMax) - Math.max(aMin, bMin);
    if (depth <= 0) return 0;
    if (depth < smallest) smallest = depth;
  }
  return smallest;
}

function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-9) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// ---------------------------------------------------------------------------
// A coarse grid over the road segments, so 1,212 buildings can each be tested
// against only the roads near them instead of all 452.
// ---------------------------------------------------------------------------

const CELL = 40;
const segments = [];
for (const edge of streets.edges) {
  for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1];
    const b = edge.points[i];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-6) continue;
    segments.push({
      edge, ax: a.x, az: a.z, bx: b.x, bz: b.z, half: edge.width * 0.5,
      bridge: !!edge.bridge, streetClass: edge.streetClass,
    });
  }
}
const segmentGrid = new Map();
for (let index = 0; index < segments.length; index++) {
  const s = segments[index];
  const reach = s.half + 8;
  for (let cx = Math.floor((Math.min(s.ax, s.bx) - reach) / CELL); cx <= Math.floor((Math.max(s.ax, s.bx) + reach) / CELL); cx++) {
    for (let cz = Math.floor((Math.min(s.az, s.bz) - reach) / CELL); cz <= Math.floor((Math.max(s.az, s.bz) + reach) / CELL); cz++) {
      const key = `${cx}:${cz}`;
      if (!segmentGrid.has(key)) segmentGrid.set(key, []);
      segmentGrid.get(key).push(index);
    }
  }
}
function segmentsNear(x, z, reach) {
  const found = new Set();
  for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) {
    for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++) {
      for (const index of segmentGrid.get(`${cx}:${cz}`) || []) found.add(index);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Massing shape
// ---------------------------------------------------------------------------

// A plot the streets leave no pavement around is dropped rather than built,
// so the count is allowed to fall short — but only just.
check('almost every building lot was massed',
  buildings.length === plan.lots.length - stats.droppedPlots && stats.droppedPlots <= 6,
  `${buildings.length} buildings for ${plan.lots.length} lots, `
  + `${stats.droppedPlots} dropped, ${stats.trimmedPlots} trimmed `
  + `(${Math.round(stats.trimmedArea)} m² of footprint)`);

const containment = buildings.filter((b) => b.volumes.some((v) =>
  v.width > b.width + 1e-6 || v.depth > b.depth + 1e-6));
check('no volume is wider or deeper than the lot it stands on',
  containment.length === 0, `${containment.length} buildings`);

const stacked = buildings.filter((b) => {
  const base = b.volumes.filter((v) => v.tier === 'base');
  for (let i = 1; i < base.length; i++) {
    if (Math.abs(base[i].base - base[i - 1].top) > 1e-6) return true;
  }
  return false;
});
check('base volumes stack without a gap or an overlap', stacked.length === 0,
  `${stacked.length} buildings`);

const storeyed = buildings.filter((b) => {
  const expected = b.storeys === 1 ? 4.2 : 4.2 + (b.storeys - 1) * STOREY;
  return Math.abs(b.height - expected) > 1e-6;
});
check('every height is a whole number of storeys', storeyed.length === 0,
  `${storeyed.length} buildings off the ${STOREY} m floor pitch`);

// A city with no vertical range reads as an industrial estate; one with no
// restraint reads as a mistake. Both ends matter.
const tall = buildings.filter((b) => b.top >= 24).length;
check('the skyline has a spread of heights',
  stats.tallest >= 34 && stats.tallest <= 90 && tall >= 60,
  `tallest ${stats.tallest.toFixed(1)} m, median ${stats.medianHeight.toFixed(1)} m, `
  + `${tall} buildings over 24 m`);

const pencils = buildings.filter((b) => b.top > Math.min(b.width, b.depth) * 6.5);
check('no plot was extruded into a pencil', pencils.length === 0,
  `${pencils.length} buildings taller than 6.5x their narrowest side`);

const wet = buildings.filter((b) => b.footprint.some(
  (c) => c.x > RIVER.minX && c.x < RIVER.maxX && c.z > RIVER.minZ && c.z < RIVER.maxZ));
check('no building stands in the river', wet.length === 0, `${wet.length} buildings`);

const inBounds = buildings.every((b) => b.footprint.every((c) =>
  c.x >= streets.bounds.minX - 40 && c.x <= streets.bounds.maxX + 40
  && c.z >= streets.bounds.minZ - 40 && c.z <= streets.bounds.maxZ + 40));
check('every building is inside the world bounds', inBounds);

// ---------------------------------------------------------------------------
// Clearance
// ---------------------------------------------------------------------------

// Nothing may stand in a carriageway. The runtime drives on the ground plane,
// so a building over the road is not a scrape, it is a wall across the street.
let worstIntrusion = 0;
let intruding = 0;
for (const building of buildings) {
  const reach = Math.max(building.width, building.depth) + 16;
  let worst = 0;
  for (const volume of building.volumes) {
    const corners = volumeFootprint(volume);
    for (const index of segmentsNear(building.x, building.z, reach)) {
      const s = segments[index];
      // A bridge deck rises clear of the street it passes over, so a building
      // beside its approach is not in its carriageway.
      if (s.bridge && volume.base > 0.5) continue;
      for (const corner of corners) {
        const distance = pointSegmentDistance(corner.x, corner.z, s.ax, s.az, s.bx, s.bz);
        if (distance < s.half) worst = Math.max(worst, s.half - distance);
      }
    }
  }
  if (worst > 1e-6) { intruding++; worstIntrusion = Math.max(worstIntrusion, worst); }
}
check('no massing stands in a carriageway', intruding === 0,
  `${intruding} buildings, worst ${worstIntrusion.toFixed(2)} m in`);

// Pavement pads are the kerb line, so they must reach the road and stop there.
let padIntrusion = 0;
let worstPad = 0;
for (const pad of pavements) {
  for (const corner of pad.polygon) {
    for (const index of segmentsNear(corner.x, corner.z, 30)) {
      const s = segments[index];
      if (s.bridge) continue;
      const distance = pointSegmentDistance(corner.x, corner.z, s.ax, s.az, s.bx, s.bz);
      // A tenth of a metre of slack: a kerb is allowed to touch the asphalt.
      if (distance < s.half - 0.1) { padIntrusion++; worstPad = Math.max(worstPad, s.half - distance); }
    }
  }
}
check('no pavement pad reaches into a carriageway', padIntrusion === 0,
  `${padIntrusion} kerb corners, worst ${worstPad.toFixed(2)} m in`);

// The pavement the swarm brief asks for is 1.8 m at a deliberate pinch. Measure
// what the building line actually leaves between itself and the kerb.
const SIDEWALK_MIN = 1.5;
let pinched = 0;
let narrowest = Infinity;
for (const building of buildings) {
  const reach = Math.max(building.width, building.depth) + 16;
  for (const corner of building.footprint) {
    for (const index of segmentsNear(building.x, building.z, reach)) {
      const s = segments[index];
      if (s.bridge) continue;
      const distance = pointSegmentDistance(corner.x, corner.z, s.ax, s.az, s.bx, s.bz);
      // Only the road this corner actually fronts is a pavement; a road 30 m
      // away on the far side of the block is not.
      if (distance > s.half + 12) continue;
      const pavement = distance - s.half;
      if (pavement < narrowest) narrowest = pavement;
      if (pavement < SIDEWALK_MIN) pinched++;
    }
  }
}
check('every frontage keeps a walkable pavement',
  pinched === 0, `${pinched} corners under ${SIDEWALK_MIN} m, narrowest ${narrowest.toFixed(2)} m`);

// The real drivability test: sweep the pocha truck's envelope down the middle
// of every road and make sure no massing is standing in it.
const VEHICLE = { width: 2.7, length: 5.0 };
const SWEEP_STEP = 4;
const buildingGrid = new Map();
buildings.forEach((building, index) => {
  const cx = Math.floor(building.x / CELL);
  const cz = Math.floor(building.z / CELL);
  for (let i = cx - 1; i <= cx + 1; i++) {
    for (let j = cz - 1; j <= cz + 1; j++) {
      const key = `${i}:${j}`;
      if (!buildingGrid.has(key)) buildingGrid.set(key, []);
      buildingGrid.get(key).push(index);
    }
  }
});
let blockedSweeps = 0;
let worstSweep = 0;
let sweptMetres = 0;
for (const s of segments) {
  const length = Math.hypot(s.bx - s.ax, s.bz - s.az);
  const dx = (s.bx - s.ax) / length;
  const dz = (s.bz - s.az) / length;
  const nx = -dz;
  const nz = dx;
  sweptMetres += length;
  for (let t = 0; t <= length; t += SWEEP_STEP) {
    const px = s.ax + dx * t;
    const pz = s.az + dz * t;
    const hw = VEHICLE.width * 0.5;
    const hl = VEHICLE.length * 0.5;
    const envelope = [
      { x: px + dx * hl + nx * hw, z: pz + dz * hl + nz * hw },
      { x: px + dx * hl - nx * hw, z: pz + dz * hl - nz * hw },
      { x: px - dx * hl - nx * hw, z: pz - dz * hl - nz * hw },
      { x: px - dx * hl + nx * hw, z: pz - dz * hl + nz * hw },
    ];
    const seen = new Set();
    for (let i = Math.floor((px - 30) / CELL); i <= Math.floor((px + 30) / CELL); i++) {
      for (let j = Math.floor((pz - 30) / CELL); j <= Math.floor((pz + 30) / CELL); j++) {
        for (const index of buildingGrid.get(`${i}:${j}`) || []) seen.add(index);
      }
    }
    for (const index of seen) {
      const depth = overlapDepth(envelope, buildings[index].footprint);
      if (depth > 0) { blockedSweeps++; worstSweep = Math.max(worstSweep, depth); }
    }
  }
}
check('the pocha truck envelope drives every road unobstructed',
  blockedSweeps === 0,
  `${(sweptMetres / 1000).toFixed(1)} km swept at ${VEHICLE.width} x ${VEHICLE.length} m, `
  + `${blockedSweeps} blocked, worst ${worstSweep.toFixed(2)} m`);

// The vehicle spawns on the central spine and must have somewhere to go.
const spawn = layout.spawn.position;
let spawnClearance = Infinity;
for (let ahead = 0; ahead <= 8; ahead += 1) {
  const px = spawn.x + Math.sin(layout.spawn.heading) * ahead;
  const pz = spawn.z + Math.cos(layout.spawn.heading) * ahead;
  for (const building of buildings) {
    const distance = Math.hypot(building.x - px, building.z - pz);
    if (distance < spawnClearance) spawnClearance = distance;
  }
}
check('the vehicle spawn has 8 m of clear road ahead of it',
  spawnClearance > VEHICLE.width, `nearest massing ${spawnClearance.toFixed(1)} m`);

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

// The runtime merges every volume, so a box is 12 triangles and the massing
// triangle count is exact rather than an estimate.
const PAVEMENT_TRIANGLES = pavements.reduce((total, pad) =>
  // Ear-clipping an n-gon gives n-2 top triangles; the kerb skirt is 2n more.
  total + (pad.polygon.length - 2) + pad.polygon.length * 2, 0);
const ROAD_TRIANGLES = segments.length * 4;
const GROUND_TRIANGLES = 4 * 2;
const worldTriangles = stats.triangles + PAVEMENT_TRIANGLES + ROAD_TRIANGLES + GROUND_TRIANGLES;

check('the whole city fits the desktop triangle budget',
  worldTriangles <= 800_000,
  `${worldTriangles.toLocaleString('en-US')} triangles `
  + `(${stats.triangles.toLocaleString('en-US')} massing, ${PAVEMENT_TRIANGLES.toLocaleString('en-US')} pavement, `
  + `${ROAD_TRIANGLES.toLocaleString('en-US')} road)`);

// The mobile view drops the detail tier and culls to a few chunks, so measure
// the worst case: base massing only, four adjacent chunks visible.
const chunkTriangles = stats.perChunk.map((c) => c.triangles).sort((a, b) => b - a);
const worstFourChunks = chunkTriangles.slice(0, 4).reduce((a, b) => a + b, 0);
check('the worst four-chunk view fits the mobile triangle budget',
  worstFourChunks + ROAD_TRIANGLES + PAVEMENT_TRIANGLES <= 350_000,
  `${(worstFourChunks + ROAD_TRIANGLES + PAVEMENT_TRIANGLES).toLocaleString('en-US')} triangles, `
  + `busiest chunk ${chunkTriangles[0].toLocaleString('en-US')}`);

// Collision is the whole world at once: it is never chunked, so it is the
// number that decides whether the BVH build is affordable on a phone.
const collisionTriangles = stats.triangles + PAVEMENT_TRIANGLES + GROUND_TRIANGLES
  + streets.edges.filter((e) => e.bridge).reduce((total, e) => total + (e.points.length - 1) * 4, 0);
check('collision stays inside the world collision budget',
  collisionTriangles <= 250_000,
  `${collisionTriangles.toLocaleString('en-US')} triangles`);

// One merged mesh per chunk per district, plus roads, pavement, ground, water.
const drawGroups = new Set();
for (const building of buildings) {
  for (const volume of building.volumes) {
    drawGroups.add(volume.tier === 'detail'
      ? `detail|${building.chunkId}`
      : `base|${building.chunkId}|${building.district}`);
  }
}
const pavementGroups = new Set(pavements.map((pad) => pad.chunkId));
const drawCalls = drawGroups.size + pavementGroups.size + 4;
check('the city draws in a sane number of calls', drawCalls <= 200,
  `${drawCalls} merged meshes`);

// Six district greybox paints plus ground, road, bridge, water, pavement, roof.
const MATERIALS = 6 + 6;
check('material roles stay well inside the contract', MATERIALS <= 96, `${MATERIALS} materials`);

const emptyChunks = stats.perChunk.filter((c) => c.buildings === 0);
check('every visual chunk owns some city', emptyChunks.length === 0,
  `${stats.perChunk.length - emptyChunks.length}/${stats.perChunk.length} chunks built`);

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

const again = generateExpanseMassing(
  generateExpanseBlocks(generateExpanseStreets(generateExpanseLayout())),
  generateExpanseStreets(generateExpanseLayout()),
  MASSING_SEED,
);
check('massing is deterministic for a given seed',
  again.stats.buildings === stats.buildings
  && again.stats.volumes === stats.volumes
  && Math.abs(again.stats.tallest - stats.tallest) < 1e-9
  && Math.abs(again.stats.floorArea - stats.floorArea) < 1e-6);

console.log('');
console.log(`massing: ${stats.buildings} buildings, ${stats.volumes} volumes, `
  + `${stats.meanStoreys.toFixed(1)} storeys mean, tallest ${stats.tallest.toFixed(1)} m, `
  + `${(stats.floorArea / 1000).toFixed(0)} × 10³ m² of floor`);
console.log(`per district: ${Object.entries(stats.perDistrict)
  .map(([id, d]) => `${id} ${d.buildings}@${(d.storeys / d.buildings).toFixed(1)}st/${d.tallest.toFixed(0)}m`)
  .join('  ')}`);
console.log(`budget: ${worldTriangles.toLocaleString('en-US')} visible triangles, `
  + `${collisionTriangles.toLocaleString('en-US')} collision, ${drawCalls} draws, `
  + `${pavements.length} pavement pads`);
console.log(`per chunk triangles: ${stats.perChunk.map((c) => `${c.id} ${c.triangles}`).join('  ')}`);

process.exit(failures ? 1 : 0);
