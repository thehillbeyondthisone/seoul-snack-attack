// Re-encode all textures in a GLB to resized WebP.
// Textures are decoded to raw pixels first to bypass broken ICC/colorspace metadata
// (libvips "colourspace: parameter space not set" errors).
// NOTE: this script must NOT import @gltf-transform/functions — its nested sharp
// conflicts with the root sharp (two libvips instances break each other).
// Run tools/meshopt.mjs separately afterwards.
// Usage: node tools/optimize.mjs <input.glb> <output.glb> <maxTextureSize>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { statSync } from 'node:fs';
import sharp from 'sharp';

const [, , input, output, maxSizeArg] = process.argv;
const maxSize = Number(maxSizeArg) || 1024;

async function reencode(buf, size) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  let img = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  if (Math.max(info.width, info.height) > size) {
    img = img.resize(size, size, { fit: 'inside' });
  }
  return img.webp({ quality: 82 }).toBuffer();
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const textures = doc.getRoot().listTextures();
let converted = 0;
for (const tex of textures) {
  try {
    const out = await reencode(tex.getImage(), maxSize);
    tex.setImage(out).setMimeType('image/webp');
    converted++;
  } catch (e) {
    console.warn(`texture "${tex.getName()}" failed (${e.message}), keeping original`);
  }
}
console.log(`re-encoded ${converted}/${textures.length} textures to WebP <= ${maxSize}px`);

await io.write(output, doc);

const mb = (f) => (statSync(f).size / 1e6).toFixed(1) + 'MB';
console.log(`${output}: ${mb(output)} (input was ${mb(input)})`);
