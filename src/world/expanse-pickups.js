// Seoul Expanse rebuild — the eight menu restaurants, bound to real buildings.
//
// M5 of the rebuild. M4 gave 1,052 of M2's plots a shopfront, a fascia board
// and a lit interior, but every one of them is anonymous: the order loop had
// nothing to pick up from, so `?world=expanse2` shipped `pickupSites: []` and
// the game fell back to binding restaurants to delivery anchors — a road point
// with no building behind it.
//
// This module is the binding. It picks one generated shop plot per menu
// restaurant and turns it into a pickup site: a named storefront, a lit sign
// over its own frontage, and a marker on the carriageway outside its door.
//
// Three rules, each of which is asserted by `expanse-route-check`:
//
//   1. **A pickup is a building, not a coordinate.** Every site names the
//      `bld_*` it was bound to and takes its frontage, facing and district
//      from that building's own record. Nothing here invents a transform.
//   2. **The marker stands on the carriageway the shop fronts.** The van has
//      to be able to stop on it, so it sits off the centreline of that road by
//      the same share of its width the shipped Expanse shops use, rather than
//      on the pavement where the vehicle cannot reach it.
//   3. **The ring is not a high street.** The belt road is the least permeable
//      road on the map and nothing may stop on it, so plots fronting it are
//      never candidates.
//
// The selection is pure scoring, with no RNG: the same city always binds the
// same eight buildings, which is what lets the Node gate measure the routes
// the runtime will actually offer.
import * as THREE from 'three';
import { RESTAURANTS } from '../game/data/restaurants.js';
import { LANDMARK_SHOPS, cssHex } from './data/color-bible.js';

/** Frontage below this is a doorway; a landmark restaurant needs a shop wall. */
const MIN_FRONTAGE = 5.5;

/** Two pickups closer than this read as one destination on the mini-map. */
const MIN_SEPARATION = 110;

/**
 * How much a plot's own street is worth to a delivery driver. Alleys are where
 * the food is and where the van cannot turn around, so they score but do not
 * win; the ring is excluded outright.
 */
const CLASS_SCORE = Object.freeze({
  arterial: 12, street: 9, connector: 6, alley: 2,
});

/** Carriageways further than this from a frontage belong to another block. */
const FRONT_REACH = 26;

/** Share of the road's width the pickup marker stands off the centreline. */
const MARKER_OFFSET = 0.31;

/** ...but never closer than this to the kerb, on a wide arterial. */
const MARKER_KERB_CLEAR = 1.4;

const EPS = 1e-6;

/**
 * Board height and blade reach, exported so the route gate can measure them
 * against the same clearances `expanse-facade-check` holds M4's signage to:
 * nothing at head height, nothing reaching further off the wall than the
 * pavement in front of it is deep.
 */
export const SIGN_Y = 5.05;
export const BLADE_PROJECT = 0.72;

function nearestOnSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq < 1e-9 ? 0
    : Math.min(1, Math.max(0, ((px - ax) * abx + (pz - az) * abz) / lenSq));
  const x = ax + abx * t;
  const z = az + abz * t;
  return { x, z, t, distance: Math.hypot(px - x, pz - z) };
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i - 1].distanceTo(points[i]);
  return total;
}

/**
 * The carriageway a point fronts: nearest segment across every paved edge,
 * with the edge that owns it and the direction it runs.
 *
 * Brute force over 452 edges is fine — this runs a few hundred times, once.
 */
function frontingRoad(x, z, streets) {
  let best = null;
  for (const edge of streets.edges) {
    if (edge.bridge) continue;
    let walked = 0;
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < EPS) continue;
      const near = nearestOnSegment(x, z, a.x, a.z, b.x, b.z);
      if (!best || near.distance < best.distance) {
        best = {
          edge,
          distance: near.distance,
          point: new THREE.Vector3(near.x, 0, near.z),
          direction: new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize(),
          along: walked + length * near.t,
        };
      }
      walked += length;
    }
  }
  if (!best || best.distance > best.edge.width * 0.5 + FRONT_REACH) return null;
  const total = polylineLength(best.edge.points);
  return { ...best, progress: total > EPS ? best.along / total : 0 };
}

/** The middle of a building's street wall, at ground level. */
function frontageCentre(building) {
  return new THREE.Vector3(
    building.x + building.facing.x * building.depth * 0.5,
    0,
    building.z + building.facing.z * building.depth * 0.5,
  );
}

