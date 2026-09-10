// Seoul Expanse — greybox massing.
//
// M3 of the rebuild. M1 drew the streets, M2 cut the land into building plots,
// and this module is the first step that has a third dimension: it turns each
// plot into a stack of oriented boxes with a believable silhouette.
//
// One rule governs everything here, and it is what makes the clearance gate
// cheap: **every volume a lot produces is contained inside that lot's own
// footprint prism.** Podiums fill the plot, upper volumes only ever step
// inward, and roof furniture is clamped to what is left. So clearance is
// settled once, on the footprint, before anything is extruded — which is why
// this module trims plots at all rather than inheriting M2's outlines whole:
// M2 reserves a pavement against the road a plot fronts, and a corner plot's
// flank can still land hard against the street it turns onto.
//
// Pure data and 2D math, no three.js and no WebGL: the Node gate and the
// runtime consume identical records, so a bench failure is a game failure.
import { mulberry32, tileSeed } from '../core/rng.js';
import { generateExpanseChunkGrid, chunkAt } from './expanse-chunks.js';

export const MASSING_SEED = 20260911;

/** Floor-to-floor height. Every mass is a whole number of these. */
export const STOREY = 3.2;

/** Ground-floor height, taller than the storeys above it. */
const GROUND_FLOOR = 4.2;

/** Pavement thickness. Buildings stand on it, so their bases start here. */
export const KERB_HEIGHT = 0.12;

/**
 * How much taller a plot gets for the road it fronts. A city reads as a city
 * from a moving car mostly because the big streets are walled higher than the
 * alleys behind them, so this is doing more work than the district palettes.
 */
const CLASS_HEIGHT = Object.freeze({
  ring: 1.24, arterial: 1.12, street: 1.0, alley: 0.86, connector: 1.0,
});

/** Corner plots hold the junction, so they carry a little extra height. */
const CORNER_HEIGHT = 1.1;

/** Share of plots promoted to a local high point, per district. */
const HERO_CHANCE = Object.freeze({
  hills: 0.02, hongdae: 0.03, station: 0.09, market: 0.02, hangang: 0.06, pocha: 0.02,
});
const HERO_HEIGHT = 1.85;

/**
 * A tower is only as slender as its plot allows. Without this a 4.5 m hongdae
 * frontage promoted to hero height becomes a 25 m pencil, which reads as a
 * bug from every angle.
 */
const SLENDERNESS = 1.55;
const MAX_STOREYS = 26;

/** Upper volumes step back from the street; the podium keeps the shopfront. */
const SHAFT_SIDE_SETBACK = 0.35;
const SHAFT_FRONT_SETBACK = 0.45;
const CAP_SIDE_SETBACK = 1.5;
const CAP_FRONT_SETBACK = 1.9;

/** Below this a stepped volume is a sliver, so the step is skipped instead. */
const MIN_VOLUME_SIDE = 2.6;

/** Roof furniture: stair head or tank housing, and how often a roof gets one. */
const ROOF_BOX = Object.freeze({ chance: 0.42, size: 2.6, height: 2.3, margin: 0.9 });

/**
 * Pavement every building must leave between itself and any carriageway it
 * stands next to. It is the brief's deliberate-pinch minimum, and the reason
 * this is enforced here rather than trusted from M2 is corner plots: the lot
 * inset reserves a sidewalk against the road a plot *fronts*, and a corner
 * plot's flank can still end up hard against the street it turns onto.
 */
const PAVEMENT_MIN = 1.8;

/** A footprint trimmed below this is not a building, so it is left alone. */
const MIN_PLOT_SIDE = 2.8;

/**
 * The pavement a plot must end up with to be built at all. A handful of plots
 * are wedged where the streets around them leave no room, and a gap in a
 * terrace is a better answer than a doorway the player cannot walk past.
 */
const PAVEMENT_FLOOR = 1.5;

/** Carriageways further away than this are across the block, not a frontage. */
const FRONTAGE_REACH = 12;

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

// ---------------------------------------------------------------------------
// Footprint settling
// ---------------------------------------------------------------------------

const ROAD_CELL = 32;

