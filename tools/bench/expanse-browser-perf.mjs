// M6c hardware-aware browser performance probe. Requires dev server on 5273.
// Usage: node tools/bench/expanse-browser-perf.mjs LABEL [--night]
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
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.qaLongTasks=[];new PerformanceObserver(l=>qaLongTasks.push(...l.getEntries().map(e=>({start:e.startTime,ms:e.duration})))).observe({type:"longtask",buffered:true});'});
  const results=[];
  const label=process.argv[2]||'baseline';mkdirSync('_work/m6c',{recursive:true});
  for(const gfx of ['desktop','mobile']) {
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://127.0.0.1:5273/?world=expanse2&intro=off&rain=light&time='+ (process.argv.includes('--night') ? 'night' : 'day') +'&gfx='+gfx});
    for(let i=0;i<180;i++){if(await evaluate('!!window.__seoul?.dive && !!document.querySelector("#loading.done")'))break;await sleep(300)}
    assert.equal(await evaluate('!!window.__seoul?.dive && !!document.querySelector("#loading.done")'),true,'expanse2 boots');
    const boot=await evaluate('performance.now()');await sleep(1500);
    const measurement=await evaluate(`new Promise(resolve=>{const s=__seoul,gl=s.renderer.getContext(),ex=gl.getExtension('WEBGL_debug_renderer_info');const intervals=[],draws=[],tris=[];let last=performance.now();const start=last;
      function sample(now){intervals.push(now-last);last=now;draws.push(s.renderer.info.render.calls);tris.push(s.renderer.info.render.triangles);if(now-start<8000)requestAnimationFrame(sample);else{const sorted=intervals.slice(5).sort((a,b)=>a-b);resolve({gpu:ex?gl.getParameter(ex.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),frames:sorted.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],meanDraws:draws.reduce((a,b)=>a+b,0)/draws.length,maxDraws:Math.max(...draws),maxTris:Math.max(...tris),chunks:s.city.chunkStats,longTasks:qaLongTasks,stats:s.city.stats,loading:s.city.loadingStats||null,streamingPending:s.city.streamingPending,position:s.phys.position.toArray()})}}requestAnimationFrame(sample)})`);
    results.push({gfx,bootMs:boot,...measurement});console.log(JSON.stringify(results.at(-1)));
    const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync('_work/m6c/'+label+'-'+gfx+'.png',Buffer.from(shot.data,'base64'));
  }
  writeFileSync('_work/m6c/'+label+'.json',JSON.stringify({results,errors},null,2));assert.deepEqual(errors,[]);
} finally {ws?.close();browser.kill()}
