// Original M6c street kit: bins, planters, bollards, drains and tactile pads.
// One merged opaque mesh per chunk. No downloaded art or new collision bodies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chunkAt } from './expanse-chunks.js';
import { KERB_HEIGHT } from './expanse-massing.js';
import { ROAD_LIFT } from './expanse-road-paint.js';
import { PAINT, SURFACES, NEON } from './data/color-bible.js';

export function insidePolygon(x, z, polygon) {
  let inside = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i], b=polygon[j];
    if ((a.z>z)!==(b.z>z) && x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x) inside=!inside;
  }
  return inside;
}

export function generateStreetDetail(massing, graph, roadPaint, shops=[]) {
  const items=[];
  const shopIds=new Set(shops.map(s=>s.buildingId));
  const clearOfBuildings=(x,z,r)=>massing.buildings.every(b=>{
    const dx=x-b.x,dz=z-b.z,f=b.facing;
    return Math.abs(dx*f.x+dz*f.z)>b.depth*.5+r
      || Math.abs(dx*f.z-dz*f.x)>b.width*.5+r;
  });
  const pavementAt=(x,z,radius=0)=>massing.pavements.find(p=>
    [[-1,-1],[-1,1],[1,-1],[1,1]].every(([a,b])=>insidePolygon(x+a*radius,z+b*radius,p.polygon)));
  // Keep a full walking corridor between wall-side furniture and the road.
  massing.buildings.forEach((b,i)=>{
    if(i%9 || shopIds.has(b.id) || b.width<5) return;
    const f=b.facing, side={x:f.z,z:-f.x};
    const x=b.x+f.x*(b.depth*.5+.6)+side.x*b.width*.28;
    const z=b.z+f.z*(b.depth*.5+.6)+side.z*b.width*.28;
    const pad=pavementAt(x,z,.42), projection=graph.project(new THREE.Vector3(x,0,z));
    const edge=projection&&graph.edgeById.get(projection.edgeId);
    if(!pad || !edge || !clearOfBuildings(x,z,.42) || projection.lateralDistance<edge.width*.5+1.9) return;
    const kind=['bin','planter','bollard'][Math.floor(i/9)%3];
    items.push({kind,x,z,y:pad.height,heading:Math.atan2(f.x,f.z),radius:.42});
  });
  // Drains sit at the road edge, never in the river or on a bridge.
  graph.edges.forEach((edge,i)=>{
    if(i%3 || edge.bridge || edge.length<12) return;
    const a=edge.points[0], b=edge.points[1];
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    if(len<12) return;
    for(const side of [-1,1]) {
      const off=side*(edge.width*.5-.42);
      items.push({kind:'drain',x:(a.x+b.x)*.5+dz/len*off,z:(a.z+b.z)*.5-dx/len*off,
        y:(a.y+b.y)*.5+(ROAD_LIFT[edge.streetClass]||.05)+.007,heading:Math.atan2(dx,dz),radius:.3});
    }
  });
  // Group zebra stripes back into crossings and put warning pads at each end.
  const crossings=new Map();
  for(const mark of roadPaint.marks.filter(m=>m.kind==='zebra')) {
    const x=mark.x-Math.cos(mark.heading)*mark.lateral;
    const z=mark.z+Math.sin(mark.heading)*mark.lateral;
    crossings.set(`${mark.edgeId}:${x.toFixed(2)}:${z.toFixed(2)}`,{x,z,mark});
  }
  for(const {x,z,mark} of crossings.values()) {
    const edge=graph.edgeById.get(mark.edgeId);
    if(edge.bridge) continue;
    for(const side of [-1,1]) {
      const off=side*(edge.width*.5+.65), px=x+Math.cos(mark.heading)*off,pz=z-Math.sin(mark.heading)*off;
      const pad=pavementAt(px,pz,.46);
      if(pad && clearOfBuildings(px,pz,.46)) items.push({kind:'tactile',x:px,z:pz,y:pad.height+.009,heading:mark.heading,radius:.46});
    }
  }
  return items;
}

export function streetItemGeometry(item) {
  const parts=[];
  const add=(w,h,d,x,y,z,hex)=>{
    const g=(h<=.01 ? new THREE.PlaneGeometry(w,d).rotateX(-Math.PI/2)
      : new THREE.BoxGeometry(w,h,d)).toNonIndexed();
    g.translate(x,y+h*.5,z);
    const c=new THREE.Color(hex), colors=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(g);
  };
  const metal=SURFACES.metal;
  if(item.kind==='bin') {
    add(.4,.72,.38,0,0,0,PAINT.jade);add(.45,.08,.43,0,.72,0,metal);
    add(.25,.12,.006,0,.55,.194,PAINT.charcoal);add(.12,.09,.008,0,.3,.194,NEON.warmWhite);
  } else if(item.kind==='planter') {
    add(.66,.36,.66,0,0,0,PAINT.terracotta);add(.56,.035,.56,0,.36,0,PAINT.shopBrown);
    add(.48,.4,.48,0,.39,0,PAINT.jade);add(.3,.15,.3,.06,.79,0,NEON.lime);
  } else if(item.kind==='bollard') {
    add(.22,.08,.22,0,0,0,metal);add(.13,.75,.13,0,.08,0,metal);
    add(.14,.09,.14,0,.64,0,NEON.warmWhite);
  } else if(item.kind==='drain') {
    add(.48,.004,.62,0,0,0,metal);
    for(let i=0;i<6;i++)add(.4,.003,.035,0,.005,-.25+i*.1,PAINT.charcoal);
  } else if(item.kind==='tactile') {
    add(.82,.007,.82,0,0,0,NEON.gold);
    for(let i=0;i<5;i++)for(let j=0;j<5;j++)add(.055,.006,.055,-.32+i*.16,.007,-.32+j*.16,NEON.orange);
  }
  const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());
  geometry.rotateY(item.heading||0);geometry.translate(item.x,item.y,item.z);
  return geometry;
}

export function buildStreetDetail(grid, items) {
  const buckets=new Map();
  for(const item of items) {
    const chunk=chunkAt(grid,item.x,item.z);
    if(!buckets.has(chunk.id))buckets.set(chunk.id,[]);
    buckets.get(chunk.id).push(item);
  }
  const material=new THREE.MeshStandardMaterial({name:'expanse2_street_kit',vertexColors:true,roughness:.8});
  const pending=[...buckets].map(([id,records])=>({chunk:grid.chunks.find(c=>c.id===id),records}));
  return {
    count:items.length,
    drawCalls:pending.length,
    get pending(){return pending.length},
    streamNext(position) {
      pending.sort((a,b)=>a.chunk.center.distanceToSquared(position)-b.chunk.center.distanceToSquared(position));
      const next=pending.shift();if(!next)return;
      const parts=next.records.map(streetItemGeometry);
      const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());
      const mesh=new THREE.Mesh(geometry,material);mesh.name=`street_kit_${next.chunk.id}`;
      next.chunk.detail.add(mesh);
    },
  };
}

export function buildShopSpills(parent, shops) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d'), gradient=ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(255,255,255,.32)');gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const material=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,
    depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),material,shops.length);
  const transform=new THREE.Object3D();
  shops.forEach((shop,i)=>{
    transform.position.set(shop.door.x,KERB_HEIGHT+.012,shop.door.z);
    transform.rotation.y=shop.heading;transform.scale.set(Math.min(shop.width,5),1,3.2);transform.updateMatrix();
    mesh.setMatrixAt(i,transform.matrix);mesh.setColorAt(i,new THREE.Color(shop.color));
  });
  mesh.name='expanse2_shop_spills';parent.add(mesh);return mesh;
}
