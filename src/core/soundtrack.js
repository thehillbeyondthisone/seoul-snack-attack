// Browser autoplay policies can reject sound until the player interacts with
// the page. Try immediately, then retry on the first trusted input gesture.
//
// Track objects are plain data; `tracks` is public and drives the cassette
// deck's rack (src/ui/cassette-deck.js). An optional `locked: true` field is
// reserved for bonus tracks — the deck dims them but nothing clears it yet.
export class Soundtrack {
  constructor(urls, { volume = 0.42 } = {}) {
    this.tracks = (Array.isArray(urls) ? urls : [{ url: urls, title: 'Drop It Red' }]).map((track) =>
      typeof track === 'string' ? { url: track, title: track.split('/').pop().replace(/\.[^.]+$/, '') } : track
    );
    // Reset to the first track once when the playlist changes. After that,
    // preserve the player's selection across reloads as before.
    const playlist = this.tracks.map((track) => track.url).join('\n');
    const playlistKey = 'snack-attack-playlist-v1';
    const playlistChanged = localStorage.getItem(playlistKey) !== playlist;
    this.index = playlistChanged ? 0 : Number(localStorage.getItem('snack-attack-track')) || 0;
    this.index = Math.max(0, Math.min(this.tracks.length - 1, this.index));
    if (playlistChanged) {
      localStorage.setItem(playlistKey, playlist);
      localStorage.setItem('snack-attack-track', '0');
    }
    this.audio = new Audio(this.tracks[this.index]?.url || '');
    this.audio.loop = this.tracks.length < 2;
    this.audio.preload = 'auto';
    const savedRaw = localStorage.getItem('snack-attack-music');
    const savedVolume = savedRaw === null || savedRaw === '' ? NaN : Number(savedRaw);
    this.audio.volume = Number.isFinite(savedVolume) ? Math.max(0, Math.min(1, savedVolume)) : volume;
    if (localStorage.getItem('snack-attack-audio-settings-v2') !== '1' && this.audio.volume === 0) {
      this.audio.volume = volume;
    }
    this.started = false;
    this.playPending = false;
    this.playPromise = null;
    this.lastError = null;
    this.lastAttempt = -Infinity;
    this.audio.addEventListener('ended', () => this.next({ autoplay: true }));

    this._unlock = () => this.play({ force: true });
    for (const event of ['pointerdown', 'keydown', 'touchstart']) {
      window.addEventListener(event, this._unlock, { passive: true });
    }
  }

  async play({ force = false } = {}) {
    const now = performance.now();
    if (!this.audio.paused) return true;
    // Keep playback single-flight. Forced retries used to bypass this guard,
    // allowing the game loop to create dozens of play promises per second.
    if (this.playPending) return this.playPromise;
    // A connected controller may be the only active input. Retrying at a low
    // rate lets permissive browsers start from it without spamming rejected
    // play promises in browsers that require a pointer/key gesture.
    if (!force && now - this.lastAttempt < 1000) return;
    this.lastAttempt = now;
    this.playPending = true;
    this.playPromise = (async () => {
      try {
        await this.audio.play();
        this.started = true;
        this.lastError = null;
        for (const event of ['pointerdown', 'keydown', 'touchstart']) {
          window.removeEventListener(event, this._unlock);
        }
        return true;
      } catch (error) {
        this.lastError = error;
        return false;
      } finally {
        this.playPending = false;
        this.playPromise = null;
      }
    })();
    return this.playPromise;
  }

  wake() {
    return this.play({ force: true });
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    return this.audio.muted;
  }

  pause() {
    this.audio.pause();
  }

  resume() {
    return this.play({ force: true });
  }

  setVolume(value) {
    this.audio.volume = Math.max(0, Math.min(1, Number(value) || 0));
    localStorage.setItem('snack-attack-music', String(this.audio.volume));
  }

  async reset() {
    this.audio.muted = false;
    this.setVolume(0.42);
    return this.play({ force: true });
  }

  async setTrack(index, { autoplay = false } = {}) {
    if (!this.tracks.length) return;
    const wasPlaying = !this.audio.paused;
    this.index = (Number(index) + this.tracks.length) % this.tracks.length;
    localStorage.setItem('snack-attack-track', String(this.index));
    this.audio.pause();
    this.audio.src = this.tracks[this.index].url;
    this.audio.loop = this.tracks.length < 2;
    this.audio.load();
    if (autoplay || wasPlaying) await this.play({ force: true });
  }

  next(options) { return this.setTrack(this.index + 1, options); }
  previous(options) { return this.setTrack(this.index - 1, options); }

  get currentTrack() { return this.tracks[this.index] || { title: 'No track' }; }

  get paused() { return this.audio.paused; }
}
