// Seoul Snack Attack — the abyssal dive.
//
// Drive the pocha off the north-bank ramp at speed and this takes over: the Han
// opens a plughole, you spiral down it in first person, break through its floor
// into the abyss, and drive a submarine (src/world/the-drain.js,
// src/world/abyss.js, src/world/abyss-life.js, src/vehicle/submarine.js).
//
// THE ONE IDEA THIS FILE IS BUILT AROUND.
//
// The abyss has to be built — geometry, materials and a BVH — and that takes an
// unknown amount of time on an unknown machine. Rather than hide that behind a
// loading screen, the sequence hides it inside a fall down a hole, because a
// fall down a hole has no duration the player can be wrong about. `progress`
// advances on a timer but is CLAMPED at `HOLD_AT` until the abyss resolves,
// while the Drain's scroll rate keeps climbing. Held, the sequence does not
// read as "waiting" — it reads as "this is getting worse". Released, it lands.
// The load starts at the top of the ramp, so the hold usually never engages.
//
// STATE MACHINE
//
//   surface ─(ramp approach)─▶ armed ─(past the lip)─▶ launched ─(water)─▶ caught
//      ▲                                                                   │
//      │                                                             (goes under)
//      │                                                                   ▼
//     spat ◀─(top of the shaft)─ returning ◀─(up the mouth)─ abyss ◀─ arriving ◀─ descending
//
// `caught` (2026-09-11) is the part you watch from OUTSIDE. The first version
// cut to the cab at the splash, so nobody ever saw the river take the truck —
// they saw a dark tube and had to infer it. Now a whirlpool opens on the Han,
// the camera pulls out to show the truck circling it and going under, and only
// then flies into the driver's seat for the Drain. The circling also buys the
// abyss build about three more seconds of head start.
//
// The return (2026-09-10 pass) is no longer a cut: the Drain runs in reverse
// from wherever you rose, and at the top the Han SPITS the truck out backwards
// in an arc onto the quay, lined up for another go.
//
// Anything that goes wrong falls back to `surface` and an ordinary respawn. A
// set piece that can strand the player is worse than no set piece.
import * as THREE from 'three';
import { SubmarinePhysics } from '../vehicle/submarine.js';
import { createDrain, createWhirlpool, DRAIN_RIM_RADIUS, DRAIN_START_SPIN } from '../world/the-drain.js';
import { buildAbyss, ABYSS, UNDERWATER_FOG_COLOR, UNDERWATER_FOG_DENSITY } from '../world/abyss.js';
import { DIVE_RAMP, onRampApproach, pastRampLip } from '../world/dive-ramp.js';

/** Seconds the descent takes when the abyss is already loaded. */
const DESCENT_SECONDS = 7.8;
/** Progress the descent will not pass until the abyss is ready. */
const HOLD_AT = 0.78;
/** Progress from which the abyss is drawn beneath the dissolving throat. */
const BREAKTHROUGH = 0.8;
/** Seconds after the breakthrough before the player is told where they are. */
const ARRIVAL_SECONDS = 2.2;
/** Seconds the ride back up the shaft takes. */
const RETURN_SECONDS = 3.4;
/** Seconds the truck is airborne after the Han spits it out. */
const SPIT_SECONDS = 1.9;
const SPIT_HEIGHT = 24;
/** Water surface, from RIVER in expanse-layout.js. */
const WATER_Y = 0.02;
/** Out of the river just past the ramp lip, back onto the known-clear apron. */
const SPIT_FROM = new THREE.Vector3(DIVE_RAMP.x, WATER_Y, 140);
const SPIT_TO = new THREE.Vector3(DIVE_RAMP.x, 1.2, DIVE_RAMP.approachStartZ + 4);
/** Seconds the truck circles the whirlpool on the surface before it goes under. */
const CAUGHT_SECONDS = 2.8;
/** Seconds the cut from the player's view to the outside shot is blended over. */
const INTO_SHOT_SECONDS = 0.7;
/** Seconds the camera takes to fly from the outside shot into the driver's seat. */
const INTO_CAB_SECONDS = 1.15;
/**
 * Blend weight at which the flight hides the body shell. Late on purpose: at
 * 0.82 the camera is still ~5 m out and the body visibly pops off; by 0.96 it
 * is within a metre of the seat, inside the shell.
 */
