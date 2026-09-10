import assert from 'node:assert/strict';
import {
  shouldAutoEnableTouch,
  touchDriveValues,
  touchSteerValue,
} from '../../src/core/touch-controls.js';

assert.equal(shouldAutoEnableTouch(), false, 'ordinary desktop stays keyboard/gamepad only');
assert.equal(shouldAutoEnableTouch({ coarsePointer: true }), true, 'coarse primary pointer enables touch');
assert.equal(
  shouldAutoEnableTouch({ maxTouchPoints: 10, hoverNone: true }),
  true,
  'touch-only device enables touch without pointer media support',
);
assert.equal(
  shouldAutoEnableTouch({ maxTouchPoints: 10, hoverNone: false }),
  false,
  'touchscreen laptop with hover does not force the overlay',
);

assert.deepEqual(touchDriveValues(-46), { throttle: 1, brake: 0 });
assert.deepEqual(touchDriveValues(46), { throttle: 0, brake: 1 });
assert.deepEqual(touchDriveValues(0), { throttle: 0, brake: 0 });
assert.equal(touchSteerValue(-100), -1);
assert.equal(touchSteerValue(23), 0.5);
assert.equal(touchSteerValue(100), 1);

console.log('PASS  desktop detection leaves touch controls hidden');
console.log('PASS  coarse/touch-only devices enable touch controls');
console.log('PASS  left drive and right steering axes clamp correctly');
