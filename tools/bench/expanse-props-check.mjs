// Seoul Expanse prop review-slice gate. Pure Node; no asset decoding or DOM.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { generateExpanseLayout } from '../../src/world/expanse-layout.js';
import { generateExpanseShops } from '../../src/world/expanse-shops.js';
import { generateExpanseStreetLife } from '../../src/world/expanse-street-life.js';
import { PROPS } from '../../src/world/data/props.js';
import {
  EXPANSE_PROP_FAMILIES,
  EXPANSE_PROP_SEED,
  expansePropClearanceIssues,
  generateExpanseProps,
  selectExpanseProps,
} from '../../src/world/expanse-props.js';

let failures = 0;
function check(label, ok, detail = '') {
  const pass = !!ok;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

function countsBy(records, key) {
  return Object.fromEntries([...new Set(records.map((record) => record[key]))].sort()
    .map((value) => [value, records.filter((record) => record[key] === value).length]));
}

const layout = generateExpanseLayout();
const shops = generateExpanseShops(layout);
const streetLife = generateExpanseStreetLife(layout);
const first = generateExpanseProps(layout, shops, streetLife, EXPANSE_PROP_SEED);
const second = generateExpanseProps(layout, shops, streetLife, EXPANSE_PROP_SEED);
const placements = first.placements;
const mobile = selectExpanseProps(placements, 0.3);

const stable = (records) => records.map(({
  id, key, body, x, y, z, yaw, district, chunkId, clusterId, selectionScore,
}) => [
  id, key, body, +x.toFixed(5), y, +z.toFixed(5), +yaw.toFixed(5),
  district, chunkId, clusterId, +selectionScore.toFixed(6),
]);
const hash = crypto.createHash('sha256').update(JSON.stringify(stable(placements))).digest('hex');
const expectedHash = 'd548a522e1f77ce7a8d6ae6430e129ec6dde011af557970e2729a1163a274686';

check('fixed seed produces the exact review-slice hash', hash === expectedHash, hash);
check('repeated generation is byte-deterministic',
  JSON.stringify(stable(placements)) === JSON.stringify(stable(second.placements)));
check('review slice stays inside the 25–40 placement approval gate',
  placements.length >= 25 && placements.length <= 40, `${placements.length} placements`);
check('authored candidates all pass instead of being silently retained as intrusions',
  first.rejected.length === 0, JSON.stringify(first.rejected.slice(0, 3)));
check('review slice covers Station, Hongdae and Hangang only',
  JSON.stringify([...new Set(placements.map((placement) => placement.district))].sort())
    === JSON.stringify(['hangang', 'hongdae', 'station']));
check('review slice is owned by three existing 4 × 3 visual chunks',
  new Set(placements.map((placement) => placement.chunkId)).size === 3
    && placements.every((placement) => first.grid.chunks.some((chunk) => chunk.id === placement.chunkId)),
  JSON.stringify(countsBy(placements, 'chunkId')));

const accepted = [];
const intrusions = [];
for (const placement of placements) {
  const issues = expansePropClearanceIssues(placement, layout, shops, streetLife, accepted);
  if (issues.length) intrusions.push(`${placement.id}:${issues.join(',')}`);
  accepted.push(placement);
}
check('zero road, river, building, shop-path, delivery, spawn, bridge or tunnel intrusions',
  intrusions.length === 0, intrusions.slice(0, 4).join('; '));

const catalog = JSON.parse(fs.readFileSync(new URL('../../public/assets/props/catalog.json', import.meta.url), 'utf8'));
const catalogByKey = new Map();
for (const pack of catalog.packs) for (const prop of pack.props) {
  catalogByKey.set(`${pack.id}:${prop.index}`, { pack, prop });
}
const usedKeys = [...new Set(placements.map((placement) => placement.key))];
check('slice uses no more than eight prop families', usedKeys.length <= 8, `${usedKeys.length} families`);
check('every prop key resolves to a shipped catalog node', usedKeys.every((key) => {
  const entry = catalogByKey.get(key);
  return entry?.pack?.url && entry?.prop?.node;
}), usedKeys.join(', '));
check('pure safety footprints match the catalog metre sizes', usedKeys.every((key) => {
  const expected = EXPANSE_PROP_FAMILIES[key]?.size;
  const actual = catalogByKey.get(key)?.prop?.size;
  return expected?.length === actual?.length
    && expected.every((value, index) => Math.abs(value - actual[index]) < 1e-5);
}));
check('static/dynamic/decor policy matches authored prop metadata', placements.every((placement) =>
  PROPS[placement.key]?.body === placement.body
  && (placement.body === 'decor'
    ? placement.collisionWorld === 'none'
    : placement.collisionWorld === 'prop')),
JSON.stringify(countsBy(placements, 'body')));
check('no dynamic prop is assigned to the city BVH/raycast path', placements.every((placement) =>
  placement.body !== 'dynamic' || placement.collisionWorld === 'prop'));

const byId = new Map(placements.map((placement) => [placement.id, placement]));
check('mobile is a deterministic unscaled subset of desktop',
  mobile.length === 8 && mobile.every((placement) => byId.get(placement.id) === placement),
  `${mobile.length}/${placements.length}`);
check('mobile subset preserves every review cluster',
  new Set(mobile.map((placement) => placement.clusterId)).size === 3,
  JSON.stringify(countsBy(mobile, 'clusterId')));

console.log(`\nexpanse props (${first.stage}): ${placements.length} desktop, ${mobile.length} mobile`);
console.log(`districts ${JSON.stringify(countsBy(placements, 'district'))}`);
console.log(`chunks ${JSON.stringify(countsBy(placements, 'chunkId'))}`);
console.log(`types ${JSON.stringify(countsBy(placements, 'key'))}`);
console.log(`bodies ${JSON.stringify(countsBy(placements, 'body'))}`);
if (failures) process.exit(1);
