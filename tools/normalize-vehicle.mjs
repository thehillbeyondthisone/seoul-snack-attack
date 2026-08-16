// Bake a vehicle's rig at build time: measure the wheels, cut them off the
// body, and emit a canonical GLB the runtime can load without guessing.
//
// Usage: node tools/normalize-vehicle.mjs <input.glb> <output.glb> <recipeId> [--report]
//
// Runs BETWEEN obj2gltf and optimize.mjs. That ordering is not negotiable:
// meshopt quantizes POSITION to normalized Int16, and handoff.md 0 records
// that reading a quantized accessor as if it were metres is what once
// corrupted every wheel hub and left the van balanced on two mid-body wheels.
// Here the accessors are still Float32, so the arithmetic is plain.
//
// Output contract (what src/vehicle/vehicle.js may assume):
//   - nodes named exactly `body`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`
//   - +Z forward, +Y up, +X body LEFT (matching physics.js:204)
//   - uniformly scaled so the body bbox measures `targetLength` along Z
//   - origin at the body bounding-box centre (the convention van.js:100-102
//     already established, kept so CoM tuning stays comparable)
//   - each wheel node's translation IS its hub; its geometry is recentred on it
//   - a sidecar `<output>.json` with every measurement the physics needs
//
// This file only measures and rearranges geometry. It does not touch
// materials, textures, or tuning — those stay in the MTL and in
// src/game/data/vehicles.js respectively.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { writeFileSync, statSync } from 'node:fs';
import { getRecipe } from './vehicle-recipes.mjs';

const [, , input, output, recipeId, ...flags] = process.argv;
if (!input || !output || !recipeId) {
  console.error('usage: node tools/normalize-vehicle.mjs <in.glb> <out.glb> <recipeId> [--report]');
  process.exit(1);
}
const report = flags.includes('--report');
const recipe = getRecipe(recipeId);

// ---------------------------------------------------------------------------
// Small matrix / bbox helpers. Matrices are column-major 16-float glTF order.
// ---------------------------------------------------------------------------
const xformPoint = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
const xformDir = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z,
  m[1] * x + m[5] * y + m[9] * z,
  m[2] * x + m[6] * y + m[10] * z,
];

const newBox = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
const growBox = (b, p) => {
  for (let k = 0; k < 3; k++) {
    if (p[k] < b.min[k]) b.min[k] = p[k];
    if (p[k] > b.max[k]) b.max[k] = p[k];
  }
};
const boxCenter = (b) => [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2);
const boxSize = (b) => [0, 1, 2].map((k) => b.max[k] - b.min[k]);
const boxValid = (b) => b.min[0] <= b.max[0];

// ---------------------------------------------------------------------------
// 1. Flatten the document into a world-space triangle soup, one entry per
//    source primitive. obj2gltf emits one node per OBJ group, so `nodeName`
//    below is the OBJ group name (`WheelFL_tire_0`, `body_paint_0`, ...) and
//    carries all the authoring intent the recipe keys off.
// ---------------------------------------------------------------------------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];

/** @type {{nodeName:string, matName:string, material:any, pos:Float32Array, nrm:Float32Array|null, uv:Float32Array|null, idx:Uint32Array, box:object}[]} */
const parts = [];

for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const world = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const pAcc = prim.getAttribute('POSITION');
    if (!pAcc) continue;
    const nAcc = prim.getAttribute('NORMAL');
    const tAcc = prim.getAttribute('TEXCOORD_0');
    const src = pAcc.getArray();
    const count = pAcc.getCount();

    const pos = new Float32Array(count * 3);
    const box = newBox();
    for (let i = 0; i < count; i++) {
      const p = xformPoint(world, src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
      growBox(box, p);
    }

    let nrm = null;
    if (nAcc) {
      const s = nAcc.getArray();
      nrm = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const d = xformDir(world, s[i * 3], s[i * 3 + 1], s[i * 3 + 2]);
        const len = Math.hypot(d[0], d[1], d[2]) || 1;
        nrm[i * 3] = d[0] / len; nrm[i * 3 + 1] = d[1] / len; nrm[i * 3 + 2] = d[2] / len;
      }
    }

    const uv = tAcc ? Float32Array.from(tAcc.getArray()) : null;

    const iAcc = prim.getIndices();
    const idx = iAcc
      ? Uint32Array.from(iAcc.getArray())
      : Uint32Array.from({ length: count }, (_, i) => i);

    parts.push({
      nodeName: node.getName() || '',
      matName: prim.getMaterial()?.getName() || '',
      material: prim.getMaterial(),
      pos, nrm, uv, idx, box,
    });
  }
}
if (!parts.length) throw new Error('no primitives found in input');

