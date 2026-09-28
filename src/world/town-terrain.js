// 밤내 Bamnae — the height field.
//
// THIS MODULE IS THE WHOLE POINT OF THE REBUILD. The Expanse is flat because
// four modules each independently author geometry at y = 0: the ground is four
// quads, plots extrude from a constant `base`, road paint is a ribbon at a
// constant lift, and street detail is dropped on a plane. None of those is
// hard to change on its own; the problem is that there is no single place that
// knows how high the ground is, so changing them means changing all of them
// and hoping they agree.
//
// So: ONE height field, and every later stage samples it. `heightAt(x, z)` is
// the contract. Ground mesh, building pads, kerbs, road paint, props, delivery
// anchors and the collider all come through here or they are wrong.
//
// TERRAIN CONFORMS TO ROADS, NOT THE OTHER WAY ROUND.
//
// The naive version samples noise and drapes roads over it. That fails at
// junctions: four arms arrive at four different heights and the crossroads is
// a funnel. `town-layout.js` authors every node's elevation, so here the
// landform is built first, then each road corridor STAMPS its own surveyed
// elevation into the field, blended out across a shoulder. Inside a
// carriageway the field IS the road, exactly; a metre outside it is already
// bending back toward the hillside. Junctions are correct by construction
// because both arms stamp the same node height.
//
// The price is cut and fill: where a surveyed road disagrees with the natural
// landform, the field has to bend to meet it, and a big disagreement reads as
// an embankment or a cutting. `tools/bench/town-terrain-check.mjs` measures
// that disagreement along every centreline and fails past 4.5 m. Three places
// in town are deliberately near that limit and get retaining walls:
// the west gate cutting, the weir back road, and the pavilion knoll.
//
// WHAT THIS DELIBERATELY CANNOT DO. It is a height field: one Y per X/Z. No
// overpasses, no tunnels, no caves. The two bridges work only because bridge
// edges are excluded from the conform — the deck is separate geometry and the
// stream bed stays cut underneath it. If the town ever wants a real tunnel
// through the ridge, it is separate geometry merged into the collider, not a
// change here.
import { generateTownLayout, TOWN_BOUNDS, TOWN_MARGIN } from './town-layout.js';

/** The valley floor datum: main street outside the co-op. Everything is relative to this. */
export const FLOOR_Y = 3.0;

/**
 * The valley's north-south cross section, taken at the saddle (x ~ -15) where
 * the town centre sits. Absolute metres. This is the single readable drawing
 * of the landform; `amp()` below only stretches its ridge half across X.
 *
 * Read it top to bottom as driving south out of the hills:
 */
const CROSS_SECTION = Object.freeze([
  // --- the mountain above the town -----------------------------------------
  // Steep, and deliberately so. The first version ran ONE 25% slope from the
  // valley floor to the crest, which is the gradient the terraces need — but
  // it put the skyline at 10.5 degrees from main street, and 10 degrees is
  // open country with a hill in it, not a valley. A real 산 behind a 읍내 is a
  // gentle apron the houses terrace into and then a 50-60% mountain above it.
  // Measured from 중앙로, this profile puts the skyline at ~19 degrees.
  Object.freeze({ z: -285, y: 88.0 }), // summit, well outside the play area
  Object.freeze({ z: -250, y: 80.0 }),
  Object.freeze({ z: -225, y: 68.0 }), // world edge
  Object.freeze({ z: -198, y: 50.0 }), // 정자 pavilion shoulder
  Object.freeze({ z: -178, y: 39.0 }),
  Object.freeze({ z: -165, y: 30.5 }), // top of the apron, above 윗말3길
  // --- the apron the village is terraced into ------------------------------
  Object.freeze({ z: -161, y: 29.4 }), // 윗말 3길
  Object.freeze({ z: -127, y: 19.1 }), // 윗말 2길
  Object.freeze({ z: -90, y: 10.0 }),  // 윗말 1길
  // The foot is three controls, not one. A single kink here put a 24% face
  // directly behind the market's back lane, and every road that climbed out of
  // town across it needed 5 m of embankment to get off the valley floor.
  Object.freeze({ z: -72, y: 6.2 }),
  Object.freeze({ z: -56, y: 3.9 }),
  Object.freeze({ z: -40, y: 3.1 }),   // foot of the ridge, behind the market
  // --- the valley floor ----------------------------------------------------
  Object.freeze({ z: -26, y: 3.0 }),   // 중앙로
  Object.freeze({ z: 0, y: 2.7 }),
  Object.freeze({ z: 22, y: 2.2 }),
  Object.freeze({ z: 44, y: 1.9 }),    // 천변로
  Object.freeze({ z: 60, y: 1.5 }),    // top of the stream bank
  Object.freeze({ z: 78, y: 2.0 }),    // south bank
  Object.freeze({ z: 100, y: 2.1 }),   // 남길
  Object.freeze({ z: 152, y: 4.0 }),   // school and terminal
  // --- the far side of the valley ------------------------------------------
  // A valley has TWO walls. The paddies stay flat to the far edge of the play
  // area, then the south side climbs. It reads at ~18 degrees from the
  // terminal and ~8 from main street, which is the right way round: the near
  // wall encloses you, the far one closes the world.
  Object.freeze({ z: 195, y: 6.5 }),   // last of the flat paddy
  Object.freeze({ z: 215, y: 12.0 }),  // world edge
  Object.freeze({ z: 240, y: 26.0 }),
  Object.freeze({ z: 265, y: 40.0 }),
  Object.freeze({ z: 285, y: 48.0 }),
]);

