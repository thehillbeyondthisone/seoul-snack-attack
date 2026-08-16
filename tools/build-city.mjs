// Build the optimized Seoul block GLB from the raw Blender export.
// Usage: node tools/build-city.mjs
//
// The district is the hand-built Seoul block this repository is named after:
// one authored street corner, 18.2 x 10.1 m raw with 4.1 m buildings, scaled x3
// at runtime (CITY_SCALE) to a 54.6 x 30.3 m block with 12.3 m frontages. The
// street runs along X in the northern strip; a sidewalk and shopfront row sits
// to the south. src/world/city-constants.js places copies of it.
//
// It replaced the Hong Kong "Buildings III/IV" packs, which were the right size
// but the wrong city — every facade and sign in them is Cantonese. Those sources
// are still on disk under _source-assets/city/ and _work/city-rebuild/, but
// nothing in the build or the runtime references them any more.
//
// NOTE: there is deliberately no tools/prepare-city.mjs step here. That script
// runs glTF flatten() and join(), which destructively combined objects whose
// transforms and materials had to stay separate and mangled the city (see
// handoff.md). The Seoul block does not need it either way: it arrives as 101
// nodes / 57 materials, which is already close to what prepare-city.mjs was
// trying to reach on the 466-node Hong Kong scene.
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const SRC = '_source-assets/city/Untitled4.glb';
const OUT_DIR = 'public/assets/world';
const OUT = path.join(OUT_DIR, 'seoul-block.glb');
const TMP = path.join(OUT_DIR, 'seoul-block.webp.glb');

mkdirSync(OUT_DIR, { recursive: true });

// Textures first, then meshopt, in separate processes (sharp conflicts with the
// nested sharp in @gltf-transform/functions — two libvips instances).
execSync(`node tools/optimize.mjs "${SRC}" "${TMP}" 1024`, { stdio: 'inherit' });
execSync(`node tools/meshopt.mjs "${TMP}" "${OUT}"`, { stdio: 'inherit' });

// Delete the pre-meshopt intermediate. It lands inside public/, so leaving it
// behind puts a file nobody loads into dist/ and onto the server.
rmSync(TMP, { force: true });

// Bake the collision triangle soup from the finished GLB for the headless
// physics bench (tools/bench). NOT shipped: written outside public/ so it
// doesn't inflate the deploy payload — the runtime builds its own BVH.
execSync(`node tools/build-collider.mjs "${OUT}" "tools/bench/data/city.collider.bin"`, { stdio: 'inherit' });
