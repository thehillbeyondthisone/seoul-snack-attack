// Seoul Snack Attack — the pocha as a submarine.
//
// A SEPARATE integrator from src/vehicle/physics.js, not a mode inside it. The
// road model is four suspension raycasts, a friction ellipse and a set of tire
// curves that took real tuning to make a 1.4 t truck corner without tipping.
// None of that means anything in open water. Underwater there are no wheels, no
// contact patches and no ground normal — there is a body, a medium, and a
// rudder.
//
// THE CONTRACT. This class exposes exactly the surface that main.js, the HUD
// and both cameras already read off VehiclePhysics:
//
//   position (CoM) · meshPosition (model origin) · quaternion · velocity
//   angularVelocity · speedKmh · forwardSpeed · steerAngle · latG · longG
//   rollAngle · groundedWheels · controls · step(dt) · place(pos, heading)
//
// ATTITUDE IS KINEMATIC, NOT SIMULATED (2026-09-10 fix). The first version
// drove pitch and roll with torques. The pitch controller had its sign flipped
// (+X is body LEFT, so a positive rotation about it puts the nose DOWN, not up)
// and the righting torque is exactly zero when fully inverted — so the truck
// pitched itself over and tumbled. Nothing about "a food truck in a trench"
// is improved by the player being able to end up upside down, so orientation is
// now three smoothed angles composed every step:
//
//   yaw   — integrated from the rudder
//   pitch — chases the climb rate, clamped to a swim, never a loop
//   bank  — leans into the turn, clamped
//
// The body CANNOT leave upright. Collisions push position and velocity only.
//
// AXES: the vehicle contract — +Z forward, +Y up, +X body LEFT.
import * as THREE from 'three';

export const SUB_PARAMS = {
  mass: 1400,              // kg — the same truck, so the same mass

  // ---- The medium ----------------------------------------------------------
  dragForward: 185,        // N per (m/s)^2 -> ~9.2 m/s flat out (33 km/h)
  dragLateral: 1150,       // N per (m/s)^2 across it — a truck is a barn door
  // Linear damping on top of the quadratic terms, so low speeds settle instead
  // of creeping forever (quadratic drag alone never quite stops anything).
  // Horizontal only: vertical speed is commanded, below.
  dragLinear: 260,         // N per m/s

  // ---- Depth ---------------------------------------------------------------
  // Vertical speed is COMMANDED, not a force balance (2026-09-11). The first
  // model was slightly-negative buoyancy plus 13 kN of ballast, so Space and
  // Shift were both rockets. The ask is a swim: dive with purpose, climb
  // slowly, and hands off still sink gently. Each step the hull chases a target
  // climb rate with a capped force, so hull strikes still bounce.
  idleSink: 0.7,           // m/s down, hands off — the abyss still has you
  diveSpeed: 4.4,          // m/s down on Shift / RB
  riseSpeed: 1.8,          // m/s up on Space / A — deliberately a slow climb
  depthResponse: 1.5,      // 1/s — how quickly the climb rate reaches the target
  maxDepthForce: 12000,    // N

  // ---- Propulsion ----------------------------------------------------------
  thrust: 15500,           // N forward
  reverseThrust: 7000,     // N back
  maxSpeed: 11,            // m/s ~= 40 km/h — thrust fades to zero here

  // ---- Attitude (kinematic — see header) -----------------------------------
  maxYawRate: 1.05,        // rad/s at speed
  idleYawRate: 0.55,       // rad/s hovering: a sub can pirouette, slowly
  yawResponse: 2.6,        // 1/s — how fast the turn rate chases the rudder
  steerResponse: 3.4,      // steerAngle smoothing, read by the wheel visuals
  pitchFromClimb: 0.11,    // rad of nose-up per m/s of climb
  maxPitch: 0.38,          // rad — a swim, never a loop
  pitchResponse: 1.8,      // 1/s
  bankFromTurn: 0.34,      // rad of lean per rad/s of yaw at speed
  maxBank: 0.28,           // rad
  bankResponse: 2.2,       // 1/s

  // ---- Contact -------------------------------------------------------------
  hullRadius: 2.35,        // m — one sphere, not eight rays. See _collide().
  bounce: 0.22,
  scrub: 0.8,              // tangential velocity retained after a hull strike

  comHeight: -0.78,        // matched to the road model so meshPosition agrees
  comLateral: 0,

  // Not used by anything here. vehicle.js reads them off `phys.params` to place
  // the wheel pivots. Overwritten from the road rig by attachFrom().
  suspensionRest: 0.42,
  suspensionTravel: 0.22,
};

const UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _com = new THREE.Vector3();
const _force = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _n = new THREE.Vector3();
const _qInv = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/** Hull probes, WORLD space. Fourteen: the six axes plus the eight diagonals. */
const PROBE_DIRS = (() => {
  const dirs = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) dirs.push([x, y, z]);
  return Object.freeze(dirs.map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize()));
})();

const approach = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));

export class SubmarinePhysics {
  /** @param {{ raycast?: Function, contain?: Function }} world  the abyss, not the city */
  constructor(world) {
    this.world = world;
    this.params = { ...SUB_PARAMS };

    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();

    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, ballast: 0 };

    // Attitude state. `pitch` is POSITIVE NOSE-UP; `bank` positive = right side down.
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.yawRate = 0;

    // ---- Read surface shared with VehiclePhysics ---------------------------
    this.steerAngle = 0;
    this.forwardSpeed = 0;
    this.latG = 0;
    this.longG = 0;
    this.rollAngle = 0;
    this.groundedWheels = 0;
    this.airTime = 0;
    this.wetness = 1;
    /** True while the hull is resting on the silt — the dive kicks up sediment. */
    this.onFloor = false;

    this.comOffset = new THREE.Vector3(this.params.comLateral, this.params.comHeight, 0);
    this.wheels = [];

