// Meshopt-compress a GLB's geometry. Run AFTER tools/optimize.mjs (separate process
// required: @gltf-transform/functions pulls in a nested sharp that conflicts with the
// root sharp's libvips if both load in one process).
// Usage: node tools/meshopt.mjs <input.glb> <output.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

const [, , input, output] = process.argv;

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

const doc = await io.read(input);
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(output, doc);

const mb = (f) => (statSync(f).size / 1e6).toFixed(1) + 'MB';
console.log(`${output}: ${mb(output)} (input was ${mb(input)})`);
