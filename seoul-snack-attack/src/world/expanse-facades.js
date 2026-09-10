// Seoul Expanse — facades, shopfronts and signage.
//
// M4 of the rebuild. M3 handed over 1,211 grey boxes with a correct silhouette
// and nothing on their surfaces. This module dresses them, and like every other
// generator in the rebuild it is **pure data and 2D maths** — no three.js, no
// canvas, no WebGL — so the Node gate and the runtime consume identical
// records and a bench failure is a game failure.
//
// Three things are decided here, in this order, because each constrains the
// next:
//
//   1. **Paint.** Which colour a building is, from the rule in the colour
//      bible (`districtFacadePaint`) rather than M3's hand-written table.
//   2. **Frame.** Where on the shared facade sheet a building samples, in whole
//      bays and whole storeys, so window rows land on floor lines and no two
//      neighbours align.
//   3. **Furniture.** Awnings, fascia boards, blade signs, banners, roof signs,
//      parapets and air-conditioners — everything that projects. Projection is
//      the part that can break the game, so every projecting element is
//      measured against the same road index the footprints were settled on:
//      anything a van could hit stays inside the pavement, and anything that
//      overhangs the carriageway hangs above `OVERHANG_CLEAR`.
//
// What this module deliberately does not do is invent geometry the massing did
// not authorise. Walls are the volumes M3 already proved clear of the roads;
// this only says how to paint them.
import { mulberry32, tileSeed } from '../core/rng.js';
import { STOREY, KERB_HEIGHT, buildRoadIndex, roadClearance } from './expanse-massing.js';
import { DISTRICTS, districtFacadePaint, mixHex, scaleHex } from './data/color-bible.js';
import { signCellsFor } from './data/expanse-signage.js';

export const FACADE_SEED = 20260912;

/**
 * One window bay. Set equal to the storey pitch so the shared facade sheet is
 * square in metres as well as in pixels — a 512² texture then has the same
 * texel density horizontally and vertically, which is the difference between
 * crisp window reveals and smeared ones on a wall seen at a glancing angle.
 */
export const BAY = STOREY;

/** The upper-facade sheet, in bays and storeys. 8 x 8 = 25.6 x 25.6 m. */
export const SHEET_BAYS = 8;
export const SHEET_STOREYS = 8;
export const SHEET_WIDTH = SHEET_BAYS * BAY;
export const SHEET_HEIGHT = SHEET_STOREYS * STOREY;

/**
 * The shopfront sheet. One tile is two 4 m shop units wide and exactly one
 * podium high, so a ground floor never stretches and a wide plot simply gets
 * more shops rather than wider ones.
 */
export const SHOP_UNIT = 4.0;
export const SHOP_SHEET_UNITS = 2;
export const SHOP_SHEET_WIDTH = SHOP_UNIT * SHOP_SHEET_UNITS;

/** Ground-floor height from the massing. Podiums are always exactly this. */
export const PODIUM_HEIGHT = 4.2;

/**
 * Nothing may overhang a carriageway below this. The pocha truck is 2.7 m wide
 * and under 3 m tall, the on-foot player is 1.8 m, and a delivery scooter is
 * neither — 4.6 m is a real Seoul blade-sign height and clears all three with
 * the margin a road tunnel would give.
 */
export const OVERHANG_CLEAR = 4.6;

/** Ground-level furniture keeps this much pavement clear beyond its outer edge. */
const PAVEMENT_KEEP = 0.45;

/**
 * Per-district facade grammar. `bay` is the frontage rhythm — how wide one
 * window bay reads on the street, which is the single strongest cue that
 * Gimbap Boulevard is not Pocha Alley. Everything else is a probability, and
 * the two that decide how loud a street is are not here at all: they come from
 * the colour bible's own `signChance` / `shopChance`, so retuning a
 * neighbourhood in the bible retunes its signage with it.
 */
