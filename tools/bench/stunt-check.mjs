import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stuntPayout } from '../../src/game/stunt-scoring.js';
import { OverdubPowerup } from '../../src/game/overdub-powerup.js';
import { SAVE_KEY, STUNT_SAVE_KEY, loadSave, persistSave } from '../../src/game/save.js';
import { PropWorld } from '../../src/physics/prop-world.js';
import { StuntOrders } from '../../src/game/stunt-orders.js';
import { Input } from '../../src/core/input.js';
import { assemblyPlacements, STUNT_BLOCK_DROPOFF_ID, STUNT_LINE } from '../../src/world/building-assembly.js';

const regularBlock = assemblyPlacements();
const stuntBlocks = assemblyPlacements({ stuntBlock: true });
assert.equal(regularBlock.length, 12);
assert.equal(stuntBlocks.length, 24);
assert.equal(new Set(stuntBlocks.map((p) => p.key)).size, 24);
assert.equal(stuntBlocks.find((p) => p.key === 'north-1')?.id, 'patchwork-pocha');
assert.equal(stuntBlocks.find((p) => p.key === STUNT_BLOCK_DROPOFF_ID)?.id, 'cloud-dumpling');
assert.ok(Math.max(...stuntBlocks.map((p) => p.x)) < 100);
assert.ok(Math.min(...stuntBlocks.map((p) => p.x)) > -100);
console.log('PASS two authored building blocks fit the open test-road straight');
assert.ok(STUNT_LINE.approachX < STUNT_LINE.rampX && STUNT_LINE.rampX < STUNT_LINE.landingX);
assert.ok(Math.abs(STUNT_LINE.rampZ) < 6 && Math.abs(STUNT_LINE.safeZ) < 6);
assert.ok(STUNT_LINE.propPositions.slice(0, 2).every(([x, z]) => x > STUNT_LINE.rampX && z > 0));
assert.ok(STUNT_LINE.propPositions.every(([, z]) => Math.abs(z - STUNT_LINE.safeZ) > 2));
console.log('PASS marked stunt lane crosses the ramp and props while the safe lane stays clear');

const all = new Map();
globalThis.localStorage = { getItem: (key) => all.get(key) ?? null, setItem: (key, value) => all.set(key, value) };
persistSave({ ...loadSave(STUNT_SAVE_KEY), cash: 500 }, STUNT_SAVE_KEY);
assert.equal(loadSave(STUNT_SAVE_KEY).cash, 500);
assert.equal(loadSave(SAVE_KEY).cash, 0);
assert.equal(all.has(SAVE_KEY), false);
console.log('PASS isolated prototype save');

const pickup = { id: 'patchwork-pocha', pickupSite: { id: 'patchwork-pocha' },
  anchor: { id: 'north-1' }, point: new THREE.Vector3(-64, .3, -7),
  dishes: [{ price: 7000, tip: [500] }] };
const destination = { id: STUNT_BLOCK_DROPOFF_ID, point: new THREE.Vector3(30, .3, 7), edgeId: 'test-road', progress: .5 };
const blockJob = StuntOrders.prototype._makeOrder.call({
  restaurants: [pickup],
  city: { metadata: { stuntBlock: true, stuntFixture: { dropoffEntranceId: STUNT_BLOCK_DROPOFF_ID } },
    deliveryAnchors: [destination], findGround: () => ({ point: { y: .3 } }),
    findRoute: () => ({ distance: 118 }) },
});
assert.equal(blockJob.rest.id, 'patchwork-pocha');
assert.equal(blockJob.dropoffAnchor.id, STUNT_BLOCK_DROPOFF_ID);
assert.equal(blockJob.timer, 60);
assert.equal(blockJob.dist, 118);
console.log('PASS fixed job binds the two authored block entrances');

const doorstep = new THREE.Vector3(0, 0, 0);
const interaction = {
  player: { mode: 'onFoot', isStunting: false, position: doorstep.clone() },
  city: { raycast: () => null }, prompt: { dataset: {} },
};
assert.equal(StuntOrders.prototype._canInteract.call(interaction, doorstep), true);
interaction.player.position.x = 2.1;
assert.equal(StuntOrders.prototype._canInteract.call(interaction, doorstep), false);
interaction.player.position.x = 1;
interaction.city.raycast = () => ({ distance: .5 });
assert.equal(StuntOrders.prototype._canInteract.call(interaction, doorstep), false);
interaction.player.mode = 'driving';
assert.equal(StuntOrders.prototype._canInteract.call(interaction, doorstep), false);
console.log('PASS pickup needs an on-foot courier within 2 m and a clear path');

