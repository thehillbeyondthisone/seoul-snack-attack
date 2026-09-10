// Seoul Expanse street-network gate. Pure Node: the generator the runtime will
// consume is the generator asserted here, so a failure below is a failure in
// the game.
//
// This protects the M1 contract: the approved skeleton is untouched, the ring
// stays a fast loop, every road is routeable and paved, and the network is
// dense enough for the block stage to have something to subdivide.
import * as THREE from 'three';
import { generateExpanseLayout, EXPANSE_BOUNDS, RIVER } from '../../src/world/expanse-layout.js';
import { generateExpanseStreets, DISTRICT_STREET_RULES, STREETS_SEED } from '../../src/world/expanse-streets.js';
import { createRoadGraph, validateRoadGraph } from '../../src/world/road-network.js';

let failures = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

// Faults this generator inherits from the approved 25-node layout. They are
// reported loudly and separately: fixing them means editing a frozen contract,
// which is the user's call, not this gate's.
const inherited = [];
function inheritedFault(name, detail) { inherited.push(`${name} — ${detail}`); }

function crosses(a, b, c, d) {
  const d1x = b.x - a.x; const d1z = b.z - a.z;
  const d2x = d.x - c.x; const d2z = d.z - c.z;
  const denom = d1x * d2z - d1z * d2x;
  if (Math.abs(denom) < 1e-12) return false;
  const t = ((c.x - a.x) * d2z - (c.z - a.z) * d2x) / denom;
  const u = ((c.x - a.x) * d1z - (c.z - a.z) * d1x) / denom;
  return t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4;
}

const layout = generateExpanseLayout();
const streets = generateExpanseStreets(layout);
const { stats } = streets;

const bounds = new THREE.Box3(
  new THREE.Vector3(EXPANSE_BOUNDS.minX, -6, EXPANSE_BOUNDS.minZ),
  new THREE.Vector3(EXPANSE_BOUNDS.maxX, 60, EXPANSE_BOUNDS.maxZ),
);
const graph = createRoadGraph({ nodes: streets.nodes, edges: streets.edges, bounds, roadWidth: 9 });
const topology = validateRoadGraph(graph);

// --- the approved skeleton survives untouched --------------------------------

const ringSources = layout.edges.filter((e) => e.kind === 'ring');
const ringOut = streets.edges.filter((e) => e.kind === 'ring');
check('every authored ring edge still exists in the network',
  ringSources.every((src) => ringOut.some((e) => (e.parentId || e.id) === src.id)),
  `${ringSources.length} authored → ${ringOut.length} paved`);

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i - 1].distanceTo(points[i]);
  return total;
}
const authoredRingLength = ringSources.reduce((sum, e) => sum + polylineLength(e.points), 0);
const pavedRingLength = ringOut.reduce((sum, e) => sum + polylineLength(e.points), 0);
check('ring centreline length is preserved by junction cutting',
  Math.abs(authoredRingLength - pavedRingLength) < 1,
  `${authoredRingLength.toFixed(1)} m → ${pavedRingLength.toFixed(1)} m`);

check('ring corner radii are unchanged and still clear 80 m',
  ringOut.filter((e) => e.radius).every((e) => e.radius >= 80),
  `min ${Math.min(...ringOut.filter((e) => e.radius).map((e) => e.radius))} m`);

check('every authored skeleton node is still in the graph',
  layout.nodes.every((n) => streets.byId.has(n.id)),
  `${layout.nodes.length} authored nodes`);

const spawnStillOnRoad = streets.edges.some((e) => e.points.some(
  (p) => p.distanceTo(layout.spawn.position) < 60,
));
check('spawn still sits on the network', spawnStillOnRoad);

// --- the ring stays a fast loop ----------------------------------------------

const ringNodeIds = new Set();
for (const edge of ringOut) { ringNodeIds.add(edge.a); ringNodeIds.add(edge.b); }
const ringJunctions = [...ringNodeIds].filter((id) => {
  const touching = graph.adjacency.get(id) || [];
  return touching.some((item) => item.edge.kind !== 'ring');
});
check('ring access stays sparse (no more than one junction per 120 m)',
  ringJunctions.length <= Math.floor(pavedRingLength / 120),
  `${ringJunctions.length} junctions over ${(pavedRingLength / 1000).toFixed(2)} km`);

