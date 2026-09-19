import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const baseUrl = process.env.SNACK_TEST_URL || 'http://127.0.0.1:5273';
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
mkdirSync('_work/mobile-ui', {recursive:true});
try {
const page = await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const errors = [];
page.on('pageerror', e=>errors.push(String(e)));
const ready = async () => {
 await page.waitForFunction(()=>document.querySelector('#loading.done'),null,{timeout:180000});
 await page.waitForTimeout(700);
};
const matrix = [[844,390],[667,375],[844,320],[667,280],[568,240],[390,844],[375,667],[320,568],[1024,768]];
async function layout(phase, screenshots=true) {
 for (const [width,height] of matrix) {
  await page.setViewportSize({width,height});
  await page.waitForTimeout(180);
  const issues=await page.evaluate(()=>{
   const selector='#touch-controls button,#touch-controls .touch-stick,#hud3 .settings-status,#hud3 .audio-status,#hud3 .order.show,#hud3 .ticket.show,#hud3 .minimap.show,#hud3 .rail,#hud3 .speed';
   const boxes=[...document.querySelectorAll(selector)].filter(e=>e.getClientRects().length).map(e=>({name:e.id||e.className,r:e.getBoundingClientRect()}));
   const out=[];
   for(const {name,r} of boxes) if(r.x<0||r.y<0||r.right>innerWidth+1||r.bottom>innerHeight+1) out.push('outside viewport: '+name);
   for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];
    if(Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>2 && Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>2) out.push('overlap: '+a.name+' / '+b.name);
   }
   for(const b of boxes.filter(b=>b.name.includes('touch-action')||b.name==='h3audio'||b.name==='h3settingsstatus')) if(b.r.width<44||b.r.height<44) out.push('small target: '+b.name);
   if(document.documentElement.scrollWidth>innerWidth) out.push('page overflow');
   return out;
  });
  if(issues.length) await page.screenshot({path:`_work/mobile-ui/failure-${phase}-${width}x${height}.png`});
  assert.deepEqual(issues,[],`${phase} ${width}x${height}`);
  if(screenshots) await page.screenshot({path:`_work/mobile-ui/${phase}-${width}x${height}.png`});
 }
 await page.setViewportSize({width:844,height:390});
}
await page.goto(baseUrl+'/?touch=on&gfx=mobile&intro=off&offer=1&restaurant=hotteok');
await ready();
await page.evaluate(()=>window.__seoul.orders.paused=true);
assert.equal(await page.locator('.touch-toggle,.touch-action.handbrake,.touch-action.view,.touch-action.camAngle').count(),0);
assert.equal(await page.locator('#h3garagestatus').isVisible(),false);
await layout('offer');
await page.locator('.translate').tap();
await page.waitForFunction(()=>document.querySelector('#hud3.english-mode'));
assert.equal(await page.locator('.translate').getAttribute('aria-pressed'),'true');
await page.evaluate(()=>window.__seoul.orders.paused=false);
await page.locator('#hud3 .order').tap();
await page.waitForFunction(()=>window.__seoul.orders.state === 'toPickup');
await page.waitForFunction(()=>document.querySelector('#h3obj.show'));
await page.evaluate(()=>window.__seoul.orders.paused=true);
await layout('pickup');
console.log('PASS offers and compact pickup cards: nine portrait / landscape viewports, no overlaps, 44px targets');
// Real simultaneous touch contacts, interruption and fresh input.
await page.evaluate(()=>window.__seoul.orders.paused=false);
const cdp = await page.context().newCDPSession(page);
const drive = await page.locator('.touch-stick.drive').boundingBox();
const steer = await page.locator('.touch-stick.steer').boundingBox();
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:drive.x+drive.width/2,y:drive.y+drive.height/2-40,id:1},{x:steer.x+steer.width/2+35,y:steer.y+steer.height/2,id:2}]});
assert(await page.evaluate(()=>window.__seoul.input.actionValue('throttle')>.8 && window.__seoul.input.steerAxis()>.6));
await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
assert(await page.evaluate(()=>window.__seoul.input.actionValue('throttle')===0 && window.__seoul.input.steerAxis()===0));
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
// A utility tap must remain independent while the drive stick owns pointer 1.
// This used to rely on a synthetic click, which mobile browsers may suppress
// during a multi-touch gesture.
await page.locator('.translate').tap();
await page.waitForFunction(()=>!document.querySelector('#hud3.english-mode'));
const language = await page.locator('.translate').boundingBox();
const heldDrive = {x:drive.x+drive.width/2,y:drive.y+drive.height/2-40,id:1};
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[heldDrive]});
await page.evaluate(({x,y})=>{
 const button=document.querySelector('.translate');
 // CDP requires an empty touch list for touchEnd, so synthesize only the
 // second pointer while its first, real touch remains held on the drive pad.
 button.setPointerCapture=()=>{};
 const init={bubbles:true,cancelable:true,pointerId:2,pointerType:'touch',clientX:x,clientY:y};
 button.dispatchEvent(new PointerEvent('pointerdown',init));
 button.dispatchEvent(new PointerEvent('pointerup',init));
 delete button.setPointerCapture;
},{x:language.x+language.width/2,y:language.y+language.height/2});
await page.waitForFunction(()=>document.querySelector('#hud3.english-mode') && window.__seoul.input.actionValue('throttle')>.8);
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
// Browser zoom / selection: actual double taps and pinch, plus Safari gesture prevention.
const scale=await page.evaluate(()=>visualViewport.scale);
for(let i=0;i<2;i++) await page.locator('.translate').tap();
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:390,y:190,id:1},{x:440,y:190,id:2}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:340,y:190,id:1},{x:490,y:190,id:2}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
assert.equal(await page.evaluate(()=>visualViewport.scale),scale,'tap / pinch never changes page scale');
assert(await page.evaluate(()=>{
 const e=new Event('gesturestart',{bubbles:true,cancelable:true});document.dispatchEvent(e);
 return e.defaultPrevented && getComputedStyle(document.querySelector('#h3settingsstatus')).userSelect==='none' && !getSelection().toString();
}),'Safari gesture prevention and non-selectable button text');
await page.locator('.touch-action.map').tap();
await page.waitForFunction(()=>window.__seoul.cityMap.isOpen);
assert(await page.evaluate(()=>window.__seoul.input.touch.suspended));
await page.screenshot({path:'_work/mobile-ui/map.png'});
await page.locator('.ssa-city-map__close').tap();
await page.locator('#h3settingsstatus').tap();
assert.equal(await page.locator('[data-open-garage] span').textContent(),'OPEN GARAGE','English stays enabled in paused settings');
await page.screenshot({path:'_work/mobile-ui/settings.png'});
await page.locator('[data-open-garage]').tap();
await page.waitForFunction(()=>document.querySelector('#h3garage.show'));
assert(await page.evaluate(()=>window.__seoul.input.touch.suspended && window.__seoul.orders.paused),'settings to garage preserves pause');
await page.screenshot({path:'_work/mobile-ui/garage.png'});
await page.locator('#h3garageclose').tap();
await page.locator('#h3settingsstatus').tap();
await page.locator('[data-touch-preference=off]').tap();
assert(await page.evaluate(()=>!window.__seoul.input.touch.enabled));
await page.locator('[data-touch-preference=on]').tap();
assert(await page.evaluate(()=>window.__seoul.input.touch.enabled && window.__seoul.input.touch.suspended));
await page.locator('[data-camera-action=view]').tap();
await page.locator('#h3settingsstatus').tap();
await page.locator('[data-camera-action=angle]').tap();
await page.locator('#h3audio').tap();
await page.waitForTimeout(600);
await page.screenshot({path:'_work/mobile-ui/cassette.png'});
await page.locator('.cassette-deck .t-mute').tap();
await page.evaluate(()=>document.querySelector('.cassette-deck').__deck.toggle());
await page.waitForTimeout(400);
await page.evaluate(()=>window.__seoul.orders.teleportPickup());
await page.waitForFunction(()=>window.__seoul.orders.state==='delivering',null,{timeout:20000});
await page.evaluate(()=>window.__seoul.orders.paused=true);
await layout('delivery');
await page.evaluate(()=>{window.__seoul.orders.paused=false;window.__seoul.orders.teleportDropoff()});
await page.waitForFunction(()=>window.__seoul.orders.state==='idle',null,{timeout:20000});
console.log('PASS multi-touch, zoom prevention, translation, settings / garage / camera / cassette, delivery dwell and payout');
await page.locator('.touch-action.interact').tap();
await page.waitForFunction(()=>window.__seoul.player.mode==='onFoot');
assert(await page.locator('.touch-action.jump').isVisible());
assert(await page.locator('.touch-action.sprint').isVisible());
await layout('foot',false);
await page.addStyleTag({content:'#touch-controls,#hud3 { inset: 0 59px 21px !important; }'});
assert(await page.evaluate(()=>[...document.querySelectorAll('#touch-controls button')].filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.left>=59&&r.right<=785&&r.bottom<=369;})),'simulated iPhone safe area');
await page.evaluate(async()=>{window.__seoul.player.beginEnterVehicle(); await window.__seoul.dive.debugEnter('abyss');});
await page.waitForFunction(()=>window.__seoul.input.touch.submerged);
assert(await page.locator('.touch-action.ascend').isVisible());
assert.equal(await page.locator('.touch-action.sprint').getAttribute('aria-label'),'Dive');
await page.locator('.touch-action.reset').tap();
await page.locator('#h3settingsstatus').tap();
const before = await page.evaluate(()=>window.__seoul.dive.physics.position.toArray());
await page.waitForTimeout(300);
assert.deepEqual(await page.evaluate(()=>window.__seoul.dive.physics.position.toArray()),before,'submarine pauses in settings');
await page.locator('.ssa-settings__close').tap();
await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
assert(await page.evaluate(()=>window.__seoul.input.touch.suspended && window.__seoul.orders.paused));
await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
assert(await page.evaluate(()=>!window.__seoul.input.touch.suspended && !window.__seoul.orders.paused));
console.log('PASS on-foot layouts, underwater controls, safe areas and page lifecycle recovery');
await page.goto(baseUrl+'/?touch=on&gfx=mobile&intro=on');
await ready();
assert(await page.evaluate(()=>window.__seoul.input.touch.english),'language preference survives reload');
await page.locator('#h3start').tap();
assert(await page.evaluate(()=>!window.__seoul.input.touch.suspended));
// Menu scrolling, close buttons and widths in the tightest phone layouts.
for(const [width,height] of [[320,568],[568,240],[390,844]]) {
 await page.setViewportSize({width,height});
 await page.locator('#h3settingsstatus').tap();
 const dialog=await page.locator('.ssa-settings__dialog').boundingBox();
 assert(dialog.x>=0 && dialog.y>=0 && dialog.x+dialog.width<=width && dialog.y+dialog.height<=height);
 await page.locator('[data-touch-preference=auto]').tap();
 await page.locator('[data-open-garage]').tap();
 await page.waitForTimeout(250);
 const garage=await page.locator('#h3garage').boundingBox();
 assert(garage.x>=0 && garage.y>=0 && garage.x+garage.width<=width && garage.y+garage.height<=height);
 assert.equal(await page.locator('#h3settingsstatus').isVisible(),false,'HUD utilities stay behind the garage');
 await page.screenshot({path:`_work/mobile-ui/garage-${width}x${height}.png`});
 await page.locator('#h3garageclose').tap();
 await page.locator('.touch-action.map').tap();
 await page.waitForFunction(()=>window.__seoul.cityMap.isOpen);
 const map=await page.locator('.ssa-city-map__dialog').boundingBox();
 assert(map.x>=0 && map.y>=0 && map.x+map.width<=width && map.y+map.height<=height);
 await page.locator('.ssa-city-map__close').tap();
}
// A clean page with no earlier taps: the first forward-stick contact must wake
// both the soundtrack and procedural vehicle audio under the normal autoplay
// policy used by this probe.
const firstDrive=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
await firstDrive.goto(baseUrl+'/?touch=on&gfx=mobile&intro=off&world=proc');
await firstDrive.waitForFunction(()=>document.querySelector('#loading.done'),null,{timeout:180000});
const firstPad=await firstDrive.locator('.touch-stick.drive').boundingBox();
const firstCdp=await firstDrive.context().newCDPSession(firstDrive);
await firstCdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:firstPad.x+firstPad.width/2,y:firstPad.y+firstPad.height/2-40,id:1}]});
await firstDrive.waitForFunction(()=>__seoul.input.actionValue('throttle')>.8 && __seoul.soundtrack.started && __seoul.audio.started);
await firstCdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await firstDrive.close();
console.log('PASS first forward-stick gesture starts soundtrack and vehicle audio');
// Desktop retains its keyboard controls and native Settings button activation.
const desktop=await browser.newPage({viewport:{width:1280,height:800}});
desktop.on('pageerror',e=>errors.push(String(e)));
await desktop.goto(baseUrl+'/?intro=off&gfx=mobile&world=proc');
await desktop.waitForFunction(()=>document.querySelector('#loading.done'),null,{timeout:180000});
assert.equal(await desktop.locator('#touch-controls').isVisible(),false);
await desktop.locator('#h3settingsstatus').focus();
await desktop.keyboard.press('Enter');
assert(await desktop.locator('.ssa-settings').isVisible());
await desktop.locator('[data-open-garage]').click();
await desktop.waitForFunction(()=>document.querySelector('#h3garage.show'));
await desktop.keyboard.press('Escape');
await desktop.keyboard.down('t');
await desktop.waitForFunction(()=>document.querySelector('#hud3.english-mode'));
await desktop.keyboard.up('t');
await desktop.waitForFunction(()=>!document.querySelector('#hud3.english-mode'));
await desktop.screenshot({path:'_work/mobile-ui/desktop.png'});
await desktop.close();
assert.deepEqual(errors,[],'no browser runtime exceptions');
console.log('PASS onboarding, saved language, small-screen menus, desktop controls and no runtime errors');
} finally { await browser.close(); }
