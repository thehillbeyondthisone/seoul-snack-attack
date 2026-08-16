// Coordinates every system affected by a discrete day/night preset.
import { createTimeSkyboxes } from './skybox.js';

export function createTimeOfDay({ scene, renderer, city, van, post, rain, initial = 'night' }) {
  // Both PMREM environments are generated once. Menu changes only swap cached
  // GPU textures, so switching time of day is immediate and allocation-free.
  const skies = createTimeSkyboxes(renderer);
  const state = { mode: initial in skies ? initial : 'night' };

  function set(mode) {
    if (!(mode in skies)) return city.nightRig.params;
    state.mode = mode;

    const params = city.nightRig.setPreset(mode);
    const sky = skies[mode];
    scene.background = sky.texture;
    scene.environment = sky.environment;

    // Rain owns the live fog multiplier, so its base must move with the preset.
    rain.baseFog = params.fogDensity;

    const streetlights = city.lights.streetlights;
    streetlights.intensity = params.lampIntensity;
    streetlights.enabled = params.lampIntensity > 0.01;

    for (const material of city.emissiveMaterials) {
      material.emissiveIntensity = params.emissiveBoost;
    }
    for (const headlight of van.headlights) {
      headlight.intensity = params.headlightIntensity;
    }
    van.heroFill.intensity = params.heroFillIntensity;

    post.setBloomStrength(params.bloomStrength);
    post.bloom.radius = params.bloomRadius;
    post.bloom.threshold = params.bloomThreshold;

    return params;
  }

  set(state.mode);

  return {
    state,
    skies,
    set,
    get mode() { return state.mode; },
  };
}
