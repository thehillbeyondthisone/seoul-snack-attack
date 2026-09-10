// District topology and routing gate. Pure geometry: no browser/WebGL.
//
// Builds the SAME graph src/world/city.js builds — buildDistrictGraph over the
// real TILE_LAYOUT, then createRoadGraph — so a failure here is a failure the
// player would hit. The previous version drove createLadderRoadGraph off
// STREET_ROWS_Z/STREET_CROSS_X, a ladder the game stopped constructing when the
// layout became explicit placements; it passed happily while validating a graph
// that no longer existed.
import fs from 'node:fs';
import * as THREE from 'three';
import { makeTileGrid } from '../../src/world/tiling.js';
import { buildDistrictGraph } from '../../src/world/district-roads.js';
import { createRoadGraph, createDeliveryAnchors, validateRoadGraph } from '../../src/world/road-network.js';
import { minimapArrowRotation } from '../../src/ui/hud3.js';
import {
  TILE_LAYOUT, TILE_COLS, TILE_ROWS, TILE_FLIP_ODD_ROWS, TILE_OVERHANG,
  STREET_WIDTH, DISTRICT_LINKS,
} from '../../src/world/city-constants.js';

const meta = JSON.parse(fs.readFileSync(new URL('./data/city.collider.json', import.meta.url), 'utf8'));
const tileBounds = new THREE.Box3(
  new THREE.Vector3(...meta.tileBox.min),
  new THREE.Vector3(...meta.tileBox.max),
);
const grid = makeTileGrid({
  tileBox: tileBounds,
  cols: TILE_COLS,
  rows: TILE_ROWS,
  placements: TILE_LAYOUT,
  flipOddRows: TILE_FLIP_ODD_ROWS,
  overhang: TILE_OVERHANG,
});

const roadY = meta.roadBox.min[1];
const districtNet = buildDistrictGraph(grid, { roadY, links: DISTRICT_LINKS });
const districtBounds = new THREE.Box3().makeEmpty();
for (const cell of grid.cellBounds) districtBounds.union(cell);
const graph = createRoadGraph({
  nodes: districtNet.nodes,
  edges: districtNet.edges,
  bounds: districtBounds,
  roadWidth: STREET_WIDTH,
});
// The bench has no BVH, so anchors get a flat-ground stand-in. The real ground
// probe is exercised in the browser and by tiling-check's street sweep.
const anchors = createDeliveryAnchors(graph, (x, z) => ({ point: { x, y: roadY, z } }));

let failures = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

const topology = validateRoadGraph(graph);
check('connected graph, no degree-one nodes, no bridges', topology.ok, topology.errors.slice(0, 4).join('; '));

// Structure is derived from the layout, not hard-coded, so this keeps meaning
// when districts are added. Each district contributes a 3-edge U; each link
// contributes two connectors; edge-of-fabric districts add a perimeter loop.
const districts = grid.count;
const streetEdges = graph.edges.filter((e) => e.kind === 'street').length;
const connectorEdges = graph.edges.filter((e) => e.kind === 'connector').length;
const throatEdges = graph.edges.filter((e) => e.kind === 'throat').length;
check(`${districts} districts, ${DISTRICT_LINKS.length} links`,
  streetEdges === districts * 3
  && connectorEdges >= DISTRICT_LINKS.length * 2
  && throatEdges === DISTRICT_LINKS.length * 4,
  `${graph.edges.length} edges over ${graph.nodes.length} nodes `
  + `(street ${streetEdges}, throat ${throatEdges}, connector ${connectorEdges})`);

check('every district carries delivery anchors',
  anchors.length === districts * 3 && anchors.every((a) => graph.edgeById.has(a.edgeId) && Number.isFinite(a.heading)),
  `${anchors.length} anchors across ${districts} districts`);

// Anchors are offset perpendicular to their edge at 32% of road width — far
// enough off centre to read as a kerbside stop, close enough to stay on the
// carriageway of these 5.5 m streets.
check('delivery anchors sit in the curb lane', anchors.every((a) => {
  const offset = Math.hypot(a.point.x - a.roadPoint.x, a.point.z - a.roadPoint.z);
  return offset >= graph.roadWidth * 0.30 && offset < graph.roadWidth * 0.34;
}));

let unreachable = 0;
let invalidDistance = 0;
for (const from of anchors) for (const to of anchors) {
  if (from === to) continue;
  const route = graph.findRoute(from, to);
  if (!route) unreachable++;
  else if (!(route.distance > 0) || route.polyline.length < 2) invalidDistance++;
}
check('every delivery anchor reaches every other anchor', unreachable === 0, `${unreachable} unreachable`);
check('all routes have positive road distance and geometry', invalidDistance === 0, `${invalidDistance} invalid`);

