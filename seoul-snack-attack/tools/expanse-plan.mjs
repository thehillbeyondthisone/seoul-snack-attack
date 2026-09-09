// Render the Expanse city plan as a reviewable 2D drawing.
//
// The rebuild ships pictures before it ships geometry: M1 drew the street
// network, M2 adds the blocks those streets enclose and the building lots cut
// from them. Nothing here touches the runtime. Pure Node, writes SVG.
//
//   node tools/expanse-plan.mjs              full city plan
//   node tools/expanse-plan.mjs --streets    street network only (M1 view)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateExpanseLayout, expanseDistrictAt } from '../src/world/expanse-layout.js';
import { generateExpanseStreets } from '../src/world/expanse-streets.js';
import { generateExpanseBlocks } from '../src/world/expanse-blocks.js';

const here = dirname(fileURLToPath(import.meta.url));
const streetsOnly = process.argv.includes('--streets');
const out = resolve(here, '..', '_work',
  streetsOnly ? 'expanse-street-plan.svg' : 'expanse-city-plan.svg');

const SCALE = 1.4;
const PAD = 56;
const CELL = 20;

const INK = {
  page: '#080b12',
  grid: '#161f2c',
  text: '#c9d6e6',
  dim: '#6c8099',
  ring: '#eef4ff',
  arterial: '#a9bdd4',
  street: '#6f8398',
  alley: '#4b5b6e',
  connector: '#7c6f98',
  water: '#123742',
  waterEdge: '#1d5666',
  spawn: '#ffd35c',
  landmark: '#4dc8ff',
  block: '#0d131c',
  blockEdge: '#2b3a4d',
  lot: '#8fa2b8',
  shop: '#d9a24a',
  corner: '#b98f6a',
};

const DISTRICT_TINT = {
  hills: '#22303a', hongdae: '#33202c', station: '#1f2f28',
  market: '#312416', hangang: '#1b2a33', pocha: '#31211c',
};
const DISTRICT_LABEL = {
  hills: '북악 · HILLS', hongdae: '홍대 · HONGDAE', station: '서울역 · STATION',
  market: '시장 · MARKET', hangang: '한강 · HANGANG', pocha: '포차골목 · POCHA',
};
const CLASS_INK = {
  ring: INK.ring, arterial: INK.arterial, street: INK.street,
  alley: INK.alley, connector: INK.connector,
};

const layout = generateExpanseLayout();
const streets = generateExpanseStreets(layout);
const city = streetsOnly ? null : generateExpanseBlocks(streets);
const { bounds, stats } = streets;

const worldW = bounds.maxX - bounds.minX;
const worldH = bounds.maxZ - bounds.minZ;
const width = Math.round(worldW * SCALE) + PAD * 2;
const height = Math.round(worldH * SCALE) + PAD * 2 + 126;

// North is -Z, so -Z maps to the top of the page with no flip.
const px = (x) => (PAD + (x - bounds.minX) * SCALE).toFixed(1);
const py = (z) => (PAD + (z - bounds.minZ) * SCALE).toFixed(1);
const poly = (points) => points.map((p) => `${px(p.x)},${py(p.z)}`).join(' ');

const parts = [];
const push = (s) => parts.push(s);

push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI, Malgun Gothic, sans-serif">`);
push(`<rect width="${width}" height="${height}" fill="${INK.page}"/>`);

// --- district tint, sampled from the live districtAt partition ---------------
push('<g opacity="0.9">');
for (let z = bounds.minZ; z < bounds.maxZ; z += CELL) {
  let runStart = null;
  let runId = null;
  const flush = (endX) => {
    if (runStart === null) return;
    push(`<rect x="${px(runStart)}" y="${py(z)}" width="${((endX - runStart) * SCALE).toFixed(1)}" height="${(CELL * SCALE).toFixed(1)}" fill="${DISTRICT_TINT[runId] || '#161b22'}"/>`);
    runStart = null;
  };
  for (let x = bounds.minX; x < bounds.maxX; x += CELL) {
    const id = expanseDistrictAt(x + CELL / 2, z + CELL / 2).id;
    if (id !== runId) { flush(x); runStart = x; runId = id; }
  }
  flush(bounds.maxX);
}
push('</g>');

push(`<g stroke="${INK.grid}" stroke-width="1" opacity="0.45">`);
for (let x = bounds.minX; x <= bounds.maxX; x += 100) push(`<line x1="${px(x)}" y1="${py(bounds.minZ)}" x2="${px(x)}" y2="${py(bounds.maxZ)}"/>`);
for (let z = bounds.minZ; z <= bounds.maxZ; z += 100) push(`<line x1="${px(bounds.minX)}" y1="${py(z)}" x2="${px(bounds.maxX)}" y2="${py(z)}"/>`);
push('</g>');