// ---------------------------------------------------------------------------
// 2. Strip scenery, then de-duplicate side-by-side copies if the recipe says so.
// ---------------------------------------------------------------------------
let live = parts.filter((p) => !recipe.strip?.some((re) => re.test(p.nodeName)));
const stripped = parts.length - live.length;

if (recipe.dedupeByGap) {
  // Reproduces van.js:25-56 at build time. Sort parts by centre X, cut at the
  // widest gap, and keep whichever side's probe material sits further along
  // the long horizontal axis (that side's headlights face forward).
  const { minGap, keepBy } = recipe.dedupeByGap;
  const tagged = live.map((p) => ({ p, x: boxCenter(p.box)[0] })).sort((a, b) => a.x - b.x);
  let gap = 0, at = -1;
  for (let i = 1; i < tagged.length; i++) {
    const g = tagged[i].x - tagged[i - 1].x;
    if (g > gap) { gap = g; at = i; }
  }
  if (at > 0 && gap > minGap) {
    const mid = (tagged[at - 1].x + tagged[at].x) / 2;
    const sides = [tagged.filter((t) => t.x < mid).map((t) => t.p), tagged.filter((t) => t.x >= mid).map((t) => t.p)];
    const whole = newBox();
    for (const p of live) { growBox(whole, p.box.min); growBox(whole, p.box.max); }
    const axis = boxSize(whole)[0] > boxSize(whole)[2] ? 0 : 2;
    const probeAt = (set) => {
      const hits = set.filter((p) => keepBy.test(p.matName));
      if (!hits.length) return -Infinity;
      return hits.reduce((s, p) => s + boxCenter(p.box)[axis], 0) / hits.length;
    };
    const keep = probeAt(sides[0]) >= probeAt(sides[1]) ? 0 : 1;
    live = sides[keep];
    if (report) console.log(`dedupe: split at x=${mid.toFixed(2)} (gap ${gap.toFixed(2)}), kept side ${keep}, dropped ${sides[1 - keep].length} parts`);
  }
}

// ---------------------------------------------------------------------------
// 3. Resolve which source axis is forward and rotate it to +Z.
// ---------------------------------------------------------------------------
const bodyBox = newBox();
for (const p of live) { growBox(bodyBox, p.box.min); growBox(bodyBox, p.box.max); }

let forward = recipe.sourceForward;
if (forward === 'auto') {
  const probe = recipe.frontProbe;
  if (!probe) throw new Error(`recipe "${recipe.id}": sourceForward 'auto' needs a frontProbe`);
  const hits = live.filter((p) => probe.test(p.matName));
  if (!hits.length) throw new Error(`recipe "${recipe.id}": frontProbe matched no material`);
  const size = boxSize(bodyBox);
  const centre = boxCenter(bodyBox);
  const axis = size[0] > size[2] ? 0 : 2;
  const avg = hits.reduce((s, p) => s + boxCenter(p.box)[axis], 0) / hits.length;
  const sign = Math.sign(avg - centre[axis]) || 1;
  forward = (axis === 0 ? 'x' : 'z');
  forward = (sign < 0 ? '-' : '+') + forward;
  if (report) console.log(`front probe: ${hits.length} parts, long axis ${axis === 0 ? 'X' : 'Z'}, forward ${forward}`);
}

