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
// Each sheet is painted three times, in one pass: albedo, emissive and relief.
// The albedo is deliberately near-white where the wall is: the building's own
// paint from the colour bible rides in the mesh's vertex colours and multiplies
// it, which is what lets one texture serve six neighbourhoods and 1,211
// different tones. The emissive is black everywhere except glass, so night
// lights the windows and day (emissiveBoost 0.32) merely warms them.
//
// RELIEF (M6b). Until M6b every one of those windows was a flat print: a reveal
// was a dark rectangle painted on the albedo, so no light ever caught its edge
// and a terrace read as wallpaper under a raking sodium lamp. The relief canvas
// carries the surface itself, two channels in one texture:
//
//   red   — height. 0.5 is the wall plane; glass sits back, rails stand proud.
//           Sobel'd into a tangent-space normal map at pool build.
//   green — roughness, straight through to `roughnessMap` (three.js reads the
//           green channel), so the same canvas IS the roughness map and the
//           pass costs two textures per sheet rather than three.
//
// The relief is painted at RELIEF_SCALE of the albedo's resolution — surface
// relief carries at half the pixels that legible signage needs, and the facade
// pool has a phone's VRAM to fit inside. It is drawn through a scaled context,
// so every draw call below uses one set of full-resolution coordinates for all
// three canvases and they cannot drift apart.
//
// All three share one `rng`, which is what guarantees the lit window, the dark
// reveal and the recessed glass are the same window.
//
// Nothing here is per-building: the whole pool is 13 albedo/emissive textures
// plus 13 relief pairs.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { cssHex, mixHex, scaleHex } from './data/color-bible.js';
import {
  SHEET_BAYS, SHEET_STOREYS, SHEET_WIDTH, SHEET_HEIGHT,
  SHOP_SHEET_UNITS, SHOP_SHEET_WIDTH, PODIUM_HEIGHT,
} from './expanse-facades.js';

/**
 * Relief resolution as a fraction of the albedo's. Half is the budget decision:
 * the facade pool has a 48 MB ceiling (`expanse-facade-check`) and full-scale
 * relief would need about 21 MB of it against the 6.5 MB this costs.
 */
export const RELIEF_SCALE = 0.5;

/** Normal-map strength, in bump pixels. Provisional — tuned on SwiftShader. */
export const RELIEF_STRENGTH = Object.freeze({ wall: 2.4, shop: 2.8, roof: 1.6 });

/**
 * The surface library: height above the wall plane, and roughness.
 *
 * Height is the half of this that can look wrong from the cab. 0.5 is the wall,
 * and the span either side is deliberately narrow — these are detail bumps on a
 * flat mesh, and a reveal pushed to 0 reads as a hole punched clean through the
 * building the moment the sun is low.
 */
const SURFACE = Object.freeze({
  plaster: { h: 0.50, r: 0.94 },
  slab:    { h: 0.60, r: 0.88 },
  reveal:  { h: 0.34, r: 0.90 },
  frame:   { h: 0.56, r: 0.55 },
  glass:   { h: 0.30, r: 0.07 },
  mullion: { h: 0.58, r: 0.45 },
  band:    { h: 0.44, r: 0.72 },
  rail:    { h: 0.70, r: 0.50 },
  pipe:    { h: 0.66, r: 0.62 },
  fascia:  { h: 0.62, r: 0.80 },
  pier:    { h: 0.60, r: 0.86 },
  shutter: { h: 0.46, r: 0.42 },
  plinth:  { h: 0.56, r: 0.70 },
  stall:   { h: 0.74, r: 0.78 },
  counter: { h: 0.26, r: 0.60 },
  felt:    { h: 0.50, r: 0.96 },
  seam:    { h: 0.60, r: 0.90 },
});

/**
 * Select a surface on the relief context. Height rides red, roughness green;
 * blue is unused and stays 0 so a future channel has somewhere to go.
 */
function use(ctx, surface, { h = 0, r = 0 } = {}) {
  const height = Math.max(0, Math.min(1, surface.h + h));
  const rough = Math.max(0, Math.min(1, surface.r + r));
  ctx.fillStyle = `rgb(${Math.round(height * 255)},${Math.round(rough * 255)},0)`;
}

