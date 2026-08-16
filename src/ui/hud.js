// Seoul Delivery — DOM HUD: cash, order ticket, toasts, hint bar.
// Korean-primary with English subtitles, dark glassy noir + neon-pink accent.

const CSS = `
#hud * { box-sizing: border-box; margin: 0; padding: 0; }
#hud {
  position: fixed; inset: 0; pointer-events: none; z-index: 50;
  font-family: 'Segoe UI', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
  color: #e8e6df;
}
.hud-panel {
  background: rgba(10, 12, 20, 0.62);
  border: 1px solid rgba(255, 45, 120, 0.35);
  border-radius: 10px;
  backdrop-filter: blur(8px);
  box-shadow: 0 0 18px rgba(255, 45, 120, 0.12), inset 0 0 24px rgba(0,0,0,0.4);
  padding: 10px 14px;
}
#hud-cash {
  position: absolute; top: 16px; right: 16px; text-align: right;
  font-size: 26px; font-weight: 700; color: #ffd35c; letter-spacing: 1px;
}
#hud-cash .sub { font-size: 11px; color: #9aa0b4; font-weight: 400; letter-spacing: 2px; }
#hud-ticket {
  position: absolute; top: 16px; left: 16px; width: 280px;
  display: none;
}
#hud-ticket .rest { font-size: 16px; font-weight: 700; color: #ff2d78; }
#hud-ticket .dish { font-size: 13px; margin-top: 2px; }
#hud-ticket .dish .en { color: #9aa0b4; font-size: 11px; }
#hud-ticket .phase { font-size: 12px; color: #29e6ff; margin-top: 6px; }
#hud-ticket .dist { font-size: 12px; color: #e8e6df; }
#hud-ticket .bar { height: 6px; border-radius: 3px; background: #1c2230; margin-top: 6px; overflow: hidden; }
#hud-ticket .bar > div { height: 100%; transition: width 0.15s linear; }
#hud-ticket .timer > div { background: linear-gradient(90deg, #ff2d78, #ff7b1c); }
#hud-ticket .quality > div { background: linear-gradient(90deg, #2dd4ff, #7bff9e); }
#hud-ticket .lbl { font-size: 10px; color: #9aa0b4; margin-top: 6px; letter-spacing: 1px; }
#hud-offer {
  position: absolute; top: 90px; left: 50%; transform: translateX(-50%);
  width: 340px; text-align: center; display: none;
  border-color: rgba(41, 230, 255, 0.5);
  box-shadow: 0 0 22px rgba(41, 230, 255, 0.18);
}
#hud-offer .title { font-size: 13px; color: #29e6ff; letter-spacing: 2px; }
#hud-offer .rest { font-size: 18px; font-weight: 700; margin-top: 4px; }
#hud-offer .dish { font-size: 13px; color: #c9ccda; margin-top: 2px; }
#hud-offer .pay { font-size: 20px; font-weight: 700; color: #ffd35c; margin-top: 6px; }
#hud-offer .accept { font-size: 12px; color: #7bff9e; margin-top: 6px; animation: hud-blink 1s infinite; }
@keyframes hud-blink { 50% { opacity: 0.35; } }
#hud-toast {
  position: absolute; bottom: 110px; left: 50%; transform: translateX(-50%);
  font-size: 17px; font-weight: 600; padding: 10px 22px;
  opacity: 0; transition: opacity 0.25s; white-space: nowrap;
}
#hud-speed {
  position: absolute; bottom: 56px; right: 20px; text-align: right;
  font-size: 30px; font-weight: 700; color: #e8e6df;
}
#hud-speed .unit { font-size: 12px; color: #9aa0b4; font-weight: 400; }
#hud-hint {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  font-size: 11.5px; color: #9aa0b4; letter-spacing: 0.5px; white-space: nowrap;
}
#hud-hint b { color: #e8e6df; font-weight: 600; }
`;