const DISTRICT_FACADE_RULES = Object.freeze({
  hills:   { bay: 4.6, awning: 0.30, parapet: 0.35, roofSign: 0.00, ac: 0.20, blade: 0.45 },
  hongdae: { bay: 2.9, awning: 0.80, parapet: 0.62, roofSign: 0.05, ac: 0.72, blade: 1.00 },
  station: { bay: 4.2, awning: 0.35, parapet: 0.78, roofSign: 0.16, ac: 0.45, blade: 0.60 },
  market:  { bay: 3.2, awning: 0.92, parapet: 0.45, roofSign: 0.03, ac: 0.58, blade: 0.85 },
  hangang: { bay: 4.0, awning: 0.48, parapet: 0.55, roofSign: 0.04, ac: 0.38, blade: 0.62 },
  pocha:   { bay: 2.8, awning: 0.88, parapet: 0.40, roofSign: 0.02, ac: 0.70, blade: 0.95 },
});

/**
 * Fascia board over a shopfront: the lit lintel every Korean shop wears. One
 * board per shop unit, never one board per plot — a 30 m frontage carries
 * seven shops and seven boards, and stretching a single 4:1 sign across all of
 * it turns the lettering into a smear. `maxBoards` is where a terrace stops
 * being worth another draw of the atlas.
 */
const FASCIA = Object.freeze({ height: 0.95, project: 0.16, top: 4.05, maxBoards: 4 });

/**
 * Blade sign — the one that faces down the street instead of across it.
 *
 * `aspect` is the tall cell's own 1:4 shape. A board is allowed to be squarer
 * than its cell but never much thinner, or the Hangul stacked down it stretches.
 */
const BLADE = Object.freeze({
  thickness: 0.16, minHeight: 2.2, maxHeight: 5.4, maxProject: 1.35, minProject: 0.55,
  aspect: 5,
});

/** Wall banner: a painted strip, not a box. Cheap, and it fills tall flanks. */
const BANNER = Object.freeze({ width: 0.95, minHeight: 2.6, maxHeight: 4.6, project: 0.07 });

/** Rooftop board. Rare, tall-building only, and the thing you steer by. */
const ROOF_SIGN = Object.freeze({ height: 2.0, thickness: 0.32, minStoreys: 5 });

/**
 * Awning over the pavement. It hangs just under the fascia rather than across
 * the middle of the glass — a shop the player cannot see into is a wall with a
 * sign on it. Depth is always cut back to the real pavement.
 */
const AWNING = Object.freeze({ y: 3.15, drop: 0.3, thickness: 0.09, minDepth: 0.55 });

/** Parapet ring around a flat roof: the cheapest silhouette in the city. */
const PARAPET = Object.freeze({ thickness: 0.26, minHeight: 0.6, maxHeight: 1.05 });

/** Air-conditioners on the flanks. Micro tier — the last thing drawn. */
const AC_UNIT = Object.freeze({ width: 0.78, height: 0.56, depth: 0.36, max: 5 });

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/**
 * The tallest base volume of a building — the one whose roof is the skyline,
 * and therefore the one a parapet and a roof sign belong to.
 */
function crownVolume(building) {
  let crown = null;
  for (const volume of building.volumes) {
    if (volume.tier === 'detail') continue;
    if (!crown || volume.top > crown.top) crown = volume;
  }
  return crown;
}

/**
 * World position of a point on a volume's street-facing wall.
 *
 * The massing builds every box with its local +Z pointing at the street, so
 * `facing = (sin yaw, cos yaw)` is the outward normal and its perpendicular
 * runs across the frontage. `along` slides across the wall, `out` steps off it.
 */
function frontPoint(volume, facing, along, out) {
  const rx = facing.z;
  const rz = -facing.x;
  return {
    x: volume.x + rx * along + facing.x * (volume.depth * 0.5 + out),
    z: volume.z + rz * along + facing.z * (volume.depth * 0.5 + out),
  };
}

