// Signal analysis for the physics bench. Pure functions over recorded series.
import * as THREE from 'three';

const RAD2DEG = 180 / Math.PI;
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();

/**
 * Signed body attitude, in degrees.
 * pitch > 0 = nose up (so brake dive is negative).
 * roll  > 0 = right side down (so a left turn leans positive).
 *
 * NOTE: physics.js's own `rollAngle` (physics.js:291) is |bodyUp x worldUp|,
 * which is TOTAL TILT — it conflates pitch and roll. orders.js:208 consumes it
 * as roll for the pizza "keep level" rule, so a hard brake currently reads as
 * tipping the pizza. Measure it properly here.
 */
export function attitude(quaternion) {
  _f.set(0, 0, 1).applyQuaternion(quaternion);
  _r.set(1, 0, 0).applyQuaternion(quaternion);
  _u.set(0, 1, 0).applyQuaternion(quaternion);
  return {
    pitchDeg: Math.asin(THREE.MathUtils.clamp(_f.y, -1, 1)) * RAD2DEG,
    rollDeg: Math.atan2(-_r.y, _u.y) * RAD2DEG,
  };
}

/** Local maxima of a series, as {index, value}. */
export function peaks(series, minProminence = 1e-4) {
  const out = [];
  for (let i = 1; i < series.length - 1; i++) {
    if (series[i] > series[i - 1] && series[i] >= series[i + 1]) {
      out.push({ index: i, value: series[i] });
    }
  }
  return out.filter((p) => Math.abs(p.value) > minProminence);
}

/**
 * Damping ratio from the log decrement of two successive peak amplitudes
 * measured about the settled value: zeta = d / sqrt(4*pi^2 + d^2).
 */
export function dampingRatio(a1, a2) {
  if (!(a1 > 0) || !(a2 > 0) || a2 >= a1) return null;
  const d = Math.log(a1 / a2);
  return d / Math.sqrt(4 * Math.PI * Math.PI + d * d);
}

/** Mean of the final `n` samples — the steady-state value. */
export function steadyState(series, n = 120) {
  const tail = series.slice(-Math.min(n, series.length));
  return tail.reduce((s, v) => s + v, 0) / tail.length;
}

/** Time (s) for a series to first reach 63.2% of its steady-state value. */
export function t63(series, dt, steady = steadyState(series)) {
  if (!isFinite(steady) || Math.abs(steady) < 1e-6) return null;
  const target = steady * 0.632;
  for (let i = 0; i < series.length; i++) {
    if (Math.abs(series[i]) >= Math.abs(target)) return i * dt;
  }
  return null;
}

/** Peak / steady ratio — transient overshoot. */
export function overshoot(series, steady = steadyState(series)) {
  if (!isFinite(steady) || Math.abs(steady) < 1e-9) return null;
  const peak = series.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
  return Math.abs(peak / steady);
}

/** Slip angle (deg) of the chassis: angle between heading and velocity. */
export function chassisSlipDeg(quaternion, velocity) {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < 0.5) return 0;
  _f.set(0, 0, 1).applyQuaternion(quaternion);
  const heading = Math.atan2(_f.x, _f.z);
  const course = Math.atan2(velocity.x, velocity.z);
  let d = course - heading;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d * RAD2DEG;
}

/** Yaw rate (rad/s) about world up. */
export function yawRate(angularVelocity) {
  return angularVelocity.y;
}
