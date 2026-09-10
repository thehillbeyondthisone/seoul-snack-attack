// Seoul Expanse — painting the facade sheets.
//
// M4's texture pool. Six districts, three sheets each and one roof sheet
// shared by the city:
//
//   wall  — 25.6 x 25.6 m of upper facade: eight window bays by eight storeys,
//           tileable, sampled with a whole-bay/whole-storey offset per building
//           so a terrace never repeats and a window sill never lands halfway
//           through a floor slab.
//   shop  — 8.0 x 4.2 m of ground floor: two shop units, exactly one podium
//           high, so a shopfront never stretches. A wide plot gets more shops
//           rather than wider ones.
//   roof  — tar, gravel and seams, tiled every 6 m, shared by every district.
//
// Each sheet is painted twice, once as albedo and once as emissive. The albedo
// is deliberately near-white where the wall is: the building's own paint from
// the colour bible rides in the mesh's vertex colours and multiplies it, which
// is what lets one texture serve six neighbourhoods and 1,211 different tones.
// The emissive is black everywhere except glass, so night lights the windows
// and day (emissiveBoost 0.32) merely warms them.
//
// Nothing here is per-building: the whole pool is 13 textures.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { cssHex, mixHex, scaleHex } from './data/color-bible.js';
import {
  SHEET_BAYS, SHEET_STOREYS, SHEET_WIDTH, SHEET_HEIGHT,
  SHOP_SHEET_UNITS, SHOP_SHEET_WIDTH, PODIUM_HEIGHT,
} from './expanse-facades.js';

/** Wall base. Near-white, because the district paint multiplies it. */
const WALL_BASE = 0xe6e1d8;

/** Glass in daylight: dark, slightly cool, never black. */
const GLASS = 0x2c3038;

/** Window frames and mullions. */
const FRAME = 0x8e887c;

const ROOF_SHEET_METRES = 6;

/**
 * Per-district facade grammar, as pixels. This is the art-direction half of
 * `DISTRICT_FACADE_RULES` in expanse-facades.js — that table decides how often
 * a thing happens, this one decides what it looks like.
 *
 *   panes    windows per bay (1 is a punched hole, 2 is a Seoul shophouse pair)
 *   sill     how far up the storey the window starts, as a fraction
 *   tall     window height as a fraction of the storey
 *   wide     window width as a fraction of the bay
 *   blank    chance a bay is solid wall — the single biggest density cue
 *   balcony  chance a window carries a rail
 *   band     chance of a spandrel band under the glass (curtain-wall look)
 *   lit      chance a window is lit after dark
 *   stain    weathering strength, 0..1
 */
const DISTRICT_WALL = Object.freeze({
  hills:   { panes: 1, sill: 0.30, tall: 0.42, wide: 0.40, blank: 0.34, balcony: 0.10, band: 0.00, lit: 0.30, stain: 0.35 },
  hongdae: { panes: 2, sill: 0.22, tall: 0.52, wide: 0.72, blank: 0.12, balcony: 0.46, band: 0.05, lit: 0.60, stain: 0.72 },
  station: { panes: 1, sill: 0.18, tall: 0.60, wide: 0.82, blank: 0.06, balcony: 0.04, band: 0.62, lit: 0.52, stain: 0.28 },
  market:  { panes: 2, sill: 0.26, tall: 0.46, wide: 0.66, blank: 0.20, balcony: 0.30, band: 0.03, lit: 0.46, stain: 0.66 },
  hangang: { panes: 1, sill: 0.20, tall: 0.56, wide: 0.74, blank: 0.10, balcony: 0.38, band: 0.18, lit: 0.44, stain: 0.30 },
  pocha:   { panes: 1, sill: 0.28, tall: 0.44, wide: 0.52, blank: 0.26, balcony: 0.22, band: 0.02, lit: 0.52, stain: 0.80 },
});

/**
 * Per-district shopfront grammar.
 *
 *   shutter  chance a unit is shuttered rather than glazed — a closed shop is
 *            what stops 1,052 lit windows reading as a stage set
 *   stall    chance of a stepped-out stall base (market and pocha only)
 *   fascia   height of the painted lintel band, as a fraction of the podium
 *   glazing  glass width as a fraction of the unit
 */
