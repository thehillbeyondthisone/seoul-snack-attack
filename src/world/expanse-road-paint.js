// Seoul Expanse rebuild — M6 road markings: the paint on top of the paint.
//
// CITY-REBUILD.md's M6 gap list opens with "the road surface is still flat
// paint ... the biggest remaining 'unfinished' cue at street level". The
// surface grain is expanse-surface-art.js; this is the other half — centre
// lines, lane dashes, edge lines, stop bars and crossings, generated from the
// same street graph M1 produced and nothing else.
//
// WHY NOT expanse-road-art.js. That module already paints the APPROVED world
// and stays where it is. It was written for 35 hand-authored edges and leans on
// that: it names five junctions by id for its crossings, and it emits a
// kerb and a drain per edge because that world has no pavement pads. The
// rebuild has 452 edges, 299 junctions and real kerbs from M3's pavements, so
// the rules here are graph-derived rather than authored, and the layer is a
// third of what that one draws.
//
// KOREAN CONVENTION, because it is not the American one:
//   - the centre line is YELLOW, doubled where the road has four lanes or more
//   - lane dividers are white and dashed
//   - alleys are not marked at all, which is most of what makes an alley read
//     as an alley from the cab
//
// Everything here is plain numbers, so tools/bench/expanse-surface-check.mjs
// measures exactly what the runtime is about to build quads from.
import * as THREE from 'three';
import { SURFACES } from './data/color-bible.js';
import { chunkAt } from './expanse-chunks.js';

/**
 * Road paint sits above the drivable ground by class, widest lowest. Two roads
 * always overlap at a junction, and a fixed order is the difference between a
 * legible junction and a sheet of z-fighting.
 *
 * This lives here rather than in expanse2-city.js because the markings have to
 * agree with it exactly — a stop bar drawn at the ring's lift under an alley's
 * surface is invisible — and a constant two modules must agree on belongs to
 * neither of them privately.
 */
export const ROAD_LIFT = Object.freeze({
  ring: 0.02, arterial: 0.035, street: 0.05, alley: 0.065, connector: 0.05,
});

/** Markings ride this far above their own carriageway, and no further. */
export const PAINT_LIFT = 0.006;

const LANE = Object.freeze({
  /** Four lanes below this and six above it; everything else is two. */
  fourLaneWidth: 13,
  sixLaneWidth: 19,
});

const MARK = Object.freeze({
  lineWidth: 0.12,      // a Korean urban lane line is 10-15 cm
  centreGap: 0.18,      // half the gap between a doubled yellow centre line
  edgeInset: 0.45,      // edge line, measured in from the kerb face
  dash: 3,              // white lane dash, metres of paint
  gap: 5,               // and metres of nothing
  stopBar: 0.4,         // thickness of a stop bar, along the direction of travel
  stopBack: 1.0,        // clear road between the crossing and the stop bar
  zebraStripe: 0.45,
  zebraGap: 0.45,
  zebraDepth: 3.6,      // how far a crossing reaches along the road
});

/** A run shorter than this after junction clearance is not worth marking. */
const MIN_RUN = 4;

const _dir = new THREE.Vector2();

/** Lane count for a carriageway. Always even: a road has two directions. */
export function laneCount(width) {
  if (width >= LANE.sixLaneWidth) return 6;
  if (width >= LANE.fourLaneWidth) return 4;
  return 2;
}

/** Classes that carry paint at all. Alleys are bare, and that is the point. */
function isMarked(edge) {
  return edge.streetClass !== 'alley' && edge.width >= 6.5;
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i - 1].distanceTo(points[i]);
  return total;
}

/** Point and unit heading at `distance` along an edge's polyline. */
function sampleAt(points, distance) {
  let remaining = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segment = a.distanceTo(b);
    if (segment < 1e-6) continue;
    if (remaining <= segment || i === points.length - 1) {
      const t = Math.min(1, remaining / segment);
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        heading: Math.atan2(b.x - a.x, b.z - a.z),
      };
    }
    remaining -= segment;
  }
  const a = points[0];
  const b = points[points.length - 1];
  return { x: a.x, z: a.z, heading: Math.atan2(b.x - a.x, b.z - a.z) };
}

