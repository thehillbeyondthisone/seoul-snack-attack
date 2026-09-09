// Seoul Expanse — interior street generator.
//
// The approved 25-node skeleton (ring, spine, three river crossings) is the
// arterial layer and is never edited here: this module consumes it, cuts
// junctions into it, and grows a deterministic street network on both sides of
// the ring so the kilometre-scale map stops being a racetrack in a field.
//
// Three rules exist because breaking them is what killed the previous attempts:
//
//   1. Every edge this module emits is a real paved carriageway. There is no
//      routing-only connector class, so a route can never be planned down
//      something the mesh builder did not pave.
//   2. Skeleton geometry is preserved exactly. Cutting a junction into an edge
//      interpolates along its own polyline, so a ring arc keeps its authored
//      curvature and its radius gate still passes.
//   3. The ring is the least permeable road on the map. Side streets meet
//      arterials wherever they arrive, but they may only reach the ring at its
//      sparse authored junctions — that is what keeps the fast loop fast.
//
// Pure data + three.js math, no WebGL: the Node gate and the runtime consume
// the identical records, so a bench failure is a game failure.
import * as THREE from 'three';
import { mulberry32, tileSeed } from '../core/rng.js';
import { expanseDistrictAt, RIVER } from './expanse-layout.js';

export const STREETS_SEED = 20260909;

/**
 * How far a street *intersection* must stay off a skeleton centreline, beyond
 * that road's own half-width. A side street is not pushed away from an
 * arterial by this: it runs up and terminates on it as a T-junction. The band
 * only stops a four-way crossing being planted inside a carriageway.
 */
const SKELETON_BAND = Object.freeze({ ring: 18, arterial: 13, street: 11 });

/** No street may come nearer the water than this. */
const RIVER_MARGIN = 15;

/**
 * Streets grow on both sides of the ring. The loop is a belt through the city,
 * not its coastline: confining blocks to its interior threw away 270,000 m² of
 * the map and was a large part of why the world read as empty. Nothing crosses
 * it at grade — an outer pocket reaches the network through the ring's own
 * junctions.
 */
const PERIMETER_MARGIN = 26;

/** Two junctions on one stretch of skeleton may not be nearer than this. */
const MIN_JUNCTION_GAP = 19;

/** How far past a blocked lattice node to keep looking for the arterial. */
const TOUCH_OVERSHOOT = 30;

/**
 * Shallowest angle at which a side street may meet an arterial. Below this the
 * street runs alongside the carriageway instead of joining it: the junction is
 * unusable, the block it encloses is a sliver, and on the plan it reads as a
 * road dangling in open ground.
 */
const MIN_JUNCTION_ANGLE = Math.cos((90 - 26) * Math.PI / 180);

/** Longest rescue stitch from a skeleton junction into a stranded pocket. */
const MAX_CONNECTOR = 130;

/**
 * Per-district street rules. `angle` is the grid bearing in radians, `spacing`
 * is [along-grid, across-grid] metres, `warp` bends whole streets so nothing
 * reads as graph paper, and `arterialEvery` sets the rhythm of the local
 * hierarchy. These are the numbers that make "reasonably spaced" measurable.
 */
export const DISTRICT_STREET_RULES = Object.freeze({
  hills: {
    angle: 0.12, spacing: [64, 50], jitter: 0.17, warp: 10,
    arterialEvery: 3, alley: false,
    widths: { arterial: 12, street: 9, alley: 0 },
  },
  hongdae: {
    angle: -0.28, spacing: [36, 30], jitter: 0.20, warp: 6,
    arterialEvery: 4, alley: true,
    widths: { arterial: 12, street: 7.5, alley: 5 },
  },
  station: {
    angle: 0.03, spacing: [58, 47], jitter: 0.07, warp: 3,
    arterialEvery: 2, alley: false,
    widths: { arterial: 16, street: 11, alley: 0 },
  },
  market: {
    angle: 0.34, spacing: [42, 34], jitter: 0.18, warp: 7,
    arterialEvery: 3, alley: true,
    widths: { arterial: 13, street: 8.5, alley: 5.5 },
  },
  hangang: {
    angle: 0.0, spacing: [72, 50], jitter: 0.09, warp: 8,
    arterialEvery: 2, alley: false,
    widths: { arterial: 14, street: 10, alley: 0 },
  },
  pocha: {
    angle: -0.42, spacing: [34, 28], jitter: 0.22, warp: 6,
    arterialEvery: 4, alley: true,
    widths: { arterial: 12, street: 7, alley: 5 },
  },
});

