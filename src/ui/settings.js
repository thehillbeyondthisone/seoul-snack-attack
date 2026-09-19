// Seoul Snack Attack — player-facing settings overlay.
//
// Everything a player might reasonably want to change lives here, and so does
// the door to everything they should NOT have to look at. Before this, the
// developer surfaces were simply ON: the green physics readout sat over the
// road behind `?stats=1`, and backtick dropped a lil-gui tuning tree straight
// onto the screen. Both are still here — these are internal builds and the
// tuning tree is the only way to change weather, lighting and handling in a
// bundle nobody can rebuild — but they are now two clicks inside a menu
// instead of the first thing you see.
//
// No Three.js and no game state: this owns its own DOM and reports changes
// through callbacks, the same way CityMap does.

import { icon, TOUCH_HELP } from './icons.js';

const STORAGE_KEY = 'snack-attack-settings-v1';

const INK = '#eef4ff';
const NAV = '#4dc8ff';
const MUTED = 'rgba(238,244,255,.58)';

/** Shape and defaults of the persisted block. Unknown keys are dropped. */
const DEFAULTS = Object.freeze({
  perfOverlay: false,
});

function loadStored() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
    const out = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof raw[key] === typeof DEFAULTS[key]) out[key] = raw[key];
    }
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

function saveStored(values) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch { /* storage may be blocked */ }
}

