// Seoul Delivery — HUD, third pass. STYLE SLICE.
//
// Same intent as hud2.js (agree the visual language before rolling it across
// the UI), but six things changed. Each is a decision, not a tweak:
//
// 1. THE NOTCH NOW HAS AN EDGE. hud2 put `clip-path` and `border` on the same
//    element — clip-path cuts the border away along the diagonal, so the signature
//    corner was the one corner with no line on it. It read as a rendering glitch.
//    Here the panel's own background IS the edge colour and a ::before inset by
//    1px carries the fill, both clipped by the same polygon, so the hairline
//    follows the cut all the way round. One backdrop-filter, on the parent.
//
// 2. THE NOTCH IS RESERVED. hud2 notched every panel, which means nothing was
//    notched — a signature applied uniformly stops being a signature. The cut
//    corner now marks the *paper*: the order docket and the active ticket. Money,
//    speed and toasts are square. The shape carries meaning.
//
// 3. FOOD CONDITION IS ON SCREEN. It is the core mechanic — orders.js decays
//    quality every frame and penalises spills — and hud2 had nowhere to show it.
//    A 14-segment meter, because at 3px tall a segmented bar reads as a printed
//    scale where a smooth gradient reads as mush.
//
// 4. THREE ACCENTS, ONE JOB EACH. hud2 ran pink + cyan + gold + green.
//    Now: GOLD is money and only money. CYAN is navigation and interaction.
//    PINK is urgency and damage. Green is gone (the rating star is money-adjacent,
//    so it takes gold). If you need a fourth colour the layout is wrong.
//
// 5. FOUR ANCHORS, NOT SIX. hud2 filled a band across the top (ticket, order,
//    rail) and another across the bottom (toast, objective, speed). The objective
//    chip is now docked inside the ticket — navigation belongs to the delivery it
//    serves — which clears bottom-centre, where the chase cam puts the van and the
//    vanishing point. Persistent state lives in corners; transient state (the
//    order offer) is the only thing allowed centre-screen, and only while it lasts.
//
// 6. SCRIMS INSTEAD OF HEAVIER GLASS. Dark panels over a dark road are invisible;
//    the same panels over a white-hot neon sign turn to soup. Each corner cluster
//    sits on a soft gradient scrim, so contrast is guaranteed by the background
//    rather than by making every panel more opaque. That let the glass get
//    *lighter*, and cut the backdrop-filter count from 8 to 4.

const CUT = 'polygon(0 0, 100% 0, 100% calc(100% - var(--notch)), calc(100% - var(--notch)) 100%, 0 100%)';

