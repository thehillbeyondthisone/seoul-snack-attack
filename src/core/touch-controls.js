// Optional two-stick touch driving controls. Auto mode keys off input
// capabilities, never a user-agent string, so desktop keyboard/gamepad input
// remains available and touchscreen laptops can opt out.

import { icon } from '../ui/icons.js';

const LANGUAGE_KEY = 'snack-attack-touch-english';
const STORAGE_KEY = 'snack-attack-touch-controls-v1';
const PREFERENCES = ['auto', 'off', 'on'];
const STICK_RADIUS = 46;

export function shouldAutoEnableTouch({ maxTouchPoints = 0, coarsePointer = false, hoverNone = false } = {}) {
  return coarsePointer || (maxTouchPoints > 0 && hoverNone);
}

export function touchDriveValues(deltaY, radius = STICK_RADIUS) {
  const axis = Math.max(-1, Math.min(1, deltaY / Math.max(1, radius)));
  return { throttle: Math.max(0, -axis), brake: Math.max(0, axis) };
}

export function touchSteerValue(deltaX, radius = STICK_RADIUS) {
  return Math.max(-1, Math.min(1, deltaX / Math.max(1, radius)));
}

function capabilitySnapshot() {
  const media = (query) => {
    try { return window.matchMedia?.(query).matches || false; } catch { return false; }
  };
  return {
    maxTouchPoints: navigator.maxTouchPoints || 0,
    coarsePointer: media('(pointer: coarse)'),
    hoverNone: media('(hover: none)'),
  };
}

function normalizedPreference(value) {
  return PREFERENCES.includes(value) ? value : 'auto';
}

const CSS = `
#touch-controls { position: fixed; inset: 0; z-index: 45; pointer-events: none; }
#touch-controls[hidden], #touch-controls .touch-stage { display: none; }
#touch-controls.active .touch-stage { display: block; }
#touch-controls .touch-stick, #touch-controls .touch-action { pointer-events: auto; touch-action: none; }
#touch-controls .touch-stick { position: absolute; border-radius: 50%; }
#touch-controls .touch-knob { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px; border-radius: 50%; will-change: transform; }
#touch-controls .jump, #touch-controls .sprint, #touch-controls .ascend { display: none; }
#touch-controls.on-foot .jump, #touch-controls.on-foot .sprint,
#touch-controls.underwater .sprint, #touch-controls.underwater .ascend { display: flex; }
#touch-controls.underwater .interact { display: none; }
`;

