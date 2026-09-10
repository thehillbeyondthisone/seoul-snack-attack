// Guards the per-order request notes. There is no way to eyeball 70 lines of
// copy across every dish type in-game, and a note that reaches the HUD without
// its English half silently blanks the row in hold-for-English.
import assert from 'node:assert/strict';

const {
  DELIVERY_NOTES, DELIVERY_NOTES_BY_TYPE, KITCHEN_NOTES, KITCHEN_NOTES_BY_TYPE, pickOrderNotes,
} = await import('../../src/game/data/order-notes.js');
const { FOOD_TYPES } = await import('../../src/game/data/restaurants.js');

const pools = [
  ['delivery', DELIVERY_NOTES],
  ...Object.entries(DELIVERY_NOTES_BY_TYPE).map(([type, list]) => [`delivery:${type}`, list]),
  ['kitchen', KITCHEN_NOTES],
  ...Object.entries(KITCHEN_NOTES_BY_TYPE).map(([type, list]) => [`kitchen:${type}`, list]),
];

// Built from its code point rather than typed: encoding-check.mjs greps this
// same tree for that character, so spelling it out would fail the repo's check.
const REPLACEMENT = String.fromCharCode(0xfffd);

const seen = new Map();
let total = 0;
for (const [name, list] of pools) {
  assert.ok(list.length, `${name} pool is empty`);
  for (const note of list) {
    total++;
    assert.ok(note.ko?.trim(), `${name} has a note with no Korean`);
    assert.ok(note.en?.trim(), `${name} note "${note.ko}" has no English`);
    assert.ok(!note.ko.includes(REPLACEMENT) && !note.en.includes(REPLACEMENT), `${name} note "${note.ko}" carries a replacement char`);
    assert.ok(/[가-힣]/.test(note.ko), `${name} note "${note.ko}" has no Hangul`);
    assert.ok(!/[가-힣]/.test(note.en), `${name} note "${note.ko}" left Korean in its English`);
    const previous = seen.get(note.ko);
    assert.equal(previous, undefined, `note "${note.ko}" appears in both ${previous} and ${name}`);
    seen.set(note.ko, name);
  }
}

// Every type a dish can declare has to route through the picker cleanly, typed
// pool or not — an unknown key must fall back rather than return undefined.
for (const type of [...Object.keys(FOOD_TYPES), 'unknown-type']) {
  for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
    const { note, kitchenNote } = pickOrderNotes(type, () => roll);
    assert.ok(note?.ko && note?.en, `${type} at roll ${roll} produced no delivery note`);
    if (kitchenNote) assert.ok(kitchenNote.ko && kitchenNote.en, `${type} at roll ${roll} produced a half kitchen note`);
  }
}

// Both branches of the kitchen box have to be reachable, or every order would
// carry the same shape and the pickup panel would never vary.
const rolls = Array.from({ length: 400 }, (_, i) => i / 400);
let withKitchen = 0;
for (const roll of rolls) if (pickOrderNotes('soup', () => roll).kitchenNote) withKitchen++;
assert.ok(withKitchen > 0 && withKitchen < rolls.length, 'kitchen notes are always or never attached');

console.log(`PASS  ${total} order notes are bilingual, unique, and free of mojibake`);
console.log('PASS  every food type resolves a delivery note');
console.log('PASS  kitchen notes are optional but reachable');
