// Procedural Seoul city — same return shape as src/world/city.js so physics,
// orders, HUD, rain and props keep working without a second code path.
import * as THREE from 'three';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
import { makeTileGrid } from '../tiling.js';
import { createRoadGraph, createDeliveryAnchors, validateRoadGraph } from '../road-network.js';
import { StreetlightPool } from '../streetlights.js';
import { createNightRig, NIGHT } from '../lighting.js';
import { createSkyline } from '../skyline.js';
import { DISTRICT_BY_INDEX, districtAt } from '../data/color-bible.js';
import { generateLayout, PROC_SEED, ROAD_Y } from './layout.js';
import { buildCityMesh } from './mesh.js';
import { dressSigns } from './signs.js';
import { loadAsphaltTexturePack, applyAsphaltTextureDefaults } from './texture-pack.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

export async function loadProcCity(scene, manager, renderer = null, onPhase = null, seed = PROC_SEED, { detailIntensity } = {}) {
  const startedAt = performance.now();
  onPhase?.(8, '컬러 바이블 적용 중 · Applying colour bible');

  const nightRig = createNightRig(scene, renderer);
  const layout = generateLayout(seed);

  onPhase?.(18, '한글 간판 그리는 중 · Painting Hangul signs');
  onPhase?.(36, '도시 생성 중 · Generating city');
  const built = buildCityMesh(layout, {}, seed, { detailIntensity });
  scene.add(built.group);

  // Downloaded asphalt pack loads in parallel with the BVH build. The road
  // material is already bound to the procedural pair; when the pack lands
  // we attach it to the blend handle exposed on `built.asphaltBlend` and
  // the debug menu can drive the comparison at any point after.
  const asphaltPackPromise = loadAsphaltTexturePack(manager).then((pack) => {
    if (!pack) return null;
    applyAsphaltTextureDefaults(pack.normal);
    applyAsphaltTextureDefaults(pack.rough);
    if (built.asphaltBlend) built.asphaltBlend.setDownloaded(pack);
    console.log(`asphalt pack: ${pack.provenance.asset} (${pack.provenance.license}) loaded`);
    return pack;
  }).catch((err) => {
    console.warn('asphalt pack load failed:', err);
    return null;
  });

  onPhase?.(58, '도로 충돌 인덱싱 중 · Indexing road collision');
  const colliderGeo = built.colliderGeo;
  let bvh;
  const bvhWorker = new GenerateMeshBVHWorker();
  try {
    bvh = await bvhWorker.generate(colliderGeo, {
      onProgress: (progress) => onPhase?.(
        58 + progress * 22,
        `도로 충돌 인덱싱 중 · Indexing road collision ${Math.round(progress * 100)}%`
      ),
    });
  } finally {
    bvhWorker.dispose();
  }
  colliderGeo.boundsTree = bvh;

  const { minX, maxX, minZ, maxZ } = layout.playable;
  const tileBounds = new THREE.Box3(
    new THREE.Vector3(minX - 8, ROAD_Y - 1, minZ - 8),
    new THREE.Vector3(maxX + 8, 40, maxZ + 8),
  );
  const grid = makeTileGrid({
    tileBox: tileBounds,
    cols: 1,
    rows: 1,
    flipOddRows: false,
    overhang: 2,
  });

  const detail = new THREE.Group();
  detail.name = 'proc_detail';
  const dressingDetail = new THREE.Group();
  dressingDetail.name = 'dressing_detail';
  built.group.add(detail);
  built.group.add(dressingDetail);

  const tiles = [{
    index: 0,
    root: built.group,
    center: grid.centers[0],
    flipped: false,
    detail,
    dressingDetail,
    box: grid.cellBounds[0],
    lodStats: { sourceMeshes: 1, structureDraws: 1, detailDraws: 0 },
  }];

  const worldBounds = new THREE.Box3(
    new THREE.Vector3(minX - 24, -4, minZ - 24),
    new THREE.Vector3(maxX + 24, 36, maxZ + 24),
  );
  const districtBounds = tileBounds.clone();

  const roadGraph = createRoadGraph({
    nodes: layout.nodes,
    edges: layout.edges,
    bounds: districtBounds,
    roadWidth: 8,
  });
  roadGraph.districts = layout.districts;
  const topology = validateRoadGraph(roadGraph);
  if (!topology.ok) {
    console.warn('proc city: road graph issues:', topology.errors.slice(0, 6).join('; '));
  }

  const _ray = new THREE.Ray();
  function localCast(origin, dir, far = 100) {
    _ray.origin.copy(origin);
    _ray.direction.copy(dir);
    return bvh.raycastFirst(_ray, THREE.DoubleSide, 0, far) || null;
  }
  function raycast(origin, dir, far = 100) {
    return localCast(origin, dir, far);
  }

  const isFlatGround = (hit) => !!hit && !!hit.face && Math.abs(hit.face.normal.y) > 0.9;
  function findGround(x, z) {
    const hit = raycast(new THREE.Vector3(x, 28, z), DOWN, 40);
    if (isFlatGround(hit)) return hit;
    // Kerbs and shallow ramps are driveable even when the first hit is not a
    // perfect +Y slab — refuse roofs and walls by staying near street height.
    if (hit?.point && hit.point.y > ROAD_Y - 0.3 && hit.point.y < ROAD_Y + 0.55) return hit;
    return null;
  }
  const findGroundLocal = findGround;
  function clearSkyLocal(x, y, z) {
    return !localCast(new THREE.Vector3(x, y + 1.5, z), UP, 8);
  }

  onPhase?.(84, '상점 간판 배치 중 · Labelling shops');
  const signs = await dressSigns(built.group, built.buildings, { manager, seed });
  const pickupSites = signs.pickupSites.map((site) => {
    const ground = findGround(site.point.x, site.point.z);
    if (ground) site.point.y = ground.point.y;
    return site;
  });

  const deliveryAnchors = createDeliveryAnchors(roadGraph, findGround);
  const points = deliveryAnchors.map((a) => a.point);
  if (points.length < 6) {
    console.warn(`proc city: only ${points.length} delivery anchors`);
  }

  const spawnGround = findGround(layout.spawn.position.x, layout.spawn.position.z);
  const spawn = {
    position: (spawnGround?.point.clone() || layout.spawn.position.clone()).add(new THREE.Vector3(0, 0.8, 0)),
    heading: layout.spawn.heading,
    tile: 0,
  };

  const safeResetPoints = roadGraph.nodes
    .filter((n) => (roadGraph.adjacency.get(n.id) || []).length >= 2)
    .map((n) => ({
      position: n.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
      heading: 0,
      tile: 0,
    }));
  if (!safeResetPoints.length) safeResetPoints.push({ ...spawn, position: spawn.position.clone() });

  function getSafeReset(position) {
    const projected = roadGraph.project(position);
    if (projected) {
      const ground = findGround(projected.position.x, projected.position.z);
      const y = ground ? ground.point.y + 0.8 : ROAD_Y + 0.8;
      return { position: projected.position.clone().setY(y), heading: projected.heading, tile: 0 };
    }
    let best = safeResetPoints[0];
    let bestD = Infinity;
    for (const c of safeResetPoints) {
      const d = c.position.distanceToSquared(position);
      if (d < bestD) { best = c; bestD = d; }
    }
    return { position: best.position.clone(), heading: best.heading, tile: 0 };
  }

  const skyline = createSkyline(scene, { bounds: worldBounds, roadY: ROAD_Y, manager });
  const emissiveMaterials = [
    ...built.emissiveMaterials,
    ...signs.emissiveMaterials,
    ...skyline.emissiveMaterials,
  ];

  const streetlights = new StreetlightPool(scene, {
    size: NIGHT.lampCount, range: NIGHT.lampRange, intensity: NIGHT.lampIntensity,
    glowOpacity: NIGHT.glowOpacity, glowRadius: NIGHT.glowRadius,
  });
  // Per-node road yaw: the average direction of the incident edges, so each
  // wet-reflection streak lies along its street instead of a global axis.
  // Adjacency items carry the neighbour's id, not its node object.
  const nodeById = new Map(roadGraph.nodes.map((n) => [n.id, n]));
  let _dirX = 0; let _dirZ = 0;
  const lightAnchors = roadGraph.nodes.map((node) => {
    const d = DISTRICT_BY_INDEX[districtIndexAt(node.position.x, node.position.z)];
    _dirX = 0; _dirZ = 0;
    for (const item of roadGraph.adjacency.get(node.id) || []) {
      const other = nodeById.get(item.node);
      if (!other) continue;
      _dirX += other.position.x - node.position.x;
      _dirZ += other.position.z - node.position.z;
    }
    if (_dirX === 0 && _dirZ === 0) { _dirX = 1; }
    return {
      position: node.position.clone().add(new THREE.Vector3(1.6, 0, 1.6)),
      lamp: d?.lamp ?? 0xffb46a,
      glow: d?.glow ?? 0xff9a4a,
      // PlaneGeometry lies on +X before its flat rotation, and rotationY(θ)
      // maps +X to (cosθ, 0, -sinθ), so θ = atan2(-dz, dx).
      yaw: Math.atan2(-_dirZ, _dirX),
    };
  });
  streetlights.setAnchors(lightAnchors);

  // --- SSR-lite: neon streaks on wet asphalt ---------------------------------
  // Screen-space reflections are out of budget here, so wet roads fake them
  // the classic way: one elongated additive quad per lamp anchor, stretched
  // along its street. Geometry, matrices and instance colours are built once;
  // wetness only drives the shared material's opacity, so the hot path
  // (rain.update → setWetness every frame) never touches an instance or
  // allocates. The mobile budget halves the streaks and their strength via
  // the existing detailIntensity hook rather than a new quality field.
  const wetStreaks = buildWetStreaks(lightAnchors, { detailIntensity });
  built.group.add(wetStreaks.mesh);

  const roadSnap = new Map(built.roadMaterials.map((m) => [m, {
    roughness: m.roughness ?? 1,
    envMapIntensity: m.envMapIntensity ?? 1,
    color: m.color ? m.color.clone() : null,
  }]));
  function setWetness(w) {
    // Roughness maps multiply the scalar, so easing the scalar still eases the
    // whole response. Wet asphalt both darkens AND mirrors: roughness drops
    // harder than before, the env gain is what makes it reflect the amber sky,
    // and the albedo dip gives the emissive streaks something to read against.
    for (const [m, orig] of roadSnap) {
      m.roughness = orig.roughness * (1 - 0.62 * w);
      if ('envMapIntensity' in m) m.envMapIntensity = orig.envMapIntensity + w * 1.35;
      if (orig.color) m.color.copy(orig.color).multiplyScalar(1 - 0.24 * w);
    }
    // Streak fakes read as dirt under sunlight, so they follow the preset too;
    // rain.update re-runs this every frame, so a mid-session switch settles
    // within a frame without time-of-day.js knowing about this system.
    const gain = nightRig.params.mode === 'night' ? 1 : 0.3;
    wetStreaks.mat.opacity = wetStreaks.baseOpacity * w * gain;
    wetStreaks.mesh.visible = wetStreaks.mat.opacity > 0.005;
  }

  let cullDistance = 160;
  let detailDistance = 90;
  const _cam = new THREE.Vector3();
  const _frustum = new THREE.Frustum();
  const _viewProjection = new THREE.Matrix4();
  function update(dt, camera) {
    camera.getWorldPosition(_cam);
    _viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_viewProjection);
    const near = tiles[0].box.distanceToPoint(_cam);
    tiles[0].root.visible = near <= cullDistance && _frustum.intersectsBox(tiles[0].box);
    tiles[0].detail.visible = true;
    tiles[0].dressingDetail.visible = true;
    streetlights.update(dt, _cam);
  }

  const bounds = worldBounds.clone();
  console.log(
    `proc city ready in ${(performance.now() - startedAt).toFixed(0)}ms — ` +
    `${layout.nodes.length} nodes, ${layout.edges.length} edges, ` +
    `${built.stats.buildings} buildings, ${signs.stats.hangul} Hangul signs, ${signs.stats.landmarks} pickups` +
    (topology.ok ? '' : ` (graph warnings)`)
  );

  return {
    proc: true,
    group: built.group, tiles, grid, bvh, colliderGeo,
    connectors: { drivableBounds: districtBounds, worldBounds, roadMaterials: [], stats: { collisionTriangles: 0 }, raycast: () => null },
    endZones: { bounds, roadMaterials: [], stats: { collisionTriangles: 0 }, raycast: () => null },
    skyline,
    raycast, localRaycast: localCast, findGround, findGroundLocal, clearSkyLocal,
    spawn, localSpawn: spawn.position.clone(), safeResetPoints, getSafeReset,
    bounds, tileBounds, districtBounds, worldBounds,
    roadBox: new THREE.Box3(
      new THREE.Vector3(minX, ROAD_Y, minZ),
      new THREE.Vector3(maxX, ROAD_Y + 0.12, maxZ),
    ),
    points, localPoints: points,
    roadGraph, deliveryAnchors, pickupSites,
    projectToRoad: (p) => roadGraph.project(p),
    findRoute: (a, b) => roadGraph.findRoute(a, b),
    roadMaterials: built.roadMaterials,
    emissiveMaterials,
    textures: { asphalt: built.asphaltBlend },
    // Resolves when the async texture pack has either loaded or failed. The
    // debug menu's Textures folder awaits this so the downloaded toggle is
    // only enabled once the pack is actually available.
    texturesReady: asphaltPackPromise,
    setWetness, update,
    fog: nightRig.fog, nightRig,
    lights: { hemi: nightRig.hemi, amb: nightRig.amb, moon: nightRig.moon, streetlights },
    stats: {
      clippedNodes: 0,
      triangles: (colliderGeo.index ? colliderGeo.index.count : colliderGeo.attributes.position.count) / 3,
      tiles: 1,
      connectorTriangles: 0,
      endZoneTriangles: 0,
      roadNodes: roadGraph.nodes.length,
      roadEdges: roadGraph.edges.length,
      sourceMeshes: built.stats.buildings,
      lodDraws: 8,
      backfaceCulled: 0,
      doubleSidedKept: 0,
      buildings: built.stats.buildings,
      shops: built.stats.shopFaces,
      hanging: signs.stats.hanging,
      hangul: signs.stats.hangul,
    },
    killY: -1.35,
    get cullDistance() { return cullDistance; },
    set cullDistance(v) { cullDistance = v; },
    get detailDistance() { return detailDistance; },
    set detailDistance(v) { detailDistance = v; },
  };
}

