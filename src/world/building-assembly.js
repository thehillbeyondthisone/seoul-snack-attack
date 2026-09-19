// Twelve-building mixed-use art block plus a closed, full-speed test route.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BUILDINGS } from './building-catalog.js';

export const ASSEMBLY = {roadWidth:12,sidewalkWidth:2.4,bendRadius:140,straightLength:200};
// One copy of each authored food building participates in the pilot delivery
// loop. The placement key is the stable gameplay binding; transforms remain
// owned by the assembly and cannot drift from the visible entrance.
export const SNACK_STREET_SHOPS = [
  {id:'patchwork-pocha',entranceId:'north-1'},
  {id:'moon-hotteok',entranceId:'north-3'},
  {id:'cloud-dumpling',entranceId:'south-1'},
];
// Explicit compatibility manifest for the authored exports. New exports
// must declare their review-only components here before joining this assembly.
const REVIEW = {
  'patchwork-pocha':{nodes:['Street asphalt','Street enamel','Street iron','Street stainless','Street stone'],collision:['Road','Sidewalk']},
  'moon-hotteok':{nodes:['Street asphalt','Street iron','Street stainless','Street stone'],collision:['Street','Pavement']},
  'cloud-dumpling':{nodes:['Street asphalt','Street iron','Street stainless','Street stone'],collision:['Review road','Pavement']},
  'ochre-walkup':{nodes:['Street asphalt','Street iron','Street stone'],collision:['Street','Pavement']},
  'blue-office':{nodes:['Street asphalt','Street iron','Street stone'],collision:['Street','Pavement']},
  'service-workshop':{nodes:['Street asphalt','Street iron','Street stone'],collision:['Street','Pavement']},
};

export function assemblyPath(){
  const p=[],r=ASSEMBLY.bendRadius;
  for(let x=-100;x<100;x+=5)p.push([x,0]);
  for(let i=0;i<96;i++){const a=-Math.PI/2+i*Math.PI/96;p.push([100+r*Math.cos(a),r+r*Math.sin(a)]);}
  for(let x=100;x>-100;x-=5)p.push([x,2*r]);
  for(let i=0;i<96;i++){const a=Math.PI/2+i*Math.PI/96;p.push([-100+r*Math.cos(a),r+r*Math.sin(a)]);}
  return p;
}