/**
 * Bind every menu restaurant to a generated shop plot.
 *
 * @param {object} massing `generateExpanseMassing()` output.
 * @param {object} facades `generateExpanseFacades()` output — a plot without a
 *   shopfront has no glass to put a name over, so it is not a candidate.
 * @param {object} streets `generateExpanseStreets()` output, for the road the
 *   marker stands on.
 */
export function generateExpansePickups(massing, facades, streets) {
  const restaurantById = new Map(RESTAURANTS.map((r) => [r.id, r]));
  const facadeById = facades.byBuilding
    || new Map(facades.facades.map((facade) => [facade.id, facade]));

  // One pass over the city, so each of the eight searches walks a short list.
  const byDistrict = new Map();
  for (const building of massing.buildings) {
    if (!building.shop) continue;
    if (building.width < MIN_FRONTAGE) continue;
    if (building.streetClass === 'ring') continue;
    if (!(CLASS_SCORE[building.streetClass] > 0)) continue;
    if (!facadeById.get(building.id)?.shopfront) continue;
    if (!byDistrict.has(building.districtId)) byDistrict.set(building.districtId, []);
    byDistrict.get(building.districtId).push(building);
  }

  const sites = [];
  const taken = new Set();
  for (const landmark of LANDMARK_SHOPS) {
    const restaurant = restaurantById.get(landmark.id);
    if (!restaurant) throw new Error(`Expanse pickup ${landmark.id} has no menu restaurant`);
    const pool = byDistrict.get(landmark.district) || [];

    // Two passes: the first insists on the separation that keeps eight markers
    // legible on one mini-map, the second drops it rather than leave a
    // restaurant unbound. A district carrying three of them — station does —
    // can genuinely run out of room.
    let chosen = null;
    let front = null;
    for (const enforceSeparation of [true, false]) {
      let bestScore = -Infinity;
      for (const building of pool) {
        if (taken.has(building.id)) continue;
        if (enforceSeparation && sites.some((site) =>
          Math.hypot(site.building.x - building.x, site.building.z - building.z) < MIN_SEPARATION)) continue;
        const road = frontingRoad(building.x, building.z, streets);
        if (!road || road.edge.kind === 'ring') continue;
        // Frontage first — a wide shop wall is what makes the sign readable
        // from a moving van — then the street it is on, then its height, so a
        // pickup tends to be a corner everyone in the district drives past.
        const score = building.width * 2.4
          + (CLASS_SCORE[building.streetClass] ?? 0)
          + road.edge.width * 0.6
          + Math.min(building.storeys, 8) * 0.8
          - Math.max(0, road.distance - building.depth * 0.5 - 6) * 0.5;
        if (score > bestScore) { bestScore = score; chosen = building; front = road; }
      }
      if (chosen) break;
    }
    if (!chosen || !front) throw new Error(`Expanse pickup ${landmark.id} found no shop plot in ${landmark.district}`);
    taken.add(chosen.id);

    // Which side of the road the shop is on decides which way the marker sits.
    // Taken from the geometry, never assumed.
    const normal = new THREE.Vector3(-front.direction.z, 0, front.direction.x);
    const toShop = new THREE.Vector3(chosen.x - front.point.x, 0, chosen.z - front.point.z);
    const side = normal.dot(toShop) >= 0 ? 1 : -1;

    const half = front.edge.width * 0.5;
    const offset = Math.min(front.edge.width * MARKER_OFFSET, Math.max(0, half - MARKER_KERB_CLEAR));
    const point = front.point.clone().addScaledVector(normal, side * offset);
    point.y = 0.06;

    // `lot.facing` points at the street the plot fronts — the same convention
    // M2 uses to prove every lot has a road at its front door — so the wall
    // centre is the plot centre pushed half a depth *along* it.
    const facadePoint = frontageCentre(chosen);
    const toStreet = new THREE.Vector3(chosen.facing.x, 0, chosen.facing.z);

    sites.push({
      id: landmark.id,
      nameKo: restaurant.nameKo,
      nameEn: restaurant.nameEn,
      neon: landmark.neon,
      color: landmark.neon,
      district: chosen.district,
      districtId: chosen.districtId,
      buildingId: chosen.id,
      building: chosen,
      width: chosen.width,
      // What the order loop drives to.
      point,
      position: front.point.clone(),
      roadPoint: front.point.clone(),
      // Where the name board and the door light go.
      facadePoint,
      door: facadePoint.clone().addScaledVector(toStreet, 1.6),
      facing: { x: chosen.facing.x, z: chosen.facing.z },
      toStreet: { x: toStreet.x, z: toStreet.z },
      yaw: chosen.yaw,
      heading: Math.atan2(toStreet.x, toStreet.z),
      direction: front.direction.clone(),
      side,
      edgeId: front.edge.id,
      streetClass: chosen.streetClass,
      roadWidth: front.edge.width,
      roadDistance: front.distance,
      markerOffset: offset,
      progress: front.progress,
      tile: 0,
      slot: 0,
    });
  }

  const perDistrict = {};
  for (const site of sites) perDistrict[site.districtId] = (perDistrict[site.districtId] || 0) + 1;
  return {
    sites,
    byId: new Map(sites.map((site) => [site.id, site])),
    stats: {
      shops: sites.length,
      districts: Object.keys(perDistrict).length,
      perDistrict,
      candidates: [...byDistrict.values()].reduce((sum, list) => sum + list.length, 0),
      narrowest: Math.min(...sites.map((site) => site.width)),
      closestPair: closestPair(sites),
    },
  };
}