const ringCrossings = new Set();
const authoredCrossings = new Set();
for (const edge of streets.edges) {
  if (edge.kind === 'ring') continue;
  for (let i = 1; i < edge.points.length; i++) {
    for (const ring of ringOut) {
      for (let k = 1; k < ring.points.length; k++) {
        if (!crosses(edge.points[i - 1], edge.points[i], ring.points[k - 1], ring.points[k])) continue;
        if (edge.skeleton) authoredCrossings.add(`${edge.parentId || edge.id} × ${ring.parentId || ring.id}`);
        else ringCrossings.add(edge.id);
      }
    }
  }
}
check('no generated street crosses the ring at grade', ringCrossings.size === 0,
  [...ringCrossings].slice(0, 3).join(', '));
for (const conflict of authoredCrossings) {
  inheritedFault('authored road crosses the ring at grade', conflict);
}

// --- topology the delivery loop depends on ------------------------------------

check('graph is connected, dead-end free and has no bridge dependency',
  topology.ok, topology.errors.slice(0, 4).join('; '));

const degrees = new Map(streets.nodes.map((n) => [n.id, 0]));
for (const edge of streets.edges) {
  degrees.set(edge.a, degrees.get(edge.a) + 1);
  degrees.set(edge.b, degrees.get(edge.b) + 1);
}
check('every junction has at least two exits',
  [...degrees.values()].every((d) => d >= 2), `min ${Math.min(...degrees.values())}`);

const pairs = new Set();
let duplicates = 0;
for (const edge of streets.edges) {
  const key = [edge.a, edge.b].sort().join('|');
  if (pairs.has(key)) duplicates++;
  pairs.add(key);
}
check('no two roads join the same pair of junctions', duplicates === 0, `${duplicates} duplicates`);

const generatedLengths = streets.edges.filter((e) => !e.skeleton)
  .map((e) => e.length).sort((a, b) => a - b);
check('no degenerate generated road stubs', generatedLengths[0] >= 4,
  `shortest ${generatedLengths[0].toFixed(1)} m`);
for (const edge of streets.edges) {
  if (!edge.skeleton || edge.length >= 1) continue;
  inheritedFault('authored road has zero length',
    `${edge.parentId || edge.id} joins coincident nodes ${edge.a} and ${edge.b}`);
}

// A junction whose two roads leave on almost the same bearing is not a
// junction: it encloses a sliver, cannot be driven as a turn, and on the plan
// it reads as a road dangling in open ground.
const incident = new Map(streets.nodes.map((n) => [n.id, []]));
for (const edge of streets.edges) {
  incident.get(edge.a).push(edge);
  incident.get(edge.b).push(edge);
}
function bearingAt(edge, nodeId) {
  const points = edge.a === nodeId ? edge.points : [...edge.points].reverse();
  return Math.atan2(points[1].z - points[0].z, points[1].x - points[0].x);
}
let generatedSlivers = 0;
for (const [nodeId, edges] of incident) {
  for (let i = 0; i < edges.length; i++) {
    for (let k = i + 1; k < edges.length; k++) {
      let delta = Math.abs(bearingAt(edges[i], nodeId) - bearingAt(edges[k], nodeId));
      while (delta > Math.PI) delta = Math.abs(delta - 2 * Math.PI);
      if (delta >= (25 * Math.PI) / 180) continue;
      if (edges[i].skeleton && edges[k].skeleton) {
        inheritedFault('authored roads meet at a sliver angle',
          `${edges[i].parentId || edges[i].id} and ${edges[k].parentId || edges[k].id} `
          + `leave ${nodeId} ${((delta * 180) / Math.PI).toFixed(1)}° apart`);
      } else generatedSlivers++;
    }
  }
}
check('no generated junction is a sliver', generatedSlivers === 0,
  `${generatedSlivers} under 25°`);

check('every road is paved and routeable',
  streets.edges.every((e) => e.width > 0 && Number.isFinite(e.length) && e.points.length >= 2));

// --- hierarchy and density ----------------------------------------------------

