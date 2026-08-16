// Preview + validate the Seoul district layout without a browser.
// Run: node _work/city-rebuild/seoul-layout.mjs
// Output: _work/city-rebuild/seoul-layout.png  + a graph report on stdout
//
// Reads TILE_LAYOUT / DISTRICT_LINKS straight from src/world/city-constants.js
// and drives the real makeTileGrid / buildDistrictGraph / createRoadGraph, so
// what it draws is what the game builds. Iterating the layout here costs a few
// seconds instead of a full asset load in the browser.
//
// Graph overlay: street edges cyan, throats yellow, connectors magenta.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import sharp from 'sharp';
import {
  CITY_SCALE, TILE_LAYOUT, DISTRICT_LINKS, TILE_OVERHANG, STREET_WIDTH,
} from '../../src/world/city-constants.js';
import { makeTileGrid } from '../../src/world/tiling.js';
import { buildDistrictGraph } from '../../src/world/district-roads.js';
import { createRoadGraph, validateRoadGraph, createDeliveryAnchors } from '../../src/world/road-network.js';

const INPUT = 'public/assets/world/seoul-block.glb';
const OUTPUT = '_work/city-rebuild/seoul-layout.png';
const M_PER_PX = 0.24;
const PAD = 8;

const ROAD = /^real road$/i;
const PAVE = /^(concrete_pavement(\.\d+)?|tiles2?|Material\.010|Material\.018)$/i;

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(INPUT);
const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];

function transformPoint(m, x, y, z, out) {
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
}
// 0 void | 1 asphalt | 2 pavement | 3 low furniture | 4 building
function classify(matName, y) {
  if (ROAD.test(matName)) return 1;
  if (PAVE.test(matName)) return 2;
  if (y < 6) return 3;
  return 4;
}

// ---- Pass 1: collect the block's triangles once, tile-local and scaled ------
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
        for (let k = 0; k < 3; k++) {
          const value = p[k] * CITY_SCALE;
          tri[v * 3 + k] = value;
          if (value < bounds.min[k]) bounds.min[k] = value;
          if (value > bounds.max[k]) bounds.max[k] = value;
        }
      }
      tris.push({ tri, matName });
    }
  }
});
console.log(`${tris.length} triangles collected from ${INPUT}`);
console.log(`tile box  x ${bounds.min[0].toFixed(2)}..${bounds.max[0].toFixed(2)}  `
  + `z ${bounds.min[2].toFixed(2)}..${bounds.max[2].toFixed(2)}`);

const tileBox = new THREE.Box3(
  new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max)
);
const grid = makeTileGrid({ tileBox, placements: TILE_LAYOUT, overhang: TILE_OVERHANG });

// ---- Raster extents from the real placed cells ------------------------------
const world = new THREE.Box3().makeEmpty();
for (const cell of grid.cellBounds) world.union(cell);
const wMinX = world.min.x - PAD, wMaxX = world.max.x + PAD;
const wMinZ = world.min.z - PAD, wMaxZ = world.max.z + PAD;
const W = Math.ceil((wMaxX - wMinX) / M_PER_PX);
const H = Math.ceil((wMaxZ - wMinZ) / M_PER_PX);
console.log(`world ${(world.max.x - world.min.x).toFixed(1)} x ${(world.max.z - world.min.z).toFixed(1)} m`
  + `  -> raster ${W}x${H}px`);

const topY = new Float32Array(W * H).fill(-Infinity);
const cls = new Uint8Array(W * H);

function rasterTri(tri, matName, matrix) {
  const e = matrix.elements;
  const pts = [];
  for (let v = 0; v < 3; v++) {
    const x = tri[v * 3], y = tri[v * 3 + 1], z = tri[v * 3 + 2];
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
  const cl = classify(matName, Math.max(a[1], b[1], c[1]));
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

for (let t = 0; t < TILE_LAYOUT.length; t++) {
  for (const { tri, matName } of tris) rasterTri(tri, matName, grid.matrices[t]);
}
console.log(`${TILE_LAYOUT.length} districts rasterized`);

// ---- Paint ------------------------------------------------------------------
const COLORS = [
  [14, 14, 18],    // void
  [58, 62, 74],    // asphalt
  [150, 148, 140], // pavement
  [90, 170, 90],   // low furniture
  [190, 160, 110], // building
];
const img = Buffer.alloc(W * H * 3);
for (let o = 0; o < W * H; o++) {
  const c = COLORS[cls[o]];
  img[o * 3] = c[0]; img[o * 3 + 1] = c[1]; img[o * 3 + 2] = c[2];
}

// ---- Road graph -------------------------------------------------------------
const roadY = 0.03;
const districtNet = buildDistrictGraph(grid, { roadY, links: DISTRICT_LINKS });
const districtBounds = new THREE.Box3().makeEmpty();
for (const cell of grid.cellBounds) districtBounds.union(cell);
const graph = createRoadGraph({
  nodes: districtNet.nodes, edges: districtNet.edges,
  bounds: districtBounds, roadWidth: STREET_WIDTH,
});

const toPx = (v) => [Math.round((v.x - wMinX) / M_PER_PX), Math.round((v.z - wMinZ) / M_PER_PX)];
function drawLine(a, b, color) {
  let [x0, y0] = toPx(a);
  const [x1, y1] = toPx(b);
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
for (const edge of graph.edges) {
  const color = KIND_COLOR[edge.kind] || [255, 255, 255];
  for (let i = 1; i < edge.points.length; i++) drawLine(edge.points[i - 1], edge.points[i], color);
}
for (const node of graph.nodes) drawDot(node.position, [255, 255, 255], node.kind === 'junction' ? 2 : 3);

// Delivery anchors, with a flat-ground stand-in (no BVH here).
const anchors = createDeliveryAnchors(graph, (x, z) => ({ point: { x, y: roadY, z } }));
for (const a of anchors) drawDot(a.point, [255, 120, 40], 3);

// ---- Report -----------------------------------------------------------------
const byKind = {};
for (const e of graph.edges) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
console.log(`\ngraph: ${graph.nodes.length} nodes, ${graph.edges.length} edges  `
  + Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join(' '));
console.log(`delivery anchors: ${anchors.length} across ${TILE_LAYOUT.length} districts`);

const degrees = graph.nodes.map((n) => graph.adjacency.get(n.id).length);
console.log(`node degree: min ${Math.min(...degrees)} max ${Math.max(...degrees)}`);

const check = validateRoadGraph(graph);
if (check.ok) {
  console.log('\nvalidateRoadGraph: OK — connected, no dead ends, no bridges');
} else {
  console.log(`\nvalidateRoadGraph: ${check.errors.length} ERROR(S)`);
  for (const e of check.errors.slice(0, 25)) console.log('  ' + e);
  if (check.errors.length > 25) console.log(`  ... and ${check.errors.length - 25} more`);
}

// Longest connector deck — a long one means a seam that is not actually flush.
const connectors = graph.edges.filter((e) => e.kind === 'connector');
connectors.sort((a, b) => b.length - a.length);
console.log('\nlongest connector decks (procedural asphalt, not authored):');
for (const e of connectors.slice(0, 6)) console.log(`  ${e.id.padEnd(18)} ${e.length.toFixed(2)} m`);

await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toFile(OUTPUT);
console.log(`\n${OUTPUT} written`);
