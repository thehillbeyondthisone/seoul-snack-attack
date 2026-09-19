// Seoul Snack Attack — the night rig.
//
// The original rig stacked 1.7 hemisphere + 0.7 ambient + 1.0 directional, which
// is a daylight amount of flat fill. Everything downstream was then over-driven
// to fight it: exposure 1.45, every emissive material forced to 3.0, streetlights
// at 120, headlights at 160. The result read as overcast dusk with blown-out
// white blobs rather than a rainy neon night.
//
// The fix is subtractive. Fill drops to near nothing so the scene is genuinely
// dark, and readability comes back through the things that should be lighting a
// street at night: lamps, signage, headlights, and reflections off wet asphalt.
// Every value here is live-tunable from the 조명 debug folder.
import * as THREE from 'three';
import { mulberry32, tileSeed } from '../core/rng.js';
// The bible's STAGE hexes are the target colours for this rig (see the header
// of color-bible.js). Imported, not copied, so a future retune cannot desync.
import { STAGE } from './data/color-bible.js';

export const NIGHT = {
  mode: 'night',
  // --- ambient fill: deliberately tiny ---
  // Tuned by eye: 0.30/0.12/0.45 at exposure 1.05 read as genuinely nocturnal
  // but lost the buildings entirely. 0.44/0.18/0.55 kept the darkness under the
  // blue rig; the warmer stage colours are darker per-lumen, and roofs read as
  // pure black from any distance, so fill comes up a step. Signage is unlit
  // MeshBasicMaterial — fill cannot wash it, only the practicals can.
  hemiIntensity: 0.56,
  ambientIntensity: 0.24,
  moonIntensity: 0.72,
  exposure: 1.25,
  // With little fill, the environment map is doing the work on wet surfaces.
  envIntensity: 0.95,

  // --- emissive signage ---
  // Was max(x, 3.0) on EVERY emissive material, which is why signage bloomed
  // into white mush. Bloom carries the glow now, not raw intensity.
  emissiveBoost: 1.7,

  // --- practical lights ---
  lampIntensity: 58,
  lampRange: 32,
  lampCount: 10,
  // One glow quad per pool light (10), not per anchor (180) — so each can be
  // larger and stronger without stacking into a wash. Trimmed from 0.30/5.0:
  // under the amber stage the quads bloomed into white pillars.
  glowOpacity: 0.24,
  glowRadius: 4.4,
  headlightIntensity: 95,
  heroFillIntensity: 9,

  // --- bloom ---
  // Higher threshold so only genuinely hot pixels bloom; wider radius so what
  // does bloom reads as a soft halo instead of a white disc.
  bloomStrength: 0.85,
  bloomRadius: 0.72,
  bloomThreshold: 1.02,

  // --- fog ---
  // FogExp2, so transmittance is exp(-(density * distance)^2). Retuned for the
  // ten-district Seoul fabric: at 0.019 the half-visibility point sat at 44 m,
  // which was fine when the whole map was two blocks but now hides the city
  // from its own streets. 0.0105 puts it at ~79 m — you still lose the far
  // districts to haze, which is the intent at night, but the street you are on
  // and the one beyond it read clearly.
  fogDensity: 0.0105,
  // Amber sodium haze from the bible's night stage — was the parent's blue
  // storm 0x121a30.
  fogColor: STAGE.fog,

  // --- colours / sky presentation ---
  // All five stage colours come from color-bible.js STAGE.
  hemiSkyColor: STAGE.hemiSky,
  hemiGroundColor: STAGE.hemiGround,
  ambientColor: STAGE.ambient,
  keyColor: STAGE.key,
  keyPosition: [60, 120, -40],
  // The night sky is now painted from these same STAGE hexes (the amber sodium
  // equirect in time-of-day.js), so it needs no dimming to sit in the palette —
  // full strength lets its horizon band carry the far end of every street.
  backgroundIntensity: 1.0,
  backgroundBlurriness: 0.035,
};

export const DAY = {
  mode: 'day',
  hemiIntensity: 0.86,
  ambientIntensity: 0.20,
  moonIntensity: 1.65,
  exposure: 0.92,
  envIntensity: 0.72,
  emissiveBoost: 0.32,
  lampIntensity: 0,
  lampRange: NIGHT.lampRange,
  lampCount: NIGHT.lampCount,
  glowOpacity: NIGHT.glowOpacity,
  glowRadius: NIGHT.glowRadius,
  headlightIntensity: 14,
  heroFillIntensity: 1.2,
  bloomStrength: 0.24,
  bloomRadius: 0.45,
  bloomThreshold: 1.15,
  // Half-visibility at ~198 m, a little past the map diagonal, so daylight QA
  // can actually see the fabric it is checking. See the NIGHT note above.
  fogDensity: 0.0042,
  fogColor: 0xb8c8d0,
  hemiSkyColor: 0xb9d8f2,
  hemiGroundColor: 0x62675b,
  ambientColor: 0x91a4b0,
  keyColor: 0xffefd1,
  keyPosition: [-75, 135, 55],
  backgroundIntensity: 0.92,
  backgroundBlurriness: 0.018,
};

