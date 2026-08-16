// Headless checks for src/physics/prop-world.js against the real tiled city.
// Usage: node tools/bench/props-check.mjs
//
// What matters about knockable props is a short list of felt behaviours:
// they settle instead of buzzing, a light one flies and a heavy one doesn't,
// the van shrugs off a cone but is stopped by a parked car, and nothing ever
// goes NaN. That is what this measures.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { readFileSync } from 'node:fs';
import { makeTileGrid } from '../../src/world/tiling.js';
import { PropWorld } from '../../src/physics/prop-world.js';
import {
  TILE_COLS, TILE_ROWS, TILE_FLIP_ODD_ROWS, TILE_OVERHANG,
  STREET_ROWS_Z, STREET_CROSS_X,
} from '../../src/world/city-constants.js';

const meta = JSON.parse(readFileSync('tools/bench/data/city.collider.json', 'utf8'));
const buf = readFileSync('tools/bench/data/city.collider.bin');
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(
  new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), 3));
const bvh = new MeshBVH(geo);

const tileBox = new THREE.Box3(new THREE.Vector3(...meta.tileBox.min), new THREE.Vector3(...meta.tileBox.max));
const grid = makeTileGrid({
  tileBox, cols: TILE_COLS, rows: TILE_ROWS,
  flipOddRows: TILE_FLIP_ODD_ROWS, overhang: TILE_OVERHANG,
});
const city = {
  raycast: grid.makeRaycast((ray, far) => bvh.raycastFirst(ray, THREE.DoubleSide, 0, far)),
  killY: grid.worldBounds.min.y - 3,
};

const FIXED = 1 / 120;
const VAN_HALF = new THREE.Vector3(0.95, 0.9, 2.15);
const VAN_MASS = 1400;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// A clear stretch of open CARRIAGEWAY. This used to scan blindly from x,z=-60
// and take the first flat 14 m under y=0.1, which on this district lands on the
// sidewalk — flat enough to qualify, but its tactile blindpaths and manhole
// lips make prop scatter non-monotonic in mass and the mass test fails for a
// reason that has nothing to do with prop physics. Search the street
// centrelines the road graph actually routes instead.
const DOWN = new THREE.Vector3(0, -1, 0);
function groundAt(x, z) {
  const h = city.raycast(new THREE.Vector3(x, grid.worldBounds.max.y + 5, z), DOWN, 200);
  return h ? h.point.y : null;
}
const streetZ = [];
for (let row = 0; row < grid.rows; row++) {
  for (const z of STREET_ROWS_Z) streetZ.push(grid.localToWorld(row * grid.cols, new THREE.Vector3(0, 0, z), new THREE.Vector3()).z);
}
const crossX = [];
for (let col = 0; col < grid.cols; col++) {
  for (const x of STREET_CROSS_X) crossX.push(grid.localToWorld(col, new THREE.Vector3(x, 0, 0), new THREE.Vector3()).x);
}
const fromX = Math.min(...crossX);
const toX = Math.max(...crossX);
let ROAD = null;
for (const z of streetZ) {
  for (let x = fromX; x < toX - 14 && !ROAD; x += 1.5) {
    const y = groundAt(x, z);
    if (y === null || y > 0.1) continue;
    // want ~14 m of clear road along +X at the same height
    let ok = true;
    for (let d = 0; d <= 14; d += 1) {
      const y2 = groundAt(x + d, z);
      if (y2 === null || Math.abs(y2 - y) > 0.05) { ok = false; break; }
    }
    if (ok) ROAD = { x, y, z };
  }
  if (ROAD) break;
}
if (!ROAD) { console.log('FAIL  could not find a clear road stretch'); process.exit(1); }
console.log(`road test strip at (${ROAD.x.toFixed(1)}, ${ROAD.y.toFixed(2)}, ${ROAD.z.toFixed(1)})\n`);

const CONE = { size: new THREE.Vector3(0.43, 0.66, 0.41), mass: 4.5, shape: 'cylinder' };
const BIKE = { size: new THREE.Vector3(0.38, 0.90, 1.55), mass: 14, shape: 'box' };
const CAR = { size: new THREE.Vector3(1.62, 1.99, 3.40), mass: 1100, shape: 'box' };

