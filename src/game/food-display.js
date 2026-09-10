// On-demand pickup props shown at the shop and above the delivery vehicle.
// Dish data supplies catalog IDs, so single items and meal-kit combinations use
// exactly the same customer-facing menu source.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE_URL = import.meta.env?.BASE_URL || '/';
const MODEL_SPECS = [
  ['jin-ramen-cup', 'jin-ramen-cup.glb'],
  ['buldak-cup', 'buldak-cup.glb'],
  ['samyang-cup', 'samyang-cup.glb'],
  ['ramen-pack', 'ramen-pack.glb'],
  ['dakggochi', 'dakggochi.glb'],
  ['korean-cans', 'korean-cans.glb'],
  ['luncheon-meat', 'luncheon-meat.glb'],
  ['roka-sauce', 'roka-sauce.glb'],
  ['ssamjang', 'ssamjang.glb'],
  ['gochujang', 'gochujang.glb'],
  ['soju-bottle', 'soju-bottle.glb'],
  ['packaged-rice', 'packaged-rice.glb'],
  ['tteokbokki-cup', 'tteokbokki-cup.glb'],
  ['hotteok', 'hotteok.glb'],
  ['banana-milk', 'banana-milk.glb'],
  ['soondae-platter', 'soondae-platter.glb'],
].map(([id, file]) => ({ id, url: `${BASE_URL}assets/food/${file}` }));
const MODEL_BY_ID = new Map(MODEL_SPECS.map((spec) => [spec.id, spec]));

const loader = new GLTFLoader();
const cache = new Map();

export function foodModelForOrder(order) {
  return foodModelsForOrder(order)[0] || null;
}

export function foodModelsForOrder(order) {
  return (order?.dish?.models || []).map((id) => MODEL_BY_ID.get(id)).filter(Boolean);
}

export function loadFoodModel(spec) {
  if (!cache.has(spec.id)) {
    const pending = loader.loadAsync(spec.url)
      .then((gltf) => gltf.scene)
      .catch((error) => {
        cache.delete(spec.id);
        throw error;
      });
    cache.set(spec.id, pending);
  }
  return cache.get(spec.id);
}

const templates = new Map();

/** Normalized cloneable original, largest dimension = 1. Built once per dish. */
export async function foodTemplate(spec) {
  if (!templates.has(spec.id)) {
    templates.set(spec.id, loadFoodModel(spec).then((source) => {
      const model = source.clone(true);
      normalizeModel(model, 1);
      return model;
    }).catch((error) => {
      templates.delete(spec.id);
      throw error;
    }));
  }
  return templates.get(spec.id);
}

let activeWarmup = null;
const gpuReady = new Set();
const gpuWaiters = new Map();

function markFoodGpuReady(id) {
  gpuReady.add(id);
  for (const resolve of gpuWaiters.get(id) || []) resolve();
  gpuWaiters.delete(id);
}

function waitForFoodGpu(spec) {
  if (gpuReady.has(spec.id) || !activeWarmup) return Promise.resolve();
  return new Promise((resolve) => {
    if (!gpuWaiters.has(spec.id)) gpuWaiters.set(spec.id, []);
    gpuWaiters.get(spec.id).push(resolve);
  });
}

function scheduleIdle(callback) {
  if (typeof requestIdleCallback === 'function') {
    // Some continuously-rendering browsers starve idle callbacks even with a
    // timeout. Race the real idle slot against a short timer so the catalog is
    // guaranteed to make progress while still preferring genuinely idle time.
    const handle = { kind: 'race', idle: 0, timer: 0, done: false };
    const run = () => {
      if (handle.done) return;
      handle.done = true;
      cancelIdleCallback(handle.idle);
      clearTimeout(handle.timer);
      callback();
    };
    handle.idle = requestIdleCallback(run);
    handle.timer = setTimeout(run, 250);
    return handle;
  }
  return { kind: 'timer', id: setTimeout(() => callback(), 32) };
}

function cancelScheduled(handle) {
  if (!handle) return;
  if (handle.kind === 'race') {
    handle.done = true;
    cancelIdleCallback(handle.idle);
    clearTimeout(handle.timer);
  } else if (handle.kind === 'idle') cancelIdleCallback(handle.id);
  else clearTimeout(handle.id);
}

