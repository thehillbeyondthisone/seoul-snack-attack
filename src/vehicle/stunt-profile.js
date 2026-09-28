// Isolated first-pass pocha setup. The normal game's vehicle definition stays authoritative.
export const STUNT_POCHA_PARAMS = Object.freeze({
  engineForce: 13600,
  brakeForce: 31500,
  maxSpeed: 28,
  steerResponse: 8,
  steerLockHigh: 0.2,
  springK: 44500,
  damperC: 4550,
  suspensionTravel: 0.27,
  antiRollFront: 3400,
  antiRollRear: 2000,
});
