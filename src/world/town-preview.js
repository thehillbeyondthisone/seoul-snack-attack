// 밤내 Bamnae — look at the valley before committing to it.
//
// A viewer, not the game. It builds the SAME surfaces the runtime will
// (`town-ground.js` against `town-terrain.js`), so what you orbit here is the
// actual height field rather than a mock-up of it — if the hillside is wrong
// in this preview it is wrong in the game.
//
// Everything is vertex colour and one directional light: no textures, no
// post, nothing that could flatter the shape into looking better than it is.
// The whole point of the picture is to judge the LANDFORM.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTownTerrain } from './town-terrain.js';
import { buildTownSurfaces } from './town-ground.js';

const terrain = createTownTerrain();
const surfaces = buildTownSurfaces(terrain);
const layout = terrain.layout;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2736);
// No fog. The game will want it; a diagnostic viewer must not hide the far end
// of the thing being diagnosed, and at 800 m back the first version hazed the
// entire town into the background colour.

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 1, 4000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

// ---- terrain ----------------------------------------------------------------
// Colour is a readable diagnostic, not art direction: height picks the band,
// slope darkens it toward rock, and anything the conform flattened reads as
// bare ground. You should be able to see every bench and every wall.
function terrainColour(y, slope, x, z, out) {
  const wet = y < 1.2;
  const paddy = z > 105 && slope < 0.06;
  let r;
  let g;
  let b;
  if (wet) { r = 0.40; g = 0.45; b = 0.42; }            // stream bed and banks
  else if (paddy) { r = 0.60; g = 0.68; b = 0.42; }     // 터미널 fields
  else if (y < 9) { r = 0.50; g = 0.56; b = 0.42; }     // valley floor
  else if (y < 24) { r = 0.36; g = 0.50; b = 0.33; }    // lower hillside
  else { r = 0.29; g = 0.41; b = 0.29; }                // ridge forest

  // Steep ground goes to rock and scrub; flat ground the conform benched goes
  // pale, so every cut and fill is visible from the air.
  const rock = Math.min(1, Math.max(0, (slope - 0.22) / 0.5));
  const bench = y > 6 && slope < 0.05 ? 0.3 : 0;
  r = r * (1 - rock) + 0.62 * rock + bench * 0.22;
  g = g * (1 - rock) + 0.57 * rock + bench * 0.21;
  b = b * (1 - rock) + 0.50 * rock + bench * 0.18;
  out.setRGB(r, g, b);
}

const groundGeo = new THREE.BufferGeometry();
groundGeo.setAttribute('position', new THREE.BufferAttribute(surfaces.ground.positions, 3));
groundGeo.setAttribute('normal', new THREE.BufferAttribute(surfaces.ground.normals, 3));
groundGeo.setIndex(new THREE.BufferAttribute(surfaces.ground.indices, 1));

const vertexCount = surfaces.ground.positions.length / 3;
const colours = new Float32Array(vertexCount * 3);
const tmp = new THREE.Color();
for (let i = 0; i < vertexCount; i++) {
  const x = surfaces.ground.positions[i * 3];
  const y = surfaces.ground.positions[i * 3 + 1];
  const z = surfaces.ground.positions[i * 3 + 2];
  const ny = surfaces.ground.normals[i * 3 + 1];
  const slope = Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(ny, 1e-4);
  terrainColour(y, slope, x, z, tmp);
  colours[i * 3] = tmp.r;
  colours[i * 3 + 1] = tmp.g;
  colours[i * 3 + 2] = tmp.b;
}
groundGeo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
scene.add(new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true })));

// ---- water ------------------------------------------------------------------
const waterGeo = new THREE.BufferGeometry();
waterGeo.setAttribute('position', new THREE.BufferAttribute(surfaces.water.positions, 3));
waterGeo.setIndex(new THREE.BufferAttribute(surfaces.water.indices, 1));
waterGeo.computeVertexNormals();
scene.add(new THREE.Mesh(waterGeo, new THREE.MeshBasicMaterial({
  color: 0x2f6f88, transparent: true, opacity: 0.86,
})));

