// Seoul Snack Attack — rain: instanced streaks + splash rings, wet-look + fog + grip hooks.
import * as THREE from 'three';

const MAX_DROPS = 1500;
const MAX_SPLASHES = 140;
const VOLUME = new THREE.Vector3(34, 26, 34); // recycling box around camera
const LEVELS = { off: 0, light: 550, heavy: MAX_DROPS };

export class Rain {
  constructor(scene) {
    this.scene = scene;
    this.level = 'light';
    this.wetness = 0;          // eased 0..1, drives wet look / fog / grip
    this.wind = new THREE.Vector3(-2.2, 0, 1.1);
    this.baseFog = 0.012;
    this.densityScale = 1;        // continuous multiplier on the level preset
    this.wetnessOverride = null;  // null = follow the rain; 0..1 = force it
    this.wetnessResponse = 0.6;   // how fast the road dries / soaks
    this.fogWetBoost = 0.7;       // extra fog density per unit of wetness

    // ---- Streaks: thin stretched cylinders -----------------------------
    const dropGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.7, 3, 1, true);
    const dropMat = new THREE.MeshBasicMaterial({
      color: 0xc3d6f2, transparent: true, opacity: 0.5,
      depthWrite: false, fog: true,
    });
    this.drops = new THREE.InstancedMesh(dropGeo, dropMat, MAX_DROPS);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.frustumCulled = false;
    scene.add(this.drops);

    this.dropData = [];
    for (let i = 0; i < MAX_DROPS; i++) {
      this.dropData.push({
        pos: new THREE.Vector3(
          (Math.random() - 0.5) * VOLUME.x,
          Math.random() * VOLUME.y,
          (Math.random() - 0.5) * VOLUME.z
        ),
        speed: 16 + Math.random() * 8,
      });
    }

    // ---- Splash rings on the ground ------------------------------------
    // A splash is a few centimetres across, not a metre. At the old size and a
    // flat 0.5 opacity for its whole life these read as grey ellipses drawn on
    // the road. Now: thinner ring, much smaller, additive, and faded out via
    // per-instance colour as it expands.
    const ringGeo = new THREE.RingGeometry(0.72, 1, 14);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    this.splashes = new THREE.InstancedMesh(ringGeo, ringMat, MAX_SPLASHES);
    this.splashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.splashes.frustumCulled = false;
    scene.add(this.splashes);
    this.splashData = Array.from({ length: MAX_SPLASHES }, () => ({ age: 99, pos: new THREE.Vector3() }));
    this.splashClock = 0;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._c = new THREE.Color();
    this._groundY = null;
  }

  /** Extra context after world/physics exist. */
  bind({ city, physics }) {
    this.city = city;
    this.physics = physics;
    this.baseFog = city?.fog?.density ?? this.baseFog;
  }

  setLevel(level) {
    if (level in LEVELS) this.level = level;
  }

  get intensity() {
    return LEVELS[this.level] / MAX_DROPS;
  }

  update(dt, camera) {
    const active = Math.round(LEVELS[this.level] * this.densityScale);
    // `wetnessOverride` decouples the road's wet look from the rain itself, so
    // you can shoot a wet street under a clear sky (the classic noir look) or
    // dial the surface response independently while art-directing.
    const targetWet = this.wetnessOverride != null
      ? this.wetnessOverride
      : (active > 0 ? (this.level === 'heavy' ? 1 : 0.65) : 0);
    this.wetness += (targetWet - this.wetness) * Math.min(1, dt * this.wetnessResponse);

    // Wet look + fog + grip.
    if (this.city) {
      this.city.setWetness(this.wetness);
      if (this.city.fog) this.city.fog.density = this.baseFog * (1 + this.fogWetBoost * this.wetness);
    }
    if (this.physics) this.physics.wetness = this.wetness;

    this.drops.count = active;
    this.drops.visible = active > 0;
    this.splashes.visible = active > 0;
    if (active === 0 && this.wetness < 0.02) return;

    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const tilt = Math.atan2(this.wind.x, 20);
    this._q.setFromEuler(new THREE.Euler(tilt, 0, -Math.atan2(this.wind.z, 20) * 0.4));

    for (let i = 0; i < active; i++) {
      const d = this.dropData[i];
      d.pos.y -= d.speed * dt;
      d.pos.x += this.wind.x * dt;
      d.pos.z += this.wind.z * dt;
      // recycle inside the volume around the camera
      if (d.pos.y < cy - VOLUME.y * 0.45) {
        d.pos.set(
          cx + (Math.random() - 0.5) * VOLUME.x,
          cy + VOLUME.y * (0.3 + Math.random() * 0.5),
          cz + (Math.random() - 0.5) * VOLUME.z
        );
      }
      this._m.compose(d.pos, this._q, this._s);
      this.drops.setMatrixAt(i, this._m);
    }
    this.drops.instanceMatrix.needsUpdate = true;

    // ---- Splashes -------------------------------------------------------
    // Ground height under camera (one raycast per frame).
    if (this.city) {
      const hit = this.city.raycast(
        new THREE.Vector3(cx, cy + 10, cz), new THREE.Vector3(0, -1, 0), 60
      );
      if (hit) this._groundY = hit.point.y;
    }
    const groundY = this._groundY ?? (cy - 2);

    this.splashClock += dt * this.intensity * 70;
    while (this.splashClock >= 1) {
      this.splashClock -= 1;
      const s = this.splashData[(Math.random() * MAX_SPLASHES) | 0];
      s.age = 0;
      s.pos.set(
        cx + (Math.random() - 0.5) * 24,
        groundY + 0.03,
        cz + (Math.random() - 0.5) * 24
      );
    }

    let drawn = 0;
    for (const s of this.splashData) {
      if (s.age > 0.55) continue;
      s.age += dt;
      // Do not render the first frame past the splash lifetime. Without this
      // guard `t` exceeds 1 and the fractional fade exponent below produces
      // NaN, which can poison the additive/bloom buffers as a black flicker.
      if (s.age > 0.55) continue;
      const t = s.age / 0.55;
      const scale = 0.03 + t * 0.17;
      this._s.set(scale, 1, scale);
      this._m.compose(s.pos, IDENTITY_Q, this._s);
      this.splashes.setMatrixAt(drawn, this._m);
      // Fade as it spreads — additive, so heading to black is heading to gone.
      const f = (1 - t) ** 1.6;
      this._c.setRGB(0.68 * f, 0.78 * f, 0.91 * f);
      this.splashes.setColorAt(drawn, this._c);
      drawn++;
    }
    this._s.set(1, 1, 1);
    this.splashes.count = drawn;
    this.splashes.instanceMatrix.needsUpdate = true;
    if (this.splashes.instanceColor) this.splashes.instanceColor.needsUpdate = true;
  }
}

const IDENTITY_Q = new THREE.Quaternion();