const CSS = `
#hud3 {
  --ink: #eef4ff;
  --muted: rgba(238,244,255,0.54);
  --faint: rgba(238,244,255,0.30);
  /* 0.72 was not enough: the tl panel lands on a lit tree canopy and the foliage
     read straight through the type. Glass has to beat the busiest thing behind it. */
  --panel: rgba(8,11,18,0.84);
  --edge: rgba(238,244,255,0.20);
  --money: #ffd35c;
  --nav: #4dc8ff;
  --alarm: #ff2d78;
  --notch: 0px;

  position: fixed; inset: 0; z-index: 40;
  pointer-events: none;
  color: var(--ink);
  font-family: Inter, 'Segoe UI Variable', 'Segoe UI', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

/* ---- scrims: contrast comes from the background, not from opaque panels -- */
#hud3 .scrim { position: absolute; pointer-events: none; }
#hud3 .scrim.tl { top: 0; left: 0; width: 440px; height: 300px;
  background: radial-gradient(115% 115% at 0% 0%, rgba(2,4,9,0.60), rgba(2,4,9,0) 68%); }
#hud3 .scrim.tr { top: 0; right: 0; width: 400px; height: 240px;
  background: radial-gradient(115% 115% at 100% 0%, rgba(2,4,9,0.60), rgba(2,4,9,0) 68%); }
/* Heaviest of the four: the van's own headlights pool on the wet road bottom-left,
   which is the brightest thing on screen and sits exactly under the legend. */
#hud3 .scrim.bl { bottom: 0; left: 0; width: 520px; height: 280px;
  background: radial-gradient(120% 120% at 0% 100%, rgba(2,4,9,0.78), rgba(2,4,9,0) 72%); }
#hud3 .scrim.br { bottom: 0; right: 0; width: 420px; height: 240px;
  background: radial-gradient(115% 115% at 100% 100%, rgba(2,4,9,0.62), rgba(2,4,9,0) 68%); }

/* ---- panel: background IS the hairline; ::before carries the fill -------- */
#hud3 .panel {
  position: relative;
  background: var(--edge);
  clip-path: ${CUT};
  box-shadow: 0 16px 38px rgba(0,0,0,0.5);
}
#hud3 .panel::before {
  content: ''; position: absolute; inset: 1px;
  clip-path: ${CUT};
  background: var(--panel);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
}
#hud3 .panel > * { position: relative; z-index: 1; }
/* The paper. Only these two get cut corners. */
#hud3 .docket { --notch: 15px; }

#hud3 .en {
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--muted); font-weight: 600;
}

/* ---- status rail (top right) — money and standing ----------------------- */
#hud3 .rail {
  position: absolute; top: 18px; right: 18px;
  display: flex; flex-direction: column; align-items: stretch; gap: 7px;
  min-width: 196px;
}
#hud3 .cash { padding: 10px 14px 11px; }
#hud3 .cash::after {
  content: ''; position: absolute; left: 1px; top: 1px; bottom: 1px; width: 2px;
  background: var(--money); box-shadow: 0 0 14px var(--money); z-index: 2;
}
#hud3 .cash .amt {
  font-size: 27px; font-weight: 800; line-height: 1; color: var(--money);
  letter-spacing: -0.01em; text-shadow: 0 0 22px rgba(255,211,92,0.40);
}
#hud3 .cash .amt small { font-size: 17px; margin-right: 2px; opacity: 0.85; }
#hud3 .cash .lbl { margin-top: 5px; }
#hud3 .cash .amt.bump { animation: h3bump 0.45s cubic-bezier(0.2,0.9,0.3,1); }
@keyframes h3bump { 30% { transform: scale(1.09); } }

#hud3 .chips { display: flex; gap: 7px; }
#hud3 .chip { flex: 1; padding: 7px 10px 8px; }
#hud3 .chip .v { font-size: 15px; font-weight: 700; line-height: 1; }
#hud3 .chip .k { font-size: 9px; letter-spacing: 0.14em; color: var(--faint);
  text-transform: uppercase; margin-top: 4px; }
#hud3 .chip.rating .v { color: var(--money); }

/* ---- order docket (top centre, transient) ------------------------------- */
#hud3 .order {
  position: absolute; top: 20px; left: 50%;
  transform: translate(-50%, -16px); opacity: 0;
  width: 392px;
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.2,0.9,0.3,1);
}
#hud3 .order.show { opacity: 1; transform: translate(-50%, 0); }
#hud3 .order.show { pointer-events: auto; cursor: pointer; }
#hud3 .order.show:hover { filter: brightness(1.08); }
#hud3 .order .strip {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 15px; margin: 1px 1px 0;
  background: linear-gradient(90deg, var(--alarm), rgba(255,45,120,0));
}
#hud3 .order .strip .en { color: #fff; opacity: 0.95; }
#hud3 .order .strip .dist { font-size: 11px; font-weight: 700; color: #fff; }
#hud3 .order .body { padding: 13px 17px 15px; }
#hud3 .order .shop { font-size: 20px; font-weight: 800; line-height: 1.15; }
#hud3 .order .shop-en { margin-top: 3px; }
#hud3 .order .dish {
  margin-top: 9px; padding-top: 9px; border-top: 1px dashed rgba(238,244,255,0.18);
  font-size: 13px; color: rgba(238,244,255,0.82);
}
#hud3 .order .foot {
  margin-top: 12px; display: flex; align-items: flex-end; justify-content: space-between;
}
#hud3 .order .pay { font-size: 25px; font-weight: 800; color: var(--money); line-height: 1; }
#hud3 .order .pay small { font-size: 16px; opacity: 0.85; }
#hud3 .order .accept {
  display: flex; align-items: center; gap: 7px; padding-bottom: 2px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: var(--nav);
}
#hud3 .key {
  display: inline-grid; place-items: center; min-width: 19px; height: 19px; padding: 0 5px;
  border: 1px solid var(--nav); color: var(--nav);
  font-size: 11px; font-weight: 800; border-radius: 3px;
  box-shadow: 0 0 12px rgba(77,200,255,0.30); background: rgba(77,200,255,0.10);
}
#hud3 .order .offerbar { height: 2px; margin: 0 1px 1px; background: rgba(238,244,255,0.10); }
#hud3 .order .offerbar i {
  display: block; height: 100%; width: 100%;
  background: var(--alarm); box-shadow: 0 0 10px var(--alarm);
}

/* ---- active ticket (top left) — the delivery and everything about it ----- */
#hud3 .ticket {
  position: absolute; top: 20px; left: 18px; width: 246px;
  opacity: 0; transform: translateX(-14px);
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.2,0.9,0.3,1);
}
#hud3 .ticket.show { opacity: 1; transform: none; }
#hud3 .ticket .head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 7px 13px; margin: 1px 1px 0; background: rgba(77,200,255,0.10);
}
#hud3 .ticket .head .en { color: var(--nav); }
#hud3 .ticket .body { padding: 11px 13px 12px; }
#hud3 .ticket .to { font-size: 15px; font-weight: 700; line-height: 1.2; }
/* The pickup leg has no countdown and no food in the van yet, so the clock and
   condition rows are absent rather than frozen — a stopped timer reads as a bug. */
#hud3 .ticket .clock, #hud3 .ticket .bar, #hud3 .ticket .cond { display: none; }
#hud3 .ticket.timed .clock { display: flex; }
#hud3 .ticket.timed .bar { display: block; }
#hud3 .ticket.timed .cond { display: block; }
#hud3 .ticket .clock { margin-top: 10px; align-items: baseline; gap: 8px; }
#hud3 .ticket .clock .t {
  font-size: 26px; font-weight: 800; line-height: 1; letter-spacing: 0.01em;
}
#hud3 .ticket.warn .clock .t { color: var(--alarm); text-shadow: 0 0 18px rgba(255,45,120,0.5); }
#hud3 .ticket .bar { margin-top: 8px; height: 3px; background: rgba(238,244,255,0.10); }
#hud3 .ticket .bar i {
  display: block; height: 100%; background: var(--nav);
  box-shadow: 0 0 10px var(--nav); transition: width 0.2s linear;
}
#hud3 .ticket.warn .bar i { background: var(--alarm); box-shadow: 0 0 10px var(--alarm); }
#hud3 .ticket .value {
  display: none; margin-top: 10px; align-items: baseline; justify-content: space-between;
  color: var(--muted); font-size: 10px; letter-spacing: .10em; text-transform: uppercase;
}
#hud3 .ticket.timed .value { display: flex; }
#hud3 .ticket .value strong { color: var(--money); font-size: 18px; letter-spacing: 0; }
#hud3 .ticket .amount-wrap { position: relative; display: inline-flex; align-items: baseline; }
#hud3 .ticket .deduction {
  position: absolute; right: calc(100% + 8px); color: var(--alarm); font-size: 15px;
  font-weight: 900; letter-spacing: 0; white-space: nowrap; opacity: 0;
  text-shadow: 0 0 13px rgba(255,45,120,.65); pointer-events: none;
}
#hud3 .ticket .deduction.flash { animation: h3deduct .95s cubic-bezier(.18,.76,.3,1); }
@keyframes h3deduct {
  0% { opacity: 0; transform: translateY(8px) scale(.86); }
  18%, 68% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-8px) scale(.96); }
}

/* condition: segmented, because a 3px smooth gradient reads as mush */
#hud3 .cond { margin-top: 12px; padding-top: 11px; border-top: 1px dashed rgba(238,244,255,0.18); }
#hud3 .cond .k { display: flex; justify-content: space-between; align-items: baseline; }
#hud3 .cond .pct { font-size: 11px; font-weight: 800; color: var(--nav); }
#hud3 .cond.low .pct { color: var(--alarm); }
#hud3 .cond .segs { display: flex; gap: 2px; margin-top: 6px; }
#hud3 .cond .segs i {
  flex: 1; height: 7px; background: rgba(238,244,255,0.10);
  transition: background 0.25s ease, box-shadow 0.25s ease;
}
#hud3 .cond .segs i.on { background: var(--nav); box-shadow: 0 0 7px rgba(77,200,255,0.55); }
#hud3 .cond.low .segs i.on { background: var(--alarm); box-shadow: 0 0 7px rgba(255,45,120,0.55); }
#hud3 .cond.spill { animation: h3spill 0.4s ease; }
#hud3 .cond.spill .segs i.on { background: var(--alarm); box-shadow: 0 0 12px var(--alarm); }
@keyframes h3spill {
  0%,100% { transform: none; } 20% { transform: translateX(-3px); } 60% { transform: translateX(2px); }
}

/* objective docked into the ticket: nav belongs to the job it serves */
#hud3 .ticket .obj {
  display: none; align-items: center; gap: 10px;
  padding: 8px 13px 9px; margin: 0 1px 1px; background: linear-gradient(90deg, rgba(77,200,255,0.13), rgba(77,200,255,0.035));
  border-top: 1px solid rgba(238,244,255,0.10);
}
#hud3 .ticket .obj.show { display: flex; }
#hud3 .ticket .obj .arrow {
  width: 18px; height: 18px; padding: 4px; box-sizing: content-box;
  color: var(--nav); flex: none; border: 1px solid rgba(77,200,255,0.55);
  border-radius: 50%; background: rgba(77,200,255,0.12);
  filter: drop-shadow(0 0 7px rgba(77,200,255,0.7));
  transition: transform 0.12s linear;
}
#hud3 .ticket .obj .d { font-size: 15px; font-weight: 800; }
#hud3 .ticket .obj .d small { font-size: 10px; color: var(--muted); margin-left: 2px; font-weight: 600; }
#hud3 .ticket .obj .en { margin-left: auto; }

/* ---- north-up mini-map -------------------------------------------------- */
#hud3 .minimap {
  position: absolute; right: 18px; bottom: 104px; width: 268px;
  padding: 8px 8px 7px; opacity: 0; transition: opacity .2s ease;
}
#hud3 .minimap.show { opacity: 1; }
#hud3 .minimap canvas { display: block; width: 252px; height: 176px; border: 1px solid rgba(77,200,255,.16); }
#hud3 .minimap .map-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1px 3px 7px; color: var(--nav); font-size: 9px;
  letter-spacing: .14em; text-transform: uppercase;
}
#hud3 .minimap .turn { color: var(--ink); letter-spacing: .08em; font-weight: 800; }
@media (max-width: 760px) {
  #hud3 .minimap { width: 210px; bottom: 92px; }
  #hud3 .minimap canvas { width: 194px; height: 136px; }
}

/* ---- speed (bottom right) ----------------------------------------------- */
#hud3 .speed {
  position: absolute; right: 20px; bottom: 22px;
  display: flex; align-items: baseline; gap: 6px;
  text-shadow: 0 2px 18px rgba(0,0,0,0.85);
}
#hud3 .speed .v { font-size: 62px; font-weight: 800; line-height: 0.85; letter-spacing: -0.03em; }
#hud3 .speed .u { font-size: 12px; letter-spacing: 0.16em; color: var(--muted); font-weight: 700; }
#hud3 .speed .gauge {
  position: absolute; right: 0; bottom: -10px; width: 158px; height: 3px;
  background: rgba(238,244,255,0.12);
}
#hud3 .speed .gauge i {
  display: block; height: 100%; width: 0%;
  background: linear-gradient(90deg, var(--nav) 0%, var(--nav) 62%, var(--alarm) 100%);
  background-size: 158px 100%;
  box-shadow: 0 0 12px rgba(77,200,255,0.45);
  transition: width 0.08s linear;
}

/* ---- toasts + legend (bottom left) -------------------------------------- */
#hud3 .stack {
  position: absolute; left: 18px; bottom: 20px;
  display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
}
#hud3 .toasts { display: flex; flex-direction: column-reverse; gap: 7px; }
#hud3 .toast {
  padding: 9px 14px 10px; font-size: 13px; font-weight: 600;
  border-left: 2px solid var(--nav);
  animation: h3in 0.22s cubic-bezier(0.2,0.9,0.3,1);
}
#hud3 .toast.win { border-left-color: var(--money); }
#hud3 .toast.bad { border-left-color: var(--alarm); }
#hud3 .toast .en { margin-top: 2px; }
@keyframes h3in { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: none; } }

/* 10.5px type with no backing loses to headlight glare on wet asphalt — the scrim
   alone could not save it. Shadow on the text, dark fill in the key caps, and the
   idle floor stops at 0.4 rather than fading into the road entirely. */
#hud3 .legend {
  display: flex; flex-wrap: wrap; gap: 5px 10px; align-items: center;
  font-size: 10.5px; color: var(--muted); letter-spacing: 0.02em;
  opacity: 1; transition: opacity 1.2s ease; max-width: 500px;
  text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.7);
}
#hud3 .legend.dim { opacity: 0.4; }
#hud3 .legend b {
  display: inline-grid; place-items: center; min-width: 17px; height: 17px; padding: 0 4px;
  margin-right: 4px; border: 1px solid rgba(238,244,255,0.30); border-radius: 3px;
  background: rgba(4,6,12,0.72); box-shadow: 0 1px 6px rgba(0,0,0,0.6);
  color: var(--ink); font-size: 10px; font-weight: 700; text-shadow: none;
}
#hud3 .legend span { display: inline-flex; align-items: center; }
#hud3 .translate-hint { margin-top: 5px; color: var(--nav); font-size: 9px; letter-spacing: .08em; opacity: .8; }
#hud3 .english-mode .toast > div:first-child { display: none; }
#hud3 .english-mode .toast .en { margin-top: 0; color: inherit; font-size: inherit; }
#hud3 .pad-status {
  margin-top: 1px; padding: 4px 8px; border-radius: 3px;
  color: var(--muted); background: rgba(4,6,12,0.66);
  border: 1px solid rgba(238,244,255,0.16); font-size: 10px;
  letter-spacing: 0.04em; text-shadow: 0 1px 4px #000;
}
#hud3 .pad-status.connected { color: var(--nav); border-color: rgba(77,200,255,0.45); }
#hud3 .pad-status.unsupported { color: var(--alarm); border-color: rgba(255,45,120,0.45); }
#hud3 .audio-status { margin-top: 1px; padding: 4px 8px; border-radius: 3px; color: var(--muted); background: rgba(4,6,12,0.66); border: 1px solid rgba(238,244,255,0.16); font-size: 10px; letter-spacing: 0.04em; text-shadow: 0 1px 4px #000; }
#hud3 .garage-status { margin-top: 1px; padding: 4px 8px; border-radius: 3px; color: var(--nav); background: rgba(4,6,12,0.66); border: 1px solid rgba(77,200,255,.35); font-size: 10px; letter-spacing: .04em; text-shadow: 0 1px 4px #000; pointer-events: auto; cursor: pointer; }
#hud3 .audio-status.on { color: var(--nav); border-color: rgba(77,200,255,0.45); }
#hud3 .audio-status.muted { color: var(--alarm); border-color: rgba(255,45,120,0.45); }
#hud3 .audio-status.blocked { color: var(--alarm); border-color: rgba(255,45,120,0.45); }
#hud3 .audio-status::before { content: '◌'; display: inline-block; margin-right: 6px; }
#hud3 .audio-status.on::before { content: '●'; }
#hud3 .audio-status.muted::before, #hud3 .audio-status.blocked::before { content: '×'; }
#hud3 .audio-status { pointer-events: auto; cursor: pointer; }
#hud3 .audio-menu { position: absolute; left: 18px; bottom: 118px; width: 250px; padding: 14px 16px; pointer-events: auto; background: rgba(6,9,16,.95); border: 1px solid rgba(77,200,255,.42); box-shadow: 0 18px 50px rgba(0,0,0,.62); opacity: 0; transform: translateY(8px); pointer-events: none; transition: opacity .18s ease, transform .18s ease; }
#hud3 .audio-menu.show { opacity: 1; transform: none; pointer-events: auto; }
#hud3 .audio-menu h3 { margin: 0 0 11px; color: var(--nav); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; }
#hud3 .audio-row { display: grid; grid-template-columns: 82px 1fr 34px; gap: 8px; align-items: center; margin: 9px 0; color: var(--muted); font-size: 11px; }
#hud3 .audio-row input[type=range] { width: 100%; accent-color: var(--nav); }
#hud3 .audio-row output { text-align: right; color: var(--ink); font-variant-numeric: tabular-nums; }
#hud3 .audio-menu button { margin-top: 5px; padding: 7px 9px; border: 1px solid rgba(238,244,255,.25); color: var(--ink); background: rgba(238,244,255,.07); cursor: pointer; font: inherit; font-size: 10px; letter-spacing: .07em; }
#hud3 .stereo-track { margin: 13px 0 4px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }
#hud3 .stereo-controls { display: flex; gap: 6px; }
#hud3 .stereo-controls button { flex: 1; }
#hud3 .release-card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(430px, calc(100vw - 36px)); padding: 22px 24px 20px; pointer-events: auto; text-align: left; background: rgba(6,9,16,0.94); border: 1px solid rgba(77,200,255,0.42); box-shadow: 0 22px 70px rgba(0,0,0,0.65), 0 0 35px rgba(77,200,255,0.10); transition: opacity .25s ease, transform .25s ease; }
#hud3 .release-card.hide { opacity: 0; transform: translate(-50%, -46%); pointer-events: none; }
#hud3 .release-card h2 { margin: 0; font-size: 22px; letter-spacing: .06em; }
#hud3 .release-card .sub { margin-top: 5px; color: var(--nav); font-size: 10px; letter-spacing: .18em; text-transform: uppercase; }
#hud3 .release-card p { margin: 15px 0 0; color: rgba(238,244,255,.76); font-size: 12px; line-height: 1.6; }
#hud3 .release-card .keys { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 7px 14px; color: var(--muted); font-size: 11px; }
#hud3 .release-card .keys b { color: var(--ink); }
#hud3 .release-card button { margin-top: 18px; padding: 9px 13px; border: 1px solid var(--nav); color: var(--nav); background: rgba(77,200,255,.10); cursor: pointer; font: inherit; letter-spacing: .08em; }
#hud3 .garage-menu { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -46%); width: min(520px, calc(100vw - 36px)); padding: 20px 22px; pointer-events: none; background: rgba(6,9,16,.96); border: 1px solid rgba(77,200,255,.42); box-shadow: 0 22px 70px rgba(0,0,0,.7); opacity: 0; transition: opacity .18s ease, transform .18s ease; }
#hud3 .garage-menu.show { opacity: 1; transform: translate(-50%, -50%); pointer-events: auto; }
#hud3 .garage-head { display: flex; align-items: center; justify-content: space-between; }
#hud3 .garage-head h3 { margin: 0; color: var(--nav); font-size: 12px; letter-spacing: .16em; text-transform: uppercase; }
#hud3 .garage-head button { border: 0; color: var(--muted); background: none; cursor: pointer; font-size: 18px; }
#hud3 .garage-cash { margin-top: 7px; color: var(--money); font-size: 13px; }
#hud3 .garage-list { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px; }
#hud3 .garage-car { padding: 13px; border: 1px solid rgba(238,244,255,.17); background: rgba(238,244,255,.045); }
#hud3 .garage-car.current { border-color: var(--nav); box-shadow: inset 0 0 20px rgba(77,200,255,.08); }
#hud3 .garage-car h4 { margin: 0; font-size: 15px; }
#hud3 .garage-car .car-en { margin-top: 3px; color: var(--muted); font-size: 10px; letter-spacing: .09em; text-transform: uppercase; }
#hud3 .garage-car p { min-height: 38px; margin: 9px 0; color: rgba(238,244,255,.66); font-size: 10.5px; line-height: 1.45; }
#hud3 .garage-car button { width: 100%; padding: 7px; border: 1px solid var(--nav); color: var(--nav); background: rgba(77,200,255,.09); cursor: pointer; font: inherit; font-size: 10px; letter-spacing: .07em; }
#hud3 .garage-car button:disabled { color: var(--muted); border-color: rgba(238,244,255,.18); cursor: default; }
@media (max-width: 620px) { #hud3 .garage-list { grid-template-columns: 1fr; } }

/* ---- slice-only caption -------------------------------------------------- */
#hud3 .slice-note {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  text-align: center; opacity: 0.9; max-width: 520px;
}
#hud3 .slice-note .t {
  font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--nav);
}
#hud3 .slice-note .s { margin-top: 7px; font-size: 11.5px; color: var(--muted); line-height: 1.5; }
`;

