// Delivery-driven lighting with cached skies and a short visual transition.
import * as THREE from 'three';
import { createTimeSkyboxes, createDaySkybox } from './skybox.js';
import { createSkyBlend } from './sky-blend.js';
import { dayProgress } from '../game/day-progress.js';
import { STAGE, NEON, cssHex } from './data/color-bible.js';

export function createTimeOfDay({ scene, renderer, city, van, post, rain, initial = null, deliveries = 0, skyFactory = null, blendFactory = createSkyBlend }) {
  // Day inherits the parent's lazy overcast-sky generator; night is the fork's
  // own amber sodium stage (see createAmberNightSky below). Both PMREM
  // environments are generated once — the active preset at boot, the other on
  // its first menu switch — so changing time of day only swaps cached GPU
  // textures and stays allocation-free.
  const inherited = createTimeSkyboxes(renderer);
  let amberNight = null;
  let morning = null, dusk = null;
  const skies = skyFactory?.() || {
    get night() { return amberNight || (amberNight = createAmberNightSky(renderer)); },
    get day() { return inherited.day; },
    get morning() { return morning || (morning = createDaySkybox(renderer, 'morning')); },
    get dusk() { return dusk || (dusk = createDaySkybox(renderer, 'dusk')); },
  };
  const state = { mode: initial in skies ? initial : dayProgress(deliveries).mode, source: initial ? 'manual' : 'deliveries', deliveries };
  let transition = null, skyBlend = null, activeSky = null;
  const copy = p => ({ ...p, keyPosition: [...p.keyPosition] });
  const colorA = new THREE.Color(), colorB = new THREE.Color();

  function set(mode, { seconds = 0, source = 'manual' } = {}) {
    if (!(mode in skies)) return city.nightRig.params;
    // Only debug completion can finish several deliveries within this blend.
    if (transition) finish();
    state.mode = mode;
    state.source = source;
    const from = copy(city.nightRig.params);
    const params = city.nightRig.setPreset(mode);
    const sky = skies[mode];
    if (seconds > 0 && activeSky && activeSky !== sky) {
      skyBlend ||= blendFactory(renderer, sky);
      transition = { from, to: copy(params), fromSky: activeSky, sky, seconds, elapsed: 0 };
      update(0);
    } else {
      activeSky = sky;
      scene.background = sky.texture;
      scene.environment = sky.environment;
      apply();
    }
    return params;
  }
  function apply() {
    const params = city.nightRig.params;
    city.nightRig.apply();
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

  }
  function finish() {
    const t = transition;
    Object.assign(city.nightRig.params, t.to);
    activeSky = t.sky;
    scene.background = activeSky.texture;
    scene.environment = activeSky.environment;
    transition = null;
    apply();
  }
  function update(dt) {
    if (!transition) return;
    const t = transition;
    t.elapsed = Math.min(t.seconds, t.elapsed + Math.max(0, dt));
    if (t.elapsed >= t.seconds) { finish(); return; }
    const u = t.elapsed / t.seconds, k = u * u * (3 - 2 * u);
    for (const [key, value] of Object.entries(t.to)) {
      if (key.endsWith('Color')) {
        city.nightRig.params[key] = colorA.setHex(t.from[key]).lerp(colorB.setHex(value), k).getHex();
      } else if (typeof value === 'number') {
        city.nightRig.params[key] = THREE.MathUtils.lerp(t.from[key], value, k);
      } else if (key === 'keyPosition') {
        city.nightRig.params[key] = value.map((v, i) => THREE.MathUtils.lerp(t.from[key][i], v, k));
      }
    }
    skyBlend.update(t.fromSky, t.sky, k);
    scene.background = skyBlend.texture;
    scene.environment = skyBlend.environment;
    apply();
  }
  function setDeliveries(value, { immediate = false } = {}) {
    const progress = dayProgress(value);
    state.deliveries = progress.total;
    set(progress.mode, { seconds: immediate ? 0 : 3, source: 'deliveries' });
    return progress;
  }
  set(state.mode, { source: state.source });

  return {
    state,
    skies,
    set,
    setDeliveries,
    update,
    get transitioning() { return !!transition; },
    get mode() { return state.mode; },
  };
}

/**
 * The fork's night sky: an amber sodium stage instead of the parent's blue
 * storm. Painted from the colour bible's STAGE hexes — near-black warm zenith,
 * brown cloud deck, a hazy key-coloured moon, and a sodium horizon band with
 * sparse neon accents so the PMREM environment carries useful wet-road colour.
 * Same boot-time canvas → equirect → PMREM pipeline as src/world/skybox.js,
 * which cannot host this fork's artwork without touching the shared module.
 */
