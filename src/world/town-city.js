// 밤내 Bamnae — the runtime world, behind `?world=town`.
//
// T1. Thin on purpose, exactly like expanse2-city.js: it owns collision,
// lighting and the world contract, and it authors no geometry of its own.
// Every triangle comes out of `town-ground.js`, which comes out of
// `town-terrain.js`, which the Node gate measures. The preview page and the
// Blender export build from the same two modules, so what you drive, what you
// orbit and what renders are the same surface by construction.
//
// TWO THINGS DIFFER FROM THE EXPANSE, AND BOTH FOLLOW FROM THE HEIGHT FIELD.
//
//   1. **Collision is the terrain.** The Expanse's drivable surface is four
//      flat quads with the river cut out, because 452 overlapping carriageways
//      could not all be collision slabs. Here there is one heightfield and the
//      roads are already flattened into it by the conform, so the terrain IS
//      the road. The ribbons go in too — they sit 4 cm proud, so the wheels
//      contact the visible surface rather than a centimetre under it — but
//      they are a courtesy, not the structure.
//
//   2. **The stream is a trench, not a hole.** The Expanse cuts its river out
//      of the ground so driving off the quay is a fall. 밤내 is part of the
//      same surface: the banks are real geometry, and if you put the pocha
//      down the revetment you land in the channel and have to drive out of it.
//      That is the correct answer for a 7 m stream — a hole would make a
//      knee-deep creek lethal.
//
// NOT BUILT YET. No plots, no buildings, no props, no signage, no road paint.
// T1 is the valley and the roads: enough to drive and to judge, nothing more.
import * as THREE from 'three';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeTileGrid } from './tiling.js';
import { createRoadGraph, createDeliveryAnchors, validateRoadGraph } from './road-network.js';
import { createNightRig, NIGHT } from './lighting.js';
import { StreetlightPool } from './streetlights.js';
import { generateTownLayout, townDistrictAt } from './town-layout.js';
import { createTownTerrain } from './town-terrain.js';
import { buildTownSurfaces, GROUND_CELL } from './town-ground.js';
import { createExpanseSurfaceTextures, SURFACE_TILE } from './expanse-surface-art.js';
import { DISTRICT_BY_ID } from './data/color-bible.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Below the deepest thing you can legitimately be standing on. The weir pool's
 * bed bottoms out at -3 m and the channel is drivable, so a kill plane at the
 * Expanse's -5 would delete anyone who drove into the stream — which is a
 * thing this world specifically allows.
 */
const KILL_Y = -14;

/**
 * Landform tints, multiplied over the generated ground texture.
 *
 * Vertex colour rather than a second texture set: the bands are 40 m wide and
 * hundreds of metres long, which is exactly the scale a tiling texture cannot
 * express and a per-vertex tint can, for free. These are muted on purpose —
 * they modulate the surface, they are not the surface.
 */
// These are ALBEDOS, not tints over a white material, and they sit in the same
// brightness band as the Expanse's ground (0x1c2028 — about 0.11, 0.13, 0.16).
// The first version treated them as tints and left the material white, which
// is an order of magnitude too bright: 밤내 came out as a snowfield under the
// day rig, and no amount of lighting work fixes an albedo that wrong.
const TINT = {
  bed: [0.17, 0.18, 0.17],      // stream bed and concrete revetment
  paddy: [0.20, 0.24, 0.12],    // 터미널 fields
  floor: [0.19, 0.19, 0.15],    // valley floor, packed earth and dry grass
  apron: [0.13, 0.18, 0.11],    // 윗말's terraced hillside
  mountain: [0.09, 0.13, 0.09], // the 산 above it
  rock: [0.22, 0.21, 0.19],     // anything too steep to hold soil
};

function tintFor(y, slope, z) {
  if (slope > 0.55) return TINT.rock;
  if (y < 1.1) return TINT.bed;
  if (z > 110 && slope < 0.05) return TINT.paddy;
  if (y < 8) return TINT.floor;
  if (y < 33) return TINT.apron;
  return TINT.mountain;
}

