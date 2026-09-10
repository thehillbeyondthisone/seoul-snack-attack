// Seoul Snack Attack — per-order request notes.
//
// Every Korean delivery app puts two free-text boxes on the order form: one for
// the kitchen (가게 요청사항) and one for the rider (배달 요청사항). They are
// where the customer stops being an anonymous drop-off point and becomes a
// person on the fourth floor whose elevator is broken. That is the whole reason
// this table exists — the notes carry no mechanics and change no payout, they
// just make the job read like somebody actually placed the order.
//
// Two rules kept the writing honest:
//
//   1. NOTHING PROMISES WHAT THE GAME CANNOT PAY. A note may ask you to hurry or
//      to keep the broth level, because the timer and the condition meter are
//      real systems. None of them offers a bigger tip for it, because nothing
//      here can grant one.
//   2. EVERY NOTE SHIPS ITS OWN ENGLISH. Hold-for-English translates the HUD, and
//      a Korean-only line would drop out of the one mode built for players who
//      cannot read it. The English translates the voice, not the words.
//
// `type` keys match FOOD_TYPES in restaurants.js. A dish type with no entry
// falls back to the general pool.

/** Rider-facing requests — shown on the offer and on the delivery leg. */
export const DELIVERY_NOTES = [
  { ko: '문 앞에 두고 벨 눌러주세요.', en: 'Leave it at the door and ring the bell.' },
  { ko: '벨 누르지 말아주세요. 아기가 자고 있어요.', en: 'Please don’t ring — the baby is asleep.' },
  { ko: '초인종 고장났어요. 노크 부탁드립니다.', en: 'The doorbell is broken — please knock.' },
  { ko: '공동현관 비밀번호는 #1204예요.', en: 'The lobby door code is #1204.' },
  { ko: '공동현관 열려 있어요. 바로 올라오세요.', en: 'The lobby door is open — come straight up.' },
  { ko: '엘리베이터 점검 중이라 계단으로 오셔야 해요. 죄송합니다 ㅠㅠ', en: 'The elevator is out, so it’s the stairs. I’m sorry ㅠㅠ' },
  { ko: '4층인데 엘리베이터가 없어요. 정말 죄송합니다.', en: 'Fourth floor, no elevator. I really am sorry.' },
  { ko: '경비실에 맡겨주시면 제가 내려가서 받을게요.', en: 'Leave it with the security desk and I’ll come down for it.' },
  { ko: '후문으로 와주세요. 정문은 잠겨 있어요.', en: 'Use the back gate — the front one is locked.' },
  { ko: '지하주차장 말고 골목 쪽에 세워주세요.', en: 'Park in the alley, not the underground garage.' },
  { ko: '개가 짖어도 안 물어요. 겁만 많은 애예요.', en: 'The dog barks but never bites — all noise.' },
  { ko: '전화 대신 문 앞에 두고 사진 한 장만 보내주세요.', en: 'No call please — just leave it and send a photo.' },
  { ko: '사무실이라 1층 로비에서 전화 주세요.', en: 'It’s an office — call me from the lobby.' },
  { ko: '야근 중이에요. 3층 불 켜진 창문으로 오시면 돼요.', en: 'Working late — head for the lit window on the third floor.' },
  { ko: '반지하라 계단이 가팔라요. 조심하세요.', en: 'Semi-basement, and the steps are steep. Watch yourself.' },
  { ko: '비 와서 미끄러워요. 천천히 오세요.', en: 'It’s slick out there in the rain. Take it slow.' },
  { ko: '급하지 않으니까 신호 꼭 지켜주세요.', en: 'No rush at all — please don’t run any lights.' },
  { ko: '배고파 죽겠어요… 조금만 서둘러 주세요!', en: 'I’m starving over here… please hurry!' },
  { ko: '문고리에 걸어주세요. 튼튼해요.', en: 'Hang it on the door handle — it will hold.' },
  { ko: '신발장 위에 올려두시면 돼요.', en: 'Setting it on the shoe cabinet is fine.' },
  { ko: '502호예요. 501호로 잘못 간 적 있어요.', en: 'It’s unit 502 — a driver left it at 501 once.' },
  { ko: '옆집 벨 누르지 마세요. 저희는 왼쪽 문이에요.', en: 'Don’t ring next door — we’re the left-hand door.' },
  { ko: '계단에 택배 상자 쌓여 있어요. 발 조심하세요.', en: 'Parcels are stacked on the stairs. Mind your feet.' },
  { ko: '아이가 마중 나갈 거예요. 잠깐만 기다려주세요.', en: 'My kid is coming down to meet you — one moment.' },
  { ko: '차 소리 좀 줄여주세요. 관리실이 예민해요.', en: 'Go easy on the engine — building management is touchy.' },
  { ko: '편의점 앞에서 기다리고 있을게요.', en: 'I’ll be waiting in front of the convenience store.' },
  { ko: '늦어도 괜찮아요. 안전운전 하세요!', en: 'Late is fine. Drive safe out there!' },
  { ko: '술자리라 시끄러워요. 벨 두 번 눌러주세요.', en: 'We’re a loud table tonight — ring twice.' },
  { ko: 'CCTV 아래 두고 가시면 돼요. 안 없어져요.', en: 'Leave it under the CCTV — nothing goes missing there.' },
  { ko: '문자 주시면 바로 나갈게요. 벨은 안 눌러도 돼요.', en: 'Text me and I’ll come right out. No need to ring.' },
  { ko: '우산 챙기셨어요? 곧 쏟아진대요.', en: 'Do you have an umbrella? It is about to pour.' },
];

