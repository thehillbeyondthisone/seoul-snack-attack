// Sketchbook-inspired locomotion rebuilt for this game's fixed-step BVH stack.
// Feet position + upright capsule, camera-relative movement, spring response,
// coyote/buffered jump, explicit states, and walk-up vehicle entry.
import * as THREE from 'three';
import { createCourierModel, animateCourier } from './model.js';
import { resolveCapsule, moveCapsuleSwept, capsuleSpawnIsClear } from '../world/capsule-collision.js';

const HEIGHT = 1.72;
const RADIUS = 0.32;
const WALK_SPEED = 2.7;
const SPRINT_SPEED = 5.8;
const JUMP_SPEED = 6.7;
const GRAVITY = 19.5;
const ENTER_RANGE = 5.2;
const EXIT_MAX_KMH = 10;
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _attempt = new THREE.Vector3();
const _local = new THREE.Vector3();
const _world = new THREE.Vector3();
const _inverse = new THREE.Quaternion();
const _capsuleCenter = new THREE.Vector3(0, HEIGHT * 0.5, 0);
const _impactVelocity = new THREE.Vector3();
const _entryVelocity = new THREE.Vector3();

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class PlayerCharacter {
  constructor({ scene, city, phys, getVehicleDef, hud = null, gameplayProfile = 'normal' }) {
    this.city = city;
    this.phys = phys;
    this.getVehicleDef = getVehicleDef;
    this.hud = hud;
    this.stunt = gameplayProfile === 'stunt';
    this.propFacade = null;
    this.heldProp = null;
    this.stuntTime = 0;
    this.tumbleImpact = 0;
    this.tumbleSide = 1;
    this.stuntCompleted = null;
    this.group = createCourierModel();
    this.group.visible = false;
    scene.add(this.group);

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.turnRate = 0;
    this.mode = 'driving';
    this.state = 'driving';
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.enterTimer = 0;
    this.enterTimeout = 1.15;
    this.enterTarget = new THREE.Vector3();
    this.onModeChange = null;
    this._lastSafe = new THREE.Vector3();

    this.prompt = document.createElement('div');
    this.prompt.id = 'player-interaction-prompt';
    this.prompt.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:17%', 'transform:translateX(-50%)',
      'z-index:42', 'display:none', 'pointer-events:none', 'padding:8px 13px',
      'border:1px solid rgba(77,200,255,.55)', 'border-radius:4px',
      'background:rgba(4,8,14,.82)', 'color:#eef4ff',
      "font:750 11px/1.2 Inter,'Segoe UI',sans-serif", 'letter-spacing:.06em',
      'box-shadow:0 8px 28px rgba(0,0,0,.35)',
    ].join(';');
    document.body.appendChild(this.prompt);
  }

  get isDriving() { return this.mode === 'driving'; }
  get isOnFoot() { return this.mode === 'onFoot' || this.mode === 'entering'; }
  get isStunting() { return this.stunt && ['dive', 'tumble', 'recovering'].includes(this.state); }
  get activePosition() { return this.isDriving ? this.phys.meshPosition.clone() : this.position.clone(); }

  get playerPose() {
    if (this.isDriving) {
      const fwd = _forward.set(0, 0, 1).applyQuaternion(this.phys.quaternion);
      return { position: this.phys.meshPosition.clone(), heading: Math.atan2(fwd.x, fwd.z), driving: true };
    }
    return { position: this.position.clone(), heading: this.heading, driving: false };
  }

  _setMode(mode) {
    if (mode !== 'onFoot') this._dropHeld();
    this.mode = mode;
    this.group.visible = mode !== 'driving';
    this.prompt.style.display = 'none';
    this.onModeChange?.(mode);
  }

  _vehicleSideCandidates() {
    const def = this.getVehicleDef();
    const offset = (def?.collisionHalf?.x || 1.2) + RADIUS + 0.58;
    const origin = this.phys.meshPosition;
    const vehicleFeetY = origin.y - (def?.collisionHalf?.y || 0.7);
    const candidates = [];
    for (const side of [1, -1]) {
      const point = new THREE.Vector3(side * offset, 0, 0)
        .applyQuaternion(this.phys.quaternion).add(origin);
      const ground = this.city.findGround(point.x, point.z);
      if (!ground) continue;
      point.y = ground.point.y;
      // A downward ground ray can hit the top of an adjacent wall. That is
      // not a door-side exit even if an upright capsule fits on the roof.
      if (Math.abs(point.y - vehicleFeetY) > 1.25) continue;
      candidates.push(point);
    }
    return candidates;
  }

  exitVehicle({ force = false } = {}) {
    if (!this.isDriving) return false;
    if (!force && this.phys.speedKmh > EXIT_MAX_KMH) {
      this.hud?.toast?.('차량을 먼저 세우세요', 'Slow down before exiting', 'bad');
      return false;
    }
    const candidates = this._vehicleSideCandidates();
    const point = candidates.find((candidate) =>
      capsuleSpawnIsClear(this.city, candidate, { height: HEIGHT, radius: RADIUS })
    );
    if (!point) {
      this.hud?.toast?.('내릴 공간이 없습니다', 'No room to exit', 'bad');
      return false;
    }
    this.position.copy(point);
    this._lastSafe.copy(point);
    this.velocity.copy(this.phys.velocity).multiplyScalar(0.12);
    const fwd = _forward.set(0, 0, 1).applyQuaternion(this.phys.quaternion);
    this.heading = Math.atan2(fwd.x, fwd.z);
    this.grounded = true;
    this.state = 'idle';
    this._setMode('onFoot');
    this.hud?.toast?.('차량에서 내렸습니다', 'On foot · F/B to enter');
    return true;
  }

  _dropHeld(throwDirection = null) {
    if (this.heldProp == null) return;
    this.propFacade?.releaseHeld?.(throwDirection);
    this.heldProp = null;
  }

  /** Prototype-only moving exit. Keep the launch bounded for swept-capsule
   * collision and refuse it when neither side of the truck is clear. */
  bailVehicle() {
    if (!this.stunt || !this.isDriving || this.phys.speedKmh <= EXIT_MAX_KMH) return false;
    const point = this._vehicleSideCandidates().find((candidate) =>
      capsuleSpawnIsClear(this.city, candidate, { height: HEIGHT, radius: RADIUS })
    );
    if (!point) {
      this.hud?.toast?.('뛰어내릴 공간이 없습니다', 'No clear side to bail out', 'bad');
      return false;
    }
    this.position.copy(point);
    this._lastSafe.copy(point);
    this.velocity.copy(this.phys.velocity);
    this.velocity.y = 0;
    if (this.velocity.length() > 16) this.velocity.setLength(16);
    _world.subVectors(point, this.phys.meshPosition).setY(0).normalize();
    this.velocity.addScaledVector(_world, 2.5);
    this.velocity.y = 2.6;
    this.heading = Math.atan2(this.velocity.x, this.velocity.z);
    this.grounded = false;
    this.state = 'dive';
    this.stuntTime = 0;
    this.tumbleImpact = 0;
    this.jumpBuffer = 0;
    this._setMode('onFoot');
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    this.hud?.toast?.('달리는 차에서 점프!', 'BAIL OUT · recover with Space / A');
    return true;
  }

  beginEnterVehicle() {
    if (this.mode !== 'onFoot' || this.isStunting || this.phys.speedKmh > EXIT_MAX_KMH) return false;
    if (horizontalDistance(this.position, this.phys.meshPosition) > ENTER_RANGE) return false;
    const candidates = this._vehicleSideCandidates();
    if (!candidates.length) return false;
    candidates.sort((a, b) => a.distanceToSquared(this.position) - b.distanceToSquared(this.position));
    if (!capsuleSpawnIsClear(this.city, candidates[0], { height: HEIGHT, radius: RADIUS })) return false;
    this.enterTarget.copy(candidates[0]);
    this.enterTimer = 0;
    this.enterTimeout = Math.max(1.15, horizontalDistance(this.position, this.enterTarget) / 4.2 + 0.35);
    this.velocity.set(0, 0, 0);
    this.state = 'enteringVehicle';
    this._setMode('entering');
    return true;
  }

  _finishEnter() {
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.state = 'driving';
    this._setMode('driving');
    this.hud?.toast?.('운전석 탑승', 'Driving · F/B to exit');
  }

  resetToRoad() {
    this._dropHeld();
    const safe = this.city.getSafeReset?.(this.position);
    if (!safe) return;
    const ground = this.city.findGround(safe.position.x, safe.position.z);
    this.position.set(safe.position.x, ground?.point.y ?? safe.position.y, safe.position.z);
    this.velocity.set(0, 0, 0);
    this.heading = safe.heading || 0;
    this._lastSafe.copy(this.position);
    this.state = 'idle';
    this.stuntTime = 0;
    this.tumbleImpact = 0;
    this.grounded = true;
  }

  _resolveVehicleOverlap() {
    const def = this.getVehicleDef();
    if (!def?.collisionHalf) return;
    const origin = this.phys.meshPosition;
    _inverse.copy(this.phys.quaternion).invert();
    _local.copy(this.position).add(_capsuleCenter).sub(origin).applyQuaternion(_inverse);
    const half = def.collisionHalf;
    if (Math.abs(_local.y) > half.y + HEIGHT * 0.5) return;
    const dx = half.x + RADIUS - Math.abs(_local.x);
    const dz = half.z + RADIUS - Math.abs(_local.z);
    if (dx <= 0 || dz <= 0) return;
    if (dx < dz) _world.set(Math.sign(_local.x) || 1, 0, 0).multiplyScalar(dx);
    else _world.set(0, 0, Math.sign(_local.z) || 1).multiplyScalar(dz);
    _world.applyQuaternion(this.phys.quaternion);
    this.position.add(_world);
    const n = _world.normalize();
    const into = this.velocity.dot(n);
    if (into < 0) this.velocity.addScaledVector(n, -into);
  }

  updateFixed(dt, input, cameraForward) {
    if (this.mode === 'driving') return;

    if (this.mode === 'entering') {
      this.enterTimer += dt;
      _wish.subVectors(this.enterTarget, this.position);
      _wish.y = 0;
      const distance = _wish.length();
      if (distance > 0.02) {
        _wish.normalize();
        this.heading = Math.atan2(_wish.x, _wish.z);
        _entryVelocity.copy(_wish).multiplyScalar(Math.min(4.2, distance / Math.max(dt, 1e-6)));
        moveCapsuleSwept(this.city, this.position, _entryVelocity, dt, { height: HEIGHT, radius: RADIUS });
      }
      if (horizontalDistance(this.position, this.enterTarget) < 0.18) this._finishEnter();
      else if (this.enterTimer > this.enterTimeout) {
        this.state = 'idle';
        this._setMode('onFoot');
        this.hud?.toast?.('차량으로 가는 길이 막혔습니다', 'Path to truck is blocked', 'bad');
      }
      this.group.position.copy(this.position);
      this.group.rotation.y = this.heading;
      return;
    }

    const jumpEdge = input.pressed('jump');
    if (this.stunt && this.isStunting) {
      if (jumpEdge && this.grounded && Math.hypot(this.velocity.x, this.velocity.z) < 2.5
        && capsuleSpawnIsClear(this.city, this.position, { height: HEIGHT, radius: RADIUS })) {
        this.state = 'recovering';
        this.stuntTime = 0;
      }
    } else if (jumpEdge) this.jumpBuffer = 0.14;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);

    const axes = input.moveAxes();
    _forward.copy(cameraForward).setY(0);
    if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, 1);
    _forward.normalize();
    // THREE.Camera looks down local -Z, so screen-right is forward × up.
    // The previous up × forward basis mirrored A/D relative to the view.
    _right.set(-_forward.z, 0, _forward.x);
    _wish.copy(_forward).multiplyScalar(axes.y).addScaledVector(_right, axes.x);
    if (_wish.lengthSq() > 1) _wish.normalize();

    if (this.stunt && !this.isStunting && input.pressed('dive') && this.mode === 'onFoot') {
      this._dropHeld();
      const direction = _wish.lengthSq() > 0.04 ? _wish.clone().normalize()
        : new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
      this.velocity.addScaledVector(direction, Math.max(0, 7.5 - this.velocity.dot(direction)));
      this.velocity.y = Math.max(this.velocity.y, this.grounded ? 2.2 : 0.8);
      this.heading = Math.atan2(direction.x, direction.z);
      this.grounded = false;
      this.state = 'dive';
      this.stuntTime = 0;
      this.tumbleImpact = 0;
      this.jumpBuffer = 0;
    }
    if (this.stunt && input.pressed('shove') && !this.isStunting) {
      const direction = _wish.lengthSq() > 0.04 ? _wish.clone().normalize()
        : new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
      this.propFacade?.shove?.(this.position, direction, 1.6);
    }
    if (this.stunt && this.mode === 'onFoot' && !this.isStunting && input.pressed('grab')) {
      const direction = _wish.lengthSq() > 0.04 ? _wish.clone().normalize()
        : new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
      if (this.heldProp != null) {
        this._dropHeld(direction.clone().addScaledVector(new THREE.Vector3(0, 1, 0), 0.25));
        this.hud?.toast?.('던졌습니다!', 'THROW!');
      } else {
        const candidate = this.propFacade?.findGrabCandidate?.(this.position, direction);
        if (candidate && this.propFacade.grab(candidate.handle)) {
          this.heldProp = candidate.handle;
          this.hud?.toast?.('집었습니다', 'Carry it · H / D-pad down to throw');
        }
      }
    }

    const sprinting = input.held('sprint') && axes.y > 0.1;
    const targetSpeed = sprinting ? SPRINT_SPEED : WALK_SPEED;
    _wish.multiplyScalar(targetSpeed);
    const response = this.isStunting ? 0.7 : this.grounded ? (sprinting ? 8.5 : 11.5) : 2.3;
    const blend = 1 - Math.exp(-dt * response);
    this.velocity.x += (_wish.x - this.velocity.x) * blend;
    this.velocity.z += (_wish.z - this.velocity.z) * blend;

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.velocity.y = JUMP_SPEED;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
    }
    this.velocity.y -= GRAVITY * dt;

    _impactVelocity.copy(this.velocity);
    _attempt.copy(this.position).addScaledVector(this.velocity, dt);
    const wasFalling = this.velocity.y < -1.5;
    const hit = this.isStunting
      ? moveCapsuleSwept(this.city, _attempt.copy(this.position), this.velocity, dt, {
        height: HEIGHT, radius: RADIUS,
        axis: new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)),
      })
      : resolveCapsule(this.city, _attempt, this.velocity, { height: HEIGHT, radius: RADIUS });
    this.position.copy(_attempt);
    this.grounded = hit.grounded;
    this._resolveVehicleOverlap();
    if (this.stunt && this.isStunting) {
      const propContacts = this.propFacade?.contactCharacter?.(this.position, this.velocity, 0.42, dt) || 0;
      this.stuntTime += dt;
      if (this.state === 'dive' && (hit.contacts > 0 || propContacts > 0 || (this.grounded && wasFalling))) {
        const lostSpeed = _impactVelocity.distanceTo(this.velocity);
        this.tumbleImpact = THREE.MathUtils.clamp(Math.max(lostSpeed, propContacts ? _impactVelocity.length() * 0.4 : 0) / 10, 0.25, 1);
        const impulseX = _impactVelocity.x - this.velocity.x;
        const impulseZ = _impactVelocity.z - this.velocity.z;
        const lateral = Math.cos(this.heading) * impulseX - Math.sin(this.heading) * impulseZ;
        this.tumbleSide = Math.sign(lateral) || this.tumbleSide;
        this.state = 'tumble';
        this.stuntTime = 0;
      }
      if (this.state === 'recovering' && this.stuntTime >= 0.48) {
        this.state = 'idle';
        this.stuntTime = 0;
        this.stuntCompleted?.();
      }
    }

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (_wish.lengthSq() > 0.02) {
      const targetHeading = Math.atan2(_wish.x, _wish.z);
      const delta = wrapAngle(targetHeading - this.heading);
      this.turnRate = delta / Math.max(dt, 1e-4);
      this.heading += delta * (1 - Math.exp(-dt * 13));
    } else {
      this.turnRate *= Math.exp(-dt * 9);
    }
    if (!this.isStunting) {
      if (!this.grounded) this.state = this.velocity.y > 0.2 ? 'jump' : 'fall';
      else if (horizontalSpeed < 0.18) this.state = 'idle';
      else this.state = sprinting && horizontalSpeed > WALK_SPEED + 0.5 ? 'sprint' : 'walk';
    }

    if (this.heldProp != null) {
      _world.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      _attempt.copy(this.position).addScaledVector(_world, 1.05);
      _attempt.y += 1.05;
      if (!this.propFacade?.holdAt?.(this.heldProp, _attempt, dt)) this.heldProp = null;
    }

    if (this.grounded) this._lastSafe.copy(this.position);
    if (this.position.y < (this.city.killY ?? -20)) this.resetToRoad();
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
  }

  updateVisual(dt) {
    if (!this.isOnFoot) return;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    animateCourier(this.group, dt, {
      speed, state: this.state, grounded: this.grounded, turn: this.turnRate,
      impact: this.tumbleImpact, tumbleSide: this.tumbleSide,
    });
    const near = horizontalDistance(this.position, this.phys.meshPosition) <= ENTER_RANGE;
    const facing = _world.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const candidate = this.stunt && this.mode === 'onFoot' && !this.isStunting && this.heldProp == null
      ? this.propFacade?.findGrabCandidate?.(this.position, facing) : null;
    if (this.mode === 'onFoot' && !this.isStunting && (this.heldProp != null || candidate || (near && this.phys.speedKmh <= EXIT_MAX_KMH))) {
      const vehicleText = near && this.phys.speedKmh <= EXIT_MAX_KMH
        ? document.body.classList.contains('touch-controls-active')
          ? '문 아이콘 · TAP THE DOOR ICON TO ENTER'
          : 'F / B · ENTER VEHICLE' : '';
      const propText = this.heldProp != null ? 'H / D-PAD DOWN · THROW'
        : candidate ? 'H / D-PAD DOWN · GRAB OBJECT' : '';
      this.prompt.textContent = [vehicleText, propText].filter(Boolean).join('  ·  ');
      this.prompt.style.display = 'block';
    } else {
      this.prompt.style.display = 'none';
    }
  }
}
