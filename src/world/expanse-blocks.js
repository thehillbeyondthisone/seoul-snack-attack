// Seoul Expanse — city blocks and building lots.
//
// M2 of the rebuild. The street network encloses land; this module works out
// what that land is and cuts it into frontages. It is the step every previous
// attempt at this world skipped, which is why they all produced a road plan
// standing in an empty field.
//
// The pipeline is:
//
//   1. Planarise a working copy of the network. Face-finding needs a graph
//      whose edges meet only at junctions, and the approved layout contains
//      one inherited crossing. The shipped road graph is never modified.
//   2. Walk the half-edges to recover the bounded faces. Those faces are the
//      city blocks — no block is authored anywhere.
//   3. Inset each block by its own surrounding road widths plus a sidewalk, so
//      a block on the 22 m ring pulls back further than one on a 5 m alley.
//   4. Subdivide the inset boundary into lots: a corner plot at every turn, a
//      run of frontages between them, and a courtyard left over when the block
//      is deeper than two buildings.
//
// Pure data + three.js math. The Node gate and the runtime read the same
// records, so a bench failure is a game failure.
import * as THREE from 'three';
import { mulberry32, tileSeed } from '../core/rng.js';
import { expanseDistrictAt, RIVER } from './expanse-layout.js';
import { DISTRICT_BY_ID } from './data/color-bible.js';

export const BLOCKS_SEED = 20260910;

/** Pavement between a carriageway edge and the first building line. */
const SIDEWALK = Object.freeze({
  ring: 4.0, arterial: 3.5, street: 2.8, alley: 1.8, connector: 2.8,
});

/**
 * Lot rules per district, in metres. `frontage` is the street-facing width a
 * single building occupies and `depth` how far back it reaches — together they
 * are what "reasonably spaced buildings" actually means, measured rather than
 * eyeballed.
 */
export const DISTRICT_LOT_RULES = Object.freeze({
  hills: { frontage: [11, 17], depth: [9, 14], courtyard: 10 },
  hongdae: { frontage: [4.5, 7], depth: [7, 12], courtyard: 7 },
  station: { frontage: [14, 28], depth: [16, 26], courtyard: 14 },
  market: { frontage: [4, 6.5], depth: [7, 14], courtyard: 7 },
  hangang: { frontage: [14, 22], depth: [14, 20], courtyard: 16 },
  pocha: { frontage: [4, 6.5], depth: [6, 11], courtyard: 6 },
});

/** A block smaller than this is pavement, not a building plot. */
const MIN_BLOCK_AREA = 90;

/** Below this the block is solid: one building fills it, with no courtyard. */
const SOLID_BLOCK_INRADIUS = 1.15;

/** Collapse polyline detail finer than this when simplifying a block outline. */
const SIMPLIFY_TOLERANCE = 1.3;

// ---------------------------------------------------------------------------
// 2D helpers, all in the XZ plane
// ---------------------------------------------------------------------------

function signedArea(polygon) {
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    sum += polygon[j].x * polygon[i].z - polygon[i].x * polygon[j].z;
  }
  return sum / 2;
}

function perimeterOf(polygon) {
  let total = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    total += Math.hypot(polygon[i].x - polygon[j].x, polygon[i].z - polygon[j].z);
  }
  return total;
}

function centroidOf(polygon) {
  let x = 0;
  let z = 0;
  for (const p of polygon) { x += p.x; z += p.z; }
  return { x: x / polygon.length, z: z / polygon.length };
}

