// Headless verification of src/world/tiling.js against the baked collider.
// Usage: node tools/bench/tiling-check.mjs
//
// Three things can silently break tiling, and all three look fine until you
// drive into them:
//   1. the tiled raycast disagreeing with a direct BVH cast (bad transform),
//   2. holes in the ground at a seam (wrong pitch — swallows wheels at speed),
//   3. flipped rows returning normals in tile-local space (van skates sideways).
// This checks all three and exits non-zero on failure.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { readFileSync } from 'node:fs';
import { makeTileGrid } from '../../src/world/tiling.js';
import { createDistrictExtension } from '../../src/world/district-extension.js';
import {
  TILE_COLS, TILE_ROWS, TILE_FLIP_ODD_ROWS, TILE_OVERHANG, TILE_REPEATING,
  STREET_ROWS_Z, STREET_CROSS_X,
} from '../../src/world/city-constants.js';

const BIN = 'tools/bench/data/city.collider.bin';
const META = 'tools/bench/data/city.collider.json';

const meta = JSON.parse(readFileSync(META, 'utf8'));
const buf = readFileSync(BIN);
const positions = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const bvh = new MeshBVH(geo);

const tileBox = new THREE.Box3(
  new THREE.Vector3(...meta.tileBox.min),
  new THREE.Vector3(...meta.tileBox.max)
);
const grid = makeTileGrid({
  tileBox, cols: TILE_COLS, rows: TILE_ROWS,
  flipOddRows: TILE_FLIP_ODD_ROWS, overhang: TILE_OVERHANG,
});

const _ray = new THREE.Ray();
const localRaycast = (ray, far) => bvh.raycastFirst(ray, THREE.DoubleSide, 0, far);
const raycast = grid.makeRaycast(localRaycast);

// The quay is unique authored geometry, deliberately kept out of the baked
// tile collider. Route sweeps need the same composite view used at runtime.
const extension = createDistrictExtension(new THREE.Scene(), {
  roadY: meta.roadBox.min[1],
  northStreetZ: STREET_ROWS_Z[STREET_ROWS_Z.length - 1],
  crosses: STREET_CROSS_X,
});
function routeRaycast(origin, dir, far) {
  const tiled = raycast(origin, dir, far);
  const added = extension.raycast(origin, dir, tiled ? Math.min(far, tiled.distance) : far);
  return added && (!tiled || added.distance < tiled.distance) ? added : tiled;
}

function localCast(origin, dir, far) {
  _ray.origin.copy(origin);
  _ray.direction.copy(dir);
  return localRaycast(_ray, far) || null;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const TOP = tileBox.max.y + 5;
const FAR = tileBox.max.y - tileBox.min.y + 20;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---- 0. Geometry sanity -----------------------------------------------------
const wb = grid.worldBounds;
console.log(
  `grid ${TILE_COLS}x${TILE_ROWS}  pitch ${grid.pitchX.toFixed(3)} x ${grid.pitchZ.toFixed(3)} m  ` +
  `world ${(wb.max.x - wb.min.x).toFixed(1)} x ${(wb.max.z - wb.min.z).toFixed(1)} m  ` +
  `y ${wb.min.y.toFixed(2)}..${wb.max.y.toFixed(2)}\n`
);
// A repeating grid must tile on the road slab exactly, or the roadway gaps at
// every seam. A single tile must instead CONTAIN all the geometry, or anything
// outside the cell is invisible to every raycast and the van falls through it.
if (TILE_REPEATING) {
  check('footprint equals the road slab (zero overhang)',
    Math.abs(grid.pitchX - (meta.roadBox.max[0] - meta.roadBox.min[0])) < 1e-3 &&
    Math.abs(grid.pitchZ - (meta.roadBox.max[2] - meta.roadBox.min[2])) < 1e-3);
} else {
  check('single-tile footprint contains all the geometry',
    tileBox.min.x <= meta.boundsNoFog.min[0] + 1e-3 && tileBox.max.x >= meta.boundsNoFog.max[0] - 1e-3 &&
    tileBox.min.z <= meta.boundsNoFog.min[2] + 1e-3 && tileBox.max.z >= meta.boundsNoFog.max[2] - 1e-3,
    `cell ${grid.pitchX.toFixed(1)} x ${grid.pitchZ.toFixed(1)} m vs geometry ` +
    `${(meta.boundsNoFog.max[0] - meta.boundsNoFog.min[0]).toFixed(1)} x ${(meta.boundsNoFog.max[2] - meta.boundsNoFog.min[2]).toFixed(1)} m`);
}

// Regression guard for the bug above: sample the real collider and require the
// tiled wrapper to see ground wherever a direct BVH cast sees walkable ground.
{
  let unreachable = 0;
  let sampled = 0;
  const nb = meta.boundsNoFog;
  for (let x = nb.min[0] + 1; x <= nb.max[0] - 1; x += 2.5) {
    for (let z = nb.min[2] + 1; z <= nb.max[2] - 1; z += 2.5) {
      const o = new THREE.Vector3(x, TOP, z);
      const d = localCast(o, DOWN, FAR);
      // Unsigned, like city.js's isFlatGround: the road slabs are single-sided
      // planes and their winding is not consistent.
      if (!d || !d.face || Math.abs(d.face.normal.y) < 0.9 || d.point.y > 3) continue;
      sampled++;
      if (!raycast(o, DOWN, FAR)) unreachable++;
    }
  }
  check('every walkable surface is reachable by the tiled raycast', unreachable === 0,
    `${sampled} ground samples, ${unreachable} invisible to physics`);
}

// ---- 1. Differential: tiled raycast vs direct BVH cast ----------------------
// Every tile must reproduce, in its own frame, exactly what the single-tile BVH
// returns. This is the whole correctness argument for one-BVH tiling.
let maxPosErr = 0;
let maxNormErr = 0;
let compared = 0;
let missing = 0;
const rng = (() => { let a = 12345; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); })();
const lp = new THREE.Vector3();
const wp = new THREE.Vector3();
const expect = new THREE.Vector3();