const full = stuntPayout(1200, 90, 90, new Set(['drift', 'jump', 'courier']));
const late = stuntPayout(1200, -10, 90, new Set(['courier']));
assert.deepEqual(full, { base: 1200, timeTip: 300, styleBonus: 300, overdubBonus: 0, total: 1800 });
assert.equal(late.total, 1300);
assert.equal(stuntPayout(1200, 900, 90, new Set(['drift', 'jump', 'courier'])).total, 1800);
console.log('PASS base guarantee and capped time/style tips');

const overdub = new OverdubPowerup();
assert.equal(overdub.activate(), true);
assert.equal(overdub.activate(), false);
overdub.update(4, { paused: true });
assert.equal(overdub.remaining, 30);
assert.equal(overdub.awardStyle('jump'), true);
assert.equal(overdub.awardStyle('jump'), false);
assert.deepEqual(stuntPayout(1200, 90, 90, new Set(['drift', 'jump']), overdub.boostedStyles),
  { base: 1200, timeTip: 300, styleBonus: 200, overdubBonus: 100, total: 1800 });
overdub.update(30);
assert.equal(overdub.active, false);
assert.equal(overdub.awardStyle('drift'), false);
overdub.completeDelivery();
assert.equal(overdub.charges, 1);
assert.equal(overdub.boostedStyles.size, 1);
overdub.beginOrder();
assert.equal(overdub.boostedStyles.size, 0);
assert.equal(overdub.activate(), true);
console.log('PASS optional Overdub charge, pause, expiry, one-time style bonus and refill');

const driveSample = {
  state: 'delivering', completedStyles: new Set(), driftSeconds: 0,
  jumpSeconds: 0, wasGrounded: true,
  order: { payout: 1200 }, _awardStyle: StuntOrders.prototype._awardStyle,
  phys: { groundedWheels: 4, quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(3, 0, 6), speedKmh: 24, controls: { handbrake: true } },
};
for (let i = 0; i < 73; i++) StuntOrders.prototype.sampleDriving.call(driveSample, 1 / 120);
assert.equal(driveSample.completedStyles.has('drift'), true);
driveSample.phys.groundedWheels = 0;
for (let i = 0; i < 38; i++) StuntOrders.prototype.sampleDriving.call(driveSample, 1 / 120);
driveSample.phys.groundedWheels = 4;
StuntOrders.prototype.sampleDriving.call(driveSample, 1 / 120);
assert.equal(driveSample.completedStyles.has('jump'), true);
StuntOrders.prototype.courierRecovered.call(driveSample);
assert.equal(driveSample.completedStyles.has('courier'), true);
assert.equal(driveSample.completedStyles.size, 3);
console.log('PASS drift, landing and courier categories award once');

for (const fixedStepsPerFrame of [4, 2, 1]) {
  const frameInput = { edge: new Set(['KeyQ']), gamepadEdge: new Set(), consumedActions: new Set(), touch: { pressed: () => false } };
  let fires = 0;
  for (let i = 0; i < fixedStepsPerFrame; i++) if (Input.prototype.pressed.call(frameInput, 'dive')) fires++;
  assert.equal(fires, 1);
  frameInput.edge = new Set(['KeyH']);
  frameInput.consumedActions.clear();
  fires = 0;
  for (let i = 0; i < fixedStepsPerFrame; i++) if (Input.prototype.pressed.call(frameInput, 'grab')) fires++;
  assert.equal(fires, 1);
  frameInput.edge.clear();
  frameInput.gamepadEdge.add(13);
  frameInput.consumedActions.clear();
  fires = 0;
  for (let i = 0; i < fixedStepsPerFrame; i++) if (Input.prototype.pressed.call(frameInput, 'grab')) fires++;
  assert.equal(fires, 1);
}
console.log('PASS one dive/grab edge across 30, 60 and 120 FPS fixed substeps');

const breakdown = { innerHTML: '' };
globalThis.document = { exitPointerLock() {} };
let persisted = 0;
const completed = {
  state: 'delivering', order: { payout: 1000, timer: -5, timerMax: 60 }, completedStyles: new Set(['courier']),
  save: { cash: 0, deliveries: 0, ratings: [] }, avgStars: 0,
  _persist: () => { persisted++; },
  hud: { setCash() {}, setStats() {}, hideTicket() {}, setObjective() {} },
  audio: { event() {}, music: { setDeliveries: () => [] } },
  foodDisplay: { clear() {} }, marker: { visible: true }, prompt: { style: {} },
  result: { style: {}, querySelector: () => breakdown },
};
StuntOrders.prototype._deliver.call(completed);
StuntOrders.prototype._deliver.call(completed);
assert.equal(completed.save.deliveries, 1);
assert.equal(persisted, 1);
assert.equal(completed.save.cash, 1083);
console.log('PASS late payout and exactly-once completion');

