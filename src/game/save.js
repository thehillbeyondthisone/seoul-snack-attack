// Seoul Snack Attack — persistent player progression shared by boot and orders.
import { DEFAULT_VEHICLE, VEHICLE_IDS } from './data/vehicles.js';
import { SOUNDTRACK } from './data/soundtrack.js';
import { deliveryCount } from './day-progress.js';

export const SAVE_KEY = 'snack-attack-save';

export const DEFAULT_SAVE = Object.freeze({
  cash: 0,
  deliveries: 0,
  truckMakeover: false,
  tapeProgressVersion: 2,
  unlockedTapes: Object.freeze([]),
  ratings: [],
  vehicle: DEFAULT_VEHICLE,
  owned: ['van', DEFAULT_VEHICLE],
});

export function loadSave() {
  try {
    const value = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (value && typeof value.cash === 'number') {
      const save = { ...DEFAULT_SAVE, ...value };
      save.deliveries = deliveryCount(save.deliveries);
      save.truckMakeover = value.truckMakeover === true;
      const earned = Array.isArray(save.unlockedTapes) ? [...save.unlockedTapes] : [];
      if (value.tapeProgressVersion !== 2) {
        earned.push(...SOUNDTRACK.filter(t => t.legacyUnlockDeliveries && save.deliveries >= t.legacyUnlockDeliveries).map(t => t.file));
      }
      save.unlockedTapes = [...new Set(earned)].filter(file => SOUNDTRACK.some(t => t.file === file));
      save.tapeProgressVersion = 2;
      save.ratings = Array.isArray(save.ratings) ? save.ratings : [];
      // Keep only vehicles that still exist in the roster — a retired id
      // (e.g. `compact`) must fall back to the default instead of leaking
      // into ?car= or a later persistSave().
      save.owned = Array.isArray(save.owned)
        ? [...new Set(['van', DEFAULT_VEHICLE, ...save.owned])].filter((id) => VEHICLE_IDS.includes(id))
        : ['van', DEFAULT_VEHICLE];
      if (!save.owned.includes(save.vehicle)) save.vehicle = DEFAULT_VEHICLE;
      return save;
    }
  } catch { /* corrupted or unavailable storage — start fresh */ }
  return { ...DEFAULT_SAVE, ratings: [], unlockedTapes: [], owned: ['van', DEFAULT_VEHICLE] };
}

export function persistSave(save) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}
