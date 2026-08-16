// Seoul Delivery — rigid bodies for knockable street props.
//
// Deliberately small and deliberately behind a facade: handoff.md section 7
// phase 2 plans to move the whole simulation to Jolt, and every method here
// maps onto a Jolt PhysicsSystem/BodyInterface call. NOTHING outside
// src/physics/ may touch a body's velocity, angularVelocity or quaternion —
// callers hold opaque handles. Keeping that boundary is what makes the swap a
// constructor change rather than a rewrite.
//
// ============================ READ BEFORE EDITING ==========================
// Movable props must NEVER be reachable from city.raycast().
//
// VehiclePhysics.step() casts 8 outward "bumper" rays and, for each one that
// reports a hit, applies `velocity *= 0.82; angularVelocity *= 0.7` INSIDE the
// loop (physics.js:415). Those are known defects (handoff 8.1/8.2): the hull is
// ~0.55 m oversized and the damping compounds per ray. If a prop were visible
// to those rays, driving past a row of bollards would trigger 2-3 rays per
// substep and scrub the van to a standstill 120 times a second, for no visible
// reason.
//
// So: the van collides with props HERE, via OBB separating-axis tests only.
// Only genuinely wall-like statics (guardrails, cages) may be added to the
// raycast path, and this module is not that path.
// ===========================================================================
import * as THREE from 'three';
import { boxInertia, cylinderInertia, obbOverlap, supportPoint } from './shapes.js';

const GRAVITY = -9.81;
const CONTACT_SKIN = 0.04;   // m of allowed overlap before we push out
const BAUMGARTE = 0.35;      // positional correction fraction per substep
const SLEEP_LIN = 0.06;      // m/s
const SLEEP_ANG = 0.15;      // rad/s
const SLEEP_TIME = 0.6;      // s below both thresholds before sleeping
const SIM_RADIUS = 45;       // m from the van; beyond this bodies are frozen
// Proximity wake radius. Deliberately tight: a prop is woken by being HIT
// (_vanContacts wakes on overlap), not by the van driving past. A generous
// radius wakes a whole street of props at once and every awake body costs four
// ground raycasts per substep.
const WAKE_RADIUS = 3.5;
// Ceiling on simultaneously simulated bodies. Measured: a 64-body pile-up costs
// ~0.47 ms/substep, and 32 is already far more tumbling debris than a player can
// follow, so the surplus is frozen rather than dropping frames.
const MAX_AWAKE = 32;
/** Above this many awake bodies, prop-vs-prop is skipped (it is O(n^2)). */
const MAX_PAIRWISE = 24;
const HOME_TIMEOUT = 12;     // s displaced and out of range before respawning
/** A 14 kg bollard must never yank a 1400 kg van. */
const MAX_VAN_DV = 1.6;      // m/s per substep

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _r = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _iw = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _contact = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

let nextHandle = 1;

export class PropWorld {
  /**
   * @param {{ raycast: Function, killY?: number }} world  the city (static geometry)
   */
  constructor({ world, gravity = GRAVITY } = {}) {
    this.world = world;
    this.gravity = gravity;
    this.bodies = new Map();      // handle -> body
    this.active = [];             // bodies simulated this step
    this.awakeCount = 0;
    this.onImpact = null;         // (bodyHandle, impulse, point) => {}

    this.van = null;              // { half, position, quaternion, velocity, mass }
    this._vanReaction = { dv: new THREE.Vector3(), dw: new THREE.Vector3() };
    this._center = new THREE.Vector3();
    this._awakeScratch = [];
    this._rebuild = 0;
    this.enabled = true;
    this.propVsProp = true;
  }