const paused = { paused: true, prompt: { style: {} }, order: { timer: 14 }, state: 'delivering' };
StuntOrders.prototype.update.call(paused, 5, { pressed: () => true });
assert.equal(paused.order.timer, 14);
assert.equal(paused.prompt.style.display, 'none');
StuntOrders.prototype.repeat.call({
  result: { style: {} }, state: 'result', lastOrder: { id: 'repeat-me' },
  city: { metadata: { stuntBlock: true } },
  offerNow(id) { assert.equal(id, 'patchwork-pocha'); assert.equal(this._restartOrder.id, 'repeat-me'); },
});
console.log('PASS paused timer and repeat retains the fixed job');

const fakeWorld = { raycast: () => null, killY: -100 };
const props = new PropWorld({ world: fakeWorld, gravity: 0 });
props.setVehicle({ half: new THREE.Vector3(1, 1, 2), mass: 1700 });
props.setVehiclePose(new THREE.Vector3(100, 0, 0), new THREE.Quaternion(), new THREE.Vector3(), new THREE.Vector3());
const small = props.add({ position: new THREE.Vector3(1, 0, 0), quaternion: new THREE.Quaternion(), size: new THREE.Vector3(.4, .6, .4), mass: 4 });
const heavy = props.add({ position: new THREE.Vector3(1, 0, 1), quaternion: new THREE.Quaternion(), size: new THREE.Vector3(.8, .8, .8), mass: 200 });
props.setActivityCentres([new THREE.Vector3(100, 0, 0), new THREE.Vector3(0, 0, 0)]);
props.step(1 / 120);
assert.equal(props.active.length, 2);
props.shove(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), 2);
assert.ok(props.getPose(small).speed > props.getPose(heavy).speed * 10);
assert.equal(props.applyImpulse(999999, new THREE.Vector3(1, 0, 0)), false);
console.log('PASS activity follows courier and shove respects mass');