/** Where the ridge half of the cross section begins. South of this, amp() does nothing. */
const RIDGE_FOOT_Z = -40;

/** The cross-section value at the foot — the datum the ridge rises from. */
const RIDGE_FOOT_Y = 3.1;

/**
 * How much ridge it takes to cancel the end rises. The pass and the west gate
 * are VALLEY-FLOOR landforms: without this they stack onto the ridge and the
 * east summit comes out 17 m too tall, which is how the first measurement read
 * a 55 m skyline for a 38 m hill.
 */
const END_RISE_RIDGE_CANCEL = 12;

/**
 * The two ends of the valley, and the gaps the roads leave through.
 *
 * `gap` is the important part and it was missing at first. Raising these to
 * close the valley east and west put 중앙로 in a 13 m cutting at the west gate
 * and 15 m at the pass, because a uniform rise is a WALL and a road has to be
 * carved through it. But a valley mouth is not a wall with a hole cut in it —
 * it is a notch, a saddle between two hills, and the road and the stream use
 * the notch because it is already there.
 *
 * So each end rise is reduced along a band of Z centred on its route out:
 * full height on the shoulders either side, roughly half on the line the road
 * actually takes.
 */
const EAST = Object.freeze({
  fromX: 105, toX: 330, height: 34, fadeFromZ: -40, fadeToZ: 58, fade: 0.92,
  gapZ: -34, gapHalf: 60, gapDepth: 0.50,   // the pass
});
const WEST = Object.freeze({
  fromX: -150, toX: -330, height: 22, fadeFromZ: 0, fadeToZ: 56, fade: 0.86,
  gapZ: 14, gapHalf: 70, gapDepth: 0.66,    // the gorge the stream leaves by
});

/** Ground roughness. Small enough that nothing reads as noise, big enough that nothing reads as a plane. */
const MICRO = Object.freeze([
  Object.freeze({ scale: 58, amp: 0.42 }),
  Object.freeze({ scale: 19, amp: 0.16 }),
]);

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
function gauss(x, centre, width) {
  const d = (x - centre) / width;
  return Math.exp(-d * d);
}

/**
 * Monotone cubic interpolation (Fritsch-Carlson) through a sorted control
 * list.
 *
 * NOT smoothstep, and the difference is the whole south wall. Smoothstep has
 * zero slope at BOTH ends of every span, so a chain of spans has a flat spot
 * at every control point — which on a valley wall with controls 20-25 m apart
 * came out as a flight of concentric terraces down both sides of the town.
 * Invisible in plan, invisible in section, obvious the moment it was rendered
 * as clay.
 *
 * Fritsch-Carlson matches tangents across the joins instead, so the curve is
 * C1 continuous with no flat spots, and it clamps those tangents so the result
 * never overshoots its own control points — which matters here because an
 * overshoot on the stream bed would be a dam.
 */