const CSS = `
.ssa-settings[hidden] { display: none !important; }
.ssa-settings {
  position: fixed; inset: 0; z-index: 1300; display: grid; place-items: center;
  color: ${INK};
  font-family: Inter, 'Segoe UI Variable', 'Segoe UI', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif;
  font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
}
.ssa-settings__veil {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 46%, rgba(13,26,38,.46), rgba(2,4,8,.92) 70%);
  backdrop-filter: blur(7px) saturate(76%); -webkit-backdrop-filter: blur(7px) saturate(76%);
}
.ssa-settings__dialog {
  position: relative; width: min(560px, calc(100vw - 32px));
  max-height: min(86vh, 720px); display: flex; flex-direction: column;
  overflow: hidden; outline: none;
  border: 1px solid rgba(238,244,255,.2); background: rgba(7,10,16,.93);
  box-shadow: 0 30px 100px rgba(0,0,0,.72), 0 0 55px rgba(77,200,255,.07);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);
}
.ssa-settings__header {
  display: flex; align-items: center; gap: 18px; padding: 14px 16px 13px 20px;
  border-bottom: 1px solid rgba(238,244,255,.14);
  background: linear-gradient(90deg, rgba(77,200,255,.09), transparent 46%);
}
.ssa-settings__stripe { width: 3px; align-self: stretch; flex: none; background: ${NAV}; box-shadow: 0 0 16px rgba(77,200,255,.7); }
.ssa-settings__kicker { color: ${NAV}; font-size: 9px; font-weight: 800; letter-spacing: .2em; }
.ssa-settings__title { margin: 2px 0 0; font-size: 22px; line-height: 1; letter-spacing: -.01em; }
.ssa-settings__title small { margin-left: 9px; color: rgba(238,244,255,.46); font-size: .42em; letter-spacing: .18em; }
.ssa-settings__close {
  margin-left: auto; display: inline-flex; align-items: center; gap: 9px;
  padding: 7px 10px; border: 1px solid rgba(238,244,255,.22); border-radius: 3px;
  color: ${MUTED}; background: rgba(4,6,12,.6); cursor: pointer;
  font: inherit; font-size: 10px; font-weight: 700; letter-spacing: .1em;
}
.ssa-settings__close:hover { color: ${INK}; border-color: rgba(77,200,255,.5); }
.ssa-settings__close kbd {
  display: inline-grid; place-items: center; min-width: 16px; height: 16px; padding: 0 4px;
  border: 1px solid rgba(238,244,255,.28); border-radius: 3px; background: rgba(4,6,12,.8);
  color: ${INK}; font: inherit; font-size: 9px;
}
.ssa-settings__body { padding: 4px 20px 18px; overflow-y: auto; }
.ssa-settings__section { margin-top: 18px; }
.ssa-settings__legend {
  display: flex; align-items: baseline; gap: 9px; padding-bottom: 7px;
  border-bottom: 1px solid rgba(238,244,255,.12);
  color: ${NAV}; font-size: 10px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase;
}
.ssa-settings__legend em { color: rgba(238,244,255,.38); font-style: normal; font-size: 9px; letter-spacing: .13em; }
.ssa-settings__row {
  display: flex; align-items: center; gap: 16px; padding: 12px 0;
  border-bottom: 1px solid rgba(238,244,255,.07);
}
.ssa-settings__row:last-child { border-bottom: 0; }
.ssa-settings__label { flex: 1 1 auto; min-width: 0; }
.ssa-settings__label b { display: block; font-size: 13px; font-weight: 600; }
.ssa-settings__label span { display: block; margin-top: 3px; color: ${MUTED}; font-size: 10.5px; line-height: 1.45; }
.ssa-settings__control { flex: none; display: flex; align-items: center; gap: 6px; }

/* Switch. Reads as a physical position, not a checkbox: a player scanning the
   column should see which rows are on without reading a single word. */
.ssa-settings__switch {
  position: relative; width: 46px; height: 24px; padding: 0; cursor: pointer;
  border: 1px solid rgba(238,244,255,.24); border-radius: 13px;
  background: rgba(4,6,12,.72); transition: border-color .16s ease, background .16s ease;
}
.ssa-settings__switch::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: rgba(238,244,255,.5); transition: transform .16s ease, background .16s ease;
}
.ssa-settings__switch[aria-checked="true"] { border-color: rgba(77,200,255,.7); background: rgba(77,200,255,.16); }
.ssa-settings__switch[aria-checked="true"]::after { transform: translateX(22px); background: ${NAV}; box-shadow: 0 0 10px rgba(77,200,255,.6); }
.ssa-settings__switch:focus-visible { outline: 2px solid ${NAV}; outline-offset: 2px; }

.ssa-settings__seg { display: inline-flex; border: 1px solid rgba(238,244,255,.2); border-radius: 3px; overflow: hidden; }
.ssa-settings__seg button {
  padding: 6px 11px; border: 0; border-left: 1px solid rgba(238,244,255,.14);
  color: ${MUTED}; background: rgba(4,6,12,.6); cursor: pointer;
  font: inherit; font-size: 10px; font-weight: 700; letter-spacing: .08em;
}
.ssa-settings__seg button:first-child { border-left: 0; }
.ssa-settings__seg button[aria-pressed="true"] { color: ${NAV}; background: rgba(77,200,255,.16); }
.ssa-settings__seg button:disabled { cursor: default; opacity: .5; }

.ssa-settings__btn {
  padding: 7px 12px; border: 1px solid rgba(77,200,255,.55); border-radius: 3px;
  color: ${NAV}; background: rgba(77,200,255,.09); cursor: pointer;
  font: inherit; font-size: 10px; font-weight: 700; letter-spacing: .08em;
}
.ssa-settings__btn:hover { background: rgba(77,200,255,.18); }
.ssa-settings__value { color: ${MUTED}; font-size: 10.5px; letter-spacing: .05em; }
.ssa-settings__note {
  margin-top: 12px; padding: 9px 11px; border-left: 2px solid rgba(255,211,92,.5);
  background: rgba(255,211,92,.05); color: rgba(238,244,255,.62); font-size: 10.5px; line-height: 1.5;
}
.ssa-settings__bindings {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px;
  padding-top: 4px;
}
.ssa-settings__binding {
  display: flex; align-items: center; gap: 10px; min-height: 34px;
  border-bottom: 1px solid rgba(238,244,255,.07); color: ${MUTED}; font-size: 10.5px;
}
.ssa-settings__binding kbd {
  flex: none; min-width: 78px; padding: 4px 6px; border: 1px solid rgba(238,244,255,.22);
  border-radius: 3px; background: rgba(4,6,12,.72); color: ${INK}; text-align: center;
  font: inherit; font-size: 9.5px; font-weight: 700; letter-spacing: .03em;
}
@media (max-width: 460px) {
  .ssa-settings__row { flex-wrap: wrap; }
  .ssa-settings__control { width: 100%; justify-content: flex-start; }
  .ssa-settings__bindings { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .ssa-settings__switch, .ssa-settings__switch::after { transition: none; }
}
`;

