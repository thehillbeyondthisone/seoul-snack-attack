// Measure the Seoul block: rasterize its top surface and print an ASCII map
// plus the numbers src/world/city-constants.js needs.
//
// Run: node _work/city-rebuild/seoul-measure.mjs [input.glb]
// Default input: public/assets/world/seoul-block.glb
//
// Coordinates are printed in WORLD metres (authored units x CITY_SCALE), which
// is the space city-constants.js is written in. North (-z) is at the top.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { CITY_SCALE } from '../../src/world/city-constants.js';

const input = process.argv[2] || 'public/assets/world/seoul-block.glb';
const M_PER_CELL = 1.0;

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(input);
const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];

function transformPoint(m, x, y, z, out) {
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
}

// Seoul block material names (see ATTRIBUTION.md — hand-built Blender export).
const ROAD = /^real road$/i;
const PAVE = /^(concrete_pavement(\.\d+)?|tiles2?|Material\.010)$/i;

// 0 void | 1 asphalt | 2 pavement | 3 low furniture | 4 building
function classify(matName, y) {
  if (ROAD.test(matName)) return 1;
  if (PAVE.test(matName)) return 2;
  if (y < 2.0 * CITY_SCALE) return 3;
  return 4;
}

const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
const el = [0, 0, 0];
const p = [0, 0, 0];
const items = [];
const matBounds = new Map(); // material -> world box

scene.traverse((node) => {
  const mesh = node.getMesh();
  if (!mesh) return;
  if (/^fog/i.test(node.getName() || '') || /^fog/i.test(mesh.getName() || '')) return;
  const world = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMode() !== 4) continue;
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const matName = prim.getMaterial()?.getName() || '';
    items.push({ pos, idx: prim.getIndices(), world, matName });
    let mb = matBounds.get(matName);
    if (!mb) matBounds.set(matName, mb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, el);
      transformPoint(world, el[0], el[1], el[2], p);
      for (let k = 0; k < 3; k++) {
        const v = p[k] * CITY_SCALE;
        if (v < bounds.min[k]) bounds.min[k] = v;
        if (v > bounds.max[k]) bounds.max[k] = v;
        if (v < mb.min[k]) mb.min[k] = v;
        if (v > mb.max[k]) mb.max[k] = v;
      }
    }
  }
});

const W = Math.ceil((bounds.max[0] - bounds.min[0]) / M_PER_CELL);
const H = Math.ceil((bounds.max[2] - bounds.min[2]) / M_PER_CELL);
const x0 = bounds.min[0];
const z0 = bounds.min[2];

const topY = new Float32Array(W * H).fill(-Infinity);
const cls = new Uint8Array(W * H);
const va = [0, 0, 0], vb = [0, 0, 0], vc = [0, 0, 0];

