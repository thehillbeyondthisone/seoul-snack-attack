// Procedural city topology + colour-bible gate. Pure Node, no WebGL.
import * as THREE from 'three';
import { generateLayout, PROC_SEED, WATER_Z0, WATER_Z1 } from '../../src/world/proc/layout.js';
import { createRoadGraph, createDeliveryAnchors, validateRoadGraph } from '../../src/world/road-network.js';
import {
  DISTRICTS, HUD, LANDMARK_SHOPS, districtAt,
} from '../../src/world/data/color-bible.js';
import { STREET_SHOPS } from '../../src/world/data/shop-names.js';
import { RESTAURANTS } from '../../src/game/data/restaurants.js';

let failures = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

const layout = generateLayout(PROC_SEED);
const bounds = new THREE.Box3(
  new THREE.Vector3(layout.playable.minX, 0, layout.playable.minZ),
  new THREE.Vector3(layout.playable.maxX, 8, layout.playable.maxZ),
);
const graph = createRoadGraph({
  nodes: layout.nodes,
  edges: layout.edges,
  bounds,
  roadWidth: 8,
});
graph.districts = layout.districts;
const topology = validateRoadGraph(graph);
const anchors = createDeliveryAnchors(graph, (x, z) => ({ point: { x, y: 0, z } }));

check('connected graph, no degree-one nodes, no bridges', topology.ok, topology.errors.slice(0, 4).join('; '));
check('roundabout ring has four nodes',
  ['rN', 'rE', 'rS', 'rW'].every((id) => graph.byId.has(id)));
check('plaza is a four-spoke shortcut',
  (graph.adjacency.get('plaza') || []).length === 4);
const bridges = layout.edges.filter((e) => e.bridge);
check('three canal bridges', bridges.length === 3, `${bridges.length} bridges`);
check('canal sits between the bank streets', WATER_Z1 - WATER_Z0 >= 12);

const degrees = graph.nodes.map((n) => (graph.adjacency.get(n.id) || []).length);
check('every node has at least two exits', degrees.every((d) => d >= 2), `min ${Math.min(...degrees)}`);

check('six colour-bible districts on the graph',
  layout.districts.length === 6 && layout.districts.every((d) => d.color && d.bounds));

const widths = [...new Set(layout.edges.map((e) => e.width))].sort((a, b) => a - b);
check('street hierarchy (alley / street / arterial)',
  widths[0] <= 5.6 && widths.at(-1) >= 12,
  widths.join(', '));

const districtCounts = new Map(DISTRICTS.map((d) => [d.index, 0]));
for (const edge of graph.edges) {
  if (edge.district != null) districtCounts.set(edge.district, (districtCounts.get(edge.district) || 0) + 1);
}
check('every district owns road edges',
  [...districtCounts.values()].every((n) => n > 0),
  [...districtCounts.entries()].map(([i, n]) => `${i}:${n}`).join(' '));

check('delivery anchors exist in every district',
  DISTRICTS.every((d) => anchors.some((a) => graph.edgeById.get(a.edgeId)?.district === d.index)),
  `${anchors.length} anchors`);

check('spawn faces the roundabout on the boulevard',
  Math.abs(layout.spawn.position.x) < 8
  && layout.spawn.heading === Math.PI
  && layout.spawn.position.z > layout.roundabout.z);

const accents = new Set([HUD.money, HUD.nav, HUD.alarm]);
check('HUD keeps exactly three system accents', accents.size === 3);
check('Hongdae neon includes the alarm pink', DISTRICTS.find((d) => d.id === 'hongdae').neon.includes(HUD.alarm));
check('Hangang neon includes the nav cyan', DISTRICTS.find((d) => d.id === 'hangang').neon.includes(HUD.nav));
check('Market neon includes the money gold', DISTRICTS.find((d) => d.id === 'market').neon.includes(HUD.money));

const restaurantIds = new Set(RESTAURANTS.map((r) => r.id));
check('landmark shops bind to menu restaurants',
  LANDMARK_SHOPS.every((s) => restaurantIds.has(s.id)) && LANDMARK_SHOPS.length === RESTAURANTS.length);

const hangul = /[\uAC00-\uD7A3]/;
check('street shop names are Hangul',
  STREET_SHOPS.length >= 20 && STREET_SHOPS.every((n) => hangul.test(n)),
  `${STREET_SHOPS.length} names`);
check('landmark signs are Hangul',
  LANDMARK_SHOPS.every((s) => hangul.test(RESTAURANTS.find((r) => r.id === s.id)?.nameKo || '')));

check('districtAt agrees with bible partitions',
  districtAt(-80, 0).id === 'hongdae'
  && districtAt(80, 0).id === 'market'
  && districtAt(0, -90).id === 'hills'
  && districtAt(-40, 60).id === 'hangang'
  && districtAt(40, 60).id === 'pocha'
  && districtAt(0, 0).id === 'station');

const lots = layout.blocks.filter((b) => b.kind === 'lot').length;
const water = layout.blocks.filter((b) => b.kind === 'water').length;
check('city is mostly lots with a canal row of water',
  lots >= 24 && water >= 6,
  `${lots} lots, ${water} water, ${layout.blocks.length} blocks`);

if (failures) {
  console.error(`\n${failures} proc-city checks failed`);
  process.exit(1);
}
console.log(`\nproc city: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${anchors.length} anchors, seed ${PROC_SEED}`);
