// Downloaded CC0 asphalt PBR pack — one normal map and one roughness map
// committed under public/assets/textures/asphalt/. Loaded at boot by
// loadProcCity() in parallel with the BVH build, then handed to
// createCityDetailTextures() so the road material can blend the two pools
// at runtime via the debug menu.
//
// The pack is intentionally tiny (~860 KB total). The procedural pool in
// ./textures.js is the default; this module only runs when the user wants
// to A/B compare or blend in real asphalt grain.
import * as THREE from 'three';

const NORMAL_URL = 'assets/textures/asphalt/asphalt_normal.webp';
const ROUGHNESS_URL = 'assets/textures/asphalt/asphalt_roughness.webp';

const PROVENANCE = {
  source: 'ambientCG',
  asset: 'Asphalt033',
  license: 'CC0 1.0',
  url: 'https://ambientcg.com/a/Asphalt033',
  // ambientCG is explicit: "free to use without attribution — even in
  // commercial circumstances." We credit it anyway, because ATTRIBUTION.md
  // is the project's audit trail.
};

/**
 * @param {THREE.LoadingManager|null} manager  shared with the rest of the boot path
 * @returns {Promise<{normal: THREE.Texture, rough: THREE.Texture, provenance: object} | null>}
 *   resolves once both maps decode. Returns null on any decode failure so
 *   the caller can fall back to the procedural pool without a try/catch.
 */
export function loadAsphaltTexturePack(manager = null) {
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader(manager);
    let normal = null;
    let rough = null;
    let pending = 2;
    let failed = false;
    const finish = () => {
      if (--pending > 0) return;
      if (failed || !normal || !rough) {
        console.warn('asphalt texture pack: decode failed; falling back to procedural');
        resolve(null);
        return;
      }
      resolve({ normal, rough, provenance: PROVENANCE });
    };
    const onError = (url) => {
      failed = true;
      console.warn(`asphalt texture pack: failed to load ${url}`);
      finish();
    };
    normal = loader.load(
      NORMAL_URL,
      (tex) => { tex.colorSpace = THREE.NoColorSpace; finish(); },
      undefined,
      () => onError(NORMAL_URL),
    );
    rough = loader.load(
      ROUGHNESS_URL,
      (tex) => { tex.colorSpace = THREE.NoColorSpace; finish(); },
      undefined,
      () => onError(ROUGHNESS_URL),
    );
  });
}

/**
 * Configure a freshly-loaded downloaded map with the same wrap/anisotropy
 * settings the procedural pool uses, so swapping the map does not change
 * how the shader samples it. Idempotent.
 */
export function applyAsphaltTextureDefaults(tex) {
  if (!tex) return tex;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}
