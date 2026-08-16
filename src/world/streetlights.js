// Seoul Delivery — streetlight pool.
//
// One PointLight per lamp does not survive tiling: 12 lamps x 15 tiles = 180
// lights, and three's forward renderer puts EVERY light in EVERY shader, so
// that is a shader-compile explosion and a 180-long per-fragment loop.
//
// Instead: a fixed pool of real lights that chases the nearest anchors, plus a
// single additive quad per anchor for the glow pool on the asphalt. The lit
// radius is constant-cost, and the glow — which is what actually sells wet
// asphalt at night — is one draw call for the whole city.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const RETARGET_INTERVAL = 0.25; // s between nearest-anchor searches
const FADE_RATE = 3.5;          // intensity units per second, normalized

export class StreetlightPool {
  /**
   * @param {THREE.Scene} scene
   * @param {object} [opts]
   */
  constructor(scene, {
    size = 8, range = 36, intensity = 120, color = 0xffc98a,
    lampHeight = 6.5, glowRadius = 3.2, glowOpacity = 0.11,
  } = {}) {
    this.scene = scene;
    this.range = range;
    this.intensity = intensity;
    this.enabled = true;
    this.lampHeight = lampHeight;
    this.defaultColor = color;
    this.anchors = [];
    this.colors = [];
    this.glowColors = [];
    this._timer = 0;
    this._order = [];
    this.activeCount = size;

    this.lights = [];
    for (let i = 0; i < size; i++) {
      const lamp = new THREE.PointLight(color, 0, range, 2);
      lamp.visible = false;
      scene.add(lamp);
      // anchorIndex: which anchor this light currently owns (-1 = free)
      this.lights.push({ lamp, anchorIndex: -1, level: 0 });
    }

    // ---- Glow pools: one instanced additive quad per anchor ---------------
    this.glowMat = new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      color: 0xffffff, // per-instance colour multiplies this — keep it neutral
      transparent: true,
      opacity: glowOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.glowGeo = new THREE.PlaneGeometry(glowRadius * 2, glowRadius * 2);
    this.glowGeo.rotateX(-Math.PI / 2);
    this.glow = null;
  }