function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x; const zi = polygon[i].z;
    const xj = polygon[j].x; const zj = polygon[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function segmentIntersection(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1x = bx - ax; const d1z = bz - az;
  const d2x = dx - cx; const d2z = dz - cz;
  const denom = d1x * d2z - d1z * d2x;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((cx - ax) * d2z - (cz - az) * d2x) / denom;
  const u = ((cx - ax) * d1z - (cz - az) * d1x) / denom;
  if (t <= 1e-7 || t >= 1 - 1e-7 || u <= 1e-7 || u >= 1 - 1e-7) return null;
  return { t, u, x: ax + d1x * t, z: az + d1z * t };
}

const riverRect = {
  minX: RIVER.minX, maxX: RIVER.maxX, minZ: RIVER.minZ, maxZ: RIVER.maxZ,
};
function inRiver(x, z) {
  return x > riverRect.minX && x < riverRect.maxX && z > riverRect.minZ && z < riverRect.maxZ;
}

/** Roughly how much of a face is river, sampled on its bounding box. */
function waterFraction(polygon) {
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  if (maxX <= riverRect.minX || minX >= riverRect.maxX) return 0;
  if (maxZ <= riverRect.minZ || minZ >= riverRect.maxZ) return 0;
  const step = Math.max(2, Math.min(maxX - minX, maxZ - minZ) / 14);
  let inside = 0;
  let wet = 0;
  for (let x = minX; x <= maxX; x += step) {
    for (let z = minZ; z <= maxZ; z += step) {
      if (!pointInPolygon(x, z, polygon)) continue;
      inside++;
      if (inRiver(x, z)) wet++;
    }
  }
  return inside ? wet / inside : 0;
}

// ---------------------------------------------------------------------------
// 1. Planarise a working copy
// ---------------------------------------------------------------------------

/**
 * Split any pair of roads that cross away from a junction. Operates on clones,
 * so the routeable graph the game drives on is untouched — this only makes the
 * face walk well defined.
 */
function planarise(streets) {
  let nodes = streets.nodes.map((n) => ({
    id: n.id, position: n.position.clone(), skeleton: !!n.skeleton,
  }));
  let edges = streets.edges.map((e) => ({
    id: e.id,
    a: e.a,
    b: e.b,
    points: e.points.map((p) => p.clone()),
    width: e.width,
    streetClass: e.streetClass || e.kind,
    districtId: e.districtId,
  }));
  let split = 0;

  // Weld coincident junctions first. The face walk orders half-edges by the
  // bearing they leave a node on, and a zero-length road has no bearing at
  // all — one of those (spine_south, inherited from the approved layout) is
  // enough to scramble the rotation at its node and silently lose every face
  // around it. Welding happens on this working copy only.
  const weld = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (weld.has(nodes[i].id)) continue;
    for (let k = i + 1; k < nodes.length; k++) {
      if (weld.has(nodes[k].id)) continue;
      if (nodes[i].position.distanceTo(nodes[k].position) < 0.5) {
        weld.set(nodes[k].id, nodes[i].id);
      }
    }
  }
  let welded = 0;
  if (weld.size) {
    const resolve = (id) => weld.get(id) ?? id;
    nodes = nodes.filter((n) => !weld.has(n.id));
    edges = edges
      .map((e) => ({ ...e, a: resolve(e.a), b: resolve(e.b) }))
      .filter((e) => e.a !== e.b);
    welded = weld.size;
  }

  for (let pass = 0; pass < 8; pass++) {
    let found = null;
    outer:
    for (let i = 0; i < edges.length && !found; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e = edges[i];
        const f = edges[j];
        if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
        for (let p = 1; p < e.points.length; p++) {
          for (let q = 1; q < f.points.length; q++) {
            const hit = segmentIntersection(
              e.points[p - 1].x, e.points[p - 1].z, e.points[p].x, e.points[p].z,
              f.points[q - 1].x, f.points[q - 1].z, f.points[q].x, f.points[q].z,
            );
            if (!hit) continue;
            found = { i, j, p, q, hit };
            break outer;
          }
        }
      }
    }
    if (!found) break;

    const id = `xing_${split++}`;
    const position = new THREE.Vector3(found.hit.x, 0, found.hit.z);
    nodes.push({ id, position, skeleton: false, crossing: true });
    const cut = (edge, segmentIndex, t) => {
      const at = new THREE.Vector3(found.hit.x, 0, found.hit.z);
      const head = [...edge.points.slice(0, segmentIndex), at.clone()];
      const tail = [at.clone(), ...edge.points.slice(segmentIndex)];
      return [
        { ...edge, id: `${edge.id}#0`, a: edge.a, b: id, points: head },
        { ...edge, id: `${edge.id}#1`, a: id, b: edge.b, points: tail },
      ];
    };
    const replacements = [
      ...cut(edges[found.i], found.p, found.hit.t),
      ...cut(edges[found.j], found.q, found.hit.u),
    ];
    edges = edges.filter((_, index) => index !== found.i && index !== found.j);
    edges.push(...replacements);
  }

  return { nodes, edges, split, welded };
}

// ---------------------------------------------------------------------------
// 2. Face walk
// ---------------------------------------------------------------------------

function buildHalfEdges(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const half = [];
  for (const edge of edges) {
    for (const dir of [1, -1]) {
      const points = dir > 0 ? edge.points : [...edge.points].reverse();
      const origin = dir > 0 ? edge.a : edge.b;
      const target = dir > 0 ? edge.b : edge.a;
      half.push({
        key: `${edge.id}:${dir}`,
        twinKey: `${edge.id}:${-dir}`,
        edge,
        origin,
        target,
        points,
        bearing: Math.atan2(points[1].z - points[0].z, points[1].x - points[0].x),
      });
    }
  }
  const byKey = new Map(half.map((h) => [h.key, h]));
  const around = new Map(nodes.map((n) => [n.id, []]));
  for (const h of half) around.get(h.origin)?.push(h);
  for (const list of around.values()) list.sort((a, b) => a.bearing - b.bearing);
  return { byId, byKey, around, half };
}

/**
 * Recover the bounded faces of the planar subdivision. Stepping to the
 * neighbour immediately clockwise of the twin keeps each walk hugging one
 * face; the single face that comes back with negative area is the outside
 * world and is discarded.
 */
