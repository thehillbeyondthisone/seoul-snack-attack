// Seoul Delivery — HUD, second pass. STYLE SLICE.
//
// Deliberately scoped: this is the vertical slice used to agree the visual
// language before it gets rolled across the rest of the UI. It implements the
// four elements that share type, colour and framing — status rail, order card,
// speedometer, objective chip — as real, reusable components rather than a
// throwaway mock, so whatever survives review ships as-is.
//
// Reachable via ?ui=slice. The existing HUD is untouched.
//
// The design idea: a delivery *docket*. Korean-first, English as a quiet
// second line, tabular figures throughout, dark glass with one hot neon edge,
// and a notched corner on every panel so the whole HUD reads as printed
// receipts pinned over the windscreen.

const CSS = `
#hud2 {
  --ink: #eef4ff;
  --muted: rgba(238,244,255,0.52);
  --faint: rgba(238,244,255,0.30);
  --panel: rgba(9,12,20,0.74);
  --panel-solid: rgba(9,12,20,0.94);
  --edge: rgba(238,244,255,0.12);
  --accent: #ff2d78;
  --accent-2: #4dc8ff;
  --money: #ffd35c;
  --good: #5ce8a8;
  --notch: 14px;

  position: fixed; inset: 0; z-index: 40;
  pointer-events: none;
  color: var(--ink);
  font-family: 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', system-ui, -apple-system, sans-serif;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}
#hud2 .panel {
  background: var(--panel);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  border: 1px solid var(--edge);
  /* The notch is the signature: one cut corner, like a torn docket. */
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - var(--notch)), calc(100% - var(--notch)) 100%, 0 100%);
  box-shadow: 0 18px 40px rgba(0,0,0,0.55);
}
#hud2 .en {
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--muted); font-weight: 600;
}

/* ---- status rail (top right) ---------------------------------------- */
#hud2 .rail {
  position: absolute; top: 18px; right: 18px;
  display: flex; flex-direction: column; align-items: stretch; gap: 8px;
  min-width: 190px;
}
#hud2 .cash { padding: 10px 14px 11px; position: relative; }
#hud2 .cash::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px;
  background: var(--money); box-shadow: 0 0 14px var(--money);
}
#hud2 .cash .amt {
  font-size: 27px; font-weight: 800; line-height: 1; color: var(--money);
  letter-spacing: -0.01em; text-shadow: 0 0 22px rgba(255,211,92,0.45);
}
#hud2 .cash .amt small { font-size: 17px; margin-right: 2px; opacity: 0.85; }
#hud2 .cash .lbl { margin-top: 5px; }

#hud2 .chips { display: flex; gap: 8px; }
#hud2 .chip {
  flex: 1; padding: 7px 10px 8px; display: flex; flex-direction: column; gap: 3px;
  --notch: 9px;
}
#hud2 .chip .v { font-size: 15px; font-weight: 700; line-height: 1; }
#hud2 .chip .k { font-size: 9px; letter-spacing: 0.14em; color: var(--faint); text-transform: uppercase; }
#hud2 .chip.rating .v { color: var(--good); }

/* ---- order card (top centre, out of the driving line) ---------------- */
#hud2 .order {
  position: absolute; top: 20px; left: 50%;
  transform: translate(-50%, -14px); opacity: 0;
  width: 386px; padding: 0; overflow: hidden;
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.2,0.9,0.3,1);
}
#hud2 .order.show { opacity: 1; transform: translate(-50%, 0); }
#hud2 .order .strip {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 14px; background: linear-gradient(90deg, var(--accent), rgba(255,45,120,0));
  border-bottom: 1px solid var(--edge);
}
#hud2 .order .strip .en { color: #fff; opacity: 0.95; }
#hud2 .order .strip .dist { font-size: 11px; font-weight: 700; color: #fff; }
#hud2 .order .body { padding: 13px 16px 15px; }
#hud2 .order .shop { font-size: 20px; font-weight: 800; line-height: 1.15; }
#hud2 .order .shop-en { margin-top: 3px; }
#hud2 .order .dish {
  margin-top: 9px; padding-top: 9px; border-top: 1px dashed rgba(238,244,255,0.16);
  font-size: 13px; color: rgba(238,244,255,0.82);
}
#hud2 .order .foot { margin-top: 12px; display: flex; align-items: flex-end; justify-content: space-between; }
#hud2 .order .pay { font-size: 25px; font-weight: 800; color: var(--money); line-height: 1; }
#hud2 .order .pay small { font-size: 16px; opacity: 0.85; }
#hud2 .order .accept {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: var(--accent-2);
}
#hud2 .key {
  display: inline-grid; place-items: center; min-width: 19px; height: 19px; padding: 0 5px;
  border: 1px solid var(--accent-2); color: var(--accent-2);
  font-size: 11px; font-weight: 800; border-radius: 3px;
  box-shadow: 0 0 12px rgba(77,200,255,0.35); background: rgba(77,200,255,0.10);
}
/* Countdown bar for the offer window. */
#hud2 .order .timer { height: 2px; background: rgba(238,244,255,0.10); }
#hud2 .order .timer i { display: block; height: 100%; width: 100%; background: var(--accent); box-shadow: 0 0 10px var(--accent); }

/* ---- active ticket (left) ------------------------------------------- */
#hud2 .ticket {
  position: absolute; top: 20px; left: 18px; width: 234px;
  padding: 0; opacity: 0; transform: translateX(-12px);
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.2,0.9,0.3,1);
  overflow: hidden;
}
#hud2 .ticket.show { opacity: 1; transform: none; }
#hud2 .ticket .head {
  padding: 7px 12px; display: flex; justify-content: space-between; align-items: center;
  border-bottom: 1px solid var(--edge); background: rgba(77,200,255,0.10);
}
#hud2 .ticket .head .en { color: var(--accent-2); }
#hud2 .ticket .body { padding: 11px 12px 12px; }
#hud2 .ticket .to { font-size: 15px; font-weight: 700; line-height: 1.2; }
#hud2 .ticket .clock {
  margin-top: 9px; display: flex; align-items: baseline; gap: 7px;
}
#hud2 .ticket .clock .t { font-size: 25px; font-weight: 800; line-height: 1; letter-spacing: 0.01em; }
#hud2 .ticket.warn .clock .t { color: var(--accent); text-shadow: 0 0 18px rgba(255,45,120,0.5); }
#hud2 .ticket .bar { margin-top: 9px; height: 3px; background: rgba(238,244,255,0.10); }
#hud2 .ticket .bar i { display: block; height: 100%; background: var(--accent-2); box-shadow: 0 0 10px var(--accent-2); transition: width 0.2s linear; }
#hud2 .ticket.warn .bar i { background: var(--accent); box-shadow: 0 0 10px var(--accent); }

/* ---- objective chip: replaces the giant 3D arrow -------------------- */
#hud2 .objective {
  position: absolute; left: 50%; bottom: 92px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 9px; padding: 7px 13px 8px;
  opacity: 0; transition: opacity 0.2s ease; --notch: 10px;
}
#hud2 .objective.show { opacity: 1; }
#hud2 .objective .arrow {
  width: 17px; height: 17px; color: var(--accent-2);
  filter: drop-shadow(0 0 7px rgba(77,200,255,0.7));
  transition: transform 0.12s linear;
}
#hud2 .objective .d { font-size: 15px; font-weight: 800; }
#hud2 .objective .d small { font-size: 10px; color: var(--muted); margin-left: 2px; font-weight: 600; }

/* ---- speed (bottom right) ------------------------------------------- */
#hud2 .speed {
  position: absolute; right: 20px; bottom: 20px;
  display: flex; align-items: baseline; gap: 6px;
  text-shadow: 0 2px 18px rgba(0,0,0,0.8);
}
#hud2 .speed .v {
  font-size: 62px; font-weight: 800; line-height: 0.85; letter-spacing: -0.03em;
}
#hud2 .speed .u { font-size: 12px; letter-spacing: 0.16em; color: var(--muted); font-weight: 700; }
#hud2 .speed .gauge {
  position: absolute; right: 0; bottom: -9px; width: 152px; height: 3px;
  background: rgba(238,244,255,0.12);
}
#hud2 .speed .gauge i {
  display: block; height: 100%; width: 0%;
  background: linear-gradient(90deg, var(--accent-2), var(--accent));
  box-shadow: 0 0 12px rgba(255,45,120,0.55);
  transition: width 0.08s linear;
}

/* ---- toast (bottom left) -------------------------------------------- */
#hud2 .toasts {
  position: absolute; left: 18px; bottom: 20px;
  display: flex; flex-direction: column-reverse; gap: 7px;
}
#hud2 .toast {
  padding: 9px 13px 10px; font-size: 13px; font-weight: 600; --notch: 10px;
  border-left: 2px solid var(--accent-2);
  animation: hud2in 0.22s cubic-bezier(0.2,0.9,0.3,1);
}
#hud2 .toast.win { border-left-color: var(--good); }
#hud2 .toast.bad { border-left-color: var(--accent); }
#hud2 .toast .en { margin-top: 2px; }
@keyframes hud2in { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: none; } }

/* ---- slice-only caption --------------------------------------------- */
#hud2 .slice-note {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  text-align: center; opacity: 0.9;
}
#hud2 .slice-note .t { font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--accent-2); }
#hud2 .slice-note .s { margin-top: 6px; font-size: 11px; color: var(--muted); }
`;

