// Bake the city's collision geometry to a flat world-space triangle soup.
// Usage: node tools/build-collider.mjs <input.glb> <output.bin>
//
// Why this exists:
//   1. src/world/city.js used to merge ~680k vertices on the MAIN THREAD at
//      every boot. That work is identical on every load — do it once, offline.
//   2. The headless physics bench (tools/bench/) needs real city geometry in
//      node, where three.js's GLTFLoader is awkward to run.
//
// Quantization note: this GLB is meshopt-compressed with KHR_mesh_quantization,
// so POSITION is *normalized* Int16. gltf-transform's Accessor.getElement()
// denormalizes for us (verified against three.js's getX/getY/getZ), and the
// dequantization scale lives in the node transform, which getWorldMatrix()
// includes. Never read accessor .getArray() directly here — that is exactly the
// bug that made the runtime collider garbage.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync, statSync } from 'node:fs';
import {
  CITY_SCALE, FOG_MESH_RE, ROAD_MAT_RE, isClipped, isWestOfRoadSlab,
  TILE_COLS, TILE_ROWS, TILE_REPEATING,
} from '../src/world/city-constants.js';

const [, , input = 'public/assets/world/city.glb', output = 'public/assets/world/city.collider.bin'] = process.argv;

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(input);
const root = doc.getRoot();

/** glTF matrices are column-major; multiply as a point (w=1). */
function transformPoint(m, x, y, z, out) {
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
}

// Collect every mesh-bearing node reachable from the DEFAULT scene, so orphaned
// nodes (which would never render, and so must never collide) are skipped.
// It must be the default scene alone, not every scene: three.js hands
// city.js only `gltf.scene`, and this export carries a second scene holding a
// stray 2 x 1.4 m plane at the origin. Baking that would put a collider under
// the boulevard that nothing draws.
const scene = root.getDefaultScene() || root.listScenes()[0];
if (!scene) throw new Error(`${input} has no scene`);
const nodes = [];
scene.traverse((node) => { if (node.getMesh()) nodes.push(node); });

const el = [0, 0, 0];
const p = [0, 0, 0];

const isFogNode = (node) => {
  const mesh = node.getMesh();
  // Mirror city.js: three.js names split primitives "<mesh>_0", so test both.
  return FOG_MESH_RE.test(node.getName() || '') || FOG_MESH_RE.test(mesh.getName() || '');
};

/** World-space bbox of a node, in METRES (CITY_SCALE applied). */
function nodeBox(node) {
  const world = node.getWorldMatrix();
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], road: false };
  for (const prim of node.getMesh().listPrimitives()) {
    if (prim.getMode() !== 4) continue;
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    if (ROAD_MAT_RE.test(prim.getMaterial()?.getName() || '')) box.road = true;
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, el);
      transformPoint(world, el[0], el[1], el[2], p);
      for (let k = 0; k < 3; k++) {
        const v = p[k] * CITY_SCALE;
        if (v < box.min[k]) box.min[k] = v;
        if (v > box.max[k]) box.max[k] = v;
      }
    }
  }
  return box;
}

// ---- Pass 1: node boxes + the road slab (the tile footprint) --------------
// The asphalt is two planes sharing one material — union both.
const boxes = new Map();
const roadBox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (const node of nodes) {
  if (isFogNode(node)) continue;
  const box = nodeBox(node);
  boxes.set(node, box);
  if (!box.road) continue;
  for (let k = 0; k < 3; k++) {
    if (box.min[k] < roadBox.min[k]) roadBox.min[k] = box.min[k];
    if (box.max[k] > roadBox.max[k]) roadBox.max[k] = box.max[k];
  }
}
if (!Number.isFinite(roadBox.min[0])) {
  throw new Error(`no mesh matched ROAD_MAT_RE in ${input} — cannot derive a tile footprint`);
}

// ---- Pass 2: emit triangles, skipping fog and connector-corridor props ----
// The clip predicate is shared with src/world/city.js. If these two disagree,
// the physics world and the visible city disagree — exactly the class of bug
// this file's header warns about.
const tris = [];
let skipped = 0;
let clipped = 0;
const noFog = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

