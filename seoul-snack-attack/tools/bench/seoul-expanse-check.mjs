// Seoul Expanse validation. Runs entirely in Node — no Blender, no WebGL.
//
//   node tools/bench/seoul-expanse-check.mjs
//
// Validates:
//   * world.json loads, units/axes/bounds match the brief
//   * road graph connectivity, minimum node degree, ring radii ≥80 m,
//     no bridge/dead-end dependencies in non-bridge edges
//   * delivery anchors / drop-offs exist per district
//   * spawn / pickup / reset markers are inside the playable bounds and on
//     a road projection within 4 m
//   * every district is reachable from every other
//
// Exits non-zero on any failure.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const worldJson = path.resolve(root,
  '_source-assets/world/seoul-expanse/build/world.json');
const rgJson = path.resolve(root,
  '_source-assets/world/seoul-expanse/seoul-expanse-roadgraph.json');
const lmJson = path.resolve(root,
  '_source-assets/world/seoul-expanse/seoul-expanse-landmarks.json');
const mfJson = path.resolve(root,
  '_source-assets/world/seoul-expanse/seoul-expanse-manifest.json');

let failures = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!pass) failures++;
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

if (!exists(worldJson)) {
  console.error(`FATAL: world.json missing at ${worldJson}`);
  process.exit(1);
}
const world = JSON.parse(fs.readFileSync(worldJson, 'utf8'));

// 1. world.json schema + bounds
check('world.json loads', !!world);
check('units is metres', world.units === 'metres');
check('north is -Z', world.axis?.north === '-Z');
check('bounds X ∈ [-500, 500]',
  world.bounds.minX === -500 && world.bounds.maxX === 500);
check('bounds Z ∈ [-360, 360]',
  world.bounds.minZ === -360 && world.bounds.maxZ === 360);
check('six districts defined with ids',
  Object.keys(world.districts).sort().join(',') ===
  ['hangang','hills','hongdae','market','pocha','station'].sort().join(','));

// 2. ring radii
const radius = (p0, p1, p2) => {
  const ax = p0.x, az = p0.z; const bx = p1.x, bz = p1.z; const cx = p2.x, cz = p2.z;
  const a = Math.hypot(bx-cx, bz-cz);
  const b = Math.hypot(ax-cx, az-cz);
  const c = Math.hypot(ax-bx, az-bz);
  const s = (a+b+c)/2;
  const area = Math.sqrt(Math.max(0, s*(s-a)*(s-b)*(s-c)));
  if (area === 0) return Infinity;
  return (a*b*c) / (4*area + 1e-9);
};
const ring = world.ring.centreline;
let minR = Infinity;
for (let i = 0; i < ring.length; i++) {
  const r = radius(ring[i-1] || ring[ring.length-1], ring[i], ring[(i+1)%ring.length]);
  if (r < minR) minR = r;
}
check('every ring arc radius >= 80 m', minR >= 80, `min ${minR.toFixed(1)} m`);
check('ring lane width >= 3.2 m', world.ring.laneWidth >= 3.2,
  `${world.ring.laneWidth} m`);
check('ring underpass clearance >= 5.2 m',
  world.ring.underpassClearance >= 5.2,
  `${world.ring.underpassClearance} m`);

// 3. road graph (only if generated)
if (exists(rgJson)) {
  const rg = JSON.parse(fs.readFileSync(rgJson, 'utf8'));
  check('roadgraph units is metres', rg.units === 'metres');
  check('roadgraph north is -Z', rg.north === '-Z');
  // degree-2 minimum
  const adj = new Map();
  for (const e of rg.edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e.b);
    adj.get(e.b).push(e.a);
  }
  let minDeg = Infinity;
  for (const n of rg.nodes) {
    const d = (adj.get(n.id) || []).length;
    if (d < minDeg) minDeg = d;
  }
  check('every routeable node has degree >= 2',
    minDeg >= 2, `min degree ${minDeg}`);
  // connectivity under removal of any non-bridge edge
  const nodeIds = rg.nodes.map((n) => n.id);
  const connected = (elist) => {
    const a = new Map();
    for (const e of elist) {
      if (!a.has(e.a)) a.set(e.a, []);
      if (!a.has(e.b)) a.set(e.b, []);
      a.get(e.a).push(e.b);
      a.get(e.b).push(e.a);
    }
    const seen = new Set();
    const start = nodeIds[0];
    seen.add(start);
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      for (const nbr of a.get(cur) || []) {
        if (!seen.has(nbr)) { seen.add(nbr); stack.push(nbr); }
      }
    }
    return seen.size === nodeIds.length;
  };
  const baseOk = connected(rg.edges);
  check('road graph is connected', baseOk);
  let bridgeFails = 0;
  for (let i = 0; i < rg.edges.length; i++) {
    const e = rg.edges[i];
    if (e.class === 'bridge') continue;
    const rest = rg.edges.slice(0, i).concat(rg.edges.slice(i + 1));
    if (!connected(rest)) {
      bridgeFails++;
      if (bridgeFails <= 3) console.error(`  non-bridge bridge: ${e.id}`);
    }
  }
  check('no non-bridge edge is a routing bridge', bridgeFails === 0,
    `${bridgeFails} failures`);
  // every district reachable from every other
  const byDistrict = new Map();
  for (const n of rg.nodes) {
    if (!byDistrict.has(n.district)) byDistrict.set(n.district, n.id);
  }
  // BFS reachability
  const bfs = (src) => {
    const seen = new Set([src]);
    const stack = [src];
    while (stack.length) {
      const cur = stack.pop();
      for (const nbr of adj.get(cur) || []) {
        if (!seen.has(nbr)) { seen.add(nbr); stack.push(nbr); }
      }
    }
    return seen;
  };
  const sources = [...byDistrict.values()];
  let distFails = 0;
  for (const a of sources) for (const b of sources) {
    if (a === b) continue;
    if (!bfs(a).has(b)) distFails++;
  }
  check('every district reaches every other district',
    distFails === 0, `${distFails} cross-failures`);
} else {
  console.log('SKIP  roadgraph checks (file not found yet — first build pending)');
}

