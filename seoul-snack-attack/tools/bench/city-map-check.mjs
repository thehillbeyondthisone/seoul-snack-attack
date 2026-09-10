import assert from 'node:assert/strict';
import {
  CITY_MAP_TUNING,
  createMapProjection,
  headingToMapRotation,
  normalizeMapBounds,
  resolveActiveMapTarget,
} from '../../src/ui/city-map.js';

const bounds = normalizeMapBounds({ minX: -425, maxX: 425, minZ: -306, maxZ: 306 });
assert.deepEqual(bounds, {
  minX: -425, maxX: 425, minZ: -306, maxZ: 306, width: 850, depth: 612,
});
assert.deepEqual(CITY_MAP_TUNING, { linearScale: 1, roadWidthScale: 1 });

const projection = createMapProjection(bounds, 1000, 800, { padding: 20 });
const northwest = projection.project({ x: -425, z: -306 });
const southeast = projection.project({ x: 425, z: 306 });
assert(northwest.x >= 20 && northwest.y >= 20, 'northwest bound must fit the canvas');
assert(southeast.x <= 980 && southeast.y <= 780, 'southeast bound must fit the canvas');
assert(northwest.y < southeast.y, 'north/-Z must render toward the top');
const roundTrip = projection.unproject(northwest.x, northwest.y);
assert(Math.abs(roundTrip.x + 425) < 1e-9 && Math.abs(roundTrip.z + 306) < 1e-9);

assert.equal(headingToMapRotation(Math.PI), 0, 'north heading must point up');
assert.equal(headingToMapRotation(0), Math.PI, 'south heading must point down');

const pickup = resolveActiveMapTarget({
  state: 'toPickup',
  order: { rest: { point: { x: 4, z: -9 }, nameKo: '가게', nameEn: 'Shop' } },
});
assert.equal(pickup.leg, 'pickup');
assert.deepEqual(pickup.target, { x: 4, z: -9 });
const dropoff = resolveActiveMapTarget({
  state: 'delivering', order: { dropoff: { x: 12, z: 30 } },
});
assert.equal(dropoff.leg, 'dropoff');

console.log('PASS city map: faithful 1:1 live projection, north-up orientation, pickup/drop-off targets');