  /**
   * @param {object} spec
   * @param {THREE.Vector3} spec.position   world position of the model ORIGIN (base centre)
   * @param {THREE.Quaternion} spec.quaternion
   * @param {THREE.Vector3} spec.size       full extents in metres
   * @param {number} spec.mass              kg; ignored when static
   * @param {'box'|'cylinder'} [spec.shape]
   * @param {boolean} [spec.static]
   */
  add(spec) {
    const handle = nextHandle++;
    const size = spec.size;
    const half = new THREE.Vector3(size.x / 2, size.y / 2, size.z / 2);
    const isStatic = !!spec.static;
    const mass = isStatic ? 0 : Math.max(0.5, spec.mass || 1);

    // Props are authored with the origin at the base centre (build-props.mjs),
    // but we integrate about the centre of mass. Same convention as the van:
    // `position` is the CoM, the render matrix compensates. One convention in
    // the codebase, not two.
    const comOffset = new THREE.Vector3(0, half.y, 0);

    const invInertia = new THREE.Vector3();
    if (!isStatic) {
      const I = spec.shape === 'cylinder'
        ? cylinderInertia(mass, Math.max(half.x, half.z), half.y * 2, new THREE.Vector3())
        : boxInertia(mass, half, new THREE.Vector3());
      invInertia.set(I.x > 0 ? 1 / I.x : 0, I.y > 0 ? 1 / I.y : 0, I.z > 0 ? 1 / I.z : 0);
    }

    const quaternion = (spec.quaternion || new THREE.Quaternion()).clone();
    const position = spec.position.clone().add(comOffset.clone().applyQuaternion(quaternion));

    const body = {
      handle,
      static: isStatic,
      shape: spec.shape === 'cylinder' ? 'cylinder' : 'box',
      half,
      comOffset,
      mass,
      invMass: isStatic ? 0 : 1 / mass,
      invInertia,
      position,
      quaternion,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      restitution: spec.restitution ?? 0.18,
      friction: spec.friction ?? 0.7,
      awake: false,
      sleepTimer: 0,
      vanCooldown: 0,
      rayPhase: 0,
      displacedFor: 0,
      moved: true,
      home: { position: position.clone(), quaternion: quaternion.clone() },
      userData: spec.userData ?? null,
    };
    this.bodies.set(handle, body);
    this._rebuild = 0;
    return handle;
  }

  remove(handle) { this.bodies.delete(handle); this._rebuild = 0; }

  /** Force a body awake (settling a freshly placed prop, debug tools, tests). */
  wake(handle) {
    const b = this.bodies.get(handle);
    if (b) this._wake(b);
  }

  /** Read-only pose snapshot for gameplay/tests. Never hand out the body. */
  getPose(handle) {
    const b = this.bodies.get(handle);
    if (!b) return null;
    return {
      position: b.position.clone().sub(_v1.copy(b.comOffset).applyQuaternion(b.quaternion)),
      quaternion: b.quaternion.clone(),
      speed: b.velocity.length(),
      spin: b.angularVelocity.length(),
      awake: b.awake,
      mass: b.mass,
    };
  }

  /** Register the van as an infinite-mass pusher that still has a real mass in
   *  the impulse denominator, so reactions come out at a believable magnitude. */
  setVehicle({ half, mass = 1400 }) {
    this.van = {
      half: half.clone(),
      mass,
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
    };
  }

  /** Called each substep BEFORE step(), with the van's current pose. */
  setVehiclePose(position, quaternion, velocity, angularVelocity) {
    if (!this.van) return;
    this.van.position.copy(position);
    this.van.quaternion.copy(quaternion);
    this.van.velocity.copy(velocity);
    this.van.angularVelocity.copy(angularVelocity);
    this._center.copy(position);
  }

  /** Drain the accumulated van reaction into VehiclePhysics. */
  applyVanReaction(phys) {
    const { dv, dw } = this._vanReaction;
    if (dv.lengthSq() > 0) {
      if (dv.length() > MAX_VAN_DV) dv.setLength(MAX_VAN_DV);
      phys.velocity.add(dv);
      dv.set(0, 0, 0);
    }
    if (dw.lengthSq() > 0) {
      phys.angularVelocity.add(dw);
      dw.set(0, 0, 0);
    }
  }

