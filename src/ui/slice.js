// ?ui=slice — the HUD style slice.
//
// Drives a HUD design through the full order lifecycle over the live game so the
// visual language can be judged in context rather than as a flat mockup. The old
// HUD and the 3D waypoint arrow are hidden while it runs.
//
//   ?ui=slice            third pass (hud3.js) — current proposal
//   ?ui=slice&v=2        second pass (hud2.js) — for A/B against the above
//   ?ui=slice&scene=ID   pin one scene instead of cycling
//                        ID: idle | offer | pickup | urgent | spill | payout
//
// Keys: 1-6 jump to a scene, 0 pauses/resumes the cycle.
//
// Scenes call condition/spill through optional chaining because the second pass
// has no food-condition readout — that gap is one of the things the third pass
// exists to close, and the slice should show the older design honestly rather
// than crash on it.

const SCENES = [
  {
    id: 'idle',
    title: '1 · 대기 IDLE',
    sub: 'Status rail only — nothing competes with the road.',
    enter(h) { h.hideOffer(); h.hideTicket(); h.setObjective(null); },
  },
  {
    id: 'offer',
    title: '2 · 주문 제안 OFFER',
    sub: 'The docket drops from the top edge, countdown on the hairline. '
       + 'Centre screen is reserved for things that leave again.',
    enter(h) {
      h.showOffer({
        shop: '신전 떡볶이',
        shopEn: 'Sinjeon Tteokbokki · 종로',
        dish: '떡볶이 + 김밥 세트 (Tteokbokki + gimbap set)',
        pay: 12584,
        distanceKm: 1.4,
        note: '엘리베이터 점검 중이라 계단으로 오셔야 해요. 죄송합니다 ㅠㅠ',
        noteEn: 'The elevator is out, so it’s the stairs. I’m sorry ㅠㅠ',
      });
      h.hideTicket();
      h.setObjective(null);
    },
    tick(h, t) { h.setOfferProgress(1 - t); },
  },
  {
    id: 'pickup',
    title: '3 · 픽업 중 TO PICKUP',
    sub: 'Ticket docks left. The objective sits inside it — navigation belongs '
       + 'to the job it serves, and bottom-centre stays clear for the van.',
    enter(h) {
      h.hideOffer();
      h.showTicket({
        to: '신전 떡볶이', stage: '픽업 · Pickup',
        seconds: 96, totalSeconds: 120, distanceKm: 1.4, condition: 1,
        note: '덜 맵게 부탁드립니다. 아이가 같이 먹어요.',
        noteEn: 'Mild, please — a child is eating too.',
        noteLabel: '가게 요청사항', noteLabelEn: 'Kitchen note',
      });
      h.toast('주문 수락됨', 'Order accepted');
    },
    tick(h, t) {
      h.updateTicket({ seconds: 96 - t * 40, totalSeconds: 120 });
      h.setObjective(1400 - t * 900, t * Math.PI * 1.2);
    },
  },
  {
    id: 'spill',
    title: '4 · 음식 상태 CONDITION',
    sub: 'The core mechanic, finally on screen: quality decays with time and '
       + 'drops on impact. Segmented, because a 3px smooth bar reads as mush.',
    enter(h) {
      h.hideOffer();
      h.showTicket({
        to: '역삼동 1201호', stage: '배달 · Deliver',
        seconds: 168, totalSeconds: 240, distanceKm: 0.9, condition: 1,
        note: '국물 새면 다 못 먹어요. 살살 부탁드려요.',
        noteEn: 'If the broth leaks the whole thing is ruined. Go gentle.',
      });
      this._knocks = [0.25, 0.5, 0.72];
      this._hit = 0;
    },
    tick(h, t) {
      h.updateTicket({ seconds: 168 - t * 60, totalSeconds: 240 });
      h.setObjective(900 - t * 600, -0.9 + t * 1.1);
      // Steady decay, plus three discrete knocks.
      let q = 1 - t * 0.35 - this._hit * 0.17;
      if (this._hit < this._knocks.length && t >= this._knocks[this._hit]) {
        this._hit++;
        q -= 0.17;
        h.spill?.();
        h.toast('취급주의! 음식이 흔들렸어요', 'Handle with care', 'bad');
      }
      h.setCondition?.(q);
    },
  },
  {
    id: 'urgent',
    title: '5 · 시간 부족 URGENT',
    sub: 'Under 20 seconds. Colour carries the alarm — clock, timer bar and '
       + 'condition all shift to pink together. No motion, no flashing.',
    enter(h) {
      h.hideOffer();
      h.showTicket({
        to: '역삼동 1201호', stage: '배달 · Deliver',
        seconds: 18, totalSeconds: 240, distanceKm: 0.3, condition: 0.28,
        note: '배고파 죽겠어요… 조금만 서둘러 주세요!',
        noteEn: 'I’m starving over here… please hurry!',
      });
      h.setCondition?.(0.28);
    },
    tick(h, t) {
      h.updateTicket({ seconds: 18 - t * 12, totalSeconds: 240 });
      h.setObjective(300 - t * 240, -0.4 + t * 0.5);
    },
  },
  {
    id: 'payout',
    title: '6 · 배달 완료 PAYOUT',
    sub: 'Ticket clears, cash counts up and bumps once. The rating chip is the '
       + 'only other thing that moves.',
    enter(h) {
      h.hideOffer();
      h.hideTicket();
      h.setObjective(null);
      h.toast('배달 완료 · +₩12,584', 'Delivered · rated ★★★★★', 'win');
      this._from = 184200;
      this._to = 196784;
      this._done = false;
    },
    tick(h, t) {
      const k = Math.min(1, t / 0.35);
      h.setCash(this._from + (this._to - this._from) * k);
      if (!this._done && k >= 1) {
        this._done = true;
        h.setCash(this._to, { bump: true });
        h.setStats({ rating: 4.9, deliveries: 24 });
      }
    },
  },
];

const DURATION = 5.0; // seconds per scene

export async function startUISlice({ hudEl, orders, params }) {
  const qp = params ?? new URLSearchParams(location.search);

  // Hide the old HUD and the 3D order markers so the slice stands alone.
  if (hudEl) hudEl.style.display = 'none';
  orders?.setMarkersVisible?.(false);

  const version = qp.get('v') === '2' ? '2' : '3';
  const hud = version === '2'
    ? new (await import('./hud2.js')).HUD2()
    : new (await import('./hud3.js')).HUD3();

  hud.setCash(184200);
  hud.setStats({ rating: 4.8, deliveries: 23 });

  let i = 0;
  let t = 0;
  let paused = false;

  const enter = (n) => {
    i = (n + SCENES.length) % SCENES.length;
    t = 0;
    SCENES[i].enter(hud);
    hud.note(`${SCENES[i].title}   —   PASS ${version}`, SCENES[i].sub);
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Digit0') { paused = !paused; return; }
    const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
    if (n >= 0) { paused = true; enter(n); }
  });

  // ?scene=ID pins one state so a link opens straight into it.
  const pinned = SCENES.findIndex((s) => s.id === qp.get('scene'));
  if (pinned >= 0) { paused = true; enter(pinned); } else { enter(0); }

  return {
    hud,
    update(dt, phys) {
      hud.setSpeed(phys ? phys.speedKmh : 0);
      const tick = () => SCENES[i].tick?.call(SCENES[i], hud, Math.min(1, t / DURATION));
      if (paused) {
        // Pinned scenes still animate, they just never advance.
        t = Math.min(t + dt, DURATION);
        tick();
        return;
      }
      t += dt;
      tick();
      if (t >= DURATION) enter(i + 1);
    },
  };
}
