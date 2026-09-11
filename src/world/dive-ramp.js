// Seoul Snack Attack — the north-bank dive ramp.
//
// One structure, on the Han's north quay, pointing at the water. Drive off it
// fast enough and src/game/dive.js takes over: the Drain opens, and you go
// under (src/world/the-drain.js, src/world/abyss.js).
//
// This module exists so that the RAMP and the TRIGGER cannot drift apart. The
// geometry is built into the city's collider by expanse2-city.js at load; the
// trigger volume is read by the dive controller every frame. Those are two
// different modules on two different clocks, and a ramp whose launch box has
// wandered ten metres downstream is a ramp that silently stops working. Same
// reasoning as ROAD_LIFT living in expanse-road-paint.js.
//
// SITING. RIVER (expanse-layout.js) spans x -320..320, z 125..205 at y 0.02.
// The north-bank road runs along z = 90; the three bridges land at x = -245,
// x = 0 and x = 235. x = 120 is the widest clear gap between the main and east
// bridges, and it leaves 35 m of quay to line the jump up in.
import * as THREE from 'three';

export const DIVE_RAMP = Object.freeze({
  /** Centreline of the ramp, on the quay. */
  x: 120,
  /** Where the deck starts climbing, and where it leaves the ground. */
  zStart: 99,
  zEnd: 117,
  /** Lip height. 6 m over 18 m of run is ~18 degrees — a jump, not a launch. */
  height: 6,
  width: 9.5,
  /** Metres of run-up that arm the sequence (and start the abyss loading). */
  approachLength: 60,
  /**
   * Where a lined-up run-up starts, measured on the quay.
   *
   * Not a guess: the open ground at x = 120 runs from z = 64 (the block wall is
   * at z = 60, 14 m tall) to z = 96, which is 32 m of clear apron before the
   * ramp foot. Anything north of 64 spawns a truck inside a building, which is
   * exactly what the first version of the `?dive=ramp` hook did.
   */
  approachStartZ: 68,
  /**
   * Minimum forward speed AT THE LIP, m/s. Below this you drop off the end into
   * the river and get the ordinary respawn — the dive is a thing you commit to,
   * and rolling off at walking pace should not trigger a set piece.
   *
   * Budgeted against the climb, not picked: 6 m of ramp costs
   * sqrt(v^2 - 2gh), so arriving at the foot at a realistic 16 m/s leaves
   * ~11.7 m/s at the lip. A threshold of 11 passed that by 0.7 m/s, which is
   * inside the noise of how well the player lined the run-up up. 8 m/s still
   * requires real commitment and stops the set piece being a coin flip.
   */
  minLaunchSpeed: 8,
});

/** Heading a truck is pointing when it is aimed down the ramp (+Z is south). */
export const DIVE_RAMP_HEADING = 0;

/**
 * The deck, its two side walls and the underside skirt, as one geometry in
 * world space.
 *
 * World space rather than local-plus-transform because the caller merges this
 * straight into the city's collision soup, and a part carrying its own matrix
 * would have to be baked anyway.
 */
export function buildDiveRampGeometry() {
  const { x, zStart, zEnd, height, width } = DIVE_RAMP;
  const halfW = width * 0.5;
  const parts = [];

  // UVs are a world-space XZ projection divided by the asphalt tile, exactly
  // like the pavement pads: the ramp has to carry aggregate at the same
  // physical size as the road it launches off, or the last thing the player
  // sees before the water is a texture-scale seam. The 18-degree slope
  // stretches the projection by 1/cos(18) ~= 5%, which is under the threshold
  // anyone can see and well under the cost of a per-face unwrap.
  const TILE = 4;
  const quad = (a, b, c, d) => {
    const geometry = new THREE.BufferGeometry();
    const points = [a, b, c, a, c, d];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(
      points.flatMap((p) => [p.x, p.y, p.z]), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(
      points.flatMap((p) => [p.x / TILE, p.z / TILE]), 2));
    geometry.computeVertexNormals();
    return geometry;
  };
  const V = (px, py, pz) => new THREE.Vector3(px, py, pz);

  // The driving surface. Single-sided UPWARD, like every other road slab.
  //
  // The winding matters and is easy to get backwards: computeVertexNormals uses
  // (b-a) x (c-a), and the obvious corner order (near-left, near-right, far-
  // right, far-left) yields a normal with y < 0. The deck still drove fine —
  // physics.js flips any suspension normal that opposes body-up — but
  // `findGround` rejects anything with normal.y <= 0.88, so the ramp was a hole
  // as far as spawn placement, props and every other world query was concerned.
  parts.push(quad(
    V(x - halfW, 0.04, zStart), V(x - halfW, height, zEnd),
    V(x + halfW, height, zEnd), V(x + halfW, 0.04, zStart),
  ));
  // Side walls, so a bad line scrapes along the ramp rather than dropping off
  // it sideways into a fall with no set piece attached.
  parts.push(quad(
    V(x - halfW, 0.04, zStart), V(x - halfW, height, zEnd),
    V(x - halfW, height + 1.1, zEnd), V(x - halfW, 1.1, zStart),
  ));
  parts.push(quad(
    V(x + halfW, 1.1, zStart), V(x + halfW, height + 1.1, zEnd),
    V(x + halfW, height, zEnd), V(x + halfW, 0.04, zStart),
  ));
  // The blunt end under the lip. Nothing should ever see it, but a hole in the
  // collider is a hole a prop can fall through.
  parts.push(quad(
    V(x - halfW, 0, zEnd), V(x + halfW, 0, zEnd),
    V(x + halfW, height, zEnd), V(x - halfW, height, zEnd),
  ));
  return parts;
}

/**
 * Is this pose committed to the ramp?
 *
 * Deliberately generous on X and strict on direction: a player who clips the
 * edge at speed heading at the water wanted the dive, and a player crossing the
 * quay sideways at 40 km/h did not.
 *
 * THE WINDOW INCLUDES THE DECK, not just the run-up. The first version ended it
 * at `zStart + 2`, which meant the truck was outside its own trigger for the
 * whole 18 m climb — the controller armed on the approach, went quiet as the
 * wheels touched the ramp, and disarmed on its 1.2 s timeout a few metres short
 * of the lip. The dive could not fire at all. "Committed" has to stay true from
 * the run-up until the moment the wheels leave.
 */
export function onRampApproach(position, forwardZ) {
  const { x, zStart, zEnd, width, approachLength } = DIVE_RAMP;
  if (forwardZ <= 0.55) return false;                       // not aimed at the river
  if (Math.abs(position.x - x) > width * 0.5 + 3) return false;
  return position.z > zStart - approachLength && position.z < zEnd + 1;
}

/** Has this pose left the lip? */
export function pastRampLip(position) {
  return position.z >= DIVE_RAMP.zEnd - 0.5;
}
