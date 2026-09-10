// Orbiting third-person camera for the on-foot controller: mouse/right-stick
// orbit, velocity look-ahead, wall pull-in and exponential smoothing.
import * as THREE from 'three';

const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _rayDir = new THREE.Vector3();

export class OnFootCamera {
  constructor(camera, city) {
    this.camera = camera;
    this.city = city;
    this.yaw = Math.PI;
    this.pitch = 0.22;
    this.distance = 4.2;
    this.position = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.initialized = false;
  }

  setHeading(heading) {
    this.yaw = heading + Math.PI;
    this.initialized = false;
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw + Math.PI), 0, Math.cos(this.yaw + Math.PI));
  }

  update(dt, character, lookInput = { x: 0, y: 0 }) {
    // Positive mouse/right-stick X looks right. With THREE.Camera's local -Z
    // view axis, that means orbiting the camera toward the target's +X side.
    this.yaw -= lookInput.x * 0.00235;
    this.pitch = THREE.MathUtils.clamp(this.pitch + lookInput.y * 0.0019, -0.22, 0.72);

    _target.copy(character.position);
    _target.y += 1.30;
    const horizontal = Math.cos(this.pitch) * this.distance;
    _desired.set(
      _target.x + Math.sin(this.yaw) * horizontal,
      _target.y + Math.sin(this.pitch) * this.distance + 0.35,
      _target.z + Math.cos(this.yaw) * horizontal,
    );
    _rayDir.subVectors(_desired, _target);
    const wantedDistance = _rayDir.length();
    if (wantedDistance > 0.01) {
      _rayDir.divideScalar(wantedDistance);
      const hit = this.city.raycast(_target, _rayDir, wantedDistance);
      if (hit) _desired.copy(_target).addScaledVector(_rayDir, Math.max(0.55, hit.distance - 0.18));
    }

    if (!this.initialized) {
      this.position.copy(_desired);
      this.look.copy(_target);
      this.initialized = true;
    } else {
      this.position.lerp(_desired, 1 - Math.exp(-dt * 9));
      this.look.lerp(_target, 1 - Math.exp(-dt * 13));
    }
    this.camera.position.copy(this.position);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
    const targetFov = 62 + (character.state === 'sprint' ? 5 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.updateProjectionMatrix();
  }
}