// Yaw that carries `forward` onto +Z, as a (cos, sin) pair applied to (x, z).
const YAW = { '+z': [1, 0], '-z': [-1, 0], '+x': [0, -1], '-x': [0, 1] }[forward];
if (!YAW) throw new Error(`recipe "${recipe.id}": bad sourceForward "${forward}"`);
const [cy, sy] = YAW;
const rotate = (x, y, z) => [cy * x + sy * z, y, -sy * x + cy * z];

for (const p of live) {
  const box = newBox();
  for (let i = 0; i < p.pos.length; i += 3) {
    const r = rotate(p.pos[i], p.pos[i + 1], p.pos[i + 2]);
    p.pos[i] = r[0]; p.pos[i + 1] = r[1]; p.pos[i + 2] = r[2];
    growBox(box, r);
  }
  if (p.nrm) {
    for (let i = 0; i < p.nrm.length; i += 3) {
      const r = rotate(p.nrm[i], p.nrm[i + 1], p.nrm[i + 2]);
      p.nrm[i] = r[0]; p.nrm[i + 1] = r[1]; p.nrm[i + 2] = r[2];
    }
  }
  p.box = box;
}

// ---------------------------------------------------------------------------
// 4. Island decomposition. Same weld -> union-find shape as build-props.mjs
//    clusterOBJ: these OBJs split every vertex per face, so without welding on
//    rounded position each triangle is its own island.
// ---------------------------------------------------------------------------
function islandsOf(part) {
  const { pos, idx } = part;
  const nV = pos.length / 3;
  const keyed = new Map();
  const weld = new Int32Array(nV);
  for (let i = 0; i < nV; i++) {
    const k = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
    let r = keyed.get(k);
    if (r === undefined) { r = i; keyed.set(k, i); }
    weld[i] = r;
  }
  const par = new Int32Array(nV);
  for (let i = 0; i < nV; i++) par[i] = i;
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  for (let t = 0; t < idx.length; t += 3) {
    uni(weld[idx[t]], weld[idx[t + 1]]);
    uni(weld[idx[t]], weld[idx[t + 2]]);
  }
  const out = new Map(); // root -> { tris: number[] (triangle starts), box }
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(weld[idx[t]]);
    let isl = out.get(r);
    if (!isl) { isl = { tris: [], box: newBox() }; out.set(r, isl); }
    isl.tris.push(t);
    for (let k = 0; k < 3; k++) {
      const vi = idx[t + k];
      growBox(isl.box, [pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]]);
    }
  }
  return [...out.values()];
}

// Decompose every live part once; reused by both wheel mining and capture.
for (const p of live) p.islands = islandsOf(p);

// ---------------------------------------------------------------------------
// 5. Mine wheel hubs from the seed nodes.
// ---------------------------------------------------------------------------
const seedIslands = [];
for (const p of live) {
  if (!recipe.wheelSeeds.some((re) => re.test(p.nodeName))) continue;
  for (const isl of p.islands) {
    if (isl.tris.length < recipe.minWheelTris) continue;
    seedIslands.push({ part: p, isl, centre: boxCenter(isl.box), size: boxSize(isl.box) });
  }
}
if (seedIslands.length !== 4) {
  console.warn(`WARNING: expected 4 wheel islands, found ${seedIslands.length}`);
  for (const s of seedIslands) {
    console.warn(`  ${s.part.nodeName} tris=${s.isl.tris.length} ctr=${s.centre.map((v) => v.toFixed(2)).join(',')}`);
  }
  if (seedIslands.length < 4) throw new Error('cannot rig: fewer than 4 wheel islands');
}

// Radius from the axle-plane extent (Y and Z), never X — X is the tire's width
// and, on a steered front wheel, is skewed by toe.
const wheels = seedIslands.map((s) => ({
  seed: s,
  hub: s.centre,
  radius: Math.max(boxSize(s.isl.box)[1], boxSize(s.isl.box)[2]) / 2,
  width: boxSize(s.isl.box)[0],
}));

