// Curated places worth reviewing from the backtick menu.
//
// Keep these routes deterministic: a tour button should not carry a stale
// ?dive, ?building, or ?props flag from the place the player is leaving.
export const DEBUG_DESTINATIONS = Object.freeze([
  {
    id: 'street-drive',
    label: '스낵 스트리트 운전 · Drive Snack Street',
    path: './',
    params: { world: 'pilot', building: 'street-assembly', intro: 'off', props: 'off' },
  },
  {
    id: 'street-orbit',
    label: '스낵 스트리트 둘러보기 · Orbit Snack Street',
    path: 'building-pilot.html',
    params: { building: 'street-assembly' },
  },
  {
    id: 'building-kit',
    label: '건물 키트 · Building kit',
    path: 'building-pilot.html',
    params: {},
  },
  {
    id: 'current-seoul',
    label: '현행 서울 · Current Seoul',
    path: './',
    params: { world: 'expanse2', intro: 'off' },
  },
  {
    id: 'hippo-cockpit',
    label: '히포 운전석 · Hippo cockpit',
    path: './',
    params: { world: 'expanse2', view: 'cockpit', intro: 'off' },
  },
  {
    id: 'drain-jump',
    label: '더 드레인 점프 · The Drain jump',
    path: './',
    params: { world: 'expanse2', dive: 'ramp', intro: 'off', time: 'night' },
  },
  {
    id: 'abyss',
    label: '심해 포켓 · The Abyss',
    path: './',
    params: { world: 'expanse2', dive: '1', intro: 'off', time: 'night' },
  },
  {
    id: 'prop-gallery',
    label: '소품 갤러리 · Prop gallery',
    path: './',
    params: { world: 'proc', props: 'gallery', intro: 'off' },
  },
  {
    id: 'colour-bible',
    label: '컬러 바이블 · Colour bible',
    path: 'color-bible.html',
    params: {},
  },
]);

export function destinationUrl(currentHref, destination) {
  const url = new URL(destination.path, currentHref);
  url.search = '';
  url.hash = '';
  for (const [key, value] of Object.entries(destination.params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