/** Same, for the two flank walls: `side` is +1 or -1 across the frontage. */
function flankPoint(volume, facing, side, along, out) {
  const rx = facing.z;
  const rz = -facing.x;
  return {
    x: volume.x + rx * side * (volume.width * 0.5 + out) + facing.x * along,
    z: volume.z + rz * side * (volume.width * 0.5 + out) + facing.z * along,
  };
}

function pickCell(cells, rng) {
  return cells[Math.floor(rng() * cells.length) % cells.length];
}

/**
 * Dress one building.
 *
 * `pavement` is the measured clearance in front of the plot, from the same road
 * index M3 settled the footprints against. Everything that projects is either
 * cut back to it or lifted above `OVERHANG_CLEAR` and allowed over the road.
 */
function dressBuilding(building, palette, rules, pavement, rng) {
  const facing = building.facing;
  const podium = building.volumes[0];
  const crown = crownVolume(building);
  const signs = [];
  const units = [];

  // ---- Paint -------------------------------------------------------------
  // Four paints per district in the bible, each pulled toward that district's
  // signature glow by the bible's own rule. The value jitter is what stops a
  // terrace of the same paint reading as one long wall.
  const paintIndex = Math.floor(rng() * palette.facades.length);
  const tone = 0.88 + rng() * 0.26;
  const paint = districtFacadePaint(palette, paintIndex, tone);

  // ---- Frame -------------------------------------------------------------
  // Whole bays and whole storeys only. A fractional offset would put a window
  // sill halfway through a floor slab on every wall in the city.
  const frame = {
    bay: Math.floor(rng() * SHEET_BAYS),
    storey: Math.floor(rng() * SHEET_STOREYS),
    shop: Math.floor(rng() * SHOP_SHEET_UNITS),
  };

  const bays = Math.max(1, Math.round(building.width / rules.bay));
  const shopUnits = Math.max(1, Math.round(building.width / SHOP_UNIT));
  // Below a bay and a half of frontage a plot is a doorway, not a shop.
  const shop = !!building.shop && building.width >= 3.2;

  // ---- Shopfront ---------------------------------------------------------
  const shopfront = shop ? {
    units: shopUnits,
    // Interior glow behind the glass: the district's own lamp colour. The
    // shop sheet bakes it; the record carries it so the gate can prove no
    // shopfront in the city invents a colour its district does not own.
    glow: palette.lamp,
  } : null;

  const wideCells = signCellsFor('wide', palette.neon);
  const tallCells = signCellsFor('tall', palette.neon);

  // ---- Fascia boards -----------------------------------------------------
  // One board per shop unit across the frontage, each with its own cell, so a
  // terrace reads as a row of businesses rather than as one long sign.
  if (shop && wideCells.length && building.width >= 3.6) {
    const boards = Math.min(FASCIA.maxBoards, shopUnits);
    const pitch = building.width / boards;
    const width = Math.min(pitch - 0.3, FASCIA.height * wideCells[0].aspect);
    for (let i = 0; i < boards && width >= 1.6; i++) {
      if (rng() >= palette.signChance) continue;
      const cell = pickCell(wideCells, rng);
      const along = (i + 0.5) * pitch - building.width * 0.5;
      const centre = frontPoint(podium, facing, along, FASCIA.project * 0.5);
      signs.push({
        kind: 'fascia',
        cell: cell.index,
        cellId: cell.id,
        color: cell.neon,
        x: centre.x, z: centre.z,
        y: FASCIA.top - FASCIA.height * 0.5,
        yaw: building.yaw,
        width, height: FASCIA.height, thickness: FASCIA.project,
        project: FASCIA.project,
        faces: 'front',
        tier: 'base',
      });
    }
  }

  // ---- Blade sign --------------------------------------------------------
  // The sign that makes a Seoul street a Seoul street: it faces down the road
  // rather than across it. It projects, so it is the one element allowed over
  // the carriageway — and only because it hangs above anything driving under.
  const bladeRoom = building.top - OVERHANG_CLEAR - 0.4;
  if (shop && tallCells.length && bladeRoom >= BLADE.minHeight
      && rng() < palette.signChance * rules.blade) {
    const cell = pickCell(tallCells, rng);
    // Cut the projection to whichever is smaller: the sign's own maximum, or
    // the pavement plus the metre of carriageway a 4.6 m soffit may cross.
    const project = clamp(
      Math.min(BLADE.maxProject, Math.max(pavement, 0) + 1.0),
      BLADE.minProject, BLADE.maxProject,
    );
    // A board no thinner than its cell: the Hangul is stacked down it, and a
    // 1:10 board turns every syllable into a letterbox.
    const height = clamp(bladeRoom * (0.45 + rng() * 0.4),
      BLADE.minHeight, Math.min(BLADE.maxHeight, project * BLADE.aspect));
    // Hung off one end of the frontage, the way a shop hangs it off its own
    // party wall rather than out of the middle of its window.
    const side = rng() < 0.5 ? -1 : 1;
    const along = side * Math.max(0, building.width * 0.5 - 0.55);
    const centre = frontPoint(podium, facing, along, project * 0.5);
    signs.push({
      kind: 'blade',
      cell: cell.index,
      cellId: cell.id,
      color: cell.neon,
      x: centre.x, z: centre.z,
      y: OVERHANG_CLEAR + height * 0.5,
      yaw: building.yaw,
      // A blade sign's board lies perpendicular to the frontage: `width` runs
      // out from the wall and `thickness` runs across it.
      width: project, height, thickness: BLADE.thickness,
      project,
      faces: 'flanks',
      tier: 'base',
    });
  }

  // ---- Wall banner -------------------------------------------------------
  if (tallCells.length && building.storeys >= 3 && rng() < palette.signChance * 0.45) {
    const cell = pickCell(tallCells, rng);
    const height = clamp((building.top - 5.4) * 0.5, BANNER.minHeight, BANNER.maxHeight);
    const along = (rng() - 0.5) * Math.max(0, building.width - BANNER.width - 0.6);
    const host = crown && crown.top > 6 ? crown : podium;
    const centre = frontPoint(host, facing, along, BANNER.project * 0.5);
    signs.push({
      kind: 'banner',
      cell: cell.index,
      cellId: cell.id,
      color: cell.neon,
      x: centre.x, z: centre.z,
      y: 5.4 + height * 0.5,
      yaw: building.yaw,
      width: BANNER.width, height, thickness: BANNER.project,
      project: BANNER.project,
      faces: 'front',
      tier: 'detail',
    });
  }

  // ---- Roof sign ---------------------------------------------------------
  if (crown && wideCells.length && building.storeys >= ROOF_SIGN.minStoreys
      && rng() < rules.roofSign) {
    const cell = pickCell(wideCells, rng);
    const width = Math.min(crown.width * 0.85, ROOF_SIGN.height * cell.aspect);
    if (width >= 2.4) {
      signs.push({
        kind: 'roof',
        cell: cell.index,
        cellId: cell.id,
        color: cell.neon,
        x: crown.x, z: crown.z,
        y: crown.top + ROOF_SIGN.height * 0.5 + 0.15,
        yaw: building.yaw,
        width, height: ROOF_SIGN.height, thickness: ROOF_SIGN.thickness,
        project: 0,
        faces: 'both',
        tier: 'base',
      });
    }
  }

  // ---- Awning ------------------------------------------------------------
  // The only element that hangs at head height, so the only one that has to
  // end inside the pavement rather than above the road.
  let awning = null;
  const awningRoom = pavement - PAVEMENT_KEEP;
  if (shop && awningRoom >= AWNING.minDepth && rng() < palette.shopChance * rules.awning) {
    const depth = Math.min(awningRoom, 0.85 + rng() * 0.7);
    const width = Math.max(1.6, building.width - 0.4);
    const centre = frontPoint(podium, facing, 0, depth * 0.5);
    awning = {
      x: centre.x, z: centre.z,
      y: AWNING.y - AWNING.drop * 0.5,
      yaw: building.yaw,
      width, depth, height: AWNING.thickness, drop: AWNING.drop,
      // Canvas, not neon: the district's own light bleached into cloth.
      // Canvas takes one of the district's own neon hues, bleached and dimmed.
      // Per building, not per district: a market row of identical awnings is
      // the one thing that gives a generator away.
      color: scaleHex(
        mixHex(palette.neon[Math.floor(rng() * palette.neon.length)], 0xfff4e2, 0.5),
        0.5 + rng() * 0.24,
      ),
      reach: depth,
      tier: 'detail',
    };
  }

  // ---- Parapet -----------------------------------------------------------
  let parapet = null;
  if (crown && building.storeys >= 2 && rng() < rules.parapet
      && Math.min(crown.width, crown.depth) >= 2.4) {
    parapet = {
      x: crown.x, z: crown.z, yaw: building.yaw,
      width: crown.width, depth: crown.depth,
      base: crown.top,
      height: PARAPET.minHeight + rng() * (PARAPET.maxHeight - PARAPET.minHeight),
      thickness: PARAPET.thickness,
      tier: 'base',
    };
  }

  // ---- Air-conditioners --------------------------------------------------
  // Flank walls only: a unit on the street elevation would be in the awning.
  if (building.storeys >= 2) {
    const wanted = Math.min(AC_UNIT.max, Math.floor(building.storeys * 0.7));
    const host = crown && crown.top > PODIUM_HEIGHT + 1 ? crown : podium;
    for (let i = 0; i < wanted; i++) {
      if (rng() >= rules.ac) continue;
      const side = rng() < 0.5 ? -1 : 1;
      const storey = 1 + Math.floor(rng() * Math.max(1, building.storeys - 1));
      const y = KERB_HEIGHT + PODIUM_HEIGHT + (storey - 1) * STOREY + 1.15;
      if (y + AC_UNIT.height * 0.5 > host.top - 0.3) continue;
      const along = (rng() - 0.5) * Math.max(0, host.depth - AC_UNIT.width - 0.5);
      const point = flankPoint(host, facing, side, along, AC_UNIT.depth * 0.5);
      units.push({
        x: point.x, z: point.z, y,
        yaw: building.yaw,
        // The box is turned side-on: its depth runs across the flank wall.
        width: AC_UNIT.depth, height: AC_UNIT.height, depth: AC_UNIT.width,
        side,
        tier: 'micro',
      });
    }
  }

  return {
    id: building.id,
    chunkId: building.chunkId,
    district: building.district,
    districtId: building.districtId,
    paint,
    paintIndex,
    tone,
    frame,
    bays,
    shop,
    pavement,
    shopfront,
    signs,
    awning,
    parapet,
    units,
  };
}