    this.onHull = null;      // (severity m/s, point) => {}
    this._hullCooldown = 0;
  }

  /**
   * Borrow the road rig's wheel layout so the truck still renders as a truck —
   * wheels hanging at full droop, still spinning off `forwardSpeed`. That is the
   * joke, and it costs four objects. Also aligns comOffset across the handover.
   */
  attachFrom(roadPhysics) {
    this.wheels = (roadPhysics?.wheels ?? []).map((w) => ({
      localPos: w.localPos.clone(), radius: w.radius, steerable: w.steerable,
      compression: 0, load: 0, grounded: false, contact: null, normal: null,
    }));
    this.params.suspensionRest = roadPhysics?.params?.suspensionRest ?? this.params.suspensionRest;
    this.params.suspensionTravel = roadPhysics?.params?.suspensionTravel ?? this.params.suspensionTravel;
    if (roadPhysics?.comOffset) this.comOffset.copy(roadPhysics.comOffset);
  }

  get meshPosition() {
    return _com.copy(this.comOffset).applyQuaternion(this.quaternion)
      .negate().add(this.position);
  }

  get speedKmh() { return this.velocity.length() * 3.6; }

  /** Metres below the surface, positive down. The cab's depth gauge reads this. */
  get depthM() { return Math.max(0, -this.meshPosition.y); }

  /**
   * Set the attitude directly — the Drain hands over whatever pose the fall
   * ended on, and the smoothing above levels it out as a swim rather than a snap.
   */
  setAttitude(yaw, pitch = 0, bank = 0) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.bank = bank;
    this.yawRate = 0;
    this._composeQuaternion();
  }

  place(position, heading = 0) {
    this.setAttitude(heading, 0, 0);
    this.position.copy(position)
      .add(_com.copy(this.comOffset).applyQuaternion(this.quaternion));
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.steerAngle = 0;
  }

  _composeQuaternion() {
    // +X rotation puts the nose DOWN in this frame, hence -pitch. +Z rotation
    // lifts body-left, i.e. drops the right side, hence +bank.
    _euler.set(-this.pitch, this.yaw, this.bank);
    this.quaternion.setFromEuler(_euler);
  }

  step(dt) {
    const p = this.params;
    const c = this.controls;

    // Thrust and drag act in the HEADING frame, not the pitched body frame.
    // Pitch follows the climb; if thrust followed pitch, diving would steepen
    // the dive, which is the feedback loop that flipped the first version.
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(_fwd.z, 0, -_fwd.x); // body +X (left), horizontal
    this.forwardSpeed = this.velocity.dot(_fwd);

    const force = _force.set(0, 0, 0);
    const ballast = THREE.MathUtils.clamp(c.ballast || 0, -1, 1);
    const wantedClimb = ballast >= 0
      ? THREE.MathUtils.lerp(-p.idleSink, p.riseSpeed, ballast)
      : THREE.MathUtils.lerp(-p.idleSink, -p.diveSpeed, -ballast);
    force.y += THREE.MathUtils.clamp(
      p.mass * p.depthResponse * (wantedClimb - this.velocity.y),
      -p.maxDepthForce, p.maxDepthForce,
    );

    if (c.throttle > 0) {
      const curve = Math.max(0, 1 - (Math.max(0, this.forwardSpeed) / p.maxSpeed) ** 2);
      force.addScaledVector(_fwd, c.throttle * p.thrust * curve);
    } else if (c.brake > 0) {
      const curve = Math.max(0, 1 - (Math.abs(Math.min(0, this.forwardSpeed)) / (p.maxSpeed * 0.5)) ** 2);
      force.addScaledVector(_fwd, -c.brake * p.reverseThrust * curve);
    }

    const vFwd = this.forwardSpeed;
    const vSide = this.velocity.dot(_right);
    const vUp = this.velocity.y;
    force.addScaledVector(_fwd, -p.dragForward * vFwd * Math.abs(vFwd));
    force.addScaledVector(_right, -p.dragLateral * vSide * Math.abs(vSide));
    force.x -= p.dragLinear * this.velocity.x;
    force.z -= p.dragLinear * this.velocity.z;

    _accel.copy(force).multiplyScalar(1 / p.mass);
    this.velocity.addScaledVector(_accel, dt);
    this.position.addScaledVector(this.velocity, dt);

    // ---- Attitude -----------------------------------------------------------
    // c.steer is +1 for RIGHT, which is a negative yaw about +Y (physics.js:245).
    this.steerAngle = approach(this.steerAngle, -c.steer * 0.5, p.steerResponse, dt);
    const speedK = THREE.MathUtils.clamp(Math.abs(vFwd) / 6, 0, 1);
    const reversing = vFwd < -0.5 ? -1 : 1;
    const wantedRate = -c.steer * THREE.MathUtils.lerp(p.idleYawRate, p.maxYawRate, speedK) * reversing;
    this.yawRate = approach(this.yawRate, wantedRate, p.yawResponse, dt);
    this.yaw += this.yawRate * dt;

    // Measured from the idle sink, so drifting down hands-off stays level and
    // only a deliberate dive or climb tips the nose.
    const wantedPitch = THREE.MathUtils.clamp((vUp + p.idleSink) * p.pitchFromClimb, -p.maxPitch, p.maxPitch);
    this.pitch = approach(this.pitch, wantedPitch, p.pitchResponse, dt);
    const wantedBank = THREE.MathUtils.clamp(-this.yawRate * p.bankFromTurn * (0.3 + speedK), -p.maxBank, p.maxBank);
    this.bank = approach(this.bank, wantedBank, p.bankResponse, dt);
    this._composeQuaternion();
    this.angularVelocity.set(0, this.yawRate, 0);

    // Body-frame acceleration for the cockpit's head sway: lateral from the
    // turn (centripetal), longitudinal from thrust.
    _qInv.copy(this.quaternion).invert();
    const aBody = _probe.copy(_accel).applyQuaternion(_qInv);
    this.latG = THREE.MathUtils.clamp(aBody.x / 9.81 + this.yawRate * vFwd / 9.81, -1.5, 1.5);
    this.longG = THREE.MathUtils.clamp(aBody.z / 9.81, -1.5, 1.5);
    this.rollAngle = this.bank;

    this._hullCooldown = Math.max(0, this._hullCooldown - dt);
    this._collide();
  }

  /**
   * Hull contact. First the analytic shell (floor height, wall radius, ceiling)
   * via `world.contain`, which cannot be tunnelled through at any speed; then
   * fourteen BVH probes for the sunken landmarks. Position and velocity only —
   * the attitude is not the collision's to change.
   */
  _collide() {
    const p = this.params;
    let strike = 0;
    let strikePoint = null;

    const contained = this.world?.contain?.(this.position, this.velocity, p.hullRadius);
    this.onFloor = !!contained?.floor;
    this.groundedWheels = this.onFloor ? 4 : 0;
    if (contained?.impact > strike) { strike = contained.impact; strikePoint = contained.point; }

    if (this.world?.raycast) {
      let deepest = null;
      for (const dir of PROBE_DIRS) {
        const hit = this.world.raycast(this.position, dir, p.hullRadius);
        if (!hit?.face) continue;
        const penetration = p.hullRadius - hit.distance;
        if (penetration <= 0 || (deepest && penetration <= deepest.penetration)) continue;
        // Collider winding is mixed (inward shells, outward props): orient every
        // normal against the probe rather than trusting it.
        _n.copy(hit.face.normal);
        if (_n.dot(dir) > 0) _n.negate();
        deepest = { penetration, n: _n.clone(), point: hit.point };
      }
      if (deepest) {
        this.position.addScaledVector(deepest.n, deepest.penetration);
        const into = this.velocity.dot(deepest.n);
        if (into < 0) {
          this.velocity.addScaledVector(deepest.n, -into * (1 + p.bounce));
          this.velocity.multiplyScalar(p.scrub);
          if (-into > strike) { strike = -into; strikePoint = deepest.point.clone(); }
        }
      }
    }

    if (strike > 1.5 && this._hullCooldown === 0) {
      this._hullCooldown = 0.4;
      this.onHull?.(strike, strikePoint);
    }
  }
}
