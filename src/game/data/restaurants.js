// Seoul Snack Attack — street-snack roster and pickup menu.
// `models` names on each dish resolve through game/food-display.js. Keeping the
// order data authoritative prevents the visuals and customer-facing menu from
// drifting apart as more food assets arrive.
//
// `district` documents where each shop belongs using the frozen district ids
// (hills/hongdae/station/market/hangang/pocha). Runtime placement is bound by
// id through the city's pickup sites (see world/district-dressing.js), so this
// field is roster metadata, not a transform.

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
    id: 'tteokbokki', district: 'market',
    nameKo: '신당 떡볶이 골목', nameEn: 'Sindang Tteokbokki Alley',
    dishes: [
      { nameKo: '매운 떡볶이 밀키트', nameEn: 'Spicy Tteokbokki Kit', type: 'fast', price: 5500, tip: [500, 1600], models: ['tteokbokki-cup'] },
      { nameKo: '순대 모둠 세트', nameEn: 'Soondae Platter Set', type: 'normal', price: 9000, tip: [500, 1800], models: ['soondae-platter', 'ssamjang'] },
      { nameKo: '떡볶이 + 주먹밥 세트', nameEn: 'Tteokbokki + Rice Ball Set', type: 'fast', price: 8000, tip: [600, 2000], models: ['tteokbokki-cup', 'packaged-rice'] },
    ],
  },
  {
    id: 'hotteok', district: 'station',
    nameKo: '호떡 로드 카트', nameEn: 'Hotteok Road Cart',
    dishes: [
      { nameKo: '꿀 호떡 5입 세트', nameEn: 'Honey Hotteok Five-Pack', type: 'melts', price: 5000, tip: [400, 1400], models: ['hotteok'] },
      { nameKo: '호떡 + 생강차 캔 세트', nameEn: 'Hotteok + Ginger Tea Can Set', type: 'melts', price: 6500, tip: [500, 1600], models: ['hotteok', 'korean-cans'] },
    ],
  },
  {
    id: 'eomuk', district: 'pocha',
    nameKo: '부산 어묵 포차', nameEn: 'Busan Eomuk Pocha',
    dishes: [
      { nameKo: '어묵탕 밀키트', nameEn: 'Fish Cake Soup Kit', type: 'soup', price: 7000, tip: [500, 1800], models: ['ramen-pack'] },
      { nameKo: '붕어빵 + 캔음료 세트', nameEn: 'Bungeoppang & Drink Set', type: 'fast', price: 6000, tip: [400, 1500], models: ['korean-cans'] },
      { nameKo: '김말이 + 컵라면 세트', nameEn: 'Gim-Mali & Cup Ramen Set', type: 'fast', price: 7500, tip: [500, 1700], models: ['jin-ramen-cup'] },
    ],
  },
  {
    id: 'gimbap', district: 'station',
    nameKo: '광장 김밥 트럭', nameEn: 'Gwangjang Gimbap Truck',
    dishes: [
      { nameKo: '광장 김밥 + 캔음료 세트', nameEn: 'Gwangjang Gimbap & Drink Set', type: 'normal', price: 6000, tip: [400, 1400], models: ['korean-cans'] },
      { nameKo: '참치김밥 + 컵라면 세트', nameEn: 'Tuna Gimbap & Cup Ramen Set', type: 'fast', price: 8000, tip: [500, 1700], models: ['jin-ramen-cup'] },
    ],
  },
  {
    id: 'chimaek', district: 'hongdae',
    nameKo: '홍대 치맥 거리', nameEn: 'Hongdae Chimaek Street',
    dishes: [
      { nameKo: '닭꼬치 한판', nameEn: 'Dakggochi Skewer Tray', type: 'fast', price: 14000, tip: [800, 2500], models: ['dakggochi'] },
      { nameKo: '치맥 세트', nameEn: 'Chimaek Chicken & Beer Set', type: 'fast', price: 17500, tip: [1000, 3000], models: ['dakggochi', 'korean-cans'] },
      { nameKo: '불닭 볶음면 세트', nameEn: 'Buldak Stir-Fry Noodle Set', type: 'fast', price: 6000, tip: [400, 1500], models: ['buldak-cup'] },
    ],
  },
  {
    // Authored storefront (world/district-dressing.js) signs this id as
    // '서울 야간 편의점 · NIGHT CONVENIENCE', so the shop name stays in step.
    id: 'bingsu', district: 'station',
    nameKo: '서울 야간 편의점', nameEn: 'Seoul Night Convenience',
    dishes: [
      { nameKo: '딸기 빙수 + 캔커피 세트', nameEn: 'Strawberry Bingsu & Coffee Set', type: 'fragile', price: 8500, tip: [600, 2000], models: ['korean-cans'] },
      { nameKo: '야식 삼양 컵라면', nameEn: 'Midnight Samyang Cup', type: 'melts', price: 3500, tip: [300, 1000], models: ['samyang-cup'] },
      { nameKo: '바나나우유', nameEn: 'Banana Milk', type: 'melts', price: 1800, tip: [200, 800], models: ['banana-milk'] },
    ],
  },
  {
    id: 'gilgeori', district: 'hills',
    nameKo: '길거리 토스트 대장', nameEn: 'Gilgeori Toast Captain',
    dishes: [
      { nameKo: '길거리 토스트 세트', nameEn: 'Gilgeori Street Toast Set', type: 'fast', price: 4500, tip: [300, 1200], models: ['korean-cans'] },
      { nameKo: '토스트 + 진라면 아침 세트', nameEn: 'Toast & Jin Ramen Breakfast Set', type: 'fast', price: 7000, tip: [500, 1600], models: ['jin-ramen-cup'] },
    ],
  },
  {
    id: 'pocha', district: 'hangang',
    nameKo: '한강 노가리 포차', nameEn: 'Hangang Nodari Pocha',
    dishes: [
      { nameKo: '쌈장 + 소주 파티 세트', nameEn: 'Ssamjang + Soju Party Set', type: 'fragile', price: 16000, tip: [1000, 3000], models: ['ssamjang', 'soju-bottle'] },
      { nameKo: '노가리 + 소주 세트', nameEn: 'Nodari & Soju Set', type: 'fragile', price: 12000, tip: [800, 2400], models: ['dakggochi', 'soju-bottle'] },
      { nameKo: '부대찌개 밀키트', nameEn: 'Budae-jjigae Meal Kit', type: 'fragile', price: 22000, tip: [1200, 3500], models: ['luncheon-meat', 'roka-sauce'] },
    ],
  },
];

