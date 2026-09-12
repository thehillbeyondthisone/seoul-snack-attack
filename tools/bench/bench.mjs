// Seoul Snack Attack — headless vehicle physics bench.
// Usage: npm run bench [-- --json]
//
// Turns "feel" into numbers. Targets are the GTA-IV-like envelope agreed in the
// physics plan; a metric outside its window is a FAIL, and the exit code is
// non-zero so this can gate a phase.
//
// This measures the CURRENT custom raycast vehicle. The backend is swapped
// later; the tests and targets do not change, which is the entire point of
// writing them first.
import * as THREE from 'three';
import { VehiclePhysics } from '../../src/vehicle/physics.js';
import * as W from './worlds.js';
import * as M from './metrics.js';

const FIXED = 1 / 120;
const G = 9.81;
const argv = process.argv.slice(2);
const asJson = argv.includes('--json');

// Rig measured from the shipped public/assets/vehicles/van.glb (see src/vehicle/van.js).
// Hardcoded here deliberately: the bench must not depend on a browser GLB load.
const VAN_RIG = {
  wheelRadius: 0.291,
  wheels: {
    fl: { localPos: new THREE.Vector3(-0.65, -0.58, 1.14), radius: 0.291 },
    fr: { localPos: new THREE.Vector3(0.64, -0.58, 1.17), radius: 0.291 },
    rl: { localPos: new THREE.Vector3(-0.65, -0.57, -1.24), radius: 0.291 },
    rr: { localPos: new THREE.Vector3(0.64, -0.57, -1.24), radius: 0.291 },
  },
};

const NEUTRAL = { throttle: 0, brake: 0, steer: 0, handbrake: false };

/** Resting ride height on flat ground — spawn here so tests don't start mid-fall. */
const REST_Y = 1.5;

function makeVehicle(world, { y = REST_Y, heading = 0 } = {}) {
  const p = new VehiclePhysics(world);
  p.attach(VAN_RIG);
  p.place(new THREE.Vector3(0, y, 0), heading);
  return p;
}

/**
 * Horizontal speed. phys.speedKmh (physics.js:132) is velocity.length(), which
 * counts vertical motion — a vehicle in free fall reads as "moving fast", which
 * silently corrupted every acceleration measurement here until it was caught.
 */
function hSpeedKmh(phys) {
  return Math.hypot(phys.velocity.x, phys.velocity.z) * 3.6;
}

/** Step until the body stops moving, then return it. */
function settle(phys, seconds = 4) {
  phys.controls = { ...NEUTRAL };
  for (let i = 0; i < seconds / FIXED; i++) phys.step(FIXED);
  return phys;
}

/**
 * Run a scripted manoeuvre.
 * @param control (t, phys) => controls
 * @param sample  (t, phys) => any   recorded each step
 */
function run(phys, seconds, control, sample) {
  const steps = Math.round(seconds / FIXED);
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = i * FIXED;
    phys.controls = { ...NEUTRAL, ...control(t, phys) };
    phys.step(FIXED);
    if (sample) out.push(sample(t, phys));
  }
  return out;
}