function districtIndexAt(x, z) {
  return districtAt(x, z).index;
}

/**
 * One instanced draw call of elongated "reflection" pools, one per lamp anchor.
 * Each quad is a soft streak aligned to its street's yaw and tinted with the
 * district glow colour; setWetness() fades the whole sheet in with wetness.
 * Anchors: { position, yaw, glow } from the lightAnchors list above.
 */
function buildWetStreaks(anchors, { detailIntensity = 1 } = {}) {
  const lowBudget = detailIntensity < 1;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: makeStreakTexture(),
    color: 0xffffff, // per-instance colour multiplies this — keep it neutral
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  // Mobile skips every other anchor (they overlap at alley widths anyway) and
  // runs dimmer, matching how detailIntensity already scales texture work.
  const stride = lowBudget ? 2 : 1;
  const count = Math.max(1, Math.ceil(anchors.length / stride));
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'wet_neon_streaks';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2; // same layer as the streetlight glow pools

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(lowBudget ? 7 : 10, 1, lowBudget ? 2 : 2.6);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const anchor = anchors[i * stride];
    p.set(anchor.position.x, anchor.position.y + 0.06, anchor.position.z);
    q.setFromAxisAngle(UP, anchor.yaw);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHex(anchor.glow));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.visible = false;

  return { mesh, mat, baseOpacity: lowBudget ? 0.17 : 0.28 };
}

/** Streak alpha: long tail along the street, tight falloff across it. */
function makeStreakTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  const along = ctx.createLinearGradient(0, 0, c.width, 0);
  along.addColorStop(0, 'rgba(255,255,255,0)');
  along.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  along.addColorStop(0.5, 'rgba(255,255,255,1)');
  along.addColorStop(0.7, 'rgba(255,255,255,0.5)');
  along.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, c.width, c.height);
  // Mask across the width so the streak reads as a smear, not a rectangle.
  ctx.globalCompositeOperation = 'destination-in';
  const across = ctx.createLinearGradient(0, 0, 0, c.height);
  across.addColorStop(0, 'rgba(0,0,0,0)');
  across.addColorStop(0.5, 'rgba(0,0,0,1)');
  across.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