/** Coarse grid of carriageway segments, so a plot tests only its own street. */
function roadIndex(streets) {
  const cells = new Map();
  for (const edge of streets.edges) {
    if (edge.bridge) continue;
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-6) continue;
      const s = { ax: a.x, az: a.z, bx: b.x, bz: b.z, half: edge.width * 0.5 };
      const reach = s.half + FRONTAGE_REACH;
      for (let x = Math.floor((Math.min(s.ax, s.bx) - reach) / ROAD_CELL); x <= Math.floor((Math.max(s.ax, s.bx) + reach) / ROAD_CELL); x++) {
        for (let z = Math.floor((Math.min(s.az, s.bz) - reach) / ROAD_CELL); z <= Math.floor((Math.max(s.az, s.bz) + reach) / ROAD_CELL); z++) {
          const key = `${x}:${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(s);
        }
      }
    }
  }
  return cells;
}

/**
 * The road index, for anything downstream that has to know how much pavement a
 * plot ended up with. M4's shopfronts hang awnings and blade signs over that
 * pavement and may not reach the asphalt, so it measures the same grid the
 * footprints were settled against rather than building a second one that could
 * disagree.
 */
export function buildRoadIndex(streets) {
  return roadIndex(streets);
}

/**
 * Metres of clear ground between (x, z) and the nearest carriageway edge, or
 * `Infinity` where no road is within reach. Negative means inside the asphalt.
 */
export function roadClearance(x, z, roads) {
  const cell = roads.get(`${Math.floor(x / ROAD_CELL)}:${Math.floor(z / ROAD_CELL)}`) || [];
  let clearance = Infinity;
  for (const s of cell) {
    const near = nearestOnSegment(x, z, s);
    if (near.distance > s.half + FRONTAGE_REACH) continue;
    clearance = Math.min(clearance, near.distance - s.half);
  }
  return clearance;
}

function nearestOnSegment(px, pz, s) {
  const abx = s.bx - s.ax;
  const abz = s.bz - s.az;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq < 1e-9 ? 0
    : clamp(((px - s.ax) * abx + (pz - s.az) * abz) / lenSq, 0, 1);
  const x = s.ax + abx * t;
  const z = s.az + abz * t;
  return { x, z, distance: Math.hypot(px - x, pz - z) };
}

/**
 * Trim a plot until every corner keeps a walkable pavement.
 *
 * The plot is an oriented rectangle, so instead of moving corners — which
 * would stop it being one — this works out how far each of its four sides has
 * to come in, and rebuilds the rectangle from the result. A corner that has to
 * move away from a road is pushed by whichever of the two sides it belongs to
 * points most directly away from that road.
 */
function settleFootprint(lot, roads) {
  const alongX = Math.cos(lot.yaw);
  const alongZ = -Math.sin(lot.yaw);
  const inX = lot.facing.x;
  const inZ = lot.facing.z;
  let aPos = 0; let aNeg = 0; let bPos = 0; let bNeg = 0;
  let trimmed = false;

  for (let pass = 0; pass < 5; pass++) {
    const halfWidth = lot.width * 0.5 - (aPos + aNeg) * 0.5;
    const halfDepth = lot.depth * 0.5 - (bPos + bNeg) * 0.5;
    if (halfWidth * 2 < MIN_PLOT_SIDE || halfDepth * 2 < MIN_PLOT_SIDE) break;
    const cx = lot.center.x + alongX * (aNeg - aPos) * 0.5 + inX * (bNeg - bPos) * 0.5;
    const cz = lot.center.z + alongZ * (aNeg - aPos) * 0.5 + inZ * (bNeg - bPos) * 0.5;

    let worst = 0;
    let apply = null;
    for (const sa of [1, -1]) {
      for (const sb of [1, -1]) {
        const px = cx + alongX * sa * halfWidth + inX * sb * halfDepth;
        const pz = cz + alongZ * sa * halfWidth + inZ * sb * halfDepth;
        const cell = roads.get(`${Math.floor(px / ROAD_CELL)}:${Math.floor(pz / ROAD_CELL)}`) || [];
        for (const s of cell) {
          const near = nearestOnSegment(px, pz, s);
          if (near.distance > s.half + FRONTAGE_REACH) continue;
          const deficit = s.half + PAVEMENT_MIN - near.distance;
          if (deficit <= worst) continue;
          // Unit vector from the carriageway out to this corner: the direction
          // the corner has to travel.
          let nx = px - near.x;
          let nz = pz - near.z;
          const length = Math.hypot(nx, nz) || 1;
          nx /= length; nz /= length;
          const alpha = -sa * (alongX * nx + alongZ * nz);
          const beta = -sb * (inX * nx + inZ * nz);
          if (alpha <= 1e-3 && beta <= 1e-3) continue;
          worst = deficit;
          apply = alpha >= beta
            ? { side: sa > 0 ? 'aPos' : 'aNeg', amount: deficit / alpha }
            : { side: sb > 0 ? 'bPos' : 'bNeg', amount: deficit / beta };
        }
      }
    }
    if (!apply) break;
    trimmed = true;
    const amount = Math.min(apply.amount, 6);
    if (apply.side === 'aPos') aPos += amount;
    else if (apply.side === 'aNeg') aNeg += amount;
    else if (apply.side === 'bPos') bPos += amount;
    else bNeg += amount;
  }

  if (!trimmed) return { lot, trimmed: false, ok: true };

  const trimA = aPos + aNeg;
  const trimB = bPos + bNeg;
  const width = Math.max(MIN_PLOT_SIDE, lot.width - trimA);
  const depth = Math.max(MIN_PLOT_SIDE, lot.depth - trimB);
  // Trimming one side moves the centre half as far. Where the minimum-size
  // clamp handed some of the trim back, the shift is scaled down with it, so a
  // plot held at its floor stays centred on what survived instead of sliding
  // off the end of its own frontage.
  const scaleA = trimA > 1e-6 ? (lot.width - width) / trimA : 0;
  const scaleB = trimB > 1e-6 ? (lot.depth - depth) / trimB : 0;
  const shiftA = (aNeg - aPos) * 0.5 * scaleA;
  const shiftB = (bNeg - bPos) * 0.5 * scaleB;
  const center = {
    x: lot.center.x + alongX * shiftA + inX * shiftB,
    z: lot.center.z + alongZ * shiftA + inZ * shiftB,
  };
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const corners = [
    { x: center.x + alongX * halfWidth + inX * halfDepth, z: center.z + alongZ * halfWidth + inZ * halfDepth },
    { x: center.x - alongX * halfWidth + inX * halfDepth, z: center.z - alongZ * halfWidth + inZ * halfDepth },
    { x: center.x - alongX * halfWidth - inX * halfDepth, z: center.z - alongZ * halfWidth - inZ * halfDepth },
    { x: center.x + alongX * halfWidth - inX * halfDepth, z: center.z + alongZ * halfWidth - inZ * halfDepth },
  ];
  // Measure the settled plot rather than assume the trim worked: a plot held at
  // MIN_PLOT_SIDE stopped shrinking before it was clear.
  let pavement = Infinity;
  for (const corner of corners) {
    const cell = roads.get(`${Math.floor(corner.x / ROAD_CELL)}:${Math.floor(corner.z / ROAD_CELL)}`) || [];
    for (const s of cell) {
      const near = nearestOnSegment(corner.x, corner.z, s);
      if (near.distance > s.half + FRONTAGE_REACH) continue;
      pavement = Math.min(pavement, near.distance - s.half);
    }
  }
  return {
    lot: { ...lot, width, depth, center, corners },
    trimmed: true,
    ok: pavement >= PAVEMENT_FLOOR,
  };
}

/**
 * One oriented box. `yaw` rotates the box about Y so that its local +Z points
 * at the street, matching the lot's own facing — the runtime can build this
 * with a plain BoxGeometry and a single rotation.
 */
function volume(lot, { width, depth, height, base, back = 0, tier = 'base' }) {
  // `back` slides the box away from the street along the lot's inward normal,
  // which is how a setback keeps its front face parallel to the frontage.
  const inX = -lot.facing.x;
  const inZ = -lot.facing.z;
  return {
    x: lot.center.x + inX * back,
    z: lot.center.z + inZ * back,
    y: base + height * 0.5,
    yaw: lot.yaw,
    width,
    depth,
    height,
    base,
    top: base + height,
    tier,
  };
}

/**
 * Storeys for one plot: district height from the colour bible, modulated by
 * the road it fronts and its own footprint, then snapped to whole floors.
 */
function storeysFor(lot, rng) {
  const districtHero = HERO_CHANCE[lot.districtId] ?? 0.03;
  let metres = lot.height
    * (CLASS_HEIGHT[lot.streetClass] ?? 1)
    * (lot.corner ? CORNER_HEIGHT : 1);
  const hero = rng() < districtHero;
  if (hero) metres *= HERO_HEIGHT;
  const slenderCap = Math.max(1, Math.floor(Math.min(lot.width, lot.depth) * SLENDERNESS));
  const storeys = clamp(Math.round(metres / STOREY), 1, Math.min(MAX_STOREYS, slenderCap));
  return { storeys, hero: hero && storeys >= 4 };
}

/** Stack one plot into podium, shaft, optional cap and optional roof box. */
function massLot(lot, rng) {
  const { storeys, hero } = storeysFor(lot, rng);
  const height = storeys === 1 ? GROUND_FLOOR : GROUND_FLOOR + (storeys - 1) * STOREY;
  const volumes = [];

  const podiumHeight = storeys === 1 ? height : GROUND_FLOOR;
  volumes.push(volume(lot, {
    width: lot.width, depth: lot.depth, height: podiumHeight, base: KERB_HEIGHT,
  }));

  let top = KERB_HEIGHT + podiumHeight;
  const remaining = height - podiumHeight;
  if (remaining > 0.5) {
    const shaftWidth = lot.width - SHAFT_SIDE_SETBACK * 2;
    const shaftDepth = lot.depth - SHAFT_FRONT_SETBACK;
    const stepped = shaftWidth >= MIN_VOLUME_SIDE && shaftDepth >= MIN_VOLUME_SIDE;
    // A cap only exists where there is enough building left above the shaft to
    // read as a step rather than a lip.
    const capStoreys = hero && storeys >= 8 ? Math.max(2, Math.round(storeys * 0.28)) : 0;
    const capHeight = capStoreys * STOREY;
    const shaftHeight = remaining - capHeight;

    if (shaftHeight > 0.5) {
      volumes.push(volume(lot, {
        width: stepped ? shaftWidth : lot.width,
        depth: stepped ? shaftDepth : lot.depth,
        height: shaftHeight,
        base: top,
        back: stepped ? SHAFT_FRONT_SETBACK * 0.5 : 0,
      }));
      top += shaftHeight;
    }
    if (capHeight > 0.5) {
      const capWidth = lot.width - CAP_SIDE_SETBACK * 2;
      const capDepth = lot.depth - CAP_FRONT_SETBACK;
      const capFits = capWidth >= MIN_VOLUME_SIDE && capDepth >= MIN_VOLUME_SIDE;
      volumes.push(volume(lot, {
        width: capFits ? capWidth : Math.max(MIN_VOLUME_SIDE, lot.width - SHAFT_SIDE_SETBACK * 2),
        depth: capFits ? capDepth : Math.max(MIN_VOLUME_SIDE, lot.depth - SHAFT_FRONT_SETBACK),
        height: capHeight,
        base: top,
        back: capFits ? CAP_FRONT_SETBACK * 0.5 : SHAFT_FRONT_SETBACK * 0.5,
      }));
      top += capHeight;
    }
  }

  // Roof furniture rides the detail tier: it is the first thing worth dropping
  // at distance and the last thing worth drawing on a phone.
  const roofSide = Math.min(
    ROOF_BOX.size,
    lot.width - ROOF_BOX.margin * 2,
    lot.depth - ROOF_BOX.margin * 2,
  );
  if (storeys >= 2 && roofSide >= 1.4 && rng() < ROOF_BOX.chance) {
    volumes.push(volume(lot, {
      width: roofSide, depth: roofSide, height: ROOF_BOX.height, base: top,
      back: (lot.depth - roofSide) * 0.5 - ROOF_BOX.margin,
      tier: 'detail',
    }));
  }

  return { storeys, height, volumes, top };
}

/**
 * Extrude every building lot into greybox massing, grouped by the visual chunk
 * that will own its draw call.
 *
 * @param {object} city   `generateExpanseBlocks()` output.
 * @param {object} streets `generateExpanseStreets()` output, for world bounds.
 */
export function generateExpanseMassing(city, streets, seed = MASSING_SEED, {
  cols = 4, rows = 3,
} = {}) {
  const grid = generateExpanseChunkGrid(streets.bounds, cols, rows);
  const buildings = [];
  const perDistrict = {};
  const perChunk = new Map(grid.chunks.map((chunk) => [chunk.id, {
    id: chunk.id, buildings: 0, volumes: 0, triangles: 0, tallest: 0,
  }]));

  let volumeCount = 0;
  let detailVolumes = 0;
  let tallest = 0;
  let storeyTotal = 0;
  let floorArea = 0;
  let trimmedPlots = 0;
  let trimmedArea = 0;
  let droppedPlots = 0;

  const roads = roadIndex(streets);
  city.lots.forEach((sourceLot, index) => {
    const settled = settleFootprint(sourceLot, roads);
    const lot = settled.lot;
    if (!settled.ok) { droppedPlots++; return; }
    if (settled.trimmed) {
      trimmedPlots++;
      trimmedArea += sourceLot.width * sourceLot.depth - lot.width * lot.depth;
    }
    // The seed is taken from the plot as M2 cut it, so a footprint trim never
    // reshuffles the heights of the buildings around it.
    const rng = mulberry32(tileSeed(seed, index, Math.round(sourceLot.center.x * 4)));
    const { storeys, height, volumes, top } = massLot(lot, rng);
    const chunk = chunkAt(grid, lot.center.x, lot.center.z);
    const building = {
      id: `bld_${index}`,
      lotId: lot.id,
      blockId: lot.blockId,
      district: lot.district,
      districtId: lot.districtId,
      chunkId: chunk.id,
      x: lot.center.x,
      z: lot.center.z,
      yaw: lot.yaw,
      facing: { x: lot.facing.x, z: lot.facing.z },
      footprint: lot.corners.map((c) => ({ x: c.x, z: c.z })),
      width: lot.width,
      depth: lot.depth,
      streetClass: lot.streetClass,
      corner: !!lot.corner,
      shop: !!lot.shop,
      storeys,
      height,
      top,
      volumes,
    };
    buildings.push(building);

    volumeCount += volumes.length;
    detailVolumes += volumes.filter((v) => v.tier === 'detail').length;
    storeyTotal += storeys;
    floorArea += lot.width * lot.depth * storeys;
    if (top > tallest) tallest = top;

    const bucket = perDistrict[lot.districtId] || { buildings: 0, storeys: 0, tallest: 0 };
    bucket.buildings++;
    bucket.storeys += storeys;
    if (top > bucket.tallest) bucket.tallest = top;
    perDistrict[lot.districtId] = bucket;

    const chunkStats = perChunk.get(chunk.id);
    chunkStats.buildings++;
    chunkStats.volumes += volumes.length;
    chunkStats.triangles += volumes.length * 12;
    if (top > chunkStats.tallest) chunkStats.tallest = top;
  });

  // Pavement: one raised pad per block, from the kerb line inward. It is what
  // gives every street a kerb without paving 452 roads individually, and it is
  // the surface the lots were set back from in the first place.
  const pavements = city.blocks
    .filter((block) => block.kerb && block.kerb.length >= 3)
    .map((block) => ({
      id: `pave_${block.id}`,
      blockId: block.id,
      districtId: block.districtId,
      district: block.district,
      chunkId: chunkAt(grid, block.centre.x, block.centre.z).id,
      polygon: block.kerb,
      height: KERB_HEIGHT,
    }));

  const heights = buildings.map((b) => b.top).sort((a, b) => a - b);

  return {
    seed,
    grid,
    buildings,
    pavements,
    stats: {
      buildings: buildings.length,
      lots: city.lots.length,
      trimmedPlots,
      trimmedArea,
      droppedPlots,
      volumes: volumeCount,
      detailVolumes,
      baseVolumes: volumeCount - detailVolumes,
      // A greybox box is 12 triangles. The runtime merges them, so this is the
      // whole massing triangle budget for the city.
      triangles: volumeCount * 12,
      baseTriangles: (volumeCount - detailVolumes) * 12,
      pavements: pavements.length,
      tallest,
      medianHeight: heights.length ? heights[Math.floor(heights.length / 2)] : 0,
      meanStoreys: buildings.length ? storeyTotal / buildings.length : 0,
      floorArea,
      perDistrict,
      perChunk: [...perChunk.values()],
    },
  };
}