/**
 * Load, decode, compile, and upload one food model per browser idle slice.
 * The tiny offscreen render is important: compile() alone does not upload the
 * geometry and textures that caused the first-visible-frame pickup hitch.
 */
export function startFoodBackgroundWarmup(renderer, scene) {
  activeWarmup?.stop();

  const queue = [...MODEL_SPECS];
  const warmed = new Set();
  const inFlight = new Set();
  const target = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true });
  target.texture.name = 'food_warmup_target';
  const warmScene = new THREE.Scene();
  warmScene.fog = scene.fog;
  warmScene.environment = scene.environment;
  warmScene.add(new THREE.HemisphereLight(0xffffff, 0x303030, 1));
  const warmKey = new THREE.DirectionalLight(0xffffff, 1);
  warmKey.position.set(2, 3, 2);
  warmScene.add(warmKey);
  const root = new THREE.Group();
  root.name = 'food_gpu_warmup';
  warmScene.add(root);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 8);
  camera.position.set(0, 0.55, 2.4);
  camera.lookAt(0, 0.55, 0);
  let stopped = false;
  let scheduled = null;

  const renderTemplate = (template) => {
    root.clear();
    root.add(template.clone(true));
    root.updateMatrixWorld(true);

    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace?.() ?? 0;
    const previousLevel = renderer.getActiveMipmapLevel?.() ?? 0;
    const xrEnabled = renderer.xr.enabled;
    try {
      renderer.xr.enabled = false;
      // Compile against gameplay's actual lighting context without traversing
      // the entire city, then use the tiny scene for the real upload draw.
      renderer.compile(root, camera, scene);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(warmScene, camera);
    } finally {
      renderer.setRenderTarget(previousTarget, previousFace, previousLevel);
      renderer.xr.enabled = xrEnabled;
      root.clear();
    }
  };

  const scheduleNext = () => {
    if (stopped || scheduled || queue.length === 0) {
      if (!stopped && queue.length === 0) {
        warmScene.remove(root);
        target.dispose();
        if (activeWarmup === controller) activeWarmup = null;
        console.log(`food warmup: ${warmed.size}/${MODEL_SPECS.length} models GPU-ready`);
      }
      return;
    }
    scheduled = scheduleIdle(async () => {
      scheduled = null;
      if (stopped) return;
      const spec = queue.shift();
      inFlight.add(spec.id);
      try {
        const template = await foodTemplate(spec);
        // Loading may resume as soon as fetch/decode finishes. Yield once more
        // before the GPU work so it never lands in the middle of a game frame.
        scheduled = scheduleIdle(() => {
          scheduled = null;
          if (stopped) return;
          try {
            renderTemplate(template);
            warmed.add(spec.id);
            markFoodGpuReady(spec.id);
            console.debug(`food warmup: ${spec.id} (${warmed.size}/${MODEL_SPECS.length})`);
          } catch (error) {
            // Do not leave an accepted order invisible forever if a warm-up
            // render fails; normal gameplay rendering remains the fallback.
            markFoodGpuReady(spec.id);
            console.warn(`food GPU warmup failed for ${spec.id}:`, error);
          } finally {
            inFlight.delete(spec.id);
            scheduleNext();
          }
        });
      } catch (error) {
        inFlight.delete(spec.id);
        console.warn(`food warmup failed for ${spec.id}:`, error);
        scheduleNext();
      }
    });
  };

  const controller = {
    prioritize(specs) {
      const wanted = specs.filter((spec) => !warmed.has(spec.id) && !inFlight.has(spec.id));
      for (let i = wanted.length - 1; i >= 0; i--) {
        const spec = wanted[i];
        const index = queue.findIndex((item) => item.id === spec.id);
        if (index >= 0) queue.splice(index, 1);
        queue.unshift(spec);
        // Begin network/decode immediately during the offer card; the queued
        // idle render still controls when GPU work occurs.
        foodTemplate(spec).catch(() => {});
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      cancelScheduled(scheduled);
      scheduled = null;
      warmScene.remove(root);
      target.dispose();
      if (activeWarmup === controller) activeWarmup = null;
    },
  };

  activeWarmup = controller;
  scheduleNext();
  return controller;
}