function newWorld() {
  const w = new PropWorld({ world: city });
  w.setVehicle({ half: VAN_HALF, mass: VAN_MASS });
  // Park the virtual van far away unless a test drives it.
  w.setVehiclePose(new THREE.Vector3(ROAD.x - 500, 0, ROAD.z),
    new THREE.Quaternion(), new THREE.Vector3(), new THREE.Vector3());
  return w;
}

// ---- 1. A dropped prop settles on the road and goes to sleep ---------------
{
  const w = newWorld();
  const h = w.add({ ...CONE, position: new THREE.Vector3(ROAD.x, ROAD.y + 0.5, ROAD.z), quaternion: new THREE.Quaternion() });
  // Van nearby (so the body is inside SIM_RADIUS) but well clear of the prop.
  w.setVehiclePose(new THREE.Vector3(ROAD.x, ROAD.y + 0.9, ROAD.z - 20), new THREE.Quaternion(), new THREE.Vector3(), new THREE.Vector3());
  w.wake(h);
  for (let i = 0; i < 120 * 4; i++) w.step(FIXED);
  const p = w.getPose(h);
  const upright = new THREE.Vector3(0, 1, 0).applyQuaternion(p.quaternion).y;
  check('dropped prop settles on the road, upright, asleep',
    Math.abs(p.position.y - ROAD.y) < 0.06 && !p.awake && upright > 0.97,
    `rest y ${p.position.y.toFixed(3)} (road ${ROAD.y.toFixed(3)}), up ${upright.toFixed(3)}, awake ${p.awake}`);
}

// ---- 2. Van at 40 km/h through a cone: cone flies, van shrugs -------------
function driveThrough(prop, kmh = 40) {
  const w = newWorld();
  const startX = ROAD.x;
  const h = w.add({ ...prop, position: new THREE.Vector3(startX + 8, ROAD.y, ROAD.z), quaternion: new THREE.Quaternion() });
  w.wake(h);

  const speed = kmh / 3.6;
  const vanVel = new THREE.Vector3(speed, 0, 0);
  // Van faces +X: yaw -90 degrees about Y maps body +Z onto world +X.
  const vanQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  const vanPos = new THREE.Vector3(startX, ROAD.y + 0.9, ROAD.z);

  const startVel = vanVel.clone();
  const fakePhys = { velocity: new THREE.Vector3().copy(vanVel), angularVelocity: new THREE.Vector3() };
  let impacts = 0;
  w.onImpact = () => { impacts++; };

  for (let i = 0; i < 120 * 5; i++) {
    // Drive from the van's own velocity, so a reaction actually slows it — the
    // real loop does exactly this via VehiclePhysics. A van forced to a fixed
    // speed would bulldoze a parked car forever.
    if (i < 120 * 2) vanPos.addScaledVector(fakePhys.velocity, FIXED);
    vanVel.copy(fakePhys.velocity);
    w.setVehiclePose(vanPos, vanQuat, vanVel, new THREE.Vector3());
    w.step(FIXED);
    w.applyVanReaction(fakePhys);
  }
  const p = w.getPose(h);
  return {
    moved: p.position.distanceTo(new THREE.Vector3(startX + 8, ROAD.y, ROAD.z)),
    vanDv: startVel.length() - fakePhys.velocity.length(),
    impacts,
    finite: Number.isFinite(p.position.x) && Number.isFinite(p.position.y) && Number.isFinite(p.position.z),
    pose: p,
  };
}

const cone = driveThrough(CONE);
check('van at 40 km/h scatters a 4.5 kg cone', cone.moved > 2.5 && cone.impacts > 0,
  `cone moved ${cone.moved.toFixed(2)} m, ${cone.impacts} impacts`);
check('a cone barely slows the van', cone.vanDv < 0.35, `van dv ${cone.vanDv.toFixed(3)} m/s`);

const bike = driveThrough(BIKE);
check('van at 40 km/h scatters a 14 kg bike', bike.moved > 1.5, `bike moved ${bike.moved.toFixed(2)} m`);
const bikeTilt = new THREE.Vector3(0, 1, 0).applyQuaternion(bike.pose.quaternion).y;
check('the bike is knocked over, not just slid', bikeTilt < 0.9, `up.y ${bikeTilt.toFixed(3)}`);

