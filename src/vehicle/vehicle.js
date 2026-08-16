// Seoul Delivery — loader for normalized vehicle GLBs.
//
// The counterpart to src/vehicle/van.js, and the reason it exists: van.js
// spends ~200 lines rebuilding a rig at load time from material names and
// vertex-X sign tests, which handoff.md 8.10 flags as unable to survive a
// second vehicle. Assets built through tools/normalize-vehicle.mjs arrive with
// the rig already baked, so this file only has to read it.
//
// What the asset guarantees (see the normalizer's header):
//   - nodes named `body`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`
//   - +Z forward, +Y up, +X body LEFT
//   - each wheel node's translation IS its hub, geometry recentred on it, so
//     the node can be rotated directly — no wrapper pivot needed
//
// Returns the same shape as loadVan() so main.js, time-of-day.js and debug.js
// consume either without branching.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { NIGHT } from '../world/lighting.js';

const CORNERS = ['fl', 'fr', 'rl', 'rr'];

export async function loadVehicle(manager, def) {
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(def.asset);

  const group = new THREE.Group();
  group.add(gltf.scene);
  group.updateMatrixWorld(true);

  const byName = new Map();
  gltf.scene.traverse((o) => { if (o.name) byName.set(o.name, o); });

  const missing = ['body', ...CORNERS.map((c) => `wheel_${c}`)].filter((n) => !byName.has(n));
  if (missing.length) {
    throw new Error(
      `${def.id}: "${def.asset}" is not a normalized vehicle — missing node(s) ${missing.join(', ')}. `
      + `Rebuild it with: node tools/build-vehicle.mjs ${def.id}`
    );
  }

  // ---- Wheels --------------------------------------------------------------
  // Radius is measured off the geometry rather than trusted from the registry,
  // so a rebuilt asset cannot silently disagree with a stale constant.
  //
  // It MUST be measured through the node's transform, not from
  // geometry.boundingBox. meshopt (tools/meshopt.mjs) quantizes POSITION to
  // normalized integers and moves the real scale onto the node, so every
  // wheel's local bbox reads as a unit cube — radius 1.0 m instead of 0.33.
  // That value used to reach phys.attach() and left the car riding ~0.67 m in
  // the air on wheels that never touched. Box3.setFromObject walks the world
  // matrices and gets it right; the group is untransformed here, so world
  // space is still model space.
  const wheels = {};
  for (const key of CORNERS) {
    const node = byName.get(`wheel_${key}`);
    node.rotation.order = 'YXZ'; // steer about Y, then spin about X

    const size = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3());
    // Axle-plane extent only: the X extent is tire width, and on a steered
    // front wheel it is skewed by toe.
    const radius = Math.max(0.05, Math.max(size.y, size.z) / 2);

    wheels[key] = {
      pivot: node,
      radius,
      localPos: node.position.clone(),
      restY: node.position.y,
      steer: 0,
      spin: 0,
    };
  }
  const wheelRadius = CORNERS.reduce((s, k) => s + wheels[k].radius, 0) / CORNERS.length;

  // ---- Materials -----------------------------------------------------------
  const roles = def.materials ?? {};
  const brakeMats = [];
  const seen = new Set();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || seen.has(m.uuid)) continue;
      seen.add(m.uuid);
      const name = m.name || '';

      // Tints run first so a later role (glass, lamps) still wins on the
      // properties it cares about.
      for (const t of def.tints ?? []) {
        if (!t.match.test(name)) continue;
        if (t.color !== undefined) m.color = new THREE.Color(t.color);
        if (t.roughness !== undefined) m.roughness = t.roughness;
        if (t.metalness !== undefined) m.metalness = t.metalness;
      }

      if (roles.glass?.test(name)) {
        m.transparent = true;
        m.opacity = 0.45;
        m.color = new THREE.Color(0x0d1117);
        m.roughness = 0.08;
        m.metalness = 0.2;
        m.depthWrite = false;
      }
      if (roles.lamps?.test(name)) {
        const amber = roles.amber?.test(name);
        m.emissive = new THREE.Color(amber ? 0xff7b1c : 0xfff4d6);
        m.emissiveIntensity = amber ? 1.2 : 1.6;
        if (m.emissiveMap) m.emissiveIntensity = 2.0;
      }
      if (roles.brake?.test(name)) {
        // Overrides the lamp intensity set just above rather than taking the
        // max of it: a tail lens matched by both roles would otherwise idle at
        // the headlamp's 1.6 and hit 6.4 under braking, which blooms into a
        // pink flood across the whole road behind the car.
        m.emissive = new THREE.Color(0xff2a1a);
        m.emissiveIntensity = 0.7;
        brakeMats.push({ m, base: 0.7 });
      }
    }
  });

  // ---- Lights --------------------------------------------------------------
  // Mount points come from the definition, which derives them from measured
  // island centroids — not from the hardcoded +/-0.62 track van.js:218 uses.
  const L = def.lights ?? {};
  const headlights = (L.headlights ?? []).map(([x, y, z]) => {
    const s = new THREE.SpotLight(0xe8eeff, NIGHT.headlightIntensity, 42, 0.46, 0.62, 1.7);
    s.position.set(x, y, z);
    s.target.position.set(x * 1.6, y - 0.5, z + 14);
    group.add(s, s.target);
    return s;
  });

  const [hx, hy, hz] = L.heroFill ?? [0, 2.2, -0.2];
  const heroFill = new THREE.PointLight(0xbcd0ff, NIGHT.heroFillIntensity, 5.5, 2);
  heroFill.position.set(hx, hy, hz);
  group.add(heroFill);

  const [tx, ty, tz] = L.tail ?? [0, 0.5, -def.length / 2];
  const tailGlow = new THREE.PointLight(0xff2a1a, 0, 6, 2);
  tailGlow.position.set(tx, ty, tz);
  group.add(tailGlow);

  let braking = false;
  function setBraking(on) {
    if (on === braking) return;
    braking = on;
    for (const { m, base } of brakeMats) m.emissiveIntensity = on ? base * 4 : base;
    tailGlow.intensity = on ? 8 : 0;
  }

  return {
    id: def.id,
    group,
    wheels,
    wheelRadius,
    headlights,
    heroFill,
    setBraking,
    length: def.length,

    update(dt, phys) {
      const speed = phys.forwardSpeed;
      const p = phys.params;
      const rayLen = p.suspensionRest + p.suspensionTravel;

      // phys.wheels is built in attach() as [fl, fr, rl, rr].
      for (let i = 0; i < CORNERS.length; i++) {
        const key = CORNERS[i];
        const w = wheels[key];
        const pw = phys.wheels[i];

        w.spin -= (speed / w.radius) * dt;
        w.pivot.rotation.x = w.spin;

        const target = (key[0] === 'f') ? phys.steerAngle : 0;
        w.steer += (target - w.steer) * Math.min(1, dt * 12);
        w.pivot.rotation.y = w.steer;

        // Visual suspension travel. The physics ray measures a gap between the
        // tire and the road of rayLen * (1 - compression); van.js leaves the
        // pivots fixed, which is why handoff.md 8.9 records the van's wheels
        // floating ~0.18 m. Dropping the pivot by that gap puts the contact
        // patch where the raycast says it is. Airborne wheels hold at full
        // droop instead of stretching away from the arch.
        if (pw) {
          const gap = THREE.MathUtils.clamp(rayLen * (1 - pw.compression), 0, rayLen);
          w.pivot.position.y = w.restY - gap;
        }
      }
    },
  };
}
