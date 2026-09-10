// Seoul Expanse rebuild — M6 ground-surface pool: the pixels the road, the
// pavement and the bare land are made of.
//
// M4 dressed the buildings and left the street itself flat paint, which
// CITY-REBUILD.md records as "the biggest remaining 'unfinished' cue at street
// level, and the one thing a screenshot notices before the facades". This is
// that layer.
//
// EVERYTHING HERE IS GENERATED. No image is loaded, downloaded or shipped —
// the whole pool is fbm noise and arithmetic over typed arrays, which is both
// the licensing answer (ATTRIBUTION.md carries four unlicensed-asset blockers
// already; this adds none) and the reason it can be measured in Node by
// tools/bench/expanse-surface-check.mjs without a GL context.
//
// WHY NOT createCityDetailTextures(). The compact city's pool exists and is
// good, but it is tuned for a 330 m world, and the weathered facade variant in
// it is pinned bit-identical against older screenshots. The Expanse is a
// kilometre of sightline seen from a truck cab and wants its own grain. The
// four primitives are imported from that module rather than copied, so there is
// still exactly one implementation of the noise, the height-to-normal transform
// and the texture wrapper.
//
// ALBEDO IS MULTIPLICATIVE. Every colour map here has a mean of about 1.0 and
// only modulates what the material already is. Colour stays where M4 put it —
// in the material and the colour bible — so this pass adds grain and wear
// without quietly re-tinting a city whose palette is gated by
// expanse-facade-check.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { fbm, normalDataTexture, roughDataTexture, makeTexture } from './proc/textures.js';

const SIZE = 256;

/**
 * How many metres of world one tile of each map covers. The UV writers in
 * expanse2-city.js divide by these, so a texture never stretches with a road
 * width or a pavement pad's size — 4 m of ring road and 4 m of alley carry the
 * same grain, which is what stops the alleys reading as close-ups.
 */
export const SURFACE_TILE = Object.freeze({
  asphalt: 4,
  paving: 2,
  ground: 6,
});

/** Paving blocks inside one 2 m tile: 0.5 m x 0.25 m, laid in a running bond. */
const PAVER_COLS = 4;
const PAVER_ROWS = 8;
const GROUT_PX = 3;

/** Colour field to sRGB RGBA. Values are MULTIPLIERS about 1.0, clamped to 0..2. */
function albedoDataTexture(rgb, size) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 3; c++) {
      // 0..2 mapped onto a byte: 128 is "leave the material colour alone".
      const v = Math.max(0, Math.min(2, rgb[i * 3 + c]));
      data[i * 4 + c] = Math.round(v * 127.5);
    }
    data[i * 4 + 3] = 255;
  }
  return data;
}

