// Drive the dev build in headless Chrome and report what it actually did.
// Usage: node tools/probe.mjs "<url>" [seconds] [--shot out.png] [--drive]
//
// Screenshots alone cannot tell you why something did not appear. This attaches
// over the DevTools protocol so console output, exceptions and live scene state
// come back with the picture.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [, , url = 'http://localhost:5173/?stats=1', secsArg = '12', ...rest] = process.argv;
const secs = Number(secsArg) || 12;
const shotIdx = rest.indexOf('--shot');
const shot = shotIdx >= 0 ? rest[shotIdx + 1] : null;
const drive = rest.includes('--drive');
// Software rendering is the bottleneck here, not the app. Shrink the viewport
// when you only want state back — SwiftShader cost scales with pixels, and a
// saturated main thread makes even a fetch take 20 s.
const sizeIdx = rest.indexOf('--size');
const size = sizeIdx >= 0 ? rest[sizeIdx + 1] : '1400,800';

const CHROME = process.env.CHROME_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9222 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(path.join(tmpdir(), 'seoul-probe-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  `--window-size=${size}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (r.ok) return r.json();
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('chrome devtools never came up');
}

const list = await targets();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });

let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`[${msg.params.type}] ${msg.params.args.map(fmt).join(' ')}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push(`[EXCEPTION] ${d.exception?.description || d.text}`);
  }
};
const fmt = (a) => (a.value !== undefined ? a.value : a.description ?? a.type);
const send = (method, params = {}) => new Promise((res) => {
  const n = ++id;
  pending.set(n, res);
  ws.send(JSON.stringify({ id: n, method, params }));
});

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await send('Page.navigate', { url });

// Real time, not virtual: the render loop must actually run for physics to tick.
await sleep(secs * 1000);

if (drive) {
  // Hold throttle for a few seconds so the van goes and hits something.
  for (const type of ['keyDown', 'keyUp']) {
    if (type === 'keyUp') await sleep(6000);
    await send('Input.dispatchKeyEvent', {
      type, key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87,
    });
  }
  await sleep(2500);
}

// --exec "<js>" runs in the page just before the screenshot: open a menu, move
// the camera, force a state. Anything you'd type into the console.
const execIdx = rest.indexOf('--exec');
if (execIdx >= 0) {
  const r = await send('Runtime.evaluate', { expression: rest[execIdx + 1], awaitPromise: true });
  if (r.result?.exceptionDetails) console.log('[--exec threw]', JSON.stringify(r.result.exceptionDetails));
  await sleep(3000);
}

const probe = await send('Runtime.evaluate', {
  expression: `(() => {
    const s = window.__seoul;
    if (!s) return JSON.stringify({ error: 'no __seoul (still loading or boot failed)' });
    const r = s.renderer.info.render;
    return JSON.stringify({
      tiles: s.city.grid.count,
      tilesDrawn: s.city.tiles.filter(t => t.root.visible).length,
      bounds: [ +(s.city.bounds.max.x - s.city.bounds.min.x).toFixed(1),
                +(s.city.bounds.max.z - s.city.bounds.min.z).toFixed(1) ],
      killY: +s.city.killY.toFixed(2),
      points: s.city.points.length,
      draws: r.calls, tris: r.triangles,
      pointLights: s.scene.children.filter(o => o.isPointLight).length,
      van: [ +s.phys.meshPosition.x.toFixed(1), +s.phys.meshPosition.y.toFixed(2), +s.phys.meshPosition.z.toFixed(1) ],
      speedKmh: +s.phys.speedKmh.toFixed(1),
      grounded: s.phys.groundedWheels,
      playerMode: s.player?.mode || 'driving',
      locomotion: s.player?.state || 'driving',
      player: s.player ? [ +s.player.activePosition.x.toFixed(1),
                           +s.player.activePosition.y.toFixed(2),
                           +s.player.activePosition.z.toFixed(1) ] : null,
      playerGrounded: s.player?.isDriving ? null : !!s.player?.grounded,
      props: s.props ? s.props.stats : null,
      awake: s.props ? s.props.world.awakeCount : null,
      movedProps: s.props ? s.props.placements.filter(p => p.handle &&
        s.props.world.getPose(p.handle).position.distanceTo(p.position) > 0.35).length : null,
    });
  })()`,
  returnByValue: true,
});

if (shot) {
  const img = await send('Page.captureScreenshot', { format: 'png' });
  if (img.result?.data) writeFileSync(shot, Buffer.from(img.result.data, 'base64'));
}

console.log('--- console ---');
for (const l of logs.slice(-40)) console.log(l);
console.log('--- state ---');
console.log(probe.result?.result?.value ?? JSON.stringify(probe));

ws.close();
chrome.kill();
process.exit(0);
