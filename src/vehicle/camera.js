// Seoul Snack Attack — orbitable chase camera: mouse/right-stick orbit,
// damped follow, wall pull-in, velocity look-ahead, speed FOV and crash shake.
import * as THREE from 'three';

const FOLLOW_DIST = 5.0;
const FOLLOW_HEIGHT = 2.0;
const FOV_BASE = 60;
const FOV_KICK = 15; // 60 -> 75 at speed
const PITCH_MIN = -0.22;
const PITCH_MAX = 0.72;
const UP = new THREE.Vector3(0, 1, 0);

export class ChaseCamera {
  constructor(camera, city = null) {
    this.camera = camera;
    this.city = city;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.fov = FOV_BASE;
    this.roll = 0;
    this.shake = 0;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this._initialized = false;

    this._fwd = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this._anchor = new THREE.Vector3();
    this._rayDir = new THREE.Vector3();
  }

  onCrash(severity) {
    this.shake = Math.min(1, this.shake + severity * 0.06);
  }

  snapTo(phys) {
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this._initialized = false;
    this.update(0.016, phys);
  }

  update(dt, phys, lookInput = { x: 0, y: 0 }) {
    const speed = phys.velocity.length();
    this.orbitYaw -= lookInput.x * 0.00235;
    this.orbitPitch = THREE.MathUtils.clamp(
      this.orbitPitch + lookInput.y * 0.0019,
      PITCH_MIN,
      PITCH_MAX,
    );

    // Forward projected on the horizontal plane (van may pitch/roll).
    this._fwd.set(0, 0, 1).applyQuaternion(phys.quaternion);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-4) this._fwd.set(0, 0, 1);
    this._fwd.normalize();

    // Desired position on an orbit behind + above the van. Offsets are
    // param-overridable
    // (physics.js params.cameraDist / cameraHeight / cameraLookUp) because the
    // fixed values presume a ~2 m tall body around the CoM — the pocha's tall
    // box needs to be framed from further back and higher up.
    const distance = phys.params.cameraDist ?? FOLLOW_DIST;
    const lookUp = phys.params.cameraLookUp ?? 1.0;
    const height = phys.params.cameraHeight ?? FOLLOW_HEIGHT;
    const basePitch = Math.asin(THREE.MathUtils.clamp((height - lookUp) / distance, -0.95, 0.95));
    const pitch = THREE.MathUtils.clamp(basePitch + this.orbitPitch, PITCH_MIN, PITCH_MAX);
    const heading = Math.atan2(this._fwd.x, this._fwd.z);
    const orbitHeading = heading + Math.PI + this.orbitYaw;
    const horizontal = Math.cos(pitch) * distance;

    this._anchor.copy(phys.position).addScaledVector(UP, lookUp);
    this._desired.set(
      this._anchor.x + Math.sin(orbitHeading) * horizontal,
      this._anchor.y + Math.sin(pitch) * distance,
      this._anchor.z + Math.cos(orbitHeading) * horizontal,
    );

    // Pull the camera in before a building can sit between it and the truck.
    this._rayDir.subVectors(this._desired, this._anchor);
    const wantedDistance = this._rayDir.length();
    if (this.city && wantedDistance > 0.01) {
      this._rayDir.divideScalar(wantedDistance);
      const hit = this.city.raycast(this._anchor, this._rayDir, wantedDistance);
      if (hit) {
        this._desired.copy(this._anchor).addScaledVector(
          this._rayDir,
          Math.max(0.8, hit.distance - 0.22),
        );
      }
    }

    // Look ahead while following from behind, but fade that bias out as the
    // player orbits sideways/frontward so the vehicle remains the focal point.
    const rearView = Math.max(0, Math.cos(this.orbitYaw));
    this._lookTarget.copy(phys.position)
      .addScaledVector(phys.velocity, 0.32 * rearView)
      .addScaledVector(UP, lookUp);

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
