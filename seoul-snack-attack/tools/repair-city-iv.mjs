// Repair the Buildings IV GLB exported in the downloaded Sketchfab package.
//
// The export flattened one Blender collection into scene-root siblings but
// left that collection's -15 X offset baked into every child. In the reference
// viewer these meshes form the detailed west façade; in the downloaded GLB
// they float 15 authored units away from the road block. Move only root nodes
// beyond the road district's west edge, preserving every relative transform.
//
// Usage: node tools/repair-city-iv.mjs <input.glb> <output.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { statSync } from 'node:fs';

const [, , input, output] = process.argv;
if (!input || !output) {
  throw new Error('usage: node tools/repair-city-iv.mjs <input.glb> <output.glb>');
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const root = document.getRoot();
const scene = root.getDefaultScene() || root.listScenes()[0];
if (!scene) throw new Error(`${input} has no scene`);

for (const candidate of root.listScenes()) {
  if (candidate !== scene) candidate.dispose();
}

const BROKEN_COLLECTION_MAX_X = -10;
const COLLECTION_OFFSET_X = 15;
let moved = 0;
for (const node of scene.listChildren()) {
  const translation = node.getTranslation();
  if (translation[0] >= BROKEN_COLLECTION_MAX_X) continue;
  node.setTranslation([
    translation[0] + COLLECTION_OFFSET_X,
    translation[1],
    translation[2],
  ]);
  moved++;
}

await io.write(output, document);
console.log(
  `repaired Buildings IV: moved ${moved} root nodes +${COLLECTION_OFFSET_X} on X\n` +
  `  ${output}: ${(statSync(output).size / 1e6).toFixed(1)}MB`
);
