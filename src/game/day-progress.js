// A working day advances only on successful deliveries, never elapsed time.
export const DELIVERIES_PER_DAY = 4;
export const DAY_PHASES = Object.freeze([
  { mode: 'morning', ko: '아침', en: 'Morning', time: '06:00' },
  { mode: 'day', ko: '오후', en: 'Afternoon', time: '12:00' },
  { mode: 'dusk', ko: '해질녘', en: 'Dusk', time: '18:00' },
  { mode: 'night', ko: '밤', en: 'Night', time: '00:00' },
]);
export function deliveryCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}
export function dayProgress(deliveries) {
  const total = deliveryCount(deliveries);
  const completed = total % DELIVERIES_PER_DAY;
  const days = Math.floor(total / DELIVERIES_PER_DAY);
  return { ...DAY_PHASES[completed], day: days + 1, days, completed, total, remaining: DELIVERIES_PER_DAY - completed };
}
