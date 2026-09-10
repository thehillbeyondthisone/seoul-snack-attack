// Sketchbook-inspired locomotion rebuilt for this game's fixed-step BVH stack.
// Feet position + upright capsule, camera-relative movement, spring response,
// coyote/buffered jump, explicit states, and walk-up vehicle entry.
import * as THREE from 'three';
import { createCourierModel, animateCourier } from './model.js';
import { resolveCapsule, capsuleSpawnIsClear } from '../world/capsule-collision.js';

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

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class PlayerCharacter {
  constructor({ scene, city, phys, getVehicleDef, hud = null }) {
    this.city = city;
    this.phys = phys;
    this.getVehicleDef = getVehicleDef;
    this.hud = hud;
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
  get activePosition() { return this.isDriving ? this.phys.meshPosition.clone() : this.position.clone(); }

  get playerPose() {
    if (this.isDriving) {
      const fwd = _forward.set(0, 0, 1).applyQuaternion(this.phys.quaternion);
      return { position: this.phys.meshPosition.clone(), heading: Math.atan2(fwd.x, fwd.z), driving: true };
    }
    return { position: this.position.clone(), heading: this.heading, driving: false };
  }

  _setMode(mode) {
    this.mode = mode;
    this.group.visible = mode !== 'driving';
    this.prompt.style.display = 'none';
    this.onModeChange?.(mode);
  }

  _vehicleSideCandidates() {
    const def = this.getVehicleDef();
    const offset = (def?.collisionHalf?.x || 1.2) + RADIUS + 0.58;
    const origin = this.phys.meshPosition;
    const candidates = [];
    for (const side of [1, -1]) {
      const point = new THREE.Vector3(side * offset, 0, 0)
        .applyQuaternion(this.phys.quaternion).add(origin);
      const ground = this.city.findGround(point.x, point.z);
      if (!ground) continue;
      point.y = ground.point.y;
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
    ) || candidates[0];
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

  beginEnterVehicle() {
    if (this.mode !== 'onFoot' || this.phys.speedKmh > EXIT_MAX_KMH) return false;
    if (horizontalDistance(this.position, this.phys.meshPosition) > ENTER_RANGE) return false;
    const candidates = this._vehicleSideCandidates();
    if (!candidates.length) return false;
    candidates.sort((a, b) => a.distanceToSquared(this.position) - b.distanceToSquared(this.position));
    this.enterTarget.copy(candidates[0]);
    this.enterTimer = 0;
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
    const safe = this.city.getSafeReset?.(this.position);
    if (!safe) return;
    const ground = this.city.findGround(safe.position.x, safe.position.z);
    this.position.set(safe.position.x, ground?.point.y ?? safe.position.y, safe.position.z);
    this.velocity.set(0, 0, 0);
    this.heading = safe.heading || 0;
    this._lastSafe.copy(this.position);
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
        this.position.addScaledVector(_wish, Math.min(distance, dt * 4.2));
      }
      if (distance < 0.18 || this.enterTimer > 1.15) this._finishEnter();
      this.group.position.copy(this.position);
      this.group.rotation.y = this.heading;
      return;
    }

    if (input.pressed('jump')) this.jumpBuffer = 0.14;
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

    const sprinting = input.held('sprint') && axes.y > 0.1;
    const targetSpeed = sprinting ? SPRINT_SPEED : WALK_SPEED;
    _wish.multiplyScalar(targetSpeed);
    const response = this.grounded ? (sprinting ? 8.5 : 11.5) : 2.3;
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

    _attempt.copy(this.position).addScaledVector(this.velocity, dt);
    const hit = resolveCapsule(this.city, _attempt, this.velocity, { height: HEIGHT, radius: RADIUS });
    this.position.copy(_attempt);
    this.grounded = hit.grounded;
    this._resolveVehicleOverlap();

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (_wish.lengthSq() > 0.02) {
      const targetHeading = Math.atan2(_wish.x, _wish.z);
      const delta = wrapAngle(targetHeading - this.heading);
      this.turnRate = delta / Math.max(dt, 1e-4);
      this.heading += delta * (1 - Math.exp(-dt * 13));
    } else {
      this.turnRate *= Math.exp(-dt * 9);
    }
    if (!this.grounded) this.state = this.velocity.y > 0.2 ? 'jump' : 'fall';
    else if (horizontalSpeed < 0.18) this.state = 'idle';
    else this.state = sprinting && horizontalSpeed > WALK_SPEED + 0.5 ? 'sprint' : 'walk';

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
    });
    const near = horizontalDistance(this.position, this.phys.meshPosition) <= ENTER_RANGE;
    if (this.mode === 'onFoot' && near && this.phys.speedKmh <= EXIT_MAX_KMH) {
      this.prompt.textContent = 'F / B  차량 탑승 · ENTER VEHICLE';
      this.prompt.style.display = 'block';
    } else {
      this.prompt.style.display = 'none';
    }
  }
}
