// Seoul Snack Attack — colour bible.
//
// Art-direction source of truth for the procedural city. No three.js, so Node
// checks and the colour-bible page can import it. Operational night/day lighting
// still lives in src/world/lighting.js; the STAGE numbers here are the target
// hexes for that rig, written down so a district palette cannot invent a fourth
// HUD accent or a fog colour that fights the sky. This fork retunes the stage
// from the parent's blue storm night to an amber sodium haze over a food
// alley — lighting.js should adopt these values in its own slice.
//
// The HUD already locked three jobs (hud3.js): GOLD is money, CYAN is
// navigation, ALARM is urgency. The city teaches those jobs as food: the
// market runs banana-milk gold like a payout, the canal runs fish-cake broth
// teal like a compass, Tteokbokki Alley runs gochujang red-orange. A fourth
// hue is allowed only as a local neon, never as a system colour.

/** Hex number → #rrggbb. */
export function cssHex(hex) {
  return `#${(hex >>> 0).toString(16).padStart(6, '0')}`;
}

/** The three HUD accents. Do not add a fourth system colour. */
export const HUD = {
  ink: 0xfff2e0,
  money: 0xffd873,
  nav: 0x3fd2e6,
  alarm: 0xff4d26,
  panel: 0x120b08,
};

/**
 * Night stage target — an amber sodium haze over a food alley, warmer than
 * the parent's blue storm night but still dark enough for neon to pop.
 * Mirror these into the NIGHT preset in src/world/lighting.js.
 */
export const STAGE = {
  fog: 0x1e150c,
  hemiSky: 0x54402a,
  hemiGround: 0x191410,
  ambient: 0x2c2115,
  key: 0xd8a25e,
  background: 0x0a0603,
};

/** Wet-street surfaces. Readability at speed depends on these more than facades. */
export const SURFACES = {
  asphalt: 0x141009,
  asphaltMark: 0xe0d8c4,
  asphaltCenter: 0xffd873,
  sidewalk: 0x403a30,
  kerb: 0xcfc0a8,
  plaza: 0x332c22,
  canal: 0x0a2e2a,
  canalWall: 0x635a4c,
  barrier: 0x948a7c,
  roof: 0x1e1a14,
  metal: 0x302a24,
};

/**
 * Neon kit. Cyan/gold/red carry the HUD accents (broth teal, banana-milk gold,
 * gochujang red); the rest are local only — strawberry-milk pink, seaweed
 * green, hotteok caramel, grape soda, broth-steam white.
 */
export const NEON = {
  magenta: 0xff85b5,
  cyan: 0x3fd2e6,
  gold: 0xffd873,
  lime: 0x5fd068,
  orange: 0xff9a3d,
  violet: 0xb46cff,
  warmWhite: 0xffedd0,
  red: 0xff4d26,
};

/**
 * Facade paints. Desaturated on purpose: they multiply a weathered plaster
 * texture, and anything punchier reads as coloured light rather than paint.
 * Warm neutrals — old brick, tea-house greens, toasted creams.
 */
export const PAINT = {
  plaster: 0xecdcc2,
  concrete: 0xcbcbc2,
  terracotta: 0xd08f60,
  jade: 0x93c2a4,
  mauve: 0xbb9aa6,
  cream: 0xe9dcab,
  charcoal: 0x39362e,
  nightPlaster: 0x4c453a,
  shopBrown: 0x2b241d,
  shopTeal: 0x18282a,
  shopRed: 0x3a1818,
  shopGold: 0x2a2418,
};

/**
 * The six neighbourhoods. `index` is what the road graph stores on edges so
 * createDeliveryAnchors can spread pickups. `mapFill` is the mini-map colour.
 * Heights are metres of building, not storeys. Each district reads as a food
 * street while keeping its geographic role from districtAt().
 */
