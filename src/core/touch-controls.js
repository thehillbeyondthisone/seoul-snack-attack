// Optional two-stick touch driving controls. Auto mode keys off input
// capabilities, never a user-agent string, so desktop keyboard/gamepad input
// remains available and touchscreen laptops can opt out.

const STORAGE_KEY = 'seoul-delivery-touch-controls-v1';
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
#touch-controls {
  --touch-ink: #eef4ff;
  --touch-nav: #4dc8ff;
  position: fixed; inset: 0; z-index: 45; pointer-events: none;
  font-family: Inter, 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
  -webkit-user-select: none; user-select: none;
}
#touch-controls .touch-toggle {
  position: absolute; left: 50%; bottom: max(8px, env(safe-area-inset-bottom));
  transform: translateX(-50%); padding: 5px 9px; pointer-events: auto;
  border: 1px solid rgba(77,200,255,.34); border-radius: 4px;
  color: rgba(238,244,255,.68); background: rgba(4,6,12,.72);
  font: 700 9px/1.2 inherit; letter-spacing: .08em; touch-action: manipulation;
}
#touch-controls .touch-stage { display: none; }
#touch-controls.active .touch-stage { display: block; }
#touch-controls .touch-stick {
  position: absolute; bottom: max(28px, calc(env(safe-area-inset-bottom) + 20px));
  width: 124px; height: 124px; box-sizing: border-box; pointer-events: auto;
  border: 1px solid rgba(238,244,255,.26); border-radius: 50%;
  background: radial-gradient(circle, rgba(77,200,255,.12), rgba(4,6,12,.34) 58%, rgba(4,6,12,.62));
  box-shadow: inset 0 0 24px rgba(77,200,255,.08), 0 6px 28px rgba(0,0,0,.28);
  touch-action: none;
}
#touch-controls .touch-stick.drive { left: max(22px, env(safe-area-inset-left)); }
#touch-controls .touch-stick.steer { right: max(22px, env(safe-area-inset-right)); }
#touch-controls .touch-knob {
  position: absolute; left: 50%; top: 50%; width: 54px; height: 54px;
  margin: -27px; border: 1px solid rgba(77,200,255,.76); border-radius: 50%;
  background: rgba(8,16,26,.82); box-shadow: 0 0 18px rgba(77,200,255,.28);
  will-change: transform;
}
#touch-controls .touch-stick::before, #touch-controls .touch-stick::after {
  position: absolute; color: rgba(238,244,255,.65); font-size: 9px;
  font-weight: 800; letter-spacing: .10em; pointer-events: none;
}
#touch-controls .drive::before { content: 'THROTTLE'; left: 50%; top: 8px; transform: translateX(-50%); }
#touch-controls .drive::after { content: 'BRAKE / REVERSE'; left: 50%; bottom: 8px; transform: translateX(-50%); white-space: nowrap; }
#touch-controls .steer::before { content: 'STEER'; left: 50%; top: 8px; transform: translateX(-50%); }
#touch-controls .steer::after { content: 'L  ·  R'; left: 50%; bottom: 8px; transform: translateX(-50%); }
#touch-controls .touch-actions {
  position: absolute; right: max(38px, calc(env(safe-area-inset-right) + 16px));
  bottom: max(164px, calc(env(safe-area-inset-bottom) + 156px));
  display: flex; gap: 9px;
}
#touch-controls .touch-action {
  min-width: 66px; min-height: 38px; padding: 7px 10px; pointer-events: auto;
  border: 1px solid rgba(238,244,255,.32); border-radius: 20px;
  color: var(--touch-ink); background: rgba(4,6,12,.70);
  font: 750 9px/1.15 inherit; letter-spacing: .06em; touch-action: none;
}
#touch-controls .touch-action.pressed { color: #07101a; background: var(--touch-nav); }
/* Keyboard and gamepad hints have nothing to say on a touch device. */
body.touch-controls-active #hud3 .legend,
body.touch-controls-active #hud3 .translate-hint,
body.touch-controls-active #hud3 .pad-status,
body.touch-controls-active #hud3 .garage-status { display: none; }
/* The audio chip is NOT a keyboard hint — it is the only way to open the mixer,
   and hiding it here left touch players with no music controls at all: no
   prev/next, no pause, no volume. It stays, sized as a real tap target rather
   than as the 10px desktop caption. */