const floor = new THREE.BoxGeometry(20, .2, 20).translate(0, -.1, 0);
const wall = new THREE.BoxGeometry(.2, 3, 6).translate(2, 1.5, 0);
const lowRoof = new THREE.BoxGeometry(2, .2, 2).translate(-2, 1.2, 0);
const geometry = mergeGeometries([floor, wall, lowRoof], false);
geometry.boundsTree = new MeshBVH(geometry);
const identity = new THREE.Matrix4();
const ray = new THREE.Ray();
const city = {
  bvh: geometry.boundsTree,
  grid: { count: 1, matrices: [identity], inverses: [identity], cellBounds: [new THREE.Box3(new THREE.Vector3(-10, -1, -10), new THREE.Vector3(10, 4, 10))] },
  raycast(origin, direction, far = 100) { ray.set(origin, direction); return geometry.boundsTree.raycastFirst(ray, THREE.DoubleSide, 0, far); },
  findGround(x, z) { return this.raycast(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0), 8); },
  getSafeReset() { return { position: new THREE.Vector3(), heading: 0 }; },
  killY: -3,
};
const carryProps = new PropWorld({ world: city });
const carryHandle = carryProps.add({ position: new THREE.Vector3(.8, 0, 0), quaternion: new THREE.Quaternion(), size: new THREE.Vector3(.4, .6, .4), mass: 4, userData: 'test:light' });
carryProps.add({ position: new THREE.Vector3(.6, 0, .4), quaternion: new THREE.Quaternion(), size: new THREE.Vector3(.8, .8, .8), mass: 80, userData: 'test:heavy' });
carryProps.setActivityCentres([new THREE.Vector3()]);
const candidate = carryProps.findGrabCandidate(new THREE.Vector3(), new THREE.Vector3(1, 0, 0));
assert.equal(candidate?.handle, carryHandle);
assert.equal(carryProps.grab(carryHandle), true);
const initialCarry = carryProps.getPose(carryHandle).position.x;
for (let i = 0; i < 90; i++) {
  assert.equal(carryProps.holdAt(carryHandle, new THREE.Vector3(3, 1, 0), 1 / 120), true);
  carryProps.step(1 / 120);
}
const blockedCarry = carryProps.getPose(carryHandle);
assert.ok(blockedCarry.position.x > initialCarry);
assert.ok(blockedCarry.position.x < 1.9, `held object crossed wall: ${blockedCarry.position.x}`);
const beforeThrow = blockedCarry.speed;
assert.equal(carryProps.releaseHeld(new THREE.Vector3(-1, .3, 0)), true);
assert.ok(carryProps.getPose(carryHandle).speed > beforeThrow + 2);
carryProps.grab(carryHandle);
carryProps.resetAll();
assert.equal(carryProps.heldHandle, null);
console.log('PASS light prop grabs, follows, stops at wall, throws, and resets');
globalThis.document = { createElement: () => ({ style: {}, textContent: '' }), body: { appendChild() {} } };
const { PlayerCharacter } = await import('../../src/character/controller.js');
const { moveCapsuleSwept } = await import('../../src/world/capsule-collision.js');
const phys = { meshPosition: new THREE.Vector3(0, .8, -4), velocity: new THREE.Vector3(), quaternion: new THREE.Quaternion(), speedKmh: 0 };
const courier = new PlayerCharacter({ scene: new THREE.Scene(), city, phys, hud: { toast() {} }, getVehicleDef: () => ({ collisionHalf: { x: .8, y: .7, z: 1.2 } }), gameplayProfile: 'stunt' });
const bailPhys = { meshPosition: new THREE.Vector3(0, .8, -4), velocity: new THREE.Vector3(0, 0, 14), quaternion: new THREE.Quaternion(), speedKmh: 50 };
const bailCourier = new PlayerCharacter({ scene: new THREE.Scene(), city, phys: bailPhys, hud: { toast() {} }, getVehicleDef: () => ({ collisionHalf: { x: .8, y: .7, z: 1.2 } }), gameplayProfile: 'stunt' });
assert.equal(bailCourier.bailVehicle(), true);
assert.equal(bailCourier.mode, 'onFoot');
assert.equal(bailCourier.state, 'dive');
assert.ok(bailCourier.velocity.y > 2 && bailCourier.velocity.length() < 19);
assert.equal(bailCourier.beginEnterVehicle(), false);
const ordinaryCourier = new PlayerCharacter({ scene: new THREE.Scene(), city, phys: bailPhys, hud: { toast() {} }, getVehicleDef: () => ({ collisionHalf: { x: .8, y: .7, z: 1.2 } }) });
assert.equal(ordinaryCourier.bailVehicle(), false);
console.log('PASS moving bailout is bounded, clears the truck, and stays prototype-only');
const blockedExit = new PlayerCharacter({ scene: new THREE.Scene(), city, phys, hud: { toast() {} }, getVehicleDef: () => ({ collisionHalf: { x: .8, y: .7, z: 1.2 } }), gameplayProfile: 'stunt' });
blockedExit._vehicleSideCandidates = () => [new THREE.Vector3(2, 0, 0), new THREE.Vector3(-2, 0, 0)];
assert.equal(blockedExit.exitVehicle(), false);
assert.equal(blockedExit.mode, 'driving');
const roofCity = { findGround: () => ({ point: new THREE.Vector3(0, 3, 0) }) };
const roofExit = new PlayerCharacter({ scene: new THREE.Scene(), city: roofCity, phys, hud: { toast() {} }, getVehicleDef: () => ({ collisionHalf: { x: .8, y: .7, z: 1.2 } }), gameplayProfile: 'stunt' });
assert.equal(roofExit._vehicleSideCandidates().length, 0);
console.log('PASS exit refuses obstructed door sides and high roof ground hits');
const blockedEntry = new PlayerCharacter({ scene: new THREE.Scene(), city, phys: { ...phys, meshPosition: new THREE.Vector3(3, .8, 0) }, hud: { toast() {} }, getVehicleDef: () => ({ collisionHalf: { x: .8, y: .7, z: 1.2 } }), gameplayProfile: 'stunt' });
blockedEntry.position.set(0, 0, 0);
blockedEntry.enterTarget.set(3, 0, 0);
blockedEntry.mode = 'entering';
blockedEntry.state = 'enteringVehicle';
for (let i = 0; i < 150 && blockedEntry.mode === 'entering'; i++) blockedEntry.updateFixed(1 / 120, {}, new THREE.Vector3(0, 0, 1));
assert.equal(blockedEntry.mode, 'onFoot');
assert.ok(blockedEntry.position.x < 1.9);
console.log('PASS obstructed entry stops at the wall and returns control');
const longEntryCity = { ...fakeWorld, findGround: (x, z) => ({ point: new THREE.Vector3(x, 0, z) }) };
const longEntry = new PlayerCharacter({ scene: new THREE.Scene(), city: longEntryCity,
  phys: { ...phys, meshPosition: new THREE.Vector3(0, .8, 0), speedKmh: 0 },
  hud: { toast() {} }, getVehicleDef: () => ({ collisionHalf: { x: .8, y: .7, z: 1.2 } }), gameplayProfile: 'stunt' });