/** Drive from rest to a target speed, returning elapsed seconds (or null). */
function timeToSpeed(phys, targetKmh, limit = 40) {
  let t = 0;
  while (t < limit) {
    phys.controls = { ...NEUTRAL, throttle: 1 };
    phys.step(FIXED);
    t += FIXED;
    if (hSpeedKmh(phys) >= targetKmh) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
const tests = {};

tests.staticSag = () => {
  const phys = settle(makeVehicle(W.flatPlane()), 6);
  const rayLen = phys.params.suspensionRest + phys.params.suspensionTravel;
  const mean = phys.wheels.reduce((s, w) => s + w.compression, 0) / phys.wheels.length;
  return { value: mean * rayLen, unit: 'm' };
};

tests.rideFrequencyHz = () => {
  const phys = settle(makeVehicle(W.flatPlane()), 6);
  const restY = phys.position.y;
  phys.place(new THREE.Vector3(0, restY + 0.25, 0), 0);
  const ys = run(phys, 4, () => NEUTRAL, (t, p) => p.position.y);
  const pk = M.peaks(ys);
  if (pk.length < 2) return { value: null, unit: 'Hz', note: 'no oscillation' };
  const period = (pk[1].index - pk[0].index) * FIXED;
  return { value: 1 / period, unit: 'Hz' };
};

tests.rideDampingZeta = () => {
  const phys = settle(makeVehicle(W.flatPlane()), 6);
  const restY = phys.position.y;
  phys.place(new THREE.Vector3(0, restY + 0.25, 0), 0);
  const ys = run(phys, 4, () => NEUTRAL, (t, p) => p.position.y);
  const settled = M.steadyState(ys, 120);
  const pk = M.peaks(ys).map((p) => ({ ...p, amp: p.value - settled })).filter((p) => p.amp > 1e-3);
  if (pk.length < 2) return { value: null, unit: '', note: 'overdamped / no peaks' };
  return { value: M.dampingRatio(pk[0].amp, pk[1].amp), unit: '' };
};

tests.settleOvershoots = () => {
  const phys = settle(makeVehicle(W.flatPlane()), 6);
  const restY = phys.position.y;
  phys.place(new THREE.Vector3(0, restY + 0.25, 0), 0);
  const ys = run(phys, 4, () => NEUTRAL, (t, p) => p.position.y);
  const settled = M.steadyState(ys, 120);
  return { value: M.peaks(ys).filter((p) => p.value - settled > 0.005).length, unit: 'bounces' };
};

tests.accel0to60Kmh = () => {
  const phys = settle(makeVehicle(W.flatPlane()));
  return { value: timeToSpeed(phys, 60), unit: 's' };
};

tests.accel0to80Kmh = () => {
  const phys = settle(makeVehicle(W.flatPlane()));
  return { value: timeToSpeed(phys, 80), unit: 's' };
};

tests.braking80to0m = () => {
  const phys = settle(makeVehicle(W.flatPlane()));
  if (timeToSpeed(phys, 80) == null) return { value: null, unit: 'm', note: 'never hit 80' };
  const start = phys.position.clone();
  let t = 0;
  while (hSpeedKmh(phys) > 1 && t < 20) {
    phys.controls = { ...NEUTRAL, brake: 1 };
    phys.step(FIXED);
    t += FIXED;
  }
  return { value: Math.hypot(phys.position.x - start.x, phys.position.z - start.z), unit: 'm' };
};

tests.brakeDiveDeg = () => {
  const phys = settle(makeVehicle(W.flatPlane()));
  if (timeToSpeed(phys, 80) == null) return { value: null, unit: 'deg' };
  const pitches = run(phys, 1.5, () => ({ brake: 1 }), (t, p) => M.attitude(p.quaternion).pitchDeg);
  // Dive is nose-down = most negative pitch.
  return { value: -Math.min(...pitches), unit: 'deg' };
};

/** Past this the van is on its side, not cornering. */
const FLIP_DEG = 45;

/** Largest n-sample moving average — the sustained (not instantaneous) value. */
function maxMovingAvg(arr, n) {
  if (arr.length < n) return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += arr[i];
  let best = sum / n;
  for (let i = n; i < arr.length; i++) {
    sum += arr[i] - arr[i - n];
    best = Math.max(best, sum / n);
  }
  return best;
}

/**
 * Sweep steer to find the cornering ceiling.
 *
 * Samples stop at rollover: the current van TIPS OVER at ~0.6 g and comes to
 * rest at ~56 deg of roll. Averaging through that would report a meaninglessly
 * low grip figure, so measure sustained lateral g strictly before the flip and
 * report the flip itself as its own (failing) metric.
 */
function skidpadSweep(wet = 0) {
  const best = { latG: 0, rollPerG: null, flipped: false, flipLatG: null, steer: null };
  for (const steer of [0.15, 0.25, 0.35, 0.5, 0.7, 1.0]) {
    const phys = settle(makeVehicle(W.flatPlane()));
    phys.wetness = wet;
    if (timeToSpeed(phys, 45) == null) continue;

    const latGs = [];
    const rolls = [];
    let flipLatG = null;
    for (let i = 0; i < 6 / FIXED; i++) {
      phys.controls = { ...NEUTRAL, throttle: 0.45, steer };
      phys.step(FIXED);
      const att = M.attitude(phys.quaternion);
      const v = Math.hypot(phys.velocity.x, phys.velocity.z);
      const latG = Math.abs(v * M.yawRate(phys.angularVelocity)) / G;
      if (Math.abs(att.rollDeg) > FLIP_DEG) { flipLatG = latG; break; }
      latGs.push(latG);
      rolls.push(Math.abs(att.rollDeg));
    }
    if (flipLatG != null) {
      best.flipped = true;
      if (best.flipLatG == null || flipLatG < best.flipLatG) best.flipLatG = flipLatG;
    }
    const sustained = maxMovingAvg(latGs, 60); // 0.5 s
    if (sustained > best.latG) {
      best.latG = sustained;
      best.steer = steer;
      const peakRoll = maxMovingAvg(rolls, 60);
      best.rollPerG = sustained > 0.05 ? peakRoll / sustained : null;
    }
  }
  return best;
}

const skidDry = skidpadSweep(0);
const skidWet = skidpadSweep(1);

tests.skidpadLatG = () => ({ value: skidDry.latG, unit: 'g' });
tests.skidpadLatGWet = () => ({ value: skidWet.latG, unit: 'g' });
tests.rollPerG = () => ({ value: skidDry.rollPerG, unit: 'deg/g' });

/** 1 = the van tipped onto its side during a normal corner. It must not. */
tests.cornerRollover = () => ({
  value: skidDry.flipped ? 1 : 0,
  unit: skidDry.flipped ? `flips at ${skidDry.flipLatG.toFixed(2)}g` : 'stays upright',
});

/** Yaw-rate response to a step input, sampled only while the van is upright. */
function stepSteerYaw() {
  const phys = settle(makeVehicle(W.flatPlane()));
  if (timeToSpeed(phys, 72) == null) return { yaw: [], flipped: false }; // ~20 m/s
  const yaw = [];
  for (let i = 0; i < 3 / FIXED; i++) {
    phys.controls = { ...NEUTRAL, throttle: 0.3, steer: 0.35 };
    phys.step(FIXED);
    if (Math.abs(M.attitude(phys.quaternion).rollDeg) > FLIP_DEG) return { yaw, flipped: true };
    yaw.push(Math.abs(M.yawRate(phys.angularVelocity)));
  }
  return { yaw, flipped: false };
}

const stepSteer = stepSteerYaw();

tests.stepSteerT63 = () => {
  if (stepSteer.flipped) return { value: null, unit: 's', note: 'rolled over mid-manoeuvre' };
  return { value: M.t63(stepSteer.yaw, FIXED), unit: 's' };
};

tests.yawOvershoot = () => {
  if (stepSteer.flipped) return { value: null, unit: 'x', note: 'rolled over mid-manoeuvre' };
  return { value: M.overshoot(stepSteer.yaw), unit: 'x' };
};

/**
 * Power oversteer: steady chassis slip under power minus the same corner
 * coasting. Positive = the rear steps out when you apply throttle.
 */
tests.powerOversteerDeg = () => {
  const measure = (throttle) => {
    const phys = settle(makeVehicle(W.flatPlane()));
    timeToSpeed(phys, 45);
    const s = run(phys, 5, () => ({ throttle, steer: 0.5 }),
      (t, p) => M.chassisSlipDeg(p.quaternion, p.velocity));
    return M.steadyState(s, 180);
  };
  return { value: Math.abs(measure(1)) - Math.abs(measure(0)), unit: 'deg' };
};

tests.obliqueWallSpin = () => {
  const phys = makeVehicle(W.wall({ atX: 40 }));
  settle(phys, 3);
  const heading = Math.PI / 6; // 30 deg incidence to the wall plane
  phys.place(new THREE.Vector3(25, phys.position.y, 0), heading);
  const speed = 8;
  phys.velocity.set(Math.sin(heading) * speed, 0, Math.cos(heading) * speed);
  let peak = 0;
  run(phys, 4, () => NEUTRAL, (t, p) => {
    peak = Math.max(peak, Math.abs(M.yawRate(p.angularVelocity)));
  });
  return { value: peak, unit: 'rad/s' };
};

tests.wallSpeedRetention = () => {
  const phys = makeVehicle(W.wall({ atX: 40 }));
  settle(phys, 3);
  const heading = Math.PI / 6;
  phys.place(new THREE.Vector3(25, phys.position.y, 0), heading);
  const speed = 8;
  phys.velocity.set(Math.sin(heading) * speed, 0, Math.cos(heading) * speed);
  run(phys, 3, () => NEUTRAL);
  return { value: Math.hypot(phys.velocity.x, phys.velocity.z) / speed, unit: 'x' };
};

// ---------------------------------------------------------------------------
// Robustness (run against the real baked city)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function soak(city, seconds = 60) {
  const phys = makeVehicle(city);
  const c = city.bounds.getCenter(new THREE.Vector3());
  phys.place(new THREE.Vector3(c.x, city.bounds.max.y + 1, c.z), 0);
  const rng = mulberry32(20260812);
  let bad = null;
  let steer = 0;
  for (let i = 0; i < seconds / FIXED; i++) {
    if (i % 40 === 0) steer = rng() * 2 - 1;
    phys.controls = { throttle: rng() < 0.7 ? 1 : 0, brake: rng() < 0.1 ? 1 : 0, steer, handbrake: rng() < 0.05 };
    phys.step(FIXED);
    const v = phys.velocity, w = phys.angularVelocity, pos = phys.position;
    if (![pos.x, pos.y, pos.z, v.x, v.y, v.z, w.x, w.y, w.z].every(Number.isFinite)) { bad = `NaN at step ${i}`; break; }
    if (v.length() > 200) { bad = `|v|=${v.length().toFixed(0)} at step ${i}`; break; }
    if (w.length() > 50) { bad = `|w|=${w.length().toFixed(0)} at step ${i}`; break; }
  }
  return { bad, phys };
}

// ---------------------------------------------------------------------------
// Targets — the GTA-IV-like envelope. null = report only, no gate.
//
// The performance windows below were re-cut for the delivery-pace tune (see
// DEFAULT_PARAMS in src/vehicle/physics.js). The old envelope was a simulation
// envelope: 90 km/h, 0-60 in 4.0 s, 27 m to stop from 80, 0.83 g of grip. It
// made a delivery run a sequence of overshoots, because you could not carry
// speed to a junction you had no way to scrub speed at. The ride, yaw and
// crash windows are untouched — this pass did not go near them, and the ones
// failing today were failing before it.
// ---------------------------------------------------------------------------
const TARGETS = {
  staticSag: [0.15, 0.23],
  rideFrequencyHz: [1.05, 1.35],
  rideDampingZeta: [0.25, 0.32],
  settleOvershoots: [2, 4],
  accel0to60Kmh: [2.2, 3.4],
  accel0to80Kmh: [3.3, 5.2],
  // Arcade braking, and deliberately so: the limit belongs to the tires (the
  // friction ellipse, which still trades stopping against steering) rather
  // than to a constant that ran out before the front axle did.
  braking80to0m: [16, 24],
  brakeDiveDeg: [2.5, 3.5],
  skidpadLatG: [1.00, 1.20],
  skidpadLatGWet: [0.78, 0.95],
  // Flatter than the old 9-11 window: the anti-roll bars came up with the grip
  // so the extra cornering load does not arrive as lean.
  rollPerG: [5.0, 8.0],
  cornerRollover: [0, 0],
  stepSteerT63: [0.22, 0.32],
  yawOvershoot: [1.15, 1.35],
  powerOversteerDeg: [4, 40],
  obliqueWallSpin: [0.8, 2.0],
  wallSpeedRetention: [0.55, 0.75],
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const results = [];
for (const [name, fn] of Object.entries(tests)) {
  let r;
  try {
    r = fn();
  } catch (e) {
    r = { value: null, unit: '', note: `ERROR ${e.message}` };
  }
  const target = TARGETS[name] ?? null;
  const v = r.value;
  const pass = target == null ? null
    : (typeof v === 'number' && isFinite(v) && v >= target[0] && v <= target[1]);
  results.push({ name, ...r, target, pass });
}

const city = await W.bakedCity();
const t0 = process.hrtime.bigint();
const { bad } = soak(city, 60);
const soakMs = Number(process.hrtime.bigint() - t0) / 1e6;
results.push({ name: 'soak60s', value: bad ? 0 : 1, unit: bad ? bad : 'ok', target: [1, 1], pass: !bad });
// 0.12 ms/step: at 8 substeps per 60fps frame that is ~1 ms of a 16.6 ms budget.
// Measured around 0.06-0.09 depending on machine load, so a tighter gate flaps.
results.push({
  name: 'perfMsPerStep', value: soakMs / (60 / FIXED), unit: 'ms',
  target: [0, 0.12], pass: soakMs / (60 / FIXED) <= 0.12,
});

const a = soak(city, 5).phys, b = soak(city, 5).phys;
const deterministic = a.position.distanceTo(b.position) === 0 && a.velocity.distanceTo(b.velocity) === 0;
results.push({ name: 'determinism', value: deterministic ? 1 : 0, unit: '', target: [1, 1], pass: deterministic });

if (asJson) {
  console.log(JSON.stringify({ generated: new Date().toISOString(), backend: 'custom', results }, null, 2));
} else {
  const fmt = (v) => (v == null ? '—' : typeof v === 'number' ? (Math.abs(v) < 100 ? v.toFixed(3) : v.toFixed(1)) : String(v));
  const pad = (s, n) => String(s).padEnd(n);
  const padS = (s, n) => String(s).padStart(n);
  console.log(`\n  Seoul Snack Attack — physics bench   backend: custom   city: ${city.triangleCount.toLocaleString()} tris\n`);
  console.log(`  ${pad('metric', 22)}${padS('value', 10)}  ${pad('unit', 8)}${pad('target', 16)}result`);
  console.log(`  ${'-'.repeat(72)}`);
  for (const r of results) {
    const tgt = r.target ? `${r.target[0]} … ${r.target[1]}` : '';
    const mark = r.pass == null ? '' : r.pass ? 'PASS' : 'FAIL';
    console.log(`  ${pad(r.name, 22)}${padS(fmt(r.value), 10)}  ${pad(r.unit, 8)}${pad(tgt, 16)}${mark}${r.note ? '  ' + r.note : ''}`);
  }
  const gated = results.filter((r) => r.pass != null);
  const passed = gated.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${gated.length} within target\n`);
}

process.exitCode = results.some((r) => r.pass === false) ? 1 : 0;