const HIDE_SHELL_AT = 0.96;
/** The whirlpool's radius, and the river (RIVER, expanse-layout.js) it must fit in. */
const WHIRLPOOL_RADIUS = 20;
const RIVER_BOUNDS = { minX: -320, maxX: 320, minZ: 125, maxZ: 205 };

const _v = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _camQuat = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

function beamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createDiveController({
  scene, camera, city, phys, van, hud = null, audio = null, post = null,
  lights = null, vehicle = null, onRumble = () => {},
  setCockpit = () => {}, isCockpit = () => false, setShellVisible = () => {},
  graphicsQuality = null, enabled = true,
} = {}) {
  const drain = createDrain(scene, {
    textureScale: graphicsQuality?.mobile ? 0.6 : 1,
  });
  const sub = new SubmarinePhysics({});
  sub.attachFrom(phys);
  const liveVehicle = vehicle ?? van;
  const whirlpool = createWhirlpool(scene, {
    textureScale: graphicsQuality?.mobile ? 0.6 : 1,
    radius: WHIRLPOOL_RADIUS,
  });

  let state = enabled ? 'surface' : 'off';
  let abyss = null;
  let abyssPromise = null;
  let progress = 0;
  let stateT = 0;
  let armedFor = 0;
  let wasCockpit = false;
  let look = null;          // snapshot of the surface look while underwater
  let sonarT = 3;
  let leviathanCooldown = 12;
  let metBungeo = false;
  const returnStartQuat = new THREE.Quaternion();

  // The surface circling, solved at the splash so that its last pose is the
  // Drain's first — see beginCaught().
  const caught = {
    centre: new THREE.Vector3(),
    entry: new THREE.Vector3(),
    entryHeading: 0,
    thetaEntry: 0,   // angle of the entry point around the centre
    sweep: 0,        // radians circled before going under
    lead: 1,         // share of the sweep that is constant-rate (see caughtPose)
    radius: DRAIN_RIM_RADIUS,
    shotAngle: 0,    // where the outside camera stands, around the centre
  };
  const caughtPoseOut = { position: new THREE.Vector3(), heading: 0, pitchUp: 0, roll: 0 };

  // Camera blend: eases the frame from a captured pose into whatever the live
  // camera is doing. Used for the cut out to the whirlpool shot and the flight
  // back into the cab.
  const blend = { t: -1, seconds: 1, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 60 };
  let hideShellOnBlend = false;
  let hintOnBlend = false;

  // ---- Headlight beams --------------------------------------------------------
  // Additive cones from each lamp. Spotlights light surfaces; in murk it is the
  // WATER that shows a beam, and that is most of what "submarine" looks like.
  const beamTex = beamTexture();
  const beamGeo = new THREE.CylinderGeometry(0.12, 3.4, 22, 20, 1, true);
  beamGeo.translate(0, -11, 0);
  beamGeo.rotateX(-Math.PI / 2); // apex at the lamp, opening down +Z
  const beamMat = new THREE.MeshBasicMaterial({
    // FrontSide: from the cab you look down the cone's length, and DoubleSide
    // stacked both walls into a white glare under bloom.
    map: beamTex, color: 0xcfe8ff, transparent: true, opacity: 0.26,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
  const beams = [];
  function mountBeams(on) {
    for (const b of beams) b.parent?.remove(b);
    beams.length = 0;
    if (!on) return;
    for (const lamp of liveVehicle?.headlights ?? []) {
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.copy(lamp.position);
      beam.rotation.x = 0.04;
      beam.name = 'dive_headlight_beam';
      lamp.parent?.add(beam);
      beams.push(beam);
    }
  }

  // ---- Splash, for the spit-out ------------------------------------------------
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xd8f4ff, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const splash = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 40), splashMat);
  splash.rotation.x = -Math.PI / 2;
  splash.visible = false;
  scene.add(splash);
  let splashT = -1;
  function fireSplash(at) {
    splash.position.set(at.x, WATER_Y + 0.1, at.z);
    splash.visible = true;
    splashT = 0;
    audio?.event?.('splash');
  }

  // ---- The abyss is built once and kept ----------------------------------------
  function requestAbyss() {
    if (abyss || abyssPromise) return abyssPromise;
    abyssPromise = buildAbyss(scene, {
      detailIntensity: graphicsQuality?.profile?.detailIntensity ?? 1,
    }).then((built) => {
      abyss = built;
      sub.world = { raycast: built.raycast, contain: built.contain };
      console.log('abyss: pocket ready');
      return built;
    }).catch((error) => {
      abyssPromise = null;
      console.warn('abyss failed to build; dive disabled for this run:', error);
      return null;
    });
    return abyssPromise;
  }

  // ---- Environment swap --------------------------------------------------------
  // Everything the surface look owns that would leak into the abyss: the amber
  // sky texture (the brown behind everything in the first playtest), the city's
  // hemisphere/ambient/moon rig (on the scene root, so hiding the city does not
  // hide them), the env-map reflections, the headlight throw, and bloom.
  function enterUnderwaterLook() {
    if (look) return;
    const rig = [lights?.hemi, lights?.amb, lights?.moon].filter(Boolean);
    const lamps = liveVehicle?.headlights ?? [];
    look = {
      fog: scene.fog,
      background: scene.background,
      envIntensity: scene.environmentIntensity,
      rig: rig.map((l) => [l, l.intensity]),
      lamps: lamps.map((l) => [l, l.intensity, l.distance, l.angle]),
      bloom: post ? [post.bloom.strength, post.bloom.radius, post.bloom.threshold] : null,
      cityVisible: city.group.visible,
    };
    scene.fog = new THREE.FogExp2(UNDERWATER_FOG_COLOR, UNDERWATER_FOG_DENSITY);
    scene.background = new THREE.Color(UNDERWATER_FOG_COLOR);
    // A uniform, not `environment = null`: nulling it flips a define and
    // recompiles every visible material mid-sequence.
    scene.environmentIntensity = 0.04;
    for (const [l] of look.rig) l.intensity = 0;
    for (const [l] of look.lamps) { l.intensity = 170; l.distance = 75; l.angle = 0.5; }
    if (post) { post.bloom.strength = 0.9; post.bloom.radius = 0.7; post.bloom.threshold = 0.9; }
    city.group.visible = false;
    mountBeams(true);
  }

  function exitUnderwaterLook() {
    if (!look) return;
    scene.fog = look.fog;
    scene.background = look.background;
    scene.environmentIntensity = look.envIntensity;
    for (const [l, i] of look.rig) l.intensity = i;
    for (const [l, i, d, a] of look.lamps) { l.intensity = i; l.distance = d; l.angle = a; }
    if (post && look.bloom) [post.bloom.strength, post.bloom.radius, post.bloom.threshold] = look.bloom;
    city.group.visible = look.cityVisible;
    look = null;
    abyss?.setVisible(false);
    mountBeams(false);
    audio?.setUnderwater?.(0);
  }

  function abortToSurface(reason) {
    if (state === 'surface' || state === 'off') return;
    console.warn(`dive: aborting to surface (${reason})`);
    drain.close();
    whirlpool.close();
    blend.t = -1;
    hideShellOnBlend = false;
    hintOnBlend = false;
    exitUnderwaterLook();
    hud?.setCinematic?.(false);
    setCockpit(wasCockpit);
    phys.resetToRoad();
    state = 'surface';
    progress = 0;
  }

  function setState(next) {
    state = next;
    stateT = 0;
  }

  function ballastFrom(input) {
    const up = input?.isDown?.('jump') || input?.isDown?.('handbrake') ? 1 : 0;
    const down = input?.isDown?.('sprint') ? 1 : 0;
    return up - down;
  }

  // ---- Transitions ---------------------------------------------------------------
  function beginCameraBlend(seconds) {
    blend.position.copy(camera.position);
    blend.quaternion.copy(camera.quaternion);
    blend.fov = camera.fov;
    blend.seconds = seconds;
    blend.t = 0;
  }

  /**
   * The truck hits the water and the Han grabs it.
   *
   * The whirlpool opens ahead and to the truck's LEFT, so the truck is already
   * roughly on its rim, pointing inward, and is swung round it counter to the
   * jump rather than stopped dead. The centre is clamped into the river so the
   * pool never paints over the quay.
   */
  function beginCaught(heading, speed) {
    const lx = Math.cos(heading), lz = -Math.sin(heading);   // body +X, left
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const inward = 0.9;                                      // rad off the tangent
    const reach = 22;
    const margin = WHIRLPOOL_RADIUS + 1;
    caught.entry.copy(phys.position);
    caught.centre.set(
      THREE.MathUtils.clamp(caught.entry.x + (lx * Math.cos(inward) + fx * Math.sin(inward)) * reach,
        RIVER_BOUNDS.minX + margin, RIVER_BOUNDS.maxX - margin),
      WATER_Y,
      THREE.MathUtils.clamp(caught.entry.z + (lz * Math.cos(inward) + fz * Math.sin(inward)) * reach,
        RIVER_BOUNDS.minZ + margin, RIVER_BOUNDS.maxZ - margin),
    );
    let dx = caught.entry.x - caught.centre.x;
    let dz = caught.entry.z - caught.centre.z;
    if (Math.hypot(dx, dz) < 6) {
      // Only reachable by landing against the far bank; give up on the clamp.
      caught.centre.set(caught.entry.x + lx * 14, WATER_Y, caught.entry.z + lz * 14);
      dx = caught.entry.x - caught.centre.x;
      dz = caught.entry.z - caught.centre.z;
    }
    caught.radius = Math.hypot(dx, dz);
    caught.thetaEntry = Math.atan2(dx, dz);
    caught.entryHeading = heading;

    // Solve the sweep so both ends of the circling are seamless: it leaves the
    // splash at the truck's own speed, and arrives turning at exactly the rate
    // pathAt() starts at. With angle = sweep * (lead*u + (1-lead)*u^2):
    //   start rate = sweep*lead/T,   end rate = sweep*(2-lead)/T.
    const endRate = DRAIN_START_SPIN / DESCENT_SECONDS;
    const startSweep = (THREE.MathUtils.clamp(speed, 6, 30) * 0.8 * CAUGHT_SECONDS) / caught.radius;
    caught.sweep = (endRate * CAUGHT_SECONDS + startSweep) / 2;
    caught.lead = THREE.MathUtils.clamp(startSweep / caught.sweep, 0.1, 1.9);
    // Stand opposite the middle of the arc, so the truck crosses the far side
    // of the pool, in frame the whole way, with the city behind it.
    caught.shotAngle = caught.thetaEntry + caught.sweep * 0.5 + Math.PI;

    whirlpool.open(caught.centre);
    wasCockpit = isCockpit();
    setCockpit(false);
    beginCameraBlend(INTO_SHOT_SECONDS);
    hud?.setCinematic?.(true);
    hud?.toast?.('배수구', 'THE DRAIN');
    fireSplash(caught.entry);
    audio?.event?.('whirlpool');
    onRumble(5);
    setState('caught');
  }

  /** The truck `u` (0..1) of the way round the whirlpool, as a pathAt()-style pose. */
  function caughtPose(u, t) {
    const out = caughtPoseOut;
    const theta = caught.thetaEntry + caught.sweep * (caught.lead * u + (1 - caught.lead) * u * u);
    // Reaches the Drain's rim with zero radial speed, which is how pathAt() starts.
    const r = DRAIN_RIM_RADIUS + (caught.radius - DRAIN_RIM_RADIUS) * (1 - u) ** 2;
    out.position.set(
      caught.centre.x + Math.sin(theta) * r,
      THREE.MathUtils.lerp(caught.entry.y, WATER_Y, THREE.MathUtils.smoothstep(u, 0, 0.45))
        + Math.sin(t * 5.3) * 0.22 * (1 - u),
      caught.centre.z + Math.cos(theta) * r,
    );
    // Swing from the jump's heading onto the rim's tangent.
    const along = theta + Math.PI * 0.5;
    const turn = Math.atan2(Math.sin(along - caught.entryHeading), Math.cos(along - caught.entryHeading));
    out.heading = caught.entryHeading + turn * THREE.MathUtils.smoothstep(u, 0, 0.4);
    // Nose dips from the splash and recovers; the body leans in toward the
    // centre (left, so negative roll). Both are zero at u = 1, as pathAt(0) is.
    out.pitchUp = -0.32 * (1 - THREE.MathUtils.smoothstep(u, 0, 0.3));
    out.roll = -0.2 * Math.sin(Math.PI * u);
    return out;
  }

  /** The circling ends; the Drain takes it under and the camera flies into the cab. */
  function beginDescent() {
    // Opened on the whirlpool's centre at the angle the circling ended on, so
    // caughtPose(1) and pathAt(0) are the same pose.
    drain.open(caught.centre, caught.thetaEntry + caught.sweep,
      abyss?.arrival.position || _v.set(ABYSS.centre.x, ABYSS.ceilingY - 14, ABYSS.centre.z));
    // Hidden until the camera is under the river; see update().
    drain.group.visible = false;
    progress = 0;
    setCockpit(true);
    // Keep the body on for most of the flight in: from outside, a cockpit with
    // no truck around it is a floating dashboard.
    if (isCockpit()) {
      setShellVisible(true);
      hideShellOnBlend = true;
    }
    beginCameraBlend(INTO_CAB_SECONDS);
    hintOnBlend = true;
    setState('descending');
  }

  function showViewHint() {
    const mode = hud?.inputMode;
    if (mode === 'touch') return;
    if (mode === 'gamepad') {
      hud?.toast?.('R-Stick 클릭 · 시점 변경 · D-Pad ↑ · 카메라 각도', 'Click R-Stick to change view · D-Pad ↑ camera angle');
    } else {
      hud?.toast?.('C · 시점 변경 · V · 카메라 각도', 'Press C to change view · V camera angle');
    }
  }

  function arriveInAbyss() {
    const pose = drain.pathAt(1);
    drain.close();
    abyss.setVisible(true);
    // Hand the fall's exact pose to the sub — position, heading, nose-down
    // pitch — and let its attitude smoothing swim the nose back up. No slerp,
    // no snap, and nothing that can leave the truck on its roof.
    sub.position.copy(phys.position);
    sub.setAttitude(pose.heading, pose.pitchUp, pose.roll);
    _fwd.set(Math.sin(pose.heading), 0, Math.cos(pose.heading));
    sub.velocity.copy(_fwd).multiplyScalar(3).setY(-8.5);
    setState('arriving');
  }

  function beginReturn() {
    hud?.toast?.('상승', 'SURFACING');
    returnStartQuat.copy(sub.quaternion);
    // Reverse the Drain from where you actually rose to where the Han will spit
    // you out, so the ride up is the same spiral as the ride down.
    // open() takes the spiral's axis, and pathAt(0) is a rim radius from it.
    // Offset the axis so the ride up ends ON SPIT_FROM, not a hop away from it.
    _v.set(SPIT_FROM.x, SPIT_FROM.y, SPIT_FROM.z + DRAIN_RIM_RADIUS);
    drain.open(_v, Math.PI, sub.position);
    progress = 1;
    setState('returning');
  }

  function beginSpat() {
    drain.close();
    exitUnderwaterLook();
    fireSplash(SPIT_FROM);
    hud?.toast?.('퉤!', 'SPAT OUT');
    onRumble(6);
    setState('spat');
  }

  function finishReturn() {
    phys.place(SPIT_TO, 0);
    hud?.setCinematic?.(false);
    setCockpit(wasCockpit);
    onRumble(10);
    audio?.event?.('impact', 6);
    progress = 0;
    setState('surface');
  }

  return {
    get state() { return state; },
    get isSubmerged() {
      return state === 'arriving' || state === 'abyss' || state === 'returning';
    },
    get suspendRoadPhysics() {
      return state === 'caught' || state === 'descending' || state === 'arriving'
        || state === 'abyss' || state === 'returning' || state === 'spat';
    },
    /** True while the outside whirlpool shot is framed by updateCamera(), not a player camera. */
    get ownsCamera() { return state === 'caught'; },
    get physics() { return this.isSubmerged ? sub : phys; },
    get submarine() { return sub; },
    get abyss() { return abyss; },
    get depthM() { return this.isSubmerged ? sub.depthM : 0; },

    resetInAbyss() {
      if (!abyss || (state !== 'abyss' && state !== 'arriving')) return;
      sub.place(abyss.arrival.position, abyss.arrival.heading);
      sub.controls.ballast = 0;
      setState('abyss');
    },

    /** Boot hook: `?dive=1` drops straight in, `?dive=ramp` lines up the jump. */
    async debugEnter(mode) {
      if (state === 'off') return;
      if (mode === 'ramp') {
        phys.place(new THREE.Vector3(DIVE_RAMP.x, 1.2, DIVE_RAMP.approachStartZ), 0);
        requestAbyss();
        return;
      }
      await requestAbyss();
      if (!abyss) return;
      wasCockpit = isCockpit();
      setCockpit(true);
      enterUnderwaterLook();
      audio?.setUnderwater?.(1);
      hud?.setCinematic?.(true);
      abyss.setVisible(true);
      sub.place(abyss.arrival.position, abyss.arrival.heading);
      setState('abyss');
    },

    stepFixed(dt, input) {
      stateT += dt;

      if (state === 'caught') {
        _prev.copy(phys.position);
        const overshoot = stateT - CAUGHT_SECONDS;
        if (overshoot > -1e-6) {
          // Hand over inside this step and give the leftover time to the Drain.
          // Clamping u at 1 instead parks the truck on the rim for one frame —
          // a 20 m/s stall, measured at ~1200 m/s^2 in the headless check.
          beginDescent();
          progress = Math.max(0, overshoot) / DESCENT_SECONDS;
          const pose = drain.pathAt(progress);
          phys.position.copy(pose.position);
          drain.poseQuaternion(pose, phys.quaternion);
        } else {
          const pose = caughtPose(stateT / CAUGHT_SECONDS, stateT);
          phys.position.copy(pose.position);
          drain.poseQuaternion(pose, phys.quaternion);
        }
        phys.velocity.subVectors(phys.position, _prev).divideScalar(dt);
        phys.angularVelocity.set(0, 0, 0);
        return;
      }

      if (state === 'descending') {
        const ready = !!abyss;
        progress += dt / DESCENT_SECONDS;
        progress = Math.min(progress, ready ? 1 : HOLD_AT);
        if (ready && progress >= BREAKTHROUGH && !abyss.group.visible) abyss.setVisible(true);

        const pose = drain.pathAt(progress);
        phys.position.copy(pose.position);
        drain.poseQuaternion(pose, phys.quaternion);
        phys.velocity.set(0, -14 * progress, 0);
        phys.angularVelocity.set(0, 0, 0);

        if (progress >= 1 && ready) arriveInAbyss();
        else if (progress >= HOLD_AT && !ready && !abyssPromise) abortToSurface('abyss unavailable');
        return;
      }

      if (state === 'arriving' || state === 'abyss') {
        sub.controls.ballast = ballastFrom(input);
        sub.step(dt);
        if (state === 'arriving') {
          if (stateT >= ARRIVAL_SECONDS) {
            setState('abyss');
            hud?.toast?.('심연 · Shift 잠수 · Space 천천히 상승', 'THE ABYSS · Shift dive · Space rise (slowly)');
          }
          return;
        }
        // Out through the mouth: no key press. Up the shaft you came down is
        // self-evidently the way home.
        const p = sub.position;
        const inMouth = Math.hypot(p.x - ABYSS.centre.x, p.z - ABYSS.centre.z) < ABYSS.mouthRadius;
        // Half the commanded climb rate: the rise is deliberately slow now, and a
        // fixed 1 m/s would sit too close to it to fire reliably.
        if (inMouth && p.y > ABYSS.ceilingY + 3 && sub.velocity.y > sub.params.riseSpeed * 0.5) beginReturn();
        return;
      }

      if (state === 'returning') {
        progress = Math.max(0, progress - dt / RETURN_SECONDS);
        const pose = drain.pathAt(progress);
        sub.position.copy(pose.position);
        drain.poseQuaternion(pose, _q);
        sub.quaternion.slerpQuaternions(returnStartQuat, _q, THREE.MathUtils.smoothstep(1 - progress, 0, 0.18));
        sub.velocity.set(0, 16 * (1 - progress), 0);
        if (look && progress < 0.2) exitUnderwaterLook();
        if (progress <= 0) beginSpat();
        return;
      }

      if (state === 'spat') {
        // Backwards, in an arc, over the ramp, facing the water you just left.
        const u = Math.min(1, stateT / SPIT_SECONDS);
        phys.position.lerpVectors(SPIT_FROM, SPIT_TO, u);
        phys.position.y += 4 * SPIT_HEIGHT * u * (1 - u);
        _euler.set(0.45 * Math.sin(Math.PI * u), 0, 0.22 * Math.sin(Math.PI * 2 * u));
        phys.quaternion.setFromEuler(_euler);
        phys.velocity.subVectors(SPIT_TO, SPIT_FROM).divideScalar(SPIT_SECONDS);
        phys.velocity.y = (4 * SPIT_HEIGHT * (1 - 2 * u)) / SPIT_SECONDS;
        phys.angularVelocity.set(0, 0, 0);
        if (u >= 1) finishReturn();
      }
    },

    update(dt, input) {
      if (state === 'off') return;

      if (splashT >= 0) {
        splashT += dt;
        const k = splashT / 1.4;
        splash.scale.setScalar(2 + k * 26);
        splashMat.opacity = Math.max(0, 0.9 * (1 - k));
        if (k >= 1) { splashT = -1; splash.visible = false; }
      }

      if (state === 'surface' || state === 'armed') {
        const pose = phys.meshPosition;
        _fwd.set(0, 0, 1).applyQuaternion(phys.quaternion);
        const approaching = onRampApproach(pose, _fwd.z)
          && phys.forwardSpeed > DIVE_RAMP.minLaunchSpeed * 0.6;
        if (approaching && state === 'surface') {
          state = 'armed';
          armedFor = 0;
          requestAbyss();
          hud?.toast?.('잠수 준비', 'DIVE ARMED');
        } else if (state === 'armed') {
          armedFor += dt;
          if (pastRampLip(pose) && phys.forwardSpeed > DIVE_RAMP.minLaunchSpeed) {
            state = 'launched';
            // Takeoff is the musical cue; approaching the ramp is only preload.
            audio?.music?.startDive();
          }
          else if (!approaching && armedFor > 1.2) state = 'surface';
        }
        return;
      }

      if (state === 'launched') {
        const pose = phys.meshPosition;
        if (pose.y <= WATER_Y + 0.4 && pose.z > DIVE_RAMP.zEnd) {
          _fwd.set(0, 0, 1).applyQuaternion(phys.quaternion);
          beginCaught(Math.atan2(_fwd.x, _fwd.z), Math.hypot(phys.velocity.x, phys.velocity.z));
        } else if (pose.y < -8 || phys.forwardSpeed < 1) {
          state = 'surface';
        }
        return;
      }

      if (state === 'caught') {
        whirlpool.update(dt, Math.min(1, stateT / CAUGHT_SECONDS));
        return;
      }

      if (state === 'descending') {
        // Stay on the surface look until the flight into the cab carries the
        // camera under the river: from outside, the city and the whirlpool ARE
        // the shot. (Last frame's camera; one frame late is invisible.)
        if (!look && (camera.position.y < WATER_Y - 0.05 || blend.t < 0)) {
          enterUnderwaterLook();
          whirlpool.close();
          drain.group.visible = true;
        }
        if (!look) whirlpool.update(dt, 1);
        const holding = !abyss && progress >= HOLD_AT - 1e-3;
        drain.update(dt, progress, holding ? 1.9 : 1);
        audio?.setUnderwater?.(Math.min(1, progress * 1.3));
        if (abyss?.group.visible) abyss.update(dt, camera, phys.position);
        return;
      }

      if (state === 'returning') {
        drain.update(dt, progress, 1.4);
        audio?.setUnderwater?.(Math.min(1, progress * 1.3));
      }

      if (this.isSubmerged && abyss) {
        abyss.update(dt, camera, sub.position);

        // Sonar, because it is a submarine, and because silence in the dark
        // reads as the audio having broken.
        sonarT -= dt;
        if (sonarT <= 0 && state === 'abyss') { audio?.event?.('sonar'); sonarT = 7.5; }

        // The Bungeo passing close: felt before it is seen.
        leviathanCooldown -= dt;
        const head = abyss.bungeoHead;
        if (head && state === 'abyss' && leviathanCooldown <= 0 && head.distanceTo(sub.position) < 42) {
          leviathanCooldown = 28;
          audio?.event?.('leviathan');
          onRumble(4);
          if (!metBungeo) {
            metBungeo = true;
            hud?.toast?.('…붕어빵?', 'SOMETHING LARGE AND WARM IS CIRCLING');
          }
        }
      }
    },

    /**
     * The outside shot while the truck circles the whirlpool. Stands off the
     * pool, high, and drifts in and down with the current, looking between the
     * truck and the plughole so both stay in frame.
     */
    updateCamera(dt, cam = camera) {
      if (state !== 'caught') return;
      const e = THREE.MathUtils.smoothstep(stateT / CAUGHT_SECONDS, 0, 1);
      const angle = caught.shotAngle + 0.35 * e;
      const distance = THREE.MathUtils.lerp(36, 27, e);
      cam.position.set(
        caught.centre.x + Math.sin(angle) * distance,
        WATER_Y + THREE.MathUtils.lerp(14, 9, e),
        caught.centre.z + Math.cos(angle) * distance,
      );
      _lookAt.lerpVectors(caught.centre, phys.position, 0.55).setY(WATER_Y - 1);
      cam.up.set(0, 1, 0);
      cam.lookAt(_lookAt);
      if (Math.abs(cam.fov - 55) > 0.05) {
        cam.fov = 55;
        cam.updateProjectionMatrix();
      }
    },

    /**
     * Run after whichever camera framed this frame. Eases from the pose captured
     * by beginCameraBlend() into it, so the cut out to the whirlpool and the
     * flight back into the seat are moves rather than cuts.
     */
    afterCamera(dt, cam = camera) {
      if (blend.t < 0) return;
      blend.t = Math.min(blend.seconds, blend.t + dt);
      const w = THREE.MathUtils.smoothstep(blend.t / blend.seconds, 0, 1);
      _camPos.copy(cam.position);
      cam.position.lerpVectors(blend.position, _camPos, w);
      _camQuat.copy(cam.quaternion);
      cam.quaternion.slerpQuaternions(blend.quaternion, _camQuat, w);
      const fov = THREE.MathUtils.lerp(blend.fov, cam.fov, w);
      if (Math.abs(fov - cam.fov) > 0.01) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
      if (hideShellOnBlend && w >= HIDE_SHELL_AT) {
        hideShellOnBlend = false;
        if (isCockpit()) setShellVisible(false);
      }
      if (blend.t >= blend.seconds) {
        blend.t = -1;
        if (hintOnBlend) {
          hintOnBlend = false;
          showViewHint();
        }
      }
    },

    dispose() {
      whirlpool.dispose();
      mountBeams(false);
      beamGeo.dispose(); beamMat.dispose(); beamTex.dispose();
      splash.geometry.dispose(); splashMat.dispose();
      scene.remove(splash);
      drain.dispose();
      abyss?.dispose();
    },
  };
}
