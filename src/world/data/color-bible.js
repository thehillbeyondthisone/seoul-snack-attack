// Seoul Delivery — colour bible.
//
// Art-direction source of truth for the procedural city. No three.js, so Node
// checks and the colour-bible page can import it. Operational night/day lighting
// still lives in src/world/lighting.js; the STAGE numbers here are the same
// hexes, written down so a district palette cannot invent a fourth HUD accent
// or a fog colour that fights the sky.
//
// The HUD already locked three jobs (hud3.js): GOLD is money, CYAN is
// navigation, PINK is urgency. The city teaches those jobs: market streets
// run gold, the canal runs cyan, Hongdae runs pink. A fourth hue is allowed
// only as a local neon, never as a system colour.

/** Hex number → #rrggbb. */
export function cssHex(hex) {
  return `#${(hex >>> 0).toString(16).padStart(6, '0')}`;
}

/** The three HUD accents. Do not add a fourth system colour. */
export const HUD = {
  ink: 0xeef4ff,
  money: 0xffd35c,
  nav: 0x4dc8ff,
  alarm: 0xff2d78,
  panel: 0x080b12,
};

/**
 * Night stage — copied from the tuned NIGHT rig in lighting.js so the
 * procedural city and the authored block share a sky.
 */
export const STAGE = {
  fog: 0x121a30,
  hemiSky: 0x3a4a78,
  hemiGround: 0x14171f,
  ambient: 0x1e2740,
  key: 0x8fa8e0,
  background: 0x05080f,
};

/** Wet-street surfaces. Readability at speed depends on these more than facades. */
export const SURFACES = {
  asphalt: 0x0c1018,
  asphaltMark: 0xc8d2dc,
  asphaltCenter: 0xffd35c,
  sidewalk: 0x3a3d42,
  kerb: 0xc8c4b8,
  plaza: 0x2a2e34,
  canal: 0x0a2a32,
  canalWall: 0x5a6168,
  barrier: 0x8a9098,
  roof: 0x1a1d22,
  metal: 0x2a2e33,
};

/** Neon kit. Magenta/cyan/gold are the HUD accents; the rest are local only. */
export const NEON = {
  magenta: 0xff2d78,
  cyan: 0x4dc8ff,
  gold: 0xffd35c,
  lime: 0x7dff6a,
  orange: 0xff8a2a,
  violet: 0xb46cff,
  warmWhite: 0xfff4d8,
  red: 0xff3b2e,
};

/**
 * Facade paints. Desaturated on purpose: they multiply a weathered plaster
 * texture, and anything punchier reads as coloured light rather than paint.
 */
export const PAINT = {
  plaster: 0xe8d6c4,
  concrete: 0xc5ccd4,
  terracotta: 0xc9896a,
  jade: 0x8fbfa8,
  mauve: 0xb89aa8,
  cream: 0xe4d6a8,
  charcoal: 0x3a3f48,
  nightPlaster: 0x4a4450,
  shopBrown: 0x2a2420,
  shopTeal: 0x1a2830,
  shopRed: 0x3a1818,
  shopGold: 0x2a2418,
};

/**
 * The six neighbourhoods. `index` is what the road graph stores on edges so
 * createDeliveryAnchors can spread pickups. `mapFill` is the mini-map colour.
 * Heights are metres of building, not storeys.
 */