for (let n = 0; n < 4000; n++) {
  lp.set(
    THREE.MathUtils.lerp(tileBox.min.x + 0.5, tileBox.max.x - 0.5, rng()),
    0,
    THREE.MathUtils.lerp(tileBox.min.z + 0.5, tileBox.max.z - 0.5, rng())
  );
  const local = localCast(new THREE.Vector3(lp.x, TOP, lp.z), DOWN, FAR);
  const t = Math.floor(rng() * grid.count);
  grid.localToWorld(t, lp, wp);
  const world = raycast(new THREE.Vector3(wp.x, TOP, wp.z), DOWN, FAR);

  if (!local || !world) { if (!!local !== !!world) missing++; continue; }
  compared++;

  // Expected world hit = tile transform applied to the local hit.
  expect.copy(local.point).applyMatrix4(grid.matrices[t]);
  maxPosErr = Math.max(maxPosErr, expect.distanceTo(world.point));

  const s = grid.flipped[t] ? -1 : 1;
  const en = new THREE.Vector3(s * local.face.normal.x, local.face.normal.y, s * local.face.normal.z);
  maxNormErr = Math.max(maxNormErr, en.distanceTo(world.face.normal));
}
check('tiled raycast matches direct BVH cast', maxPosErr < 1e-3 && maxNormErr < 1e-4 && missing === 0,
  `${compared} compared, max pos err ${maxPosErr.toExponential(2)} m, max normal err ${maxNormErr.toExponential(2)}, ${missing} presence mismatches`);

// ---- 2. Seams: no holes in the ground where tiles meet ----------------------
// Sweep along the street at 0.1 m across every X seam, and across every Z seam,
// counting misses and height steps. A hole here is a wheel trap at speed.
function sweep(axis, fixed, from, to, step) {
  let holes = 0;
  let maxStep = 0;
  let prevY = null;
  let worstAt = 0;
  for (let v = from; v <= to; v += step) {
    const x = axis === 'x' ? v : fixed;
    const z = axis === 'x' ? fixed : v;
    const hit = routeRaycast(new THREE.Vector3(x, TOP, z), DOWN, FAR);
    if (!hit) { holes++; prevY = null; continue; }
    if (prevY !== null) {
      const d = Math.abs(hit.point.y - prevY);
      if (d > maxStep) { maxStep = d; worstAt = v; }
    }
    prevY = hit.point.y;
  }
  return { holes, maxStep, worstAt };
}

// Sweep the ROUTED carriageway, not the whole world box: every street the road
// graph offers must be continuous ground end to end. Sweeping the full bounds
// instead just walks off the roads into the block's interior and reports
// misses that are buildings, which tells you nothing about seams or holes.
//
// At a multi-tile grid these lines cross every seam, which is the original
// intent; at 1x1 they still catch a gap in the authored road surface.
const worldRowsZ = [];
for (let row = 0; row < grid.rows; row++) {
  for (const z of STREET_ROWS_Z) worldRowsZ.push(grid.localToWorld(row * grid.cols, new THREE.Vector3(0, 0, z), new THREE.Vector3()).z);
}
const worldCrossX = [];
for (let col = 0; col < grid.cols; col++) {
  for (const x of STREET_CROSS_X) worldCrossX.push(grid.localToWorld(col, new THREE.Vector3(x, 0, 0), new THREE.Vector3()).x);
}
worldRowsZ.sort((a, b) => a - b);
worldCrossX.sort((a, b) => a - b);

let xHoles = 0;
let xStep = 0;
for (const z of worldRowsZ) {
  const s = sweep('x', z, worldCrossX[0], worldCrossX[worldCrossX.length - 1], 0.1);
  xHoles += s.holes;
  xStep = Math.max(xStep, s.maxStep);
}
check('no holes along any street between its end junctions', xHoles === 0,
  `${worldRowsZ.length} streets swept, ${xHoles} misses, max height step ${xStep.toFixed(3)} m`);

