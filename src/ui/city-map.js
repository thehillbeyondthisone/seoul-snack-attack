// Seoul Snack Attack — north-up, full-city navigation overlay.
//
// This module deliberately has no Three.js dependency. The renderer consumes
// the live city's plain road/district data and duck-types Vector3/Box3 values,
// while the exported projection helpers stay importable from Node checks.

export const CITY_MAP_TUNING = Object.freeze({
  // The live road graph already owns world scale and carriageway widths.
  // These are view-only multipliers and therefore default to a faithful 1:1.
  linearScale: 1,
  roadWidthScale: 1,
});

const INK = '#eef4ff';
const NAV = '#4dc8ff';
const ALARM = '#ff2d78';
const PANEL = '#080b12';

const DISTRICT_LABELS = Object.freeze({
  hills: { ko: '북악 산책', en: 'BUKAK RIDGE' },
  hongdae: { ko: '떡볶이 골목', en: 'TTEOKBOKKI ALLEY' },
  station: { ko: '김밥 대로', en: 'GIMBAP BOULEVARD' },
  market: { ko: '호떡 시장', en: 'HOTTEOK MARKET' },
  hangang: { ko: '빙수 한강', en: 'BINGSU HANFRONT' },
  pocha: { ko: '포차 골목', en: 'POCHA ALLEY' },
});

const SHOP_LABELS = Object.freeze({
  tteokbokki: { ko: '신당 떡볶이 골목', en: 'SINDANG TTEOKBOKKI' },
  hotteok: { ko: '호떡 로드 카트', en: 'HOTTEOK ROAD CART' },
  eomuk: { ko: '부산 어묵 포차', en: 'BUSAN EOMUK POCHA' },
  gimbap: { ko: '광장 김밥 트럭', en: 'GWANGJANG GIMBAP' },
  chimaek: { ko: '홍대 치맥 거리', en: 'HONGDAE CHIMAEK' },
  bingsu: { ko: '서울 야간 편의점', en: 'NIGHT CONVENIENCE' },
  gilgeori: { ko: '길거리 토스트 대장', en: 'GILGEORI TOAST' },
  pocha: { ko: '한강 노가리 포차', en: 'HANGANG POCHA' },
});

