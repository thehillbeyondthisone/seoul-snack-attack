// Blender-authored yawning hippo: geometry in tools/blender/recipes/dash_hippo.py.
// The separate head follows a damped spring in the truck's acceleration frame.
import * as THREE from 'three';
const K = 55, C = 1.2, GAIN = 23, LIMIT = 0.5, STEP = 1 / 120, MAX_STEPS = 12;

export function createDashHippo({ model, yaw = 0 }) {
  const root = model;
  root.name = 'dash_hippo';
  root.rotation.y = yaw;
  const neck = root.getObjectByName('hippo_head');
  if (!neck) throw new Error('dash-hippo.glb is missing its hippo_head pivot');
  const neckRest = neck.quaternion.clone();
  const materials = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
  });
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
      neck.quaternion.copy(yawInv).multiply(tilt).multiply(yawQ).multiply(neckRest);
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
      for (const m of materials) m.dispose();
    },
  };
}