/**
 * How often a skeleton edge offers a junction of its own, before side streets
 * cut theirs. On the ring this is the *only* way in, and 150 m is the number
 * that keeps it a belt road rather than a high street.
 */
function junctionSpacingFor(edge) {
  if (edge.bridge) return Infinity;
  if (edge.kind === 'ring') return 150;
  if (edge.width >= 14) return 90;
  return 74;
}

function bandFor(edge) {
  if (edge.kind === 'ring') return SKELETON_BAND.ring;
  if (edge.width >= 14) return SKELETON_BAND.arterial;
  return SKELETON_BAND.street;
}

// ---------------------------------------------------------------------------
// Geometry helpers. All 2D in the XZ plane; Y is elevation and rides along.
// ---------------------------------------------------------------------------

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i - 1].distanceTo(points[i]);
  return total;
}

/** Point at arc-length `d` along a polyline, interpolating Y with it. */
function pointAtDistance(points, d) {
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = a.distanceTo(b);
    if (len < 1e-9) continue;
    if (walked + len >= d) return a.clone().lerp(b, (d - walked) / len);
    walked += len;
  }
  return points[points.length - 1].clone();
}

/** The sub-polyline between two arc-lengths, keeping every original vertex. */
function slicePolyline(points, from, to) {
  const out = [pointAtDistance(points, from)];
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = a.distanceTo(b);
    if (len < 1e-9) continue;
    const end = walked + len;
    if (end > from && end < to) out.push(b.clone());
    walked = end;
  }
  out.push(pointAtDistance(points, to));
  return out;
}

function pointSegmentDistance2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.hypot(dx, dz);
}

function segmentsCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1x = bx - ax; const d1z = bz - az;
  const d2x = dx - cx; const d2z = dz - cz;
  const denom = d1x * d2z - d1z * d2x;
  if (Math.abs(denom) < 1e-12) return false;
  const t = ((cx - ax) * d2z - (cz - az) * d2x) / denom;
  const u = ((cx - ax) * d1z - (cz - az) * d1x) / denom;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

const riverRect = {
  minX: RIVER.minX - RIVER_MARGIN, maxX: RIVER.maxX + RIVER_MARGIN,
  minZ: RIVER.minZ - RIVER_MARGIN, maxZ: RIVER.maxZ + RIVER_MARGIN,
};

function inRiver(x, z) {
  return x >= riverRect.minX && x <= riverRect.maxX && z >= riverRect.minZ && z <= riverRect.maxZ;
}

function segmentHitsRiver(a, b) {
  if (inRiver(a.x, a.z) || inRiver(b.x, b.z)) return true;
  const corners = [
    [riverRect.minX, riverRect.minZ], [riverRect.maxX, riverRect.minZ],
    [riverRect.maxX, riverRect.maxZ], [riverRect.minX, riverRect.maxZ],
  ];
  for (let i = 0; i < 4; i++) {
    const [cx, cz] = corners[i];
    const [dx, dz] = corners[(i + 1) % 4];
    if (segmentsCross(a.x, a.z, b.x, b.z, cx, cz, dx, dz)) return true;
  }
  return false;
}

/**
 * Chain the ring edges into one closed polygon. Used by the plan renderer and
 * to tell inner blocks from outer ones; the network itself never crosses it.
 */
function buildRingPolygon(edges) {
  const ring = edges.filter((e) => e.kind === 'ring');
  if (!ring.length) return [];
  const remaining = new Set(ring.map((e) => e.id));
  const first = ring[0];
  remaining.delete(first.id);
  const polygon = first.points.map((p) => p.clone());
  let endNode = first.b;
  while (remaining.size) {
    let next = null;
    let reversed = false;
    for (const edge of ring) {
      if (!remaining.has(edge.id)) continue;
      if (edge.a === endNode) { next = edge; reversed = false; break; }
      if (edge.b === endNode) { next = edge; reversed = true; break; }
    }
    if (!next) break;
    remaining.delete(next.id);
    const points = reversed ? [...next.points].reverse() : next.points;
    for (let i = 1; i < points.length; i++) polygon.push(points[i].clone());
    endNode = reversed ? next.a : next.b;
  }
  return polygon;
}

/**
 * A service road just inside the world boundary. It does three jobs at once:
 * it gives the outermost streets something to terminate on instead of
 * dead-ending into the void, it closes the outer band of blocks, and it is the
 * containment edge the map has been missing. It clears the ring by 44 m at the
 * nearest point and never meets the river.
 */
