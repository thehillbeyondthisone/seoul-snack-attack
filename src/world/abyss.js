// Seoul Snack Attack — the Abyss: a pocket world under the Han.
//
// Reached by driving the pocha off the north-bank ramp (src/game/dive.js) and
// falling down the Drain (src/world/the-drain.js). This module owns the place
// you land in: a bounded bowl of black water with a floor, a wall, a ceiling
// you can leave through, and enough drifting junk to tell you how fast you are
// moving.
//
// THREE DECISIONS WORTH THE WORDS.
//
// 1. **Nothing is loaded.** Same discipline as expanse-surface-art.js: the whole
//    pocket is arithmetic, built in ~30 ms on a worker-free path. That is not
//    thrift for its own sake — the Drain's whole job is to cover a load, and a
//    pocket that costs nothing to build is a pocket the Drain can always cover.
//    The only real wait is the BVH, and that is why `build()` is async.
//
// 2. **It has its OWN collider.** The sub never raycasts the city. The city's
//    BVH is 400k triangles of Seoul and every query against it while you are
//    200 m underneath is a query whose answer is "no". This one is ~4k.
//
// 3. **It sits directly under the river, at real coordinates.** Not on a
//    coordinate island somewhere off the map. If the player is at (12, -170, 160)
//    then they are under the Han at (12, 160), the map can say so, and the way
//    home is up. A pocket parked at z = 6000 would have needed a lie in every
//    system that reads a position.
//
// AXES: same as everything else — +Y up, world metres.
import * as THREE from 'three';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAbyssLife } from './abyss-life.js';
import { siltTexture, mouthTexture } from './abyss-art.js';

/**
 * Where the pocket lives, in world metres.
 *
 * Centred on the Han's channel (RIVER in expanse-layout.js spans x -320..320,
 * z 125..205), so `CENTRE.z` is the channel's midline. The bowl is far wider
 * than the channel is — an abyss that respected an 80 m river section would
 * read as a swimming pool.
 */
/**
 * Where the pocket lives and how big it is, in world metres.
 *
 * THESE NUMBERS ARE A BUDGET, NOT A TASTE. The first build made the pocket
 * 300 m across and 185 m deep with a fog that clears at ~50 m, so the player
 * arrived in a grey void with the floor 136 m below them and the walls 150 m
 * out — everything that makes the place a place was outside its own draw
 * distance. The pocket must be small enough that SOMETHING is always in sight
 * from anywhere in it. Visibility sets the scale; the scale does not get to
 * argue. See UNDERWATER_FOG_DENSITY below for the other half of the pair.
 */
export const ABYSS = Object.freeze({
  centre: Object.freeze({ x: 0, z: 165 }),
  radius: 95,           // m — wall radius. Reachable from the middle in ~12 s.
  ceilingY: -55,        // m — the underside of the world. You arrive here.
  floorY: -132,         // m — nominal floor before displacement.
  trenchY: -152,        // m — the bottom of the central trench.
  /** The hole you fell through, and the way back up. */
  mouthRadius: 24,
});

/**
 * FogExp2 density down here. Paired with ABYSS.radius above: this clears at
 * roughly 110 m, which is the far wall from the middle and the floor from the
 * arrival point. Thicker and the pocket is a void; thinner and it stops being
 * an abyss and starts being a dark room.
 */
export const UNDERWATER_FOG_DENSITY = 0.0135;
export const UNDERWATER_FOG_COLOR = 0x061119;

/** Water column height, for anything that wants to phrase depth as a fraction. */
export const ABYSS_DEPTH_M = ABYSS.ceilingY - ABYSS.trenchY;

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Deterministic value noise. The city generators all seed from EXPANSE_SEED so
 * two runs produce the same Seoul; the abyss follows that, because "the trench
 * moved" is exactly the kind of thing that makes a bug unreproducible.
 */
function makeNoise(seed) {
  const hash = (x, z) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = smooth(x - xi), zf = smooth(z - zi);
    const a = hash(xi, zi), b = hash(xi + 1, zi);
    const c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return (a * (1 - xf) + b * xf) * (1 - zf) + (c * (1 - xf) + d * xf) * zf;
  };
}

