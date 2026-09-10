// Build optimized van GLB from the raw OBJ + PBR textures.
// Usage: node tools/build-van.mjs
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SRC_DIR = '_source-assets/vehicles/grace-van';
const OBJ = path.join(SRC_DIR, 'f1870c351d15430db220bd403c731102.obj');
const OUT_DIR = 'public/assets/vehicles';
const RAW_GLB = path.join(OUT_DIR, 'van.raw.glb');
const OUT = path.join(OUT_DIR, 'van.glb');

mkdirSync(OUT_DIR, { recursive: true });

const run = (cmd) => {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit' });
};

// 1) OBJ -> GLB (embeds MTL-referenced textures)
run(`npx obj2gltf -i "${OBJ}" -o "${RAW_GLB}" --binary`);

// 2) Re-encode textures (<=2048 WebP), then meshopt (separate processes: sharp conflict)
const TMP = path.join(OUT_DIR, 'van.webp.glb');
run(`node tools/optimize.mjs "${RAW_GLB}" "${TMP}" 2048`);
run(`node tools/meshopt.mjs "${TMP}" "${OUT}"`);
