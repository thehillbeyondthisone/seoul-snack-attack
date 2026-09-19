// Real-browser gate for the three-shop delivery loop in the building assembly.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.SNACK_TEST_URL || 'http://127.0.0.1:5273/';
// A random private port avoids attaching to a stale Chrome left by an aborted
// local probe; the temporary profile keeps this run isolated as well.
const port = 9900 + Math.floor(Math.random() * 90);
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'snack-street-delivery-'))}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;

try {
  let tabs;
  for (let i = 0; i < 70; i++) {
    try {
      tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })).json();
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
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((arg) => arg.value || arg.description).join(' '));
    }
  };
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => reject(new Error(`${method} timeout`)), 60000);
      pending.set(requestId, (message) => {
        clearTimeout(timer);
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
      });
      ws.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `${base}?world=pilot&building=street-assembly&intro=off&props=off` });
  for (let i = 0; i < 300; i++) {
    if (await evaluate('!!window.__seoul?.city?.metadata?.assembly && !!document.querySelector("#loading.done")').catch(() => false)) break;
    if (i === 299) throw new Error(`Snack Street did not become ready: ${errors.join('\n')}`);
    await sleep(200);
  }

  const result = await evaluate(`(async()=>{
    const game=window.__seoul,orders=game.orders,city=game.city;
    const ids=orders.restaurants.map(r=>r.id),sites=city.pickupSites.map(s=>({id:s.id,buildingId:s.buildingId,assetId:s.assetId,point:s.point.toArray()}));
    const routes=[];
    for(const restaurant of orders.restaurants){
      const order=orders._makeOrder(restaurant.id);
      routes.push({from:restaurant.id,to:order.dropoffAnchor.restaurantId,distance:order.route?.distance||order.dist});
    }
    const input={pressed:()=>false};
    const before=orders.save.deliveries;
    const completed=[];
    for(const restaurantId of ids){
      orders.offerNow(restaurantId);orders._accept();orders.teleportPickup();
      for(let i=0;i<190;i++)orders.update(1/60,input);
      const picked=orders.state==='delivering';
      const destination=orders.order?.dropoffAnchor?.restaurantId;
      orders.teleportDropoff();
      for(let i=0;i<190;i++)orders.update(1/60,input);
      completed.push({restaurantId,destination,picked,finished:orders.state==='idle'});
    }
    return{ids,sites,routes,completed,deliveryGain:orders.save.deliveries-before,roster:city.restaurantRoster,minDistance:city.orderMinRouteDistance};
  })()`);

  assert.deepEqual(result.ids, ['patchwork-pocha', 'moon-hotteok', 'cloud-dumpling']);
  assert.equal(result.roster, 'snack-street');
  assert.equal(result.minDistance, 10);
  assert.deepEqual(result.sites.map((site) => site.assetId), result.ids);
  assert.equal(new Set(result.sites.map((site) => site.buildingId)).size, 3);
  assert.ok(result.routes.every((route) => route.to && route.to !== route.from && route.distance >= 10));
  assert.ok(result.completed.every((leg) => leg.picked && leg.finished && leg.destination !== leg.restaurantId));
  assert.equal(result.deliveryGain, 3);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(result, null, 2));
  console.log('PASS three named shops route and complete real pickup/drop-off dwell loops');
} finally {
  ws?.close();
  browser.kill();
}
