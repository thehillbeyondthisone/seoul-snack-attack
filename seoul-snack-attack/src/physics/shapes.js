// Convex shape math for prop bodies: inertia tensors, OBB/OBB separation, and
// OBB/cylinder separation. Pure functions on three.js types, no state.
import * as THREE from 'three';

/** Diagonal inertia of a solid box about its centre. `half` = half-extents. */
export function boxInertia(mass, half, out = new THREE.Vector3()) {
  const x = half.x * 2, y = half.y * 2, z = half.z * 2;
  return out.set(
    (mass / 12) * (y * y + z * z),
    (mass / 12) * (x * x + z * z),
    (mass / 12) * (x * x + y * y)
  );
}

/** Diagonal inertia of a solid cylinder, axis along local +Y. */
export function cylinderInertia(mass, radius, height, out = new THREE.Vector3()) {
  const side = (mass / 12) * (3 * radius * radius + height * height);
  return out.set(side, 0.5 * mass * radius * radius, side);
}

const _axes = [];
for (let i = 0; i < 15; i++) _axes.push(new THREE.Vector3());
const _aAx = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _bAx = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _d = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function fillAxes(q, out) {
  out[0].set(1, 0, 0).applyQuaternion(q);
  out[1].set(0, 1, 0).applyQuaternion(q);
  out[2].set(0, 0, 1).applyQuaternion(q);
}

function projectRadius(half, axes, n) {
  return Math.abs(axes[0].dot(n)) * half.x
    + Math.abs(axes[1].dot(n)) * half.y
    + Math.abs(axes[2].dot(n)) * half.z;
}

/**
 * Separating-axis test between two oriented boxes.
 * Returns `{ normal, depth }` with `normal` pointing from A toward B, or null
 * when disjoint. One contact normal is all we need — and it is exactly why
 * clipping a bollard off-centre spins it, which is the feel we want.
 */
export function obbOverlap(posA, quatA, halfA, posB, quatB, halfB, horizontalOnly = false) {
  fillAxes(quatA, _aAx);
  fillAxes(quatB, _bAx);
  _d.copy(posB).sub(posA);

  let n = 0;
  for (let i = 0; i < 3; i++) _axes[n++].copy(_aAx[i]);
  for (let i = 0; i < 3; i++) _axes[n++].copy(_bAx[i]);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      _tmp.crossVectors(_aAx[i], _bAx[j]);
      // Near-parallel edge pairs give a degenerate axis; the face axes already
      // cover those cases, so skipping is safe (and avoids a divide by ~0).
      if (_tmp.lengthSq() < 1e-8) continue;
      _axes[n++].copy(_tmp).normalize();
    }
  }

  let bestDepth = Infinity;
  let bestAxis = null;
  for (let i = 0; i < n; i++) {
    const ax = _axes[i];
    const dist = Math.abs(_d.dot(ax));
    const overlap = projectRadius(halfA, _aAx, ax) + projectRadius(halfB, _bAx, ax) - dist;
    if (overlap <= 0) return null; // found a separating axis
    // `horizontalOnly` skips near-vertical axes when choosing the resolution
    // direction. A van's 1.8 m tall box completely swallows a 0.66 m cone, so
    // the true minimum-penetration axis becomes vertical the moment the boxes
    // properly overlap — resolving on it would shove the cone into the road and
    // bulldoze it along instead of knocking it aside. Separation is still
    // decided by ALL axes; only the choice of contact normal is constrained.
    if (horizontalOnly && Math.abs(ax.y) > 0.7) continue;
    if (overlap < bestDepth) {
      bestDepth = overlap;
      bestAxis = ax;
    }
  }
  if (!bestAxis) return null;

  const normal = bestAxis.clone();
  if (normal.dot(_d) < 0) normal.negate(); // point A -> B
  return { normal, depth: bestDepth };
}

/**
 * Deepest point of box B along -normal, i.e. the contact point to apply the
 * impulse at. Approximated by the support vertex, which is exact for the
 * vertex-face case and close enough for edge contacts at this scale.
 */
export function supportPoint(pos, quat, half, dir, out = new THREE.Vector3()) {
  fillAxes(quat, _bAx);
  out.copy(pos);
  for (let i = 0; i < 3; i++) {
    const h = i === 0 ? half.x : i === 1 ? half.y : half.z;
    out.addScaledVector(_bAx[i], _bAx[i].dot(dir) >= 0 ? h : -h);
  }
  return out;
}

/** Closest point to `p` on an OBB, in world space. */
export function closestPointOnOBB(p, pos, quat, half, out = new THREE.Vector3()) {
  fillAxes(quat, _aAx);
  _d.copy(p).sub(pos);
  out.copy(pos);
  for (let i = 0; i < 3; i++) {
    const h = i === 0 ? half.x : i === 1 ? half.y : half.z;
    out.addScaledVector(_aAx[i], THREE.MathUtils.clamp(_d.dot(_aAx[i]), -h, h));
  }
  return out;
}
