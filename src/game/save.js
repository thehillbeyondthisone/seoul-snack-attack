// Seoul Delivery — persistent player progression shared by boot and orders.
export const SAVE_KEY = 'seoul-delivery-save';

export const DEFAULT_SAVE = Object.freeze({
  cash: 0,
  deliveries: 0,
  ratings: [],
  vehicle: 'van',
  owned: ['van'],
});

export function loadSave() {
  try {
    const value = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (value && typeof value.cash === 'number') {
      const save = { ...DEFAULT_SAVE, ...value };
      save.ratings = Array.isArray(save.ratings) ? save.ratings : [];
      save.owned = Array.isArray(save.owned) ? [...new Set(['van', ...save.owned])] : ['van'];
      if (!save.owned.includes(save.vehicle)) save.vehicle = 'van';
      return save;
    }
  } catch { /* corrupted or unavailable storage — start fresh */ }
  return { ...DEFAULT_SAVE, ratings: [], owned: ['van'] };
}

export function persistSave(save) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}