export function ribbon(path,inner,outer,y){
  const v=[],uv=[],ix=[];
  for(let i=0;i<path.length;i++){
    const a=path[(i+path.length-1)%path.length],b=path[(i+1)%path.length],p=path[i];
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
    for(const d of [inner,outer]){const x=p[0]+nx*d,z=p[1]+nz*d;v.push(x,y,z);uv.push(x/3,z/3);}
    const j=(i+1)%path.length;ix.push(i*2,i*2+1,j*2,j*2,i*2+1,j*2+1);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}

export async function loadAssembly(manager,renderer){
  const group=new THREE.Group();group.name='Snack Street · test assembly';
  const assets=await Promise.all(BUILDINGS.map(async spec=>{
    const [gltf,r]=await Promise.all([new GLTFLoader(manager).loadAsync(`assets/world/${spec.id}.glb`),fetch(`assets/world/${spec.id}.json`)]);
    if(!r.ok)throw new Error(`Assembly metadata ${spec.id}: ${r.status}`);
    return {spec,gltf,meta:await r.json()};
  }));
  // Same named, deterministic source maps at the same dimensions are shared.
  // AO stays per asset. Different resolutions (the first pilot) stay distinct.
  const textures=new Map();let reusedTextures=0;
  for(const {gltf} of assets)gltf.scene.traverse(o=>{
    if(!o.isMesh)return;
    for(const m of [].concat(o.material))for(const slot of ['map','normalMap','roughnessMap','metalnessMap']){
      const t=m[slot];if(!t)continue;const im=t.image;
      const key=[m.name,slot,im?.width,im?.height,t.name,t.colorSpace,t.channel].join(':');
      if(textures.has(key)&&textures.get(key)!==t){m[slot]=textures.get(key);reusedTextures++;}else textures.set(key,t);
    }
  });
  const placements=[];
  // Two restaurant shells, two mixed-use shells and two explicitly non-retail
  // uses per side. Opposing order reversal prevents a mirrored clone row.
  const order=['service-workshop','patchwork-pocha','ochre-walkup','moon-hotteok','cloud-dumpling','blue-office'];
  for(const side of [-1,1]){
    let x=-31;
    for(let i=0;i<order.length;i++){
      const id=order[side===-1?i:order.length-1-i],w=BUILDINGS.find(b=>b.id===id).footprint[0];
      placements.push({id,key:`${side<0?'north':'south'}-${i}`,x:x+w/2,z:side*13.4,angle:side<0?0:Math.PI});x+=w+1;
    }
  }
  const collision=[],collisionMeshes=[],lights=[],entrances=[];
  let removedStreetMeshes=0,removedStreetColliders=0,instanceMeshes=0;
  for(const {spec,gltf,meta} of assets){
    const manifest=REVIEW[spec.id],found=[];gltf.scene.updateMatrixWorld(true);
    const lots=placements.filter(p=>p.id===spec.id).map(p=>({...p,matrix:new THREE.Matrix4().makeRotationY(p.angle).setPosition(p.x,0,p.z)}));
    gltf.scene.traverse(o=>{
      if(!o.isMesh)return;
      if(manifest.nodes.includes(o.name.replaceAll('_',' '))){found.push(o.name);removedStreetMeshes++;return;}
      // Opaque repeated parts share one draw and geometry. Glass keeps separate
      // objects so the renderer can sort the opposing shopfronts by distance.
      if([].concat(o.material).some(m=>m.transparent)){
        for(const lot of lots){const mesh=new THREE.Mesh(o.geometry,o.material);mesh.matrixAutoUpdate=false;mesh.matrix.multiplyMatrices(lot.matrix,o.matrixWorld);group.add(mesh);}
      }else{
        const mesh=new THREE.InstancedMesh(o.geometry,o.material,lots.length);mesh.name=spec.id+' / '+o.name;
        lots.forEach((lot,i)=>mesh.setMatrixAt(i,new THREE.Matrix4().multiplyMatrices(lot.matrix,o.matrixWorld)));
        mesh.computeBoundingSphere();group.add(mesh);instanceMeshes++;
      }
    });
    if(found.length!==manifest.nodes.length)throw new Error(`Review component manifest mismatch: ${spec.id}`);
    for(const lot of lots){
      const transform=p=>new THREE.Vector3(...p).applyMatrix4(lot.matrix).toArray();
      for(const b of meta.collision){
        if(manifest.collision.includes(b.name)){removedStreetColliders++;continue;}
        collision.push({...b,name:lot.key+'/'+b.name,center:transform(b.center)}); // placements are 0 or PI; box extents unchanged
      }
      for(const m of meta.collisionMeshes||[])collisionMeshes.push({...m,name:lot.key+'/'+m.name,positions:m.positions.map(transform)});
      for(const l of meta.lights)lights.push({...l,position:transform(l.position)});
      entrances.push({id:lot.key,asset:spec.id,position:transform(meta.entry.center),front:[Math.sin(lot.angle),0,Math.cos(lot.angle)]});
    }
  }
  let asphalt,stone;
  assets[1].gltf.scene.traverse(o=>{if(o.isMesh){if(o.material.name==='asphalt')asphalt=o.material;if(o.material.name==='stone')stone=o.material;}});
  asphalt=asphalt.clone();asphalt.aoMap=null;stone=stone.clone();stone.aoMap=null;stone.side=THREE.DoubleSide;
  const path=assemblyPath();
  function surface(name,geo,mat,solid=true){
    const mesh=new THREE.Mesh(geo,mat);mesh.name=name;group.add(mesh);
    if(solid)collisionMeshes.push({name,positions:Array.from({length:geo.attributes.position.count},(_,i)=>[geo.attributes.position.getX(i),geo.attributes.position.getY(i),geo.attributes.position.getZ(i)]),indices:Array.from(geo.index.array)});
  }
  surface('Continuous 12m road',ribbon(path,-6,6,.05),asphalt);
  for(const side of [-1,1]){
    surface('Continuous pavement',ribbon(path,side<0?-8.4:6,side<0?-6:8.4,.275),stone);
    // Vertical curb faces match the visible raised pavement and physical edge.
    const geo=ribbon(path,side*6,side*6,.05),pos=geo.attributes.position;
    for(let i=1;i<pos.count;i+=2)pos.setY(i,.275);geo.computeVertexNormals();surface('Curb face',geo,stone);
  }
  const paint=new THREE.MeshStandardMaterial({color:0xbba76a,roughness:.9,side:THREE.DoubleSide});
  surface('Centre line',ribbon(path,-.045,.045,.055),paint,false);
  const land=new THREE.Mesh(new THREE.PlaneGeometry(620,420),new THREE.MeshStandardMaterial({color:0x626957,roughness:1}));
  land.rotation.x=-Math.PI/2;land.position.set(0,-.02,140);group.add(land);
  collision.push({name:'Test terrain',center:[0,-.07,140],size:[620,.10,420]});
  // Pavement beneath each retained threshold remains at its original height.
  for(const p of placements)collision.push({name:p.key+'/foundation',center:[p.x,.12,p.z],size:[BUILDINGS.find(b=>b.id===p.id).footprint[0],.31,10]});
  const cameras={corner:{position:[-58,18,2],target:[3,5,0]},front:{position:[-65,6,1],target:[20,5,0]},side:{position:[0,180,350],target:[0,0,110]},walking:{position:[-12,1.72,-6.9],target:[7,2,-8.4]},truck:{position:[-43,4.5,3],target:[12,3,0]},storefront:{position:[-22,2.3,-2],target:[-25,2,-8.4]}};
  const nodes=path.map(([x,z],i)=>({id:`assembly-${i}`,position:[x,.05,z],district:0}));
  return {gltf:{scene:group},metadata:{id:'street-assembly',name:group.name,assembly:true,buildings:placements.length,placements,entrances,collision,collisionMeshes,lights,cameras,
    bounds:[[-310,-2,-65],[310,35,345]],roadNodes:nodes,roadWidth:12,spawn:{position:[-80,.85,3],heading:Math.PI/2},
    assemblyStats:{...ASSEMBLY,removedStreetMeshes,removedStreetColliders,instanceMeshes,reusedTextures,uniqueSharedSurfaceTextures:textures.size},
  }};
}
