import * as THREE from 'three';

const VISUAL_SIZE = 384;
const FRAME_INTERVAL = 1 / 30;
const PRESETS = {
  flow: () => import('butterchurn-presets/presets/converted/flexi - flow.json'),
  liquid: () => import('butterchurn-presets/presets/converted/Geiss - Liquid Beats.json'),
  aurora: () => import('butterchurn-presets/presets/converted/Geiss - Aurora.json'),
};

function featherMask() {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
    const edge = THREE.MathUtils.smoothstep(radius, .48, .98);
    const value = Math.round(255 * (1 - edge));
    const offset = (y * size + x) * 4;
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
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
    this.mask = featherMask();
    this.puddles = [];
    this.windows = [];

    const road = city.metadata?.stuntFixture?.line;
    if (road) {
      const positions = [
        [road.approachX - 27, -3.8, 3.6, 1.3],
        [road.approachX - 5, 3.7, 2.8, 1.1],
        [road.rampX - 1, 3.8, 4.2, 1.5],
        [road.rampX - 2, -4.1, 4.3, 1.55],
        [road.landingX - 3, -3.8, 3.8, 1.35],
        [road.landingX + 8, -3.8, 3.9, 1.4],
        [road.landingX + 31, 3.8, 3.3, 1.2],
      ];
      for (const [x, z, width, depth] of positions) {
        const material = new THREE.MeshBasicMaterial({
          map: this.texture, alphaMap: this.mask, transparent: true,
          depthWrite: false, side: THREE.DoubleSide, opacity: 0, color: 0xffffff,
          blending: THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), material);
        mesh.name = 'Overdub puddle';
        mesh.position.set(x, .078, z);
        mesh.scale.set(width, 1, depth);
        mesh.renderOrder = 2;
        this.group.add(mesh);
        this.puddles.push(mesh);
        // A fine neon edge makes the cassette's presence legible even during
        // a quiet passage of music; the MilkDrop image remains the fill.
        const edge = new THREE.Mesh(
          new THREE.RingGeometry(.91, 1, 64).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0x41d8ec, transparent: true,
            opacity: 0, depthWrite: false, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending }),
        );
        edge.name = 'Overdub puddle edge';
        edge.position.set(x, .082, z);
        edge.scale.set(width, 1, depth);
        edge.renderOrder = 3;
        this.group.add(edge);
        this.edges ??= [];
        this.edges.push(edge);
      }
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
    for (const mesh of [...this.puddles, ...this.windows]) {
      const distance = Math.hypot(mesh.position.x - position.x, mesh.position.z - position.z);
      const proximity = 1 - THREE.MathUtils.smoothstep(distance, 35, 65);
      mesh.visible = showImage && proximity > 0;
      mesh.material.opacity = mesh.name === 'Overdub puddle'
        ? fade * proximity * (.55 + this.bass * .4)
        : fade * proximity * (.27 + this.bass * .22);
    }
    for (const mesh of this.edges || []) {
      const distance = Math.hypot(mesh.position.x - position.x, mesh.position.z - position.z);
      const proximity = 1 - THREE.MathUtils.smoothstep(distance, 35, 65);
      mesh.visible = showImage && proximity > 0;
      mesh.material.opacity = fade * proximity * (.45 + this.bass * .45);
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
    this.mask.dispose();
    for (const mesh of [...this.puddles, ...(this.edges || []), ...this.windows, this.ring]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.scene.remove(this.group);
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