const DISTRICT_SHOP = Object.freeze({
  hills:   { shutter: 0.34, stall: 0.06, fascia: 0.22, glazing: 0.66 },
  hongdae: { shutter: 0.12, stall: 0.22, fascia: 0.26, glazing: 0.80 },
  station: { shutter: 0.18, stall: 0.05, fascia: 0.20, glazing: 0.86 },
  market:  { shutter: 0.14, stall: 0.44, fascia: 0.25, glazing: 0.78 },
  hangang: { shutter: 0.22, stall: 0.10, fascia: 0.21, glazing: 0.82 },
  pocha:   { shutter: 0.16, stall: 0.38, fascia: 0.27, glazing: 0.72 },
});

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(16, Math.round(width));
  canvas.height = Math.max(16, Math.round(height));
  return canvas;
}

function texture(canvas, repeatX, repeatY, { srgb = true, anisotropy = 8 } = {}) {
  const map = new THREE.CanvasTexture(canvas);
  if (srgb) map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = anisotropy;
  // The mesh bakes metres into its UVs, so the texture itself never repeats:
  // one texture unit is one sheet. Kept explicit because a stray repeat here
  // would shift every window in the city.
  map.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;
  return map;
}

/** Soft vertical grime under a ledge — the cheapest "this building is old". */
function stainBelow(ctx, x, y, width, height, strength) {
  if (strength <= 0 || height <= 0) return;
  const gradient = ctx.createLinearGradient(0, y, 0, y + height);
  gradient.addColorStop(0, `rgba(38,32,26,${0.42 * strength})`);
  gradient.addColorStop(1, 'rgba(38,32,26,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
}

/**
 * Paint one district's upper facade, albedo and emissive together so the two
 * always agree about which pane is glass.
 */
function paintWall(district, spec, size, seed) {
  const albedo = makeCanvas(size, size);
  const glow = makeCanvas(size, size);
  const a = albedo.getContext('2d');
  const e = glow.getContext('2d');
  const rng = mulberry32(seed);
  const cell = size / SHEET_BAYS;
  const storey = size / SHEET_STOREYS;

  a.fillStyle = cssHex(WALL_BASE);
  a.fillRect(0, 0, size, size);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, size, size);

  // Plaster mottle. Low frequency and low contrast: this multiplies a paint,
  // so anything punchy reads as dirt rather than as render.
  for (let i = 0; i < 220; i++) {
    const radius = cell * (0.18 + rng() * 0.6);
    const shade = 1 - (rng() - 0.45) * 0.14 * (0.4 + spec.stain);
    a.globalAlpha = 0.3;
    a.fillStyle = cssHex(scaleHex(WALL_BASE, shade));
    a.beginPath();
    a.ellipse(rng() * size, rng() * size, radius, radius * (0.5 + rng()), rng() * Math.PI, 0, Math.PI * 2);
    a.fill();
  }
  a.globalAlpha = 1;

  // Floor slabs. One line per storey, drawn across the full width so the sheet
  // still tiles, and it is these lines that make a repeated sheet read as a
  // building rather than as wallpaper.
  for (let row = 0; row <= SHEET_STOREYS; row++) {
    const y = row * storey;
    a.fillStyle = `rgba(30,26,22,${0.10 + spec.stain * 0.10})`;
    a.fillRect(0, y - Math.max(1, storey * 0.018), size, Math.max(2, storey * 0.036));
    a.fillStyle = 'rgba(255,252,244,0.16)';
    a.fillRect(0, y + Math.max(1, storey * 0.02), size, Math.max(1, storey * 0.014));
  }

  const glassTone = mixHex(GLASS, district.facades[0], 0.16);
  const litWarm = mixHex(district.lamp, 0xffffff, 0.18);

  for (let row = 0; row < SHEET_STOREYS; row++) {
    for (let col = 0; col < SHEET_BAYS; col++) {
      const x0 = col * cell;
      const y0 = row * storey;
      if (rng() < spec.blank) {
        // Solid bay. Give it a vent or a downpipe so it is not a dead panel.
        if (rng() < 0.45) {
          a.fillStyle = 'rgba(46,40,34,0.5)';
          a.fillRect(x0 + cell * (0.42 + rng() * 0.2), y0 + storey * 0.3, cell * 0.05, storey * 0.7);
        }
        continue;
      }

      const paneCount = spec.panes;
      const groupWidth = cell * spec.wide;
      const paneWidth = (groupWidth - cell * 0.03 * (paneCount - 1)) / paneCount;
      const height = storey * spec.tall;
      const top = y0 + storey * spec.sill;
      const left = x0 + (cell - groupWidth) * 0.5;

      // Spandrel band: the darker strip under a curtain wall's glass.
      if (rng() < spec.band) {
        a.fillStyle = 'rgba(58,58,60,0.55)';
        a.fillRect(x0, top + height, cell, storey * 0.22);
      }

      for (let pane = 0; pane < paneCount; pane++) {
        const px = left + pane * (paneWidth + cell * 0.03);
        // Reveal: a window is a hole in a wall, and the shadow at its head is
        // most of what sells that at a distance.
        a.fillStyle = 'rgba(24,20,18,0.55)';
        a.fillRect(px - cell * 0.012, top - storey * 0.014, paneWidth + cell * 0.024, height + storey * 0.028);
        a.fillStyle = cssHex(FRAME);
        a.fillRect(px, top, paneWidth, height);
        a.fillStyle = cssHex(glassTone);
        a.fillRect(px + paneWidth * 0.08, top + height * 0.07, paneWidth * 0.84, height * 0.86);
        // Mullion.
        a.fillStyle = cssHex(scaleHex(FRAME, 0.85));
        a.fillRect(px + paneWidth * 0.48, top + height * 0.07, paneWidth * 0.05, height * 0.86);
        // Sky sheen across the top of the glass.
        a.fillStyle = 'rgba(190,206,220,0.18)';
        a.fillRect(px + paneWidth * 0.08, top + height * 0.07, paneWidth * 0.84, height * 0.22);

        if (rng() < spec.lit) {
          // Lit rooms vary in colour and in how far the curtain is drawn.
          const warm = rng() < 0.72;
          const tint = warm ? litWarm : mixHex(district.neon[0], 0xffffff, 0.55);
          const value = 0.24 + rng() * 0.36;
          e.fillStyle = cssHex(scaleHex(tint, value));
          const drop = rng() < 0.3 ? 0.4 + rng() * 0.4 : 1;
          e.fillRect(px + paneWidth * 0.08, top + height * 0.07,
            paneWidth * 0.84, height * 0.86 * drop);
        }
      }

      if (rng() < spec.balcony) {
        const railY = top + height * 0.94;
        a.fillStyle = 'rgba(52,46,40,0.85)';
        a.fillRect(left - cell * 0.03, railY, groupWidth + cell * 0.06, storey * 0.045);
        for (let bar = 0; bar <= 5; bar++) {
          a.fillRect(left + (groupWidth / 5) * bar, railY - storey * 0.11, cell * 0.012, storey * 0.11);
        }
      }

      stainBelow(a, left, top + height, groupWidth, storey * 0.5, spec.stain * 0.8);
    }
  }

  return { albedo, glow };
}

