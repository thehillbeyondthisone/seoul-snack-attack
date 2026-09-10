// Seoul Expanse surface gate — the M6 ground-surface milestone gate.
//
// M6's first deliverable is what the street is made of: the grain under the
// wheels and the paint on top of it. Both are generated rather than loaded, so
// both are measurable in Node with no GL context and no image files, and
// neither is allowed through on a screenshot alone.
//
// Three halves, in the order the failures matter:
//
//   licence   — the surface pool must be generated, and must stay that way. A
//               map that arrives from disk is the failure this project has four
//               open blockers for already (ATTRIBUTION.md), so the gate asserts
//               the pool builds from nothing and is deterministic.
//   paint     — no marking may leave its own carriageway, no marking may sit
//               below the road it is painted on, and the Korean conventions
//               (yellow centre lines, bare alleys) must hold across all 452
//               edges rather than on the one street a screenshot shows.
//   budget    — the whole layer has to fit inside the frame M5 left.
import { generateExpanseLayout } from '../../src/world/expanse-layout.js';
import { generateExpanseStreets } from '../../src/world/expanse-streets.js';
import {
  createExpanseSurfaceTextures, expanseSurfaceFields, SURFACE_TILE,
} from '../../src/world/expanse-surface-art.js';
import {
  generateExpanseRoadPaint, laneCount, ROAD_LIFT, PAINT_LIFT,
} from '../../src/world/expanse-road-paint.js';
import { SURFACES } from '../../src/world/data/color-bible.js';

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function stats(field) {
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < field.length; i++) {
    sum += field[i];
    if (field[i] < min) min = field[i];
    if (field[i] > max) max = field[i];
  }
  return { mean: sum / field.length, min, max };
}

const layout = generateExpanseLayout();
const streets = generateExpanseStreets(layout);
const paint = generateExpanseRoadPaint(streets);
const fields = expanseSurfaceFields();

console.log('\n--- surface pool ---');

// The whole licensing argument in one assertion: the pool is a pure function of
// its seeds. Nothing is fetched, nothing is decoded, and running it twice in a
// process with no filesystem and no GL context gives the same bytes.
const again = expanseSurfaceFields();
let drift = 0;
for (const family of ['asphalt', 'paving', 'ground']) {
  for (const key of Object.keys(fields[family])) {
    const a = fields[family][key];
    const b = again[family][key];
    for (let i = 0; i < a.length; i++) drift = Math.max(drift, Math.abs(a[i] - b[i]));
  }
}
check('the surface pool is generated and deterministic', drift === 0, `max drift ${drift}`);

const pool = createExpanseSurfaceTextures(1);
const textures = [
  pool.asphalt.map, pool.asphalt.normal, pool.asphalt.rough,
  pool.paving.map, pool.paving.normal, pool.paving.rough,
  pool.ground.normal, pool.ground.rough,
];
check('eight 256-square maps, all repeating', textures.length === 8
  && textures.every((t) => t.image.width === 256 && t.image.height === 256
    && t.wrapS === 1000 && t.wrapT === 1000),
`${textures.length} maps at ${textures[0].image.width}px`);
check('albedo maps are sRGB, data maps are linear',
  pool.asphalt.map.colorSpace === 'srgb' && pool.paving.map.colorSpace === 'srgb'
  && pool.asphalt.normal.colorSpace === '' && pool.ground.rough.colorSpace === '');
check('the pool is off entirely at detail intensity 0',
  createExpanseSurfaceTextures(0) === null);

// Albedo is a MULTIPLIER. If either map's mean drifts off 1.0 it is no longer
// adding grain to M4's colours, it is re-tinting them behind the colour bible's
// back, and expanse-facade-check would never see it.
for (const family of ['asphalt', 'paving']) {
  const s = stats(fields[family].rgb);
  check(`${family} albedo is multiplicative about 1.0`,
    Math.abs(s.mean - 1) < 0.005 && s.min > 0.35 && s.max < 1.8,
    `mean ${s.mean.toFixed(4)}, range ${s.min.toFixed(2)}..${s.max.toFixed(2)}`);
}

// Contrast has to be real or the map is a flat sheet that costs a sampler and
// buys nothing — and bounded, or the road reads as camouflage at 200 m.
for (const [family, low, high] of [['asphalt', 0.18, 0.75], ['paving', 0.35, 1.1]]) {
  const s = stats(fields[family].rgb);
  const spread = s.max - s.min;
  check(`${family} albedo carries usable contrast`, spread > low && spread < high,
    `spread ${spread.toFixed(3)}`);
}