// Corner keys: +Z is forward, +X is body LEFT (physics.js:204).
const midZ = wheels.reduce((a, w) => a + w.hub[2], 0) / wheels.length;
for (const w of wheels) w.key = (w.hub[2] >= midZ ? 'f' : 'r') + (w.hub[0] >= 0 ? 'l' : 'r');
const byKey = new Map(wheels.map((w) => [w.key, w]));
for (const k of ['fl', 'fr', 'rl', 'rr']) {
  if (!byKey.has(k)) throw new Error(`wheel corners did not resolve to fl/fr/rl/rr (got ${wheels.map((w) => w.key).join(',')})`);
}

// ---------------------------------------------------------------------------
// 6. Capture: assign every island to a wheel or to the body.
//
// An island rides with a wheel only if its whole bbox fits inside that
// wheel's capture box — [hub +/- wheelCapture * r] on Y and Z, and
// [hub +/- max(width, r)] on X.
//
// The Y/Z test is per-axis on purpose. The obvious version — "every bbox
// corner is within `capture * r` of the hub axis" — is wrong, and quietly so:
// a tire is a disc, and a disc's own bounding-box corners sit at r * sqrt(2)
// (~1.41 r) from its centre, which no sane capture multiple admits. Every
// tire therefore failed its own test and stayed welded to the body, shipping
// wheels made of nothing but rims. Per-axis containment admits the tire while
// still rejecting the wheel arch, which is taller than the tire and longer
// than it along Z.
// ---------------------------------------------------------------------------
const inCapture = (box, w) => {
  const rr = w.radius * recipe.wheelCapture;
  const halfX = Math.max(w.width, w.radius);
  if (box.min[0] < w.hub[0] - halfX || box.max[0] > w.hub[0] + halfX) return false;
  if (box.min[1] < w.hub[1] - rr || box.max[1] > w.hub[1] + rr) return false;
  if (box.min[2] < w.hub[2] - rr || box.max[2] > w.hub[2] + rr) return false;
  return true;
};

// buckets: 'body' plus one per wheel key, each a list of {part, tris}
const buckets = new Map([['body', []], ...wheels.map((w) => [w.key, []])]);
let capturedIslands = 0;
for (const p of live) {
  const groups = new Map();
  for (const isl of p.islands) {
    let target = 'body';
    for (const w of wheels) {
      if (inCapture(isl.box, w)) { target = w.key; capturedIslands++; break; }
    }
    if (!groups.has(target)) groups.set(target, []);
    groups.get(target).push(...isl.tris);
  }
  for (const [target, tris] of groups) buckets.get(target).push({ part: p, tris });
}

// ---------------------------------------------------------------------------
// 6b. De-steer: bake any posed steer/toe out of the wheels.
//
// Vehicle packs are commonly exported with the front wheels turned — this
// pack's compact sits at 10 degrees, the grace-van at 35 — because it flatters
// a static product render. The runtime rig cannot absorb that: vehicle.js
// rolls a wheel around its node's local X. Roll a tire whose real axle is 10
// degrees off X and the rim sweeps a cone instead of a circle, which is the
// front-wheel wobble. It also inflates the measured radius (the Z extent of a
// yawed tire is w*sin + 2r*cos, not 2r), so the nose rides high on wheels that
// are not as big as they measure.
//
// Rotating the geometry back is the only fix that survives, because the error
// lives INSIDE the spin: no amount of steering the parent node changes which
// axis the child rolls about. Corrected here rather than at runtime so the
// asset keeps its promise that the rig is already baked.
//
// The axle direction is read off the tire island's XZ projection. A tire is a
// solid of revolution, so that projection is an ellipse measuring 2r across
// the wheel plane and `width` along the axle — the axle is the MINOR axis.
// Only the Y rotation is corrected: it is the only one the rig can be wrong
// about in a way that compounds, and camber is real design intent.
// ---------------------------------------------------------------------------
const DESTEER_MIN_RAD = 0.25 * Math.PI / 180; // below this it is export noise
const DESTEER_MAX_RATIO = 0.7;                // minor/major variance sanity gate

