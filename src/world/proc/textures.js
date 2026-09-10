// Procedural surface detail for the proc city — generated once at runtime,
// no binary assets. The city used to ship albedo-only flat colours; this pool
// adds plaster/concrete grain to facades, aggregate + polish patches to roads
// and a paving grid to sidewalks/plaza, so wetness reads through real
// roughness response instead of colour darkening alone.
//
// Budget: six small textures shared by every material family (~1.5 MB VRAM
// with mipmaps). Nothing here is per-building; mesh.js just assigns maps from
// this one pool.
//
// Asphalt can also be blended against a downloaded CC0 pack (see
// texture-pack.js) via `mixAsphaltMaps()` — the debug menu exposes a
// source toggle and a 0..1 blend slider so the user can A/B the two pools
// live. The procedural pair is the default; the downloaded pair is opt-in.
import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.js';

/**
 * Tileable value-noise fbm, normalised 0..1. Lattice wraps so the texture
 * repeats cleanly.
 *
 * Exported for `src/world/expanse-surface-art.js`, which builds the Expanse's
 * own road and pavement pool. It needs its own tiles — a kilometre of street
 * seen from a truck wants a different grain than the compact city's — but it
 * must not own a second copy of this maths.
 */
export function fbm(size, seed, { octaves = 4, baseCells = 8, gain = 0.5 } = {}) {
  const field = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const rng = mulberry32(seed + o * 0x9e37);
    const lattice = new Float32Array(cells * cells);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
    const smooth = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++) {
      // Wrap the sample position into the lattice — free tileability.
      const fy = (y / size) * cells;
      const y0 = Math.floor(fy) % cells;
      const y1 = (y0 + 1) % cells;
      const ty = smooth(fy - Math.floor(fy));
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const x0 = Math.floor(fx) % cells;
        const x1 = (x0 + 1) % cells;
        const tx = smooth(fx - Math.floor(fx));
        const a = lattice[y0 * cells + x0];
        const b = lattice[y0 * cells + x1];
        const c = lattice[y1 * cells + x0];
        const d = lattice[y1 * cells + x1];
        field[y * size + x] += amplitude * ((a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty);
      }
    }
    total += amplitude;
    amplitude *= gain;
    cells *= 2;
  }
  void total; // fields are renormalised below, the sum is only bookkeeping
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < field.length; i++) {
    if (field[i] < min) min = field[i];
    if (field[i] > max) max = field[i];
  }
  const span = max - min || 1;
  for (let i = 0; i < field.length; i++) field[i] = (field[i] - min) / span;
  return field;
}

/** Height field → tangent-space normal map (RGBA). Strength in "bump pixels". */
export function normalDataTexture(heights, size, strength) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // (-dX, -dY, 1) normalised → 0..255. Z stays dominant: these are detail
      // bumps, not geometry.
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Roughness field → RGBA grayscale (green channel is what the shader reads). */
export function roughDataTexture(field, size) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < field.length; i++) {
    const v = Math.max(0, Math.min(1, field[i]));
    const b = Math.round(v * 255);
    const j = i * 4;
    data[j] = b;
    data[j + 1] = b;
    data[j + 2] = b;
    data[j + 3] = 255;
  }
  return data;
}

/**
 * RGBA bytes → a repeating, mipmapped DataTexture. Linear colour space: every
 * caller here feeds it a normal or roughness map, never an albedo.
 */