function albedoTexture(data, size) {
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Scale a colour field so its mean is exactly 1.0.
 *
 * This is what makes "multiplicative" true rather than aspirational. Without
 * it the asphalt field averaged 1.10 and the paving field 0.89, so wiring the
 * pool in would have quietly lifted every road and dropped every pavement away
 * from the tone M4 gated. Contrast is untouched; only the level moves.
 */
function normaliseAlbedo(rgb) {
  let sum = 0;
  for (let i = 0; i < rgb.length; i++) sum += rgb[i];
  const scale = rgb.length / (sum || 1);
  for (let i = 0; i < rgb.length; i++) rgb[i] *= scale;
  return rgb;
}

/** 1 on the line, fading to 0 over `falloff` pixels either side. */
function groove(distance, falloff) {
  return Math.max(0, 1 - Math.min(distance / falloff, 1));
}

/**
 * Asphalt: aggregate grain, wheel-polished lanes, and a handful of darker
 * patch repairs. 4 m to the tile, so the aggregate is the size aggregate is
 * rather than the size a 1 m tile would make it.
 */
function asphaltFields() {
  const agg = fbm(SIZE, 0x5e0a1, { octaves: 2, baseCells: 44 });
  const fine = fbm(SIZE, 0x5e0a2, { octaves: 2, baseCells: 96 });
  const polish = fbm(SIZE, 0x5e0a3, { octaves: 3, baseCells: 6 });
  const patch = fbm(SIZE, 0x5e0a4, { octaves: 2, baseCells: 4 });

  const height = new Float32Array(SIZE * SIZE);
  const rough = new Float32Array(SIZE * SIZE);
  const rgb = new Float32Array(SIZE * SIZE * 3);
  for (let i = 0; i < height.length; i++) {
    height[i] = 0.58 * agg[i] + 0.42 * fine[i];
    // Aggregate reads rougher than any paint; the polish lanes knock it back
    // so a wet street reflects in strips rather than as one sheet.
    rough[i] = 0.88 + 0.10 * fine[i] - 0.26 * polish[i];

    // A tar patch is darker and slightly warmer than the surface it covers.
    //
    // The low-frequency terms are deliberately weak. `polish` and `patch` are
    // metre-scale fields, and a metre-scale swing in albedo on a flat surface
    // seen at a grazing angle does not read as worn tarmac — it reads as
    // standing water. The first tuning pass had them at 0.10 and 0.20 and the
    // ring road looked like a canal. The grain is where the contrast belongs:
    // it is centimetre-scale, so it resolves as texture and dissolves into
    // tone at distance instead of rippling.
    const repair = patch[i] > 0.80 ? (patch[i] - 0.80) / 0.20 : 0;
    const grain = 0.90 + 0.22 * fine[i] + 0.10 * agg[i];
    const wear = 1 + 0.04 * polish[i];
    const base = grain * wear * (1 - 0.10 * repair);
    rgb[i * 3] = base * (1 + 0.03 * repair);
    rgb[i * 3 + 1] = base;
    rgb[i * 3 + 2] = base * (1 - 0.04 * repair);
  }
  return { height, rough, rgb: normaliseAlbedo(rgb) };
}

/**
 * Pavement: interlocking blocks in a running bond, which is what a Seoul
 * pavement is. Per-block tone is the whole trick — a paving texture with one
 * tone reads as wallpaper the moment you stand on it.
 */
function pavingFields() {
  const speckle = fbm(SIZE, 0x9a4e1, { octaves: 3, baseCells: 30 });
  const stain = fbm(SIZE, 0x9a4e2, { octaves: 3, baseCells: 5 });
  const rng = mulberry32(0x9a4e3);
  // One tone per block, drawn once so the pattern is deterministic and the gate
  // can assert its spread.
  const tones = new Float32Array(PAVER_COLS * PAVER_ROWS * 2);
  for (let i = 0; i < PAVER_COLS * PAVER_ROWS; i++) {
    tones[i * 2] = 0.90 + rng() * 0.20;       // brightness
    tones[i * 2 + 1] = rng();                 // warm/cool mix
  }

  const blockW = SIZE / PAVER_COLS;
  const blockH = SIZE / PAVER_ROWS;
  const height = new Float32Array(SIZE * SIZE);
  const rough = new Float32Array(SIZE * SIZE);
  const rgb = new Float32Array(SIZE * SIZE * 3);

  for (let y = 0; y < SIZE; y++) {
    const rowIndex = Math.floor(y / blockH);
    // Running bond: every other course slides half a block. Eight courses is
    // even, so the pattern still meets itself at the tile seam.
    const shift = (rowIndex % 2) * blockW * 0.5;
    const localY = y - rowIndex * blockH;
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const shifted = (x + shift) % SIZE;
      const colIndex = Math.floor(shifted / blockW);
      const localX = shifted - colIndex * blockW;

      const g = Math.max(
        groove(Math.min(localX, blockW - localX), GROUT_PX),
        groove(Math.min(localY, blockH - localY), GROUT_PX),
      );
      const block = rowIndex * PAVER_COLS + colIndex;
      const tone = tones[block * 2];
      const warm = tones[block * 2 + 1];

      // The block face stands proud of the grout and is slightly domed, so a
      // kerbside lamp rakes across it instead of flooding it flat.
      const dome = 1 - Math.pow(Math.abs(localX / blockW - 0.5) * 2, 3) * 0.25;
      height[i] = (1 - g) * (0.72 + 0.20 * dome) + 0.12 * speckle[i];
      rough[i] = 0.74 + 0.18 * speckle[i] - 0.14 * g + 0.06 * stain[i];

      const dirt = 1 - 0.14 * stain[i];
      const base = tone * dirt * (1 - 0.30 * g) * (0.96 + 0.08 * speckle[i]);
      rgb[i * 3] = base * (1 + 0.045 * warm);
      rgb[i * 3 + 1] = base;
      rgb[i * 3 + 2] = base * (1 - 0.055 * warm);
    }
  }
  return { height, rough, rgb: normaliseAlbedo(rgb) };
}

