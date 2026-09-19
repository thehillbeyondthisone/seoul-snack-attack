// Actual renderer + delivery state machine, isolated browser save. Server: 5273.
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
    else if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error') errors.push(m.params.args.map(a=>a.value||a.description).join(' '))};
  function send(method,params={}){return new Promise((resolve,reject)=>{
    const i=++id;const timer=setTimeout(()=>{pending.delete(i);reject(new Error(`Timed out: ${method}`))},60000);
    pending.set(i,m=>{clearTimeout(timer);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result)});
    ws.send(JSON.stringify({id:i,method,params}));
  })}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
  await send('Runtime.enable');await send('Page.enable');
  mkdirSync('tools/blender/previews',{recursive:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:5273/tools/truck-preview.html'});
  for(let i=0;i<80;i++){if(await evaluate('!!window.ready'))break;await sleep(250)}
  assert.equal(await evaluate('preview.van.makeover.enabled'),true);
  assert.ok(await evaluate('preview.van.makeover.graphics.children.length > 0'));
  const png=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync('tools/blender/previews/pocha-night-shift.png',Buffer.from(png.data,'base64'));
  await evaluate('preview.camera.position.set(9,3,10);preview.camera.lookAt(0,-.3,0);preview.renderer.render(preview.scene,preview.camera)');
  const side=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync('tools/blender/previews/pocha-night-shift-serving.png',Buffer.from(side.data,'base64'));
  await evaluate(`(()=>{const p=preview;p.van.group.visible=false;p.scene.children.find(x=>x.isMesh).visible=false;p.token.position.set(0,0,0);p.token.scale.setScalar(1);p.camera.position.set(2,1.3,3);p.camera.lookAt(0,0,0);p.renderer.render(p.scene,p.camera);document.querySelector('#label').textContent='NIGHT SHIFT / COLLECTIBLE'})()`);
  const can=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync('tools/blender/previews/night-shift-spray-can.png',Buffer.from(can.data,'base64'));
  await send('Page.navigate',{url:'http://127.0.0.1:5273/?intro=off&time=day&rain=off&props=off'});
  for(let i=0;i<240;i++){if(await evaluate('!!window.__seoul?.dive && !!document.querySelector("#loading.done")').catch(()=>false))break;await sleep(250)}
  assert.equal(await evaluate('!!window.__seoul?.orders'),true,'game boots');
  await evaluate(`(()=>{const s=__seoul;s.renderer.setAnimationLoop(null);s.orders.resetSave();s.orders.state='idle';s.orders.offerNow();s.orders._accept()})()`);
  assert.equal(await evaluate('__seoul.orders.truckUpgrade.group.visible'),false,'first order has no graphics collectible');
  assert.equal(await evaluate('__seoul.van.makeover.enabled'),false,'fresh truck retains original materials');
  await evaluate(`(()=>{const o=__seoul.orders;o.completeNow();o.completeNow();o.state='idle';o.offerNow();o._accept()})()`);
  assert.equal(await evaluate('__seoul.orders.save.deliveries'),1);
  assert.equal(await evaluate('__seoul.orders.truckUpgrade.group.visible'),true,'second accepted pickup spawns token');
  const placement=await evaluate(`(()=>{const s=__seoul,p=s.orders.truckUpgrade.group.position,r=s.orders.order.rest.point;return {distance:p.distanceTo(r),road:s.city.projectToRoad(p).lateralDistance}})()`);
  assert.ok(placement.distance>3 && placement.distance<15,JSON.stringify(placement));
  assert.ok(placement.road<.1,'collectible stands on carriageway');
  await evaluate(`(()=>{const o=__seoul.orders;o.completeNow();o.completeNow();o.state='idle';o.offerNow();o._accept()})()`);
  assert.equal(await evaluate('__seoul.orders.truckUpgrade.group.visible'),true,'missed collectible returns at later pickup');
  await evaluate(`(()=>{const o=__seoul.orders;o.player=null;o.phys.position.copy(o.truckUpgrade.group.position);o.paused=true;o.update(.016,null)})()`);
  assert.equal(await evaluate('__seoul.orders.save.truckMakeover'),false,'pause prevents collection');
  await evaluate('__seoul.orders.paused=false;__seoul.orders.update(.016,null)');
  assert.equal(await evaluate('__seoul.van.makeover.enabled'),true,'collecting equips actual vehicle');
  assert.equal(await evaluate('__seoul.orders.truckUpgrade.group.visible'),false);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("snack-attack-save")).truckMakeover'),true,'unlock persisted');
  await evaluate(`(()=>{const s=__seoul;s.van.group.traverse(m=>{if(m.material?.name?.endsWith('_night_shift') && (!m.geometry.attributes.uv1 || !m.material.normalMap))throw Error('Missing surface map')});s.renderer.render(s.scene,s.camera)})()`);
  await send('Page.reload');await sleep(750);
  for(let i=0;i<240;i++){if(await evaluate('!!window.__seoul?.dive && !!document.querySelector("#loading.done")').catch(()=>false))break;await sleep(250)}
  assert.equal(await evaluate('__seoul.van.makeover.enabled'),true,'reload restores makeover');
  await evaluate('__seoul.renderer.setAnimationLoop(null);__seoul.orders.resetSave()');
  assert.equal(await evaluate('__seoul.van.makeover.enabled'),false,'reset restores base appearance');
  assert.deepEqual(errors,[]);
  console.log('PASS rendered makeover, first/second order gate, road placement, pause, collection, persistence, reload, reset; PNG previews saved');
} finally {ws?.close();browser.kill()}