function buildPerimeterLoop(layout) {
  const minX = layout.bounds.minX + PERIMETER_MARGIN;
  const maxX = layout.bounds.maxX - PERIMETER_MARGIN;
  const minZ = layout.bounds.minZ + PERIMETER_MARGIN;
  const maxZ = layout.bounds.maxZ - PERIMETER_MARGIN;
  const corners = {
    perim_nw: new THREE.Vector3(minX, 0, minZ),
    perim_ne: new THREE.Vector3(maxX, 0, minZ),
    perim_se: new THREE.Vector3(maxX, 0, maxZ),
    perim_sw: new THREE.Vector3(minX, 0, maxZ),
  };
  const nodes = Object.entries(corners).map(([id, position]) => ({ id, position }));
  const order = ['perim_nw', 'perim_ne', 'perim_se', 'perim_sw'];
  const edges = order.map((id, index) => {
    const next = order[(index + 1) % order.length];
    const a = corners[id];
    const b = corners[next];
    const mid = a.clone().lerp(b, 0.5);
    const area = expanseDistrictAt(mid.x, mid.z);
    return {
      id: `perim_${index}`,
      a: id, b: next,
      points: [a.clone(), b.clone()],
      width: 10,
      kind: 'street',
      district: area.index,
      districtId: area.id,
      perimeter: true,
    };
  });
  return { nodes, edges };
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

// ---------------------------------------------------------------------------
// Skeleton profile — segment geometry plus arc-length, for band tests and for
// resolving where a side street lands on an arterial.
// ---------------------------------------------------------------------------

function skeletonProfile(layout) {
  return layout.edges.map((edge) => {
    const segments = [];
    let walked = 0;
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      const len = a.distanceTo(b);
      if (len < 1e-9) continue;
      segments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, len, start: walked });
      walked += len;
    }
    return {
      edge,
      segments,
      length: walked,
      band: bandFor(edge) + edge.width * 0.5,
      // A junction may not be cut into the fast loop or onto a bridge deck.
      sealed: edge.kind === 'ring' || !!edge.bridge,
    };
  });
}

function clearOfSkeleton(profiles, x, z) {
  for (const profile of profiles) {
    for (const s of profile.segments) {
      if (pointSegmentDistance2D(x, z, s.ax, s.az, s.bx, s.bz) < profile.band) return false;
    }
  }
  return true;
}

function crossesSkeleton(profiles, a, b) {
  for (const profile of profiles) {
    for (const s of profile.segments) {
      if (segmentsCross(a.x, a.z, b.x, b.z, s.ax, s.az, s.bx, s.bz)) return true;
    }
  }
  return false;
}

/**
 * Cast from an accepted lattice node toward a blocked one and report where the
 * street would meet the skeleton. Returns null when the first thing it hits is
 * sealed, so a side street never punches into the ring or a bridge.
 */
function castToSkeleton(profiles, from, towards) {
  const dx = towards.x - from.x;
  const dz = towards.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return null;
  const reach = len + TOUCH_OVERSHOOT;
  const tipX = from.x + (dx / len) * reach;
  const tipZ = from.z + (dz / len) * reach;
  let best = null;
  for (const profile of profiles) {
    for (const s of profile.segments) {
      const d1x = tipX - from.x; const d1z = tipZ - from.z;
      const d2x = s.bx - s.ax; const d2z = s.bz - s.az;
      const denom = d1x * d2z - d1z * d2x;
      if (Math.abs(denom) < 1e-12) continue;
      const t = ((s.ax - from.x) * d2z - (s.az - from.z) * d2x) / denom;
      const u = ((s.ax - from.x) * d1z - (s.az - from.z) * d1x) / denom;
      if (t <= 1e-6 || t >= 1 || u < 0 || u > 1) continue;
      if (best && t >= best.t) continue;
      // Reject a graze: measure how squarely the street would arrive.
      const rayLen = Math.hypot(d1x, d1z);
      const segLen = Math.hypot(d2x, d2z);
      if (rayLen < 1e-9 || segLen < 1e-9) continue;
      const cross = Math.abs((d1x * d2z - d1z * d2x) / (rayLen * segLen));
      if (cross < MIN_JUNCTION_ANGLE) continue;
      best = {
        t,
        profile,
        distanceAlong: s.start + u * s.len,
        position: new THREE.Vector3(from.x + d1x * t, 0, from.z + d1z * t),
      };
    }
  }
  if (!best) return null;
  if (best.profile.sealed) return { ...best, sealed: true };
  return best;
}

// ---------------------------------------------------------------------------
// District lattices
// ---------------------------------------------------------------------------

function encodeIndex(v) { return v < 0 ? `m${-v}` : `${v}`; }

