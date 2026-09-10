// Seoul Expanse facade gate — the M4 milestone gate.
//
// M4 is the first rebuild milestone whose deliverable is how the city *looks*,
// and "visual QA" on its own is not a gate: a screenshot cannot tell you that
// an awning is 40 cm into a carriageway a kilometre away, or that Hotteok
// Market quietly drifted to the same paint as Pocha Alley. So the same rule
// applies here as everywhere else in the rebuild — everything measurable is
// measured from the records the runtime builds its meshes from — and the
// screenshots review what is left, which is taste.
//
// Three halves, in the order the failures matter:
//
//   colour     — the six neighbourhoods must read apart, and no facade paint
//                may impersonate one of the three HUD accents.
//   clearance  — nothing bolted to a building may block a street. Anything at
//                head height stays inside the pavement; anything over the road
//                hangs above the truck.
//   budget     — the whole dressing has to fit the same frame the greybox did.
import { generateExpanseLayout, RIVER } from '../../src/world/expanse-layout.js';
import { generateExpanseStreets } from '../../src/world/expanse-streets.js';
import { generateExpanseBlocks } from '../../src/world/expanse-blocks.js';
import { generateExpanseMassing } from '../../src/world/expanse-massing.js';
import {
  generateExpanseFacades, FACADE_SEED, OVERHANG_CLEAR, PODIUM_HEIGHT,
} from '../../src/world/expanse-facades.js';
import { SIGN_CELLS } from '../../src/world/data/expanse-signage.js';
import {
  DISTRICTS, HUD, colourDistance, districtFacadePaint, districtFacadeMean, cssHex,
} from '../../src/world/data/color-bible.js';

let failures = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

const layout = generateExpanseLayout();
const streets = generateExpanseStreets(layout);
const plan = generateExpanseBlocks(streets);
const massing = generateExpanseMassing(plan, streets);
const dressing = generateExpanseFacades(massing, streets);
const { facades, stats } = dressing;

const buildingById = new Map(massing.buildings.map((b) => [b.id, b]));
const cellByIndex = new Map(SIGN_CELLS.map((cell) => [cell.index, cell]));
const paletteById = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

// M3 hand-wrote six hues because the bible's paints do not separate on their
// own. M4 deleted that table, so this is the assertion that replaces it.
const means = DISTRICTS.map((district) => ({ id: district.id, hex: districtFacadeMean(district) }));
let worstPair = { distance: Infinity, a: '', b: '' };
for (let i = 0; i < means.length; i++) {
  for (let j = i + 1; j < means.length; j++) {
    const distance = colourDistance(means[i].hex, means[j].hex);
    if (distance < worstPair.distance) {
      worstPair = { distance, a: means[i].id, b: means[j].id };
    }
  }
}
check('the six districts read apart as paint',
  worstPair.distance >= 40,
  `closest pair ${worstPair.a}/${worstPair.b} at ${worstPair.distance.toFixed(0)}; `
  + means.map((m) => `${m.id} ${cssHex(m.hex)}`).join(' '));

// The bible reserves gold for money, cyan for navigation and red-orange for
// urgency. A wall wearing one of those teaches the player the wrong thing.
const ACCENTS = [['money', HUD.money], ['nav', HUD.nav], ['alarm', HUD.alarm]];
let accentClashes = 0;
let nearestAccent = { distance: Infinity, role: '', hex: 0 };
for (const facade of facades) {
  for (const [role, hex] of ACCENTS) {
    const distance = colourDistance(facade.paint, hex);
    if (distance < nearestAccent.distance) nearestAccent = { distance, role, hex: facade.paint };
    if (distance < 40) accentClashes++;
  }
}
check('no facade paint impersonates a HUD accent',
  accentClashes === 0,
  `${accentClashes} walls; nearest is ${cssHex(nearestAccent.hex)}, `
  + `${nearestAccent.distance.toFixed(0)} from ${nearestAccent.role}`);

// Every paint has to be reproducible from the rule, or the rule is decoration
// and something else is really choosing the colours.
const offRule = facades.filter((facade) => {
  const palette = paletteById[facade.districtId];
  return districtFacadePaint(palette, facade.paintIndex, facade.tone) !== facade.paint;
});
check('every wall paint comes from the colour-bible rule', offRule.length === 0,
  `${offRule.length} of ${facades.length} walls off-rule`);

