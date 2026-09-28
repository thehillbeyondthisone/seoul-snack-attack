import * as THREE from 'three';
import { assemblyPath } from './building-assembly.js';

const VISUAL_SIZE = 384;
const FRAME_INTERVAL = 1 / 30;
const PRESETS = {
  flow: () => import('butterchurn-presets/presets/converted/flexi - flow.json'),
  liquid: () => import('butterchurn-presets/presets/converted/Geiss - Liquid Beats.json'),
  aurora: () => import('butterchurn-presets/presets/converted/Geiss - Aurora.json'),
};

// Match the level's road centreline, but give the visualizer its own UVs.
// Mirrored repeats meet without a visible cut as the image flows down the road.
function roadFilmGeometry(path, height) {
  const vertices = [], uvs = [], indices = [];
  let distance = 0;
  for (let i = 0; i <= path.length; i++) {
    const index = i % path.length;
    const point = path[index];
    const previous = path[(index + path.length - 1) % path.length];
    const next = path[(index + 1) % path.length];
    const dx = next[0] - previous[0], dz = next[1] - previous[1];
    const length = Math.hypot(dx, dz);
    const nx = -dz / length, nz = dx / length;
    if (i) {
      const last = path[i - 1];
      distance += Math.hypot(point[0] - last[0], point[1] - last[1]);
    }
    for (const [offset, side] of [[-5.9, 0], [5.9, 1]]) {
      vertices.push(point[0] + nx * offset, height, point[1] + nz * offset);
      uvs.push(distance / 18, side);
    }
    if (i < path.length) {
      const j = i * 2;
      indices.push(j, j + 1, j + 2, j + 2, j + 1, j + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export class OverdubVisuals {
  constructor({ scene, city, soundtrack, preset = 'liquid' }) {
    this.scene = scene;
    this.soundtrack = soundtrack;
    this.preset = Object.hasOwn(PRESETS, preset) ? preset : 'liquid';
    this.group = new THREE.Group();
    this.group.name = 'Overdub reactive street';
    this.group.visible = false;
    scene.add(this.group);

    this.canvas = document.createElement('canvas');
    this.canvas.width = VISUAL_SIZE;
    this.canvas.height = VISUAL_SIZE;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.MirroredRepeatWrapping;
    this.roadWash = null;
    this.roadFilm = null;
    this.windows = [];

    if (city.metadata?.stuntFixture) {
      const path = assemblyPath();
      this.roadWash = new THREE.Mesh(
        roadFilmGeometry(path, .058),
        new THREE.MeshBasicMaterial({ color: 0x176b8a, transparent: true,
          depthWrite: false, opacity: 0, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending }),
      );
      this.roadWash.name = 'Overdub road wash';
      this.group.add(this.roadWash);
      this.roadFilm = new THREE.Mesh(
        roadFilmGeometry(path, .063),
        new THREE.MeshBasicMaterial({ map: this.texture, color: 0xd7f4ff,
          transparent: true, depthWrite: false, opacity: 0,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
      );
      this.roadFilm.name = 'Overdub full-road visualizer';
      this.group.add(this.roadFilm);
    }

    for (const [index, lot] of (city.metadata?.placements || [])
      .filter((p) => p.id !== 'service-workshop').slice(0, 10).entries()) {
      const geometry = new THREE.PlaneGeometry(lot.id === 'blue-office' ? 3.1 : 2.4, 1.35);
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, .12 + uv.getX(i) * .55 + index % 3 * .09, .1 + uv.getY(i) * .8);
      }
      const material = new THREE.MeshBasicMaterial({
        map: this.texture, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide, color: 0xffffff,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'Overdub upper window';
      mesh.position.set(lot.x, 6.3, lot.z + (lot.z < 0 ? 5.055 : -5.055));
      mesh.rotation.y = lot.z < 0 ? 0 : Math.PI;
      this.group.add(mesh);
      this.windows.push(mesh);
    }

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(.92, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x91dcff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.ring.name = 'Overdub landing ripple';
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    this.group.add(this.ring);
    this.ringAge = 1;
    this.elapsed = 0;
    this.frames = 0;
    this.bass = 0;
    this.ready = false;
    this.error = null;
  }

  async prepare() {
    if (this.ready) return true;
    if (this.preparing) return this.preparing;
    this.preparing = this._prepare().finally(() => { this.preparing = null; });
    return this.preparing;
  }

  async _prepare() {
    try {
      const audio = this.soundtrack.getVisualizerAudio();
      if (!audio) throw new Error('Cassette audio is unavailable');
      // The published 2.6.7 release renders directly to this WebGL canvas.
      // Keep its drawing buffer for Three's canvas-texture upload in this frame.
      const gl = this.canvas.getContext('webgl2', {
        alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, preserveDrawingBuffer: true,
      });
      if (!gl) throw new Error('WebGL 2 is unavailable');
      const [{ default: butterchurn }, { default: preset }] = await Promise.all([
        import('butterchurn'),
        PRESETS[this.preset](),
      ]);
      this.visualizer = butterchurn.createVisualizer(audio.context, this.canvas, {
        width: VISUAL_SIZE, height: VISUAL_SIZE,
      });
      this.visualizer.connectAudio(audio.node);
      this.visualizer.loadPreset(preset, 0);
      this.analyser = audio.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.frequency = new Uint8Array(this.analyser.frequencyBinCount);
      audio.node.connect(this.analyser);
      this.audioNode = audio.node;
      this.ready = true;
      this.error = null;
      return true;
    } catch (error) {
      this.error = error;
      console.warn('Overdub: MilkDrop surface unavailable; using gentle visuals', error);
      return false;
    }
  }

  onLanding(position) {
    this.ring.position.set(position.x, .095, position.z);
    this.ringAge = 0;
    this.ring.visible = true;
  }

  update(dt, { active, remaining, mode, position, paused = false }) {
    this.group.visible = active && mode !== 'off';
    if (!this.group.visible) return;
    if (paused) return;
    const fade = Math.min(1, remaining / 3);
    if (mode === 'full' && this.ready) {
      this.elapsed += dt;
      if (this.elapsed >= FRAME_INTERVAL) {
        this.elapsed %= FRAME_INTERVAL;
        this.visualizer.render();
        this.frames++;
        this.texture.needsUpdate = true;
        this.analyser.getByteFrequencyData(this.frequency);
        let sum = 0;
        for (let i = 1; i <= 12; i++) sum += this.frequency[i];
        const signal = sum / (12 * 255);
        this.bass += (signal - this.bass) * (signal > this.bass ? .38 : .12);
      }
    }
    const showImage = mode === 'full' && this.ready;
    if (this.roadWash) {
      this.roadWash.visible = mode === 'full';
      this.roadWash.material.opacity = fade * (.12 + this.bass * .1);
    }
    if (this.roadFilm) {
      this.roadFilm.visible = showImage;
      this.roadFilm.material.opacity = fade * (.44 + this.bass * .24);
    }
    for (const mesh of this.windows) {
      const distance = Math.hypot(mesh.position.x - position.x, mesh.position.z - position.z);
      const proximity = 1 - THREE.MathUtils.smoothstep(distance, 35, 65);
      mesh.visible = showImage && proximity > 0;
      mesh.material.opacity = fade * proximity * (.27 + this.bass * .22);
    }
    if (this.ring.visible) {
      this.ringAge = Math.min(1, this.ringAge + dt / .95);
      this.ring.scale.setScalar(1 + this.ringAge * 8);
      this.ring.material.opacity = (1 - this.ringAge) * .52 * fade;
      if (this.ringAge === 1) this.ring.visible = false;
    }
  }

  dispose() {
    if (this.audioNode && this.analyser) this.audioNode.disconnect(this.analyser);
    this.visualizer?.disconnectAudio?.(this.audioNode);
    this.texture.dispose();
    for (const mesh of [this.roadWash, this.roadFilm, ...this.windows, this.ring].filter(Boolean)) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.scene.remove(this.group);
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
