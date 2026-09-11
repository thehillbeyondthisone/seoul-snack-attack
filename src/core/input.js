// Seoul Snack Attack — unified keyboard + standard gamepad input.
// Keyboard: WASD/arrows move, Space contextual jump/handbrake, F vehicle,
// E accept, R reset, C camera view, V chase camera angle, ` debug. Xbox mirrors
// that with both sticks, A and B; D-pad up is the camera angle.

import { TouchControls } from './touch-controls.js';

const KEY_ACTIONS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyF'],
  accept: ['KeyE'],
  reset: ['KeyR'],
  debug: ['Backquote', 'KeyF3'],
  map: ['KeyM'],
  view: ['KeyC'],
  camAngle: ['KeyV'],
  translate: ['KeyT'],
};

const PAD_BUTTONS = {
  handbrake: 0, // A
  jump: 0,      // A (on foot)
  interact: 1,  // B
  sprint: 5,    // RB
  accept: 2,    // X
  reset: 3,     // Y
  debug: 8,     // View / Back
  translate: 4, // LB
  view: 10,     // right stick click
  camAngle: 12, // D-pad up (left/right steer; see steerAxis)
};

const TRIGGER_THRESHOLD = 0.08;
const BUTTON_THRESHOLD = 0.5;
const STICK_DEADZONE = 0.16;

function applyDeadzone(value, deadzone = STICK_DEADZONE) {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - deadzone) / (1 - deadzone));
}

function buttonValue(pad, index) {
  return pad?.buttons[index]?.value || 0;
}

function readGamepads() {
  try {
    const getter = navigator.getGamepads || navigator.webkitGetGamepads;
    return getter ? getter.call(navigator) || [] : [];
  } catch {
    return [];
  }
}

