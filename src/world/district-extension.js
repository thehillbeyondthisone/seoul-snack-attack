// Authored procedural north quay: a third street turns the source block's wide
// boulevard into two real driving loops and gives the district a natural edge.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

function addBox(group, collision, size, position, material, name, collidable = true) {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(position);
  group.add(mesh);
  if (collidable) collision.push(mesh);
  return mesh;
}

function collisionGeometry(meshes) {
  const positions = [];
  const point = new THREE.Vector3();
  for (const mesh of meshes) {
    mesh.updateMatrixWorld(true);
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const attribute = geometry.attributes.position;
    for (let i = 0; i < attribute.count; i++) {
      point.fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld);
      positions.push(point.x, point.y, point.z);
    }
    if (geometry !== mesh.geometry) geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.boundsTree = new MeshBVH(geometry);
  return geometry;
}

export function createDistrictExtension(scene, {
  roadY,
  west = -44.5,
  east = 39.6,
  northStreetZ = 38.5,
  roadWidth = 7.6,
  crosses = [-40, -14.25, 34],
} = {}) {
  const group = new THREE.Group();
  group.name = 'north_quay_district';
  const collision = [];

  const asphalt = new THREE.MeshStandardMaterial({
    name: 'north_quay_asphalt', color: 0x151b22, roughness: 0.58,
    metalness: 0.04, envMapIntensity: 1.2,
  });
  const pavement = new THREE.MeshStandardMaterial({
    name: 'north_quay_pavement', color: 0x555d63, roughness: 0.84,
    metalness: 0.04,
  });
  const concrete = new THREE.MeshStandardMaterial({
    name: 'north_quay_concrete', color: 0x474f54, roughness: 0.9,
  });
  const rail = new THREE.MeshStandardMaterial({
    name: 'north_quay_rail', color: 0x76828a, roughness: 0.42, metalness: 0.68,
  });
  const stripe = new THREE.MeshStandardMaterial({
    name: 'north_quay_marking', color: 0xd9e2e6, roughness: 0.55,
    emissive: 0x11181c, emissiveIntensity: 0.18,
  });

  const streetCenterX = (west + east) / 2;
  const streetLength = east - west;
  const sourceNorthLaneZ = 21.35;
  const connectorLength = northStreetZ - sourceNorthLaneZ;

  // The northern street and three broad cross-connections form two actual
  // blocks with the authored boulevard. Slight overlap hides every seam.
  addBox(
    group, collision,
    new THREE.Vector3(streetLength, 0.12, roadWidth),
    new THREE.Vector3(streetCenterX, roadY - 0.06, northStreetZ),
    asphalt, 'north_quay_street'
  );
  for (const [index, x] of crosses.entries()) {
    addBox(
      group, collision,
      new THREE.Vector3(roadWidth, 0.12, connectorLength + roadWidth),
      new THREE.Vector3(x, roadY - 0.06, (sourceNorthLaneZ + northStreetZ) / 2),
      asphalt, `north_quay_cross_${index}`
    );
  }

  // Shop apron on the inland side of the canal. Storefront seals are stood on
  // this slab by district-dressing.js and face back toward the street.
  const quayEdgeZ = 47;
  addBox(
    group, collision,
    new THREE.Vector3(streetLength + 4, 0.18, quayEdgeZ - northStreetZ - roadWidth / 2),
    new THREE.Vector3(streetCenterX, roadY + 0.04, (northStreetZ + roadWidth / 2 + quayEdgeZ) / 2),
    pavement, 'north_quay_shop_apron'
  );

  // Simple lane markings make the procedural addition read as road rather
  // than a dark plaza. They are visual-only and sit clear of wheel raycasts.
  for (let x = west + 4; x < east - 2; x += 8) {
    addBox(
      group, collision,
      new THREE.Vector3(4, 0.018, 0.13),
      new THREE.Vector3(x, roadY + 0.018, northStreetZ),
      stripe, 'north_quay_lane_dash', false
    );
  }

  // A canal is a legible, Seoul-plausible world edge. The quay wall and rail
  // are the physical boundary; the water and far retaining wall make the edge
  // visible long before the player reaches it.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(streetLength + 18, 24),
    new THREE.MeshPhysicalMaterial({
      name: 'north_quay_water', color: 0x173d49, roughness: 0.2,
      metalness: 0.08, transparent: true, opacity: 0.88,
      envMapIntensity: 1.7, clearcoat: 0.55, clearcoatRoughness: 0.22,
    })
  );
  water.name = 'north_quay_canal';
  water.rotation.x = -Math.PI / 2;
  water.position.set(streetCenterX, roadY - 0.62, quayEdgeZ + 12);
  group.add(water);

  addBox(
    group, collision,
    new THREE.Vector3(streetLength + 4, 1.7, 0.8),
    new THREE.Vector3(streetCenterX, roadY - 0.55, quayEdgeZ),
    concrete, 'north_quay_wall'
  );
  addBox(
    group, collision,
    new THREE.Vector3(streetLength + 4, 0.16, 0.16),
    new THREE.Vector3(streetCenterX, roadY + 1.02, quayEdgeZ - 0.38),
    rail, 'north_quay_guardrail'
  );
  for (let x = west - 1; x <= east + 1; x += 3.2) {
    addBox(
      group, collision,
      new THREE.Vector3(0.12, 1.05, 0.12),
      new THREE.Vector3(x, roadY + 0.52, quayEdgeZ - 0.38),
      rail, 'north_quay_guardrail_post'
    );
  }
  addBox(
    group, collision,
    new THREE.Vector3(streetLength + 18, 3.2, 0.9),
    new THREE.Vector3(streetCenterX, roadY + 0.45, quayEdgeZ + 24),
    concrete, 'north_quay_far_wall', false
  );

  scene.add(group);
  group.updateMatrixWorld(true);
  const colliderGeo = collisionGeometry(collision);
  const ray = new THREE.Ray();
  function raycast(origin, direction, far = 100) {
    ray.origin.copy(origin);
    ray.direction.copy(direction);
    const hit = colliderGeo.boundsTree.raycastFirst(ray, THREE.DoubleSide, 0, far);
    if (!hit) return null;
    return {
      distance: hit.distance,
      point: hit.point.clone(),
      face: hit.face ? { normal: hit.face.normal.clone() } : null,
    };
  }

  return {
    group, colliderGeo, raycast,
    roadMaterials: [asphalt],
    drivableBounds: new THREE.Box3(
      new THREE.Vector3(west - 2, roadY - 0.2, sourceNorthLaneZ),
      new THREE.Vector3(east + 2, roadY + 1.2, quayEdgeZ)
    ),
    worldBounds: new THREE.Box3(
      new THREE.Vector3(west - 9, roadY - 0.7, sourceNorthLaneZ),
      new THREE.Vector3(east + 9, roadY + 3, quayEdgeZ + 24.5)
    ),
    stats: {
      collisionTriangles: colliderGeo.attributes.position.count / 3,
      crosses: crosses.length,
    },
  };
}