function vertsOf(part, tris) {
  const seen = new Set();
  for (const t of tris) for (let k = 0; k < 3; k++) seen.add(part.idx[t + k]);
  return seen;
}

/** Signed yaw of a tire's axle away from +X, in radians. */
function axleYaw({ part, isl }) {
  const vis = vertsOf(part, isl.tris);
  let mx = 0, mz = 0;
  for (const vi of vis) { mx += part.pos[vi * 3]; mz += part.pos[vi * 3 + 2]; }
  mx /= vis.size; mz /= vis.size;

  let cxx = 0, czz = 0, cxz = 0;
  for (const vi of vis) {
    const x = part.pos[vi * 3] - mx, z = part.pos[vi * 3 + 2] - mz;
    cxx += x * x; czz += z * z; cxz += x * z;
  }
  // Principal angle of the MAJOR axis (the wheel plane), from +X toward +Z.
  const phi = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  const c = Math.cos(phi), s = Math.sin(phi);
  const varMajor = cxx * c * c + 2 * cxz * c * s + czz * s * s;
  const varMinor = cxx * s * s - 2 * cxz * c * s + czz * c * c;
  if (!(varMajor > 0) || varMinor / varMajor > DESTEER_MAX_RATIO) return null;

  // Axle is the minor axis, a quarter turn from the major one.
  let ax = -s, az = c;
  if (ax < 0) { ax = -ax; az = -az; }
  return Math.atan2(-az, ax);
}

for (const w of wheels) {
  const yaw = axleYaw(w.seed);
  if (yaw === null) {
    console.warn(`WARNING: wheel ${w.key} is too round in plan view to read an axle from — left as authored`);
    w.desteer = 0;
    continue;
  }
  w.desteer = yaw;
  if (Math.abs(yaw) < DESTEER_MIN_RAD) continue;

  // Counter-rotate about Y through the hub, so the hub itself does not move.
  const a = -yaw;
  const ca = Math.cos(a), sa = Math.sin(a);
  const [hx, , hz] = w.hub;
  for (const { part, tris } of buckets.get(w.key)) {
    for (const vi of vertsOf(part, tris)) {
      const x = part.pos[vi * 3] - hx, z = part.pos[vi * 3 + 2] - hz;
      part.pos[vi * 3] = hx + ca * x + sa * z;
      part.pos[vi * 3 + 2] = hz - sa * x + ca * z;
      if (part.nrm) {
        const nx = part.nrm[vi * 3], nz = part.nrm[vi * 3 + 2];
        part.nrm[vi * 3] = ca * nx + sa * nz;
        part.nrm[vi * 3 + 2] = -sa * nx + ca * nz;
      }
    }
  }

  // Re-measure off the corrected tire: the pre-correction radius and width
  // were both skewed by the yaw, and the sidecar is what the physics reads.
  const box = newBox();
  const { part, isl } = w.seed;
  for (const vi of vertsOf(part, isl.tris)) {
    growBox(box, [part.pos[vi * 3], part.pos[vi * 3 + 1], part.pos[vi * 3 + 2]]);
  }
  isl.box = box;
  w.hub = boxCenter(box);
  w.radius = Math.max(boxSize(box)[1], boxSize(box)[2]) / 2;
  w.width = boxSize(box)[0];
}

// ---------------------------------------------------------------------------
// 7. Scale + origin. Length is measured on the BODY only: a shadow decal or a
//    mirror sticking out must not set the vehicle's scale.
// ---------------------------------------------------------------------------
const finalBodyBox = newBox();
for (const { part, tris } of buckets.get('body')) {
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const vi = part.idx[t + k];
      growBox(finalBodyBox, [part.pos[vi * 3], part.pos[vi * 3 + 1], part.pos[vi * 3 + 2]]);
    }
  }
}
if (!boxValid(finalBodyBox)) throw new Error('body bucket is empty');

const srcLength = boxSize(finalBodyBox)[2];
const scale = recipe.targetLength / srcLength;
const origin = boxCenter(finalBodyBox);

