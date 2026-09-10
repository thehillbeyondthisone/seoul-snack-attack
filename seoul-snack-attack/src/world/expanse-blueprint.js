// Adapter for the original, richer Seoul Expanse authoring contract.
//
// The JSON package remains immutable source data. This module converts it into
// the Vector3/edge shape consumed by the runtime while keeping map compression
// independent from carriageway widening and from physical object dimensions.
import * as THREE from 'three';
import WORLD from '../../_source-assets/world/seoul-expanse/build/world.json' with { type: 'json' };
import ROAD_GRAPH from '../../_source-assets/world/seoul-expanse/seoul-expanse-roadgraph.json' with { type: 'json' };
import LANDMARKS from '../../_source-assets/world/seoul-expanse/seoul-expanse-landmarks.json' with { type: 'json' };

export const RICH_EXPANSE_DISTRICT_IDS = Object.freeze([
  'hills', 'hongdae', 'station', 'market', 'hangang', 'pocha',
]);

export const RICH_EXPANSE_DISTRICT_INDEX = Object.freeze(Object.fromEntries(
  RICH_EXPANSE_DISTRICT_IDS.map((id, index) => [id, index]),
));

function assert(condition, message) {
  if (!condition) throw new TypeError(`Rich Expanse blueprint: ${message}`);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validatePosition(position, label) {
  assert(Array.isArray(position) && position.length === 3, `${label} must be an [x,y,z] tuple`);
  assert(position.every(isFiniteNumber), `${label} contains a non-finite coordinate`);
}

function validateMarkerXZ(marker, label) {
  assert(marker && isFiniteNumber(marker.x) && isFiniteNumber(marker.z), `${label} must contain finite x/z`);
  if (marker.y != null) assert(isFiniteNumber(marker.y), `${label}.y must be finite`);
  if (marker.yaw != null) assert(isFiniteNumber(marker.yaw), `${label}.yaw must be finite`);
}

function validateSourceContracts() {
  assert(WORLD?.units === 'metres', 'world units must be metres');
  assert(WORLD?.axis?.north === '-Z', 'world north must be -Z');
  assert(ROAD_GRAPH?.units === 'metres' && ROAD_GRAPH?.north === '-Z', 'road graph axes/units do not match world');
  assert(LANDMARKS?.units === 'metres', 'landmark units must be metres');

  const bounds = WORLD.bounds;
  assert(bounds && [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(isFiniteNumber),
    'world bounds must contain finite minX/maxX/minZ/maxZ');
  assert(bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ, 'world bounds are inverted or empty');

  for (const id of RICH_EXPANSE_DISTRICT_IDS) {
    const district = WORLD.districts?.[id];
    assert(district, `missing district ${id}`);
    assert([district.minX, district.maxX, district.minZ, district.maxZ].every(isFiniteNumber),
      `district ${id} has invalid bounds`);
    assert(district.minX < district.maxX && district.minZ < district.maxZ,
      `district ${id} bounds are inverted or empty`);
  }

  assert(Array.isArray(ROAD_GRAPH.nodes) && ROAD_GRAPH.nodes.length > 0, 'road graph has no nodes');
  assert(Array.isArray(ROAD_GRAPH.edges) && ROAD_GRAPH.edges.length > 0, 'road graph has no edges');
  const nodeIds = new Set();
  for (const node of ROAD_GRAPH.nodes) {
    assert(typeof node.id === 'string' && node.id, 'road node is missing an id');
    assert(!nodeIds.has(node.id), `duplicate road node ${node.id}`);
    nodeIds.add(node.id);
    validatePosition(node.position, `node ${node.id}.position`);
    assert(Object.hasOwn(RICH_EXPANSE_DISTRICT_INDEX, node.district),
      `node ${node.id} references unknown district ${node.district}`);
  }
  const edgeIds = new Set();
  for (const edge of ROAD_GRAPH.edges) {
    assert(typeof edge.id === 'string' && edge.id, 'road edge is missing an id');
    assert(!edgeIds.has(edge.id), `duplicate road edge ${edge.id}`);
    edgeIds.add(edge.id);
    assert(nodeIds.has(edge.a) && nodeIds.has(edge.b), `edge ${edge.id} references a missing endpoint`);
    assert(typeof edge.class === 'string' && edge.class, `edge ${edge.id} is missing its road class`);
    assert(Object.hasOwn(RICH_EXPANSE_DISTRICT_INDEX, edge.district),
      `edge ${edge.id} references unknown district ${edge.district}`);
    assert(isFiniteNumber(edge.width) && edge.width > 0, `edge ${edge.id} has invalid width`);
    assert(Array.isArray(edge.points) && edge.points.length >= 2, `edge ${edge.id} needs at least two points`);
    edge.points.forEach((point, index) => validatePosition(point, `edge ${edge.id}.points[${index}]`));
  }

  const river = WORLD.river;
  assert(Array.isArray(river?.centerline) && river.centerline.length >= 2, 'river needs at least two centerline points');
  river.centerline.forEach((point, index) => validateMarkerXZ(point, `river.centerline[${index}]`));
  assert(isFiniteNumber(river.widthMin) && river.widthMin > 0, 'river.widthMin must be positive');
  assert(isFiniteNumber(river.widthMax) && river.widthMax >= river.widthMin,
    'river.widthMax must be at least river.widthMin');
  assert(isFiniteNumber(river.depth) && river.depth >= 0, 'river.depth must be non-negative');

  validateMarkerXZ(LANDMARKS.spawn_player, 'spawn_player');
  validateMarkerXZ(LANDMARKS.spawn_vehicle, 'spawn_vehicle');
  assert(Array.isArray(LANDMARKS.pickups), 'pickups must be an array');
  assert(Array.isArray(LANDMARKS.drop_offs), 'drop_offs must be an array');
  assert(Array.isArray(LANDMARKS.resets), 'resets must be an array');
  LANDMARKS.pickups.forEach((marker, index) => {
    validateMarkerXZ(marker, `pickups[${index}]`);
    assert(Object.hasOwn(RICH_EXPANSE_DISTRICT_INDEX, marker.district),
      `pickup ${marker.id || index} references unknown district ${marker.district}`);
  });
  LANDMARKS.drop_offs.forEach((marker, index) => {
    validatePosition(marker.position, `drop_offs[${index}].position`);
    assert(Object.hasOwn(RICH_EXPANSE_DISTRICT_INDEX, marker.district),
      `drop-off ${marker.id || index} references unknown district ${marker.district}`);
  });
  LANDMARKS.resets.forEach((marker, index) => validatePosition(marker.position, `resets[${index}].position`));
}

function districtFields(districtId) {
  return {
    district: RICH_EXPANSE_DISTRICT_INDEX[districtId],
    districtId,
  };
}

function vectorFromTuple(position, linearScale) {
  return new THREE.Vector3(position[0] * linearScale, position[1], position[2] * linearScale);
}

function vectorFromXZ(marker, linearScale) {
  return new THREE.Vector3(marker.x * linearScale, marker.y ?? 0, marker.z * linearScale);
}

function runtimeMarker(marker, linearScale, withDistrict = false) {
  const position = vectorFromXZ(marker, linearScale);
  return {
    ...marker,
    x: position.x,
    z: position.z,
    position,
    point: position.clone(),
    heading: marker.yaw ?? 0,
    tile: 0,
    ...(withDistrict ? districtFields(marker.district) : {}),
  };
}

function runtimeTupleMarker(marker, linearScale, withDistrict = false) {
  const position = vectorFromTuple(marker.position, linearScale);
  return {
    ...marker,
    position,
    point: position.clone(),
    heading: marker.yaw ?? 0,
    tile: 0,
    ...(withDistrict ? districtFields(marker.district) : {}),
  };
}

/**
 * Convert the original 74-node/113-edge Seoul authoring package to runtime data.
 * X/Z layout distances and river breadth follow `linearScale`; Y and marker or
 * object dimensions stay in metres. Road widths use only their own multiplier.
 */
export function generateRichExpanseBlueprint({
  linearScale = 0.85,
  roadWidthMultiplier = 1.25,
} = {}) {
  assert(isFiniteNumber(linearScale) && linearScale > 0, 'linearScale must be a positive finite number');
  assert(isFiniteNumber(roadWidthMultiplier) && roadWidthMultiplier > 0,
    'roadWidthMultiplier must be a positive finite number');
  validateSourceContracts();

  const scale = (value) => value * linearScale;
  const bounds = {
    minX: scale(WORLD.bounds.minX), maxX: scale(WORLD.bounds.maxX),
    minZ: scale(WORLD.bounds.minZ), maxZ: scale(WORLD.bounds.maxZ),
  };
  const districts = RICH_EXPANSE_DISTRICT_IDS.map((id, index) => {
    const source = WORLD.districts[id];
    return {
      id,
      index,
      neon: source.neon,
      bounds: {
        min: { x: scale(source.minX), z: scale(source.minZ) },
        max: { x: scale(source.maxX), z: scale(source.maxZ) },
      },
    };
  });

  const nodes = ROAD_GRAPH.nodes.map((node) => ({
    id: node.id,
    position: vectorFromTuple(node.position, linearScale),
    ...districtFields(node.district),
  }));
  const edges = ROAD_GRAPH.edges.map((edge) => ({
    id: edge.id,
    a: edge.a,
    b: edge.b,
    kind: edge.class === 'ring' ? 'ring' : 'street',
    roadClass: edge.class,
    ...districtFields(edge.district),
    width: edge.width * roadWidthMultiplier,
    points: edge.points.map((point) => vectorFromTuple(point, linearScale)),
    oneWay: edge.oneWay === true,
    routeable: edge.routeable !== false,
    bridge: edge.class === 'bridge',
  }));

  const playerSpawn = runtimeMarker(LANDMARKS.spawn_player, linearScale);
  const vehicleSpawn = runtimeMarker(LANDMARKS.spawn_vehicle, linearScale);
  const pickups = LANDMARKS.pickups.map((marker) => runtimeMarker(marker, linearScale, true));
  const dropoffs = LANDMARKS.drop_offs.map((marker) => runtimeTupleMarker(marker, linearScale, true));
  const resets = LANDMARKS.resets.map((marker) => runtimeTupleMarker(marker, linearScale));

  return {
    source: 'seoul-expanse-authoring-contract',
    units: 'metres',
    north: '-Z',
    linearScale,
    roadWidthMultiplier,
    bounds,
    districts,
    nodes,
    edges,
    river: {
      centerline: WORLD.river.centerline.map((point) => vectorFromXZ(point, linearScale)),
      widthMin: scale(WORLD.river.widthMin),
      widthMax: scale(WORLD.river.widthMax),
      depth: WORLD.river.depth,
    },
    // Driving boot uses the vehicle spawn; retain both authored markers for a
    // future on-foot boot path without conflating their positions.
    spawn: vehicleSpawn,
    spawns: { player: playerSpawn, vehicle: vehicleSpawn },
    pickups,
    dropoffs,
    resets,
  };
}