function classForLine(index, rules) {
  const period = rules.arterialEvery;
  const k = ((index % period) + period) % period;
  if (k === 0) return 'arterial';
  if (rules.alley && k === Math.floor(period / 2) && period >= 3) return 'alley';
  return 'street';
}

function buildLattice(layout, profiles, seed) {
  const inset = {
    minX: layout.bounds.minX + PERIMETER_MARGIN, maxX: layout.bounds.maxX - PERIMETER_MARGIN,
    minZ: layout.bounds.minZ + PERIMETER_MARGIN, maxZ: layout.bounds.maxZ - PERIMETER_MARGIN,
  };
  const nodes = [];
  const edges = [];
  const touches = [];
  const casts = { attempts: 0, sealed: 0, missed: 0, river: 0, hit: 0 };

  for (const district of layout.districts) {
    const rules = DISTRICT_STREET_RULES[district.id];
    if (!rules) continue;
    const [spanU, spanV] = rules.spacing;
    const cx = (district.bounds.min.x + district.bounds.max.x) * 0.5;
    const cz = (district.bounds.min.z + district.bounds.max.z) * 0.5;
    const reach = Math.hypot(
      district.bounds.max.x - district.bounds.min.x,
      district.bounds.max.z - district.bounds.min.z,
    ) * 0.5;
    const iMax = Math.ceil(reach / spanU) + 1;
    const jMax = Math.ceil(reach / spanV) + 1;
    const ux = Math.cos(rules.angle); const uz = Math.sin(rules.angle);
    const vx = -Math.sin(rules.angle); const vz = Math.cos(rules.angle);

    const place = (i, j) => {
      const rng = mulberry32(tileSeed(seed ^ (district.index * 0x9e37), i, j));
      const jx = (rng() - 0.5) * rules.jitter * spanU;
      const jz = (rng() - 0.5) * rules.jitter * spanV;
      // A low-frequency warp bends whole streets instead of nudging single
      // nodes, so the network curves the way a hillside or a riverbank does.
      const du = i * spanU + jx + Math.sin(j * 0.8 + district.index) * rules.warp;
      const dv = j * spanV + jz + Math.sin(i * 0.6 + district.index) * rules.warp;
      return {
        x: cx + ux * du + vx * dv,
        z: cz + uz * du + vz * dv,
      };
    };

    const local = new Map();
    const blocked = new Map();
    for (let i = -iMax; i <= iMax; i++) {
      for (let j = -jMax; j <= jMax; j++) {
        const { x, z } = place(i, j);
        const key = `${i}:${j}`;
        // Every lattice position is classified, not just the usable ones. A
        // neighbour that failed still says which way the street was heading,
        // and that direction is how a side street finds its arterial — most
        // often at a district boundary, because that is where arterials run.
        if (x < inset.minX || x > inset.maxX || z < inset.minZ || z > inset.maxZ) {
          blocked.set(key, { x, z, reason: 'edge' });
          continue;
        }
        if (expanseDistrictAt(x, z).id !== district.id) {
          blocked.set(key, { x, z, reason: 'district' });
          continue;
        }
        if (inRiver(x, z)) { blocked.set(key, { x, z, reason: 'river' }); continue; }
        if (!clearOfSkeleton(profiles, x, z)) {
          blocked.set(key, { x, z, reason: 'skeleton' });
          continue;
        }
        const id = `x${district.index}_${encodeIndex(i)}_${encodeIndex(j)}`;
        const node = {
          id,
          position: new THREE.Vector3(x, 0, z),
          district: district.index,
          districtId: district.id,
          skeleton: false,
        };
        local.set(key, node);
        nodes.push(node);
      }
    }

    const clearSpan = (a, b) => {
      if (segmentHitsRiver(a, b)) return false;
      if (crossesSkeleton(profiles, a, b)) return false;
      for (const t of [0.25, 0.5, 0.75]) {
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        if (inRiver(x, z)) return false;
        if (!clearOfSkeleton(profiles, x, z)) return false;
      }
      return true;
    };

    const addStreet = (from, to, lineIndex, extra = {}) => {
      const streetClass = classForLine(lineIndex, rules);
      const width = rules.widths[streetClass];
      if (!width) return null;
      const mid = from.position.clone().lerp(to.position, 0.5);
      const area = expanseDistrictAt(mid.x, mid.z);
      const edge = {
        id: `e_${from.id}__${to.id}`,
        a: from.id, b: to.id,
        points: [from.position.clone(), to.position.clone()],
        width,
        kind: 'street',
        streetClass,
        district: area.index,
        districtId: area.id,
        skeleton: false,
        ...extra,
      };
      edges.push(edge);
      return edge;
    };

    for (const [key, node] of local) {
      const [i, j] = key.split(':').map(Number);
      // Both directions of both axes. Street-to-street spans are only emitted
      // forwards so each is built once, but a *missing* neighbour is probed on
      // all four sides: otherwise the -i and -j fringes never look for an
      // arterial, and half the edge of every district dead-ends into nothing.
      for (const [di, dj, lineIndex] of [[1, 0, j], [0, 1, i], [-1, 0, j], [0, -1, i]]) {
        const otherKey = `${i + di}:${j + dj}`;
        const other = local.get(otherKey);
        if (other) {
          if (di + dj > 0 && clearSpan(node.position, other.position)) {
            addStreet(node, other, lineIndex);
          }
          continue;
        }
        // The lattice neighbour is unusable, whatever the reason. The street
        // is still built if an arterial lies that way: it runs up and
        // terminates on it, which is what a real side street does. This is the
        // step that turns road corridors from dead space into frontage.
        const stop = blocked.get(otherKey);
        if (!stop) continue;
        casts.attempts++;
        const hit = castToSkeleton(profiles, node.position, stop);
        if (!hit) { casts.missed++; continue; }
        if (hit.sealed) { casts.sealed++; continue; }
        if (segmentHitsRiver(node.position, hit.position)) { casts.river++; continue; }
        casts.hit++;
        const streetClass = classForLine(lineIndex, rules);
        const width = rules.widths[streetClass];
        if (!width) continue;
        touches.push({
          from: node,
          edgeId: hit.profile.edge.id,
          distanceAlong: hit.distanceAlong,
          position: hit.position,
          width,
          streetClass,
        });
      }
    }
  }

  return { nodes, edges, touches, casts };
}

