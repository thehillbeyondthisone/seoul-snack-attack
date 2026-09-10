// Inspect a GLB the way the game will see it: world bbox, tris, materials.
//   node tools/blender/inspect.mjs <file.glb> [--json]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const isCli = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

const xf = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

export async function inspectGlb(filePath) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(filePath);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const box = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
  let tris = 0;
  const nodes = [];

  const walk = (node, depth) => {
    const m = node.getWorldMatrix();
    const mesh = node.getMesh();
    let nodeTris = 0;
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const arr = prim.getAttribute('POSITION').getArray();
        const idx = prim.getIndices();
        nodeTris += (idx ? idx.getCount() : arr.length / 3) / 3;
        for (let i = 0; i < arr.length / 3; i++) {
          const w = xf(m, arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
          for (let k = 0; k < 3; k++) {
            if (w[k] < box.min[k]) box.min[k] = w[k];
            if (w[k] > box.max[k]) box.max[k] = w[k];
          }
        }
      }
    }
    tris += nodeTris;
    nodes.push({
      name: node.getName() || '<anon>',
      depth,
      tris: nodeTris,
      materials: mesh
        ? [...new Set(mesh.listPrimitives().map((p) => p.getMaterial()?.getName()).filter(Boolean))]
        : [],
    });
    for (const child of node.listChildren()) walk(child, depth + 1);
  };
  for (const n of scene.listChildren()) walk(n, 0);

  const size = box.min.map((v, k) => box.max[k] - v);
  const largest = Math.max(...size);
  return {
    file: filePath,
    bytes: statSync(filePath).size,
    tris,
    materials: root.listMaterials().map((m) => m.getName()),
    nodes,
    bbox: { min: box.min, max: box.max, size },
    largest,
    cameras: root.listCameras().length,
    lights: root.listExtensionsUsed().includes('KHR_lights_punctual') ? 'KHR_lights_punctual' : 0,
  };
}

if (isCli) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node tools/blender/inspect.mjs <file.glb> [--json]');
    process.exit(1);
  }
  const asJson = process.argv.includes('--json');
  const report = await inspectGlb(file);
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const n of report.nodes) {
      const pad = '  '.repeat(n.depth);
      const mats = n.materials.length ? ` mats=${n.materials.join('|')}` : '';
      console.log(`${pad}${n.name} tris=${n.tris}${mats}`);
    }
    const fmt = (a) => a.map((v) => +v.toFixed(4));
    console.log(`\nbytes=${report.bytes} tris=${report.tris}`);
    console.log('bbox min', fmt(report.bbox.min), 'max', fmt(report.bbox.max));
    console.log('size', fmt(report.bbox.size), 'largest', +report.largest.toFixed(4));
    console.log('materials:', report.materials.join(', ') || '(none)');
    console.log('cameras:', report.cameras);
  }
}
