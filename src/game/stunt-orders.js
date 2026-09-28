import * as THREE from 'three';
import { Orders } from './orders.js';
import { stuntPayout } from './stunt-scoring.js';
import { dayProgress } from './day-progress.js';

const REACH = 2;
const STYLE_NAMES = { drift: 'CONTROLLED DRIFT', jump: 'RAMP LANDING', courier: 'COURIER RECOVERY' };

export class StuntOrders extends Orders {
  constructor(options) {
    super(options);
    this.completedStyles = new Set();
    this.driftSeconds = 0;
    this.jumpSeconds = 0;
    this.wasGrounded = true;
    this.impactCooldown = 0;
    this.calloutTime = 0;
    this.styleHudTimer = 0;
    this.lineAnnounced = false;
    this.lastOrder = null;
    this.state = 'idle';
    this.idleTimer = 1;
    // The shared delivery marker depicts a vehicle-sized 9 m zone. Stunt jobs
    // require the courier at the door, so show the actual interaction footprint.
    this.ring.geometry.dispose();
    this.ring.geometry = new THREE.RingGeometry(1.68, 1.85, 48).rotateX(-Math.PI / 2);
    this.innerRing.geometry.dispose();
    this.innerRing.geometry = new THREE.RingGeometry(1.22, 1.32, 40, 1, 0, Math.PI * 1.55).rotateX(-Math.PI / 2);
    this.prompt = document.createElement('div');
    this.prompt.id = 'stunt-action-prompt';
    this.prompt.style.cssText = 'position:fixed;bottom:11%;left:50%;transform:translateX(-50%);z-index:43;padding:9px 14px;background:#07131ded;color:white;border:1px solid #29e6ff;border-radius:5px;font:700 13px Segoe UI;display:none;pointer-events:none';
    document.body.append(this.prompt);
    this.stylePanel = document.createElement('div');
    this.stylePanel.id = 'stunt-style-panel';
    this.stylePanel.style.cssText = 'margin-top:7px;padding-top:6px;border-top:1px solid #29e6ff88;line-height:1.35;color:#dffaff;min-width:242px';
    this.callout = document.createElement('div');
    this.callout.id = 'stunt-style-callout';
    this.callout.style.cssText = 'position:fixed;top:28%;left:50%;transform:translateX(-50%);z-index:44;display:none;pointer-events:none;padding:8px 18px;background:#07131dea;border:2px solid #29e6ff;border-radius:5px;color:#fff;font:900 22px Segoe UI;text-align:center;text-shadow:0 0 10px #29e6ff;white-space:nowrap';
    document.body.append(this.callout);
    this.result = document.createElement('div');
    this.result.id = 'stunt-result';
    this.result.style.cssText = 'position:fixed;z-index:100;inset:0;background:#02070bc9;display:none;align-items:center;justify-content:center;color:white;font:16px Segoe UI';
    this.result.innerHTML = '<div style="min-width:300px;padding:26px;background:#10212e;border:1px solid #29e6ff;border-radius:8px"><h2>Stunt delivery complete</h2><div data-breakdown></div><p><button data-repeat>Repeat delivery</button> <button data-free>Free play</button></p></div>';
    this.result.querySelector('[data-repeat]').addEventListener('click', () => this.repeat());
    this.result.querySelector('[data-free]').addEventListener('click', () => this.freePlay());
    document.body.append(this.result);
  }

  _makeOrder() {
    if (this._restartOrder) {
      const order = this._restartOrder;
      this._restartOrder = null;
      return { ...order, timer: order.timerMax, livePayout: order.payout };
    }
    const block = this.city.metadata?.stuntBlock;
    const rest = this.restaurants.find((r) => r.id === (block ? 'patchwork-pocha' : 'pocha'));
    const plaza = block ? null : this.city.roadGraph.byId.get('plaza');
    const blockAnchor = block ? this.city.deliveryAnchors.find((a) => a.id === this.city.metadata.stuntFixture.dropoffEntranceId) : null;
    if (!rest?.pickupSite || (!plaza && !blockAnchor)) throw new Error('Stunt job requires an authored pickup and destination');
    const dropoff = block ? blockAnchor.point.clone() : plaza.position.clone();
    dropoff.y = this.city.findGround(dropoff.x, dropoff.z)?.point.y ?? dropoff.y;
    const dropoffAnchor = block ? { ...blockAnchor, point: dropoff, nameKo: '두 번째 블록 · 구름 만두', nameEn: 'Second block · Cloud Dumpling' }
      : Object.assign(this.city.projectToRoad(dropoff), { point: dropoff, nameKo: '광장', nameEn: 'Plaza' });
    const route = this.city.findRoute(rest.anchor, dropoffAnchor);
    const dist = route?.distance ?? rest.point.distanceTo(dropoff);
    const dish = rest.dishes[0];
    const type = { ko: '스턴트', en: 'stunt order' };
    const timer = Math.max(60, dist / 8.5 + 30);
    const payout = Math.round(dish.price + dish.tip[0] + dist * 20);
    return { rest, dish, type, dropoff, dropoffAnchor, route, dist, timer, timerMax: timer,
      payout, note: null, kitchenNote: null };
  }

