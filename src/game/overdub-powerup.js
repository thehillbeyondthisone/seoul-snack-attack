// Session-only stunt prototype powerup. Visual quality never changes its rules.
export class OverdubPowerup {
  constructor({ duration = 30 } = {}) {
    this.duration = duration;
    this.reset();
  }

  get active() { return this.remaining > 0; }

  activate() {
    if (!this.charges || this.active) return false;
    this.charges = 0;
    this.remaining = this.duration;
    return true;
  }

  update(dt, { paused = false } = {}) {
    if (!this.active || paused) return;
    this.remaining = Math.max(0, this.remaining - Math.max(0, dt));
  }

  awardStyle(category) {
    if (!this.active || this.boostedStyles.has(category)) return false;
    this.boostedStyles.add(category);
    return true;
  }

  beginOrder() { this.boostedStyles.clear(); }

  completeDelivery() {
    this.remaining = 0;
    this.charges = 1;
  }

  reset() {
    this.remaining = 0;
    this.charges = 1;
    this.boostedStyles = new Set();
  }
}