const toFinal = (x, y, z) => [(x - origin[0]) * scale, (y - origin[1]) * scale, (z - origin[2]) * scale];

for (const w of wheels) {
  w.hubFinal = toFinal(w.hub[0], w.hub[1], w.hub[2]);
  w.radiusFinal = w.radius * scale;
  w.widthFinal = w.width * scale;
}

// ---------------------------------------------------------------------------
// 8. Rebuild the document: one node per bucket, one primitive per material.
// ---------------------------------------------------------------------------
const buffer = root.listBuffers()[0] ?? doc.createBuffer();

function buildNode(name, entries, pivot) {
  // Group this bucket's triangles by material, then re-index each group so we
  // keep welded (indexed) geometry instead of exploding to a triangle soup.
  const byMat = new Map();
  for (const { part, tris } of entries) {
    let g = byMat.get(part.material);
    if (!g) { g = []; byMat.set(part.material, g); }
    g.push({ part, tris });
  }

  const mesh = doc.createMesh(name);
  for (const [material, entriesForMat] of byMat) {
    const remap = new Map();      // `${partIndex}:${vertIndex}` -> new index
    const pos = []; const nrm = []; const uv = []; const idx = [];
    let hasN = true, hasT = true;
    for (const { part, tris } of entriesForMat) {
      if (!part.nrm) hasN = false;
      if (!part.uv) hasT = false;
    }
    for (const { part, tris } of entriesForMat) {
      const pid = live.indexOf(part);
      for (const t of tris) {
        for (let k = 0; k < 3; k++) {
          const vi = part.idx[t + k];
          const key = `${pid}:${vi}`;
          let ni = remap.get(key);
          if (ni === undefined) {
            ni = pos.length / 3;
            remap.set(key, ni);
            const f = toFinal(part.pos[vi * 3], part.pos[vi * 3 + 1], part.pos[vi * 3 + 2]);
            pos.push(f[0] - pivot[0], f[1] - pivot[1], f[2] - pivot[2]);
            if (hasN) nrm.push(part.nrm[vi * 3], part.nrm[vi * 3 + 1], part.nrm[vi * 3 + 2]);
            if (hasT) uv.push(part.uv[vi * 2], part.uv[vi * 2 + 1]);
          }
          idx.push(ni);
        }
      }
    }
    if (!idx.length) continue;

    const prim = doc.createPrimitive().setMaterial(material);
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer));
    if (hasN) prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buffer));
    if (hasT) prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer));
    const IndexArray = pos.length / 3 > 65535 ? Uint32Array : Uint16Array;
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new IndexArray(idx)).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }

  const node = doc.createNode(name).setMesh(mesh).setTranslation(pivot);
  return { node, prims: mesh.listPrimitives().length };
}

// Detach the originals before adding replacements so the writer sees only new geometry.
const oldNodes = root.listNodes();
const oldMeshes = root.listMeshes();
for (const n of oldNodes) n.dispose();
for (const m of oldMeshes) m.dispose();

const built = [];
built.push(['body', buildNode('body', buckets.get('body'), [0, 0, 0])]);
for (const key of ['fl', 'fr', 'rl', 'rr']) {
  const w = byKey.get(key);
  built.push([`wheel_${key}`, buildNode(`wheel_${key}`, buckets.get(key), w.hubFinal)]);
}
for (const [, b] of built) scene.addChild(b.node);

await io.write(output, doc);