// ---- roads ------------------------------------------------------------------
const ROAD_COLOUR = {
  arterial: 0xb9c3cf,
  street: 0x929cab,
  connector: 0x7c8694,
  alley: 0x6d7683,
  track: 0x8a7758,
};
const roadGroup = new THREE.Group();
for (const road of surfaces.roads) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(road.positions, 3));
  geo.setIndex(new THREE.BufferAttribute(road.indices, 1));
  geo.computeVertexNormals();
  roadGroup.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color: road.bridge ? 0xd8c07a : (ROAD_COLOUR[road.kind] ?? 0x8b95a3),
    side: THREE.DoubleSide,
  })));
}
scene.add(roadGroup);

// ---- landmarks, as sticks --------------------------------------------------
// Not models — markers. Their job is to tell you where the town's anchors sit
// on the landform, which is the one thing a plan view cannot show.
const landmarkGroup = new THREE.Group();
for (const [id, p] of Object.entries(layout.landmarks)) {
  const h = id === 'waterTower' ? 18 : id === 'church' ? 14 : id === 'coop' ? 12 : 7;
  const ground = terrain.heightAt(p.x, p.z);
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, h, 6),
    new THREE.MeshBasicMaterial({ color: 0x4dc8ff }),
  );
  stick.position.set(p.x, ground + h / 2, p.z);
  landmarkGroup.add(stick);
}
scene.add(landmarkGroup);

const spawnGround = terrain.heightAt(layout.spawn.position.x, layout.spawn.position.z);
const spawnMark = new THREE.Mesh(
  new THREE.ConeGeometry(2.4, 6, 8),
  new THREE.MeshBasicMaterial({ color: 0xffd35c }),
);
spawnMark.position.set(layout.spawn.position.x, spawnGround + 5, layout.spawn.position.z);
spawnMark.rotation.x = Math.PI;
scene.add(spawnMark);

// ---- light ------------------------------------------------------------------
// Low western sun, so the ridge throws its shape across the valley instead of
// flattening under an overhead key.
const sun = new THREE.DirectionalLight(0xffeedd, 2.4);
sun.position.set(-620, 300, -160);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xaecbe6, 0x50543f, 1.15));

// ---- views ------------------------------------------------------------------
const VIEWS = [
  ['valley', [-560, 300, 470], [-20, 6, -70]],
  ['ridge', [90, 300, -560], [0, 8, -50]],
  ['overhead', [0, 690, 240], [0, 6, -40]],
  ['main street', [-300, 22, 10], [120, 6, -24]],
  // The enclosure test: stand on 중앙로 and look at the hillside. This is the
  // view that showed the first ridge was a 10-degree swell rather than a wall.
  ['look north', [-10, 4.6, -20], [-20, 40, -190]],
  ['look south', [56, 5.6, 148], [60, 30, 270]],
  ['the weir', [150, 40, 175], [250, 0, 50]],
  ['윗말', [-40, 90, 60], [-60, 20, -140]],
  ['the pass', [292, 60, 60], [120, 8, -26]],
];
function goTo([, from, at]) {
  camera.position.set(...from);
  controls.target.set(...at);
  controls.update();
}
const views = document.getElementById('views');
for (const view of VIEWS) {
  const button = document.createElement('button');
  button.textContent = view[0];
  button.onclick = () => goTo(view);
  views.appendChild(button);
}
goTo(VIEWS[0]);

// ---- stats ------------------------------------------------------------------
const tris = surfaces.ground.indices.length / 3;
const roadTris = surfaces.roads.reduce((s, r) => s + r.indices.length / 3, 0);
document.getElementById('stats').innerHTML = [
  `600 x 450 m + ${layout.margin} m margin · ${GROUND_LABEL()}`,
  `${layout.nodes.length} nodes · ${layout.edges.length} edges · ${tris.toLocaleString()} ground tris`
    + ` · ${roadTris.toLocaleString()} road tris`,
  `relief ${surfaces.ground.grid.min.toFixed(1)} m to ${surfaces.ground.grid.max.toFixed(1)} m`,
].join('<br/>');
function GROUND_LABEL() { return `${surfaces.ground.cell} m heightfield`; }

// ---- loop -------------------------------------------------------------------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
