// Throwaway QA: dump world-space bounds of every road-material primitive in the
// repaired Buildings IV GLB, so the street constants in city-constants.js can be
// checked against reality. Run: node _work/city-rebuild/dump-roads.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { CITY_SCALE, ROAD_MAT_RE } from '../../src/world/city-constants.js';

const input = 'public/assets/world/city.glb';

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

const el = [0, 0, 0];
const p = [0, 0, 0];
const rows = [];

scene.traverse((node) => {
  const mesh = node.getMesh();
  if (!mesh) return;
  const world = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMode() !== 4) continue;
    const matName = prim.getMaterial()?.getName() || '';
    if (!ROAD_MAT_RE.test(matName)) continue;
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, el);
      transformPoint(world, el[0], el[1], el[2], p);
      for (let k = 0; k < 3; k++) {
        const v = p[k] * CITY_SCALE;
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
    rows.push({ node: node.getName(), mat: matName, min, max });
  }
});

const f = (v) => v.map((n) => +n.toFixed(2)).join(', ');
for (const r of rows) {
  console.log(
    `${r.node} [${r.mat}]  x ${r.min[0].toFixed(2)}..${r.max[0].toFixed(2)}  ` +
    `y ${r.min[1].toFixed(2)}..${r.max[1].toFixed(2)}  z ${r.min[2].toFixed(2)}..${r.max[2].toFixed(2)}`
  );
}
console.log(`\n${rows.length} road primitives (world metres, scale ${CITY_SCALE})`);

// Also dump the overall geometry bounds (non-fog) for tile footprint reference.
const all = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
scene.traverse((node) => {
  const mesh = node.getMesh();
  if (!mesh) return;
  if (/^fog/i.test(node.getName() || '') || /^fog/i.test(mesh.getName() || '')) return;
  const world = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMode() !== 4) continue;
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, el);
      transformPoint(world, el[0], el[1], el[2], p);
      for (let k = 0; k < 3; k++) {
        const v = p[k] * CITY_SCALE;
        if (v < all.min[k]) all.min[k] = v;
        if (v > all.max[k]) all.max[k] = v;
      }
    }
  }
});
console.log(`geometry bounds  min [${f(all.min)}]  max [${f(all.max)}]`);
