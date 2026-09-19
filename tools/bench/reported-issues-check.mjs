import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const port = 9900 + Math.floor(Math.random() * 90);
const browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'snack-reported-issues-'))}`,
  'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targets = async () => {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) return response.json();
    } catch { /* Chrome is still starting. */ }
    await sleep(250);
  }
  throw new Error('Chrome DevTools did not start');
};

try {
  const page = (await targets()).find((target) => target.type === 'page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    const timer = setTimeout(() => { pending.delete(messageId); reject(new Error(`Timed out: ${method}`)); }, 60000);
    pending.set(messageId, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
    });
    socket.send(JSON.stringify({ id: messageId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const press = async (code, key) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key });
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 500, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${process.env.SNACK_TEST_URL || 'http://127.0.0.1:5273'}/?world=expanse2&intro=off&rain=off&time=day` });
  for (let i = 0; i < 100; i++) {
    if (await evaluate('!!window.__seoul?.dive && !!document.querySelector("#loading.done")')) break;
    await sleep(500);
  }
  assert.equal(await evaluate('!!window.__seoul?.dive && !!document.querySelector("#loading.done")'), true, 'game boots');

  const launcher = await evaluate(`(()=>{const e=document.querySelector('#h3audio'),r=e.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: launcher.x, y: launcher.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: launcher.x, y: launcher.y, button: 'left', clickCount: 1 });
  for (let i = 0; i < 40; i++) {
    if (await evaluate('!!document.querySelector(".cassette-deck").__deck?.tapeA')) break;
    await sleep(250);
  }
  assert.equal(await evaluate('document.querySelector(".cassette-deck").classList.contains("show")'), true, 'HUD cassette opens');
  await evaluate('__seoul.soundtrack.setTrack(4,{autoplay:true})');
  await sleep(500);
  const colour = await evaluate(`(()=>{const d=document.querySelector('.cassette-deck').__deck,s=__seoul.soundtrack;
    const expected=getComputedStyle(document.querySelectorAll('.tape-card')[s.index]).getPropertyValue('--skin').trim().toLowerCase();
    return {expected,shown:'#'+d._shownTape.userData.trackColourLabel.material.color.getHexString(),
      launcher:'#'+d._launcherTape.userData.trackColourLabel.material.color.getHexString(),shownIndex:d._shownIndex,index:s.index}})()`);
  assert.deepEqual(colour, { expected: '#ff9a3d', shown: '#ff9a3d', launcher: '#ff9a3d', shownIndex: 4, index: 4 });
  mkdirSync('_work/reported-issues', { recursive: true });
  const deckShot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('_work/reported-issues/cassette-colour.png', Buffer.from(deckShot.data, 'base64'));

  await press('Escape', 'Escape');
  assert.notEqual(await evaluate('document.activeElement?.id'), 'h3audio', 'deck close releases HUD cassette focus');
  await press('Space', ' ');
  assert.equal(await evaluate('document.querySelector(".cassette-deck").classList.contains("show")'), false, 'Space handbrake does not reopen deck');
  const hudShot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('_work/reported-issues/hud-cassette-colour.png', Buffer.from(hudShot.data, 'base64'));

  const ramp = await evaluate(`(async()=>{const {DIVE_RAMP:r}=await import('/src/world/dive-ramp.js');
    await __seoul.dive.debugEnter('ramp');const ground=__seoul.city.findGround(r.x,r.stagingZ);
    return {x:__seoul.phys.meshPosition.x,z:__seoul.phys.meshPosition.z,ground:!!ground,distance:r.zStart-r.stagingZ}})()`);
  assert.deepEqual(ramp, { x: 120, z: 87, ground: true, distance: 12 });
  await sleep(750);
  const rampShot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('_work/reported-issues/ramp-teleport.png', Buffer.from(rampShot.data, 'base64'));
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log('PASS cassette focus, playing-track colour, and visible grounded ramp teleport');
  socket.close();
} finally {
  browser.kill();
}
