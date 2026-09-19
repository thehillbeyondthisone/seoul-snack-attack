// Verify the entire food catalog finishes asynchronous compilation and GPU upload.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

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


 await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.foodWarmLog=[];for(const key of ['debug','log','warn']){const original=console[key];console[key]=function(...args){if(String(args[0]).startsWith('food '))foodWarmLog.push(args.join(' '));return original.apply(this,args);}}"});
 await send('Page.navigate',{url:base+'?world=pilot&building=street-assembly&intro=off&time=dusk&rain=off&props=off'});await ready('!!document.querySelector("#loading.done")');
 await ready("foodWarmLog.some(s=>s.includes('models GPU-ready'))");const log=await ev('foodWarmLog');assert.ok(!log.some(s=>s.includes('failed')));assert.deepEqual(errors,[]);console.log(log);console.log('PASS all food warmup models completed without shader/runtime errors');
}finally{ws?.close();browser.kill();}
