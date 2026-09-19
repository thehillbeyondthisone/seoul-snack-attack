// Reproducible in-game Drain/Abyss frames, isolated from the player's save.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = process.env.DIVE_SHOTS || '_work/dive-visual/after';
mkdirSync(out, { recursive: true });
const port = 9836;
const browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'snack-dive-'))}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
try {
  let tabs;
  for (let i=0;i<80;i++) { try { tabs=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break; } catch { await sleep(200); } }
  assert.ok(tabs, 'Chrome launched');
  ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0; const pending=new Map(), errors=[];
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description).join(' '));};
  function send(method,params={}){return new Promise((resolve,reject)=>{const i=++id;
    const timer=setTimeout(()=>reject(new Error(`Timed out: ${method}`)),60000);
    pending.set(i,m=>{clearTimeout(timer);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);});
    ws.send(JSON.stringify({id:i,method,params}));});}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync(path.join(out,`${name}.png`),Buffer.from(r.data,'base64'));console.log(`Captured ${name}`);}
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  const base = process.env.SNACK_TEST_URL || 'http://127.0.0.1:5286/';
  const gfx = process.env.DIVE_GFX || 'desktop';
  await send('Page.navigate',{url:`${base}?intro=off&time=night&rain=off&dive=1&gfx=${gfx}`});
  for(let i=0;i<360;i++){if(await evaluate('!!window.__seoul?.dive?.abyss && !!document.querySelector("#loading.done")').catch(()=>false))break;await sleep(250);}
  assert.ok(await evaluate('!!window.__seoul?.dive?.abyss'),'abyss boots');
  assert.equal(await evaluate('__seoul.scene.environmentIntensity'),.04,'review entry keeps underwater environment');
  await evaluate(`(async()=>{
    const s=window.__seoul;s.renderer.setAnimationLoop(null);
    const {Post}=await import('/src/core/post.js');
    window.qaPost=new Post(s.renderer,s.scene,s.camera);qaPost.setSize(1280,800);
    qaPost.bloom.strength=.9;qaPost.bloom.radius=.7;qaPost.bloom.threshold=.9;
    window.qaRender=()=>qaPost.render(1/60);
    s.van.group.visible=false;
    window.qaView=(pos,aim)=>{s.camera.position.set(...pos);s.camera.up.set(0,1,0);s.camera.lookAt(...aim);s.camera.fov=68;s.camera.updateProjectionMatrix();s.dive.abyss.update(1/60,s.camera);qaRender();};
    const gl=s.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown';
  })()`).then(console.log);
  console.log(await evaluate('JSON.stringify({fog:__seoul.scene.fog,exposure:__seoul.renderer.toneMappingExposure,env:__seoul.scene.environmentIntensity})'));
  if(process.env.DIVE_DIAG) await evaluate(`__seoul.scene.traverse(o=>{if(['abyss_shaft','abyss_jelly_bells','abyss_jelly_tentacles','abyss_snow','abyss_vent_glow','abyss_vent_bubbles'].includes(o.name))o.visible=false;})`);
  await evaluate('qaView([0,-72,165],[12,-124,172])');await shot('abyss-arrival');
  await evaluate('qaView([20,-122,192],[-28,-133,144])');await shot('abyss-floor');
  await evaluate('qaView([25,-118,190],[0,-51,165])');await shot('abyss-exit');
  await evaluate(`(async()=>{const s=__seoul;const {createDrain}=await import('/src/world/the-drain.js');window.qaDrain=createDrain(s.scene);qaDrain.open(new s.THREE.Vector3(120,.02,165),0,s.dive.abyss.arrival.position);s.dive.abyss.setVisible(false);})()`);
  for(const k of [.28,.55,.76,.9]){
    await evaluate(`(()=>{const s=__seoul,d=qaDrain,k=${k};d.update(.5,k);const p=d.pathAt(k);s.camera.position.copy(p.position);d.poseQuaternion(p,s.camera.quaternion);s.camera.quaternion.multiply(new s.THREE.Quaternion().setFromAxisAngle(new s.THREE.Vector3(0,1,0),Math.PI));s.dive.abyss.setVisible(k>=.8);if(k>=.8)s.dive.abyss.update(.1,s.camera);qaRender();})()`);
    await shot(`drain-${Math.round(k*100)}`);
  }
  if (process.env.DIVE_SEQUENCE) {
    await send('Page.navigate',{url:`${base}?intro=off&time=night&rain=off&dive=ramp&gfx=${gfx}`});
    for(let i=0;i<360;i++){if(await evaluate('!!window.__seoul?.dive?.abyss && !!document.querySelector("#loading.done")').catch(()=>false))break;await sleep(250);}
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
    const seen = new Set(); let last = '';
    for(let i=0;i<180;i++) {
      const state=await evaluate('({state:__seoul.dive.state,y:__seoul.dive.physics.position.y})');
      if(state.state!==last){console.log(state);last=state.state;}
      const frame=state.state==='descending' ? (state.y<-50?'cab-breakthrough':state.y<-24?'cab-drain':null)
        : ['caught','arriving','abyss'].includes(state.state)?`sequence-${state.state}`:null;
      if(frame && !seen.has(frame)){await shot(frame);seen.add(frame);}
      if(state.state==='abyss')break;
      await sleep(150);
    }
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
    assert.ok(seen.has('sequence-caught') && seen.has('sequence-abyss'),'real ramp reaches whirlpool then abyss');
    assert.equal(await evaluate('__seoul.scene.environmentIntensity'),.04,'surface lighting stays out');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#h3dive")).display'),'grid','depth readout visible');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#h3legend")).display'),'none','driving instructions hidden');
    await evaluate('__seoul.dive.submarine.place(new __seoul.THREE.Vector3(15,-114,190),Math.PI*.95)');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'c',code:'KeyC',windowsVirtualKeyCode:67});
    await sleep(100);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'c',code:'KeyC',windowsVirtualKeyCode:67});
    await sleep(2000);await shot('abyss-chase');
    assert.equal(await evaluate('__seoul.dive.submarine.params.cameraDist'),7.5,'sub retains pocha chase framing');
    await evaluate('__seoul.dive.submarine.position.set(0,-50,165);__seoul.dive.submarine.velocity.set(0,2,0)');
    const returned = new Set();
    for(let i=0;i<100;i++) {
      const state=await evaluate('__seoul.dive.state');returned.add(state);
      if(state==='surface')break;await sleep(150);
    }
    assert.ok(returned.has('returning') && returned.has('spat') && returned.has('surface'),'return sequence completes');
    assert.equal(await evaluate('__seoul.scene.environmentIntensity'),.95,'surface environment restored');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#h3dive")).display'),'none','depth readout clears on return');
    await shot('returned-surface');
    console.log('PASS actual ramp, cockpit reveal, chase view, depth HUD and return to surface');
  }
  if (process.env.DIVE_TOUCH) {
    await send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
    await send('Page.navigate',{url:`${base}?intro=off&time=night&rain=off&dive=1&gfx=mobile&touch=on`});
    for(let i=0;i<360;i++){if(await evaluate('!!window.__seoul?.dive?.abyss && !!document.querySelector("#loading.done")').catch(()=>false))break;await sleep(250);}
    for (const [width,height] of [[844,390],[390,844],[568,240],[320,568]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
      await sleep(300);
      const issues=await evaluate(`(()=>{
        const a=document.querySelector('#h3dive').getBoundingClientRect(),bad=[];
        if(a.left<0||a.top<0||a.right>innerWidth||a.bottom>innerHeight)bad.push('depth outside viewport');
        for(const e of document.querySelectorAll('#touch-controls button,#hud3 .settings-status,#hud3 .audio-status')){
          if(!e.getClientRects().length||getComputedStyle(e).display==='none')continue;
          const b=e.getBoundingClientRect();
          if(Math.min(a.right,b.right)>Math.max(a.left,b.left)+2&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+2)bad.push('depth overlaps '+e.id);
        }return bad;
      })()`);
      assert.deepEqual(issues,[],`underwater HUD ${width}x${height}`);
      await shot(`touch-${width}x${height}`);
    }
    console.log('PASS underwater depth HUD across four touch viewports');
  }
  assert.deepEqual(errors,[],'no renderer/runtime errors');
  writeFileSync(path.join(out,'result.json'),JSON.stringify({errors},null,2));
  console.log('PASS Drain and Abyss rendered without errors');
} finally {ws?.close();browser.kill();}
