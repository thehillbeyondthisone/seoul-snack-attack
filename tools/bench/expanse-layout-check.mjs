// Seoul Expanse greybox gate. Pure Node: exact same topology as ?world=expanse.
import * as THREE from 'three';
import { generateExpanseLayout, EXPANSE_BOUNDS, RING_WIDTH } from '../../src/world/expanse-layout.js';
import { generateExpanseStreetLife } from '../../src/world/expanse-street-life.js';
import { generateExpanseShops } from '../../src/world/expanse-shops.js';
import { createRoadGraph, createDeliveryAnchors, validateRoadGraph } from '../../src/world/road-network.js';
import { RESTAURANTS } from '../../src/game/data/restaurants.js';
import {
  generateExpanseChunkGrid, buildExpanseVisualChunks, updateExpanseVisualChunks, chunkAt,
} from '../../src/world/expanse-chunks.js';
import { generateExpanseRoadArt, EXPANSE_BRIDGE_STYLES } from '../../src/world/expanse-road-art.js';
import {
  EXPANSE_STREET_NAMES, EXPANSE_DISTRICT_NAMES, describeStreet,
} from '../../src/world/expanse-street-names.js';

let failures = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

function segmentIntersectsRect(a, b, rect) {
  let enter = 0;
  let exit = 1;
  for (const [p, q] of [
    [-(b.x - a.x), a.x - rect.minX], [b.x - a.x, rect.maxX - a.x],
    [-(b.z - a.z), a.z - rect.minZ], [b.z - a.z, rect.maxZ - a.z],
  ]) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) { if (t > exit) return false; enter = Math.max(enter, t); }
    else { if (t < enter) return false; exit = Math.min(exit, t); }
  }
  return true;
}

function distanceToEdge(point, edge) {
  let best = Infinity;
  for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1];
    const b = edge.points[i];
    const ab = b.clone().sub(a);
    const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9), 0, 1);
    best = Math.min(best, a.clone().addScaledVector(ab, t).distanceTo(point));
  }
  return best;
}

const layout = generateExpanseLayout();
const streetLife = generateExpanseStreetLife(layout);
const shops = generateExpanseShops(layout);
const chunkGrid = generateExpanseChunkGrid(layout.bounds, 4, 3);
const roadArt = generateExpanseRoadArt(layout);
const runtimeChunkGrid = buildExpanseVisualChunks(new THREE.Group(), layout.bounds, 4, 3);
const desktopChunks = updateExpanseVisualChunks(runtimeChunkGrid, layout.spawn.position, {
  cullDistance: 720, detailDistance: 260, microDistance: 146,
});
const mobileChunks = updateExpanseVisualChunks(runtimeChunkGrid, layout.spawn.position, {
  cullDistance: 280, detailDistance: 160, microDistance: 70,
});
const bounds = new THREE.Box3(
  new THREE.Vector3(EXPANSE_BOUNDS.minX, -6, EXPANSE_BOUNDS.minZ),
  new THREE.Vector3(EXPANSE_BOUNDS.maxX, 60, EXPANSE_BOUNDS.maxZ),
);
const graph = createRoadGraph({ nodes: layout.nodes, edges: layout.edges, bounds, roadWidth: 10 });
const topology = validateRoadGraph(graph);
const anchors = createDeliveryAnchors(graph, (x, z) => {
  const y = graph.project(new THREE.Vector3(x, 0, z))?.position.y || 0;
  return { point: new THREE.Vector3(x, y, z) };
});

check('world is 1,000 × 720 metres',
  EXPANSE_BOUNDS.maxX - EXPANSE_BOUNDS.minX === 1000
  && EXPANSE_BOUNDS.maxZ - EXPANSE_BOUNDS.minZ === 720);
check('six frozen districts exist', layout.districts.map((d) => d.id).join(',') === 'hills,hongdae,station,market,hangang,pocha');
check('high-speed ring is 22 m wide', layout.ring.width === RING_WIDTH && RING_WIDTH >= 18);
const radii = layout.edges.filter((e) => e.kind === 'ring' && e.radius).map((e) => e.radius);
check('every ring corner radius is at least 80 m', Math.min(...radii) >= 80, `min ${Math.min(...radii)} m`);
check('ring is a continuous closed cycle',
  graph.edges.filter((e) => e.kind === 'ring').length >= 12
  && graph.nodes.filter((n) => n.id.startsWith('ring_')).every((n) => (graph.adjacency.get(n.id) || []).length >= 2));