  step(dt) {
    if (!this.enabled) return;

    // Refresh the active set periodically rather than every substep — bodies
    // do not enter and leave a 45 m radius in 8 ms.
    if (--this._rebuild <= 0) {
      this._rebuild = 10;
      this._refreshActive();
    }

    let awake = 0;
    for (const b of this.active) {
      if (b.static) continue;
      if (!b.awake) { this._maybeWake(b); if (!b.awake) continue; }
      // Hard ceiling on simulated bodies — a pile-up must degrade by freezing
      // the surplus, not by dropping the frame rate.
      if (awake >= MAX_AWAKE) { b.awake = false; continue; }
      awake++;

      // --- integrate forces ------------------------------------------------
      b.velocity.y += this.gravity * dt;
      b.position.addScaledVector(b.velocity, dt);
      // dq = 0.5 * omega * q — same integrator as VehiclePhysics.
      _q.set(b.angularVelocity.x * dt * 0.5, b.angularVelocity.y * dt * 0.5, b.angularVelocity.z * dt * 0.5, 1)
        .multiply(b.quaternion);
      b.quaternion.set(_q.x, _q.y, _q.z, _q.w).normalize();

      this._groundContacts(b, dt);

      // Mild damping so a knocked prop bleeds energy instead of skating.
      b.velocity.multiplyScalar(Math.max(0, 1 - 0.25 * dt));
      b.angularVelocity.multiplyScalar(Math.max(0, 1 - 0.9 * dt));
      b.moved = true;

      if (this.world.killY != null && b.position.y < this.world.killY) this._goHome(b);
      this._maybeSleep(b, dt);
    }

    if (this.van) this._vanContacts(dt);
    if (this.propVsProp) this._propContacts();
    this.awakeCount = awake;
  }

  // ---- contacts -------------------------------------------------------------

  /**
   * Ground contact via corner rays against the city — the same contract the
   * van's suspension uses, so tiled raycasting comes for free here.
   */
  _groundContacts(b, dt) {
    const h = b.half;
    // Four lower corners; once a prop tips, its "lower" corners in body space
    // are still the ones that reach the ground, so this stays correct.
    //
    // The ray starts LIFTed above the corner rather than at it. A resting prop
    // has its corners exactly on the road, and a ray originating on a triangle
    // lands on the wrong side of it as often as not — the prop then sees no
    // ground at all and falls through the world. Lifting into the body's
    // interior makes the origin unambiguously above the surface; the lift is
    // subtracted back out of the measured distance.
    const lift = h.y;
    const reach = lift + CONTACT_SKIN + 0.3;

    for (let i = 0; i < 4; i++) {
      const sx = i & 1 ? 1 : -1;
      const sz = i & 2 ? 1 : -1;
      _corner.set(sx * h.x, -h.y, sz * h.z).applyQuaternion(b.quaternion).add(b.position);
      _corner.y += lift;

      const hit = this.world.raycast(_corner, DOWN, reach);
      if (!hit) continue;
      // gap = how far the corner sits above the ground (negative = interpenetrating)
      const pen = CONTACT_SKIN - (hit.distance - lift);
      if (pen < 0) continue;

      _n.copy(hit.face ? hit.face.normal : _v1.set(0, 1, 0));
      if (_n.y < 0) _n.negate();

      _contact.copy(hit.point);
      this._resolve(b, _contact, _n, pen, b.restitution, b.friction);
    }
  }

  /** Van (kinematic, but with real mass in the denominator) vs every prop. */
  _vanContacts(dt) {
    const van = this.van;
    // Cheap bounding-sphere reject before the 15-axis test.
    const vanReach = van.half.length();
    for (const b of this.active) {
      if (b.vanCooldown > 0) b.vanCooldown -= dt;
      const dx = b.position.x - van.position.x;
      const dy = b.position.y - van.position.y;
      const dz = b.position.z - van.position.z;
      const reach = vanReach + b.half.length();
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;

      const hit = obbOverlap(van.position, van.quaternion, van.half,
        b.position, b.quaternion, b.half, true);
      if (!hit) continue;

      if (b.static) { this._pushVan(b, hit, van); continue; }

      this._wake(b);
      _n.copy(hit.normal);
      supportPoint(b.position, b.quaternion, b.half, _v1.copy(_n).negate(), _contact);

      // Relative velocity at the contact = prop point velocity - van point velocity.
      // Measured BEFORE any positional correction, or the correction masks the
      // approach and the prop gets pushed along instead of struck.
      _r.copy(_contact).sub(b.position);
      _v1.copy(b.velocity).add(_v2.crossVectors(b.angularVelocity, _r));
      _v3.copy(_contact).sub(van.position);
      _v1.sub(van.velocity).sub(_v2.crossVectors(van.angularVelocity, _v3));
      const vn = _v1.dot(_n);

      // Push the prop clear. Partial, so a resting contact does not teleport.
      b.position.addScaledVector(_n, Math.min(hit.depth, 0.25) * 0.8);

      if (vn > 0) continue; // separating

      // j = -(1+e) vn / (invM + n . ((I^-1 (r x n)) x r)). The van is immovable
      // from the prop's point of view; its real mass is used for the reaction.
      const e = b.restitution;
      _v2.crossVectors(_r, _n);
      _iw.set(_v2.x * b.invInertia.x, _v2.y * b.invInertia.y, _v2.z * b.invInertia.z);
      const k = b.invMass + _v2.crossVectors(_iw, _r).dot(_n);
      if (k <= 1e-9) continue;
      const j = (-(1 + e) * vn) / k;

      b.velocity.addScaledVector(_n, j * b.invMass);
      _v2.crossVectors(_r, _n).multiplyScalar(j);
      b.angularVelocity.x += _v2.x * b.invInertia.x;
      b.angularVelocity.y += _v2.y * b.invInertia.y;
      b.angularVelocity.z += _v2.z * b.invInertia.z;

      // Equal and opposite on the van — but only once per contact episode. The
      // van is kinematic within a substep, so without this gate a heavy prop
      // re-collides every substep and the reactions integrate to nonsense.
      if (b.vanCooldown <= 0) {
        b.vanCooldown = 0.2;
        this._vanReaction.dv.addScaledVector(_n, -j / van.mass);
        if (this.onImpact) this.onImpact(b.handle, Math.abs(j), _contact.clone(), b);
      }
    }
  }

