// Focused handling regression for the tall pocha truck.
// It should survive abrupt full-lock turns throughout the useful speed range;
// collisions and kerbs may still topple it, but steering alone should not.
import fs from 'node:fs';
import * as THREE from 'three';
import { VehiclePhysics } from '../../src/vehicle/physics.js';
import { getVehicle } from '../../src/game/data/vehicles.js';
import * as W from './worlds.js';
import * as M from './metrics.js';

const FIXED = 1 / 120;
const FLIP_DEG = 45;
const def = getVehicle('pocha');
const sidecar = JSON.parse(fs.readFileSync(new URL('../../public/assets/vehicles/pocha.json', import.meta.url), 'utf8'));

const rig = {
  wheelRadius: sidecar.wheelRadius,
  wheels: Object.fromEntries(Object.entries(sidecar.wheels).map(([key, wheel]) => [key, {
    localPos: new THREE.Vector3(...wheel.hub),
    radius: wheel.radius,
  }])),
};

function makePocha() {
  const phys = new VehiclePhysics(W.flatPlane());
  Object.assign(phys.params, def.params, {
    collisionHalf: def.collisionHalf,
    bumperY: def.bumperY,
  });
  phys.attach(rig);
  phys.place(new THREE.Vector3(0, 3.2, 0), 0);
  for (let i = 0; i < 6 / FIXED; i++) phys.step(FIXED);
  return phys;
}

function accelerateTo(phys, targetKmh) {
  for (let i = 0; i < 40 / FIXED && phys.speedKmh < targetKmh; i++) {
    phys.controls = { throttle: 1, brake: 0, steer: 0, handbrake: false };
    phys.step(FIXED);
  }
}

function abruptTurnAt(targetKmh, steer) {
  const phys = makePocha();
  accelerateTo(phys, targetKmh);
  const entryKmh = phys.speedKmh;
  let peakRoll = 0;
  let flipped = false;
  for (let i = 0; i < 6 / FIXED; i++) {
    phys.controls = { throttle: 0.45, brake: 0, steer, handbrake: false };
    phys.step(FIXED);
    peakRoll = Math.max(peakRoll, Math.abs(M.attitude(phys.quaternion).rollDeg));
    if (peakRoll > FLIP_DEG) { flipped = true; break; }
  }
  return { entryKmh, peakRoll, flipped };
}

const normalRight = abruptTurnAt(45, 1);
const normalLeft = abruptTurnAt(45, -1);
const mediumRight = abruptTurnAt(60, 1);
const mediumLeft = abruptTurnAt(60, -1);
const maximumRight = abruptTurnAt(def.params.maxSpeed * 3.6 * 0.96, 1);
const maximumLeft = abruptTurnAt(def.params.maxSpeed * 3.6 * 0.96, -1);
let failed = false;

function check(label, condition, detail) {
  const status = condition ? 'PASS' : 'FAIL';
  console.log(`${status}  ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) failed = true;
}

check('pocha stays upright in full-lock 45 km/h turns', !normalRight.flipped && !normalLeft.flipped,
  `right=${normalRight.peakRoll.toFixed(1)} deg, left=${normalLeft.peakRoll.toFixed(1)} deg`);
check('pocha has symmetric delivery-speed rollover margins',
  Math.abs(normalRight.peakRoll - normalLeft.peakRoll) < 0.5,
  `right=${normalRight.peakRoll.toFixed(1)} deg, left=${normalLeft.peakRoll.toFixed(1)} deg`);
check('pocha stays upright in full-lock 60 km/h turns', !mediumRight.flipped && !mediumLeft.flipped,
  `right=${mediumRight.peakRoll.toFixed(1)} deg, left=${mediumLeft.peakRoll.toFixed(1)} deg`);
check('pocha remains controllable in abrupt near-maximum-speed turns',
  !maximumRight.flipped && !maximumLeft.flipped &&
    maximumRight.peakRoll < 30 && maximumLeft.peakRoll < 30,
  `right=${maximumRight.peakRoll.toFixed(1)} deg, left=${maximumLeft.peakRoll.toFixed(1)} deg`);

if (failed) process.exitCode = 1;
else console.log('\nall pocha handling checks passed');