const CSS = `
.ssa-city-map[hidden] { display: none !important; }
.ssa-city-map {
  position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center;
  pointer-events: auto; color: ${INK};
  font-family: Inter, 'Segoe UI Variable', 'Segoe UI', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif;
  font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
}
.ssa-city-map__veil {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse at 50% 48%, rgba(13,26,38,.48), rgba(2,4,8,.93) 72%),
    linear-gradient(rgba(5,9,15,.82), rgba(2,4,8,.95));
  backdrop-filter: blur(9px) saturate(78%); -webkit-backdrop-filter: blur(9px) saturate(78%);
}
.ssa-city-map__dialog {
  position: relative; width: 92vw; height: 90vh; min-height: 420px;
  display: grid; grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden; outline: none;
  border: 1px solid rgba(238,244,255,.2);
  background: rgba(7,10,16,.88);
  box-shadow: 0 30px 100px rgba(0,0,0,.72), 0 0 55px rgba(77,200,255,.07);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 24px), calc(100% - 24px) 100%, 0 100%);
}
.ssa-city-map__dialog::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 3;
  background:
    linear-gradient(90deg, rgba(77,200,255,.05) 1px, transparent 1px),
    linear-gradient(rgba(77,200,255,.035) 1px, transparent 1px);
  background-size: 64px 64px; mask-image: linear-gradient(to bottom, rgba(0,0,0,.45), transparent 34%);
}
.ssa-city-map__header, .ssa-city-map__footer { position: relative; z-index: 5; }
.ssa-city-map__header {
  min-height: 76px; display: flex; align-items: center; gap: 22px; padding: 14px 18px 13px 22px;
  border-bottom: 1px solid rgba(238,244,255,.14);
  background: linear-gradient(90deg, rgba(77,200,255,.09), transparent 42%, rgba(77,200,255,.035));
}
.ssa-city-map__stripe {
  width: 3px; align-self: stretch; flex: none; background: ${NAV};
  box-shadow: 0 0 16px rgba(77,200,255,.72);
}
.ssa-city-map__kicker { color: ${NAV}; font-size: 9px; font-weight: 800; letter-spacing: .2em; }
.ssa-city-map__title { margin: 2px 0 0; font-size: clamp(20px, 2vw, 31px); line-height: 1; letter-spacing: -.02em; }
.ssa-city-map__title small { margin-left: 10px; color: rgba(238,244,255,.48); font-size: .38em; letter-spacing: .18em; }
.ssa-city-map__north {
  margin-left: auto; display: flex; align-items: center; gap: 8px; color: ${NAV};
  font-size: 10px; font-weight: 800; letter-spacing: .15em;
}
.ssa-city-map__north i { width: 28px; height: 1px; display: block; background: ${NAV}; box-shadow: 0 0 9px ${NAV}; }
.ssa-city-map__close {
  position: relative; z-index: 6; display: flex; align-items: center; gap: 9px; min-height: 38px;
  padding: 7px 9px 7px 13px; border: 1px solid rgba(77,200,255,.48); border-radius: 2px;
  background: rgba(77,200,255,.08); color: ${INK}; cursor: pointer;
  font: 750 10px/1.1 inherit; letter-spacing: .08em;
}
.ssa-city-map__close:hover { background: rgba(77,200,255,.17); border-color: ${NAV}; }
.ssa-city-map__close:focus-visible { outline: 2px solid ${INK}; outline-offset: 3px; }
.ssa-city-map__close kbd {
  min-width: 22px; padding: 4px 5px; border: 1px solid ${NAV}; border-radius: 2px;
  color: ${NAV}; background: rgba(77,200,255,.1); font: 900 11px/1 inherit; text-align: center;
}
.ssa-city-map__body {
  position: relative; z-index: 4; min-height: 0; display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(220px, 19vw, 292px);
}
.ssa-city-map__canvas-wrap {
  position: relative; min-width: 0; min-height: 0; overflow: hidden;
  background:
    radial-gradient(circle at 50% 50%, rgba(18,35,49,.62), rgba(5,9,15,.92) 69%),
    ${PANEL};
}
.ssa-city-map__canvas-wrap::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 0 90px rgba(0,0,0,.5), inset 0 0 0 1px rgba(77,200,255,.07);
}
.ssa-city-map__canvas { display: block; width: 100%; height: 100%; }
.ssa-city-map__compass {
  position: absolute; top: 17px; right: 18px; width: 42px; height: 58px; display: grid; place-items: start center;
  color: ${NAV}; font-size: 11px; font-weight: 900; text-shadow: 0 0 12px rgba(77,200,255,.9);
  pointer-events: none;
}
.ssa-city-map__compass::before {
  content: ''; position: absolute; top: 18px; left: 20px; width: 1px; height: 27px;
  background: ${NAV}; box-shadow: 0 0 9px ${NAV};
}
.ssa-city-map__compass::after {
  content: ''; position: absolute; top: 14px; left: 15px; width: 0; height: 0;
  border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 10px solid ${NAV};
}
.ssa-city-map__side {
  min-width: 0; overflow: auto; padding: 18px 17px 17px;
  border-left: 1px solid rgba(238,244,255,.13); background: rgba(8,11,18,.95);
  scrollbar-color: rgba(77,200,255,.35) transparent;
}
.ssa-city-map__eyebrow { color: ${NAV}; font-size: 9px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
.ssa-city-map__stage { margin-top: 7px; color: ${INK}; font-size: 18px; font-weight: 850; line-height: 1.12; }
.ssa-city-map__stage-en { margin-top: 4px; color: rgba(238,244,255,.48); font-size: 9px; font-weight: 700; letter-spacing: .16em; }
.ssa-city-map__target {
  margin-top: 15px; padding: 11px 11px 12px; border-left: 2px solid ${NAV};
  background: linear-gradient(90deg, rgba(77,200,255,.11), rgba(77,200,255,.025));
}
.ssa-city-map__target.is-active { border-left-color: ${ALARM}; background: linear-gradient(90deg, rgba(255,45,120,.12), rgba(255,45,120,.025)); }
.ssa-city-map__target strong { display: block; font-size: 13px; line-height: 1.26; }
.ssa-city-map__target span { display: block; margin-top: 4px; color: rgba(238,244,255,.5); font-size: 9px; letter-spacing: .09em; }
.ssa-city-map__metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin-top: 14px; background: rgba(238,244,255,.11); }
.ssa-city-map__metric { min-width: 0; padding: 9px 8px; background: #0b0f17; }
.ssa-city-map__metric span { display: block; color: rgba(238,244,255,.42); font-size: 8px; font-weight: 700; letter-spacing: .13em; }
.ssa-city-map__metric strong { display: block; overflow: hidden; margin-top: 4px; color: ${INK}; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.ssa-city-map__section { margin-top: 19px; padding-top: 15px; border-top: 1px solid rgba(238,244,255,.11); }
.ssa-city-map__section h3 { margin: 0 0 10px; color: rgba(238,244,255,.55); font-size: 9px; letter-spacing: .16em; }
.ssa-city-map__legend { display: grid; gap: 9px; }
.ssa-city-map__legend div { display: grid; grid-template-columns: 18px 1fr; align-items: center; column-gap: 8px; font-size: 10px; font-weight: 700; }
.ssa-city-map__legend small { display: block; margin-top: 2px; color: rgba(238,244,255,.4); font-size: 8px; font-weight: 600; letter-spacing: .08em; }
.ssa-city-map__symbol { width: 12px; height: 12px; justify-self: center; box-sizing: border-box; }
.ssa-city-map__symbol.route { height: 3px; background: ${NAV}; box-shadow: 0 0 7px ${NAV}; }
.ssa-city-map__symbol.target { border: 2px solid ${ALARM}; border-radius: 50%; box-shadow: 0 0 7px ${ALARM}; }
.ssa-city-map__symbol.shop { transform: rotate(45deg); border: 2px solid ${NAV}; background: rgba(77,200,255,.18); }
.ssa-city-map__symbol.anchor { width: 7px; height: 7px; border: 1px solid rgba(238,244,255,.58); border-radius: 50%; }
.ssa-city-map__districts { color: rgba(238,244,255,.48); font-size: 9px; line-height: 1.65; letter-spacing: .04em; }
.ssa-city-map__footer {
  min-height: 35px; display: flex; align-items: center; justify-content: space-between; gap: 15px;
  padding: 7px 21px; border-top: 1px solid rgba(238,244,255,.12); color: rgba(238,244,255,.44);
  background: rgba(5,8,13,.96); font-size: 8px; font-weight: 700; letter-spacing: .13em;
}
.ssa-city-map__footer strong { color: ${NAV}; font-weight: 800; }
@media (max-width: 820px) {
  .ssa-city-map__dialog { width: 96vw; height: 94svh; min-height: 360px; }
  .ssa-city-map__header { min-height: 60px; padding: 10px 11px 10px 14px; gap: 12px; }
  .ssa-city-map__title small, .ssa-city-map__north { display: none; }
  .ssa-city-map__close { padding-left: 8px; }
  .ssa-city-map__close span { display: none; }
  .ssa-city-map__body { grid-template-columns: 1fr; grid-template-rows: minmax(210px, 1fr) auto; }
  .ssa-city-map__side { max-height: 190px; padding: 11px 13px; border-left: 0; border-top: 1px solid rgba(238,244,255,.13); }
  .ssa-city-map__side-top { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ssa-city-map__target { margin-top: 0; }
  .ssa-city-map__stage { font-size: 15px; }
  .ssa-city-map__metrics { margin-top: 9px; }
  .ssa-city-map__section { display: none; }
  .ssa-city-map__footer { padding-inline: 13px; }
}
@media (prefers-reduced-motion: reduce) {
  .ssa-city-map *, .ssa-city-map *::before, .ssa-city-map *::after { scroll-behavior: auto !important; }
}
`;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pointOf(value) {
  const point = value?.point || value?.position || value;
  if (!point) return null;
  const x = Number(point.x);
  const z = Number(point.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

/** Convert a Three.Box3-like or scalar-bound object to a plain X/Z extent. */
export function normalizeMapBounds(bounds) {
  if (!bounds) return null;
  let minX = finite(bounds.minX, finite(bounds.min?.x, NaN));
  let maxX = finite(bounds.maxX, finite(bounds.max?.x, NaN));
  let minZ = finite(bounds.minZ, finite(bounds.min?.z, NaN));
  let maxZ = finite(bounds.maxZ, finite(bounds.max?.z, NaN));
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
  if (minX > maxX) [minX, maxX] = [maxX, minX];
  if (minZ > maxZ) [minZ, maxZ] = [maxZ, minZ];
  if (maxX - minX < 1e-6) { minX -= 0.5; maxX += 0.5; }
  if (maxZ - minZ < 1e-6) { minZ -= 0.5; maxZ += 0.5; }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

/**
 * Build a centered, aspect-preserving north-up projection.
 * World north is -Z, so the smallest Z coordinate maps to the canvas top.
 */
export function createMapProjection(bounds, width, height, options = {}) {
  const extent = normalizeMapBounds(bounds);
  if (!extent) throw new TypeError('createMapProjection requires finite X/Z bounds');
  const canvasWidth = Math.max(1, finite(width, 1));
  const canvasHeight = Math.max(1, finite(height, 1));
  const padding = Math.max(0, finite(options.padding, 24));
  const linearScale = Math.max(0.05, finite(options.linearScale, CITY_MAP_TUNING.linearScale));
  const usableWidth = Math.max(1, canvasWidth - padding * 2);
  const usableHeight = Math.max(1, canvasHeight - padding * 2);
  const scale = Math.min(usableWidth / extent.width, usableHeight / extent.depth) * linearScale;
  const drawWidth = extent.width * scale;
  const drawHeight = extent.depth * scale;
  const offsetX = (canvasWidth - drawWidth) * 0.5;
  const offsetY = (canvasHeight - drawHeight) * 0.5;
  return {
    bounds: extent, width: canvasWidth, height: canvasHeight,
    scale, drawWidth, drawHeight, offsetX, offsetY,
    project(value) {
      const point = pointOf(value);
      if (!point) return null;
      return {
        x: offsetX + (point.x - extent.minX) * scale,
        y: offsetY + (point.z - extent.minZ) * scale,
      };
    },
    unproject(x, y) {
      return {
        x: extent.minX + (finite(x) - offsetX) / scale,
        z: extent.minZ + (finite(y) - offsetY) / scale,
      };
    },
  };
}

/** Canvas rotation for the game's heading convention (PI means north/-Z). */
export function headingToMapRotation(heading) {
  return Math.PI - finite(heading, Math.PI);
}

/** Resolve the active pickup/drop-off without depending on the Orders class. */
export function resolveActiveMapTarget(orders) {
  const order = orders?.order;
  if (!order) return null;
  const state = orders.state;
  if (state === 'toPickup' || state === 'waiting') {
    const target = pointOf(order.rest?.point);
    if (!target) return null;
    return {
      state, leg: 'pickup', target, color: ALARM,
      nameKo: order.rest?.nameKo || '픽업 매장',
      nameEn: order.rest?.nameEn || 'PICKUP',
      stageKo: '픽업 경로', stageEn: 'ROUTE TO PICKUP',
    };
  }
  if (state === 'delivering' || state === 'dropWaiting') {
    const target = pointOf(order.dropoff);
    if (!target) return null;
    return {
      state, leg: 'dropoff', target, color: ALARM,
      nameKo: '고객 배달지', nameEn: 'CUSTOMER DROP-OFF',
      stageKo: '배달 경로', stageEn: 'ACTIVE DELIVERY ROUTE',
    };
  }
  return null;
}

/** Resolve either PlayerCharacter.playerPose or a lightweight pose object. */
export function resolvePlayerMapPose(player) {
  if (!player) return null;
  let pose = null;
  try { pose = player.playerPose || null; } catch { pose = null; }
  let position = pointOf(pose?.position);
  if (!position) {
    try { position = pointOf(player.activePosition); } catch { position = null; }
  }
  position ||= pointOf(player.position) || pointOf(player.phys?.meshPosition) || pointOf(player.phys?.position);
  if (!position) return null;
  let heading = Number(pose?.heading ?? player.heading);
  if (!Number.isFinite(heading) && player.phys?.quaternion) {
    const q = player.phys.quaternion;
    const x = 2 * (finite(q.x) * finite(q.z) + finite(q.w, 1) * finite(q.y));
    const z = 1 - 2 * (finite(q.x) ** 2 + finite(q.y) ** 2);
    heading = Math.atan2(x, z);
  }
  return { position, heading: Number.isFinite(heading) ? heading : Math.PI, driving: pose?.driving ?? player.isDriving ?? true };
}

function cssColor(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value;
  if (Number.isFinite(value)) return '#' + (value >>> 0).toString(16).padStart(6, '0').slice(-6);
  return fallback;
}

function trace(ctx, points, projection) {
  if (!points?.length) return false;
  let started = false;
  ctx.beginPath();
  for (const value of points) {
    const point = projection.project(value);
    if (!point) continue;
    if (!started) { ctx.moveTo(point.x, point.y); started = true; }
    else ctx.lineTo(point.x, point.y);
  }
  return started;
}

function distance2d(a, b) {
  return a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
}

function formatDistance(metres) {
  if (!Number.isFinite(metres)) return '—';
  return metres >= 1000 ? (metres / 1000).toFixed(metres >= 10000 ? 0 : 1) + ' km' : Math.round(metres) + ' m';
}

function niceDistance(raw) {
  const value = Math.max(1, raw);
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1;
  return nice * exponent;
}

function rectForDistrict(cell) {
  return normalizeMapBounds(cell?.bounds || cell);
}

function districtLabel(cell) {
  const id = cell?.id || cell?.districtId;
  if (!id) return null;
  const fallback = { ko: cell.nameKo || id, en: cell.nameEn || String(id).toUpperCase() };
  return { id, ...(DISTRICT_LABELS[id] || fallback) };
}

function shopName(site, orderShops) {
  const fromOrder = orderShops.get(site.id);
  const fallback = SHOP_LABELS[site.id] || { ko: site.id || '매장', en: String(site.id || 'SHOP').toUpperCase() };
  return {
    ko: site.nameKo || fromOrder?.nameKo || fallback.ko,
    en: site.nameEn || fromOrder?.nameEn || fallback.en,
  };
}

function overlaps(a, b, gap = 2) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

export class CityMap {
  constructor({
    city, orders = null, player = null, onToggle = null,
    linearScale = CITY_MAP_TUNING.linearScale,
    roadWidthScale = CITY_MAP_TUNING.roadWidthScale,
  } = {}) {
    if (typeof document === 'undefined') throw new Error('CityMap requires a browser document');
    if (!city?.roadGraph) throw new TypeError('CityMap requires city.roadGraph');
    this.city = city;
    this.orders = orders;
    this.player = player;
    this.onToggle = typeof onToggle === 'function' ? onToggle : null;
    this.linearScale = Math.max(0.05, finite(linearScale, CITY_MAP_TUNING.linearScale));
    this.roadWidthScale = Math.max(0.1, finite(roadWidthScale, CITY_MAP_TUNING.roadWidthScale));
    this._open = false;
    this._raf = 0;
    this._lastFrame = 0;
    this._width = 0;
    this._height = 0;
    this._dpr = 1;
    this._previousFocus = null;
    this._fallbackRoute = null;
    this._fallbackRouteKey = '';

    this.root = document.createElement('div');
    this.root.className = 'ssa-city-map';
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML =
      '<style>' + CSS + '</style>' +
      '<div class="ssa-city-map__veil" data-map-close></div>' +
      '<section class="ssa-city-map__dialog" role="dialog" aria-modal="true" aria-labelledby="ssa-city-map-title" tabindex="-1">' +
        '<header class="ssa-city-map__header">' +
          '<div class="ssa-city-map__stripe"></div>' +
          '<div><div class="ssa-city-map__kicker">서울 스낵 어택 · CITY NAVIGATION</div>' +
          '<h2 class="ssa-city-map__title" id="ssa-city-map-title">서울 전역 지도<small>FULL CITY MAP</small></h2></div>' +
          '<div class="ssa-city-map__north"><i></i>북쪽 고정 · NORTH UP</div>' +
          '<button class="ssa-city-map__close" type="button" aria-label="지도 닫기 · Close full city map" aria-keyshortcuts="M Escape" data-map-close>' +
            '<span>지도 닫기 · CLOSE</span><kbd>M</kbd>' +
          '</button>' +
        '</header>' +
        '<div class="ssa-city-map__body">' +
          '<div class="ssa-city-map__canvas-wrap">' +
            '<canvas class="ssa-city-map__canvas" role="img" aria-label="서울 전체 도로, 상점, 배달 경로와 현재 위치 · Full Seoul road map, shops, delivery route and current position">' +
              '서울 전체 지도 · Full Seoul city map' +
            '</canvas>' +
            '<div class="ssa-city-map__compass" aria-hidden="true">N</div>' +
          '</div>' +
          '<aside class="ssa-city-map__side">' +
            '<div class="ssa-city-map__side-top">' +
              '<div><div class="ssa-city-map__eyebrow">현재 임무 · CURRENT JOB</div>' +
                '<div class="ssa-city-map__stage" data-stage-ko>대기 중</div>' +
                '<div class="ssa-city-map__stage-en" data-stage-en>NO ACTIVE DELIVERY</div></div>' +
              '<div class="ssa-city-map__target" data-target-box><strong data-target-ko>도시 탐색</strong><span data-target-en>FREE ROAM</span></div>' +
            '</div>' +
            '<div class="ssa-city-map__metrics">' +
              '<div class="ssa-city-map__metric"><span>직선 거리 · RANGE</span><strong data-range>—</strong></div>' +
              '<div class="ssa-city-map__metric"><span>경로 거리 · ROUTE</span><strong data-route>—</strong></div>' +
              '<div class="ssa-city-map__metric"><span>현재 구역 · DISTRICT</span><strong data-district>—</strong></div>' +
              '<div class="ssa-city-map__metric"><span>도로망 · NETWORK</span><strong data-network>—</strong></div>' +
            '</div>' +
            '<section class="ssa-city-map__section"><h3>지도 범례 · MAP LEGEND</h3>' +
              '<div class="ssa-city-map__legend">' +
                '<div><i class="ssa-city-map__symbol route"></i><span>배달 경로<small>ACTIVE ROUTE</small></span></div>' +
                '<div><i class="ssa-city-map__symbol target"></i><span>현재 목적지<small>CURRENT TARGET</small></span></div>' +
                '<div><i class="ssa-city-map__symbol shop"></i><span>야식 매장<small>SNACK SHOP</small></span></div>' +
                '<div><i class="ssa-city-map__symbol anchor"></i><span>배달 가능 지점<small>DELIVERY ANCHOR</small></span></div>' +
              '</div>' +
            '</section>' +
            '<section class="ssa-city-map__section"><h3>서울 구역 · SEOUL DISTRICTS</h3><div class="ssa-city-map__districts" data-districts>—</div></section>' +
          '</aside>' +
        '</div>' +
        '<footer class="ssa-city-map__footer"><span><strong>M</strong> 지도 전환 · TOGGLE MAP</span><span>북쪽 고정 · NORTH-UP GPS</span></footer>' +
      '</section>';
    document.body.appendChild(this.root);

    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.dialog = this.root.querySelector('.ssa-city-map__dialog');
    this.closeButton = this.root.querySelector('.ssa-city-map__close');
    this.$ = {
      stageKo: this.root.querySelector('[data-stage-ko]'),
      stageEn: this.root.querySelector('[data-stage-en]'),
      targetBox: this.root.querySelector('[data-target-box]'),
      targetKo: this.root.querySelector('[data-target-ko]'),
      targetEn: this.root.querySelector('[data-target-en]'),
      range: this.root.querySelector('[data-range]'),
      route: this.root.querySelector('[data-route]'),
      district: this.root.querySelector('[data-district]'),
      network: this.root.querySelector('[data-network]'),
      districts: this.root.querySelector('[data-districts]'),
    };

    this._onClose = () => this.hide();
    this._onKeyDown = (event) => {
      if (this._open && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.hide();
        return;
      }
      if (this._open && event.key === 'Tab') {
        event.preventDefault();
        this.closeButton.focus();
      }
    };
    this._onResize = () => { if (this._open) this.update(); };
    for (const control of this.root.querySelectorAll('[data-map-close]')) control.addEventListener('click', this._onClose);
    window.addEventListener('keydown', this._onKeyDown, true);
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._onResize);
      this._resizeObserver.observe(this.canvas);
    } else {
      window.addEventListener('resize', this._onResize);
    }
    this._frame = (time) => {
      this._raf = 0;
      if (!this._open) return;
      if (time - this._lastFrame >= 32) {
        this._lastFrame = time;
        this.update();
      }
      this._scheduleFrame();
    };
  }

  get isOpen() { return this._open; }

  show() {
    if (this._open) return false;
    this._open = true;
    this._previousFocus = document.activeElement;
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    this.onToggle?.(true, this);
    requestAnimationFrame(() => {
      if (!this._open) return;
      this.update();
      this.closeButton.focus({ preventScroll: true });
    });
    this._scheduleFrame();
    return true;
  }

  hide() {
    if (!this._open) return false;
    this._open = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.onToggle?.(false, this);
    if (this._previousFocus?.isConnected && typeof this._previousFocus.focus === 'function') {
      this._previousFocus.focus({ preventScroll: true });
    }
    this._previousFocus = null;
    return true;
  }

  toggle(force) {
    const next = typeof force === 'boolean' ? force : !this._open;
    if (next) this.show(); else this.hide();
    return this._open;
  }

  _scheduleFrame() {
    if (!this._open || this._raf || typeof requestAnimationFrame !== 'function') return;
    this._raf = requestAnimationFrame(this._frame);
  }

  _resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(2, Math.max(1, finite(window.devicePixelRatio, 1)));
    if (width === this._width && height === this._height && dpr === this._dpr) return;
    this._width = width; this._height = height; this._dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  _routeFor(active, pose) {
    if (!active || !pose) {
      this._fallbackRoute = null;
      this._fallbackRouteKey = '';
      return null;
    }
    const live = this.orders?.route;
    const liveEnd = pointOf(live?.polyline?.at?.(-1) || live?.polyline?.[live?.polyline?.length - 1]);
    if (live?.polyline?.length && distance2d(liveEnd, active.target) < 12) {
      this._fallbackRoute = null;
      this._fallbackRouteKey = '';
      return live;
    }
    // Opening the map normally pauses movement. Cache the uncommon fallback so
    // a route that Orders has not produced yet is not rebuilt on every pulse.
    const key = [
      active.leg, active.target.x.toFixed(1), active.target.z.toFixed(1),
      pose.position.x.toFixed(0), pose.position.z.toFixed(0),
    ].join(':');
    if (key === this._fallbackRouteKey) return this._fallbackRoute;
    this._fallbackRouteKey = key;
    try { this._fallbackRoute = this.city.findRoute?.(pose.position, active.target) || null; }
    catch { this._fallbackRoute = null; }
    return this._fallbackRoute;
  }

  _shops() {
    const orderShops = new Map((this.orders?.restaurants || []).map((shop) => [shop.id, shop]));
    const source = this.city.pickupSites?.length
      ? this.city.pickupSites
      : (this.city.expanseData?.shops || this.orders?.restaurants || []);
    return source.map((site) => {
      const position = pointOf(site);
      if (!position) return null;
      return { ...site, position, ...shopName(site, orderShops) };
    }).filter(Boolean);
  }

  _currentDistrict(pose, districts) {
    if (!pose) return null;
    const matches = [];
    for (const cell of districts) {
      const bounds = rectForDistrict(cell);
      const label = districtLabel(cell);
      if (!bounds || !label) continue;
      if (pose.position.x >= bounds.minX && pose.position.x <= bounds.maxX && pose.position.z >= bounds.minZ && pose.position.z <= bounds.maxZ) {
        matches.push({ ...label, area: bounds.width * bounds.depth });
      }
    }
    matches.sort((a, b) => a.area - b.area);
    return matches[0] || null;
  }

  _drawBackground(ctx, projection) {
    const width = this._width, height = this._height;
    const gradient = ctx.createRadialGradient(width * .5, height * .48, 0, width * .5, height * .48, Math.max(width, height) * .7);
    gradient.addColorStop(0, '#111f2a'); gradient.addColorStop(1, '#050910');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);

    const step = niceDistance(95 / projection.scale);
    ctx.save(); ctx.strokeStyle = 'rgba(77,200,255,.065)'; ctx.lineWidth = 1;
    const b = projection.bounds;
    for (let x = Math.ceil(b.minX / step) * step; x <= b.maxX; x += step) {
      const a = projection.project({ x, z: b.minZ }); const c = projection.project({ x, z: b.maxZ });
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
    for (let z = Math.ceil(b.minZ / step) * step; z <= b.maxZ; z += step) {
      const a = projection.project({ x: b.minX, z }); const c = projection.project({ x: b.maxX, z });
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
    ctx.restore();
  }

  _drawDistricts(ctx, projection, districts) {
    for (let i = 0; i < districts.length; i++) {
      const cell = districts[i];
      const bounds = rectForDistrict(cell);
      if (!bounds) continue;
      const topLeft = projection.project({ x: bounds.minX, z: bounds.minZ });
      ctx.save(); ctx.globalAlpha = cell.id ? .22 : .1;
      ctx.fillStyle = cssColor(cell.color, i % 2 ? '#26394a' : '#20303e');
      ctx.fillRect(topLeft.x, topLeft.y, bounds.width * projection.scale, bounds.depth * projection.scale);
      ctx.strokeStyle = 'rgba(238,244,255,.16)'; ctx.lineWidth = 1;
      ctx.strokeRect(topLeft.x, topLeft.y, bounds.width * projection.scale, bounds.depth * projection.scale);
      ctx.restore();
    }

    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const cell of districts) {
      const bounds = rectForDistrict(cell); const label = districtLabel(cell);
      if (!bounds || !label || bounds.width < 1 || bounds.depth < 1) continue;
      const center = projection.project({ x: (bounds.minX + bounds.maxX) * .5, z: (bounds.minZ + bounds.maxZ) * .5 });
      ctx.font = '800 12px Inter, Segoe UI, sans-serif'; ctx.fillStyle = 'rgba(238,244,255,.22)';
      ctx.fillText(label.ko, center.x, center.y - 5);
      ctx.font = '700 7px Inter, Segoe UI, sans-serif'; ctx.fillStyle = 'rgba(238,244,255,.15)';
      ctx.fillText(label.en, center.x, center.y + 7);
    }
    ctx.restore();
  }

  _drawExpanseMasses(ctx, projection) {
    const layout = this.city.expanseData?.layout;
    const river = layout?.river;
    if (river) {
      const centerline = river.centerline || river.points;
      if (Array.isArray(centerline) && centerline.length > 1) {
        const averageWidth = finite(
          river.width,
          Number.isFinite(river.widthMin) && Number.isFinite(river.widthMax)
            ? (river.widthMin + river.widthMax) * 0.5
            : finite(river.widthMetres, 74),
        );
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (trace(ctx, centerline, projection)) {
          ctx.strokeStyle = 'rgba(22,126,153,.46)';
          ctx.lineWidth = Math.max(2, averageWidth * projection.scale);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(77,200,255,.34)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        const labelPoint = projection.project(centerline[Math.floor(centerline.length / 2)]);
        if (labelPoint) {
          ctx.fillStyle = 'rgba(238,244,255,.42)';
          ctx.font = '750 8px Inter, Segoe UI, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('한강 · HAN RIVER', labelPoint.x, labelPoint.y + 3);
        }
        ctx.restore();
      } else {
      const bounds = normalizeMapBounds(river);
      if (bounds) {
        const point = projection.project({ x: bounds.minX, z: bounds.minZ });
        const water = ctx.createLinearGradient(0, point.y, 0, point.y + bounds.depth * projection.scale);
        water.addColorStop(0, 'rgba(19,102,124,.48)'); water.addColorStop(.5, 'rgba(34,153,178,.36)'); water.addColorStop(1, 'rgba(12,74,96,.5)');
        ctx.fillStyle = water; ctx.fillRect(point.x, point.y, bounds.width * projection.scale, bounds.depth * projection.scale);
        ctx.strokeStyle = 'rgba(77,200,255,.35)'; ctx.lineWidth = 1; ctx.strokeRect(point.x, point.y, bounds.width * projection.scale, bounds.depth * projection.scale);
        ctx.save(); ctx.fillStyle = 'rgba(238,244,255,.42)'; ctx.font = '750 8px Inter, Segoe UI, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('한강 · HAN RIVER', point.x + bounds.width * projection.scale * .5, point.y + bounds.depth * projection.scale * .5 + 3); ctx.restore();
      }
      }
    }
    for (const block of layout?.buildingBlocks || []) {
      const corner = projection.project({ x: finite(block.x) - finite(block.sx) * .5, z: finite(block.z) - finite(block.sz) * .5 });
      const width = Math.max(1, finite(block.sx) * projection.scale);
      const height = Math.max(1, finite(block.sz) * projection.scale);
      ctx.fillStyle = 'rgba(3,6,10,.72)'; ctx.fillRect(corner.x, corner.y, width, height);
      ctx.strokeStyle = 'rgba(238,244,255,.19)'; ctx.lineWidth = 1; ctx.strokeRect(corner.x, corner.y, width, height);
    }
  }

  _drawRoads(ctx, projection, graph) {
    const edges = graph.edges || [];
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const edge of edges) {
      const roadPx = Math.max(2.2, finite(edge.width, finite(graph.roadWidth, 8)) * projection.scale * this.roadWidthScale);
      if (!trace(ctx, edge.points, projection)) continue;
      ctx.strokeStyle = 'rgba(1,4,8,.96)'; ctx.lineWidth = roadPx + 4; ctx.stroke();
    }
    for (const edge of edges) {
      const roadPx = Math.max(2.2, finite(edge.width, finite(graph.roadWidth, 8)) * projection.scale * this.roadWidthScale);
      if (!trace(ctx, edge.points, projection)) continue;
      ctx.strokeStyle = edge.kind === 'ring' ? 'rgba(201,216,226,.94)' : 'rgba(177,198,211,.88)';
      ctx.lineWidth = roadPx; ctx.stroke();
      if (roadPx >= 8 && edge.kind === 'ring') {
        ctx.strokeStyle = 'rgba(8,15,22,.38)'; ctx.lineWidth = Math.max(1, roadPx * .08); ctx.setLineDash([7, 7]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  _drawAnchors(ctx, projection) {
    ctx.save();
    for (const anchor of this.city.deliveryAnchors || []) {
      const p = projection.project(anchor.point || anchor.position || anchor);
      if (!p) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(5,10,16,.88)'; ctx.fill();
      ctx.strokeStyle = 'rgba(238,244,255,.58)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  _drawRoute(ctx, projection, route) {
    if (!route?.polyline?.length) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (trace(ctx, route.polyline, projection)) {
      ctx.strokeStyle = 'rgba(2,7,12,.9)'; ctx.lineWidth = 10; ctx.stroke();
      ctx.shadowColor = NAV; ctx.shadowBlur = 13; ctx.strokeStyle = NAV; ctx.lineWidth = 5; ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(238,244,255,.76)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.restore();
  }

  _drawShops(ctx, projection, shops, active) {
    const labels = [];
    const activeId = active?.leg === 'pickup' ? this.orders?.order?.rest?.id : null;
    ctx.save();
    for (const shop of shops) {
      const p = projection.project(shop.position); if (!p) continue;
      const selected = shop.id === activeId;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = selected ? 'rgba(255,45,120,.9)' : 'rgba(8,18,27,.94)';
      ctx.strokeStyle = selected ? ALARM : NAV; ctx.lineWidth = selected ? 2.5 : 1.8;
      ctx.shadowColor = selected ? ALARM : NAV; ctx.shadowBlur = selected ? 11 : 6;
      ctx.fillRect(-5, -5, 10, 10); ctx.strokeRect(-5, -5, 10, 10); ctx.restore();

      ctx.font = '750 10px Inter, Segoe UI, sans-serif';
      const koWidth = ctx.measureText(shop.ko).width;
      ctx.font = '700 7px Inter, Segoe UI, sans-serif';
      const enWidth = ctx.measureText(shop.en).width;
      const width = Math.ceil(Math.max(koWidth, enWidth) + 12), height = 27;
      const candidates = [
        { x: p.x + 9, y: p.y - height - 4 }, { x: p.x + 9, y: p.y + 4 },
        { x: p.x - width - 9, y: p.y - height - 4 }, { x: p.x - width - 9, y: p.y + 4 },
      ];
      let rect = candidates.find((candidate) => candidate.x >= 3 && candidate.y >= 3 && candidate.x + width <= this._width - 3 && candidate.y + height <= this._height - 3 && !labels.some((other) => overlaps({ ...candidate, w: width, h: height }, other)));
      rect ||= { ...candidates[0] };
      labels.push({ ...rect, w: width, h: height, shop, selected });
    }
    for (const label of labels) {
      ctx.fillStyle = 'rgba(5,9,15,.88)'; ctx.fillRect(label.x, label.y, label.w, label.h);
      ctx.strokeStyle = label.selected ? 'rgba(255,45,120,.75)' : 'rgba(77,200,255,.28)'; ctx.lineWidth = 1; ctx.strokeRect(label.x + .5, label.y + .5, label.w - 1, label.h - 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = '750 10px Inter, Segoe UI, sans-serif'; ctx.fillStyle = INK; ctx.fillText(label.shop.ko, label.x + 6, label.y + 4);
      ctx.font = '700 7px Inter, Segoe UI, sans-serif'; ctx.fillStyle = 'rgba(238,244,255,.48)'; ctx.fillText(label.shop.en, label.x + 6, label.y + 16);
    }
    ctx.restore();
  }

  _drawTarget(ctx, projection, active, time) {
    if (!active) return;
    const p = projection.project(active.target); if (!p) return;
    const pulse = 1 + Math.sin(time / 220) * .16;
    ctx.save(); ctx.translate(p.x, p.y); ctx.shadowColor = active.color; ctx.shadowBlur = 17;
    ctx.beginPath(); ctx.arc(0, 0, 12 * pulse, 0, Math.PI * 2); ctx.strokeStyle = active.color; ctx.globalAlpha = .38; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fillStyle = active.color; ctx.fill();
    ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill(); ctx.restore();
  }

  _drawPlayer(ctx, projection, pose) {
    if (!pose) return;
    const p = projection.project(pose.position); if (!p) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(headingToMapRotation(pose.heading));
    ctx.shadowColor = NAV; ctx.shadowBlur = 15;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 5); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fillStyle = INK; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#087da5'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
  }

  _drawScaleAndBounds(ctx, projection) {
    const b = projection.bounds;
    const topLeft = projection.project({ x: b.minX, z: b.minZ });
    ctx.save(); ctx.strokeStyle = 'rgba(77,200,255,.24)'; ctx.lineWidth = 1;
    ctx.strokeRect(topLeft.x, topLeft.y, projection.drawWidth, projection.drawHeight);
    const metres = niceDistance(110 / projection.scale);
    const pixels = metres * projection.scale;
    const x = Math.max(18, topLeft.x), y = Math.min(this._height - 17, topLeft.y + projection.drawHeight + 20);
    ctx.strokeStyle = 'rgba(238,244,255,.68)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + pixels, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.moveTo(x + pixels, y - 4); ctx.lineTo(x + pixels, y + 4); ctx.stroke();
    ctx.font = '700 9px Inter, Segoe UI, sans-serif'; ctx.fillStyle = 'rgba(238,244,255,.62)'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(formatDistance(metres), x, y - 6); ctx.restore();
  }

  _updateReadout(graph, districts, pose, active, route) {
    const district = this._currentDistrict(pose, districts);
    this.$.stageKo.textContent = active?.stageKo || '대기 중';
    this.$.stageEn.textContent = active?.stageEn || 'NO ACTIVE DELIVERY';
    this.$.targetKo.textContent = active?.nameKo || '도시 탐색';
    this.$.targetEn.textContent = active?.nameEn || 'FREE ROAM';
    this.$.targetBox.classList.toggle('is-active', !!active);
    this.$.range.textContent = active && pose ? formatDistance(distance2d(pose.position, active.target)) : '—';
    this.$.route.textContent = active ? formatDistance(route?.distance) : '—';
    this.$.district.textContent = district ? district.ko : '서울';
    this.$.network.textContent = (graph.nodes?.length || 0) + ' 교차로 · ' + (graph.edges?.length || 0) + ' ROADS';
    const semantic = districts.map(districtLabel).filter(Boolean);
    this.$.districts.textContent = semantic.length ? semantic.map((item) => item.ko + ' · ' + item.en).join('  /  ') : '서울 전역 · GREATER SEOUL';
  }

  update() {
    if (!this._open || !this.ctx) return false;
    this._resizeCanvas();
    const graph = this.city.roadGraph;
    const bounds = normalizeMapBounds(this.city.bounds || graph.bounds);
    if (!bounds) return false;
    const projection = createMapProjection(bounds, this._width, this._height, { padding: 22, linearScale: this.linearScale });
    const districts = graph.districts || [];
    const pose = resolvePlayerMapPose(this.player);
    const active = resolveActiveMapTarget(this.orders);
    const route = this._routeFor(active, pose);
    const shops = this._shops();
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const ctx = this.ctx;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, this._width, this._height);
    this._drawBackground(ctx, projection);
    this._drawDistricts(ctx, projection, districts);
    this._drawExpanseMasses(ctx, projection);
    this._drawRoads(ctx, projection, graph);
    this._drawAnchors(ctx, projection);
    this._drawRoute(ctx, projection, route);
    this._drawShops(ctx, projection, shops, active);
    this._drawTarget(ctx, projection, active, now);
    this._drawPlayer(ctx, projection, pose);
    this._drawScaleAndBounds(ctx, projection);
    this._updateReadout(graph, districts, pose, active, route);
    return true;
  }

  dispose() {
    const wasOpen = this._open;
    if (wasOpen) this.hide();
    else if (this._raf) cancelAnimationFrame(this._raf);
    for (const control of this.root.querySelectorAll('[data-map-close]')) control.removeEventListener('click', this._onClose);
    window.removeEventListener('keydown', this._onKeyDown, true);
    this._resizeObserver?.disconnect();
    if (!this._resizeObserver) window.removeEventListener('resize', this._onResize);
    this.root.remove();
    this.ctx = null;
    return wasOpen;
  }
}

export default CityMap;
