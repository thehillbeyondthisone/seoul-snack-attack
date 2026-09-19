import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
};
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
};

const playOrder = [];
class FakeAudio {
  constructor(url) {
    this.src = url;
    this.paused = true;
    this.volume = 1;
    this.muted = false;
    this.playCalls = 0;
    this.readyState = 4;
    this.currentTime = 0;
    this.events = new Map();
  }
  addEventListener(name, fn) {
    if (!this.events.has(name)) this.events.set(name, []);
    this.events.get(name).push(fn);
  }
  emit(name) { for (const fn of this.events.get(name) || []) fn(); }
  load() {}
  pause() { this.paused = true; }
  play() {
    this.playCalls++;
    playOrder.push(this.src);
    return new Promise((resolve) => {
      this.finishPlay = () => {
        this.paused = false;
        resolve();
      };
    });
  }
}
globalThis.Audio = FakeAudio;

const { Soundtrack } = await import('../../src/core/soundtrack.js');
const { AudioManager } = await import('../../src/core/audio.js');

values.set('seoul-delivery-track', '2');
const soundtrack = new Soundtrack([
  { url: 'budae.mp3', title: 'BUDAE' },
  { url: 'track.mp3', title: 'Track' },
]);
assert.equal(soundtrack.index, 0, 'a changed playlist starts on its first track');
assert.equal(soundtrack.audio.src, 'budae.mp3', 'BUDAE is the opening track');
assert.equal(soundtrack.audio.volume, 0.42, 'missing music setting uses an audible default');

const firstPlay = soundtrack.play();
const forcedRetry = soundtrack.play({ force: true });
assert.equal(soundtrack.audio.playCalls, 1, 'pending playback is not started twice');
soundtrack.audio.finishPlay();
assert.equal(await firstPlay, true);
assert.equal(await forcedRetry, true);

values.clear();
const audio = new AudioManager();
assert.equal(audio.masterLevel, 0.8, 'missing master setting uses an audible default');
assert.equal(audio.sfxLevel, 0.62, 'missing effects setting uses an audible default');
assert.equal(audio.ambienceLevel, 0.22, 'missing ambience setting uses an audible default');

values.clear();
values.set('snack-attack-master', '0');
values.set('snack-attack-sfx', '0');
values.set('snack-attack-ambience', '0');
const recovered = new AudioManager();
assert.equal(recovered.masterLevel, 0.8, 'legacy all-zero master setting recovers');
assert.equal(recovered.sfxLevel, 0.62, 'legacy all-zero effects setting recovers');
assert.equal(recovered.ambienceLevel, 0.22, 'retired mixer restores the fixed ambience balance');

console.log('PASS  audio defaults are audible');
console.log('PASS  changed playlist starts with BUDAE');
console.log('PASS  pending music playback stays single-flight');
console.log('PASS  legacy all-zero mixer settings recover');

// The real catalog and files: every rack entry resolves, with no event cue in it.
const { SOUNDTRACK, soundtrackTracks, diveTrack } = await import('../../src/game/data/soundtrack.js');
const { existsSync } = await import('node:fs');
assert.equal(SOUNDTRACK.length, 12);
assert.equal(SOUNDTRACK.filter((t) => t.unlockDeliveries).length, 4);
assert.equal(SOUNDTRACK.find((t) => t.file === 'dive.mp3').unlockEvent, 'dive');
for (const t of [...SOUNDTRACK, { file: 'dive.mp3' }]) assert.ok(existsSync(new URL(`../../public/audio/music/${t.file}`, import.meta.url)), t.file);
assert.equal(soundtrackTracks('/play/')[0].url, '/play/audio/music/budae-sizzle-hot.mp3');

