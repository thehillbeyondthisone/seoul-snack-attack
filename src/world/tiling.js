// Seoul Delivery — city tile grid: per-tile transforms + a tile-local raycast.
//
// The city is ONE block of geometry repeated on a grid, so the only thing that
// differs per tile is a rigid transform. We therefore keep exactly one MeshBVH,
// built once in tile-local space, and transform the RAY into each tile rather
// than duplicating 226k triangles per tile. BVH build cost and memory stay at
// 1x however large the grid gets — which is the entire point of this module.
//
// Pure three.js, no project imports, so tools/bench/worlds.js can build the
// same grid headlessly and test this math without a browser.
import * as THREE from 'three';

const _lray = new THREE.Ray();

/**
 * @param {object}  opts
 * @param {THREE.Box3} opts.tileBox    one tile's footprint, in tile-local space
 * @param {number}  [opts.cols]
 * @param {number}  [opts.rows]
 * @param {{x:number,z:number,rotation?:number}[]} [opts.placements]
 * @param {boolean} [opts.flipOddRows] yaw odd Z rows by 180 degrees
 * @param {number}  [opts.overhang]    metres geometry may spill past its cell
 */
export function makeTileGrid({ tileBox, cols = 1, rows = 1, placements = null, flipOddRows = true, overhang = 0 }) {
  const size = tileBox.getSize(new THREE.Vector3());
  const pitchX = size.x;
  const pitchZ = size.z;

  // Rotate about the vertical axis through the footprint centre, so a flipped
  // tile's road lands exactly where an unflipped one's does.
  const boxCenter = tileBox.getCenter(new THREE.Vector3());
  const pivot = new THREE.Vector3(boxCenter.x, 0, boxCenter.z);

  const count = placements?.length || cols * rows;
  const matrices = [];
  const inverses = [];
  const flipped = [];
  const rotations = [];
  const centers = [];

  const _t = new THREE.Matrix4();
  const _r = new THREE.Matrix4();
  if (placements) {
    cols = placements.length;
    rows = 1;
    for (const placement of placements) {
      const rotation = placement.rotation || 0;
      const m = new THREE.Matrix4()
        .makeTranslation(placement.x, 0, placement.z)
        .multiply(_r.makeRotationY(rotation))
        .multiply(_t.makeTranslation(-pivot.x, 0, -pivot.z));
      matrices.push(m);
      inverses.push(m.clone().invert());
      rotations.push(rotation);
      flipped.push(Math.abs(Math.abs(rotation) - Math.PI) < 1e-4);
      centers.push(new THREE.Vector3(placement.x, 0, placement.z));
    }
  } else for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const flip = flipOddRows && j % 2 === 1;
      const cx = pivot.x + (i - (cols - 1) / 2) * pitchX;
      const cz = pivot.z + (j - (rows - 1) / 2) * pitchZ;
      // M = T(centre) . Ry(flip) . T(-pivot)
      const m = new THREE.Matrix4()
        .makeTranslation(cx, 0, cz)
        .multiply(_r.makeRotationY(flip ? Math.PI : 0))
        .multiply(_t.makeTranslation(-pivot.x, 0, -pivot.z));
      matrices.push(m);
      inverses.push(m.clone().invert());
      flipped.push(flip);
      rotations.push(flip ? Math.PI : 0);
      centers.push(new THREE.Vector3(cx, 0, cz));
    }
  }

  const gridMinX = centers[0].x - pitchX / 2;
  const gridMinZ = centers[0].z - pitchZ / 2;

  const cellBounds = matrices.map((matrix) => tileBox.clone().applyMatrix4(matrix));
  const worldBounds = new THREE.Box3().makeEmpty();
  for (const box of cellBounds) worldBounds.union(box);

  /** Tile index containing an XZ position, or -1 when off the grid. */
  function indexAt(x, z) {
    if (placements) {
      let nearest = -1;
      let nearestDistance = Infinity;
      for (let tile = 0; tile < count; tile++) {
        const box = cellBounds[tile];
        if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z) return tile;
        const distance = centers[tile].distanceToSquared(new THREE.Vector3(x, 0, z));
        if (distance < nearestDistance) { nearest = tile; nearestDistance = distance; }
      }
      return nearestDistance < Math.max(pitchX, pitchZ) ** 2 ? nearest : -1;
    }
    const i = Math.floor((x - gridMinX) / pitchX);
    const j = Math.floor((z - gridMinZ) / pitchZ);
    if (i < 0 || i >= cols || j < 0 || j >= rows) return -1;
    return j * cols + i;
  }

  function localToWorld(t, v, out = new THREE.Vector3()) {
    return out.copy(v).applyMatrix4(matrices[t]);
  }

  /** Tile-local yaw -> world yaw. Forgetting this spawns you facing backwards. */
  function headingToWorld(t, heading) {
    return heading + rotations[t];
  }

  // Parametric distance at which the ray enters tile (i,j)'s XZ cell, 0 if the
  // origin is already inside, Infinity if it never enters. Used to visit
  // candidate tiles near-to-far so the first hit can cut the rest short.
  function slabEnter(origin, dir, i, j) {
    const minX = gridMinX + i * pitchX - overhang;
    const maxX = minX + pitchX + 2 * overhang;
    const minZ = gridMinZ + j * pitchZ - overhang;
    const maxZ = minZ + pitchZ + 2 * overhang;
    let tmin = 0;
    let tmax = Infinity;

    if (Math.abs(dir.x) < 1e-9) {
      if (origin.x < minX || origin.x > maxX) return Infinity;
    } else {
      let t1 = (minX - origin.x) / dir.x;
      let t2 = (maxX - origin.x) / dir.x;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
    }
    if (Math.abs(dir.z) < 1e-9) {
      if (origin.z < minZ || origin.z > maxZ) return Infinity;
    } else {
      let t1 = (minZ - origin.z) / dir.z;
      let t2 = (maxZ - origin.z) / dir.z;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
    }
    return tmin > tmax ? Infinity : tmin;
  }

  const _cand = new Int32Array(32);
  const _candT = new Float64Array(32);

  /**
   * Wrap a tile-local raycast into a world-space one.
   * @param {(ray: THREE.Ray, far: number) => ({point,distance,face}|null)} localRaycast
   */
  function makeRaycast(localRaycast) {
    return function raycast(origin, dir, far = 100) {
      if (placements) {
        let best = null;
        let bestDist = far;
        for (let tile = 0; tile < count; tile++) {
          const box = cellBounds[tile];
          const expanded = box.clone().expandByScalar(overhang);
          const worldRay = new THREE.Ray(origin, dir);
          if (!worldRay.intersectsBox(expanded)) continue;
          _lray.origin.copy(origin);
          _lray.direction.copy(dir);
          _lray.applyMatrix4(inverses[tile]);
          const hit = localRaycast(_lray, bestDist);
          if (!hit || hit.distance >= bestDist) continue;
          const normal = hit.face?.normal?.clone().transformDirection(matrices[tile]) || null;
          best = {
            distance: hit.distance,
            point: hit.point.applyMatrix4(matrices[tile]),
            face: normal ? { normal } : null,
          };
          bestDist = hit.distance;
        }
        return best;
      }
      const ex = origin.x + dir.x * far;
      const ez = origin.z + dir.z * far;
      let i0 = Math.floor((Math.min(origin.x, ex) - overhang - gridMinX) / pitchX);
      let i1 = Math.floor((Math.max(origin.x, ex) + overhang - gridMinX) / pitchX);
      let j0 = Math.floor((Math.min(origin.z, ez) - overhang - gridMinZ) / pitchZ);
      let j1 = Math.floor((Math.max(origin.z, ez) + overhang - gridMinZ) / pitchZ);
      if (i0 < 0) i0 = 0;
      if (j0 < 0) j0 = 0;
      if (i1 > cols - 1) i1 = cols - 1;
      if (j1 > rows - 1) j1 = rows - 1;
      if (i1 < i0 || j1 < j0) return null;

      let n = 0;
      for (let j = j0; j <= j1 && n < _cand.length; j++) {
        for (let i = i0; i <= i1 && n < _cand.length; i++) {
          const tEnter = slabEnter(origin, dir, i, j);
          if (tEnter === Infinity || tEnter > far) continue;
          _cand[n] = j * cols + i;
          _candT[n] = tEnter;
          n++;
        }
      }
      if (n === 0) return null;

      // Insertion sort, near to far. n is 1 in the overwhelming majority of
      // calls (suspension rays are 0.64 m, bumper rays 0.55 m) and never > 4.
      for (let a = 1; a < n; a++) {
        const ci = _cand[a];
        const ct = _candT[a];
        let b = a - 1;
        while (b >= 0 && _candT[b] > ct) { _cand[b + 1] = _cand[b]; _candT[b + 1] = _candT[b]; b--; }
        _cand[b + 1] = ci;
        _candT[b + 1] = ct;
      }

      let best = null;
      let bestDist = far;
      for (let a = 0; a < n; a++) {
        // Every remaining tile starts beyond the hit we already have.
        if (best && _candT[a] >= bestDist) break;

        const t = _cand[a];
        _lray.origin.copy(origin);
        _lray.direction.copy(dir);
        _lray.applyMatrix4(inverses[t]); // rigid: distances are preserved

        const hit = localRaycast(_lray, bestDist);
        if (!hit || hit.distance >= bestDist) continue;

        // Return an OWNED result. three-mesh-bvh's hit is freshly allocated,
        // but its face normal is in tile-local space and callers keep hold of
        // both fields, so build our own rather than mutate someone else's.
        const n0 = hit.face ? hit.face.normal : null;
        const s = flipped[t] ? -1 : 1;
        best = {
          distance: hit.distance,
          point: hit.point.applyMatrix4(matrices[t]),
          face: n0 ? { normal: new THREE.Vector3(s * n0.x, n0.y, s * n0.z) } : null,
        };
        bestDist = hit.distance;
      }
      return best;
    };
  }

  return {
    cols, rows, count, pitchX, pitchZ,
    matrices, inverses, flipped, rotations, centers, cellBounds, worldBounds,
    indexAt, localToWorld, headingToWorld, makeRaycast,
  };
}