body.touch-controls-active #hud3 .audio-status {
  display: inline-flex; align-items: center; align-self: flex-start;
  min-height: 38px; padding: 9px 14px; border-radius: 20px;
  font-size: 11px; letter-spacing: .06em;
  background: rgba(4,6,12,.78); border-color: rgba(238,244,255,.32);
}
/* Sliders and transport buttons need finger-sized rows too.
   NOTE: this stylesheet is a JS template literal — no backticks in comments.
   The offset has to clear the touch stack (150px) plus the taller audio chip,
   or the chip overlaps the panel and a tap meant for PREV shuts the menu.
   border-box keeps the 14/16px padding inside the width on a 375px screen. */
body.touch-controls-active #hud3 .audio-menu {
  box-sizing: border-box;
  width: min(320px, calc(100vw - 36px));
  bottom: 222px;
}
body.touch-controls-active #hud3 .audio-menu input[type="range"] { height: 30px; }
body.touch-controls-active #hud3 .audio-menu button {
  min-height: 38px; padding: 9px 12px; font-size: 11px;
}
body.touch-controls-active #hud3 .stack { bottom: 150px; }
body.touch-controls-active #hud3 .minimap {
  top: 94px; right: 14px; bottom: auto; width: 184px; padding: 6px;
}
body.touch-controls-active #hud3 .minimap canvas { width: 170px; height: 119px; }
body.touch-controls-active #hud3 .speed {
  left: 50%; right: auto; bottom: 48px; transform: translateX(-50%) scale(.78);
}
body.touch-controls-active #touch-controls .touch-actions {
  right: max(142px, calc(env(safe-area-inset-right) + 132px));
  bottom: max(20px, calc(env(safe-area-inset-bottom) + 14px));
  flex-direction: column;
}
@media (max-width: 700px), (max-height: 480px) {
  #touch-controls .touch-stick { width: 112px; height: 112px; bottom: max(20px, calc(env(safe-area-inset-bottom) + 14px)); }
  #touch-controls .touch-stick.drive { left: max(14px, env(safe-area-inset-left)); }
  #touch-controls .touch-stick.steer { right: max(14px, env(safe-area-inset-right)); }
  #touch-controls .touch-actions { right: max(132px, calc(env(safe-area-inset-right) + 122px)); bottom: max(18px, calc(env(safe-area-inset-bottom) + 12px)); }
}
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
    this.values = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
    this.edges = new Set();
    this.activity = false;

    const root = document.createElement('div');
    root.id = 'touch-controls';
    root.innerHTML = `
      <div class="touch-stage" aria-label="Touch driving controls">
        <div class="touch-stick drive" role="slider" aria-label="Throttle, brake and reverse"><div class="touch-knob"></div></div>
        <div class="touch-stick steer" role="slider" aria-label="Steering"><div class="touch-knob"></div></div>
        <div class="touch-actions">
          <button class="touch-action handbrake" type="button">HANDBRAKE</button>
          <button class="touch-action reset" type="button">RESET</button>
        </div>
      </div>
      <button class="touch-toggle" type="button" aria-label="Change touch control mode"></button>`;
    document.body.appendChild(root);
    this.root = root;
    this.toggle = root.querySelector('.touch-toggle');

    this._bindStick(root.querySelector('.drive'), 'drive');
    this._bindStick(root.querySelector('.steer'), 'steer');
    this._bindButton(root.querySelector('.handbrake'), 'handbrake');
    this._bindButton(root.querySelector('.reset'), 'reset');
    this.toggle.addEventListener('click', () => {
      const next = { auto: 'off', off: 'on', on: 'auto' }[this.preference];
      this.setPreference(next);
    });
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
    document.body.classList.toggle('touch-controls-active', active);
    this.toggle.textContent = `TOUCH · ${this.preference.toUpperCase()}`;
    this.toggle.setAttribute('aria-pressed', String(this.enabled));
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
      if (kind === 'drive') {
        const clampedY = Math.max(-STICK_RADIUS, Math.min(STICK_RADIUS, dy));
        Object.assign(this.values, touchDriveValues(clampedY));
        knob.style.transform = `translate3d(0, ${clampedY}px, 0)`;
      } else {
        const clampedX = Math.max(-STICK_RADIUS, Math.min(STICK_RADIUS, dx));
        this.values.steer = touchSteerValue(clampedX);
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
    element.addEventListener('pointerdown', (event) => {
      if (pointerId != null) return;
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
    element.addEventListener('pointerdown', (event) => {
      if (pointerId != null) return;
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

  _releaseAll() {
    this.values.throttle = 0;
    this.values.brake = 0;
    this.values.steer = 0;
    this.values.handbrake = 0;
    this.edges.clear();
    this.root?.querySelectorAll('.touch-knob').forEach((knob) => { knob.style.transform = ''; });
    this.root?.querySelectorAll('.touch-action').forEach((button) => button.classList.remove('pressed'));
  }
}