/**
 * Dress every massed building.
 *
 * @param {object} massing `generateExpanseMassing()` output.
 * @param {object} streets `generateExpanseStreets()` output, for the road index.
 */
export function generateExpanseFacades(massing, streets, seed = FACADE_SEED) {
  const roads = buildRoadIndex(streets);
  const paletteById = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));
  const facades = [];
  const perDistrict = {};
  const perChunk = new Map(massing.grid.chunks.map((chunk) => [chunk.id, {
    id: chunk.id, buildings: 0, signs: 0, baseTriangles: 0, detailTriangles: 0, microTriangles: 0,
  }]));

  const signCounts = { fascia: 0, blade: 0, banner: 0, roof: 0 };
  let awnings = 0;
  let parapets = 0;
  let acUnits = 0;
  let shopfronts = 0;
  let narrowestPavement = Infinity;
  let lowestOverhang = Infinity;
  let deepestAwning = 0;

  massing.buildings.forEach((building, index) => {
    const palette = paletteById[building.districtId] || DISTRICTS[0];
    const rules = DISTRICT_FACADE_RULES[building.districtId] || DISTRICT_FACADE_RULES.station;
    // Measured at the middle of the frontage, which is where an awning hangs.
    const front = frontPoint(building.volumes[0], building.facing, 0, 0);
    const clearance = roadClearance(front.x, front.z, roads);
    // A plot with no road within reach of its front door is an interior plot;
    // it gets the generous pavement it actually has rather than an infinity.
    const pavement = Number.isFinite(clearance) ? clearance : 6;
    if (pavement < narrowestPavement) narrowestPavement = pavement;

    const rng = mulberry32(tileSeed(seed, index, Math.round(building.x * 4)));
    const facade = dressBuilding(building, palette, rules, pavement, rng);
    facades.push(facade);

    for (const sign of facade.signs) {
      signCounts[sign.kind]++;
      if (sign.project > 0.2) {
        lowestOverhang = Math.min(lowestOverhang, sign.y - sign.height * 0.5);
      }
    }
    if (facade.awning) { awnings++; deepestAwning = Math.max(deepestAwning, facade.awning.depth); }
    if (facade.parapet) parapets++;
    if (facade.shopfront) shopfronts++;
    acUnits += facade.units.length;

    const bucket = perDistrict[building.districtId] || {
      buildings: 0, frontage: 0, shopfronts: 0, signs: 0, awnings: 0, parapets: 0,
    };
    bucket.buildings++;
    // Metres of street elevation, not building count: how loud a street is has
    // to be measured per metre of frontage, or a district of wide plots looks
    // noisy simply because each of its buildings carries a row of shops.
    bucket.frontage += building.width;
    if (facade.shopfront) bucket.shopfronts++;
    bucket.signs += facade.signs.length;
    if (facade.awning) bucket.awnings++;
    if (facade.parapet) bucket.parapets++;
    perDistrict[building.districtId] = bucket;

    const chunk = perChunk.get(building.chunkId);
    if (chunk) {
      chunk.buildings++;
      chunk.signs += facade.signs.length;
      for (const sign of facade.signs) {
        const triangles = sign.kind === 'banner' ? 2 : 12;
        if (sign.tier === 'base') chunk.baseTriangles += triangles;
        else chunk.detailTriangles += triangles;
      }
      if (facade.parapet) chunk.baseTriangles += 48;
      if (facade.awning) chunk.detailTriangles += 12;
      chunk.microTriangles += facade.units.length * 12;
    }
  });

  // Runtime triangle accounting. Walls are 8 triangles a volume — the underside
  // of a box standing on the pavement is never drawn — plus a 2-triangle roof
  // cap, which is also the visible setback ledge. The detail tier keeps its
  // full boxes because roof furniture is seen from above.
  const wallTriangles = massing.stats.baseVolumes * 8;
  const capTriangles = massing.stats.baseVolumes * 2;
  const detailBoxTriangles = massing.stats.detailVolumes * 12;
  const signBase = (signCounts.fascia + signCounts.blade + signCounts.roof) * 12;
  const signDetail = signCounts.banner * 2;

  return {
    seed,
    facades,
    byBuilding: new Map(facades.map((facade) => [facade.id, facade])),
    stats: {
      buildings: facades.length,
      shopfronts,
      signs: signCounts.fascia + signCounts.blade + signCounts.banner + signCounts.roof,
      signCounts,
      awnings,
      parapets,
      acUnits,
      narrowestPavement,
      deepestAwning,
      lowestOverhang: Number.isFinite(lowestOverhang) ? lowestOverhang : null,
      wallTriangles,
      capTriangles,
      baseTriangles: wallTriangles + capTriangles + signBase + parapets * 48,
      detailTriangles: detailBoxTriangles + signDetail + awnings * 12,
      microTriangles: acUnits * 12,
      perDistrict,
      perChunk: [...perChunk.values()],
    },
  };
}
