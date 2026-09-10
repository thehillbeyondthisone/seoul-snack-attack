// Scratch tool: score the generated city for M4 review camera positions, the
// same way tools/expanse-plan.mjs picks the massing views. Run it, paste the
// numbers into `expanseViews` in src/main.js.
import { generateExpanseLayout } from '../src/world/expanse-layout.js';
import { generateExpanseStreets } from '../src/world/expanse-streets.js';
import { generateExpanseBlocks } from '../src/world/expanse-blocks.js';
import { generateExpanseMassing } from '../src/world/expanse-massing.js';
import { generateExpanseFacades } from '../src/world/expanse-facades.js';

const layout = generateExpanseLayout();
const streets = generateExpanseStreets(layout);
const plan = generateExpanseBlocks(streets);
const massing = generateExpanseMassing(plan, streets);
const dressing = generateExpanseFacades(massing, streets);
const byId = new Map(massing.buildings.map((b) => [b.id, b]));

const round = (v) => Math.round(v * 10) / 10;

// --- the shopfront close-up ------------------------------------------------
// Wanted: a market or pocha plot with a shopfront, a fascia board, an awning
// and a blade sign, on the widest pavement we can find so the camera can stand
// back far enough to frame the whole ground floor.
let best = null;
for (const facade of dressing.facades) {
  if (!facade.shopfront || !facade.awning) continue;
  if (!['market', 'pocha', 'hongdae'].includes(facade.districtId)) continue;
  const kinds = new Set(facade.signs.map((s) => s.kind));
  if (!kinds.has('fascia') || !kinds.has('blade')) continue;
  const building = byId.get(facade.id);
  const score = facade.pavement * 2 + building.width;
  if (!best || score > best.score) best = { facade, building, score };
}
if (best) {
  const { building, facade } = best;
  const stand = building.depth * 0.5 + facade.pavement + 6.5;
  console.log('facadeShop', {
    camera: [
      round(building.x + building.facing.x * stand),
      2.3,
      round(building.z + building.facing.z * stand),
    ],
    target: [round(building.x), 2.6, round(building.z)],
    district: facade.districtId,
    pavement: round(facade.pavement),
    width: round(building.width),
    signs: facade.signs.map((s) => s.cellId),
  });
}

// --- the roofscape ---------------------------------------------------------
// Wanted: the chunk with the most parapets, seen from 55 m at a shallow angle
// so the parapets, the setback ledges and the roof furniture all read.
const perChunk = new Map();
for (const facade of dressing.facades) {
  if (!facade.parapet) continue;
  const bucket = perChunk.get(facade.chunkId) || { count: 0, x: 0, z: 0 };
  bucket.count++;
  bucket.x += facade.parapet.x;
  bucket.z += facade.parapet.z;
  perChunk.set(facade.chunkId, bucket);
}
const busiest = [...perChunk.entries()].sort((a, b) => b[1].count - a[1].count)[0];
if (busiest) {
  const [id, bucket] = busiest;
  const cx = bucket.x / bucket.count;
  const cz = bucket.z / bucket.count;
  console.log('facadeRoofs', {
    camera: [round(cx - 95), 58, round(cz - 95)],
    target: [round(cx), 12, round(cz)],
    chunk: id,
    parapets: bucket.count,
  });
}

// --- the colour comparison -------------------------------------------------
// Wanted: a vantage that holds three districts at once, which is the only shot
// that actually reviews the colour rule rather than one district's palette.
const wanted = ['hongdae', 'station', 'market'];
let sumX = 0;
let sumZ = 0;
let n = 0;
for (const facade of dressing.facades) {
  if (!wanted.includes(facade.districtId)) continue;
  const building = byId.get(facade.id);
  sumX += building.x;
  sumZ += building.z;
  n++;
}
console.log('facadeColour', {
  camera: [round(sumX / n), 210, round(sumZ / n + 250)],
  target: [round(sumX / n), 8, round(sumZ / n - 40)],
  buildings: n,
});
