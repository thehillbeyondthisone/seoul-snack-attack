import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

// A 25 cm tile, independent of the colour atlas's tiny palette UV islands.
export function makeSurfaceMaps(size = 256) {
  const height = new Float32Array(size * size);
  let seed = 731;
  for (let i = 0; i < height.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    height[i] = seed / 4294967296;
  }
  const normal = new Uint8Array(size * size * 4), rough = normal.slice();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, k = i * 4;
    const dx = height[y * size + (x + 1) % size] - height[y * size + (x + size - 1) % size];
    const dy = height[((y + 1) % size) * size + x] - height[((y + size - 1) % size) * size + x];
    const n = new THREE.Vector3(-dx * .45, -dy * .45, 1).normalize();
    normal.set([128 + n.x * 127, 128 + n.y * 127, 128 + n.z * 127, 255], k);
    const r = 185 + height[i] * 55 + Math.sin(y * Math.PI / 4) * 12;
    rough.set([r, r, r, 255], k);
  }
  const texture = data => {
    const t = new THREE.DataTexture(data, size, size);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.channel = 1; t.needsUpdate = true;
    return t;
  };
  return { normal: texture(normal), roughness: texture(rough) };
}

function liveryTexture(strip = false) {
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 512;
  const c = canvas.getContext('2d');
  c.fillStyle = '#123a32'; c.fillRect(0, 0, 2048, 512);
  c.fillStyle = '#e3a000';
  for (let x = -400; x < 2300; x += 150) {
    c.beginPath(); c.moveTo(x, 440); c.lineTo(x+95,440); c.lineTo(x+30,512); c.lineTo(x-65,512); c.fill();
  }
  c.strokeStyle = '#f9efd0'; c.lineWidth = 5; c.strokeRect(22,22,2004,394);
  c.fillStyle = '#f9efd0'; c.font = '900 152px "Malgun Gothic", sans-serif';
  c.fillText('서울 야식', 310, 210);
  c.font = 'bold 51px sans-serif'; c.fillText('SEOUL SNACK ATTACK', 320, 300);
  c.fillStyle = '#e3a000'; c.font = 'bold 35px sans-serif'; c.fillText('HOT FOOD / LATE NIGHTS / GOOD TIMES',320,365);
  // Original bowl emblem and rising steam; legible from the chase camera.
  c.fillStyle = '#e3a000'; c.beginPath(); c.arc(164,230,108,0,Math.PI); c.fill();
  c.strokeStyle = '#f9efd0'; c.lineWidth = 13;
  for (const x of [115,165,215]) {c.beginPath();c.moveTo(x,185);c.bezierCurveTo(x-40,155,x+35,115,x,75);c.stroke();}
  c.fillStyle = '#e3a000'; c.font = '900 190px sans-serif'; c.fillText('02',1640,250);
  c.fillStyle = '#f9efd0'; c.font = 'bold 32px sans-serif'; c.fillText('NIGHT SHIFT',1620,327);
  if (strip) {
    c.fillStyle='#123a32';c.fillRect(0,0,2048,512);
    c.strokeStyle='#e3a000';c.lineWidth=22;c.strokeRect(12,12,2024,488);
    c.fillStyle='#f9efd0';c.font='900 215px sans-serif';c.textAlign='center';
    c.fillText('NIGHT SHIFT / 02',1024,335);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; return texture;
}

export function createPochaMakeover(group, body) {
  const maps = makeSurfaceMaps();
  const originals = [], replacements = new Map();
  group.updateMatrixWorld(true);
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.every(m => /glass|lights/i.test(m.name))) return;
    const geometry = mesh.geometry.clone(), position = geometry.attributes.position, normal = geometry.attributes.normal;
    const uv = new Float32Array(position.count * 2), p = new THREE.Vector3(), n = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize();
      const a = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
      const axis = a.indexOf(Math.max(...a));
      uv[i*2] = (axis === 0 ? -p.z * Math.sign(n.x) : p.x * (axis === 2 ? Math.sign(n.z) : 1)) * 4;
      uv[i*2+1] = (axis === 1 ? -p.z * Math.sign(n.y) : p.y) * 4;
    }
    geometry.setAttribute('uv1', new THREE.BufferAttribute(uv,2));
    const upgraded = materials.map(m => {
      if (/glass|lights/i.test(m.name)) return m;
      if (replacements.has(m)) return replacements.get(m);
      const next = m.clone(); next.name = `${m.name}_night_shift`;
      next.normalMap = maps.normal; next.normalScale.set(.7,.7);
      next.roughnessMap = maps.roughness; next.roughness = .5; next.metalness = .3;
      // Atlas colours identify rubber, steel, and painted panels without
      // replacing its authored UVs or recolouring the matching cockpit.
      next.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          float chroma = max(max(diffuseColor.r,diffuseColor.g),diffuseColor.b)-min(min(diffuseColor.r,diffuseColor.g),diffuseColor.b);
          float rubber = (1.0-step(.095,max(max(diffuseColor.r,diffuseColor.g),diffuseColor.b))) * (1.0-step(.035,chroma));
          float steel = (1.0-step(.04,chroma)) * (1.0-rubber);
          roughnessFactor = mix(roughnessFactor, .87, rubber);
          roughnessFactor = mix(roughnessFactor, .31, steel);`)
          .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = mix(mix(.22,.8,steel),0.0,rubber);`);
      };
      next.customProgramCacheKey = () => 'pocha-night-shift-v1';
      replacements.set(m,next); return next;
    });
    originals.push({ mesh, geometry: mesh.geometry, material: mesh.material, upgradedGeometry: geometry,
      upgradedMaterial: Array.isArray(mesh.material) ? upgraded : upgraded[0] });
  });
  const graphics = new THREE.Group(); graphics.name = 'pocha-night-shift-graphics';
  const decalMaterial = new THREE.MeshStandardMaterial({map:liveryTexture(),roughness:.38,metalness:.2,
    polygonOffset:true,polygonOffsetFactor:-1,depthWrite:true});
  // A single-line enamel strip sits flush with the serving skirt's outer
  // face (x=1.1392), clear of the counter and the wheel arch below.
  const stripMaterial = new THREE.MeshStandardMaterial({map:liveryTexture(true),roughness:.38,metalness:.2});
  const strip = new THREE.Mesh(new THREE.BoxGeometry(2.8,.29,.018),stripMaterial);
  strip.position.set(1.15,-1.34,-.72);strip.rotation.y=Math.PI/2;graphics.add(strip);
  // The closed side has a raised, ribbed menu board. Fit an enamel plaque
  // just outside its measured -1.481 m face instead of projecting through
  // multiple layers of that board and duplicating the lettering.
  const plaque = new THREE.Group(); plaque.position.set(-1.515,-.2,-.72);
  plaque.rotation.y = -Math.PI/2;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.9,1.15,.045),
    new THREE.MeshStandardMaterial({color:0xb5c1b7,metalness:.85,roughness:.3}));
  plaque.add(frame);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.8,1.05),decalMaterial);
  face.position.z=.024; plaque.add(face);
  const screwMaterial = new THREE.MeshStandardMaterial({color:0x44534a,metalness:.8,roughness:.35});
  for(const x of [-1.415,1.415]) for(const y of [-.54,.54]) {
    const screw=new THREE.Mesh(new THREE.SphereGeometry(.018,8,6),screwMaterial);
    screw.position.set(x,y,.028);plaque.add(screw);
  }
  graphics.add(plaque);
  for (const {mesh} of originals) {
    if (!body.getObjectById(mesh.id)) continue;
    const geo = new DecalGeometry(mesh,new THREE.Vector3(-.25,-.48,-2.46),new THREE.Euler(0,Math.PI,0),new THREE.Vector3(1.95,.65,.35));
    if (geo.attributes.position.count) graphics.add(new THREE.Mesh(geo,decalMaterial)); else geo.dispose();
  }
  // Decal vertices were generated in model space; attach to the visual root
  // and follow body visibility when the first-person camera hides the shell.
  group.add(graphics); graphics.visible = false;
  let enabled = false;
  return {
    graphics,
    get enabled() { return enabled; },
    setEnabled(value) {
      enabled = !!value;
      for (const item of originals) {
        item.mesh.geometry = enabled ? item.upgradedGeometry : item.geometry;
        item.mesh.material = enabled ? item.upgradedMaterial : item.material;
      }
      graphics.visible = enabled && body.visible;
    },
    update() { graphics.visible = enabled && body.visible; },
  };
}