for (const family of ['asphalt', 'paving', 'ground']) {
  const s = stats(fields[family].rough);
  check(`${family} roughness stays in 0..1`, s.min >= 0 && s.max <= 1,
    `${s.min.toFixed(2)}..${s.max.toFixed(2)}`);
}

// The paving pattern is the one map with structure rather than noise: it has to
// be a running bond of real blocks, which means the grout lines have to be
// darker and lower than everything either side of them.
const { size, pavers } = fields;
const blockH = size / pavers.rows;
const groutRow = Math.round(blockH * 2);      // a course boundary
const faceRow = Math.round(blockH * 2.5);     // the middle of a course
const groutHeight = stats(fields.paving.height.slice(groutRow * size, (groutRow + 1) * size));
const faceHeight = stats(fields.paving.height.slice(faceRow * size, (faceRow + 1) * size));
check('paving grout sits below the block faces',
  groutHeight.mean < faceHeight.mean - 0.2,
  `grout ${groutHeight.mean.toFixed(2)} vs face ${faceHeight.mean.toFixed(2)}`);
check('paving is a running bond of 32 blocks per tile',
  pavers.cols * pavers.rows === 32 && pavers.groutPx >= 2,
  `${pavers.cols}x${pavers.rows}, ${pavers.groutPx}px grout`);

// Tiles are in metres, and the numbers have to stay the size the things they
// depict actually are. A 1 m asphalt tile turns aggregate into gravel.
check('surface tiles are metre-scaled and plausible',
  SURFACE_TILE.asphalt >= 3 && SURFACE_TILE.asphalt <= 6
  && SURFACE_TILE.paving >= 1 && SURFACE_TILE.paving <= 3
  && SURFACE_TILE.ground >= SURFACE_TILE.asphalt,
  `asphalt ${SURFACE_TILE.asphalt} m, paving ${SURFACE_TILE.paving} m, ground ${SURFACE_TILE.ground} m`);
// 0.5 m x 0.25 m blocks is a paver, not a slab and not a tile.
const blockMetres = SURFACE_TILE.paving / pavers.cols;
check('one paving block is paver-sized', blockMetres > 0.2 && blockMetres < 0.8,
  `${blockMetres.toFixed(2)} m across`);

console.log('\n--- road paint ---');

const widthById = new Map(streets.edges.map((e) => [e.id, e.width]));
const classById = new Map(streets.edges.map((e) => [e.id, e.streetClass]));

// The one that would actually be visible from the cab: paint on the pavement.
let outside = 0;
let worstOverhang = 0;
for (const m of paint.marks) {
  const overhang = Math.abs(m.lateral) + m.halfSpan - widthById.get(m.edgeId) * 0.5;
  if (overhang > 1e-6) { outside++; worstOverhang = Math.max(worstOverhang, overhang); }
}
check('every marking stays inside its own carriageway', outside === 0,
  `${outside} outside, worst ${worstOverhang.toFixed(3)} m`);

// Lifts. A mark must ride above the road it belongs to and below the next class
// up, or it is either invisible or z-fighting.
let wrongLift = 0;
for (const m of paint.marks) {
  const base = ROAD_LIFT[m.streetClass] ?? ROAD_LIFT.street;
  if (Math.abs(m.y - (base + PAINT_LIFT)) > 1e-9) wrongLift++;
}
check('markings ride their own class lift', wrongLift === 0, `${wrongLift} wrong`);
const lifts = Object.values(ROAD_LIFT);
const minGap = Math.min(...lifts.flatMap((a) => lifts.filter((b) => b > a).map((b) => b - a)));
check('the paint lift is smaller than the gap between road classes',
  PAINT_LIFT < minGap, `paint ${PAINT_LIFT} m, closest classes ${minGap.toFixed(3)} m apart`);

// Korean convention, asserted over the whole network rather than one street.
const yellow = paint.marks.filter((m) => m.colour === SURFACES.asphaltCenter);
const white = paint.marks.filter((m) => m.colour === SURFACES.asphaltMark);
check('centre lines are yellow and lane dashes are white',
  yellow.length > 0 && yellow.every((m) => m.kind === 'solid')
  && white.every((m) => m.kind !== 'solid' || Math.abs(m.lateral) > 0.5),
  `${yellow.length} yellow, ${white.length} white`);
