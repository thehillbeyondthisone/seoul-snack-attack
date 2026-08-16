// Seoul Delivery — street props: load, place, render, and hand the movable ones
// to the physics world.
//
// Placement is scanned ONCE in tile-local space (every tile is the same
// geometry, so the anchors are identical) and then selected per tile with its
// own seeded RNG. That is what stops 15 copies of one block from reading as 15
// copies of one block: same buildings, different clutter.
//
// ==================== movable props and city.raycast ======================
// Movable props are NEVER added to city.raycast. VehiclePhysics fires 8 outward
// bumper rays and damps the van's velocity per ray that hits (handoff 8.1/8.2),
// so a prop visible to those rays would brake the van to a crawl just for
// driving past it. Movables live only in PropWorld and meet the van through
// OBB tests. See the header of src/physics/prop-world.js.
// ==========================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mulberry32, tileSeed } from '../core/rng.js';
import { PropWorld } from '../physics/prop-world.js';
import { PROPS, DEFAULT_DENSITY } from './data/props.js';

const CATALOG_URL = 'assets/props/catalog.json';
const BASE_SEED = 20260813;
/** Never drop a prop on top of the player. */
const SPAWN_CLEAR = 6;

const DOWN = new THREE.Vector3(0, -1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export async function loadProps(scene, city, { mode = 'world', seed = BASE_SEED, density = 1 } = {}) {
  const t = (label, t0) => {
    if (import.meta.env?.DEV) console.log(`props: ${label} ${(performance.now() - t0).toFixed(0)}ms`);
    return performance.now();
  };
  let mark = performance.now();

  const catalog = await fetch(withBase(CATALOG_URL)).then((r) => {
    if (!r.ok) throw new Error(`props catalog ${r.status}`);
    return r.json();
  });
  mark = t('catalog', mark);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  // Geometry per catalog prop, keyed "<pack>:<index>".
  const defs = new Map();
  await Promise.all(catalog.packs.map(async (pack) => {
    const gltf = await loader.loadAsync(withBase(pack.url));
    const byName = new Map();
    gltf.scene.traverse((o) => { if (o.isMesh) byName.set(o.name, o); });
    for (const p of pack.props) {
      const mesh = byName.get(p.node);
      if (!mesh) { console.warn(`props: ${pack.id} missing node ${p.node}`); continue; }
      const key = `${pack.id}:${p.index}`;
      const meta = PROPS[key] || null;
      defs.set(key, {
        key,
        pack: pack.id,
        geometry: mesh.geometry,
        material: mesh.material,
        size: new THREE.Vector3(...p.size),
        catalog: p,
        meta,
      });
    }
  }));

  mark = t(`loaded ${defs.size} prop meshes`, mark);

  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);

  const propWorld = new PropWorld({ world: city });
  const instances = new Map();  // key -> { mesh, count, handles: [] }
  const lampAnchors = [];

  const placements = mode === 'gallery'
    ? layoutGallery(defs, city)
    : layoutWorld(defs, city, seed, lampAnchors, t, density);
  mark = t(`placed ${placements.length}`, mark);

  // ---- Render: one InstancedMesh per prop type ---------------------------
  const byKey = new Map();
  for (const pl of placements) {
    if (!byKey.has(pl.key)) byKey.set(pl.key, []);
    byKey.get(pl.key).push(pl);
  }
  for (const [key, list] of byKey) {
    const def = defs.get(key);
    const mesh = new THREE.InstancedMesh(def.geometry, def.material, list.length);
    // Instances span the whole city, so a single bounding sphere would keep it
    // on screen anyway; the tile cull and the small triangle counts cover us.
    mesh.frustumCulled = false;
    mesh.name = `prop_${key}`;
    list.forEach((pl, i) => {
      _m.compose(pl.position, pl.quaternion, _v.set(1, 1, 1));
      mesh.setMatrixAt(i, _m);
      pl.instanceIndex = i;
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    instances.set(key, { mesh, list });
  }

  // ---- Physics bodies ----------------------------------------------------
  const handleToPlacement = new Map();
  if (mode === 'world') {
    for (const pl of placements) {
      const def = defs.get(pl.key);
      const meta = def.meta;
      if (!meta || meta.body === 'decor') continue;
      const handle = propWorld.add({
        position: pl.position,
        quaternion: pl.quaternion,
        size: def.size,
        mass: massOf(def),
        shape: meta.shape === 'cylinder' ? 'cylinder' : 'box',
        static: meta.body === 'static',
        userData: pl.key,
      });
      pl.handle = handle;
      handleToPlacement.set(handle, pl);
      // Let it settle onto the ground it was placed on.
      if (meta.body === 'dynamic') propWorld.wake(handle);
    }
  }

  function update() {
    // Only bodies that actually moved rewrite their instance matrix.
    const dirty = new Set();
    propWorld.forEachMoved((handle) => {
      const pl = handleToPlacement.get(handle);
      if (!pl) return;
      const entry = instances.get(pl.key);
      if (!entry) return;
      propWorld.getRenderMatrix(handle, _m);
      entry.mesh.setMatrixAt(pl.instanceIndex, _m);
      dirty.add(entry.mesh);
    });
    for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    group, catalog, defs, placements, world: propWorld, lampAnchors, update,
    stats: { placed: placements.length, types: byKey.size, bodies: propWorld.bodies.size },
    setMass(key, kg) {
      for (const pl of placements) if (pl.key === key && pl.handle) propWorld.setMass(pl.handle, kg);
    },
    reset() { propWorld.resetAll(); update(); },
    dispose() { scene.remove(group); },
  };
}

function withBase(url) {
  const base = import.meta.env?.BASE_URL ?? '/';
  return base.endsWith('/') ? base + url : `${base}/${url}`;
}

/** Bounding-volume fallback so no prop is ever massless by accident. */
function massOf(def) {
  if (def.meta?.mass) return def.meta.mass;
  return Math.max(2, (def.catalog.volume || 0.05) * DEFAULT_DENSITY);
}

// ---------------------------------------------------------------------------
// Anchor scanning — done once, in tile-local space
// ---------------------------------------------------------------------------

/**
 * Curb anchors: points on a raised sidewalk that sit next to road level. Found
 * by walking a grid and looking for a 0.08..0.5 m step down to a neighbour.
 * `inward` points away from the road, i.e. further onto the pavement.
 */
function scanCurbs(city) {
  // The whole block, not the road slab. tileBounds is the union of the road
  // surfaces, and the kerb line by definition sits just OUTSIDE it — scanning
  // tileBounds finds almost no pavement, because both of the boulevard's
  // sidewalks lie beyond its Z edges.
  const b = city.districtBounds || city.tileBounds;
  const roadY = city.roadBox.min.y;
  const out = [];
  const STEP = 0.8;
  // The authored kerb is 5.6 cm here (pavement 0.000, carriageway -0.056), so
  // the old 0.06 m floor rejected essentially the whole kerb line — 26 anchors
  // for a 102 x 96 m district. Sit just under the real step instead.
  const KERB_MIN = 0.035;
  // Deliberately NO clearSky test here. Sidewalks in this city run under eaves,
  // awnings and street trees, and requiring open sky above rejected ~80% of the
  // kerb line — the props that belong there (bollards, bins, bikes) are short
  // and do not care. Only the 6 m streetlamp does, and it checks separately.
  for (let x = b.min.x + 1.2; x <= b.max.x - 1.2; x += STEP) {
    for (let z = b.min.z + 1.2; z <= b.max.z - 1.2; z += STEP) {
      const h = city.findGroundLocal(x, z);
      if (!h) continue;
      const y = h.point.y;
      if (y < roadY + KERB_MIN || y > roadY + 0.55) continue; // must be kerb-height pavement

      // Which neighbour is the road? Probe two distances — the kerb transition
      // is not always sharp enough to catch at a single radius.
      let found = null;
      for (const probe of [0.8, 1.4]) {
        for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = city.findGroundLocal(x + ux * probe, z + uz * probe);
          if (!n || n.point.y > roadY + KERB_MIN) continue;
          found = [ux, uz];
          break;
        }
        if (found) break;
      }
      if (!found) continue;
      const [ux, uz] = found;

      // A real kerb has pavement CONTINUING away from the road. Lowering the
      // step threshold to catch a 5.6 cm kerb also lets a manhole or road seam
      // standing a few cm proud qualify — those have road on every side, and
      // without this test bollards and bins get placed mid-carriageway.
      const inward = city.findGroundLocal(x - ux * 1.2, z - uz * 1.2);
      if (!inward || inward.point.y < roadY + KERB_MIN) continue;
      out.push({
        point: new THREE.Vector3(x, y, z),
        inward: new THREE.Vector3(-ux, 0, -uz), // away from the road
        streetYaw: Math.atan2(-uz, -ux) + Math.PI / 2,
        openSky: city.clearSkyLocal(x, y, z),
      });
    }
  }
  return out;
}

/** Open road points, for the loose clutter you actually aim at. */
function scanRoad(city) {
  const b = city.roadBox;
  const roadY = b.min.y;
  const out = [];
  for (let x = b.min.x + 2; x <= b.max.x - 2; x += 2.2) {
    for (let z = b.min.z + 2; z <= b.max.z - 2; z += 2.2) {
      const h = city.findGroundLocal(x, z);
      if (!h || Math.abs(h.point.y - roadY) > 0.06) continue;
      if (!city.clearSkyLocal(x, h.point.y, z)) continue;
      out.push({ point: h.point.clone(), streetYaw: 0 });
    }
  }
  return out;
}

/**
 * Wall anchors: from each curb point, cast horizontally until something with a
 * near-vertical normal is hit. That gives both the facade and its normal using
 * only the raycast we already have — no extra geometry query.
 */
function scanWalls(city, curbs) {
  const out = [];
  const dirs = [];
  for (let a = 0; a < 8; a++) dirs.push(new THREE.Vector3(Math.cos((a / 8) * Math.PI * 2), 0, Math.sin((a / 8) * Math.PI * 2)));

  for (const c of curbs) {
    for (const d of dirs) {
      const hit = city.localRaycast(_v.set(c.point.x, c.point.y + 1.6, c.point.z), d, 4.5);
      if (!hit || !hit.face) continue;
      if (Math.abs(hit.face.normal.y) > 0.3) continue; // floor/ceiling, not a wall
      const n = hit.face.normal.clone();
      if (n.dot(d) > 0) n.negate(); // point back toward the sampler
      const p = hit.point.clone();
      // Merge anchors that land on the same bit of wall.
      if (out.some((o) => o.point.distanceToSquared(p) < 1.6 * 1.6)) continue;
      out.push({ point: p, normal: n, groundY: c.point.y });
      break;
    }
  }
  return out;
}

/** Parking bays: road points with a clear car-sized box beside the kerb. */
function scanParking(city, curbs) {
  const out = [];
  for (const c of curbs) {
    // 2 m out into the road from the kerb.
    const away = c.inward.clone().negate();
    const px = c.point.x + away.x * 2.0;
    const pz = c.point.z + away.z * 2.0;
    const h = city.findGroundLocal(px, pz);
    if (!h || h.point.y > city.roadBox.min.y + 0.06) continue;
    if (!city.clearSkyLocal(px, h.point.y, pz)) continue;
    if (out.some((o) => o.point.distanceToSquared(h.point) < 7 * 7)) continue;
    out.push({ point: h.point.clone(), streetYaw: c.streetYaw });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

function layoutWorld(defs, city, seed, lampAnchors, t = () => 0, density = 1) {
  density = THREE.MathUtils.clamp(density, 0.2, 1);
  const budget = (full, minimum) => Math.max(minimum, Math.round(full * density));
  let m = performance.now();
  const curbs = scanCurbs(city); m = t(`scanCurbs ${curbs.length}`, m);
  const road = scanRoad(city); m = t(`scanRoad ${road.length}`, m);
  const walls = scanWalls(city, curbs); m = t(`scanWalls ${walls.length}`, m);
  const parking = scanParking(city, curbs); m = t(`scanParking ${parking.length}`, m);

  // Buckets of eligible prop keys per placement kind, with selection weights.
  const buckets = { curb: [], road: [], wall: [], park: [] };
  for (const def of defs.values()) {
    const meta = def.meta;
    if (!meta || !meta.place) continue;
    for (const kind of meta.place) {
      if (!buckets[kind]) continue;
      for (let i = 0; i < (meta.weight ?? 1); i++) buckets[kind].push(def);
    }
  }

  const placements = [];
  const grid = city.grid;
  const spawn = city.spawn.position;
  const safeResets = city.safeResetPoints || [{ position: spawn }];

  for (let t = 0; t < grid.count; t++) {
    const i = t % grid.cols;
    const j = Math.floor(t / grid.cols);
    const rng = mulberry32(tileSeed(seed, i, j));
    const used = [];

    const take = (list, n, fn) => {
      const order = shuffled(list, rng);
      let placed = 0;
      for (const anchor of order) {
        if (placed >= n) break;
        const bucketDef = fn(anchor, rng);
        if (bucketDef) placed++;
      }
    };

    const tryPlace = (def, localPos, localYaw, minGap) => {
      // Reject overlaps within the tile before transforming out.
      for (const u of used) {
        if (u.p.distanceToSquared(localPos) < minGap * minGap) return false;
      }
      const world = grid.localToWorld(t, localPos, new THREE.Vector3());
      if (safeResets.some((reset) =>
        world.distanceToSquared(reset.position) < SPAWN_CLEAR * SPAWN_CLEAR
      )) return false;
      // Keep the ten end-zone junctions and their sight lines clear. A parked
      // car at a T-junction would turn a topology-safe loop into a practical
      // dead end for a first-time player.
      if (city.roadGraph?.nodes.some((node) =>
        world.distanceToSquared(node.position) < 10 * 10
      )) return false;
      used.push({ p: localPos.clone() });
      placements.push({
        key: def.key,
        position: world,
        quaternion: new THREE.Quaternion().setFromAxisAngle(UP, grid.headingToWorld(t, localYaw)),
        tile: t,
      });
      return true;
    };

    // Sidewalk clutter — the bulk of the dressing.
    take(curbs, budget(30, 10), (a) => {
      const def = pick(buckets.curb, rng);
      if (!def) return null;
      // A 6 m lamp post must not grow through an awning.
      if (def.meta.lampAnchor && !a.openSky) return null;
      // Confirm the inset is still on raised pavement. Curb normals come from
      // nearby height samples, and narrow islands otherwise send props back
      // onto the carriageway after the offset is applied.
      const p = a.point.clone().addScaledVector(a.inward, 0.70 + rng() * 0.30);
      const ground = city.findGroundLocal(p.x, p.z);
      if (!ground || ground.point.y < city.roadBox.min.y + 0.06) return null;
      p.copy(ground.point);
      const yaw = def.meta.yaw === 'street' ? a.streetYaw : rng() * Math.PI * 2;
      if (!tryPlace(def, p, yaw, 1.6)) return null;
      if (def.meta.lampAnchor) {
        lampAnchors.push(grid.localToWorld(t, p, new THREE.Vector3()));
      }
      return def;
    });

    // A cone in the lane is the thing you steer for.
    take(road, budget(4, 2), (a) => {
      const def = pick(buckets.road, rng);
      if (!def) return null;
      const p = a.point.clone();
      p.x += (rng() - 0.5) * 1.2;
      p.z += (rng() - 0.5) * 1.2;
      return tryPlace(def, p, rng() * Math.PI * 2, 2.5) ? def : null;
    });

    // Facades.
    take(walls, budget(14, 4), (a) => {
      const def = pick(buckets.wall, rng);
      if (!def) return null;
      const band = def.meta.heightBand || [2.0, 4.0];
      const half = Math.max(def.size.x, def.size.z) / 2;
      const p = a.point.clone().addScaledVector(a.normal, half * 0.9);
      p.y = band[0] + rng() * (band[1] - band[0]);
      // A shop sign projects OUT from the wall; a vent sits flat against it.
      const face = Math.atan2(a.normal.x, a.normal.z);
      const yaw = def.meta.perpendicular ? face + Math.PI / 2 : face;
      return tryPlace(def, p, yaw, 1.4) ? def : null;
    });

    // Parked vehicles.
    take(parking, budget(3, 1), (a) => {
      const def = pick(buckets.park, rng);
      if (!def) return null;
      return tryPlace(def, a.point.clone(), a.streetYaw, 8) ? def : null;
    });
  }

  return placements;
}

/** `?props=gallery` — every catalog prop on a labelled grid, for curation. */
function layoutGallery(defs, city) {
  const list = [...defs.values()];
  const placements = [];
  const origin = city.spawn.position.clone();
  const COLS = 10;
  const PITCH = 3;
  list.forEach((def, i) => {
    const gx = (i % COLS) - COLS / 2;
    const gz = Math.floor(i / COLS);
    placements.push({
      key: def.key,
      position: new THREE.Vector3(origin.x + gx * PITCH, origin.y, origin.z + gz * PITCH),
      quaternion: new THREE.Quaternion(),
      tile: 0,
      label: `${def.key}  ${def.size.toArray().map((v) => v.toFixed(2)).join('x')}m  ${def.meta?.name ?? '(unassigned)'}`,
    });
  });
  return placements;
}

function pick(bucket, rng) {
  if (!bucket.length) return null;
  return bucket[Math.floor(rng() * bucket.length)];
}

function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
