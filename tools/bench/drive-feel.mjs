// Seoul Snack Attack — "is it fun to drive?" bench.
//
// bench.mjs measures ride quality and the crash envelope against a physics
// target list. This measures the three things a player actually complains
// about — it won't go, it won't stop, it won't turn — for EVERY vehicle in the
// roster, so a handling pass can be argued from numbers instead of vibes.
//
// Usage: npm run drive-feel
import fs from 'node:fs';
import * as THREE from 'three';
import { VehiclePhysics, DEFAULT_PARAMS } from '../../src/vehicle/physics.js';
import { VEHICLE_IDS, getVehicle } from '../../src/game/data/vehicles.js';
import * as W from './worlds.js';
import * as M from './metrics.js';

const FIXED = 1 / 120;
const ROOT = new URL('../../', import.meta.url);
const NEUTRAL = { throttle: 0, brake: 0, steer: 0, handbrake: false };

// The van is still on the legacy runtime rig, so it has no sidecar to read;
// these are the hubs measured from the shipped GLB (same table as bench.mjs).
const VAN_RIG = {
  wheelRadius: 0.291,
  wheels: {
    fl: { localPos: new THREE.Vector3(-0.65, -0.58, 1.14), radius: 0.291 },
    fr: { localPos: new THREE.Vector3(0.64, -0.58, 1.17), radius: 0.291 },
    rl: { localPos: new THREE.Vector3(-0.65, -0.57, -1.24), radius: 0.291 },
    rr: { localPos: new THREE.Vector3(0.64, -0.57, -1.24), radius: 0.291 },
  },
};

function sidecarRig(id) {
  const s = JSON.parse(fs.readFileSync(new URL(`public/assets/vehicles/${id}.json`, ROOT), 'utf8'));
  return {
    wheelRadius: s.wheelRadius,
    wheels: Object.fromEntries(Object.entries(s.wheels).map(([key, wheel]) => [key, {
      localPos: new THREE.Vector3(...wheel.hub), radius: wheel.radius,
    }])),
  };
}

function make(id) {
  const def = getVehicle(id);
  const phys = new VehiclePhysics(W.flatPlane());
  // Same order main.js uses when it swaps rigs: defaults first, then overrides.
  Object.assign(phys.params, DEFAULT_PARAMS);
  Object.assign(phys.params, def.params, { collisionHalf: def.collisionHalf, bumperY: def.bumperY });
  phys.attach(def.loader === 'canonical' ? sidecarRig(id) : VAN_RIG);
  // Spawn clear of the ground and let the suspension settle before measuring.
  phys.place(new THREE.Vector3(0, (def.rig?.groundY ? -def.rig.groundY : 1.2) + 0.9, 0), 0);
  for (let i = 0; i < 4 / FIXED; i++) { phys.controls = { ...NEUTRAL }; phys.step(FIXED); }
  return phys;
}

/** Horizontal speed: phys.speedKmh counts vertical motion (see bench.mjs). */
const hKmh = (p) => Math.hypot(p.velocity.x, p.velocity.z) * 3.6;

function runUpTo(phys, kmh, limit = 60) {
  for (let i = 0; i < limit / FIXED && hKmh(phys) < kmh; i++) {
    phys.controls = { ...NEUTRAL, throttle: 1 };
    phys.step(FIXED);
  }
  return hKmh(phys);
}

function accel(id) {
  const phys = make(id);
  const marks = {};
  let t = 0;
  for (let i = 0; i < 45 / FIXED; i++) {
    phys.controls = { ...NEUTRAL, throttle: 1 };
    phys.step(FIXED);
    t += FIXED;
    for (const mark of [50, 60, 80, 100]) if (marks[mark] === undefined && hKmh(phys) >= mark) marks[mark] = t;
  }
  return { marks, topKmh: hKmh(phys) };
}