  _accept() {
    super._accept();
    this.completedStyles.clear();
    this.driftSeconds = 0;
    this.jumpSeconds = 0;
    this.wasGrounded = true;
    this.lineAnnounced = false;
    this.calloutTime = 0;
    this.callout.style.display = 'none';
  }

  _showCallout(message) {
    if (!this.callout) return;
    this.callout.textContent = message;
    this.callout.style.display = 'block';
    this.calloutTime = 2.2;
  }

  _awardStyle(category) {
    if (this.state !== 'delivering' || this.completedStyles.has(category)) return;
    this.completedStyles.add(category);
    const bonus = Math.round(this.order.payout * 0.25 / 3);
    this._showCallout?.(`${STYLE_NAMES[category]}  +₩${bonus.toLocaleString()}`);
    this.audio?.event('accept');
    this.styleHudTimer = 0;
  }

  propImpact(severity) {
    if (this.state !== 'delivering' || severity < 1.2 || this.impactCooldown > 0 || this.calloutTime > 0.5) return;
    this._showCallout('SMASH!');
    this.impactCooldown = 1.5;
  }

  _updateStylePanel(dt) {
    if (!this.stylePanel) return;
    this.styleHudTimer -= dt;
    if (this.styleHudTimer > 0) return;
    this.styleHudTimer = 0.1;
    if (this.state !== 'delivering') {
      this.stylePanel.innerHTML = '<b>THE STUNT LINE</b><br>Cyan/right: ramp + props · Gold/left: clear road';
      return;
    }
    const categories = ['drift', 'jump', 'courier'];
    const earned = categories.filter((category) => this.completedStyles.has(category)).length;
    const styleMoney = stuntPayout(this.order.payout, 0, this.order.timerMax, this.completedStyles).styleBonus;
    const marks = categories.map((category) => `${this.completedStyles.has(category) ? '✓' : '○'} ${STYLE_NAMES[category]}`).join(' · ');
    const hint = this.player.isDriving
      ? this.jumpSeconds > 0 ? `AIRTIME ${this.jumpSeconds.toFixed(1)} / 0.3 s`
        : this.driftSeconds > 0 ? `DRIFT ${this.driftSeconds.toFixed(1)} / 0.6 s`
          : 'Cyan/right: ramp + props · Gold/left: clear road'
      : 'Q / LT dive · Space / A recover to bank courier style';
    this.stylePanel.innerHTML = `<b>STYLE ${earned}/3 · +₩${styleMoney.toLocaleString()}</b><br>${marks}<br>${hint}`;
  }

  _canInteract(point) {
    if (!this.player || this.player.mode !== 'onFoot' || this.player.isStunting) return false;
    const from = this.player.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const to = point.clone().add(new THREE.Vector3(0, 1.1, 0));
    const direction = to.sub(from);
    const distance = direction.length();
    this.prompt.dataset.distance = distance.toFixed(2);
    this.prompt.dataset.player = this.player.position.toArray().map((v) => v.toFixed(2)).join(',');
    this.prompt.dataset.target = point.toArray().map((v) => v.toFixed(2)).join(',');
    if (distance > REACH) return false;
    if (distance < 0.01) return true;
    const hit = this.city.raycast(from, direction.divideScalar(distance), distance - 0.05);
    this.prompt.dataset.hit = hit ? hit.distance.toFixed(2) : '';
    return !hit;
  }

  sampleDriving(dt) {
    if (this.state !== 'delivering') return;
    const p = this.phys;
    if (this.city?.metadata?.stuntBlock && !this.lineAnnounced && p.position?.x > -43 && p.position.x < -26 && p.velocity.x > 2) {
      this.lineAnnounced = true;
      this._showCallout('STUNT LINE → RIGHT / SAFE → LEFT');
      this.audio?.event('offer');
    }
    const grounded = p.groundedWheels > 0;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(p.quaternion);
    const lateral = Math.abs(forward.x * p.velocity.z - forward.z * p.velocity.x);
    this.driftSeconds = p.speedKmh > 20 && lateral > 2.1 && p.controls.handbrake && grounded
      ? this.driftSeconds + dt : 0;
    if (this.driftSeconds >= 0.6) this._awardStyle('drift');
    if (!grounded) this.jumpSeconds += dt;
    else {
      if (!this.wasGrounded && this.jumpSeconds >= 0.3) {
        this._awardStyle('jump');
        this.onLanding?.(Math.min(5, this.jumpSeconds * 5));
      }
      this.jumpSeconds = 0;
    }
    this.wasGrounded = grounded;
  }

  courierRecovered() {
    this._awardStyle('courier');
  }

  _animateMarker(dt) {
    super._animateMarker(dt);
    if (this.state === 'delivering') {
      if (this.player.isDriving) this.foodDisplay.followVehicle(this.phys.meshPosition);
      else this.foodDisplay.followCourier(this.player.group);
    }
  }

