// Seoul Snack Attack — the pink hippo bobble on the pocha's dashboard.
//
// The fibreglass hippo from the reference photo — lilac paint, mouth wide open,
// two lower tusks — shrunk to a dashboard toy. It is built from primitives in
// code rather than a Blender recipe: the camera meets it at about a metre, and
// at that distance ellipsoids in the right proportions read as the statue where
// a detailed mesh would only cost triangles.
//
// THE BOBBLE. The body is glued to the dash. The head rides a damped spring
// driven by the rig's own latG / longG — the telemetry the cockpit camera sways
// on — so it leans out of corners and nods under braking. Crashes never reach
// latG / longG (both rigs derive them from the force sum, and a collision is
// resolved outside it), which is why `bump()` exists.
//
// AXES. Hippo-local +Z is the snout, +Y up, +X the hippo's own left: the
// vehicle contract, so yaw 0 faces down the road. Geometry is authored in
// hippo lengths (tail to snout = 1) and SCALE turns that into metres.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 22 cm tail to snout. At a realistic 15 cm it was about 55 px wide in an
// 800 px seated view — a lilac smudge with no readable mouth — so it is sized
// for the driver's seat, not for a toy shop.
const SCALE = 0.22;
// The neck joint, in hippo lengths. It sits inside the chest blob, so a tilted
// head uncovers more pink rather than a gap.
const PIVOT = [0, 0.25, 0.17];
// The statue's head is nearly half its length. Authored at body scale it read
// as a pinhead against the photo, so the whole head is grown about the neck.
const HEAD = 1.2;

// Spring, per axis. √K ≈ 7.4 rad/s is a 1.2 Hz nod, and ζ = C / 2√K ≈ 0.08
// lets a pothole ring on for a couple of seconds, which is the whole joke.
// GAIN is rad/s² per G: a steady 0.6 G corner settles at GAIN·0.6/K ≈ 0.25 rad.
const K = 55;
const C = 1.2;
const GAIN = 23;
const LIMIT = 0.5;        // rad — where the neck hits its stop
const STEP = 1 / 120;     // fixed substep: a hitched frame cannot blow the spring up
const MAX_STEPS = 12;

// Local hexes, the way the cab recipe treats upholstery — the colour bible has
// no opinion about hippos. Sampled by eye from the reference photo. `glow` is a
// fraction of the colour fed back as emissive: the mouth faces down and away
// from every light in the cab, and without a little fake bounce the statue's
// bright white gape renders as a grey hole.
const PAINT = {
  hide: { color: 0xcfa0d2, roughness: 0.42 },
  lining: { color: 0xeee6f0, roughness: 0.5, glow: 0.22 },
  tongue: { color: 0xe3a8c8, roughness: 0.55, glow: 0.12 },
  tooth: { color: 0xf5f4ef, roughness: 0.3, glow: 0.08 },
  nostril: { color: 0xa9739f, roughness: 0.6 },
  iris: { color: 0x86909a, roughness: 0.25 },
  pupil: { color: 0x1c1d21, roughness: 0.2 },
};

const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function trs(pos, rot = [0, 0, 0], scale = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    _p.fromArray(pos),
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])),
    _s.fromArray(scale),
  );
}

const ball = (w = 20, h = 14) => new THREE.SphereGeometry(1, w, h);

/**
 * Parts collected by paint and merged into one mesh per paint. Every transform
 * is baked into the vertices — nothing moves except the head as a whole — so
 * the toy costs a draw call per colour instead of one per blob.
 */
class Casting {
  /** @param {THREE.Matrix4|null} [base]  applied to every part, outermost */
  constructor(base = null) {
    this.base = base;
    this.byPaint = new Map();
  }

  add(paint, geometry, pos, scale = [1, 1, 1], rot = [0, 0, 0], parent = null) {
    const m = trs(pos, rot, scale);
    if (parent) m.premultiply(parent);
    if (this.base) m.premultiply(this.base);
    geometry.deleteAttribute('uv');
    geometry.applyMatrix4(m);
    if (!this.byPaint.has(paint)) this.byPaint.set(paint, []);
    this.byPaint.get(paint).push(geometry);
    return this;
  }

