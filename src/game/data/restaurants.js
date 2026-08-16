// Seoul Delivery — visual-first shop roster and pickup menu.
// `models` names on each dish resolve through game/food-display.js. Keeping the
// order data authoritative prevents the visuals and customer-facing menu from
// drifting apart as more food assets arrive.

export const FOOD_TYPES = {
  normal:  { ko: '일반',   en: 'standard', timerFactor: 1.0 },
  fast:    { ko: '패스트', en: 'hot & fast', timerFactor: 0.75 },
  soup:    { ko: '국물',   en: 'soup — no spills', timerFactor: 1.1 },
  fragile: { ko: '취급주의', en: 'fragile', timerFactor: 1.1 },
  melts:   { ko: '냉동',   en: 'melts fast', timerFactor: 0.6 },
  level:   { ko: '수평유지', en: 'keep level', timerFactor: 1.0 },
};

export const RESTAURANTS = [
  {
    id: 'hongru', nameKo: '서울 컵라면 연구소', nameEn: 'Seoul Cup Noodle Lab',
    dishes: [
      { nameKo: '진라면 컵', nameEn: 'Jin Ramen Cup', type: 'fast', price: 4500, tip: [500, 1500], models: ['jin-ramen-cup'] },
      { nameKo: '까르보 불닭 컵', nameEn: 'Carbonara Buldak Cup', type: 'fast', price: 5500, tip: [500, 1800], models: ['buldak-cup'] },
      { nameKo: '삼양 1963 컵', nameEn: 'Samyang 1963 Cup', type: 'fast', price: 5000, tip: [500, 1600], models: ['samyang-cup'] },
      { nameKo: '패밀리 라면 팩', nameEn: 'Family Ramen Pack', type: 'normal', price: 12000, tip: [800, 2200], models: ['ramen-pack'] },
    ],
  },
  {
    id: 'bhc', nameKo: '닭꼬치 포차', nameEn: 'Dakggochi Street Stall',
    dishes: [
      { nameKo: '양념 닭꼬치 한판', nameEn: 'Glazed Dakggochi Tray', type: 'fast', price: 14000, tip: [800, 2500], models: ['dakggochi'] },
      { nameKo: '닭꼬치 + 캔음료 세트', nameEn: 'Dakggochi + Canned Drink Set', type: 'fast', price: 17500, tip: [1000, 3000], models: ['dakggochi', 'korean-cans'] },
    ],
  },
  {
    id: 'jokbal', nameKo: '쌈과 소주 상회', nameEn: 'Ssam & Soju Shop',
    dishes: [
      { nameKo: '쌈장 + 소주 파티 세트', nameEn: 'Ssamjang + Soju Party Set', type: 'fragile', price: 16000, tip: [1000, 3000], models: ['ssamjang', 'soju-bottle'] },
      { nameKo: '쌈장 대용량', nameEn: 'Ssamjang Pantry Tub', type: 'normal', price: 9000, tip: [500, 1800], models: ['ssamjang'] },
    ],
  },
  {
    id: 'bingsu', nameKo: '서울 야간 편의점', nameEn: 'Seoul Night Convenience',
    dishes: [
      { nameKo: '한국 캔음료 4팩', nameEn: 'Korean Canned Drink Four-Pack', type: 'fragile', price: 12000, tip: [700, 2200], models: ['korean-cans'] },
      { nameKo: '소주 한 병 배달', nameEn: 'Soju Bottle Delivery', type: 'fragile', price: 5000, tip: [500, 1600], models: ['soju-bottle'] },
    ],
  },
  {
    id: 'pizzamaru', nameKo: '한강 식료품 상회', nameEn: 'Hangang Grocery Market',
    dishes: [
      { nameKo: '고추장 대용량', nameEn: 'Gochujang Pantry Order', type: 'normal', price: 9000, tip: [500, 1800], models: ['gochujang'] },
      { nameKo: '수입 고시히카리 쌀', nameEn: 'Premium Imported Rice', type: 'normal', price: 18000, tip: [1000, 3000], models: ['packaged-rice'] },
    ],
  },
  {
    id: 'budae', nameKo: '의정부 부대찌개 키트', nameEn: 'Uijeongbu Army Stew Kits',
    dishes: [
      { nameKo: '부대찌개 밀키트', nameEn: 'Budae-jjigae Meal Kit', type: 'fragile', price: 22000, tip: [1200, 3500], models: ['luncheon-meat', 'roka-sauce'] },
      { nameKo: '부대찌개 패밀리 키트 + 쌀', nameEn: 'Budae Family Kit + Rice', type: 'fragile', price: 32000, tip: [1800, 4800], models: ['luncheon-meat', 'roka-sauce', 'packaged-rice'] },
    ],
  },
];