function monotoneTangents(controls, key) {
  const n = controls.length;
  const secant = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    secant[i] = (controls[i + 1].y - controls[i].y) / (controls[i + 1][key] - controls[i][key]);
  }
  const m = new Array(n);
  m[0] = secant[0];
  m[n - 1] = secant[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (secant[i - 1] + secant[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (secant[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / secant[i];
    const b = m[i + 1] / secant[i];
    const sq = a * a + b * b;
    if (sq > 9) {
      const tau = 3 / Math.sqrt(sq);
      m[i] = tau * a * secant[i];
      m[i + 1] = tau * b * secant[i];
    }
  }
  return m;
}

const TANGENTS = new WeakMap();

function profileAt(controls, key, value) {
  if (value <= controls[0][key]) return controls[0].y;
  const last = controls[controls.length - 1];
  if (value >= last[key]) return last.y;
  let m = TANGENTS.get(controls);
  if (!m) TANGENTS.set(controls, (m = monotoneTangents(controls, key)));
  for (let i = 1; i < controls.length; i++) {
    const b = controls[i];
    if (value > b[key]) continue;
    const a = controls[i - 1];
    const h = b[key] - a[key];
    const t = (value - a[key]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a.y
      + (t3 - 2 * t2 + t) * h * m[i - 1]
      + (-2 * t3 + 3 * t2) * b.y
      + (t3 - t2) * h * m[i];
  }
  return last.y;
}

/** Cross-section value at z, with the ridge half held flat at the foot datum. */
function baseAt(z) {
  return z <= RIDGE_FOOT_Z ? RIDGE_FOOT_Y : profileAt(CROSS_SECTION, 'z', z);
}

/** How far the cross section rises above the foot datum. Zero south of the foot. */
function ridgeAt(z) {
  if (z >= RIDGE_FOOT_Z) return 0;
  return Math.max(0, profileAt(CROSS_SECTION, 'z', z) - RIDGE_FOOT_Y);
}

/**
 * The ridge's height multiplier along X: two summits with a saddle over the
 * town centre. The saddle is the reason main street has a sky behind it
 * instead of a wall, and the reason the church's neon cross on the second
 * terrace is visible from the far end of town.
 *
 * Tuned so that amp ~ 1.0 at the saddle, where CROSS_SECTION was surveyed.
 */
function amp(x) {
  return 0.88
    + 0.26 * gauss(x, -150, 150)  // west summit
    + 0.30 * gauss(x, 105, 170)   // east summit, slightly higher
    - 0.16 * gauss(x, -15, 85);   // the saddle over the town centre
}

/** 1 on the valley floor, 0 once the hillside has risen past the cancel height. */
function endRiseMask(z) {
  return 1 - clamp01(ridgeAt(z) / END_RISE_RIDGE_CANCEL);
}

function endRise(end, x, z) {
  const along = smoothstep(end.fromX, end.toX, x);
  if (along <= 0) return 0;
  const gap = 1 - end.gapDepth * gauss(z, end.gapZ, end.gapHalf);
  return along * end.height
    * (1 - end.fade * smoothstep(end.fadeFromZ, end.fadeToZ, z))
    * gap
    * endRiseMask(z);
}

const eastRise = (x, z) => endRise(EAST, x, z);
const westRise = (x, z) => endRise(WEST, x, z);

// ---- micro relief -----------------------------------------------------------
// Hash-based value noise. Deterministic from world coordinates alone, so the
// runtime, the offline gate and any future collider bake agree without sharing
// state. No RNG instance, no seed threading, no ordering dependency.
function hash2(ix, iz) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

function valueNoise(x, z, scale) {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const n00 = hash2(ix, iz);
  const n10 = hash2(ix + 1, iz);
  const n01 = hash2(ix, iz + 1);
  const n11 = hash2(ix + 1, iz + 1);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return (a + (b - a) * sz) * 2 - 1;
}

function microAt(x, z) {
  let total = 0;
  for (const octave of MICRO) total += valueNoise(x, z, octave.scale) * octave.amp;
  return total;
}

// ---- the stream -------------------------------------------------------------

function segmentParam(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq <= 1e-9) return 0;
  return clamp01(((px - ax) * dx + (pz - az) * dz) / lenSq);
}

/**
 * Distance from (x, z) to 밤내, with the channel's half-width, bed and water
 * surface interpolated to that point along the stream.
 */
function streamProbe(stream, x, z) {
  let best = Infinity;
  let half = stream.points[0].half;
  let bed = stream.points[0].bed;
  let water = stream.points[0].water;
  for (let i = 1; i < stream.points.length; i++) {
    const a = stream.points[i - 1];
    const b = stream.points[i];
    const t = segmentParam(x, z, a.x, a.z, b.x, b.z);
    const cx = a.x + (b.x - a.x) * t;
    const cz = a.z + (b.z - a.z) * t;
    const d = Math.hypot(x - cx, z - cz);
    if (d < best) {
      best = d;
      half = a.half + (b.half - a.half) * t;
      bed = a.bed + (b.bed - a.bed) * t;
      water = a.water + (b.water - a.water) * t;
    }
  }
  return { distance: best, half, bed, water };
}

/**
 * How much of the stream's own bed elevation applies at (x, z): 1 inside the
 * channel, easing to 0 across the bank. The bank is where the concrete
 * revetment goes, and it is steep on purpose — a gentle grassy slope is a
 * different country.
 */
function streamMask(stream, distance, half) {
  if (distance <= half) return 1;
  if (distance >= half + stream.bank) return 0;
  return 1 - smoothstep(0, 1, (distance - half) / stream.bank);
}

// ---- road corridors ---------------------------------------------------------

/** Shoulder width the conform blends out across, per carriageway width. */
function shoulderFor(width) {
  return Math.max(3.0, width * 0.55);
}

/**
 * Flatten every edge polyline into surveyed segments, and bucket them into a
 * uniform grid. `heightAt` is called a few hundred thousand times building the
 * ground mesh and the pads, so the per-query cost has to be a handful of
 * segments, not all 300 of them.
 *
 * Bridge edges are EXCLUDED: their decks float over the trench, and stamping
 * them into the field would fill the stream in at both crossings.
 */
function buildCorridors(layout) {
  const segments = [];
  for (const edge of layout.edges) {
    if (edge.bridge) continue;
    const half = edge.width / 2;
    const shoulder = shoulderFor(edge.width);
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-4) continue;
      segments.push({
        edge: edge.id,
        ax: a.x, az: a.z, ay: a.y,
        bx: b.x, bz: b.z, by: b.y,
        half, shoulder, reach: half + shoulder,
      });
    }
  }

  const cell = 24;
  const minX = TOWN_BOUNDS.minX - TOWN_MARGIN;
  const minZ = TOWN_BOUNDS.minZ - TOWN_MARGIN;
  const cols = Math.ceil(((TOWN_BOUNDS.maxX + TOWN_MARGIN) - minX) / cell) + 1;
  const rows = Math.ceil(((TOWN_BOUNDS.maxZ + TOWN_MARGIN) - minZ) / cell) + 1;
  const buckets = new Map();
  const colOf = (x) => clamp(Math.floor((x - minX) / cell), 0, cols - 1);
  const rowOf = (z) => clamp(Math.floor((z - minZ) / cell), 0, rows - 1);

  for (const seg of segments) {
    const c0 = colOf(Math.min(seg.ax, seg.bx) - seg.reach);
    const c1 = colOf(Math.max(seg.ax, seg.bx) + seg.reach);
    const r0 = rowOf(Math.min(seg.az, seg.bz) - seg.reach);
    const r1 = rowOf(Math.max(seg.az, seg.bz) + seg.reach);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = r * cols + c;
        let bucket = buckets.get(key);
        if (!bucket) buckets.set(key, (bucket = []));
        bucket.push(seg);
      }
    }
  }

  return { segments, buckets, cols, rows, cell, minX, minZ, colOf, rowOf };
}

