import assert from 'node:assert/strict';
import * as THREE from 'three';
import { dayProgress } from '../../src/game/day-progress.js';
import { loadSave, persistSave, SAVE_KEY } from '../../src/game/save.js';
import { createTimeOfDay } from '../../src/world/time-of-day.js';
import { createNightRig } from '../../src/world/lighting.js';

const values = new Map();
globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
for (let count = 0; count < 40; count++) {
  const day = dayProgress(count);
  assert.equal(day.day, Math.floor(count / 4) + 1);
  assert.equal(day.mode, ['morning', 'day', 'dusk', 'night'][count % 4]);
  assert.equal(day.completed + day.remaining, 4);
}
for (const n of [-1, NaN, Infinity, 'bad']) assert.equal(dayProgress(n).total, 0);
assert.equal(dayProgress(7.9).total, 7);
assert.equal(dayProgress(0).days, 0, 'fresh saves have no day reward');
assert.equal(dayProgress(4).days, 1, 'fourth successful delivery completes a day');

for (const count of [0, 2, 3, 6, 9, 12, 27]) {
  values.set(SAVE_KEY, JSON.stringify({ cash: 54321, deliveries: count, ratings: [5] }));
  const save = loadSave();
  assert.equal(save.cash, 54321);
  assert.equal(save.deliveries, count);
  assert.equal(save.unlockedTapes.length, Math.min(4, Math.floor(count / 3)), 'legacy rewards are retained');
  save.unlockedTapes.push('dive.mp3');
  persistSave(save);
  assert.deepEqual(loadSave(), save, 'migration, cash and Dive survive reload');
}
values.set(SAVE_KEY, JSON.stringify({ cash: 0, deliveries: 3, tapeProgressVersion: 2, unlockedTapes: [] }));
assert.deepEqual(loadSave().unlockedTapes, [], 'new saves do not receive legacy three-delivery rewards');
values.set(SAVE_KEY, '{bad');
assert.deepEqual(loadSave().unlockedTapes, [], 'corrupt saves recover safely');

const scene = new THREE.Scene(), renderer = {};
const rig = createNightRig(scene, renderer);
const city = { nightRig: rig, emissiveMaterials: [{ emissiveIntensity: 0 }], lights: { streetlights: {} } };
const van = { headlights: [{ intensity: 0 }], heroFill: {} };
const rain = {}, post = { bloom: {}, setBloomStrength(v) { this.bloom.strength = v; } };
const skies = Object.fromEntries(['morning', 'day', 'dusk', 'night'].map(mode => [mode, { texture: { mode }, environment: { mode } }]));
let blends = 0;
const time = createTimeOfDay({ scene, renderer, city, van, rain, post, deliveries: 2,
  skyFactory: () => skies,
  blendFactory: () => ({ texture: { blended: true }, environment: { blended: true }, update() { blends++; } }),
});
assert.equal(time.mode, 'dusk', 'boot restores the phase from deliveries');
const before = van.headlights[0].intensity;
time.setDeliveries(3);
assert.equal(time.mode, 'night');
assert.equal(van.headlights[0].intensity, before, 'transition starts without a light jump');
time.update(1.5);
assert.ok(van.headlights[0].intensity > before && van.headlights[0].intensity < 95);
const midpoint = van.headlights[0].intensity;
time.update(0);
assert.equal(van.headlights[0].intensity, midpoint, 'a paused transition holds its lighting');
time.update(1.5);
assert.equal(time.transitioning, false);
assert.equal(scene.background, skies.night.texture);
assert.equal(scene.environment, skies.night.environment);
assert.equal(van.headlights[0].intensity, 95);
assert.equal(city.lights.streetlights.enabled, true);
assert.equal(rain.baseFog, rig.params.fogDensity);
time.update(900);
assert.equal(time.mode, 'night', 'elapsed play time cannot advance the day');
time.setDeliveries(4);
time.update(3);
assert.equal(time.mode, 'morning', 'completed days repeat the cycle');
time.set('night');
time.setDeliveries(5);
time.update(3);
assert.equal(time.mode, 'day', 'the next delivery resumes progression after a debug preset');
assert.equal(city.lights.streetlights.enabled, false);
time.setDeliveries(0, { immediate: true });
assert.equal(time.mode, 'morning', 'reset returns to day one');
assert.ok(blends > 0);
console.log('PASS day boundaries, repeat days, save migration, Dive persistence and lighting/sky transitions');
