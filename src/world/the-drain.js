// Seoul Snack Attack — the Drain.
//
// The Han does not splash when you hit it off the north-bank ramp. It PUCKERS:
// a plughole opens under the truck, the city spirals away upward, and you go
// down the throat of it into the abyss (src/world/abyss.js).
//
// WHY THE DESCENT IS SCRIPTED AND NOT SIMULATED.
//
// This sequence exists to cover a load. `src/game/dive.js` cannot know in
// advance whether the abyss BVH will take 200 ms or 3 s, so the descent has to
// be able to last any duration between about two seconds and about twelve
// without ever looking like it is waiting. A simulated fall cannot do that —
// it arrives when physics says it arrives. A scripted one is a function of a
// 0..1 progress value the controller advances at whatever rate it likes, and
// the only thing the player can perceive is "I am falling down a hole", which
// has no natural duration. Nobody has ever watched a truck go down a plughole
// and thought "that took longer than I expected".
//
// So: `pathAt(t)` is the whole contract. Feed it 0..1, get a pose. Stretch or
// squash t however the load demands. The visuals below are dressing on that.
//
// EVERYTHING IS GENERATED. Two canvas textures, ~40 KB of arithmetic, in the
// same idiom as time-of-day.js's amber sky and expanse-surface-art.js's road
// pool. A curtain that had to load assets would be a curtain that needed a
// curtain.
import * as THREE from 'three';

/** How far below the entry point the throat bottoms out, in metres. */
const THROAT_DEPTH = 96;
const THROAT_TOP_RADIUS = 34;
const THROAT_BOTTOM_RADIUS = 5.5;
/** Turns the truck makes on the way down. Two and a bit reads as a spiral. */
const DESCENT_TURNS = 2.35;

/** Radius of the spiral at t = 0: how far from the axis the descent starts. */
export const DRAIN_RIM_RADIUS = THROAT_TOP_RADIUS * 0.42;
/** d(angle)/d(t) at t = 0, in rad per unit progress. See pathAt(). */
export const DRAIN_START_SPIN = 0.75 * DESCENT_TURNS * Math.PI * 2;

/**
 * The spiral wall texture.
 *
 * Vertical streaks of varying brightness on near-black, with a few horizontal
 * bands of debris. Wrapped and scrolled, this reads as water in violent motion
 * without a single line of GLSL — and, more importantly, without a shader that
 * could fail to compile on somebody's driver in the middle of a transition
 * with no way back.
 */
