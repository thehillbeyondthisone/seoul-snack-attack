// Deterministic PRNG. Shared so the city's delivery points and the per-tile
// prop layouts draw from the same reproducible stream.

/** mulberry32 — small, fast, good enough for placement. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mix a base seed with tile coordinates. Every tile renders the same geometry,
 * so giving each one its own stream is what stops 15 identical blocks from
 * reading as 15 identical blocks.
 */
export function tileSeed(base, i, j) {
  return ((base ^ Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0);
}
