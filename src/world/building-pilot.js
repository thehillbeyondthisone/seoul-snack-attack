// One authored corner for art and driving review. The default city is separate.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
import { makeTileGrid } from './tiling.js';
import { createRoadGraph, createDeliveryAnchors } from './road-network.js';
import { createNightRig, NIGHT } from './lighting.js';
import { StreetlightPool } from './streetlights.js';
import { BUILDINGS } from './building-catalog.js';
import { SNACK_STREET_RESTAURANTS } from '../game/data/restaurants.js';

export async function loadBuildingPilot(scene, manager, renderer, onPhase) {
  const started = performance.now();
  const requested=new URLSearchParams(location.search).get('building');
  const assembly=requested==='street-assembly';
  const assetId=BUILDINGS.find(b=>b.id===requested)?.id||BUILDINGS[0].id;
  onPhase?.(20, 'Loading building');
  const loaded=assembly?await (await import('./building-assembly.js')).loadAssembly(manager,renderer):null;
  const [gltf, response] = loaded?[loaded.gltf,null]:await Promise.all([
    new GLTFLoader(manager).loadAsync(`assets/world/${assetId}.glb`),
    fetch(`assets/world/${assetId}.json`),
  ]);
  if (response&&!response.ok) throw new Error(`Building pilot metadata: ${response.status}`);
  const metadata = loaded?.metadata||await response.json();
  const group = gltf.scene;
  group.name = metadata.name || 'Patchwork Pocha';
  scene.add(group);
  const allMaterials = new Set(), emissiveMaterials = [], roadMaterials = [];
  group.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      allMaterials.add(m);
      for (const key of ['map','normalMap','roughnessMap','metalnessMap']) {
        if (m[key]) m[key].anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }
      if (m.transparent) m.depthWrite = false;
    }
  });
  for (const m of allMaterials) {
    if (m.emissive?.getHex()) emissiveMaterials.push(m);
    if (m.name === 'asphalt') roadMaterials.push(m);
    // The small fixture must not put a mirror hotspot across the Hangul.
    if (m.name === 'enamel') { m.roughness=.78; m.metalness=0; }
    if (m.aoMap) m.aoMapIntensity=.65;
  }
  // A continuous flat review lot surrounds the small exported street corner.
  const lotMaterial=roadMaterials[0].clone();lotMaterial.name='Review apron';lotMaterial.aoMap=null;
  roadMaterials.push(lotMaterial);
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(100,100), lotMaterial);
  lot.name = 'Pilot driving apron'; lot.rotation.x = -Math.PI/2; lot.position.y=.049;
  const uv=lot.geometry.attributes.uv;
  for(let i=0;i<uv.count;i++) uv.setXY(i,(uv.getX(i)-.5)*100/3,(uv.getY(i)-.5)*100/3);
  if(!assembly)group.add(lot);else {lot.geometry.dispose();lotMaterial.dispose();roadMaterials.pop();}
  const boxes = [...metadata.collision, ...(!assembly?[{name:'Review lot',center:[0,.024,0],size:[100,.05,100]}]:[])];
  const geometries=boxes.map(b=>{
    const g=new THREE.BoxGeometry(...b.size).toNonIndexed();g.translate(...b.center);g.deleteAttribute('uv');return g;
  });
  for(const mesh of metadata.collisionMeshes||[]){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions.flat(),3));g.setIndex(mesh.indices);g.computeVertexNormals();geometries.push(g.toNonIndexed());g.dispose();
  }
  const colliderGeo=mergeGeometries(geometries,false);
  for(const g of geometries)g.dispose();
  const bvh=new MeshBVH(colliderGeo);colliderGeo.boundsTree=bvh;
  const ray=new THREE.Ray(), down=new THREE.Vector3(0,-1,0), up=new THREE.Vector3(0,1,0);
  const raycast=(origin,direction,far=140)=>{ray.origin.copy(origin);ray.direction.copy(direction);return bvh.raycastFirst(ray,THREE.DoubleSide,0,far)||null;};
  const findGround=(x,z)=>{const hit=raycast(new THREE.Vector3(x,24,z),down,32);return hit?.face?.normal.y>.88?hit:null;};
  const clearSkyLocal=(x,y,z)=>!raycast(new THREE.Vector3(x,y+1.6,z),up,20);
  const bounds=assembly?new THREE.Box3(new THREE.Vector3(...metadata.bounds[0]),new THREE.Vector3(...metadata.bounds[1])):new THREE.Box3(new THREE.Vector3(-50,-2,-50),new THREE.Vector3(50,18,50));
  const grid=makeTileGrid({tileBox:bounds,cols:1,rows:1,flipOddRows:false});
  const detail=new THREE.Group(),dressingDetail=new THREE.Group();group.add(detail,dressingDetail);
  const tiles=[{index:0,root:group,center:grid.centers[0],flipped:false,detail,dressingDetail,box:bounds,lodStats:{sourceMeshes:1,structureDraws:1,detailDraws:0}}];
  const roadPositions=[[-19,13],[0,13],[19,13],[19,0],[19,-13],[0,-13],[-19,-13],[-19,0]];
  const nodes=assembly?metadata.roadNodes.map(n=>({...n,position:new THREE.Vector3(...n.position)})):roadPositions.map(([x,z],i)=>({id:`pilot-${i}`,position:new THREE.Vector3(x,.05,z),district:0}));
  const edges=nodes.map((n,i)=>({id:`pilot-road-${i}`,a:n.id,b:nodes[(i+1)%nodes.length].id,width:metadata.roadWidth||9,kind:'street',district:assembly?0:Math.floor(i/2)}));
  const roadGraph=createRoadGraph({nodes,edges,bounds,roadWidth:metadata.roadWidth||9});
  const deliveryAnchors=assembly?metadata.entrances.map(e=>{
    const entrance=new THREE.Vector3(...e.position),q=roadGraph.project(entrance);
    const point=q.position.clone().add(entrance.clone().sub(q.position).setY(0).normalize().multiplyScalar(3.8));
    return {id:e.id,edgeId:q.edgeId,progress:q.progress,point,position:q.position.clone(),roadPoint:q.position.clone(),heading:q.heading,entrance};
  }):createDeliveryAnchors(roadGraph,findGround),points=deliveryAnchors.map(a=>a.point);
  let pickupSites=[];
  let orderDeliveryAnchors=null;
  if(assembly){
    const {SNACK_STREET_SHOPS}=await import('./building-assembly.js');
    const restaurantById=new Map(SNACK_STREET_RESTAURANTS.map(r=>[r.id,r]));
    const entranceById=new Map(metadata.entrances.map(e=>[e.id,e]));
    const anchorById=new Map(deliveryAnchors.map(a=>[a.id,a]));
    pickupSites=SNACK_STREET_SHOPS.map(binding=>{
      const restaurant=restaurantById.get(binding.id),entrance=entranceById.get(binding.entranceId),anchor=anchorById.get(binding.entranceId);
      if(!restaurant||!entrance||!anchor)throw new Error(`Snack Street shop binding: ${binding.id}/${binding.entranceId}`);
      anchor.nameKo=restaurant.nameKo;anchor.nameEn=restaurant.nameEn;anchor.restaurantId=restaurant.id;
      return {id:restaurant.id,nameKo:restaurant.nameKo,nameEn:restaurant.nameEn,buildingId:entrance.id,assetId:entrance.asset,
        point:anchor.point.clone(),entrance:new THREE.Vector3(...entrance.position),anchor};
    });
    orderDeliveryAnchors=pickupSites.map(site=>site.anchor);
  }
  const spawn={position:new THREE.Vector3(...(metadata.spawn?.position||[-8,.85,12])),heading:Math.PI/2,tile:0};
  const safeResetPoints=nodes.map(n=>({position:n.position.clone().add(new THREE.Vector3(0,.8,0)),heading:0,tile:0}));
  const getSafeReset=p=>{const q=roadGraph.project(p);return q?{position:q.position.clone().setY(.85),heading:q.heading,tile:0}:{...spawn,position:spawn.position.clone()};};
  const nightRig=createNightRig(scene,renderer);
  // One bounded sun shadow is part of this pilot's measured quality cost.
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  nightRig.moon.castShadow=true;nightRig.moon.shadow.mapSize.set(2048,2048);
  const shadowExtent=assembly?65:24;
  Object.assign(nightRig.moon.shadow.camera,{left:-shadowExtent,right:shadowExtent,top:shadowExtent,bottom:-shadowExtent,near:1,far:360});
  nightRig.moon.shadow.bias=-.00015;nightRig.moon.shadow.normalBias=.025;
  group.traverse(o=>{if(o.isMesh){o.castShadow=!o.material?.transparent;o.receiveShadow=true;}});
  const streetlights=new StreetlightPool(scene,{size:2,range:NIGHT.lampRange,intensity:NIGHT.lampIntensity,glowOpacity:NIGHT.glowOpacity,glowRadius:NIGHT.glowRadius});
  streetlights.setAnchors([]);
  const practicals=(assembly?metadata.lights.slice(0,8):metadata.lights).map(spec=>{
    const light=new THREE.PointLight(spec.color,spec.intensity,spec.range,2);light.position.fromArray(spec.position);group.add(light);return {light,spec};
  });
  const originalRoad=roadMaterials.map(m=>({m,color:m.color.clone(),roughness:m.roughness,env:m.envMapIntensity}));
  function setWetness(w){for(const s of originalRoad){s.m.roughness=s.roughness*(1-.62*w);s.m.envMapIntensity=s.env+w*.9;s.m.color.copy(s.color).multiplyScalar(1-w*.2);}}
  function update(dt,camera){
    const gain=nightRig.params.mode==='day'?.35:nightRig.params.mode==='morning'?.65:1;
    if(assembly){
      const nearest=metadata.lights.map(spec=>({spec,d:camera.position.distanceToSquared(new THREE.Vector3(...spec.position))})).sort((a,b)=>a.d-b.d).slice(0,practicals.length);
      // Keep the light count stable. Toggling visible changes NUM_POINT_LIGHTS
      // and recompiles every facade shader at spawn and as the truck moves.
      nearest.forEach(({spec,d},i)=>{practicals[i].spec=spec;practicals[i].light.position.fromArray(spec.position);practicals[i].gain=d<55*55?1:0;});
    }
    for(const {light,spec,gain:distanceGain=1} of practicals)light.intensity=spec.intensity*gain*distanceGain*(spec.role==='fascia'?.12:1);
    streetlights.update(dt,camera.position);
  }
  onPhase?.(92,assembly?'Test street ready':'Building pilot ready');
  return {
    pilot:true,metadata,group,tiles,grid,bvh,colliderGeo,allMaterials,practicals,
    raycast,localRaycast:raycast,findGround,findGroundLocal:findGround,clearSkyLocal,
    bounds,tileBounds:bounds,districtBounds:bounds,worldBounds:bounds,roadBox:bounds,
    spawn,localSpawn:spawn.position.clone(),safeResetPoints,getSafeReset,points,localPoints:points,
    roadGraph,deliveryAnchors,pickupSites,restaurantRoster:assembly?'snack-street':null,
    orderDeliveryAnchors,orderMinRouteDistance:assembly?10:null,
    projectToRoad:p=>roadGraph.project(p),findRoute:(a,b)=>roadGraph.findRoute(a,b),
    roadMaterials,emissiveMaterials,reliefMaterials:[...allMaterials].filter(m=>m.normalMap),
    setWetness,update,fog:nightRig.fog,nightRig,lights:{hemi:nightRig.hemi,amb:nightRig.amb,moon:nightRig.moon,streetlights},
    stats:{buildings:metadata.buildings||1,triangles:colliderGeo.attributes.position.count/3,tiles:1,roadNodes:nodes.length,roadEdges:edges.length},
    loadingStats:{totalMs:performance.now()-started},killY:-2,cullDistance:150,detailDistance:100,
  };
}