export const DISTRICTS = [
  {
    id: 'hills',
    index: 0,
    nameKo: '북악',
    nameEn: 'Bukak Hills',
    role: 'Quiet north landmark. Cool mercury lamps, cream plaster, fewer signs. You know you are north when the neon drops away.',
    facades: [PAINT.cream, PAINT.concrete, PAINT.jade, PAINT.mauve],
    shops: [PAINT.shopTeal, PAINT.shopBrown, 0x243028],
    neon: [NEON.warmWhite, NEON.gold, NEON.lime],
    lamp: 0xcfe0ff,
    glow: 0x9dc0ff,
    mapFill: 'rgba(40,58,62,.92)',
    height: [8, 16],
    shopChance: 0.42,
    signChance: 0.35,
  },
  {
    id: 'hongdae',
    index: 1,
    nameKo: '홍대',
    nameEn: 'Hongdae Neon',
    role: 'Entertainment maze. Tight streets, magenta/cyan, signs on every lintel. The district the HUD pink is sampled from.',
    facades: [PAINT.nightPlaster, PAINT.charcoal, PAINT.mauve, PAINT.plaster],
    shops: [PAINT.shopRed, 0x1a1018, PAINT.shopBrown],
    neon: [NEON.magenta, NEON.cyan, NEON.violet, NEON.lime],
    lamp: 0xffa6c8,
    glow: 0xff4d8d,
    mapFill: 'rgba(62,28,48,.92)',
    height: [10, 22],
    shopChance: 1,
    signChance: 1,
  },
  {
    id: 'station',
    index: 2,
    nameKo: '서울역 가로',
    nameEn: 'Station Boulevard',
    role: 'The speed street. Wide sodium carriageway, taller massing, warm white shop light. Long sightlines for a Crazy Taxi run.',
    facades: [PAINT.concrete, PAINT.charcoal, PAINT.plaster, 0x9aa3ad],
    shops: [PAINT.shopBrown, PAINT.shopGold, 0x202428],
    neon: [NEON.warmWhite, NEON.gold, NEON.orange],
    lamp: 0xffb46a,
    glow: 0xff9a4a,
    mapFill: 'rgba(48,40,28,.92)',
    height: [14, 28],
    shopChance: 0.78,
    signChance: 0.7,
  },
  {
    id: 'market',
    index: 3,
    nameKo: '시장',
    nameEn: 'Night Market',
    role: 'Amber canopy and a driveable plaza. Gold is money and this street. Cut through the square instead of taking the long way.',
    facades: [PAINT.terracotta, PAINT.cream, PAINT.plaster, 0xd4b48a],
    shops: [PAINT.shopGold, 0x3a2010, PAINT.shopBrown],
    neon: [NEON.gold, NEON.orange, NEON.red, NEON.warmWhite],
    lamp: 0xffd7a0,
    glow: 0xffb238,
    mapFill: 'rgba(58,46,22,.92)',
    height: [8, 16],
    shopChance: 0.92,
    signChance: 0.85,
  },
  {
    id: 'hangang',
    index: 4,
    nameKo: '한강',
    nameEn: 'Hangang Canal',
    role: 'The south water. Cyan lamps, teal plaster, three bridges. The HUD nav colour lives here so the canal is always the compass.',
    facades: [PAINT.jade, PAINT.concrete, 0x7a9aa8, PAINT.plaster],
    shops: [PAINT.shopTeal, 0x102028, PAINT.shopBrown],
    neon: [NEON.cyan, NEON.lime, NEON.warmWhite],
    lamp: 0xa8e8ff,
    glow: 0x4dc8ff,
    mapFill: 'rgba(22,48,58,.92)',
    height: [10, 18],
    shopChance: 0.7,
    signChance: 0.6,
  },
  {
    id: 'pocha',
    index: 5,
    nameKo: '포차골목',
    nameEn: 'Pocha Alley',
    role: 'Low, dense, red. South-east of the canal. Tight turns after the bridge, orange practicals, the smell of the order.',
    facades: [PAINT.terracotta, PAINT.nightPlaster, PAINT.charcoal, 0x6a4038],
    shops: [PAINT.shopRed, 0x2a1010, PAINT.shopGold],
    neon: [NEON.red, NEON.orange, NEON.gold, NEON.magenta],
    lamp: 0xff8a4a,
    glow: 0xff5a2a,
    mapFill: 'rgba(58,30,24,.92)',
    height: [8, 14],
    shopChance: 0.95,
    signChance: 0.9,
  },
];

export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));
export const DISTRICT_BY_INDEX = Object.fromEntries(DISTRICTS.map((d) => [d.index, d]));

/**
 * Asian shop-pack pages. Ground-floor labels. The source atlas is packed with
 * mixed UV orientation, which is how a real Hong Kong/Seoul strip looks at
 * speed — you read colour and Hangul rhythm, not a single word.
 */
export const SHOP_PACK = [
  { id: 'shop-1', file: 'shop-1.png', note: 'Bank-green / violet fascia' },
  { id: 'shop-2', file: 'shop-2.png', note: 'Red gold vertical banners' },
  { id: 'shop-3', file: 'shop-3.png', note: 'Ginseng / dessert / pawn strip' },
  { id: 'shop-4', file: 'shop-4.png', note: 'Travel / wooden door / shutter' },
  { id: 'shop-5', file: 'shop-5.png', note: 'Bakery / florist / gold fascia' },
];

export const SHOP_PACK_DIR = 'assets/district/shop-pack';

/** 3D hanging signs from the already-built Korean signage pack. */
export const HANGING_SIGNS = [
  { node: 'signage_001', scale: 1.4 },
  { node: 'signage_004', scale: 1.4 },
  { node: 'signage_005', scale: 1.4 },
  { node: 'signage_008', scale: 1.35 },
  { node: 'signage_009', scale: 1.4 },
  { node: 'signage_010', scale: 1.4 },
];

/** Pickup shops that must be readable from a moving van. */
export const LANDMARK_SHOPS = [
  { id: 'hongru', district: 'hongdae', neon: NEON.magenta },
  { id: 'bhc', district: 'hongdae', neon: NEON.orange },
  { id: 'jokbal', district: 'pocha', neon: NEON.red },
  { id: 'bingsu', district: 'station', neon: NEON.cyan },
  { id: 'pizzamaru', district: 'market', neon: NEON.gold },
  { id: 'budae', district: 'hangang', neon: NEON.lime },
];

export function districtAt(x, z) {
  if (z < -70) return DISTRICT_BY_ID.hills;
  if (z > 40) return x < 0 ? DISTRICT_BY_ID.hangang : DISTRICT_BY_ID.pocha;
  if (x < -28) return DISTRICT_BY_ID.hongdae;
  if (x > 28) return DISTRICT_BY_ID.market;
  return DISTRICT_BY_ID.station;
}

export function pick(list, rng) {
  return list[Math.floor(rng() * list.length) % list.length];
}
