// One authored shopfront: a neon sign and a practical light on a wall the block
// already has, plus the pickup anchor that makes it a restaurant.
//
// WHY THIS IS SMALL. The previous version imported assets/district/storefronts.glb
// and stamped 105 copies of it across every frontage in the city. That asset's
// diffuse texture is corrupt at source, so every copy wore one substitute facade
// and the result was the same grey 20 m slab everywhere you looked. Corrupt
// source art does not get shipped 105 times, or once — the GLB is not loaded here
// at all.
//
// What replaces it: nothing is built. The Seoul block already has shopfronts;
// this marks one of them. A sign, a light, a pickup point. Add more by extending
// SHOPS, but only after looking at what the frontage probe reports — the probe is
// the part that decides whether a shop lands on a wall or in the carriageway.
//
// Dressing is parented to a tile's `dressingDetail` group, so it inherits the
// tile transform and range culling, and adds no collision. It is authored in
// TILE-LOCAL METRES — `dressingDetail` sits outside the block's CITY_SCALE, so
// these numbers are real metres, not block units.
import * as THREE from 'three';
import {
  STREET_X_WEST, STREET_X_EAST, STREET_Z_SOUTH, STREET_Z_NORTH, STREET_WIDTH,
} from './city-constants.js';

/**
 * The shops to place. ONE, deliberately — this is the first one back after the
 * corrupt-asset rows were removed, and the point is to confirm a single shop
 * lands correctly before there are more to debug at once.
 *
 * `front` names a FRONTAGE below. Note there is no 'wstrip' any more: that was
 * the block's western building strip, and it is clipped out of the world now
 * (see isWestOfRoadSlab in city-constants.js). A shop pointed at it would have
 * been dressing a wall that no longer exists.
 */
const SHOPS = [
  { id: 'bingsu', front: 'south', t: 0.5, ko: '서울 야간 편의점', en: 'NIGHT CONVENIENCE', color: '#58e8ff' },
];

const HALF_STREET = STREET_WIDTH * 0.5;

// The block's streets form a U — two N/S along local Z, joined by one E/W along
// local X. `outward` points from the street INTO the buildings; the facade looks
// the other way, back at the carriageway.
const FRONTAGES = [
  { id: 'south', axis: 'x', line: STREET_Z_SOUTH, outward: -1, span: [STREET_X_WEST + HALF_STREET, STREET_X_EAST - HALF_STREET] },
  { id: 'east',  axis: 'z', line: STREET_X_EAST,  outward: -1, span: [STREET_Z_NORTH, STREET_Z_SOUTH - HALF_STREET] },
  { id: 'west',  axis: 'z', line: STREET_X_WEST,  outward:  1, span: [STREET_Z_NORTH, STREET_Z_SOUTH - HALF_STREET] },
];

/** Clear pavement between the street centreline and any wall we dress. */
const MIN_SETBACK = HALF_STREET + 1.15;
/** Beyond this the probe has left the frontage and found something else. */
const MAX_SETBACK = 26;
/** Fraction of probes across the shop width that must agree there is a wall. */
const WALL_QUORUM = 0.5;
/** How wide a stretch of frontage one shop occupies, in metres. */
const SHOP_WIDTH = 4.6;

function makeSign({ ko, en, color }) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(5, 7, 12, .94)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 82px sans-serif';
  ctx.fillText(ko, canvas.width / 2, 76);
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#f6fbff';
  ctx.font = '600 28px sans-serif';
  ctx.fillText(en, canvas.width / 2, 145);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, side: THREE.DoubleSide, toneMapped: true,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), material);
}

/** Tile-local basis: `along` runs down the street, `toStreet` is the facade normal. */
function basisOf(f) {
  const along = f.axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const cross = f.axis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const toStreet = cross.clone().multiplyScalar(-f.outward);
  return { along, toStreet, yaw: Math.atan2(toStreet.x, toStreet.z) };
}

/** Point on the street centreline opposite position `t` along the frontage. */
function streetPoint(f, t) {
  return f.axis === 'x'
    ? new THREE.Vector3(t, 0, f.line)
    : new THREE.Vector3(f.line, 0, t);
}

/**
 * Find the wall behind a stretch of frontage, as a setback from the street
 * centreline — or null when there is no wall there.
 *
 * Seven stations across the shop width, two heights each, and a median rather
 * than a first hit. A single ray is not enough: a frontage is full of gaps,
 * gateways and alley mouths, and one ray that misses (or that hits a lamp post
 * instead of the wall behind it) is how you end up with a building standing in
 * the road. Returning null is the honest answer for a shop centred on a junction.
 */
