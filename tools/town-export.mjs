// Export 밤내 Bamnae's terrain, water and roads as OBJ, for Blender.
//
// The same `town-ground.js` builders the runtime and the preview use, written
// out as geometry. Nothing is re-modelled for the export — if you open this in
// Blender you are looking at the game's height field, not an impression of it.
//
//   node tools/town-export.mjs
//
// Writes _work/town/town.obj + town.mtl. Blender: File > Import > Wavefront.
// Y-up, metres, north is -Z, so Blender's own -Y-forward import lands it the
// right way round.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTownTerrain } from '../src/world/town-terrain.js';
import { buildTownSurfaces } from '../src/world/town-ground.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', '_work', 'town');
const objPath = resolve(outDir, 'town.obj');
const mtlPath = resolve(outDir, 'town.mtl');

const terrain = createTownTerrain();
const surfaces = buildTownSurfaces(terrain);

// Blender is Z-up; the game is Y-up with north at -Z. Mapping (x, y, z) to
// (x, z, y) puts north along -Y in Blender, which is Blender's own "forward",
// so the default front view looks at the town from the south — the same way
// round as the plan drawing.
// CLAY. One material for the whole landform, on purpose.
//
// The first version banded terrain by height and slope — valley, paddy,
// hillside, mountain, rock — and every boundary chased the micro-relief, so
// the render came back in zebra stripes that told you nothing about the shape
// and quite a lot about where 9 m happened to fall. A landform is judged the
// way a model-maker judges one: single matte colour, raking light, look at the
// silhouette. Colour belongs in the game, where it will come from the bible.
const MATERIALS = [
  ['land', 0.62, 0.60, 0.55],
  ['water', 0.16, 0.42, 0.52],
  ['asphalt', 0.42, 0.43, 0.46],
  ['track', 0.52, 0.45, 0.34],
  ['bridge', 0.70, 0.64, 0.46],
];

const lines = [];
lines.push('# 밤내 Bamnae — exported from src/world/town-ground.js');
lines.push(`# ${new Date().toISOString().slice(0, 10)}`);
lines.push('mtllib town.mtl');

let vertexBase = 0;

/** Emit one indexed mesh, splitting faces into groups by material. */
function emit(name, positions, indices, faceMaterial) {
  lines.push(`o ${name}`);
  const count = positions.length / 3;
  for (let i = 0; i < count; i++) {
    // y and z swap: game Y-up -> Blender Z-up.
    lines.push(`v ${positions[i * 3].toFixed(3)} ${positions[i * 3 + 2].toFixed(3)} ${positions[i * 3 + 1].toFixed(3)}`);
  }
  const byMaterial = new Map();
  for (let f = 0; f < indices.length; f += 3) {
    const material = faceMaterial(indices[f], indices[f + 1], indices[f + 2]);
    let list = byMaterial.get(material);
    if (!list) byMaterial.set(material, (list = []));
    list.push(f);
  }
  for (const [material, faces] of byMaterial) {
    lines.push(`usemtl ${material}`);
    for (const f of faces) {
      // OBJ is 1-indexed, and winding flips with the Y/Z swap.
      const a = vertexBase + indices[f] + 1;
      const b = vertexBase + indices[f + 1] + 1;
      const c = vertexBase + indices[f + 2] + 1;
      lines.push(`f ${a} ${c} ${b}`);
    }
  }
  vertexBase += count;
}

// ---- terrain ----------------------------------------------------------------
const { positions, indices } = surfaces.ground;
emit('terrain', positions, indices, () => 'land');

emit('water', surfaces.water.positions, surfaces.water.indices, () => 'water');

for (const road of surfaces.roads) {
  const material = road.bridge ? 'bridge' : road.kind === 'track' ? 'track' : 'asphalt';
  emit(`road_${road.id}`, road.positions, road.indices, () => material);
}

const mtl = [];
for (const [name, r, g, b] of MATERIALS) {
  mtl.push(`newmtl ${name}`);
  mtl.push(`Kd ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`);
  mtl.push('Ks 0.020 0.020 0.020');
  mtl.push(`d ${name === 'water' ? '0.880' : '1.000'}`);
  mtl.push('illum 2');
  mtl.push('');
}

mkdirSync(outDir, { recursive: true });
writeFileSync(objPath, `${lines.join('\n')}\n`, 'utf8');
writeFileSync(mtlPath, mtl.join('\n'), 'utf8');

const tris = surfaces.ground.indices.length / 3
  + surfaces.water.indices.length / 3
  + surfaces.roads.reduce((s, r) => s + r.indices.length / 3, 0);
console.log(`wrote ${objPath}`);
console.log(`  ${vertexBase.toLocaleString()} verts, ${tris.toLocaleString()} tris, ${MATERIALS.length} materials`);
console.log(`  relief ${surfaces.ground.grid.min.toFixed(1)} m to ${surfaces.ground.grid.max.toFixed(1)} m`);