/** Full-brake stop from `fromKmh`. This is the "did I overshoot the shop" number. */
function braking(id, fromKmh) {
  const phys = make(id);
  const entry = runUpTo(phys, fromKmh);
  if (entry < fromKmh - 2) return { entry, metres: null, seconds: null };
  const start = phys.position.clone();
  let t = 0;
  for (let i = 0; i < 20 / FIXED && hKmh(phys) > 1; i++) {
    phys.controls = { ...NEUTRAL, brake: 1 };
    phys.step(FIXED);
    t += FIXED;
  }
  return { entry, metres: Math.hypot(phys.position.x - start.x, phys.position.z - start.z), seconds: t };
}

/** Steady full-lock circle: turning radius, lateral g, and peak body roll. */
function corner(id, holdKmh, steer = 1) {
  const phys = make(id);
  runUpTo(phys, holdKmh);
  let peakRoll = 0;
  let flipped = false;
  let yawSum = 0;
  let speedSum = 0;
  let samples = 0;
  for (let i = 0; i < 6 / FIXED; i++) {
    phys.controls = { ...NEUTRAL, throttle: 0.45, steer };
    phys.step(FIXED);
    peakRoll = Math.max(peakRoll, Math.abs(M.attitude(phys.quaternion).rollDeg));
    if (peakRoll > 45) { flipped = true; break; }
    // Skip the first two seconds: that is the transient, not the circle.
    if (i > 2 / FIXED) { yawSum += Math.abs(phys.angularVelocity.y); speedSum += hKmh(phys) / 3.6; samples++; }
  }
  const yaw = samples ? yawSum / samples : 0;
  const v = samples ? speedSum / samples : 0;
  return {
    peakRoll, flipped, holdKmh: v * 3.6,
    radius: yaw > 1e-3 ? v / yaw : Infinity,
    latG: yaw * v / 9.81,
  };
}

/** Time for full lock to reach 63% of its steady yaw rate — turn-in bite. */
function turnIn(id, atKmh) {
  const phys = make(id);
  runUpTo(phys, atKmh);
  const series = [];
  for (let i = 0; i < 3 / FIXED; i++) {
    phys.controls = { ...NEUTRAL, throttle: 0.4, steer: 1 };
    phys.step(FIXED);
    series.push(Math.abs(phys.angularVelocity.y));
  }
  return M.t63(series, FIXED);
}

const rows = [];
for (const id of VEHICLE_IDS) {
  const def = getVehicle(id);
  const topParam = (def.params.maxSpeed ?? DEFAULT_PARAMS.maxSpeed) * 3.6;
  const a = accel(id);
  const at = (mark) => (a.marks[mark] ? `${a.marks[mark].toFixed(2)} s` : '—');
  console.log(`\n  ${def.nameEn} (${id})`);
  console.log(`  ${'-'.repeat(58)}`);
  console.log(`  top speed        ${a.topKmh.toFixed(1)} km/h   (maxSpeed ${topParam.toFixed(0)} km/h)`);
  console.log(`  0-50 ${at(50)}   0-60 ${at(60)}   0-80 ${at(80)}   0-100 ${at(100)}`);
  for (const from of [50, 80]) {
    const b = braking(id, from);
    console.log(`  brake ${from}-0        ${b.metres == null ? 'n/a — cannot reach' : `${b.metres.toFixed(1)} m in ${b.seconds.toFixed(2)} s`}`);
  }
  for (const speed of [30, 45, 60]) {
    const c = corner(id, speed);
    const radius = Number.isFinite(c.radius) ? `${c.radius.toFixed(1)} m` : '—';
    console.log(`  corner @ ${String(speed).padStart(3)} km/h  radius ${radius.padStart(7)}   ${c.latG.toFixed(2)} g   roll ${c.peakRoll.toFixed(1)} deg${c.flipped ? '   FLIPPED' : ''}`);
  }
  const t63 = turnIn(id, 45);
  console.log(`  turn-in t63      ${t63 == null ? '—' : `${t63.toFixed(3)} s`} @ 45 km/h`);
  rows.push({ id, top: a.topKmh });
}
console.log('');