/**
 * Collision wants ONE attribute layout across the whole batch.
 *
 * mergeGeometries refuses a mixed set and the failure mode is a null return
 * rather than a throw — which surfaces later as "cannot read computeBoundingBox
 * of null", a hundred lines from the cause. The sunken landmarks come from
 * THREE primitives (indexed, with UVs); the floor, wall and ceiling are
 * hand-built (indexed, no UVs). Both go through here first.
 *
 * Same discipline and the same reason as `toCollision` in expanse2-city.js.
 */
function toCollision(geometry) {
  const out = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  out.deleteAttribute('uv');
  out.deleteAttribute('uv1');
  return out;
}

function fbm(noise, x, z, octaves = 4) {
  let total = 0, amplitude = 1, frequency = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += noise(x * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.07;   // not exactly 2: integer harmonics make visible grids
  }
  return total / norm;
}

/**
 * Floor height at a point, as a pure function.
 *
 * Exported because the dive controller wants to know where the bottom is
 * without owning a mesh, and because a Node gate can assert the trench actually
 * reaches `trenchY` without standing up a renderer.
 */
export function abyssFloorAt(x, z, noise = makeNoise(20260910)) {
  const dx = x - ABYSS.centre.x;
  const dz = z - ABYSS.centre.z;
  const r = Math.hypot(dx, dz) / ABYSS.radius;          // 0 at centre, 1 at wall
  // A trench, not a bowl: the floor falls away toward the middle rather than
  // cupping up to it, so the natural read on arrival is "go down" and the walls
  // stay a boundary rather than a ramp back out.
  const trench = Math.exp(-(r * r) * 5.5);
  const base = THREE.MathUtils.lerp(ABYSS.floorY, ABYSS.trenchY, trench);
  // Relief scales down at the rim so the floor meets the wall cleanly instead
  // of poking through it.
  const relief = (fbm(noise, x * 0.018, z * 0.018) - 0.5) * 26 * (1 - r * r * 0.85);
  return base + relief;
}

/**
 * A displaced disc. Radial rather than gridded: a square floor clipped to a
 * circle wastes ~21% of its triangles outside the wall, and its silhouette
 * against the fog is a staircase.
 */