/**
 * The conform at (x, z): a blend weight in 0..1 and the surveyed elevation to
 * blend toward.
 *
 * The blend AMOUNT is the maximum corridor weight, not the sum: inside any
 * carriageway it is exactly 1, so two roads meeting at a junction do not stack
 * to 2 and overshoot.
 *
 * The blend TARGET is an inverse-square-distance average. A plain weighted
 * average is wrong near a junction, and measurably so: five arms converge on
 * `main_pass`, and 10 m down one of them the average of all five sat 0.62 m
 * off the road that was actually there. Inverse-square makes the corridor you
 * are standing on dominate by three orders of magnitude at its own centreline
 * while staying continuous everywhere, so junctions blend without the arms
 * dragging each other off their surveyed heights.
 */
const CENTRELINE_EPS_SQ = 0.0025;

function conformAt(corridors, x, z) {
  const key = corridors.rowOf(z) * corridors.cols + corridors.colOf(x);
  const bucket = corridors.buckets.get(key);
  if (!bucket) return null;

  let maxWeight = 0;
  let sum = 0;
  let weighted = 0;
  for (const seg of bucket) {
    const t = segmentParam(x, z, seg.ax, seg.az, seg.bx, seg.bz);
    const cx = seg.ax + (seg.bx - seg.ax) * t;
    const cz = seg.az + (seg.bz - seg.az) * t;
    const d = Math.hypot(x - cx, z - cz);
    if (d >= seg.reach) continue;
    const w = d <= seg.half ? 1 : 1 - smoothstep(0, 1, (d - seg.half) / seg.shoulder);
    if (w <= 0) continue;
    const y = seg.ay + (seg.by - seg.ay) * t;
    const ww = (w * w) / (d * d + CENTRELINE_EPS_SQ);
    sum += ww;
    weighted += y * ww;
    if (w > maxWeight) maxWeight = w;
  }
  if (sum <= 0) return null;
  return { weight: maxWeight, y: weighted / sum };
}

