// M6c real-browser smoke: default world, driving, streaming, day/night art,
// and switching back to the classic city. Requires dev server on 5273.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const port=9700+Math.floor(Math.random()*200);
const browser=spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--enable-unsafe-swiftshader','--no-first-run','--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required','--mute-audio',
  `--remote-debugging-port=${port}`,`--user-data-dir=${mkdtempSync(path.join(tmpdir(),'snack-cassette-'))}`,'about:blank'
],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try {
  let tabs;
  for(let i=0;i<50;i++){try{tabs=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();break}catch{await sleep(200)}}
  assert.ok(tabs,'Chrome launched');
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let id=0; const pending=new Map(); const errors=[];
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id)}
    else if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)};
  function send(method,params={}){return new Promise((resolve,reject)=>{
    const i=++id;const timer=setTimeout(()=>{pending.delete(i);reject(new Error(`Timed out: ${method}`))},60000);
    pending.set(i,m=>{clearTimeout(timer);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result)});
    ws.send(JSON.stringify({id:i,method,params}));
  })}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
  await send('Runtime.enable');await send('Page.enable');
  mkdirSync('_work/m6c',{recursive:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:5273/?intro=off&time=day&rain=light'});
  for(let i=0;i<180;i++){if(await evaluate('!!window.__seoul?.dive && !!document.querySelector("#loading.done")'))break;await sleep(250)}
  assert.equal(await evaluate('__seoul.city.expanseData.streets.edges.length'),452,'default is rebuild');
  const initial=await evaluate('__seoul.phys.position.toArray()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w'});await sleep(3000);
  await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w'});
  const moved=await evaluate('({p:__seoul.phys.position.toArray(),pending:__seoul.city.streamingPending})');
  assert.ok(Math.hypot(moved.p[0]-initial[0],moved.p[2]-initial[2])>3,'keyboard drives through generated city');
  assert.ok(moved.p[1]>0,'truck remains on ground');assert.equal(moved.pending,0,'all detail meshes stream in');
  await evaluate('(()=>{const s=__seoul;s.renderer.setAnimationLoop(null);document.querySelector("#hud3").style.display="none";s.van.group.visible=false})()');
  async function shot(name,expression) {
    await evaluate(expression);const result=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync('_work/m6c/'+name+'.png',Buffer.from(result.data,'base64'));
  }
  await shot('street-detail-day',`(()=>{const s=__seoul,item=s.city.expanseData.streetDetail.find(i=>i.kind==='planter');
    const f=new s.THREE.Vector3(Math.sin(item.heading),0,Math.cos(item.heading));
    s.camera.position.set(item.x+f.x*6,2.3,item.z+f.z*6);s.camera.lookAt(item.x,.6,item.z);
    s.city.update(.016,s.camera);s.renderer.render(s.scene,s.camera)})()`);
  await shot('shop-spill-night',`(()=>{const s=__seoul;s.timeOfDay.set('night');const shop=s.city.pickupSites[0];
    s.camera.position.copy(shop.door).add(new s.THREE.Vector3(shop.toStreet.x*7,3,shop.toStreet.z*7));
    s.camera.lookAt(shop.facadePoint.x,1.2,shop.facadePoint.z);s.city.update(.016,s.camera);s.renderer.render(s.scene,s.camera)})()`);
  assert.equal(await evaluate('__seoul.scene.getObjectByName("expanse2_shop_spills").visible'),true,'shop spills on at night');
  await evaluate('(()=>{const select=[...document.querySelectorAll(".lil-gui select")].find(s=>[...s.options].some(o=>o.textContent.includes("Classic circuit")));select.selectedIndex=[...select.options].findIndex(o=>o.textContent.includes("Classic circuit"));select.dispatchEvent(new Event("change",{bubbles:true}))})()');
  await sleep(1000);
  for(let i=0;i<180;i++){if(await evaluate('!!window.__seoul?.dive && !!document.querySelector("#loading.done")'))break;await sleep(250)}
  assert.equal(await evaluate('new URL(location.href).searchParams.get("world")'), 'proc');
  assert.equal(await evaluate('__seoul.city.roadGraph.nodes.length'),67,'classic picker still loads the compact city');
  assert.deepEqual(errors,[]);console.log('PASS default rebuild, actual keyboard driving, grounded truck, completed streaming and day/night detail screenshots');
} finally {ws?.close();browser.kill()}
