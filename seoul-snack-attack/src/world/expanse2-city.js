// Seoul Expanse rebuild — M4 runtime, behind `?world=expanse2`.
//
// M1 generated the streets, M2 cut the land into 1,212 building plots, M3
// extruded them and M4 dressed them, so this module is deliberately thin: it
// owns collision, lighting and the runtime contract, and it authors no city
// geometry of its own. Every position here comes out of the generators, which
// the Node gates measure. Facade geometry is built by `expanse-facade-mesh.js`
// from the records `expanse-facades.js` produced under the gate.
//
// It does not touch `?world=expanse`. The live 25-node greybox keeps its own
// module, its own gates and its own art pass until M6 promotes this one.
//
// Two things differ from expanse-city.js on purpose:
//
//   1. **Collision is the ground, not the roads.** 452 carriageways overlapping
//      at 299 junctions cannot all be collision slabs without either z-fighting
//      or centimetre steps at every junction. The drivable surface is instead
//      four flat quads with the river cut out of them; roads are paint on top,
//      and the kerbs come from the pavement pads.
//   2. **The river is a hole, not a floor.** The three authored bridges are the
//      only crossings, so driving off the quay has to be a fall.
import * as THREE from 'three';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeTileGrid } from './tiling.js';
import { createRoadGraph, createDeliveryAnchors, validateRoadGraph } from './road-network.js';
import { StreetlightPool } from './streetlights.js';
import { createNightRig, NIGHT } from './lighting.js';
import { generateExpanseLayout, expanseDistrictAt } from './expanse-layout.js';
import { generateExpanseStreets } from './expanse-streets.js';
import { generateExpanseBlocks } from './expanse-blocks.js';
import { generateExpanseMassing } from './expanse-massing.js';
import { generateExpanseFacades } from './expanse-facades.js';
import { createExpanseFacadeTextures } from './expanse-facade-art.js';
import { createExpanseSignAtlas } from './expanse-sign-art.js';
import { buildExpanseFacadeMeshes } from './expanse-facade-mesh.js';
import { buildExpanseVisualChunks, updateExpanseVisualChunks } from './expanse-chunks.js';
import { DISTRICTS as PALETTES } from './data/color-bible.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const TMP_A = new THREE.Vector3();
const TMP_N = new THREE.Vector3();

/** Land past the perimeter road, so the world edge is not a visible cliff. */
const WORLD_MARGIN = 70;

/**
 * Road paint sits above the drivable ground by class, widest lowest. Two roads
 * always overlap at a junction, and a fixed order is the difference between a
 * legible junction and a sheet of z-fighting.
 */
const ROAD_LIFT = Object.freeze({
  ring: 0.02, arterial: 0.035, street: 0.05, alley: 0.065, connector: 0.05,
});

/** An edge shorter than this is an inherited artefact and paves nothing. */
const MIN_PAVED_LENGTH = 0.5;

/**
 * M3 painted its districts from a hand-written table of six hues, because the
 * colour bible's own facade paints do not separate on their own. M4 deleted
 * that table: a building's paint comes from `districtFacadePaint()` in the
 * bible, which pulls a district's own paint toward that district's own glow,
 * and `expanse-facade-check` asserts the six neighbourhoods still read apart.
 */

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i - 1].distanceTo(points[i]);
  return total;
}