function closestPair(sites) {
  let closest = Infinity;
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      closest = Math.min(closest, Math.hypot(
        sites[i].building.x - sites[j].building.x,
        sites[i].building.z - sites[j].building.z,
      ));
    }
  }
  return Number.isFinite(closest) ? closest : 0;
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

/** Restaurant name board, drawn once per shop. Eight canvases, not 1,052. */
function makeSignTexture(site) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#060d14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = cssHex(site.neon);
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = '#fff6dd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 62px sans-serif';
  ctx.fillText(site.nameKo, canvas.width / 2, 74);
  ctx.fillStyle = '#c8d8df';
  ctx.font = '600 28px sans-serif';
  ctx.fillText(site.nameEn.toUpperCase(), canvas.width / 2, 140);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

/**
 * Hang a name board and a door light on each bound storefront.
 *
 * M4 already built the shopfront, the fascia band and the glass, so this adds
 * the smallest thing that says *which* shop it is: a board above the frontage,
 * a blade off the wall so it is findable from down the street, and a practical
 * over the door. Nothing here changes the building.
 */
export function buildExpansePickups(parent, pickups) {
  const group = new THREE.Group();
  group.name = 'expanse2_restaurants';
  parent.add(group);
  const emissiveMaterials = [];
  const streetlightAnchors = [];
  const textures = [];

  for (const site of pickups.sites) {
    const root = new THREE.Group();
    root.name = `restaurant_${site.id}`;
    root.position.copy(site.facadePoint);
    root.rotation.y = site.yaw;

    const accent = new THREE.MeshStandardMaterial({
      color: site.neon, emissive: site.neon, emissiveIntensity: 0.9,
      roughness: 0.42, metalness: 0.08,
    });
    emissiveMaterials.push(accent);

    // The board sits above M4's fascia band and just proud of the wall, and is
    // never wider than the frontage it names.
    const boardWidth = Math.min(site.width - 0.5, 8.5);
    const boardHeight = boardWidth / 4.05;
    const texture = makeSignTexture(site);
    textures.push(texture);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(boardWidth, boardHeight),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    );
    board.position.set(0, SIGN_Y, 0.22);
    root.add(board);

    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(boardWidth + 0.3, 0.14, 0.3), accent,
    );
    lintel.position.set(0, SIGN_Y - boardHeight * 0.5 - 0.16, 0.24);
    root.add(lintel);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, BLADE_PROJECT), accent);
    blade.position.set(
      Math.min(boardWidth * 0.5, site.width * 0.5 - 0.3), 3.6, BLADE_PROJECT * 0.5 + 0.12,
    );
    root.add(blade);

    group.add(root);
    streetlightAnchors.push({
      position: site.door.clone().setY(0),
      lamp: site.neon,
      glow: site.neon,
    });
  }

  return {
    group,
    pickupSites: pickups.sites,
    emissiveMaterials,
    streetlightAnchors,
    textures,
    stats: { shops: pickups.sites.length },
  };
}
