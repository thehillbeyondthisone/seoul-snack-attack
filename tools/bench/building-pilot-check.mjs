// Real-browser glTF/material/collision checks and fixed comparison captures.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { BUILDINGS } from '../../src/world/building-catalog.js';
const assetId=process.env.BUILDING_PILOT||'patchwork-pocha';
const spec=BUILDINGS.find(b=>b.id===assetId);assert.ok(spec,'known building');
const narrow=assetId!=='patchwork-pocha';
const out=narrow?`_work/${assetId}-review`:'_work/patchwork-review';mkdirSync(out,{recursive:true});
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
 console.log('Opening review');await send('Page.navigate',{url:base+'building-pilot.html?building='+assetId});await ready('!!window.ready');
 const exportReport=await ev(`(()=>{const p=pilot,{THREE}=p,ms=[...p.city.allMaterials],gl=p.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');const door=p.city.raycast(new THREE.Vector3(p.city.metadata.entry.center[0],1.5,7),new THREE.Vector3(0,0,-1),3);const wall=p.city.raycast(new THREE.Vector3(...(p.city.metadata.wallProbe||[-5.85,1.5,7])),new THREE.Vector3(0,0,-1),3);let calls=0,tris=0;p.city.group.traverse(o=>{if(o.isMesh){calls++;tris+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});return{gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',materials:ms.length,mapped:ms.filter(m=>m.map&&m.normalMap&&m.roughnessMap).map(m=>m.name),glass:ms.find(m=>m.name==='glass')?.transparent,storeys:p.city.metadata.storeys,doorClear:!door,wallBlocks:!!wall,roadY:p.city.findGround(0,12)?.point.y,draws:calls,triangles:tris,loadingMs:p.city.loadingStats.totalMs};})()`);
 assert.equal(exportReport.storeys,spec.storeys);assert.equal(exportReport.glass,true);assert.equal(exportReport.doorClear,true,'building entry has no collider across it');assert.equal(exportReport.wallBlocks,true,'front wall is solid');assert.equal(exportReport.mapped.length,spec.pbrSets||7,'all authored PBR map sets survive glTF');assert.ok(Math.abs(exportReport.roadY-.05)<.001);
 console.log(JSON.stringify(exportReport));
 for(const [view,time,wet] of (narrow?[['corner','dusk',1],['front','day',0],['storefront','night',1]]:[['corner','dusk',1],['corner','day',0],['front','morning',0],['side','day',0],['storefront','night',1],['walking','dusk',0],['truck','dusk',1]])){
  await ev(`pilot.view('${view}');pilot.timeOfDay.set('${time}');pilot.city.setWetness(${wet});document.querySelector('#view').value='${view}';document.querySelector('#time').value='${time}';document.querySelector('#wet').checked=${!!wet};`);
  await shot(path.join(out,`${view}-${time}.png`));
 }
 const performanceReport=await ev(`(async()=>{const p=pilot,r=p.renderer,gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');r.setAnimationLoop(null);r.info.autoReset=false;p.view('corner');p.timeOfDay.set('dusk');const cpu=[],gpu=[];let draws=0;for(let i=0;i<12;i++){const q=ext?gl.createQuery():null;r.info.reset();if(q)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);const start=performance.now();p.post.render(1/60);cpu.push(performance.now()-start);if(q)gl.endQuery(ext.TIME_ELAPSED_EXT);draws=r.info.render.calls;if(q){for(let j=0;j<100&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);j++)await new Promise(requestAnimationFrame);if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}await new Promise(requestAnimationFrame);}const sorted=a=>a.sort((a,b)=>a-b);sorted(cpu);sorted(gpu);return{width:r.domElement.width,height:r.domElement.height,drawsIncludingShadowsAndPost:draws,cpuSubmissionMedianMs:cpu[Math.floor(cpu.length/2)],gpuMedianMs:gpu.length?gpu[Math.floor(gpu.length/2)]:null,gpuMaxMs:gpu.length?gpu.at(-1):null,geometryBuffers:r.info.memory.geometries,textures:r.info.memory.textures};})()`);
 console.log('Pilot render cost',performanceReport);
 await send('Page.navigate',{url:base+'?world=pilot&building='+assetId+'&intro=off&time=dusk&rain=off&props=off'});await ready('!!window.__seoul?.city?.pilot && !!document.querySelector("#loading.done")');
 await sleep(1500);
 const game=await ev(`(()=>{const s=__seoul;return{world:s.city.pilot,position:s.phys.position.toArray(),ground:s.city.findGround(s.phys.position.x,s.phys.position.z)?.point.y,route:!!s.city.findRoute(s.city.points[0],s.city.points.at(-1)),materials:[...s.city.allMaterials].length};})()`);
 assert.equal(game.world,true);assert.ok(game.position.every(Number.isFinite),'vehicle finite');assert.ok(game.position[1]>0&&game.position[1]<3,'vehicle rests on review road');assert.equal(game.route,true);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});await sleep(900);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
 const driven=await ev('__seoul.phys.position.toArray()');assert.ok(Math.hypot(driven[0]-game.position[0],driven[2]-game.position[2])>.3,'truck drives on pilot lot');
 await shot(path.join(out,'game-driving.png'));
 await ev('__seoul.phys.velocity.set(0,0,0);__seoul.phys.angularVelocity.set(0,0,0)');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'f',code:'KeyF',windowsVirtualKeyCode:70});await sleep(60);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'f',code:'KeyF',windowsVirtualKeyCode:70});await sleep(600);
 assert.equal(await ev('__seoul.player.mode'),'onFoot','F exits the stopped truck');
 const walking=await ev(`(async()=>{const s=__seoul,{resolveCapsule}=await import('/src/world/capsule-collision.js');const p=new s.THREE.Vector3(s.city.metadata.entry.center[0],.281,6.4),v=new s.THREE.Vector3(0,0,-2.7);for(let i=0;i<180;i++){v.z=-2.7;v.y-=19.5/120;p.addScaledVector(v,1/120);resolveCapsule(s.city,p,v,{height:1.72,radius:.32});}return p.toArray();})()`);
 console.log('Walking threshold result',walking);
 assert.ok(walking[2]<4.8,'full player capsule can cross building threshold');
 const ao=await ev('[...__seoul.city.allMaterials].filter(m=>m.aoMap).map(m=>({name:m.name,channel:m.aoMap.channel}))');
 assert.ok(ao.length>=(spec.minAoMaterials||(narrow?15:20))&&ao.every(m=>m.channel===1),'contact occlusion uses independent UV2');
 await shot(path.join(out,'game-walking.png'));
 await send('Page.navigate',{url:base+'?world=pilot&building='+assetId+'&intro=off&time=dusk&rain=off&props=off&pilotView=corner'});await ready('!!window.__seoul?.city?.pilot && !!document.querySelector("#loading.done")');await sleep(500);
 await ev(`document.querySelectorAll('#hud3,#cassette-deck,#touch-controls').forEach(e=>e.style.display='none');`);
 await shot(`tools/blender/previews/ingame-${assetId}.png`);
 assert.deepEqual(errors,[],'no runtime or renderer errors');
 const report=JSON.stringify({exportReport,performanceReport,game,driven,walking,ao,errors},null,2);writeFileSync(path.join(out,'report.json'),report);writeFileSync(`tools/blender/reports/${assetId}-runtime.json`,report);console.log('PASS imported PBR/AO, entry capsule/wall collision, driving, exit, route and fixed lighting views');
}finally{ws?.close();browser.kill();}
