// Real-browser glTF/material/collision checks and fixed comparison captures.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { BUILDINGS } from '../../src/world/building-catalog.js';
const assetId=process.env.BUILDING_PILOT||'patchwork-pocha';
const spec={};
const narrow=assetId!=='patchwork-pocha';
const out='_work/street-assembly-review';mkdirSync(out,{recursive:true});
const port=9847,base=process.env.SNACK_TEST_URL||'http://127.0.0.1:5273/';
console.log('Starting isolated rendering browser');
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--no-first-run','--no-default-browser-check','--mute-audio',
  `--remote-debugging-port=${port}`,`--user-data-dir=${mkdtempSync(path.join(tmpdir(),'patchwork-review-'))}`,'about:blank',
],{stdio:['ignore','ignore','pipe'],windowsHide:true});
browser.stderr.on('data',data=>{const line=data.toString();if(/DevTools listening/.test(line))console.log(line.trim());});
browser.on('error',error=>console.error('Browser launch:',error.message));
browser.on('exit',code=>console.log('Browser exited',code));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try{
 let tabs;
 for(let i=0;i<70;i++){try{tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1500)})).json();break;}catch{await sleep(200);}}
 assert.ok(tabs,'Chrome launched');ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description).join(' '));};
 function send(method,params={}){return new Promise((resolve,reject)=>{const i=++id,t=setTimeout(()=>reject(new Error(method+' timeout')),60000);pending.set(i,m=>{clearTimeout(t);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);});ws.send(JSON.stringify({id:i,method,params}));});}
 async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
 async function ready(expression){for(let i=0;i<300;i++){if(await ev(expression).catch(()=>false))return;await sleep(200);}throw new Error('Page did not become ready: '+expression+' '+errors.join('\n'));}
 async function shot(file){await sleep(250);const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync(file,Buffer.from(r.data,'base64'));console.log('Captured '+file);}
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 console.log('Opening assembled street');
 await send('Page.navigate',{url:base+'building-pilot.html?building=street-assembly'});await ready('!!window.ready');
 const inventory=await ev(`(()=>{const p=pilot,m=p.city.metadata;let meshes=0,instances=0;p.city.group.traverse(o=>{if(o.isMesh)meshes++;if(o.isInstancedMesh)instances+=o.count;});return{buildings:m.buildings,stats:m.assemblyStats,meshes,instances,lights:p.city.practicals.length,roadY:p.city.findGround(0,0)?.point.y,walkY:p.city.findGround(0,7)?.point.y};})()`);
 console.log(inventory);assert.equal(inventory.buildings,12);assert.equal(inventory.stats.removedStreetColliders,24);assert.equal(inventory.stats.removedStreetMeshes,22);assert.equal(inventory.lights,8);assert.ok(Math.abs(inventory.roadY-.05)<.001);assert.ok(Math.abs(inventory.walkY-.275)<.001);
 const lightPool=await ev(`(()=>{const p=pilot,samples=[];for(const x of [-80,0,220,0]){p.camera.position.set(x,4,3);p.city.update(1/60,p.camera);samples.push({visible:p.city.practicals.filter(p=>p.light.visible).length,lit:p.city.practicals.filter(p=>p.light.intensity>0).length});}p.view('corner');return samples;})()`);
 assert.ok(lightPool.every(s=>s.visible===8),'moving away dims pooled lights without changing shader light counts');assert.equal(lightPool[2].lit,0,'distant practicals are dark');
 for(const [view,time] of [['corner','day'],['front','dusk'],['walking','night']]){await ev(`pilot.view('${view}');pilot.timeOfDay.set('${time}');pilot.city.setWetness(0);document.querySelector("#wet").checked=false;`);await shot(path.join(out,`${view}-${time}.png`));}
 const physics=await ev(`(async()=>{
   const {VehiclePhysics,DEFAULT_PARAMS}=await import('/src/vehicle/physics.js');
   const {getVehicle}=await import('/src/game/data/vehicles.js');
   const {assemblyPath}=await import('/src/world/building-assembly.js');
   const T=pilot.THREE,city=pilot.city,def=getVehicle('pocha'),s=await(await fetch('/assets/vehicles/pocha.json')).json();
   const rig={wheelRadius:s.wheelRadius,wheels:Object.fromEntries(Object.entries(s.wheels).map(([key,w])=>[key,{localPos:new T.Vector3(...w.hub),radius:w.radius}]))};
   const neutral={throttle:0,brake:0,steer:0,handbrake:false},dt=1/120;
   function make(x,z,heading,wet){const p=new VehiclePhysics(city);Object.assign(p.params,DEFAULT_PARAMS,def.params,{collisionHalf:def.collisionHalf,bumperY:def.bumperY});p.attach(rig);p.place(new T.Vector3(x,2,z),heading);p.wetness=wet;for(let i=0;i<480;i++){p.controls={...neutral};p.step(dt);}return p;}
   const straight=[];
   for(const wet of [0,1])for(const direction of [-1,1])for(const offset of [-.6,0,.6]){
     const z=direction*3+offset,p=make(-direction*80,z,direction*Math.PI/2,wet);let crashes=0,maxDeviation=0,minSpeed=100,maxRoll=0;
     p.onCrash=()=>crashes++;p.velocity.set(direction*p.params.maxSpeed,0,0);
     for(let i=0;i<5*120;i++){p.controls={...neutral,throttle:1};p.step(dt);maxDeviation=Math.max(maxDeviation,Math.abs(p.position.z-z));minSpeed=Math.min(minSpeed,Math.hypot(p.velocity.x,p.velocity.z)*3.6);maxRoll=Math.max(maxRoll,Math.acos(T.MathUtils.clamp(new T.Vector3(0,1,0).applyQuaternion(p.quaternion).y,-1,1))*180/Math.PI);}
     straight.push({wet,direction,offset,crashes,maxDeviation,minSpeedKmh:minSpeed,maxRoll,end:p.position.toArray()});
   }
   // Genuine full-throttle physics on the full loop; steering is a benchmark
   // driver, never installed as a gameplay assist. No teleporting during a lap.
   const points=assemblyPath().map(([x,z])=>new T.Vector3(x,.05,z));
   const laps=[];
   for(const wet of [0,1]){
     const p=make(-80,0,Math.PI/2,wet);p.velocity.set(p.params.maxSpeed,0,0);let crashes=0,maxDeviation=0,maxRoll=0,distance=0,minSpeed=200,minBodyClearance=99,nearest=4;
     p.onCrash=()=>crashes++;const prev=p.position.clone();
     for(let i=0;i<48*120;i++){
       let best=Infinity;const previousNearest=nearest;for(let j=-3;j<8;j++){const n=(previousNearest+j+points.length)%points.length,d=p.position.distanceToSquared(points[n]);if(d<best){best=d;nearest=n;}}
       const speed=Math.hypot(p.velocity.x,p.velocity.z),look=12+speed*.55;let target=points[nearest],walk=0,j=nearest;
       while(walk<look){const next=(j+1)%points.length;walk+=points[j].distanceTo(points[next]);target=points[next];j=next;}
       const local=target.clone().sub(p.position).applyQuaternion(p.quaternion.clone().invert());
       const angle=Math.atan2(local.x,local.z),wheelAngle=Math.atan2(2*2.95*Math.sin(angle),look);
       const lock=T.MathUtils.lerp(p.params.steerLockLow,p.params.steerLockHigh,T.MathUtils.clamp(speed/p.params.steerSpeedRef,0,1));
       p.controls={...neutral,throttle:1,steer:T.MathUtils.clamp(-wheelAngle/lock,-1,1)};p.step(dt);
       distance+=p.position.distanceTo(prev);prev.copy(p.position);minSpeed=Math.min(minSpeed,speed*3.6);
       const projection=city.roadGraph.project(p.position),deviation=Math.hypot(p.position.x-projection.position.x,p.position.z-projection.position.z);maxDeviation=Math.max(maxDeviation,deviation);
       const forward=new T.Vector3(0,0,1).applyQuaternion(p.quaternion),delta=Math.atan2(forward.x,forward.z)-projection.heading;
       const support=def.collisionHalf.x*Math.abs(Math.cos(delta))+def.collisionHalf.z*Math.abs(Math.sin(delta));minBodyClearance=Math.min(minBodyClearance,6-deviation-support);
       maxRoll=Math.max(maxRoll,Math.acos(T.MathUtils.clamp(new T.Vector3(0,1,0).applyQuaternion(p.quaternion).y,-1,1))*180/Math.PI);
       if(Math.abs(p.position.y)>6||deviation>10)break;
     }
     laps.push({wet,crashes,maxDeviation,maxRoll,distance,minBodyClearance,minSpeedKmh:minSpeed,end:p.position.toArray()});
   }
   const {resolveCapsule}=await import('/src/world/capsule-collision.js');const doors=[];
   for(const e of city.metadata.entrances){const front=new T.Vector3(...e.front),p=new T.Vector3(...e.position).addScaledVector(front,1.2).setY(.28),v=new T.Vector3();for(let i=0;i<144;i++){v.x=-front.x*2.7;v.z=-front.z*2.7;v.y-=19.5/120;p.addScaledVector(v,dt);resolveCapsule(city,p,v,{height:1.72,radius:.32});}doors.push({id:e.id,inside:p.clone().sub(new T.Vector3(...e.position)).dot(front)<-.5,y:p.y});}
   return{configuredTopSpeedKmh:def.params.maxSpeed*3.6,straight,laps,doors};
 })()`);
 console.log(JSON.stringify(physics));writeFileSync(path.join(out,'physics.json'),JSON.stringify(physics,null,2));
 assert.ok(physics.straight.every(r=>r.crashes===0&&r.maxDeviation<.4&&r.minSpeedKmh>90),'both lanes and wet/dry top-speed envelope');
 assert.ok(physics.laps.every(r=>r.crashes===0&&r.minBodyClearance>1&&r.distance>1280&&r.minSpeedKmh>95&&r.maxRoll<25),'full-throttle closed loop and swept body clearance');
 assert.ok(physics.doors.every(d=>d.inside),'all twelve transformed building entrances');
 await ev(`pilot.view('corner');pilot.timeOfDay.set('dusk');`);await shot('tools/blender/previews/street-assembly.png');
 const perf=await ev(`(async()=>{const p=pilot,r=p.renderer,gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');r.setAnimationLoop(null);r.info.autoReset=false;p.view('corner');p.timeOfDay.set('dusk');const cpu=[],gpu=[];let draws=0;for(let i=0;i<12;i++){const q=ext?gl.createQuery():null;r.info.reset();if(q)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);const start=performance.now();p.post.render(1/60);cpu.push(performance.now()-start);if(q)gl.endQuery(ext.TIME_ELAPSED_EXT);draws=r.info.render.calls;if(q){for(let j=0;j<100&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);j++)await new Promise(requestAnimationFrame);if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}await new Promise(requestAnimationFrame);}const sorted=a=>a.sort((a,b)=>a-b);sorted(cpu);sorted(gpu);return{width:r.domElement.width,height:r.domElement.height,drawsIncludingShadowsAndPost:draws,cpuSubmissionMedianMs:cpu[Math.floor(cpu.length/2)],gpuMedianMs:gpu.length?gpu[Math.floor(gpu.length/2)]:null,gpuMaxMs:gpu.length?gpu.at(-1):null,geometryBuffers:r.info.memory.geometries,textures:r.info.memory.textures};})()`);
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.bootLongTasks=[];new PerformanceObserver(list=>bootLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});new MutationObserver(()=>{if(!window.bootReadyMs&&document.querySelector('#loading.done'))window.bootReadyMs=performance.now();}).observe(document,{subtree:true,attributes:true,childList:true});`});
 await send('Page.navigate',{url:base+'?world=pilot&building=street-assembly&intro=off&time=dusk&rain=off&props=off'});await ready('!!window.__seoul?.city?.metadata?.assembly && !!document.querySelector("#loading.done")');await sleep(1200);
 const startup=await ev(`({readyMs:window.bootReadyMs,longTasks:bootLongTasks,maxTaskMs:Math.max(0,...bootLongTasks.map(t=>t.duration)),timings:window.__seoulStartup||null})`);console.log('STARTUP',JSON.stringify(startup));
 const start=await ev('__seoul.phys.position.toArray()');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});await sleep(1400);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});const end=await ev('__seoul.phys.position.toArray()');assert.ok(Math.hypot(end[0]-start[0],end[2]-start[2])>1);
 await shot(path.join(out,'game-driving.png'));
 assert.deepEqual(errors,[]);const report=JSON.stringify({inventory,physics,perf,startup,start,end,errors},null,2);writeFileSync(path.join(out,'report.json'),report);writeFileSync('tools/blender/reports/street-assembly-runtime.json',report);console.log('PASS assembly, speed envelope, loop, entrances and actual driving');
}finally{ws?.close();browser.kill();}