  update(dt, input) {
    if (this.paused) { this.prompt.style.display = 'none'; return; }
    if (this.state === 'result') return;
    this.calloutTime = Math.max(0, this.calloutTime - dt);
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    if (this.calloutTime === 0) this.callout.style.display = 'none';
    this.truckUpgrade.update(dt);
    const o = this.order;
    let target = null;
    let action = '';
    if (this.state === 'idle') this.offerNow(this.city.metadata?.stuntBlock ? 'patchwork-pocha' : 'pocha');
    else if (this.state === 'offered') {
      if (input?.pressed('accept') || this.hud.consumeAcceptRequest?.()) this._accept();
    } else if (this.state === 'toPickup') {
      target = o.rest.point;
      action = 'Collect order';
    } else if (this.state === 'delivering') {
      if (!this.freezeTimers) o.timer -= dt;
      target = o.dropoff;
      action = 'Deliver order';
      this.hud.updateTicket({ seconds: o.timer, totalSeconds: o.timerMax, payout: o.payout });
    }
    const canInteract = target && this._canInteract(target);
    if (canInteract && input?.pressed('accept')) {
      if (this.state === 'toPickup') this._beginDelivery();
      else if (this.state === 'delivering') this._deliver();
    }
    if (this.state === 'result') target = null;
    else if (this.state === 'delivering' && target === o?.rest.point) target = o.dropoff;
    const distance = target ? this.player.activePosition.distanceTo(target) : Infinity;
    this.prompt.style.display = distance < 12 ? 'block' : 'none';
    if (target) {
      this.prompt.textContent = this.player.isDriving
        ? 'F / B · Exit truck, then walk to the shop door'
        : this.player.isStunting
          ? 'Space / A · Recover before interacting'
          : distance > REACH
            ? `Walk into the small door ring · ${distance.toFixed(1)} m`
            : canInteract
              ? `E / X · ${action}`
              : 'Move to the shop entrance for a clear path';
      this._setMarker(target, this.state === 'toPickup' ? 0xff2d78 : 0x29e6ff, this.player.activePosition);
      this._setObjective(target, this.player.activePosition.distanceTo(target));
    }
    this._updateNavigation(dt, target);
    this._animateMarker(dt);
    this._updateStylePanel(dt);
  }

  _deliver() {
    if (this.state !== 'delivering' || !this.order) return;
    const o = this.order;
    const payout = stuntPayout(o.payout, o.timer, o.timerMax, this.completedStyles);
    this.save.cash += payout.total;
    this.save.deliveries += 1;
    this._persist();
    this.hud.setCash(this.save.cash, { bump: true });
    this.hud.setStats({ rating: this.avgStars, deliveries: this.save.deliveries });
    this.audio?.event('delivery');
    const tapes = this.audio?.music?.setDeliveries(this.save.deliveries) || [];
    for (const tape of tapes) this.unlockTape(tape);
    const day = dayProgress(this.save.deliveries);
    if (day.completed === 0) this.hud.toast(`${day.days}일 근무 완료`, `Day ${day.days} complete`, 'win');
    this.onProgress?.(this.save.deliveries);
    this.hud.hideTicket();
    this.hud.setObjective(null);
    this.foodDisplay.clear();
    this.marker.visible = false;
    this.prompt.style.display = 'none';
    if (this.callout) this.callout.style.display = 'none';
    if (this.stylePanel) this.stylePanel.style.display = 'none';
    this.lastOrder = o;
    this.order = null;
    this.state = 'result';
    this.result.querySelector('[data-breakdown]').innerHTML =
      `<p>Base pay: ₩${payout.base.toLocaleString()}</p><p>Time tip: ₩${payout.timeTip.toLocaleString()}</p><p>Style bonus: ₩${payout.styleBonus.toLocaleString()} (${this.completedStyles.size}/3)</p><strong>Total: ₩${payout.total.toLocaleString()}</strong>`;
    this.result.style.display = 'flex';
    document.exitPointerLock?.();
  }

  freePlay() {
    this.result.style.display = 'none';
    this.state = 'freePlay';
    if (this.stylePanel) this.stylePanel.style.display = 'none';
  }

  repeat() {
    this.result.style.display = 'none';
    this.state = 'idle';
    if (this.stylePanel) this.stylePanel.style.display = 'block';
    this._restartOrder = this.lastOrder;
    this.offerNow(this.city.metadata?.stuntBlock ? 'patchwork-pocha' : 'pocha');
  }

  restartPrototype() {
    const current = this.order || this.lastOrder;
    this.result.style.display = 'none';
    this.prompt.style.display = 'none';
    this.callout.style.display = 'none';
    this.stylePanel.style.display = 'block';
    this.hud.hideOffer();
    this.hud.hideTicket();
    this.hud.setDwell(null);
    this.foodDisplay.clear();
    this.marker.visible = false;
    this.state = 'idle';
    this.order = null;
    this._restartOrder = current;
    this.completedStyles.clear();
    this.driftSeconds = 0;
    this.jumpSeconds = 0;
    this.wasGrounded = true;
    this.lineAnnounced = false;
    this.calloutTime = 0;
    this.impactCooldown = 0;
    this.styleHudTimer = 0;
    this.offerNow(this.city.metadata?.stuntBlock ? 'patchwork-pocha' : 'pocha');
  }
}