export function makeTexture(data, size) {
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Blend the procedural asphalt pair with a downloaded pair at `t` in [0, 1].
 * `t = 0` returns the procedural maps untouched; `t = 1` returns the downloaded
 * maps resampled to the procedural resolution. The blend is per-pixel linear
 * in RGBA (alpha is left at 255 throughout). Both `proc` maps must share a
 * size (the procedural pool is 256²); `dl` maps may be any size and are
 * resampled via an off-screen canvas — that is the only browser-portable
 * bilinear read we have without a WebGLRenderTarget.
 *
 * The output textures are fresh DataTextures so the caller can swap them
 * into the material's `normalMap` / `roughnessMap` slots. The previous
 * maps are disposed (the procedural DataTextures are shared, so the caller
 * owns the disposal policy — see `asphaltBlendHandle.dispose`).
 */
export function mixAsphaltMaps(proc, dl, t) {
  if (!(t > 0)) return { normal: proc.normal, rough: proc.rough };
  if (!(t < 1) || !dl) return { normal: dl?.normal ?? proc.normal, rough: dl?.rough ?? proc.rough };
  return {
    normal: blendDataTexture(proc.normal, dl.normal, t),
    rough: blendDataTexture(proc.rough, dl.rough, t),
  };
}

/**
 * Read `dl` into a `Uint8ClampedArray` at `size × size` via a 2D canvas, then
 * for each output pixel write `lerp(proc[i], dl[i], t)`. Used by
 * `mixAsphaltMaps` to avoid paying for a render-target blit at boot.
 */
function blendDataTexture(procTex, dlTex, t) {
  const size = procTex.image.width;
  const proc = procTex.image.data; // Uint8Array(RGBA), tightly packed
  const dl = sampleTextureToRGBA(dlTex, size);
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i]     = proc[i]     + (dl[i]     - proc[i])     * t;
    out[i + 1] = proc[i + 1] + (dl[i + 1] - proc[i + 1]) * t;
    out[i + 2] = proc[i + 2] + (dl[i + 2] - proc[i + 2]) * t;
    out[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(out, size, size);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Bilinear-ish sample: draw the source texture to a 2D canvas at `size × size`
 * and read the pixels back. Browser support is universal; the WebGL
 * alternative (render-to-texture + readPixels) would couple this module to
 * a renderer, which the procedural pool does not need.
 *
 * Caches by texture reference + size so repeated blend calls (slider drag)
 * do not re-blit the canvas on every tick. A fresh `Map` is allocated when
 * the cache is invalidated (new pack loaded); the previous map is GC'd
 * with the textures it referenced. `WeakMap` has no `clear` method.
 */
let _sampleCache = new WeakMap();
function sampleTextureToRGBA(tex, size) {
  let entry = _sampleCache.get(tex);
  if (entry && entry.size === size) return entry.data;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // sRGB textures need explicit sRGB→linear so the blend stays in display
  // space; if a caller forgets the colorspace, the result is still
  // deterministic, just slightly off from what the shader would do.
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(tex.image, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  entry = { size, data };
  _sampleCache.set(tex, entry);
  return data;
}

/** Drop the canvas-resample cache. Call after a texture pack is replaced. */
export function clearTextureSampleCache() {
  _sampleCache = new WeakMap();
}

/**
 * Build the shared detail pool. `intensity` (0..1+) scales bump strength so
 * the mobile gfx profile can dial detail down without a second texture set.
 * Returns null when intensity is 0 — materials then keep their flat look.
 *
 * Returned facade pool is an object with one entry per variant id
 * (`stucco` / `weathered` / `tiled` / `painted`), each `{ normal, rough }`.
 * The single per-district routing is done in mesh.js via a per-instance
 * `aVariant` attribute; this function is the single source of truth for
 * the four pairs.
 *
 * `weathered` is bit-identical to the previous `plasterNormal` / `plasterRough`
 * output so screenshots taken before this pass stay pixel-stable when no
 * `aVariant` is set (variant 0 = stucco is the new default; the weathered
 * look lives on its own slot). The roof family is a single new pair.
 */
export function createCityDetailTextures(intensity = 1) {
  if (!(intensity > 0)) return null;

  // ---- Facades: four variants ------------------------------------------------
  // Variant 0 — stucco. Very low frequency, narrow rough band, no horizontal
  // seams. Reads as smooth, recently-rendered stucco. Bump strength is the
  // lowest of the four so the surface looks flat.
  const stuccoH = fbm(256, 0x57cc0, { octaves: 3, baseCells: 6 });
  const stuccoRoughField = new Float32Array(256 * 256);
  for (let i = 0; i < stuccoRoughField.length; i++) {
    stuccoRoughField[i] = 0.82 + 0.12 * stuccoH[i];
  }

  // Variant 1 — weathered. Bit-identical to the previous single plaster pool
  // (seed 0xa11ce, fine 0xfa11, panel seams at y ∈ {52, 118, 196}). Do not
  // change a single parameter or the existing texture-blend captures go
  // pixel-noisy against the new variant routing.
  const weatheredH = fbm(256, 0xa11ce, { octaves: 5, baseCells: 10 });
  const weatheredFine = fbm(256, 0xfa11, { octaves: 2, baseCells: 48 });
  const weatheredRoughField = new Float32Array(256 * 256);
  for (let i = 0; i < weatheredRoughField.length; i++) {
    weatheredRoughField[i] = 0.78 + 0.18 * weatheredH[i] + 0.04 * weatheredFine[i];
  }
  for (const row of [52, 118, 196]) {
    for (let x = 0; x < 256; x++) {
      for (let dy = -2; dy <= 2; dy++) {
        const y = (row + dy + 256) % 256;
        weatheredRoughField[y * 256 + x] -= 0.16 * (1 - Math.abs(dy) / 3);
      }
    }
  }

  // Variant 2 — tiled. 2×2 panel grid (groove on the half-tile line, every
  // 64 px), each panel modulated by a mid-frequency fbm so the panels aren't
  // perfectly flat. Reads as a concrete-panel facade.
  const tiledH = fbm(256, 0xc0ac1e, { octaves: 3, baseCells: 14 });
  const tiledRoughField = new Float32Array(256 * 256);
  const tileGroove = (t) => Math.max(0, 1 - Math.min(t, 1));
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = y * 256 + x;
      const g = Math.max(
        tileGroove(Math.min(x % 128, 128 - (x % 128)) / 5),
        tileGroove(Math.min(y % 128, 128 - (y % 128)) / 5),
      );
      tiledH[i] = tiledH[i] * 0.55 + 0.45 * (1 - g * 0.85);
      tiledRoughField[i] = 0.7 + 0.22 * tiledH[i] - 0.18 * g;
    }
  }

  // Variant 3 — painted. Very fine speckle over a smooth fbm base, plus a
  // faint horizontal drip band at y ≈ 180 so a painted topcoat reads against
  // the concrete below. Bump strength is reduced so the surface looks soft.
  const paintedH = fbm(256, 0xd0a5e, { octaves: 4, baseCells: 22 });
  const paintedSpeckle = fbm(256, 0x53110, { octaves: 2, baseCells: 80 });
  const paintedRoughField = new Float32Array(256 * 256);
  for (let i = 0; i < paintedRoughField.length; i++) {
    paintedH[i] = paintedH[i] * 0.7 + 0.3 * paintedSpeckle[i];
    paintedRoughField[i] = 0.74 + 0.18 * paintedH[i];
  }
  // Drip band — slightly smoother (more reflective) line, 2 px wide.
  for (let x = 0; x < 256; x++) {
    for (let dy = -1; dy <= 1; dy++) {
      const y = (180 + dy + 256) % 256;
      paintedRoughField[y * 256 + x] -= 0.10 * (1 - Math.abs(dy));
    }
  }

  // ---- Roof: gravel / felt --------------------------------------------------
  // Mid-frequency fbm + fine speckle, narrow rough band. A subtle horizontal
  // roll-off simulates felt seams every 1/4 tile. The per-roof `aUvScale`
  // (run 1) finally has something to stretch.
  const roofH = fbm(256, 0x9001, { octaves: 4, baseCells: 18 });
  const roofSpeckle = fbm(256, 0xc011, { octaves: 2, baseCells: 64 });
  const roofHeight = new Float32Array(256 * 256);
  const roofRoughField = new Float32Array(256 * 256);
  for (let i = 0; i < roofHeight.length; i++) {
    roofHeight[i] = 0.55 * roofH[i] + 0.45 * roofSpeckle[i];
    roofRoughField[i] = 0.88 + 0.08 * roofH[i] + 0.04 * roofSpeckle[i];
  }

  // ---- Roads: asphalt --------------------------------------------------------
  // Fine aggregate bumps dominate; a second low-frequency field drives polished
  // (smoother, shinier) wear patches so wet streets do not reflect uniformly.
  const agg = fbm(256, 0xd15ea, { octaves: 2, baseCells: 40 });
  const aggFine = fbm(256, 0xbead, { octaves: 2, baseCells: 90 });
  const polish = fbm(256, 0x70115, { octaves: 3, baseCells: 5 });
  const asphaltHeight = new Float32Array(256 * 256);
  const asphaltRoughField = new Float32Array(256 * 256);
  for (let i = 0; i < asphaltHeight.length; i++) {
    asphaltHeight[i] = 0.6 * agg[i] + 0.4 * aggFine[i];
    // Aggregate reads rougher than any paint; wheel-polish lanes knock it back.
    asphaltRoughField[i] = 0.86 + 0.12 * aggFine[i] - 0.24 * polish[i];
  }

  // ---- Sidewalks / plaza: paving grid ---------------------------------------
  // One tile = four paving stones (grout grooves on the quarter lines), light
  // surface speckle. The grid is what sells "sidewalk" from the van.
  const pavingH = fbm(256, 0x9a4e, { octaves: 3, baseCells: 26 });
  const pavingRoughField = new Float32Array(256 * 256);
  const pavingHeight = new Float32Array(256 * 256);
  const groove = (t) => Math.max(0, 1 - Math.min(t, 1)); // 1 on the line, fading over ~6 px
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = y * 256 + x;
      const g = Math.max(
        groove(Math.min(x % 128, 128 - (x % 128)) / 7),
        groove(Math.min(y % 128, 128 - (y % 128)) / 7),
      );
      pavingHeight[i] = pavingH[i] * 0.35 + 0.65 * (1 - g * 0.8);
      pavingRoughField[i] = 0.72 + 0.2 * pavingH[i] - 0.18 * g;
    }
  }

  const s = intensity;
  // Variant-index constants — kept in lockstep with the per-building `aVariant`
  // values written by mesh.js and the `aVariant` slot the shader reads.
  const facades = {
    stucco: {
      normal: makeTexture(normalDataTexture(stuccoH, 256, 1.6 * s), 256),
      rough: makeTexture(roughDataTexture(stuccoRoughField, 256), 256),
    },
    weathered: {
      normal: makeTexture(normalDataTexture(weatheredH, 256, 2.2 * s), 256),
      rough: makeTexture(roughDataTexture(weatheredRoughField, 256), 256),
    },
    tiled: {
      normal: makeTexture(normalDataTexture(tiledH, 256, 2.0 * s), 256),
      rough: makeTexture(roughDataTexture(tiledRoughField, 256), 256),
    },
    painted: {
      normal: makeTexture(normalDataTexture(paintedH, 256, 1.4 * s), 256),
      rough: makeTexture(roughDataTexture(paintedRoughField, 256), 256),
    },
  };
  return {
    facades,
    // Back-compat: keep the single `plasterNormal` / `plasterRough` aliases
    // pointing at the `weathered` slot so any pre-existing consumer keeps
    // working. The handoff's "no-touch" list and the city.js wetness path
    // are the only readers; both ignore these.
    plasterNormal: facades.weathered.normal,
    plasterRough: facades.weathered.rough,
    roof: {
      normal: makeTexture(normalDataTexture(roofHeight, 256, 1.8 * s), 256),
      rough: makeTexture(roughDataTexture(roofRoughField, 256), 256),
    },
    asphaltNormal: makeTexture(normalDataTexture(asphaltHeight, 256, 2.6 * s), 256),
    asphaltRough: makeTexture(roughDataTexture(asphaltRoughField, 256), 256),
    pavingNormal: makeTexture(normalDataTexture(pavingHeight, 256, 2.4 * s), 256),
    pavingRough: makeTexture(roughDataTexture(pavingRoughField, 256), 256),
  };
}
