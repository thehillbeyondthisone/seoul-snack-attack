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
      this.master.connect(this.ctx.destination);

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

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('snack-attack-muted', this.muted ? '1' : '0');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterLevel, this.ctx.currentTime, 0.03);
    if (!this.muted) this.start();
    this.event('mute');
    return this.muted;
  }

  setMasterVolume(value) {
    this.masterLevel = Math.max(0, Math.min(1, Number(value) || 0));
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