function findFaces(nodes, edges) {
  const { byKey, around, half } = buildHalfEdges(nodes, edges);
  const nextOf = (h) => {
    const twin = byKey.get(h.twinKey);
    const list = around.get(twin.origin);
    const index = list.indexOf(twin);
    return list[(index - 1 + list.length) % list.length];
  };

  const visited = new Set();
  const faces = [];
  for (const start of half) {
    if (visited.has(start.key)) continue;
    const walk = [];
    let current = start;
    let guard = 0;
    while (!visited.has(current.key) && guard++ < 4000) {
      visited.add(current.key);
      walk.push(current);
      current = nextOf(current);
    }
    if (current !== start || walk.length < 3) continue;

    const polygon = [];
    const owners = [];
    for (const h of walk) {
      for (let i = 0; i < h.points.length - 1; i++) {
        const p = h.points[i];
        const last = polygon[polygon.length - 1];
        if (last && Math.hypot(last.x - p.x, last.z - p.z) < 1e-6) continue;
        polygon.push({ x: p.x, z: p.z });
        owners.push(h.edge);
      }
    }
    if (polygon.length < 3) continue;
    faces.push({ polygon, owners, area: signedArea(polygon) });
  }
  return faces;
}

// ---------------------------------------------------------------------------
// 3. Inset
// ---------------------------------------------------------------------------

/** Drop vertices that only describe polyline curvature, not a real corner. */
function simplify(polygon, owners, tolerance = SIMPLIFY_TOLERANCE) {
  let pts = polygon.map((p, i) => ({ ...p, owner: owners[i] }));
  let changed = true;
  while (changed && pts.length > 4) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const curr = pts[i];
      const next = pts[(i + 1) % pts.length];
      // Only merge inside one road: a change of owner is a real corner.
      if (prev.owner !== curr.owner || curr.owner !== next.owner) continue;
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const deviation = Math.abs((curr.x - prev.x) * dz - (curr.z - prev.z) * dx) / len;
      if (deviation > tolerance) continue;
      pts = pts.filter((_, index) => index !== i);
      changed = true;
      break;
    }
  }
  return pts;
}

function insetFor(edge) {
  const pavement = SIDEWALK[edge.streetClass] ?? SIDEWALK.street;
  return edge.width * 0.5 + pavement;
}

/** Offset to the kerb face only: half the carriageway, no pavement. */
function kerbFor(edge) {
  return edge.width * 0.5;
}

/**
 * Offset every boundary segment inward by its own road's half-width plus a
 * sidewalk, then re-intersect. A block facing the ring pulls back 15 m; the
 * same block's alley side pulls back 4.5 m.
 *
 * `distanceFor` exists so the same offset can be run to the kerb line instead
 * of the building line — M3 paves the strip between the two, and a kerb built
 * from a different routine than the building setback would not line up.
 */
function insetPolygon(points, uniform = null, distanceFor = insetFor) {
  const n = points.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return null;
    // Counter-clockwise winding puts the interior to the left of travel.
    const nx = -dz / len;
    const nz = dx / len;
    const d = uniform ?? distanceFor(a.owner);
    lines.push({
      px: a.x + nx * d, pz: a.z + nz * d, dx: dx / len, dz: dz / len, owner: a.owner,
    });
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n];
    const curr = lines[i];
    const vertex = points[i];
    const denom = prev.dx * curr.dz - prev.dz * curr.dx;
    // denom is sin(turn). Two offset lines that are nearly parallel meet
    // hundreds of metres away, which drags a block corner clean across the
    // map — so anything under ~6° is treated as straight, and any surviving
    // mitre is clamped to a sane distance from the corner it belongs to.
    const fallback = () => ({
      x: (prev.px + curr.px) * 0.5, z: (prev.pz + curr.pz) * 0.5, owner: curr.owner,
    });
    if (Math.abs(denom) < 0.105) { out.push(fallback()); continue; }
    const t = ((curr.px - prev.px) * curr.dz - (curr.pz - prev.pz) * curr.dx) / denom;
    const x = prev.px + prev.dx * t;
    const z = prev.pz + prev.dz * t;
    const limit = Math.max(distanceFor(prev.owner), distanceFor(curr.owner)) * 3 + 2;
    if (Math.hypot(x - vertex.x, z - vertex.z) > limit) { out.push(fallback()); continue; }
    out.push({ x, z, owner: curr.owner });
  }
  return out;
}