  _pushVan(b, hit, van) {
    // Static prop: report it so the van's crash chain fires, but let the van's
    // own city collision do the stopping — we never write the van's position.
    const closing = van.velocity.dot(hit.normal);
    if (closing <= 0.5) return;
    this._vanReaction.dv.addScaledVector(hit.normal, -closing * 0.5);
    if (this.onImpact && closing > 2) {
      supportPoint(b.position, b.quaternion, b.half, _v1.copy(hit.normal).negate(), _contact);
      this.onImpact(b.handle, closing * van.mass * 0.1, _contact.clone(), b);
    }
  }

  /** Awake-vs-awake only, one contact each — stops two knocked cones from
   *  interpenetrating without pretending to support stacking. */
  _propContacts() {
    // Reused scratch — this runs every substep and must not allocate.
    const list = this._awakeScratch;
    list.length = 0;
    for (const b of this.active) if (b.awake && !b.static) list.push(b);
    // O(n^2) is fine for a handful of tumbling props and ruinous for a crowd.
    // Above the cap we simply skip prop-vs-prop; the van still hits everything.
    if (list.length > MAX_PAIRWISE) return;

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]; const b = list[j];
        // Bounding-sphere reject before the 15-axis test.
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const dz = a.position.z - b.position.z;
        const reach = a.half.length() + b.half.length();
        if (dx * dx + dy * dy + dz * dz > reach * reach) continue;

        const hit = obbOverlap(a.position, a.quaternion, a.half, b.position, b.quaternion, b.half);
        if (!hit) continue;
        const total = a.invMass + b.invMass;
        if (total <= 0) continue;
        a.position.addScaledVector(hit.normal, -hit.depth * (a.invMass / total));
        b.position.addScaledVector(hit.normal, hit.depth * (b.invMass / total));

