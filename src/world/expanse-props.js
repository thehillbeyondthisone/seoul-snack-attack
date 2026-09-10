// Seoul Expanse — deterministic, chunk-owned street-prop review slice.
//
// Placement is deliberately pure and separate from loading/rendering. The
// first milestone dresses only Station, Hongdae and Hangang; citywide
// propagation remains behind the review gate in EXPANSE-PROPS-HANDOFF.md.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PropWorld } from '../physics/prop-world.js';
import { PROPS, DEFAULT_DENSITY } from './data/props.js';
import { expanseDistrictAt, RIVER } from './expanse-layout.js';
import { generateExpanseChunkGrid, chunkAt } from './expanse-chunks.js';

const CATALOG_URL = 'assets/props/catalog.json';
export const EXPANSE_PROP_SEED = 20260903;
export const EXPANSE_PROP_LICENSE = 'internal-evaluation-only';

// Eight families is the review-slice ceiling. Footprints mirror catalog.json
// and make the pure safety gate independent of browser asset loading.
export const EXPANSE_PROP_FAMILIES = Object.freeze({
  'street:2': Object.freeze({ size: [0.4287, 0.6015, 0.4287] }),
  'street:6': Object.freeze({ size: [0.2258, 1.1574, 0.4527] }),
  'street:7': Object.freeze({ size: [0.293, 0.8471, 0.293] }),
  'street:10': Object.freeze({ size: [0.2572, 1.4022, 0.3081] }),
  'bikes:2': Object.freeze({ size: [0.3776, 0.8968, 1.5497] }),
  'barriers:4': Object.freeze({ size: [0.7425, 0.7522, 0.2037] }),
  'vending-pokari:0': Object.freeze({ size: [0.8788, 1.7113, 0.74] }),
  'trash:3': Object.freeze({ size: [1.0861, 0.252, 0.9996] }),
});

const SHOP_CLUSTERS = Object.freeze([
  {
    id: 'station-hotteok', shopId: 'hotteok', groundY: 0.1,
    specs: [
      ['vending-pokari:0', -3.7, 0.9, 0],
      ['street:6', 3.6, 1.0, 0],
      ['street:2', -2.1, 0.8, 0.2],
      ['bikes:2', 2.0, 0.45, 0],
      ['barriers:4', 5.0, 0.72, 0],
      ['street:7', -5.0, 1.05, 0],
      ['street:7', 6.2, 1.05, 0],
      ['street:10', -6.2, 0.76, 0.15],
      ['trash:3', 7.6, 0.35, 0.25],
      ['bikes:2', -7.7, 0.4, 0],
    ],
  },
  {
    id: 'hongdae-chimaek', shopId: 'chimaek', groundY: 0.02,
    specs: [
      ['bikes:2', -2.3, 0.35, 0],
      ['bikes:2', 2.4, 0.35, 0],
      ['barriers:4', -4.8, 0.7, 0],
      ['vending-pokari:0', 4.8, 0.72, 0],
      ['street:6', -6.1, 0.9, 0],
      ['street:2', 6.3, 0.76, -0.2],
      ['street:7', -7.5, 0.9, 0],
      ['street:7', 7.7, 0.9, 0],
      ['trash:3', 10.8, 0.2, -0.25],
      ['street:10', 9.1, 0.68, 0.2],
    ],
  },
]);

const PROMENADE_SPECS = Object.freeze([
  ['bikes:2', -158, 210.7, Math.PI / 2],
  ['barriers:4', -156, 210.7, Math.PI / 2],
  ['street:2', -140, 210.7, 0.2],
  ['street:7', -137, 210.7, 0],
  ['street:10', -121, 210.7, -0.15],
  ['trash:3', -118, 210.7, 0.3],
  ['bikes:2', -103, 210.7, Math.PI / 2],
  ['street:6', -100, 210.7, Math.PI / 2],
]);

function rngFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function distance2D(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function pointSegmentDistance(point, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lenSq = abx * abx + abz * abz;
  if (lenSq < 1e-9) return distance2D(point, a);
  const t = THREE.MathUtils.clamp(((point.x - a.x) * abx + (point.z - a.z) * abz) / lenSq, 0, 1);
  return Math.hypot(point.x - (a.x + abx * t), point.z - (a.z + abz * t));
}

function distanceToEdge(record, edge) {
  let best = Infinity;
  for (let i = 1; i < edge.points.length; i++) {
    best = Math.min(best, pointSegmentDistance(record, edge.points[i - 1], edge.points[i]));
  }
  return best;
}

function circleIntersectsRect(record, rect, padding = 0) {
  const x = THREE.MathUtils.clamp(record.x, rect.minX, rect.maxX);
  const z = THREE.MathUtils.clamp(record.z, rect.minZ, rect.maxZ);
  return Math.hypot(record.x - x, record.z - z) < record.radius + padding;
}

function circleIntersectsOrientedBox(record, obstacle, width, depth) {
  const c = Math.cos(-(obstacle.yaw || 0));
  const s = Math.sin(-(obstacle.yaw || 0));
  const dx = record.x - obstacle.x;
  const dz = record.z - obstacle.z;
  const localX = dx * c - dz * s;
  const localZ = dx * s + dz * c;
  const x = THREE.MathUtils.clamp(localX, -width * 0.5, width * 0.5);
  const z = THREE.MathUtils.clamp(localZ, -depth * 0.5, depth * 0.5);
  return Math.hypot(localX - x, localZ - z) < record.radius;
}

function deriveDeliveryMarkers(layout) {
  const fractions = [0.24, 0.52, 0.8];
  const byDistrict = new Map();
  for (const edge of layout.edges) {
    if (edge.kind !== 'street' || edge.district == null || edge.district < 0) continue;
    if (!byDistrict.has(edge.district)) byDistrict.set(edge.district, []);
    byDistrict.get(edge.district).push(edge);
  }
  const markers = [];
  for (const [district, edges] of [...byDistrict.entries()].sort((a, b) => a[0] - b[0])) {
    fractions.forEach((fraction, index) => {
      const edge = edges[index % edges.length];
      const lengths = [];
      let total = 0;
      for (let i = 1; i < edge.points.length; i++) {
        const length = edge.points[i - 1].distanceTo(edge.points[i]);
        lengths.push(length);
        total += length;
      }
      let target = total * fraction;
      for (let i = 0; i < lengths.length; i++) {
        if (target <= lengths[i] || i === lengths.length - 1) {
          const a = edge.points[i];
          const b = edge.points[i + 1];
          const t = lengths[i] ? THREE.MathUtils.clamp(target / lengths[i], 0, 1) : 0;
          const center = a.clone().lerp(b, t);
          const direction = b.clone().sub(a).setY(0).normalize();
          const normal = new THREE.Vector3(-direction.z, 0, direction.x);
          const side = (index + district) % 2 ? 1 : -1;
          const point = center.addScaledVector(normal, side * 3.2);
          markers.push({ id: `d${district}-${index}`, x: point.x, z: point.z });
          break;
        }
        target -= lengths[i];
      }
    });
  }
  return markers;
}

function forecourtPathClear(record, shop) {
  return record.clusterKind === 'forecourt'
    && record.shopId === shop.id
    && pointSegmentDistance(record, shop.point, shop.facadePoint) >= record.radius + 0.6;
}

/** Returns every failed clearance contract for a pure placement record. */
export function expansePropClearanceIssues(record, layout, shops, streetLife, accepted = []) {
  const issues = [];
  for (const edge of layout.edges) {
    const distance = distanceToEdge(record, edge);
    if (distance < edge.width * 0.5 + 1 + record.radius) issues.push(`road:${edge.id}`);
    if (edge.feature === 'tunnel' && distance < edge.width * 0.5 + 6 + record.radius) issues.push(`tunnel:${edge.id}`);
  }
  if (circleIntersectsRect(record, RIVER, 0)) issues.push('river');
  if (distance2D(record, layout.spawn.position) < 8) issues.push('spawn');

  for (const shop of shops) {
    if (distance2D(record, shop.point) >= 12) continue;
    if (!forecourtPathClear(record, shop)) issues.push(`shop-dwell:${shop.id}`);
  }
  for (const marker of deriveDeliveryMarkers(layout)) {
    if (distance2D(record, marker) < 6) issues.push(`delivery:${marker.id}`);
  }

  for (const block of [...layout.buildingBlocks, ...streetLife.buildings]) {
    const rect = {
      minX: block.x - block.sx * 0.5, maxX: block.x + block.sx * 0.5,
      minZ: block.z - block.sz * 0.5, maxZ: block.z + block.sz * 0.5,
    };
    if (circleIntersectsRect(record, rect, 0)) issues.push(`building:${block.id}`);
  }
  for (const stop of streetLife.busStops) {
    if (circleIntersectsOrientedBox(record, stop, 5.2, 1.65)) issues.push(`bus:${stop.id}`);
  }
  streetLife.cars.forEach((car, index) => {
    if (circleIntersectsOrientedBox(record, car, 2, 4.2)) issues.push(`car:${index}`);
  });
  for (const x of [-245, 0, 235]) for (const z of [150, 190]) {
    if (circleIntersectsRect(record, { minX: x - 2, maxX: x + 2, minZ: z - 2.5, maxZ: z + 2.5 })) {
      issues.push(`bridge-pylon:${x}:${z}`);
    }
  }
  for (const other of accepted) {
    if (distance2D(record, other) < record.radius + other.radius + 0.35) issues.push(`prop:${other.id}`);
  }
  return [...new Set(issues)];
}

function recordFor(key, x, z, yaw, cluster, index, groundY, rng) {
  const family = EXPANSE_PROP_FAMILIES[key];
  const meta = PROPS[key];
  if (!family || !meta) throw new Error(`Unknown Expanse prop family ${key}`);
  const [sx, sy, sz] = family.size;
  const district = expanseDistrictAt(x, z).id;
  const radius = Math.hypot(sx, sz) * 0.5;
  return {
    id: `${cluster.id}-${index}`,
    key,
    name: meta.name,
    body: meta.body,
    shape: meta.shape || 'box',
    mass: meta.mass || 0,
    collisionWorld: meta.body === 'decor' ? 'none' : 'prop',
    x, y: groundY, z,
    yaw: yaw + (rng() - 0.5) * 0.1,
    size: [sx, sy, sz],
    radius,
    district,
    chunkId: null,
    clusterId: cluster.id,
    clusterKind: cluster.kind,
    shopId: cluster.shopId || null,
    selectionScore: rng(),
  };
}

/**
 * Pure placement generator shared by Node validation and the browser loader.
 * The current result is intentionally the 25–40 object review slice only.
 */
export function generateExpanseProps(layout, shops, streetLife, seed = EXPANSE_PROP_SEED) {
  const rng = rngFrom(seed);
  const grid = generateExpanseChunkGrid(layout.bounds, 4, 3);
  const accepted = [];
  const rejected = [];

  const accept = (record) => {
    record.chunkId = chunkAt(grid, record.x, record.z).id;
    const issues = expansePropClearanceIssues(record, layout, shops, streetLife, accepted);
    if (issues.length) rejected.push({ id: record.id, key: record.key, issues });
    else accepted.push(record);
  };

  for (const clusterDef of SHOP_CLUSTERS) {
    const shop = shops.find((candidate) => candidate.id === clusterDef.shopId);
    if (!shop) throw new Error(`Missing Expanse prop shop ${clusterDef.shopId}`);
    const cluster = { id: clusterDef.id, kind: 'forecourt', shopId: shop.id };
    clusterDef.specs.forEach(([key, along, streetOffset, yawOffset], index) => {
      const tangentJitter = (rng() - 0.5) * 0.18;
      const streetJitter = (rng() - 0.5) * 0.06;
      const x = shop.facadePoint.x
        + shop.direction.x * (along + tangentJitter)
        + shop.toStreet.x * (streetOffset + streetJitter);
      const z = shop.facadePoint.z
        + shop.direction.z * (along + tangentJitter)
        + shop.toStreet.z * (streetOffset + streetJitter);
      accept(recordFor(key, x, z, shop.heading + yawOffset, cluster, index, clusterDef.groundY, rng));
    });
  }

  const promenade = { id: 'hangang-south-promenade', kind: 'promenade', shopId: null };
  PROMENADE_SPECS.forEach(([key, x, z, yaw], index) => {
    accept(recordFor(key, x + (rng() - 0.5) * 0.16, z, yaw, promenade, index, 0.1, rng));
  });

  return { placements: accepted, rejected, grid, seed, stage: 'review-slice' };
}

/** Mobile uses an unmodified deterministic subset of the same records. */
export function selectExpanseProps(placements, density = 1) {
  if (density >= 0.999) return placements.slice();
  if (density <= 0 || !placements.length) return [];
  const target = Math.max(1, Math.round(placements.length * density));
  const selected = new Set();
  const clusters = new Map();
  for (const placement of placements) {
    if (!clusters.has(placement.clusterId)) clusters.set(placement.clusterId, []);
    clusters.get(placement.clusterId).push(placement);
  }
  for (const records of clusters.values()) {
    records.sort((a, b) => a.selectionScore - b.selectionScore || a.id.localeCompare(b.id));
    selected.add(records[0]);
  }
  for (const placement of placements.slice().sort((a, b) =>
    a.selectionScore - b.selectionScore || a.id.localeCompare(b.id))) {
    if (selected.size >= target) break;
    selected.add(placement);
  }
  return placements.filter((placement) => selected.has(placement));
}

function withBase(url) {
  const base = import.meta.env?.BASE_URL ?? '/';
  return base.endsWith('/') ? base + url : `${base}/${url}`;
}

function massOf(def) {
  if (def.meta?.mass) return def.meta.mass;
  return Math.max(2, (def.catalog.volume || 0.05) * DEFAULT_DENSITY);
}

function propGroundWorld(city, placements) {
  const up = new THREE.Vector3(0, 1, 0);
  return {
    killY: city.killY,
    raycast(origin, direction, far) {
      const hit = city.raycast(origin, direction, far);
      if (hit || direction.y > -0.9) return hit;
      // Sidewalk and promenade slabs are visual-only in the current Expanse
      // BVH. This fallback is private to prop settling; city.raycast stays
      // unchanged, so bumper rays never brake merely for passing a prop.
      let groundY = 0;
      let bestDistance = 9;
      for (const placement of placements) {
        const dx = origin.x - placement.x;
        const dz = origin.z - placement.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq < bestDistance) {
          bestDistance = distanceSq;
          groundY = placement.y;
        }
      }
      const distance = (origin.y - groundY) / -direction.y;
      if (distance < 0 || distance > far) return null;
      return {
        distance,
        point: origin.clone().addScaledVector(direction, distance),
        face: { normal: up },
      };
    },
  };
}

