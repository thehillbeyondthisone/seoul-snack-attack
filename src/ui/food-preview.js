// Small self-contained 3D preview of the ordered dish, shown inside the HUD
// pickup ticket. Owns its own renderer and rAF loop so the HUD stays DOM-only;
// the loop runs only while the preview is visible.
import * as THREE from 'three';
import { foodModelsForOrder, loadFoodModel } from '../game/food-display.js';

// Keep in sync with `#hud3 .ticket.has-dish .dish-view` height in hud3.js — the
// renderer size is fixed, so a CSS box of a different height letterboxes or
// crops the canvas rather than scaling it.
const SIZE = 62;

export class FoodPreview {
  /** @param {HTMLElement} container element the canvas mounts into. */
  constructor(container) {
    this.container = container;
    this.available = true;
    try {
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    } catch (error) {
      console.warn('food preview: WebGL unavailable, hiding preview:', error);
      this.available = false;
      container.style.display = 'none';
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(SIZE, SIZE);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(2, 4, 3);
    this.scene.add(key);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
    this.camera.position.set(0, 0.55, 1.9);
    this.camera.lookAt(0, 0.3, 0);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this._request = 0;
    this._raf = 0;
    this._last = 0;
  }

  async setOrder(order) {
    const request = ++this._request;
    if (!this.available) return;
    this.root.clear();
    const specs = foodModelsForOrder(order);
    if (!specs.length) { this.stop(); return; }

    try {
      const sources = await Promise.all(specs.map(loadFoodModel));
      if (request !== this._request) return;
      const targetSize = specs.length > 1 ? 0.5 : 0.7;
      const spacing = specs.length > 1 ? 0.55 : 0;
      specs.forEach((spec, index) => {
        const model = sources[index].clone(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const largest = Math.max(size.x, size.y, size.z, 1e-4);
        model.scale.multiplyScalar(targetSize / largest);
        box.setFromObject(model);
        const centre = box.getCenter(new THREE.Vector3());
        model.position.x -= centre.x;
        model.position.y -= box.min.y;
        model.position.z -= centre.z;
        model.position.x += (index - (specs.length - 1) * 0.5) * spacing;
        this.root.add(model);
      });
      this.start();
    } catch (error) {
      console.warn('food preview failed to load:', error);
    }
  }

  start() {
    if (!this.available || this._raf) return;
    this._last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - this._last) / 1000, 0.1);
      this._last = now;
      this.root.rotation.y += dt * 0.8;
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    if (!this._raf) return;
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  clear() {
    this._request++;
    this.stop();
    if (this.available) this.root.clear();
  }
}