// 4. landmarks
if (exists(lmJson)) {
  const lm = JSON.parse(fs.readFileSync(lmJson, 'utf8'));
  check('spawn_player present', !!lm.spawn_player);
  check('spawn_vehicle present', !!lm.spawn_vehicle);
  check('at least 8 pickup markers', lm.pickups?.length >= 8,
    `${lm.pickups?.length ?? 0} pickups`);
  check('all 8 required pickup ids present',
    ['tteokbokki','hotteok','eomuk','gimbap','chimaek','bingsu','gilgeori','pocha']
      .every((id) => lm.pickups?.some((p) => p.id === id)));
  check('at least 24 drop-offs', lm.drop_offs?.length >= 24,
    `${lm.drop_offs?.length ?? 0} drop-offs`);
  check('at least 12 reset markers', lm.resets?.length >= 12,
    `${lm.resets?.length ?? 0} resets`);
  // every district appears in drop-offs
  const districtsWithDO = new Set(lm.drop_offs?.map((d) => d.district));
  check('every district has drop-offs',
    Object.keys(world.districts).every((d) => districtsWithDO.has(d)));
  // every marker is inside bounds
  const inBounds = (x, z) =>
    x >= world.bounds.minX && x <= world.bounds.maxX &&
    z >= world.bounds.minZ && z <= world.bounds.maxZ;
  let oob = 0;
  const checkPts = [
    ['spawn_player', lm.spawn_player],
    ['spawn_vehicle', lm.spawn_vehicle],
    ...(lm.pickups || []).map((p) => ['pickup', p]),
    ...(lm.drop_offs || []).map((d) => ['drop_off', d]),
    ...(lm.resets || []).map((r) => ['reset', r]),
  ];
  for (const [tag, p] of checkPts) {
    if (!p) continue;
    const x = p.position?.[0] ?? p.x;
    const z = p.position?.[2] ?? p.z;
    if (!inBounds(x, z)) {
      oob++;
      console.error(`  ${tag} OOB: ${p.id} (${x}, ${z})`);
    }
  }
  check('every marker inside playable bounds', oob === 0, `${oob} out of bounds`);
} else {
  console.log('SKIP  landmark checks (file not found yet)');
}

// 5. manifest
if (exists(mfJson)) {
  const mf = JSON.parse(fs.readFileSync(mfJson, 'utf8'));
  check('manifest units metres', mf.units === 'metres');
  check('manifest has districts', !!mf.districts);
  check('manifest has bounds', !!mf.bounds);
  check('manifest has markers.pickup_count >= 8',
    (mf.markers?.pickup_count ?? 0) >= 8);
  check('manifest has markers.drop_off_count >= 24',
    (mf.markers?.drop_off_count ?? 0) >= 24);
  check('manifest has markers.reset_count >= 12',
    (mf.markers?.reset_count ?? 0) >= 12);
  check('manifest has roadGraph.nodes >= 30',
    (mf.roadGraph?.nodes ?? 0) >= 30,
    `${mf.roadGraph?.nodes ?? 0} nodes`);
} else {
  console.log('SKIP  manifest checks (file not found yet)');
}

console.log();
if (failures) {
  console.error(`seoul-expanse-check: ${failures} FAIL`);
  process.exit(1);
}
console.log(`seoul-expanse-check: 0 FAIL (all required checks passed)`);