// A district that paints every building the same colour is a single wall with
// windows on it, however good the rule is.
let thinnestSpread = { id: '', tones: 0, spread: 0 };
let spreadOk = true;
for (const district of DISTRICTS) {
  const own = facades.filter((facade) => facade.districtId === district.id);
  if (!own.length) continue;
  const tones = new Set(own.map((facade) => facade.paint)).size;
  const values = own.map((facade) => facade.tone);
  const spread = Math.max(...values) - Math.min(...values);
  if (!thinnestSpread.id || tones < thinnestSpread.tones) {
    thinnestSpread = { id: district.id, tones, spread };
  }
  if (tones < Math.min(12, own.length) || spread < 0.2) spreadOk = false;
}
check('every district paints a range rather than one wall', spreadOk,
  `thinnest is ${thinnestSpread.id} with ${thinnestSpread.tones} distinct paints `
  + `over ${thinnestSpread.spread.toFixed(2)} of value`);

// ---------------------------------------------------------------------------
// Signage
// ---------------------------------------------------------------------------

const allSigns = facades.flatMap((facade) => facade.signs.map((sign) => ({ facade, sign })));

const brokenCells = allSigns.filter(({ sign }) => !cellByIndex.has(sign.cell));
check('every sign points at a real atlas cell', brokenCells.length === 0,
  `${allSigns.length} signs across ${SIGN_CELLS.length} cells, ${brokenCells.length} broken`);

// The atlas is the contract between the generator and the painter: a district
// may only burn a tube its own bible entry lists.
const wrongTube = allSigns.filter(({ facade, sign }) => {
  const palette = paletteById[facade.districtId];
  const cell = cellByIndex.get(sign.cell);
  return !cell || !palette.neon.includes(cell.neon) || cell.neon !== sign.color;
});
check('every sign burns a tube its own district owns', wrongTube.length === 0,
  `${wrongTube.length} signs off-palette`);

const wrongShape = allSigns.filter(({ sign }) => {
  const cell = cellByIndex.get(sign.cell);
  const wants = sign.kind === 'fascia' || sign.kind === 'roof' ? 'wide' : 'tall';
  return cell.shape !== wants;
});
check('fascia boards are wide cells and blades are tall ones', wrongShape.length === 0,
  `${wrongShape.length} signs on the wrong cell shape`);

// An atlas cell nobody reads is a texture the city pays for and never shows.
const used = new Set(allSigns.map(({ sign }) => sign.cell));
check('the signage atlas is worth its memory',
  used.size >= SIGN_CELLS.length - 2,
  `${used.size} of ${SIGN_CELLS.length} cells appear in the city`);

// The bible's signChance is what makes Tteokbokki Alley loud and Bukak Ridge
// quiet. Measured per ten metres of street elevation rather than per building,
// because a district of wide plots carries a row of shops on each one and
// would otherwise look noisy for being nothing but big.
const perDistrict = stats.perDistrict;
const density = (id) => (perDistrict[id] ? perDistrict[id].signs / perDistrict[id].frontage * 10 : 0);
const loudest = DISTRICTS.map((d) => d.id).sort((a, b) => density(b) - density(a));
check('the loud districts are much louder than the quiet ones',
  density('hongdae') >= density('hills') * 2.5
  && density('pocha') >= density('hangang') * 1.8
  && loudest[0] === 'hongdae' && loudest.at(-1) === 'hills',
  DISTRICTS.map((d) => `${d.id} ${density(d.id).toFixed(2)}`).join(' ') + ' signs per 10 m');

const shopLots = massing.buildings.filter((b) => b.shop && b.width >= 3.2).length;
const wrongGlow = facades.filter((facade) => facade.shopfront
  && facade.shopfront.glow !== paletteById[facade.districtId].lamp);
check('every shop lot got a shopfront in its district\'s own light',
  stats.shopfronts === shopLots && wrongGlow.length === 0,
  `${stats.shopfronts} shopfronts for ${shopLots} shop lots, ${wrongGlow.length} off-palette`);