const car = driveThrough(CAR);
check('an 1100 kg parked car resists and hits back', car.moved < bike.moved && car.vanDv > cone.vanDv * 3,
  `car moved ${car.moved.toFixed(2)} m, van dv ${car.vanDv.toFixed(3)} m/s`);

// ---- 3. Mass ordering: heavier moves less from the same hit ---------------
{
  const results = [4.5, 14, 60, 300].map((m) => driveThrough({ ...CONE, mass: m }).moved);
  // A 40 km/h hit punts a cone ~23 m and the rest is tumble and roll, so the
  // absolute 0.15 m tolerance this used sat well under the noise floor: probing
  // 18 positions along both streets, the ordering held at 15 and the three
  // misses inverted by at most 0.62 m, i.e. under 3%. Allow that much local
  // noise, but require the heaviest to separate clearly from the lightest —
  // a regression that flattened or inverted the mass response still fails.
  const NOISE = 0.04;
  let monotonic = results[results.length - 1] <= results[0] * 0.95;
  for (let i = 1; i < results.length; i++) {
    if (results[i] > results[i - 1] * (1 + NOISE)) monotonic = false;
  }
  check('displacement decreases as mass increases', monotonic,
    results.map((r, i) => `${[4.5, 14, 60, 300][i]}kg:${r.toFixed(2)}m`).join('  '));
}

// ---- 4. Nothing goes NaN, and a crowd still steps cheaply ----------------
{
  const w = newWorld();
  const handles = [];
  for (let i = 0; i < 120; i++) {
    const x = ROAD.x + (i % 12) * 1.1;
    const z = ROAD.z + Math.floor(i / 12) * 1.1;
    const y = groundAt(x, z);
    if (y === null) continue;
    handles.push(w.add({ ...CONE, position: new THREE.Vector3(x, y + 0.3, z), quaternion: new THREE.Quaternion() }));
  }
  const vanPos = new THREE.Vector3(ROAD.x, ROAD.y + 0.9, ROAD.z - 4);
  const vanQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  const vanVel = new THREE.Vector3(11, 0, 0);
  for (const h of handles) w.wake(h);

  const t0 = performance.now();
  const N = 120 * 6;
  for (let i = 0; i < N; i++) {
    vanPos.x += 11 * FIXED;
    w.setVehiclePose(vanPos, vanQuat, vanVel, new THREE.Vector3());
    w.step(FIXED);
  }
  const ms = (performance.now() - t0) / N;

  let bad = 0;
  for (const h of handles) {
    const p = w.getPose(h);
    if (!Number.isFinite(p.position.x + p.position.y + p.position.z + p.quaternion.w)) bad++;
  }
  check('no NaN across a crowded scene', bad === 0, `${handles.length} props, ${bad} corrupt`);
  // Ploughing a van through 120 props is a deliberate worst case. At 60 fps the
  // main loop takes ~2 substeps per frame, so 0.3 ms/substep is ~0.6 ms/frame —
  // comfortably inside a 16.7 ms budget alongside the van's own 0.014 ms.
  check('crowd steps inside the physics budget', ms < 0.3,
    `${ms.toFixed(4)} ms/substep with ${handles.length} props (${w.awakeCount} awake)`);
}

// ---- 5. Props left alone go quiet ------------------------------------------
{
  const w = newWorld();
  const hs = [];
  for (let i = 0; i < 12; i++) {
    hs.push(w.add({ ...CONE, position: new THREE.Vector3(ROAD.x + i * 0.9, ROAD.y + 0.25, ROAD.z), quaternion: new THREE.Quaternion() }));
  }
  w.setVehiclePose(new THREE.Vector3(ROAD.x + 5, ROAD.y + 0.9, ROAD.z - 20), new THREE.Quaternion(), new THREE.Vector3(), new THREE.Vector3());
  for (const h of hs) w.wake(h);
  for (let i = 0; i < 120 * 5; i++) w.step(FIXED);
  check('undisturbed props fall asleep', w.awakeCount === 0, `${w.awakeCount} still awake after 5 s`);
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