let zHoles = 0;
let zStep = 0;
for (const x of worldCrossX) {
  const s = sweep('z', x, worldRowsZ[0], worldRowsZ[worldRowsZ.length - 1], 0.1);
  zHoles += s.holes;
  zStep = Math.max(zStep, s.maxStep);
}
check('no holes along any cross street between its end junctions', zHoles === 0,
  `${worldCrossX.length} crosses swept, ${zHoles} misses, max height step ${zStep.toFixed(3)} m`);

// ---- 3. Flipped rows return world-space normals ----------------------------
// A flipped tile whose ground normal came back in tile-local space would still
// look flat (0,1,0) — so probe a wall, where the flip actually shows.
let flippedChecked = 0;
let badNormals = 0;
for (let t = 0; t < grid.count; t++) {
  if (!grid.flipped[t]) continue;
  for (let n = 0; n < 200; n++) {
    lp.set(
      THREE.MathUtils.lerp(tileBox.min.x + 1, tileBox.max.x - 1, rng()), 0,
      THREE.MathUtils.lerp(tileBox.min.z + 1, tileBox.max.z - 1, rng())
    );
    const g = localCast(new THREE.Vector3(lp.x, TOP, lp.z), DOWN, FAR);
    if (!g) continue;
    const y = g.point.y + 1.0;
    const a = Math.floor(rng() * 4);
    const dirL = new THREE.Vector3(a === 0 ? 1 : a === 1 ? -1 : 0, 0, a === 2 ? 1 : a === 3 ? -1 : 0);
    const hl = localCast(new THREE.Vector3(lp.x, y, lp.z), dirL, 6);
    if (!hl) continue;

    grid.localToWorld(t, new THREE.Vector3(lp.x, y, lp.z), wp);
    const dirW = new THREE.Vector3(-dirL.x, 0, -dirL.z); // flipped tile
    const hw = raycast(wp, dirW, 6);
    if (!hw) continue;
    flippedChecked++;
    const en = new THREE.Vector3(-hl.face.normal.x, hl.face.normal.y, -hl.face.normal.z);
    if (en.distanceTo(hw.face.normal) > 1e-4) badNormals++;
  }
}
// A 1x1 grid has no flipped tile to test. Say so rather than failing on a
// sample size that cannot exist, or passing on one that was never taken.
const anyFlipped = grid.flipped.some(Boolean);
if (!anyFlipped) {
  console.log(`SKIP  flipped tiles return world-space normals — no flipped tile in a ${TILE_COLS}x${TILE_ROWS} grid`);
} else {
  check('flipped tiles return world-space normals', badNormals === 0 && flippedChecked > 50,
    `${flippedChecked} wall hits compared, ${badNormals} wrong`);
}

// ---- 4. killY has margin under the road ------------------------------------
const killY = wb.min.y - 3;
const roadY = meta.roadBox.min[1];
check('killY sits safely below the road', killY < roadY - 2 && killY > roadY - 6,
  `killY ${killY.toFixed(2)} m vs road ${roadY.toFixed(2)} m (margin ${(roadY - killY).toFixed(2)} m)`);

// ---- 5. Cost of the tile wrapper on the hot path ---------------------------
// The van fires 12 short rays per substep at 120 Hz. Those are 0.55-0.64 m, so
// they almost always touch one tile and the wrapper should be near-free.
{
  const N = 40000;
  const origins = [];
  const dirs = [];
  for (let n = 0; n < N; n++) {
    lp.set(
      THREE.MathUtils.lerp(tileBox.min.x + 2, tileBox.max.x - 2, rng()), 0,
      THREE.MathUtils.lerp(tileBox.min.z + 2, tileBox.max.z - 2, rng())
    );
    const g = localCast(new THREE.Vector3(lp.x, TOP, lp.z), DOWN, FAR);
    const y = (g ? g.point.y : 0) + 0.7;
    grid.localToWorld(Math.floor(rng() * grid.count), new THREE.Vector3(lp.x, y, lp.z), wp);
    origins.push(wp.clone());
    dirs.push(DOWN.clone());
  }

  let t0 = performance.now();
  for (let n = 0; n < N; n++) localCast(origins[n], dirs[n], 0.64);
  const tDirect = performance.now() - t0;

  t0 = performance.now();
  for (let n = 0; n < N; n++) raycast(origins[n], dirs[n], 0.64);
  const tTiled = performance.now() - t0;

  const perRay = (tTiled / N) * 1000;
  const overhead = tTiled / tDirect;
  // 12 rays per substep, 120 substeps/s
  const msPerStep = (tTiled / N) * 12;
  console.log(
    `\nraycast cost: direct ${(tDirect / N * 1000).toFixed(2)} us/ray, ` +
    `tiled ${perRay.toFixed(2)} us/ray (${overhead.toFixed(2)}x) ` +
    `=> ${msPerStep.toFixed(4)} ms per 12-ray substep`
  );
  check('tile wrapper stays inside the perf budget', msPerStep < 0.12,
    `${msPerStep.toFixed(4)} ms/substep vs 0.12 ms budget`);
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
