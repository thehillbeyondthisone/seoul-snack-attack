// Build the visual-first delivery pickup library.
// Lightweight GLBs are copied unchanged; the three OBJ packs only require
// conversion because the runtime intentionally loads GLB exclusively.
import obj2gltf from 'obj2gltf';
import { copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = path.resolve('_source-assets/food');
const OUT = path.resolve('public/assets/food');
mkdirSync(OUT, { recursive: true });

const copies = [
  ['dakggochi.glb', 'dakggochi.glb'],
  ['gochujang_korea.glb', 'gochujang.glb'],
  ['jin-ramen_cup_noodle.glb', 'jin-ramen-cup.glb'],
  ['low_poly_soju_bottle__soda_bottle.glb', 'soju-bottle.glb'],
  ['luncheon_meat_fake_spam.glb', 'luncheon-meat.glb'],
  ['ramen.glb', 'ramen-pack.glb'],
  ['roka_korean_sauce_in_army.glb', 'roka-sauce.glb'],
  ['ssamjang_korea.glb', 'ssamjang.glb'],
  ['packaged-rice.glb', 'packaged-rice.glb'],
  ['tteokbokki-cup.glb', 'tteokbokki-cup.glb'],
  ['hotteok.glb', 'hotteok.glb'],
  ['banana-milk.glb', 'banana-milk.glb'],
  ['soondae-platter.glb', 'soondae-platter.glb'],
];

const conversions = [
  ['buldak-cup/b44337bc1ee0427b94765a4ccdd1609c.obj', 'buldak-cup.glb'],
  ['samyang-cup/f5b0c5c365974e1dbdd296b71b90a449.obj', 'samyang-cup.glb'],
  ['korean-cans/dc265535e46b4213a7a1100e83702c06.obj', 'korean-cans.glb'],
];

for (const [source, name] of copies) {
  const out = path.join(OUT, name);
  copyFileSync(path.join(SOURCE, source), out);
  console.log(`${path.relative('.', out)}: ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}

for (const [source, name] of conversions) {
  const out = path.join(OUT, name);
  writeFileSync(out, await obj2gltf(path.join(SOURCE, source), { binary: true }));
  console.log(`${path.relative('.', out)}: ${(statSync(out).size / 1e6).toFixed(2)} MB (OBJ → GLB)`);
}

console.log(`food pickups built: ${copies.length + conversions.length} runtime assets`);
