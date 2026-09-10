// Original low-poly courier placeholder. The controller is deliberately model
// agnostic: replace this group with an animated GLB later without touching feel.
import * as THREE from 'three';

function mesh(geometry, material, parent, position) {
  const object = new THREE.Mesh(geometry, material);
  object.position.copy(position);
  parent.add(object);
  return object;
}

function limb(material, length, radius) {
  const pivot = new THREE.Group();
  const part = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length - radius * 2, 4, 8), material);
  part.position.y = -length * 0.5;
  pivot.add(part);
  return pivot;
}

export function createCourierModel() {
  const root = new THREE.Group();
  root.name = 'player_courier';
  const visual = new THREE.Group();
  root.add(visual);

  const raincoat = new THREE.MeshStandardMaterial({ color: 0x182635, roughness: 0.82, metalness: 0.02 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x090e15, roughness: 0.72 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x38b9d2, roughness: 0.4, emissive: 0x06242b, emissiveIntensity: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98f6d, roughness: 0.88 });
  const bag = new THREE.MeshStandardMaterial({ color: 0x5b2322, roughness: 0.76 });

  mesh(new THREE.BoxGeometry(0.58, 0.72, 0.28), raincoat, visual, new THREE.Vector3(0, 1.18, 0));
  mesh(new THREE.BoxGeometry(0.56, 0.065, 0.30), cyan, visual, new THREE.Vector3(0, 1.22, -0.005));
  mesh(new THREE.BoxGeometry(0.43, 0.50, 0.18), bag, visual, new THREE.Vector3(0, 1.19, -0.23));
  mesh(new THREE.SphereGeometry(0.20, 12, 8), skin, visual, new THREE.Vector3(0, 1.72, 0.015));
  mesh(new THREE.CylinderGeometry(0.205, 0.22, 0.09, 12), dark, visual, new THREE.Vector3(0, 1.86, 0.01));

  const leftArm = limb(raincoat, 0.66, 0.09);
  const rightArm = limb(raincoat, 0.66, 0.09);
  leftArm.position.set(0.38, 1.47, 0);
  rightArm.position.set(-0.38, 1.47, 0);
  visual.add(leftArm, rightArm);

  const leftLeg = limb(dark, 0.82, 0.105);
  const rightLeg = limb(dark, 0.82, 0.105);
  leftLeg.position.set(0.17, 0.82, 0);
  rightLeg.position.set(-0.17, 0.82, 0);
  visual.add(leftLeg, rightLeg);
  mesh(new THREE.BoxGeometry(0.20, 0.12, 0.34), raincoat, leftLeg, new THREE.Vector3(0, -0.78, 0.08));
  mesh(new THREE.BoxGeometry(0.20, 0.12, 0.34), raincoat, rightLeg, new THREE.Vector3(0, -0.78, 0.08));

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.46, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.position.y = 0.012;
  root.add(shadow);

  root.userData.rig = { visual, leftArm, rightArm, leftLeg, rightLeg, shadow };
  return root;
}

export function animateCourier(root, dt, { speed = 0, state = 'idle', grounded = true, turn = 0 } = {}) {
  const rig = root.userData.rig;
  if (!rig) return;
  root.userData.phase = (root.userData.phase || 0) + dt * (3.2 + speed * 1.35);
  const moving = grounded ? THREE.MathUtils.clamp(speed / 5.8, 0, 1) : 0;
  const swing = Math.sin(root.userData.phase) * moving;
  const amplitude = state === 'sprint' ? 0.92 : 0.58;
  rig.leftLeg.rotation.x = swing * amplitude;
  rig.rightLeg.rotation.x = -swing * amplitude;
  rig.leftArm.rotation.x = -swing * amplitude * 0.78 - (grounded ? 0 : 0.35);
  rig.rightArm.rotation.x = swing * amplitude * 0.78 - (grounded ? 0 : 0.35);
  const bob = grounded ? Math.abs(Math.sin(root.userData.phase * 2)) * 0.025 * moving : 0.035;
  rig.visual.position.y += (bob - rig.visual.position.y) * Math.min(1, dt * 14);
  rig.visual.rotation.z += (THREE.MathUtils.clamp(-turn * 0.08, -0.12, 0.12) - rig.visual.rotation.z) * Math.min(1, dt * 10);
  rig.visual.rotation.x += ((state === 'sprint' ? -0.09 : 0) - rig.visual.rotation.x) * Math.min(1, dt * 8);
  rig.shadow.material.opacity = grounded ? 0.28 : 0.13;
}