check('route graph is connected without dead ends or bridge dependencies', topology.ok, topology.errors.slice(0, 4).join('; '));
check('three routeable river crossings are present', layout.edges.filter((e) => e.bridge).length === 3);
check('all road edges receive authoritative lane and curb art',
  roadArt.edgeIds.length === layout.edges.length
  && new Set(roadArt.edgeIds).size === layout.edges.length
  && roadArt.curbs.length >= layout.edges.length * 2,
  `${roadArt.edgeIds.length} edges, ${roadArt.curbs.length} curb segments`);
check('the three bridges have distinct approved silhouettes',
  EXPANSE_BRIDGE_STYLES.join(',') === 'main-cable-stayed,west-steel-arch,east-riverside-truss');
check('road hierarchy generates lanes, stops, crossings and drainage',
  roadArt.laneDashes.length > 100 && roadArt.stopLines.length >= 12
  && roadArt.crosswalks.length >= 30 && roadArt.drains.length >= 100,
  `${roadArt.laneDashes.length} dashes, ${roadArt.stopLines.length} stops, ${roadArt.crosswalks.length} crossing bars, ${roadArt.drains.length} drains`);
check('each district has delivery stops', new Set(anchors.map((a) => a.edgeId && graph.edgeById.get(a.edgeId)?.district)).size === 6, `${anchors.length} stops`);
check('spawn sits on the central boulevard', Math.abs(layout.spawn.position.x) < 8 && layout.spawn.position.z < 0);
check('all road nodes remain inside playable bounds', layout.nodes.every((n) => bounds.containsPoint(n.position)));
const roadIntrusions = [];
for (const block of layout.buildingBlocks) for (const edge of layout.edges) {
  const padding = edge.width * 0.5 + 3;
  const rect = {
    minX: block.x - block.sx * 0.5 - padding,
    maxX: block.x + block.sx * 0.5 + padding,
    minZ: block.z - block.sz * 0.5 - padding,
    maxZ: block.z + block.sz * 0.5 + padding,
  };
  if (edge.points.some((point, i) => i && segmentIntersectsRect(edge.points[i - 1], point, rect))) {
    roadIntrusions.push(`${block.id}:${edge.id}`);
  }
}
check('building masses preserve road and sidewalk clearance', roadIntrusions.length === 0, roadIntrusions.join(', '));
const secondaryIntrusions = [];
for (const block of streetLife.buildings) for (const edge of layout.edges) {
  const padding = edge.width * 0.5 + 4;
  const rect = {
    minX: block.x - block.sx * 0.5 - padding,
    maxX: block.x + block.sx * 0.5 + padding,
    minZ: block.z - block.sz * 0.5 - padding,
    maxZ: block.z + block.sz * 0.5 + padding,
  };
  if (edge.points.some((point, i) => i && segmentIntersectsRect(edge.points[i - 1], point, rect))) {
    secondaryIntrusions.push(`${block.id}:${edge.id}`);
  }
}
check('secondary density preserves every driving envelope', secondaryIntrusions.length === 0, secondaryIntrusions.slice(0, 4).join(', '));
check('street-life pass supplies substantial density', streetLife.buildings.length >= 80,
  `${streetLife.buildings.length} secondary buildings`);
check('secondary buildings cover all six districts',
  new Set(streetLife.buildings.map((building) => building.district)).size === 6);
check('street-life pass provides all district bus stops', streetLife.busStops.length === 6);
check('visual chunk grid is a stable 4 × 3 partition', chunkGrid.chunks.length === 12
  && chunkGrid.width === 250 && chunkGrid.depth === 240);
check('chunk LOD tiers reduce monotonically', desktopChunks.micro <= desktopChunks.detailed
  && desktopChunks.detailed <= desktopChunks.visible
  && mobileChunks.micro <= mobileChunks.detailed
  && mobileChunks.detailed <= mobileChunks.visible);
check('mobile chunk budget is stricter than desktop at the same pose',
  mobileChunks.visible < desktopChunks.visible && mobileChunks.detailed <= desktopChunks.detailed,
  `desktop ${desktopChunks.visible}/${desktopChunks.detailed}/${desktopChunks.micro}, mobile ${mobileChunks.visible}/${mobileChunks.detailed}/${mobileChunks.micro}`);