const river = streets.river;
push(`<rect x="${px(river.minX)}" y="${py(river.minZ)}" width="${((river.maxX - river.minX) * SCALE).toFixed(1)}" height="${((river.maxZ - river.minZ) * SCALE).toFixed(1)}" fill="${INK.water}" stroke="${INK.waterEdge}" stroke-width="2"/>`);
push(`<text x="${px(river.minX + 24)}" y="${py((river.minZ + river.maxZ) / 2)}" fill="${INK.waterEdge}" font-size="18" letter-spacing="6">한강 · HAN CHANNEL</text>`);

// --- roads, drawn at true paved width ---------------------------------------
for (const streetClass of ['alley', 'street', 'connector', 'arterial', 'ring']) {
  push(`<g stroke="${CLASS_INK[streetClass]}" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
  for (const edge of streets.edges) {
    if ((edge.streetClass || edge.kind) !== streetClass) continue;
    push(`<path d="${edge.points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x)},${py(p.z)}`).join(' ')}" stroke-width="${(edge.width * SCALE).toFixed(1)}"/>`);
  }
  push('</g>');
}

// --- blocks and lots ----------------------------------------------------------
if (city) {
  push(`<g fill="${INK.block}" fill-opacity="0.55" stroke="${INK.blockEdge}" stroke-width="0.8">`);
  for (const block of city.blocks) push(`<polygon points="${poly(block.inset)}"/>`);
  push('</g>');

  push('<g stroke-width="0.35">');
  for (const lot of city.lots) {
    const fill = lot.shop ? INK.shop : INK.lot;
    const opacity = lot.corner ? 0.95 : 0.8;
    push(`<polygon points="${poly(lot.corners)}" fill="${fill}" fill-opacity="${opacity}" stroke="${INK.page}"/>`);
  }
  push('</g>');
}

push(`<g fill="${INK.page}" opacity="0.8">`);
for (const node of streets.nodes) {
  if (!node.skeleton) continue;
  push(`<circle cx="${px(node.position.x)}" cy="${py(node.position.z)}" r="2"/>`);
}
push('</g>');

const labelAt = {
  hills: [-180, -300], hongdae: [-300, -80], station: [-46, -150],
  market: [230, -50], hangang: [-330, 100], pocha: [330, 120],
};
for (const [id, [x, z]] of Object.entries(labelAt)) {
  push(`<text x="${px(x)}" y="${py(z)}" fill="${INK.text}" font-size="15" font-weight="600" opacity="0.55" letter-spacing="2">${DISTRICT_LABEL[id]}</text>`);
}

const landmarkLabel = {
  station: '서울역 STATION HALL', radioTower: '전망탑 RADIO TOWER',
  marketHall: '시장 MARKET HALL', riverPlaza: '강변 RIVER PLAZA',
  pochaRow: '포차 POCHA ROW',
};
for (const [id, point] of Object.entries(streets.landmarks || {})) {
  push(`<circle cx="${px(point.x)}" cy="${py(point.z)}" r="7" fill="none" stroke="${INK.landmark}" stroke-width="2"/>`);
  push(`<text x="${px(point.x + 12)}" y="${py(point.z + 4)}" fill="${INK.landmark}" font-size="12" font-weight="600">${landmarkLabel[id] || id}</text>`);
}
const spawn = streets.spawn.position;
push(`<circle cx="${px(spawn.x)}" cy="${py(spawn.z)}" r="8" fill="none" stroke="${INK.spawn}" stroke-width="2.5"/>`);
push(`<text x="${px(spawn.x + 13)}" y="${py(spawn.z + 4)}" fill="${INK.spawn}" font-size="12" font-weight="700">SPAWN</text>`);

push(`<rect x="${px(bounds.minX)}" y="${py(bounds.minZ)}" width="${(worldW * SCALE).toFixed(1)}" height="${(worldH * SCALE).toFixed(1)}" fill="none" stroke="${INK.dim}" stroke-width="1.5"/>`);
const nx = Number(px(bounds.maxX)) - 40;
const ny = Number(py(bounds.minZ)) + 40;
push(`<path d="M${nx},${ny + 22} L${nx},${ny - 16} M${nx - 7},${ny - 6} L${nx},${ny - 16} L${nx + 7},${ny - 6}" stroke="${INK.text}" stroke-width="2" fill="none"/>`);
push(`<text x="${nx}" y="${ny + 38}" fill="${INK.text}" font-size="13" text-anchor="middle" font-weight="700">N</text>`);

const barY = Number(py(bounds.maxZ)) + 26;
const barX = Number(px(bounds.minX));
push(`<line x1="${barX}" y1="${barY}" x2="${barX + 200 * SCALE}" y2="${barY}" stroke="${INK.text}" stroke-width="2.5"/>`);
for (const t of [0, 100, 200]) push(`<line x1="${barX + t * SCALE}" y1="${barY - 5}" x2="${barX + t * SCALE}" y2="${barY + 5}" stroke="${INK.text}" stroke-width="2"/>`);
push(`<text x="${barX}" y="${barY + 20}" fill="${INK.text}" font-size="12">0</text>`);
push(`<text x="${barX + 200 * SCALE}" y="${barY + 20}" fill="${INK.text}" font-size="12" text-anchor="middle">200 m</text>`);

const title = streetsOnly
  ? '서울 확장 · SEOUL EXPANSE — STREET PLAN (M1)'
  : '서울 확장 · SEOUL EXPANSE — CITY PLAN (M2)';
push(`<text x="${barX}" y="${PAD - 22}" fill="${INK.text}" font-size="20" font-weight="700" letter-spacing="2">${title}</text>`);
push(`<text x="${barX}" y="${PAD - 6}" fill="${INK.dim}" font-size="12">1,000 × 720 m · metres, Y-up, north = −Z · seeds ${streets.seed}/${city ? city.seed : '—'} · roads and lots drawn at true size</text>`);

let legendX = barX + 200 * SCALE + 48;
const legend = [
  ['ring', 'ring 22 m'], ['arterial', 'arterial 12–18 m'],
  ['street', 'street 7–11 m'], ['alley', 'alley 5–5.5 m'],
];
for (const [cls, label] of legend) {
  push(`<line x1="${legendX}" y1="${barY}" x2="${legendX + 22}" y2="${barY}" stroke="${CLASS_INK[cls]}" stroke-width="6" stroke-linecap="round"/>`);
  push(`<text x="${legendX + 28}" y="${barY + 4}" fill="${INK.text}" font-size="12">${label}</text>`);
  legendX += 32 + label.length * 6.4;
}
if (city) {
  for (const [colour, label] of [[INK.shop, 'shop lot'], [INK.lot, 'other lot']]) {
    push(`<rect x="${legendX}" y="${barY - 5}" width="11" height="11" fill="${colour}"/>`);
    push(`<text x="${legendX + 17}" y="${barY + 4}" fill="${INK.text}" font-size="12">${label}</text>`);
    legendX += 24 + label.length * 6.4;
  }
}

const summary = city
  ? [`${stats.nodes} junctions`, `${stats.edges} roads`, `${city.stats.blocks} blocks`,
    `${city.stats.lots} building lots`, `${city.stats.shops} shopfronts`,
    `${stats.pavedKm.toFixed(1)} km paved`]
  : [`${stats.nodes} junctions`, `${stats.edges} roads`, `${stats.blocks} blocks`,
    `${stats.pavedKm.toFixed(1)} km paved`];
push(`<text x="${barX}" y="${barY + 48}" fill="${INK.text}" font-size="13" font-weight="600">${summary.join('   ·   ')}</text>`);

if (city) {
  const per = Object.entries(city.stats.perDistrict)
    .map(([k, v]) => `${k} ${v.blocks}blk/${v.lots}lots`).join('   ');
  push(`<text x="${barX}" y="${barY + 68}" fill="${INK.dim}" font-size="12">${per}</text>`);
  push(`<text x="${barX}" y="${barY + 86}" fill="${INK.dim}" font-size="12">median block ${Math.round(city.stats.medianBlockArea)} m² · median footprint ${Math.round(city.stats.medianFootprint)} m² · built ${(city.stats.builtArea / 1000).toFixed(0)} × 10³ m² · ${city.stats.courtyards} blocks keep a courtyard</text>`);
} else {
  push(`<text x="${barX}" y="${barY + 68}" fill="${INK.dim}" font-size="12">by class:   ${Object.entries(stats.perClass).map(([k, v]) => `${k} ${v}`).join('   ')}</text>`);
}

push('</svg>');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, parts.join('\n'), 'utf8');

// A viewer page beside the drawing. An SVG opened on its own renders at 1:1
// and has to be scrolled, which is useless for reviewing a whole city.
const svgName = out.split(/[\\/]/).pop();
const page = resolve(dirname(out), svgName.replace(/\.svg$/, '.html'));
writeFileSync(page, [
  '<!doctype html><meta charset="utf-8">',
  `<title>${streetsOnly ? 'Expanse street plan' : 'Expanse city plan'}</title>`,
  `<style>html,body{margin:0;background:${INK.page}}img{display:block;width:100vw;height:auto}</style>`,
  `<img src="${svgName}" alt="plan">`,
  '',
].join('\n'), 'utf8');
console.log(`wrote ${out}`);
console.log(`wrote ${page}`);
console.log(summary.join(' · '));
