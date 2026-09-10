// Headless Blender recipe runner.
//   node tools/blender/run.mjs                 # every recipe
//   node tools/blender/run.mjs tteokbokki-cup  # one id
//   node tools/blender/run.mjs --list
//
// Always pass --factory-startup so a user's add-ons cannot change topology.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES } from './catalog.mjs';
import { findBlender } from './find-blender.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const ids = args.filter((a) => !a.startsWith('--'));

if (listOnly) {
  for (const [id, recipe] of Object.entries(RECIPES)) {
    console.log(`${id}\t${recipe.script}\t→ ${recipe.out}`);
  }
  process.exit(0);
}

const blender = findBlender();
if (!blender) {
  console.error('Blender not found. Set BLENDER to blender.exe, or install Blender 4/5 under Program Files.');
  process.exit(2);
}
console.log(`blender: ${blender}`);

const wanted = ids.length ? ids : Object.keys(RECIPES);
for (const id of wanted) {
  const recipe = RECIPES[id];
  if (!recipe) {
    console.error(`unknown recipe "${id}". known: ${Object.keys(RECIPES).join(', ')}`);
    process.exit(1);
  }
  if (!recipe.preview) {
    console.error(`${id}: catalog is missing preview — every model needs a PNG`);
    process.exit(1);
  }
  const script = path.join(here, recipe.script);
  const out = path.resolve(root, recipe.out);
  const preview = path.resolve(root, recipe.preview);
  mkdirSync(path.dirname(out), { recursive: true });
  mkdirSync(path.dirname(preview), { recursive: true });

  const argv = [
    '--background',
    '--factory-startup',
    '--python', script,
    '--',
    '--out', out,
    '--preview', preview,
  ];
  console.log(`\n=== ${id} ===`);
  console.log('>', blender, argv.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' '));
  const run = spawnSync(blender, argv, { stdio: 'inherit', cwd: root });
  if (run.status !== 0) {
    console.error(`${id}: blender exited ${run.status}`);
    process.exit(run.status ?? 1);
  }
  if (!existsSync(preview) || statSync(preview).size < 2048) {
    console.error(`${id}: preview PNG missing or empty at ${preview}`);
    process.exit(1);
  }
  console.log(`preview ${path.relative(root, preview)} (${statSync(preview).size} bytes)`);
  if (recipe.public) {
    const dest = path.resolve(root, recipe.public);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(out, dest);
    console.log(`installed ${path.relative(root, dest)}`);
  }
}

console.log(`\nbuilt ${wanted.join(', ')}`);