const ARROW_SVG =
  `<svg class="arrow" viewBox="0 0 24 24" fill="currentColor" aria-label="Navigation direction"><path d="M12 2.2 L21.2 20.8 L12 16.1 L2.8 20.8 Z"/><path d="M12 6.5 L12 16.2" fill="none" stroke="rgba(7,14,24,.68)" stroke-width="1.35" stroke-linecap="round"/></svg>`;

const SEGMENTS = 14;

/** Vehicle heading (+ when steering left) -> clockwise canvas rotation. */
export const minimapArrowRotation = (heading, flipX = false, flipY = false) => {
  // The arrow mesh points toward canvas -Y already, so heading zero needs no
  // half-turn. The previous extra PI made the player marker face backwards.
  let angle = heading;
  if (flipX) angle = -angle;
  if (flipY) angle = Math.PI - angle;
  return angle;
};

// Bindings mirror KEY_ACTIONS / PAD_BUTTONS in core/input.js. Mute is
// keyboard-only — there is no pad button mapped to it — so it appears in one
// list and not the other rather than being listed as unbound.
const LEGENDS = {
  keyboard: [
    ['W A S D', '주행'], ['Space', '사이드브레이크'], ['E', '수락'],
    ['R', '리셋'], ['`', '디버그'], ['M', '음소거'],
  ],
  gamepad: [
    ['L-Stick', '조향'], ['RT', '가속'], ['LT', '브레이크'],
    ['A', '사이드브레이크'], ['X', '수락'], ['Y', '리셋'], ['View', '디버그'],
  ],
  touch: [
    ['Left', '가속 · 브레이크'], ['Right', '조향'],
    ['Button', '사이드브레이크'], ['Tap', '수락'],
  ],
};

