// Real-browser smoke check for the backtick menu and its first tour action.
// Requires the game server at SNACK_TEST_URL (default http://127.0.0.1:5273/).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const port = 9852;
const base = process.env.SNACK_TEST_URL || 'http://127.0.0.1:5273/';
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'snack-tour-'))}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;
try {
  let tabs;
  for (let i = 0; i < 70; i++) {
    try {
      tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1500),
      })).json();
      break;
    } catch { await sleep(200); }
  }
  assert.ok(tabs, 'Chrome launched');
  ws = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    const timer = setTimeout(() => reject(new Error(`${method} timeout`)), 60000);
    pending.set(messageId, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const ready = async (expression) => {
    for (let i = 0; i < 300; i++) {
      if (await evaluate(expression).catch(() => false)) return;
      await sleep(200);
    }
    throw new Error(`Page did not become ready: ${expression}`);
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `${base}?world=proc&intro=off&props=off&rain=off` });
  await ready('!!window.__seoul?.debug && !!document.querySelector("#loading.done")');
  const menu = await evaluate(`(() => {
    const debug = window.__seoul.debug;
    debug.toggle();
    const tour = debug.gui.folders[0];
    return {
      visible: debug.visible,
      folders: debug.gui.folders.map((folder) => folder._title),
      tourOpen: !tour._closed,
      actions: tour.controllers.map((controller) => controller._name),
      accent: tour.controllers[0].domElement.style.borderLeft,
    };
  })()`);
  assert.equal(menu.visible, true);
  assert.equal(menu.folders[0], '야식 투어 · Night tour');
  assert.equal(menu.tourOpen, true);
  assert.equal(menu.actions[0], '스낵 스트리트 운전 · Drive Snack Street');
  assert.match(menu.accent, /rgb\(63, 210, 230\)|#3fd2e6/i);

  await evaluate(`(() => {
    const controller = window.__seoul.debug.gui.folders[0].controllers[0];
    controller.object[controller.property]();
  })()`);
  await ready(`location.search === '?world=pilot&building=street-assembly&intro=off&props=off'
    && !!window.__seoul?.city?.metadata?.assembly
    && !!document.querySelector('#loading.done')`);
  assert.deepEqual(errors, [], 'no runtime errors');
  console.log('PASS  Night tour is first, open, cyan, and bilingual');
  console.log('PASS  first action navigates to the driveable Snack Street assembly');
} finally {
  ws?.close();
  browser.kill();
}
