// Run against npm run dev (port 5273). Real media, DOM layout and screenshots.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const port=9700+Math.floor(Math.random()*200);
const baseUrl=process.env.SNACK_TEST_URL || 'http://127.0.0.1:5273';
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
    else if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error') errors.push(m.params.args.map(a=>a.value || a.description).join(' '))};
  function send(method,params={}){return new Promise((resolve,reject)=>{
    const i=++id;const timer=setTimeout(()=>{pending.delete(i);reject(new Error(`Timed out: ${method}`))},60000);
    pending.set(i,m=>{clearTimeout(timer);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result)});
    ws.send(JSON.stringify({id:i,method,params}));
  })}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:baseUrl+'/tools/bench/fixtures/cassette.html'});
  for(let i=0;i<80;i++){if(await evaluate('!!window.review?.deck?.tapeA'))break;await sleep(250)}
  assert.equal(await evaluate('!!window.review?.deck?.tapeA'),true,'3D tape asset loads');
  const tapeFit=await evaluate(`(()=>{const c=review.deck._camera;
    const visibleH=2*c.position.z*Math.tan(c.fov*Math.PI/360),visibleW=visibleH*c.aspect;
    return {width:.1017/visibleW*300,height:.0659/visibleH*158,
      slot:document.querySelector('.deck-slot').getBoundingClientRect().width};})()`);
  assert.ok(tapeFit.width>=tapeFit.slot*.9&&tapeFit.width<=tapeFit.slot*1.15,'seated tape matches the loading-slot width');
  assert.ok(tapeFit.height>=118&&tapeFit.height<=150,'seated tape fills the player bay vertically');
  mkdirSync('_work/cassette-qa',{recursive:true});
  for(const [width,height] of [[1280,800],[909,871],[758,606],[600,505],[390,844],[375,667],[360,640],[320,568],[844,390],[667,375]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(550);
    const layout=await evaluate(`(()=>{const rack=document.querySelector('.deck-rack');const cards=[...document.querySelectorAll('.tape-card')];
      const unit=document.querySelector('.deck-unit').getBoundingClientRect(),bay=document.querySelector('.deck-window').getBoundingClientRect(),slot=document.querySelector('.deck-slot').getBoundingClientRect();return {count:cards.length,
      allVisible:cards.every(c=>{const r=c.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}),
      overflow:rack.scrollWidth>rack.clientWidth+1,unit:[unit.x,unit.y,unit.width,unit.height],
      slotRatio:slot.width/bay.width,
      labelsFit:cards.every(c=>{const t=c.querySelector('.tc-title');return t.scrollHeight<=t.clientHeight+1})}})()`);
    console.log(`${width}x${height}`,JSON.stringify(layout));
    const shot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(`_work/cassette-qa/deck-${width}x${height}.png`,Buffer.from(shot.data,'base64'));
    assert.equal(layout.count,12);assert.ok(layout.allVisible,`${width}x${height}: all tapes inside viewport`);
    assert.ok(layout.unit[1]>=-1 && layout.unit[1]+layout.unit[3]<=height+1,'transport also fits');
    assert.ok(layout.slotRatio>.63&&layout.slotRatio<.7,`${width}x${height}: loading slot stays matched to the seated tape`);
    assert.equal(layout.overflow,false,'no horizontal rack scrolling');assert.ok(layout.labelsFit,'titles do not clip');
  }
  assert.equal(await evaluate('document.querySelectorAll(".cassette-deck input, .t-reset").length'),0,'mixer removed');
  const media=await evaluate(`(async()=>{const {st}=review;await st.wake();const before=st.audio.currentTime;
    await new Promise(r=>setTimeout(r,350));await st.startDive();await new Promise(r=>setTimeout(r,700));
    const overlap={main:st.gains.get(st.audio).gain.value,cue:st.gains.get(st.cueAudio).gain.value,playing:!st.audio.paused&&!st.cueAudio.paused,
      graph:st.ctx.state,unlocked:!st.isLocked(11),primed:st.cuePrimed,
      ready:st.cueAudio.readyState,time:st.cueAudio.currentTime,mainAdvanced:st.audio.currentTime>before};
    st.pause();return overlap})()`);
  console.log('REAL MEDIA',JSON.stringify(media));
  assert.ok(media.playing&&media.main>0&&media.cue>0&&media.time>0&&media.mainAdvanced,'two real MP3s play through crossfade');
  assert.equal(media.graph,'running');assert.equal(media.unlocked,true);assert.equal(media.primed,true);
  assert.deepEqual(errors,[],'no browser exceptions');
  console.log('PASS cassette browser layout and real MP3 crossfade');
  if (process.argv.includes('--game')) {
    await send('Emulation.setDeviceMetricsOverride',{width:480,height:320,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:baseUrl+'/?world=expanse2&view=cockpit&intro=off&rain=off&time=day'});
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
    await send('Emulation.setDeviceMetricsOverride',{width:1096,height:636,deviceScaleFactor:1,mobile:false});
    await evaluate(`(()=>{const o=__seoul.orders;if(o.state==='idle')o.offerNow('gimbap')})()`);
    await sleep(250);
    const hudLayout = await evaluate(`(()=>{const order=document.querySelector('#h3order'),map=document.querySelector('#h3minimap');
      const a=order.getBoundingClientRect(),b=map.getBoundingClientRect();return {
        offer:order.classList.contains('show'),mapOpacity:getComputedStyle(map).opacity,
        overlap:Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)),
        clock:document.querySelector('#h3localtime').textContent,
      }})()`);
    assert.equal(hudLayout.offer,true,'desktop offer is visible');
    assert.equal(hudLayout.mapOpacity,'0','the route radar yields while an unaccepted offer owns its space');
    assert.ok(hudLayout.overlap>0,'regression fixture still exercises the former geometric collision');
    assert.match(hudLayout.clock,/\d{2}:\d{2}$/,'upper-right rail carries current local time');
    const hudShot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync('_work/cassette-qa/hud-offer-1096x636.png',Buffer.from(hudShot.data,'base64'));
    const launcher = await evaluate(`(()=>{const e=document.querySelector('#h3audio'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,pointer:getComputedStyle(e).pointerEvents}})()`);
    assert.equal(launcher.pointer,'auto','HUD cassette launcher receives pointer hits');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:launcher.x,y:launcher.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:launcher.x,y:launcher.y,button:'left',clickCount:1});
    assert.equal(await evaluate('document.querySelector(".cassette-deck").classList.contains("show")'),true,'a real HUD cassette pointer click opens player');
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Escape',key:'Escape'});
    await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Escape',key:'Escape'});
    assert.equal(await evaluate('document.querySelector(".ssa-settings").hidden'),true,'closing the deck does not open Settings');
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Escape',key:'Escape'});
    await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Escape',key:'Escape'});
    await evaluate('document.querySelector("[data-open-cassette]").click()');
    assert.equal(await evaluate('document.querySelector(".cassette-deck").classList.contains("show") && document.querySelector(".ssa-settings").hidden'),true,'Settings opens player without stacking');
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Escape',key:'Escape'});
    await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Escape',key:'Escape'});
    console.log('PASS game cassette keyboard/HUD/settings access, offer layout/current time, seven selectable songs, lock and driving pause');
    const nodes=await evaluate(`(()=>{const s=__seoul;s.renderer.setAnimationLoop(null);const root=s.scene;
      return {head:!!root.getObjectByName('hippo_head'),body:!!root.getObjectByName('hippo_body'),wheel:!!root.getObjectByName('steering_wheel'),
      speed:!!root.getObjectByName('needle_speed'),tapes:s.soundtrack.tracks.length}})()`);
    assert.deepEqual(nodes,{head:true,body:true,wheel:true,speed:true,tapes:12});
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await evaluate(`(()=>{const s=__seoul;s.orders.resetSave();s.timeOfDay.update(3);s.orders.setPaused(false);
      s.camera.aspect=1280/800;s.camera.updateProjectionMatrix();s.renderer.setSize(1280,800)})()`);
    for (let count=0;count<=4;count++) {
      const progress=await evaluate(`(()=>{const s=__seoul,o=s.orders;
        if(${count}>0){o.offerNow('hotteok');o._accept();o.completeNow();
          if(o.save.deliveries!==${count}-1)throw new Error('Pickup advanced the day');o.completeNow();}
        const before=s.city.nightRig.params.exposure;s.timeOfDay.update(1.5);
        s.renderer.render(s.scene,s.camera);
        const mid=s.city.nightRig.params.exposure;s.timeOfDay.update(1.5);s.renderer.render(s.scene,s.camera);
        return {count:o.save.deliveries,mode:s.timeOfDay.mode,source:s.timeOfDay.state.source,
          unlocked:!s.soundtrack.isLocked(7),before,mid,after:s.city.nightRig.params.exposure,
          day:document.querySelector('#h3day').textContent,runs:document.querySelector('#h3dayruns').textContent,
          saved:JSON.parse(localStorage.getItem('snack-attack-save')).deliveries}})()`);
      console.log('DELIVERY DAY', JSON.stringify(progress));
      assert.equal(progress.count,count);assert.equal(progress.saved,count);
      assert.equal(progress.mode,['morning','day','dusk','night','morning'][count]);
      assert.equal(progress.source,'deliveries');assert.equal(progress.unlocked,count===4);
      const shot=await send('Page.captureScreenshot',{format:'png'});
      writeFileSync(`_work/cassette-qa/cycle-${count}.png`,Buffer.from(shot.data,'base64'));
    }
    const restored=await evaluate(`(async()=>{const {loadSave}=await import('/src/game/save.js');
      const {Soundtrack}=await import('/src/core/soundtrack.js');const {soundtrackTracks}=await import('/src/game/data/soundtrack.js');
      const save=loadSave(), st=new Soundtrack(soundtrackTracks(),save);st.pause();
      return {deliveries:save.deliveries,reward:!st.isLocked(7),dive:st.isLocked(11)}})()`);
    assert.deepEqual(restored,{deliveries:4,reward:true,dive:true});
    console.log('PASS real delivery completion advances all four phases and persists the day reward');
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await sleep(500);
    await evaluate(`(()=>{document.querySelector('#hud3').style.display='none';const s=__seoul;
      s.camera.aspect=1280/800;s.camera.updateProjectionMatrix();s.renderer.setSize(1280,800);s.renderer.render(s.scene,s.camera)})()`);
    const cabShot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync('_work/cassette-qa/cab-in-game.png',Buffer.from(cabShot.data,'base64'));
    const ramp=await evaluate(`(async()=>{const s=__seoul;const {DIVE_RAMP:r}=await import('/src/world/dive-ramp.js');
      await s.soundtrack.wake();let calls=0;const original=s.soundtrack.startDive.bind(s.soundtrack);
      s.soundtrack.startDive=(...args)=>{calls++;return original(...args)};
      s.phys.place(new s.THREE.Vector3(r.x,1.2,r.approachStartZ+2),0);s.phys.velocity.set(0,0,14);s.phys.step(1/120);
      s.dive.update(.016,s.input);const armed={state:s.dive.state,calls};
      s.phys.position.y=5;s.phys.position.z=r.zEnd+2;s.dive.update(.016,s.input);
      const launched={state:s.dive.state,calls,title:s.soundtrack.currentTrack.title};
      for(let i=0;i<5;i++)s.dive.update(.016,s.input);
      await new Promise(r=>setTimeout(r,500));s.soundtrack.update(.1);
      const discovered=!s.soundtrack.isLocked(11), saved=JSON.parse(localStorage.getItem('snack-attack-save')).unlockedTapes.includes('dive.mp3');
      const overlap=!s.soundtrack.audio.paused&&!s.soundtrack.cueAudio.paused;
      s.phys.velocity.set(0,0,0);s.phys.forwardSpeed=0;s.dive.update(.016,s.input);
      const landed={state:s.dive.state,cueActive:s.soundtrack.cueActive,title:s.soundtrack.currentTrack.title};
      await s.soundtrack.setTrack(11,{autoplay:true});
      return {armed,launched,calls,discovered,saved,overlap,landed,selected:s.soundtrack.index}})()`);
    console.log('GAME RAMP',JSON.stringify(ramp));
    assert.equal(ramp.armed.state,'armed');assert.equal(ramp.armed.calls,0,'approach must not start the song');
    assert.equal(ramp.launched.state,'launched');assert.equal(ramp.launched.title,'Dive');assert.equal(ramp.calls,1,'takeoff fires once');
    assert.ok(ramp.discovered && ramp.saved && ramp.overlap, 'real launch overlaps audio and saves the Dive unlock');
    assert.equal(ramp.landed.state,'surface');assert.equal(ramp.landed.cueActive,false,'returning to land releases the event cue');
    assert.notEqual(ramp.landed.title,'Dive','the selected cassette resumes on land');
    assert.equal(ramp.selected,11,'discovered Dive can be played from the rack');
    assert.deepEqual(errors,[],'game and ramp have no exceptions');
    console.log('PASS game cab nodes and actual armed-to-launched music trigger');
  }
} finally {ws?.close();browser.kill()}