  cast(materials) {
    const group = new THREE.Group();
    for (const [paint, parts] of this.byPaint) {
      const mesh = new THREE.Mesh(mergeGeometries(parts), materials[paint]);
      for (const g of parts) g.dispose();
      mesh.name = `dash_hippo_${paint}`;
      // Same reasoning as the cabin it sits in (interior.js): no shadow pass,
      // and never sphere-culled against a camera parked inside the truck.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    return group;
  }
}

/** One continuous barrel: a stacked-ellipsoid torso creases at every seam. */
function torso() {
  let g = new THREE.SphereGeometry(1, 28, 18);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i);
    // The belly sags most amidships; the back runs flatter than the belly.
    y *= y < 0 ? 1 + 0.15 * (1 - z * z) : 0.9;
    // The haunches narrow a touch toward the tail.
    x *= 1 - 0.1 * Math.max(0, -z);
    pos.setXYZ(i, x, y, z);
  }
  // Weld the UV seam before recomputing normals, or it shows as a crease.
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  g.computeVertexNormals();
  return g;
}

function castBody(materials) {
  const body = new Casting()
    .add('hide', torso(), [0, 0.2, -0.1], [0.14, 0.125, 0.3])
    .add('hide', ball(), [0, 0.225, 0.14], [0.13, 0.13, 0.12])                          // chest, up into the neck
    .add('hide', new THREE.ConeGeometry(0.018, 0.05, 10), [0, 0.24, -0.4], [1, 1, 1], [-2.0, 0, 0]); // tail
  // Short and thick, set in under the barrel: the statue shows barely a
  // hand's width of leg below the belly.
  for (const x of [-0.065, 0.065]) {
    for (const z of [-0.28, 0.08]) {
      body
        .add('hide', new THREE.CylinderGeometry(0.05, 0.056, 0.11, 14), [x, 0.065, z])
        .add('hide', ball(14, 8), [x, 0.02, z + 0.006], [0.062, 0.02, 0.066]);          // foot
    }
  }
  return body.cast(materials);
}

function castHead(materials) {
  // The upper jaw is authored closed along +Z and swung 48 degrees open about
  // its hinge. The hinge sits high and far back, and the jaw carries its own
  // forehead, so the top of the head runs crown to nose as one heavy mass —
  // hinged low and thin, it read as a stalk with a ball on the end.
  const jaw = trs([0, -0.03, 0.11], [-0.84, 0, 0]);
  const head = new Casting(new THREE.Matrix4().makeScale(HEAD, HEAD, HEAD))
    .add('hide', ball(), [0, 0, 0.03], [0.115, 0.12, 0.1])           // collar over the joint
    .add('hide', ball(), [0, 0.01, 0.05], [0.105, 0.1, 0.12])        // crown
    .add('hide', ball(), [0, -0.075, 0.08], [0.12, 0.09, 0.11])      // jowls
    .add('hide', ball(), [0, -0.105, 0.265], [0.1, 0.042, 0.14])     // lower jaw
    .add('lining', ball(), [0, -0.064, 0.275], [0.09, 0.014, 0.12])  // lower lip rim
    .add('tongue', ball(), [0, -0.058, 0.25], [0.07, 0.014, 0.085])  // tongue
    .add('tongue', ball(), [0, -0.025, 0.17], [0.085, 0.07, 0.035])  // throat
    .add('hide', ball(), [0, 0.035, 0.03], [0.11, 0.075, 0.09], [0, 0, 0], jaw)     // forehead
    .add('hide', ball(), [0, 0.03, 0.14], [0.11, 0.07, 0.15], [0, 0, 0], jaw)       // upper jaw
    .add('hide', ball(), [0, 0.045, 0.235], [0.12, 0.075, 0.085], [0, 0, 0], jaw)   // nose bulb
    .add('lining', ball(), [0, -0.03, 0.15], [0.095, 0.016, 0.14], [0, 0, 0], jaw); // palate

  for (const s of [-1, 1]) {
    head
      .add('hide', ball(12, 8), [s * 0.045, 0.11, 0.26], [0.024, 0.024, 0.024], [0, 0, 0], jaw)
      .add('nostril', ball(10, 6), [s * 0.045, 0.132, 0.265], [0.01, 0.004, 0.012], [0, 0, 0], jaw)
      .add('tooth', new THREE.ConeGeometry(0.012, 0.03, 8), [s * 0.06, -0.02, 0.27], [1, 1, 1], [Math.PI, 0, 0], jaw)
      // The two lower tusks are the silhouette's tell, so they are chunky.
      .add('tooth', new THREE.ConeGeometry(0.02, 0.1, 12), [s * 0.055, -0.045, 0.37], [1, 1, 1], [-0.15, 0, -s * 0.12])
      .add('hide', ball(12, 8), [s * 0.055, 0.08, -0.035], [0.017, 0.034, 0.026], [0, 0, -s * 0.35]); // ear

    // Eye: a brow bump proud of the crown, then eyeball, iris and pupil
    // stacked along one gaze.
    const brow = new THREE.Vector3(s * 0.075, 0.08, 0);
    const gaze = new THREE.Vector3(s * 0.8, 0.35, 0.45).normalize();
    const along = (d) => brow.clone().addScaledVector(gaze, d).toArray();
    head
      .add('hide', ball(12, 8), brow.toArray(), [0.03, 0.028, 0.03])
      .add('lining', ball(12, 8), along(0.02), [0.02, 0.02, 0.02])
      .add('iris', ball(12, 8), along(0.032), [0.012, 0.012, 0.012])
      .add('pupil', ball(8, 6), along(0.041), [0.0065, 0.0065, 0.0065]);
  }
  return head.cast(materials);
}

