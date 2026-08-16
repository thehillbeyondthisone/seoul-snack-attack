// Proposal preview: rasterize the 7-district contiguous-fabric layout plus its
// road graph into one top-down PNG. Run: node _work/city-rebuild/proposed-layout.mjs
// Output: _work/city-rebuild/proposed-layout.png
//
// The tile is rasterized once in tile-local space (same classifier as
// topdown-map.mjs), then blitted per placement — valid because rotations are
// only 0/PI about the footprint centre, so blits are flips + translation.
// Graph overlay: street edges cyan, throats yellow, connectors magenta,
// nodes white dots.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import sharp from 'sharp';
import { CITY_SCALE } from '../../src/world/city-constants.js';
import { makeTileGrid } from '../../src/world/tiling.js';
import { buildDistrictGraph } from '../../src/world/district-roads.js';

// ---- Proposed layout (contiguous dense fabric, NOT the ring) ---------------
// E/W neighbours: west tile rot 0, east tile rot PI, dx = 56.1 (geometry flush).
// N/S neighbours: same rotation, dz = 34.4 (4.4 m road gap, buildings interleave).
const LAYOUT = [
  { x: -28.05, z: -17.2, rotation: 0 },          // d0
  { x: 28.05, z: -17.2, rotation: Math.PI },     // d1  east of d0
  { x: -28.05, z: 17.2, rotation: 0 },           // d2  north of d0
  { x: -28.05, z: -51.6, rotation: 0 },          // d3  south of d0
  { x: 28.05, z: 17.2, rotation: Math.PI },      // d4  east of d2, north of d1
  { x: -28.05, z: 51.6, rotation: 0 },           // d5  north of d2
  { x: 28.05, z: -51.6, rotation: Math.PI },     // d6  east of d3, south of d1
];
const LINKS = [[0, 1], [0, 2], [0, 3], [1, 4], [1, 6], [2, 4], [2, 5], [3, 6]];

const M_PER_PX = 0.24;
const PAD = 6;

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read('public/assets/world/city.glb');
const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];

function transformPoint(m, x, y, z, out) {
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
}
function classify(matName, y) {
  const n = matName.toLowerCase();
  if (/^road2?(\.\d+)?$/.test(n)) return 1;
  if (n === 'curb' || n === 'sidewalk') return 2;
  if (y < 2.0) return 3;
  if (y < 9.0) return 4;
  return 5;
}

// ---- Pass 1: collect triangles once (tile-local, scaled) -------------------
const tris = [];
const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
const el = [0, 0, 0];
const p = [0, 0, 0];
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
    const count = idx ? idx.getCount() : pos.getCount();
    for (let i = 0; i + 2 < count; i += 3) {
      const tri = new Float64Array(9);
      for (let v = 0; v < 3; v++) {
        pos.getElement(idx ? idx.getScalar(i + v) : i + v, el);
        transformPoint(world, el[0], el[1], el[2], p);
        tri[v * 3] = p[0] * CITY_SCALE;
        tri[v * 3 + 1] = p[1] * CITY_SCALE;
        tri[v * 3 + 2] = p[2] * CITY_SCALE;
        for (let k = 0; k < 3; k++) {
          if (tri[v * 3 + k] < bounds.min[k]) bounds.min[k] = tri[v * 3 + k];
          if (tri[v * 3 + k] > bounds.max[k]) bounds.max[k] = tri[v * 3 + k];
        }
      }
      tris.push({ tri, matName });
    }
  }
});
console.log(`${tris.length} triangles collected`);

// ---- Pass 2: world raster over all placements -------------------------------
const wMinX = Math.min(...LAYOUT.map((l) => l.x)) - 28.06 - PAD;
const wMaxX = Math.max(...LAYOUT.map((l) => l.x)) + 28.06 + PAD;
const wMinZ = Math.min(...LAYOUT.map((l) => l.z)) - 20.53 - PAD;
const wMaxZ = Math.max(...LAYOUT.map((l) => l.z)) + 20.53 + PAD;
const W = Math.ceil((wMaxX - wMinX) / M_PER_PX);
const H = Math.ceil((wMaxZ - wMinZ) / M_PER_PX);
console.log(`grid ${W}x${H}px  world x ${wMinX.toFixed(1)}..${wMaxX.toFixed(1)}  z ${wMinZ.toFixed(1)}..${wMaxZ.toFixed(1)}`);

const topY = new Float32Array(W * H).fill(-Infinity);
const cls = new Uint8Array(W * H);

// Build the real grid so placement matrices match the game exactly.
const tileBox = new THREE.Box3(
  new THREE.Vector3(bounds.min[0], bounds.min[1], bounds.min[2]),
  new THREE.Vector3(bounds.max[0], bounds.max[1], bounds.max[2])
);
const grid = makeTileGrid({ tileBox, placements: LAYOUT, overhang: 0.25 });

