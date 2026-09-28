export const STYLE_CATEGORIES = Object.freeze(['drift', 'jump', 'courier']);

export function stuntPayout(base, timer, timerMax, categories) {
  const earned = STYLE_CATEGORIES.filter((category) => categories?.has(category)).length;
  const timeTip = Math.round(base * 0.25 * Math.max(0, Math.min(1, timer / timerMax)));
  const styleBonus = Math.round(base * 0.25 * earned / STYLE_CATEGORIES.length);
  return { base, timeTip, styleBonus, total: base + timeTip + styleBonus };
}