for (const node of nodes) {
  const mesh = node.getMesh();
  if (isFogNode(node)) { skipped++; continue; }

  const box = boxes.get(node);
  // Boxes here are block-local; the runtime's are world metres. Scale both
  // sides so CLIP_EPSILON is the same distance in both, or the bake and the
  // renderer disagree about the meshes that straddle the slab's western kerb.
  if (
    isClipped(node.getName()) ||
    isWestOfRoadSlab(box.max[0] * CITY_SCALE, roadBox.min[0] * CITY_SCALE)
  ) { clipped++; continue; }
  for (let k = 0; k < 3; k++) {
    if (box.min[k] < noFog.min[k]) noFog.min[k] = box.min[k];
    if (box.max[k] > noFog.max[k]) noFog.max[k] = box.max[k];
  }

  const world = node.getWorldMatrix();

  for (const prim of mesh.listPrimitives()) {
    if (prim.getMode() !== 4) continue; // TRIANGLES only
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;

    const idx = prim.getIndices();
    const count = idx ? idx.getCount() : pos.getCount();

    for (let i = 0; i < count; i++) {
      pos.getElement(idx ? idx.getScalar(i) : i, el);
      transformPoint(world, el[0], el[1], el[2], p);
      // The runtime scales the whole city group; bake it in so the collider is
      // already in the coordinates physics and gameplay actually use.
      tris.push(p[0] * CITY_SCALE, p[1] * CITY_SCALE, p[2] * CITY_SCALE);
    }
  }
}

if (tris.length === 0) throw new Error(`no triangles found in ${input}`);
if (tris.length % 9 !== 0) throw new Error(`vertex count ${tris.length / 3} is not a multiple of 3`);

const data = new Float32Array(tris);
writeFileSync(output, Buffer.from(data.buffer));

// Sidecar so consumers can sanity-check scale/extents without parsing the blob.
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < data.length; i += 3) {
  for (let k = 0; k < 3; k++) {
    if (data[i + k] < min[k]) min[k] = data[i + k];
    if (data[i + k] > max[k]) max[k] = data[i + k];
  }
}
const r3 = (a) => a.map((v) => +v.toFixed(4));
// The tile footprint. Consumers (the bench, prop placement) build the tile grid
// from this without re-parsing the GLB, so it MUST match what src/world/city.js
// computes: the road slab when the block repeats, the whole geometry when it
// does not. See TILE_REPEATING in city-constants.js.
const tileBox = TILE_REPEATING
  ? {
    min: [roadBox.min[0], noFog.min[1], roadBox.min[2]],
    max: [roadBox.max[0], noFog.max[1], roadBox.max[2]],
  }
  : { min: [...noFog.min], max: [...noFog.max] };
const meta = {
  source: input,
  generated: new Date().toISOString(),
  scale: CITY_SCALE,
  triangleCount: data.length / 9,
  vertexCount: data.length / 3,
  meshNodes: nodes.length,
  skippedFogNodes: skipped,
  clippedNodes: clipped,
  bounds: { min: r3(min), max: r3(max) },
  boundsNoFog: { min: r3(noFog.min), max: r3(noFog.max) },
  roadBox: { min: r3(roadBox.min), max: r3(roadBox.max) },
  tileBox: { min: r3(tileBox.min), max: r3(tileBox.max) },
  pitch: [+(tileBox.max[0] - tileBox.min[0]).toFixed(4), +(tileBox.max[2] - tileBox.min[2]).toFixed(4)],
  grid: [TILE_COLS, TILE_ROWS],
};
writeFileSync(output.replace(/\.bin$/, '.json'), JSON.stringify(meta, null, 2));

const mb = (f) => (statSync(f).size / 1e6).toFixed(1) + 'MB';
console.log(
  `${output}: ${mb(output)} — ${meta.triangleCount.toLocaleString()} tris ` +
  `from ${nodes.length} nodes (${skipped} fog, ${clipped} corridor props skipped)\n` +
  `  bounds min [${meta.bounds.min}] max [${meta.bounds.max}]\n` +
  `  tile pitch ${meta.pitch[0]} x ${meta.pitch[1]} m — ` +
  `${TILE_COLS}x${TILE_ROWS} grid = ${(meta.pitch[0] * TILE_COLS).toFixed(1)} x ${(meta.pitch[1] * TILE_ROWS).toFixed(1)} m`
);
