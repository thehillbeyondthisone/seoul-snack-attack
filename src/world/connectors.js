// Visible geometry for the road graph's connector edges: flat bridge decks
// that carry a street mouth of one district across open water to the matching
// mouth of its neighbour. Deliberately procedural (boxes only, no new asset),
// the same pattern end-zones.js uses, so the decks stay aligned with whatever
// layout the graph produces.
//
// Containment is NOT this module's job: end-zones.js walls every
// solid -> hole ground transition, and because these decks are part of the
// ground scan they get parapet walls along their sides for free.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const DECK_THICKNESS = 0.5;
const END_OVERHANG = 3;   // metres the deck runs PAST each mouth into the district
const SEG_OVERLAP = 1.5;  // metres adjoining segment boxes overlap at joints

function buildCollisionGeometry(meshes) {
  const positions = [];
  const p = new THREE.Vector3();
  for (const mesh of meshes) {
    mesh.updateMatrixWorld(true);
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const attr = source.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      p.fromBufferAttribute(attr, i).applyMatrix4(mesh.matrixWorld);
      positions.push(p.x, p.y, p.z);
    }
    if (source !== mesh.geometry) source.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.boundsTree = new MeshBVH(geometry);
  return geometry;
}

/**
 * @param {object}  opts
 * @param {object[]} opts.edges     connector edges from the built road graph
 *                                  (world-space `points` polylines)
 * @param {number}   opts.roadY     deck driving-surface height
 * @param {number}   opts.roadWidth carriageway width
 * @param {(x: number, z: number) => boolean} [opts.hasAuthoredRoad]
 *        true where the districts already provide drivable ground at roadY. A
 *        deck there bridges nothing and only puts an untextured slab on top of
 *        the authored asphalt, so it is skipped.
 * @param {THREE.Material} [opts.material] the block's own road material, so a
 *        deck that IS needed reads as road
 */
export function createConnectors(scene, {
  edges, roadY, roadWidth, hasAuthoredRoad = null, material = null,
}) {
  const group = new THREE.Group();
  group.name = 'district_connectors';
  const collision = [];
  const asphalt = material
    || new THREE.MeshStandardMaterial({ color: 0x171c22, roughness: 0.58, metalness: 0.04, envMapIntensity: 1.15 });
  const deckWidth = roadWidth + 1.5;
  let skipped = 0;

  const drivableBounds = new THREE.Box3().makeEmpty();
  const dir = new THREE.Vector3();

  for (const edge of edges) {
    const pts = edge.points;
    if (!pts || pts.length < 2) continue;
    // Extend the ends past the mouths into the districts, so the ground scan
    // and the suspension rays see continuous ground across the seam.
    const first = pts[0].clone().addScaledVector(dir.copy(pts[0]).sub(pts[1]).setY(0).normalize(), END_OVERHANG);
    const last = pts[pts.length - 1].clone().addScaledVector(
      dir.copy(pts[pts.length - 1]).sub(pts[pts.length - 2]).setY(0).normalize(), END_OVERHANG
    );
    const line = [first, ...pts, last];

    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      // Every segment is a touch long, so adjoining decks overlap at joints
      // instead of leaving wheel-swallowing seams.
      const length = a.distanceTo(b) + SEG_OVERLAP;
      if (length < 0.5) continue;
      // Both ends AND the middle already on authored road means this segment
      // has nothing to bridge.
      if (hasAuthoredRoad) {
        const mid = a.clone().lerp(b, 0.5);
        if (hasAuthoredRoad(a.x, a.z) && hasAuthoredRoad(mid.x, mid.z) && hasAuthoredRoad(b.x, b.z)) {
          // Still counts as drivable ground for the bounds and the edge scan —
          // the district's own asphalt is carrying it.
          drivableBounds.expandByPoint(a).expandByPoint(b);
          skipped++;
          continue;
        }
      }
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(deckWidth, DECK_THICKNESS, length), asphalt);
      mesh.position.copy(a).lerp(b, 0.5);
      mesh.position.y = roadY - DECK_THICKNESS / 2 + 0.02; // deck top flush with the authored asphalt
      mesh.lookAt(b.x, mesh.position.y, b.z);
      mesh.name = `connector_${edge.id}_${i}`;
      group.add(mesh);
      collision.push(mesh);
      drivableBounds.expandByPoint(a).expandByPoint(b);
    }
  }

  scene.add(group);
  const colliderGeo = collision.length
    ? buildCollisionGeometry(collision)
    : new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  const worldBounds = drivableBounds.clone();
  worldBounds.min.y = roadY - DECK_THICKNESS;
  worldBounds.max.y = roadY + 0.1;

  const ray = new THREE.Ray();
  function raycast(origin, direction, far = 100) {
    if (!collision.length) return null;
    ray.origin.copy(origin); ray.direction.copy(direction);
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
    drivableBounds, worldBounds,
    roadMaterials: collision.length ? [asphalt] : [],
    stats: {
      collisionTriangles: colliderGeo.attributes.position.count / 3,
      decks: collision.length,
      skippedOnAuthoredRoad: skipped,
    },
  };
}
