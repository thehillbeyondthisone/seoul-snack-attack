// Capability-driven graphics profile. The mobile profile changes rendering
// cost only; it never touches physics, timers, routes, or gameplay state.

const STORAGE_KEY = 'snack-attack-graphics-quality-v1';
const PREFERENCES = ['auto', 'desktop', 'mobile'];

export const DESKTOP_GRAPHICS = Object.freeze({
  name: 'desktop',
  antialias: true,
  pixelRatioCap: 2,
  postScale: 1,
  rainDensity: 1,
  propDensity: 1,
  streetlights: 10,
  cullDistance: 105,
  detailIntensity: 1, // proc-city detail-map bump strength (0 disables generation)
});

export const MOBILE_GRAPHICS = Object.freeze({
  name: 'mobile',
  antialias: false,
  pixelRatioCap: 1,
  postScale: 0.5,
  rainDensity: 0.35,
  propDensity: 0.3,
  streetlights: 4,
  cullDistance: 65,
  detailIntensity: 0.35, // same pool, weaker bumps — keeps the one texture set cheap
});

export function shouldAutoUseMobileGraphics({
  maxTouchPoints = 0,
  coarsePointer = false,
  hoverNone = false,
  shortSide = Infinity,
} = {}) {
  const touchFirst = coarsePointer || (maxTouchPoints > 0 && hoverNone);
  return touchFirst && shortSide <= 1024;
}

function capabilities() {
  const media = (query) => {
    try { return window.matchMedia?.(query).matches || false; } catch { return false; }
  };
  return {
    maxTouchPoints: navigator.maxTouchPoints || 0,
    coarsePointer: media('(pointer: coarse)'),
    hoverNone: media('(hover: none)'),
    shortSide: Math.min(window.screen?.width || innerWidth, window.screen?.height || innerHeight),
  };
}

function normalize(value) {
  return PREFERENCES.includes(value) ? value : 'auto';
}

function readSavedPreference() {
  try { return localStorage.getItem(STORAGE_KEY) || 'auto'; } catch { return 'auto'; }
}

function writeSavedPreference(value) {
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* storage unavailable */ }
}

function mountToggle(controller) {
  if (!document.getElementById('graphics-quality-style')) {
    const style = document.createElement('style');
    style.id = 'graphics-quality-style';
    style.textContent = `
#graphics-quality-toggle {
  position: fixed; left: calc(50% + 52px); bottom: max(8px, env(safe-area-inset-bottom));
  z-index: 46; transform: translateX(-50%); padding: 5px 9px;
  border: 1px solid rgba(255,211,92,.36); border-radius: 4px;
  color: rgba(238,244,255,.72); background: rgba(4,6,12,.72);
  font: 700 9px/1.2 Inter, 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
  letter-spacing: .08em; touch-action: manipulation;
}
body.graphics-toggle-visible #touch-controls .touch-toggle { left: calc(50% - 52px); }
`;
    document.head.appendChild(style);
  }

  const button = document.createElement('button');
  button.id = 'graphics-quality-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', 'Change graphics quality mode');
  const labels = {
    auto: controller.mobile ? 'GFX · AUTO/MOBILE' : 'GFX · AUTO/DESKTOP',
    desktop: 'GFX · DESKTOP',
    mobile: 'GFX · MOBILE',
  };
  button.textContent = labels[controller.preference];
  button.setAttribute('aria-pressed', String(controller.mobile));
  const visible = controller.detected || controller.preference !== 'auto';
  button.hidden = !visible;
  document.body.classList.toggle('graphics-toggle-visible', visible);
  document.body.classList.toggle('graphics-mobile', controller.mobile);
  button.addEventListener('click', () => {
    applyGraphicsPreference(controller, { auto: 'desktop', desktop: 'mobile', mobile: 'auto' }[controller.preference]);
  });
  document.body.appendChild(button);
}

/** The three choices, in the order both the chip and the settings menu list them. */
export const GRAPHICS_PREFERENCES = PREFERENCES;

/**
 * Commit a graphics preference and reload into it.
 *
 * The profile is read once at boot and handed to the renderer, the rain, the
 * streetlight pool and the city's cull distances, so there is no live path to
 * change it — a reload is the honest way. `?gfx=` wins over storage while it is
 * in the URL, so a page opened with the override rewrites the URL instead of
 * writing a preference the query string would keep shadowing.
 */
export function applyGraphicsPreference(controller, next) {
  const value = normalize(next);
  if (value === controller.preference) return;
  if (controller.queryOverride) {
    const url = new URL(location.href);
    url.searchParams.set('gfx', value);
    location.href = url.toString();
  } else {
    writeSavedPreference(value);
    location.reload();
  }
}

/** Side-effect-free profile resolution for systems that need the device
 *  budget outside createGraphicsQuality()'s UI mounting (e.g. world dressing
 *  deciding how many practical lights it may afford). */
export function resolveGraphicsProfile() {
  const query = new URLSearchParams(location.search).get('gfx');
  const preference = normalize(query || readSavedPreference());
  const detected = shouldAutoUseMobileGraphics(capabilities());
  return preference === 'mobile' || (preference === 'auto' && detected)
    ? MOBILE_GRAPHICS
    : DESKTOP_GRAPHICS;
}

export function createGraphicsQuality() {
  const query = new URLSearchParams(location.search).get('gfx');
  const preference = normalize(query || readSavedPreference());
  const detected = shouldAutoUseMobileGraphics(capabilities());
  const mobile = preference === 'mobile' || (preference === 'auto' && detected);
  const controller = {
    preference,
    queryOverride: PREFERENCES.includes(query) ? query : null,
    detected,
    mobile,
    profile: resolveGraphicsProfile(),
  };
  mountToggle(controller);
  return controller;
}