// The building-kit pilot has its own deliberately small roster. Keeping it
// separate means the three authored Snack Street shops can use their real
// names and menus without pretending they already exist in the kilometre city.
// These dishes reuse the current on-demand food catalog; no extra startup
// payload is introduced for the review world.
export const SNACK_STREET_RESTAURANTS = [
  {
    id: 'patchwork-pocha', district: 'pilot',
    nameKo: '밤참 분식', nameEn: 'Patchwork Pocha',
    dishes: [
      { nameKo: '매운 떡볶이 컵', nameEn: 'Spicy Tteokbokki Cup', type: 'fast', price: 5500, tip: [500, 1500], models: ['tteokbokki-cup'] },
      { nameKo: '순대 모둠 한판', nameEn: 'Soondae Sharing Platter', type: 'normal', price: 9000, tip: [600, 1800], models: ['soondae-platter', 'ssamjang'] },
    ],
  },
  {
    id: 'moon-hotteok', district: 'pilot',
    nameKo: '달밤 호떡', nameEn: 'Moon Hotteok',
    dishes: [
      { nameKo: '꿀 호떡 5입', nameEn: 'Honey Hotteok Five-Pack', type: 'melts', price: 5000, tip: [400, 1400], models: ['hotteok'] },
      { nameKo: '씨앗 호떡 + 생강차', nameEn: 'Seed Hotteok & Ginger Tea', type: 'melts', price: 6500, tip: [500, 1600], models: ['hotteok', 'korean-cans'] },
    ],
  },
  {
    id: 'cloud-dumpling', district: 'pilot',
    nameKo: '구름 만두', nameEn: 'Cloud Dumpling House',
    dishes: [
      { nameKo: '찐만두 + 컵라면 세트', nameEn: 'Steamed Dumplings & Cup Ramen', type: 'fast', price: 7500, tip: [500, 1700], models: ['jin-ramen-cup'] },
      { nameKo: '군만두 + 캔음료 세트', nameEn: 'Fried Dumplings & Canned Drink', type: 'fragile', price: 8500, tip: [600, 1900], models: ['korean-cans'] },
    ],
  },
];
