// One small, shared line-icon vocabulary for the in-game controls.
const paths = {
  settings: '<path d="m9 3-.6 2.2-1.8 1L4.4 6l-2 3.5L4 11v2l-1.6 1.5 2 3.5 2.2-.2 1.8 1L9 21h4l.6-2.2 1.8-1 2.2.2 2-3.5L18 13v-2l1.6-1.5-2-3.5-2.2.2-1.8-1L13 3Z"/><circle cx="11" cy="12" r="3"/>',
  cassette: '<rect x="2" y="5" width="20" height="14" rx="3"/><rect x="5" y="8" width="14" height="6" rx="3"/><circle cx="8" cy="11" r="1"/><circle cx="16" cy="11" r="1"/><path d="m7 19 1-3h8l1 3"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/><path d="m10 14 2-2 2 2m-2-2v5"/>',
  vehicle: '<path d="M5 21V6l4-3h10v18Zm1-11h12M9 3v7m5 4h2"/>',
  jump: '<path d="M12 18V4m-5 5 5-5 5 5M4 18v3h16v-3"/>',
  up: '<path d="m6 11 6-6 6 6M12 5v14M5 21h14"/>',
  down: '<path d="m6 13 6 6 6-6M12 19V5M5 3h14"/>',
  sprint: '<circle cx="15" cy="4" r="2"/><path d="m8 9 4-2 3 5 5 1m-8-6-2 7 4 3v5m-4-8-3 5H3M3 6h4M2 10h3"/>',
  language: '<path d="M3 5h10M8 3v2m3 0c0 5-3 8-7 10m1-7c1 3 3 5 6 6m2 7 4-10 4 10m-6.7-3h5.4"/>',
};

export function icon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || ''}</svg>`;
}

export const TOUCH_HELP = 'Left thumb: accelerate / brake / reverse. Right thumb: steer. Drag the street to look around. Tap an order to accept. The door icon enters or exits your vehicle; jump and sprint appear on foot. Underwater, hold the up / down arrows to change depth. Tap the language icon on the right to switch English / Korean. Garage, camera and touch preferences are in Settings.';