/**
 * Paint one district's ground floor: two shop units, one podium high.
 *
 * A shopfront at night is a dark frame around a bright hole, and getting that
 * ratio wrong is the difference between a street and a strip of light boxes.
 * So almost everything below the fascia is painted dark on purpose — the wall
 * paint multiplying this sheet can only make it darker, never brighter — and
 * the glow is confined to the glass, hottest at the ceiling strip where a real
 * shop's fluorescents are.
 */
function paintShop(district, spec, width, height, seed) {
  const albedo = makeCanvas(width, height);
  const glow = makeCanvas(width, height);
  const a = albedo.getContext('2d');
  const e = glow.getContext('2d');
  const rng = mulberry32(seed);
  const unit = width / SHOP_SHEET_UNITS;

  a.fillStyle = cssHex(WALL_BASE);
  a.fillRect(0, 0, width, height);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, width, height);

  const fasciaHeight = height * spec.fascia;

  for (let index = 0; index < SHOP_SHEET_UNITS; index++) {
    const x0 = index * unit;
    const shopPaint = district.shops[Math.floor(rng() * district.shops.length)];
    const neon = district.neon[Math.floor(rng() * district.neon.length)];
    const interior = mixHex(district.lamp, 0xffffff, 0.1);

    // Fascia: the painted lintel, with a lit strip along its bottom edge. The
    // 3D fascia board bolts over this; a shop without a board still needs the
    // band or its head reads unfinished.
    a.fillStyle = cssHex(shopPaint);
    a.fillRect(x0, 0, unit, fasciaHeight);
    const strip = Math.max(2, height * 0.018);
    a.fillStyle = cssHex(scaleHex(mixHex(shopPaint, neon, 0.62), 1.15));
    a.fillRect(x0, fasciaHeight - strip, unit, strip);
    e.fillStyle = cssHex(scaleHex(neon, 0.42));
    e.fillRect(x0, fasciaHeight - strip, unit, strip);

    // Pilasters: the party walls between two shops. Left near-white so the
    // building's own paint reads at street level, and the only place it does.
    const pier = unit * 0.045;
    a.fillStyle = 'rgba(30,26,22,0.30)';
    a.fillRect(x0, fasciaHeight, pier, height - fasciaHeight);
    a.fillRect(x0 + unit - pier, fasciaHeight, pier, height - fasciaHeight);

    // Everything between the piers is shopfront, and it starts dark.
    const bayX = x0 + pier;
    const bayWidth = unit - pier * 2;
    const bayTop = fasciaHeight;
    const plinth = height * 0.10;
    a.fillStyle = '#191512';
    a.fillRect(bayX, bayTop, bayWidth, height - bayTop);

    if (rng() < spec.shutter) {
      // Closed: a corrugated roller shutter, and nothing behind it glows. One
      // in five or six shops shut is what stops a lit terrace reading as a set.
      const shutterTone = scaleHex(mixHex(shopPaint, 0x8b8577, 0.55), 1.0);
      a.fillStyle = cssHex(shutterTone);
      a.fillRect(bayX, bayTop + height * 0.02, bayWidth, height - bayTop - height * 0.02);
      const ribs = 30;
      for (let ribbon = 0; ribbon < ribs; ribbon++) {
        const y = bayTop + height * 0.02 + ((height - bayTop - height * 0.02) / ribs) * ribbon;
        a.fillStyle = ribbon % 2 ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.07)';
        a.fillRect(bayX, y, bayWidth, (height - bayTop) / ribs);
      }
      stainBelow(a, bayX, bayTop, bayWidth, height * 0.5, 0.6);
      a.fillStyle = 'rgba(12,10,9,0.9)';
      a.fillRect(bayX, height - plinth * 0.5, bayWidth, plinth * 0.5);
      continue;
    }

    // Open. The glass is inset from the bay so the reveal reads as a reveal.
    const inset = bayWidth * 0.035;
    const doorWidth = bayWidth * (1 - spec.glazing) * 0.9;
    const glassX = bayX + inset;
    const glassWidth = bayWidth - inset * 2 - doorWidth;
    const glassTop = bayTop + height * 0.055;
    const glassBottom = height - plinth;
    const glassHeight = glassBottom - glassTop;

    // Interior: a warm ceiling wash falling off toward the floor, over a back
    // wall. Painted as a gradient because a flat fill reads as a light box.
    const wash = a.createLinearGradient(0, glassTop, 0, glassBottom);
    wash.addColorStop(0, cssHex(scaleHex(interior, 0.52)));
    wash.addColorStop(0.45, cssHex(scaleHex(interior, 0.36)));
    wash.addColorStop(1, cssHex(scaleHex(interior, 0.2)));
    a.fillStyle = wash;
    a.fillRect(glassX, glassTop, glassWidth, glassHeight);

    const eWash = e.createLinearGradient(0, glassTop, 0, glassBottom);
    eWash.addColorStop(0, cssHex(scaleHex(interior, 0.4)));
    eWash.addColorStop(0.5, cssHex(scaleHex(interior, 0.24)));
    eWash.addColorStop(1, cssHex(scaleHex(interior, 0.1)));
    e.fillStyle = eWash;
    e.fillRect(glassX, glassTop, glassWidth, glassHeight);

    // The fluorescent batten just inside the head of the glass: the hottest
    // thing at pavement level and the reason a shop pools light on the kerb.
    const batten = Math.max(2, height * 0.018);
    a.fillStyle = cssHex(mixHex(interior, 0xffffff, 0.55));
    a.fillRect(glassX + glassWidth * 0.06, glassTop + height * 0.02, glassWidth * 0.88, batten);
    // Coloured rather than white-hot: at a glancing angle this strip runs the
    // whole length of a terrace, and a white one becomes the brightest thing
    // on the street once bloom has had it.
    e.fillStyle = cssHex(scaleHex(interior, 0.6));
    e.fillRect(glassX + glassWidth * 0.06, glassTop + height * 0.02, glassWidth * 0.88, batten);

    // Counter, and stock stacked on it. Silhouettes only: these are what make
    // a lit rectangle read as a shop rather than as a window.
    const counterY = glassTop + glassHeight * 0.56;
    for (let item = 0; item < 5; item++) {
      const w = glassWidth * (0.05 + rng() * 0.08);
      const h = glassHeight * (0.08 + rng() * 0.16);
      const ix = glassX + glassWidth * 0.04 + rng() * (glassWidth * 0.9 - w);
      a.fillStyle = 'rgba(26,19,14,0.82)';
      a.fillRect(ix, counterY - h, w, h);
      e.fillStyle = 'rgba(0,0,0,0.8)';
      e.fillRect(ix, counterY - h, w, h);
    }
    a.fillStyle = '#241c15';
    a.fillRect(glassX, counterY, glassWidth, glassBottom - counterY);
    e.fillStyle = 'rgba(0,0,0,0.92)';
    e.fillRect(glassX, counterY, glassWidth, glassBottom - counterY);
    // A lit lip along the counter edge: the light a stall throws on the kerb,
    // and the one thing a player standing at a shop door actually reads.
    const lip = Math.max(1, height * 0.009);
    a.fillStyle = cssHex(scaleHex(interior, 0.7));
    a.fillRect(glassX, counterY, glassWidth, lip);
    e.fillStyle = cssHex(scaleHex(interior, 0.3));
    e.fillRect(glassX, counterY, glassWidth, lip);

    // Mullions and the transom, drawn last so the glass reads as glazed.
    a.fillStyle = cssHex(scaleHex(FRAME, 0.42));
    const bars = Math.max(2, Math.round(glassWidth / (unit * 0.22)));
    for (let bar = 1; bar < bars; bar++) {
      a.fillRect(glassX + (glassWidth / bars) * bar, glassTop, Math.max(1, unit * 0.012), glassHeight);
    }
    a.fillRect(glassX, glassTop + glassHeight * 0.24, glassWidth, Math.max(1, height * 0.01));
    // Frame around the opening.
    a.strokeStyle = cssHex(scaleHex(FRAME, 0.34));
    a.lineWidth = Math.max(2, unit * 0.016);
    a.strokeRect(glassX, glassTop, glassWidth, glassHeight);

    // Door beside the window, glazed in its top half.
    if (doorWidth > unit * 0.04) {
      const doorX = glassX + glassWidth + inset;
      a.fillStyle = '#14100e';
      a.fillRect(doorX, glassTop, doorWidth, glassBottom + plinth * 0.6 - glassTop);
      a.fillStyle = cssHex(scaleHex(interior, 0.4));
      a.fillRect(doorX + doorWidth * 0.16, glassTop + glassHeight * 0.08, doorWidth * 0.68, glassHeight * 0.46);
      e.fillStyle = cssHex(scaleHex(interior, 0.3));
      e.fillRect(doorX + doorWidth * 0.16, glassTop + glassHeight * 0.08, doorWidth * 0.68, glassHeight * 0.46);
    }

    // Tiled plinth, and the grime that always collects on it.
    a.fillStyle = '#231e19';
    a.fillRect(bayX, glassBottom, bayWidth, plinth);
    a.fillStyle = 'rgba(255,250,240,0.06)';
    a.fillRect(bayX, glassBottom, bayWidth, Math.max(1, plinth * 0.14));

    // Stepped-out stall: crates and trays on the pavement side, painted rather
    // than modelled because a market's clutter is a texture at 40 km/h.
    if (rng() < spec.stall) {
      const stallHeight = plinth * 1.9;
      const stallTop = height - plinth * 0.2 - stallHeight;
      a.fillStyle = cssHex(scaleHex(mixHex(shopPaint, neon, 0.4), 1.35));
      a.fillRect(bayX + bayWidth * 0.04, stallTop, bayWidth * 0.92, stallHeight);
      for (let crate = 0; crate < 4; crate++) {
        a.fillStyle = `rgba(20,15,12,${0.2 + rng() * 0.35})`;
        a.fillRect(bayX + bayWidth * (0.06 + crate * 0.23), stallTop, bayWidth * 0.19, stallHeight);
      }
      e.fillStyle = cssHex(scaleHex(neon, 0.22));
      e.fillRect(bayX + bayWidth * 0.04, stallTop, bayWidth * 0.92, Math.max(1, height * 0.01));
    }
  }

  return { albedo, glow };
}

