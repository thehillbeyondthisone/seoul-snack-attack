// Build optimized city GLB from the raw 73MB Blender export.
// Usage: node tools/build-city.mjs
//
// The district is "Full Gameready City Buildings III — Hong Kong": one authored
// block, 101.9 x 96.1 m, authored at TRUE METRIC SCALE (hence CITY_SCALE = 1)
// and used as a single tile. It replaced Untitled4.glb, which was an 18.2 x
// 10.1 m street corner with 4.1 m buildings scaled x3 and stamped 35 times —
// the whole game held ~30 m of unique street.
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const SRC = '_source-assets/city/hongkong-iii.glb';
const OUT_DIR = 'public/assets/world';
const OUT = path.join(OUT_DIR, 'city.glb');
const PREPARED = path.join(OUT_DIR, 'city.prepared.glb');
const TMP = path.join(OUT_DIR, 'city.webp.glb');

mkdirSync(OUT_DIR, { recursive: true });

// Reduce scene/material/draw-call structure first, then re-encode textures and
// meshopt in separate processes (sharp conflicts with the functions package).
execSync(`node tools/prepare-city.mjs "${SRC}" "${PREPARED}"`, { stdio: 'inherit' });
execSync(`node tools/optimize.mjs "${PREPARED}" "${TMP}" 1024`, { stdio: 'inherit' });
execSync(`node tools/meshopt.mjs "${TMP}" "${OUT}"`, { stdio: 'inherit' });

// Delete the pre-meshopt intermediate. It lands inside public/, so leaving it
// behind puts a 40 MB file nobody loads into dist/ and onto the server.
rmSync(PREPARED, { force: true });
rmSync(TMP, { force: true });

// Bake the collision triangle soup from the finished GLB for the headless
// physics bench (tools/bench). NOT shipped: written outside public/ so it
// doesn't inflate the deploy payload — the runtime builds its own BVH.
execSync(`node tools/build-collider.mjs "${OUT}" "tools/bench/data/city.collider.bin"`, { stdio: 'inherit' });
