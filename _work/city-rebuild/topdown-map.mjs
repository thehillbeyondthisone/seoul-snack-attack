// Throwaway QA: rasterize a top-down classified map of the repaired
// Buildings IV GLB to PNG. Run: node _work/city-rebuild/topdown-map.mjs
// Output: _work/city-rebuild/topdown.png  (0.25 m/px, north = -z at top)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { CITY_SCALE } from '../../src/world/city-constants.js';

const input = 'public/assets/world/city.glb';
const output = '_work/city-rebuild/topdown.png';
const M_PER_PX = 0.12;
const PAD = 5; // metres of margin around the geometry

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

// class: 0 = void, 1 = asphalt, 2 = pavement/curb, 3 = low street furniture,
// 4 = low building, 5 = tall building
function classify(matName, y) {
  const n = matName.toLowerCase();
  if (/^road(\.\d+)?$/.test(n)) return 1;
  if (n === 'road2') return 1;
  if (n === 'curb' || n === 'sidewalk') return 2;
  if (y < 2.0) return 3;
  if (y < 9.0) return 4;
  return 5;
}

// Pass 1: world bounds.
const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
const el = [0, 0, 0];
const p = [0, 0, 0];
const items = [];
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
    const idx = prim.getIndices();
    items.push({ pos, idx, world, matName });
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, el);
      transformPoint(world, el[0], el[1], el[2], p);
      for (let k = 0; k < 3; k++) {
        const v = p[k] * CITY_SCALE;
        if (v < bounds.min[k]) bounds.min[k] = v;
        if (v > bounds.max[k]) bounds.max[k] = v;
      }
    }
  }
});

const W = Math.ceil((bounds.max[0] - bounds.min[0] + 2 * PAD) / M_PER_PX);
const H = Math.ceil((bounds.max[2] - bounds.min[2] + 2 * PAD) / M_PER_PX);
const x0 = bounds.min[0] - PAD;
const z0 = bounds.min[2] - PAD;
console.log(`grid ${W}x${H}px  origin x0=${x0.toFixed(2)} z0=${z0.toFixed(2)}`);

const topY = new Float32Array(W * H).fill(-Infinity);
const cls = new Uint8Array(W * H);

const va = [0, 0, 0];
const vb = [0, 0, 0];
const vc = [0, 0, 0];
let tris = 0;

for (const { pos, idx, world, matName } of items) {
  const count = idx ? idx.getCount() : pos.getCount();
  for (let i = 0; i + 2 < count; i += 3) {
    const ia = idx ? idx.getScalar(i) : i;
    const ib = idx ? idx.getScalar(i + 1) : i + 1;
    const ic = idx ? idx.getScalar(i + 2) : i + 2;
    pos.getElement(ia, el); transformPoint(world, el[0], el[1], el[2], va);
    pos.getElement(ib, el); transformPoint(world, el[0], el[1], el[2], vb);
    pos.getElement(ic, el); transformPoint(world, el[0], el[1], el[2], vc);
    va[0] *= CITY_SCALE; va[1] *= CITY_SCALE; va[2] *= CITY_SCALE;
    vb[0] *= CITY_SCALE; vb[1] *= CITY_SCALE; vb[2] *= CITY_SCALE;
    vc[0] *= CITY_SCALE; vc[1] *= CITY_SCALE; vc[2] *= CITY_SCALE;
    tris++;

    // Pixel-space bounds of the XZ footprint.
    const minPx = Math.max(0, Math.floor((Math.min(va[0], vb[0], vc[0]) - x0) / M_PER_PX));
    const maxPx = Math.min(W - 1, Math.ceil((Math.max(va[0], vb[0], vc[0]) - x0) / M_PER_PX));
    const minPz = Math.max(0, Math.floor((Math.min(va[2], vb[2], vc[2]) - z0) / M_PER_PX));
    const maxPz = Math.min(H - 1, Math.ceil((Math.max(va[2], vb[2], vc[2]) - z0) / M_PER_PX));
    if (minPx > maxPx || minPz > maxPz) continue;

    const yMax = Math.max(va[1], vb[1], vc[1]);
    const c = classify(matName, yMax);

    // Barycentric point-in-triangle on XZ, y by plane interpolation.
    const d = (vb[2] - vc[2]) * (va[0] - vc[0]) + (vc[0] - vb[0]) * (va[2] - vc[2]);
    if (Math.abs(d) < 1e-9) continue; // vertical triangle — no top-down area
    for (let pz = minPz; pz <= maxPz; pz++) {
      const z = z0 + (pz + 0.5) * M_PER_PX;
      for (let px = minPx; px <= maxPx; px++) {
        const x = x0 + (px + 0.5) * M_PER_PX;
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

console.log(`${tris} triangles rasterized`);

// Colors per class; brightness bumps with height for structures.
const COLORS = [
  [18, 18, 22],    // 0 void
  [52, 56, 66],    // 1 asphalt
  [150, 148, 140], // 2 pavement
  [90, 170, 90],   // 3 street furniture (green so signs/AC pop)
  [190, 160, 110], // 4 low building
  [230, 200, 140], // 5 tall building
];
const img = Buffer.alloc(W * H * 3);
for (let o = 0; o < W * H; o++) {
  const c = COLORS[cls[o]];
  img[o * 3] = c[0]; img[o * 3 + 1] = c[1]; img[o * 3 + 2] = c[2];
}
await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toFile(output);
console.log(`${output} written  (${((bounds.max[0] - bounds.min[0])).toFixed(1)} x ${(bounds.max[2] - bounds.min[2]).toFixed(1)} m + ${PAD} m pad)`);