        _v1.copy(b.velocity).sub(a.velocity);
        const vn = _v1.dot(hit.normal);
        if (vn > 0) continue;
        const jj = (-(1 + Math.min(a.restitution, b.restitution)) * vn) / total;
        a.velocity.addScaledVector(hit.normal, -jj * a.invMass);
        b.velocity.addScaledVector(hit.normal, jj * b.invMass);
      }
    }
  }

  /** Normal + friction impulse at a contact, with positional correction. */
  _resolve(b, point, normal, penetration, restitution, friction) {
    _r.copy(point).sub(b.position);
    _v1.copy(b.velocity).add(_v2.crossVectors(b.angularVelocity, _r));
    const vn = _v1.dot(normal);

    if (penetration > 0) b.position.addScaledVector(normal, penetration * BAUMGARTE);

    if (vn < 0) {
      _v2.crossVectors(_r, normal);
      _iw.set(_v2.x * b.invInertia.x, _v2.y * b.invInertia.y, _v2.z * b.invInertia.z);
      const k = b.invMass + _v2.crossVectors(_iw, _r).dot(normal);
      if (k > 1e-9) {
        // Low restitution near rest, or a resting prop buzzes forever.
        const e = Math.abs(vn) < 0.6 ? 0 : restitution;
        const j = (-(1 + e) * vn) / k;
        b.velocity.addScaledVector(normal, j * b.invMass);
        _v2.crossVectors(_r, normal).multiplyScalar(j);
        b.angularVelocity.x += _v2.x * b.invInertia.x;
        b.angularVelocity.y += _v2.y * b.invInertia.y;
        b.angularVelocity.z += _v2.z * b.invInertia.z;

        // Coulomb friction on the tangential component.
        _v1.copy(b.velocity).add(_v2.crossVectors(b.angularVelocity, _r));
        _v2.copy(_v1).addScaledVector(normal, -_v1.dot(normal));
        const vt = _v2.length();
        if (vt > 1e-4) {
          _v2.multiplyScalar(1 / vt);
          const jt = Math.min(vt / k, friction * Math.abs(j));
          b.velocity.addScaledVector(_v2, -jt * b.invMass);
          _r.cross(_v2).multiplyScalar(-jt);
          b.angularVelocity.x += _r.x * b.invInertia.x;
          b.angularVelocity.y += _r.y * b.invInertia.y;
          b.angularVelocity.z += _r.z * b.invInertia.z;
        }
      }
    }
  }

  // ---- activity management ---------------------------------------------------

  _refreshActive() {
    const c = this._center;
    const r2 = SIM_RADIUS * SIM_RADIUS;
    this.active.length = 0;
    for (const b of this.bodies.values()) {
      const dx = b.position.x - c.x;
      const dz = b.position.z - c.z;
      if (dx * dx + dz * dz > r2) {
        if (!b.static && b.awake) { b.awake = false; b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); }
        continue;
      }
      this.active.push(b);
    }
  }

  _wake(b) {
    if (b.static) return;
    b.awake = true;
    b.sleepTimer = 0;
  }

  _maybeWake(b) {
    if (!this.van) return;
    const dx = b.position.x - this.van.position.x;
    const dz = b.position.z - this.van.position.z;
    if (dx * dx + dz * dz < WAKE_RADIUS * WAKE_RADIUS) this._wake(b);
  }

  _maybeSleep(b, dt) {
    if (b.velocity.lengthSq() > SLEEP_LIN * SLEEP_LIN || b.angularVelocity.lengthSq() > SLEEP_ANG * SLEEP_ANG) {
      b.sleepTimer = 0;
      return;
    }
    b.sleepTimer += dt;
    if (b.sleepTimer < SLEEP_TIME) return;
    b.awake = false;
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);

    // Tidy up over a long session: a prop knocked far from home and long since
    // abandoned goes back, so the city does not slowly turn into a scrapyard.
    if (b.position.distanceToSquared(b.home.position) > 9) {
      b.displacedFor += b.sleepTimer;
      if (b.displacedFor > HOME_TIMEOUT) this._goHome(b);
    }
  }

  _goHome(b) {
    b.position.copy(b.home.position);
    b.quaternion.copy(b.home.quaternion);
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
    b.awake = false;
    b.sleepTimer = 0;
    b.displacedFor = 0;
    b.moved = true;
  }

  /** Render transform: M = T(position) . R(quaternion) . T(-comOffset). */
  getRenderMatrix(handle, out) {
    const b = this.bodies.get(handle);
    if (!b) return null;
    _v1.copy(b.comOffset).applyQuaternion(b.quaternion);
    return out.compose(_v2.copy(b.position).sub(_v1), b.quaternion, _v1.set(1, 1, 1));
  }

  forEachMoved(cb) {
    for (const b of this.bodies.values()) {
      if (!b.moved) continue;
      b.moved = false;
      cb(b.handle, b);
    }
  }

  /** Live re-tune from the debug GUI — recomputes the inertia tensor. */
  setMass(handle, kg) {
    const b = this.bodies.get(handle);
    if (!b || b.static) return;
    b.mass = Math.max(0.5, kg);
    b.invMass = 1 / b.mass;
    const I = b.shape === 'cylinder'
      ? cylinderInertia(b.mass, Math.max(b.half.x, b.half.z), b.half.y * 2, new THREE.Vector3())
      : boxInertia(b.mass, b.half, new THREE.Vector3());
    b.invInertia.set(1 / I.x, 1 / I.y, 1 / I.z);
  }

  resetAll() { for (const b of this.bodies.values()) if (!b.static) this._goHome(b); }
}