/** Flat ribbon along a polyline, `lift` above the points' own elevation. */
function roadGeometry(points, width, lift = 0) {
  const vertices = [];
  const half = width * 0.5;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    TMP_A.copy(b).sub(a).setY(0);
    if (TMP_A.lengthSq() < 1e-6) continue;
    TMP_A.normalize();
    TMP_N.set(-TMP_A.z, 0, TMP_A.x).multiplyScalar(half);
    const al = a.clone().add(TMP_N); al.y += lift;
    const ar = a.clone().sub(TMP_N); ar.y += lift;
    const bl = b.clone().add(TMP_N); bl.y += lift;
    const br = b.clone().sub(TMP_N); br.y += lift;
    vertices.push(al.x, al.y, al.z, bl.x, bl.y, bl.z, br.x, br.y, br.z);
    vertices.push(al.x, al.y, al.z, br.x, br.y, br.z, ar.x, ar.y, ar.z);
  }
  if (!vertices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Horizontal quad at `y`, wound so its normal points up. */
function slab(minX, maxX, minZ, maxZ, y) {
  const geometry = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ).toNonIndexed();
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((minX + maxX) * 0.5, y, (minZ + maxZ) * 0.5);
  return geometry;
}

/**
 * Collision wants one attribute layout everywhere, because mergeGeometries
 * refuses a mixed batch and the failure is a blank world rather than an error.
 * Position and normal, never indexed, no UVs.
 */
function toCollision(geometry) {
  const out = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  out.deleteAttribute('uv');
  return out;
}

/**
 * The drivable ground, with the river cut out of it. Four quads: the land north
 * of the channel, the land south of it, and the two banks either end where the
 * channel stops short of the world edge.
 */
function groundSlabs(bounds, river) {
  const minX = bounds.minX - WORLD_MARGIN;
  const maxX = bounds.maxX + WORLD_MARGIN;
  const minZ = bounds.minZ - WORLD_MARGIN;
  const maxZ = bounds.maxZ + WORLD_MARGIN;
  return [
    slab(minX, maxX, minZ, river.minZ, 0),
    slab(minX, maxX, river.maxZ, maxZ, 0),
    slab(minX, river.minX, river.minZ, river.maxZ, 0),
    slab(river.maxX, maxX, river.minZ, river.maxZ, 0),
  ];
}

/**
 * One raised pavement pad: a triangulated top face at kerb height plus a skirt
 * down to the road, which is the kerb the player feels through the wheels.
 */
