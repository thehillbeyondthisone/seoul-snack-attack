// Normalize a static authored city before texture and mesh compression.
// Usage: node tools/prepare-city.mjs <input.glb> <output.glb>
//
// Raw Sketchfab/Blender exports commonly contain hundreds of sibling meshes
// and cloned materials. Meshopt makes those bytes smaller but does not reduce
// draw calls, so the browser still has to compile and submit every fragment on
// the first frame. This pass keeps the default scene only, removes known
// non-playable blockers, then flattens and joins compatible static geometry.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, prune } from '@gltf-transform/functions';
import { statSync } from 'node:fs';
import { FOG_MESH_RE, isClipped } from '../src/world/city-constants.js';

const [, , input, output] = process.argv;
if (!input || !output) throw new Error('usage: node tools/prepare-city.mjs <input.glb> <output.glb>');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const root = document.getRoot();
const scene = root.getDefaultScene() || root.listScenes()[0];
if (!scene) throw new Error(`${input} has no scene`);

for (const candidate of root.listScenes()) {
  if (candidate !== scene) candidate.dispose();
}

const removed = [];
scene.traverse((node) => {
  const name = node.getName() || '';
  const meshName = node.getMesh()?.getName() || '';
  if (isClipped(name) || FOG_MESH_RE.test(name) || FOG_MESH_RE.test(meshName)) removed.push(node);
});
for (const node of removed) node.dispose();

const before = {
  nodes: root.listNodes().length,
  meshes: root.listMeshes().length,
  materials: root.listMaterials().length,
};

await document.transform(
  dedup(),
  flatten(),
  join({ keepNamed: false }),
  prune(),
);

const after = {
  nodes: root.listNodes().length,
  meshes: root.listMeshes().length,
  materials: root.listMaterials().length,
};
await io.write(output, document);

const mb = (file) => `${(statSync(file).size / 1e6).toFixed(1)}MB`;
console.log(
  `prepared city: removed ${removed.length} nodes; ` +
  `${before.nodes}->${after.nodes} nodes, ${before.meshes}->${after.meshes} meshes, ` +
  `${before.materials}->${after.materials} materials\n` +
  `  ${output}: ${mb(output)} (input was ${mb(input)})`
);
