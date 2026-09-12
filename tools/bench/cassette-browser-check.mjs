// Run against npm run dev (port 5273). Real media, DOM layout and screenshots.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const port=9700+Math.floor(Math.random()*200);
const browser=spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--disable-gpu','--enable-unsafe-swiftshader','--no-first-run','--no-default-browser-check',
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
  await send('Page.navigate',{url:'http://127.0.0.1:5273/tools/bench/fixtures/cassette.html'});
  for(let i=0;i<80;i++){if(await evaluate('!!window.review?.deck?.tapeA'))break;await sleep(250)}
  assert.equal(await evaluate('!!window.review?.deck?.tapeA'),true,'3D tape asset loads');
  mkdirSync('_work/cassette-qa',{recursive:true});
  for(const [width,height] of [[1280,800],[909,871],[600,505],[390,844],[375,667],[360,640],[320,568],[844,390],[667,375]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(550);
    const layout=await evaluate(`(()=>{const rack=document.querySelector('.deck-rack');const cards=[...document.querySelectorAll('.tape-card')];
      const unit=document.querySelector('.deck-unit').getBoundingClientRect();return {count:cards.length,
      allVisible:cards.every(c=>{const r=c.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}),
      overflow:rack.scrollWidth>rack.clientWidth+1,unit:[unit.x,unit.y,unit.width,unit.height],
      labelsFit:cards.every(c=>{const t=c.querySelector('.tc-title');return t.scrollHeight<=t.clientHeight+1})}})()`);
    console.log(`${width}x${height}`,JSON.stringify(layout));
    const shot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(`_work/cassette-qa/deck-${width}x${height}.png`,Buffer.from(shot.data,'base64'));
    assert.equal(layout.count,11);assert.ok(layout.allVisible,`${width}x${height}: all tapes inside viewport`);
    assert.ok(layout.unit[1]>=-1 && layout.unit[1]+layout.unit[3]<=height+1,'mix and transport also fit');
    assert.equal(layout.overflow,false,'no horizontal rack scrolling');assert.ok(layout.labelsFit,'titles do not clip');
  }
  const media=await evaluate(`(async()=>{const {st}=review;await st.resume();const before=st.audio.currentTime;
    await new Promise(r=>setTimeout(r,350));await st.startDive();await new Promise(r=>setTimeout(r,700));
    const overlap={main:st.audio.volume,cue:st.cueAudio.volume,playing:!st.audio.paused&&!st.cueAudio.paused,
      ready:st.cueAudio.readyState,time:st.cueAudio.currentTime,mainAdvanced:st.audio.currentTime>before};
    st.pause();return overlap})()`);
  console.log('REAL MEDIA',JSON.stringify(media));
  assert.ok(media.playing&&media.main>0&&media.cue>0&&media.time>0&&media.mainAdvanced,'two real MP3s play through crossfade');
  assert.deepEqual(errors,[],'no browser exceptions');
  console.log('PASS cassette browser layout and real MP3 crossfade');
  if (process.argv.includes('--game')) {
    await send('Emulation.setDeviceMetricsOverride',{width:480,height:320,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://127.0.0.1:5273/?world=expanse2&view=cockpit&intro=off&rain=off&time=day'});
    for(let i=0;i<90;i++){if(await evaluate('!!window.__seoul?.dive && !!document.querySelector("#loading.done")'))break;await sleep(500)}
    assert.equal(await evaluate('!!window.__seoul?.dive && !!document.querySelector("#loading.done")'),true,'game boots with the new cab');
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyP',key:'p'});
    await sleep(1500);
    await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyP',key:'p'});
    assert.equal(await evaluate('document.querySelector(".cassette-deck").classList.contains("show")'),true,'P opens the player');
    const parked = await evaluate('__seoul.phys.position.toArray()');
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w'});
    await sleep(1100);
    await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w'});
    assert.deepEqual(await evaluate('__seoul.phys.position.toArray()'),parked,'choosing music pauses driving');
    const selection = await evaluate(`(async()=>{
      const s=__seoul.soundtrack, cards=[...document.querySelectorAll('.tape-card')];
      const available=[];
      for(let i=0;i<cards.length;i++)if(!s.isLocked(i)) {
        if(i===s.index) s.pause();
        cards[i].click(); await new Promise(r=>setTimeout(r,120));
        if(s.index!==i||s.paused)throw new Error('Tape selection failed: '+i);
        available.push(i);
      }
      const last=s.index;cards.find((_,i)=>s.isLocked(i)).click();
      return {available:available.length,lockedBlocked:s.index===last};
    })()`);
    assert.deepEqual(selection,{available:7,lockedBlocked:true});
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Escape',key:'Escape'});
    await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Escape',key:'Escape'});
    assert.equal(await evaluate('document.querySelector(".cassette-deck").classList.contains("show")'),false,'Escape closes player');
    await evaluate('document.querySelector("#h3audio").click()');
    assert.equal(await evaluate('document.querySelector(".cassette-deck").classList.contains("show")'),true,'HUD cassette opens player');
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Escape',key:'Escape'});
    await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Escape',key:'Escape'});
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Escape',key:'Escape'});
    await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Escape',key:'Escape'});
    await evaluate('document.querySelector("[data-open-cassette]").click()');
    assert.equal(await evaluate('document.querySelector(".cassette-deck").classList.contains("show") && document.querySelector(".ssa-settings").hidden'),true,'Settings opens player without stacking');
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Escape',key:'Escape'});
    await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Escape',key:'Escape'});
    console.log('PASS game cassette keyboard/HUD/settings access, seven selectable songs, lock and driving pause');
    const nodes=await evaluate(`(()=>{const s=__seoul;s.renderer.setAnimationLoop(null);const root=s.scene;
      return {head:!!root.getObjectByName('hippo_head'),body:!!root.getObjectByName('hippo_body'),wheel:!!root.getObjectByName('steering_wheel'),
      speed:!!root.getObjectByName('needle_speed'),tapes:s.soundtrack.tracks.length}})()`);
    assert.deepEqual(nodes,{head:true,body:true,wheel:true,speed:true,tapes:11});
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await sleep(500);
    await evaluate(`(()=>{document.querySelector('#hud3').style.display='none';const s=__seoul;
      s.camera.aspect=1280/800;s.camera.updateProjectionMatrix();s.renderer.setSize(1280,800);s.renderer.render(s.scene,s.camera)})()`);
    const cabShot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync('_work/cassette-qa/cab-in-game.png',Buffer.from(cabShot.data,'base64'));
    const ramp=await evaluate(`(async()=>{const s=__seoul;const {DIVE_RAMP:r}=await import('/src/world/dive-ramp.js');
      s.soundtrack.pause();let calls=0;const original=s.soundtrack.startDive.bind(s.soundtrack);
      s.soundtrack.startDive=(...args)=>{calls++;return original(...args)};
      s.phys.place(new s.THREE.Vector3(r.x,1.2,r.approachStartZ+2),0);s.phys.velocity.set(0,0,14);s.phys.step(1/120);
      s.dive.update(.016,s.input);const armed={state:s.dive.state,calls};
      s.phys.position.y=5;s.phys.position.z=r.zEnd+2;s.dive.update(.016,s.input);
      const launched={state:s.dive.state,calls,title:s.soundtrack.currentTrack.title};
      for(let i=0;i<5;i++)s.dive.update(.016,s.input);
      return {armed,launched,calls}})()`);
    console.log('GAME RAMP',JSON.stringify(ramp));
    assert.equal(ramp.armed.state,'armed');assert.equal(ramp.armed.calls,0,'approach must not start the song');
    assert.equal(ramp.launched.state,'launched');assert.equal(ramp.launched.title,'Dive');assert.equal(ramp.calls,1,'takeoff fires once');
    assert.deepEqual(errors,[],'game and ramp have no exceptions');
    console.log('PASS game cab nodes and actual armed-to-launched music trigger');
  }
} finally {ws?.close();browser.kill()}
