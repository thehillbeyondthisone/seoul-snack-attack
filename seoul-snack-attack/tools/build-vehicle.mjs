// Build a playable vehicle GLB from a raw OBJ + PBR texture set, or from a
// ready GLB (recipe names `glb` instead of `obj`).
// Usage: node tools/build-vehicle.mjs <recipeId> [recipeId ...]     (default: pocha)
//
// This is build-van.mjs plus the rig-normalization step, parameterized over
// tools/vehicle-recipes.mjs. build-van.mjs is deliberately left alone: the
// van's tuning constants (van-spec.js, DEFAULT_PARAMS.comHeight) were measured
// against its current bbox-centre origin, and van-spec.js:10-13 asks that the
// discrepancy not be "fixed" casually. Migrating the van belongs with a
// `npm run bench` pass, not with adding a second vehicle.
//
// Stage order matters: normalize must see Float32 accessors, so it runs before
// optimize/meshopt. See the header of tools/normalize-vehicle.mjs.
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, renameSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { RECIPES, getRecipe } from './vehicle-recipes.mjs';

const OUT_DIR = 'public/assets/vehicles';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = args.length ? args : ['pocha'];
const keepIntermediates = process.argv.includes('--keep');

const run = (cmd) => {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit' });
};

mkdirSync(OUT_DIR, { recursive: true });

for (const id of ids) {
  const recipe = getRecipe(id);
  // A recipe names either an OBJ (run through obj2gltf) or a ready GLB (copied
  // straight to .raw.glb — normalize-vehicle reads both the same way).
  const src = recipe.glb
    ? path.join(recipe.srcDir, recipe.glb)
    : path.join(recipe.srcDir, recipe.obj);
  if (!existsSync(src)) {
    throw new Error(`recipe "${id}": source model not found at ${src}`);
  }

  // `.raw.glb` / `.norm.glb` under public/assets are already gitignored.
  const raw = path.join(OUT_DIR, `${recipe.id}.raw.glb`);
  const norm = path.join(OUT_DIR, `${recipe.id}.norm.glb`);
  const webp = path.join(OUT_DIR, `${recipe.id}.webp.glb`);
  const out = path.join(OUT_DIR, `${recipe.id}.glb`);

  console.log(`\n=== ${recipe.id} ===`);
  if (recipe.glb) {
    copyFileSync(src, raw);
  } else {
    run(`npx obj2gltf -i "${src}" -o "${raw}" --binary`);
  }
  run(`node tools/normalize-vehicle.mjs "${raw}" "${norm}" ${recipe.id} --report`);
  run(`node tools/optimize.mjs "${norm}" "${webp}" 2048`);
  run(`node tools/meshopt.mjs "${webp}" "${out}"`);

  // normalize writes the sidecar next to its own output; move it beside the
  // shipped GLB so the measurements sit with the asset they describe.
  const sidecarFrom = norm.replace(/\.glb$/, '.json');
  const sidecarTo = out.replace(/\.glb$/, '.json');
  if (existsSync(sidecarFrom)) renameSync(sidecarFrom, sidecarTo);

  if (!keepIntermediates) {
    for (const f of [raw, norm, webp]) if (existsSync(f)) rmSync(f);
  }
  console.log(`${recipe.id}: wrote ${out} + ${sidecarTo}`);
}

console.log(`\nbuilt ${ids.length} vehicle(s): ${ids.join(', ')}`);
console.log(`available recipes: ${Object.keys(RECIPES).join(', ')}`);