function floorGeometry(noise, rings, spokes) {
  const positions = [];
  const indices = [];
  const at = (ring, spoke) => ring * spokes + (spoke % spokes);
  for (let ring = 0; ring <= rings; ring++) {
    // Squared distribution: more rings near the middle, where the trench is and
    // where the player spends the interesting part of the dive.
    const t = ring / rings;
    const radius = ABYSS.radius * t * t;
    for (let spoke = 0; spoke < spokes; spoke++) {
      const angle = (spoke / spokes) * Math.PI * 2;
      const x = ABYSS.centre.x + Math.cos(angle) * radius;
      const z = ABYSS.centre.z + Math.sin(angle) * radius;
      positions.push(x, abyssFloorAt(x, z, noise), z);
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let spoke = 0; spoke < spokes; spoke++) {
      const a = at(ring, spoke), b = at(ring, spoke + 1);
      const c = at(ring + 1, spoke), d = at(ring + 1, spoke + 1);
      // tangent x radial = +Y. The first build wound this (a, c, b), which put
      // every normal DOWN: the floor was back-face culled from above and lit
      // from underneath, so the pocket had no visible bottom at all.
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i] / 9, positions[i + 2] / 9);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The wall: a cylinder shell from floor to ceiling, inward-facing.
 *
 * It is a boundary the player is meant to notice only as "the fog got solid".
 * Fog does most of the work; this exists so a sub at full thrust cannot leave
 * the pocket and find nothing.
 */
function wallGeometry(noise, spokes = 96, stacks = 10) {
  const positions = [];
  const indices = [];
  for (let stack = 0; stack <= stacks; stack++) {
    const y = THREE.MathUtils.lerp(ABYSS.trenchY - 20, ABYSS.ceilingY + 6, stack / stacks);
    for (let spoke = 0; spoke < spokes; spoke++) {
      const angle = (spoke / spokes) * Math.PI * 2;
      // Wobble the wall so it does not read as a cylinder in the headlights.
      const r = ABYSS.radius + (fbm(noise, Math.cos(angle) * 3, Math.sin(angle) * 3, 3) - 0.5) * 14;
      positions.push(
        ABYSS.centre.x + Math.cos(angle) * r,
        y,
        ABYSS.centre.z + Math.sin(angle) * r,
      );
    }
  }
  const at = (stack, spoke) => stack * spokes + (spoke % spokes);
  for (let stack = 0; stack < stacks; stack++) {
    for (let spoke = 0; spoke < spokes; spoke++) {
      const a = at(stack, spoke), b = at(stack, spoke + 1);
      const c = at(stack + 1, spoke), d = at(stack + 1, spoke + 1);
      // Wound inward — the player is always on the inside of this.
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The ceiling: the underside of the world, with the Drain's mouth cut out of it.
 *
 * The hole is not decoration. It is the exit, it is the only light source with
 * a direction, and it is the thing that tells a disoriented player which way is
 * home. Everything about the pocket's readability hangs off it being visible
 * from the floor.
 */
function ceilingGeometry(spokes = 72, rings = 14) {
  const positions = [];
  const indices = [];
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    const radius = THREE.MathUtils.lerp(ABYSS.mouthRadius, ABYSS.radius + 10, t * t);
    for (let spoke = 0; spoke < spokes; spoke++) {
      const angle = (spoke / spokes) * Math.PI * 2;
      positions.push(
        ABYSS.centre.x + Math.cos(angle) * radius,
        // Domed very slightly upward toward the mouth, so the hole reads as
        // something the water is draining out of rather than a hatch.
        ABYSS.ceilingY + (1 - t) * 5,
        ABYSS.centre.z + Math.sin(angle) * radius,
      );
    }
  }
  const at = (ring, spoke) => ring * spokes + (spoke % spokes);
  for (let ring = 0; ring < rings; ring++) {
    for (let spoke = 0; spoke < spokes; spoke++) {
      const a = at(ring, spoke), b = at(ring, spoke + 1);
      const c = at(ring + 1, spoke), d = at(ring + 1, spoke + 1);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * What is down here.
 *
 * The brief is over-the-top, so these are not shipwrecks. They are things from
 * the city above, at the wrong scale, sitting in the dark like they have been
 * there longer than the city has. Each is a primitive with a strong silhouette,
 * because at 12 m of visibility a silhouette is the entire read.
 *
 * `y` is a floor OFFSET — resolved against `abyssFloorAt` at build time so a
 * change to the trench never leaves a landmark buried or hovering.
 */
// Positions are pulled well inside ABYSS.radius rather than scattered to the
// wall: at 110 m of visibility, a landmark parked at the rim is a landmark
// nobody ever sees. The ring below puts at least one silhouette in frame from
// the arrival point no matter which way the Drain leaves you pointing.
//
// The glow strengths are high on purpose. Nothing down here is lit by anything
// except the shaft and the player, so a landmark that is not emissive is a
// landmark that is black-on-black. Reading these as bioluminescence rather than
// as "still plugged in" is the player's business.
const SUNKEN = Object.freeze([
  // The vending machine. Forty metres of it. Still lit, which is the joke.
  { id: 'vending', kind: 'box', x: -38, z: 132, y: 0, size: [17, 40, 11], tilt: 0.28, glow: 0x3fd6ac, glowStrength: 1.5 },
  // A ramen cup on its side, big enough to drive into. You can. There is
  // nothing in there yet — that is a later pass, and it should be something.
  { id: 'cup', kind: 'cup', x: 46, z: 192, y: 0, size: [22, 30, 22], tilt: 1.42, glow: 0xff6a44, glowStrength: 0.9 },
  // A bus, nose-down in the silt, because every abyss needs one honest wreck.
  { id: 'bus', kind: 'box', x: 62, z: 138, y: -4, size: [3.2, 26, 10], tilt: 1.15, glow: 0x39a8d0, glowStrength: 0.6 },
  // The face. No explanation, no lore, no interaction. It is just down here.
  { id: 'face', kind: 'face', x: -56, z: 200, y: 6, size: [30, 34, 22], tilt: -0.16, glow: 0xd8bd72, glowStrength: 1.1 },
  // A soju bottle, upright, taller than the vending machine. Scale gag.
  { id: 'bottle', kind: 'bottle', x: 14, z: 214, y: 0, size: [13, 52, 13], tilt: 0.05, glow: 0x76e07e, glowStrength: 1.2 },
]);

function sunkenGeometry(spec) {
  const [sx, sy, sz] = spec.size;
  switch (spec.kind) {
    case 'cup':
      // Truncated cone, open at the wide end. Radially segmented so the rim
      // reads as a circle in the headlights rather than a hexagon.
      return new THREE.CylinderGeometry(sx * 0.5, sx * 0.34, sy, 24, 1, true);
    case 'bottle': {
      const body = new THREE.CylinderGeometry(sx * 0.5, sx * 0.5, sy * 0.72, 20);
      const neck = new THREE.CylinderGeometry(sx * 0.17, sx * 0.42, sy * 0.28, 20);
      neck.translate(0, sy * 0.5, 0);
      return mergeGeometries([body, neck], false);
    }
    case 'face': {
      // A blunt head: a sphere squashed on Z with a brow ridge. Deliberately
      // crude — at this scale and this visibility, detail would never arrive.
      const skull = new THREE.SphereGeometry(sx * 0.5, 20, 14);
      skull.scale(1, sy / sx, sz / sx);
      const brow = new THREE.BoxGeometry(sx * 0.92, sy * 0.12, sz * 0.62);
      brow.translate(0, sy * 0.16, sz * 0.24);
      return mergeGeometries([skull, brow], false);
    }
    default:
      return new THREE.BoxGeometry(sx, sy, sz);
  }
}

/**
 * Surface art for the sunken things.
 *
 * The first build gave each one a flat emissive colour, which at 40 m reads as a
 * coloured cardboard cutout — the teal slab in the first playtest screenshot was
 * the vending machine. A canvas used as BOTH map and emissiveMap keeps the dark
 * parts dark and lets only the details glow: the drink buttons, the bus windows,
 * the label on the cup. Generated, never loaded, same rule as the rest.
 */
function landmarkCanvas(kind) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const text = (s, x, y, px, color) => {
    ctx.fillStyle = color;
    ctx.font = `900 ${px}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  };
  switch (kind) {
    case 'vending': {
      canvas.width = 256; canvas.height = 512;
      ctx.fillStyle = '#0b1116'; ctx.fillRect(0, 0, 256, 512);
      ctx.fillStyle = '#35e0b4'; ctx.fillRect(14, 16, 228, 58);
      text('음료수', 128, 46, 40, '#062019');
      const cans = ['#ff4a5a', '#ffd23f', '#4fc3ff', '#9dff6a', '#ff8a3d', '#e46bff'];
      for (let row = 0; row < 5; row++) {
        ctx.fillStyle = '#1d2c34'; ctx.fillRect(18, 92 + row * 66, 220, 58);
        for (let col = 0; col < 5; col++) {
          ctx.fillStyle = cans[(row * 2 + col) % cans.length];
          ctx.fillRect(28 + col * 42, 98 + row * 66, 26, 44);
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(31 + col * 42, 101 + row * 66, 5, 36);
        }
      }
      ctx.fillStyle = '#000'; ctx.fillRect(40, 440, 176, 44);
      ctx.fillStyle = '#ff3355'; ctx.fillRect(210, 424, 18, 8);
      break;
    }
    case 'bus': {
      canvas.width = 128; canvas.height = 512;
      ctx.fillStyle = '#0f2b3a'; ctx.fillRect(0, 0, 128, 512);
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i % 3 === 1 ? '#1a3440' : '#ffd98a';
        ctx.fillRect(20, 24 + i * 54, 88, 38);
      }
      ctx.fillStyle = '#3fb0ff'; ctx.fillRect(0, 0, 128, 10);
      text('472', 64, 490, 26, '#8fe0ff');
      break;
    }
    case 'cup': {
      canvas.width = 512; canvas.height = 256;
      ctx.fillStyle = '#2a2320'; ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#c8261c'; ctx.fillRect(0, 70, 512, 110);
      text('辛 라면', 256, 125, 72, '#ffe9b0');
      ctx.fillStyle = '#ffb347'; ctx.fillRect(0, 0, 512, 10);
      break;
    }
    case 'bottle': {
      canvas.width = 256; canvas.height = 512;
      ctx.fillStyle = '#0d2a14'; ctx.fillRect(0, 0, 256, 512);
      ctx.fillStyle = '#e9fff0'; ctx.fillRect(0, 250, 256, 150);
      text('참이슬', 128, 310, 54, '#0c5a2a');
      text('소주', 128, 365, 34, '#2f8f4f');
      for (let i = 0; i < 20; i++) {
        ctx.fillStyle = 'rgba(160,255,190,0.25)';
        ctx.fillRect(i * 13, 0, 3, 250);
      }
      break;
    }
    default:
      return null;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Build the pocket.
 *
 * Async only because of the BVH. Everything else is synchronous arithmetic, so
 * a caller that wants the abyss ready before the Drain finishes can start this
 * early and await it late — which is exactly what src/game/dive.js does.
 */
export async function buildAbyss(scene, { detailIntensity = 1, seed = 20260910 } = {}) {
  const noise = makeNoise(seed);
  const dense = detailIntensity >= 0.6;

  const group = new THREE.Group();
  group.name = 'abyss';
  group.visible = false;
  scene.add(group);

  // ---- Materials -----------------------------------------------------------
  // Everything down here is nearly black and nearly matte. The readable range
  // is the two metres of silt the headlights land on; anything with a specular
  // response would punch through the fog and flatten the whole space.
  //
  // Tuned on the RTX 4060 with the game compositor. Low-contrast ripples and
  // enough cool fill to read the floor without washing out distant silhouettes.
  const silt = siltTexture();
  silt.wrapS = silt.wrapT = THREE.RepeatWrapping;
  const mouthMap = mouthTexture();
  const siltMat = new THREE.MeshStandardMaterial({
    map: silt, bumpMap: silt, bumpScale: 0.09,
    color: 0x71858d, roughness: 0.97, metalness: 0.0,
  });
  // The wall is wound INWARD (its front faces the player), so BackSide — which
  // the first build used — culled exactly the faces anyone could see, and the
  // surface sky showed straight through. DoubleSide on every shell now: ~4k
  // triangles, and a shell is never allowed to vanish on a winding mistake.
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x0c1820, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide,
  });
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x08121a, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide,
  });

  const floor = new THREE.Mesh(
    floorGeometry(noise, dense ? 26 : 16, dense ? 88 : 56),
    siltMat,
  );
  floor.name = 'abyss_floor';
  floor.receiveShadow = false;
  group.add(floor);

  const wall = new THREE.Mesh(wallGeometry(noise, dense ? 96 : 56), wallMat);
  wall.name = 'abyss_wall';
  group.add(wall);

  const ceiling = new THREE.Mesh(ceilingGeometry(dense ? 72 : 44), ceilingMat);
  ceiling.name = 'abyss_ceiling';
  group.add(ceiling);

  // ---- The sunken things ---------------------------------------------------
  const landmarks = [];
  const collisionParts = [];
  for (const spec of SUNKEN) {
    const geometry = sunkenGeometry(spec);
    const skin = landmarkCanvas(spec.id);
    const material = skin
      ? new THREE.MeshStandardMaterial({
        map: skin, color: 0xffffff, roughness: 0.8, metalness: 0.05,
        emissive: 0xffffff, emissiveMap: skin,
        emissiveIntensity: spec.glowStrength * (spec.id === 'bottle' ? 0.18 : 0.55),
        side: spec.kind === 'cup' ? THREE.DoubleSide : THREE.FrontSide,
      })
      // The face gets no skin and no glow. Just eyes (below).
      : new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(geometry, material);
    if (spec.kind === 'face') {
      const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.glow).multiplyScalar(3.5) });
      const [sx, sy, sz] = spec.size;
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(sx * 0.07, 12, 8), eyeMat);
        eye.scale.set(1.4, 0.55, 0.6);
        eye.position.set(side * sx * 0.2, sy * 0.04, sz * 0.46);
        mesh.add(eye);
      }
    }
    const groundY = abyssFloorAt(spec.x, spec.z, noise);
    mesh.position.set(spec.x, groundY + spec.size[1] * 0.5 + spec.y, spec.z);
    mesh.rotation.z = spec.tilt;
    mesh.rotation.y = (spec.x * 0.37 + spec.z * 0.11) % Math.PI;
    mesh.name = `abyss_${spec.id}`;
    mesh.updateMatrixWorld(true);
    group.add(mesh);
    landmarks.push({ id: spec.id, mesh, position: mesh.position.clone() });

    const collision = toCollision(geometry);
    collision.applyMatrix4(mesh.matrixWorld);
    collisionParts.push(collision);
  }

  // ---- Light ---------------------------------------------------------------
  // One directional key straight down through the mouth, one very dim ambient
  // so the silt is not pure black, and that is the entire budget. The truck's
  // headlights are supposed to be the thing you navigate by.
  // Both were roughly half this at first and the silt read as pure black — the
  // floor existed, had normals, and was invisible. An abyss still has to be a
  // place you can see you are inside of.
  // Halved on the first REAL-GPU look (RTX 4060, 2026-09-10): the SwiftShader
  // values read as a bright lagoon once tone mapping and bloom were real.
  const shaft = new THREE.DirectionalLight(0x8fd0e8, 0.85);
  shaft.position.set(ABYSS.centre.x, ABYSS.ceilingY + 40, ABYSS.centre.z);
  shaft.target.position.set(ABYSS.centre.x, ABYSS.trenchY, ABYSS.centre.z);
  shaft.castShadow = false;
  group.add(shaft, shaft.target);

  const ambient = new THREE.HemisphereLight(0x6193a5, 0x14202a, 0.65);
  group.add(ambient);

  // The mouth itself, as a visible disc of paler water. Cheap, and it is the
  // compass — see ceilingGeometry.
  const mouth = new THREE.Mesh(
    new THREE.CircleGeometry(ABYSS.mouthRadius, 40),
    new THREE.MeshBasicMaterial({
      map: mouthMap, color: 0x91c9d4, transparent: true, opacity: 0.75,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.set(ABYSS.centre.x, ABYSS.ceilingY + 4.6, ABYSS.centre.z);
  mouth.name = 'abyss_mouth';
  group.add(mouth);

  // Snow, shafts, the Vent, jellyfish, lanternfish, and the Bungeo.
  const life = createAbyssLife(group, {
    dense, floorAt: (x, z) => abyssFloorAt(x, z, noise), bounds: ABYSS,
  });

  // ---- Collision -----------------------------------------------------------
  collisionParts.push(
    toCollision(floor.geometry), toCollision(wall.geometry), toCollision(ceiling.geometry),
  );
  const colliderGeo = mergeGeometries(collisionParts, false);
  for (const part of collisionParts) part.dispose();
  // mergeGeometries returns null on a mismatched batch instead of throwing.
  // Say so here rather than letting it surface as a null dereference.
  if (!colliderGeo) throw new Error('abyss: collision batch has mismatched attributes');
  colliderGeo.computeBoundingBox();
  colliderGeo.computeBoundingSphere();

  const worker = new GenerateMeshBVHWorker();
  let bvh;
  try {
    bvh = await worker.generate(colliderGeo);
  } finally {
    worker.dispose();
  }
  colliderGeo.boundsTree = bvh;

  const ray = new THREE.Ray();
  function raycast(origin, direction, far = 140) {
    ray.origin.copy(origin);
    ray.direction.copy(direction);
    return bvh.raycastFirst(ray, THREE.DoubleSide, 0, far) || null;
  }

  const bounds = new THREE.Box3(
    new THREE.Vector3(ABYSS.centre.x - ABYSS.radius, ABYSS.trenchY - 30, ABYSS.centre.z - ABYSS.radius),
    new THREE.Vector3(ABYSS.centre.x + ABYSS.radius, ABYSS.ceilingY + 12, ABYSS.centre.z + ABYSS.radius),
  );

  /** Where the Drain spits you out: under the mouth, nose down, already sinking. */
  const arrival = {
    position: new THREE.Vector3(ABYSS.centre.x, ABYSS.ceilingY - 14, ABYSS.centre.z),
    heading: Math.PI,
  };

  /**
   * The shell as arithmetic: floor height, wall radius, domed ceiling, the
   * shaft above the mouth. Mutates position/velocity in place.
   *
   * The BVH probes alone let a fast sub tunnel the shell (a 2.35 m sphere and
   * six rays), and then there is nothing on the other side to stop it. These
   * are exact, cannot be tunnelled, and are set a hull-width inside the meshes
   * so the probes never fight them — the probes are for the landmarks.
   */
  const { centre, radius, mouthRadius, ceilingY } = ABYSS;
  const _impactPoint = new THREE.Vector3();
  let elapsed = 0;
  function contain(pos, vel, hull) {
    let impact = 0;
    let floor = false;
    const dx = pos.x - centre.x;
    const dz = pos.z - centre.z;
    const r = Math.hypot(dx, dz) || 1e-6;
    const nx = dx / r, nz = dz / r;
    const radial = (limit) => {
      if (r <= limit) return;
      pos.x = centre.x + nx * limit;
      pos.z = centre.z + nz * limit;
      const out = vel.x * nx + vel.z * nz;
      if (out > 0) {
        vel.x -= nx * out * 1.25;
        vel.z -= nz * out * 1.25;
        impact = Math.max(impact, out);
      }
    };

    // +3, not +2: the dome's lowest roof clamp sits at ceilingY + 2.65 right at
    // the mouth rim, and a threshold below that flickers between branches.
    if (pos.y > ceilingY + 3) {
      // Up in the mouth's shaft: the shaft wall is the only boundary.
      radial(mouthRadius - hull);
      if (pos.y > ceilingY + 40) { pos.y = ceilingY + 40; vel.y = Math.min(vel.y, 0); }
    } else {
      radial(radius - 9 - hull); // the wall wobbles +/-7 m
      if (r > mouthRadius - hull) {
        const t = Math.sqrt(THREE.MathUtils.clamp((r - mouthRadius) / (radius + 10 - mouthRadius), 0, 1));
        const roof = ceilingY + (1 - t) * 5 - hull;
        if (pos.y > roof) {
          pos.y = roof;
          if (vel.y > 0) { impact = Math.max(impact, vel.y); vel.y *= -0.15; }
        }
      }
    }

    const ground = abyssFloorAt(pos.x, pos.z, noise) + hull + 0.05;
    if (pos.y < ground) {
      pos.y = ground;
      if (vel.y < 0) { impact = Math.max(impact, -vel.y); vel.y *= -0.12; }
      floor = true;
    } else if (pos.y < ground + 0.35) {
      floor = true;
    }
    return { impact, floor, point: _impactPoint.copy(pos) };
  }

  return {
    group, bvh, colliderGeo, raycast, contain, bounds, arrival, landmarks,
    get bungeoHead() { return life.bungeoHead; },
    floorAt: (x, z) => abyssFloorAt(x, z, noise),
    ceilingY: ABYSS.ceilingY,
    trenchY: ABYSS.trenchY,
    mouth: { x: ABYSS.centre.x, z: ABYSS.centre.z, y: ABYSS.ceilingY, radius: ABYSS.mouthRadius },

    setVisible(on) { group.visible = !!on; },

    update(dt, camera, subPosition = null) {
      if (!group.visible) return;
      elapsed += dt;
      life.update(dt, camera, subPosition);
      mouth.material.opacity = 0.7 + Math.sin(elapsed * 0.45) * 0.05;
      mouth.rotation.z = elapsed * 0.025;
    },

    dispose() {
      life.dispose();
      silt.dispose(); mouthMap.dispose();
      for (const { mesh } of landmarks) mesh.material.map?.dispose();
      group.parent?.remove(group);
      group.traverse((object) => {
        if (!object.isMesh && !object.isPoints) return;
        object.geometry?.dispose();
        for (const m of Array.isArray(object.material) ? object.material : [object.material]) m?.dispose();
      });
      colliderGeo.dispose();
    },
  };
}