// ---------------------------------------------------------------------------
// 9. Sidecar: every measurement the runtime and the physics would otherwise
//    have to re-derive or hardcode.
// ---------------------------------------------------------------------------
const finalSize = boxSize(finalBodyBox).map((v) => v * scale);
const wheelOut = {};
for (const key of ['fl', 'fr', 'rl', 'rr']) {
  const w = byKey.get(key);
  wheelOut[key] = {
    hub: w.hubFinal.map((v) => +v.toFixed(4)),
    radius: +w.radiusFinal.toFixed(4),
    width: +w.widthFinal.toFixed(4),
    // Steer the source model was posed with, now baked out of the geometry.
    // Kept for provenance: a non-zero value here explains why this asset's
    // radius disagrees with a measurement taken off the raw OBJ.
    desteerDeg: +(w.desteer * 180 / Math.PI).toFixed(3),
  };
}
const trackFront = Math.abs(byKey.get('fl').hubFinal[0] - byKey.get('fr').hubFinal[0]);
const trackRear = Math.abs(byKey.get('rl').hubFinal[0] - byKey.get('rr').hubFinal[0]);
const wheelbase = Math.abs(
  (byKey.get('fl').hubFinal[2] + byKey.get('fr').hubFinal[2]) / 2
  - (byKey.get('rl').hubFinal[2] + byKey.get('rr').hubFinal[2]) / 2,
);
const avgR = Object.values(wheelOut).reduce((s, w) => s + w.radius, 0) / 4;
// Lowest point of a wheel, in model space. The suspension rest length should be
// authored against this, not guessed — handoff.md 8.9 (wheels floating 0.18 m).
const groundY = Math.min(...Object.values(wheelOut).map((w) => w.hub[1] - w.radius));

const sidecar = {
  id: recipe.id,
  generated: new Date().toISOString(),
  source: { dir: recipe.srcDir, obj: recipe.obj },
  forward: '+z', up: '+y', leftAxis: '+x',
  targetLength: recipe.targetLength,
  // Enough to convert any source-space measurement into model space:
  //   model = (source - sourceOrigin) * sourceScale
  // Light mount points in src/game/data/vehicles.js are derived this way, so
  // they stay traceable to geometry instead of being eyeballed.
  sourceScale: +scale.toFixed(8),
  sourceOrigin: origin.map((v) => +v.toFixed(4)),
  body: {
    size: finalSize.map((v) => +v.toFixed(4)),
    half: finalSize.map((v) => +(v / 2).toFixed(4)),
  },
  wheels: wheelOut,
  wheelRadius: +avgR.toFixed(4),
  trackFront: +trackFront.toFixed(4),
  trackRear: +trackRear.toFixed(4),
  wheelbase: +wheelbase.toFixed(4),
  groundY: +groundY.toFixed(4),
};
writeFileSync(output.replace(/\.glb$/, '.json'), JSON.stringify(sidecar, null, 2));

// ---------------------------------------------------------------------------
const mb = (f) => (statSync(f).size / 1e6).toFixed(2) + 'MB';
console.log(`normalize "${recipe.id}": forward ${forward} -> +Z, scale ${scale.toFixed(5)} (${srcLength.toFixed(2)} src units -> ${recipe.targetLength} m)`);
console.log(`  stripped ${stripped} parts, captured ${capturedIslands} islands onto 4 wheels`);
console.log(`  de-steer: ${['fl', 'fr', 'rl', 'rr'].map((k) => `${k} ${(byKey.get(k).desteer * 180 / Math.PI).toFixed(2)}°`).join('  ')}`);
for (const [name, b] of built) console.log(`  ${name.padEnd(9)} ${b.prims} primitive(s)`);
console.log(`  body ${finalSize.map((v) => v.toFixed(2)).join(' x ')} m, wheel r=${avgR.toFixed(3)} m, track ${trackFront.toFixed(2)}/${trackRear.toFixed(2)} m, wheelbase ${wheelbase.toFixed(2)} m`);
console.log(`  ${output}: ${mb(output)}`);

if (report) {
  console.log('\nwheel hubs (model space, metres):');
  for (const key of ['fl', 'fr', 'rl', 'rr']) {
    const w = wheelOut[key];
    console.log(`  ${key}  hub(${w.hub.map((v) => v.toFixed(3).padStart(7)).join(',')})  r=${w.radius.toFixed(3)}  w=${w.width.toFixed(3)}`);
  }
  console.log(`  lowest wheel point y=${groundY.toFixed(3)} (body origin is bbox centre)`);
}