export class HUD {
  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div id="hud-cash" class="hud-panel">₩0<div class="sub">보유 현금 · CASH</div></div>
      <div id="hud-ticket" class="hud-panel">
        <div class="rest"></div>
        <div class="dish"></div>
        <div class="phase"></div>
        <div class="dist"></div>
        <div class="lbl">남은 시간 · TIME</div>
        <div class="bar timer"><div style="width:100%"></div></div>
        <div class="lbl">음식 상태 · QUALITY</div>
        <div class="bar quality"><div style="width:100%"></div></div>
      </div>
      <div id="hud-offer" class="hud-panel">
        <div class="title">새 주문 · NEW ORDER</div>
        <div class="rest"></div>
        <div class="dish"></div>
        <div class="pay"></div>
        <div class="accept">[E] 수락하기 · ACCEPT</div>
      </div>
      <div id="hud-toast" class="hud-panel"></div>
      <div id="hud-speed">0 <span class="unit">km/h</span></div>
      <div id="hud-hint">
        <b>W/A/S/D</b> 주행 · <b>Space</b> 사이드브레이크 · <b>R</b> 리셋 ·
        <b>E</b> 주문 수락 · <b>\`</b> 디버그 메뉴
      </div>
    `;
    document.body.appendChild(this.root);

    this.cashEl = this.root.querySelector('#hud-cash');
    this.ticketEl = this.root.querySelector('#hud-ticket');
    this.offerEl = this.root.querySelector('#hud-offer');
    this.toastEl = this.root.querySelector('#hud-toast');
    this.speedEl = this.root.querySelector('#hud-speed');
    this._toastTimer = null;
  }

  setCash(n) {
    this.cashEl.innerHTML = `₩${Math.round(n).toLocaleString()}<div class="sub">보유 현금 · CASH</div>`;
  }

  setSpeed(kmh) {
    this.speedEl.innerHTML = `${Math.round(kmh)} <span class="unit">km/h</span>`;
  }

  showOffer(order) {
    const { rest, dish, payout, dist } = order;
    this.offerEl.querySelector('.rest').textContent = `${rest.nameKo} · ${rest.nameEn}`;
    this.offerEl.querySelector('.dish').textContent =
      `${dish.nameKo} (${dish.nameEn}) — ${(dist / 1000).toFixed(1)}km`;
    this.offerEl.querySelector('.pay').textContent = `₩${payout.toLocaleString()}`;
    this.offerEl.style.display = 'block';
  }

  hideOffer() {
    this.offerEl.style.display = 'none';
  }

  showTicket(order, phase) {
    this.hideOffer();
    this.ticketEl.querySelector('.rest').textContent = order.rest.nameKo;
    this.ticketEl.querySelector('.dish').innerHTML =
      `${order.dish.nameKo} <span class="en">${order.dish.nameEn} · ${order.type.ko}</span>`;
    this.ticketEl.style.display = 'block';
    const isDeliver = phase === 'delivering';
    this.ticketEl.querySelectorAll('.bar, .lbl').forEach((el) => {
      el.style.display = isDeliver ? '' : 'none';
    });
  }

  updateTicket({ phase, distance, timer, timerMax, quality, spill }) {
    if (this.ticketEl.style.display === 'none') return;
    this.ticketEl.querySelector('.phase').textContent = phase ?? '';
    this.ticketEl.querySelector('.dist').textContent =
      distance != null ? `목표까지 ${distance < 100 ? Math.round(distance) + 'm' : (distance / 1000).toFixed(2) + 'km'}` : '';
    if (timer != null) {
      const t = Math.max(0, timer / timerMax);
      this.ticketEl.querySelector('.timer > div').style.width = `${t * 100}%`;
    }
    if (quality != null) {
      this.ticketEl.querySelector('.quality > div').style.width = `${quality}%`;
      if (spill > 5) {
        this.ticketEl.querySelector('.quality > div').style.background =
          'linear-gradient(90deg, #ff7b1c, #ff2d78)';
      }
    }
  }

  hideTicket() {
    this.ticketEl.style.display = 'none';
  }

  toast(msg, ms = 2000) {
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.toastEl.style.opacity = '0'; }, ms);
  }
}