export const DISTRICTS = [
  {
    id: 'hills',
    index: 0,
    nameKo: '북악 산책',
    nameEn: 'Bukak Ridge',
    role: 'Quiet north landmark. Tea houses and toast shops under paper-lantern lamps, fewer signs. You know you are north when the neon thins and the air smells like barley tea.',
    facades: [PAINT.cream, PAINT.concrete, PAINT.jade, PAINT.mauve],
    shops: [PAINT.shopTeal, PAINT.shopBrown, 0x2a2c22],
    neon: [NEON.warmWhite, NEON.gold, NEON.lime],
    lamp: 0xf2e2bc,
    glow: 0xd8bd85,
    mapFill: 'rgba(56,52,38,.92)',
    height: [8, 16],
    shopChance: 0.42,
    signChance: 0.35,
  },
  {
    id: 'hongdae',
    index: 1,
    nameKo: '떡볶이 골목',
    nameEn: 'Tteokbokki Alley',
    role: 'Entertainment maze turned snack row. Tight streets under gochujang-red neon, sauce-gloss signs on every lintel. The HUD alarm colour is sampled straight off the tteokbokki pots here.',
    facades: [PAINT.nightPlaster, PAINT.charcoal, PAINT.mauve, PAINT.plaster],
    shops: [PAINT.shopRed, 0x241210, PAINT.shopBrown],
    neon: [NEON.red, NEON.orange, NEON.gold, NEON.violet],
    lamp: 0xffb090,
    glow: 0xff7040,
    mapFill: 'rgba(72,32,20,.92)',
    height: [10, 22],
    shopChance: 1,
    signChance: 1,
  },
  {
    id: 'station',
    index: 2,
    nameKo: '김밥 대로',
    nameEn: 'Gimbap Boulevard',
    role: 'The speed street. Wide sodium carriageway past gimbap counters that roll and wrap while you drive — grab-and-go food on a grab-and-go road. Tall massing, long sightlines.',
    facades: [PAINT.concrete, PAINT.charcoal, PAINT.plaster, 0xa89a84],
    shops: [PAINT.shopBrown, PAINT.shopGold, 0x28221c],
    neon: [NEON.warmWhite, NEON.gold, NEON.orange],
    lamp: 0xffbe78,
    glow: 0xffa04d,
    mapFill: 'rgba(58,46,28,.92)',
    height: [14, 28],
    shopChance: 0.78,
    signChance: 0.7,
  },
  {
    id: 'market',
    index: 3,
    nameKo: '호떡 시장',
    nameEn: 'Hotteok Market',
    role: 'Amber canopy over a driveable plaza. Hotteok griddles and cinnamon-sugar haze. Gold is money and this street — cut through the square instead of taking the long way.',
    facades: [PAINT.terracotta, PAINT.cream, PAINT.plaster, 0xd8ba8c],
    shops: [PAINT.shopGold, 0x3a2210, PAINT.shopBrown],
    neon: [NEON.gold, NEON.orange, NEON.red, NEON.warmWhite],
    lamp: 0xffdda4,
    glow: 0xffbb42,
    mapFill: 'rgba(66,50,22,.92)',
    height: [8, 16],
    shopChance: 0.92,
    signChance: 0.85,
  },
  {
    id: 'hangang',
    index: 4,
    nameKo: '빙수 한강',
    nameEn: 'Bingsu Hanfront',
    role: 'The south water. Shaved-ice cafés along the bank, mint bowls glowing against the current, three bridges. The HUD nav colour lives here so the river is always the compass.',
    facades: [PAINT.jade, PAINT.concrete, 0x86aaa4, PAINT.plaster],
    shops: [PAINT.shopTeal, 0x102226, PAINT.shopBrown],
    neon: [NEON.cyan, NEON.lime, NEON.warmWhite],
    lamp: 0xb2ecdd,
    glow: 0x3fd2e6,
    mapFill: 'rgba(24,56,54,.92)',
    height: [10, 18],
    shopChance: 0.7,
    signChance: 0.6,
  },
  {
    id: 'pocha',
    index: 5,
    nameKo: '포차 골목',
    nameEn: 'Pocha Alley',
    role: 'Low, dense, red. South-east of the canal. Tent lanterns and stew steam, tight turns after the bridge, the smell of the order itself.',
    facades: [PAINT.terracotta, PAINT.nightPlaster, PAINT.charcoal, 0x6e4234],
    shops: [PAINT.shopRed, 0x2c1210, PAINT.shopGold],
    neon: [NEON.red, NEON.orange, NEON.gold, NEON.magenta],
    lamp: 0xff964f,
    glow: 0xff5c2e,
    mapFill: 'rgba(64,32,22,.92)',
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

/**
 * Pickup shops that must be readable from a moving van. Ids bind 1:1 to menu
 * restaurants (src/game/data/restaurants.js) — do not rename them here. Each
 * wears a different neon so all eight read apart at speed.
 */
export const LANDMARK_SHOPS = [
  { id: 'tteokbokki', district: 'market', neon: NEON.red },
  { id: 'hotteok', district: 'station', neon: NEON.orange },
  { id: 'eomuk', district: 'pocha', neon: NEON.cyan },
  { id: 'gimbap', district: 'station', neon: NEON.gold },
  { id: 'chimaek', district: 'hongdae', neon: NEON.magenta },
  { id: 'bingsu', district: 'station', neon: NEON.violet },
  { id: 'gilgeori', district: 'hills', neon: NEON.lime },
  { id: 'pocha', district: 'hangang', neon: NEON.warmWhite },
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

// ---------------------------------------------------------------------------
// Colour algebra — added for M4 of the Expanse rebuild.
//
// M3 painted its six districts from a hand-written table because the bible's
// own facade paints do not separate on their own: market and pocha share
// terracotta outright, and hills, station and hangang all draw from the same
// pale concrete/plaster pair. A table is not art direction, it is a patch, and
// it cannot survive a district being retuned.
//
// The rule below replaces it. A building paints itself with one of its own
// district's facade paints, pulled a fixed distance toward that district's
// *signature light* — the `glow` hex the bible already assigns each
// neighbourhood, and the one colour no two districts share. Two districts can
// therefore keep the same plaster and still read apart from a moving van,
// because the light they live under is different. `expanse-facade-check`
// asserts the separation rather than trusting it.
// ---------------------------------------------------------------------------

const clamp255 = (value) => (value < 0 ? 0 : value > 255 ? 255 : Math.round(value));

/** Packed 0xrrggbb → { r, g, b } bytes. */
export function rgbOf(hex) {
  return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
}

/** { r, g, b } bytes → packed 0xrrggbb. */
export function hexOf(r, g, b) {
  return (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b);
}

/** Linear blend of two packed colours, `t` of the way from `a` to `b`. */
export function mixHex(a, b, t) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return hexOf(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t);
}

/** Multiply a packed colour's value, keeping its hue. */
export function scaleHex(hex, factor) {
  const { r, g, b } = rgbOf(hex);
  return hexOf(r * factor, g * factor, b * factor);
}

/**
 * Redmean distance — the standard cheap perceptual approximation, and close
 * enough for "do these two paints read as the same colour across a street".
 * Roughly: under 20 is the same paint, over 40 is unmistakably different.
 */
export function colourDistance(a, b) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  const rBar = (x.r + y.r) * 0.5;
  const dr = x.r - y.r;
  const dg = x.g - y.g;
  const db = x.b - y.b;
  return Math.sqrt(
    (2 + rBar / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rBar) / 256) * db * db,
  );
}