// ---------------------------------------------------------------------------
// Skeleton densification, including the junctions side streets asked for
// ---------------------------------------------------------------------------

/** The perimeter loop is a service road, not an arterial; the ring is itself. */
function skeletonClass(edge) {
  if (edge.kind === 'ring') return 'ring';
  if (edge.perimeter) return 'street';
  return 'arterial';
}

function densifySkeleton(layout, touches) {
  const requested = new Map();
  for (const touch of touches) {
    if (!requested.has(touch.edgeId)) requested.set(touch.edgeId, []);
    requested.get(touch.edgeId).push(touch);
  }

  const nodes = layout.nodes.map((n) => ({
    id: n.id, position: n.position.clone(), skeleton: true,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];

  for (const edge of layout.edges) {
    const length = polylineLength(edge.points);
    const spacing = junctionSpacingFor(edge);
    const wanted = [];
    if (Number.isFinite(spacing)) {
      const splits = Math.max(1, Math.round(length / spacing));
      for (let i = 1; i < splits; i++) wanted.push({ at: (length * i) / splits, touch: null });
    }
    for (const touch of requested.get(edge.id) || []) {
      wanted.push({ at: touch.distanceAlong, touch });
    }
    wanted.sort((a, b) => a.at - b.at);

    const cuts = [];
    for (const candidate of wanted) {
      if (candidate.at < MIN_JUNCTION_GAP || candidate.at > length - MIN_JUNCTION_GAP) {
        // Too near an existing skeleton node — snap the side street onto it.
        if (candidate.touch) {
          candidate.touch.nodeId = candidate.at < length * 0.5 ? edge.a : edge.b;
        }
        continue;
      }
      const previous = cuts[cuts.length - 1];
      if (previous && candidate.at - previous.at < MIN_JUNCTION_GAP) {
        if (candidate.touch) candidate.touch.nodeId = previous.id;
        continue;
      }
      const id = `${edge.id}__j${cuts.length + 1}`;
      cuts.push({ at: candidate.at, id });
      if (candidate.touch) candidate.touch.nodeId = id;
    }

    let previousId = edge.a;
    let previousAt = 0;
    for (const cut of cuts) {
      const position = pointAtDistance(edge.points, cut.at);
      const node = { id: cut.id, position, skeleton: true };
      nodes.push(node);
      byId.set(cut.id, node);
      const points = slicePolyline(edge.points, previousAt, cut.at);
      edges.push({
        ...edge,
        id: `${edge.id}__s${edges.length}`,
        a: previousId, b: cut.id,
        points,
        length: polylineLength(points),
        skeleton: true,
        parentId: edge.id,
        streetClass: skeletonClass(edge),
      });
      previousId = cut.id;
      previousAt = cut.at;
    }
    const tail = slicePolyline(edge.points, previousAt, length);
    edges.push({
      ...edge,
      id: cuts.length ? `${edge.id}__s${edges.length}` : edge.id,
      a: previousId, b: edge.b,
      points: cuts.length ? tail : edge.points.map((p) => p.clone()),
      length: cuts.length ? polylineLength(tail) : length,
      skeleton: true,
      parentId: edge.id,
      streetClass: skeletonClass(edge),
    });
  }

  return { nodes, byId, edges };
}

/**
 * Would this new road cross one already accepted, away from a shared junction?
 * Face-finding at M2 needs a planar graph, and two side streets that cross in
 * open ground are also simply wrong.
 */
function crossesExisting(from, to, existing, skipNodes) {
  for (const edge of existing) {
    if (skipNodes.has(edge.a) || skipNodes.has(edge.b)) continue;
    for (let i = 1; i < edge.points.length; i++) {
      if (segmentsCross(from.x, from.z, to.x, to.z,
        edge.points[i - 1].x, edge.points[i - 1].z,
        edge.points[i].x, edge.points[i].z)) return true;
    }
  }
  return false;
}

/** One paved stub per resolved touch, from the lattice node to its junction. */
function buildTouchEdges(touches, skeleton, latticeEdges) {
  const edges = [];
  const seen = new Set();
  // Two side streets that snap to the same junction from nearly the same
  // bearing enclose a sliver between them and read as one doubled road. The
  // second one is dropped; if that strands its lattice node, the pruner takes
  // it, which is the better outcome.
  const arrivals = new Map();
  for (const touch of touches) {
    if (!touch.nodeId) continue;
    const target = skeleton.byId.get(touch.nodeId);
    if (!target) continue;
    const key = `${touch.from.id}__${touch.nodeId}`;
    if (seen.has(key)) continue;
    const bearing = Math.atan2(
      touch.from.position.z - target.position.z,
      touch.from.position.x - target.position.x,
    );
    const taken = arrivals.get(touch.nodeId) || [];
    let crowded = false;
    for (const other of taken) {
      let delta = Math.abs(bearing - other);
      while (delta > Math.PI) delta = Math.abs(delta - 2 * Math.PI);
      if (delta < 25 * Math.PI / 180) { crowded = true; break; }
    }
    if (crowded) continue;
    if (crossesExisting(touch.from.position, target.position,
      [...latticeEdges, ...edges], new Set([touch.from.id, touch.nodeId]))) continue;
    taken.push(bearing);
    arrivals.set(touch.nodeId, taken);
    seen.add(key);
    const mid = touch.from.position.clone().lerp(target.position, 0.5);
    const area = expanseDistrictAt(mid.x, mid.z);
    edges.push({
      id: `t_${key}`,
      a: touch.from.id, b: touch.nodeId,
      points: [touch.from.position.clone(), target.position.clone()],
      width: touch.width,
      kind: 'street',
      streetClass: touch.streetClass,
      district: area.index,
      districtId: area.id,
      skeleton: false,
      touch: true,
    });
  }
  return edges;
}

// ---------------------------------------------------------------------------
// Topology — the graph must satisfy validateRoadGraph by construction
// ---------------------------------------------------------------------------

function buildAdjacency(nodes, edges) {
  const adjacency = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    adjacency.get(edge.a)?.push({ node: edge.b, edge });
    adjacency.get(edge.b)?.push({ node: edge.a, edge });
  }
  return adjacency;
}

function componentsOf(nodes, adjacency) {
  const of = new Map();
  let index = 0;
  for (const node of nodes) {
    if (of.has(node.id)) continue;
    const stack = [node.id];
    of.set(node.id, index);
    while (stack.length) {
      const id = stack.pop();
      for (const item of adjacency.get(id) || []) {
        if (of.has(item.node)) continue;
        of.set(item.node, index);
        stack.push(item.node);
      }
    }
    index++;
  }
  return { of, count: index };
}

/** Iterative Tarjan. Recursion would risk the stack on a long street chain. */
function findBridges(nodes, adjacency) {
  const disc = new Map();
  const low = new Map();
  const bridges = new Set();
  let timer = 0;
  for (const root of nodes) {
    if (disc.has(root.id)) continue;
    const stack = [{ id: root.id, parentEdge: null, iterator: 0 }];
    disc.set(root.id, timer); low.set(root.id, timer); timer++;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const neighbours = adjacency.get(frame.id) || [];
      if (frame.iterator < neighbours.length) {
        const item = neighbours[frame.iterator++];
        if (item.edge.id === frame.parentEdge) continue;
        if (disc.has(item.node)) {
          low.set(frame.id, Math.min(low.get(frame.id), disc.get(item.node)));
          continue;
        }
        disc.set(item.node, timer); low.set(item.node, timer); timer++;
        stack.push({ id: item.node, parentEdge: item.edge.id, iterator: 0 });
      } else {
        stack.pop();
        const parent = stack[stack.length - 1];
        if (!parent) continue;
        low.set(parent.id, Math.min(low.get(parent.id), low.get(frame.id)));
        if (low.get(frame.id) > disc.get(parent.id)) bridges.add(frame.parentEdge);
      }
    }
  }
  return bridges;
}