export function createAmberNightSky(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Warm zenith fading into the fog band, then a dark ground hemisphere. The
  // stops are STAGE.background / a step toward hemiSky / the fog colour itself,
  // so the sky meets the FogExp2 haze at the skyline instead of fighting it.
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, cssHex(STAGE.background));
  grad.addColorStop(0.3, '#150e08');
  grad.addColorStop(0.52, cssHex(STAGE.hemiSky));
  grad.addColorStop(0.66, cssHex(STAGE.fog));
  grad.addColorStop(0.82, '#120b06');
  grad.addColorStop(1, '#060402');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // A moon swallowed by sodium haze, tinted with the rig's key colour: a focal
  // point that justifies the warm directional light without reading as clear.
  const moonX = canvas.width * 0.72;
  const moonY = canvas.height * 0.2;
  const moonGlow = ctx.createRadialGradient(moonX, moonY, 3, moonX, moonY, 80);
  moonGlow.addColorStop(0, 'rgba(255,226,178,0.85)');
  moonGlow.addColorStop(0.12, 'rgba(216,162,94,0.42)');
  moonGlow.addColorStop(0.45, 'rgba(160,110,58,0.10)');
  moonGlow.addColorStop(1, 'rgba(120,80,40,0)');
  ctx.fillStyle = moonGlow;
  ctx.fillRect(moonX - 85, moonY - 85, 170, 170);

  // Seeded cloud puffs, warm-tinted. Each puff repeats one canvas-width to
  // either side, closing the seam where the equirectangular wrap comes around.
  let seed = 0x5e0a2;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  ctx.save();
  ctx.filter = 'blur(18px)';
  for (let layer = 0; layer < 3; layer++) {
    const cloudY = canvas.height * (0.24 + layer * 0.12);
    const alpha = 0.1 + layer * 0.05;
    ctx.fillStyle = `rgba(${44 + layer * 16},${30 + layer * 10},${16 + layer * 6},${alpha})`;
    for (let i = 0; i < 40; i++) {
      const x = rand() * canvas.width;
      const y = cloudY + (rand() - 0.5) * 100;
      const radiusX = 55 + rand() * 125;
      const radiusY = 14 + rand() * 30;
      const tilt = (rand() - 0.5) * 0.18;
      for (const offset of [-canvas.width, 0, canvas.width]) {
        ctx.beginPath();
        ctx.ellipse(x + offset, y, radiusX, radiusY, tilt, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  // Sodium horizon: broad amber glow where the city's street lighting pools
  // under overcast. This band is what tints the far end of every street.
  const horizon = ctx.createLinearGradient(0, canvas.height * 0.56, 0, canvas.height * 0.84);
  horizon.addColorStop(0, 'rgba(255,170,90,0)');
  horizon.addColorStop(0.46, 'rgba(255,158,74,0.20)');
  horizon.addColorStop(1, 'rgba(230,130,62,0)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, canvas.height * 0.56, canvas.width, canvas.height * 0.28);

  // Sparse neon district accents — bible hues only, mostly hidden behind the
  // real buildings but giving PMREM genuinely coloured wet-road reflections.
  const accents = [
    [NEON.red, 0.08], [NEON.gold, 0.2], [NEON.cyan, 0.38],
    [NEON.orange, 0.55], [NEON.magenta, 0.68], [NEON.warmWhite, 0.82],
    [NEON.lime, 0.94],
  ];
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const [color, x] of accents) {
    const glowX = canvas.width * x;
    const glowY = canvas.height * 0.72;
    for (const offset of [-canvas.width, 0, canvas.width]) {
      const px = glowX + offset;
      const glow = ctx.createRadialGradient(px, glowY, 0, px, glowY, 58);
      glow.addColorStop(0, `${cssHex(color)}59`);
      glow.addColorStop(1, `${cssHex(color)}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(px - 60, glowY - 60, 120, 120);
    }
  }
  ctx.restore();

  return finishAmberSky(renderer, canvas);
}

/** Same tail as finishSkybox in skybox.js — kept local because it is unexported there. */
function finishAmberSky(renderer, canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'Seoul Snack Attack amber sodium night skybox';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const environment = pmrem.fromEquirectangular(texture).texture;
  environment.name = 'Seoul Snack Attack amber sodium night environment';
  pmrem.dispose();

  return { texture, environment };
}