export class TouchControls {
  constructor() {
    if (!document.getElementById('touch-controls-style')) {
      const style = document.createElement('style');
      style.id = 'touch-controls-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const queryPreference = new URLSearchParams(location.search).get('touch');
    let savedPreference = 'auto';
    try { savedPreference = localStorage.getItem(STORAGE_KEY) || 'auto'; } catch { /* storage unavailable */ }
    this.preference = normalizedPreference(queryPreference || savedPreference);
    this.detected = shouldAutoEnableTouch(capabilitySnapshot());
    this.suspended = false;
    this.releases = [];
    this.look = { x: 0, y: 0 };
    this.values = { throttle: 0, brake: 0, steer: 0, handbrake: 0, jump: 0, interact: 0 };
    this.edges = new Set();
    this.activity = false;
    this.english = false;
    try { this.english = localStorage.getItem(LANGUAGE_KEY) === '1'; } catch { /* storage unavailable */ }

    const root = document.createElement('div');
    root.id = 'touch-controls';
    root.innerHTML = `
      <div class="touch-stage" aria-label="Touch driving controls">
        <div class="touch-stick drive" role="slider" aria-label="Throttle, brake and reverse"><div class="touch-knob"></div></div>
        <div class="touch-stick steer" role="slider" aria-label="Steering"><div class="touch-knob"></div></div>
        <div class="touch-actions">
          <button class="touch-action reset" type="button" aria-label="Reset to road" title="Reset to road">${icon('reset')}</button>
          <button class="touch-action interact" type="button" aria-label="Exit vehicle" title="Exit vehicle">${icon('vehicle')}</button>
          <button class="touch-action jump" type="button" aria-label="Jump" title="Jump">${icon('jump')}</button>
          <button class="touch-action ascend" type="button" aria-label="Rise" title="Hold to rise">${icon('up')}</button>
          <button class="touch-action sprint" type="button" aria-label="Sprint" title="Hold to sprint">${icon('sprint')}</button>
        </div>
        <button class="touch-action map" type="button" aria-label="Open city map" title="City map">${icon('map')}</button>
        <button class="touch-action translate" type="button" aria-label="Switch to English" title="Switch to English" aria-pressed="false">${icon('language')}<span class="language-code">EN</span></button>
      </div>`;
    document.body.appendChild(root);
    this.root = root;

    this._bindStick(root.querySelector('.drive'), 'drive');
    this._bindStick(root.querySelector('.steer'), 'steer');
    this._bindButton(root.querySelector('.ascend'), 'handbrake');
    this._bindButton(root.querySelector('.jump'), 'jump');
    this._bindButton(root.querySelector('.interact'), 'interact');
    this._bindButton(root.querySelector('.reset'), 'reset');
    for (const action of ['sprint', 'map']) {
      this._bindButton(root.querySelector('.' + action), action);
    }
    window.addEventListener('blur', () => this._releaseAll());
    window.addEventListener('pagehide', () => this._releaseAll());
    window.addEventListener('resize', () => this._releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._releaseAll(); });
    this._bindLook(document.querySelector('#app canvas'));
    this._bindTap(root.querySelector('.translate'), () => this.setEnglish(!this.english));
    // Safari exposes pinch gestures independently of Pointer Events. Disable
    // only zoom gestures; one-finger scrolling inside menus still works.
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
    }
    this.setEnglish(this.english);
    this._refresh();
  }

  get enabled() { return this.preference === 'on' || (this.preference === 'auto' && this.detected); }

  setPreference(preference) {
    this.preference = normalizedPreference(preference);
    try { localStorage.setItem(STORAGE_KEY, this.preference); } catch { /* storage unavailable */ }
    this._releaseAll();
    this._refresh();
  }

  setSuspended(suspended) {
    this.suspended = !!suspended;
    if (this.suspended) this._releaseAll();
    this._refresh();
  }

  setGameplayMode(mode) {
    const onFoot = mode === 'onFoot' || mode === 'entering';
    this.root.classList.toggle('on-foot', onFoot);
    const label = onFoot ? 'Enter vehicle' : 'Exit vehicle';
    this.root.querySelector('.interact').setAttribute('aria-label', label);
    this.root.querySelector('.interact').title = label;
    this._releaseAll();
  }

  setSubmerged(submerged) {
    if (this.submerged === submerged) return;
    this.submerged = submerged;
    this.root.classList.toggle('underwater', submerged);
    const button = this.root.querySelector('.sprint');
    button.innerHTML = icon(submerged ? 'down' : 'sprint');
    button.setAttribute('aria-label', submerged ? 'Dive' : 'Sprint');
    button.title = submerged ? 'Hold to dive' : 'Hold to sprint';
    this._releaseAll();
  }

  actionValue(action) { return this.enabled && !this.suspended ? (this.values[action] || 0) : 0; }
  steerAxis() { return this.enabled && !this.suspended ? this.values.steer : 0; }
  pressed(action) { return this.enabled && !this.suspended && this.edges.has(action); }
  consumeActivity() { const active = this.activity; this.activity = false; return active; }
  endFrame() { this.edges.clear(); }

  _refresh() {
    const available = this.detected || this.preference !== 'auto';
    const active = available && this.enabled && !this.suspended;
    this.root.hidden = !available;
    this.root.classList.toggle('active', active);
    document.body.classList.toggle('touch-controls-active', this.enabled);
  }

  setEnglish(english) {
    this.english = !!english;
    try { localStorage.setItem(LANGUAGE_KEY, this.english ? '1' : '0'); } catch { /* storage unavailable */ }
    const button = this.root.querySelector('.translate');
    button.setAttribute('aria-pressed', String(this.english));
    button.setAttribute('aria-label', this.english ? '한국어로 전환 · Switch to Korean' : 'Switch to English');
    button.title = button.getAttribute('aria-label');
    button.querySelector('.language-code').textContent = this.english ? 'EN' : '한';
  }

  _markActivity() { this.activity = true; }

  _bindStick(element, kind) {
    const knob = element.querySelector('.touch-knob');
    let pointerId = null;
    const update = (event) => {
      if (event.pointerId !== pointerId) return;
      const rect = element.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const radius = Math.max(1, Math.min(STICK_RADIUS, rect.width / 2 - 24));
      if (kind === 'drive') {
        const clampedY = Math.max(-radius, Math.min(radius, dy));
        Object.assign(this.values, touchDriveValues(clampedY, radius));
        knob.style.transform = `translate3d(0, ${clampedY}px, 0)`;
      } else {
        const clampedX = Math.max(-radius, Math.min(radius, dx));
        this.values.steer = touchSteerValue(clampedX, radius);
        knob.style.transform = `translate3d(${clampedX}px, 0, 0)`;
      }
      this._markActivity();
      event.preventDefault();
    };
    const release = (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      if (kind === 'drive') { this.values.throttle = 0; this.values.brake = 0; }
      else this.values.steer = 0;
      knob.style.transform = '';
      event.preventDefault();
    };
    this.releases.push(() => {
      const id = pointerId;
      if (id == null) return;
      release({ pointerId: id, preventDefault() {} });
      if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    });
    element.addEventListener('pointerdown', (event) => {
      if (pointerId != null || !this.enabled || this.suspended) return;
      pointerId = event.pointerId;
      element.setPointerCapture?.(pointerId);
      update(event);
    });
    element.addEventListener('pointermove', update);
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === pointerId) release(event);
    });
  }

  _bindButton(element, action) {
    let pointerId = null;
    const release = (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      this.values[action] = 0;
      element.classList.remove('pressed');
      event.preventDefault();
    };
    this.releases.push(() => {
      const id = pointerId;
      if (id == null) return;
      release({ pointerId: id, preventDefault() {} });
      if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    });
    element.addEventListener('pointerdown', (event) => {
      if (pointerId != null || !this.enabled || this.suspended) return;
      pointerId = event.pointerId;
      element.setPointerCapture?.(pointerId);
      this.values[action] = 1;
      this.edges.add(action);
      element.classList.add('pressed');
      this._markActivity();
      event.preventDefault();
    });
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === pointerId) release(event);
    });
  }

  // Native synthetic clicks are not reliable while another finger owns a
  // pointer capture (for example, holding the drive stick forward). Handle the
  // physical pointer directly, while retaining click for keyboard/assistive
  // activation where MouseEvent.detail is zero.
  _bindTap(element, activate) {
    let pointerId = null;
    const cancel = (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      event.preventDefault();
    };
    this.releases.push(() => {
      const id = pointerId;
      if (id == null) return;
      cancel({ pointerId: id, preventDefault() {} });
      if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    });
    element.addEventListener('pointerdown', (event) => {
      if (pointerId != null || !this.enabled || this.suspended) return;
      pointerId = event.pointerId;
      element.setPointerCapture?.(pointerId);
      event.preventDefault();
    });
    element.addEventListener('pointerup', (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      activate();
      this._markActivity();
      event.preventDefault();
    });
    element.addEventListener('pointercancel', cancel);
    element.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === pointerId) cancel(event);
    });
    element.addEventListener('click', (event) => {
      if (event.detail !== 0 || !this.enabled || this.suspended) return;
      activate();
      this._markActivity();
    });
  }

  _releaseAll() {
    this.releases.forEach((release) => release());
    for (const action of Object.keys(this.values)) this.values[action] = 0;
    this.edges.clear();
    this.root?.querySelectorAll('.touch-knob').forEach((knob) => { knob.style.transform = ''; });
    this.root?.querySelectorAll('.touch-action').forEach((button) => button.classList.remove('pressed'));
  }

  consumeLook() {
    const result = { ...this.look };
    this.look.x = this.look.y = 0;
    return result;
  }

  _bindLook(canvas) {
    if (!canvas) return;
    let pointer = null, x = 0, y = 0;
    this.releases.push(() => {
      const id = pointer;
      pointer = null; this.look.x = this.look.y = 0;
      if (id != null && canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !this.enabled || this.suspended || pointer != null) return;
      pointer = e.pointerId; x = e.clientX; y = e.clientY;
      canvas.setPointerCapture?.(pointer);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointer) return;
      this.look.x += e.clientX - x; this.look.y += e.clientY - y;
      x = e.clientX; y = e.clientY; this._markActivity();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, (e) => { if (e.pointerId === pointer) pointer = null; });
    }
  }
}