/**
 * One mark.
 *
 * `lateral` is always measured across the CARRIAGEWAY, off the sample's own
 * heading, while `quadTurn` rotates the quad itself — that separation is what
 * lets a stop bar sit on the approach half of the road and still lie across it.
 * `halfSpan` is half the mark's extent across the road whichever way it is
 * turned, so the gate asserts containment as `|lateral| + halfSpan <= width/2`
 * once, for every kind.
 */
function mark(kind, colour, sample, length, width, y, edge, lateral, halfSpan, quadTurn = 0) {
  // Travel is (sin h, cos h); this is its perpendicular, and in this world's
  // frame it points to the LEFT of travel (physics.js: +X is body left).
  _dir.set(Math.cos(sample.heading), -Math.sin(sample.heading));
  return {
    kind,
    colour,
    edgeId: edge.id,
    streetClass: edge.streetClass,
    x: sample.x + _dir.x * lateral,
    z: sample.z + _dir.y * lateral,
    y,
    heading: sample.heading + quadTurn,
    length,
    width,
    lateral,
    halfSpan,
  };
}

/** Solid line at a fixed lateral offset, walked along the polyline. */
function addSolid(out, edge, y, colour, lateral, width, from, to) {
  const points = edge.points;
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segment = a.distanceTo(b);
    if (segment < 1e-6) continue;
    const start = Math.max(from, travelled);
    const end = Math.min(to, travelled + segment);
    travelled += segment;
    if (end - start < 0.25) continue;
    // One quad per segment portion: a polyline bend gets two lines meeting at
    // a small notch rather than a mitre. At 12 cm of paint and the shallow
    // bends this network produces, the notch is under a centimetre.
    const mid = sampleAt(points, (start + end) * 0.5);
    out.push(mark('solid', colour, mid, end - start, width, y, edge, lateral, width * 0.5));
  }
}

/** Dashed line at a fixed lateral offset. */
function addDashed(out, edge, y, colour, lateral, width, from, to) {
  const period = MARK.dash + MARK.gap;
  for (let d = from; d + MARK.dash <= to; d += period) {
    const sample = sampleAt(edge.points, d + MARK.dash * 0.5);
    out.push(mark('dash', colour, sample, MARK.dash, width, y, edge, lateral, width * 0.5));
  }
}

/**
 * Generate the marking records for a street network.
 *
 * `streets` is the output of generateExpanseStreets — the same object the
 * carriageways themselves are built from, so a mark cannot be measured against
 * a road the runtime did not pave.
 */
