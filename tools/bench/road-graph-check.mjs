// Closed-district topology and routing gate. Pure geometry: no browser/WebGL.
import fs from 'node:fs';
import * as THREE from 'three';
import { makeTileGrid } from '../../src/world/tiling.js';
import { createLadderRoadGraph, createDeliveryAnchors, validateRoadGraph } from '../../src/world/road-network.js';
import { minimapArrowRotation } from '../../src/ui/hud3.js';
import {
  TILE_COLS, TILE_ROWS, TILE_FLIP_ODD_ROWS, TILE_OVERHANG,
  STREET_ROWS_Z, STREET_CROSS_X, STREET_WIDTH, STREET_GATES,
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
  flipOddRows: TILE_FLIP_ODD_ROWS,
  overhang: TILE_OVERHANG,
});
// Mirror src/world/city.js exactly: the block carries several streets, so both
// lists are the product of the authored centrelines and the tile grid.
const roadY = meta.roadBox.min[1];
const rows = [];
for (let row = 0; row < grid.rows; row++) {
  for (const z of STREET_ROWS_Z) {
    rows.push(grid.localToWorld(row * grid.cols, new THREE.Vector3(0, roadY, z), new THREE.Vector3()).z);
  }
}
const crosses = [];
for (let col = 0; col < grid.cols; col++) {
  for (const x of STREET_CROSS_X) {
    crosses.push(grid.localToWorld(col, new THREE.Vector3(x, roadY, 0), new THREE.Vector3()).x);
  }
}
const graph = createLadderRoadGraph({
  coreBounds: grid.worldBounds,
  rowCenters: rows,
  crossCenters: crosses,
  roadY,
  roadWidth: STREET_WIDTH,
  gates: STREET_GATES,
});
const anchors = createDeliveryAnchors(graph);
let failures = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

const topology = validateRoadGraph(graph);
check('connected graph, no degree-one nodes, no bridges', topology.ok, topology.errors.join('; '));
// Expected counts are derived, not literal, so the gate keeps meaning when the
// street layout changes. Rows span cross-to-cross without gates, and gain one
// segment at each end with them.
const nRows = rows.length;
const nCross = crosses.length;
const segmentsPerRow = STREET_GATES ? nCross + 1 : nCross - 1;
check(`${nRows} streets, ${nCross} cross streets, gates ${STREET_GATES ? 'on' : 'off'}`,
  graph.rows.length === nRows && graph.crosses.length === nCross &&
  graph.edges.filter((e) => e.kind === 'street').length === nRows * segmentsPerRow &&
  graph.edges.filter((e) => e.kind === 'cross').length === nCross * (nRows - 1) &&
  graph.edges.filter((e) => e.kind === 'connector').length === (STREET_GATES ? 2 * (nRows - 1) : 0),
  `${graph.edges.length} edges over ${graph.nodes.length} nodes`);
check('all delivery anchors carry a road edge and curb heading',
  anchors.length === nRows * 5 && anchors.every((a) => graph.edgeById.has(a.edgeId) && Number.isFinite(a.heading)),
  `${anchors.length} anchors`);
check('delivery anchors sit in the curb lane', anchors.every((a) =>
  Math.abs(a.point.z - a.roadPoint.z) >= graph.roadWidth * 0.44 &&
  Math.abs(a.point.z - a.roadPoint.z) < graph.roadWidth * 0.5));

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
  const projected = graph.project(p.clone().add(new THREE.Vector3(2, 0, 1)));
  if (!projected || projected.edgeId !== edge.id || projected.lateralDistance > 2.3) projectionError++;
}
check('nearest-road projection recovers every edge', projectionError === 0, `${projectionError} mismatches`);

// Every street-to-street journey must use a loop connector without reversing.
let rowFailures = 0;
const streets = graph.rows;
for (let a = 0; a < streets.length; a++) for (let b = 0; b < streets.length; b++) {
  if (a === b) continue;
  const from = streets[a].points[0].clone().lerp(streets[a].points[streets[a].points.length - 1], 0.5);
  const to = streets[b].points[0].clone().lerp(streets[b].points[streets[b].points.length - 1], 0.5);
  const route = graph.findRoute(
    graph.project(from),
    graph.project(to),
  );
  if (!route || !route.edgeIds.some((id) => id.startsWith('cross') || id.startsWith('west') || id.startsWith('east'))) rowFailures++;
}
check('every street reaches every other through a connector', rowFailures === 0, `${rowFailures} failures`);

// Regression: the original minimap labels were mirrored. These two routes take
// the same junction in opposite directions and must report opposite sides.
//
// Both leave a street midpoint heading -X to reach the junction. Facing -X with
// +Y up, +Z is on the driver's LEFT and -Z on their RIGHT, so the route that
// turns toward greater Z must say 'left' and its reverse 'right'. Asserting only
// that the two are opposite would still pass under a full mirror, which is the
// exact bug this guards.
const rowMidpoint = (row) => row.points[0].clone().lerp(row.points[row.points.length - 1], 0.5);
const [loZ, hiZ] = [graph.rows[0], graph.rows[graph.rows.length - 1]];
const towardPositiveZ = graph.findRoute(
  graph.project(rowMidpoint(loZ)),
  graph.project(rowMidpoint(hiZ)),
);
const towardNegativeZ = graph.findRoute(
  graph.project(rowMidpoint(hiZ)),
  graph.project(rowMidpoint(loZ)),
);
check('minimap turn handedness is not mirrored',
  towardPositiveZ?.maneuver?.type === 'left' && towardNegativeZ?.maneuver?.type === 'right',
  `positive-Z route ${towardPositiveZ?.maneuver?.type}, negative-Z route ${towardNegativeZ?.maneuver?.type}`);
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