/**
 * The natural landform, before any road touches it. Exported because the gate
 * measures cut and fill as the difference between this and the surveyed road,
 * and because a future vegetation pass wants "how steep would this be if the
 * road were not here".
 */
export function landHeightAt(stream, x, z) {
  const probe = streamProbe(stream, x, z);
  const mask = streamMask(stream, probe.distance, probe.half);
  // Micro relief is damped inside the channel. A concrete-lined bed is smooth,
  // and 0.58 m of noise on a 1.4 m depth of water breaks the surface.
  const land = baseAt(z)
    + ridgeAt(z) * amp(x)
    + eastRise(x, z)
    + westRise(x, z)
    + microAt(x, z) * (1 - 0.85 * mask);
  return mask <= 0 ? land : land + (probe.bed - land) * mask;
}

/**
 * Build the height field for a town layout.
 *
 * Returns the sampling contract every later stage uses. Nothing in the town
 * may compute a ground elevation any other way.
 */
export function createTownTerrain(layout = generateTownLayout()) {
  const stream = layout.stream;
  const corridors = buildCorridors(layout);

  function heightAt(x, z) {
    const land = landHeightAt(stream, x, z);
    const road = conformAt(corridors, x, z);
    if (!road) return land;
    return land + (road.y - land) * road.weight;
  }

  /**
   * Surface normal by central difference. `eps` defaults to half a ground-mesh
   * cell so the normal matches the triangles the player actually drives on,
   * rather than a mathematically truer normal the collider does not have.
   */
  function normalAt(x, z, eps = 1.0) {
    const dx = heightAt(x + eps, z) - heightAt(x - eps, z);
    const dz = heightAt(x, z + eps) - heightAt(x, z - eps);
    const nx = -dx;
    const nz = -dz;
    const ny = 2 * eps;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  /** Steepest slope at (x, z), as a rise/run ratio. 0.25 is a 25% hillside. */
  function slopeAt(x, z, eps = 1.0) {
    const n = normalAt(x, z, eps);
    return Math.hypot(n.x, n.z) / Math.max(n.y, 1e-6);
  }

  /** Water surface, or null off the channel. Depth is measured to the bed. */
  function waterAt(x, z) {
    const { distance, half, water } = streamProbe(stream, x, z);
    if (distance > half) return null;
    return { y: water, depth: water - heightAt(x, z) };
  }

  /** True inside the channel, so plot cutting and prop placement can stay out of it. */
  function inStream(x, z, pad = 0) {
    const { distance, half } = streamProbe(stream, x, z);
    return distance <= half + pad;
  }

  /**
   * How far the surveyed road at (x, z) sits above (+, fill) or below (-, cut)
   * the natural landform. The gate walks every centreline through this.
   */
  function cutFillAt(x, z) {
    const road = conformAt(corridors, x, z);
    if (!road) return 0;
    return road.y - landHeightAt(stream, x, z);
  }

  /**
   * Regular sample grid over the world including its margin, for building the
   * ground mesh and for drawing contours offline. `cell` is metres.
   */
  function sampleGrid(cell = 4) {
    const minX = TOWN_BOUNDS.minX - TOWN_MARGIN;
    const maxX = TOWN_BOUNDS.maxX + TOWN_MARGIN;
    const minZ = TOWN_BOUNDS.minZ - TOWN_MARGIN;
    const maxZ = TOWN_BOUNDS.maxZ + TOWN_MARGIN;
    const cols = Math.round((maxX - minX) / cell) + 1;
    const rows = Math.round((maxZ - minZ) / cell) + 1;
    const heights = new Float32Array(cols * rows);
    let min = Infinity;
    let max = -Infinity;
    for (let r = 0; r < rows; r++) {
      const z = minZ + r * cell;
      for (let c = 0; c < cols; c++) {
        const y = heightAt(minX + c * cell, z);
        heights[r * cols + c] = y;
        if (y < min) min = y;
        if (y > max) max = y;
      }
    }
    return { cell, cols, rows, minX, minZ, maxX, maxZ, heights, min, max };
  }

  return {
    layout, stream, corridors,
    heightAt, normalAt, slopeAt, waterAt, inStream, cutFillAt, sampleGrid,
    landHeightAt: (x, z) => landHeightAt(stream, x, z),
    bounds: { ...TOWN_BOUNDS },
    margin: TOWN_MARGIN,
    floorY: FLOOR_Y,
  };
}