export class Settings {
  /**
   * @param {object}   opts
   * @param {object}   [opts.graphicsQuality]      controller from createGraphicsQuality()
   * @param {Function} [opts.setGraphicsPreference] (controller, next) => void
   * @param {Function} [opts.onToggle]             (open) => {} — main.js pauses on this
   * @param {Function} [opts.onPerfOverlay]        (enabled) => {}
   * @param {Function} [opts.onOpenDebugMenu]      opens the lil-gui tuning tree
   * @param {boolean}  [opts.debugMenuAvailable]   false under `?debug=off`
   * @param {boolean}  [opts.initialPerfOverlay]    URL-selected boot state
   */
  constructor({
    graphicsQuality = null,
    setGraphicsPreference = null,
    onToggle = null,
    onPerfOverlay = null,
    onOpenDebugMenu = null,
    onOpenCassette = null,
    onOpenGarage = null,
    onChangeCamera = null,
    touchControls = null,
    debugMenuAvailable = true,
    initialPerfOverlay = null,
  } = {}) {
    if (typeof document === 'undefined') throw new Error('Settings requires a browser document');
    this.graphicsQuality = graphicsQuality;
    this.setGraphicsPreference = typeof setGraphicsPreference === 'function' ? setGraphicsPreference : null;
    this.onToggle = typeof onToggle === 'function' ? onToggle : null;
    this.onPerfOverlay = typeof onPerfOverlay === 'function' ? onPerfOverlay : null;
    this.onOpenDebugMenu = typeof onOpenDebugMenu === 'function' ? onOpenDebugMenu : null;
    this.onOpenCassette = onOpenCassette;
    this.onOpenGarage = onOpenGarage;
    this.onChangeCamera = onChangeCamera;
    this.touchControls = touchControls;
    this.debugMenuAvailable = !!debugMenuAvailable;

    this.values = loadStored();
    // A probe URL may request the overlay at boot. Mirror that state in the
    // switch so the first click turns it OFF instead of apparently doing
    // nothing; the switch remains authoritative after boot.
    if (typeof initialPerfOverlay === 'boolean') this.values.perfOverlay = initialPerfOverlay;
    this.englishMode = false;
    this._open = false;
    this._previousFocus = null;
    this._localized = new Set();

    this.root = document.createElement('div');
    this.root.className = 'ssa-settings';
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML =
      `<style>${CSS}</style>`
      + '<div class="ssa-settings__veil" data-settings-close></div>'
      + '<section class="ssa-settings__dialog" role="dialog" aria-modal="true" aria-labelledby="ssa-settings-title" tabindex="-1">'
        + '<header class="ssa-settings__header">'
          + '<div class="ssa-settings__stripe"></div>'
          + '<div><div class="ssa-settings__kicker">서울 스낵 어택 · OPTIONS</div>'
          + '<h2 class="ssa-settings__title" id="ssa-settings-title">설정<small>SETTINGS</small></h2></div>'
          + '<button class="ssa-settings__close" type="button" aria-keyshortcuts="Escape" data-settings-close>'
            + '<span data-close-label>닫기</span><kbd>ESC</kbd>'
          + '</button>'
        + '</header>'
        + '<div class="ssa-settings__body"></div>'
      + '</section>';

    this.dialog = this.root.querySelector('.ssa-settings__dialog');
    this.body = this.root.querySelector('.ssa-settings__body');
    this._localize(this.root.querySelector('[data-close-label]'), '닫기', 'CLOSE');
    this._build();

    for (const node of this.root.querySelectorAll('[data-settings-close]')) {
      node.addEventListener('click', () => this.close());
    }
    // Escape is bound on the window, not the dialog: focus can legitimately sit
    // outside it (the browser moves focus to the body when it releases pointer
    // lock), and a dialog-scoped listener would then never see the key.
    window.addEventListener('keydown', (event) => {
      if (!this._open || event.key !== 'Escape') return;
      event.preventDefault();
      this.close();
    });
    document.body.appendChild(this.root);
  }