const widths = streets.edges.map((e) => e.width);
check('street hierarchy spans alley to ring',
  Math.min(...widths) <= 5.5 && Math.max(...widths) >= 22,
  `${Math.min(...widths)} m – ${Math.max(...widths)} m`);

check('every district owns roads',
  Object.keys(DISTRICT_STREET_RULES).every((id) => (stats.perDistrict[id] || 0) >= 12),
  Object.entries(stats.perDistrict).map(([k, v]) => `${k} ${v}`).join(' '));

check('the network encloses enough blocks for the lot stage',
  stats.blocks >= 110, `${stats.blocks} blocks`);

check('the city is built on both sides of the ring',
  stats.outsideRingEdges >= 60,
  `${stats.insideRingEdges} inside / ${stats.outsideRingEdges} outside`);

check('paved network is at least 18 km', stats.pavedKm >= 18, `${stats.pavedKm.toFixed(1)} km`);

// --- nothing in the water -----------------------------------------------------

let inWater = 0;
for (const edge of streets.edges) {
  if (edge.bridge) continue;
  for (const p of edge.points) {
    if (p.x > RIVER.minX && p.x < RIVER.maxX && p.z > RIVER.minZ && p.z < RIVER.maxZ) inWater++;
  }
}
check('no road runs through the river except the authored bridges', inWater === 0, `${inWater} points`);

const outOfBounds = streets.nodes.filter((n) => n.position.x < EXPANSE_BOUNDS.minX
  || n.position.x > EXPANSE_BOUNDS.maxX
  || n.position.z < EXPANSE_BOUNDS.minZ
  || n.position.z > EXPANSE_BOUNDS.maxZ);
check('every junction is inside the 1,000 × 720 m world', outOfBounds.length === 0,
  `${outOfBounds.length} outside`);

// --- land coverage: the measure of whether the map still reads as empty -------

const segments = [];
for (const edge of streets.edges) {
  for (let i = 1; i < edge.points.length; i++) {
    segments.push([edge.points[i - 1].x, edge.points[i - 1].z, edge.points[i].x, edge.points[i].z]);
  }
}
function distanceToSegment(px, pz, [ax, az, bx, bz]) {
  const abx = bx - ax; const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}
let land = 0;
let stranded = 0;
for (let x = EXPANSE_BOUNDS.minX + 10; x < EXPANSE_BOUNDS.maxX; x += 20) {
  for (let z = EXPANSE_BOUNDS.minZ + 10; z < EXPANSE_BOUNDS.maxZ; z += 20) {
    if (x > RIVER.minX && x < RIVER.maxX && z > RIVER.minZ && z < RIVER.maxZ) continue;
    land++;
    let nearest = Infinity;
    for (const segment of segments) {
      const d = distanceToSegment(x, z, segment);
      if (d < nearest) nearest = d;
    }
    if (nearest > 60) stranded++;
  }
}
const strandedPct = (100 * stranded) / land;
check('almost no land is stranded more than 60 m from a road',
  strandedPct <= 2, `${strandedPct.toFixed(1)}% of land`);

// --- determinism ---------------------------------------------------------------

const again = generateExpanseStreets(generateExpanseLayout(), STREETS_SEED);
check('generation is deterministic for a given seed',
  again.stats.nodes === stats.nodes
  && again.stats.edges === stats.edges
  && again.stats.blocks === stats.blocks);

console.log('');
if (inherited.length) {
  console.log(`INHERITED  ${inherited.length} fault(s) in the approved 25-node layout, `
    + 'carried into the network unchanged. Fixing these means editing '
    + 'expanse-layout.js, which is a frozen contract — raise with the user:');
  for (const fault of inherited) console.log(`  · ${fault}`);
  console.log('');
}
console.log(`network: ${stats.nodes} junctions, ${stats.edges} roads, ${stats.blocks} blocks, `
  + `${stats.pavedKm.toFixed(1)} km paved`);
console.log(`by class: ${Object.entries(stats.perClass).map(([k, v]) => `${k} ${v}`).join('  ')}`);
console.log(`junctions cut into the skeleton: ${stats.junctionsCut}; `
  + `side-street T-junctions: ${stats.touches}; pocket rescues: ${stats.rescues}`);
console.log(`pruned: ${JSON.stringify(stats.pruned)}`);

process.exit(failures ? 1 : 0);
