// Seoul Expanse route gate — the M5 milestone gate.
//
// M5's deliverable is not geometry, it is a *loop*: eight named restaurants
// bound to real buildings, five landmarks to steer by, and a delivery job that
// can actually be driven between them. None of that is visible in a
// screenshot, and all of the ways it fails are silent — a pickup marker inside
// a wall, a restaurant on an island the graph cannot route out of, a landmark
// crowning a shed behind a taller neighbour.
//
// So this gate measures the same records `?world=expanse2` builds its meshes
// and its order loop from, in three halves:
//
//   shops      — every menu restaurant is bound to one real storefront, and
//                the marker outside it is somewhere a van can stop.
//   routes     — the graph can get from every shop to every delivery anchor,
//                to every other shop, and back, at a sane distance.
//   landmarks  — every crown stands on its own roof, in its own district, and
//                above everything around it.
//
// Ground note: `createDeliveryAnchors` verifies street-level ground with a
// raycast, which needs the runtime BVH. The rebuild's drivable ground is four
// flat quads at y = 0 with the river cut out of them (see the header of
// `expanse2-city.js`), so this gate hands it that same surface as a function
// rather than skipping the anchors it cannot raycast.
import { generateExpanseLayout } from '../../src/world/expanse-layout.js';
import { generateExpanseStreets } from '../../src/world/expanse-streets.js';
import { generateExpanseBlocks } from '../../src/world/expanse-blocks.js';
import { generateExpanseMassing } from '../../src/world/expanse-massing.js';
import { generateExpanseFacades } from '../../src/world/expanse-facades.js';
import {
  generateExpansePickups, BLADE_PROJECT, SIGN_Y,
} from '../../src/world/expanse-pickups.js';
import { generateExpanseLandmarks } from '../../src/world/expanse-landmarks.js';
import { createRoadGraph, createDeliveryAnchors } from '../../src/world/road-network.js';
import { RESTAURANTS } from '../../src/game/data/restaurants.js';
import { LANDMARK_SHOPS, DISTRICTS } from '../../src/world/data/color-bible.js';
import * as THREE from 'three';

let failures = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

/** The marker has to be inside the arcade pickup zone `orders.js` draws. */
const ZONE_RADIUS = 9.5;

/** No building within this of a landmark may stand taller than its crown. */
const SKYLINE_RADIUS = 120;

/** …and it has to clear them by this much to read as the high point. */
const SKYLINE_MARGIN = 5;

/** A route longer than this multiple of the straight line is not a route. */
const DETOUR_FACTOR = 4;
const DETOUR_SLACK = 220;

const layout = generateExpanseLayout();
const streets = generateExpanseStreets(layout);
const plan = generateExpanseBlocks(streets);
const massing = generateExpanseMassing(plan, streets);
const facades = generateExpanseFacades(massing, streets);
const pickups = generateExpansePickups(massing, facades, streets);
const landmarkPlan = generateExpanseLandmarks(massing, layout);

const bounds = new THREE.Box3(
  new THREE.Vector3(streets.bounds.minX - 70, -8, streets.bounds.minZ - 70),
  new THREE.Vector3(streets.bounds.maxX + 70, 120, streets.bounds.maxZ + 70),
);
const graph = createRoadGraph({
  nodes: streets.nodes, edges: streets.edges, bounds, roadWidth: 10,
});

const river = layout.river;
const flatGround = (x, z) => (
  x >= river.minX && x <= river.maxX && z >= river.minZ && z <= river.maxZ
    ? null
    : { point: new THREE.Vector3(x, 0, z) }
);
const anchors = createDeliveryAnchors(graph, flatGround);

const buildingById = new Map(massing.buildings.map((b) => [b.id, b]));
const facadeById = facades.byBuilding;
const sites = pickups.sites;
const landmarks = landmarkPlan.landmarks;

console.log(
  `Expanse M5 — ${sites.length} restaurants, ${landmarks.length} landmarks, `
  + `${anchors.length} delivery anchors, ${pickups.stats.candidates} shop plots to choose from`
);

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------

const menuIds = RESTAURANTS.map((r) => r.id).sort();
const boundIds = sites.map((s) => s.id).sort();
check('every menu restaurant is bound exactly once',
  boundIds.length === menuIds.length && boundIds.every((id, i) => id === menuIds[i]),
  `${boundIds.length} bound / ${menuIds.length} on the menu`);

const hosts = new Set(sites.map((s) => s.buildingId));
check('no two restaurants share a building',
  hosts.size === sites.length, `${hosts.size} distinct hosts`);

check('every restaurant is a real shop plot with a shopfront',
  sites.every((site) => {
    const building = buildingById.get(site.buildingId);
    return !!building && building.shop && !!facadeById.get(site.buildingId)?.shopfront;
  }),
  sites.map((site) => `${site.id}:${site.buildingId}`).join(' '));

const rosterDistrict = new Map(LANDMARK_SHOPS.map((entry) => [entry.id, entry.district]));
const misplaced = sites.filter((site) => site.districtId !== rosterDistrict.get(site.id));
check('every restaurant stands in the district its roster entry names',
  misplaced.length === 0,
  misplaced.map((site) => `${site.id} in ${site.districtId}, not ${rosterDistrict.get(site.id)}`).join('; ')
  || sites.map((site) => `${site.id}→${site.districtId}`).join(' '));