function probeFrontage(city, f, basis, t, streetLevel) {
  const outward = basis.toStreet.clone().negate();
  const stations = [-0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.42].map((k) => k * SHOP_WIDTH);
  const setbacks = [];
  for (const along of stations) {
    for (const height of [2.2, 6.2]) {
      const from = streetPoint(f, t).addScaledVector(basis.along, along).setY(streetLevel + height);
      const hit = city.localRaycast(from, outward, MAX_SETBACK);
      if (!hit?.point) continue;
      const setback = Math.abs(f.axis === 'x' ? hit.point.z - f.line : hit.point.x - f.line);
      if (setback < MIN_SETBACK || setback > MAX_SETBACK) continue;
      setbacks.push(setback);
      break; // one hit per station; do not double-count a station
    }
  }
  if (setbacks.length < Math.ceil(stations.length * WALL_QUORUM)) return null;
  setbacks.sort((a, b) => a - b);
  return setbacks[Math.floor(setbacks.length / 2)];
}

export async function loadDistrictDressing(scene, manager, city) {
  const frontageById = new Map(FRONTAGES.map((f) => [f.id, f]));
  const streetLevel = city.roadBox.min.y;
  // The spawn district, so the one shop is on the street you start on and is
  // trivially checkable rather than somewhere out in the 35-district fabric.
  const tile = Number.isInteger(city.spawn?.tile) ? city.spawn.tile : 0;

  const pickupSites = [];
  const skipped = [];

  for (const shop of SHOPS) {
    const f = frontageById.get(shop.front);
    if (!f) { skipped.push(`${shop.id}: unknown frontage '${shop.front}'`); continue; }
    const basis = basisOf(f);
    const t = f.span[0] + (f.span[1] - f.span[0]) * shop.t;

    const setback = probeFrontage(city, f, basis, t, streetLevel);
    if (setback == null) { skipped.push(`${shop.id}: no wall on '${shop.front}' at t=${t.toFixed(1)}`); continue; }

    // Facade plane, in tile-local metres.
    const wall = streetPoint(f, t).addScaledVector(basis.toStreet, -setback);
    const ground = city.findGroundLocal(wall.x + basis.toStreet.x * 1.2, wall.z + basis.toStreet.z * 1.2);
    const baseY = ground?.point ? ground.point.y : streetLevel;

    const group = new THREE.Group();
    group.name = `shop_${shop.id}`;

    // Sign, standing just proud of the wall so it never z-fights the facade.
    const sign = makeSign(shop);
    sign.name = `shop_sign_${shop.id}`;
    sign.position.copy(wall).addScaledVector(basis.toStreet, 0.14);
    sign.position.y = baseY + 3.5;
    sign.rotation.y = basis.yaw;
    group.add(sign);

    // One practical, so the shop reads as open at night and the pickup point is
    // findable from down the street. Cheap: a single point light, short range.
    const practical = new THREE.PointLight(new THREE.Color(shop.color), 9, 13, 2);
    practical.position.copy(wall).addScaledVector(basis.toStreet, 0.9);
    practical.position.y = baseY + 2.9;
    group.add(practical);

    city.tiles[tile].dressingDetail.add(group);

    // The pickup marker goes in the KERB LANE, measured from the street — not a
    // fixed step off the wall.
    //
    // Off the wall was the bug. Setback varies from ~4 m to the 26 m probe limit,
    // and this shop's frontage sits 11.35 m back from the centreline, so "1.25 m
    // in front of the wall" put the marker 10.1 m from the nearest road, behind
    // the kerb in a plaza you cannot drive into. Every fallback restaurant sat at
    // 1.8 m and was fine, which is the giveaway.
    //
    // STREET_WIDTH * 0.33 matches the band createDeliveryAnchors uses for its own
    // anchors (0.30-0.34), so an authored shop is reachable on exactly the same
    // terms as a sampled one however deep its frontage is. The SIGN stays on the
    // building; only the marker comes forward.
    const localPickup = streetPoint(f, t)
      .addScaledVector(basis.toStreet, -Math.min(STREET_WIDTH * 0.33, setback - 0.5));
    const pickupGround = city.findGroundLocal(localPickup.x, localPickup.z);
    localPickup.y = pickupGround?.point ? pickupGround.point.y : baseY;
    pickupSites.push({
      id: shop.id,
      point: city.grid.localToWorld(tile, localPickup, new THREE.Vector3()),
      tile,
      slot: 0,
      front: shop.front,
      // Tile-local direction from the shopfront out to the street, for the
      // `?shop=<id>` QA camera.
      toStreet: { x: basis.toStreet.x, z: basis.toStreet.z },
    });
  }

  return {
    group: scene,
    pickupSites,
    stats: {
      shopsRequested: SHOPS.length,
      shopsPlaced: pickupSites.length,
      skipped,
      tile,
    },
  };
}