const ARROW_SVG = `<svg class="arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L21 21 L12 16.6 L3 21 Z"/></svg>`;

const won = (n) => `<small>₩</small>${Math.round(n).toLocaleString('ko-KR')}`;
const mmss = (s) => {
  const m = Math.max(0, Math.floor(s / 60));
  const r = Math.max(0, Math.floor(s % 60));
  return `${m}:${String(r).padStart(2, '0')}`;
};

export class HUD2 {
  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const el = document.createElement('div');
    el.id = 'hud2';
    el.innerHTML = `
      <div class="rail">
        <div class="panel cash">
          <div class="amt" id="h2cash"><small>₩</small>0</div>
          <div class="lbl en">보유 현금 · Cash</div>
        </div>
        <div class="chips">
          <div class="panel chip rating"><div class="v" id="h2rating">—</div><div class="k">평점 rating</div></div>
          <div class="panel chip"><div class="v" id="h2deliv">0</div><div class="k">배달 runs</div></div>
        </div>
      </div>

      <div class="panel order" id="h2order">
        <div class="strip"><span class="en">새 주문 · New order</span><span class="dist" id="h2dist">0.0 km</span></div>
        <div class="body">
          <div class="shop" id="h2shop">—</div>
          <div class="shop-en en" id="h2shopen">—</div>
          <div class="dish" id="h2dish">—</div>
          <div class="foot">
            <div class="pay" id="h2pay"><small>₩</small>0</div>
            <div class="accept"><span class="key">E</span><span>수락 ACCEPT</span></div>
          </div>
        </div>
        <div class="timer"><i id="h2offerbar"></i></div>
      </div>

      <div class="panel ticket" id="h2ticket">
        <div class="head"><span class="en" id="h2tstage">픽업 · Pickup</span><span class="en" id="h2tdist">0.0 km</span></div>
        <div class="body">
          <div class="to" id="h2to">—</div>
          <div class="clock"><span class="t" id="h2time">0:00</span><span class="en">남은 시간 · Remaining</span></div>
          <div class="bar"><i id="h2tbar"></i></div>
        </div>
      </div>

      <div class="panel objective" id="h2obj">${ARROW_SVG}<div class="d" id="h2objd">0<small>m</small></div></div>

      <div class="speed">
        <div class="v" id="h2speed">0</div><div class="u">km/h</div>
        <div class="gauge"><i id="h2gauge"></i></div>
      </div>

      <div class="toasts" id="h2toasts"></div>
    `;
    document.body.appendChild(el);
    this.el = el;
    const $ = (id) => el.querySelector(`#${id}`);
    this.$ = {
      cash: $('h2cash'), rating: $('h2rating'), deliv: $('h2deliv'),
      order: $('h2order'), shop: $('h2shop'), shopen: $('h2shopen'), dish: $('h2dish'),
      pay: $('h2pay'), dist: $('h2dist'), offerbar: $('h2offerbar'),
      ticket: $('h2ticket'), tstage: $('h2tstage'), tdist: $('h2tdist'), to: $('h2to'),
      time: $('h2time'), tbar: $('h2tbar'),
      obj: $('h2obj'), objd: $('h2objd'), arrow: el.querySelector('.objective .arrow'),
      speed: $('h2speed'), gauge: $('h2gauge'), toasts: $('h2toasts'),
    };
    this.maxSpeed = 110;
  }

  setCash(v) { this.$.cash.innerHTML = won(v); }
  setStats({ rating, deliveries }) {
    if (rating != null) this.$.rating.textContent = rating > 0 ? `★ ${rating.toFixed(1)}` : '—';
    if (deliveries != null) this.$.deliv.textContent = deliveries;
  }
  setSpeed(kmh) {
    this.$.speed.textContent = Math.round(Math.abs(kmh));
    this.$.gauge.style.width = `${Math.min(100, (Math.abs(kmh) / this.maxSpeed) * 100)}%`;
  }

  showOffer({ shop, shopEn, dish, pay, distanceKm }) {
    this.$.shop.textContent = shop;
    this.$.shopen.textContent = shopEn;
    this.$.dish.textContent = dish;
    this.$.pay.innerHTML = won(pay);
    this.$.dist.textContent = `${distanceKm.toFixed(1)} km`;
    this.$.order.classList.add('show');
  }
  /** @param {number} t 1 → 0 as the offer window closes */
  setOfferProgress(t) { this.$.offerbar.style.width = `${Math.max(0, Math.min(1, t)) * 100}%`; }
  hideOffer() { this.$.order.classList.remove('show'); }

  showTicket({ to, stage, seconds, totalSeconds, distanceKm }) {
    this.$.to.textContent = to;
    this.$.tstage.textContent = stage;
    this.$.tdist.textContent = `${distanceKm.toFixed(1)} km`;
    this.updateTicket({ seconds, totalSeconds });
    this.$.ticket.classList.add('show');
  }
  updateTicket({ seconds, totalSeconds }) {
    this.$.time.textContent = mmss(seconds);
    const f = totalSeconds > 0 ? seconds / totalSeconds : 0;
    this.$.tbar.style.width = `${Math.max(0, Math.min(1, f)) * 100}%`;
    this.$.ticket.classList.toggle('warn', seconds <= 20);
  }
  hideTicket() { this.$.ticket.classList.remove('show'); }

  /**
   * The old waypoint was a huge 3D arrow parked in the middle of the screen.
   * This is a compact chip that rotates toward the target and shows range —
   * same information, none of the view blocked.
   * @param {number} bearingRad 0 = dead ahead, clockwise
   */
  setObjective(metres, bearingRad) {
    if (metres == null) { this.$.obj.classList.remove('show'); return; }
    this.$.obj.classList.add('show');
    this.$.objd.innerHTML = metres >= 1000
      ? `${(metres / 1000).toFixed(1)}<small>km</small>`
      : `${Math.round(metres)}<small>m</small>`;
    this.$.arrow.style.transform = `rotate(${bearingRad}rad)`;
  }

  toast(ko, en = '', kind = '') {
    const t = document.createElement('div');
    t.className = `panel toast ${kind}`;
    t.innerHTML = `<div>${ko}</div>${en ? `<div class="en">${en}</div>` : ''}`;
    this.$.toasts.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .3s ease';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 320);
    }, 2600);
  }

  note(title, sub) {
    let n = this.el.querySelector('.slice-note');
    if (!n) {
      n = document.createElement('div');
      n.className = 'slice-note';
      this.el.appendChild(n);
    }
    n.innerHTML = `<div class="t">${title}</div><div class="s">${sub}</div>`;
  }

  dispose() { this.el.remove(); }
}