// A neighbourhood with neither a named shop nor a landmark is a part of the
// city the player has no reason to learn the shape of.
const anchoredDistricts = new Set([
  ...sites.map((site) => site.districtId),
  ...landmarks.map((landmark) => landmark.districtId),
]);
check('every district owns a navigational anchor',
  DISTRICTS.every((district) => anchoredDistricts.has(district.id)),
  DISTRICTS.filter((d) => !anchoredDistricts.has(d.id)).map((d) => d.id).join(', ')
  || `${anchoredDistricts.size}/${DISTRICTS.length}`);

check('no restaurant fronts the ring',
  sites.every((site) => site.streetClass !== 'ring'
    && graph.edgeById.get(site.edgeId)?.kind !== 'ring'),
  sites.map((site) => `${site.id}:${site.streetClass}`).join(' '));

// The marker is the thing the van parks on, so it lives on the asphalt — far
// enough off the centreline to be outside oncoming traffic, never so far it is
// on the kerb.
const offKerb = sites.filter((site) => site.markerOffset > site.roadWidth * 0.5 - 1.4 + 1e-6);
check('every pickup marker stands on its own carriageway',
  offKerb.length === 0,
  offKerb.map((site) => `${site.id} ${site.markerOffset.toFixed(2)} of ${(site.roadWidth / 2).toFixed(2)}`).join('; ')
  || `widest offset ${Math.max(...sites.map((s) => s.markerOffset)).toFixed(2)} m`);

const reach = sites.map((site) => ({ id: site.id, d: site.point.distanceTo(site.facadePoint) }));
const furthest = reach.reduce((a, b) => (b.d > a.d ? b : a));
check('the pickup zone reaches the shop wall it belongs to',
  furthest.d <= ZONE_RADIUS,
  `worst ${furthest.id} at ${furthest.d.toFixed(1)} m of ${ZONE_RADIUS} m`);

// Nothing to do with the shop's own building: a marker that lands inside some
// *other* plot means the frontage search picked a road across the block.
let insideBuilding = null;
for (const site of sites) {
  for (const building of massing.buildings) {
    if (building.id === site.buildingId) continue;
    if (Math.abs(building.x - site.point.x) > 40 || Math.abs(building.z - site.point.z) > 40) continue;
    if (pointInPolygon(site.point, building.footprint)) { insideBuilding = `${site.id} in ${building.id}`; break; }
  }
  if (insideBuilding) break;
}
check('no pickup marker is inside a building', !insideBuilding, insideBuilding || '');

// M4's clearance rule, applied to M5's boards: nothing bolted to a shop wall
// may reach further off it than the pavement in front of that plot is deep.
const crowding = sites.filter((site) =>
  BLADE_PROJECT > (facadeById.get(site.buildingId)?.pavement ?? 0) - 0.4);
check('no restaurant blade reaches past its own pavement',
  crowding.length === 0,
  crowding.map((site) => site.id).join('; ')
  || `blade ${BLADE_PROJECT} m, narrowest pavement `
  + `${Math.min(...sites.map((s) => facadeById.get(s.buildingId).pavement)).toFixed(2)} m`);

check('every name board clears a walking head',
  SIGN_Y - 1.1 >= 2.6, `board centre at ${SIGN_Y} m`);

check('the eight restaurants are spread across the city',
  pickups.stats.closestPair >= 60,
  `closest pair ${pickups.stats.closestPair.toFixed(0)} m apart`);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

check('the delivery anchors survived the ground test',
  anchors.length >= 12, `${anchors.length} anchors`);

const anchorDistricts = new Set(anchors.map((anchor) => anchor.id.split('-')[0]));
check('every district owns a delivery anchor',
  anchorDistricts.size >= DISTRICTS.length,
  `${anchorDistricts.size} districts represented`);

function routeBetween(from, to) {
  try { return graph.findRoute(from, to); } catch { return null; }
}

const legs = [];
for (const site of sites) {
  for (const anchor of anchors) {
    legs.push({ label: `${site.id}→${anchor.id}`, from: site.point, to: anchor.point });
    legs.push({ label: `${anchor.id}→${site.id}`, from: anchor.point, to: site.point });
  }
}
for (let i = 0; i < sites.length; i++) {
  for (let j = i + 1; j < sites.length; j++) {
    legs.push({ label: `${sites[i].id}→${sites[j].id}`, from: sites[i].point, to: sites[j].point });
  }
}
legs.push(...sites.map((site) => ({
  label: `spawn→${site.id}`, from: layout.spawn.position, to: site.point,
})));

