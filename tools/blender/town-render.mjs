// Drive tools/blender/town_render.py headlessly.
//
// Deliberately NOT a catalog.mjs recipe. Those build GLB assets the game
// ships, and the runner enforces a triangle budget, a size range and a
// required preview for each. This renders geometry the game already generates,
// so it has no asset to budget — it is a camera, not a recipe.
//
//   node tools/blender/town-render.mjs          export, then render
//   node tools/blender/town-render.mjs --keep   render whatever OBJ is there
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBlender } from './find-blender.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const obj = path.join(root, '_work', 'town', 'town.obj');
const out = path.join(root, 'tools', 'blender', 'previews');

if (!process.argv.includes('--keep')) {
  const exported = spawnSync(process.execPath, [path.join(root, 'tools', 'town-export.mjs')], {
    stdio: 'inherit', cwd: root,
  });
  if (exported.status !== 0) process.exit(exported.status ?? 1);
}
if (!existsSync(obj)) {
  console.error(`missing ${obj} — run node tools/town-export.mjs`);
  process.exit(1);
}

const blender = findBlender();
if (!blender) {
  console.error('Blender not found. Set BLENDER to blender.exe, or install Blender 4/5 under Program Files.');
  process.exit(2);
}
console.log(`blender: ${blender}`);

// --factory-startup so a user's add-ons cannot change the import, same rule as
// run.mjs. -noaudio because a headless box may have no device and Blender will
// otherwise spend a second failing to find one.
const result = spawnSync(blender, [
  '--background', '--factory-startup', '-noaudio',
  '--python', path.join(here, 'town_render.py'),
  '--', '--obj', obj, '--out', out,
], { stdio: 'inherit', cwd: root });

if (result.status !== 0) {
  console.error(`blender exited ${result.status}`);
  process.exit(result.status ?? 1);
}
console.log(`previews in ${out}`);