/** Rider-facing requests that only make sense for one kind of food. */
export const DELIVERY_NOTES_BY_TYPE = {
  soup: [
    { ko: '국물 새면 다 못 먹어요. 살살 부탁드려요.', en: 'If the broth leaks the whole thing is ruined. Go gentle.' },
    { ko: '지난번엔 국물이 봉투에 다 샜어요. 이번엔 부탁드릴게요.', en: 'Last time the broth soaked the whole bag. Fingers crossed tonight.' },
    { ko: '국물 안 흘리고 오시면 별 다섯 개 드릴게요!', en: 'Get it here without a spill and it is five stars!' },
  ],
  fragile: [
    { ko: '유리병이라 급정거 조심해주세요.', en: 'There is glass in there — easy on the brakes.' },
    { ko: '깨지면 오늘 밤은 끝이에요. 조심조심!', en: 'If it breaks, my night is over. Careful, careful!' },
    { ko: '봉투 눕히지 말고 세워서 와주세요.', en: 'Keep the bag upright, never on its side.' },
  ],
  melts: [
    { ko: '녹기 전에 도착 부탁드려요. 냉동실 열어두고 기다릴게요.', en: 'Beat the melt — I’m holding the freezer open for you.' },
    { ko: '다 녹으면 그냥 마실게요… 그래도 서둘러 주세요.', en: 'If it melts I’ll just drink it… but please hurry.' },
  ],
  fast: [
    { ko: '식기 전에 와주시면 정말 감사하겠습니다.', en: 'Getting here before it cools would make my night.' },
    { ko: '뜨거울 때가 제일 맛있어요. 부탁드려요!', en: 'It is only good while it is hot. Please!' },
    { ko: '면 불면 슬퍼요. 조금만 서둘러 주세요.', en: 'Soggy noodles make me sad. Just a little faster.' },
  ],
  level: [
    { ko: '기울이지 말고 수평으로 부탁드려요.', en: 'Keep it flat — no tilting.' },
    { ko: '봉투 위에 아무것도 올리지 말아주세요.', en: 'Please don’t stack anything on top of the bag.' },
  ],
  normal: [
    { ko: '무거우니까 두 손으로 들어주세요.', en: 'It is heavy — use both hands.' },
    { ko: '봉투 두 개예요. 하나 두고 가시면 안 돼요!', en: 'There are two bags — please don’t leave one behind!' },
  ],
};

