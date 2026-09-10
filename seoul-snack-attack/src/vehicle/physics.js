// Seoul Snack Attack — custom raycast arcade-sim vehicle physics (no physics engine).
// Rigid body + 4 suspension raycasts against the city BVH, pacejka-lite tire
// forces with a friction ellipse, wet grip, body collision rays + crash events.
import * as THREE from 'three';
import { COLLISION_HALF, BUMPER_Y } from './van-spec.js';

export const DEFAULT_PARAMS = {
  mass: 1400,              // kg
  inertiaScale: 1.25,      // multiplies box inertia — calmer rotation
  engineForce: 7200,       // N peak at wheels
  maxSpeed: 25,            // m/s ≈ 90 km/h — engine force fades to 0
  reverseMaxSpeed: 7,
  brakeForce: 16500,       // N per axle-ish; quicker initial bite, still grip-limited
  handbrakeForce: 19000,
  drag: 0.42,              // quadratic air drag coefficient (N per (m/s)^2)
  rollingResistance: 130,  // N constant opposing motion
  gripDry: 1.05,           // tire friction coefficient (mu)
  gripWet: 0.76,           // ~28% cut in the rain
  wetGripEnabled: true,
  tireStiffness: 9,        // slip-angle stiffness (pacejka-lite B factor)
  // Sketchbook/Cannon-style roll influence. Lateral tire force is applied at
  // this fraction of the contact patch's vertical lever arm: 1 is fully
  // physical, lower values move the effective roll centre toward the CoM.
  rollInfluence: 1,
  rollInfluenceAtMax: 1,
  rollInfluenceSpeedStart: 1,
  steerLockLow: 0.70,      // rad at standstill; tighter low-speed city turns
  steerLockHigh: 0.13,     // rad at speed
  steerSpeedRef: 24,       // m/s where high-speed lock applies
  steerResponse: 5.5,      // how fast steering angle chases input
  suspensionRest: 0.42,    // m ray length at rest (from axle point)
  suspensionTravel: 0.22,  // m of extra ray length
  springK: 38000,          // N/m
  damperC: 3600,           // Ns/m

  // Centre of mass, as an offset from the model origin (body frame, metres).
  // The model origin is the mesh bounding-box centre (van.js recenters there),
  // which put the CoM 1.33 m above the road on a 1.298 m track — a rollover
  // threshold of track/(2h) = 0.49 g, well under the 1.02 g the tires make. The
  // van therefore tipped over in any real corner. Lowering the CoM to ~0.55 m
  // puts the threshold at ~1.18 g, safely above the grip ceiling.
  comHeight: -0.78,
  // +X is body-left. Canonical rigs whose visual bbox is laterally skewed can
  // use this to keep the physical CoM centred between the wheel contact lines.
  comLateral: 0,

  // Anti-roll bars: N of force per metre of differential compression across an
  // axle. These are what let a soft, rolly car corner flat-ish without tipping,
  // and they do the job `uprightTorque` was faking. Front-biased for mild
  // understeer, which is the forgiving direction.
  // Deliberately soft: with the CoM at ~0.55 m the rollover threshold is
  // track/(2h) ~= 1.18 g, already above the ~0.85 g the tires make, so the bars
  // are a safety margin for curbs and cambered ground rather than the thing
  // holding the van up. Winding them up flattens the body roll we want to keep.
  antiRollFront: 2450,
  antiRollRear: 1350,
  downforce: 6,            // N per (m/s)^2 pushing the body down
  uprightTorque: 6000,     // stabilization assist toward ground normal
  angularDamping: 1.6,     // 1/s
  crashBounce: 0.25,       // restitution on body hits

  // Collision geometry. These were module constants read straight from
  // van-spec.js, which quietly made the shape of the van the shape of every
  // vehicle. They are params now so a second vehicle can carry its own box —
  // the defaults are still exactly the van's, so its behaviour is unchanged.
  // Overrides come from src/game/data/vehicles.js.
  collisionHalf: COLLISION_HALF,
  bumperY: BUMPER_Y,
};

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _f = new THREE.Vector3();
const _t = new THREE.Vector3();
const _arb = new THREE.Vector3();
const _com = new THREE.Vector3();