function prepareFoodOrder(order) {
  const specs = foodModelsForOrder(order);
  activeWarmup?.prioritize(specs);
  return Promise.all(specs.map((spec) => foodTemplate(spec).catch(() => null)));
}

function normalizeModel(model, targetSize) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 1e-4);
  model.scale.multiplyScalar(targetSize / largest);

  // Re-measure after scale, then centre it over the beacon and rest its base at
  // local Y=0. A wrapper supplies the hover height and animation.
  box.setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.x -= centre.x;
  model.position.y -= box.min.y;
  model.position.z -= centre.z;
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
  });
}

export class FoodDisplay {
  constructor(marker, scene) {
    this.marker = marker;
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'delivery_food_display';
    this.root.visible = false;
    marker.add(this.root);
    this.models = [];
    this._request = 0;
    this._time = 0;
    this._mode = 'marker';
    this._enabled = true;
  }

  /** Start the offered dish before acceptance and move it to the front of GPU warm-up. */
  prepareOrder(order) {
    return prepareFoodOrder(order);
  }

  async setOrder(order) {
    const request = ++this._request;
    this._moveToMarker();
    this.root.clear();
    this.root.visible = false;
    this.models = [];
    const specs = foodModelsForOrder(order);
    if (!specs.length) return;

    try {
      const sources = await Promise.all(specs.map(foodTemplate));
      // Never make the first visible pickup frame pay for GPU upload. A very
      // fast accept may wait briefly for its prioritized idle warm-up, while
      // the order state and navigation continue immediately.
      await Promise.all(specs.map(waitForFoodGpu));
      if (request !== this._request) return;
      const targetSize = specs.length > 1 ? 0.64 : 0.9;
      const spacing = specs.length > 1 ? 0.72 : 0;
      this.models = sources.map((source, index) => {
        const model = source.clone(true);
        model.name = `food_${specs[index].id}`;
        model.scale.multiplyScalar(targetSize);
        model.position.x += (index - (specs.length - 1) * 0.5) * spacing;
        this.root.add(model);
        return model;
      });
      this.root.userData.foodModelId = specs[0].id;
      this.root.userData.foodModelIds = specs.map((spec) => spec.id);
      this.root.visible = this._enabled;
      console.log(`food display: ${specs.map((spec) => spec.id).join(' + ')} GPU-ready`);
    } catch (error) {
      console.warn(`food display failed to load ${specs.map((spec) => spec.id).join(' + ')}:`, error);
    }
  }

  followVehicle(position) {
    this._mode = 'vehicle';
    if (this.root.parent !== this.scene) this.scene.add(this.root);
    if (position) this.root.position.copy(position).add(_vehicleHover);
  }

  _moveToMarker() {
    this._mode = 'marker';
    if (this.root.parent !== this.marker) this.marker.add(this.root);
    this.root.position.set(0, 0.55, 0);
  }

  setEnabled(enabled) {
    this._enabled = !!enabled;
    this.root.visible = this._enabled && this.models.length > 0;
  }

  update(dt, vehiclePosition = null) {
    if (!this.models.length || !this.root.visible) return;
    this._time += dt;
    this.root.rotation.y += dt * 0.8;
    const bob = Math.sin(this._time * 2.7) * 0.12;
    if (this._mode === 'vehicle' && vehiclePosition) {
      _followTarget.copy(vehiclePosition).add(_vehicleHover);
      _followTarget.y += bob;
      this.root.position.lerp(_followTarget, 1 - Math.exp(-dt * 11));
    } else {
      this.root.position.set(0, 0.55 + bob, 0);
    }
  }

  clear() {
    this._request++;
    this.root.clear();
    this.root.visible = false;
    this.root.userData.foodModelId = null;
    this.root.userData.foodModelIds = null;
    this.models = [];
  }
}

const _vehicleHover = new THREE.Vector3(0, 3.15, 0);
const _followTarget = new THREE.Vector3();
