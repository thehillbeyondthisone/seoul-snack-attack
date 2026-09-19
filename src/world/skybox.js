// Procedural 360-degree storm sky and its matching reflection environment.
import * as THREE from 'three';

/**
 * Build the player-facing skybox and a PMREM version for PBR materials.
 * Generated at boot so the game gets a bespoke night sky without shipping a
 * multi-megabyte HDRI. The same artwork drives wet-road reflections.
 */
export function createNightSkybox(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Cold zenith, violet cloud base, then a dark lower hemisphere.
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#01030a');
  grad.addColorStop(0.34, '#071226');
  grad.addColorStop(0.56, '#182746');
  grad.addColorStop(0.72, '#41394e');
  grad.addColorStop(0.82, '#171621');
  grad.addColorStop(1, '#03050a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // A moon mostly swallowed by haze: a focal point without making this rainy
  // night read like a clear, starry sky.
  const moonX = canvas.width * 0.72;
  const moonY = canvas.height * 0.20;
  const moonGlow = ctx.createRadialGradient(moonX, moonY, 3, moonX, moonY, 75);
  moonGlow.addColorStop(0, 'rgba(218,229,255,0.90)');
  moonGlow.addColorStop(0.10, 'rgba(180,202,240,0.50)');
  moonGlow.addColorStop(0.45, 'rgba(100,133,190,0.12)');
  moonGlow.addColorStop(1, 'rgba(70,100,160,0)');
  ctx.fillStyle = moonGlow;
  ctx.fillRect(moonX - 80, moonY - 80, 160, 160);

  // Seeded cloud puffs. Each puff is repeated one canvas-width to either side,
  // closing the seam where the equirectangular texture wraps around the view.
  let seed = 0x5e0a1;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  ctx.save();
  ctx.filter = 'blur(18px)';
  for (let layer = 0; layer < 3; layer++) {
    const cloudY = canvas.height * (0.22 + layer * 0.13);
    const alpha = 0.12 + layer * 0.045;
    ctx.fillStyle = `rgba(${22 + layer * 10},${29 + layer * 12},${48 + layer * 14},${alpha})`;
    for (let i = 0; i < 42; i++) {
      const x = rand() * canvas.width;
      const y = cloudY + (rand() - 0.5) * 105;
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

  // Low city haze: broad sodium glow plus sparse neon districts. The accents
  // are mostly hidden by buildings, but give PMREM useful wet-road colour.
  const horizon = ctx.createLinearGradient(0, canvas.height * 0.60, 0, canvas.height * 0.86);
  horizon.addColorStop(0, 'rgba(255,158,88,0)');
  horizon.addColorStop(0.48, 'rgba(255,152,86,0.16)');
  horizon.addColorStop(1, 'rgba(255,132,70,0)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, canvas.height * 0.60, canvas.width, canvas.height * 0.27);

  const accents = [
    ['#ff2d78', 0.08, 0.72], ['#ffb04d', 0.20, 0.68],
    ['#4dc8ff', 0.38, 0.74], ['#ff8a55', 0.55, 0.69],
    ['#b04dff', 0.68, 0.73], ['#ffd35c', 0.82, 0.68],
    ['#37d6a0', 0.94, 0.74],
  ];
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const [color, x, y] of accents) {
    for (const offset of [-canvas.width, 0, canvas.width]) {
      const glowX = canvas.width * x + offset;
      const glow = ctx.createRadialGradient(
        glowX, canvas.height * y, 0,
        glowX, canvas.height * y, 58
      );
      glow.addColorStop(0, `${color}66`);
      glow.addColorStop(1, `${color}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(glowX - 60, canvas.height * y - 60, 120, 120);
    }
  }
  ctx.restore();

  return finishSkybox(renderer, canvas, 'Seoul storm night');
}

/** Bright, lightly overcast Seoul afternoon for the daytime preset. */
export function createDaySkybox(renderer, mode = 'day') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  const palette = {
    day: ['#3f73a7', '#79a8ca', '#bdd4df', '#d8d2c3', '#8d9691', '#39423f'],
    morning: ['#565884', '#ac96b1', '#e7bba9', '#f3d0aa', '#978a88', '#443e46'],
    dusk: ['#1c183c', '#644968', '#c68073', '#efaf7b', '#65474e', '#1f192c'],
  }[mode];
  [0, .38, .62, .76, .86, 1].forEach((stop, i) => grad.addColorStop(stop, palette[i]));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Warm sun diffused through humid cloud cover.
  const sunX = canvas.width * (mode === 'morning' ? .25 : .70);
  const sunY = canvas.height * (mode === 'day' ? .19 : .43);
  const sun = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 105);
  sun.addColorStop(0, 'rgba(255,250,224,1)');
  sun.addColorStop(0.08, 'rgba(255,239,190,0.88)');
  sun.addColorStop(0.28, 'rgba(255,222,155,0.34)');
  sun.addColorStop(1, 'rgba(255,215,150,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(sunX - 110, sunY - 110, 220, 220);

  let seed = 0x5e0d4;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  // White cloud tops and cooler undersides share the night sky's seamless
  // three-copy technique, so turning the camera never reveals a panorama edge.
  ctx.save();
  ctx.filter = 'blur(15px)';
  const cloudLayers = [
    { y: 0.24, rgb: '235,242,244', alpha: 0.23, count: 32 },
    { y: 0.39, rgb: '175,192,202', alpha: 0.20, count: 38 },
    { y: 0.53, rgb: '132,151,163', alpha: 0.13, count: 28 },
  ];
  for (const layer of cloudLayers) {
    ctx.fillStyle = `rgba(${mode === 'dusk' ? '140,98,126' : layer.rgb},${layer.alpha})`;
    for (let i = 0; i < layer.count; i++) {
      const x = rand() * canvas.width;
      const y = canvas.height * layer.y + (rand() - 0.5) * 88;
      const radiusX = 52 + rand() * 118;
      const radiusY = 13 + rand() * 27;
      const tilt = (rand() - 0.5) * 0.15;
      for (const offset of [-canvas.width, 0, canvas.width]) {
        ctx.beginPath();
        ctx.ellipse(x + offset, y, radiusX, radiusY, tilt, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  // Warm urban haze at the horizon supplies subtle cream reflections without
  // drawing an artificial skyline behind the real city geometry.
  const haze = ctx.createLinearGradient(0, canvas.height * 0.61, 0, canvas.height * 0.84);
  haze.addColorStop(0, 'rgba(255,230,184,0)');
  haze.addColorStop(0.48, 'rgba(255,224,174,0.18)');
  haze.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, canvas.height * 0.61, canvas.width, canvas.height * 0.23);

  return finishSkybox(renderer, canvas, `Seoul ${mode}`);
}

/** Lazily build each environment once, then keep it for instant later switches. */
export function createTimeSkyboxes(renderer) {
  // Accessors keep the public API unchanged while generating only the active
  // preset at boot. The alternate PMREM is paid for on the first explicit
  // day/night switch instead of doubling startup GPU work for every player.
  const cache = {};
  return Object.defineProperties({}, {
    night: {
      enumerable: true,
      get() { return cache.night || (cache.night = createNightSkybox(renderer)); },
    },
    day: {
      enumerable: true,
      get() { return cache.day || (cache.day = createDaySkybox(renderer)); },
    },
  });
}

function finishSkybox(renderer, canvas, label) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `Procedural ${label} skybox`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const environment = pmrem.fromEquirectangular(texture).texture;
  environment.name = `Procedural ${label} environment`;
  pmrem.dispose();

  return { texture, environment };
}