/** Strip a built surface down to a position-only geometry for the collider. */
function toCollision(positions, indices) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
  geo.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
  return geo.toNonIndexed();
}

export async function loadTownCity(scene, manager, renderer, onPhase, options = {}) {
  const started = performance.now();
  const { detailIntensity = 1 } = options;
  const phase = async (value, label) => {
    onPhase?.(value, label);
    // Yield so the loading bar actually paints between phases.
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  await phase(8, '밤내 측량 중 · Surveying Bamnae');
  const layout = generateTownLayout();
  const terrain = createTownTerrain(layout);

  await phase(18, '골짜기 빚는 중 · Shaping the valley');
  const surfaces = buildTownSurfaces(terrain);

  await phase(34, '지표 생성 중 · Generating ground surfaces');
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const pool = createExpanseSurfaceTextures(detailIntensity, { anisotropy });

  const group = new THREE.Group();
  group.name = 'town';
  scene.add(group);

  // ---- ground ---------------------------------------------------------------
  const groundGeo = new THREE.BufferGeometry();
  groundGeo.setAttribute('position', new THREE.BufferAttribute(surfaces.ground.positions, 3));
  groundGeo.setAttribute('normal', new THREE.BufferAttribute(surfaces.ground.normals, 3));
  groundGeo.setAttribute('uv', new THREE.BufferAttribute(surfaces.ground.uvs, 2));
  groundGeo.setIndex(new THREE.BufferAttribute(surfaces.ground.indices, 1));

  const vertexCount = surfaces.ground.positions.length / 3;
  const colours = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    const y = surfaces.ground.positions[i * 3 + 1];
    const z = surfaces.ground.positions[i * 3 + 2];
    const ny = surfaces.ground.normals[i * 3 + 1];
    const slope = Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(ny, 1e-4);
    const tint = tintFor(y, slope, z);
    colours[i * 3] = tint[0];
    colours[i * 3 + 1] = tint[1];
    colours[i * 3 + 2] = tint[2];
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colours, 3));

  // The pool's `ground` entry carries NO albedo map — only normal and rough.
  // That is deliberate upstream: the Expanse tints its ground by material
  // colour, and here that job belongs to the vertex tints above.
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.96, metalness: 0, vertexColors: true,
    normalMap: pool?.ground.normal ?? null,
    roughnessMap: pool?.ground.rough ?? null,
  });
  if (pool) {
    // The mesh bakes metres into its UVs (GROUND_UV), so the texture repeat is
    // a ratio between that and the pool's own tile size, not an absolute.
    for (const map of [pool.ground.normal, pool.ground.rough]) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(12 / SURFACE_TILE.ground, 12 / SURFACE_TILE.ground);
    }
    groundMat.normalScale.set(0.6, 0.6);
  }
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = 'town_ground';
  group.add(ground);

  // ---- water ----------------------------------------------------------------
  await phase(44, '밤내 채우는 중 · Filling the stream');
  const waterGeo = new THREE.BufferGeometry();
  waterGeo.setAttribute('position', new THREE.BufferAttribute(surfaces.water.positions, 3));
  waterGeo.setAttribute('uv', new THREE.BufferAttribute(surfaces.water.uvs, 2));
  waterGeo.setIndex(new THREE.BufferAttribute(surfaces.water.indices, 1));
  waterGeo.computeVertexNormals();
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1d5a74, roughness: 0.25, metalness: 0.42,
    transparent: true, opacity: 0.84, depthWrite: false,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.name = 'town_water';
  // Water is NOT in the collider. The channel's bed and banks are real ground
  // and you can drive them; the surface is a sheet you pass through.
  group.add(water);

  // ---- roads ----------------------------------------------------------------
  await phase(52, '길 포장 중 · Paving the streets');
  const ROAD_MATS = {
    asphalt: new THREE.MeshStandardMaterial({
      // Same asphalt the Expanse paints with, so the two worlds' roads read as
      // the same material under the same colour bible.
      color: 0x3b444e, roughness: 0.72, metalness: 0.12,
      map: pool?.asphalt.map ?? null,
      normalMap: pool?.asphalt.normal ?? null,
      roughnessMap: pool?.asphalt.rough ?? null,
    }),
    alley: new THREE.MeshStandardMaterial({
      color: 0x565049, roughness: 0.94, metalness: 0.02,
      map: pool?.paving.map ?? null,
      normalMap: pool?.paving.normal ?? null,
      roughnessMap: pool?.paving.rough ?? null,
    }),
    // 윗말3길 and its climbs. Unpaved is a real material difference, not a
    // colour swap: it takes the ground pool, not the asphalt one, so the track
    // reads as graded earth sitting on the hillside rather than a narrow road.
    track: new THREE.MeshStandardMaterial({
      color: 0x463c2c, roughness: 0.99, metalness: 0,
      normalMap: pool?.ground.normal ?? null,
      roughnessMap: pool?.ground.rough ?? null,
    }),
    bridge: new THREE.MeshStandardMaterial({ color: 0x4a5460, roughness: 0.7, metalness: 0.16 }),
  };

  const roadsRoot = new THREE.Group();
  roadsRoot.name = 'town_roads';
  group.add(roadsRoot);

  const collisionParts = [toCollision(surfaces.ground.positions, surfaces.ground.indices)];
  const roadMaterials = [];
  for (const road of surfaces.roads) {
    const material = road.bridge ? ROAD_MATS.bridge
      : road.kind === 'track' ? ROAD_MATS.track
      : road.kind === 'alley' ? ROAD_MATS.alley
      : ROAD_MATS.asphalt;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(road.positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(road.uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(road.indices, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `road_${road.id}`;
    roadsRoot.add(mesh);
    collisionParts.push(toCollision(road.positions, road.indices));
  }
  for (const material of Object.values(ROAD_MATS)) {
    for (const map of [material.map, material.normalMap, material.roughnessMap]) {
      if (!map) continue;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
    }
    roadMaterials.push(material);
  }

  // ---- collision ------------------------------------------------------------
  await phase(60, '충돌 인덱싱 중 · Indexing collision');
  const colliderGeo = mergeGeometries(collisionParts, false);
  for (const part of collisionParts) part.dispose();
  colliderGeo.computeBoundingBox();
  colliderGeo.computeBoundingSphere();
  const worker = new GenerateMeshBVHWorker();
  let bvh;
  try {
    bvh = await worker.generate(colliderGeo, {
      onProgress: (progress) => onPhase?.(60 + progress * 24,
        `충돌 인덱싱 중 · Indexing collision ${Math.round(progress * 100)}%`),
    });
  } finally {
    worker.dispose();
  }
  colliderGeo.boundsTree = bvh;

  const ray = new THREE.Ray();
  function localRaycast(origin, direction, far = 200) {
    ray.origin.copy(origin);
    ray.direction.copy(direction);
    return bvh.raycastFirst(ray, THREE.DoubleSide, 0, far) || null;
  }
  /**
   * The drop is from 140 m, not the Expanse's 90: the ridge tops out over
   * 100 m and a ray that starts under the mountain finds nothing.
   */
  function findGround(x, z) {
    const hit = localRaycast(new THREE.Vector3(x, 140, z), DOWN, 200);
    if (!hit?.point || !hit.face) return null;
    return hit.face.normal.y > 0.7 ? hit : null;
  }
  function clearSkyLocal(x, y, z) {
    return !localRaycast(new THREE.Vector3(x, y + 1.6, z), UP, 12);
  }

  // ---- roads as a graph -----------------------------------------------------
  await phase(86, '배달 지점 배치 중 · Placing delivery points');
  const bounds = new THREE.Box3(
    new THREE.Vector3(layout.bounds.minX - layout.margin, KILL_Y, layout.bounds.minZ - layout.margin),
    new THREE.Vector3(layout.bounds.maxX + layout.margin, 130, layout.bounds.maxZ + layout.margin),
  );
  const roadGraph = createRoadGraph({
    nodes: layout.nodes, edges: layout.edges, bounds, roadWidth: 7,
  });
  roadGraph.districts = layout.districts;
  const topology = validateRoadGraph(roadGraph);
  if (!topology.ok) throw new Error(`Bamnae graph invalid: ${topology.errors.join('; ')}`);

  const deliveryAnchors = createDeliveryAnchors(roadGraph, findGround);
  const points = deliveryAnchors.map((anchor) => anchor.point);

  const spawnGround = findGround(layout.spawn.position.x, layout.spawn.position.z);
  const spawn = {
    position: (spawnGround?.point.clone() || layout.spawn.position.clone())
      .add(new THREE.Vector3(0, 0.8, 0)),
    heading: layout.spawn.heading,
    tile: 0,
  };
  const safeResetPoints = roadGraph.nodes.map((node) => {
    const hit = findGround(node.position.x, node.position.z);
    return {
      position: (hit?.point.clone() || node.position.clone()).add(new THREE.Vector3(0, 0.8, 0)),
      heading: 0,
      tile: 0,
    };
  });
  function getSafeReset(position) {
    const projection = roadGraph.project(position);
    if (projection) {
      const hit = findGround(projection.position.x, projection.position.z);
      return {
        position: (hit?.point.clone() || projection.position.clone())
          .add(new THREE.Vector3(0, 0.8, 0)),
        heading: projection.heading,
        tile: 0,
      };
    }
    return safeResetPoints.reduce((best, next) =>
      next.position.distanceToSquared(position) < best.position.distanceToSquared(position)
        ? next : best, safeResetPoints[0]);
  }

  // ---- light ----------------------------------------------------------------
  await phase(90, '해 기울이는 중 · Hanging the sun');
  // A third of the Expanse's fog. Its presets put half visibility at 113 m by
  // day, which is right for a city street and wrong for a valley: the ridge is
  // 220 m from 중앙로 and the far wall 300, so at that density the enclosure
  // this world was rebuilt to have is invisible from inside it. At 0.33 the
  // ridge reads at ~90% by day and as a silhouette in haze at night.
  const nightRig = createNightRig(scene, renderer, { fogScale: 0.33 });
  const streetlights = new StreetlightPool(scene, {
    size: NIGHT.lampCount, range: NIGHT.lampRange, intensity: NIGHT.lampIntensity,
    glowOpacity: NIGHT.glowOpacity, glowRadius: NIGHT.glowRadius,
  });
  // A lamp takes the colour of the quarter it stands in, the same hex the
  // facade rule will paint with when T3 gets here. 윗말's track is skipped:
  // an unlit dirt lane is the point of it.
  streetlights.setAnchors(roadGraph.nodes
    .filter((node) => roadGraph.adjacency.get(node.id)
      ?.some((item) => item.edge.kind !== 'track'))
    .map((node) => {
      const quarter = townDistrictAt(node.position.x, node.position.z);
      const palette = DISTRICT_BY_ID[quarter.id];
      const hit = findGround(node.position.x, node.position.z);
      const base = hit?.point.clone() || node.position.clone();
      return {
        position: base.add(new THREE.Vector3(2.2, 0, 2.2)),
        lamp: palette?.lamp ?? 0xffb46a,
        glow: palette?.glow ?? 0xff9a4a,
      };
    }));

  const wetSnapshots = roadMaterials.map((material) => ({
    material, roughness: material.roughness, envMapIntensity: material.envMapIntensity,
    color: material.color.clone(),
  }));
  function setWetness(wetness) {
    for (const snapshot of wetSnapshots) {
      snapshot.material.roughness = snapshot.roughness * (1 - 0.6 * wetness);
      snapshot.material.envMapIntensity = snapshot.envMapIntensity + wetness * 1.25;
      snapshot.material.color.copy(snapshot.color).multiplyScalar(1 - wetness * 0.22);
    }
  }

  function update(dt, camera) {
    streetlights.update(dt, camera.position);
  }

  const grid = makeTileGrid({ tileBox: bounds.clone(), cols: 1, rows: 1, flipOddRows: false, overhang: 0 });
  const detail = new THREE.Group(); detail.name = 'town_detail'; group.add(detail);
  const dressingDetail = new THREE.Group(); dressingDetail.name = 'town_dressing'; group.add(dressingDetail);
  const tiles = [{
    index: 0, root: group, center: grid.centers[0], flipped: false,
    detail, dressingDetail, box: bounds.clone(),
  }];

  const roadBox = new THREE.Box3().setFromPoints(layout.edges.flatMap((edge) => edge.points));
  const roadHalf = Math.max(...layout.edges.map((edge) => edge.width)) * 0.5;
  roadBox.min.x -= roadHalf; roadBox.max.x += roadHalf;
  roadBox.min.z -= roadHalf; roadBox.max.z += roadHalf;
  roadBox.min.y = KILL_Y; roadBox.max.y = 120;

  const roadTriangles = surfaces.roads.reduce((sum, road) => sum + road.indices.length / 3, 0);
  const pavedKm = layout.edges.reduce((sum, edge) => {
    let length = 0;
    for (let i = 1; i < edge.points.length; i++) {
      length += Math.hypot(edge.points[i].x - edge.points[i - 1].x, edge.points[i].z - edge.points[i - 1].z);
    }
    return sum + length;
  }, 0) / 1000;

  await phase(94, '밤내 준비 완료 · Bamnae ready');
  return {
    group, tiles, grid, bvh, colliderGeo,
    raycast: localRaycast, localRaycast,
    terrain, townData: { layout, terrain, surfaces },
    loadingStats: { totalMs: performance.now() - started },
    streamingPending: 0,
    findGround, findGroundLocal: findGround, clearSkyLocal,
    spawn, localSpawn: spawn.position.clone(), safeResetPoints, getSafeReset,
    bounds, tileBounds: bounds.clone(), districtBounds: bounds.clone(), worldBounds: bounds.clone(),
    roadBox,
    points, localPoints: points,
    // T1 has no shops yet, so the order loop binds its restaurants to road
    // anchors. That path already exists as the dressing-failure fallback.
    pickupSites: [],
    roadGraph, deliveryAnchors,
    // The map reads `layout` for quarters and street names. `buildingBlocks`
    // is empty because there are no buildings — T2 fills it.
    expanseData: { layout: { ...layout, buildingBlocks: [] } },
    projectToRoad: (position) => roadGraph.project(position),
    findRoute: (start, destination) => roadGraph.findRoute(start, destination),
    roadMaterials,
    emissiveMaterials: [],
    reliefMaterials: [groundMat, ...roadMaterials].filter((material) => material.normalMap),
    setWetness, update,
    fog: nightRig.fog, nightRig,
    lights: { hemi: nightRig.hemi, amb: nightRig.amb, moon: nightRig.moon, streetlights },
    stats: {
      buildings: 0,
      triangles: colliderGeo.attributes.position.count / 3,
      tiles: 1,
      roadNodes: roadGraph.nodes.length,
      roadEdges: roadGraph.edges.length,
      groundCell: GROUND_CELL,
      groundTriangles: surfaces.ground.indices.length / 3,
      roadTriangles,
      collisionTriangles: colliderGeo.attributes.position.count / 3,
      drawCalls: roadsRoot.children.length + 2,
      materials: 2 + Object.keys(ROAD_MATS).length,
      relief: `${surfaces.ground.grid.min.toFixed(1)}..${surfaces.ground.grid.max.toFixed(1)} m`,
      pavedKm,
      surfaceTextures: pool ? 9 : 0,
    },
    killY: KILL_Y,
    cullDistance: 1400,
    detailDistance: 400,
  };
}
