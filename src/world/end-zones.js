// The visible hard boundary around the district layout: walls exactly where the
// drivable ground ends, and the water that fills the rim beyond it (and shows
// through the narrow seam slots between districts). The geometry is
// deliberately procedural — it re-derives itself from a ground scan, so it
// stays correct however TILE_LAYOUT is arranged.
//
// Containment model: districts and connector bridge decks are solid ground,
// everything else is water. buildGroundEdgeWalls walls each solid -> hole
// transition (district rims AND the sides of every bridge deck), and puts a
// concrete shoulder apron between the ground edge and each wall, so the player
// gets a few metres of drift room past the kerb before anything stops them —
// and no invisible wall anywhere: what stops the van is what the player sees.
// The rectangular perimeter at the world bounds is only a temporary backstop
// until visual QA confirms the edge walls alone contain the van.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

function addBox(group, collision, size, position, material, name, collide = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(position);
  mesh.name = name;
  group.add(mesh);
  if (collide) collision.push(mesh);
  return mesh;
}

/** Drift shoulder: metres of concrete apron between the ground edge and the wall. */
const SHOULDER = 5;
/** Apron top sits this far below roadY so it laps the slab without z-fighting it. */
const APRON_LIP = 0.04;
/** Apron skirt below roadY — the waterline is 1.1 down, so this reaches under it. */
const APRON_DEPTH = 1.5;

/**
 * Wall the edge of the drivable ground, with a drift shoulder.
 *
 * A single rectangular perimeter is useless on a district whose ground is not a
 * rectangle: a barrier out at the geometry bounds floats over nothing and the
 * player falls through the gap long before reaching it.
 *
 * So find the edge instead of assuming it. Sample a grid, mark every cell with
 * drivable-height ground, and wall each edge where a solid cell meets a hole.
 * Runs are merged along each axis so this costs a few dozen boxes, not hundreds,
 * and it re-derives itself if the layout ever changes.
 *
 * Each wall stands SHOULDER metres out from the ground edge, on a concrete
 * apron that bridges the gap — without the apron the van would drop off the
 * rim into the water before ever reaching the wall. The apron reads as the
 * quay footing the wall stands on, and is drivable like the ground it laps.
 */
function buildGroundEdgeWalls(group, collision, { groundAt, bounds, roadY, material, step = 2, height = 1.6 }) {
  const cols = Math.max(1, Math.ceil((bounds.max.x - bounds.min.x) / step));
  const rows = Math.max(1, Math.ceil((bounds.max.z - bounds.min.z) / step));
  const cellX = (i) => bounds.min.x + (i + 0.5) * step;
  const cellZ = (j) => bounds.min.z + (j + 0.5) * step;

  const solid = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const y = groundAt(cellX(i), cellZ(j));
      // Drivable height only. Counting rooftops would trace the walls of every
      // building in the sky instead of the edge of the street.
      solid[j * cols + i] = y != null && y < roadY + 1.2 ? 1 : 0;
    }
  }
  const at = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? 0 : solid[j * cols + i]);

  let count = 0;
  const apronH = APRON_LIP + APRON_DEPTH;
  const apronY = roadY - APRON_LIP - apronH / 2; // top face at roadY - APRON_LIP
  const wallY = roadY + height / 2 - 0.3; // sunk so no gap shows under it over the apron lip

  // One merged edge run: a shoulder apron from just inside the last drivable
  // cell out to the wall, plus the wall on the apron's outer edge.
  const edge = (cellCentre, dir, crossCentre, crossLen, alongX) => {
    const groundEdge = cellCentre + dir * step / 2;
    const apronLen = SHOULDER + 0.4; // laps 0.4 in over the slab to hide the seam
    const apronCentre = groundEdge + dir * ((SHOULDER - 0.4) / 2);
    const wallCentre = groundEdge + dir * SHOULDER;
    addBox(group, collision,
      alongX ? new THREE.Vector3(apronLen, apronH, crossLen) : new THREE.Vector3(crossLen, apronH, apronLen),
      new THREE.Vector3(alongX ? apronCentre : crossCentre, apronY, alongX ? crossCentre : apronCentre),
      material, 'district_shoulder');
    addBox(group, collision,
      alongX ? new THREE.Vector3(0.5, height, crossLen) : new THREE.Vector3(crossLen, height, 0.5),
      new THREE.Vector3(alongX ? wallCentre : crossCentre, wallY, alongX ? crossCentre : wallCentre),
      material, 'district_edge');
    count++;
  };

  // Edges facing +/-X: merge consecutive rows at the same column.
  for (let i = 0; i < cols; i++) {
    for (const dir of [-1, 1]) {
      let runStart = -1;
      for (let j = 0; j <= rows; j++) {
        const open = j < rows && at(i, j) === 1 && at(i + dir, j) === 0;
        if (open && runStart < 0) runStart = j;
        if (!open && runStart >= 0) {
          const z0 = cellZ(runStart) - step / 2;
          const z1 = cellZ(j - 1) + step / 2;
          edge(cellX(i), dir, (z0 + z1) / 2, z1 - z0, true);
          runStart = -1;
        }
      }
    }
  }
  // Edges facing +/-Z: merge consecutive columns at the same row.
  for (let j = 0; j < rows; j++) {
    for (const dir of [-1, 1]) {
      let runStart = -1;
      for (let i = 0; i <= cols; i++) {
        const open = i < cols && at(i, j) === 1 && at(i, j + dir) === 0;
        if (open && runStart < 0) runStart = i;
        if (!open && runStart >= 0) {
          const x0 = cellX(runStart) - step / 2;
          const x1 = cellX(i - 1) + step / 2;
          edge(cellZ(j), dir, (x0 + x1) / 2, x1 - x0, false);
          runStart = -1;
        }
      }
    }
  }
  return count;
}

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
 * @param {number}  opts.roadY         driving-surface height
 * @param {THREE.Box3} opts.barrierBounds  where the world actually ends
 * @param {(x: number, z: number) => number|null} [opts.groundAt]  drivable-height probe
 */