const unroutable = [];
let worstDetour = { label: '', ratio: 0 };
let longest = 0;
for (const leg of legs) {
  const route = routeBetween(leg.from, leg.to);
  if (!route || !route.polyline?.length) { unroutable.push(leg.label); continue; }
  longest = Math.max(longest, route.distance);
  const straight = Math.hypot(leg.to.x - leg.from.x, leg.to.z - leg.from.z);
  const ratio = straight > 1 ? route.distance / straight : 0;
  if (ratio > worstDetour.ratio) worstDetour = { label: leg.label, ratio, straight, distance: route.distance };
}
check('every delivery leg the game can offer is routable',
  unroutable.length === 0,
  unroutable.length ? `${unroutable.length} dead legs: ${unroutable.slice(0, 6).join(', ')}` : `${legs.length} legs`);

check('no leg is a detour around the whole city',
  worstDetour.ratio <= DETOUR_FACTOR
    || (worstDetour.distance ?? 0) - (worstDetour.straight ?? 0) <= DETOUR_SLACK,
  `worst ${worstDetour.label} at ${worstDetour.ratio.toFixed(2)}× `
  + `(${(worstDetour.distance ?? 0).toFixed(0)} m for ${(worstDetour.straight ?? 0).toFixed(0)} m)`);

check('the longest leg still fits an arcade timer',
  longest <= 3200, `longest route ${longest.toFixed(0)} m`);

// `orders.js` binds each restaurant to its nearest delivery anchor for routing
// and keeps the shop's own door as the marker. Both halves have to exist, or
// the loop falls back to a road point with no building behind it.
const unanchored = sites.filter((site) => !anchors.some((anchor) =>
  anchor.point.distanceTo(site.point) < 900));
check('every restaurant has a delivery anchor within reach for routing',
  unanchored.length === 0, unanchored.map((s) => s.id).join(', '));

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------

check('all five authored anchors raised a landmark',
  landmarks.length === 5, landmarks.map((l) => l.id).join(', '));

check('no two landmarks share a host, and no host is a restaurant',
  new Set(landmarks.map((l) => l.buildingId)).size === landmarks.length
  && landmarks.every((l) => !hosts.has(l.buildingId)),
  landmarks.map((l) => `${l.id}:${l.buildingId}`).join(' '));

check('every landmark stands in the district it is named for',
  landmarks.every((l) => l.hostDistrictId === l.districtId),
  landmarks.map((l) => `${l.id}→${l.hostDistrictId}`).join(' '));

check('every landmark found a host near its authored anchor',
  landmarks.every((l) => l.anchorDistance <= l.radius),
  `furthest ${landmarkPlan.stats.furthestFromAnchor.toFixed(0)} m`);

// A crown is only free of the clearance rules the rest of the city obeys
// because it never leaves the roof it stands on.
const oversailing = landmarks.filter((l) => {
  const host = buildingById.get(l.buildingId);
  return !host
    || Math.abs(l.base - host.top) > 1e-6
    || l.side > Math.min(host.width, host.depth) - 1.7;
});
check('every crown sits on its own roof and inside its own footprint',
  oversailing.length === 0,
  oversailing.map((l) => l.id).join('; ')
  || `tightest ${Math.min(...landmarks.map((l) => Math.min(l.hostWidth, l.hostDepth) - l.side)).toFixed(2)} m of margin`);

let worstSkyline = { id: '', margin: Infinity };
for (const landmark of landmarks) {
  let tallest = 0;
  for (const building of massing.buildings) {
    if (building.id === landmark.buildingId) continue;
    if (Math.hypot(building.x - landmark.x, building.z - landmark.z) > SKYLINE_RADIUS) continue;
    if (building.top > tallest) tallest = building.top;
  }
  const margin = landmark.peak - tallest;
  if (margin < worstSkyline.margin) worstSkyline = { id: landmark.id, margin, tallest };
}
check(`every landmark is the high point within ${SKYLINE_RADIUS} m`,
  worstSkyline.margin >= SKYLINE_MARGIN,
  `worst ${worstSkyline.id} clears its neighbours by ${worstSkyline.margin.toFixed(1)} m`);

check('no landmark leaves the world, and none stands over the river',
  landmarks.every((l) =>
    l.peak < bounds.max.y
    && l.x > streets.bounds.minX && l.x < streets.bounds.maxX
    && l.z > streets.bounds.minZ && l.z < streets.bounds.maxZ
    && !(l.x >= river.minX && l.x <= river.maxX && l.z >= river.minZ && l.z <= river.maxZ)),
  `tallest peak ${landmarkPlan.stats.tallest.toFixed(1)} m`);

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

const pickupsAgain = generateExpansePickups(massing, facades, streets);
const landmarksAgain = generateExpanseLandmarks(massing, layout);
check('the same city always binds the same shops and crowns the same roofs',
  pickupsAgain.sites.map((s) => `${s.id}:${s.buildingId}:${s.point.x.toFixed(4)}`).join('|')
    === sites.map((s) => `${s.id}:${s.buildingId}:${s.point.x.toFixed(4)}`).join('|')
  && landmarksAgain.landmarks.map((l) => `${l.id}:${l.buildingId}:${l.peak.toFixed(4)}`).join('|')
    === landmarks.map((l) => `${l.id}:${l.buildingId}:${l.peak.toFixed(4)}`).join('|'));

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.z > point.z) !== (b.z > point.z)
      && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll Expanse route checks passed');
process.exit(failures ? 1 : 0);
