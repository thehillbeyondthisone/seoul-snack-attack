// Synthetic worlds for the physics bench.
//
// Each world implements the EXACT contract src/world/city.js exposes, because
// that is what VehiclePhysics consumes:
//     raycast(origin, dir, far) -> { point, face: { normal }, distance } | null
//     killY: number
//
// The old phys-test.tmp.mjs stub returned null for any ray with dir.y > -0.3,
// which silently skipped all 8 body-collision rays in physics.js — so the
// collision path was never once exercised by a test. These worlds answer
// horizontal rays properly, which is the whole point of the wall fixtures.
//
// The real city is only 54.6 x 30.3 m; a 0-100 km/h run needs ~135 m and a
// 100-0 stop ~46 m. Handling numbers therefore have to be measured on
// synthetic ground, not in the game world.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Ray vs. a single infinite plane.
 * @returns hit record in the city.js shape, or null.
 */
function intersectPlane(origin, dir, far, pointOnPlane, normal) {
  const denom = dir.dot(normal);
  if (Math.abs(denom) < 1e-9) return null; // parallel
  const t = pointOnPlane.clone().sub(origin).dot(normal) / denom;
  if (t < 0 || t > far) return null;
  return {
    point: origin.clone().addScaledVector(dir, t),
    face: { normal: normal.clone() },
    distance: t,
  };
}

/** Nearest of several hits. */
function nearest(hits) {
  let best = null;
  for (const h of hits) if (h && (!best || h.distance < best.distance)) best = h;
  return best;
}

/** Infinite flat ground at y = 0. The baseline for all handling metrics. */
export function flatPlane({ killY = -20 } = {}) {
  const origin0 = new THREE.Vector3(0, 0, 0);
  return {
    name: 'flat',
    killY,
    raycast(origin, dir, far = 100) {
      return intersectPlane(origin, dir, far, origin0, UP);
    },
  };
}

/**
 * Flat ground plus one vertical wall, for oblique-impact tests.
 * Wall occupies the plane x = atX, with its face pointing back toward -X.
 */
export function wall({ atX = 40, killY = -20 } = {}) {
  const ground = new THREE.Vector3(0, 0, 0);
  const wallPoint = new THREE.Vector3(atX, 0, 0);
  const wallNormal = new THREE.Vector3(-1, 0, 0);
  return {
    name: `wall@x=${atX}`,
    killY,
    raycast(origin, dir, far = 100) {
      return nearest([
        intersectPlane(origin, dir, far, ground, UP),
        intersectPlane(origin, dir, far, wallPoint, wallNormal),
      ]);
    },
  };
}

/**
 * Flat ground with a single step of `height` starting at z = atZ.
 * Models a curb strike: tests for tunneling and vertical accel spikes.
 */
export function stepBump({ height = 0.12, atZ = 30, killY = -20 } = {}) {
  const lower = new THREE.Vector3(0, 0, 0);
  const upper = new THREE.Vector3(0, height, 0);
  const riser = new THREE.Vector3(0, 0, atZ);
  const riserNormal = new THREE.Vector3(0, 0, -1);
  return {
    name: `step ${height}m`,
    killY,
    raycast(origin, dir, far = 100) {
      const hits = [];
      // Ground plane, whichever side of the step we are on.
      const gLow = intersectPlane(origin, dir, far, lower, UP);
      if (gLow && gLow.point.z < atZ) hits.push(gLow);
      const gHigh = intersectPlane(origin, dir, far, upper, UP);
      if (gHigh && gHigh.point.z >= atZ) hits.push(gHigh);
      // The vertical riser face.
      const r = intersectPlane(origin, dir, far, riser, riserNormal);
      if (r && r.point.y <= height && r.point.y >= 0) hits.push(r);
      return nearest(hits);
    },
  };
}

/** Load the baked city collider into a three-mesh-bvh, for the soak test. */
export async function bakedCity(binPath = 'tools/bench/data/city.collider.bin') {
  const { readFileSync } = await import('node:fs');
  const { MeshBVH } = await import('three-mesh-bvh');
  const buf = readFileSync(binPath);
  const positions = new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const bvh = new MeshBVH(geo);
  const ray = new THREE.Ray();
  const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
  return {
    name: 'city (baked)',
    killY: box.min.y - 2,
    bounds: box,
    triangleCount: positions.length / 9,
    raycast(origin, dir, far = 100) {
      ray.origin.copy(origin);
      ray.direction.copy(dir);
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
      if (!hit || hit.distance > far) return null;
      return hit;
    },
  };
}
