// Seoul Snack Attack — city world: GLB load, night lighting, emissive boost,
// merged static collision BVH, TILING, spawn + delivery point sampling,
// wet-look hooks.
//
// Tiling model: the GLB is one block. TILE_LAYOUT places copies of it at
// explicit positions/rotations (currently a two-district contiguous-fabric
// trial — see city-constants.js), with procedural connector decks built from
// the road graph and water at the rim. Exactly ONE MeshBVH is built, in
// tile-local space; src/world/tiling.js transforms rays into each tile instead
// of duplicating collision geometry, so boot cost and memory are independent of
// district count.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MeshBVH } from 'three-mesh-bvh';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
import { mulberry32 } from '../core/rng.js';
import { makeTileGrid } from './tiling.js';
import { createRoadGraph, createDeliveryAnchors, validateRoadGraph } from './road-network.js';
import { buildDistrictGraph } from './district-roads.js';
import { createConnectors } from './connectors.js';
import { createEndZones } from './end-zones.js';
import { StreetlightPool } from './streetlights.js';
import { createNightRig, blockPalette, NIGHT } from './lighting.js';
import { analyzeBlock, applyBlockVariant } from './block-variants.js';
import { prepareDistrict, enableBackfaceCulling, mergeStaticGroup } from './district-lod.js';
import { createSkyline } from './skyline.js';
import {
  CITY_SCALE, FOG_MESH_RE, ROAD_MAT_RE, isClipped, isWestOfRoadSlab,
  TILE_LAYOUT, TILE_COLS, TILE_ROWS, TILE_FLIP_ODD_ROWS, TILE_OVERHANG,
  TILE_CULL_DISTANCE, TILE_DETAIL_DISTANCE,
  TILE_REPEATING, STREET_WIDTH, STREET_Z_SOUTH,
} from './city-constants.js';

const ROAD_NAME_RE = /road|asphalt|street|ground|pavement|sidewalk|crossing|lane|tile|floor|curb|manhole/i;