function throatTexture(scale = 1) {
  const w = Math.max(64, Math.round(256 * scale));
  const h = Math.max(128, Math.round(512 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#04090f';
  ctx.fillRect(0, 0, w, h);

  // Streaks. Density and brightness both vary so the wall has depth rather
  // than reading as corduroy.
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * w;
    const width = 0.6 + Math.random() * 3.4;
    const alpha = 0.04 + Math.random() * 0.3;
    const top = Math.random() * h;
    const length = h * (0.25 + Math.random() * 0.75);
    const gradient = ctx.createLinearGradient(0, top, 0, top + length);
    const tint = Math.random() < 0.22 ? '120,205,235' : '78,140,170';
    gradient.addColorStop(0, `rgba(${tint},0)`);
    gradient.addColorStop(0.35, `rgba(${tint},${alpha})`);
    gradient.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, top, width, length);
    // Wrap: a streak crossing the seam must appear on both sides or the spin
    // shows a vertical join every rotation.
    if (x + width > w) ctx.fillRect(x - w, top, width, length);
  }

  // Debris bands — horizontal smears that give the vertical scroll something
  // to be measured against.
  for (let i = 0; i < 14; i++) {
    const y = Math.random() * h;
    const thickness = 1 + Math.random() * 5;
    ctx.fillStyle = `rgba(150,190,210,${0.03 + Math.random() * 0.07})`;
    ctx.fillRect(0, y, w, thickness);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Build the Drain. Cheap enough to build at boot and leave parked — it is one
 * hidden group of four meshes until something opens it.
 */
export function createDrain(scene, { textureScale = 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'the_drain';
  group.visible = false;
  scene.add(group);

  const inner = throatTexture(textureScale);
  const outer = throatTexture(textureScale * 0.75);
  inner.repeat.set(3, 2.2);
  outer.repeat.set(2, 1.5);

  // Two concentric shells scrolling at different rates. The parallax between
  // them is what sells depth; one shell alone reads as a printed tube.
  const innerMat = new THREE.MeshBasicMaterial({
    map: inner, side: THREE.BackSide, transparent: true, opacity: 0.95,
    depthWrite: false, fog: false,
  });
  const outerMat = new THREE.MeshBasicMaterial({
    map: outer, side: THREE.BackSide, transparent: true, opacity: 0.6,
    depthWrite: false, fog: false,
  });

  const throat = new THREE.Mesh(
    new THREE.CylinderGeometry(THROAT_TOP_RADIUS, THROAT_BOTTOM_RADIUS, THROAT_DEPTH, 40, 12, true),
    innerMat,
  );
  throat.position.y = -THROAT_DEPTH * 0.5;
  throat.name = 'drain_throat';
  group.add(throat);

  const halo = new THREE.Mesh(
    new THREE.CylinderGeometry(THROAT_TOP_RADIUS * 1.7, THROAT_BOTTOM_RADIUS * 2.4, THROAT_DEPTH * 1.15, 32, 8, true),
    outerMat,
  );
  halo.position.y = -THROAT_DEPTH * 0.5;
  halo.name = 'drain_halo';
  group.add(halo);

  // The sky you are leaving: a bright disc at the mouth that shrinks and dims
  // as you fall. This is the shot — the whole sequence is about watching Seoul
  // become a coin.
  const skyMat = new THREE.MeshBasicMaterial({
    color: 0xffcb8a, transparent: true, opacity: 0.9,
    side: THREE.DoubleSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.CircleGeometry(THROAT_TOP_RADIUS * 0.92, 40), skyMat);
  sky.rotation.x = Math.PI / 2;      // faces down, at the player
  sky.position.y = 1.5;
  sky.name = 'drain_sky';
  group.add(sky);

  // The dark you are going into. Not black — a very slightly blue disc, so the
  // bottom of the throat has a floor rather than a hole in the render.
  const deepMat = new THREE.MeshBasicMaterial({
    color: 0x03080e, transparent: true, opacity: 0.98,
    side: THREE.DoubleSide, depthWrite: false, fog: false,
  });
  const deep = new THREE.Mesh(new THREE.CircleGeometry(THROAT_BOTTOM_RADIUS * 3, 28), deepMat);
  deep.rotation.x = -Math.PI / 2;
  deep.position.y = -THROAT_DEPTH;
  deep.name = 'drain_deep';
  group.add(deep);

  const origin = new THREE.Vector3();
  const target = new THREE.Vector3();
  let spin = 0;

  const _pos = new THREE.Vector3();
  const _centre = new THREE.Vector3();
  const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

  /**
   * The spiral's axis at `t`, easing from where you hit the water to where the
   * abyss expects to receive you.
   *
   * This is the part that makes the Drain a TRANSITION rather than a hole in a
   * fixed spot. The player enters the river wherever their jump happened to put
   * them, but the abyss has one mouth, in one place. Without this the descent
   * ended directly under the entry point — which, for a jump off the north-bank
   * ramp, is 123 m from the centre of a pocket with a 95 m radius: outside its
   * own wall, in the dark, with no floor.
   */
  function axisAt(eased) {
    return _centre.lerpVectors(origin, target, eased);
  }

  return {
    group,
    depth: THROAT_DEPTH,

    /**
     * Open the drain.
     *
     * @param {THREE.Vector3} point   the spiral's AXIS on the surface — the
     *                                whirlpool's centre. pathAt(0) is
     *                                DRAIN_RIM_RADIUS from it.
     * @param {number} heading        angle around the axis the descent starts
     *                                at; the truck faces along the rim
     *                                (pathAt(0).heading = heading + PI/2)
     * @param {THREE.Vector3} landing where the descent must end — the abyss's
     *                                arrival point. See axisAt().
     */
    open(point, heading = 0, landing = null) {
      origin.copy(point);
      target.copy(landing || point).setY(landing ? landing.y : point.y - THROAT_DEPTH);
      group.position.copy(point);
      group.rotation.y = heading;
      group.visible = true;
      spin = 0;
    },

    close() {
      group.visible = false;
    },

    /**
     * Pose along the descent. `t` is 0 at the river surface, 1 at the bottom.
     *
     * Returns a shared vector and a heading/pitch pair rather than a matrix,
     * because the caller wants to blend the last few frames of it into the
     * abyss arrival and blending eulers is legible where blending matrices is
     * not.
     */
    pathAt(t) {
      const k = THREE.MathUtils.clamp(t, 0, 1);
      // The FALL eases in and out: level with the river at the start, settled
      // onto the landing point at the end.
      const eased = k * k * (3 - 2 * k);
      // The SPIN does not ease in (2026-09-11). The truck arrives already
      // circling the surface whirlpool (dive.js `caught`), so the spin starts at
      // 0.75 of its mean rate — DRAIN_START_SPIN, which dive.js matches — and
      // still settles to zero at the bottom, so the sub inherits a heading
      // rather than a pirouette.
      const turn = k * (0.75 + k * (1.5 - 1.25 * k));
      const angle = turn * DESCENT_TURNS * Math.PI * 2;
      // Radius collapses to EXACTLY zero at t = 1, so the last frame of the
      // descent is the landing point itself rather than a few metres beside it.
      // A residual offset here is a visible jolt at the handover to the sub.
      const radius = DRAIN_RIM_RADIUS * (1 - eased * eased);
      const axis = axisAt(eased);
      _pos.set(
        axis.x + Math.sin(angle + group.rotation.y) * radius,
        axis.y,
        axis.z + Math.cos(angle + group.rotation.y) * radius,
      );
      // Two acts. First the windscreen tips UP the throat, so you watch Seoul
      // shrink to a coin; then it rolls over nose-down for the break-through,
      // so the first thing the abyss shows you is the glow in the trench.
      //
      // The first version returned `pitch: -lerp(0.1, 1.32)` believing that to
      // be nose-down. In this frame a rotation about +X puts the nose DOWN, so
      // negative was nose UP: the truck arrived staring at the ceiling, and the
      // (sign-flipped) sub then fought that pose until it tumbled.
      const lookUp = THREE.MathUtils.smoothstep(k, 0, 0.3) * 0.9;
      const nose = THREE.MathUtils.lerp(lookUp, -1.0, THREE.MathUtils.smoothstep(k, 0.58, 0.96));
      return {
        position: _pos,
        heading: group.rotation.y + angle + Math.PI * 0.5,
        /** POSITIVE NOSE-UP. */
        pitchUp: nose,
        roll: Math.sin(angle * 1.4) * 0.3 * eased * (1 - k),
      };
    },

    /** Compose a pathAt() result into a quaternion, cab-up. */
    poseQuaternion(pose, target = new THREE.Quaternion()) {
      _euler.set(-pose.pitchUp, pose.heading, pose.roll);
      return target.setFromEuler(_euler);
    },

    /**
     * @param {number} dt
     * @param {number} progress 0..1 — how far down the sequence is
     * @param {number} rate     descent rate multiplier; the controller raises
     *                          this while it is stalling for the load so the
     *                          walls keep accelerating even when `progress` is
     *                          being held back.
     */
    update(dt, progress, rate = 1) {
      if (!group.visible) return;
      const k = THREE.MathUtils.clamp(progress, 0, 1);
      // Ride the shell along the spiral's axis. The descent can travel 130 m
      // laterally on its way to the mouth, and a throat left parked at the
      // entry point would have the truck exit through its wall halfway down.
      // The mouth of the shell stays above the player, which is the shot.
      const axis = axisAt(k * k * (3 - 2 * k));
      group.position.set(axis.x, origin.y, axis.z);
      // Scroll and spin both accelerate. The player reads acceleration as
      // "getting deeper" far more strongly than they read the actual descent.
      spin += dt * (0.55 + k * 3.1) * rate;
      inner.offset.y -= dt * (0.85 + k * 3.4) * rate;
      inner.offset.x = spin * 0.16;
      outer.offset.y -= dt * (0.42 + k * 1.7) * rate;
      outer.offset.x = -spin * 0.09;

      // The mouth closes over you. By k = 0.75 Seoul is a coin; by 1 it is gone.
      const skyShrink = Math.max(0.02, 1 - k * 1.25);
      sky.scale.setScalar(skyShrink);
      skyMat.opacity = 0.9 * Math.max(0, 1 - k * 1.15);
      // Lift the sky disc away as it shrinks, so it recedes rather than simply
      // scaling in place.
      sky.position.y = 1.5 + k * 26;

      // The throat itself narrows slightly, tightening the walls around the cab.
      const squeeze = THREE.MathUtils.lerp(1, 0.72, k);
      throat.scale.set(squeeze, 1, squeeze);
      halo.scale.set(THREE.MathUtils.lerp(1, 0.85, k), 1, THREE.MathUtils.lerp(1, 0.85, k));
      // The break-through. The last stretch dissolves the throat instead of
      // cutting away from it: the abyss is already visible beneath (dive.js
      // shows it from BREAKTHROUGH on), so the shell fading out IS the arrival.
      const through = 1 - THREE.MathUtils.smoothstep(k, 0.8, 0.97);
      innerMat.opacity = 0.95 * through;
      outerMat.opacity = THREE.MathUtils.lerp(0.6, 0.28, k) * through;
      deepMat.opacity = 0.98 * through;
    },

    dispose() {
      group.parent?.remove(group);
      for (const mesh of [throat, halo, sky, deep]) mesh.geometry.dispose();
      innerMat.dispose(); outerMat.dispose(); skyMat.dispose(); deepMat.dispose();
      inner.dispose(); outer.dispose();
    },
  };
}

/**
 * The whirlpool's surface texture: a black core, a teal falloff, and foam arms
 * wound as logarithmic spirals — faint at the core, heaviest near the rim where
 * the water is still catching light.
 */
function whirlpoolTexture(scale = 1) {
  const size = Math.max(128, Math.round(512 * scale));
  const px = size / 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size * 0.5;

  const body = ctx.createRadialGradient(c, c, 0, c, c, c);
  body.addColorStop(0, 'rgba(1,3,6,1)');
  body.addColorStop(0.28, 'rgba(2,10,17,0.98)');
  body.addColorStop(0.6, 'rgba(10,44,62,0.78)');
  body.addColorStop(0.85, 'rgba(30,96,120,0.3)');
  body.addColorStop(1, 'rgba(30,96,120,0)');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, size, size);

  ctx.lineCap = 'round';
  const arms = 7;
  for (let a = 0; a < arms; a++) {
    const phase = (a / arms) * Math.PI * 2 + Math.random() * 0.5;
    const weight = 0.6 + Math.random() * 0.8;
    let lastX = null;
    let lastY = null;
    for (let i = 0; i <= 96; i++) {
      const s = i / 96;
      const r = 0.12 + 0.85 * s;
      const theta = phase + Math.log(r) * 2.4;
      const x = c + Math.cos(theta) * r * c;
      const y = c + Math.sin(theta) * r * c;
      if (lastX !== null) {
        const fade = Math.min(1, (1 - s) * 5);
        ctx.strokeStyle = `rgba(200,236,246,${((0.04 + 0.42 * s) * fade).toFixed(3)})`;
        ctx.lineWidth = (0.5 + 4.5 * s) * weight * px;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      lastX = x;
      lastY = y;
    }
  }

  // Broken foam at the lip, where the river is being dragged over the edge.
  for (let i = 0; i < 70; i++) {
    const theta = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(215,242,250,${(0.08 + Math.random() * 0.22).toFixed(3)})`;
    ctx.lineWidth = (0.8 + Math.random() * 2.4) * px;
    ctx.beginPath();
    ctx.arc(c, c, c * (0.7 + Math.random() * 0.16), theta, theta + 0.08 + Math.random() * 0.3);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The whirlpool on the Han's surface — the part of the dive seen from OUTSIDE
 * the truck (dive.js `caught`), before the Drain takes it under.
 *
 * Two flat discs of spiral foam spinning at different rates over a black core.
 * Flat, not a funnel: the river is an opaque slab, so anything modelled below
 * y = 0 would be hidden by the very water it is meant to be a hole in. The
 * depth is sold by the spin, the dark centre and the truck going under.
 */
export function createWhirlpool(scene, { textureScale = 1, radius = 20 } = {}) {
  const group = new THREE.Group();
  group.name = 'drain_whirlpool';
  group.visible = false;
  scene.add(group);

  const layers = [
    { texture: whirlpoolTexture(textureScale), size: radius, lift: 0.05, opacity: 0.96, rate: 0.55 },
    { texture: whirlpoolTexture(textureScale * 0.7), size: radius * 0.6, lift: 0.08, opacity: 0.75, rate: 1.25 },
  ].map(({ texture, size, lift, opacity, rate }) => {
    const material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, opacity, depthWrite: false,
      // Lifted a few centimetres AND offset: from a 30 m shot the lift alone
      // z-fights the river.
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(size, 56), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = lift;
    mesh.name = 'drain_whirlpool_layer';
    group.add(mesh);
    return { mesh, material, texture, rate };
  });

  let t = 0;

  return {
    group,
    radius,

    open(centre) {
      group.position.copy(centre);
      group.scale.setScalar(0.2);
      group.visible = true;
      t = 0;
    },

    /** @param {number} u  0..1 through the circling: the pool opens, then spins up */
    update(dt, u = 1) {
      if (!group.visible) return;
      t += dt;
      group.scale.setScalar(THREE.MathUtils.lerp(0.2, 1, THREE.MathUtils.smoothstep(u, 0, 0.35)));
      // Positive about +Y, the same sense the truck circles in.
      const spinUp = 0.6 + 1.2 * u;
      for (const layer of layers) layer.mesh.rotation.z += dt * layer.rate * spinUp;
      layers[1].material.opacity = 0.62 + 0.13 * Math.sin(t * 3.1);
    },

    close() {
      group.visible = false;
    },

    dispose() {
      group.parent?.remove(group);
      for (const layer of layers) {
        layer.mesh.geometry.dispose();
        layer.material.dispose();
        layer.texture.dispose();
      }
    },
  };
}