/**
 * How far a facade paint is pulled toward its district's signature glow. The
 * rule separates all fifteen district pairs by more than 70 from a fifth of the
 * way up, so this is chosen for the paint rather than for the gate: a quarter
 * is the point where the neighbourhood's light is unmistakable and the paint is
 * still recognisably the bible's own.
 */
export const FACADE_GLOW_MIX = 0.26;

/**
 * How far a facade paint must stay from a HUD accent. The HUD locked gold to
 * money, cyan to navigation and red-orange to urgency, and a wall wearing one
 * of those teaches the player the wrong thing about a colour they have to
 * trust at speed. 44 is a comfortable margin either side of the 40 the gate
 * asserts.
 */
export const HUD_CLEARANCE = 44;

const RESERVED = [HUD.money, HUD.nav, HUD.alarm];

/**
 * Walk a paint away from the three reserved hues.
 *
 * Pulling a district toward its own glow is what separates the six
 * neighbourhoods, and for Hotteok Market that glow *is* banana-milk gold — so
 * the rule occasionally produces a wall the colour of the money accent. Rather
 * than special-case the district, the paint is darkened a step at a time until
 * it is clear. Darkening is the right axis: every HUD accent is a bright,
 * saturated hue, and a step down in value leaves the neighbourhood's colour
 * intact while taking the wall out of the HUD's vocabulary.
 */
function clearOfHud(hex) {
  let colour = hex;
  for (let step = 0; step < 8; step++) {
    if (RESERVED.every((accent) => colourDistance(colour, accent) >= HUD_CLEARANCE)) break;
    colour = scaleHex(colour, 0.94);
  }
  return colour;
}

/** One building's paint: district paint `index`, tinted, at value `value`. */
export function districtFacadePaint(district, index = 0, value = 1, mix = FACADE_GLOW_MIX) {
  const paints = district.facades;
  return clearOfHud(scaleHex(mixHex(paints[((index % paints.length) + paints.length) % paints.length],
    district.glow, mix), value));
}

/** The colour a whole district averages out to — what you read from a distance. */
export function districtFacadeMean(district, mix = FACADE_GLOW_MIX) {
  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < district.facades.length; i++) {
    const { r: pr, g: pg, b: pb } = rgbOf(districtFacadePaint(district, i, 1, mix));
    r += pr; g += pg; b += pb;
  }
  const n = district.facades.length;
  return hexOf(r / n, g / n, b / n);
}