/** Kitchen-facing requests — shown on the pickup leg, where you collect them. */
export const KITCHEN_NOTES = [
  { ko: '단무지 빼주세요.', en: 'No pickled radish, please.' },
  { ko: '젓가락 두 벌 넣어주세요.', en: 'Two sets of chopsticks, please.' },
  { ko: '수저는 안 주셔도 돼요. 집에 있어요.', en: 'No cutlery needed, we have some at home.' },
  { ko: '덜 맵게 부탁드립니다. 아이가 같이 먹어요.', en: 'Mild, please — a child is eating too.' },
  { ko: '더 맵게 해주세요! 청양고추 추가요.', en: 'Make it hotter! Extra green chili.' },
  { ko: '소스는 따로 포장해주세요.', en: 'Sauce on the side, please.' },
  { ko: '비닐봉투 하나만 더 넣어주세요.', en: 'Could you add one more plastic bag?' },
  { ko: '김치 넉넉히 부탁드려요!', en: 'Be generous with the kimchi!' },
  { ko: '영수증은 빼주세요.', en: 'No receipt, thanks.' },
  { ko: '파 빼주세요. 알레르기 있어요.', en: 'No green onion — allergy.' },
  { ko: '오이 빼주세요. 진짜 못 먹어요.', en: 'No cucumber. Genuinely cannot eat it.' },
  { ko: '반찬은 안 주셔도 괜찮아요.', en: 'You can skip the side dishes.' },
  { ko: '일회용 컵 두 개만 부탁드려요.', en: 'Two paper cups, if you can.' },
  { ko: '포크도 같이 넣어주세요.', en: 'A fork as well, please.' },
  { ko: '봉투 입구 꼭 묶어주세요.', en: 'Please tie the bag shut.' },
  { ko: '뜨거우니까 이중 포장 부탁드립니다.', en: 'It is hot — double-bag it, please.' },
];

/** Kitchen requests tied to what is being cooked. */
export const KITCHEN_NOTES_BY_TYPE = {
  soup: [
    { ko: '국물은 따로 담아주세요.', en: 'Broth in a separate container, please.' },
    { ko: '면은 따로 부탁드려요. 불어요.', en: 'Noodles separate — they go soggy.' },
  ],
  fragile: [
    { ko: '뽁뽁이로 한 번 더 감아주세요.', en: 'One more layer of bubble wrap, please.' },
    { ko: '병은 따로 세워서 담아주세요.', en: 'Pack the bottles upright and on their own.' },
  ],
  melts: [
    { ko: '드라이아이스 하나만 넣어주세요.', en: 'Could you drop in some dry ice?' },
  ],
  fast: [
    { ko: '제일 뜨거울 때 보내주세요.', en: 'Send it out at its hottest.' },
  ],
  level: [
    { ko: '뚜껑 테이프로 고정해주세요.', en: 'Tape the lid down, please.' },
  ],
  normal: [
    { ko: '무거운 건 아래에 담아주세요.', en: 'Heavy things at the bottom of the bag, please.' },
  ],
};

/** Roughly half of real orders leave the kitchen box empty. So do these. */
const KITCHEN_NOTE_CHANCE = 0.55;
/** How often a dish-specific line beats the general pool, when one exists. */
const TYPED_NOTE_CHANCE = 0.5;

/**
 * One order's worth of notes.
 * @param {string} type            dish type key from FOOD_TYPES
 * @param {() => number} random    injectable so the data check can be deterministic
 * @returns {{note: {ko: string, en: string}, kitchenNote: ?{ko: string, en: string}}}
 */
export function pickOrderNotes(type, random = Math.random) {
  const pick = (list) => list[Math.min(list.length - 1, (random() * list.length) | 0)];
  const typed = DELIVERY_NOTES_BY_TYPE[type] || [];
  const note = typed.length && random() < TYPED_NOTE_CHANCE ? pick(typed) : pick(DELIVERY_NOTES);

  let kitchenNote = null;
  if (random() < KITCHEN_NOTE_CHANCE) {
    const typedKitchen = KITCHEN_NOTES_BY_TYPE[type] || [];
    kitchenNote = typedKitchen.length && random() < TYPED_NOTE_CHANCE
      ? pick(typedKitchen)
      : pick(KITCHEN_NOTES);
  }
  return { note, kitchenNote };
}
