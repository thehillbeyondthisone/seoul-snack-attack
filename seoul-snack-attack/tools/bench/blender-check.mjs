// Validate committed headless-Blender food GLBs. Does not launch Blender, so
// `npm run check` stays green on machines without it.
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { RECIPES } from '../blender/catalog.mjs';
import { inspectGlb } from '../blender/inspect.mjs';

const root = path.resolve(import.meta.dirname, '../..');
let failed = 0;

for (const [id, recipe] of Object.entries(RECIPES)) {
  const script = path.resolve(root, 'tools/blender', recipe.script);
  const glb = path.resolve(root, recipe.public || recipe.out);
  const png = recipe.preview ? path.resolve(root, recipe.preview) : null;
  const tag = `blender:${id}`;
  if (!existsSync(script)) {
    console.error(`${tag} FAIL missing recipe ${script}`);
    failed++;
    continue;
  }
  if (!recipe.preview || !png) {
    console.error(`${tag} FAIL catalog has no preview PNG path`);
    failed++;
    continue;
  }
  if (!existsSync(png) || statSync(png).size < 2048) {
    console.error(`${tag} FAIL missing preview ${png} — run npm run blender`);
    failed++;
    continue;
  }
  if (!existsSync(glb)) {
    console.error(`${tag} FAIL missing GLB ${glb} — run npm run blender`);
    failed++;
    continue;
  }
  const report = await inspectGlb(glb);
  const { largest, tris, bbox, cameras, materials } = report;
  const issues = [];
  if (tris > recipe.budgetTris) issues.push(`tris ${tris} > ${recipe.budgetTris}`);
  if (largest < recipe.minM) issues.push(`largest ${largest.toFixed(3)}m < ${recipe.minM}`);
  if (largest > recipe.maxM) issues.push(`largest ${largest.toFixed(3)}m > ${recipe.maxM}`);
  if (bbox.min[1] < -0.002) issues.push(`floor y=${bbox.min[1].toFixed(4)} (want ~0)`);
  if (cameras) issues.push(`exported ${cameras} camera(s)`);
  if (!materials.length) issues.push('no materials');
  if (issues.length) {
    console.error(`${tag} FAIL ${issues.join('; ')}`);
    failed++;
  } else {
    console.log(`${tag} PASS tris=${tris} largest=${largest.toFixed(3)}m mats=${materials.length} png=${statSync(png).size}B`);
  }
}

if (failed) {
  console.error(`blender-check: ${failed} FAIL`);
  process.exit(1);
}
console.log(`blender-check: ${Object.keys(RECIPES).length} PASS`);
