// The van's identity, in one place.
//
// handoff.md section 8.4 records that the van's dimensions were asserted in four
// disagreeing places: TARGET_LENGTH = 4.5 in van.js, the 4.5 x 1.9 x 1.9 inertia
// box in physics.js, halfL = 2.15 / halfW = 0.95 for the bumper rays, and the
// zs = 1.45 wheel fallback. Prop collision needs a van box too, and adding a
// fifth copy was not acceptable — so the collision box lives here and
// physics.js reads it.
//
// These are the values as currently tuned, NOT a reconciliation: COLLISION_HALF
// describes a 4.30 m body while TARGET_LENGTH says 4.50 m. Unifying them shifts
// the bumper contact point and moves the physics bench, so it belongs to the
// phase-1 rig normalization, not here. Do not "fix" the discrepancy casually.

/** Half-extents of the van's collision box, body frame (+Z forward). */
export const COLLISION_HALF = Object.freeze({ x: 0.95, y: 0.90, z: 2.15 });

/** Length van.js normalizes the imported model to. */
export const TARGET_LENGTH = 4.5;

/** Box used for the rotational inertia approximation (metres). */
export const INERTIA_BOX = Object.freeze({ x: 1.9, y: 1.9, z: 4.5 });

/** Kerb-height offset of the bumper ray ring, relative to the model origin. */
export const BUMPER_Y = -0.15;