/**
 * Build the hippo. The returned group's origin is the soles of its feet, so it
 * seats by position alone.
 *
 * @param {object} [opts]
 * @param {number} [opts.yaw]  radians about +Y; which way the snout points
 */
export function createDashHippo({ yaw = 0 } = {}) {
  const materials = {};
  for (const [name, p] of Object.entries(PAINT)) {
    const m = new THREE.MeshStandardMaterial({ color: p.color, roughness: p.roughness, metalness: 0 });
    if (p.glow) m.emissive.setHex(p.color).multiplyScalar(p.glow);
    m.name = `dash_hippo_${name}`;
    materials[name] = m;
  }

  const root = new THREE.Group();
  root.name = 'dash_hippo';
  root.scale.setScalar(SCALE);
  root.rotation.y = yaw;

  const neck = new THREE.Group();
  neck.name = 'dash_hippo_neck';
  neck.position.fromArray(PIVOT);
  neck.add(castHead(materials));
  root.add(castBody(materials), neck);

  // The spring lives in the TRUCK's frame — pitch about its X, roll about its
  // Z — because that is the frame the G telemetry is in. The neck node sits
  // under the hippo's yaw, so each frame's tilt is conjugated through it.
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const yawInv = yawQ.clone().invert();
  const tilt = new THREE.Quaternion();
  const tiltEuler = new THREE.Euler();

  let pitch = 0;
  let roll = 0;
  let wPitch = 0;
  let wRoll = 0;
  let knocks = 0;

  return {
    group: root,

    update(dt, phys) {
      if (!(dt > 0)) return;
      // Truck frame: +X left, +Z forward. Braking (longG < 0) throws the head
      // forward, which is positive pitch; a left turn (latG > 0) throws it to
      // the right, which is positive roll about +Z.
      const fPitch = -GAIN * (Number.isFinite(phys.longG) ? phys.longG : 0);
      const fRoll = GAIN * (Number.isFinite(phys.latG) ? phys.latG : 0);

      const span = Math.min(dt, STEP * MAX_STEPS);
      const steps = Math.ceil(span / STEP);
      const h = span / steps;
      for (let i = 0; i < steps; i++) {
        wPitch += (fPitch - K * pitch - C * wPitch) * h;
        wRoll += (fRoll - K * roll - C * wRoll) * h;
        pitch += wPitch * h;
        roll += wRoll * h;
        // The neck stop: pin the angle and bounce a little off it.
        if (Math.abs(pitch) > LIMIT) {
          pitch = Math.sign(pitch) * LIMIT;
          if (wPitch * pitch > 0) wPitch *= -0.3;
        }
        if (Math.abs(roll) > LIMIT) {
          roll = Math.sign(roll) * LIMIT;
          if (wRoll * roll > 0) wRoll *= -0.3;
        }
      }

      tilt.setFromEuler(tiltEuler.set(pitch, 0, roll));
      neck.quaternion.copy(yawInv).multiply(tilt).multiply(yawQ);
    },

    /** A knock the G telemetry never sees. Severity is the rig's crash scale. */
    bump(severity) {
      if (!(severity > 0)) return;
      const kick = Math.min(6, severity * 0.8);
      // Alternate the sideways part so two knocks in a row do not both pin
      // the head against the same stop.
      knocks += 1;
      wPitch += kick;
      wRoll += kick * 0.5 * (knocks % 2 ? 1 : -1);
    },

    dispose() {
      root.parent?.remove(root);
      root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      for (const m of Object.values(materials)) m.dispose();
    },
  };
}
