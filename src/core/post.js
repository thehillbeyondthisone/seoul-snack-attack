// Seoul Delivery — post-processing: bloom for neon + output pass.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { NIGHT } from '../world/lighting.js';

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.scale = 1.0;
    this.enabled = true;

    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    // Threshold sits above 1.0 so only genuinely hot pixels bloom — at 0.85 a
    // merely bright sign crossed it and smeared into a white disc. The wider
    // radius makes what does bloom read as a soft halo. See world/lighting.js.
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      NIGHT.bloomStrength,
      NIGHT.bloomRadius,
      NIGHT.bloomThreshold
    );
    this.output = new OutputPass();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    this.composer.setSize(Math.round(width * this.scale), Math.round(height * this.scale));
  }

  setScale(s) {
    this.scale = THREE.MathUtils.clamp(s, 0.5, 1.5);
    if (this.width) this.setSize(this.width, this.height);
  }

  setBloom(on) {
    this.bloom.enabled = on;
  }

  setBloomStrength(v) {
    this.bloom.strength = v;
  }

  render(dt) {
    if (this.enabled) {
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
