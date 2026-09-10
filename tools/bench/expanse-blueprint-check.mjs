// Narrow gate for the richer authored Seoul Expanse JSON adapter.
// This is the live rich-runtime contract and also runs inside `expanse-check`.
import * as THREE from 'three';
import {
  generateRichExpanseBlueprint,
  RICH_EXPANSE_DISTRICT_IDS,
  RICH_EXPANSE_DISTRICT_INDEX,
} from '../../src/world/expanse-blueprint.js';
import { createRoadGraph, validateRoadGraph } from '../../src/world/road-network.js';

let failures = 0;
function check(label, pass, detail = '') {
  const ok = !!pass;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const close = (a, b, epsilon = 1e-9) => Math.abs(a - b) <= epsilon;
const scaledVector = (actual, authored, scale) => (
  actual instanceof THREE.Vector3
  && close(actual.x, authored.x * scale)
  && close(actual.y, authored.y)
  && close(actual.z, authored.z * scale)
);

const blueprint = generateRichExpanseBlueprint();
const authored = generateRichExpanseBlueprint({ linearScale: 1, roadWidthMultiplier: 1 });

check('rich graph has the authored 74 nodes and 113 edges',
  blueprint.nodes.length === 74 && blueprint.edges.length === 113,
  `${blueprint.nodes.length}/${blueprint.edges.length}`);
check('default map bounds are 850 × 612 metres',
  close(blueprint.bounds.maxX - blueprint.bounds.minX, 850)
  && close(blueprint.bounds.maxZ - blueprint.bounds.minZ, 612),
  `${blueprint.bounds.maxX - blueprint.bounds.minX} × ${blueprint.bounds.maxZ - blueprint.bounds.minZ}`);

check('every X/Z graph coordinate uses 0.85 scale while Y is preserved',
  blueprint.nodes.every((node, index) => scaledVector(node.position, authored.nodes[index].position, 0.85))
  && blueprint.edges.every((edge, edgeIndex) => edge.points.every((point, pointIndex) =>
    scaledVector(point, authored.edges[edgeIndex].points[pointIndex], 0.85))));
check('every carriageway width uses only the 1.25 multiplier',
  blueprint.edges.every((edge, index) => close(edge.width, authored.edges[index].width * 1.25)),
  `ring ${blueprint.edges.find((edge) => edge.roadClass === 'ring')?.width} m`);
check('runtime edge kinds preserve the richer source road classes',
  blueprint.edges.every((edge) => edge.kind === (edge.roadClass === 'ring' ? 'ring' : 'street'))
  && blueprint.edges.filter((edge) => edge.bridge).length === 3
  && blueprint.edges.every((edge) => edge.bridge === (edge.roadClass === 'bridge')));

check('six frozen district ids map to stable numeric indices',
  blueprint.districts.map((district) => district.id).join(',') === RICH_EXPANSE_DISTRICT_IDS.join(',')
  && blueprint.districts.every((district, index) => district.index === index
    && RICH_EXPANSE_DISTRICT_INDEX[district.id] === index)
  && blueprint.nodes.every((node) => node.district === RICH_EXPANSE_DISTRICT_INDEX[node.districtId])
  && blueprint.edges.every((edge) => edge.district === RICH_EXPANSE_DISTRICT_INDEX[edge.districtId]));
check('district X/Z bounds use the same 0.85 scale', blueprint.districts.every((district, index) => {
  const source = authored.districts[index].bounds;
  return close(district.bounds.min.x, source.min.x * 0.85)
    && close(district.bounds.max.x, source.max.x * 0.85)
    && close(district.bounds.min.z, source.min.z * 0.85)
    && close(district.bounds.max.z, source.max.z * 0.85);
}));

const markerPairs = [
  [blueprint.spawns.player, authored.spawns.player],
  [blueprint.spawns.vehicle, authored.spawns.vehicle],
  ...blueprint.pickups.map((marker, index) => [marker, authored.pickups[index]]),
  ...blueprint.dropoffs.map((marker, index) => [marker, authored.dropoffs[index]]),
  ...blueprint.resets.map((marker, index) => [marker, authored.resets[index]]),
];
check('all authored markers are present', blueprint.pickups.length === 8
  && blueprint.dropoffs.length === 24 && blueprint.resets.length === 21,
`${blueprint.pickups.length}/${blueprint.dropoffs.length}/${blueprint.resets.length}`);
check('marker X/Z scales while marker Y and headings stay physical', markerPairs.every(([actual, source]) =>
  scaledVector(actual.position, source.position, 0.85)
  && close(actual.heading, source.heading)));
check('pickup/drop-off district ids use the frozen numeric mapping',
  [...blueprint.pickups, ...blueprint.dropoffs].every((marker) =>
    marker.district === RICH_EXPANSE_DISTRICT_INDEX[marker.districtId]));
check('river centerline/breadth scales while physical depth is preserved',
  blueprint.river.centerline.every((point, index) =>
    scaledVector(point, authored.river.centerline[index], 0.85))
  && close(blueprint.river.widthMin, authored.river.widthMin * 0.85)
  && close(blueprint.river.widthMax, authored.river.widthMax * 0.85)
  && close(blueprint.river.depth, authored.river.depth));

const bounds = new THREE.Box3(
  new THREE.Vector3(blueprint.bounds.minX, -10, blueprint.bounds.minZ),
  new THREE.Vector3(blueprint.bounds.maxX, 100, blueprint.bounds.maxZ),
);
const graph = createRoadGraph({
  nodes: blueprint.nodes,
  edges: blueprint.edges,
  bounds,
  roadWidth: 10 * blueprint.roadWidthMultiplier,
});
const topology = validateRoadGraph(graph);
check('adapted graph remains fully connected with no bridge dependencies', topology.ok,
  topology.errors.slice(0, 4).join('; '));

const markerPositions = [
  blueprint.spawn.position,
  ...blueprint.pickups.map((marker) => marker.position),
  ...blueprint.dropoffs.map((marker) => marker.position),
  ...blueprint.resets.map((marker) => marker.position),
];
check('spawn, pickup, drop-off and reset markers remain inside scaled bounds',
  markerPositions.every((position) => position.x >= blueprint.bounds.minX
    && position.x <= blueprint.bounds.maxX
    && position.z >= blueprint.bounds.minZ
    && position.z <= blueprint.bounds.maxZ));

const routeMatrix = blueprint.pickups.flatMap((pickup) => blueprint.dropoffs.map((dropoff) =>
  graph.findRoute(pickup.position, dropoff.position)));
check('every authored pickup routes to every authored drop-off',
  routeMatrix.length === 8 * 24 && routeMatrix.every((route) => route?.distance > 0),
  `${routeMatrix.filter(Boolean).length}/${routeMatrix.length} routes`);

console.log(`\nrich blueprint: ${blueprint.nodes.length} nodes, ${blueprint.edges.length} edges, `
  + `${blueprint.pickups.length}/${blueprint.dropoffs.length}/${blueprint.resets.length} pickup/drop/reset markers`);
if (failures) process.exit(1);