/**
 * A relief canvas, drawn in the albedo's coordinate system.
 *
 * The scale lives in the context transform rather than in the call sites: every
 * `fillRect` below is written once, in metres-worth-of-albedo-pixels, and lands
 * on both sheets. Getting this wrong by hand — halving some coordinates and not
 * others — would slide the normal map off the paint by a few pixels everywhere,
 * which reads as a soft blur rather than as a bug.
 */
function makeRelief(width, height) {
  const canvas = makeCanvas(width * RELIEF_SCALE, height * RELIEF_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / width, canvas.height / height);
  use(ctx, SURFACE.plaster);
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

/**
 * Relief red channel → tangent-space normal map.
 *
 * `proc/textures.js` exports `normalDataTexture` for exactly this, and it is
 * square-only: the shop sheet is 512 x 272. Rather than widen a signature the
 * compact city's bit-pinned pool depends on, the rectangle case lives here.
 * The wrap in `at()` is what keeps the sheet tileable.
 */
function normalFromRelief(canvas, strength) {
  const { width, height } = canvas;
  const src = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const at = (x, y) => src[(((y + height) % height) * width + ((x + width) % width)) * 4] / 255;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * width + x) * 4;
      data[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(data, width, height);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

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
  const { canvas: relief, ctx: r } = makeRelief(size, size);
  const rng = mulberry32(seed);
  const cell = size / SHEET_BAYS;
  const storey = size / SHEET_STOREYS;

  a.fillStyle = cssHex(WALL_BASE);
  a.fillRect(0, 0, size, size);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, size, size);

  // Plaster mottle. Low frequency and low contrast: this multiplies a paint,
  // so anything punchy reads as dirt rather than as render. The relief takes
  // the same blobs as a shallow swell, which is what stops a rendered wall
  // between two windows from being a mirror-flat plane.
  for (let i = 0; i < 220; i++) {
    const radius = cell * (0.18 + rng() * 0.6);
    const shade = 1 - (rng() - 0.45) * 0.14 * (0.4 + spec.stain);
    const x = rng() * size;
    const y = rng() * size;
    const squash = 0.5 + rng();
    const turn = rng() * Math.PI;
    a.globalAlpha = 0.3;
    a.fillStyle = cssHex(scaleHex(WALL_BASE, shade));
    a.beginPath();
    a.ellipse(x, y, radius, radius * squash, turn, 0, Math.PI * 2);
    a.fill();
    r.globalAlpha = 0.25;
    use(r, SURFACE.plaster, { h: (shade - 1) * 1.6, r: (1 - shade) * 0.9 });
    r.beginPath();
    r.ellipse(x, y, radius, radius * squash, turn, 0, Math.PI * 2);
    r.fill();
  }
  a.globalAlpha = 1;
  r.globalAlpha = 1;

  // Floor slabs. One line per storey, drawn across the full width so the sheet
  // still tiles, and it is these lines that make a repeated sheet read as a
  // building rather than as wallpaper. In relief the slab is the one horizontal
  // that runs the whole terrace, so it is the edge a low sun actually finds.
  for (let row = 0; row <= SHEET_STOREYS; row++) {
    const y = row * storey;
    a.fillStyle = `rgba(30,26,22,${0.10 + spec.stain * 0.10})`;
    a.fillRect(0, y - Math.max(1, storey * 0.018), size, Math.max(2, storey * 0.036));
    a.fillStyle = 'rgba(255,252,244,0.16)';
    a.fillRect(0, y + Math.max(1, storey * 0.02), size, Math.max(1, storey * 0.014));
    use(r, SURFACE.slab);
    r.fillRect(0, y - Math.max(1, storey * 0.018), size, Math.max(2, storey * 0.05));
  }

  const glassTone = mixHex(GLASS, district.facades[0], 0.16);
  const litWarm = mixHex(district.lamp, 0xffffff, 0.18);

  for (let row = 0; row < SHEET_STOREYS; row++) {
    for (let col = 0; col < SHEET_BAYS; col++) {
      const x0 = col * cell;
      const y0 = row * storey;
      if (rng() < spec.blank) {
        // Solid bay. Give it a vent or a downpipe so it is not a dead panel —
        // and in relief the pipe is round-ish and proud, which is the only
        // thing distinguishing it from a painted stripe.
        if (rng() < 0.45) {
          const pipeX = x0 + cell * (0.42 + rng() * 0.2);
          a.fillStyle = 'rgba(46,40,34,0.5)';
          a.fillRect(pipeX, y0 + storey * 0.3, cell * 0.05, storey * 0.7);
          use(r, SURFACE.pipe);
          r.fillRect(pipeX, y0 + storey * 0.3, cell * 0.05, storey * 0.7);
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
        use(r, SURFACE.band);
        r.fillRect(x0, top + height, cell, storey * 0.22);
      }

      for (let pane = 0; pane < paneCount; pane++) {
        const px = left + pane * (paneWidth + cell * 0.03);
        // Reveal: a window is a hole in a wall, and the shadow at its head is
        // most of what sells that at a distance. The albedo paints that shadow;
        // the relief is what makes it move with the sun instead of being a
        // smudge that faces the same way at noon and at midnight.
        a.fillStyle = 'rgba(24,20,18,0.55)';
        a.fillRect(px - cell * 0.012, top - storey * 0.014, paneWidth + cell * 0.024, height + storey * 0.028);
        use(r, SURFACE.reveal);
        r.fillRect(px - cell * 0.012, top - storey * 0.014, paneWidth + cell * 0.024, height + storey * 0.028);
        a.fillStyle = cssHex(FRAME);
        a.fillRect(px, top, paneWidth, height);
        use(r, SURFACE.frame);
        r.fillRect(px, top, paneWidth, height);
        a.fillStyle = cssHex(glassTone);
        a.fillRect(px + paneWidth * 0.08, top + height * 0.07, paneWidth * 0.84, height * 0.86);
        use(r, SURFACE.glass);
        r.fillRect(px + paneWidth * 0.08, top + height * 0.07, paneWidth * 0.84, height * 0.86);
        // Mullion.
        a.fillStyle = cssHex(scaleHex(FRAME, 0.85));
        a.fillRect(px + paneWidth * 0.48, top + height * 0.07, paneWidth * 0.05, height * 0.86);
        use(r, SURFACE.mullion);
        r.fillRect(px + paneWidth * 0.48, top + height * 0.07, paneWidth * 0.05, height * 0.86);
        // Sky sheen across the top of the glass. Albedo only: it is a
        // reflection, not a change in the surface.
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
        use(r, SURFACE.rail);
        r.fillRect(left - cell * 0.03, railY, groupWidth + cell * 0.06, storey * 0.045);
        for (let bar = 0; bar <= 5; bar++) {
          a.fillStyle = 'rgba(52,46,40,0.85)';
          a.fillRect(left + (groupWidth / 5) * bar, railY - storey * 0.11, cell * 0.012, storey * 0.11);
          use(r, SURFACE.rail);
          r.fillRect(left + (groupWidth / 5) * bar, railY - storey * 0.11, cell * 0.012, storey * 0.11);
        }
      }

      // Streaking is dirt on the plaster, not a change in its shape, so it
      // stays out of the height channel — but wet grime is smoother than the
      // wall it runs down, and the roughness channel does carry that.
      stainBelow(a, left, top + height, groupWidth, storey * 0.5, spec.stain * 0.8);
      if (spec.stain > 0) {
        r.globalAlpha = 0.35 * spec.stain;
        use(r, SURFACE.plaster, { r: -0.18 });
        r.fillRect(left, top + height, groupWidth, storey * 0.5);
        r.globalAlpha = 1;
      }
    }
  }

  return { albedo, glow, relief };
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
  const { canvas: relief, ctx: r } = makeRelief(width, height);
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
    use(r, SURFACE.fascia);
    r.fillRect(x0, 0, unit, fasciaHeight);
    const strip = Math.max(2, height * 0.018);
    a.fillStyle = cssHex(scaleHex(mixHex(shopPaint, neon, 0.62), 1.15));
    a.fillRect(x0, fasciaHeight - strip, unit, strip);
    e.fillStyle = cssHex(scaleHex(neon, 0.42));
    e.fillRect(x0, fasciaHeight - strip, unit, strip);
    use(r, SURFACE.frame, { r: -0.2 });
    r.fillRect(x0, fasciaHeight - strip, unit, strip);

    // Pilasters: the party walls between two shops. Left near-white so the
    // building's own paint reads at street level, and the only place it does.
    // They are also the deepest step on the whole sheet — a shopfront reads as
    // a row of separate shops because the piers between them catch light.
    const pier = unit * 0.045;
    a.fillStyle = 'rgba(30,26,22,0.30)';
    a.fillRect(x0, fasciaHeight, pier, height - fasciaHeight);
    a.fillRect(x0 + unit - pier, fasciaHeight, pier, height - fasciaHeight);
    use(r, SURFACE.pier);
    r.fillRect(x0, fasciaHeight, pier, height - fasciaHeight);
    r.fillRect(x0 + unit - pier, fasciaHeight, pier, height - fasciaHeight);

    // Everything between the piers is shopfront, and it starts dark.
    const bayX = x0 + pier;
    const bayWidth = unit - pier * 2;
    const bayTop = fasciaHeight;
    const plinth = height * 0.10;
    a.fillStyle = '#191512';
    a.fillRect(bayX, bayTop, bayWidth, height - bayTop);
    use(r, SURFACE.reveal);
    r.fillRect(bayX, bayTop, bayWidth, height - bayTop);

    if (rng() < spec.shutter) {
      // Closed: a corrugated roller shutter, and nothing behind it glows. One
      // in five or six shops shut is what stops a lit terrace reading as a set.
      const shutterTone = scaleHex(mixHex(shopPaint, 0x8b8577, 0.55), 1.0);
      a.fillStyle = cssHex(shutterTone);
      a.fillRect(bayX, bayTop + height * 0.02, bayWidth, height - bayTop - height * 0.02);
      use(r, SURFACE.shutter);
      r.fillRect(bayX, bayTop + height * 0.02, bayWidth, height - bayTop - height * 0.02);
      // Corrugation. This is the one place the relief carries a form the albedo
      // only fakes with alternating stripes: real ribs, so a shutter under a
      // streetlight ripples instead of reading as printed lines.
      const ribs = 30;
      for (let ribbon = 0; ribbon < ribs; ribbon++) {
        const y = bayTop + height * 0.02 + ((height - bayTop - height * 0.02) / ribs) * ribbon;
        a.fillStyle = ribbon % 2 ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.07)';
        a.fillRect(bayX, y, bayWidth, (height - bayTop) / ribs);
        use(r, SURFACE.shutter, { h: ribbon % 2 ? -0.06 : 0.06 });
        r.fillRect(bayX, y, bayWidth, (height - bayTop) / ribs);
      }
      stainBelow(a, bayX, bayTop, bayWidth, height * 0.5, 0.6);
      a.fillStyle = 'rgba(12,10,9,0.9)';
      a.fillRect(bayX, height - plinth * 0.5, bayWidth, plinth * 0.5);
      use(r, SURFACE.plinth);
      r.fillRect(bayX, height - plinth * 0.5, bayWidth, plinth * 0.5);
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
    // One flat sheet of glass across the whole opening. Everything painted
    // inside it below — counter, stock, battens — is behind that glass, so it
    // stays out of the relief entirely: the surface the light hits is the pane.
    use(r, SURFACE.glass);
    r.fillRect(glassX, glassTop, glassWidth, glassHeight);

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

    // Mullions and the transom, drawn last so the glass reads as glazed. These
    // do stand proud of the pane, and at a shopfront's scale they are the
    // nearest relief the player ever gets to.
    a.fillStyle = cssHex(scaleHex(FRAME, 0.42));
    const bars = Math.max(2, Math.round(glassWidth / (unit * 0.22)));
    for (let bar = 1; bar < bars; bar++) {
      const bx = glassX + (glassWidth / bars) * bar;
      a.fillRect(bx, glassTop, Math.max(1, unit * 0.012), glassHeight);
      use(r, SURFACE.mullion);
      r.fillRect(bx, glassTop, Math.max(1, unit * 0.012), glassHeight);
    }
    a.fillRect(glassX, glassTop + glassHeight * 0.24, glassWidth, Math.max(1, height * 0.01));
    use(r, SURFACE.mullion);
    r.fillRect(glassX, glassTop + glassHeight * 0.24, glassWidth, Math.max(1, height * 0.01));
    // Frame around the opening.
    a.strokeStyle = cssHex(scaleHex(FRAME, 0.34));
    a.lineWidth = Math.max(2, unit * 0.016);
    a.strokeRect(glassX, glassTop, glassWidth, glassHeight);
    use(r, SURFACE.frame);
    r.lineWidth = Math.max(2, unit * 0.016);
    r.strokeStyle = r.fillStyle;
    r.strokeRect(glassX, glassTop, glassWidth, glassHeight);

    // Door beside the window, glazed in its top half.
    if (doorWidth > unit * 0.04) {
      const doorX = glassX + glassWidth + inset;
      a.fillStyle = '#14100e';
      a.fillRect(doorX, glassTop, doorWidth, glassBottom + plinth * 0.6 - glassTop);
      use(r, SURFACE.frame);
      r.fillRect(doorX, glassTop, doorWidth, glassBottom + plinth * 0.6 - glassTop);
      a.fillStyle = cssHex(scaleHex(interior, 0.4));
      a.fillRect(doorX + doorWidth * 0.16, glassTop + glassHeight * 0.08, doorWidth * 0.68, glassHeight * 0.46);
      use(r, SURFACE.glass);
      r.fillRect(doorX + doorWidth * 0.16, glassTop + glassHeight * 0.08, doorWidth * 0.68, glassHeight * 0.46);
      e.fillStyle = cssHex(scaleHex(interior, 0.3));
      e.fillRect(doorX + doorWidth * 0.16, glassTop + glassHeight * 0.08, doorWidth * 0.68, glassHeight * 0.46);
    }

    // Tiled plinth, and the grime that always collects on it.
    a.fillStyle = '#231e19';
    a.fillRect(bayX, glassBottom, bayWidth, plinth);
    a.fillStyle = 'rgba(255,250,240,0.06)';
    a.fillRect(bayX, glassBottom, bayWidth, Math.max(1, plinth * 0.14));
    use(r, SURFACE.plinth);
    r.fillRect(bayX, glassBottom, bayWidth, plinth);

    // Stepped-out stall: crates and trays on the pavement side, painted rather
    // than modelled because a market's clutter is a texture at 40 km/h.
    if (rng() < spec.stall) {
      const stallHeight = plinth * 1.9;
      const stallTop = height - plinth * 0.2 - stallHeight;
      a.fillStyle = cssHex(scaleHex(mixHex(shopPaint, neon, 0.4), 1.35));
      a.fillRect(bayX + bayWidth * 0.04, stallTop, bayWidth * 0.92, stallHeight);
      // The stall is the one thing on this sheet that steps out over the
      // pavement, so it is the highest point in the relief.
      use(r, SURFACE.stall);
      r.fillRect(bayX + bayWidth * 0.04, stallTop, bayWidth * 0.92, stallHeight);
      for (let crate = 0; crate < 4; crate++) {
        const cx = bayX + bayWidth * (0.06 + crate * 0.23);
        a.fillStyle = `rgba(20,15,12,${0.2 + rng() * 0.35})`;
        a.fillRect(cx, stallTop, bayWidth * 0.19, stallHeight);
        use(r, SURFACE.stall, { h: crate % 2 ? 0.05 : -0.05 });
        r.fillRect(cx, stallTop, bayWidth * 0.19, stallHeight);
      }
      e.fillStyle = cssHex(scaleHex(neon, 0.22));
      e.fillRect(bayX + bayWidth * 0.04, stallTop, bayWidth * 0.92, Math.max(1, height * 0.01));
    }
  }

  return { albedo, glow, relief };
}

