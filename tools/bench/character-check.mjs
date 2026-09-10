import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { resolveCapsule, capsuleSpawnIsClear } from '../../src/world/capsule-collision.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const floor = new THREE.BoxGeometry(20, 0.2, 20).translate(0, -0.1, 0);
const wall = new THREE.BoxGeometry(0.2, 3, 6).translate(2, 1.5, 0);
const geo = mergeGeometries([floor, wall], false);
geo.boundsTree = new MeshBVH(geo);
const identity = new THREE.Matrix4();
const grid = {
  count: 1,
  matrices: [identity],
  inverses: [identity],
  cellBounds: [new THREE.Box3(new THREE.Vector3(-10, -1, -10), new THREE.Vector3(10, 4, 10))],
};
const ray = new THREE.Ray();
const city = {
  bvh: geo.boundsTree,
  grid,
  killY: -3,
  raycast(origin, direction, far = 100) {
    ray.set(origin, direction);
    return geo.boundsTree.raycastFirst(ray, THREE.DoubleSide, 0, far) || null;
  },
  findGround(x, z) {
    return this.raycast(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0), 8);
  },
  getSafeReset() { return { position: new THREE.Vector3(0, 0, 0), heading: 0 }; },
};

{
  const position = new THREE.Vector3(0, -0.05, 0);
  const velocity = new THREE.Vector3(0, -2, 0);
  const result = resolveCapsule(city, position, velocity);
  check('capsule resolves onto ground', result.grounded && Math.abs(position.y) < 1e-4,
    `y=${position.y.toFixed(4)}`);
  check('ground collision removes downward velocity', velocity.y >= -1e-6,
    `vy=${velocity.y.toFixed(4)}`);
}

{
  const position = new THREE.Vector3(1.88, 0, 0);
  const velocity = new THREE.Vector3(3, 0, 0);
  resolveCapsule(city, position, velocity);
  check('capsule cannot penetrate wall', position.x <= 1.581,
    `x=${position.x.toFixed(4)}`);
  check('wall collision removes inward velocity', velocity.x <= 0.05,
    `vx=${velocity.x.toFixed(4)}`);
  check('blocked spawn is rejected', !capsuleSpawnIsClear(city, new THREE.Vector3(1.88, 0, 0)));
}

// Minimal DOM is enough to exercise the real controller and original model in Node.
globalThis.document = {
  createElement: () => ({ id: '', style: {}, textContent: '' }),
  body: { appendChild() {} },
};
const { PlayerCharacter } = await import('../../src/character/controller.js');
const { OnFootCamera } = await import('../../src/character/camera.js');
const { ChaseCamera } = await import('../../src/vehicle/camera.js');
const scene = new THREE.Scene();
const phys = {
  meshPosition: new THREE.Vector3(0, 0.8, 0),
  position: new THREE.Vector3(0, 0.8, 0),
  velocity: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  speedKmh: 0,
};
const character = new PlayerCharacter({
  scene, city, phys, hud: { toast() {} },
  getVehicleDef: () => ({ collisionHalf: { x: 0.8, y: 0.7, z: 1.2 } }),
});
check('vehicle exit creates an on-foot player', character.exitVehicle({ force: true }) && character.mode === 'onFoot');

const input = {
  moveAxes: () => ({ x: 0, y: 1 }),
  held: () => false,
  pressed: () => false,
};
const startZ = character.position.z;
for (let i = 0; i < 120; i++) character.updateFixed(1 / 120, input, new THREE.Vector3(0, 0, 1));
check('camera-relative walk advances the character', character.position.z > startZ + 1.5,
  `dz=${(character.position.z - startZ).toFixed(2)}m`);
check('locomotion reaches walk state', character.state === 'walk', `state=${character.state}`);

const startX = character.position.x;
input.moveAxes = () => ({ x: 1, y: 0 });
for (let i = 0; i < 60; i++) character.updateFixed(1 / 120, input, new THREE.Vector3(0, 0, 1));
check('positive on-foot X moves toward screen-right', character.position.x < startX - 0.5,
  `dx=${(character.position.x - startX).toFixed(2)}m`);
character.position.x = startX;
character.velocity.x = 0;
input.moveAxes = () => ({ x: 0, y: 0 });

{
  const camera = new THREE.PerspectiveCamera();
  const clearCity = { raycast: () => null };
  const footCamera = new OnFootCamera(camera, clearCity);
  footCamera.setHeading(0);
  footCamera.update(1 / 60, character, { x: 100, y: 0 });
  check('on-foot positive look X turns the view right', footCamera.forward.x < 0,
    `forward.x=${footCamera.forward.x.toFixed(3)}`);
  const footBeforeY = camera.getWorldDirection(new THREE.Vector3()).y;
  footCamera.update(0.5, character, { x: 0, y: 100 });
  const footAfterY = camera.getWorldDirection(new THREE.Vector3()).y;
  check('on-foot positive look Y turns the view downward', footAfterY < footBeforeY,
    `forward.y ${footBeforeY.toFixed(3)} -> ${footAfterY.toFixed(3)}`);

  const chaseCamera = new ChaseCamera(camera, clearCity);
  const cameraPhys = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    latG: 0,
    params: {},
  };
  chaseCamera.snapTo(cameraPhys);
  chaseCamera.update(1 / 60, cameraPhys, { x: 100, y: 0 });
  const vehicleView = camera.getWorldDirection(new THREE.Vector3());
  check('vehicle positive look X turns the view right', vehicleView.x < 0,
    `forward.x=${vehicleView.x.toFixed(3)}`);
  const vehicleBeforeY = vehicleView.y;
  chaseCamera.update(0.5, cameraPhys, { x: 0, y: 100 });
  const vehicleAfterY = camera.getWorldDirection(new THREE.Vector3()).y;
  check('vehicle positive look Y turns the view downward', vehicleAfterY < vehicleBeforeY,
    `forward.y ${vehicleBeforeY.toFixed(3)} -> ${vehicleAfterY.toFixed(3)}`);
}

let jumpEdge = true;
input.moveAxes = () => ({ x: 0, y: 0 });
input.pressed = (action) => {
  if (action !== 'jump' || !jumpEdge) return false;
  jumpEdge = false;
  return true;
};
character.updateFixed(1 / 120, input, new THREE.Vector3(0, 0, 1));
check('buffered jump leaves the ground', character.velocity.y > 6 && character.state === 'jump',
  `vy=${character.velocity.y.toFixed(2)} state=${character.state}`);
for (let i = 0; i < 120; i++) character.updateFixed(1 / 120, input, new THREE.Vector3(0, 0, 1));
check('jump lands back on the BVH floor', character.grounded && Math.abs(character.position.y) < 1e-3,
  `y=${character.position.y.toFixed(3)}`);

check('nearby vehicle begins entry state', character.beginEnterVehicle() && character.mode === 'entering');
for (let i = 0; i < 160 && !character.isDriving; i++) {
  character.updateFixed(1 / 120, input, new THREE.Vector3(0, 0, 1));
}
check('vehicle entry completes into driving mode', character.isDriving && character.state === 'driving');

geo.dispose();
if (failures) process.exitCode = 1;
else console.log('\nall character checks passed');
