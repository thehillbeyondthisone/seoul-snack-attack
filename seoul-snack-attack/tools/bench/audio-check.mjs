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

class FakeAudio {
  constructor(url) {
    this.src = url;
    this.paused = true;
    this.volume = 1;
    this.muted = false;
    this.playCalls = 0;
  }
  addEventListener() {}
  load() {}
  pause() { this.paused = true; }
  play() {
    this.playCalls++;
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
assert.equal(recovered.ambienceLevel, 0.42, 'legacy all-zero ambience setting recovers');

console.log('PASS  audio defaults are audible');
console.log('PASS  changed playlist starts with BUDAE');
console.log('PASS  pending music playback stays single-flight');
console.log('PASS  legacy all-zero mixer settings recover');