/** Async catalog loader and chunk/type instanced runtime builder. */
export async function loadExpanseProps(scene, city, {
  seed = EXPANSE_PROP_SEED,
  density = 1,
} = {}) {
  const source = city.expanseData;
  if (!source?.layout || !source?.shops || !source?.streetLife || !city.visualChunks) {
    throw new Error('Expanse prop loader requires city.expanseData and city.visualChunks');
  }
  const generated = generateExpanseProps(source.layout, source.shops, source.streetLife, seed);
  const placements = selectExpanseProps(generated.placements, density);
  // Runtime/debug consumers historically compare a placement's home Vector3
  // with its body pose. Keep the pure records scalar-only, then add that
  // compatibility field after selection in the browser lane.
  for (const placement of placements) {
    placement.position = new THREE.Vector3(placement.x, placement.y, placement.z);
  }
  const usedKeys = new Set(placements.map((placement) => placement.key));
  const catalog = await fetch(withBase(CATALOG_URL)).then((response) => {
    if (!response.ok) throw new Error(`props catalog ${response.status}`);
    return response.json();
  });

  const catalogDefs = new Map();
  for (const pack of catalog.packs) for (const prop of pack.props) {
    const key = `${pack.id}:${prop.index}`;
    if (usedKeys.has(key)) catalogDefs.set(key, { pack, prop });
  }
  for (const key of usedKeys) if (!catalogDefs.has(key)) throw new Error(`Missing Expanse prop catalog key ${key}`);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const defs = new Map();
  const usedPacks = [...new Set([...catalogDefs.values()].map(({ pack }) => pack))];
  await Promise.all(usedPacks.map(async (pack) => {
    const gltf = await loader.loadAsync(withBase(pack.url));
    const byName = new Map();
    gltf.scene.traverse((object) => { if (object.isMesh) byName.set(object.name, object); });
    for (const prop of pack.props) {
      const key = `${pack.id}:${prop.index}`;
      if (!usedKeys.has(key)) continue;
      const mesh = byName.get(prop.node);
      if (!mesh) throw new Error(`${key} missing node ${prop.node}`);
      defs.set(key, {
        key,
        geometry: mesh.geometry,
        material: mesh.material,
        size: new THREE.Vector3(...prop.size),
        catalog: prop,
        meta: PROPS[key],
      });
    }
  }));

  const groups = [];
  const instances = new Map();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const byChunkAndKey = new Map();
  for (const placement of placements) {
    const bucket = `${placement.chunkId}|${placement.key}`;
    if (!byChunkAndKey.has(bucket)) byChunkAndKey.set(bucket, []);
    byChunkAndKey.get(bucket).push(placement);
  }

  const chunkGroups = new Map();
  for (const placement of placements) {
    if (chunkGroups.has(placement.chunkId)) continue;
    const chunk = city.visualChunks.chunks.find((candidate) => candidate.id === placement.chunkId);
    if (!chunk) throw new Error(`Missing Expanse visual chunk ${placement.chunkId}`);
    const group = new THREE.Group();
    group.name = `expanse_props_${placement.chunkId}`;
    chunk.micro.add(group);
    chunkGroups.set(placement.chunkId, group);
    groups.push(group);
  }

  for (const [bucket, list] of byChunkAndKey) {
    const [, key] = bucket.split('|');
    const def = defs.get(key);
    const mesh = new THREE.InstancedMesh(def.geometry, def.material, list.length);
    mesh.name = `expanse_prop_${bucket.replace('|', '_')}`;
    list.forEach((placement, index) => {
      position.set(placement.x, placement.y, placement.z);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw);
      mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
      placement.instanceIndex = index;
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    chunkGroups.get(list[0].chunkId).add(mesh);
    instances.set(bucket, { mesh, list });
  }

  const propWorld = new PropWorld({ world: propGroundWorld(city, placements) });
  const handleToPlacement = new Map();
  for (const placement of placements) {
    const def = defs.get(placement.key);
    if (placement.body === 'decor') continue;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw);
    const handle = propWorld.add({
      position: new THREE.Vector3(placement.x, placement.y, placement.z),
      quaternion: q,
      size: def.size,
      mass: massOf(def),
      shape: placement.shape,
      static: placement.body === 'static',
      userData: placement.key,
    });
    placement.handle = handle;
    handleToPlacement.set(handle, placement);
    if (placement.body === 'dynamic') propWorld.wake(handle);
  }

  function update() {
    const dirty = new Set();
    propWorld.forEachMoved((handle) => {
      const placement = handleToPlacement.get(handle);
      if (!placement) return;
      const bucket = `${placement.chunkId}|${placement.key}`;
      const entry = instances.get(bucket);
      if (!entry) return;
      propWorld.getRenderMatrix(handle, matrix);
      entry.mesh.setMatrixAt(placement.instanceIndex, matrix);
      dirty.add(entry.mesh);
    });
    for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
  }

  const byBody = Object.fromEntries(['static', 'dynamic', 'decor'].map((body) => [body,
    placements.filter((placement) => placement.body === body).length]));
  const stats = {
    placed: placements.length,
    authored: generated.placements.length,
    rejected: generated.rejected.length,
    types: usedKeys.size,
    bodies: propWorld.bodies.size,
    staticBodies: byBody.static,
    dynamicBodies: byBody.dynamic,
    decor: byBody.decor,
    chunks: chunkGroups.size,
    stage: generated.stage,
    license: EXPANSE_PROP_LICENSE,
  };
  Object.assign(city.stats, {
    expanseProps: stats.placed,
    expansePropBodies: stats.bodies,
    expansePropChunks: stats.chunks,
  });

  return {
    group: null,
    groups,
    catalog,
    defs,
    placements,
    generated,
    world: propWorld,
    lampAnchors: [],
    stats,
    update,
    setMass(key, kg) {
      for (const placement of placements) if (placement.key === key && placement.handle) {
        propWorld.setMass(placement.handle, kg);
      }
    },
    reset() { propWorld.resetAll(); update(); },
    dispose() { for (const group of groups) group.removeFromParent(); },
  };
}