function triggerValue(pad, buttonIndex, fallbackAxis) {
  const button = pad?.buttons[buttonIndex];
  if (button) return Math.max(button.value || 0, button.pressed ? 1 : 0);

  // A few older/raw Xbox mappings expose each trigger as an axis ranging from
  // -1 (released) to +1 (pressed), rather than standard buttons 6 and 7.
  const axis = pad?.axes[fallbackAxis];
  return Number.isFinite(axis) ? Math.max(0, Math.min(1, (axis + 1) / 2)) : 0;
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.edge = new Set();
    this.gamepadEdge = new Set();
    this.previousButtons = [];
    this.gamepad = null;
    this.gamepadIndex = null;
    this.mode = 'keyboard';
    this.hadActivity = false;
    this.mouseLook = { x: 0, y: 0 };
    this.touch = new TouchControls();
    this.supported = typeof navigator !== 'undefined' &&
      typeof (navigator.getGamepads || navigator.webkitGetGamepads) === 'function';

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.edge.add(e.code);
      this.mode = 'keyboard';
      this.hadActivity = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote', 'KeyF3'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.mouseLook.x += e.movementX || 0;
        this.mouseLook.y += e.movementY || 0;
        if (e.movementX || e.movementY) {
          this.mode = 'keyboard';
          this.hadActivity = true;
        }
      }
    });

    window.addEventListener('gamepadconnected', (e) => {
      if (e.gamepad.mapping === 'standard' || this.gamepadIndex == null) {
        this.gamepadIndex = e.gamepad.index;
        this.previousButtons = [];
      }
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this.gamepadIndex) {
        this.gamepad = null;
        this.gamepadIndex = null;
        this.previousButtons = [];
      }
    });
    // Gamepad privacy protections commonly hide a paired pad until a button is
    // pressed while the page has focus.
    window.addEventListener('pointerdown', () => window.focus());
  }

  /** Poll once at the start of each animation frame. */
  update() {
    const pads = readGamepads();
    let pad = this.gamepadIndex == null ? null : pads[this.gamepadIndex];

    // Some browsers expose an already-connected controller without first
    // dispatching gamepadconnected, so scan as a fallback.
    if (!pad) {
      pad = [...pads].find((candidate) => candidate?.mapping === 'standard') ||
        [...pads].find(Boolean) || null;
      this.gamepadIndex = pad?.index ?? null;
      this.previousButtons = [];
    }

    this.gamepad = pad;
    this.gamepadEdge.clear();
    if (pad) {
      pad.buttons.forEach((button, index) => {
        const down = button.pressed || button.value > BUTTON_THRESHOLD;
        if (down && !this.previousButtons[index]) this.gamepadEdge.add(index);
        this.previousButtons[index] = down;
      });

      const active = pad.buttons.some((button) => button.pressed || button.value > TRIGGER_THRESHOLD) ||
        Math.abs(pad.axes[0] || 0) > STICK_DEADZONE ||
        Math.abs(pad.axes[1] || 0) > STICK_DEADZONE ||
        Math.abs(pad.axes[2] || 0) > STICK_DEADZONE ||
        Math.abs(pad.axes[3] || 0) > STICK_DEADZONE;
      if (active) {
        this.mode = 'gamepad';
        this.hadActivity = true;
      }
    }
    if (this.touch.consumeActivity()) {
      this.mode = 'touch';
      this.hadActivity = true;
    }
  }

  /** Analog action strength in the 0..1 range. */
  actionValue(action) {
    const keyboardDown = KEY_ACTIONS[action]?.some((code) => this.keys.has(code));
    if (keyboardDown) return 1;
    const touchValue = this.touch.actionValue(action);
    if (touchValue) return touchValue;
    if (!this.gamepad) return 0;
    if (action === 'throttle') return triggerValue(this.gamepad, 7, 5); // RT
    if (action === 'brake') return triggerValue(this.gamepad, 6, 2);    // LT
    const button = PAD_BUTTONS[action];
    return button == null ? 0 : buttonValue(this.gamepad, button);
  }

  /** Continuous digital action (held). */
  isDown(action) {
    return this.actionValue(action) > TRIGGER_THRESHOLD;
  }

  /** Held accessibility action; unlike pressed(), this follows the physical button. */
  held(action) { return this.isDown(action); }

  /** Edge-triggered action, true once per physical press. */
  pressed(action) {
    const keyboardPressed = (KEY_ACTIONS[action] || [action]).some((code) => this.edge.has(code));
    const button = PAD_BUTTONS[action];
    return keyboardPressed || this.touch.pressed(action) || (button != null && this.gamepadEdge.has(button));
  }

  /** Steering axis -1 (left) .. +1 (right). */
  steerAxis() {
    const keyboard = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    if (keyboard) return keyboard;
    const touch = this.touch.steerAxis();
    if (touch) return touch;
    const stick = applyDeadzone(this.gamepad?.axes[0] || 0);
    if (stick) return stick;
    return (buttonValue(this.gamepad, 15) > BUTTON_THRESHOLD ? 1 : 0) -
      (buttonValue(this.gamepad, 14) > BUTTON_THRESHOLD ? 1 : 0);
  }

  /** Camera-relative movement: x right, y forward, each in -1..1. */
  moveAxes() {
    let x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    let y = (this.isDown('throttle') ? 1 : 0) - (this.isDown('brake') ? 1 : 0);
    if (this.touch.enabled && !this.touch.suspended) {
      x = this.touch.steerAxis() || x;
    }
    if (this.gamepad) {
      const sx = applyDeadzone(this.gamepad.axes[0] || 0);
      const sy = -applyDeadzone(this.gamepad.axes[1] || 0);
      if (sx || sy) { x = sx; y = sy; }
    }
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    return { x, y };
  }

  /** Orbit input in normalized units. Mouse deltas are consumed once. */
  consumeLookAxes() {
    const mouseX = this.mouseLook.x;
    const mouseY = this.mouseLook.y;
    this.mouseLook.x = 0;
    this.mouseLook.y = 0;
    return {
      x: mouseX + applyDeadzone(this.gamepad?.axes[2] || 0) * 18,
      y: mouseY + applyDeadzone(this.gamepad?.axes[3] || 0) * 18,
    };
  }

  get connected() { return !!this.gamepad; }

  get gamepadName() { return this.gamepad?.id || ''; }

  setTouchSuspended(suspended) { this.touch.setSuspended(suspended); }

  endFrame() {
    this.edge.clear();
    this.gamepadEdge.clear();
    this.touch.endFrame();
    // consumeLookAxes() normally clears this earlier. Clearing here prevents a
    // pointer-lock movement from being replayed after a paused/overlay frame.
    this.mouseLook.x = 0;
    this.mouseLook.y = 0;
  }
}