function selfIntersects(polygon) {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = polygon[i]; const b = polygon[(i + 1) % n];
      const c = polygon[j]; const d = polygon[(j + 1) % n];
      if (segmentIntersection(a.x, a.z, b.x, b.z, c.x, c.z, d.x, d.z)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 4. Lots
// ---------------------------------------------------------------------------

function lotRectangle(originX, originZ, alongX, alongZ, inX, inZ, width, depth) {
  const p0 = { x: originX, z: originZ };
  const p1 = { x: originX + alongX * width, z: originZ + alongZ * width };
  const p2 = { x: p1.x + inX * depth, z: p1.z + inZ * depth };
  const p3 = { x: p0.x + inX * depth, z: p0.z + inZ * depth };
  return [p0, p1, p2, p3];
}

function cutLotsAlong(block, inset, rng, lots) {
  const n = inset.length;
  const rules = DISTRICT_LOT_RULES[block.districtId] || DISTRICT_LOT_RULES.market;
  const palette = DISTRICT_BY_ID[block.districtId];
  const maxDepth = Math.min(rules.depth[1], block.inradius * 0.92);
  if (maxDepth < 4) return;

  const emit = (corners, meta) => {
    if (corners.some((c) => inRiver(c.x, c.z))) return;
    const center = centroidOf(corners);
    lots.push({
      id: `lot_${block.id}_${lots.length}`,
      blockId: block.id,
      district: block.district,
      districtId: block.districtId,
      corners,
      center,
      height: palette
        ? palette.height[0] + rng() * (palette.height[1] - palette.height[0])
        : 10,
      shop: rng() < (palette?.shopChance ?? 0.6),
      ...meta,
    });
  };

  // Every edge's depth is settled before anything is placed, because the space
  // a corner plot needs at a vertex is set by the depth of the road it turns
  // *into*, not the one it runs along. Sizing the reserve from the current
  // edge is what made half the plots overlap their neighbours.
  const sides = [];
  for (let i = 0; i < n; i++) {
    const a = inset[i];
    const b = inset[(i + 1) % n];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const districtId = expanseDistrictAt((a.x + b.x) / 2, (a.z + b.z) / 2).id;
    const edgeRules = DISTRICT_LOT_RULES[districtId] || rules;
    const depth = Math.min(
      edgeRules.depth[0] + rng() * (edgeRules.depth[1] - edgeRules.depth[0]),
      maxDepth,
    );
    sides.push({
      a,
      b,
      len,
      alongX: len > 1e-6 ? dx / len : 1,
      alongZ: len > 1e-6 ? dz / len : 0,
      owner: a.owner,
      rules: edgeRules,
      depth,
    });
  }

  // Clamp each side's depth against the side that faces it. A block's inradius
  // is an average: a block can average 18 m of half-width and still pinch to
  // 10 m somewhere, and there the two frontages grow straight through each
  // other. Measuring the facing wall directly is what stops that.
  for (let i = 0; i < n; i++) {
    const side = sides[i];
    if (side.len < 1e-6) continue;
    const inX = -side.alongZ;
    const inZ = side.alongX;
    let clearance = Infinity;
    for (const t of [0.2, 0.5, 0.8]) {
      const px = side.a.x + side.alongX * side.len * t;
      const pz = side.a.z + side.alongZ * side.len * t;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const other = sides[j];
        if (other.len < 1e-6) continue;
        const otherInX = -other.alongZ;
        const otherInZ = other.alongX;
        // Only a wall that faces back can box this frontage in; a side running
        // alongside or away from it is a corner, not a constraint.
        if (inX * otherInX + inZ * otherInZ > -0.15) continue;
        const d2x = other.b.x - other.a.x;
        const d2z = other.b.z - other.a.z;
        const denom = inX * d2z - inZ * d2x;
        if (Math.abs(denom) < 1e-9) continue;
        const hit = ((other.a.x - px) * d2z - (other.a.z - pz) * d2x) / denom;
        const along = ((other.a.x - px) * inZ - (other.a.z - pz) * inX) / denom;
        if (hit <= 0.5 || along < -0.05 || along > 1.05) continue;
        if (hit < clearance) clearance = hit;
      }
    }
    if (Number.isFinite(clearance)) {
      side.depth = Math.min(side.depth, clearance * 0.5 - 0.4);
    }
  }

  // A little slack over the neighbour's depth covers corners that turn more
  // sharply than a right angle.
  const CORNER_SLACK = 1.08;
  // Past this the outline really turns a corner and needs a corner plot.
  // Below it the vertex is only polyline detail — an arc, or a slight kink —
  // and reserving a whole plot at every one of those was piling four to twenty
  // full-depth corner plots on top of each other inside a single block.
  const CORNER_ANGLE = (25 * Math.PI) / 180;

  /** Signed turn from the side before `index` onto the side at `index`. */
  const turnAt = (index) => {
    const before = sides[(index - 1 + n) % n];
    const here = sides[index];
    const cross = before.alongX * here.alongZ - before.alongZ * here.alongX;
    const dot = before.alongX * here.alongX + before.alongZ * here.alongZ;
    return Math.atan2(cross, dot);
  };

  /**
   * How much frontage to give up at a vertex. A convex turn swings the
   * building line inward, so neighbouring plots converge behind the street and
   * need a wedge of clearance; a reflex turn opens a gap by itself.
   */
  const reserveAt = (index, depth, neighbourDepth) => {
    const turn = turnAt(index);
    if (Math.abs(turn) >= CORNER_ANGLE) return Math.max(depth, neighbourDepth) * CORNER_SLACK;
    if (turn > 0) return depth * Math.tan(turn / 2) + 0.3;
    return 0.3;
  };

  for (let i = 0; i < n; i++) {
    const side = sides[i];
    if (side.len < 1e-6 || side.depth < 3.5) continue;
    const previous = sides[(i - 1 + n) % n];
    const next = sides[(i + 1) % n];
    const inX = -side.alongZ;
    const inZ = side.alongX;
    const startCorner = Math.abs(turnAt(i)) >= CORNER_ANGLE;
    const startReserve = reserveAt(i, side.depth, previous.depth);
    const endReserve = reserveAt((i + 1) % n, side.depth, next.depth);
    const meta = {
      side: i,
      depth: side.depth,
      facing: { x: -inX, z: -inZ },
      yaw: Math.atan2(-inX, -inZ),
      streetClass: side.owner.streetClass,
      streetWidth: side.owner.width,
    };
    const place = (offset, width, corner) => emit(lotRectangle(
      side.a.x + side.alongX * offset, side.a.z + side.alongZ * offset,
      side.alongX, side.alongZ, inX, inZ, width, side.depth,
    ), { ...meta, width, corner });

    const runEnd = side.len - endReserve;
    // The corner plot never runs past the reserve the *next* corner needs.
    // Letting a short side become one full-length corner plot was what still
    // drove neighbouring corners through each other.
    if (startCorner) {
      const cornerWidth = Math.min(startReserve, runEnd);
      if (cornerWidth >= 3.4) place(0, cornerWidth, true);
    }
    const [minFront, maxFront] = side.rules.frontage;
    let cursor = startReserve;
    let guard = 0;
    while (cursor < runEnd - minFront * 0.7 && guard++ < 90) {
      let width = minFront + rng() * (maxFront - minFront);
      const remaining = runEnd - cursor;
      // Absorb a leftover sliver, but never into a plot wider than the
      // district allows — otherwise the last one is an implausible slab.
      if (remaining - width < minFront * 0.7 && remaining <= maxFront * 1.3) width = remaining;
      width = Math.min(width, remaining);
      if (width < Math.max(3.5, minFront * 0.7)) break;
      place(cursor, width, false);
      cursor += width;
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Settle
// ---------------------------------------------------------------------------

/** Rebuild a lot's footprint after its depth changes or it steps back. */
function reshape(lot, depth, setback = 0) {
  const inX = -lot.facing.x;
  const inZ = -lot.facing.z;
  const [p0, p1] = lot.corners;
  const a = { x: p0.x + inX * setback, z: p0.z + inZ * setback };
  const b = { x: p1.x + inX * setback, z: p1.z + inZ * setback };
  lot.depth = depth;
  lot.corners = [
    a, b,
    { x: b.x + inX * depth, z: b.z + inZ * depth },
    { x: a.x + inX * depth, z: a.z + inZ * depth },
  ];
  lot.center = centroidOf(lot.corners);
}

function separationAxes(corners) {
  const out = [];
  for (let i = 0; i < 2; i++) {
    const a = corners[i];
    const b = corners[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    out.push({ x: -dz / len, z: dx / len });
  }
  return out;
}

/** How deeply two footprints interpenetrate; <= 0 means they merely touch. */
function overlapDepth(a, b) {
  let smallest = Infinity;
  for (const axis of [...separationAxes(a), ...separationAxes(b)]) {
    let aMin = Infinity; let aMax = -Infinity; let bMin = Infinity; let bMax = -Infinity;
    for (const c of a) { const v = c.x * axis.x + c.z * axis.z; if (v < aMin) aMin = v; if (v > aMax) aMax = v; }
    for (const c of b) { const v = c.x * axis.x + c.z * axis.z; if (v < bMin) bMin = v; if (v > bMax) bMax = v; }
    const depth = Math.min(aMax, bMax) - Math.max(aMin, bMin);
    if (depth < smallest) smallest = depth;
    if (smallest <= 0) return 0;
  }
  return smallest;
}

/**
 * Last pass over the plots: step anything that ended up in a carriageway back
 * onto its block, then thin out the few footprints that still interpenetrate.
 * Every case this catches is a corner of the outline geometry too awkward to
 * be worth a rule of its own, and a plot that cannot be settled is dropped —
 * a hole in a terrace is survivable, a building in the road is not.
 */
/** Cell size of the carriageway lookup grid, in metres. */
const ROAD_CELL = 24;

function distanceToSegment(px, pz, s) {
  const abx = s.bx - s.ax; const abz = s.bz - s.az;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * abx + (pz - s.az) * abz) / lenSq));
  return Math.hypot(px - (s.ax + abx * t), pz - (s.az + abz * t));
}

/**
 * Bucket every carriageway segment into a coarse grid, so a point can be
 * tested against the handful of roads near it rather than all 452.
 */
function roadIndex(streets) {
  const roads = new Map();
  for (const edge of streets.edges) {
    for (let i = 1; i < edge.points.length; i++) {
      const s = {
        ax: edge.points[i - 1].x, az: edge.points[i - 1].z,
        bx: edge.points[i].x, bz: edge.points[i].z,
        half: edge.width / 2,
      };
      const minX = Math.min(s.ax, s.bx) - s.half - 4;
      const maxX = Math.max(s.ax, s.bx) + s.half + 4;
      const minZ = Math.min(s.az, s.bz) - s.half - 4;
      const maxZ = Math.max(s.az, s.bz) + s.half + 4;
      for (let x = Math.floor(minX / ROAD_CELL); x <= Math.floor(maxX / ROAD_CELL); x++) {
        for (let z = Math.floor(minZ / ROAD_CELL); z <= Math.floor(maxZ / ROAD_CELL); z++) {
          const key = `${x}:${z}`;
          if (!roads.has(key)) roads.set(key, []);
          roads.get(key).push(s);
        }
      }
    }
  }
  return roads;
}

const roadsNear = (roads, x, z) =>
  roads.get(`${Math.floor(x / ROAD_CELL)}:${Math.floor(z / ROAD_CELL)}`) || [];

/**
 * Push kerb vertices back out of the asphalt.
 *
 * `insetPolygon` averages the two offset lines wherever a corner is too shallow
 * to mitre, which lands a little short of the true corner. At the building line
 * a sidewalk's worth of slack absorbs that; at the kerb line there is no slack,
 * so a shallow corner can put the pavement several metres into the road it was
 * offset from. Nudging the vertex out along the road normal is enough, and it
 * moves nothing the lots were measured against.
 */
function settleKerbs(blocks, streets) {
  const roads = roadIndex(streets);
  const intrusionAt = (x, z) => {
    let deepest = null;
    let depth = 0;
    for (const s of roadsNear(roads, x, z)) {
      const intrusion = s.half - distanceToSegment(x, z, s);
      if (intrusion > depth) { depth = intrusion; deepest = s; }
    }
    return { depth, deepest };
  };
  let nudged = 0;
  let pulled = 0;
  let dropped = 0;
  let worst = 0;
  for (const block of blocks) {
    if (!block.kerb) continue;
    const before = block.kerb.map((p) => ({ ...p }));
    for (const vertex of block.kerb) {
      // Pushing clear of one road can push into the next, so this iterates
      // rather than nudging once; a shallow corner is surrounded by at most a
      // few carriageways and settles in two or three passes.
      for (let attempt = 0; attempt < 8; attempt++) {
        const { depth, deepest } = intrusionAt(vertex.x, vertex.z);
        if (!deepest || depth <= 0.05) break;
        if (attempt === 0) { nudged++; if (depth > worst) worst = depth; }
        // Away from the carriageway centreline, along the perpendicular through
        // the closest point on it.
        const abx = deepest.bx - deepest.ax; const abz = deepest.bz - deepest.az;
        const lenSq = abx * abx + abz * abz;
        const t = lenSq < 1e-9 ? 0
          : Math.max(0, Math.min(1, ((vertex.x - deepest.ax) * abx + (vertex.z - deepest.az) * abz) / lenSq));
        let nx = vertex.x - (deepest.ax + abx * t);
        let nz = vertex.z - (deepest.az + abz * t);
        const length = Math.hypot(nx, nz);
        if (length < 1e-6) { nx = -abz; nz = abx; }
        const scale = (depth + 0.06) / (length < 1e-6 ? Math.hypot(abx, abz) : length);
        vertex.x += nx * scale;
        vertex.z += nz * scale;
      }

      // A vertex at a junction corner can be inside two overlapping
      // carriageways at once, where no nearby point is clear of both. The
      // pavement genuinely does not exist there, so retreat into the block
      // until it does and let the pad lose that corner.
      if (intrusionAt(vertex.x, vertex.z).depth > 0.05) {
        const toCentre = Math.hypot(block.centre.x - vertex.x, block.centre.z - vertex.z);
        if (toCentre > 1e-6) {
          const stepX = (block.centre.x - vertex.x) / toCentre;
          const stepZ = (block.centre.z - vertex.z) / toCentre;
          const start = { x: vertex.x, z: vertex.z };
          let cleared = false;
          for (let step = 0.5; step <= Math.min(8, toCentre * 0.8); step += 0.5) {
            const x = start.x + stepX * step;
            const z = start.z + stepZ * step;
            if (intrusionAt(x, z).depth > 0.05) continue;
            vertex.x = x;
            vertex.z = z;
            cleared = true;
            break;
          }
          if (cleared) pulled++;
        }
      }
    }
    // Retreating a corner can fold a tight outline; a pad is worth less than a
    // pad that renders correctly, so an outline that tangles keeps its original
    // shape and is then judged on its own merits below.
    if (selfIntersects(block.kerb)) block.kerb = before;
    // A sliver wedged between two junctions has corners no amount of nudging
    // frees. Rather than ship a pavement lying in an arterial, that block goes
    // without one: it keeps its buildings and loses only its kerb.
    if (block.kerb.some((v) => intrusionAt(v.x, v.z).depth > 0.05)) {
      block.kerb = null;
      dropped++;
    }
  }
  return { nudged, pulled, dropped, worst };
}

function settleLots(lots, streets) {
  const CELL = ROAD_CELL;
  const roads = roadIndex(streets);
  const intrusionOf = (lot) => {
    let worst = 0;
    for (const c of lot.corners) {
      for (const s of roads.get(`${Math.floor(c.x / CELL)}:${Math.floor(c.z / CELL)}`) || []) {
        const intrusion = s.half - distanceToSegment(c.x, c.z, s);
        if (intrusion > worst) worst = intrusion;
      }
    }
    return worst;
  };

  const settled = [];
  let stepped = 0;
  let dropped = 0;
  for (const lot of lots) {
    let ok = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      const intrusion = intrusionOf(lot);
      if (intrusion <= 0.2) break;
      if (lot.depth - intrusion - 0.25 < 3.5) { ok = false; break; }
      // Step the whole plot back off the carriageway and shorten it to match,
      // so its back wall does not move into the block behind.
      reshape(lot, lot.depth - intrusion - 0.25, intrusion + 0.25);
      stepped++;
      if (attempt === 2 && intrusionOf(lot) > 0.2) ok = false;
    }
    if (ok) {
      // And it must actually front something. A plot the settle pass pushed
      // away from its street is a building with no door.
      const fx = lot.center.x + lot.facing.x * (lot.depth / 2 + 3);
      const fz = lot.center.z + lot.facing.z * (lot.depth / 2 + 3);
      let nearest = Infinity;
      for (let x = Math.floor((fx - 12) / CELL); x <= Math.floor((fx + 12) / CELL); x++) {
        for (let z = Math.floor((fz - 12) / CELL); z <= Math.floor((fz + 12) / CELL); z++) {
          for (const s of roads.get(`${x}:${z}`) || []) {
            const d = distanceToSegment(fx, fz, s) - s.half;
            if (d < nearest) nearest = d;
          }
        }
      }
      if (nearest > 6) ok = false;
    }
    if (ok) settled.push(lot); else dropped++;
  }

  // Then the remaining interpenetrations, biggest plot wins.
  const buckets = new Map();
  settled.forEach((lot, index) => {
    const seen = new Set();
    for (const c of lot.corners) {
      const key = `${Math.floor(c.x / CELL)}:${Math.floor(c.z / CELL)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(index);
    }
  });
  const area = (lot) => lot.width * lot.depth;
  let trimmed = 0;
  const doomed = new Set();
  for (let pass = 0; pass < 3; pass++) {
    let touched = false;
    const tested = new Set();
    for (const bucket of buckets.values()) {
      for (let i = 0; i < bucket.length; i++) {
        for (let k = i + 1; k < bucket.length; k++) {
          const [x, y] = bucket[i] < bucket[k] ? [bucket[i], bucket[k]] : [bucket[k], bucket[i]];
          const pair = `${x}|${y}`;
          if (tested.has(pair) || doomed.has(x) || doomed.has(y)) continue;
          tested.add(pair);
          const depth = overlapDepth(settled[x].corners, settled[y].corners);
          if (depth <= 0.5) continue;
          const loser = area(settled[x]) <= area(settled[y]) ? x : y;
          const lot = settled[loser];
          if (lot.depth - depth - 0.15 < 3.5) { doomed.add(loser); }
          else { reshape(lot, lot.depth - depth - 0.15); trimmed++; }
          touched = true;
        }
      }
    }
    if (!touched) break;
  }
  const kept = settled.filter((_, index) => !doomed.has(index));
  return { lots: kept, stepped, trimmed, dropped: dropped + doomed.size };
}

// ---------------------------------------------------------------------------

/**
 * Turn the street network into city blocks and building lots.
 */
export function generateExpanseBlocks(streets, seed = BLOCKS_SEED) {
  const planar = planarise(streets);
  const faces = findFaces(planar.nodes, planar.edges);
  // Euler's formula for a connected planar graph: the walk must recover every
  // bounded face. Losing one silently is losing a piece of the city.
  const expectedFaces = planar.edges.length - planar.nodes.length + 1;

  // Exactly one walk encloses the rest of the plane; it is the only face whose
  // winding runs the other way.
  const bounded = faces.filter((f) => f.area > 0);
  const outer = faces.length - bounded.length;

  const blocks = [];
  const lots = [];
  const rejected = { tiny: 0, water: 0, collapsed: 0, tangled: 0 };

  bounded.sort((a, b) => b.area - a.area);
  for (const face of bounded) {
    if (face.area < MIN_BLOCK_AREA) { rejected.tiny++; continue; }

    const centre = centroidOf(face.polygon);
    // Centroid alone is not enough: the faces flanking the channel between two
    // bridges have their centroid on land and most of their area in the water.
    if (waterFraction(face.polygon) > 0.35) { rejected.water++; continue; }

    const simplified = simplify(face.polygon, face.owners);
    if (simplified.length < 3) { rejected.collapsed++; continue; }

    // Per-edge insetting can fold a long or awkward face in on itself. Rather
    // than lose the land, fall back to the gentlest uniform inset that still
    // clears the widest road on the boundary.
    let inset = insetPolygon(simplified);
    let insetArea = inset ? signedArea(inset) : 0;
    if (!inset || insetArea < MIN_BLOCK_AREA || selfIntersects(inset)) {
      // Uniform, and uniformly the WIDEST setback on the boundary. Taking the
      // narrowest instead pulls the block line inside the ring's carriageway:
      // a block that fronts both a 22 m ring and a 5 m alley must clear the
      // ring, and losing a strip of the alley frontage is the cheap side of
      // that trade.
      inset = insetPolygon(simplified, Math.max(
        ...simplified.map((p) => insetFor(p.owner)),
      ));
      insetArea = inset ? signedArea(inset) : 0;
    }
    if (!inset || insetArea < MIN_BLOCK_AREA) { rejected.collapsed++; continue; }
    if (selfIntersects(inset)) { rejected.tangled++; continue; }

    // The kerb line is the same offset stopped at the carriageway edge, so the
    // pavement M3 lays is exactly the strip the lot rules already reserved.
    let kerb = insetPolygon(simplified, null, kerbFor);
    if (!kerb || signedArea(kerb) < MIN_BLOCK_AREA || selfIntersects(kerb)) {
      kerb = insetPolygon(simplified, Math.max(...simplified.map((p) => kerbFor(p.owner))));
    }
    if (!kerb || signedArea(kerb) < MIN_BLOCK_AREA || selfIntersects(kerb)) kerb = inset;

    const districtId = expanseDistrictAt(centre.x, centre.z).id;
    const inradius = (2 * insetArea) / Math.max(1, perimeterOf(inset));
    const rules = DISTRICT_LOT_RULES[districtId] || DISTRICT_LOT_RULES.market;
    const block = {
      id: `blk_${blocks.length}`,
      polygon: face.polygon,
      outline: simplified.map((p) => ({ x: p.x, z: p.z })),
      kerb: kerb.map((p) => ({ x: p.x, z: p.z })),
      inset: inset.map((p) => ({ x: p.x, z: p.z })),
      area: face.area,
      insetArea,
      inradius,
      district: expanseDistrictAt(centre.x, centre.z).index,
      districtId,
      centre,
      // Deep blocks keep an interior the frontages never reach; that is where
      // the back alleys, parking and service yards go at M3.
      courtyard: inradius > rules.depth[1] * SOLID_BLOCK_INRADIUS,
      fronts: [...new Set(simplified.map((p) => p.owner.streetClass))],
      lots: 0,
    };

    const before = lots.length;
    const rng = mulberry32(tileSeed(seed, blocks.length, Math.round(centre.x)));
    cutLotsAlong(block, inset, rng, lots);
    block.lots = lots.length - before;
    // A long ribbon block can have its centroid in another district entirely,
    // so name the block after where its buildings actually stand.
    if (block.lots) {
      const tally = new Map();
      for (let i = before; i < lots.length; i++) {
        tally.set(lots[i].districtId, (tally.get(lots[i].districtId) || 0) + 1);
      }
      let best = block.districtId;
      let bestCount = -1;
      for (const [id, count] of tally) if (count > bestCount) { best = id; bestCount = count; }
      block.districtId = best;
    }
    // Fat blocks keep land no frontage can reach; ribbons do not. Only the fat
    // ones are a gap worth reporting.
    block.oversized = block.insetArea > 12000 && block.inradius > 34;
    blocks.push(block);
  }

  const kerbs = settleKerbs(blocks, streets);
  const settle = settleLots(lots, streets);
  lots.length = 0;
  lots.push(...settle.lots);
  for (const block of blocks) block.lots = 0;
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  for (const lot of lots) {
    const owner = blockById.get(lot.blockId);
    if (owner) owner.lots++;
  }

  const perDistrict = {};
  for (const lot of lots) {
    const bucket = perDistrict[lot.districtId] || { lots: 0, shops: 0, blocks: 0 };
    bucket.lots++;
    if (lot.shop) bucket.shops++;
    perDistrict[lot.districtId] = bucket;
  }
  for (const block of blocks) {
    const bucket = perDistrict[block.districtId] || { lots: 0, shops: 0, blocks: 0 };
    bucket.blocks++;
    perDistrict[block.districtId] = bucket;
  }

  const areas = blocks.map((b) => b.area).sort((a, b) => a - b);
  const footprints = lots.map((l) => l.width * l.depth).sort((a, b) => a - b);

  return {
    seed,
    blocks,
    lots,
    stats: {
      blocks: blocks.length,
      lots: lots.length,
      shops: lots.filter((l) => l.shop).length,
      corners: lots.filter((l) => l.corner).length,
      courtyards: blocks.filter((b) => b.courtyard).length,
      oversized: blocks.filter((b) => b.oversized).length,
      oversizedArea: blocks.filter((b) => b.oversized).reduce((t, b) => t + b.insetArea, 0),
      blockArea: blocks.reduce((t, b) => t + b.area, 0),
      outerFaces: outer,
      expectedFaces,
      foundFaces: faces.length - outer,
      weldedNodes: planar.welded,
      crossingsSplit: planar.split,
      settled: { stepped: settle.stepped, trimmed: settle.trimmed, dropped: settle.dropped },
      kerbs: {
        nudged: kerbs.nudged, pulled: kerbs.pulled, dropped: kerbs.dropped, worst: kerbs.worst,
      },
      rejected,
      medianBlockArea: areas.length ? areas[Math.floor(areas.length / 2)] : 0,
      largestBlockArea: areas.length ? areas[areas.length - 1] : 0,
      medianFootprint: footprints.length ? footprints[Math.floor(footprints.length / 2)] : 0,
      builtArea: footprints.reduce((sum, a) => sum + a, 0),
      perDistrict,
    },
  };
}