export function generateExpanseRoadPaint(streets) {
  const marks = [];

  // Junction clearance. A mark that runs into a junction is painted over by
  // whichever road crosses on a higher lift, so every longitudinal line stops
  // half the widest incident carriageway short of the node, plus a metre and a
  // half of junction box.
  const nodeClear = new Map();
  for (const edge of streets.edges) {
    for (const id of [edge.a, edge.b]) {
      nodeClear.set(id, Math.max(nodeClear.get(id) ?? 0, edge.width * 0.5 + 1.5));
    }
  }
  const degree = new Map();
  // A crossing belongs at a junction two big roads meet at, not at every tee a
  // side street makes with an arterial. Counting the major arms separately is
  // what keeps the zebra count in the hundreds rather than the thousands, and
  // it is also the truer rule: Seoul paints crossings at signals.
  const majorDegree = new Map();
  for (const edge of streets.edges) {
    const major = edge.streetClass === 'ring' || edge.streetClass === 'arterial';
    for (const id of [edge.a, edge.b]) {
      degree.set(id, (degree.get(id) ?? 0) + 1);
      if (major) majorDegree.set(id, (majorDegree.get(id) ?? 0) + 1);
    }
  }

  for (const edge of streets.edges) {
    if (!isMarked(edge)) continue;
    const length = edge.length ?? polylineLength(edge.points);
    if (length < MIN_RUN) continue;
    const half = edge.width * 0.5;
    const y = (ROAD_LIFT[edge.streetClass] ?? ROAD_LIFT.street) + PAINT_LIFT;
    const lanes = laneCount(edge.width);
    const major = edge.streetClass === 'ring' || edge.streetClass === 'arterial';

    // Each end is laid out from the junction outwards, in the order a driver
    // arriving at it meets things in reverse: junction box, crossing, stop bar,
    // then the lane lines. `x` below is always distance OUT from that node, and
    // `at()` turns it into a distance along the polyline — which is what makes
    // the two ends symmetrical instead of two sign-juggled special cases.
    const ends = [
      { node: edge.a, clear: nodeClear.get(edge.a) ?? half, at: (x) => x, sign: 1 },
      { node: edge.b, clear: nodeClear.get(edge.b) ?? half, at: (x) => length - x, sign: -1 },
    ];
    for (const end of ends) {
      end.stop = (degree.get(end.node) ?? 0) >= 3;
      end.zebra = end.stop && major && (majorDegree.get(end.node) ?? 0) >= 2;
      // Where the lane lines are allowed to start. Running a lane dash through
      // a crossing is the difference between a junction and a mess.
      end.lineStart = end.clear
        + (end.zebra ? MARK.zebraDepth : 0)
        + (end.stop ? MARK.stopBack + MARK.stopBar : 0)
        + (end.stop || end.zebra ? 0.5 : 0);
    }

    const from = ends[0].lineStart;
    const to = length - ends[1].lineStart;
    const run = to - from;

    if (run >= MIN_RUN) {
      // ---- centre line, yellow ------------------------------------------
      if (lanes >= 4) {
        for (const side of [-1, 1]) {
          addSolid(marks, edge, y, SURFACES.asphaltCenter,
            side * MARK.centreGap, MARK.lineWidth, from, to);
        }
      } else if (edge.streetClass !== 'street' || edge.width >= 9) {
        addSolid(marks, edge, y, SURFACES.asphaltCenter, 0, MARK.lineWidth, from, to);
      }

      // ---- lane dividers, white dashed -----------------------------------
      // Boundaries are spaced across the usable half-width, so a 22 m ring and
      // a 13 m arterial both put their dashes where their lanes actually are.
      const usable = half - MARK.edgeInset;
      const perSide = lanes / 2;
      for (let k = 1; k < perSide; k++) {
        const offset = (usable / perSide) * k;
        for (const side of [-1, 1]) {
          addDashed(marks, edge, y, SURFACES.asphaltMark,
            side * offset, MARK.lineWidth, from, to);
        }
      }

      // ---- edge lines, white solid ---------------------------------------
      for (const side of [-1, 1]) {
        addSolid(marks, edge, y, SURFACES.asphaltMark,
          side * (half - MARK.edgeInset), MARK.lineWidth, from, to);
      }
    }

    // ---- crossings and stop bars ------------------------------------------
    for (const end of ends) {
      if (!end.stop) continue;
      const barHalf = half - MARK.edgeInset;

      if (end.zebra) {
        // Stripes run ALONG the road and are laid out across it, which is what
        // a zebra is: the bands are parallel to the traffic, not to the person
        // walking between them.
        const period = MARK.zebraStripe + MARK.zebraGap;
        const count = Math.max(2, Math.floor((barHalf * 2) / period));
        const first = -((count - 1) * period) * 0.5;
        const centre = sampleAt(edge.points, end.at(end.clear + MARK.zebraDepth * 0.5));
        for (let i = 0; i < count; i++) {
          marks.push(mark('zebra', SURFACES.asphaltMark, centre,
            MARK.zebraDepth, MARK.zebraStripe, y, edge,
            first + i * period, MARK.zebraStripe * 0.5));
        }
      }

      // The bar sits behind the crossing, or behind the junction box when
      // there is no crossing, and spans the APPROACH half only: Korea drives on
      // the right, so the near half is the one that stops. The sign flips with
      // the end because arriving at node `a` means travelling against the
      // polyline, which swaps which half is near.
      const barX = end.clear + (end.zebra ? MARK.zebraDepth : 0) + MARK.stopBack;
      const distance = end.at(barX);
      if (distance <= 0 || distance >= length) continue;
      marks.push(mark('stop', SURFACES.asphaltMark, sampleAt(edge.points, distance),
        barHalf, MARK.stopBar, y, edge,
        end.sign * barHalf * 0.5, barHalf * 0.5, Math.PI / 2));
    }
  }

  const perKind = {};
  for (const m of marks) perKind[m.kind] = (perKind[m.kind] ?? 0) + 1;
  return {
    marks,
    stats: {
      marks: marks.length,
      triangles: marks.length * 2,
      perKind,
      markedEdges: new Set(marks.map((m) => m.edgeId)).size,
      bareEdges: streets.edges.filter((e) => !isMarked(e)).length,
    },
  };
}

