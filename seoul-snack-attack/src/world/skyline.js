// The city beyond the playable fabric: a ring of distant tower masses standing
// in the water past the boundary walls.
//
// Without it the ten districts sit on a dark plane that fades to flat haze, and
// the world reads as an island — which is exactly the problem the Hong Kong
// two-block map had. Seoul is a basin packed with mid-rise towers to the
// horizon, so what the player should see past the last shopfront is more city.
//
// Deliberately cheap and deliberately unreachable:
//   - ONE InstancedMesh over one BoxGeometry, so the whole horizon is a single
//     draw call whatever the count.
//   - no collision, and nothing is added to any raycast. These stand outside
//     end-zones.js's perimeter, so the van cannot get near them; if it somehow
//     did it would pass straight through.
//   - no LOD and no culling logic. Fog does the work: the far band is mostly
//     haze, which is the point — it gives the horizon depth instead of an edge.
//
// The window texture is the same generated tile the storefront dressing uses
// (see ATTRIBUTION.md — no logos, no readable text), as both map and emissive
// map, so the towers light up at night and read as glazing by day.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const WINDOWS_URL = 'assets/district/textures/seoul-windows-night.webp';

/**
 * @param {THREE.Scene} scene
 * @param {object}  opts
 * @param {THREE.Box3} opts.bounds   the playable world, including its boundary
 * @param {number}  opts.roadY       street level, the towers' base
 * @param {THREE.LoadingManager} [opts.manager]
 * @param {number}  [opts.count]     tower count across all bands
 */
export function createSkyline(scene, { bounds, roadY, manager = null, count = 220 }) {
  const group = new THREE.Group();
  group.name = 'skyline';

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  // Start well clear of the perimeter and run out to roughly three times the
  // map's own extent, which is past the point fog has taken over entirely.
  // The inner radius is deliberately generous: a tower close enough to be seen
  // without haze reads as what it is, a plain box, and fog is what sells these.
  const inner = Math.max(size.x, size.z) * 0.95;
  const outer = Math.max(size.x, size.z) * 2.9;

  const texture = new THREE.TextureLoader(manager).load(WINDOWS_URL);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 8);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshStandardMaterial({
    name: 'skyline_towers',
    map: texture,
    emissiveMap: texture,
    emissive: new THREE.Color(0xffffff),
    // Kept below the bloom threshold on purpose: a horizon that blooms turns
    // into a white band and swallows the actual skyline silhouette.
    emissiveIntensity: 0.55,
    color: 0x39424f,
    roughness: 0.82,
    metalness: 0.05,
    fog: true,
  });

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  // The base sits at the origin so an instance's Y scale grows upward.
  geometry.translate(0, 0.5, 0);

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'skyline_towers';
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  mesh.frustumCulled = false; // it surrounds the camera; per-instance culling is not a thing here
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const rng = mulberry32(20260815);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const tint = new THREE.Color();

  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 40) {
    // Rejection-sample an annulus: uniform in the outer square, discard
    // anything that lands over the playable fabric.
    const x = center.x + (rng() * 2 - 1) * outer;
    const z = center.z + (rng() * 2 - 1) * outer;
    const clearance = Math.max(
      Math.abs(x - center.x) / (size.x * 0.5),
      Math.abs(z - center.z) / (size.z * 0.5)
    );
    if (clearance < 1) continue; // inside the map
    const distance = Math.hypot(x - center.x, z - center.z);
    if (distance < inner) continue;

    // Taller with distance, so the horizon rises rather than forming a wall at
    // the map edge and staying flat behind it.
    const far = THREE.MathUtils.clamp((distance - inner) / (outer - inner), 0, 1);
    const height = THREE.MathUtils.lerp(12, 34, far) * (0.55 + rng() * 1.1);
    const footprint = THREE.MathUtils.lerp(9, 22, far) * (0.7 + rng() * 0.8);

    position.set(x, roadY - 1.0, z); // based just under the waterline
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    scale.set(footprint, height, footprint * (0.6 + rng() * 0.8));
    mesh.setMatrixAt(placed, matrix.compose(position, quaternion, scale));

    // Cooler and dimmer with distance — cheap aerial perspective on top of the
    // fog, which is what stops the far band reading as a flat cut-out.
    tint.setHSL(0.58 + rng() * 0.06, 0.10 + rng() * 0.12, THREE.MathUtils.lerp(0.62, 0.30, far));
    mesh.setColorAt(placed, tint);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  group.add(mesh);
  scene.add(group);

  return {
    group,
    material,
    /** Retuned by the 조명 debug folder alongside the city's own emissives. */
    emissiveMaterials: [material],
    stats: { towers: placed, inner: +inner.toFixed(1), outer: +outer.toFixed(1) },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      scene.remove(group);
    },
  };
}
