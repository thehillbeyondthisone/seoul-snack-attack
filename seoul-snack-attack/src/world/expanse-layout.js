// Seoul Expanse — driving-first, kilometre-scale world plan.
//
// This module is intentionally only data and math.  The runtime mesh and the
// Node validation both consume it, so the approved greybox cannot drift from
// the in-game road graph.
import * as THREE from 'three';

export const EXPANSE_SEED = 20260903;
// Legacy 25-node greybox retained for regression/prop checks. The live Expanse
// now uses expanse-blueprint.js, where the 0.85 layout scale and 1.25 road-width
// multiplier are applied to the original 74-node authoring contract.
export const EXPANSE_LINEAR_SCALE = 1;
export const EXPANSE_ROAD_WIDTH_MULTIPLIER = 1;

export const scaleExpanseXZ = (value) => value * EXPANSE_LINEAR_SCALE;
const scaleRoadWidth = (value) => value * EXPANSE_ROAD_WIDTH_MULTIPLIER;
const scaleBounds = ({ minX, maxX, minZ, maxZ }) => ({
  minX: scaleExpanseXZ(minX), maxX: scaleExpanseXZ(maxX),
  minZ: scaleExpanseXZ(minZ), maxZ: scaleExpanseXZ(maxZ),
});

const AUTHORED_BOUNDS = Object.freeze({ minX: -500, maxX: 500, minZ: -360, maxZ: 360 });
const AUTHORED_RING_WIDTH = 22;
const AUTHORED_ARTERIAL_WIDTH = 18;
const AUTHORED_STREET_WIDTH = 10;
const AUTHORED_CROSSTOWN_WIDTH = 14;

export const EXPANSE_BOUNDS = Object.freeze(scaleBounds(AUTHORED_BOUNDS));
export const RING_WIDTH = scaleRoadWidth(AUTHORED_RING_WIDTH);
export const ARTERIAL_WIDTH = scaleRoadWidth(AUTHORED_ARTERIAL_WIDTH);
export const STREET_WIDTH = scaleRoadWidth(AUTHORED_STREET_WIDTH);
// A broad central Han-channel section.  The ring runs around either end, so
// the only north/south crossings are the three authored bridges.  The surface
// sits just above the terrain sheet to read clearly in an overhead greybox.
export const RIVER = Object.freeze({
  ...scaleBounds({ minX: -320, maxX: 320, minZ: 125, maxZ: 205 }),
  y: 0.02,
});

// Authored coordinates below remain readable in their original metre grid.
// Only X/Z are layout distances; Y is a physical elevation and stays intact.
const V = (x, y, z) => new THREE.Vector3(scaleExpanseXZ(x), y, scaleExpanseXZ(z));

function arc(cx, cz, radius, from, to, count = 10, y = 0) {
  const points = [];
  for (let i = 0; i <= count; i++) {
    const t = THREE.MathUtils.lerp(from, to, i / count);
    points.push(V(cx + Math.cos(t) * radius, y, cz + Math.sin(t) * radius));
  }
  return points;
}

function path(...parts) {
  const points = [];
  for (const part of parts) {
    for (const point of part) {
      if (!points.length || !points.at(-1).equals(point)) points.push(point);
    }
  }
  return points;
}

function point(x, z, y = 0) { return V(x, y, z); }

const DISTRICTS = [
  { id: 'hills', index: 0, color: 0x526f86, bounds: { minX: -500, maxX: 140, minZ: -360, maxZ: -175 } },
  { id: 'hongdae', index: 1, color: 0x9a566f, bounds: { minX: -500, maxX: -90, minZ: -230, maxZ: 75 } },
  { id: 'station', index: 2, color: 0x5f8c7d, bounds: { minX: -115, maxX: 120, minZ: -220, maxZ: 85 } },
  { id: 'market', index: 3, color: 0xa66e42, bounds: { minX: 70, maxX: 350, minZ: -110, maxZ: 115 } },
  { id: 'hangang', index: 4, color: 0x557a91, bounds: { minX: -500, maxX: 500, minZ: 85, maxZ: 285 } },
  { id: 'pocha', index: 5, color: 0x9c6651, bounds: { minX: 115, maxX: 500, minZ: 25, maxZ: 285 } },
].map(({ bounds, ...district }) => ({ ...district, bounds: scaleBounds(bounds) }));

