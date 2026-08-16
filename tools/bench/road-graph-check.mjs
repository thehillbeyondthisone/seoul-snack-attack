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
  TILE_LAYOUT, TILE_OVERHANG, STREET_WIDTH, DISTRICT_LINKS,
} from '../../src/world/city-constants.js';

const meta = JSON.parse(fs.readFileSync(new URL('./data/city.collider.json', import.meta.url), 'utf8'));
const tileBounds = new THREE.Box3(
  new THREE.Vector3(...meta.tileBox.min),
  new THREE.Vector3(...meta.tileBox.max),
);
const grid = makeTileGrid({
  tileBox: tileBounds,
  placements: TILE_LAYOUT,
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
const districts = TILE_LAYOUT.length;
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

let projectionError = 0;
for (const edge of graph.edges) {
  const p = edge.points[0].clone().lerp(edge.points[1], 0.37);
  const projected = graph.project(p.clone().add(new THREE.Vector3(0.6, 0, 0.3)));
  if (!projected || projected.edgeId !== edge.id || projected.lateralDistance > 2.3) projectionError++;
}
check('nearest-road projection recovers every edge', projectionError === 0, `${projectionError} mismatches`);

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
check('minimap vehicle arrow follows steering handedness',
  Math.abs(minimapArrowRotation(Math.PI) - Math.PI) < 1e-9 &&
  Math.abs(minimapArrowRotation(0)) < 1e-9 &&
  minimapArrowRotation(Math.PI / 2) > 0 && minimapArrowRotation(-Math.PI / 2) < 0,
  'world -Z north is up, +Z south is down, vehicle left/right stay correct');
check('minimap axis flips also reflect the vehicle arrow',
  Math.abs(minimapArrowRotation(Math.PI / 2, true, false) + Math.PI * 0.5) < 1e-9 &&
  Math.abs(minimapArrowRotation(0, false, true) - Math.PI) < 1e-9,
  'X reverses left/right and Y reverses north/south');

console.log(`\nroad graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${anchors.length} delivery anchors`);
if (failures) process.exit(1);