/** Tar, gravel and felt seams. One sheet for the whole city. */
function paintRoof(size, seed) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const { canvas: relief, ctx: r } = makeRelief(size, size);
  const rng = mulberry32(seed);
  ctx.fillStyle = '#2b2926';
  ctx.fillRect(0, 0, size, size);
  use(r, SURFACE.felt);
  r.fillRect(0, 0, size, size);
  // Gravel. In relief this is the whole point of a roof: 2,600 chips of grit
  // that a low sun rakes across, which is what a parapet view is looking at.
  for (let i = 0; i < 2600; i++) {
    const shade = 20 + Math.floor(rng() * 46);
    const x = rng() * size;
    const y = rng() * size;
    const grit = size * (0.002 + rng() * 0.006);
    ctx.fillStyle = `rgba(${shade + 8},${shade + 4},${shade},${0.25 + rng() * 0.4})`;
    ctx.fillRect(x, y, grit, grit);
    use(r, SURFACE.felt, { h: 0.06 + rng() * 0.12, r: -0.1 });
    r.fillRect(x, y, grit, grit);
  }
  // Felt seams every quarter sheet, and a puddle stain or two.
  ctx.strokeStyle = 'rgba(16,15,14,0.55)';
  ctx.lineWidth = Math.max(1, size * 0.006);
  use(r, SURFACE.seam);
  r.strokeStyle = r.fillStyle;
  r.lineWidth = Math.max(1, size * 0.01);
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (size / 4) * i);
    ctx.lineTo(size, (size / 4) * i);
    ctx.stroke();
    r.beginPath();
    r.moveTo(0, (size / 4) * i);
    r.lineTo(size, (size / 4) * i);
    r.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const rad = size * (0.05 + rng() * 0.09);
    const puddle = ctx.createRadialGradient(x, y, 0, x, y, rad);
    puddle.addColorStop(0, 'rgba(22,26,28,0.5)');
    puddle.addColorStop(1, 'rgba(22,26,28,0)');
    ctx.fillStyle = puddle;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    // A puddle is a dish, not a stain: it sits low and it is the smoothest
    // thing on the roof, which is what makes it read as standing water.
    const dish = r.createRadialGradient(x, y, 0, x, y, rad);
    dish.addColorStop(0, 'rgba(96,20,0,0.85)');
    dish.addColorStop(1, 'rgba(128,245,0,0)');
    r.fillStyle = dish;
    r.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return { canvas, relief };
}