export function expanseDistrictAt(x, z) {
  const authoredX = x / EXPANSE_LINEAR_SCALE;
  const authoredZ = z / EXPANSE_LINEAR_SCALE;
  // Overlap transition blocks favour the district the driver is entering.
  if (authoredZ <= -175) return DISTRICTS[0];
  if (authoredX < -90 && authoredZ <= 75) return DISTRICTS[1];
  if (authoredX >= 115 && authoredZ >= 25) return DISTRICTS[5];
  if (authoredZ >= 85) return DISTRICTS[4];
  if (authoredX >= 70) return DISTRICTS[3];
  return DISTRICTS[2];
}

function addEdge(edges, nodes, id, a, b, authoredWidth, kind = 'street', points = null, district = null, extra = {}) {
  const pa = nodes.get(a);
  const pb = nodes.get(b);
  const line = (points || [pa, pb]).map((p) => p.clone());
  // A two-point edge's centre is not its final point.  District ownership feeds
  // routing/delivery placement, so derive it from the actual endpoints.
  const mid = line[0].clone().lerp(line.at(-1), 0.5);
  const area = district == null ? expanseDistrictAt(mid.x, mid.z) : DISTRICTS[district];
  edges.push({
    id, a, b, width: scaleRoadWidth(authoredWidth), kind,
    district: area.index,
    districtId: area.id,
    points: line,
    ...extra,
    // Edge radii describe horizontal layout distance, unlike vertical bridge
    // clearance, so they follow the map scale with their arc geometry.
    ...(Number.isFinite(extra.radius) ? { radius: scaleExpanseXZ(extra.radius) } : {}),
  });
}

/**
 * The first approved city stage: road hierarchy, crossings and coarse masses.
 * Every ring corner is a real circular arc.  Its tightest radius is 100 m,
 * deliberately more forgiving than the 80 m contract minimum.
 */