/** Tar, gravel and felt seams. One sheet for the whole city. */
function paintRoof(size, seed) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(seed);
  ctx.fillStyle = '#2b2926';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const shade = 20 + Math.floor(rng() * 46);
    ctx.fillStyle = `rgba(${shade + 8},${shade + 4},${shade},${0.25 + rng() * 0.4})`;
    const r = size * (0.002 + rng() * 0.006);
    ctx.fillRect(rng() * size, rng() * size, r, r);
  }
  // Felt seams every quarter sheet, and a puddle stain or two.
  ctx.strokeStyle = 'rgba(16,15,14,0.55)';
  ctx.lineWidth = Math.max(1, size * 0.006);
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (size / 4) * i);
    ctx.lineTo(size, (size / 4) * i);
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = size * (0.05 + rng() * 0.09);
    const puddle = ctx.createRadialGradient(x, y, 0, x, y, r);
    puddle.addColorStop(0, 'rgba(22,26,28,0.5)');
    puddle.addColorStop(1, 'rgba(22,26,28,0)');
    ctx.fillStyle = puddle;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return canvas;
}

/**
 * Build the whole M4 texture pool.
 *
 * `scale` shrinks every sheet for the mobile profile. Nothing downstream reads
 * a pixel size — the meshes bake metres into their UVs — so the city looks the
 * same at any scale, only softer.
 */