function pavementGeometry(polygon, height) {
  const contour = polygon.map((p) => new THREE.Vector2(p.x, p.z));
  let faces;
  try { faces = THREE.ShapeUtils.triangulateShape(contour, []); } catch { return null; }
  if (!faces?.length) return null;

  const vertices = [];
  // A triangle wound counter-clockwise in XZ faces *down* in a Y-up right-handed
  // frame, so each face is emitted in whichever order actually points at the
  // sky rather than trusting the triangulator's winding.
  for (const face of faces) {
    const [a, b, c] = face.map((index) => contour[index]);
    const ccw = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
    const order = ccw ? [a, c, b] : [a, b, c];
    for (const p of order) vertices.push(p.x, height, p.y);
  }
  // Kerb face. The block generator emits its outlines counter-clockwise in XZ,
  // which puts the block interior on the left of a -> b and the carriageway on
  // the right, so this winding looks out at the road.
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    vertices.push(a.x, 0, a.y, b.x, height, b.y, b.x, 0, b.y);
    vertices.push(a.x, 0, a.y, a.x, height, a.y, b.x, height, b.y);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * One massing volume as a closed collision box in world space. Collision is
 * the only consumer left: what the player sees is built face by face from the
 * same volumes in expanse-facade-mesh.js, which drops the underside and
 * carries UVs and vertex colours this cannot.
 */
function collisionBox(volume) {
  const geometry = new THREE.BoxGeometry(volume.width, volume.height, volume.depth)
    .toNonIndexed();
  geometry.rotateY(volume.yaw);
  geometry.translate(volume.x, volume.y, volume.z);
  geometry.deleteAttribute('uv');
  return geometry;
}

/** Merge a bucket of geometries into one mesh, or nothing if the bucket is empty. */
function mergeInto(parent, parts, material, name) {
  if (!parts.length) return null;
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

export async function loadExpanse2City(scene, _manager, renderer = null, onPhase = null, {
  textureScale = 1,
} = {}) {
  onPhase?.(4, '서울 익스팬스 재건 계획 생성 중 · Generating the Expanse rebuild plan');
  const layout = generateExpanseLayout();
  const streets = generateExpanseStreets(layout);
  const plan = generateExpanseBlocks(streets);
  const massing = generateExpanseMassing(plan, streets);
  const facades = generateExpanseFacades(massing, streets);
  const river = { ...layout.river };
  // Glancing sightlines down a kilometre of street are the whole point of this
  // map, and a facade sheet without anisotropy smears to grey at 40 m.
  const anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 8);

  const group = new THREE.Group();
  group.name = 'seoul_expanse2_greybox';
  scene.add(group);

  const nightRig = createNightRig(scene, renderer);
  // Shared presets were tuned around the compact city; a kilometre of sightline
  // needs thinner fog or the ring disappears before its next corner.
  const setPreset = nightRig.setPreset.bind(nightRig);
  nightRig.setPreset = (mode) => {
    const params = setPreset(mode);
    params.fogDensity = mode === 'day' ? 0.00045 : 0.0012;
    nightRig.apply();
    return params;
  };

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1c2028, roughness: 0.96, metalness: 0.02 });
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3b444e, roughness: 0.72, metalness: 0.12 });
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x4a5460, roughness: 0.7, metalness: 0.16 });
  const riverMat = new THREE.MeshStandardMaterial({ color: 0x1d5a74, roughness: 0.25, metalness: 0.42 });
  const pavementMat = new THREE.MeshStandardMaterial({ color: 0x565049, roughness: 0.94, metalness: 0.02 });

  onPhase?.(12, '지면과 강 생성 중 · Laying ground and river');
  const collisionParts = [];
  const groundParts = groundSlabs(streets.bounds, river);
  for (const part of groundParts) collisionParts.push(toCollision(part));
  const ground = new THREE.Mesh(mergeGeometries(groundParts, false), groundMat);
  ground.name = 'expanse2_ground';
  group.add(ground);

  const water = new THREE.Mesh(
    slab(river.minX, river.maxX, river.minZ, river.maxZ, river.y),
    riverMat,
  );
  water.name = 'expanse2_river';
  group.add(water);

  onPhase?.(22, '도로 포장 중 · Paving 452 roads');
  const roadsRoot = new THREE.Group();
  roadsRoot.name = 'expanse2_roads';
  group.add(roadsRoot);

  const roadParts = [];
  const bridgeParts = [];
  let pavedEdges = 0;
  let skippedEdges = 0;
  for (const edge of streets.edges) {
    // `spine_south` is an inherited zero-length edge in the approved layout.
    // It stays in the road graph, where it is harmless, and paves nothing.
    if (polylineLength(edge.points) < MIN_PAVED_LENGTH) { skippedEdges++; continue; }
    const lift = ROAD_LIFT[edge.streetClass] ?? ROAD_LIFT.street;
    const geometry = roadGeometry(edge.points, edge.width, lift);
    if (!geometry) { skippedEdges++; continue; }
    pavedEdges++;
    if (edge.bridge) {
      bridgeParts.push(geometry);
      // A bridge deck is real surface: it is the only way across the channel,
      // and the channel below it is a hole in the ground.
      collisionParts.push(toCollision(roadGeometry(edge.points, edge.width, lift)));
    } else {
      roadParts.push(geometry);
    }
  }
  mergeInto(roadsRoot, roadParts, roadMat, 'expanse2_carriageways');
  mergeInto(roadsRoot, bridgeParts, bridgeMat, 'expanse2_bridge_decks');

  onPhase?.(34, '보도와 연석 생성 중 · Laying pavements and kerbs');
  const chunkGrid = buildExpanseVisualChunks(group, streets.bounds, massing.grid.cols, massing.grid.rows);
  const chunkById = new Map(chunkGrid.chunks.map((chunk) => [chunk.id, chunk]));

  const pavementByChunk = new Map();
  let pavementPads = 0;
  for (const pad of massing.pavements) {
    const geometry = pavementGeometry(pad.polygon, pad.height);
    if (!geometry) continue;
    pavementPads++;
    if (!pavementByChunk.has(pad.chunkId)) pavementByChunk.set(pad.chunkId, []);
    pavementByChunk.get(pad.chunkId).push(geometry);
    collisionParts.push(toCollision(pavementGeometry(pad.polygon, pad.height)));
  }
  for (const [chunkId, parts] of pavementByChunk) {
    mergeInto(chunkById.get(chunkId).base, parts, pavementMat, `pavement_${chunkId}`);
  }

  onPhase?.(46, '건물 매싱 생성 중 · Massing 1,211 buildings');
  // Collision takes the massing whole — closed boxes, no UVs — while the
  // visible city is rebuilt face by face from the same volumes. Facade
  // furniture is never collidable: a blade sign is not a wall, and putting
  // 8,000 more elements into the BVH would cost the phone build for nothing.
  for (const building of massing.buildings) {
    for (const vol of building.volumes) collisionParts.push(collisionBox(vol));
  }

  onPhase?.(52, '외장과 간판 생성 중 · Painting facades and signage');
  const surfaces = createExpanseFacadeTextures(PALETTES, { scale: textureScale, anisotropy });
  const signAtlas = createExpanseSignAtlas({ scale: textureScale, anisotropy });
  const facadeMeshes = buildExpanseFacadeMeshes({
    chunkById, massing, facades, textures: surfaces, signAtlas, districts: PALETTES,
  });
  const drawCalls = roadsRoot.children.length + 2 + pavementByChunk.size
    + facadeMeshes.drawCalls;

  const bounds = new THREE.Box3(
    new THREE.Vector3(streets.bounds.minX - WORLD_MARGIN, -8, streets.bounds.minZ - WORLD_MARGIN),
    new THREE.Vector3(streets.bounds.maxX + WORLD_MARGIN, 120, streets.bounds.maxZ + WORLD_MARGIN),
  );
  const roadGraph = createRoadGraph({
    nodes: streets.nodes, edges: streets.edges, bounds, roadWidth: 10,
  });
  roadGraph.districts = layout.districts;
  const topology = validateRoadGraph(roadGraph);
  if (!topology.ok) throw new Error(`Expanse rebuild graph invalid: ${topology.errors.join('; ')}`);

  onPhase?.(58, '충돌 인덱싱 중 · Indexing collision');
  const colliderGeo = mergeGeometries(collisionParts, false);
  for (const part of collisionParts) part.dispose();
  colliderGeo.computeBoundingBox();
  colliderGeo.computeBoundingSphere();
  const worker = new GenerateMeshBVHWorker();
  let bvh;
  try {
    bvh = await worker.generate(colliderGeo, {
      onProgress: (progress) => onPhase?.(58 + progress * 28,
        `충돌 인덱싱 중 · Indexing collision ${Math.round(progress * 100)}%`),
    });
  } finally {
    worker.dispose();
  }
  colliderGeo.boundsTree = bvh;

  const grid = makeTileGrid({ tileBox: bounds.clone(), cols: 1, rows: 1, flipOddRows: false, overhang: 0 });
  const detail = new THREE.Group(); detail.name = 'expanse2_detail'; group.add(detail);
  const dressingDetail = new THREE.Group(); dressingDetail.name = 'expanse2_dressing_detail'; group.add(dressingDetail);
  const tiles = [{
    index: 0, root: group, center: grid.centers[0], flipped: false,
    detail, dressingDetail, box: bounds.clone(),
  }];

  const ray = new THREE.Ray();
  function localRaycast(origin, direction, far = 140) {
    ray.origin.copy(origin);
    ray.direction.copy(direction);
    return bvh.raycastFirst(ray, THREE.DoubleSide, 0, far) || null;
  }
  function findGround(x, z) {
    const hit = localRaycast(new THREE.Vector3(x, 90, z), DOWN, 130);
    if (!hit?.point || !hit.face) return null;
    return hit.face.normal.y > 0.88 ? hit : null;
  }
  function clearSkyLocal(x, y, z) {
    return !localRaycast(new THREE.Vector3(x, y + 1.6, z), UP, 12);
  }

  onPhase?.(88, '배달 지점 배치 중 · Placing delivery points');
  const deliveryAnchors = createDeliveryAnchors(roadGraph, findGround);
  const points = deliveryAnchors.map((anchor) => anchor.point);

  const spawnGround = findGround(layout.spawn.position.x, layout.spawn.position.z);
  const spawn = {
    position: (spawnGround?.point.clone() || layout.spawn.position.clone()).add(new THREE.Vector3(0, 0.8, 0)),
    heading: layout.spawn.heading,
    tile: 0,
  };
  // Only skeleton junctions are reset points: an alley corner is a legal node
  // but a bad place to put a player back on the road.
  const resetNodes = roadGraph.nodes.filter((node) => node.skeleton);
  const safeResetPoints = (resetNodes.length ? resetNodes : roadGraph.nodes).map((node) => {
    const ground = findGround(node.position.x, node.position.z);
    return {
      position: (ground?.point.clone() || node.position.clone()).add(new THREE.Vector3(0, 0.8, 0)),
      heading: 0,
      tile: 0,
    };
  });
  function getSafeReset(position) {
    const projection = roadGraph.project(position);
    if (projection) {
      const ground = findGround(projection.position.x, projection.position.z);
      return {
        position: (ground?.point.clone() || projection.position.clone()).add(new THREE.Vector3(0, 0.8, 0)),
        heading: projection.heading,
        tile: 0,
      };
    }
    return safeResetPoints.reduce((best, next) =>
      next.position.distanceToSquared(position) < best.position.distanceToSquared(position) ? next : best,
    safeResetPoints[0]);
  }

  const streetlights = new StreetlightPool(scene, {
    size: NIGHT.lampCount, range: NIGHT.lampRange, intensity: NIGHT.lampIntensity,
    glowOpacity: NIGHT.glowOpacity, glowRadius: NIGHT.glowRadius,
  });
  // Lamps take their colour from the district they stand in. It is the same
  // `glow` hex the facade rule paints with, so a neighbourhood's light and its
  // walls agree — and that agreement is most of why a district reads at 200 m.
  streetlights.setAnchors(roadGraph.nodes.map((node) => {
    const palette = expanseDistrictAt(node.position.x, node.position.z);
    return {
      position: node.position.clone().add(new THREE.Vector3(2.5, 0, 2.5)),
      lamp: palette?.lamp ?? 0xffb46a,
      glow: palette?.glow ?? 0xff9a4a,
    };
  }));

  const wetMaterials = [roadMat, bridgeMat];
  const roadSnapshots = wetMaterials.map((material) => ({
    material, roughness: material.roughness, envMapIntensity: material.envMapIntensity,
    color: material.color.clone(),
  }));
  function setWetness(wetness) {
    for (const snapshot of roadSnapshots) {
      snapshot.material.roughness = snapshot.roughness * (1 - 0.6 * wetness);
      snapshot.material.envMapIntensity = snapshot.envMapIntensity + wetness * 1.25;
      snapshot.material.color.copy(snapshot.color).multiplyScalar(1 - wetness * 0.22);
    }
  }

  let cullDistance = 760;
  let detailDistance = 280;
  let chunkStats = updateExpanseVisualChunks(chunkGrid, spawn.position, {
    cullDistance, detailDistance, microDistance: detailDistance * 0.56,
  });
  function update(dt, camera) {
    streetlights.update(dt, camera.position);
    chunkStats = updateExpanseVisualChunks(chunkGrid, camera.position, {
      cullDistance,
      detailDistance: Math.min(detailDistance, cullDistance * 0.78),
      microDistance: Math.min(detailDistance * 0.56, cullDistance * 0.44),
    });
  }

  const roadBox = new THREE.Box3().setFromPoints(streets.edges.flatMap((edge) => edge.points));
  const roadHalf = Math.max(...streets.edges.map((edge) => edge.width)) * 0.5;
  roadBox.min.x -= roadHalf; roadBox.max.x += roadHalf;
  roadBox.min.z -= roadHalf; roadBox.max.z += roadHalf;
  roadBox.min.y = 0; roadBox.max.y = 6;

  // The city map draws `layout.buildingBlocks` as footprints. Hand it the real
  // massing rather than the 18 authored masses this world replaced.
  const mapLayout = {
    ...layout,
    buildingBlocks: massing.buildings.map((building) => {
      let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
      for (const corner of building.footprint) {
        if (corner.x < minX) minX = corner.x;
        if (corner.x > maxX) maxX = corner.x;
        if (corner.z < minZ) minZ = corner.z;
        if (corner.z > maxZ) maxZ = corner.z;
      }
      return {
        id: building.id, x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5,
        sx: maxX - minX, sz: maxZ - minZ, h: building.top, district: building.district,
      };
    }),
  };

  onPhase?.(94, '서울 익스팬스 그레이박스 준비 완료 · Expanse greybox ready');
  return {
    group, tiles, grid, bvh, colliderGeo, raycast: localRaycast, localRaycast,
    findGround, findGroundLocal: findGround, clearSkyLocal,
    spawn, safeResetPoints, getSafeReset,
    bounds, tileBounds: bounds.clone(), districtBounds: bounds.clone(), worldBounds: bounds.clone(),
    roadBox,
    points, localPoints: points,
    // M5 owns shops and the delivery loop. Until then the order system binds
    // restaurants to delivery anchors, which is its documented fallback.
    pickupSites: [],
    roadGraph, deliveryAnchors,
    visualChunks: chunkGrid,
    expanseData: { layout: mapLayout, streets, plan, massing, facades, shops: [] },
    projectToRoad: (position) => roadGraph.project(position),
    findRoute: (start, destination) => roadGraph.findRoute(start, destination),
    roadMaterials: wetMaterials,
    // Windows, shop interiors and signage all ride the day/night emissive
    // boost. They are baked at different brightnesses on purpose, so one
    // multiplier lands right on a lit room and on a neon tube at the same time.
    emissiveMaterials: facadeMeshes.emissiveMaterials,
    setWetness, update,
    fog: nightRig.fog, nightRig,
    lights: { hemi: nightRig.hemi, amb: nightRig.amb, moon: nightRig.moon, streetlights },
    stats: {
      buildings: massing.stats.buildings,
      triangles: colliderGeo.attributes.position.count / 3,
      tiles: 1,
      roadNodes: roadGraph.nodes.length,
      roadEdges: roadGraph.edges.length,
      pavedEdges,
      skippedEdges,
      blocks: plan.stats.blocks,
      lots: plan.stats.lots,
      pavements: pavementPads,
      massingVolumes: massing.stats.volumes,
      massingTriangles: facadeMeshes.triangles,
      collisionTriangles: colliderGeo.attributes.position.count / 3,
      drawCalls,
      materials: 5 + facadeMeshes.materials.length,
      shopfronts: facades.stats.shopfronts,
      signs: facades.stats.signs,
      awnings: facades.stats.awnings,
      parapets: facades.stats.parapets,
      airConditioners: facades.stats.acUnits,
      tallest: massing.stats.tallest,
      pavedKm: streets.stats.pavedKm,
      visualChunks: chunkGrid.chunks.length,
    },
    killY: -5,
    get chunkStats() { return chunkStats; },
    get cullDistance() { return cullDistance; }, set cullDistance(value) { cullDistance = value; },
    get detailDistance() { return detailDistance; }, set detailDistance(value) { detailDistance = value; },
  };
}