export function generateExpanseLayout() {
  const nodes = new Map([
    ['ring_nw', point(-300, -295)], ['ring_n', point(0, -288)], ['ring_ne', point(300, -280)],
    ['ring_e_n', point(415, -165)], ['ring_e_m', point(415, 15)], ['ring_e_s', point(415, 140)],
    ['ring_se', point(300, 255)], ['ring_s', point(0, 250)], ['ring_sw', point(-330, 245)],
    ['ring_w_s', point(-430, 145)], ['ring_w_m', point(-430, -15)], ['ring_w_n', point(-430, -190)],
    ['spine_h', point(0, -145)], ['station', point(0, -65)], ['spine_c', point(0, 50)],
    ['north_bank', point(0, 90)], ['south_bank', point(0, 250)],
    ['hongdae_mid', point(-210, -145)], ['market_mid', point(190, 15)],
    ['west_bridge_n', point(-245, 90)], ['west_bridge_s', point(-245, 250)],
    ['east_bridge_n', point(235, 90)], ['east_bridge_s', point(235, 250)],
    ['west_cross', point(-210, 50)], ['market_s', point(185, 80)],
  ]);
  const edges = [];

  // Ring: north / east / south / west straights plus four circular corners.
  addEdge(edges, nodes, 'ring_nw_arc', 'ring_w_n', 'ring_nw', AUTHORED_RING_WIDTH, 'ring',
    arc(-300, -190, 130, Math.PI, Math.PI * 1.5), 0, { radius: 130 });
  addEdge(edges, nodes, 'ring_north_w', 'ring_nw', 'ring_n', AUTHORED_RING_WIDTH, 'ring');
  addEdge(edges, nodes, 'ring_north_e', 'ring_n', 'ring_ne', AUTHORED_RING_WIDTH, 'ring');
  addEdge(edges, nodes, 'ring_ne_arc', 'ring_ne', 'ring_e_n', AUTHORED_RING_WIDTH, 'ring',
    arc(300, -165, 115, -Math.PI / 2, 0), 0, { radius: 115, feature: 'tunnel' });
  addEdge(edges, nodes, 'ring_east_n', 'ring_e_n', 'ring_e_m', AUTHORED_RING_WIDTH, 'ring');
  addEdge(edges, nodes, 'ring_east_s', 'ring_e_m', 'ring_e_s', AUTHORED_RING_WIDTH, 'ring');
  addEdge(edges, nodes, 'ring_se_arc', 'ring_e_s', 'ring_se', AUTHORED_RING_WIDTH, 'ring',
    arc(300, 140, 115, 0, Math.PI / 2), 0, { radius: 115 });
  addEdge(edges, nodes, 'ring_south_e', 'ring_se', 'ring_s', AUTHORED_RING_WIDTH, 'ring');
  addEdge(edges, nodes, 'ring_south_w', 'ring_s', 'ring_sw', AUTHORED_RING_WIDTH, 'ring');
  addEdge(edges, nodes, 'ring_sw_arc', 'ring_sw', 'ring_w_s', AUTHORED_RING_WIDTH, 'ring',
    arc(-330, 145, 100, Math.PI / 2, Math.PI), 4, { radius: 100 });
  addEdge(edges, nodes, 'ring_west_s', 'ring_w_s', 'ring_w_m', AUTHORED_RING_WIDTH, 'ring');
  addEdge(edges, nodes, 'ring_west_n', 'ring_w_m', 'ring_w_n', AUTHORED_RING_WIDTH, 'ring');

  // Spine. The bridge profile reaches 3.6 m at its flat apex, with 4.5% ramps.
  addEdge(edges, nodes, 'spine_north', 'ring_n', 'spine_h', AUTHORED_ARTERIAL_WIDTH, 'street');
  addEdge(edges, nodes, 'spine_station', 'spine_h', 'station', AUTHORED_ARTERIAL_WIDTH, 'street');
  addEdge(edges, nodes, 'spine_market', 'station', 'spine_c', AUTHORED_ARTERIAL_WIDTH, 'street');
  addEdge(edges, nodes, 'spine_northbank', 'spine_c', 'north_bank', AUTHORED_ARTERIAL_WIDTH, 'street');
  addEdge(edges, nodes, 'main_bridge', 'north_bank', 'south_bank', AUTHORED_ARTERIAL_WIDTH, 'street', path([
    point(0, 90), point(0, 125, 1.6), point(0, 170, 3.6), point(0, 205, 3.6), point(0, 250),
  ]), 4, { bridge: true, clearance: 3.6 });
  addEdge(edges, nodes, 'spine_south', 'south_bank', 'ring_s', AUTHORED_ARTERIAL_WIDTH, 'street');

  // Three large cross-town cycles plus two intentionally optional local routes.
  addEdge(edges, nodes, 'hongdae_w', 'ring_w_n', 'hongdae_mid', AUTHORED_CROSSTOWN_WIDTH, 'street');
  addEdge(edges, nodes, 'hongdae_e', 'hongdae_mid', 'spine_h', AUTHORED_CROSSTOWN_WIDTH, 'street');
  addEdge(edges, nodes, 'market_w', 'spine_c', 'market_mid', AUTHORED_CROSSTOWN_WIDTH, 'street');
  addEdge(edges, nodes, 'market_e', 'market_mid', 'ring_e_m', AUTHORED_CROSSTOWN_WIDTH, 'street');
  addEdge(edges, nodes, 'cross_w', 'ring_w_m', 'west_cross', AUTHORED_CROSSTOWN_WIDTH, 'street');
  addEdge(edges, nodes, 'cross_c', 'west_cross', 'spine_c', AUTHORED_CROSSTOWN_WIDTH, 'street');
  addEdge(edges, nodes, 'northbank_w', 'ring_w_s', 'west_bridge_n', AUTHORED_STREET_WIDTH, 'street');
  addEdge(edges, nodes, 'northbank_cw', 'west_bridge_n', 'north_bank', AUTHORED_STREET_WIDTH, 'street');
  addEdge(edges, nodes, 'northbank_ce', 'north_bank', 'east_bridge_n', AUTHORED_STREET_WIDTH, 'street');
  addEdge(edges, nodes, 'northbank_e', 'east_bridge_n', 'ring_e_s', AUTHORED_STREET_WIDTH, 'street');
  addEdge(edges, nodes, 'southbank_w', 'west_bridge_s', 'south_bank', AUTHORED_STREET_WIDTH, 'street');
  addEdge(edges, nodes, 'southbank_e', 'south_bank', 'east_bridge_s', AUTHORED_STREET_WIDTH, 'street');
  addEdge(edges, nodes, 'pocha_link', 'east_bridge_s', 'ring_se', AUTHORED_STREET_WIDTH, 'street');
  addEdge(edges, nodes, 'market_s_w', 'spine_c', 'market_s', AUTHORED_STREET_WIDTH, 'street');
  addEdge(edges, nodes, 'market_s_e', 'market_s', 'east_bridge_n', AUTHORED_STREET_WIDTH, 'street');

  for (const [id, x] of [['west', -245], ['east', 235]]) {
    const n = `${id}_bridge_n`;
    const s = `${id}_bridge_s`;
    addEdge(edges, nodes, `${id}_bridge`, n, s, AUTHORED_CROSSTOWN_WIDTH, 'street', path([
      point(x, 90), point(x, 125, 1.6), point(x, 165, 3.6), point(x, 205, 3.6), point(x, 250),
    ]), 4, { bridge: true, clearance: 3.6 });
  }

  const buildingBlocks = [
    [-285, -235, 88, 60, 18, 0], [-150, -235, 100, 65, 27, 0], [105, -225, 105, 55, 20, 0],
    [-325, -85, 105, 72, 18, 1], [-185, -55, 78, 58, 24, 1], [-340, 65, 72, 50, 15, 1],
    [-75, -105, 60, 55, 30, 2], [72, -120, 60, 62, 38, 2], [-70, 10, 70, 45, 21, 2],
    [170, -120, 82, 58, 20, 3], [295, -70, 70, 64, 25, 3], [180, -20, 86, 38, 14, 3],
    [-350, 285, 100, 45, 23, 4], [-125, 300, 98, 50, 34, 4], [120, 292, 92, 48, 29, 4],
    [275, 315, 78, 52, 25, 5], [370, 65, 58, 72, 20, 5], [165, 320, 70, 45, 16, 5],
  ].map(([x, z, sx, sz, h, district], i) => ({
    id: `mass_${i}`,
    x: scaleExpanseXZ(x),
    z: scaleExpanseXZ(z),
    // Footprint and height are object dimensions, not layout distances.
    sx, sz, h, district,
  }));

  return {
    seed: EXPANSE_SEED,
    linearScale: EXPANSE_LINEAR_SCALE,
    roadWidthMultiplier: EXPANSE_ROAD_WIDTH_MULTIPLIER,
    bounds: { ...EXPANSE_BOUNDS },
    // Match the road-network/minimap contract used by the existing worlds.
    // The authored source rectangles above stay concise, while consumers get
    // explicit 2D min/max points rather than scalar minX/minZ fields.
    districts: DISTRICTS.map(({ bounds, ...district }) => ({
      ...district,
      bounds: {
        min: { x: bounds.minX, z: bounds.minZ },
        max: { x: bounds.maxX, z: bounds.maxZ },
      },
    })),
    nodes: [...nodes.entries()].map(([id, position]) => ({ id, position: position.clone() })),
    edges,
    river: { ...RIVER },
    buildingBlocks,
    ring: { width: RING_WIDTH, minRadius: scaleExpanseXZ(100), lengthHint: scaleExpanseXZ(2450) },
    spawn: { position: point(4, -25, 0.8), heading: Math.PI, tile: 0 },
    landmarks: {
      station: point(0, -65), radioTower: point(-140, -265), marketHall: point(190, 15),
      riverPlaza: point(-80, 230), pochaRow: point(235, 220),
    },
  };
}
