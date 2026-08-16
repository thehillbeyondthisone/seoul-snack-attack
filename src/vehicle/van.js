// Seoul Delivery — van: load + normalize (recenter, scale to ~4.5m, face +Z),
// wire 4 road wheels to spin/steer pivots, lights, brake glow.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { TARGET_LENGTH } from './van-spec.js';
import { NIGHT } from '../world/lighting.js';

// TARGET_LENGTH now lives in ./van-spec.js — one identity, not five (handoff 8.4).
const WHEEL_RE = /tire|tyre|st wh|wheel/i;
const GLASS_RE = /glass|window|windshield/i;
const LIGHT_RE = /glass orange|glass white|glass atlas|light|lamp|head|tail|blink/i;

export async function loadVan(manager, url = 'assets/vehicles/van.glb') {
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;
  model.updateMatrixWorld(true);

  // ---- This export contains TWO van copies parked side by side along X ----
  // (two body sets, two plates, two lamp sets, facing opposite directions).
  // Split mesh nodes by the big X gap and keep the copy whose clear headlight
  // glass ('glass white') sits at +Z.
  {
    const meshNodes = [];
    model.traverse((o) => { if (o.isMesh) meshNodes.push(o); });
    const tagged = meshNodes
      .map((o) => ({ o, x: o.getWorldPosition(new THREE.Vector3()).x }))
      .sort((a, b) => a.x - b.x);
    let gapSize = 0, splitIdx = -1;
    for (let i = 1; i < tagged.length; i++) {
      const g = tagged[i].x - tagged[i - 1].x;
      if (g > gapSize) { gapSize = g; splitIdx = i; }
    }
    if (splitIdx > 0 && gapSize > 1.2) {
      const mid = (tagged[splitIdx - 1].x + tagged[splitIdx].x) / 2;
      const clusters = [
        tagged.filter((t) => t.x < mid).map((t) => t.o),
        tagged.filter((t) => t.x >= mid).map((t) => t.o),
      ];
      const whiteGlassZ = (nodes) => {
        let sum = 0, n = 0;
        for (const o of nodes) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          if (mats.some((m) => /glass white/i.test(m?.name || ''))) {
            sum += o.getWorldPosition(new THREE.Vector3()).z;
            n++;
          }
        }
        return n ? sum / n : -Infinity;
      };
      const keepIdx = whiteGlassZ(clusters[0]) >= whiteGlassZ(clusters[1]) ? 0 : 1;
      for (const o of clusters[1 - keepIdx]) o.removeFromParent();
    }
  }

  // ---- Orientation: find the long axis + the front, rotate front to +Z. --
  const rawBox = new THREE.Box3().setFromObject(model);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const rawCenter = rawBox.getCenter(new THREE.Vector3());

  // Front heuristic: clear/white lamp glass ('glass white') is the headlights.
  const lamps = (() => {
    const avg = new THREE.Vector3();
    let n = 0;
    model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => /glass white/i.test(m?.name || ''))) {
        avg.add(o.getWorldPosition(new THREE.Vector3()));
        n++;
      }
    });
    return n ? avg.divideScalar(n) : null;
  })();
  const xDominant = rawSize.x > rawSize.z;
  let frontVec;
  if (xDominant) {
    const s = lamps ? Math.sign(lamps.x - rawCenter.x) || -1 : -1;
    frontVec = new THREE.Vector3(s, 0, 0);
  } else {
    const s = lamps ? Math.sign(lamps.z - rawCenter.z) || -1 : -1;
    frontVec = new THREE.Vector3(0, 0, s);
  }

  // Rotate about Y so the front points along +Z.
  const container = new THREE.Group();
  container.add(model);
  model.rotation.y = -Math.atan2(frontVec.x, frontVec.z);
  model.updateMatrixWorld(true);

  // ---- Recenter + scale -------------------------------------------------
  const box = new THREE.Box3().setFromObject(container);
  const size = box.getSize(new THREE.Vector3());
  const scale = TARGET_LENGTH / size.z;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const box2 = new THREE.Box3().setFromObject(container);
  const center = box2.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, center.y, center.z)); // center at origin
  container.updateMatrixWorld(true);

  const group = new THREE.Group();
  group.add(container);
  group.updateMatrixWorld(true);

  // ---- Materials ---------------------------------------------------------
  const brakeMats = [];
  const seen = new Set();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || seen.has(m.uuid)) continue;
      seen.add(m.uuid);
      const name = (m.name || '').toLowerCase();

      if (GLASS_RE.test(name) && !LIGHT_RE.test(name)) {
        // Windows: dark tinted transparent.
        m.transparent = true;
        m.opacity = 0.45;
        m.color = new THREE.Color(0x0d1117);
        m.roughness = 0.08;
        m.metalness = 0.2;
        m.depthWrite = false;
      }
      if (LIGHT_RE.test(name)) {
        // Lamp lenses glow at night.
        m.emissive = new THREE.Color(name.includes('orange') ? 0xff7b1c : 0xfff4d6);
        m.emissiveIntensity = name.includes('orange') ? 1.2 : 1.6;
        if (m.emissiveMap) m.emissiveIntensity = 2.0;
      }
    }
    // Rear lamp materials brighten under braking (mesh sits at -Z after normalize).
    const rear = o.getWorldPosition(new THREE.Vector3()).z < -0.5;
    if (rear) {
      for (const m of mats) {
        if (m && LIGHT_RE.test(m.name || '') && !brakeMats.some((b) => b.m === m)) {
          brakeMats.push({ m, base: m.emissiveIntensity });
        }
      }
    }
  });

  // ---- Wheels -------------------------------------------------------------
  // The export's tire/rim meshes each span BOTH sides of an axle (node origin
  // at the van centerline). Split each wheel mesh into left/right halves by
  // vertex X so we get 4 real corner wheels on steer/spin pivots.
  const wheelMeshes = [];
  group.traverse((o) => { if (o.isMesh && WHEEL_RE.test(o.name)) wheelMeshes.push(o); });

  const wheels = {};
  let wheelRadius = 0.34;

  // Signed yaw of a tire's axle away from body X, in radians, for geometry
  // already recentred on its hub. A tire is a solid of revolution, so its XZ
  // projection is an ellipse measuring 2r across the wheel plane and `width`
  // along the axle: the axle is the MINOR axis, and for a rotation about Y
  // that has a closed form — no eigen-solver needed.
  const DESTEER_MIN = 0.25 * Math.PI / 180;
  const axleYaw = (pos) => {
    let cxx = 0, czz = 0, cxz = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      cxx += x * x; czz += z * z; cxz += x * z;
    }
    // Principal angle of the major axis (the wheel plane), +X toward +Z.
    const phi = 0.5 * Math.atan2(2 * cxz, cxx - czz);
    const c = Math.cos(phi), s = Math.sin(phi);
    const varMajor = cxx * c * c + 2 * cxz * c * s + czz * s * s;
    const varMinor = cxx * s * s - 2 * cxz * c * s + czz * c * c;
    if (!(varMajor > 0) || varMinor / varMajor > 0.7) return 0; // too round to read
    let ax = -s, az = c;
    if (ax < 0) { ax = -ax; az = -az; }
    return Math.atan2(-az, ax);
  };

  const _wv = new THREE.Vector3();
  for (const mesh of wheelMeshes) {
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;

    // Positions are meshopt-quantized (normalized Int16): read through
    // fromBufferAttribute (which denormalizes) and transform into group space
    // by hand. Writing world metres back into the Int16 buffer via
    // applyMatrix4 overflows it and corrupts every hub position.
    const P = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      _wv.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      P[i * 3] = _wv.x; P[i * 3 + 1] = _wv.y; P[i * 3 + 2] = _wv.z;
    }

    const halves = { l: { pos: [], uv: [] }, r: { pos: [], uv: [] } };
    for (let t = 0; t < pos.count; t += 3) {
      const cx = (P[t * 3] + P[(t + 1) * 3] + P[(t + 2) * 3]) / 3;
      const half = cx < 0 ? halves.l : halves.r;
      for (let k = 0; k < 3; k++) {
        const j = (t + k) * 3;
        half.pos.push(P[j], P[j + 1], P[j + 2]);
        if (uv) half.uv.push(uv.getX(t + k), uv.getY(t + k));
      }
    }

    for (const side of ['l', 'r']) {
      const h = halves[side];
      if (h.pos.length === 0) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(h.pos, 3));
      if (h.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(h.uv, 2));
      g.computeVertexNormals();

      const hb = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
      const hc = hb.getCenter(new THREE.Vector3());
      wheelRadius = Math.max(0.2, (hb.max.y - hb.min.y) / 2);

      // Recentre the half-geometry on its own hub.
      g.translate(-hc.x, -hc.y, -hc.z);

      const key = (hc.z >= 0 ? 'f' : 'r') + side; // +Z front

      // Bake out the steer the model was POSED with. This export's front
      // wheels are turned 35 degrees (the rear pair sit at 0) because it
      // flatters a static product render. The rig below rolls a wheel about
      // its own local X, so a tire whose real axle is 35 degrees off X sweeps
      // a cone instead of a circle — the front-tire wobble. Steering the
      // parent cannot fix it: the error lives inside the spin, so the geometry
      // itself has to come back. Measured once per corner off whichever mesh
      // reaches it first (the tire) and reused for the rim, because two layers
      // corrected independently would part company on the first frame.
      const yaw = wheels[key] ? wheels[key].desteer : axleYaw(g.attributes.position);
      if (Math.abs(yaw) > DESTEER_MIN) g.rotateY(-yaw);

      const half = new THREE.Mesh(g, mesh.material);
      if (wheels[key]) {
        // Tire and steel rim are separate source meshes for the same corner.
        // Mount both under the first shared hub so they steer/spin together;
        // separate pivots leave one layer static and read as a wobbling wheel.
        wheels[key].spinPivot.add(half);
        wheels[key].radius = Math.max(wheels[key].radius, wheelRadius);
      } else {
        // Steering and rolling on separate nodes: the outer hub steers around
        // body Y, its child rolls around the wheel's own local X. Equivalent
        // to a single `YXZ` Euler (three composes that as Ry*Rx, which is this
        // hierarchy) — vehicle.js takes the one-node form and is not wrong to.
        // Neither spelling can rescue a tire whose geometry is posed off-axis,
        // which is what the de-steer above is for. Render-only either way; the
        // physics still consumes the hub position and radius below.
        const pivot = new THREE.Group();
        const spinPivot = new THREE.Group();
        pivot.position.copy(hc);
        spinPivot.add(half);
        pivot.add(spinPivot);
        group.add(pivot);
        wheels[key] = {
          pivot, spinPivot, radius: wheelRadius, desteer: yaw,
          localPos: hc.clone(), steer: 0, spin: 0,
        };
      }
    }
    mesh.removeFromParent();
    if (geo !== mesh.geometry) geo.dispose();
  }

  // ---- Lights ---------------------------------------------------------------
  const front = TARGET_LENGTH / 2;
  // Softer penumbra and a warmer, less clinical white: at 160 these clipped to
  // pure white on wet asphalt right in front of the camera. See world/lighting.js.
  const mkSpot = (x) => {
    const s = new THREE.SpotLight(0xe8eeff, NIGHT.headlightIntensity, 42, 0.46, 0.62, 1.7);
    s.position.set(x, 0.35, front - 0.3);
    s.target.position.set(x * 1.6, -0.5, front + 14);
    group.add(s, s.target);
    return s;
  };
  const headlights = [mkSpot(-0.62), mkSpot(0.62)];

  // Hero fill. With the ambient rig this dark the player's own van sinks into
  // silhouette, and it is the thing the camera is pointed at. A short-range
  // light riding above the roof rims the bodywork without spilling onto the
  // road — cheap, and it keeps the van readable in any block's colour cast.
  const heroFill = new THREE.PointLight(0xbcd0ff, NIGHT.heroFillIntensity, 5.5, 2);
  heroFill.position.set(0, 2.2, -0.2);
  group.add(heroFill);

  // Red taillight glow while braking.
  const tailGlow = new THREE.PointLight(0xff2a1a, 0, 6, 2);
  tailGlow.position.set(0, 0.5, -front + 0.2);
  group.add(tailGlow);

  let braking = false;
  function setBraking(on) {
    if (on === braking) return;
    braking = on;
    for (const { m, base } of brakeMats) m.emissiveIntensity = on ? base * 4 : base;
    tailGlow.intensity = on ? 8 : 0;
  }

  return {
    group, wheels, wheelRadius, headlights, heroFill, setBraking,
    length: TARGET_LENGTH,
    update(dt, phys) {
      // spin + steer visuals from physics state
      const speed = phys.forwardSpeed;
      for (const key of ['fl', 'fr', 'rl', 'rr']) {
        const w = wheels[key];
        if (!w) continue;
        // Keep the accumulated angle bounded so long sessions never lose
        // visible precision in the wheel matrix.
        w.spin = THREE.MathUtils.euclideanModulo(
          w.spin - (speed / w.radius) * dt + Math.PI,
          Math.PI * 2,
        ) - Math.PI;
        w.spinPivot.rotation.x = w.spin;
        const target = (key[0] === 'f') ? phys.steerAngle : 0;
        w.steer += (target - w.steer) * Math.min(1, dt * 12);
        w.pivot.rotation.y = w.steer;
      }
    },
  };
}