const va = [0, 0, 0];
function rasterTri(tri, matName, matrix) {
  const pts = [];
  for (let v = 0; v < 3; v++) {
    const x = tri[v * 3], y = tri[v * 3 + 1], z = tri[v * 3 + 2];
    const e = matrix.elements;
    pts.push([
      e[0] * x + e[4] * y + e[8] * z + e[12],
      e[1] * x + e[5] * y + e[9] * z + e[13],
      e[2] * x + e[6] * y + e[10] * z + e[14],
    ]);
  }
  const [a, b, c] = pts;
  const minPx = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - wMinX) / M_PER_PX));
  const maxPx = Math.min(W - 1, Math.ceil((Math.max(a[0], b[0], c[0]) - wMinX) / M_PER_PX));
  const minPz = Math.max(0, Math.floor((Math.min(a[2], b[2], c[2]) - wMinZ) / M_PER_PX));
  const maxPz = Math.min(H - 1, Math.ceil((Math.max(a[2], b[2], c[2]) - wMinZ) / M_PER_PX));
  if (minPx > maxPx || minPz > maxPz) return;
  const yMax = Math.max(a[1], b[1], c[1]);
  const cl = classify(matName, yMax);
  const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(d) < 1e-9) return;
  for (let pz = minPz; pz <= maxPz; pz++) {
    const z = wMinZ + (pz + 0.5) * M_PER_PX;
    for (let px = minPx; px <= maxPx; px++) {
      const x = wMinX + (px + 0.5) * M_PER_PX;
      const w0 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
      const w1 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
      const y = w0 * a[1] + w1 * b[1] + w2 * c[1];
      const o = pz * W + px;
      if (y > topY[o]) { topY[o] = y; cls[o] = cl; }
    }
  }
}

for (let t = 0; t < LAYOUT.length; t++) {
  for (const { tri, matName } of tris) rasterTri(tri, matName, grid.matrices[t]);
  console.log(`district ${t} rasterized`);
}

// ---- Pass 3: paint ----------------------------------------------------------
const COLORS = [
  [14, 14, 18],    // 0 void
  [58, 62, 74],    // 1 asphalt
  [150, 148, 140], // 2 pavement
  [90, 170, 90],   // 3 street furniture
  [190, 160, 110], // 4 low building
  [230, 200, 140], // 5 tall building
];
const img = Buffer.alloc(W * H * 3);
for (let o = 0; o < W * H; o++) {
  const c = COLORS[cls[o]];
  img[o * 3] = c[0]; img[o * 3 + 1] = c[1]; img[o * 3 + 2] = c[2];
}

// ---- Pass 4: road graph overlay --------------------------------------------
const net = buildDistrictGraph(grid, { roadY: 0, links: LINKS });
const toPx = (v) => [Math.round((v.x - wMinX) / M_PER_PX), Math.round((v.z - wMinZ) / M_PER_PX)];
function drawLine(a, b, color) {
  let [x0, y0] = toPx(a);
  let [x1, y1] = toPx(b);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const px = x0 + ox, py = y0 + oy;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const o = (py * W + px) * 3;
      img[o] = color[0]; img[o + 1] = color[1]; img[o + 2] = color[2];
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}
function drawDot(v, color, r = 3) {
  const [cx, cy] = toPx(v);
  for (let ox = -r; ox <= r; ox++) for (let oy = -r; oy <= r; oy++) {
    if (ox * ox + oy * oy > r * r) continue;
    const px = cx + ox, py = cy + oy;
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const o = (py * W + px) * 3;
    img[o] = color[0]; img[o + 1] = color[1]; img[o + 2] = color[2];
  }
}
const KIND_COLOR = { street: [64, 220, 255], throat: [255, 210, 80], connector: [255, 64, 200] };
for (const edge of net.edges) {
  const a = net.nodes.find((n) => n.id === edge.a).position;
  const b = net.nodes.find((n) => n.id === edge.b).position;
  drawLine(a, b, KIND_COLOR[edge.kind] || [255, 255, 255]);
}
for (const node of net.nodes) drawDot(node.position, [255, 255, 255], node.kind === 'junction' ? 2 : 3);

console.log(`graph: ${net.nodes.length} nodes, ${net.edges.length} edges ` +
  `(${net.edges.filter((e) => e.kind === 'connector').length} connectors)`);
console.log('connector edges:', net.edges.filter((e) => e.kind === 'connector').map((e) => e.id).join(', '));

await sharp(img, { raw: { width: W, height: H, channels: 3 } })
  .png()
  .toFile('_work/city-rebuild/proposed-layout.png');
console.log('_work/city-rebuild/proposed-layout.png written');
