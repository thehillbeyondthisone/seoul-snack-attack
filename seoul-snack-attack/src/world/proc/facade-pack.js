// Optional CC0 facade albedo pack — placeholder for the future pack loader.
//
// Run 2 of the graphics-pass-2 follow-ups adds the four procedural facade
// variants (stucco / weathered / tiled / painted) and per-district routing;
// the variants are sampled in-shader from the procedural fbm normal + rough
// pool. The albedo is a flat fallback painted with the colour-bible's
// `PAINT.plaster` hex so the city is readable before any photo pack lands.
//
// When a CC0 photo pack arrives, this module is the only file that needs
// new content: a `FACADE_VARIANTS` URL table mirroring the shape of
// `texture-pack.js`, and a `loadFacadeTexturePack(manager)` that resolves
// to `{ albedos: [DataTexture, DataTexture, DataTexture, DataTexture] }`
// in the same four-variant order. The variant index is already wired
// through `aVariant` in mesh.js, so the loader can drop straight in.
//
// Provenance audit-trail: ATTRIBUTION.md, "## Seoul Snack Attack additions"
// section, "Facade variants" entry.
import * as THREE from 'three';

/** Single shared fallback albedo for every facade variant slot. */
let _fallbackAlbedo = null;

/**
 * Build the 8×8 fallback once. `PAINT.plaster` is the colour-bible's
 * plaster hex; see src/world/data/color-bible.js. We use it for all four
 * variant slots so a missing photo pack never reads as a white block.
 */
export function getFacadeFallbackAlbedo() {
  if (_fallbackAlbedo) return _fallbackAlbedo;
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  // PAINT.plaster = 0xECDCC2 → 236,220,194 sRGB. Match the colour-bible
  // value byte-for-byte so the fallback never reads as a different colour.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 236;
    data[i + 1] = 220;
    data[i + 2] = 194;
    data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  _fallbackAlbedo = tex;
  return tex;
}

/**
 * Stub loader. Resolves to `null` so the city boots on the procedural +
 * fallback path. The future pack run replaces the body with a real
 * TextureLoader pass; the rest of the city doesn't have to know.
 *
 * @param {THREE.LoadingManager|null} _manager
 * @returns {Promise<{ albedos: THREE.Texture[] } | null>}
 */
export function loadFacadeTexturePack(_manager = null) {
  return Promise.resolve(null);
}

/**
 * Apply the project's standard wrap/anisotropy settings to a freshly-loaded
 * photo-sample albedo. Idempotent. Used by the future pack loader; included
 * here so the symmetry with `applyAsphaltTextureDefaults` is visible at the
 * import site.
 */
export function applyFacadeTextureDefaults(tex) {
  if (!tex) return tex;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}