export async function loadCity(scene, manager, url = 'assets/world/seoul-block.glb', renderer = null, onPhase = null) {
  const startedAt = performance.now();
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);

  const gltf = await loader.loadAsync(url);
  const block = gltf.scene;
  block.scale.setScalar(CITY_SCALE);
  block.updateMatrixWorld(true);

  // ---- Pass 1: inventory every mesh with its world box -------------------
  const meshes = []; // { obj, box, fog }
  const tmpBox = new THREE.Box3();
  const roadBox = new THREE.Box3().makeEmpty();

  block.traverse((obj) => {
    if (!obj.isMesh) return;
    const fog = FOG_MESH_RE.test(obj.name);
    if (fog) obj.visible = false; // artist's haze volume — we have real FogExp2
    const box = tmpBox.setFromObject(obj).clone();
    meshes.push({ obj, box, fog, clipped: false });

    if (fog) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    // The asphalt is a detailed `road` plane over a larger `road2` base layer
    // — union every ROAD_MAT_RE mesh, or the spawn/graph road box comes out
    // short on the south side.
    if (mats.some((m) => ROAD_MAT_RE.test(m?.name || ''))) roadBox.union(box);
  });

  if (roadBox.isEmpty()) {
    throw new Error('city: no mesh matched ROAD_MAT_RE — cannot derive a tile footprint');
  }

  // ---- Pass 2: clip everything west of the road slab ----------------------
  // See city-constants.js. The same two predicates run in
  // tools/build-collider.mjs, so the visible city and the physics world clip
  // identically. roadBox is already final here — pass 1 unioned every
  // ROAD_MAT_RE mesh — and both values are world metres, so CLIP_EPSILON means
  // the same thing on both sides.
  let clippedNodes = 0;
  for (const m of meshes) {
    if (m.fog) continue;
    if (!isClipped(m.obj.name) && !isWestOfRoadSlab(m.box.max.x, roadBox.min.x)) continue;
    m.clipped = true;
    m.obj.visible = false;
    clippedNodes++;
  }

  // ---- Pass 3: materials — boost emissive, collect road/ground mats ------
  const roadMaterials = new Map(); // material -> { roughness, envMapIntensity }
  const emissiveMaterials = [];    // retunable live from the 조명 debug folder
  const seen = new Set();
  const snap = (m) => ({ roughness: m.roughness ?? 1, envMapIntensity: m.envMapIntensity ?? 1 });

  for (const { obj, box, fog, clipped } of meshes) {
    if (fog || clipped) continue;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m || seen.has(m.uuid)) continue;
      seen.add(m.uuid);

      // Neon / window glow — KHR_materials_emissive_strength lands in emissiveIntensity.
      const emissiveSum = m.emissive ? m.emissive.r + m.emissive.g + m.emissive.b : 0;
      if (m.emissiveMap || emissiveSum > 0.01) {
        // An emissive texture with a black emissive factor would render black — force white.
        if (m.emissiveMap && emissiveSum <= 0.01) m.emissive = new THREE.Color(0xffffff);
        // Was max(x, 3.0), which pushed every sign past the bloom threshold and
        // turned signage into white mush. Bloom carries the glow now.
        m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, NIGHT.emissiveBoost);
        emissiveMaterials.push(m);
      }

      if (ROAD_NAME_RE.test(m.name || '')) roadMaterials.set(m, snap(m));
    }

    // Geometry-based guess: big flat mesh near ground level.
    const size = box.getSize(new THREE.Vector3());
    if (size.y < 0.6 && size.x * size.z > 40 && box.getCenter(new THREE.Vector3()).y < 6) {
      for (const m of mats) if (m && !roadMaterials.has(m)) roadMaterials.set(m, snap(m));
    }
  }

  // ---- Night lighting -----------------------------------------------------
  // See src/world/lighting.js — the ambient fill is deliberately tiny.
  const nightRig = createNightRig(scene, renderer);

  // ---- Collision: merge world-transformed geometry, build ONE tile's BVH --
  // NOTE: the GLB is meshopt-quantized (KHR_mesh_quantization), so positions are
  // *normalized* Int16 in [-1,1]. Never applyMatrix4 into that buffer — world
  // metres overflow Int16 — and never read .array directly. Go through
  // fromBufferAttribute, which denormalizes, and write plain floats.
  onPhase?.(82, '도로 충돌 준비 중 · Preparing road collision');
  const collisionMeshes = meshes.filter(({ obj, fog, clipped }) =>
    !fog && !clipped && !!obj.geometry?.attributes?.position
  );
  let collisionVertexCount = 0;
  for (const { obj } of collisionMeshes) {
    collisionVertexCount += obj.geometry.index
      ? obj.geometry.index.count
      : obj.geometry.attributes.position.count;
  }
  const positions = new Float32Array(collisionVertexCount * 3);
  let positionOffset = 0;
  const _p = new THREE.Vector3();
  const geomBounds = new THREE.Box3().makeEmpty();
  for (let meshIndex = 0; meshIndex < collisionMeshes.length; meshIndex++) {
    const { obj } = collisionMeshes[meshIndex];
    const geo = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      _p.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      positions[positionOffset++] = _p.x;
      positions[positionOffset++] = _p.y;
      positions[positionOffset++] = _p.z;
      geomBounds.expandByPoint(_p);
    }
    if (geo !== obj.geometry) geo.dispose();
    // Let the loading overlay repaint while large authored meshes are decoded.
    if (meshIndex % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const colliderGeo = new THREE.BufferGeometry();
  colliderGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  onPhase?.(89, '도로 충돌 인덱싱 중 · Indexing road collision');
  const bvhWorker = new GenerateMeshBVHWorker();
  let bvh;
  try {
    bvh = await bvhWorker.generate(colliderGeo, {
      onProgress: (progress) => onPhase?.(
        89 + progress * 4,
        `도로 충돌 인덱싱 중 · Indexing road collision ${Math.round(progress * 100)}%`
      ),
    });
  } finally {
    bvhWorker.dispose();
  }
  colliderGeo.boundsTree = bvh;
  console.log(`city collision ready in ${(performance.now() - startedAt).toFixed(0)}ms (${collisionVertexCount.toLocaleString()} vertices)`);

  // ---- Tile grid ----------------------------------------------------------
  // The footprint is the ray-routing cell in src/world/tiling.js: a ray is only
  // tested against a district if it enters that district's cell.
  //
  // REPEATING grid: it MUST be the road slab in XZ, or tiles overlap or leave a
  // gap in the roadway at every seam. Y comes from real geometry — deriving it
  // from the group bbox folds in the invisible fog volume and drops killY ~7.5 m
  // below the road (handoff 8.8).
  //
  // Explicit placements (the shipped map): there is no seam to align, and the
  // cell's only job is to contain everything the raycast must find. The road
  // slab is the wrong choice there, because this block's geometry reaches well
  // past it — using it made the backdrop streets invisible to physics, so the
  // van fell through them.
  const tileBounds = TILE_REPEATING
    ? new THREE.Box3(
      new THREE.Vector3(roadBox.min.x, geomBounds.min.y, roadBox.min.z),
      new THREE.Vector3(roadBox.max.x, geomBounds.max.y, roadBox.max.z)
    )
    : geomBounds.clone();

  const grid = makeTileGrid({
    tileBox: tileBounds,
    cols: TILE_COLS,
    rows: TILE_ROWS,
    placements: TILE_LAYOUT,
    flipOddRows: TILE_FLIP_ODD_ROWS,
    overhang: TILE_OVERHANG,
  });

  // ---- Per-district variation --------------------------------------------
  // One authored block placed ten times reads as the same corner ten times
  // unless each copy is varied. See src/world/block-variants.js for why the
  // variations are limited to colour and vertical massing: the collision BVH
  // above is built ONCE, so nothing a district changes may alter what the
  // player can touch.
  const blockAnalysis = analyzeBlock(meshes, CITY_SCALE, block);

  // Start in the layout's medoid district — the one with the shortest total
  // distance to all the others — so there is city in every direction.
  let spawnTile = 0;
  {
    let best = Infinity;
    for (let t = 0; t < grid.count; t++) {
      let total = 0;
      for (const other of grid.centers) total += grid.centers[t].distanceToSquared(other);
      if (total < best) { best = total; spawnTile = t; }
    }
  }

  // Districts that keep the source look, so the map has fixed points to
  // navigate by. The spawn district is one of them: the street you learn first
  // should stay the one you can always recognise. The far corner is the other,
  // so the two ends of the map do not read alike.
  const heroDistricts = new Set([spawnTile, grid.count - 1]);

  // Take EVERY clone before anything is applied to any of them.
  //
  // Object3D.clone() shares geometry and materials by reference, so N districts
  // cost one geometry set; applyBlockVariant then swaps in per-district material
  // copies and prepareDistrict reorganises the node tree. Both mutate, and this
  // used to clone district t from `block` inside the loop — i.e. from district
  // 0's already-varied, already-reorganised tree. Districts 1..9 inherited
  // district 0's tint (their own variantOf() no longer recognised the tinted
  // copies as facade materials) and compounded its height scale.
  const districtBlocks = Array.from({ length: grid.count }, (_, t) => (
    t === 0 ? block : block.clone()
  ));

  const tiles = [];
  for (let t = 0; t < grid.count; t++) {
    const root = new THREE.Group();
    root.name = `tile_${t}`;
    root.matrixAutoUpdate = false;
    root.matrix.copy(grid.matrices[t]);
    const districtBlock = districtBlocks[t];
    const variant = applyBlockVariant(districtBlock, t, blockAnalysis, { heroes: heroDistricts });
    // Keep the 조명 debug folder in charge of every sign in the city, not just
    // the ones in district 0.
    for (const material of variant.materials) {
      if (material.emissiveMap || (material.emissive && material.emissive.r + material.emissive.g + material.emissive.b > 0.01)) {
        emissiveMaterials.push(material);
      }
    }
    root.add(districtBlock);
    // Split the block into structure/detail and merge its sub-600-triangle
    // meshes. Must run AFTER applyBlockVariant: that hands this district its own
    // material copies, and the merge groups by material. See district-lod.js.
    const lod = prepareDistrict(districtBlock);
    // Range-culled dressing hangs here rather than on lod.detail, because that
    // one lives inside the block and therefore inside its CITY_SCALE. Dressing
    // is authored in tile-local metres and would come out three times too big.
    const dressingDetail = new THREE.Group();
    dressingDetail.name = 'dressing_detail';
    root.add(dressingDetail);
    root.updateMatrixWorld(true);
    scene.add(root);
    tiles.push({
      index: t, root, center: grid.centers[t], flipped: grid.flipped[t],
      detail: lod.detail, dressingDetail,
      // World AABB, for the per-frame frustum test and the structure-tier
      // range test. A district is 54 x 30 m, so measuring to the box rather
      // than the centre is what stops the far half of the block you are
      // standing on from counting as distant.
      box: grid.cellBounds[t],
      lodStats: lod.stats,
    });
  }
  const lodTotals = tiles.reduce((a, t) => ({
    sourceMeshes: a.sourceMeshes + t.lodStats.sourceMeshes,
    draws: a.draws + t.lodStats.structureDraws + t.lodStats.detailDraws,
  }), { sourceMeshes: 0, draws: 0 });

  // Backface culling, once, across every district: materials are per-district
  // copies, so this has to see all of them.
  const sides = enableBackfaceCulling(tiles.map((t) => t.root));

  // Everything every placed district actually occupies, in world space.
  // tileBounds is only the ROAD SLAB, so anything that scans for places to put
  // things (props, dressing) must use this instead, or side streets come out
  // bare.
  const districtBounds = new THREE.Box3().makeEmpty();
  for (let t = 0; t < grid.count; t++) {
    districtBounds.union(geomBounds.clone().applyMatrix4(grid.matrices[t]));
  }

  // ---- Road graph + connector bridges --------------------------------------
  // The authoritative network is explicit: one ring per district around its
  // building island, plus two bridge links to each neighbour (see
  // src/world/district-roads.js). Connector edges get visible decks from
  // src/world/connectors.js; the water between districts comes from
  // end-zones.js below.
  const roadY = roadBox.min.y;
  const districtNet = buildDistrictGraph(grid, { roadY });
  const roadGraph = createRoadGraph({
    nodes: districtNet.nodes,
    edges: districtNet.edges,
    bounds: districtBounds,
    roadWidth: STREET_WIDTH,
  });
  const topology = validateRoadGraph(roadGraph);
  if (!topology.ok) throw new Error(`city: invalid road graph: ${topology.errors.join('; ')}`);
  // District footprints, for the mini-map's block shading (hud3.js).
  roadGraph.districts = districtNet.districts;

  // ---- Raycasting ---------------------------------------------------------
  // Declared before the connectors, which need a ground probe of their own.
  const _lray = new THREE.Ray();
  const localRaycast = (ray, far) => bvh.raycastFirst(ray, THREE.DoubleSide, 0, far);

  /** Tile-local raycast — used by spawn/point sampling and prop placement. */
  function localCast(origin, dir, far = 100) {
    _lray.origin.copy(origin);
    _lray.direction.copy(dir);
    // Strictly tile-local: connector decks and boundary walls are world-space
    // structures, and callers here (spawn search, prop placement) only ever
    // probe inside one district's authored geometry.
    return localRaycast(_lray, far) || null;
  }

  /** World-space raycast against the tiled city. { point, normal, distance } | null. */
  const tiledRaycast = grid.makeRaycast(localRaycast);

  const connectors = createConnectors(scene, {
    edges: roadGraph.edges.filter((edge) => edge.kind === 'connector'),
    roadY,
    roadWidth: STREET_WIDTH,
    // The decks exist to carry a street mouth over open water. In this layout
    // the districts abut, so most connector edges run over authored asphalt
    // that is already there — and an untextured deck laid 2 cm proud of it
    // reads as a black slab dropped on the road. Skip those.
    hasAuthoredRoad: (x, z) => {
      const hit = tiledRaycast(new THREE.Vector3(x, roadY + 1.2, z), new THREE.Vector3(0, -1, 0), 4);
      return !!hit && Math.abs(hit.point.y - roadY) < 0.35;
    },
    // Reuse the block's own asphalt so the decks that DO get built read as
    // road rather than as a hole.
    material: [...roadMaterials.keys()].find((m) => ROAD_MAT_RE.test(m.name || '')) || null,
  });
  districtBounds.union(connectors.drivableBounds);
  const worldBounds = districtBounds.clone().union(connectors.worldBounds);
  for (const material of connectors.roadMaterials) roadMaterials.set(material, snap(material));

  function authoredRaycast(origin, dir, far = 100) {
    const tiled = tiledRaycast(origin, dir, far);
    const added = connectors.raycast(origin, dir, tiled ? Math.min(far, tiled.distance) : far);
    return added && (!tiled || added.distance < tiled.distance) ? added : tiled;
  }

  // Declared here, not further down with the ground probes: createEndZones runs
  // below and its ground scan needs DOWN, which as a `const` would still be in
  // its temporal dead zone.
  const UPV = new THREE.Vector3(0, 1, 0);
  const DOWN = new THREE.Vector3(0, -1, 0);

  // ---- Boundaries: water + ground-edge walls ------------------------------
  // end-zones.js scans for drivable-height ground and walls every solid ->
  // hole transition: district rims and both sides of every connector deck.
  // Its ground probe deliberately uses `authoredRaycast` (tiles + connector
  // decks), not the composite `raycast` below — that one consults endZones,
  // which does not exist yet.
  const endZones = createEndZones(scene, {
    roadY,
    // The world ends where the geometry ends, not where the roads do.
    barrierBounds: worldBounds,
    groundAt: (x, z) => {
      // Cast from just above street level, NOT from the sky: the block's
      // frontages are canyons of overhanging signs, awnings and AC units, and
      // a top-down ray returns the first of those as "ground", marking every
      // shop-lined sidewalk a hole — which is why the edge scan used to wall
      // both sides of every street. Starting below the clutter band reads the
      // actual walking/driving surface (road, sidewalk, plaza, deck).
      const hit = authoredRaycast(
        new THREE.Vector3(x, roadY + 1.0, z), DOWN,
        worldBounds.max.y - worldBounds.min.y + 20
      );
      return hit && hit.face && Math.abs(hit.face.normal.y) > 0.9 ? hit.point.y : null;
    },
  });
  for (const material of endZones.roadMaterials) roadMaterials.set(material, snap(material));

  // Both boundary groups are box soup: ~114 draws of kerb wall and ~52 of
  // connector deck for barely a thousand triangles between them. Their
  // colliders are baked inside their own builders above, so folding the visual
  // meshes together now cannot move anything the van touches.
  const mergedBoundaries = mergeStaticGroup(endZones.group);
  const mergedConnectors = mergeStaticGroup(connectors.group);

  // ---- Skyline ------------------------------------------------------------
  // Distant towers past the boundary, so the world does not end in flat haze.
  // Purely visual: outside the perimeter walls, in no raycast, one draw call.
  const skyline = createSkyline(scene, {
    bounds: endZones.bounds, roadY, manager,
  });
  emissiveMaterials.push(...skyline.emissiveMaterials);

  /** Composite nearest-hit raycast across the tiled and unique static BVHs. */
  function raycast(origin, dir, far = 100) {
    const authored = authoredRaycast(origin, dir, far);
    const unique = endZones.raycast(origin, dir, authored ? Math.min(far, authored.distance) : far);
    return unique && (!authored || unique.distance < authored.distance) ? unique : authored;
  }

  /** True if nothing (tree canopy, awning, eaves) hangs above this tile-local spot. */
  function clearSkyLocal(x, y, z) {
    return !localCast(new THREE.Vector3(x, y + 1.5, z), UPV, 8);
  }

  /**
   * Is this hit a flat, walkable surface?
   *
   * UNORIENTED on purpose. The block's road slabs are single-sided planes and
   * their winding is not consistent: 14% of the carriageway comes back with
   * normal.y = -1 even when hit from directly above. A strict `> 0.9` test
   * therefore declared one road tile in seven to be "not ground", which starved
   * spawn, prop placement and the district edge scan. Flatness does not depend
   * on winding, and VehiclePhysics already flips the contact normal toward the
   * body (physics.js `n.dot(bodyUp) < 0`), so treating it as unsigned here is
   * consistent with how the suspension reads the same hit.
   */
  const isFlatGround = (hit) => !!hit && !!hit.face && Math.abs(hit.face.normal.y) > 0.9;

  function findGroundLocal(x, z) {
    const hit = localCast(
      new THREE.Vector3(x, tileBounds.max.y + 5, z), DOWN,
      tileBounds.max.y - tileBounds.min.y + 20
    );
    return isFlatGround(hit) ? hit : null;
  }

  /** World-space ground probe, for gameplay code that doesn't know about tiles. */
  function findGround(x, z) {
    const hit = raycast(new THREE.Vector3(x, worldBounds.max.y + 5, z), DOWN,
      worldBounds.max.y - worldBounds.min.y + 20);
    return isFlatGround(hit) ? hit : null;
  }

  // ---- Spawn: searched in tile-local space, then mapped onto a tile -------
  const spanX = tileBounds.max.x - tileBounds.min.x;
  const spanZ = tileBounds.max.z - tileBounds.min.z;
  const localCenter = tileBounds.getCenter(new THREE.Vector3());

  // Prefer a clear corridor on the drivable road: the 'real road' base layer
  // runs under sidewalks/planters/trees too, so probe for spots whose raycast
  // comes down at true road height with clear neighbours.
  let localSpawn = null;
  {
    const roadY = roadBox.min.y;
    let bestScore = -Infinity;
    for (let ix = 0; ix <= 16; ix++) {
      for (let iz = 0; iz <= 12; iz++) {
        const x = THREE.MathUtils.lerp(roadBox.min.x + 2, roadBox.max.x - 2, ix / 16);
        const z = THREE.MathUtils.lerp(roadBox.min.z + 1.5, roadBox.max.z - 1.5, iz / 12);
        const hit = findGroundLocal(x, z);
        if (!hit || hit.point.y > roadY + 0.15) continue;
        if (!clearSkyLocal(x, hit.point.y, z)) continue; // under a tree/awning
        let clear = 0;
        for (const [dx, dz] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [1.8, 1.8], [-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8]]) {
          const h2 = findGroundLocal(x + dx, z + dz);
          if (h2 && h2.point.y < roadY + 0.15 && clearSkyLocal(x + dx, h2.point.y, z + dz)) clear++;
        }
        if (clear < 8) continue; // fully open in every direction, or not at all
        // Put the van on the block's widest street, facing along it, with room
        // BEHIND for the chase camera. The old scoring maximised distance from
        // the road centre, which on this block parks the van against the
        // frontage on an edge street and buries the camera in a wall.
        const onMainStreet = -Math.abs(z - STREET_Z_SOUTH);
        const offEdges = -0.35 * Math.abs(x - (roadBox.min.x + roadBox.max.x) / 2);
        const score = clear * 10 + onMainStreet + offEdges;
        if (score > bestScore) {
          bestScore = score;
          localSpawn = hit.point.clone();
        }
      }
    }
  }
  outer: for (let ring = 0; ring <= 10 && !localSpawn; ring++) {
    const r = ring * 6;
    for (let a = 0; a < 16; a++) {
      const x = localCenter.x + Math.cos((a / 16) * Math.PI * 2) * r;
      const z = localCenter.z + Math.sin((a / 16) * Math.PI * 2) * r * (spanZ / spanX);
      const hit = findGroundLocal(x, z);
      if (hit && hit.point.y < localCenter.y + 8) { localSpawn = hit.point.clone(); break outer; }
    }
  }
  if (!localSpawn) localSpawn = new THREE.Vector3(localCenter.x, 0, localCenter.z);
  localSpawn.y += 0.8; // drop-in height

  const spawn = {
    position: grid.localToWorld(spawnTile, localSpawn, new THREE.Vector3()),
    // The ring streets run along tile-local X — and a rotated district faces
    // the other way.
    heading: grid.headingToWorld(spawnTile, Math.PI / 2),
    tile: spawnTile,
  };

  // Replicate the same collision-verified spawn into every tile. The abstract
  // route graph is useful for navigation, but its row centreline is not a safe
  // vehicle pose in this authored block (it can cross a raised sidewalk).
  // Reset therefore chooses the nearest copy of the exact point that boot uses.
  const safeResetPoints = Array.from({ length: grid.count }, (_, tile) => ({
    position: grid.localToWorld(tile, localSpawn, new THREE.Vector3()),
    heading: grid.headingToWorld(tile, Math.PI / 2),
    tile,
  }));
  function getSafeReset(position) {
    let best = safeResetPoints[0];
    let bestDistance = Infinity;
    for (const candidate of safeResetPoints) {
      const dx = candidate.position.x - position.x;
      const dz = candidate.position.z - position.z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) { best = candidate; bestDistance = distance; }
    }
    return best ? { position: best.position.clone(), heading: best.heading, tile: best.tile } : null;
  }

  // ---- Delivery points: sampled once in tile-local, replicated per tile ---
  // minDist MUST come from the tile span, not the world bounds: at 215 m wide
  // the old `spanX * 0.14` would demand 30 m of separation inside a 43 m tile,
  // starve the sampler, and silently fall back to a ring around spawn.
  const rng = mulberry32(20260812);
  const localPoints = [];
  const inset = 0.08;
  const minDist = Math.max(5, spanX * 0.14);
  let tries = 0;
  while (localPoints.length < 12 && tries++ < 400) {
    const x = THREE.MathUtils.lerp(tileBounds.min.x + spanX * inset, tileBounds.max.x - spanX * inset, rng());
    const z = THREE.MathUtils.lerp(tileBounds.min.z + spanZ * inset, tileBounds.max.z - spanZ * inset, rng());
    const hit = findGroundLocal(x, z);
    if (!hit) continue;
    if (Math.abs(hit.point.y - localSpawn.y) > 4) continue; // stay on street level
    const p = hit.point.clone();
    if (localPoints.some((q) => q.distanceTo(p) < minDist)) continue;
    localPoints.push(p);
  }
  if (localPoints.length < 4) {
    for (let i = 0; i < 8; i++) {
      localPoints.push(localSpawn.clone().add(new THREE.Vector3(Math.cos(i) * 15, 0, Math.sin(i) * 15)));
    }
  }

  // Local-major, tile-minor: orders.js binds restaurants with `points[i % len]`,
  // so this order spreads them across tiles instead of piling into tile 0.
  const sampledPoints = [];
  const pointTiles = [];
  for (const lp of localPoints) {
    for (let t = 0; t < grid.count; t++) {
      sampledPoints.push(grid.localToWorld(t, lp, new THREE.Vector3()));
      pointTiles.push(t);
    }
  }

  // Gameplay locations come from the road graph rather than random ground
  // samples. This makes every pickup/drop-off routeable and keeps interaction
  // rings at a predictable curb offset.
  const deliveryAnchors = createDeliveryAnchors(roadGraph, findGround);
  if (deliveryAnchors.length < grid.count) {
    // orders.js binds every restaurant to an anchor and crashes on an empty
    // list — a shortfall means the graph or ground probes are broken.
    console.warn(`city: only ${deliveryAnchors.length} delivery anchors across ${grid.count} districts`);
  }
  const points = deliveryAnchors.map((anchor) => anchor.point);

  // ---- Streetlights: a fixed pool chasing the nearest anchors -------------
  // Anchors used to take their colour cast from their TILE index, so a block
  // repeated 35 times read as 35 different neighbourhoods. There is one tile
  // now, so keying on it would flatten the whole district to a single cast.
  // Key on world position instead: PALETTE_ZONE-metre cells across the block,
  // which still gives the boulevard warm and cool stretches as you drive it.
  const PALETTE_ZONE = 25;
  const paletteCols = Math.max(1, Math.ceil((districtBounds.max.x - districtBounds.min.x) / PALETTE_ZONE));
  const paletteAt = (x, z) => blockPalette(
    Math.floor((z - districtBounds.min.z) / PALETTE_ZONE) * paletteCols
      + Math.floor((x - districtBounds.min.x) / PALETTE_ZONE),
    paletteCols
  );

  const streetlights = new StreetlightPool(scene, {
    size: NIGHT.lampCount, range: NIGHT.lampRange, intensity: NIGHT.lampIntensity,
    glowOpacity: NIGHT.glowOpacity, glowRadius: NIGHT.glowRadius,
  });
  const lightAnchors = sampledPoints.map((p) => {
    const pal = paletteAt(p.x, p.z);
    return { position: new THREE.Vector3(p.x + 2.5, p.y, p.z + 2.5), lamp: pal.lamp, glow: pal.glow };
  });
  // Every junction gets practical lighting before the asynchronously loaded
  // prop system replaces the core lamp anchors.
  for (const node of roadGraph.nodes) {
    const pal = paletteAt(node.position.x, node.position.z);
    lightAnchors.push({ position: node.position.clone().add(new THREE.Vector3(2, 0, 2)), lamp: pal.lamp, glow: pal.glow });
  }
  streetlights.setAnchors(lightAnchors);

  // ---- Wet-look modulation (driven by rain) ------------------------------
  function setWetness(w) {
    for (const [m, orig] of roadMaterials) {
      m.roughness = orig.roughness * (1 - 0.5 * w);
      if ('envMapIntensity' in m) m.envMapIntensity = orig.envMapIntensity + w * 0.6;
      m.needsUpdate = false;
    }
  }

  // ---- Per-frame: tile culling + streetlight pool -------------------------
  //
  // Distance alone never culled anything. TILE_CULL_DISTANCE was 145 m against
  // a 109 x 152 m fabric whose longest centre-to-centre span is ~133 m, so the
  // `?stats=1` readout said "10 of 10 drawn" from every street in the city.
  //
  // Frustum culling at the tile root is what actually pays: it drops the
  // districts behind you before three.js walks their meshes at all, saving the
  // per-object matrix and bounding-sphere work as well as the draws. Distance
  // then only has to catch what is in front of you and too far to read, which
  // is a much longer range than the old constant implied — and the detail tier
  // (see district-lod.js) takes the vegetation out well before that.
  const _cam = new THREE.Vector3();
  const _frustum = new THREE.Frustum();
  const _viewProjection = new THREE.Matrix4();
  let cullDistance = TILE_CULL_DISTANCE;
  let detailDistance = TILE_DETAIL_DISTANCE;
  function update(dt, camera) {
    camera.getWorldPosition(_cam);
    _viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_viewProjection);
    const cull2 = cullDistance * cullDistance;
    const detail2 = detailDistance * detailDistance;
    for (const t of tiles) {
      const near = t.box.distanceToPoint(_cam);
      t.root.visible = near * near <= cull2 && _frustum.intersectsBox(t.box);
      // Detail is measured to the district CENTRE, not to its box. Districts
      // are laid edge to edge, so neighbouring boxes touch and a box-distance
      // test returns ~0 for every district you can see — it never culls
      // anything. Centre distance is what separates "the block I am on" from
      // "the next one over". Kept correct even while the root is hidden, so a
      // debug tool that forces root.visible sees a consistent tree.
      const cx = t.center.x - _cam.x;
      const cz = t.center.z - _cam.z;
      const nearEnough = cx * cx + cz * cz <= detail2;
      t.detail.visible = nearEnough;
      t.dressingDetail.visible = nearEnough;
    }
    streetlights.update(dt, _cam);
  }

  // The mini-map extent and the QA overview camera both frame this, so it has
  // to cover every district plus its surroundings, not one tile's road slab.
  const bounds = endZones.bounds.union(worldBounds);
  bounds.min.y = Math.min(bounds.min.y, grid.worldBounds.min.y);
  bounds.max.y = Math.max(bounds.max.y, grid.worldBounds.max.y);

  function projectToRoad(position) { return roadGraph.project(position); }
  function findRoute(start, destination) { return roadGraph.findRoute(start, destination); }

  return {
    group: block, tiles, grid, bvh, colliderGeo, connectors, endZones, skyline,
    raycast, localRaycast: localCast, findGround, findGroundLocal, clearSkyLocal,
    spawn, localSpawn, safeResetPoints, getSafeReset, bounds, tileBounds, districtBounds, worldBounds, roadBox, points, localPoints,
    roadGraph, deliveryAnchors, projectToRoad, findRoute,
    roadMaterials: [...roadMaterials.keys()], emissiveMaterials, setWetness, update,
    fog: nightRig.fog, nightRig,
    lights: { hemi: nightRig.hemi, amb: nightRig.amb, moon: nightRig.moon, streetlights },
    stats: {
      clippedNodes, triangles: positions.length / 9, tiles: grid.count,
      connectorTriangles: connectors.stats.collisionTriangles,
      endZoneTriangles: endZones.stats.collisionTriangles,
      roadNodes: roadGraph.nodes.length, roadEdges: roadGraph.edges.length,
      sourceMeshes: lodTotals.sourceMeshes, lodDraws: lodTotals.draws,
      backfaceCulled: sides.flipped, doubleSidedKept: sides.kept,
      boundaryDraws: `${mergedBoundaries.before}->${mergedBoundaries.after}`,
      connectorDraws: `${mergedConnectors.before}->${mergedConnectors.after}`,
    },
    // Fall-off-respawn threshold. Compared against phys.position, which is the
    // CENTRE OF MASS and sits comHeight (0.78 m) below the model origin.
    killY: bounds.min.y - 3,
    get cullDistance() { return cullDistance; },
    set cullDistance(v) { cullDistance = v; },
    get detailDistance() { return detailDistance; },
    set detailDistance(v) { detailDistance = v; },
  };
}
