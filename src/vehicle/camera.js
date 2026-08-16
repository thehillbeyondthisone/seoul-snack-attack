// Seoul Delivery — chase camera: damped follow, velocity look-ahead,
// speed FOV kick, lateral-G roll, crash shake.
import * as THREE from 'three';

const FOLLOW_DIST = 5.0;
const FOLLOW_HEIGHT = 2.0;
const FOV_BASE = 60;
const FOV_KICK = 15; // 60 -> 75 at speed

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.fov = FOV_BASE;
    this.roll = 0;
    this.shake = 0;
    this._initialized = false;

    this._fwd = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
  }

  onCrash(severity) {
    this.shake = Math.min(1, this.shake + severity * 0.06);
  }

  snapTo(phys) {
    this._initialized = false;
    this.update(0.016, phys);
  }

  update(dt, phys) {
    const speed = phys.velocity.length();

    // Forward projected on the horizontal plane (van may pitch/roll).
    this._fwd.set(0, 0, 1).applyQuaternion(phys.quaternion);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-4) this._fwd.set(0, 0, 1);
    this._fwd.normalize();

    // Desired position behind + above the van.
    this._desired.copy(phys.position)
      .addScaledVector(this._fwd, -FOLLOW_DIST)
      .add(new THREE.Vector3(0, FOLLOW_HEIGHT, 0));

    // Look-ahead by velocity, biased up to the van roofline.
    this._lookTarget.copy(phys.position)
      .addScaledVector(phys.velocity, 0.32)
      .add(new THREE.Vector3(0, 1.0, 0));

    if (!this._initialized) {
      this.pos.copy(this._desired);
      this.look.copy(this._lookTarget);
      this._initialized = true;
    } else {
      // Exponential damping; look point tracks tighter than position.
      const kp = 1 - Math.exp(-dt * 5.5);
      const kl = 1 - Math.exp(-dt * 9.0);
      this.pos.lerp(this._desired, kp);
      this.look.lerp(this._lookTarget, kl);
    }

    // Crash shake: decaying noise.
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.35;
    const t = performance.now() * 0.03;
    const shakeOff = new THREE.Vector3(
      Math.sin(t * 1.7) * s, Math.cos(t * 2.3) * s * 0.7, Math.sin(t * 1.1) * s
    );

    this.camera.position.copy(this.pos).add(shakeOff);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);

    // Subtle roll with lateral G (lean into the corner feeling).
    const targetRoll = THREE.MathUtils.clamp(-phys.latG * 0.035, -0.06, 0.06);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 4);
    this.camera.rotateZ(this.roll);

    // Speed-based FOV kick.
    const targetFov = FOV_BASE + FOV_KICK * THREE.MathUtils.clamp(speed / 38, 0, 1);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 3);
    if (Math.abs(this.fov - this.camera.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
