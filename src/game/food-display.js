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

  async setOrder(order) {
    const request = ++this._request;
    this._moveToMarker();
    this.root.clear();
    this.root.visible = false;
    this.models = [];
    const specs = foodModelsForOrder(order);
    if (!specs.length) return;

    try {
      const sources = await Promise.all(specs.map(loadFoodModel));
      if (request !== this._request) return;
      const targetSize = specs.length > 1 ? 0.64 : 0.9;
      const spacing = specs.length > 1 ? 0.72 : 0;
      this.models = sources.map((source, index) => {
        const model = source.clone(true);
        model.name = `food_${specs[index].id}`;
        normalizeModel(model, targetSize);
        model.position.x += (index - (specs.length - 1) * 0.5) * spacing;
        this.root.add(model);
        return model;
      });
      this.root.userData.foodModelId = specs[0].id;
      this.root.userData.foodModelIds = specs.map((spec) => spec.id);
      this.root.visible = this._enabled;
      console.log(`food display: ${specs.map((spec) => spec.id).join(' + ')} loaded on demand`);
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
