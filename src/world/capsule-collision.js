// Upright character capsule against the city's existing three-mesh-bvh.
// The authored world stores one local BVH and places it through tile matrices;
// the procedural world is the same contract with one identity tile.
import * as THREE from 'three';

const _localSegment = new THREE.Line3();
const _originalStart = new THREE.Vector3();
const _triPoint = new THREE.Vector3();
const _capsulePoint = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _worldResolved = new THREE.Vector3();
const _worldOriginal = new THREE.Vector3();
const _correction = new THREE.Vector3();
const _segmentBox = new THREE.Box3();
const _worldBox = new THREE.Box3();
const _cellBox = new THREE.Box3();
const _startPosition = new THREE.Vector3();
const _horizontalCorrection = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _axisLocal = new THREE.Vector3();

function capsuleWorldBox(position, height, radius, target, axis = null) {
  const start = new THREE.Vector3(position.x, position.y + radius, position.z);
  const end = axis ? start.clone().addScaledVector(axis, height - radius * 2)
    : new THREE.Vector3(position.x, position.y + height - radius, position.z);
  target.setFromPoints([start, end]).expandByScalar(radius);
  target.min.y -= 0.05;
  return target;
}

/**
 * Resolve an upright capsule whose position is its feet/ground point.
 * Mutates position and velocity; returns ground/contact information.
 */
export function resolveCapsule(city, position, velocity, {
  height = 1.72,
  radius = 0.32,
  passes = 3,
  axis = null,
} = {}) {
  const grid = city.grid;
  const bvh = city.bvh;
  let grounded = false;
  let contacts = 0;
  let largestCorrection = 0;
  _startPosition.copy(position);

  if (!grid || !bvh) return { grounded, contacts, correction: 0 };

  for (let pass = 0; pass < passes; pass++) {
    let movedThisPass = false;
    capsuleWorldBox(position, height, radius, _worldBox, axis);

    for (let tile = 0; tile < grid.count; tile++) {
      if (!_cellBox.copy(grid.cellBounds[tile]).expandByScalar(radius).intersectsBox(_worldBox)) continue;

      const inverse = grid.inverses[tile];
      const matrix = grid.matrices[tile];
      _localSegment.start.set(position.x, position.y + radius, position.z).applyMatrix4(inverse);
      _localSegment.end.copy(_localSegment.start);
      if (axis) _localSegment.end.addScaledVector(_axisLocal.copy(axis).transformDirection(inverse), height - radius * 2);
      else _localSegment.end.set(position.x, position.y + height - radius, position.z).applyMatrix4(inverse);
      _originalStart.copy(_localSegment.start);
      _segmentBox.setFromPoints([_localSegment.start, _localSegment.end]).expandByScalar(radius);

      bvh.shapecast({
        intersectsBounds: (box) => box.intersectsBox(_segmentBox),
        intersectsTriangle: (triangle) => {
          const distance = triangle.closestPointToSegment(
            _localSegment, _triPoint, _capsulePoint,
          );
          if (distance >= radius) return false;
          const depth = radius - distance;
          _direction.subVectors(_capsulePoint, _triPoint);
          if (_direction.lengthSq() < 1e-12) {
            triangle.getNormal(_direction);
            const midpoint = _localSegment.getCenter(_capsulePoint);
            if (_direction.dot(midpoint.sub(_triPoint)) < 0) _direction.negate();
          } else {
            _direction.normalize();
          }
          _localSegment.start.addScaledVector(_direction, depth);
          _localSegment.end.addScaledVector(_direction, depth);
          contacts++;
          return false;
        },
      });

      _worldResolved.copy(_localSegment.start).applyMatrix4(matrix);
      _worldOriginal.copy(_originalStart).applyMatrix4(matrix);
      _correction.subVectors(_worldResolved, _worldOriginal);
      const amount = _correction.length();
      if (amount < 1e-6) continue;
      largestCorrection = Math.max(largestCorrection, amount);
      if (_correction.y > 0.001 && velocity.y <= 0) grounded = true;
      position.add(_correction);
      const normal = _correction.normalize();
      const into = velocity.dot(normal);
      if (into < 0) velocity.addScaledVector(normal, -into);
      movedThisPass = true;
      capsuleWorldBox(position, height, radius, _worldBox, axis);
    }
    if (!movedThisPass) break;
  }

  // Exact ground contact produces no penetration correction. A short ray keeps
  // the controller grounded on flat asphalt, kerbs and shallow ramps.
  const ground = city.raycast(
    new THREE.Vector3(position.x, position.y + 0.18, position.z), _down, 0.34,
  );
  if (ground?.point && Math.abs(ground.face?.normal?.y || 0) > 0.45) {
    const gap = position.y - ground.point.y;
    if (gap >= -0.03 && gap <= 0.16 && velocity.y <= 0.5) {
      position.y = ground.point.y;
      if (velocity.y < 0) velocity.y = 0;
      grounded = true;
    }
  }

  // Several triangles can contribute small corrections with slightly different
  // normals. Remove the final aggregate inward component as well, otherwise a
  // capsule can retain a fraction of its wallward speed and buzz along seams.
  _horizontalCorrection.subVectors(position, _startPosition).setY(0);
  if (_horizontalCorrection.lengthSq() > 1e-8) {
    _horizontalCorrection.normalize();
    const into = velocity.dot(_horizontalCorrection);
    if (into < 0) velocity.addScaledVector(_horizontalCorrection, -into);
  }

  return { grounded, contacts, correction: largestCorrection, ground };
}

/** Integrate and resolve each short travel slice, so a fast dive cannot skip a thin wall. */
export function moveCapsuleSwept(city, position, velocity, dt, options = {}) {
  const radius = options.radius ?? 0.32;
  const slices = Math.min(16, Math.max(1, Math.ceil(velocity.length() * dt / (radius * 0.45))));
  let result = null;
  let contacts = 0;
  for (let i = 0; i < slices; i++) {
    position.addScaledVector(velocity, dt / slices);
    result = resolveCapsule(city, position, velocity, options);
    contacts += result.contacts;
  }
  return { ...result, contacts };
}

/** Check a candidate spawn without permanently moving the caller's vectors. */
export function capsuleSpawnIsClear(city, feet, options = {}) {
  const position = feet.clone();
  const velocity = new THREE.Vector3();
  const result = resolveCapsule(city, position, velocity, options);
  return position.distanceToSquared(feet) < 0.0004 && result.contacts < 8;
}
