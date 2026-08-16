// Headless verification of src/world/tiling.js against the baked collider.
// Usage: node tools/bench/tiling-check.mjs
//
// Three things can silently break tiling, and all three look fine until you
// drive into them:
//   1. the tiled raycast disagreeing with a direct BVH cast (bad transform),
//   2. holes in the ground along a drivable route (swallows wheels at speed),
//   3. rotated districts returning normals in tile-local space (van skates).
// This checks all three and exits non-zero on failure.
//
// It builds the grid from TILE_LAYOUT — the same explicit placements the game
// uses. An earlier version built a rectangular cols x rows grid instead and
// swept ladder-shaped street rows across it, so it was validating a world the
// game had stopped constructing: the sweeps walked off the carriageway into
// building interiors and reported holes that were walls.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { readFileSync } from 'node:fs';
import { makeTileGrid } from '../../src/world/tiling.js';
import { buildDistrictGraph } from '../../src/world/district-roads.js';
import { createRoadGraph } from '../../src/world/road-network.js';
import {
  TILE_LAYOUT, TILE_OVERHANG, TILE_REPEATING, STREET_WIDTH, DISTRICT_LINKS,
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
  tileBox, placements: TILE_LAYOUT, overhang: TILE_OVERHANG,
});

const _ray = new THREE.Ray();
const localRaycast = (ray, far) => bvh.raycastFirst(ray, THREE.DoubleSide, 0, far);
const raycast = grid.makeRaycast(localRaycast);

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
  `${TILE_LAYOUT.length} districts  cell ${grid.pitchX.toFixed(3)} x ${grid.pitchZ.toFixed(3)} m  ` +
  `world ${(wb.max.x - wb.min.x).toFixed(1)} x ${(wb.max.z - wb.min.z).toFixed(1)} m  ` +
  `y ${wb.min.y.toFixed(2)}..${wb.max.y.toFixed(2)}\n`
);
// A repeating grid must tile on the road slab exactly, or the roadway gaps at
// every seam. Otherwise the cell must CONTAIN all the geometry, or anything
// outside it is invisible to every raycast and the van falls through it.
if (TILE_REPEATING) {
  check('footprint equals the road slab (zero overhang)',
    Math.abs(grid.pitchX - (meta.roadBox.max[0] - meta.roadBox.min[0])) < 1e-3 &&
    Math.abs(grid.pitchZ - (meta.roadBox.max[2] - meta.roadBox.min[2])) < 1e-3);
} else {
  check('district footprint contains all the geometry',
    tileBox.min.x <= meta.boundsNoFog.min[0] + 1e-3 && tileBox.max.x >= meta.boundsNoFog.max[0] - 1e-3 &&
    tileBox.min.z <= meta.boundsNoFog.min[2] + 1e-3 && tileBox.max.z >= meta.boundsNoFog.max[2] - 1e-3,
    `cell ${grid.pitchX.toFixed(1)} x ${grid.pitchZ.toFixed(1)} m vs geometry ` +
    `${(meta.boundsNoFog.max[0] - meta.boundsNoFog.min[0]).toFixed(1)} x ${(meta.boundsNoFog.max[2] - meta.boundsNoFog.min[2]).toFixed(1)} m`);
}

// Regression guard: wherever a direct BVH cast finds walkable ground in tile
// space, the tiled wrapper must find it in EVERY district. Sampling in tile
// space and re-testing through each placement is what makes this independent of
// where the layout happens to sit in the world.
{
  let unreachable = 0;
  let sampled = 0;
  let worstTile = -1;
  const nb = meta.boundsNoFog;
  const wp = new THREE.Vector3();
  for (let x = nb.min[0] + 1; x <= nb.max[0] - 1; x += 2.5) {
    for (let z = nb.min[2] + 1; z <= nb.max[2] - 1; z += 2.5) {
      const d = localCast(new THREE.Vector3(x, TOP, z), DOWN, FAR);
      // Unsigned, like city.js's isFlatGround: the road slabs are single-sided
      // planes and their winding is not consistent.
      if (!d || !d.face || Math.abs(d.face.normal.y) < 0.9 || d.point.y > 3) continue;
      for (let t = 0; t < grid.count; t++) {
        sampled++;
        grid.localToWorld(t, new THREE.Vector3(x, 0, z), wp);
        if (!raycast(new THREE.Vector3(wp.x, TOP, wp.z), DOWN, FAR)) {
          unreachable++;
          if (worstTile < 0) worstTile = t;
        }
      }
    }
  }
  check('every walkable surface is reachable by the tiled raycast', unreachable === 0,
    `${sampled} ground samples across ${grid.count} districts, ${unreachable} invisible to physics`
    + (worstTile >= 0 ? ` (first in district ${worstTile})` : ''));
}

// ---- 1. Differential: tiled raycast vs direct BVH cast ----------------------
// Every district must reproduce, in its own frame, exactly what the single-tile
// BVH returns. This is the whole correctness argument for one-BVH tiling.
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

  // Expected world hit = district transform applied to the local hit.
  expect.copy(local.point).applyMatrix4(grid.matrices[t]);
  maxPosErr = Math.max(maxPosErr, expect.distanceTo(world.point));

  const s = grid.flipped[t] ? -1 : 1;
  const en = new THREE.Vector3(s * local.face.normal.x, local.face.normal.y, s * local.face.normal.z);
  maxNormErr = Math.max(maxNormErr, en.distanceTo(world.face.normal));
}
check('tiled raycast matches direct BVH cast', maxPosErr < 1e-3 && maxNormErr < 1e-4 && missing === 0,
  `${compared} compared, max pos err ${maxPosErr.toExponential(2)} m, max normal err ${maxNormErr.toExponential(2)}, ${missing} presence mismatches`);

