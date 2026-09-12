// Seoul Snack Attack — the cockpit shell the first-person camera lives inside.
//
// tools/blender/recipes/pocha_interior.py builds this asset and its header
// explains WHY it is a separate GLB: the shipped exterior is a normalised
// third-party truck with no inside, and carving a cabin to match its window
// openings would bind us to a silhouette we do not control. This file is the
// runtime half — it parks that shell inside the vehicle group, lights it, and
// drives the three nodes the recipe deliberately left movable.
//
// AXES. Same contract as the vehicle: +Z forward, +Y up, +X body LEFT. The
// asset's own origin is the floor-pan underside, centred in XY, so
// `def.interior.offset` is the one number that seats a cabin on a chassis.
//
// WHY THE EXTERIOR IS NOT HIDDEN IN HERE. pocha.glb's materials are all
// single-sided (no `doubleSided` flag anywhere in the GLB), so from a camera
// inside the body the shell is backface-culled and simply is not there. The
// exterior keeps rendering, keeps casting its shadow on the road, and the
// player looks straight out through it. Nothing has to be toggled.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDashHippo } from './dash-hippo.js';

const MOVERS = ['steering_wheel', 'needle_speed', 'needle_fuel'];
const DEG = Math.PI / 180;

/**
 * Load a vehicle's cockpit, or resolve to null when it has none.
 *
 * A missing `interior` block is the ordinary case, not a fault: the van has no
 * cabin asset and the cockpit view is simply unavailable while driving it.
 */