// Projection has to return the NEAREST edge — not necessarily the edge the
// probe was derived from. Those were the same thing while districts were
// separated by open ground, so this used to assert `edgeId === edge.id`. Now
// that the slabs butt, a district's throat edge and its neighbour's connector
// edge run within a few centimetres of each other, and a probe offset 0.6 m off
// one legitimately lands nearer the other. Twenty-three edges "failed" that way
// while every one of them returned a CLOSER edge than the expected one.
//
// So compare against brute-force ground truth instead, which is a stronger
// check than the original: it catches a projection that misses the nearest edge
// even when it happens to return the originating one.
const distanceToEdge = (p, edge) => {
  const a = edge.points[0];
  const ab = edge.points[1].clone().sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
};
let projectionError = 0;
let worstExcess = 0;
for (const edge of graph.edges) {
  const p = edge.points[0].clone().lerp(edge.points[1], 0.37);
  const probe = p.clone().add(new THREE.Vector3(0.6, 0, 0.3));
  const projected = graph.project(probe);
  if (!projected || projected.lateralDistance > 2.3) { projectionError++; continue; }
  const nearest = Math.min(...graph.edges.map((e) => distanceToEdge(probe, e)));
  const excess = distanceToEdge(probe, graph.edgeById.get(projected.edgeId)) - nearest;
  worstExcess = Math.max(worstExcess, excess);
  if (excess > 1e-3) projectionError++;
}
check('nearest-road projection returns the nearest edge', projectionError === 0,
  `${projectionError} mismatches, worst overshoot ${(worstExcess * 100).toFixed(2)} cm`);

// Every district must be reachable from every other, which is what makes the
// delivery generator safe to bind a restaurant to any anchor.
{
  const byDistrict = new Map();
  for (const a of anchors) {
    const d = Number(a.id.slice(1).split('-')[0]);
    if (!byDistrict.has(d)) byDistrict.set(d, a);
  }
  let crossFailures = 0;
  for (const [, from] of byDistrict) for (const [, to] of byDistrict) {
    if (from === to) continue;
    if (!graph.findRoute(from, to)) crossFailures++;
  }
  check('every district reaches every other district', crossFailures === 0,
    `${byDistrict.size} districts, ${crossFailures} failures`);
}

// Regression: the original minimap labels were mirrored. District 0 is
// unrotated, and its U runs nw -> sw -> se: south along the west street, then
// east along the south street. Facing +Z (south) with +Y up, +X lies on the
// driver's LEFT, so that corner is a left turn and the reverse a right turn.
// Asserting only that the two are opposite would still pass under a full
// mirror, which is the exact bug this guards.
{
  const at = (id) => graph.project(graph.byId.get(id).position);
  const outbound = graph.findRoute(at('d0nw'), at('d0se'));
  const inbound = graph.findRoute(at('d0se'), at('d0nw'));
  check('minimap turn handedness is not mirrored',
    outbound?.maneuver?.type === 'left' && inbound?.maneuver?.type === 'right',
    `nw->se ${outbound?.maneuver?.type}, se->nw ${inbound?.maneuver?.type}`);
}
// heading = atan2(fwd.x, fwd.z), so facing game north (world -Z) is heading PI
// and facing south (+Z) is heading 0. On the north-up canvas those must draw as
// rotation 0 (arrow up) and PI (arrow down). These four cases pin the whole
// convention; they previously asserted the south-up mirror of it.
check('minimap vehicle arrow is north-up',
  Math.abs(minimapArrowRotation(Math.PI)) < 1e-9 &&
  Math.abs(minimapArrowRotation(0) - Math.PI) < 1e-9 &&
  Math.abs(minimapArrowRotation(Math.PI / 2) - Math.PI / 2) < 1e-9 &&
  Math.abs(minimapArrowRotation(-Math.PI / 2) + Math.PI / 2) < 1e-9,
  'north (-Z) points up, south (+Z) down, east (+X) right, west (-X) left');
check('minimap axis flips also reflect the vehicle arrow',
  Math.abs(minimapArrowRotation(Math.PI / 2, true, false) + Math.PI / 2) < 1e-9 &&
  Math.abs(minimapArrowRotation(Math.PI, false, true) - Math.PI) < 1e-9,
  'X mirrors east/west and Y mirrors north/south');

console.log(`\nroad graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${anchors.length} delivery anchors`);
if (failures) process.exit(1);
