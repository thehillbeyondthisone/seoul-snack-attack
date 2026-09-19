import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// The blurred scene background already uses PMREM, so one blended atlas drives
// both sky and reflections. One fullscreen draw, with no per-frame PMREM bake.
export function createSkyBlend(renderer, sky) {
  const source = sky.environment;
  const target = new THREE.WebGLRenderTarget(source.image.width, source.image.height, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
  });
  target.texture.mapping = source.mapping;
  target.texture.name = 'Delivery cycle sky and reflections';
  const material = new THREE.ShaderMaterial({
    uniforms: { from: { value: null }, to: { value: null }, blend: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D from; uniform sampler2D to; uniform float blend; varying vec2 vUv; void main(){gl_FragColor=mix(texture2D(from,vUv),texture2D(to,vUv),blend);}',
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const quad = new FullScreenQuad(material);
  return {
    texture: target.texture, environment: target.texture,
    update(from, to, blend) {
      const previous = renderer.getRenderTarget();
      try {
        material.uniforms.from.value = from.environment;
        material.uniforms.to.value = to.environment;
        material.uniforms.blend.value = blend;
        renderer.setRenderTarget(target);
        quad.render(renderer);
      } finally { renderer.setRenderTarget(previous); }
    },
  };
}