export const MORNING = {
  ...DAY, mode: 'morning', hemiIntensity: .68, moonIntensity: 1.1,
  exposure: 1.02, emissiveBoost: .55, lampIntensity: 12, headlightIntensity: 30,
  fogColor: 0xc1afb1, hemiSkyColor: 0xd0bdc9, keyColor: 0xffc38d,
  keyPosition: [100, 35, 30], backgroundIntensity: .8,
};
export const DUSK = {
  ...NIGHT, mode: 'dusk', hemiIntensity: .62, moonIntensity: .9,
  exposure: 1.12, emissiveBoost: 1.2, lampIntensity: 40, headlightIntensity: 70,
  fogColor: 0x76535d, hemiSkyColor: 0x9b839d, keyColor: 0xffac72,
  keyPosition: [-100, 22, -35], backgroundIntensity: .6,
};
export const TIME_PRESETS = { night: NIGHT, day: DAY, morning: MORNING, dusk: DUSK };

/**
 * Per-block colour temperature.
 *
 * This is atmosphere AND anti-repetition at once: the map repeats one authored
 * block 15 times, and identical geometry under identical light is what makes
 * the repeat obvious. Giving each tile its own lamp/glow cast means you read
 * "the sodium block" and "the cyan block" as different neighbourhoods without
 * duplicating a single mesh or material.
 */
export const BLOCK_PALETTES = [
  { name: 'sodium', lamp: 0xffb46a, glow: 0xff9a4a },
  { name: 'mercury', lamp: 0xcfe0ff, glow: 0x9dc0ff },
  { name: 'neon-pink', lamp: 0xffa6c8, glow: 0xff4d8d },
  { name: 'cyan', lamp: 0xa8e8ff, glow: 0x4dc8ff },
  { name: 'amber', lamp: 0xffd7a0, glow: 0xffb238 },
  { name: 'jade', lamp: 0xbdf0d8, glow: 0x37d6a0 },
];

const PALETTE_SEED = 20260814;

/** Stable palette for a tile — same tile always gets the same cast. */
export function blockPalette(tileIndex, cols = 5) {
  const i = tileIndex % cols;
  const j = Math.floor(tileIndex / cols);
  const rng = mulberry32(tileSeed(PALETTE_SEED, i, j));
  return BLOCK_PALETTES[Math.floor(rng() * BLOCK_PALETTES.length)];
}

/**
 * Build the ambient rig. Returns the lights plus an `apply()` so the debug
 * menu can retune everything live without a reload.
 */
export function createNightRig(scene, renderer) {
  // Pre-skybox fallback only — time-of-day.js swaps in the sky cube, but the
  // clear colour should already sit in the stage palette.
  scene.background = new THREE.Color(STAGE.background);

  // Stable identity keeps lil-gui controllers valid while presets are copied
  // in. Sliders always edit the currently active values.
  const params = { ...NIGHT, keyPosition: [...NIGHT.keyPosition] };

  const hemi = new THREE.HemisphereLight(params.hemiSkyColor, params.hemiGroundColor, params.hemiIntensity);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(params.ambientColor, params.ambientIntensity);
  scene.add(amb);
  // At night this is moonlight; the day preset turns the same key into sun.
  const moon = new THREE.DirectionalLight(params.keyColor, params.moonIntensity);
  moon.position.fromArray(params.keyPosition);
  scene.add(moon);

  const fog = new THREE.FogExp2(params.fogColor, params.fogDensity);
  scene.fog = fog;

  function apply() {
    hemi.color.setHex(params.hemiSkyColor);
    hemi.groundColor.setHex(params.hemiGroundColor);
    hemi.intensity = params.hemiIntensity;
    amb.color.setHex(params.ambientColor);
    amb.intensity = params.ambientIntensity;
    moon.color.setHex(params.keyColor);
    moon.intensity = params.moonIntensity;
    moon.position.fromArray(params.keyPosition);
    fog.color.setHex(params.fogColor);
    fog.density = params.fogDensity;
    scene.environmentIntensity = params.envIntensity;
    scene.backgroundIntensity = params.backgroundIntensity;
    scene.backgroundBlurriness = params.backgroundBlurriness;
    if (renderer) renderer.toneMappingExposure = params.exposure;
  }

  function setPreset(mode) {
    const preset = TIME_PRESETS[mode];
    if (!preset) return params;
    Object.assign(params, preset, { keyPosition: [...preset.keyPosition] });
    apply();
    return params;
  }
  apply();

  return {
    hemi, amb, moon, fog, apply, setPreset, params,
    get mode() { return params.mode; },
  };
}