export function createEndZones(scene, { roadY, barrierBounds, groundAt = null }) {
  const group = new THREE.Group();
  group.name = 'district_boundaries';
  const collision = [];
  // These are untextured boxes, so their only defence against reading as
  // blockout is being dark and rough enough not to catch the eye. At 0x777e84
  // a streetlight blew them out to near-white and every kerb wall on the map
  // announced itself; this is closer to the wet concrete parapet they stand in
  // for, and it sits under the block's own pavement in value.
  const barrierMat = new THREE.MeshStandardMaterial({
    color: 0x333a41, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.5,
  });

  // Expand by SHOULDER so the scan also covers the drift aprons and the
  // temporary perimeter below stands beyond them, not through them.
  const outer = barrierBounds.clone().expandByScalar(SHOULDER);

  // The water the districts stand in. VISUAL ONLY — it is never added to the
  // collision set, so the ground scan reads it as a hole (and walls the shore)
  // and a van that somehow gets past the walls falls to killY instead of
  // driving on the sea.
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0b1a20, roughness: 0.16, metalness: 0.42, envMapIntensity: 1.5 });
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(
      outer.max.x - outer.min.x + 240,
      outer.max.z - outer.min.z + 240
    ).rotateX(-Math.PI / 2),
    waterMat
  );
  water.position.set((outer.min.x + outer.max.x) / 2, roadY - 1.1, (outer.min.z + outer.max.z) / 2);
  water.name = 'water';
  group.add(water);

  // The edge of the drivable ground, walled exactly where it is — district
  // rims and both sides of every connector bridge deck.
  let edgeWalls = 0;
  if (groundAt) {
    edgeWalls = buildGroundEdgeWalls(group, collision, {
      groundAt, bounds: outer, roadY, material: barrierMat,
    });
  }

  // TEMPORARY backstop: a continuous hard perimeter at the world bounds,
  // behind the edge walls, until QA confirms they contain the van alone.
  // Collision and visuals are the same boxes; there is no invisible wall
  // offset from what the player sees.
  const barrierH = 1.25;
  const barrierT = 0.55;
  const cx = (outer.min.x + outer.max.x) / 2;
  const cz = (outer.min.z + outer.max.z) / 2;
  addBox(group, collision, new THREE.Vector3(outer.max.x - outer.min.x, barrierH, barrierT), new THREE.Vector3(cx, roadY + barrierH / 2, outer.min.z), barrierMat, 'north_perimeter');
  addBox(group, collision, new THREE.Vector3(outer.max.x - outer.min.x, barrierH, barrierT), new THREE.Vector3(cx, roadY + barrierH / 2, outer.max.z), barrierMat, 'south_perimeter');
  addBox(group, collision, new THREE.Vector3(barrierT, barrierH, outer.max.z - outer.min.z), new THREE.Vector3(outer.min.x, roadY + barrierH / 2, cz), barrierMat, 'west_perimeter');
  addBox(group, collision, new THREE.Vector3(barrierT, barrierH, outer.max.z - outer.min.z), new THREE.Vector3(outer.max.x, roadY + barrierH / 2, cz), barrierMat, 'east_perimeter');

  scene.add(group);
  const colliderGeo = buildCollisionGeometry(collision);
  const ray = new THREE.Ray();
  function raycast(origin, direction, far = 100) {
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
    bounds: outer.clone(),
    roadMaterials: [],
    stats: {
      collisionTriangles: colliderGeo.attributes.position.count / 3,
      edgeWalls,
    },
  };
}
