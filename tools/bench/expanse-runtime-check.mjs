// M6c runtime contracts: road UV continuity, split names and progressive detail.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { roadGeometry } from '../../src/world/expanse2-city.js';
import { SURFACE_TILE } from '../../src/world/expanse-surface-art.js';
import { generateExpanseLayout } from '../../src/world/expanse-layout.js';
import { generateExpanseStreets } from '../../src/world/expanse-streets.js';
import { generateExpanseBlocks } from '../../src/world/expanse-blocks.js';
import { generateExpanseMassing } from '../../src/world/expanse-massing.js';
import { generateExpanseFacades } from '../../src/world/expanse-facades.js';
import { buildExpanseFacadeMeshes } from '../../src/world/expanse-facade-mesh.js';
import { buildExpanseVisualChunks } from '../../src/world/expanse-chunks.js';
import { createRoadGraph } from '../../src/world/road-network.js';
import { describeStreet, EXPANSE_STREET_NAMES } from '../../src/world/expanse-street-names.js';
import { DISTRICTS } from '../../src/world/data/color-bible.js';
import { generateExpanseRoadPaint } from '../../src/world/expanse-road-paint.js';
import { generateStreetDetail, streetItemGeometry, insidePolygon } from '../../src/world/expanse-street-detail.js';

const streets = generateExpanseStreets(generateExpanseLayout());
for (const e of streets.edges) {
  const geometry = roadGeometry(e.points, e.width);
  if (!geometry) continue;
  const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(uv.getX(i) - p.getX(i) / SURFACE_TILE.asphalt) < 0.0001);
    assert.ok(Math.abs(uv.getY(i) - p.getZ(i) / SURFACE_TILE.asphalt) < 0.0001);
  }
  geometry.dispose();
}
console.log('PASS every road shares world-aligned, metre-scaled surface UVs');
const graph = createRoadGraph({ ...streets, bounds: new THREE.Box3() });
for (const edge of streets.edges) {
  const name = describeStreet(graph, { edgeId: edge.id, lateralDistance: 0 });
  assert.ok(name?.ko && name?.en, edge.id);
  if (EXPANSE_STREET_NAMES[edge.parentId]) assert.equal(name.en, EXPANSE_STREET_NAMES[edge.parentId].en);
}
assert.equal(describeStreet(graph, { edgeId: 'not-a-real-edge' }), null);
console.log('PASS all rebuild roads resolve an authored name or their district');

const massing = generateExpanseMassing(generateExpanseBlocks(streets), streets);
const facades = generateExpanseFacades(massing, streets);
const make = (deferDetails) => {
  const root = new THREE.Group();
  const grid = buildExpanseVisualChunks(root, streets.bounds, massing.grid.cols, massing.grid.rows);
  const sheet = () => ({ map:null, emissive:null, normal:null, rough:null });
  const textures = { walls:DISTRICTS.map(sheet), shops:DISTRICTS.map(sheet), roof:null, roofNormal:null, roofRough:null,
    metres:{wall:{width:25.6,height:25.6},shop:{width:8,height:4.2},roof:6} };
  return { root, mesh:buildExpanseFacadeMeshes({chunkById:new Map(grid.chunks.map(c=>[c.id,c])),
    massing,facades,textures,signAtlas:null,districts:DISTRICTS,deferDetails}) };
};
const eager=make(false), streamed=make(true);
const count=(root)=>{let n=0;root.traverse(o=>{if(o.isMesh)n++});return n};
assert.ok(streamed.mesh.pendingDetails>0);
assert.ok(count(streamed.root)<count(eager.root));
const pending=streamed.mesh.pendingDetails;
for(let i=0;i<pending;i++) {
  const before=count(streamed.root);
  streamed.mesh.streamNext(new THREE.Vector3());
  assert.equal(count(streamed.root),before+1,'one optional mesh per frame');
}
assert.equal(streamed.mesh.pendingDetails,0);
assert.equal(count(streamed.root),count(eager.root));
assert.equal(streamed.mesh.triangles,eager.mesh.triangles);
console.log(`PASS ${pending} streamed detail meshes converge to the complete city`);

const detail=generateStreetDetail(massing,graph,generateExpanseRoadPaint(streets));
assert.ok(detail.length>100);
let detailTris=0;
for(const item of detail) {
  const geo=streetItemGeometry(item);detailTris+=geo.attributes.position.count/3;geo.dispose();
  if(item.kind==='drain')continue;
  assert.ok(massing.pavements.some(p=>insidePolygon(item.x,item.z,p.polygon)),'furniture/pads stay on pavement');
  const road=graph.project(new THREE.Vector3(item.x,0,item.z));
  assert.ok(road.lateralDistance>graph.edgeById.get(road.edgeId).width*.5,'off carriageway');
}
assert.ok(detailTris<50000);
assert.deepEqual(detail,generateStreetDetail(massing,graph,generateExpanseRoadPaint(streets)));
console.log(`PASS ${detail.length} original street details, ${detailTris} triangles, deterministic and outside carriageways`);