values.clear();
const st = new Soundtrack(soundtrackTracks(), { diveTrack: diveTrack() });
st.pause();
assert.equal(st.tracks.filter((_, i) => !st.isLocked(i)).length, 7);
assert.equal(await st.setTrack(7), false, 'direct selection cannot bypass a delivery lock');
assert.equal(await st.setTrack(-1), false, 'invalid selection cannot reach the tail');
await st.setTrack(6);
await st.next(); assert.equal(st.index, 0, 'next skips every locked cassette');
await st.previous(); assert.equal(st.index, 6, 'previous skips locks in reverse');
for (const [n, title] of [[4, 'Abyssal Ramen Submarine'], [8, 'Blade of Hatred'], [12, 'Rapid-fire'], [16, 'Supersonic']]) {
  assert.equal(st.setDeliveries(n)[0].title, title);
  assert.deepEqual(st.setDeliveries(n), [], 'milestone does not unlock twice');
}
await st.setTrack(10);
const restored = new Soundtrack(soundtrackTracks(), { deliveries: 16 });
assert.equal(restored.index, 10, 'unlocked selection restores');
const fresh = new Soundtrack(soundtrackTracks(), { deliveries: 0 });
assert.equal(fresh.index, 0, 'old saved selection cannot bypass progression');
st.setDeliveries(0); assert.equal(st.index, 0, 'save reset relocks and ejects a bonus tape');
assert.equal(st.isLocked(11), true, 'Dive starts locked even after delivery rewards');
let diveAwards = 0;
st.onUnlock = () => diveAwards++;

const run = st.resume(); st.audio.finishPlay(); assert.equal(await run, true);
st.audio.currentTime = 23;
const dive = st.startDive();
assert.equal(st.cueAudio.volume, 0, 'incoming Dive starts silent');
assert.equal(st.currentTrack.title, 'Dive');
const cueCalls = st.cueAudio.playCalls;
assert.equal(await st.startDive(), false, 'multiple ramp ticks do not restart Dive');
assert.equal(st.cueAudio.playCalls, cueCalls);
st.cueAudio.finishPlay(); assert.equal(await dive, true);
for (let i = 0; i < 8; i++) st.update(.1);
assert.equal(st.isLocked(11), false, 'playing the Drain cue unlocks its rack cassette');
assert.equal(diveAwards, 1, 'Dive is awarded exactly once');
const diveReload = new Soundtrack(soundtrackTracks(), { unlockedTapes: [...st.unlockedTapes] });
assert.equal(diveReload.isLocked(11), false, 'Dive discovery restores independently of deliveries');
const half = Math.SQRT1_2 * st.volume;
assert.ok(Math.abs(st.audio.volume - half) < 1e-6);
assert.ok(Math.abs(st.cueAudio.volume - half) < 1e-6, 'equal-power overlap at midpoint');
st.pause(); const frozen = st.mix; st.update(.1); assert.equal(st.mix, frozen);
const resumeCue = st.resume(); st.cueAudio.finishPlay(); await resumeCue;
st.audio.finishPlay(); await Promise.resolve();
const mixer = new AudioManager({ music: st });
mixer.setMasterVolume(.5); st.setVolume(.6);
assert.ok(Math.abs(st.cueAudio.volume - .3 * Math.SQRT1_2) < 1e-6, 'both gains follow the mix during overlap');
mixer.toggleMute(); assert.ok(st.audio.muted && st.cueAudio.muted);
mixer.toggleMute(); assert.ok(!st.audio.muted && !st.cueAudio.muted);
for (let i = 0; i < 9; i++) st.update(.1);
assert.equal(st.mix, 1); assert.equal(st.audio.paused, true);
assert.equal(st.audio.currentTime, 23, 'outgoing cassette retains its position');
const back = st.endCue(); st.audio.finishPlay(); await back;
for (let i = 0; i < 13; i++) st.update(.1);
assert.equal(st.mix, 0); assert.equal(st.cueAudio.paused, true);
assert.equal(st.currentTrack.title, 'BUDAE (Sizzle Hot)');
const again = st.startDive(); st.cueAudio.finishPlay(); await again;
assert.equal(st.cueAudio.currentTime, 0, 'a later jump starts Dive from the beginning');
const override = st.setTrack(1, { autoplay: false }); st.audio.finishPlay(); await override;
assert.equal(st.cueActive, false, 'choosing a cassette cancels the event');
console.log('PASS  twelve tapes, four working-day rewards and persistent Dive discovery');
console.log('PASS  lock enforcement for selection, next/previous, reload and save reset');
console.log('PASS  Dive overlap, pause/resume, master/mute, return, replay and user override');