  // ---- construction --------------------------------------------------------

  _section(ko, en) {
    const section = document.createElement('section');
    section.className = 'ssa-settings__section';
    const legend = document.createElement('div');
    legend.className = 'ssa-settings__legend';
    const title = document.createElement('span');
    title.textContent = ko;
    const sub = document.createElement('em');
    sub.textContent = en;
    legend.append(title, sub);
    section.appendChild(legend);
    this.body.appendChild(section);
    return section;
  }

  _row(section, { ko, en, hintKo, hintEn }) {
    const row = document.createElement('div');
    row.className = 'ssa-settings__row';
    const label = document.createElement('div');
    label.className = 'ssa-settings__label';
    label.appendChild(this._localize(document.createElement('b'), ko, en));
    if (hintKo) label.appendChild(this._localize(document.createElement('span'), hintKo, hintEn ?? hintKo));
    const control = document.createElement('div');
    control.className = 'ssa-settings__control';
    row.append(label, control);
    section.appendChild(row);
    return control;
  }

  _localize(node, ko, en) {
    node.dataset.ko = ko;
    node.dataset.en = en;
    node.textContent = this.englishMode ? en : ko;
    this._localized.add(node);
    return node;
  }

  _switch(control, key, onChange) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ssa-settings__switch';
    button.setAttribute('role', 'switch');
    const sync = () => button.setAttribute('aria-checked', String(!!this.values[key]));
    sync();
    button.addEventListener('click', () => {
      this.values[key] = !this.values[key];
      saveStored(this.values);
      sync();
      onChange?.(this.values[key]);
    });
    control.appendChild(button);
    return button;
  }

  _build() {
    if (this.onOpenGarage) {
      const session = this._section('차량', 'VEHICLE');
      const row = this._row(session, { ko: '차고 · 차량 선택', en: 'Garage · Choose vehicle',
        hintKo: '차량을 선택하고 새로운 차를 구입하세요.', hintEn: 'Choose your ride or buy a new vehicle.' });
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ssa-settings__btn';
      button.dataset.openGarage = '';
      button.innerHTML = icon('vehicle');
      button.appendChild(this._localize(document.createElement('span'), '차고 열기', 'OPEN GARAGE'));
      button.addEventListener('click', () => { this.close(); this.onOpenGarage(); });
      row.appendChild(button);
    }
    // ---- Controls ----------------------------------------------------------
    // This is the permanent home for bindings. The in-world legend is only an
    // onboarding aid and leaves the HUD after the first completed delivery.
    const controls = this._section('조작', 'CONTROLS');
    const bindings = document.createElement('div');
    bindings.className = 'ssa-settings__bindings';
    const rows = [
      ['WASD / Arrows · L-Stick', '주행 / 이동', 'Drive / move'],
      ['Mouse · R-Stick', '카메라', 'Camera'],
      ['Space · A', '사이드브레이크 / 점프', 'Handbrake / jump'],
      ['E · X', '주문 수락', 'Accept order'],
      ['F · B', '차량 타기 / 내리기', 'Enter / exit vehicle'],
      ['C · R-Stick click', '운전석 / 추적 시점', 'Cockpit / chase view'],
      ['V · D-Pad ↑', '카메라 각도', 'Camera angle'],
      ['R · Y', '도로로 복귀', 'Reset to road'],
      ['M', '전체 지도', 'City map'],
      ['P', '카세트 데크', 'Tape deck / choose song'],
      ['T · LB (hold)', '영어로 보기', 'Show English'],
      ['Esc · F3 · View', '이 메뉴', 'This menu'],
      ['`', '튜닝 메뉴', 'Tuning menu'],
    ];
    for (const [key, ko, en] of rows) {
      const row = document.createElement('div');
      row.className = 'ssa-settings__binding';
      const cap = document.createElement('kbd');
      cap.textContent = key;
      row.append(cap, this._localize(document.createElement('span'), ko, en));
      bindings.appendChild(row);
    }
    controls.appendChild(bindings);
    const touchHelp = document.createElement('p');
    touchHelp.className = 'mobile-control-help';
    touchHelp.textContent = TOUCH_HELP;
    controls.appendChild(touchHelp);

    if (this.touchControls) {
      const row = this._row(controls, { ko: '터치 컨트롤', en: 'Touch controls',
        hintKo: '자동으로 터치 화면을 감지합니다.', hintEn: 'Auto detects touch screens. Change this here at any time.' });
      const seg = document.createElement('div');
      seg.className = 'ssa-settings__seg';
      const sync = () => seg.querySelectorAll('button').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.touchPreference === this.touchControls.preference));
      });
      for (const [value, ko, en] of [['auto', '자동', 'AUTO'], ['on', '켜기', 'ON'], ['off', '끄기', 'OFF']]) {
        const button = this._localize(document.createElement('button'), ko, en);
        button.type = 'button';
        button.dataset.touchPreference = value;
        button.addEventListener('click', () => { this.touchControls.setPreference(value); sync(); });
        seg.appendChild(button);
      }
      row.appendChild(seg);
      this._syncTouch = sync;
      sync();
    }

    if (this.onChangeCamera) {
      const row = this._row(controls, { ko: '카메라', en: 'Camera',
        hintKo: '운전석 시점이나 추적 카메라 각도를 바꾸세요.', hintEn: 'Switch the driving view or cycle the chase camera height.' });
      for (const [action, ko, en] of [['view', '시점 전환', 'SWITCH VIEW'], ['angle', '높이 변경', 'CAMERA HEIGHT']]) {
        const button = this._localize(document.createElement('button'), ko, en);
        button.type = 'button';
        button.className = 'ssa-settings__btn';
        button.dataset.cameraAction = action;
        button.addEventListener('click', () => { this.close(); this.onChangeCamera(action); });
        row.appendChild(button);
      }
    }

    // ---- Display -----------------------------------------------------------
    const display = this._section('화면', 'DISPLAY');
    const gfx = this.graphicsQuality;
    const gfxControl = this._row(display, {
      ko: '그래픽 품질',
      en: 'Graphics quality',
      hintKo: '모바일은 해상도·비·소품·가로등 예산을 줄입니다. 물리와 진행도는 그대로입니다.',
      hintEn: 'Mobile cuts resolution, rain, props and streetlights. Physics and progression are untouched.',
    });
    const seg = document.createElement('div');
    seg.className = 'ssa-settings__seg';
    for (const [value, ko, en] of [['auto', '자동', 'AUTO'], ['desktop', '데스크톱', 'DESKTOP'], ['mobile', '모바일', 'MOBILE']]) {
      const button = this._localize(document.createElement('button'), ko, en);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(gfx?.preference === value));
      button.disabled = !gfx || !this.setGraphicsPreference;
      // Changing the budget reloads — the profile is read once at boot and handed
      // to the renderer, the rain and the light pool — so this navigates rather
      // than updating in place. See applyGraphicsPreference().
      button.addEventListener('click', () => this.setGraphicsPreference?.(gfx, value));
      seg.appendChild(button);
    }
    gfxControl.appendChild(seg);

    if (this.onOpenCassette) {
      const music = this._section('음악', 'MUSIC');
      const row = this._row(music, { ko: '카세트 데크', en: 'Tape deck',
        hintKo: '해금된 곡을 선택하고 재생·음량을 조절하세요. P 키로 바로 열 수 있습니다.',
        hintEn: 'Choose an unlocked song, control playback and adjust volume. Press P to open directly.' });
      const button = this._localize(document.createElement('button'), '열기', 'OPEN');
      button.type = 'button';
      button.className = 'ssa-settings__btn';
      button.dataset.openCassette = '';
      button.addEventListener('click', () => { this.close(); this.onOpenCassette(); });
      row.appendChild(button);
    }

    // ---- Developer ---------------------------------------------------------
    // Off by default and behind its own heading: a player who opened this menu
    // to change the graphics budget should be able to tell the rest is not
    // meant for them.
    const dev = this._section('개발자 도구', 'DEVELOPER TOOLS');
    const perf = this._row(dev, {
      ko: '성능 오버레이',
      en: 'Performance overlay',
      hintKo: '위치·드로우콜·삼각형·물리 스텝을 화면 왼쪽 아래에 표시합니다.',
      hintEn: 'Position, draw calls, triangles and physics steps, bottom left of the screen.',
    });
    this._switch(perf, 'perfOverlay', (on) => this.onPerfOverlay?.(on));

    const menu = this._row(dev, {
      ko: '튜닝 메뉴',
      en: 'Tuning menu',
      hintKo: '날씨, 시간대, 조명, 차량 물리. 바꾼 값은 이 브라우저에 저장됩니다.',
      hintEn: 'Weather, time of day, lighting, vehicle physics. Changes persist in this browser.',
    });
    if (this.debugMenuAvailable && this.onOpenDebugMenu) {
      const button = this._localize(document.createElement('button'), '열기', 'OPEN');
      button.type = 'button';
      button.className = 'ssa-settings__btn';
      button.addEventListener('click', () => {
        this.close();
        this.onOpenDebugMenu();
      });
      menu.appendChild(button);
    } else {
      const value = this._localize(
        document.createElement('span'),
        '이 빌드에서는 사용할 수 없음',
        'NOT AVAILABLE IN THIS BUILD',
      );
      value.className = 'ssa-settings__value';
      menu.appendChild(value);
    }

    const note = this._localize(
      document.createElement('div'),
      '개발자 도구는 진행도에 영향을 주지 않지만, 여기서 저장한 튜닝 값은 다음 실행에도 적용됩니다.',
      'Developer tools do not affect progression, but tuning saved here applies to your next run too.',
    );
    note.className = 'ssa-settings__note';
    dev.appendChild(note);
  }

  // ---- state ---------------------------------------------------------------

  get perfOverlay() { return !!this.values.perfOverlay; }

  isOpen() { return this._open; }

  open() { this.setOpen(true); }

  close() { this.setOpen(false); }

  toggle() { this.setOpen(!this._open); }

  setOpen(open) {
    open = !!open;
    if (open === this._open) return;
    this._open = open;
    this.root.hidden = !open;
    this.root.setAttribute('aria-hidden', String(!open));
    if (open) {
      this._syncTouch?.();
      this._previousFocus = document.activeElement;
      // Pointer lock would swallow every click inside the dialog.
      document.exitPointerLock?.();
      this.dialog.focus({ preventScroll: true });
    } else {
      this._previousFocus?.focus?.({ preventScroll: true });
      this._previousFocus = null;
    }
    this.onToggle?.(open);
  }

  /** Follows the same hold-T translate the rest of the UI uses. */
  setEnglishMode(active) {
    active = !!active;
    if (active === this.englishMode) return;
    this.englishMode = active;
    for (const node of this._localized) {
      node.textContent = active ? node.dataset.en : node.dataset.ko;
    }
  }
}