/**
 * Bare land past the kerb line and out to the world margin. Normal and
 * roughness only: nothing out there is close enough to want an albedo, and the
 * 70 m margin exists so the world edge is not a cliff, not to be looked at.
 */
function groundFields() {
  const coarse = fbm(SIZE, 0x91a1d1, { octaves: 4, baseCells: 12 });
  const grit = fbm(SIZE, 0x91a1d2, { octaves: 2, baseCells: 64 });
  const height = new Float32Array(SIZE * SIZE);
  const rough = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < height.length; i++) {
    height[i] = 0.70 * coarse[i] + 0.30 * grit[i];
    rough[i] = 0.93 + 0.06 * grit[i];
  }
  return { height, rough };
}

/**
 * Build the Expanse's ground-surface pool.
 *
 * `intensity` scales bump strength only, exactly as the compact city's pool
 * does, so the mobile graphics profile buys detail back without a second set of
 * textures and without changing what colour anything is. At 0 the pool is not
 * built at all and the materials keep M4's flat look.
 *
 * Eight 256-square RGBA textures, about 2 MB with mipmaps.
 */
export function createExpanseSurfaceTextures(intensity = 1, { anisotropy = 4 } = {}) {
  if (!(intensity > 0)) return null;
  const s = intensity;

  const asphalt = asphaltFields();
  const paving = pavingFields();
  const ground = groundFields();

  const pool = {
    tile: SURFACE_TILE,
    asphalt: {
      map: albedoTexture(albedoDataTexture(asphalt.rgb, SIZE), SIZE),
      normal: makeTexture(normalDataTexture(asphalt.height, SIZE, 2.4 * s), SIZE),
      rough: makeTexture(roughDataTexture(asphalt.rough, SIZE), SIZE),
    },
    paving: {
      map: albedoTexture(albedoDataTexture(paving.rgb, SIZE), SIZE),
      normal: makeTexture(normalDataTexture(paving.height, SIZE, 3.2 * s), SIZE),
      rough: makeTexture(roughDataTexture(paving.rough, SIZE), SIZE),
    },
    ground: {
      normal: makeTexture(normalDataTexture(ground.height, SIZE, 1.8 * s), SIZE),
      rough: makeTexture(roughDataTexture(ground.rough, SIZE), SIZE),
    },
  };

  // Every one of these is read down a kilometre of street at a grazing angle,
  // which is the case trilinear filtering alone smears to grey.
  for (const family of [pool.asphalt, pool.paving, pool.ground]) {
    for (const tex of Object.values(family)) tex.anisotropy = anisotropy;
  }

  pool.dispose = () => {
    for (const family of [pool.asphalt, pool.paving, pool.ground]) {
      for (const tex of Object.values(family)) tex.dispose();
    }
  };
  return pool;
}

/**
 * The raw fields, for the Node gate. Building the DataTextures needs no GL
 * context, but asserting against the numbers that went into them is cheaper
 * than reading bytes back out and gives a better failure message.
 */
export function expanseSurfaceFields() {
  return {
    size: SIZE,
    pavers: { cols: PAVER_COLS, rows: PAVER_ROWS, groutPx: GROUT_PX },
    asphalt: asphaltFields(),
    paving: pavingFields(),
    ground: groundFields(),
  };
}