export async function loadInterior(manager, def) {
  const spec = def.interior;
  if (!spec) return null;

  const loader = new GLTFLoader(manager);
  const gltf = await loader.loadAsync(spec.asset);

  const group = new THREE.Group();
  group.name = `${def.id}_interior`;
  group.position.fromArray(spec.offset);
  group.add(gltf.scene);
  group.visible = false;

  const byName = new Map();
  gltf.scene.traverse((o) => { if (o.name) byName.set(o.name, o); });
  const missing = MOVERS.filter((n) => !byName.has(n));
  if (missing.length) {
    throw new Error(
      `${def.id}: "${spec.asset}" is not a cockpit — missing node(s) ${missing.join(', ')}. `
      + `Rebuild it with: npm run blender -- pocha-interior`
    );
  }

  // The cabin is enclosed and the camera sits 0.7 m from most of it, so
  // self-shadow mapping is avoided; the dome and PBR environment light it.
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    // Never frustum-culled away: the group's bounding sphere is computed from
    // an asset whose origin is its floor, and a camera sitting inside it is
    // exactly the case sphere culling gets wrong at grazing angles.
    o.frustumCulled = false;
  });

  // ---- Lighting ------------------------------------------------------------
  // ONE point light, and it never leaves the scene.
  //
  // three recompiles every material in the scene when the visible light count
  // changes, so a lamp that switched on with the view would hitch the frame the
  // player pressed C. This one is permanent and rides its intensity to zero
  // instead: the light count is constant, the recompile happens once at load.
  //
  // `distance` is deliberately shorter than the drop to the road (the lens sits
  // ~2.4 m up) so the cabin lamp cannot pool light on the asphalt under a truck
  // whose panels do not cast a shadow for it.
  const dome = new THREE.PointLight(0xffedd0, 0, 1.7, 2);
  dome.position.fromArray(spec.dome);
  group.add(dome);

  // ---- Dashboard hippo -----------------------------------------------------
  // Separate Blender casting, with a preserved head pivot for the spring.
  let hippo = null;
  if (spec.hippo) {
    const toy = await loader.loadAsync(spec.hippo.asset);
    hippo = createDashHippo({ model: toy.scene, yaw: spec.hippo.yaw });
    hippo.group.position.fromArray(spec.hippo.position);
    group.add(hippo.group);
  }

  const wheel = byName.get('steering_wheel');
  const needleSpeed = byName.get('needle_speed');
  const needleFuel = byName.get('needle_fuel');
  // The rest pose is a node transform in the GLB (the 55-degree lay-back onto
  // the column). Keep a copy: every frame re-derives the wheel from it rather
  // than integrating, so a paused or reversed steering input cannot drift.
  const wheelRest = wheel.quaternion.clone();

  const [sweepZero, sweepFull] = spec.needleSweep;
  const fullScale = spec.speedFullScale;
  let shownSpeed = 0;
  let shownDepth = 0;
  let lit = 0;
  // Metres of depth at full deflection, or null while the truck is a truck.
  // See setDepthMode below.
  let depthFullScale = null;

  return {
    group,
    dome,
    // The seat eye point in VEHICLE MODEL space — the interior's own eye point
    // carried by the same offset that seats the cabin. src/vehicle/
    // cockpit-camera.js works in that frame because phys.meshPosition does.
    eye: new THREE.Vector3().fromArray(spec.eye).add(group.position),

    /** Show or hide the cabin. Hidden is the chase-camera case. */
    setVisible(on) {
      group.visible = on;
    },

    /**
     * Bind the second dial to depth, or hand it back.
     *
     * `needle_fuel` has been parked since the cab shipped, on the grounds that
     * a gauge bound to something that is not fuel is a lie the player reads as
     * one. The abyssal dive (src/game/dive.js) is the case that makes it true:
     * underwater, the second dial is a depth gauge, reading `phys.depthM` from
     * the submarine rig. Above water it goes back to being parked, because
     * there is still no tank.
     *
     * @param {number|null} fullScaleM  metres at full deflection, null to park
     */
    setDepthMode(fullScaleM) {
      depthFullScale = Number.isFinite(fullScaleM) && fullScaleM > 0 ? fullScaleM : null;
      if (depthFullScale === null) {
        shownDepth = 0;
        needleFuel.rotation.z = sweepZero * DEG;
      }
    },

    update(dt, phys) {
      // Ride the lamp rather than switching it: see the light-count note above.
      const wanted = group.visible ? 1 : 0;
      lit += (wanted - lit) * Math.min(1, dt * 8);
      dome.intensity = lit * 1.6;
      if (!group.visible) return;

      // Steering. phys.steerAngle is the ROAD wheel angle and positive is a
      // left turn (physics.js:245). The rim's own axis is local +Y — the GLB
      // is Y-up, so the recipe's "local Z" is written in Blender's frame — and
      // that axis points away from the driver, which makes a positive rotation
      // read clockwise from the seat. A left turn is therefore negative.
      wheel.quaternion.copy(wheelRest);
      wheel.rotateY(-phys.steerAngle * spec.steerRatio);

      // Speedometer. The recipe marks a 0–150 dial over this 250-degree sweep.
      // Keep the recipe's markings and vehicle metadata in sync. Needles have mass: the
      // reading lags the physics rather than snapping to it.
      const target = THREE.MathUtils.clamp(Math.abs(phys.speedKmh) / fullScale, 0, 1);
      shownSpeed += (target - shownSpeed) * Math.min(1, dt * 6);
      needleSpeed.rotation.z = THREE.MathUtils.lerp(sweepZero, sweepFull, shownSpeed) * DEG;

      // needle_fuel is parked at its shipped pose unless something has claimed
      // it. There is still no fuel system, and a gauge bound to something that
      // is not fuel is a lie the player reads as one — but `setDepthMode()`
      // binds it to a quantity that IS real while the truck is underwater, and
      // a depth gauge in a submarine is not a lie. See setDepthMode above.
      if (depthFullScale !== null) {
        const depth = Number.isFinite(phys.depthM) ? phys.depthM : 0;
        const target = THREE.MathUtils.clamp(depth / depthFullScale, 0, 1);
        // The same needle mass as the speedometer, and slower: a depth gauge
        // that snapped would read as a readout rather than an instrument.
        shownDepth += (target - shownDepth) * Math.min(1, dt * 3.5);
        needleFuel.rotation.z = THREE.MathUtils.lerp(sweepZero, sweepFull, shownDepth) * DEG;
      }

      hippo?.update(dt, phys);
    },

    /**
     * A knock the rig's G telemetry never sees — a crash, a hull strike. Only
     * the dash hippo cares today; the camera shake has its own hook.
     */
    bump(severity) {
      hippo?.bump(severity);
    },

    dispose() {
      group.parent?.remove(group);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m?.dispose();
      });
      dome.dispose?.();
      hippo?.dispose();
    },
  };
}
