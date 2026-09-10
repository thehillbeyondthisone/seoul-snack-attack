// Seoul Snack Attack — persistent player progression shared by boot and orders.
import { DEFAULT_VEHICLE, VEHICLE_IDS } from './data/vehicles.js';

export const SAVE_KEY = 'snack-attack-save';

export const DEFAULT_SAVE = Object.freeze({
  cash: 0,
  deliveries: 0,
  ratings: [],
  vehicle: DEFAULT_VEHICLE,
  owned: ['van', DEFAULT_VEHICLE],
});

export function loadSave() {
  try {
    const value = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (value && typeof value.cash === 'number') {
      const save = { ...DEFAULT_SAVE, ...value };
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
  return { ...DEFAULT_SAVE, ratings: [], owned: ['van', DEFAULT_VEHICLE] };
}

export function persistSave(save) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}
