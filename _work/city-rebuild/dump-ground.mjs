// Throwaway QA: inventory of all materials + flat ground-level primitives in
// the repaired Buildings IV GLB. Run: node _work/city-rebuild/dump-ground.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { CITY_SCALE } from '../../src/world/city-constants.js';

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
const mats = new Map(); // name -> { prims, verts }
const flat = []; // primitives whose y range is thin and near ground

scene.traverse((node) => {
  const mesh = node.getMesh();
  if (!mesh) return;
  const world = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMode() !== 4) continue;
    const matName = prim.getMaterial()?.getName() || '(none)';
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const e = mats.get(matName) || { prims: 0, verts: 0 };
    e.prims++; e.verts += pos.getCount();
    mats.set(matName, e);

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
    const ySpan = max[1] - min[1];
    const xzArea = (max[0] - min[0]) * (max[2] - min[2]);
    if (ySpan < 0.35 && min[1] < 0.6 && xzArea > 4) {
      flat.push({ node: node.getName(), mat: matName, verts: pos.getCount(), min, max });
    }
  }
});

console.log('== materials ==');
for (const [name, e] of [...mats.entries()].sort((a, b) => b[1].verts - a[1].verts)) {
  console.log(`${name}: ${e.prims} prims, ${e.verts} verts`);
}

console.log('\n== flat ground-level primitives (ySpan<0.35, minY<0.6, area>4 m^2) ==');
flat.sort((a, b) => (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]) - (a.max[0] - a.min[0]) * (a.max[2] - a.min[2]));
for (const r of flat) {
  console.log(
    `${r.node} [${r.mat}] v=${r.verts}  x ${r.min[0].toFixed(2)}..${r.max[0].toFixed(2)}  ` +
    `y ${r.min[1].toFixed(2)}..${r.max[1].toFixed(2)}  z ${r.min[2].toFixed(2)}..${r.max[2].toFixed(2)}`
  );
}