export class VehiclePhysics {
  /**
   * @param {{ raycast: Function }} world  city raycast helper
   */
  constructor(world) {
    this.world = world;
    this.params = { ...DEFAULT_PARAMS };

    // State
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3(); // world frame

    // Controls (set by main each frame)
    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };

    this.wetness = 0;
    this.wheels = [];           // { localPos, radius, steerable, driven }
    this.steerAngle = 0;
    this.forwardSpeed = 0;
    this.groundedWheels = 0;
    this.airTime = 0;
    this.latG = 0;
    this.longG = 0;
    this.rollAngle = 0;

    this.lastRoadPosition = new THREE.Vector3();
    this.lastRoadHeading = 0;
    // Overwritten by attach() once params are known; a zero offset keeps
    // meshPosition/place() correct if either is called before attach.
    this.comOffset = new THREE.Vector3();

    this.onCrash = null;        // (severity m/s, point) => {}
    this._crashCooldown = 0;
    this._avgNormal = new THREE.Vector3(0, 1, 0);
    this._prevAccel = new THREE.Vector3();
    this._initialized = false;
  }

  /** Wheel local positions come from the normalized van (y-up, +Z forward). */
  attach(van) {
    const mk = (w, steerable) => w ? {
      localPos: w.localPos.clone(), radius: w.radius, steerable,
      compression: 0, load: 0, grounded: false, contact: null, normal: null,
    } : null;
    this.wheels = [
      mk(van.wheels.fl, true), mk(van.wheels.fr, true),
      mk(van.wheels.rl, false), mk(van.wheels.rr, false),
    ].filter(Boolean);
    // Fallback if wheel detection failed.
    if (this.wheels.length === 0) {
      const r = van.wheelRadius ?? 0.34;
      const xs = 0.85, zs = 1.45, y = -0.1;
      this.wheels = [
        { localPos: new THREE.Vector3(-xs, y, zs), radius: r, steerable: true },
        { localPos: new THREE.Vector3(xs, y, zs), radius: r, steerable: true },
        { localPos: new THREE.Vector3(-xs, y, -zs), radius: r, steerable: false },
        { localPos: new THREE.Vector3(xs, y, -zs), radius: r, steerable: false },
      ].map((w) => ({ ...w, compression: 0, load: 0, grounded: false }));
    }
    // Treat this.position as the CENTRE OF MASS rather than the mesh origin.
    // Shifting every body-frame contact point by -comOffset is exactly
    // equivalent to moving the CoM down, and keeps the integrator honest
    // (rotation happens about the point we take torques around). Rendering
    // compensates by offsetting the mesh — see main.js.
    this.comOffset = new THREE.Vector3(this.params.comLateral, this.params.comHeight, 0);
    for (const w of this.wheels) w.localPos.sub(this.comOffset);

    // Approximate box inertia for a van (4.5 × 1.9 × 1.9 m).
    const m = this.params.mass;
    this.inertia = new THREE.Vector3(
      (m / 12) * (1.9 ** 2 + 4.5 ** 2) * this.params.inertiaScale, // pitch (x)
      (m / 12) * (1.9 ** 2 + 4.5 ** 2) * this.params.inertiaScale, // yaw (y)
      (m / 12) * (1.9 ** 2 + 1.9 ** 2) * this.params.inertiaScale  // roll (z)
    );
    this._initialized = true;
  }

  /**
   * World position of the MODEL ORIGIN — what every caller and the renderer
   * mean by "where the van is". `this.position` is the centre of mass, which
   * sits `comHeight` below it. Returns a shared temp: copy it, don't keep it.
   */
  get meshPosition() {
    return _com.copy(this.comOffset).applyQuaternion(this.quaternion)
      .negate().add(this.position);
  }

  place(position, heading = 0) {
    this.quaternion.setFromAxisAngle(UP, heading);
    // The boot drop-in (city.js: road + 0.8) presumes an origin ~1 m above the
    // road, like the van's. A taller rig — the pocha's bbox
    // centre sits 2.36 m up because of the roof sign — would start with its
    // hubs below the road, where the downward suspension rays can never catch,
    // and fall through the world. Lift the drop to clear the lowest hub;
    // rigs that already clear it are unaffected.
    let dropY = position.y;
    if (this._initialized && this.wheels.length) {
      const lowestHub = Math.min(...this.wheels.map((w) => w.localPos.y + this.comOffset.y));
      dropY = Math.max(dropY, 0.05 - lowestHub);
    }
    // Callers pass a model-origin position; convert to the CoM we integrate.
    this.position.copy(position).setY(dropY)
      .add(_com.copy(this.comOffset).applyQuaternion(this.quaternion));
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.lastRoadPosition.set(position.x, dropY, position.z);
    this.lastRoadHeading = heading;
  }

  resetToRoad() {
    // Use a collision-verified copy of the boot spawn, never the route graph's
    // abstract centreline: on this authored block that line crosses a sidewalk.
    const safe = this.world.getSafeReset?.(this.meshPosition);
    if (safe) {
      let heading = safe.heading;
      const forward = this.velocity.lengthSq() > 1 ? this.velocity : null;
      if (forward) {
        const roadDir = _v2.set(Math.sin(heading), 0, Math.cos(heading));
        if (roadDir.dot(forward) < 0) heading += Math.PI;
      } else if (Math.cos(heading - this.lastRoadHeading) < 0) heading += Math.PI;
      this.steerAngle = 0;
      this.controls.steer = 0;
      this.place(safe.position, heading);
      this.lastRoadHeading = heading;
      return;
    }
    this.steerAngle = 0;
    this.controls.steer = 0;
    this.place(this.lastRoadPosition, this.lastRoadHeading);
  }

  teleport(position, heading = 0) {
    this.place(position.clone().add(_v1.set(0, 0.6, 0)), heading);
  }

  get mu() {
    const p = this.params;
    return p.wetGripEnabled ? THREE.MathUtils.lerp(p.gripDry, p.gripWet, this.wetness) : p.gripDry;
  }

  get speedKmh() { return this.velocity.length() * 3.6; }

  /** Advance one fixed step. */
  step(dt) {
    if (!this._initialized) return;
    const p = this.params;
    const c = this.controls;

    // Fell off the world (no invisible walls) — respawn on the road.
    if (this.world.killY != null && this.position.y < this.world.killY) {
      this.resetToRoad();
      return;
    }

    // --- steering: speed-sensitive lock, smoothed ----------------------
    const speed = this.velocity.length();
    const lock = THREE.MathUtils.lerp(
      p.steerLockLow, p.steerLockHigh,
      THREE.MathUtils.clamp(speed / p.steerSpeedRef, 0, 1)
    );
    // c.steer is +1 for RIGHT; with the van facing +Z, right is -X, so a
    // right turn needs a NEGATIVE yaw angle about +Y.
    const targetSteer = -c.steer * lock;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, dt * p.steerResponse);

    // --- orientation helpers ---------------------------------------------
    const fwd = _v1.set(0, 0, 1).applyQuaternion(this.quaternion);   // body forward
    const right = _v2.set(1, 0, 0).applyQuaternion(this.quaternion); // +X = body LEFT (van faces +Z)
    const bodyUp = _v3.set(0, 1, 0).applyQuaternion(this.quaternion);

    this.forwardSpeed = this.velocity.dot(fwd);

    // --- accumulate forces/torques ----------------------------------------
    const force = _f.set(0, -9.81 * p.mass, 0);
    const torque = _t.set(0, 0, 0);

    // Drag + rolling resistance.
    if (speed > 0.01) {
      const dragMag = p.drag * speed * speed + p.rollingResistance;
      force.addScaledVector(this.velocity, -dragMag / speed);
    }
    // Downforce grows with speed — stability at highway pace.
    force.addScaledVector(bodyUp, -p.downforce * speed * speed);

    const applyForceAt = (f, atWorld) => {
      force.add(f);
      _q.copy(this.quaternion).invert();
      const r = atWorld.clone().sub(this.position);
      torque.add(r.cross(f));
    };

    // --- wheels -------------------------------------------------------------
    this.groundedWheels = 0;
    const mu = this.mu;
    let normalSum = new THREE.Vector3();

    for (const w of this.wheels) {
      const axleWorld = w.localPos.clone().applyQuaternion(this.quaternion).add(this.position);
      const rayLen = p.suspensionRest + p.suspensionTravel;
      const hit = this.world.raycast(axleWorld, bodyUp.clone().negate(), rayLen + w.radius);

      // Wheel orientation: steer around body up, then forward/right vectors.
      let steer = 0;
      if (w.steerable) steer = this.steerAngle;
      const wFwd = fwd.clone().applyAxisAngle(bodyUp, steer);
      const wRight = right.clone().applyAxisAngle(bodyUp, steer);

      w.grounded = false;
      w.load = 0;
      if (!hit) continue;

      const dist = hit.distance - w.radius; // spring compression distance along ray
      const compression = THREE.MathUtils.clamp(rayLen - Math.max(dist, 0), 0, rayLen);
      w.compression = compression / rayLen;
      w.grounded = true;
      this.groundedWheels++;
      // Spring + damper along ground normal.
      const n = hit.face ? hit.face.normal.clone() : UP.clone();
      if (n.dot(bodyUp) < 0) n.negate();
      // Accumulate the FLIPPED normal, not the raw one. The city's road slabs
      // are single-sided planes with inconsistent winding — 14% of the
      // carriageway reports normal.y = -1 — so summing raw normals let opposite
      // faces cancel and handed the anti-roll bars and upright assist an
      // averaged normal pointing nowhere. The spring below was always safe
      // because of the negate above; this sum was not.
      normalSum.add(n);
      const contact = hit.point.clone();
      w.contact = contact;
      w.normal = n;
      const velAtContact = this.velocity.clone().add(
        this.angularVelocity.clone().cross(contact.clone().sub(this.position))
      );
      const compVel = -velAtContact.dot(n); // positive when approaching ground
      const springF = p.springK * compression + p.damperC * compVel;
      const load = Math.max(0, springF);
      w.load = load;
      applyForceAt(n.clone().multiplyScalar(springF), contact);

      // --- tire forces (pacejka-lite with friction ellipse) -------------
      // Project wheel dirs onto the ground plane.
      const gFwd = wFwd.clone().addScaledVector(n, -wFwd.dot(n)).normalize();
      const gRight = wRight.clone().addScaledVector(n, -wRight.dot(n)).normalize();

      const vLong = velAtContact.dot(gFwd);
      const vLat = velAtContact.dot(gRight);

      // Longitudinal: engine curve + brakes + handbrake.
      let fLong = 0;
      const reversing = c.brake > 0 && this.forwardSpeed < 0.6 && c.throttle === 0;
      if (c.throttle > 0) {
        const curve = Math.max(0, 1 - (this.forwardSpeed / p.maxSpeed) ** 2);
        fLong += c.throttle * p.engineForce * curve / this.wheels.length;
      } else if (reversing) {
        const curve = Math.max(0, 1 - (Math.abs(this.forwardSpeed) / p.reverseMaxSpeed) ** 2);
        fLong -= c.brake * p.engineForce * 0.55 * curve / this.wheels.length;
      }
      if (c.brake > 0 && !reversing) {
        fLong -= Math.sign(vLong) * c.brake * (p.brakeForce / this.wheels.length);
      }
      const handbrakeOn = c.handbrake && !w.steerable;
      if (handbrakeOn) {
        fLong -= Math.sign(vLong) * (p.handbrakeForce / 2);
      }

      // Lateral: slip-angle curve, F = -mu*N * sin(atan(B * slip)).
      const slipAngle = Math.atan2(vLat, Math.max(Math.abs(vLong), 0.6));
      let latMu = mu;
      if (handbrakeOn) latMu *= 0.45; // locked rears slide — that's the point
      const maxLat = latMu * load;
      let fLat = -maxLat * Math.sin(Math.atan(p.tireStiffness * slipAngle));

      // Friction ellipse: cap combined force at mu*N.
      const maxTotal = latMu * load;
      const mag = Math.hypot(fLong, fLat);
      if (mag > maxTotal && mag > 1e-5) {
        const s = maxTotal / mag;
        fLong *= s; fLat *= s;
      }
      if (handbrakeOn && Math.abs(vLong) < 0.4) fLong = 0; // fully locked

      // Keep longitudinal force at the road so acceleration/braking still
      // pitches the chassis naturally. For lateral force, use the same roll-
      // influence convention as Sketchbook's Cannon RaycastVehicle: scale the
      // contact patch's body-up lever arm before computing chassis torque.
      applyForceAt(gFwd.multiplyScalar(fLong), contact);
      const rollInfluenceLow = THREE.MathUtils.clamp(p.rollInfluence ?? 1, 0, 1);
      const rollInfluenceHigh = THREE.MathUtils.clamp(p.rollInfluenceAtMax ?? rollInfluenceLow, 0, 1);
      const rollRampStart = THREE.MathUtils.clamp(p.rollInfluenceSpeedStart ?? 1, 0, 0.999);
      let rollRamp = THREE.MathUtils.clamp(
        (Math.abs(this.forwardSpeed) / Math.max(p.maxSpeed, 0.01) - rollRampStart) /
          (1 - rollRampStart),
        0,
        1,
      );
      rollRamp = rollRamp * rollRamp * (3 - 2 * rollRamp);
      const rollInfluence = THREE.MathUtils.lerp(rollInfluenceLow, rollInfluenceHigh, rollRamp);
      const verticalArm = contact.clone().sub(this.position).dot(bodyUp);
      const rollContact = contact.clone().addScaledVector(
        bodyUp,
        verticalArm * (rollInfluence - 1),
      );
      applyForceAt(gRight.multiplyScalar(fLat), rollContact);
    }

    // --- anti-roll bars ----------------------------------------------------
    // Resist differential compression across an axle, transferring load from
    // the compressed side to the extended one. This is what keeps the body
    // from tipping without stiffening the ride, and it is the real fix for the
    // 0.49 g rollover. Skipped when either wheel of the pair is airborne —
    // otherwise a one-wheel curb strike flings the whole van.
    const rayLenArb = p.suspensionRest + p.suspensionTravel;
    const antiRoll = (a, b, k) => {
      if (!k || !a?.grounded || !b?.grounded) return;
      const f = k * (a.compression - b.compression) * rayLenArb;
      if (!Number.isFinite(f) || f === 0) return;
      applyForceAt(_arb.set(0, f, 0), a.contact);
      applyForceAt(_arb.set(0, -f, 0), b.contact);
    };
    antiRoll(this.wheels[0], this.wheels[1], p.antiRollFront);
    antiRoll(this.wheels[2], this.wheels[3], p.antiRollRear);

    if (this.groundedWheels > 0) {
      this._avgNormal.copy(normalSum).normalize();
      if (this.groundedWheels >= 3 && Math.abs(this.forwardSpeed) < 30) {
        // Stored in model-origin space, because resetToRoad() feeds it back
        // through place(), which expects a model-origin position.
        this.lastRoadPosition.copy(this.meshPosition);
        this.lastRoadHeading = Math.atan2(fwd.x, fwd.z);
      }
      this.airTime = 0;
    } else {
      this.airTime += dt;
      this._avgNormal.set(0, 1, 0);
    }

    // --- upright assist: keep the van believable, not a gymnast ----------
    const upError = bodyUp.clone().cross(this._avgNormal);
    torque.add(upError.multiplyScalar(p.uprightTorque * (this.groundedWheels > 0 ? 1 : 0.25)));

    // --- integrate -----------------------------------------------------------
    const accel = force.multiplyScalar(1 / p.mass);

    // telemetry Gs (before integration, in body frame)
    _q.copy(this.quaternion).invert();
    const aBody = accel.clone().applyQuaternion(_q);
    this.latG = aBody.x / 9.81;
    this.longG = aBody.z / 9.81;
    this.rollAngle = Math.asin(THREE.MathUtils.clamp(bodyUp.clone().cross(UP).length() *
      Math.sign(right.dot(UP)), -1, 1));

    this.velocity.addScaledVector(accel, dt);

    // Angular: diagonal inertia in body frame, no gyroscopic term (stable enough).
    const wBody = this.angularVelocity.clone().applyQuaternion(_q);
    const tBody = torque.applyQuaternion(_q);
    wBody.x += (tBody.x / this.inertia.x) * dt;
    wBody.y += (tBody.y / this.inertia.y) * dt;
    wBody.z += (tBody.z / this.inertia.z) * dt;
    wBody.multiplyScalar(Math.max(0, 1 - p.angularDamping * dt));
    this.angularVelocity.copy(wBody.applyQuaternion(this.quaternion));

    this.position.addScaledVector(this.velocity, dt);

    // Quaternion integration: dq = 0.5 * ω * q
    const wq = new THREE.Quaternion(
      this.angularVelocity.x * dt * 0.5,
      this.angularVelocity.y * dt * 0.5,
      this.angularVelocity.z * dt * 0.5,
      1
    ).multiply(this.quaternion);
    this.quaternion.set(wq.x, wq.y, wq.z, wq.w).normalize();

    // --- body collision: 8 horizontal rays at bumper height -----------------
    this._crashCooldown = Math.max(0, this._crashCooldown - dt);
    // Bumper height is authored relative to the mesh origin, so lift it back
    // out of CoM space (see attach()).
    // Shared with prop collision — main.js reads the same box off the vehicle
    // definition. Defaults are the van's (src/vehicle/van-spec.js).
    const halfL = p.collisionHalf.z, halfW = p.collisionHalf.x;
    const bodyX = -p.comLateral;
    const bumperY = p.bumperY - p.comHeight;
    // A contact skin, not an invisible half-metre extension of the body.
    const rayLen = 0.14;
    const rays = [
      [new THREE.Vector3(bodyX - halfW, bumperY, halfL), fwd],
      [new THREE.Vector3(bodyX + halfW, bumperY, halfL), fwd],
      [new THREE.Vector3(bodyX - halfW, bumperY, -halfL), fwd.clone().negate()],
      [new THREE.Vector3(bodyX + halfW, bumperY, -halfL), fwd.clone().negate()],
      [new THREE.Vector3(bodyX - halfW, bumperY, 0), right.clone().negate()],
      [new THREE.Vector3(bodyX + halfW, bumperY, 0), right],
      [new THREE.Vector3(bodyX - halfW, bumperY, halfL * 0.5), right.clone().negate()],
      [new THREE.Vector3(bodyX + halfW, bumperY, halfL * 0.5), right],
    ];
    const contacts = [];
    for (const [local, dirB] of rays) {
      const origin = local.clone().applyQuaternion(this.quaternion).add(this.position);
      const hit = this.world.raycast(origin, dirB, rayLen);
      if (!hit || !hit.face) continue;
      let n = hit.face.normal.clone();
      if (n.dot(dirB) > 0) n.negate();
      const pen = rayLen - hit.distance;
      const vIntoN = this.velocity.dot(n);
      contacts.push({ hit, n, pen, vIntoN });
    }
    // Reduce all rays touching the same wall to one response. This keeps
    // sustained barrier scraping controllable and collision damping stable.
    if (contacts.length) {
      const impact = contacts.reduce((best, c) => c.vIntoN < best.vIntoN ? c : best, contacts[0]);
      const n = new THREE.Vector3();
      let maxPen = 0;
      for (const contact of contacts) {
        n.addScaledVector(contact.n, Math.max(0.01, contact.pen));
        maxPen = Math.max(maxPen, contact.pen);
      }
      n.normalize();
      this.position.addScaledVector(n, maxPen * 0.65);
      const vIntoN = this.velocity.dot(n);
      if (vIntoN < 0) {
        // Project velocity out of the normal + small bounce.
        this.velocity.addScaledVector(n, -vIntoN * (1 + p.crashBounce));
        // Scrub some energy — crashes cost momentum.
        this.velocity.multiplyScalar(0.82);
        this.angularVelocity.multiplyScalar(0.90);

        // A glancing hit should turn the van, not merely translate it. Apply a
        // bounded angular impulse in body space so the result is stable across
        // differently rotated walls and does not depend on frame rate.
        const impactImpulse = Math.min(4200, -impact.vIntoN * p.mass * 0.22);
        const rBody = impact.hit.point.clone().sub(this.position).applyQuaternion(_q.copy(this.quaternion).invert());
        const nBody = n.clone().applyQuaternion(_q);
        const impulseBody = nBody.multiplyScalar(impactImpulse);
        const angularImpulse = rBody.cross(impulseBody);
        const wBody = this.angularVelocity.clone().applyQuaternion(_q);
        wBody.x += angularImpulse.x / this.inertia.x;
        wBody.y += angularImpulse.y / this.inertia.y;
        wBody.z += angularImpulse.z / this.inertia.z;
        this.angularVelocity.copy(wBody.applyQuaternion(this.quaternion));

        const severity = -impact.vIntoN;
        if (severity > 2 && this._crashCooldown === 0) {
          this._crashCooldown = 0.35;
          this.onCrash?.(severity, impact.hit.point);
        }
      }
    }
  }
}