  /**
   * @param {Array<THREE.Vector3|{position:THREE.Vector3,lamp?:number,glow?:number}>} list
   * World-space points ON the road. Lamps are lifted to `lampHeight`; the glow
   * pool stays on the asphalt. Per-anchor colours let each city tile carry its
   * own colour temperature — see blockPalette() in lighting.js.
   */
  setAnchors(list) {
    const ground = list.map((a) => (a.position ? a.position : a));
    this.colors = list.map((a) => (a.lamp !== undefined ? a.lamp : this.defaultColor));
    this.glowColors = list.map((a) => (a.glow !== undefined ? a.glow : this.defaultColor));
    const anchors = ground.map((p) => new THREE.Vector3(p.x, p.y + this.lampHeight, p.z));
    this.anchors = anchors;
    this.ground = ground;
    this._order = anchors.map((_, i) => i);
    for (const l of this.lights) { l.anchorIndex = -1; l.level = 0; l.lamp.visible = false; }

    if (this.glow) {
      this.scene.remove(this.glow);
      this.glow.dispose();
      this.glow = null;
    }
    if (!anchors.length) return;

    // One glow quad PER POOL LIGHT, not per anchor. A pool of light on the road
    // with no lit lamp above it is nonsense, and against a properly dark road
    // 180 static additive quads read as flat elliptical discs rather than light.
    // These now follow the lights and fade with them.
    const glow = new THREE.InstancedMesh(this.glowGeo, this.glowMat, this.lights.length);
    glow.frustumCulled = false;
    glow.renderOrder = 2;
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.lights.length; i++) {
      m.makeTranslation(0, -9999, 0); // parked until the light claims an anchor
      glow.setMatrixAt(i, m);
      glow.setColorAt(i, new THREE.Color(0, 0, 0));
    }
    glow.instanceMatrix.needsUpdate = true;
    if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
    this.scene.add(glow);
    this.glow = glow;
    this.glow.count = this.activeCount;
  }

  /** Change the active light budget without rebuilding the pool. */
  setActiveCount(count) {
    this.activeCount = Math.max(0, Math.min(this.lights.length, Math.round(count)));
    for (let i = this.activeCount; i < this.lights.length; i++) {
      this.lights[i].anchorIndex = -1;
      this.lights[i].level = 0;
      this.lights[i].lamp.intensity = 0;
      this.lights[i].lamp.visible = false;
    }
    if (this.glow) this.glow.count = this.activeCount;
    this._timer = 0;
  }

  update(dt, cameraPos) {
    if (!this.anchors.length) return;

    this._timer -= dt;
    if (this._timer <= 0) {
      this._timer = RETARGET_INTERVAL;
      this._retarget(cameraPos);
    }

    // Cross-fade so a retarget never pops.
    const c = new THREE.Color();
    let glowDirty = false;
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const target = this.enabled && i < this.activeCount && l.anchorIndex >= 0 ? 1 : 0;
      if (l.level !== target) {
        l.level = target > l.level
          ? Math.min(target, l.level + FADE_RATE * dt)
          : Math.max(target, l.level - FADE_RATE * dt);
      }
      l.lamp.intensity = this.intensity * l.level;
      l.lamp.visible = l.level > 0.001;

      if (!this.glow) continue;
      const g = l.anchorIndex >= 0 ? this.ground[l.anchorIndex] : null;
      if (g && l.level > 0.001) {
        _m.makeTranslation(g.x, g.y + 0.04, g.z);
        c.setHex(this.glowColors[l.anchorIndex]).multiplyScalar(l.level);
      } else {
        _m.makeTranslation(0, -9999, 0);
        c.setRGB(0, 0, 0);
      }
      this.glow.setMatrixAt(i, _m);
      this.glow.setColorAt(i, c);
      glowDirty = true;
    }
    if (glowDirty) {
      this.glow.instanceMatrix.needsUpdate = true;
      if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
    }
  }

  _retarget(cameraPos) {
    const anchors = this.anchors;
    const order = this._order;
    // Partial-ish selection: full sort is fine at a few hundred anchors and
    // only runs 4x a second.
    order.sort((a, b) => anchors[a].distanceToSquared(cameraPos) - anchors[b].distanceToSquared(cameraPos));

    const wanted = new Set();
    for (let i = 0; i < this.activeCount && i < order.length; i++) wanted.add(order[i]);

    // Keep lights already on a wanted anchor (hysteresis — avoids thrashing
    // two lights back and forth across a tie).
    const taken = new Set();
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      if (i >= this.activeCount) { l.anchorIndex = -1; continue; }
      if (l.anchorIndex >= 0 && wanted.has(l.anchorIndex)) taken.add(l.anchorIndex);
      else l.anchorIndex = -1;
    }
    const free = [...wanted].filter((i) => !taken.has(i));
    let f = 0;
    for (let i = 0; i < this.activeCount; i++) {
      const l = this.lights[i];
      if (l.anchorIndex >= 0 || f >= free.length) continue;
      l.anchorIndex = free[f++];
      l.lamp.position.copy(anchors[l.anchorIndex]);
      l.lamp.color.setHex(this.colors[l.anchorIndex]);
    }
  }

  dispose() {
    for (const l of this.lights) this.scene.remove(l.lamp);
    if (this.glow) { this.scene.remove(this.glow); this.glow.dispose(); }
    this.glowGeo.dispose();
    this.glowMat.map?.dispose();
    this.glowMat.dispose();
  }
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  // Long, soft tail. A steep falloff gives the quad a visible elliptical edge
  // once the road is genuinely dark, which reads as a decal rather than light.
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.62)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.24)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