const race = new Soundtrack([{url:'first.mp3'}, {url:'second.mp3'}]);
const pendingPlay = race.resume(); race.pause(); const immediateResume = race.resume();
race.audio.finishPlay(); await pendingPlay;
await new Promise(r => setImmediate(r));
assert.equal(race.audio.playCalls, 2, 'resume waits for the canceled play before starting again');
race.audio.finishPlay(); assert.equal(await immediateResume, true);
const failing = new Soundtrack([{url:'first.mp3'}], { diveTrack:{url:'missing.mp3',title:'Missing cue'} });
const music = failing.resume(); failing.audio.finishPlay(); await music;
failing.cueAudio.play = () => Promise.reject(new Error('load failed'));
assert.equal(await failing.startDive(), false);
assert.equal(failing.cueActive, false); assert.equal(failing.audio.paused, false);
assert.equal(failing.audio.volume, failing.volume, 'a failed cue leaves the cassette audible');
console.log('PASS  rapid pause/resume and cue failure recovery');

// Safari-style volume behavior: media stays at volume 1; graph gains own fades.
class FakeContext {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
  createGain() { return { gain: { value: 0, setTargetAtTime(v) { this.value = v; } }, connect() { return this; } }; }
  createMediaElementSource() { return { connect(node) { return node; } }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
window.AudioContext = FakeContext;
values.set('snack-attack-music', '0');
const graph = new Soundtrack(soundtrackTracks(), { diveTrack: diveTrack() });
assert.equal(graph.volume, .42, 'retired music slider cannot silence playback');
graph._unlock();
assert.equal(graph.audio.playCalls, 1);
assert.equal(graph.cueAudio.playCalls, 1, 'one gesture primes both media elements synchronously');
assert.deepEqual(playOrder.slice(-2), [graph.audio.src, graph.cueAudio.src], 'the audible cassette claims the gesture before silent Dive priming');
graph.audio.finishPlay(); graph.cueAudio.finishPlay();
await new Promise(r => setImmediate(r));
assert.equal(graph.cuePrimed, true);
assert.equal(graph.cueAudio.paused, true);
assert.equal(graph.isLocked(11), true, 'silent priming never awards the Dive tape');
const graphDive = graph.startDive(); graph.cueAudio.finishPlay(); await graphDive;
graph.ctx.state = 'suspended'; graph.update(.1);
assert.equal(graph.mix, 0, 'suspended audio context cannot advance the fade or award Dive');
assert.equal(graph.isLocked(11), true);
graph.ctx.state = 'running';
for (let i = 0; i < 8; i++) graph.update(.1);
assert.equal(graph.audio.volume, 1); assert.equal(graph.cueAudio.volume, 1);
assert.ok(Math.abs(graph.gains.get(graph.audio).gain.value - .42 * Math.SQRT1_2) < 1e-6);
assert.ok(Math.abs(graph.gains.get(graph.cueAudio).gain.value - .42 * Math.SQRT1_2) < 1e-6);
graph.setMuted(true);
assert.equal(graph.gains.get(graph.audio).gain.value, 0);
assert.equal(graph.gains.get(graph.cueAudio).gain.value, 0);
graph.pause(); graph.resetProgress();
assert.equal(graph.isLocked(11), true, 'save reset also relocks the discovered Dive tape');
console.log('PASS gesture priming, Web Audio gains, context interruption, mute and Dive reset');
