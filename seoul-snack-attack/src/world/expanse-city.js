// Seoul Expanse playable runtime world.
import * as THREE from 'three';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeTileGrid } from './tiling.js';
import { createRoadGraph, createDeliveryAnchors, validateRoadGraph } from './road-network.js';
import { StreetlightPool } from './streetlights.js';
import { createNightRig, NIGHT } from './lighting.js';
import { generateExpanseLayout } from './expanse-layout.js';
import { buildExpanseDressing } from './expanse-dressing.js';
import { buildExpanseStreetLife } from './expanse-street-life.js';
import { buildExpanseShops } from './expanse-shops.js';
import { updateExpanseVisualChunks } from './expanse-chunks.js';
import { buildExpanseRoadArt } from './expanse-road-art.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_N = new THREE.Vector3();

function roadGeometry(points, width) {
  const vertices = [];
  const half = width * 0.5;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    TMP_A.copy(b).sub(a).setY(0);
    if (TMP_A.lengthSq() < 1e-6) continue;
    TMP_A.normalize();
    TMP_N.set(-TMP_A.z, 0, TMP_A.x).multiplyScalar(half);
    const al = TMP_B.copy(a).add(TMP_N).clone();
    const ar = a.clone().sub(TMP_N);
    const bl = b.clone().add(TMP_N);
    const br = b.clone().sub(TMP_N);
    vertices.push(al.x, al.y, al.z, bl.x, bl.y, bl.z, br.x, br.y, br.z);
    vertices.push(al.x, al.y, al.z, br.x, br.y, br.z, ar.x, ar.y, ar.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function collisionRoadGeometry(points, width) {
  const source = roadGeometry(points, width);
  source.deleteAttribute('uv');
  return source;
}

function translatedBox(width, height, depth, x, y, z) {
  const source = new THREE.BoxGeometry(width, height, depth);
  source.translate(x, y, z);
  const geometry = source.toNonIndexed();
  source.dispose();
  geometry.deleteAttribute('uv');
  return geometry;
}

function makeBridgeSupports(group, material, layout) {
  for (const bridge of layout.edges.filter((edge) => edge.bridge)) {
    const samples = [0.38, 0.62];
    for (const fraction of samples) {
      const index = Math.min(bridge.points.length - 1, Math.round((bridge.points.length - 1) * fraction));
      const point = bridge.points[index];
      const pier = new THREE.Mesh(new THREE.BoxGeometry(4, 3.6, 5), material);
      pier.position.set(point.x, 1.8, point.z);
      group.add(pier);
    }
  }
}

function makeHillSilhouette(group, material) {
  const hill = new THREE.Mesh(new THREE.ConeGeometry(210, 76, 7), material);
  hill.name = 'expanse_hills_silhouette';
  hill.position.set(-210, 36, -455);
  hill.rotation.y = Math.PI / 6;
  group.add(hill);
}

export async function loadExpanseCity(scene, _manager, renderer = null, onPhase = null) {
  onPhase?.(8, '서울 익스팬스 안전 설계도 복원 중 · Restoring playable Seoul Expanse');
  const layout = generateExpanseLayout();
  const group = new THREE.Group();
  group.name = 'seoul_expanse_playable_runtime';
  scene.add(group);
  const nightRig = createNightRig(scene, renderer);
  // The shared presets were tuned around the compact original city.  Preserve
  // their palette and lighting, but extend clear driving sightlines for this
  // kilometre-scale world (FogExp2 otherwise erases an overview completely).
  const setPreset = nightRig.setPreset.bind(nightRig);
  nightRig.setPreset = (mode) => {
    const params = setPreset(mode);
    params.fogDensity = mode === 'day' ? 0.00045 : 0.0012;
    nightRig.apply();
    return params;
  };

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1c2930, roughness: 0.96, metalness: 0.02 });
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x40515d, roughness: 0.72, metalness: 0.12 });
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x4a5c68, roughness: 0.7, metalness: 0.16 });
  const riverMat = new THREE.MeshStandardMaterial({ color: 0x2a708d, roughness: 0.25, metalness: 0.42 });
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x283d37, roughness: 0.92 });
  const buildingMats = layout.districts.map((district) => new THREE.MeshStandardMaterial({
    color: district.color, roughness: 0.88, metalness: 0.04,
  }));

  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(
    layout.bounds.maxX - layout.bounds.minX + 120,
    layout.bounds.maxZ - layout.bounds.minZ + 120,
  ), groundMat);
  terrain.name = 'expanse_visual_ground';
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.12;
  group.add(terrain);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(
    layout.river.maxX - layout.river.minX,
    layout.river.maxZ - layout.river.minZ,
  ), riverMat);
  water.name = 'expanse_visual_river';
  water.rotation.x = -Math.PI / 2;
  water.position.set(
    (layout.river.minX + layout.river.maxX) * 0.5,
    layout.river.y,
    (layout.river.minZ + layout.river.maxZ) * 0.5,
  );
  group.add(water);

  onPhase?.(20, '검증된 도로망 생성 중 · Building validated road network');
  const collisionParts = [];
  for (const edge of layout.edges) {
    const geometry = roadGeometry(edge.points, edge.width);
    const road = new THREE.Mesh(geometry, roadMat);
    road.name = `road_${edge.id}`;
    group.add(road);
    collisionParts.push(collisionRoadGeometry(edge.points, edge.width));
  }

  for (const block of layout.buildingBlocks) {
    const visual = new THREE.Mesh(
      new THREE.BoxGeometry(block.sx, block.h, block.sz),
      buildingMats[block.district],
    );
    visual.name = `greybox_${block.id}`;
    visual.position.set(block.x, block.h * 0.5, block.z);
    group.add(visual);
    collisionParts.push(translatedBox(block.sx, block.h, block.sz, block.x, block.h * 0.5, block.z));
  }
  makeBridgeSupports(group, bridgeMat, layout);
  makeHillSilhouette(group, hillMat);
  const dressing = buildExpanseDressing(group, layout);
  const streetLife = buildExpanseStreetLife(group, layout);
  const shops = buildExpanseShops(group, layout);
  const roadArt = buildExpanseRoadArt(group, layout);
  collisionParts.push(...dressing.collisionParts, ...streetLife.collisionParts);

  const bounds = new THREE.Box3(
    new THREE.Vector3(layout.bounds.minX, -6, layout.bounds.minZ),
    new THREE.Vector3(layout.bounds.maxX, 58, layout.bounds.maxZ),
  );
  const roadGraph = createRoadGraph({ nodes: layout.nodes, edges: layout.edges, bounds, roadWidth: 10 });
  roadGraph.districts = layout.districts;
  const topology = validateRoadGraph(roadGraph);
  if (!topology.ok) throw new Error(`Seoul Expanse graph invalid: ${topology.errors.join('; ')}`);

  onPhase?.(55, '도로와 건물 충돌 인덱싱 중 · Indexing road and building collision');
  const colliderGeo = mergeGeometries(collisionParts, false);
  colliderGeo.computeBoundingBox();
  colliderGeo.computeBoundingSphere();
  const worker = new GenerateMeshBVHWorker();
  let bvh;
  try {
    bvh = await worker.generate(colliderGeo, {
      onProgress: (progress) => onPhase?.(55 + progress * 28,
        `도로 충돌 인덱싱 중 · Indexing Expanse collision ${Math.round(progress * 100)}%`),
    });
  } finally {
    worker.dispose();
  }
  colliderGeo.boundsTree = bvh;

  const grid = makeTileGrid({ tileBox: bounds.clone(), cols: 1, rows: 1, flipOddRows: false, overhang: 0 });
  const detail = new THREE.Group(); detail.name = 'expanse_detail'; group.add(detail);
  const dressingDetail = new THREE.Group(); dressingDetail.name = 'expanse_dressing_detail'; group.add(dressingDetail);
  const tiles = [{ index: 0, root: group, center: grid.centers[0], flipped: false, detail, dressingDetail, box: bounds.clone() }];

  const ray = new THREE.Ray();
  function localRaycast(origin, direction, far = 120) {
    ray.origin.copy(origin);
    ray.direction.copy(direction);
    return bvh.raycastFirst(ray, THREE.DoubleSide, 0, far) || null;
  }
  function findGround(x, z) {
    const hit = localRaycast(new THREE.Vector3(x, 70, z), DOWN, 90);
    if (!hit?.point || !hit.face) return null;
    return hit.face.normal.y > 0.88 ? hit : null;
  }
  function clearSkyLocal(x, y, z) {
    return !localRaycast(new THREE.Vector3(x, y + 1.6, z), UP, 12);
  }

  const deliveryAnchors = createDeliveryAnchors(roadGraph, findGround);
  const points = deliveryAnchors.map((anchor) => anchor.point);
  const pickupSites = shops.pickupSites.map((site) => {
    const ground = findGround(site.point.x, site.point.z);
    const point = ground?.point.clone() || site.point.clone();
    point.y += 0.06;
    const anchor = deliveryAnchors.reduce((best, candidate) =>
      candidate.point.distanceToSquared(point) < best.point.distanceToSquared(point) ? candidate : best,
    deliveryAnchors[0]);
    return { ...site, point, anchor };
  });

  const spawnGround = findGround(layout.spawn.position.x, layout.spawn.position.z);
  const spawn = {
    position: (spawnGround?.point.clone() || layout.spawn.position.clone()).add(new THREE.Vector3(0, 0.8, 0)),
    heading: layout.spawn.heading,
    tile: 0,
  };
  const safeResetPoints = roadGraph.nodes.map((node) => {
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
      return { position: (ground?.point.clone() || projection.position.clone()).add(new THREE.Vector3(0, 0.8, 0)), heading: projection.heading, tile: 0 };
    }
    return safeResetPoints.reduce((best, next) =>
      next.position.distanceToSquared(position) < best.position.distanceToSquared(position) ? next : best,
    safeResetPoints[0]);
  }

  const streetlights = new StreetlightPool(scene, {
    size: NIGHT.lampCount, range: NIGHT.lampRange, intensity: NIGHT.lampIntensity,
    glowOpacity: NIGHT.glowOpacity, glowRadius: NIGHT.glowRadius,
  });
  streetlights.setAnchors([
    ...roadGraph.nodes.map((node) => ({
      position: node.position.clone().add(new THREE.Vector3(2.5, 0, 2.5)),
      lamp: 0xffb46a, glow: 0xff9a4a,
    })),
    ...dressing.streetlightAnchors,
    ...streetLife.streetlightAnchors,
    ...shops.streetlightAnchors,
  ]);

  const wetMaterials = [roadMat];
  const roadSnapshots = wetMaterials.map((material) => ({
    material, roughness: material.roughness, envMapIntensity: material.envMapIntensity, color: material.color.clone(),
  }));
  function setWetness(wetness) {
    for (const snapshot of roadSnapshots) {
      snapshot.material.roughness = snapshot.roughness * (1 - 0.6 * wetness);
      snapshot.material.envMapIntensity = snapshot.envMapIntensity + wetness * 1.25;
      snapshot.material.color.copy(snapshot.color).multiplyScalar(1 - wetness * 0.22);
    }
  }

  let cullDistance = 720;
  let detailDistance = 260;
  let chunkStats = updateExpanseVisualChunks(streetLife.visualChunks, spawn.position, {
    cullDistance, detailDistance, microDistance: detailDistance * 0.56,
  });
  function update(dt, camera) {
    streetlights.update(dt, camera.position);
    chunkStats = updateExpanseVisualChunks(streetLife.visualChunks, camera.position, {
      cullDistance,
      detailDistance: Math.min(detailDistance, cullDistance * 0.78),
      microDistance: Math.min(detailDistance * 0.56, cullDistance * 0.44),
    });
  }

  onPhase?.(90, '서울 익스팬스 준비 완료 · Playable Seoul Expanse ready');
  const roadHalf = Math.max(...layout.edges.map((edge) => edge.width)) * 0.5;
  const roadBox = new THREE.Box3().setFromPoints(layout.edges.flatMap((edge) => edge.points));
  roadBox.min.x -= roadHalf; roadBox.max.x += roadHalf;
  roadBox.min.z -= roadHalf; roadBox.max.z += roadHalf;
  roadBox.min.y = 0; roadBox.max.y = 4;

  return {
    group, tiles, grid, bvh, colliderGeo, raycast: localRaycast, localRaycast,
    findGround, findGroundLocal: findGround, clearSkyLocal,
    spawn, safeResetPoints, getSafeReset, bounds, tileBounds: bounds.clone(), districtBounds: bounds.clone(), worldBounds: bounds.clone(),
    roadBox,
    points, localPoints: points, pickupSites, roadGraph, deliveryAnchors,
    visualChunks: streetLife.visualChunks,
    expanseData: { layout, shops: shops.pickupSites, streetLife: streetLife.records },
    projectToRoad: (position) => roadGraph.project(position),
    findRoute: (start, destination) => roadGraph.findRoute(start, destination),
    roadMaterials: wetMaterials,
    emissiveMaterials: [
      ...dressing.emissiveMaterials, ...streetLife.emissiveMaterials,
      ...shops.emissiveMaterials, ...roadArt.emissiveMaterials,
    ],
    setWetness, update,
    fog: nightRig.fog, nightRig,
    lights: { hemi: nightRig.hemi, amb: nightRig.amb, moon: nightRig.moon, streetlights },
    stats: {
      buildings: layout.buildingBlocks.length,
      triangles: colliderGeo.attributes.position.count / 3,
      tiles: 1,
      roadNodes: roadGraph.nodes.length,
      roadEdges: roadGraph.edges.length,
      ringLengthHint: layout.ring.lengthHint,
      dressedFacades: dressing.stats.facades,
      secondaryBuildings: streetLife.stats.secondaryBuildings,
      trees: streetLife.stats.trees,
      parkedCars: streetLife.stats.parkedCars,
      busStops: streetLife.stats.busStops,
      labelledShops: shops.stats.shops,
      visualChunks: streetLife.visualChunks.chunks.length,
      roadEdgesDressed: roadArt.stats.roadEdgesDressed,
      bridgeSilhouettes: roadArt.stats.bridgeSilhouettes,
    },
    killY: -5,
    get chunkStats() { return chunkStats; },
    get cullDistance() { return cullDistance; }, set cullDistance(value) { cullDistance = value; },
    get detailDistance() { return detailDistance; }, set detailDistance(value) { detailDistance = value; },
  };
}