// ---- 2. Routes: no holes in the ground along any authored street ------------
// Sweep the real road graph rather than an assumed grid of rows and crosses:
// whatever the layout, every edge the router can hand the player has to be
// continuous drivable ground. Connector edges are excluded — their decks are
// built at runtime by connectors.js and are not in the baked tile collider.
const districtNet = buildDistrictGraph(grid, { roadY: meta.roadBox.min[1], links: DISTRICT_LINKS });
const districtBounds = new THREE.Box3().makeEmpty();
for (const cell of grid.cellBounds) districtBounds.union(cell);
const roadGraph = createRoadGraph({
  nodes: districtNet.nodes, edges: districtNet.edges,
  bounds: districtBounds, roadWidth: STREET_WIDTH,
});

{
  const authored = roadGraph.edges.filter((e) => e.kind === 'street' || e.kind === 'throat');
  let holes = 0;
  let maxStep = 0;
  let swept = 0;
  let worst = null;
  const p = new THREE.Vector3();
  for (const edge of authored) {
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      const length = a.distanceTo(b);
      const steps = Math.max(1, Math.ceil(length / 0.1));
      let prevY = null;
      for (let s = 0; s <= steps; s++) {
        p.lerpVectors(a, b, s / steps);
        swept++;
        const hit = raycast(new THREE.Vector3(p.x, TOP, p.z), DOWN, FAR);
        if (!hit) { holes++; prevY = null; if (!worst) worst = `${edge.id} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`; continue; }
        if (prevY !== null) maxStep = Math.max(maxStep, Math.abs(hit.point.y - prevY));
        prevY = hit.point.y;
      }
    }
  }
  check('no holes along any authored street', holes === 0,
    `${authored.length} edges swept, ${swept} samples, ${holes} misses, max height step ${maxStep.toFixed(3)} m`
    + (worst ? ` (first ${worst})` : ''));
}

// ---- 3. Rotated districts must return WORLD-space normals -------------------
{
  const rotated = [];
  for (let t = 0; t < grid.count; t++) if (grid.flipped[t]) rotated.push(t);
  if (!rotated.length) {
    console.log('SKIP  rotated districts return world-space normals — no rotated district in this layout');
  } else {
    let worst = 0;
    let tested = 0;
    for (const t of rotated) {
      for (let n = 0; n < 200; n++) {
        lp.set(
          THREE.MathUtils.lerp(tileBox.min.x + 0.5, tileBox.max.x - 0.5, rng()), 0,
          THREE.MathUtils.lerp(tileBox.min.z + 0.5, tileBox.max.z - 0.5, rng())
        );
        const local = localCast(new THREE.Vector3(lp.x, TOP, lp.z), DOWN, FAR);
        if (!local?.face) continue;
        grid.localToWorld(t, lp, wp);
        const world = raycast(new THREE.Vector3(wp.x, TOP, wp.z), DOWN, FAR);
        if (!world?.face) continue;
        tested++;
        const en = new THREE.Vector3(-local.face.normal.x, local.face.normal.y, -local.face.normal.z);
        worst = Math.max(worst, en.distanceTo(world.face.normal));
      }
    }
    check('rotated districts return world-space normals', worst < 1e-4,
      `${rotated.length} rotated districts, ${tested} samples, max normal err ${worst.toExponential(2)}`);
  }
}

// ---- 4. killY sits below the road ------------------------------------------
{
  const killY = grid.worldBounds.min.y - 3;
  const roadY = meta.roadBox.min[1];
  check('killY sits safely below the road', roadY - killY > 2,
    `killY ${killY.toFixed(2)} m vs road ${roadY.toFixed(2)} m (margin ${(roadY - killY).toFixed(2)} m)`);
}

// ---- 5. Perf: the tiling wrapper must stay cheap ---------------------------
{
  const N = 20000;
  const origins = [];
  for (let i = 0; i < N; i++) {
    origins.push(new THREE.Vector3(
      THREE.MathUtils.lerp(wb.min.x, wb.max.x, rng()), TOP,
      THREE.MathUtils.lerp(wb.min.z, wb.max.z, rng())
    ));
  }
  let t0 = performance.now();
  for (const o of origins) localCast(o, DOWN, FAR);
  const direct = (performance.now() - t0) * 1000 / N;
  t0 = performance.now();
  for (const o of origins) raycast(o, DOWN, FAR);
  const tiled = (performance.now() - t0) * 1000 / N;
  const perSubstep = tiled * 12 / 1000;
  console.log(`\nraycast cost: direct ${direct.toFixed(2)} us/ray, tiled ${tiled.toFixed(2)} us/ray `
    + `(${(tiled / direct).toFixed(2)}x) => ${perSubstep.toFixed(4)} ms per 12-ray substep`);
  check('tile wrapper stays inside the perf budget', perSubstep < 0.12,
    `${perSubstep.toFixed(4)} ms/substep vs 0.12 ms budget`);
}

if (failures) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nall tiling checks passed');