/**
 * Build the marking quads into the visual chunk grid.
 *
 * One material for the whole layer, colour carried per vertex: white and yellow
 * paint are the same surface, and a second material would double the layer's
 * draw calls to buy nothing. They ride `chunk.detail` (420 m) rather than
 * `chunk.base` — a lane dash at half a kilometre is a shimmering pixel, and
 * turning it off is both cheaper and better looking.
 */
export function buildExpanseRoadPaint(chunkById, grid, paint) {
  const material = new THREE.MeshBasicMaterial({
    name: 'expanse2_road_paint',
    vertexColors: true,
    toneMapped: true,
    fog: true,
    // The quads sit 6 mm above their carriageway, which is enough for depth
    // testing and not enough for a depth-write fight with a road drawn at a
    // grazing angle a kilometre away.
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const byChunk = new Map();
  const colour = new THREE.Color();
  for (const m of paint.marks) {
    const chunk = chunkAt(grid, m.x, m.z);
    if (!byChunk.has(chunk.id)) byChunk.set(chunk.id, { position: [], color: [] });
    const bucket = byChunk.get(chunk.id);

    const dx = Math.sin(m.heading);
    const dz = Math.cos(m.heading);
    const nx = Math.cos(m.heading);
    const nz = -Math.sin(m.heading);
    const hl = m.length * 0.5;
    const hw = m.width * 0.5;
    const corners = [
      [m.x - dx * hl - nx * hw, m.z - dz * hl - nz * hw],
      [m.x + dx * hl - nx * hw, m.z + dz * hl - nz * hw],
      [m.x + dx * hl + nx * hw, m.z + dz * hl + nz * hw],
      [m.x - dx * hl + nx * hw, m.z - dz * hl + nz * hw],
    ];
    // Corners run (-length,-width), (+length,-width), (+length,+width),
    // (-length,+width), and this is the winding whose cross product comes out
    // +Y from that order. The other one compiles, renders nothing, and looks
    // exactly like a chunk-culling bug from the driver's seat.
    for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
      for (const index of [a, b, c]) {
        bucket.position.push(corners[index][0], m.y, corners[index][1]);
      }
    }
    colour.setHex(m.colour, THREE.SRGBColorSpace);
    for (let i = 0; i < 6; i++) bucket.color.push(colour.r, colour.g, colour.b);
  }

  let drawCalls = 0;
  let triangles = 0;
  for (const [chunkId, bucket] of byChunk) {
    const target = chunkById.get(chunkId);
    if (!target) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.position, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.color, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `expanse2_road_paint_${chunkId}`;
    target.detail.add(mesh);
    drawCalls++;
    triangles += bucket.position.length / 9;
  }
  return { material, drawCalls, triangles };
}
