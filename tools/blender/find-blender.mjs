// Locate a Blender 4/5 binary. Override with BLENDER or BLENDER_PATH.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const env = [process.env.BLENDER, process.env.BLENDER_PATH].filter(Boolean);

const wellKnown = [
  'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.2/blender.exe',
];

function scanFoundation() {
  const root = 'C:/Program Files/Blender Foundation';
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(root, d.name, 'blender.exe'))
    .filter((p) => existsSync(p));
}

export function findBlender() {
  for (const candidate of [...env, ...wellKnown, ...scanFoundation()]) {
    if (candidate && existsSync(candidate)) return path.resolve(candidate);
  }
  return null;
}
