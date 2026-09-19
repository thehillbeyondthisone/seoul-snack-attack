// Seoul Snack Attack — order state machine + waypoint markers + persistence.
// idle → offered → toPickup → waiting(3s) → delivering (timed, quality) → delivered → idle.
import * as THREE from 'three';
import { RESTAURANTS, SNACK_STREET_RESTAURANTS, FOOD_TYPES } from './data/restaurants.js';
import { pickOrderNotes } from './data/order-notes.js';
import { FoodDisplay } from './food-display.js';
import { DEFAULT_SAVE, loadSave, persistSave } from './save.js';
import { describeStreet } from '../world/expanse-street-names.js';
import { dayProgress } from './day-progress.js';
import { TruckUpgrade } from './truck-upgrade.js';

// Generous arcade staging areas: large enough to hit cleanly at city speed,
// while pickup completion still asks the driver to settle the vehicle.
const ZONE_RADIUS = 9.5;
const PICKUP_MAX_SPEED_KMH = 12;
const DELIVERY_MAX_SPEED_KMH = 12;
const WAIT_TIME = 3;
const OFFER_TIMEOUT = 25;
const FIRST_OFFER_TIMEOUT = 45;
const AVG_SPEED = 8.5; // m/s assumption: traffic, corners, and recovery all count
const DELIVERY_BUFFER = 18;
const MIN_DELIVERY_TIME = 40;
const PAYOUT_PENALTY_INTERVAL = 12;
const PAYOUT_FLOOR = 0.35;

