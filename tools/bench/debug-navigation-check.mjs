// Backtick-menu tour routes. Pure Node: no browser or WebGL required.
import assert from 'node:assert/strict';
import { DEBUG_DESTINATIONS, destinationUrl } from '../../src/ui/debug-destinations.js';
import { HUD } from '../../src/world/data/color-bible.js';

const byId = new Map(DEBUG_DESTINATIONS.map((destination) => [destination.id, destination]));
const base = 'https://example.test/snack/?world=proc&dive=1&rain=heavy#old';

assert.equal(byId.size, DEBUG_DESTINATIONS.length, 'tour destination ids must be unique');
assert.equal(DEBUG_DESTINATIONS[0].id, 'street-drive', 'test street should be the first tour action');
assert.ok(DEBUG_DESTINATIONS.every(({ label }) => label.includes(' · ')), 'tour labels must be bilingual');

assert.equal(
  destinationUrl(base, byId.get('street-drive')),
  'https://example.test/snack/?world=pilot&building=street-assembly&intro=off&props=off',
);
assert.equal(
  destinationUrl(base, byId.get('street-orbit')),
  'https://example.test/snack/building-pilot.html?building=street-assembly',
);
assert.equal(
  destinationUrl(base, byId.get('hippo-cockpit')),
  'https://example.test/snack/?world=expanse2&view=cockpit&intro=off',
);
assert.equal(
  destinationUrl(base, byId.get('drain-jump')),
  'https://example.test/snack/?world=expanse2&dive=ramp&intro=off&time=night',
);
assert.equal(
  destinationUrl(base, byId.get('colour-bible')),
  'https://example.test/snack/color-bible.html',
);
assert.equal(HUD.nav, 0x3fd2e6, 'tour affordance must use the bible navigation cyan');

console.log(`PASS  ${DEBUG_DESTINATIONS.length} deterministic backtick-menu tour destinations`);
console.log('PASS  test street is first and stale review flags are cleared');
console.log('PASS  tour accent is the colour-bible navigation cyan');
