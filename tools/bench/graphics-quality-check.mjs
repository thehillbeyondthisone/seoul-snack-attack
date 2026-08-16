import assert from 'node:assert/strict';
import {
  DESKTOP_GRAPHICS,
  MOBILE_GRAPHICS,
  shouldAutoUseMobileGraphics,
} from '../../src/core/graphics-quality.js';

assert.equal(shouldAutoUseMobileGraphics(), false, 'ordinary desktop stays on desktop graphics');
assert.equal(
  shouldAutoUseMobileGraphics({ coarsePointer: true, shortSide: 390 }),
  true,
  'phone-sized coarse pointer selects mobile graphics',
);
assert.equal(
  shouldAutoUseMobileGraphics({ maxTouchPoints: 10, hoverNone: true, shortSide: 768 }),
  true,
  'touch-only tablet selects mobile graphics',
);
assert.equal(
  shouldAutoUseMobileGraphics({ maxTouchPoints: 10, hoverNone: false, shortSide: 768 }),
  false,
  'touchscreen laptop with hover keeps desktop graphics',
);
assert.equal(
  shouldAutoUseMobileGraphics({ coarsePointer: true, shortSide: 1440 }),
  false,
  'large coarse display is not assumed to be mobile',
);

assert.deepEqual(DESKTOP_GRAPHICS, {
  name: 'desktop', antialias: true, pixelRatioCap: 2, postScale: 1,
  rainDensity: 1, propDensity: 1, streetlights: 10, cullDistance: 105,
});
assert.equal(MOBILE_GRAPHICS.pixelRatioCap, 1);
assert.equal(MOBILE_GRAPHICS.postScale, 0.65);
assert.ok(MOBILE_GRAPHICS.rainDensity < DESKTOP_GRAPHICS.rainDensity);
assert.ok(MOBILE_GRAPHICS.propDensity < DESKTOP_GRAPHICS.propDensity);

console.log('PASS  desktop capabilities retain the existing graphics defaults');
console.log('PASS  touch-first phone/tablet capabilities select mobile graphics');
console.log('PASS  mobile profile reduces rendering work without changing desktop values');