const won = (n) => `<small>₩</small>${Math.round(n).toLocaleString('ko-KR')}`;
const ENGLISH_LEGENDS = {
  keyboard: [
    ['W A S D', 'Drive'], ['Space', 'Handbrake'], ['E', 'Accept'],
    ['R', 'Reset'], ['`', 'Debug'], ['M', 'Mute'], ['T', 'English'],
  ],
  gamepad: [
    ['L-Stick', 'Steer'], ['RT', 'Accelerate'], ['LT', 'Brake'],
    ['A', 'Handbrake'], ['X', 'Accept'], ['Y', 'Reset'], ['View', 'Debug'], ['LB', 'English'],
  ],
  touch: [
    ['Left', 'Throttle / brake'], ['Right', 'Steer'],
    ['Button', 'Handbrake'], ['Tap', 'Accept'],
  ],
};

const mmss = (s) => {
  const m = Math.max(0, Math.floor(s / 60));
  const r = Math.max(0, Math.floor(s % 60));
  return `${m}:${String(r).padStart(2, '0')}`;
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class HUD3 {
  constructor() {
    // Idempotent: ?ui=slice mounts a second HUD3 over the live one, and dispose()
    // only removes the element. Appending the sheet per instance would leak one
    // <style> per mount. Element IDs are queried through the instance root, so
    // two mounts do not collide.
    if (!document.getElementById('hud3-style')) {
      const style = document.createElement('style');
      style.id = 'hud3-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const el = document.createElement('div');
    el.id = 'hud3';
    el.innerHTML = `
      <div class="scrim tl"></div><div class="scrim tr"></div>
      <div class="scrim bl"></div><div class="scrim br"></div>

      <div class="release-card" id="h3release">
        <h2>서울 배달 · SEOUL DELIVERY</h2>
        <div class="sub">INTERNAL PREVIEW · FIRST DELIVERY</div>
        <p id="h3intro">주문을 수락하고 식당에서 픽업한 뒤, 시간과 충격으로 배달 금액이 줄기 전에 목적지로 배달하세요.</p>
        <div class="keys"><span><b>WASD / Arrows</b> <span class="key-label">주행 · Drive</span></span><span><b>Space</b> <span class="key-label">사이드브레이크 · Handbrake</span></span><span><b>E / X</b> <span class="key-label">주문 수락 · Accept</span></span><span><b>R / Y</b> <span class="key-label">도로로 복귀 · Reset</span></span><span><b>M</b> <span class="key-label">음소거 · Mute</span></span><span><b>첫 입력</b> <span class="key-label">오디오 활성화 · Audio unlock</span></span></div>
        <button id="h3start">첫 배달 시작 · START FIRST DELIVERY</button>
      </div>

      <div class="garage-menu" id="h3garage">
        <div class="garage-head"><h3 id="h3garagetitle">차고 · Garage</h3><button id="h3garageclose" type="button" aria-label="Close garage">×</button></div>
        <div class="garage-cash" id="h3garagecash">₩0</div>
        <div class="garage-list" id="h3garagelist"></div>
      </div>

      <div class="audio-menu" id="h3audiomenu">
        <h3>Audio mix</h3>
        <label class="audio-row"><span>Master</span><input id="h3master" type="range" min="0" max="1" step="0.01"><output id="h3masterout"></output></label>
        <label class="audio-row"><span>Music</span><input id="h3music" type="range" min="0" max="1" step="0.01"><output id="h3musicout"></output></label>
        <label class="audio-row"><span>Effects</span><input id="h3sfx" type="range" min="0" max="1" step="0.01"><output id="h3sfxout"></output></label>
        <label class="audio-row"><span>Ambience</span><input id="h3ambience" type="range" min="0" max="1" step="0.01"><output id="h3ambienceout"></output></label>
        <div class="stereo-track" id="h3track">STEREO · DROP IT RED</div>
        <div class="stereo-controls"><button id="h3prev" type="button">◀ PREV</button><button id="h3next" type="button">NEXT ▶</button></div>
        <button id="h3musicbutton" type="button">PAUSE MUSIC</button>
        <button id="h3audioreset" type="button">RESET + TEST AUDIO</button>
      </div>

      <div class="rail">
        <div class="panel cash">
          <div class="amt" id="h3cash"><small>₩</small>0</div>
          <div class="lbl en">보유 현금 · Cash</div>
        </div>
        <div class="chips">
          <div class="panel chip rating"><div class="v" id="h3rating">—</div><div class="k">평점 rating</div></div>
          <div class="panel chip"><div class="v" id="h3deliv">0</div><div class="k">배달 runs</div></div>
        </div>
      </div>

      <div class="panel docket order" id="h3order">
        <div class="strip"><span class="en">새 주문 · New order</span><span class="dist" id="h3dist">0.0 km</span></div>
        <div class="body">
          <div class="shop" id="h3shop">—</div>
          <div class="shop-en en" id="h3shopen">—</div>
          <div class="dish" id="h3dish">—</div>
          <div class="foot">
            <div class="pay" id="h3pay"><small>₩</small>0</div>
            <div class="accept"><span class="key" id="h3acceptkey">E</span><span>수락 ACCEPT</span></div>
          </div>
        </div>
        <div class="offerbar"><i id="h3offerbar"></i></div>
      </div>

      <div class="panel docket ticket" id="h3ticket">
        <div class="head"><span class="en" id="h3tstage">픽업 · Pickup</span><span class="en" id="h3tdist">0.0 km</span></div>
        <div class="body">
          <div class="to" id="h3to">—</div>
          <div class="clock"><span class="t" id="h3time">0:00</span><span class="en" id="h3timelabel">남은 시간 · Remaining</span></div>
          <div class="bar"><i id="h3tbar"></i></div>
          <div class="value"><span id="h3valuelabel">예상 금액 · Delivery total</span><span class="amount-wrap"><span class="deduction" id="h3deduction"></span><strong id="h3value">₩0</strong></span></div>
          <div class="cond" id="h3cond">
            <div class="k"><span class="en">음식 상태 · Condition</span><span class="pct" id="h3condpct">100%</span></div>
            <div class="segs" id="h3segs"></div>
          </div>
        </div>
        <div class="obj" id="h3obj">
          ${ARROW_SVG}<div class="d" id="h3objd">0<small>m</small></div><span class="en">목적지 · Target</span>
        </div>
      </div>

      <div class="panel minimap" id="h3minimap">
        <div class="map-head"><span id="h3mapnorth">북 · N</span><span class="turn" id="h3turn">시내 · CITY</span></div>
        <canvas id="h3map" width="504" height="352" aria-label="North-up route mini-map"></canvas>
      </div>

      <div class="speed">
        <div class="v" id="h3speed">0</div><div class="u">km/h</div>
        <div class="gauge"><i id="h3gauge"></i></div>
      </div>

      <div class="stack">
        <div class="toasts" id="h3toasts"></div>
        <div class="legend" id="h3legend"></div><div class="translate-hint" id="h3translatehint">HOLD T / LB · ENGLISH</div>
        <div class="garage-status" id="h3garagestatus" role="button" tabindex="0">차고 · GARAGE</div>
        <div class="pad-status" id="h3padstatus">XBOX · PRESS ANY BUTTON IN THIS TAB</div>
        <div class="audio-status" id="h3audio" role="button" tabindex="0" aria-live="polite" title="Open audio mixer">AUDIO · CLICK FOR MIXER</div>
      </div>
    `;
    document.body.appendChild(el);
    this.el = el;

    const $ = (id) => el.querySelector(`#${id}`);
    this.$ = {
      cash: $('h3cash'), rating: $('h3rating'), deliv: $('h3deliv'),
      order: $('h3order'), shop: $('h3shop'), shopen: $('h3shopen'), dish: $('h3dish'),
      pay: $('h3pay'), dist: $('h3dist'), offerbar: $('h3offerbar'),
      ticket: $('h3ticket'), tstage: $('h3tstage'), tdist: $('h3tdist'), to: $('h3to'),
      time: $('h3time'), timeLabel: $('h3timelabel'), tbar: $('h3tbar'), value: $('h3value'), valueLabel: $('h3valuelabel'), deduction: $('h3deduction'),
      cond: $('h3cond'), condpct: $('h3condpct'), segs: $('h3segs'),
      obj: $('h3obj'), objd: $('h3objd'), arrow: el.querySelector('.obj .arrow'),
      minimap: $('h3minimap'), map: $('h3map'), turn: $('h3turn'), mapNorth: $('h3mapnorth'),
      speed: $('h3speed'), gauge: $('h3gauge'),
      toasts: $('h3toasts'), legend: $('h3legend'), acceptKey: $('h3acceptkey'),
      padStatus: $('h3padstatus'), audio: $('h3audio'), release: $('h3release'), start: $('h3start'), translateHint: $('h3translatehint'),
      intro: $('h3intro'), garage: $('h3garage'), garageTitle: $('h3garagetitle'), garageClose: $('h3garageclose'), garageCash: $('h3garagecash'), garageList: $('h3garagelist'), garageStatus: $('h3garagestatus'),
      audioMenu: $('h3audiomenu'), master: $('h3master'), music: $('h3music'), sfx: $('h3sfx'), ambience: $('h3ambience'),
      masterOut: $('h3masterout'), musicOut: $('h3musicout'), sfxOut: $('h3sfxout'), ambienceOut: $('h3ambienceout'), musicButton: $('h3musicbutton'),
      track: $('h3track'), prev: $('h3prev'), next: $('h3next'), audioReset: $('h3audioreset'),
    };

    this.$.segs.innerHTML = '<i></i>'.repeat(SEGMENTS);
    this.segEls = [...this.$.segs.querySelectorAll('i')];
    this.setCondition(1);
    this.mapContext = this.$.map.getContext('2d');

    this.maxSpeed = 110;
    this._spillTimer = null;
    this._legendTimer = null;
    this._localized = new Set();
    this.englishMode = false;
    this.inputMode = 'keyboard';
    this.miniMapFlipX = false;
    this.miniMapFlipY = false;
    this._acceptRequested = false;
    this._startHandler = null;
    // ?intro=off is a probe/QA hook: skip the release card without persisting
    // the seen flag, so headless screenshots frame the world, not the overlay.
    this._onboardingVisible =
      localStorage.getItem('seoul-delivery-intro-seen') !== '1' &&
      new URLSearchParams(location.search).get('intro') !== 'off';
    const staticText = [
      [el.querySelector('.cash .lbl'), 'Cash'],
      [el.querySelector('.rating .k'), 'Rating'],
      [el.querySelector('.chips .panel:not(.rating) .k'), 'Runs'],
      [el.querySelector('.order .strip .en'), 'New order'],
      [el.querySelector('.order .accept span:last-child'), 'ACCEPT'],
      [this.$.timeLabel, 'Remaining'],
      [this.$.valueLabel, 'Delivery total'],
      [el.querySelector('.cond .k .en'), 'Food condition'],
      [el.querySelector('.obj > span.en'), 'Target'],
      [this.$.mapNorth, 'NORTH · N'],
      [this.$.intro, 'Accept an order, collect it, then deliver. Occasional delays and crashes deduct from the total.'],
      [this.$.start, 'START FIRST DELIVERY'],
      [this.$.garageTitle, 'GARAGE'],
      [this.$.garageStatus, 'GARAGE'],
      [this.$.release.querySelector('h2'), 'SEOUL DELIVERY'],
      [this.$.release.querySelectorAll('.keys b')[5], 'Any input'],
    ];
    staticText.forEach(([node, en]) => this._setLocalized(node, node?.textContent || '', en));
    const introKeysEn = ['Drive', 'Handbrake', 'Accept', 'Reset', 'Mute', 'Audio unlock'];
    [...this.$.release.querySelectorAll('.key-label')]
      .forEach((node, i) => this._setLocalized(node, node.textContent, introKeysEn[i]));
    this.setInputMode('keyboard');
    this.setEnglishMode(false);
    this.$.start.addEventListener('click', () => {
      this.dismissReleaseCard();
      this._startHandler?.();
    });
    this.$.order.addEventListener('click', () => { this._acceptRequested = true; });
    this.$.audio.addEventListener('click', () => this.$.audioMenu.classList.toggle('show'));
    this.$.garageStatus.addEventListener('click', () => {
      this.refreshGarage();
      this.$.garage.classList.toggle('show');
    });
    this.$.garageStatus.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.$.garageStatus.click(); }
    });
    this.$.garageClose.addEventListener('click', () => this.$.garage.classList.remove('show'));
    this.$.audio.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.$.audio.click();
      }
    });
    if (!this._onboardingVisible) this.dismissReleaseCard({ remember: false });
  }

  /**
   * Called from the main loop whenever input.mode flips between keyboard and
   * gamepad. Picking up a controller changes every binding on screen, so the
   * legend is rewritten and un-dimmed to teach the new set — and the offer
   * docket's accept key swaps with it, since that prompt is the one piece of
   * UI that names a button while you are being asked to press it.
   * @param {'keyboard'|'gamepad'|'touch'} mode
   */
  setInputMode(mode) {
    this.inputMode = mode;
    const source = this.englishMode ? ENGLISH_LEGENDS : LEGENDS;
    const items = source[mode] ?? source.keyboard;
    this.$.legend.innerHTML = items
      .map(([k, v]) => `<span><b>${k}</b>${v}</span>`)
      .join('');
    if (this.$.acceptKey) this.$.acceptKey.textContent = mode === 'gamepad' ? 'X' : mode === 'touch' ? 'TAP' : 'E';

    this.$.legend.classList.remove('dim');
    clearTimeout(this._legendTimer);
    // Teaches once, then gets out of the way.
    this._legendTimer = setTimeout(() => this.$.legend.classList.add('dim'), 10000);
  }

  setEnglishMode(active) {
    if (this.englishMode === active) return;
    this.englishMode = active;
    this.el?.classList.toggle('english-mode', active);
    this.$.legend?.classList.toggle('translate-active', active);
    if (this.$.translateHint) this.$.translateHint.textContent = active ? 'ENGLISH MODE' : 'HOLD T / LB · ENGLISH';
    this._localized.forEach((node) => this._renderLocalized(node));
    this.setInputMode(this.inputMode);
    this.refreshGarage();
  }

  _setLocalized(node, ko, en = ko) {
    if (!node) return;
    node.dataset.langKo = ko;
    node.dataset.langEn = en ?? ko;
    this._localized?.add(node);
    this._renderLocalized(node);
  }

  _renderLocalized(node) {
    node.textContent = this.englishMode ? node.dataset.langEn : node.dataset.langKo;
  }

  setControllerStatus(status, name = '') {
    const connected = status === 'connected';
    this.$.padStatus.classList.toggle('connected', connected);
    this.$.padStatus.classList.toggle('unsupported', status === 'unsupported');
    this.$.padStatus.textContent = connected
      ? `XBOX · CONNECTED${name ? ` · ${name.replace(/\s*\([^)]*\)\s*/g, ' ').trim()}` : ''}`
      : status === 'unsupported'
        ? 'CONTROLLER · UNAVAILABLE IN THIS BROWSER'
      : 'XBOX · PRESS ANY BUTTON IN THIS TAB';
  }

  setAudioStatus(status) {
    const labels = {
      ready: 'AUDIO · CLICK OR PRESS A KEY TO ENABLE',
      blocked: 'AUDIO · UNAVAILABLE IN THIS BROWSER',
      on: 'AUDIO · ON · PRESS M TO MUTE',
      muted: 'AUDIO · MUTED · PRESS M TO UNMUTE',
    };
    this.$.audio.textContent = labels[status] || labels.ready;
    this.$.audio.classList.toggle('on', status === 'on');
    this.$.audio.classList.toggle('muted', status === 'muted');
    this.$.audio.classList.toggle('blocked', status === 'blocked');
    this.$.audio.setAttribute('aria-label', labels[status] || labels.ready);
  }

  isOnboardingVisible() { return this._onboardingVisible; }

  onStart(handler) { this._startHandler = handler; }

  consumeAcceptRequest() {
    const requested = this._acceptRequested;
    this._acceptRequested = false;
    return requested;
  }

  dismissReleaseCard({ remember = true } = {}) {
    this._onboardingVisible = false;
    this.$.release.classList.add('hide');
    if (remember) localStorage.setItem('seoul-delivery-intro-seen', '1');
  }

  configureGarage({ vehicles, currentId, getSave, onChoose }) {
    this._garageConfig = { vehicles, currentId, getSave, onChoose };
    this.refreshGarage();
  }

  refreshGarage() {
    const config = this._garageConfig;
    if (!config) return;
    const save = config.getSave();
    this.$.garageCash.textContent = `${this.englishMode ? 'CASH' : '보유 현금'} · ₩${save.cash.toLocaleString()}`;
    this.$.garageList.replaceChildren();
    for (const vehicle of config.vehicles) {
      const owned = save.owned.includes(vehicle.id);
      const current = config.currentId === vehicle.id;
      const card = document.createElement('div');
      card.className = `garage-car${current ? ' current' : ''}`;
      const action = current
        ? (this.englishMode ? 'CURRENT VEHICLE' : '현재 차량')
        : owned
          ? (this.englishMode ? 'DRIVE' : '운전하기')
          : `${this.englishMode ? 'BUY' : '구매'} · ₩${vehicle.price.toLocaleString()}`;
      card.innerHTML = `
        <h4>${this.englishMode ? vehicle.nameEn : vehicle.nameKo}</h4>
        <div class="car-en">${vehicle.nameEn}</div>
        <p>${vehicle.blurb}</p>
        <button type="button" ${current ? 'disabled' : ''}>${action}</button>`;
      card.querySelector('button').addEventListener('click', () => config.onChoose(vehicle));
      this.$.garageList.appendChild(card);
    }
  }

  bindAudioControls({ soundtrack, audio }) {
    const wakeAudio = () => {
      audio.wake?.();
      soundtrack.wake?.();
      this.setAudioStatus(audio.muted ? 'muted' : audio.available ? 'on' : 'blocked');
    };
    this.$.start.addEventListener('click', wakeAudio);
    this.$.audio.addEventListener('click', wakeAudio);
    const values = {
      master: audio.masterLevel,
      music: soundtrack.audio.volume,
      sfx: audio.sfxLevel,
      ambience: audio.ambienceLevel,
    };
    const set = (key, value) => {
      values[key] = Number(value);
      this.$[key].value = values[key];
      this.$[`${key}Out`].textContent = `${Math.round(values[key] * 100)}%`;
    };
    set('master', values.master); set('music', values.music); set('sfx', values.sfx); set('ambience', values.ambience);
    this.$.master.addEventListener('input', (e) => { wakeAudio(); set('master', e.target.value); audio.setMasterVolume(e.target.value); });
    this.$.music.addEventListener('input', (e) => { wakeAudio(); set('music', e.target.value); soundtrack.setVolume(e.target.value); });
    this.$.sfx.addEventListener('input', (e) => { wakeAudio(); set('sfx', e.target.value); audio.setSfxVolume(e.target.value); });
    this.$.ambience.addEventListener('input', (e) => { wakeAudio(); set('ambience', e.target.value); audio.setAmbienceVolume(e.target.value); });
    this.$.musicButton.addEventListener('click', () => {
      wakeAudio();
      if (soundtrack.paused) {
        soundtrack.resume();
        this.$.musicButton.textContent = 'PAUSE MUSIC';
      } else {
        soundtrack.pause();
        this.$.musicButton.textContent = 'RESUME MUSIC';
      }
    });
    const updateTrack = () => { this.$.track.textContent = `STEREO · ${soundtrack.currentTrack.title}`; };
    this.$.prev.addEventListener('click', async () => { wakeAudio(); await soundtrack.previous({ autoplay: !soundtrack.paused }); updateTrack(); });
    this.$.next.addEventListener('click', async () => { wakeAudio(); await soundtrack.next({ autoplay: !soundtrack.paused }); updateTrack(); });
    this.$.audioReset.addEventListener('click', async () => {
      audio.reset();
      await soundtrack.reset();
      set('master', audio.masterLevel);
      set('music', soundtrack.audio.volume);
      set('sfx', audio.sfxLevel);
      set('ambience', audio.ambienceLevel);
      this.$.musicButton.textContent = 'PAUSE MUSIC';
      this.setAudioStatus('on');
    });
    updateTrack();
  }

  setCash(v, { bump = false } = {}) {
    this.$.cash.innerHTML = won(v);
    if (bump) {
      this.$.cash.classList.remove('bump');
      void this.$.cash.offsetWidth; // restart the animation
      this.$.cash.classList.add('bump');
    }
  }

  setStats({ rating, deliveries }) {
    if (rating != null) this.$.rating.textContent = rating > 0 ? `★ ${rating.toFixed(1)}` : '—';
    if (deliveries != null) this.$.deliv.textContent = deliveries;
  }

  setSpeed(kmh) {
    const v = Math.abs(kmh);
    this.$.speed.textContent = Math.round(v);
    this.$.gauge.style.width = `${clamp01(v / this.maxSpeed) * 100}%`;
  }

  showOffer({ shop, shopEn, dish, dishEn = dish, pay, distanceKm }) {
    this._setLocalized(this.$.shop, shop, shopEn);
    this._setLocalized(this.$.shopen, shopEn, '');
    this._setLocalized(this.$.dish, dish, dishEn);
    this.$.pay.innerHTML = won(pay);
    this.$.dist.textContent = `${distanceKm.toFixed(1)} km`;
    this.$.order.classList.add('show');
  }
  /** @param {number} t 1 → 0 as the offer window closes */
  setOfferProgress(t) { this.$.offerbar.style.width = `${clamp01(t) * 100}%`; }
  hideOffer() { this.$.order.classList.remove('show'); }

  /**
   * @param {string} to          destination, Korean
   * @param {string} stage       head label, e.g. '픽업 · Pickup'
   * @param {number} distanceKm  TOTAL job length — not remaining. Remaining lives
   *                             on the objective row, and showing the same number
   *                             twice on one panel is wasted space.
   * @param {boolean} timed      false on the pickup leg: no countdown, no condition
   */
  showTicket({ to, toEn = to, stage, stageEn = stage, seconds = 0, totalSeconds = 0, payout = 0, distanceKm, condition = 1, timed = true }) {
    this._setLocalized(this.$.to, to, toEn);
    this._setLocalized(this.$.tstage, stage, stageEn);
    this.$.tdist.textContent = `${distanceKm.toFixed(1)} km`;
    this.$.ticket.classList.toggle('timed', timed);
    if (timed) {
      this.updateTicket({ seconds, totalSeconds, payout });
      this.setCondition(condition);
    } else {
      this.$.ticket.classList.remove('warn');
    }
    this.$.ticket.classList.add('show');
  }

  /** Head label only — used for the pickup wait countdown. */
  setStage(stage, stageEn = stage) { this._setLocalized(this.$.tstage, stage, stageEn); }
  updateTicket({ seconds, totalSeconds, payout }) {
    const late = seconds < 0;
    this.$.time.textContent = late ? `+${mmss(-seconds)}` : mmss(seconds);
    this._setLocalized(this.$.timeLabel, late ? '지연 시간' : '남은 시간', late ? 'Overdue' : 'Remaining');
    this.$.tbar.style.width = `${clamp01(totalSeconds > 0 ? seconds / totalSeconds : 0) * 100}%`;
    this.$.ticket.classList.toggle('warn', seconds <= 20);
    if (payout != null) this.$.value.innerHTML = won(payout);
  }

  flashPayoutDeduction(amount) {
    if (!this.$.deduction || amount <= 0) return;
    this.$.deduction.textContent = `-₩${Math.round(amount).toLocaleString()}`;
    this.$.deduction.classList.remove('flash');
    void this.$.deduction.offsetWidth;
    this.$.deduction.classList.add('flash');
  }
  hideTicket() { this.$.ticket.classList.remove('show'); }

  /** @param {number} q 1 = pristine, 0 = ruined */
  setCondition(q) {
    const f = clamp01(q);
    const on = Math.round(f * SEGMENTS);
    this.segEls.forEach((s, i) => s.classList.toggle('on', i < on));
    this.$.condpct.textContent = `${Math.round(f * 100)}%`;
    this.$.cond.classList.toggle('low', f < 0.35);
  }

  /** Discrete knock — a pothole, a bollard, a kerb. Flashes the condition meter. */
  spill() {
    const c = this.$.cond;
    c.classList.remove('spill');
    void c.offsetWidth;
    c.classList.add('spill');
    clearTimeout(this._spillTimer);
    this._spillTimer = setTimeout(() => c.classList.remove('spill'), 420);
  }

  /**
   * Docked inside the ticket, so it only exists while a delivery does.
   * @param {number|null} metres  null hides it
   * @param {number} bearingRad   0 = dead ahead, clockwise
   */
  setObjective(metres, bearingRad = 0) {
    if (metres == null) { this.$.obj.classList.remove('show'); return; }
    this.$.obj.classList.add('show');
    this.$.objd.innerHTML = metres >= 1000
      ? `${(metres / 1000).toFixed(1)}<small>km</small>`
      : `${Math.round(metres)}<small>m</small>`;
    this.$.arrow.style.transform = `rotate(${bearingRad}rad)`;
  }

  setMiniMapFlip(x, y) {
    this.miniMapFlipX = !!x;
    this.miniMapFlipY = !!y;
  }

  /** Draw the authoritative road graph north-up, with optional axis flips. */
  setMiniMap({ graph, bounds, route = null, player = null, destination = null, maneuver = null } = {}) {
    if (!graph || !bounds) { this.$.minimap.classList.remove('show'); return; }
    this.$.minimap.classList.add('show');
    const canvas = this.$.map;
    const ctx = this.mapContext;
    const w = canvas.width, h = canvas.height, pad = 26;
    const spanX = Math.max(1, bounds.max.x - bounds.min.x);
    const spanZ = Math.max(1, bounds.max.z - bounds.min.z);
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
    const ox = (w - spanX * scale) / 2;
    const oy = (h - spanZ * scale) / 2;
    const mapPoint = (p) => {
      let x = ox + (p.x - bounds.min.x) * scale;
      let y = oy + (bounds.max.z - p.z) * scale;
      if (this.miniMapFlipX) x = w - x;
      if (this.miniMapFlipY) y = h - y;
      return { x, y };
    };
    const strokePolyline = (points, color, width, glow = 0, dashed = false) => {
      if (!points?.length) return;
      ctx.beginPath();
      points.forEach((p, i) => { const q = mapPoint(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash(dashed ? [8, 8] : []);
      ctx.shadowColor = color; ctx.shadowBlur = glow; ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]);
    };

    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(5,11,19,.96)'); bg.addColorStop(1, 'rgba(8,14,23,.9)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // Shade the four building bands between the five streets. This turns the
    // abstract ladder into a readable city map: dark blocks, pale roads.
    // Empty on an explicit (non-ladder) graph — district cells below instead.
    const streets = graph.rows;
    const westX = Math.min(...graph.nodes.map((node) => node.position.x));
    const eastX = Math.max(...graph.nodes.map((node) => node.position.x));
    for (let i = 0; i < streets.length - 1; i++) {
      const z0 = streets[i].z + graph.roadWidth * .62;
      const z1 = streets[i + 1].z - graph.roadWidth * .62;
      const a = mapPoint({ x: westX + graph.roadWidth * .62, z: z0 });
      const b = mapPoint({ x: eastX - graph.roadWidth * .62, z: z1 });
      ctx.fillStyle = i % 2 ? 'rgba(31,48,63,.72)' : 'rgba(25,39,54,.78)';
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeStyle = 'rgba(125,157,179,.14)'; ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    }

    // District footprints under the road edges, so an explicit irregular graph
    // still reads as a city map instead of a bare wireframe. (0/PI-rotated
    // cells stay axis-aligned, so a rectangle per district is exact.)
    const districtCells = graph.districts || [];
    districtCells.forEach((cell, i) => {
      const b = cell.bounds || cell;
      const a = mapPoint({ x: b.min.x, z: b.min.z });
      const c = mapPoint({ x: b.max.x, z: b.max.z });
      ctx.fillStyle = i % 2 ? 'rgba(31,48,63,.72)' : 'rgba(25,39,54,.78)';
      ctx.fillRect(Math.min(a.x, c.x), Math.min(a.y, c.y), Math.abs(c.x - a.x), Math.abs(c.y - a.y));
      ctx.strokeStyle = 'rgba(125,157,179,.14)'; ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(a.x, c.x), Math.min(a.y, c.y), Math.abs(c.x - a.x), Math.abs(c.y - a.y));
    });

    // Road casing, carriageway, then a faint dashed centreline. Drawing all
    // three makes the narrow end connectors as obvious as the long streets.
    for (const edge of graph.edges) strokePolyline(edge.points, 'rgba(2,6,11,.96)', Math.max(12, edge.width * scale * 1.28));
    for (const edge of graph.edges) strokePolyline(edge.points, 'rgba(176,195,207,.82)', Math.max(8, edge.width * scale * .82));
    for (const edge of graph.edges) strokePolyline(edge.points, 'rgba(9,18,27,.48)', 1.6, 0, true);

    // The two north/south connector streets are the escape from every long
    // east/west road. Draw them again above the block layer and label them so
    // they read as actual cross streets rather than as a map border.
    const connectors = graph.edges.filter((edge) => edge.kind === 'connector' || edge.kind === 'cross');
    for (const edge of connectors) strokePolyline(edge.points, 'rgba(122,167,187,.98)', Math.max(9, edge.width * scale * .9));
    for (const edge of connectors) strokePolyline(edge.points, 'rgba(13,27,38,.72)', 1.8, 0, true);

    // Junction dots make it clear that streets connect instead of merely
    // crossing the border of the mini-map.
    for (const node of graph.nodes) {
      const p = mapPoint(node.position);
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(5, graph.roadWidth * scale * .42), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(199,215,224,.92)'; ctx.fill();
      ctx.strokeStyle = 'rgba(5,11,18,.9)'; ctx.lineWidth = 2; ctx.stroke();
    }

    if (route) {
      strokePolyline(route.polyline, 'rgba(1,8,14,.9)', Math.max(10, graph.roadWidth * scale * .56));
      strokePolyline(route.polyline, '#35d6ff', Math.max(5, graph.roadWidth * scale * .31), 12);
    }

    // Simple row and gate labels give the repeated geometry stable names.
    // Ladder graphs only — an explicit district graph has no rows/crosses.
    if (streets.length) {
      ctx.font = '700 16px sans-serif'; ctx.textBaseline = 'middle';
      streets.forEach((row, i) => {
        const p = mapPoint(row.points[0]);
        ctx.fillStyle = 'rgba(238,244,255,.78)'; ctx.textAlign = 'left';
        ctx.fillText(`${i + 1}`, p.x + 12, p.y - 9);
      });
      ctx.font = '800 15px sans-serif'; ctx.fillStyle = '#4dc8ff'; ctx.textBaseline = 'bottom';
      // Gate graphs have explicit w0/e0 nodes; the current compact district uses
      // gates:false and its row endpoints are cross-street nodes instead. Label
      // the actual first-row endpoints so both graph shapes remain valid.
      const firstStreet = streets[0];
      if (firstStreet?.points?.length) {
        const west = mapPoint(firstStreet.points[0]);
        const east = mapPoint(firstStreet.points[firstStreet.points.length - 1]);
        ctx.textAlign = 'left'; ctx.fillText('W', west.x - 5, h - 6);
        ctx.textAlign = 'right'; ctx.fillText('E', east.x + 5, h - 6);
      }
      const connectorLabel = (edgeId, text, side) => {
        const edge = graph.edgeById.get(edgeId);
        if (!edge) return;
        const p = mapPoint(edge.points[0].clone().lerp(edge.points[1], 0.5));
        ctx.save(); ctx.translate(p.x + side * 10, p.y); ctx.rotate(-Math.PI / 2);
        ctx.font = '800 12px sans-serif'; ctx.fillStyle = 'rgba(219,236,245,.88)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 0); ctx.restore();
      };
      connectorLabel('west1', 'WEST CROSS', 1);
      connectorLabel('east1', 'EAST CROSS', -1);
      ctx.save(); ctx.font = '800 11px sans-serif'; ctx.fillStyle = 'rgba(219,236,245,.72)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      for (const cross of graph.crosses) {
        const p = mapPoint({ x: cross.x, z: streets[streets.length - 1].z });
        ctx.fillText(`C${cross.index + 1}`, p.x, p.y - 9);
      }
      ctx.restore();
    }

    // 100 m scale bar.
    const bar = Math.min(100 * scale, w * .26);
    ctx.strokeStyle = 'rgba(238,244,255,.72)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(18, h - 16); ctx.lineTo(18 + bar, h - 16); ctx.stroke();
    ctx.font = '600 13px sans-serif'; ctx.fillStyle = 'rgba(238,244,255,.7)'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(bar / scale)} m`, 18, h - 20);

    if (destination) {
      const d = mapPoint(destination);
      ctx.beginPath(); ctx.arc(d.x, d.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#ff2d78'; ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(d.x, d.y, 3, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    if (player) {
      const p = mapPoint(player.position);
      // Game north is world -Z; vehicle +X is body-left. Canvas rotation must
      // therefore flip the vertical component while preserving the corrected
      // left/right component: north (-Z) is up, south (+Z) is down.
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(minimapArrowRotation(player.heading || 0, this.miniMapFlipX, this.miniMapFlipY));
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 10); ctx.lineTo(0, 6); ctx.lineTo(-9, 10); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#4dc8ff'; ctx.shadowBlur = 15; ctx.fill();
      ctx.strokeStyle = '#087da5'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    }
    this._setLocalized(
      this.$.mapNorth,
      this.miniMapFlipY ? '남 · S' : '북 · N',
      this.miniMapFlipY ? 'SOUTH · S' : 'NORTH · N',
    );
    const turnLabels = this.englishMode
      ? { left: 'LEFT', right: 'RIGHT', straight: 'STRAIGHT' }
      : { left: '좌회전 · LEFT', right: '우회전 · RIGHT', straight: '직진 · STRAIGHT' };
    const turnIcons = { left: '↰', right: '↱', straight: '↑' };
    this.$.turn.textContent = maneuver
      ? `${turnIcons[maneuver.type]} ${turnLabels[maneuver.type]}`
      : (this.englishMode ? 'CITY GRID' : '시내 · CITY');
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