/**
 * Attach pockets the lattice left stranded — most often a neighbourhood
 * outside the ring, whose only legal way in is a ring junction. Two stitches
 * are added, not one, so the pocket joins as a cycle and never becomes a
 * bridge the pruner would then delete.
 */
function rescuePockets(nodes, edges, skeleton, profiles) {
  const nonSkeleton = edges.filter((e) => !e.skeleton);
  const skeletonIds = new Set(skeleton.nodes.map((n) => n.id));
  const added = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const components = componentsOf(nodes, buildAdjacency(nodes, [...edges, ...added]));
    const home = components.of.get(skeleton.nodes[0].id);
    const stranded = new Map();
    for (const node of nodes) {
      const index = components.of.get(node.id);
      if (index === home || skeletonIds.has(node.id)) continue;
      if (!stranded.has(index)) stranded.set(index, []);
      stranded.get(index).push(node);
    }
    if (!stranded.size) break;

    let progressed = false;
    for (const pocket of stranded.values()) {
      const options = [];
      for (const junction of skeleton.nodes) {
        for (const node of pocket) {
          const distance = junction.position.distanceTo(node.position);
          if (distance > MAX_CONNECTOR) continue;
          options.push({ junction, node, distance });
        }
      }
      options.sort((a, b) => a.distance - b.distance);
      const usedNodes = new Set();
      let stitched = 0;
      for (const option of options) {
        if (stitched >= 2) break;
        if (usedNodes.has(option.node.id)) continue;
        if (segmentHitsRiver(option.junction.position, option.node.position)) continue;
        // Reaching the junction it joins is the point; a crossing anywhere
        // else would put a side street across a live carriageway.
        let illegal = false;
        for (const profile of profiles) {
          for (const s of profile.segments) {
            if (!segmentsCross(
              option.junction.position.x, option.junction.position.z,
              option.node.position.x, option.node.position.z,
              s.ax, s.az, s.bx, s.bz,
            )) continue;
            const atJunction = pointSegmentDistance2D(
              option.junction.position.x, option.junction.position.z,
              s.ax, s.az, s.bx, s.bz,
            ) < 1.5;
            if (!atJunction) { illegal = true; break; }
          }
          if (illegal) break;
        }
        if (illegal) continue;
        if (crossesExisting(option.junction.position, option.node.position,
          [...nonSkeleton, ...added], new Set([option.junction.id, option.node.id]))) continue;
        usedNodes.add(option.node.id);
        const mid = option.junction.position.clone().lerp(option.node.position, 0.5);
        const area = expanseDistrictAt(mid.x, mid.z);
        added.push({
          id: `r_${option.junction.id}__${option.node.id}`,
          a: option.junction.id, b: option.node.id,
          points: [option.junction.position.clone(), option.node.position.clone()],
          width: 9,
          kind: 'street',
          streetClass: 'connector',
          district: area.index,
          districtId: area.id,
          skeleton: false,
          connector: true,
        });
        stitched++;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return added;
}

/**
 * Prune until the network is one connected, dead-end-free, bridge-free graph.
 * A stub that cannot be healed is deleted rather than shipped: a dead end on
 * the routeable network is a delivery that cannot be completed.
 */
function pruneToCycles(nodes, edges) {
  let liveNodes = nodes;
  let liveEdges = edges;
  const removed = { deadEnds: 0, bridgeStubs: 0, islands: 0 };

  for (let pass = 0; pass < 64; pass++) {
    let adjacency = buildAdjacency(liveNodes, liveEdges);

    const doomed = new Set(liveNodes
      .filter((n) => (adjacency.get(n.id) || []).length < 2)
      .map((n) => n.id));
    if (doomed.size) {
      removed.deadEnds += doomed.size;
      liveNodes = liveNodes.filter((n) => !doomed.has(n.id));
      liveEdges = liveEdges.filter((e) => !doomed.has(e.a) && !doomed.has(e.b));
      continue;
    }

    const components = componentsOf(liveNodes, adjacency);
    if (components.count > 1) {
      const sizes = new Map();
      for (const [, index] of components.of) sizes.set(index, (sizes.get(index) || 0) + 1);
      let keep = 0;
      let best = -1;
      for (const [index, size] of sizes) if (size > best) { best = size; keep = index; }
      removed.islands += liveNodes.length - best;
      liveNodes = liveNodes.filter((n) => components.of.get(n.id) === keep);
      const alive = new Set(liveNodes.map((n) => n.id));
      liveEdges = liveEdges.filter((e) => alive.has(e.a) && alive.has(e.b));
      continue;
    }

    adjacency = buildAdjacency(liveNodes, liveEdges);
    const bridges = findBridges(liveNodes, adjacency);
    if (!bridges.size) break;
    const bridgeId = bridges.values().next().value;
    const withoutBridge = liveEdges.filter((e) => e.id !== bridgeId);
    const split = componentsOf(liveNodes, buildAdjacency(liveNodes, withoutBridge));
    const sizes = new Map();
    for (const [, index] of split.of) sizes.set(index, (sizes.get(index) || 0) + 1);
    let keep = 0;
    let best = -1;
    for (const [index, size] of sizes) if (size > best) { best = size; keep = index; }
    const survivors = liveNodes.filter((n) => split.of.get(n.id) === keep);
    removed.bridgeStubs += liveNodes.length - survivors.length;
    liveNodes = survivors;
    const alive = new Set(liveNodes.map((n) => n.id));
    liveEdges = withoutBridge.filter((e) => alive.has(e.a) && alive.has(e.b));
  }

  return { nodes: liveNodes, edges: liveEdges, removed };
}

// ---------------------------------------------------------------------------

/**
 * Grow the full Expanse street network: frozen skeleton, cut junctions, six
 * district lattices, rescued pockets, and a topology guaranteed to satisfy
 * validateRoadGraph.
 */
export function generateExpanseStreets(layout, seed = STREETS_SEED) {
  const ringPolygon = buildRingPolygon(layout.edges);
  const frame = buildPerimeterLoop(layout);
  // The approved layout is never mutated; the perimeter loop is layered on top
  // of a copy, so expanse-layout.js and its own gate stay untouched.
  const augmented = {
    ...layout,
    nodes: [...layout.nodes, ...frame.nodes],
    edges: [...layout.edges, ...frame.edges],
  };
  const profiles = skeletonProfile(augmented);
  const lattice = buildLattice(augmented, profiles, seed);
  const skeleton = densifySkeleton(augmented, lattice.touches);
  const touchEdges = buildTouchEdges(lattice.touches, skeleton, lattice.edges);

  let nodes = [...skeleton.nodes, ...lattice.nodes];
  let edges = [...skeleton.edges, ...lattice.edges, ...touchEdges];
  const rescued = rescuePockets(nodes, edges, skeleton, profiles);
  edges = [...edges, ...rescued];

  const pruned = pruneToCycles(nodes, edges);
  nodes = pruned.nodes;
  edges = pruned.edges;

  const skeletonIds = new Set(skeleton.nodes.map((n) => n.id));
  const perClass = {};
  const perDistrict = {};
  let paved = 0;
  let inner = 0;
  for (const edge of edges) {
    const length = edge.length ?? polylineLength(edge.points);
    edge.length = length;
    paved += length;
    const key = edge.streetClass || edge.kind;
    perClass[key] = (perClass[key] || 0) + 1;
    perDistrict[edge.districtId || 'unknown'] = (perDistrict[edge.districtId || 'unknown'] || 0) + 1;
    const mid = edge.points[Math.floor(edge.points.length / 2)];
    if (pointInPolygon(mid.x, mid.z, ringPolygon)) inner++;
  }

  return {
    seed,
    nodes,
    edges,
    byId: new Map(nodes.map((n) => [n.id, n])),
    ringPolygon,
    river: { ...RIVER },
    bounds: { ...layout.bounds },
    districts: layout.districts,
    landmarks: layout.landmarks,
    spawn: layout.spawn,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      skeletonNodes: nodes.filter((n) => skeletonIds.has(n.id)).length,
      interiorNodes: nodes.filter((n) => !skeletonIds.has(n.id)).length,
      junctionsCut: skeleton.nodes.length - augmented.nodes.length,
      touches: touchEdges.length,
      casts: lattice.casts,
      rescues: rescued.length,
      // Euler: a connected planar graph's bounded faces are the city blocks.
      blocks: edges.length - nodes.length + 1,
      insideRingEdges: inner,
      outsideRingEdges: edges.length - inner,
      pavedKm: paved / 1000,
      perClass,
      perDistrict,
      pruned: pruned.removed,
    },
  };
}
