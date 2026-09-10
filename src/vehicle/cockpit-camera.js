// Seoul Snack Attack — first-person camera, seated in the pocha's cab.
//
// The counterpart to ChaseCamera (src/vehicle/camera.js), and deliberately not
// a mode inside it: the chase camera solves an orbit, a wall pull-in and a
// look-ahead bias, none of which mean anything from the driver's seat. This one
// has the opposite problem — it is rigidly parented to the vehicle, so the only
// interesting work is the free-look and keeping the horizon honest.
//
// The camera INHERITS the truck's roll and pitch. That is the whole point of
// sitting inside it: a kerb strike should throw the horizon, because it throws
// the driver. The chase camera levels itself for readability; this one must not.
import * as THREE from 'three';

const YAW_LIMIT = 2.0;      // rad — far enough left to check the mirror, far
                            // enough right to see the serving hatch
// Pitch is stored the way the other two cameras store it: POSITIVE IS UP.
const PITCH_MIN = -0.62;    // down onto the dials
const PITCH_MAX = 0.55;     // up through the windscreen at the signage
const RECENTRE_DELAY = 0.8; // s of no look input before the head drifts forward
const FOV_BASE = 68;        // wider than the chase camera's 60: a cabin this
                            // close reads as a letterbox at a chase FOV
const FOV_KICK = 7;

const _eye = new THREE.Vector3();
const _sway = new THREE.Vector3();
const _look = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
// A three camera looks down its own -Z; the vehicle contract faces +Z. This
// half-turn is what reconciles them, and it must be the INNERMOST rotation so
// the yaw and pitch below stay expressed in the truck's frame rather than in a
// backwards one.
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

export class CockpitCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Vector3} [eye]  seat eye point in VEHICLE MODEL space
   */
  constructor(camera, eye) {
    this.camera = camera;
    this.eye = new THREE.Vector3();
    if (eye) this.eye.copy(eye);
    this.yaw = 0;
    this.pitch = 0;
    this.idle = 0;
    this.shake = 0;
    this.fov = FOV_BASE;
    this.sway = new THREE.Vector3();
  }

  /** Move the seat. The garage swaps rigs live, and cabins differ. */
  setEye(eye) {
    this.eye.copy(eye);
  }

  /** Re-seat the head: used on entry and on a vehicle swap. */
  snapTo() {
    this.yaw = 0;
    this.pitch = 0;
    this.idle = 0;
    this.sway.set(0, 0, 0);
  }

  onCrash(severity) {
    // Twice the chase camera's gain. The same impact is a bigger event when the
    // dashboard is 0.7 m from your face.
    this.shake = Math.min(1, this.shake + severity * 0.12);
  }

  update(dt, phys, lookInput = { x: 0, y: 0 }) {
    // ---- free look --------------------------------------------------------
    const moved = lookInput.x !== 0 || lookInput.y !== 0;
    this.yaw = THREE.MathUtils.clamp(this.yaw - lookInput.x * 0.0026, -YAW_LIMIT, YAW_LIMIT);
    this.pitch = THREE.MathUtils.clamp(this.pitch - lookInput.y * 0.0021, PITCH_MIN, PITCH_MAX);
    // (mouse down -> lookInput.y positive -> pitch falls -> the view goes down)
    this.idle = moved ? 0 : this.idle + dt;
    if (this.idle > RECENTRE_DELAY) {
      // Drift back to the road rather than snap: a hard recentre fights the
      // player who is deliberately holding a glance at the hatch.
      const k = 1 - Math.exp(-dt * 3.2);
      this.yaw -= this.yaw * k;
      this.pitch -= this.pitch * k;
    }

    // ---- head physics -----------------------------------------------------
    // The body is loose in the seat: lateral G throws it toward the outside of
    // the corner, braking throws it forward. Centimetres, not a rollercoaster —
    // this is the difference between "mounted to the chassis" and "a person".
    // latG is acceleration along body +X, which is body LEFT, so a left-hand
    // corner throws the head the other way — hence the negations on both.
    _sway.set(
      THREE.MathUtils.clamp(-phys.latG * 0.018, -0.05, 0.05),
      THREE.MathUtils.clamp(-Math.abs(phys.longG) * 0.006, -0.03, 0),
      THREE.MathUtils.clamp(-phys.longG * 0.014, -0.05, 0.05),
    );
    this.sway.lerp(_sway, 1 - Math.exp(-dt * 7));

    // ---- placement --------------------------------------------------------
    // phys.meshPosition is the model origin, which is the frame the eye point
    // and the interior's own offset are both measured in.
    _eye.copy(this.eye).add(this.sway).applyQuaternion(phys.quaternion)
      .add(phys.meshPosition);

    this.shake = Math.max(0, this.shake - dt * 2.4);
    const s = this.shake * this.shake * 0.16;
    if (s > 0) {
      const t = performance.now() * 0.04;
      _eye.x += Math.sin(t * 1.7) * s;
      _eye.y += Math.cos(t * 2.3) * s * 0.8;
      _eye.z += Math.sin(t * 1.1) * s;
    }
    this.camera.position.copy(_eye);

    // Vehicle orientation first, then the head turns inside it. Composed as
    // quaternions rather than a lookAt so the truck's roll survives — lookAt
    // would re-level the camera against world up and throw away the lean that
    // is the reason to sit in here.
    _euler.set(-this.pitch, this.yaw, 0);
    _look.setFromEuler(_euler);
    this.camera.quaternion.copy(phys.quaternion).multiply(_look).multiply(FLIP);
    this.camera.up.set(0, 1, 0);

    const targetFov = FOV_BASE + FOV_KICK * THREE.MathUtils.clamp(phys.velocity.length() / 24, 0, 1);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 3);
    if (Math.abs(this.fov - this.camera.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