check('every density record belongs to exactly one visual chunk', [
  ...streetLife.buildings, ...streetLife.cars, ...streetLife.trees,
  ...streetLife.busStops, ...streetLife.markings,
].every((record) => !!chunkAt(chunkGrid, record.x, record.z)));
const streetObstacleIntrusions = [];
for (const obstacle of [
  ...streetLife.cars.map((car, i) => ({ id: `car_${i}`, x: car.x, z: car.z, radius: 2.5 })),
  ...streetLife.busStops.map((stop) => ({ id: `bus_${stop.id}`, x: stop.x, z: stop.z, radius: 3 })),
]) for (const edge of layout.edges) {
  const padding = edge.width * 0.5 + obstacle.radius + 1;
  const rect = {
    minX: obstacle.x - padding, maxX: obstacle.x + padding,
    minZ: obstacle.z - padding, maxZ: obstacle.z + padding,
  };
  if (edge.points.some((point, i) => i && segmentIntersectsRect(edge.points[i - 1], point, rect))) {
    streetObstacleIntrusions.push(`${obstacle.id}:${edge.id}`);
  }
}
check('parked cars and bus shelters remain outside carriageways', streetObstacleIntrusions.length === 0,
  streetObstacleIntrusions.slice(0, 6).join(', '));

const restaurantIds = RESTAURANTS.map((restaurant) => restaurant.id).sort();
check('all eight restaurants have one fixed Expanse storefront',
  shops.length === restaurantIds.length
  && shops.map((shop) => shop.id).sort().join(',') === restaurantIds.join(','),
  shops.map((shop) => shop.id).join(', '));
check('every storefront is bound to its roster district', shops.every((shop) => {
  const restaurant = RESTAURANTS.find((candidate) => candidate.id === shop.id);
  return restaurant?.district === shop.districtId;
}), shops.map((shop) => `${shop.id}:${shop.districtId}`).join(', '));
check('every pickup marker stays inside its bound carriageway', shops.every((shop) => {
  const edge = graph.edgeById.get(shop.edgeId);
  return edge && distanceToEdge(shop.point, edge) <= edge.width * 0.5 - 1;
}));
check('no fixed shop auto-picks up from the default spawn', shops.every((shop) =>
  shop.point.distanceTo(layout.spawn.position) > 12
));
check('every visible storefront sits beyond its bound curb', shops.every((shop) => {
  const edge = graph.edgeById.get(shop.edgeId);
  return edge && distanceToEdge(shop.facadePoint, edge) >= edge.width * 0.5 + 2;
}));
const routeMatrix = shops.flatMap((shop) => anchors.map((anchor) => ({
  shop: shop.id,
  anchor: anchor.id,
  route: graph.findRoute(shop, anchor),
})));
const missingRoutes = routeMatrix.filter((entry) => !entry.route);
const routeDistances = routeMatrix.map((entry) => entry.route?.distance || 0);
check('every shop can route to every delivery stop', missingRoutes.length === 0,
  `${routeMatrix.length - missingRoutes.length}/${routeMatrix.length} routes`);
check('shop delivery routes exercise the full-scale network', Math.max(...routeDistances) >= 700,
  `${Math.round(Math.min(...routeDistances))}-${Math.round(Math.max(...routeDistances))} m`);

// ---- Mini-map street blade -------------------------------------------------
// A generated road with no name prints a routing id at the player, so name
// coverage is a gate, not a nicety.
const unnamedEdges = layout.edges.filter((edge) => !EXPANSE_STREET_NAMES[edge.id]);
check('every layout edge carries a street name', unnamedEdges.length === 0,
  unnamedEdges.map((edge) => edge.id).join(', ') || `${layout.edges.length} named`);
const strayNames = Object.keys(EXPANSE_STREET_NAMES).filter((id) => !graph.edgeById.has(id));
check('no street name points at a removed edge', strayNames.length === 0, strayNames.join(', '));
check('every district can name itself for off-road driving', layout.districts.every(
  (district) => EXPANSE_DISTRICT_NAMES[district.id]
));
check('street names carry both a Korean and a roman form', Object.values(EXPANSE_STREET_NAMES)
  .every((name) => name.ko?.trim() && name.en?.trim()));
// On a road the blade names the road; well off it, the district. Both paths
// must resolve, or the HUD silently blanks.
const stationNode = layout.nodes.find((node) => node.id === 'station').position;
const bladeOn = describeStreet(graph, graph.project(stationNode));
check('driving the spine names the street',
  bladeOn?.onStreet === true && bladeOn.en === 'SEOUL STATION-DAERO',
  bladeOn ? `${bladeOn.ko} / ${bladeOn.en}` : 'no blade');
const bladeOff = describeStreet(graph, graph.project(stationNode.clone().setX(60)));
check('leaving the carriageway names the district', bladeOff?.onStreet === false,
  bladeOff ? `${bladeOff.ko} / ${bladeOff.en}` : 'no blade');
check('an unknown world hides the blade instead of printing an id',
  describeStreet(graph, { edgeId: 'proc_city_edge_0', lateralDistance: 0 }) === null);

console.log(`\nexpanse layout: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${anchors.length} stops, ${shops.length} shops, ${streetLife.buildings.length} secondary buildings`);
if (failures) process.exit(1);