longEntry.position.set(0, 0, 5);
longEntry.mode = 'onFoot';
assert.equal(longEntry.beginEnterVehicle(), true);
for (let i = 0; i < 220 && longEntry.mode === 'entering'; i++) longEntry.updateFixed(1 / 120, {}, new THREE.Vector3(0, 0, 1));
assert.equal(longEntry.mode, 'driving');
console.log('PASS clear entry from the outer interaction range reaches the truck');
const contactProps = new PropWorld({ world: fakeWorld, gravity: 0 });
contactProps.add({ position: new THREE.Vector3(.6, 0, 0), quaternion: new THREE.Quaternion(), size: new THREE.Vector3(.4, .6, .4), mass: 4 });
const propCourier = new PlayerCharacter({ scene: new THREE.Scene(), city: fakeWorld, phys, hud: { toast() {} }, getVehicleDef: () => ({ collisionHalf: { x: .8, y: .7, z: 1.2 } }), gameplayProfile: 'stunt' });
propCourier.mode = 'onFoot';
propCourier.state = 'dive';
propCourier.velocity.set(10, 0, 0);
propCourier.propFacade = contactProps;
propCourier.updateFixed(1 / 120, { pressed: () => false, held: () => false, moveAxes: () => ({ x: 0, y: 0 }) }, new THREE.Vector3(0, 0, 1));
assert.equal(propCourier.state, 'tumble');
assert.ok(propCourier.tumbleImpact > .25);
console.log('PASS prop contact starts a speed-weighted tumble');
courier.position.set(0, 0, 0);
courier.mode = 'onFoot';
courier.grounded = true;
courier.velocity.set(3, 0, 0);
const edges = new Set(['dive']);
const input = { pressed: (name) => edges.delete(name), held: () => false, moveAxes: () => ({ x: -1, y: 0 }) };
courier.updateFixed(1 / 120, input, new THREE.Vector3(0, 0, 1));
assert.equal(courier.state, 'dive');
assert.ok(courier.velocity.x > 5);
for (let i = 0; i < 100; i++) courier.updateFixed(1 / 120, input, new THREE.Vector3(0, 0, 1));
assert.ok(courier.position.x < 1.9, `wall crossed: ${courier.position.x}`);
console.log('PASS bounded dive momentum and wall collision');
assert.equal(courier.beginEnterVehicle(), false);
assert.equal(courier.mode, 'onFoot');
console.log('PASS vehicle entry blocked while tumbling');

const fastPosition = new THREE.Vector3(0, 0, 0);
const fastVelocity = new THREE.Vector3(50, 0, 0);
moveCapsuleSwept(city, fastPosition, fastVelocity, .1, { height: 1.72, radius: .32, axis: new THREE.Vector3(1, 0, 0) });
assert.ok(fastPosition.x < 1.6, `swept wall crossed: ${fastPosition.x}`);
console.log('PASS swept prone capsule blocks fast wall crossing');

courier.velocity.set(0, 0, 0);
courier.grounded = true;
courier.state = 'tumble';
let recoveries = 0;
courier.stuntCompleted = () => { recoveries++; };
const safePosition = courier.position.clone();
courier.position.set(-2, 0, 0);
edges.add('jump');
courier.updateFixed(1 / 120, input, new THREE.Vector3(0, 0, 1));
assert.equal(courier.state, 'tumble');
courier.position.copy(safePosition);
edges.add('jump');
courier.updateFixed(1 / 120, input, new THREE.Vector3(0, 0, 1));
assert.equal(courier.state, 'recovering');
for (let i = 0; i < 70; i++) courier.updateFixed(1 / 120, input, new THREE.Vector3(0, 0, 1));
assert.equal(courier.isStunting, false);
assert.equal(recoveries, 1);
console.log('PASS supported recovery completes within 0.6 seconds');
courier.state = 'tumble';
courier.velocity.set(4, 1, 0);
courier.resetToRoad();
assert.equal(courier.state, 'idle');
assert.equal(courier.velocity.length(), 0);
assert.equal(courier.isStunting, false);
console.log('PASS blocked clearance and manual reset escape a tumble');
geometry.dispose();