check('alleys carry no paint at all',
  paint.marks.every((m) => classById.get(m.edgeId) !== 'alley'),
  `${paint.stats.bareEdges} bare edges`);
check('every marked edge is a road the runtime paves',
  paint.marks.every((m) => widthById.has(m.edgeId)));

// Lane counts have to follow the width, and stay even: a road has two
// directions, and an odd lane count means one of them got the centre line.
const laneWidths = [...new Set(streets.edges.map((e) => e.width))].sort((a, b) => a - b);
check('lane counts are even and rise with width',
  laneWidths.every((w) => laneCount(w) % 2 === 0)
  && laneWidths.every((w, i) => i === 0 || laneCount(w) >= laneCount(laneWidths[i - 1])),
  laneWidths.map((w) => `${w}m:${laneCount(w)}`).join(' '));
// The narrowest lane any of this produces still has to fit a truck.
const narrowest = Math.min(...laneWidths.filter((w) => w >= 6.5)
  .map((w) => w / laneCount(w)));
check('no lane is narrower than a wide vehicle', narrowest >= 2.6,
  `${narrowest.toFixed(2)} m`);

// Lane lines must stop short of a crossing. This is a geometry test rather
// than a re-implementation of the layout arithmetic: project both marks onto
// the road direction and see whether their footprints meet. The first version
// of the approach layout put crossings BEHIND their own stop bars and ran lane
// dashes straight through them, and the top-down screenshot is the only reason
// anybody noticed.
let throughCrossing = 0;
const crossingsByEdge = new Map();
for (const m of paint.marks) {
  if (m.kind !== 'zebra') continue;
  if (!crossingsByEdge.has(m.edgeId)) crossingsByEdge.set(m.edgeId, new Map());
  // Every stripe of one crossing shares a centre sample; the lateral offset is
  // what spreads them, so undo it to recover the crossing itself.
  const key = `${Math.round(m.x - Math.cos(m.heading) * m.lateral)}:`
    + `${Math.round(m.z + Math.sin(m.heading) * m.lateral)}`;
  crossingsByEdge.get(m.edgeId).set(key, m);
}
for (const m of paint.marks) {
  if (m.kind !== 'solid' && m.kind !== 'dash') continue;
  const crossings = crossingsByEdge.get(m.edgeId);
  if (!crossings) continue;
  for (const zebra of crossings.values()) {
    const along = (m.x - zebra.x) * Math.sin(zebra.heading)
      + (m.z - zebra.z) * Math.cos(zebra.heading);
    if (Math.abs(along) < (3.6 + m.length) * 0.5 - 1e-6) { throughCrossing++; break; }
  }
}
check('no lane line runs through a crossing', throughCrossing === 0,
  `${throughCrossing} overlapping`);

// Crossings belong at junctions two big roads meet at, not at every tee.
const zebraEdges = new Set(paint.marks.filter((m) => m.kind === 'zebra').map((m) => m.edgeId));
check('crossings only appear on ring and arterial approaches',
  [...zebraEdges].every((id) => ['ring', 'arterial'].includes(classById.get(id))),
  `${zebraEdges.size} edges carry a crossing`);
check('stop bars only appear where a junction exists',
  paint.stats.perKind.stop > 0 && paint.stats.perKind.stop < streets.edges.length * 2,
  `${paint.stats.perKind.stop} bars over ${streets.edges.length} edges`);

console.log('\n--- budget ---');

check('the paint layer is a few thousand quads, not a few hundred thousand',
  paint.stats.marks > 3000 && paint.stats.marks < 12000,
  `${paint.stats.marks} marks, ${paint.stats.triangles} triangles`);
check('the paint layer is a fraction of the massing it sits under',
  paint.stats.triangles < 40000, `${paint.stats.triangles} triangles`);
// Eight 256-square RGBA maps with mipmaps: 8 * 256 * 256 * 4 * 4/3 bytes.
const vram = (8 * 256 * 256 * 4 * 4 / 3) / (1024 * 1024);
check('the surface pool fits a mobile texture budget', vram < 3,
  `${vram.toFixed(2)} MB with mipmaps`);
check('most of the network is marked',
  paint.stats.markedEdges / streets.edges.length > 0.8,
  `${paint.stats.markedEdges}/${streets.edges.length} edges`);

console.log(`\nexpanse-surface-check: ${failures ? `${failures} FAIL` : 'all PASS'}`);
process.exit(failures ? 1 : 0);