export class Orders {
  constructor({ scene, city, phys, hud, camera, audio = null, player = null }) {
    this.scene = scene;
    this.city = city;
    this.phys = phys;
    this.hud = hud;
    // Only used to orient the objective arrow. Camera-relative rather than
    // van-relative: the chase cam lags the van through a slide, and the arrow has
    // to agree with what the player is actually looking at.
    this.camera = camera;
    this.audio = audio;
    if (audio?.music) audio.music.onUnlock = (tape) => this.unlockTape(tape);
    // Optional on-foot/vehicle mode provider. Delivery zone completion stays
    // vehicle-based, but bearing, route and mini-map follow whoever is active.
    this.player = player;

    this.save = loadSave();
    this.truckUpgrade = new TruckUpgrade(this);
    this.state = 'idle';
    this.idleTimer = 4;   // first offer lands quickly
    this.freezeTimers = false;
    this.paused = false;
    this.order = null;
    this.offerDuration = OFFER_TIMEOUT;
    this.quality = 100;
    this.spillMeter = 0;
    this._fragileCooldown = 0;
    this.route = null;
    this._routeTimer = 0;
    this._routeTarget = null;
    this._routeEdge = null;
    this._routeWarned = false;

    // Bind restaurants to authored, named storefronts when district dressing
    // loaded successfully. Fall back to sampled road points so an optional
    // dressing failure never bricks the order loop.
    const pickupById = new Map((city.pickupSites || []).map((site) => [site.id, site]));
    const roster = city.restaurantRoster === 'snack-street'
      ? SNACK_STREET_RESTAURANTS
      : RESTAURANTS;
    this.restaurants = roster.map((r, i) => {
      const site = pickupById.get(r.id) || null;
      const preferred = site?.point || city.points[i % city.points.length];
      const anchor = city.deliveryAnchors.reduce((best, candidate) =>
        !best || candidate.point.distanceToSquared(preferred) < best.point.distanceToSquared(preferred)
          ? candidate : best, null);
      // The graph anchor is for routing; the interaction marker belongs at the
      // actual authored shop door when one exists. Replacing it with the road
      // projection made pickups float back into the carriageway.
      const point = site?.point?.clone() || anchor.point.clone();
      return { ...r, point, anchor, pickupSite: site };
    });

    phys.onCrash = (severity) => this._onCrash(severity);

    // ---- Waypoint markers ------------------------------------------------
    const g = new THREE.Group();
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.86, 5.2, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff2d78, transparent: true, opacity: 0.11,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: true,
      })
    );
    this.beacon.position.y = 2.6;
    this.beaconCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 5.3, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff2d78, transparent: true, opacity: 0.48,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      })
    );
    this.beaconCore.position.y = 2.7;
    this.ring = new THREE.Mesh(
      // The bright boundary now communicates the actual gameplay footprint
      // instead of drawing a tiny ring inside a much larger invisible trigger.
      new THREE.RingGeometry(7.25, 9.15, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xff2d78, transparent: true, opacity: 0.42,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: true,
      })
    );
    this.ring.position.y = 0.1;
    this.innerRing = new THREE.Mesh(
      new THREE.RingGeometry(4.55, 4.82, 48, 1, 0, Math.PI * 1.55).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xff2d78, transparent: true, opacity: 0.46,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: true,
      })
    );
    this.innerRing.position.y = 0.105;
    this.markerCrown = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.045, 8, 40).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xff2d78, transparent: true, opacity: 0.68,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      })
    );
    this.markerCrown.position.y = 5.05;
    this.marker = new THREE.Group();
    this.marker.add(this.beacon, this.beaconCore, this.ring, this.innerRing, this.markerCrown);
    // A small practical light gives the pillar a readable pool on wet asphalt
    // without touching the city's fixed streetlight pool.
    this.markerLight = new THREE.PointLight(0xff2d78, 15, 11, 2);
    this.markerLight.position.y = 1.25;
    this.marker.add(this.markerLight);
    this.foodDisplay = new FoodDisplay(this.marker, scene);
    this.marker.visible = false;
    g.add(this.marker);

    // Arrow above the van pointing at the target.
    this.arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.9, 10).rotateX(Math.PI / 2), // point along +Z
      new THREE.MeshBasicMaterial({ color: 0xff2d78, transparent: true, opacity: 0.9, fog: false })
    );
    this.arrow.visible = false;
    g.add(this.arrow);
    scene.add(g);

    // The HUD's objective row carries heading and range now, so the van-mounted
    // 3D arrow is redundant. The destination beacon stays — that is a world
    // marker, not a UI element, and you need to see where you are aiming.
    this.vanArrowEnabled = false;

    hud.setCash(this.save.cash);
    hud.setStats({ rating: this.avgStars, deliveries: this.save.deliveries });
  }

  /** Objective heading, clockwise from the camera's forward axis. */
  _bearingTo(point) {
    if (!this.camera) return 0;
    const fwd = this.camera.getWorldDirection(_fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) return 0;
    fwd.normalize();
    const right = _right.copy(fwd).cross(_up);
    const dir = _dir.copy(point).sub(this.player?.activePosition || this.phys.position);
    dir.y = 0;
    return Math.atan2(dir.dot(right), dir.dot(fwd));
  }

  _setObjective(point, distance) {
    this.hud.setObjective?.(distance, this._bearingTo(point));
  }

  /**
   * Stay-in-zone dwell. Returns true when the wait has elapsed.
   * Leaving the ring aborts back to `abortState`. Speeding pauses the bar.
   */
  _tickDwell(dt, point, color, maxKmh, kind, abortState) {
    const d = this.phys.position.distanceTo(point);
    const settled = this.phys.speedKmh <= maxKmh;
    this._setMarker(point, color, this.phys.position);
    this._setObjective(point, d);
    if (d >= ZONE_RADIUS) {
      this.state = abortState;
      this.waitTimer = WAIT_TIME;
      this.hud.setDwell(null);
      return false;
    }
    if (settled) this.waitTimer -= dt;
    const progress = 1 - Math.max(0, this.waitTimer) / WAIT_TIME;
    this.hud.setDwell(progress, { kind, paused: !settled });
    return this.waitTimer <= 0;
  }

  _beginDelivery() {
    const o = this.order;
    this.state = 'delivering';
    this.hud.setDwell(null);
    this.foodDisplay.followVehicle(this.phys.meshPosition);
    this.quality = 100;
    this.spillMeter = 0;
    o.livePayout = o.payout;
    o.penaltyTimer = PAYOUT_PENALTY_INTERVAL;
    o.penaltyQuality = this.quality;
    this.hud.toast(`${o.dish.nameKo} 픽업 완료`, 'Picked up — deliver now');
    this.audio?.event('pickup');
    this.hud.showTicket({
      to: o.dropoffAnchor.nameKo || '배달지 · Drop-off',
      toEn: o.dropoffAnchor.nameEn || 'DROP-OFF',
      stage: '배달 · Deliver',
      stageEn: 'DELIVER',
      seconds: o.timer,
      totalSeconds: o.timerMax,
      payout: o.payout,
      distanceKm: o.dist / 1000,
      condition: this.quality / 100,
      timed: true,
      ...this._noteFields('deliver'),
    });
  }

  _updateNavigation(dt, target) {
    const pose = this.player?.playerPose;
    const playerPosition = pose?.position || this.phys.meshPosition.clone();
    const fwd = pose
      ? null
      : new THREE.Vector3(0, 0, 1).applyQuaternion(this.phys.quaternion);
    const player = {
      position: playerPosition,
      heading: pose?.heading ?? Math.atan2(fwd.x, fwd.z),
    };
    const projection = this.city.projectToRoad(playerPosition);
    const targetKey = target ? `${target.x.toFixed(1)},${target.z.toFixed(1)}` : null;
    this._routeTimer -= dt;

    if (!target) {
      this.route = null;
      this._routeTarget = null;
      this._routeEdge = projection?.edgeId || null;
    } else if (
      !this.route || targetKey !== this._routeTarget || this._routeTimer <= 0 ||
      projection?.edgeId !== this._routeEdge || (projection?.lateralDistance ?? 0) > 8
    ) {
      this.route = this.city.findRoute(projection || playerPosition, target);
      this._routeTimer = 0.25;
      this._routeTarget = targetKey;
      this._routeEdge = projection?.edgeId || null;
      if (!this.route && !this._routeWarned) {
        console.warn('orders: route unavailable; retaining bearing and world beacon');
        this._routeWarned = true;
      }
      if (this.route) this._routeWarned = false;
    }
    this.hud.setMiniMap?.({
      graph: this.city.roadGraph,
      bounds: this.city.bounds,
      route: this.route,
      player,
      destination: target,
      maneuver: this.route?.maneuver || null,
      // The projection above is already the nearest carriageway; naming it is
      // a table lookup, so the blade costs nothing extra per frame.
      street: describeStreet(this.city.roadGraph, projection),
    });
  }

  get avgStars() {
    if (!this.save.ratings.length) return 0;
    return this.save.ratings.reduce((a, b) => a + b, 0) / this.save.ratings.length;
  }

  _persist() {
    persistSave(this.save);
  }

  // ------------------------------------------------------------------ offers
  _makeOrder(restaurantId = null) {
    const requested = restaurantId && this.restaurants.find((r) => r.id === restaurantId);
    const rest = requested || this.restaurants[(Math.random() * this.restaurants.length) | 0];
    const dish = rest.dishes[(Math.random() * rest.dishes.length) | 0];
    const deliveryAnchors = this.city.orderDeliveryAnchors || this.city.deliveryAnchors;
    const minRouteDistance = this.city.orderMinRouteDistance ?? 55;
    const candidates = deliveryAnchors
      .filter((anchor) => anchor.edgeId !== rest.anchor.edgeId)
      .map((anchor) => ({ anchor, route: this.city.findRoute(rest.anchor, anchor) }))
      .filter(({ route }) => route && route.distance >= minRouteDistance);
    const selected = candidates[(Math.random() * candidates.length) | 0]
      || { anchor: deliveryAnchors[(Math.random() * deliveryAnchors.length) | 0], route: null };
    const dropoff = selected.anchor.point;
    const route = selected.route || this.city.findRoute(rest.point, dropoff);
    const dist = route?.distance ?? rest.point.distanceTo(dropoff);
    const type = FOOD_TYPES[dish.type];
    const timer = Math.max(MIN_DELIVERY_TIME, DELIVERY_BUFFER + (dist / AVG_SPEED) * type.timerFactor);
    const tip = THREE.MathUtils.randFloat(dish.tip[0], dish.tip[1]);
    const payout = Math.round(dish.price + tip + dist * 20);
    // Flavour only: the customer's two request boxes. Nothing downstream reads
    // them, so a note can never quietly change a timer or a payout.
    const { note, kitchenNote } = pickOrderNotes(dish.type);
    return {
      rest, dish, type, dropoff: dropoff.clone(), dropoffAnchor: selected.anchor,
      route, dist, timer, timerMax: timer, payout, note, kitchenNote,
    };
  }

  /**
   * The request note the panel should be carrying right now. The pickup leg
   * belongs to the kitchen, so it shows 가게 요청사항 when the order has one —
   * you are standing at the counter, and "leave it at the door" is not yet
   * useful. Every other moment shows the rider's own instruction.
   * @param {'pickup'|'deliver'} leg
   */
  _noteFields(leg) {
    const o = this.order;
    if (!o) return {};
    const kitchen = leg === 'pickup' && o.kitchenNote;
    const note = kitchen ? o.kitchenNote : o.note;
    if (!note) return {};
    return {
      note: note.ko,
      noteEn: note.en,
      noteLabel: kitchen ? '가게 요청사항' : '배달 요청사항',
      noteLabelEn: kitchen ? 'Kitchen note' : 'Delivery note',
    };
  }

  setPaused(paused) { this.paused = !!paused; }

  offerNow(restaurantId = null, { first = false } = {}) {
    if (this.state !== 'idle') return;
    const o = this.order = this._makeOrder(restaurantId);
    this.foodDisplay.prepareOrder(o);
    this.state = 'offered';
    this.offerDuration = first ? FIRST_OFFER_TIMEOUT : OFFER_TIMEOUT;
    this.idleTimer = this.offerDuration;
    this.hud.showOffer({
      shop: o.rest.nameKo,
      shopEn: o.rest.nameEn,
      dish: `${o.dish.nameKo} (${o.dish.nameEn}) · ${o.type.ko}`,
      dishEn: `${o.dish.nameEn} · ${o.type.en}`,
      pay: o.payout,
      distanceKm: o.dist / 1000,
      // The offer shows the rider's note, never the kitchen's: before you accept,
      // a fourth-floor walk-up is information you are entitled to.
      note: o.note?.ko,
      noteEn: o.note?.en,
    });
    this.hud.setOfferProgress(1);
    this.audio?.event('offer');
  }

  _accept() {
    const o = this.order;
    this.state = 'toPickup';
    this.foodDisplay.setOrder(o);
    this.hud.hideOffer();
    this.hud.toast(`주문 수락 — ${o.rest.nameKo}`, 'Order accepted');
    // Pickup leg: untimed, and there is no food in the van to have a condition.
    this.hud.showTicket({
      to: o.rest.nameKo,
      toEn: o.rest.nameEn,
      dish: o.dish.nameKo,
      dishEn: o.dish.nameEn,
      order: o,
      stage: '픽업 · Pickup',
      stageEn: 'PICKUP',
      distanceKm: o.dist / 1000,
      timed: false,
      ...this._noteFields('pickup'),
    });
    this.audio?.event('accept');
    this.truckUpgrade.spawn(o.rest);
  }

  // ------------------------------------------------------------------ update
  update(dt, input) {
    if (this.paused) return;
    this.truckUpgrade.update(dt);
    const o = this.order;
    const vanPos = this.phys.position;

    switch (this.state) {
      case 'idle':
        this.idleTimer -= dt;
        if (this.idleTimer <= 0) this.offerNow();
        break;

      case 'offered':
        if (!this.freezeTimers) this.idleTimer -= dt;
        // Accept is edge-triggered for both keyboard E and controller X.
        if (input?.pressed('accept') || this.hud.consumeAcceptRequest?.()) this._accept();
        else {
          this.hud.setOfferProgress(this.idleTimer / this.offerDuration);
          if (this.idleTimer <= 0) {
            this.hud.toast('주문 취소됨 — 다른 기사가 가져갔어요', 'Order taken by another driver', 'bad');
            this.hud.hideOffer();
            this.state = 'idle';
            this.idleTimer = 6;
            this.order = null;
            this.audio?.event('fail');
          }
        }
        break;

      case 'toPickup': {
        const d = vanPos.distanceTo(o.rest.point);
        this._setMarker(o.rest.point, 0xff2d78, vanPos);
        this._setObjective(o.rest.point, d);
        if (d < ZONE_RADIUS) {
          if (this.phys.speedKmh <= PICKUP_MAX_SPEED_KMH) {
            this.state = 'waiting';
            this.waitTimer = WAIT_TIME;
            this.hud.setDwell(0, { kind: 'pickup' });
          } else {
            this.hud.setDwell(0, { kind: 'pickup', paused: true });
          }
        } else {
          this.hud.setDwell(null);
          this.hud.setStage('픽업 · Pickup', 'PICKUP');
        }
        break;
      }

      case 'waiting': {
        if (this._tickDwell(dt, o.rest.point, 0xff2d78, PICKUP_MAX_SPEED_KMH, 'pickup', 'toPickup')) {
          this._beginDelivery();
        }
        break;
      }

      case 'delivering': {
        const d = vanPos.distanceTo(o.dropoff);
        if (!this.freezeTimers) {
          o.timer -= dt;
          o.penaltyTimer -= dt;
        }
        this._updateQuality(dt);
        if (!this.freezeTimers && o.penaltyTimer <= 0) {
          const conditionLoss = Math.max(0, (o.penaltyQuality ?? this.quality) - this.quality);
          const amount = o.payout * (0.012 + conditionLoss * 0.003);
          this._deductPayout(amount);
          o.penaltyQuality = this.quality;
          o.penaltyTimer += PAYOUT_PENALTY_INTERVAL;
        }
        this._setMarker(o.dropoff, 0x29e6ff, vanPos);
        this._setObjective(o.dropoff, d);
        this.hud.updateTicket({
          seconds: o.timer,
          totalSeconds: o.timerMax,
          payout: this._currentPayout(),
        });
        this.hud.setCondition(this.quality / 100);
        if (d < ZONE_RADIUS) {
          if (this.phys.speedKmh <= DELIVERY_MAX_SPEED_KMH) {
            this.state = 'dropWaiting';
            this.waitTimer = WAIT_TIME;
            this.hud.setDwell(0, { kind: 'drop' });
          } else {
            this.hud.setDwell(0, { kind: 'drop', paused: true });
          }
        } else {
          this.hud.setDwell(null);
          this.hud.setStage('배달 · Deliver', 'DELIVER');
        }
        break;
      }

      case 'dropWaiting': {
        if (!this.freezeTimers) o.timer -= dt;
        this._updateQuality(dt);
        this.hud.updateTicket({
          seconds: o.timer,
          totalSeconds: o.timerMax,
          payout: this._currentPayout(),
        });
        this.hud.setCondition(this.quality / 100);
        if (this._tickDwell(dt, o.dropoff, 0x29e6ff, DELIVERY_MAX_SPEED_KMH, 'drop', 'delivering')) {
          this.hud.setDwell(null);
          this._deliver();
        }
        break;
      }
    }

    let navTarget = null;
    if (this.order && (this.state === 'toPickup' || this.state === 'waiting')) navTarget = this.order.rest.point;
    else if (this.order && (this.state === 'delivering' || this.state === 'dropWaiting')) navTarget = this.order.dropoff;
    this._updateNavigation(dt, navTarget);
    this._animateMarker(dt);
  }

  // -------------------------------------------------------------- quality
  _updateQuality(dt) {
    const o = this.order;
    const p = this.phys;
    // Time decay (melts aggressively).
    this.quality -= dt * (o.dish.type === 'melts' ? 1.1 : 0.2);

    const latG = Math.abs(p.latG);
    const gSpike = Math.hypot(p.latG, p.longG);

    if (o.dish.type === 'soup' && latG > 0.5) {
      this.spillMeter = Math.min(100, this.spillMeter + dt * (latG - 0.5) * 55);
      this.quality -= dt * (latG - 0.5) * 18;
    }
    if (o.dish.type === 'fragile') {
      this._fragileCooldown = Math.max(0, this._fragileCooldown - dt);
      if (gSpike > 0.9 && this._fragileCooldown === 0) {
        this._fragileCooldown = 0.5;
        this.quality -= (gSpike - 0.9) * 30;
        this.hud.spill();
        this.hud.toast('취급주의! 음식이 흔들렸어요', 'Handle with care', 'bad');
        this.audio?.event('spill');
      }
    }
    if (o.dish.type === 'level') {
      const tilt = Math.abs(p.rollAngle);
      if (tilt > 0.16 || p.airTime > 0.25) {
        this.quality -= dt * 14;
        this.spillMeter = Math.min(100, this.spillMeter + dt * 30);
      }
    }
    this.quality = THREE.MathUtils.clamp(this.quality, 0, 100);
  }

  _onCrash(severity) {
    if (this.state === 'delivering') {
      this.quality = Math.max(0, this.quality - severity * 2.5);
      if (this.order?.dish.type === 'soup') this.spillMeter = Math.min(100, this.spillMeter + severity * 6);
      // Only flash the meter for hits that actually cost something, or every kerb
      // scuff strobes it.
      if (severity > 1.5) this.hud.spill();
      if (severity > 1.5) this.audio?.event('spill');
      if (severity > 1.5) {
        this._deductPayout(Math.max(200, severity * 220));
        // The crash has already charged for this condition loss; do not fold it
        // into the next periodic food-condition deduction as well.
        this.order.penaltyQuality = this.quality;
      }
    }
  }

  // -------------------------------------------------------------- delivery
  _deductPayout(amount) {
    const o = this.order;
    if (!o || this.state !== 'delivering') return 0;
    const current = o.livePayout ?? o.payout;
    const floor = Math.max(1, Math.round(o.payout * PAYOUT_FLOOR));
    const requested = Math.max(100, Math.round(amount / 100) * 100);
    const deduction = Math.min(requested, Math.max(0, current - floor));
    if (deduction <= 0) return 0;
    o.livePayout = current - deduction;
    this.hud.flashPayoutDeduction?.(deduction);
    return deduction;
  }

  _currentPayout() {
    const o = this.order;
    if (!o) return 0;
    // Keep the displayed total calm and legible. Time/condition and crash costs
    // are applied as discrete events instead of changing this number every frame.
    return o.livePayout ?? o.payout;
  }

  _deliver() {
    const o = this.order;
    const onTime = o.timer >= 0;
    const payout = this._currentPayout();
    const score = THREE.MathUtils.clamp((payout / o.payout) * 100, 0, 100);
    const stars = THREE.MathUtils.clamp(Math.round(score / 20), 1, 5);

    this.save.cash += payout;
    this.save.deliveries += 1;
    this.save.ratings.push(stars);
    if (this.save.ratings.length > 50) this.save.ratings.shift();
    this._persist();

    this.hud.setCash(this.save.cash, { bump: true });
    this.hud.setStats({ rating: this.avgStars, deliveries: this.save.deliveries });
    this.hud.toast(
      `배달 완료 · +₩${payout.toLocaleString()}`,
      `Delivered · ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`,
      onTime ? 'win' : 'bad'
    );
    this.audio?.event('delivery');
    const tapes = this.audio?.music?.setDeliveries(this.save.deliveries) || [];
    for (const tape of tapes) this.unlockTape(tape);
    const day = dayProgress(this.save.deliveries);
    if (day.completed === 0) this.hud.toast(`${day.days}일 근무 완료 · ${day.day}일차 시작`, `Day ${day.days} complete · Day ${day.day} begins`, 'win');
    this.onProgress?.(this.save.deliveries);
    this.hud.setDwell(null);
    this.hud.hideTicket();
    this.hud.setObjective(null);
    this.foodDisplay.clear();
    this.marker.visible = false;
    this.arrow.visible = false;
    this.state = 'idle';
    this.idleTimer = 5;
    this.order = null;
  }

  // -------------------------------------------------------------- markers
  /** ?ui=slice hides the 3D waypoint so the HUD's objective chip stands alone. */
  setMarkersVisible(on) {
    this._markersEnabled = on;
    this.foodDisplay.setEnabled(on);
    if (!on) { this.marker.visible = false; this.arrow.visible = false; }
  }

  _setMarker(point, color, vanPos) {
    if (this._markersEnabled === false) return;
    this.marker.visible = true;
    this.marker.position.copy(point);
    const markerColor = this._markerColor || (this._markerColor = new THREE.Color());
    markerColor.setHex(color);
    this.beacon.material.color.copy(markerColor).multiplyScalar(0.58);
    this.beaconCore.material.color.setHex(color);
    this.ring.material.color.copy(markerColor).multiplyScalar(0.68);
    this.innerRing.material.color.copy(markerColor).multiplyScalar(0.82);
    this.markerCrown.material.color.copy(markerColor).multiplyScalar(0.72);
    this.markerLight.color.copy(markerColor);

    if (!this.vanArrowEnabled) { this.arrow.visible = false; return; }
    this.arrow.visible = true;
    this.arrow.position.copy(vanPos).add(_up2);
    const dir = point.clone().sub(vanPos);
    dir.y = 0;
    if (dir.lengthSq() > 0.01) this.arrow.rotation.y = Math.atan2(dir.x, dir.z);
    this.arrow.material.color.setHex(color);
  }

  _animateMarker(dt) {
    if (!this.marker.visible) return;
    this.foodDisplay.update(dt, this.phys.meshPosition);
    this._pulse = (this._pulse ?? 0) + dt * 3;
    const wave = Math.sin(this._pulse);
    const s = 1 + wave * 0.075;
    this.ring.scale.setScalar(s);
    this.innerRing.scale.setScalar(1.04 - wave * 0.055);
    this.innerRing.rotation.z -= dt * 0.22;
    this.beacon.material.opacity = 0.085 + wave * 0.025;
    this.beaconCore.material.opacity = 0.38 + wave * 0.12;
    this.ring.material.opacity = 0.34 + wave * 0.10;
    this.innerRing.material.opacity = 0.38 - wave * 0.09;
    this.markerCrown.material.opacity = 0.58 + wave * 0.16;
    this.markerLight.intensity = 12 + wave * 4;
    this.markerCrown.position.y = 5.02 + wave * 0.14;
  }

  // -------------------------------------------------------------- debug hooks
  completeNow() {
    if (this.state === 'toPickup' || this.state === 'waiting') {
      this._beginDelivery();
    } else if (this.state === 'delivering' || this.state === 'dropWaiting') {
      this.hud.setDwell(null);
      this.order.timer = Math.max(this.order.timer, 5);
      this._deliver(true);
    }
  }

  addCash(n) {
    this.save.cash += n;
    this._persist();
    this.hud.setCash(this.save.cash, { bump: true });
  }

  resetSave() {
    this.save = { ...DEFAULT_SAVE, ratings: [], unlockedTapes: [], owned: ['van'] };
    this.truckUpgrade.reset();
    this._persist();
    this.audio?.music?.resetProgress();
    this.onProgress?.(0);
    this.hud.setCash(0);
    this.hud.setStats({ rating: 0, deliveries: 0 });
    this.hud.toast('세이브 초기화됨', 'Save reset');
  }

  unlockTape(tape) {
    if (this.save.unlockedTapes.includes(tape.file)) return;
    this.save.unlockedTapes.push(tape.file);
    this._persist();
    this.hud.toast(`테이프 해금 · ${tape.ko || tape.title}`, `Tape unlocked · ${tape.title}`, 'win');
  }

  purchaseVehicle(vehicle) {
    if (!vehicle) return { ok: false, reason: 'missing' };
    if (this.save.owned.includes(vehicle.id)) return this.selectVehicle(vehicle.id);
    if (this.save.cash < vehicle.price) {
      const short = vehicle.price - this.save.cash;
      this.hud.toast(
        `차량 구매까지 ₩${short.toLocaleString()} 부족`,
        `Need ₩${short.toLocaleString()} more`,
        'bad',
      );
      return { ok: false, reason: 'cash' };
    }
    this.save.cash -= vehicle.price;
    this.save.owned.push(vehicle.id);
    this.save.vehicle = vehicle.id;
    this._persist();
    this.hud.setCash(this.save.cash, { bump: true });
    this.hud.toast(`${vehicle.nameKo} 구매 완료`, `${vehicle.nameEn} purchased`, 'win');
    return { ok: true, save: this.save };
  }

  selectVehicle(id) {
    if (!this.save.owned.includes(id)) return { ok: false, reason: 'locked' };
    this.save.vehicle = id;
    this._persist();
    return { ok: true, save: this.save };
  }

  teleportPickup() {
    if (this.order) this.phys.teleport(this.order.rest.point, 0);
  }

  teleportDropoff() {
    if (this.order) this.phys.teleport(this.order.dropoff, 0);
  }
}

const _up2 = new THREE.Vector3(0, 2.3, 0);
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _dir = new THREE.Vector3();
