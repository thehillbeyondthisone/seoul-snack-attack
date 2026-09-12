// Seoul Snack Attack — small procedural release soundscape.
//
// The browser build deliberately uses Web Audio primitives instead of shipping
// a library of sound files. This keeps the payload small and avoids introducing
// another asset-rights dependency while still giving the driving loop feedback.
export class AudioManager {
  constructor({ music = null } = {}) {
    this.music = music;
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.ambience = null;
    this.engine = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.rainGain = null;
    this.rainFilter = null;
    this.rainSource = null;
    this.muted = localStorage.getItem('snack-attack-muted') === '1';
    const saved = (key, fallback) => {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === '') return fallback;
      const value = Number(raw);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
    };
    this.masterLevel = saved('snack-attack-master', 0.8);
    this.sfxLevel = saved('snack-attack-sfx', 0.62);
    this.ambienceLevel = saved('snack-attack-ambience', 0.22);
    // Versions before audio-settings-v2 interpreted a missing localStorage
    // value as zero. Recover the resulting all-silent mix once while still
    // preserving deliberate individual slider choices after migration.
    if (localStorage.getItem('snack-attack-audio-settings-v2') !== '1') {
      if (this.masterLevel === 0 && this.sfxLevel === 0 && this.ambienceLevel === 0) {
        this.masterLevel = 0.8;
        this.sfxLevel = 0.62;
        this.ambienceLevel = 0.42;
      }
      localStorage.setItem('snack-attack-audio-settings-v2', '1');
    }
    this.started = false;
    this.resumePromise = null;
    this.lastError = null;
    this.lastSkid = 0;
    this.lastImpact = 0;
    this._unlock = () => this.start();
    this.music?.setMuted(this.muted);
    this.music?.setMasterVolume(this.masterLevel);
    for (const event of ['pointerdown', 'keydown', 'touchstart']) {
      window.addEventListener(event, this._unlock, { passive: true });
    }
  }

  _makeNoiseBuffer(seconds = 2) {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // Low-pass-ish rain noise: smooth enough to sit under the music.
      last = last * 0.985 + (Math.random() * 2 - 1) * 0.12;
      data[i] = last;
    }
    return buffer;
  }

  start() {
    if (this.started) {
      this._resume();
      return true;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.ambience = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterLevel;
      this.sfx.gain.value = this.sfxLevel;
      this.ambience.gain.value = this.ambienceLevel;
      this.sfx.connect(this.master);
      this.ambience.connect(this.master);
      // Underwater muffle: a lowpass the whole mix passes through, wide open on
      // the surface. See setUnderwater().
      this.muffle = this.ctx.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = 20000;
      this.master.connect(this.muffle).connect(this.ctx.destination);

      // The deep: filtered noise, silent until the dive asks for it.
      this.deepSource = this.ctx.createBufferSource();
      this.deepSource.buffer = this._makeNoiseBuffer(3);
      this.deepSource.loop = true;
      this.deepFilter = this.ctx.createBiquadFilter();
      this.deepFilter.type = 'lowpass';
      this.deepFilter.frequency.value = 120;
      this.deepGain = this.ctx.createGain();
      this.deepGain.gain.value = 0.0001;
      this.deepSource.connect(this.deepFilter).connect(this.deepGain).connect(this.master);
      this.deepSource.start();

      this.engine = this.ctx.createOscillator();
      this.engine.type = 'sawtooth';
      this.engine.frequency.value = 58;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0001;
      this.engine.connect(this.engineFilter).connect(this.engineGain).connect(this.ambience);
      this.engine.start();

      this.rainSource = this.ctx.createBufferSource();
      this.rainSource.buffer = this._makeNoiseBuffer();
      this.rainSource.loop = true;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0.0001;
      this.rainFilter = this.ctx.createBiquadFilter();
      this.rainFilter.type = 'bandpass';
      this.rainFilter.frequency.value = 2600;
      this.rainFilter.Q.value = 0.55;
      this.rainSource.connect(this.rainFilter).connect(this.rainGain).connect(this.ambience);
      this.rainSource.start();
      this.started = true;
      this.lastError = null;
      this._resume();
      return true;
    } catch (error) {
      this.lastError = error;
      this.ctx = null;
      return false;
    }
  }

  _resume() {
    if (!this.ctx || this.ctx.state !== 'suspended') return null;
    if (this.resumePromise) return this.resumePromise;
    this.resumePromise = this.ctx.resume()
      .catch((error) => { this.lastError = error; })
      .finally(() => { this.resumePromise = null; });
    return this.resumePromise;
  }

  _tone({ frequency = 440, duration = 0.12, type = 'sine', volume = 0.12, slide = 0 }) {
    if (!this.ctx || !this.sfx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.linearRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.sfx);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  event(name, amount = 1) {
    if (!this.started) return;
    switch (name) {
      case 'offer': this._tone({ frequency: 560, duration: 0.12, volume: 0.11, slide: 120 }); break;
      case 'accept': this._tone({ frequency: 440, duration: 0.10, volume: 0.10, slide: 180 }); break;
      case 'pickup': this._tone({ frequency: 380, duration: 0.14, volume: 0.10, slide: 260 }); break;
      case 'delivery':
        this._tone({ frequency: 520, duration: 0.10, volume: 0.11, slide: 180 });
        setTimeout(() => this._tone({ frequency: 780, duration: 0.16, volume: 0.10, slide: 80 }), 75);
        break;
      case 'fail': this._tone({ frequency: 180, duration: 0.28, type: 'square', volume: 0.08, slide: -80 }); break;
      case 'spill': this._tone({ frequency: 230, duration: 0.18, type: 'triangle', volume: 0.07, slide: -120 }); break;
      case 'reset': this._tone({ frequency: 250, duration: 0.08, volume: 0.06, slide: 80 }); break;
      case 'mute': this._tone({ frequency: this.muted ? 180 : 620, duration: 0.08, volume: 0.06 }); break;
      case 'impact': {
        const now = performance.now();
        if (now - this.lastImpact < 180) return;
        this.lastImpact = now;
        this._tone({ frequency: 75 + amount * 18, duration: 0.08 + Math.min(amount, 8) * 0.02, type: 'square', volume: Math.min(0.16, 0.035 + amount * 0.012), slide: -40 });
        break;
      }
      case 'sonar':
        this._tone({ frequency: 880, duration: 1.4, volume: 0.09, slide: -12 });
        setTimeout(() => this._tone({ frequency: 880, duration: 1.1, volume: 0.035, slide: -12 }), 420);
        break;
      case 'leviathan':
        // Two detuned groans sliding down — something big exhaling nearby.
        this._tone({ frequency: 92, duration: 3.2, type: 'sawtooth', volume: 0.12, slide: -38 });
        this._tone({ frequency: 61, duration: 3.6, volume: 0.2, slide: -22 });
        break;
      case 'splash': {
        if (!this.ctx || this.muted) return;
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this._makeNoiseBuffer(1);
        const band = this.ctx.createBiquadFilter();
        band.type = 'lowpass';
        band.frequency.setValueAtTime(3200, now);
        band.frequency.exponentialRampToValueAtTime(260, now + 0.9);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.55, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
        src.connect(band).connect(gain).connect(this.sfx);
        src.start(now);
        src.stop(now + 1.05);
        break;
      }
      case 'whirlpool': {
        // The Han opening a plughole: a roar that swells and climbs in pitch
        // over the ~3 s the truck circles before it goes under.
        if (!this.ctx || this.muted) return;
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this._makeNoiseBuffer(4);
        const band = this.ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.Q.value = 0.8;
        band.frequency.setValueAtTime(220, now);
        band.frequency.exponentialRampToValueAtTime(900, now + 3.2);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.5, now + 2.6);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.9);
        src.connect(band).connect(gain).connect(this.sfx);
        src.start(now);
        src.stop(now + 4);
        break;
      }
      case 'skid': {
        const now = performance.now();
        if (now - this.lastSkid < 120) return;
        this.lastSkid = now;
        this._tone({ frequency: 1200, duration: 0.07, type: 'sawtooth', volume: 0.025 + amount * 0.02, slide: -220 });
        break;
      }
    }
  }

  update({ speed = 0, throttle = 0, skid = 0, rain = 0 } = {}) {
    if (!this.started || !this.ctx) return;
    // Some browsers suspend an AudioContext again after tab switches or an
    // autoplay rejection. Keep the procedural buses alive after the next
    // trusted gesture/frame instead of leaving the game permanently silent.
    this._resume();
    const now = this.ctx.currentTime;
    const speedNorm = Math.min(1, Math.abs(speed) / 25);
    const engineLevel = Math.max(0.0001, 0.012 + speedNorm * 0.055 + throttle * 0.045);
    this.engineGain.gain.setTargetAtTime(this.muted ? 0.0001 : engineLevel, now, 0.045);
    this.engine.frequency.setTargetAtTime(48 + speedNorm * 118 + throttle * 28, now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(260 + speedNorm * 900 + throttle * 480, now, 0.08);
    // Rain is intentionally much more present than the first mix. The
    // ambience bus still lets the player turn it down independently.
    this.rainGain.gain.setTargetAtTime(this.muted ? 0.0001 : 0.001 + rain * 0.16, now, 0.15);
    if (skid > 0.35) this.event('skid', skid);
  }

  /**
   * 0 on the surface, 1 at the bottom of the Drain. Closes the whole mix down
   * to a muffled thump and brings up the deep's rumble. Driven continuously by
   * src/game/dive.js, so it doubles as the descent's audio curve.
   */
  setUnderwater(amount) {
    const k = Math.max(0, Math.min(1, Number(amount) || 0));
    if (k === this._underwater) return;
    this._underwater = k;
    if (!this.ctx || !this.muffle) return;
    const now = this.ctx.currentTime;
    this.muffle.frequency.setTargetAtTime(20000 * Math.pow(1100 / 20000, k), now, 0.12);
    this.deepGain.gain.setTargetAtTime(Math.max(0.0001, k * 0.28), now, 0.3);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.music?.setMuted(this.muted);
    localStorage.setItem('snack-attack-muted', this.muted ? '1' : '0');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterLevel, this.ctx.currentTime, 0.03);
    if (!this.muted) this.start();
    this.event('mute');
    return this.muted;
  }

  setMasterVolume(value) {
    this.masterLevel = Math.max(0, Math.min(1, Number(value) || 0));
    this.music?.setMasterVolume(this.masterLevel);
    localStorage.setItem('snack-attack-master', String(this.masterLevel));
    if (this.master && this.ctx && !this.muted) this.master.gain.setTargetAtTime(this.masterLevel, this.ctx.currentTime, 0.03);
  }

  setSfxVolume(value) {
    this.sfxLevel = Math.max(0, Math.min(1, Number(value) || 0));
    localStorage.setItem('snack-attack-sfx', String(this.sfxLevel));
    if (this.sfx) this.sfx.gain.value = this.sfxLevel;
  }

  setAmbienceVolume(value) {
    this.ambienceLevel = Math.max(0, Math.min(1, Number(value) || 0));
    localStorage.setItem('snack-attack-ambience', String(this.ambienceLevel));
    if (this.ambience) this.ambience.gain.value = this.ambienceLevel;
  }

  get available() { return !!this.ctx; }

  wake() {
    const started = this.start();
    this._resume();
    return started;
  }

  reset() {
    this.muted = false;
    this.music?.setMuted(false);
    this.masterLevel = 0.8;
    this.sfxLevel = 0.62;
    this.ambienceLevel = 0.42;
    localStorage.setItem('snack-attack-muted', '0');
    this.setMasterVolume(this.masterLevel);
    this.setSfxVolume(this.sfxLevel);
    this.setAmbienceVolume(this.ambienceLevel);
    this.wake();
    if (this.master && this.ctx) this.master.gain.setValueAtTime(this.masterLevel, this.ctx.currentTime);
    this.event('pickup');
  }
}
