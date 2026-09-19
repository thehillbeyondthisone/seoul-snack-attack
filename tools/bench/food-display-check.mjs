import assert from 'node:assert/strict';
import * as THREE from 'three';
import { centerFoodGroup, foodGroupBounds } from '../../src/game/food-display.js';

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual}`);

// Deliberately unequal, off-origin models reproduce the meal-kit drift that
// equal centre spacing could not correct.
const preview = new THREE.Group();
const platter = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.8));
platter.position.set(-0.65, 0.09, 0.24);
const bottle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2));
bottle.position.set(0.55, 0.6, -0.12);
preview.add(platter, bottle);
const previewBounds = centerFoodGroup(preview, { vertical: 'center' });
const previewCentre = previewBounds.getCenter(new THREE.Vector3());
near(previewCentre.x, 0, 'preview x centre');
near(previewCentre.y, 0, 'preview y centre');
near(previewCentre.z, 0, 'preview z centre');

// World dishes keep the same combined horizontal pivot but rest on local Y=0.
const world = preview.clone(true);
world.position.set(8, 3, -5); // parent placement must not leak into local bounds
const worldBounds = centerFoodGroup(world, { vertical: 'ground' });
const worldCentre = worldBounds.getCenter(new THREE.Vector3());
near(worldCentre.x, 0, 'world x centre');
near(worldCentre.z, 0, 'world z centre');
near(worldBounds.min.y, 0, 'world ground');

// Imported wrapper transforms are measured relative to their food root.
const imported = new THREE.Group();
imported.position.set(-30, 7, 18);
imported.rotation.y = 0.7;
const wrapper = new THREE.Group();
wrapper.position.set(4, -2, 6);
wrapper.scale.set(3, 0.5, 2);
wrapper.add(new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1)));
imported.add(wrapper);
const importedBounds = foodGroupBounds(imported, new THREE.Box3());
near(importedBounds.getSize(new THREE.Vector3()).x, 6, 'wrapper width');
near(importedBounds.getSize(new THREE.Vector3()).y, 2, 'wrapper height');
near(importedBounds.getSize(new THREE.Vector3()).z, 2, 'wrapper depth');

console.log('PASS food groups centre on combined visible bounds and imported transforms stay local');