/**
 * Build the whole M4 texture pool.
 *
 * `scale` shrinks every sheet for the mobile profile. Nothing downstream reads
 * a pixel size — the meshes bake metres into their UVs — so the city looks the
 * same at any scale, only softer.
 */
export function createExpanseFacadeTextures(districts, {
  scale = 1, anisotropy = 8, relief = 1,
} = {}) {
  const wallSize = Math.max(128, Math.round(512 * scale));
  const shopWidth = Math.max(128, Math.round(512 * scale));
  const shopHeight = Math.max(64, Math.round(272 * scale));
  const roofSize = Math.max(64, Math.round(256 * scale));

  // The relief pair is a texture pair per sheet, so it is the first thing to
  // drop when `detailIntensity` says the device cannot afford the pass. The
  // materials fall back to flat, which is exactly M4's look.
  const wantRelief = relief > 0;

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
      // Linear, not sRGB: height and roughness are measurements, and putting a
      // gamma curve through them would bend every slope in the normal map.
      rough: wantRelief ? texture(painted.relief, 1, 1, { srgb: false, anisotropy: 4 }) : null,
      normal: wantRelief ? normalFromRelief(painted.relief, RELIEF_STRENGTH.wall * relief) : null,
    });
    shops.push({
      map: texture(shopPainted.albedo, 1, 1, { anisotropy }),
      emissive: texture(shopPainted.glow, 1, 1, { anisotropy }),
      rough: wantRelief ? texture(shopPainted.relief, 1, 1, { srgb: false, anisotropy: 4 }) : null,
      normal: wantRelief ? normalFromRelief(shopPainted.relief, RELIEF_STRENGTH.shop * relief) : null,
    });
  });

  const roofPainted = paintRoof(roofSize, 0x40f);

  return {
    walls,
    shops,
    roof: texture(roofPainted.canvas, 1, 1, { anisotropy }),
    roofRough: wantRelief ? texture(roofPainted.relief, 1, 1, { srgb: false, anisotropy: 4 }) : null,
    roofNormal: wantRelief ? normalFromRelief(roofPainted.relief, RELIEF_STRENGTH.roof * relief) : null,
    metres: {
      wall: { width: SHEET_WIDTH, height: SHEET_HEIGHT },
      shop: { width: SHOP_SHEET_WIDTH, height: PODIUM_HEIGHT },
      roof: ROOF_SHEET_METRES,
    },
    dispose() {
      for (const set of [...walls, ...shops]) {
        set.map.dispose();
        set.emissive.dispose();
        set.rough?.dispose();
        set.normal?.dispose();
      }
      this.roof.dispose();
      this.roofRough?.dispose();
      this.roofNormal?.dispose();
    },
  };
}