for (const { pos, idx, world, matName } of items) {
  const count = idx ? idx.getCount() : pos.getCount();
  for (let i = 0; i + 2 < count; i += 3) {
    const tri = [va, vb, vc];
    for (let k = 0; k < 3; k++) {
      const ix = idx ? idx.getScalar(i + k) : i + k;
      pos.getElement(ix, el);
      transformPoint(world, el[0], el[1], el[2], tri[k]);
      tri[k][0] *= CITY_SCALE; tri[k][1] *= CITY_SCALE; tri[k][2] *= CITY_SCALE;
    }
    const minPx = Math.max(0, Math.floor((Math.min(va[0], vb[0], vc[0]) - x0) / M_PER_CELL));
    const maxPx = Math.min(W - 1, Math.ceil((Math.max(va[0], vb[0], vc[0]) - x0) / M_PER_CELL));
    const minPz = Math.max(0, Math.floor((Math.min(va[2], vb[2], vc[2]) - z0) / M_PER_CELL));
    const maxPz = Math.min(H - 1, Math.ceil((Math.max(va[2], vb[2], vc[2]) - z0) / M_PER_CELL));
    if (minPx > maxPx || minPz > maxPz) continue;

    const c = classify(matName, Math.max(va[1], vb[1], vc[1]));
    const d = (vb[2] - vc[2]) * (va[0] - vc[0]) + (vc[0] - vb[0]) * (va[2] - vc[2]);
    if (Math.abs(d) < 1e-9) continue; // vertical triangle — no top-down area
    for (let pz = minPz; pz <= maxPz; pz++) {
      const z = z0 + (pz + 0.5) * M_PER_CELL;
      for (let px = minPx; px <= maxPx; px++) {
        const x = x0 + (px + 0.5) * M_PER_CELL;
        const w0 = ((vb[2] - vc[2]) * (x - vc[0]) + (vc[0] - vb[0]) * (z - vc[2])) / d;
        const w1 = ((vc[2] - va[2]) * (x - vc[0]) + (va[0] - vc[0]) * (z - vc[2])) / d;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
        const y = w0 * va[1] + w1 * vb[1] + w2 * vc[1];
        const o = pz * W + px;
        if (y > topY[o]) { topY[o] = y; cls[o] = c; }
      }
    }
  }
}

const GLYPH = ['.', '#', ':', 'o', 'B']; // void, asphalt, pavement, furniture, building

console.log(`\ninput: ${input}   CITY_SCALE=${CITY_SCALE}`);
console.log(`world bounds  x ${bounds.min[0].toFixed(2)} .. ${bounds.max[0].toFixed(2)}   `
  + `y ${bounds.min[1].toFixed(2)} .. ${bounds.max[1].toFixed(2)}   `
  + `z ${bounds.min[2].toFixed(2)} .. ${bounds.max[2].toFixed(2)}`);
console.log(`size ${(bounds.max[0] - bounds.min[0]).toFixed(2)} x ${(bounds.max[2] - bounds.min[2]).toFixed(2)} m\n`);

console.log('  # asphalt   : pavement   o furniture   B building   . void');
console.log('  north (-z) at top; columns are world X, rows world Z\n');
// X ruler every 5 m
let ruler = '      ';
for (let px = 0; px < W; px++) {
  const x = Math.round(x0 + px);
  ruler += (x % 10 === 0) ? '|' : ' ';
}
console.log(ruler);
for (let pz = 0; pz < H; pz++) {
  let row = '';
  for (let px = 0; px < W; px++) row += GLYPH[cls[pz * W + px]];
  console.log(`z${(z0 + pz).toFixed(0).padStart(4)} ${row}`);
}

// ---- Drivable corridor: contiguous asphalt runs per Z row ------------------
console.log('\n--- asphalt runs per Z row (world metres) ---');
for (let pz = 0; pz < H; pz++) {
  const runs = [];
  let start = -1;
  for (let px = 0; px <= W; px++) {
    const isRoad = px < W && cls[pz * W + px] === 1;
    if (isRoad && start < 0) start = px;
    if (!isRoad && start >= 0) { runs.push([x0 + start, x0 + px]); start = -1; }
  }
  if (runs.length) {
    console.log(`z ${(z0 + pz).toFixed(1).padStart(7)}  ` +
      runs.map(([a, b]) => `x ${a.toFixed(1)}..${b.toFixed(1)} (${(b - a).toFixed(1)}m)`).join('   '));
  }
}

console.log('\n--- world bounds per material (ground-ish only) ---');
for (const [name, b] of [...matBounds].sort()) {
  if (!ROAD.test(name) && !PAVE.test(name)) continue;
  console.log(`${name.padEnd(24)} x ${b.min[0].toFixed(2).padStart(8)} .. ${b.max[0].toFixed(2).padStart(7)}   `
    + `z ${b.min[2].toFixed(2).padStart(8)} .. ${b.max[2].toFixed(2).padStart(7)}   y ${b.min[1].toFixed(2)}`);
}