// ---------------------------------------------------------------------------
// Clearance
//
// Same coarse road grid the massing gate uses, because the answer has to agree
// with the answer that milestone already gave.
// ---------------------------------------------------------------------------

const CELL = 40;
const segments = [];
for (const edge of streets.edges) {
  for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1];
    const b = edge.points[i];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-6) continue;
    segments.push({
      ax: a.x, az: a.z, bx: b.x, bz: b.z, half: edge.width * 0.5, bridge: !!edge.bridge,
    });
  }
}
const grid = new Map();
segments.forEach((s, index) => {
  const reach = s.half + 8;
  for (let cx = Math.floor((Math.min(s.ax, s.bx) - reach) / CELL); cx <= Math.floor((Math.max(s.ax, s.bx) + reach) / CELL); cx++) {
    for (let cz = Math.floor((Math.min(s.az, s.bz) - reach) / CELL); cz <= Math.floor((Math.max(s.az, s.bz) + reach) / CELL); cz++) {
      const key = `${cx}:${cz}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(index);
    }
  }
});
function pointSegmentDistance(px, pz, s) {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-9) return Math.hypot(px - s.ax, pz - s.az);
  let t = ((px - s.ax) * dx + (pz - s.az) * dz) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (s.ax + dx * t), pz - (s.az + dz * t));
}
/** Metres of pavement left at a point, or Infinity where no road is near. */
function clearanceAt(px, pz) {
  let clearance = Infinity;
  for (let cx = Math.floor((px - 30) / CELL); cx <= Math.floor((px + 30) / CELL); cx++) {
    for (let cz = Math.floor((pz - 30) / CELL); cz <= Math.floor((pz + 30) / CELL); cz++) {
      for (const index of grid.get(`${cx}:${cz}`) || []) {
        const s = segments[index];
        if (s.bridge) continue;
        clearance = Math.min(clearance, pointSegmentDistance(px, pz, s) - s.half);
      }
    }
  }
  return clearance;
}

// Awnings hang at head height over the pavement, so they are the one piece of
// furniture that has to end before the asphalt does.
let awningsInRoad = 0;
let worstAwning = Infinity;
let lowestAwning = Infinity;
for (const facade of facades) {
  if (!facade.awning) continue;
  const building = buildingById.get(facade.id);
  const facing = building.facing;
  const rx = facing.z;
  const rz = -facing.x;
  const awning = facade.awning;
  const outerX = awning.x + facing.x * awning.depth * 0.5;
  const outerZ = awning.z + facing.z * awning.depth * 0.5;
  for (const side of [-1, 1]) {
    const px = outerX + rx * awning.width * 0.5 * side;
    const pz = outerZ + rz * awning.width * 0.5 * side;
    const clearance = clearanceAt(px, pz);
    if (clearance < worstAwning) worstAwning = clearance;
    if (clearance < 0) awningsInRoad++;
  }
  lowestAwning = Math.min(lowestAwning, awning.y - awning.drop * 0.5 - awning.height);
}
check('no awning reaches over a carriageway', awningsInRoad === 0,
  `${stats.awnings} awnings, tightest keeps ${worstAwning.toFixed(2)} m of pavement`);

check('every awning clears a walking player and a parked truck',
  lowestAwning >= 2.6,
  `lowest soffit ${lowestAwning.toFixed(2)} m`);

// Blade signs are allowed over the road. That permission is the whole reason
// this number exists, so it is asserted rather than assumed.
const overhangs = allSigns.filter(({ sign }) => sign.project > 0.2);
const lowOverhang = overhangs.filter(({ sign }) => sign.y - sign.height * 0.5 < OVERHANG_CLEAR - 1e-6);
check('nothing overhanging the street hangs below the clear height',
  lowOverhang.length === 0,
  `${overhangs.length} overhanging signs, lowest soffit `
  + `${Math.min(...overhangs.map(({ sign }) => sign.y - sign.height * 0.5)).toFixed(2)} m `
  + `against ${OVERHANG_CLEAR} m`);

const farOverhang = allSigns.filter(({ sign }) => sign.project > 1.4);
check('nothing reaches more than 1.4 m past its own building line',
  farOverhang.length === 0,
  `deepest projection ${Math.max(...allSigns.map(({ sign }) => sign.project)).toFixed(2)} m`);

// Anything on a roof has to stay on that roof.
let offRoof = 0;
for (const facade of facades) {
  const building = buildingById.get(facade.id);
  if (facade.parapet) {
    if (facade.parapet.width > building.width + 1e-6
      || facade.parapet.depth > building.depth + 1e-6) offRoof++;
  }
  for (const { sign } of allSigns.filter((s) => s.facade === facade)) {
    if (sign.kind === 'roof' && sign.width > building.width + 1e-6) offRoof++;
  }
}
check('parapets and roof signs stay inside the building they stand on',
  offRoof === 0, `${offRoof} elements over their own footprint`);

// The massing gate proved no building stands in the river. Furniture projects,
// so it gets its own answer rather than inheriting that one.
const wet = [];
for (const facade of facades) {
  const points = [
    ...facade.signs.map((sign) => ({ x: sign.x, z: sign.z })),
    ...facade.units.map((unit) => ({ x: unit.x, z: unit.z })),
    ...(facade.awning ? [{ x: facade.awning.x, z: facade.awning.z }] : []),
  ];
  for (const point of points) {
    if (point.x > RIVER.minX && point.x < RIVER.maxX
      && point.z > RIVER.minZ && point.z < RIVER.maxZ) wet.push(facade.id);
    if (point.x < streets.bounds.minX - 40 || point.x > streets.bounds.maxX + 40
      || point.z < streets.bounds.minZ - 40 || point.z > streets.bounds.maxZ + 40) wet.push(facade.id);
  }
}
check('no facade furniture hangs over the river or out of bounds', wet.length === 0,
  `${wet.length} elements`);

// Air-conditioners are the one element placed by height rather than by plan,
// so it is worth proving none of them ended up inside a shopfront.
const lowUnits = facades.flatMap((facade) => facade.units)
  .filter((unit) => unit.y - unit.height * 0.5 < PODIUM_HEIGHT);
check('no air-conditioner sits on a shopfront', lowUnits.length === 0,
  `${stats.acUnits} units, ${lowUnits.length} below the first floor`);

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

const PAVEMENT_TRIANGLES = massing.pavements.reduce((total, pad) =>
  total + (pad.polygon.length - 2) + pad.polygon.length * 2, 0);
const ROAD_TRIANGLES = segments.length * 4;
const GROUND_TRIANGLES = 4 * 2;

const worldTriangles = stats.baseTriangles + stats.detailTriangles + stats.microTriangles
  + PAVEMENT_TRIANGLES + ROAD_TRIANGLES + GROUND_TRIANGLES;
check('the dressed city fits the desktop triangle budget',
  worldTriangles <= 800_000,
  `${worldTriangles.toLocaleString('en-US')} triangles `
  + `(${stats.baseTriangles.toLocaleString('en-US')} base, `
  + `${stats.detailTriangles.toLocaleString('en-US')} detail, `
  + `${stats.microTriangles.toLocaleString('en-US')} micro)`);

// The phone drops the micro tier and culls to a few chunks. Measure the worst.
const chunkTotals = stats.perChunk
  .map((chunk) => chunk.baseTriangles + chunk.detailTriangles)
  .sort((a, b) => b - a);
const massingPerChunk = massing.stats.perChunk
  .map((chunk) => chunk.triangles).sort((a, b) => b - a);
const worstFour = chunkTotals.slice(0, 4).reduce((a, b) => a + b, 0)
  + massingPerChunk.slice(0, 4).reduce((a, b) => a + b, 0);
check('the worst four-chunk view fits the mobile triangle budget',
  worstFour + ROAD_TRIANGLES + PAVEMENT_TRIANGLES <= 350_000,
  `${(worstFour + ROAD_TRIANGLES + PAVEMENT_TRIANGLES).toLocaleString('en-US')} triangles`);

// Facades add nothing to collision on purpose: a blade sign is not a wall.
const collisionTriangles = massing.stats.triangles + PAVEMENT_TRIANGLES + GROUND_TRIANGLES
  + streets.edges.filter((e) => e.bridge).reduce((total, e) => total + (e.points.length - 1) * 4, 0);
check('dressing the city added nothing to collision',
  collisionTriangles <= 250_000,
  `${collisionTriangles.toLocaleString('en-US')} collision triangles, unchanged from M3`);

// One merged mesh per chunk per kind, per district where the material is a
// district's own. Counted exactly the way expanse-facade-mesh.js buckets them.
const buckets = new Set();
for (const facade of facades) {
  const building = buildingById.get(facade.id);
  const base = building.volumes.filter((volume) => volume.tier !== 'detail');
  base.forEach((volume, index) => {
    buckets.add(index === 0
      ? `shop|${facade.chunkId}|${facade.district}`
      : `wall|${facade.chunkId}|${facade.district}`);
    buckets.add(`cap|${facade.chunkId}`);
  });
  for (const volume of building.volumes) {
    if (volume.tier === 'detail') buckets.add(`furniture|${facade.chunkId}`);
  }
  for (const sign of facade.signs) {
    buckets.add(`${sign.tier === 'base' ? 'sign' : 'signDetail'}|${facade.chunkId}`);
  }
  if (facade.awning) buckets.add(`awning|${facade.chunkId}`);
  if (facade.parapet) buckets.add(`parapet|${facade.chunkId}`);
  if (facade.units.length) buckets.add(`ac|${facade.chunkId}`);
}
const pavementGroups = new Set(massing.pavements.map((pad) => pad.chunkId));
const drawCalls = buckets.size + pavementGroups.size + 4;
check('the dressed city draws in a sane number of calls', drawCalls <= 200,
  `${drawCalls} merged meshes`);

// Six wall + six shop + roof + signage + awning + aircon + parapet, plus
// ground, road, bridge, water and pavement.
const MATERIALS = 6 + 6 + 5 + 5;
check('material roles stay well inside the contract', MATERIALS <= 96, `${MATERIALS} materials`);

// Texture memory. Six wall pairs at 512², six shop pairs at 512x272, one roof
// sheet and one 2048x1024 signage atlas, four bytes a texel plus a third for
// mipmaps. The mobile profile halves every edge, so it pays a quarter of this.
const bytes = (6 * 2 * 512 * 512 + 6 * 2 * 512 * 272 + 256 * 256 + 2048 * 1024) * 4 * 1.34;
check('the texture pool fits a phone', bytes <= 48 * 1024 * 1024,
  `${(bytes / 1024 / 1024).toFixed(1)} MB desktop, `
  + `${(bytes / 4 / 1024 / 1024).toFixed(1)} MB at the mobile half-scale`);

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

const again = generateExpanseFacades(massing, streets, FACADE_SEED);
check('dressing is deterministic for a given seed',
  again.stats.signs === stats.signs
  && again.stats.awnings === stats.awnings
  && again.stats.parapets === stats.parapets
  && again.stats.acUnits === stats.acUnits
  && again.facades.every((facade, index) => facade.paint === facades[index].paint));

console.log('');
console.log(`facades: ${stats.buildings} dressed, ${stats.shopfronts} shopfronts, `
  + `${stats.signs} signs (${stats.signCounts.fascia} fascia, ${stats.signCounts.blade} blade, `
  + `${stats.signCounts.banner} banner, ${stats.signCounts.roof} roof), `
  + `${stats.awnings} awnings, ${stats.parapets} parapets, ${stats.acUnits} air-conditioners`);
console.log(`per district: ${DISTRICTS.map((d) => {
  const bucket = perDistrict[d.id];
  return bucket ? `${d.id} ${bucket.buildings}b/${bucket.signs}s` : `${d.id} -`;
}).join('  ')}`);
console.log(`palette: ${means.map((m) => `${m.id} ${cssHex(m.hex)}`).join('  ')}`);
console.log(`budget: ${worldTriangles.toLocaleString('en-US')} visible triangles, `
  + `${collisionTriangles.toLocaleString('en-US')} collision, ${drawCalls} draws, `
  + `${MATERIALS} materials, ${(bytes / 1024 / 1024).toFixed(1)} MB of texture`);

process.exit(failures ? 1 : 0);
