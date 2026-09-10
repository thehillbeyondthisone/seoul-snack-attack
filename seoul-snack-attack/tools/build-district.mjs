// Build the two owner-supplied district dressing packs into compact runtime GLBs.
// The Asian shop OBJ becomes the authored delivery storefront. The FFVII STL
// is a decorative retro-game diorama only; it never participates in collision.
import { Document, NodeIO } from '@gltf-transform/core';
import obj2gltf from 'obj2gltf';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SHOP_DIR = path.resolve('_source-assets/district/storefronts');
const SHOP_OBJ = path.join(SHOP_DIR, '2f603ad8d5c640f7b9794f6916f9fbdd.obj');
const DIORAMA_STL = path.resolve(
  '_source-assets/district/retro-arcade/c996be0e881e41128c622d5045ebea60.stl'
);
const OUT_DIR = path.resolve('public/assets/district');
const TMP_DIR = path.join(OUT_DIR, '.tmp');

mkdirSync(TMP_DIR, { recursive: true });

function optimize(raw, name, textureSize) {
  const webp = path.join(TMP_DIR, `${name}.webp.glb`);
  const out = path.join(OUT_DIR, `${name}.glb`);
  execFileSync(process.execPath, ['tools/optimize.mjs', raw, webp, String(textureSize)], { stdio: 'inherit' });
  execFileSync(process.execPath, ['tools/meshopt.mjs', webp, out], { stdio: 'inherit' });
  console.log(`${path.relative('.', out)}: ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}

// obj2gltf resolves the MTL and its space-containing texture filenames relative
// to the OBJ, which is more reliable than rewriting this particular export.
const shopRaw = path.join(TMP_DIR, 'storefronts.raw.glb');
writeFileSync(shopRaw, await obj2gltf(SHOP_OBJ, { binary: true }));
optimize(shopRaw, 'storefronts', 1024);

function readBinarySTL(file) {
  const src = readFileSync(file);
  const count = src.readUInt32LE(80);
  if (84 + count * 50 > src.length) throw new Error(`Invalid binary STL: ${file}`);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let tri = 0, off = 84; tri < count; tri++, off += 50) {
    for (let corner = 0; corner < 3; corner++) {
      for (let axis = 0; axis < 3; axis++) {
        const v = src.readFloatLE(off + 12 + corner * 12 + axis * 4);
        min[axis] = Math.min(min[axis], v);
        max[axis] = Math.max(max[axis], v);
      }
    }
  }

  // Normalize to a 1 m-high asset, centred on XZ with its base at Y=0. Runtime
  // placement can then choose an intuitive height without inheriting STL units.
  const scale = 1 / Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const centreX = (min[0] + max[0]) * 0.5;
  const centreZ = (min[2] + max[2]) * 0.5;
  const position = new Float32Array(count * 9);
  const normal = new Float32Array(count * 9);

  for (let tri = 0, off = 84; tri < count; tri++, off += 50) {
    let nx = src.readFloatLE(off);
    let ny = src.readFloatLE(off + 4);
    let nz = src.readFloatLE(off + 8);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    for (let corner = 0; corner < 3; corner++) {
      const dst = tri * 9 + corner * 3;
      position[dst] = (src.readFloatLE(off + 12 + corner * 12) - centreX) * scale;
      position[dst + 1] = (src.readFloatLE(off + 16 + corner * 12) - min[1]) * scale;
      position[dst + 2] = (src.readFloatLE(off + 20 + corner * 12) - centreZ) * scale;
      normal[dst] = nx; normal[dst + 1] = ny; normal[dst + 2] = nz;
    }
  }
  return { position, normal, triangles: count };
}

const stl = readBinarySTL(DIORAMA_STL);
const doc = new Document();
const buffer = doc.createBuffer();
const material = doc.createMaterial('retro-arcade-diorama')
  .setBaseColorFactor([0.055, 0.12, 0.16, 1])
  .setEmissiveFactor([0.01, 0.12, 0.15])
  .setMetallicFactor(0.62)
  .setRoughnessFactor(0.32)
  .setDoubleSided(true);
const primitive = doc.createPrimitive()
  .setAttribute('POSITION', doc.createAccessor('position').setType('VEC3').setArray(stl.position).setBuffer(buffer))
  .setAttribute('NORMAL', doc.createAccessor('normal').setType('VEC3').setArray(stl.normal).setBuffer(buffer))
  .setMaterial(material);
const mesh = doc.createMesh('retro-arcade-diorama').addPrimitive(primitive);
doc.createScene('retro-arcade-diorama').addChild(doc.createNode('retro-arcade-diorama').setMesh(mesh));

const dioramaRaw = path.join(TMP_DIR, 'retro-arcade-diorama.raw.glb');
await new NodeIO().write(dioramaRaw, doc);
optimize(dioramaRaw, 'retro-arcade-diorama', 256);

rmSync(TMP_DIR, { recursive: true, force: true });
console.log(`district dressing built: storefront + ${stl.triangles} triangle diorama`);