export function createExpanseFacadeTextures(districts, { scale = 1, anisotropy = 8 } = {}) {
  const wallSize = Math.max(128, Math.round(512 * scale));
  const shopWidth = Math.max(128, Math.round(512 * scale));
  const shopHeight = Math.max(64, Math.round(272 * scale));
  const roofSize = Math.max(64, Math.round(256 * scale));

  const walls = [];
  const shops = [];
  districts.forEach((district, index) => {
    const wallSpec = DISTRICT_WALL[district.id] || DISTRICT_WALL.station;
    const shopSpec = DISTRICT_SHOP[district.id] || DISTRICT_SHOP.station;
    const painted = paintWall(district, wallSpec, wallSize, 0x5ea1 + index * 977);
    const shopPainted = paintShop(district, shopSpec, shopWidth, shopHeight, 0x9c0f + index * 613);
    walls.push({
      map: texture(painted.albedo, 1, 1, { anisotropy }),
      emissive: texture(painted.glow, 1, 1, { anisotropy }),
    });
    shops.push({
      map: texture(shopPainted.albedo, 1, 1, { anisotropy }),
      emissive: texture(shopPainted.glow, 1, 1, { anisotropy }),
    });
  });

  return {
    walls,
    shops,
    roof: texture(paintRoof(roofSize, 0x40f), 1, 1, { anisotropy }),
    metres: {
      wall: { width: SHEET_WIDTH, height: SHEET_HEIGHT },
      shop: { width: SHOP_SHEET_WIDTH, height: PODIUM_HEIGHT },
      roof: ROOF_SHEET_METRES,
    },
    dispose() {
      for (const set of [...walls, ...shops]) { set.map.dispose(); set.emissive.dispose(); }
      this.roof.dispose();
    },
  };
}
