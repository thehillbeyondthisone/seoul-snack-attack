// Two media lanes, routed through Web Audio gains for Safari/iOS crossfades.
import { deliveryCount } from '../game/day-progress.js';

export class Soundtrack {
  constructor(urls, { volume = 0.42, deliveries = 0, unlockedTapes = [], diveTrack = null } = {}) {
    this.tracks = (Array.isArray(urls) ? urls : [{ url: urls, title: 'Drop It Red' }]).map((t) =>
      typeof t === 'string' ? { url: t, title: t.split('/').pop().replace(/\.[^.]+$/, '') } : { ...t });
    this.deliveries = deliveryCount(deliveries);
    this.unlockedTapes = new Set(unlockedTapes);
    this.listeners = new Set();
    const playlist = this.tracks.map((t) => t.url).join('\n');
    const changed = localStorage.getItem('snack-attack-playlist-v1') !== playlist;
    this.index = changed ? 0 : Math.trunc(Number(localStorage.getItem('snack-attack-track')) || 0);
    if (!this.tracks[this.index] || this.isLocked(this.index)) this.index = this.findPlayable(1, -1);
    localStorage.setItem('snack-attack-playlist-v1', playlist);
    localStorage.setItem('snack-attack-track', String(this.index));
    // The mixer UI has been retired. Old zero sliders must not leave music silent.
    this.volume = volume;
    this.masterLevel = 1;
    this.muted = false;
    this.audio = new Audio(this.tracks[this.index]?.url || '');
    this.audio.preload = 'auto';
    this.diveTrack = diveTrack;
    this.cueAudio = diveTrack ? new Audio(diveTrack.url) : null;
    if (this.cueAudio) this.cueAudio.preload = 'auto';
    this.cueActive = false;
    this.mix = 0;
    this.fade = null;
    this.started = false;
    this.lastError = null;
    this.lastAttempt = -Infinity;
    this.pending = new Map();
    this.revision = 0;
    this.wantPlaying = true;
    this.ctx = null;
    this.gains = new Map();
    this.priming = null;
    this.cuePrimed = false;
    this.audio.addEventListener('ended', () => { if (!this.cueActive) this.next({ autoplay: true }); });
    this.cueAudio?.addEventListener('ended', () => { if (this.cueActive) this.endCue(); });
    this.cueAudio?.addEventListener('error', () => { if (this.cueActive) this.endCue(); });
    for (const lane of [this.audio, this.cueAudio].filter(Boolean)) {
      for (const event of ['play', 'pause', 'ended']) lane.addEventListener(event, () => this._notify());
    }
    this._applyMix();
    this._unlock = () => {
      this._ensureGraph();
      // The cassette is the audible result of the gesture, so claim playback
      // for it before silently priming the optional Dive lane. Some mobile
      // browsers only honor the first media play made by one activation.
      if (this.wantPlaying && (this.paused || !this.started)) this.play({ force: true });
      this._primeCue();
    };
    for (const event of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(event, this._unlock, { passive: true });
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _notify() { for (const fn of this.listeners) fn(); }
  get activeAudio() { return this.cueActive ? this.cueAudio : this.audio; }
  get currentTrack() { return this.cueActive ? this.diveTrack : this.tracks[this.index] || { title: 'No track' }; }
  get paused() { return this.activeAudio.paused; }
  get playPending() { return this.pending.has(this.activeAudio); }
  isLocked(i) {
    const t = this.tracks[i];
    return !t || !!t.locked || (!this.unlockedTapes.has(t.file) &&
      (!!t.unlockEvent || this.deliveries < (t.unlockDeliveries || 0)));
  }
  findPlayable(dir = 1, from = this.index) {
    for (let step = 1; step <= this.tracks.length; step++) {
      const i = ((from + dir * step) % this.tracks.length + this.tracks.length) % this.tracks.length;
      if (!this.isLocked(i)) return i;
    }
    return -1;
  }
  setDeliveries(value) {
    const locked = this.tracks.map((_, i) => this.isLocked(i));
    this.deliveries = deliveryCount(value);
    const unlocked = this.tracks.filter((_, i) => locked[i] && !this.isLocked(i));
    if (this.isLocked(this.index)) this.setTrack(this.findPlayable(1, -1));
    this._notify();
    return unlocked;
  }
  resetProgress() {
    this.unlockedTapes.clear();
    if (this.cueActive) this.endCue();
    this.setDeliveries(0);
  }
  _awardDive() {
    const tape = this.tracks.find(t => t.unlockEvent === 'dive');
    if (!tape || this.unlockedTapes.has(tape.file)) return;
    this.unlockedTapes.add(tape.file);
    this.onUnlock?.(tape);
    this._notify();
  }
  _ensureGraph() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) {
      this.ctx = new Ctx();
      for (const lane of [this.audio, this.cueAudio].filter(Boolean)) {
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        this.ctx.createMediaElementSource(lane).connect(gain).connect(this.ctx.destination);
        this.gains.set(lane, gain);
      }
      this._applyMix();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(error => { this.lastError = error; });
  }
  // Call play on BOTH elements inside the gesture, before any await. Starting
  // Dive later from a physics tick otherwise asks Safari for new autoplay rights.
  _primeCue() {
    if (!this.ctx || !this.cueAudio || this.cuePrimed || this.priming || this.cueActive || this.fade) return;
    try {
      this.priming = Promise.resolve(this.cueAudio.play()).then(() => {
        this.cuePrimed = true;
        if (!this.cueActive && !this.fade) {
          this.cueAudio.pause();
          this.cueAudio.currentTime = 0;
        }
      }).catch(error => { this.lastError = error; }).finally(() => { this.priming = null; });
    } catch (error) { this.lastError = error; }
  }
  // Single flight per lane; stale play completions cannot undo a later pause.
  _playLane(lane) {
    const pending = this.pending.get(lane);
    if (pending) {
      if (pending.revision === this.revision) return pending.promise;
      return pending.promise.then(() => this.wantPlaying && (lane === this.activeAudio || this.fade)
        ? this._playLane(lane) : false);
    }
    if (!lane.paused) return Promise.resolve(true);
    const revision = this.revision;
    let attempt;
    try { attempt = lane.play(); } catch (error) { this.lastError = error; return Promise.resolve(false); }
    const promise = Promise.resolve(attempt).then(() => {
      if (revision !== this.revision || !this.wantPlaying) { lane.pause(); return false; }
      this.started = true; this.lastError = null;
      return true;
    }).catch((error) => { this.lastError = error; return false; }).finally(() => {
      if (this.pending.get(lane)?.promise === promise) this.pending.delete(lane);
    });
    this.pending.set(lane, { promise, revision });
    return promise;
  }
  async play({ force = false } = {}) {
    if (!force && !this.wantPlaying) return false;
    this._ensureGraph();
    this.wantPlaying = true;
    const now = performance.now();
    if (!force && !this.playPending && now - this.lastAttempt < 1000) return false;
    this.lastAttempt = now;
    const ok = await this._playLane(this.activeAudio);
    if (ok) {
      if (this.fade) this._playLane(this.cueActive ? this.audio : this.cueAudio);
    }
    this._notify();
    return ok;
  }
  wake() {
    this._ensureGraph();
    const playing = this.play({ force: true });
    this._primeCue();
    return playing;
  }
  resume() { return this.play({ force: true }); }
  pause() {
    this.wantPlaying = false; this.revision++;
    this.audio.pause(); this.cueAudio?.pause(); this._notify();
  }
  setMuted(on) { this.muted = !!on; this._applyMix(); this._notify(); }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  setMasterVolume(value) { this.masterLevel = Math.max(0, Math.min(1, Number(value) || 0)); this._applyMix(); }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    localStorage.setItem('snack-attack-music', String(this.volume)); this._applyMix();
  }
  reset() { this.setMuted(false); this.setVolume(0.42); return this.resume(); }
  _applyMix() {
    const gain = this.volume * this.masterLevel;
    for (const [lane, level] of [[this.audio, gain * Math.cos(this.mix * Math.PI / 2)],
      [this.cueAudio, gain * Math.sin(this.mix * Math.PI / 2)]]) {
      if (!lane) continue;
      const node = this.gains?.get(lane);
      lane.volume = node ? 1 : level;
      lane.muted = this.muted;
      if (node) node.gain.setTargetAtTime(this.muted ? 0 : level, this.ctx.currentTime, .015);
    }
  }
  // Called even when Web Audio effects are unavailable. Pausing freezes fades.
  update(dt) {
    if (this.ctx && this.ctx.state !== 'running') return;
    if (!this.fade || this.paused || this.activeAudio.readyState < 2) return;
    if (this.cueActive) this._awardDive();
    this.fade.elapsed += Math.max(0, Math.min(.1, dt));
    const t = Math.min(1, this.fade.elapsed / this.fade.seconds);
    this.mix = this.fade.from + (this.fade.to - this.fade.from) * t;
    this._applyMix();
    if (t === 1) {
      this.fade = null;
      (this.cueActive ? this.audio : this.cueAudio)?.pause();
      this._notify();
    }
  }
  async startDive({ seconds = 1.6 } = {}) {
    if (!this.cueAudio || this.cueActive) return false;
    const revision = ++this.revision;
    this.cueAudio.currentTime = 0;
    this.cueActive = true;
    this.fade = { from: this.mix, to: 1, elapsed: 0, seconds: Math.max(.1, seconds) };
    this._applyMix(); this._notify();
    if (!this.wantPlaying) return true;
    if (this.priming) await this.priming;
    if (revision !== this.revision) return false;
    this._ensureGraph();
    const ok = await this._playLane(this.cueAudio);
    if (revision !== this.revision) return false;
    if (ok && this.fade && this.audio.paused) this._playLane(this.audio);
    // Keep a policy-blocked cue pending for the next gesture; do not fade the
    // playing cassette down while the incoming lane is still silent.
    if (!ok && this.lastError?.name !== 'NotAllowedError') {
      this.cueActive = false; this.fade = null; this.mix = 0; this._applyMix(); this._notify();
    }
    return ok;
  }
  async endCue() {
    if (!this.cueActive) return;
    this.revision++; this.cueActive = false;
    this.fade = { from: this.mix, to: 0, elapsed: 0, seconds: 1.2 };
    if (this.wantPlaying) await this._playLane(this.audio);
    this._notify();
  }
  async setTrack(index, { autoplay = false } = {}) {
    if (!Number.isInteger(Number(index))) return false;
    index = Number(index);
    if (this.isLocked(index)) return false;
    const playing = autoplay || this.wantPlaying;
    this.revision++; this.audio.pause(); this.cueAudio?.pause();
    this.cueActive = false; this.fade = null; this.mix = 0;
    this.index = index;
    localStorage.setItem('snack-attack-track', String(index));
    this.audio.src = this.tracks[index].url; this.audio.load();
    this.wantPlaying = playing; this._applyMix(); this._notify();
    if (this.pending.has(this.audio)) await this.pending.get(this.audio).promise;
    if (playing && this.wantPlaying && this.index === index) await this.play({ force: true });
    return true;
  }
  next(options) { return this.setTrack(this.findPlayable(1), options); }
  previous(options) { return this.setTrack(this.findPlayable(-1), options); }
}
