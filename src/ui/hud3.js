// Seoul Snack Attack — HUD, third pass. STYLE SLICE.
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
//    vanishing point. Persistent state lives in corners; the order offer docks
//    under the money rail in the upper right — centre-screen sat it on top of the
//    van and the road ahead, and a 392px card there blocked more road than HUD.
//
// 6. SCRIMS INSTEAD OF HEAVIER GLASS. Dark panels over a dark road are invisible;
//    the same panels over a white-hot neon sign turn to soup. Each corner cluster
//    sits on a soft gradient scrim, so contrast is guaranteed by the background
//    rather than by making every panel more opaque. That let the glass get
//    *lighter*, and cut the backdrop-filter count from 8 to 4.

import { FoodPreview } from './food-preview.js';
import { CassetteDeck } from './cassette-deck.js';
import { dayProgress, DELIVERIES_PER_DAY } from '../game/day-progress.js';
import { icon, TOUCH_HELP } from './icons.js';

const CUT = 'polygon(0 0, 100% 0, 100% calc(100% - var(--notch)), calc(100% - var(--notch)) 100%, 0 100%)';

// A second finger may not receive a synthetic click while the first is held on
// a captured driving stick. Activate touch pointers directly, then suppress
// only their follow-up click; mouse, keyboard and assistive clicks still use
// the native path.
function bindActivation(node, activate) {
  node.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'touch') return;
    event.preventDefault();
    // Opening an overlay changes the hit-test tree before the compatibility
    // click arrives; without this capture guard that click can land on the new
    // veil and immediately close the overlay again.
    const swallowClick = (click) => {
      click.preventDefault();
      click.stopImmediatePropagation();
      window.removeEventListener('click', swallowClick, true);
      clearTimeout(expiry);
    };
    window.addEventListener('click', swallowClick, true);
    const expiry = setTimeout(() => window.removeEventListener('click', swallowClick, true), 800);
    activate();
  });
  node.addEventListener('click', activate);
}

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
#hud3 .day-progress { margin-top: 7px; color: var(--nav); font-size: 11px; line-height: 1.4; letter-spacing: .02em; }
#hud3 .day-progress span { display: block; }
#hud3 .day-progress .day-runs { color: var(--muted); font-size: 10px; }
#hud3 .day-progress .local-time { color: var(--ink); font-size: 10px; }
#hud3 .cash .amt.bump { animation: h3bump 0.45s cubic-bezier(0.2,0.9,0.3,1); }
@keyframes h3bump { 30% { transform: scale(1.09); } }

#hud3 .chips { display: flex; gap: 7px; }
#hud3 .chip { flex: 1; padding: 7px 10px 8px; }
#hud3 .chip .v { font-size: 15px; font-weight: 700; line-height: 1; }
#hud3 .chip .k { font-size: 9px; letter-spacing: 0.14em; color: var(--faint);
  text-transform: uppercase; margin-top: 4px; }
#hud3 .chip.rating .v { color: var(--money); }

/* ---- order docket (upper right, under the money rail, transient) --------- */
/* Sits below .rail (cash, day progress and rating), so the two right-side
   clusters read as one column and the road centre stays clear for driving. */
#hud3 .order {
  position: absolute; top: 184px; right: 18px;
  transform: translateX(16px); opacity: 0;
  width: 324px;
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.2,0.9,0.3,1);
}
#hud3 .order.show { opacity: 1; transform: translateX(0); }
/* An offered job has no route yet. Let its actionable docket temporarily own
   the right-hand detail area instead of drawing the always-on radar through it. */
#hud3.offer-visible .minimap.show { opacity: 0; }
/* Short viewports: the minimap (bottom: 104, ~250 tall) reaches this card's
   band, so slide the card left of the right-hand column instead of under it. */
@media (max-height: 560px) {
  #hud3 .order { right: 270px; top: 150px; }
}
#hud3 .order.show { pointer-events: auto; cursor: pointer; }
#hud3 .order.show:hover { filter: brightness(1.08); }
/* The header was a solid pink slab with white type on it — the loudest object on
   screen, sitting dead centre, for a card that is only ever asking a question.
   It now matches the ticket's head: a 10% tint of the accent with the label in
   the accent colour, so pink still says NEW ORDER without shouting it. The
   urgency that actually matters — the offer running out — is carried by the
   countdown hairline along the bottom edge, which is unchanged. */
#hud3 .order .strip {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 13px; margin: 1px 1px 0;
  background: rgba(255,45,120,0.10);
  border-bottom: 1px solid rgba(255,45,120,0.20);
}
#hud3 .order .strip .en { color: var(--alarm); opacity: 1; }
#hud3 .order .strip .dist { font-size: 11px; font-weight: 700; color: var(--ink); }
#hud3 .order .body { padding: 11px 14px 13px; }
#hud3 .order .shop { font-size: 17px; font-weight: 800; line-height: 1.15; }
#hud3 .order .shop-en { margin-top: 3px; }
#hud3 .order .dish {
  margin-top: 9px; padding-top: 9px; border-top: 1px dashed rgba(238,244,255,0.18);
  font-size: 12px; color: rgba(238,244,255,0.82);
}
/* ---- customer request note ---------------------------------------------- */
/* The one thing on the HUD written by a person rather than by the game, so it is
   set as quoted speech: a rule down the left, the label above it, no accent
   colour. Gold is money, cyan is navigation, pink is urgency — a request from
   the customer is none of those, and giving it a fourth colour would be the
   fourth colour rule 4 exists to prevent. Hidden entirely when an order has no
   note, because an empty quote block reads as a failed lookup. */
#hud3 .req { display: none; margin-top: 10px; padding-left: 9px;
  border-left: 2px solid rgba(238,244,255,0.20); }
#hud3 .order.has-req .req, #hud3 .ticket.has-req .req { display: block; }
#hud3 .req .t {
  display: block; margin-top: 3px; color: rgba(238,244,255,0.84);
  font-size: 13px; line-height: 1.35; font-weight: 500;
}
/* 206px of ticket cannot take a four-line note next to a countdown, and the
   whole line is on the offer card anyway — this is the reminder, not the read. */
#hud3 .ticket .req { margin-top: 9px; }
#hud3 .ticket .req .t {
  font-size: 11.5px; line-height: 1.34; color: rgba(238,244,255,0.78);
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
}

#hud3 .order .foot {
  margin-top: 12px; display: flex; align-items: flex-end; justify-content: space-between;
}
#hud3 .order .pay { font-size: 21px; font-weight: 800; color: var(--money); line-height: 1; }
#hud3 .order .pay small { font-size: 13px; opacity: 0.85; }
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
  position: absolute; top: 20px; left: 18px; width: 206px;
  opacity: 0; transform: translateX(-14px);
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.2,0.9,0.3,1);
}
#hud3 .ticket.show { opacity: 1; transform: none; }
#hud3 .ticket .head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 11px; margin: 1px 1px 0; background: rgba(77,200,255,0.10);
}
#hud3 .ticket .head .en { color: var(--nav); }
#hud3 .ticket .body { padding: 9px 11px 10px; }
#hud3 .ticket .to { font-size: 14px; font-weight: 700; line-height: 1.2; }

/* The card was made SMALLER to answer "too big" — 206px wide with a 62px dish
   view, down from 246px and 96px. It does not also auto-collapse: an earlier
   version hid the dish and the 3D preview after a few seconds, which read as the
   model being broken rather than as the card being tidy. The dish you are
   collecting is the point of the pickup leg, so it stays on screen for it. */
/* Pickup leg extras: what we're collecting, and a live 3D look at it. Shown
   only via .has-dish — once picked up, the food floats above the van instead. */
#hud3 .ticket .dish, #hud3 .ticket .dish-view { display: none; }
#hud3 .ticket.has-dish .dish {
  display: block; margin-top: 3px; max-height: 3em;
  color: var(--muted); font-size: 11px; font-weight: 600; line-height: 1.3;
}
/* height matches SIZE in src/ui/food-preview.js — the renderer is fixed-size. */
#hud3 .ticket.has-dish .dish-view {
  display: flex; justify-content: center; margin-top: 7px;
  height: 62px; max-height: 62px;
}
/* The pickup leg has no countdown and no food in the van yet, so the clock and
   condition rows are absent rather than frozen — a stopped timer reads as a bug. */
#hud3 .ticket .clock, #hud3 .ticket .bar, #hud3 .ticket .cond { display: none; }
#hud3 .ticket.timed .clock { display: flex; }

/* Stay-in-zone dwell. Cyan is navigation; alarm if you need to slow down. */
#hud3 .ticket .dwell { display: none; margin-top: 10px; }
#hud3 .ticket.dwelling .dwell { display: block; }
#hud3 .dwell .k {
  font-size: 10px; letter-spacing: .10em; text-transform: uppercase;
  color: var(--nav); margin-bottom: 5px; font-weight: 700;
}
#hud3 .dwellbar { height: 7px; background: rgba(238,244,255,0.10); }
#hud3 .dwellbar i {
  display: block; height: 100%; width: 0%;
  background: var(--nav); box-shadow: 0 0 10px var(--nav);
  transition: width 0.08s linear;
}
#hud3 .ticket.dwell-paused .dwell .k { color: var(--alarm); }
#hud3 .ticket.dwell-paused .dwellbar i { background: var(--alarm); box-shadow: 0 0 10px var(--alarm); }
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
  display: none; align-items: center; gap: 9px;
  padding: 6px 11px 7px; margin: 0 1px 1px; background: linear-gradient(90deg, rgba(77,200,255,0.13), rgba(77,200,255,0.035));
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

/* ---- heading-up radar mini-map ------------------------------------------ */
#hud3 .minimap {
  position: absolute; right: 18px; bottom: 104px; width: 236px;
  padding: 8px 8px 7px; opacity: 0; transition: opacity .2s ease;
}
#hud3 .minimap.show { opacity: 1; }
#hud3 .minimap canvas {
  display: block; width: 220px; height: 220px; border-radius: 50%;
  border: 1px solid rgba(77,200,255,.28);
  box-shadow: 0 0 0 3px rgba(7,14,24,.55), 0 0 22px rgba(77,200,255,.10),
    inset 0 0 30px rgba(0,0,0,.45);
  background: rgba(5,11,19,.92);
}
#hud3 .minimap .map-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1px 6px 7px; color: var(--nav); font-size: 9px;
  letter-spacing: .14em; text-transform: uppercase;
}
#hud3 .minimap .turn { color: var(--ink); letter-spacing: .08em; font-weight: 800; }
/* Street blade: a road sign, not a HUD row. Korean name leads, romanisation
   sits under it, and the whole plate dims when the player leaves the road. */
#hud3 .minimap .blade {
  margin: 7px auto 0; padding: 5px 10px 4px; max-width: 100%;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  border: 1px solid rgba(77,200,255,.32); border-radius: 5px;
  background: linear-gradient(180deg, rgba(10,20,32,.94), rgba(6,13,22,.94));
  box-shadow: 0 0 14px rgba(77,200,255,.10), inset 0 1px 0 rgba(148,200,230,.12);
  opacity: 0; transition: opacity .18s ease;
}
#hud3 .minimap .blade.show { opacity: 1; }
/* Off the carriageway the blade names the district instead, and says so by
   going quiet rather than by swapping in another label. */
#hud3 .minimap .blade.off { border-color: rgba(120,140,160,.26); box-shadow: none; }
#hud3 .minimap .blade.off .ko { color: var(--muted); }
#hud3 .minimap .blade .ko {
  color: var(--ink); font-size: 13px; font-weight: 800; letter-spacing: .02em;
  line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 100%;
}
#hud3 .minimap .blade .en {
  color: var(--nav); font-size: 8px; font-weight: 700; letter-spacing: .16em;
  text-transform: uppercase; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 100%;
}
/* English mode already prints the roman name large, so the tier below is noise. */
#hud3.english-mode .minimap .blade .ko { font-size: 12px; letter-spacing: .08em; }
#hud3.english-mode .minimap .blade .en { display: none; }
@media (max-width: 760px) {
  #hud3 .minimap { width: 192px; bottom: 92px; }
  #hud3 .minimap canvas { width: 176px; height: 176px; }
  #hud3 .minimap .blade .ko { font-size: 12px; }
  #hud3 .minimap .blade .en { font-size: 7px; letter-spacing: .12em; }
}

/* ---- cinematic: clear the screen for a set piece -------------------------
   Driven by setCinematic(). Fades rather than cuts, so entering the water
   reads as the HUD being taken away from the player rather than as a frame
     where several panels vanished. Toasts and settings/music remain available. */
#hud3.cinematic .order,
#hud3.cinematic .ticket,
#hud3.cinematic .minimap,
  #hud3.cinematic .speed,
  #hud3.cinematic .rail {
  opacity: 0 !important;
  pointer-events: none;
  transition: opacity .45s ease;
}

  #hud3.cinematic .legend,
  #hud3.cinematic .garage-status,
  #hud3.cinematic .translate-hint { display: none !important; }
  #hud3 .dive-readout {
    display: none; position: absolute; right: max(22px, env(safe-area-inset-right));
    top: max(22px, env(safe-area-inset-top)); text-align: right;
    color: #b5d7e0; text-shadow: 0 2px 8px #02080d; font-size: 11px;
  }
  #hud3 .dive-readout.visible { display: grid; gap: 6px; }
  #hud3 .dive-readout strong { font-size: 24px; font-weight: 500; letter-spacing: .04em; }
  #hud3 .dive-readout small { font-size: 10px; opacity: .8; }
  body.touch-controls-active #hud3 .dive-readout {
    top: 12px; right: var(--map-right); max-width: min(170px, calc(100% - 130px));
  }

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
#hud3.on-foot .speed { display: none; }

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
#hud3 .legend[hidden] { display: none !important; }
#hud3 .legend b {
  display: inline-grid; place-items: center; min-width: 17px; height: 17px; padding: 0 4px;
  margin-right: 4px; border: 1px solid rgba(238,244,255,0.30); border-radius: 3px;
  background: rgba(4,6,12,0.72); box-shadow: 0 1px 6px rgba(0,0,0,0.6);
  color: var(--ink); font-size: 10px; font-weight: 700; text-shadow: none;
}
#hud3 .legend span { display: inline-flex; align-items: center; }
/* Translate hint. Almost every string in this HUD is Korean, so a player who
   cannot read it has to find this one control or the game is unreadable — but it
   is still a hint, not an alert. It was 9px at 0.8 opacity, buried UNDER the
   control legend, which is where you put something you do not want found.
   Now: its own bordered chip, above the legend, with real key caps. It arrives
   lit and breathing for HINT_INTRO_MS so the eye catches it once, then settles
   to a calm chip that never animates again. */
#hud3 .translate-hint {
  display: inline-flex; align-items: center; gap: 7px; align-self: flex-start;
  margin-bottom: 7px; padding: 5px 10px 5px 6px;
  border: 1px solid rgba(77,200,255,0.42); border-radius: 4px;
  background: rgba(6,18,28,0.72);
  color: var(--nav); font-size: 10.5px; font-weight: 700; letter-spacing: .10em;
  text-shadow: 0 1px 4px rgba(0,0,0,0.9);
  transition: opacity .9s ease, border-color .9s ease, box-shadow .9s ease;
  opacity: .74;
}
#hud3 .translate-hint b, #hud3 .translate-hint i {
  display: inline-grid; place-items: center; min-width: 17px; height: 17px; padding: 0 4px;
  border: 1px solid rgba(77,200,255,0.45); border-radius: 3px;
  background: rgba(4,10,18,0.85);
  color: var(--ink); font-size: 10px; font-weight: 700; font-style: normal;
  text-shadow: none;
}
#hud3 .translate-hint i { opacity: .78; font-size: 9px; }
/* Intro: brighter, with a slow two-beat breath. Removed after HINT_INTRO_MS. */
#hud3 .translate-hint.intro {
  opacity: 1; border-color: rgba(77,200,255,0.85);
  animation: h3hint 2.6s ease-in-out 2;
}
@keyframes h3hint {
  0%, 100% { box-shadow: 0 0 0 rgba(77,200,255,0); }
  50% { box-shadow: 0 0 14px rgba(77,200,255,0.45); }
}
/* Once English is on, the hint has done its job — state it, stop selling it. */
#hud3 .translate-hint.active { opacity: .62; border-color: rgba(77,200,255,0.28); }
@media (prefers-reduced-motion: reduce) {
  #hud3 .translate-hint.intro { animation: none; }
}
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
#hud3 .audio-status {
  position: relative; width: 122px; height: 72px; margin-top: 1px; padding: 0;
  overflow: hidden; border-radius: 5px; color: var(--muted);
  background: radial-gradient(circle at 55% 30%, rgba(77,200,255,.09), rgba(4,6,12,.88) 72%);
  border: 1px solid rgba(238,244,255,0.18); font: inherit; cursor: pointer;
  box-shadow: 0 7px 20px rgba(0,0,0,.28); transform: perspective(260px) rotateX(2deg);
  transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
  pointer-events: auto;
}
#hud3 .audio-status:hover, #hud3 .audio-status:focus-visible {
  transform: perspective(260px) rotateX(0) translateY(-2px); border-color: rgba(77,200,255,.58);
  box-shadow: 0 10px 25px rgba(0,0,0,.38), 0 0 16px rgba(77,200,255,.12); outline: none;
}
#hud3 .cassette-launcher-view { position: absolute; inset: 0; display: grid; place-items: center; }
#hud3 .cassette-launcher-view::before {
  content: ''; width: 82px; height: 47px; border-radius: 4px;
  background: linear-gradient(155deg, #554638, #17120f 58%, #312820);
  border: 1px solid rgba(255,242,224,.32); box-shadow: 7px 9px 12px rgba(0,0,0,.45);
  transform: rotate(-7deg) skewX(-2deg);
}
#hud3 .cassette-launcher-view canvas { position: absolute; inset: 0; width: 100% !important; height: 100% !important; }
#hud3 .cassette-launcher-label {
  position: absolute; left: 6px; right: 6px; bottom: 4px; z-index: 2;
  color: rgba(238,244,255,.78); font-size: 8px; font-weight: 800; letter-spacing: .12em;
  text-align: center; text-shadow: 0 1px 5px #000, 0 0 8px #000;
}
#hud3 .garage-status { margin-top: 1px; padding: 4px 8px; border-radius: 3px; color: var(--nav); background: rgba(4,6,12,0.66); border: 1px solid rgba(77,200,255,.35); font-size: 10px; letter-spacing: .04em; text-shadow: 0 1px 4px #000; pointer-events: auto; cursor: pointer; }
/* The settings door. Deliberately quieter than the garage chip: it is a place
   you go once, not a thing the delivery loop keeps pointing at. */
#hud3 .settings-status { margin-top: 1px; padding: 4px 8px; border-radius: 3px; color: var(--muted); background: rgba(4,6,12,0.66); border: 1px solid rgba(238,244,255,0.16); font-size: 10px; letter-spacing: .04em; text-shadow: 0 1px 4px #000; pointer-events: auto; cursor: pointer; }
#hud3 .settings-status:hover, #hud3 .settings-status:focus-visible { color: var(--nav); border-color: rgba(77,200,255,.45); }
#hud3 .pad-status[hidden] { display: none; }
#hud3 .audio-status.on { color: var(--nav); border-color: rgba(77,200,255,0.45); }
#hud3 .audio-status.muted { color: var(--alarm); border-color: rgba(255,45,120,0.45); }
#hud3 .audio-status.blocked { color: var(--alarm); border-color: rgba(255,45,120,0.45); }
#hud3 .audio-status::before {
  content: ''; position: absolute; z-index: 3; top: 7px; right: 7px; width: 6px; height: 6px;
  border-radius: 50%; background: rgba(238,244,255,.34); box-shadow: 0 0 7px currentColor;
}
#hud3 .audio-status.on::before { background: var(--nav); }
#hud3 .audio-status.muted::before, #hud3 .audio-status.blocked::before { background: var(--alarm); }
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

/** How long the translate chip stays lit before settling to a quiet hint. */
const HINT_INTRO_MS = 14000;

/**
 * Vehicle heading -> clockwise canvas rotation of a north-up world map. The
 * heading-up mini-map negates this to spin the world around the player.
 *
 * Derivation, because getting this wrong is silent — the arrow just points
 * somewhere plausible and nobody notices until they follow it:
 *
 *   heading = atan2(fwd.x, fwd.z)  (src/game/orders.js), so facing game north
 *   (world -Z) is heading PI, not 0.
 *
 *   North-up canvas: +X world is canvas right, +Z world is canvas DOWN. The
 *   arrow path points at canvas -Y, and ctx.rotate is clockwise on screen
 *   (y grows downward). Rotating (0,-1) by t gives (sin t, -cos t), so
 *   matching it to the forward vector (fwd.x, fwd.z) needs
 *   sin t = fwd.x and cos t = -fwd.z, i.e. t = PI - heading.
 *
 * This base used to be a bare `heading`, which is the SOUTH-up answer, and
 * mapPoint below was drawn south-up to match. Both are flipped now, so an
 * unflipped map is genuinely north-up and the 북 · N label is honest.
 */
export const minimapArrowRotation = (heading, flipX = false, flipY = false) => {
  let angle = Math.PI - heading;
  if (flipX) angle = -angle;
  if (flipY) angle = Math.PI - angle;
  // Normalize to (-PI, PI]. ctx.rotate does not care, but callers and the
  // bench read the sign as "turning left/right", and 3PI/2 reads as neither.
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  return angle;
};

// Bindings mirror KEY_ACTIONS / PAD_BUTTONS in core/input.js. The full-city map
// is keyboard-only for now, so it appears in the keyboard list only. The action
// is still named `debug` in the input map; what it opens is Settings, which is
// where the developer surfaces now live.
const LEGENDS = {
  keyboard: [
    ['W A S D', '주행'], ['Space', '사이드브레이크'], ['E', '수락'],
    ['C', '시점'], ['V', '카메라 각도'], ['R', '리셋'], ['Esc', '설정'], ['M', '전체 지도'],
  ],
  gamepad: [
    ['L-Stick', '조향'], ['RT', '가속'], ['LT', '브레이크'],
    ['A', '사이드브레이크'], ['X', '수락'], ['R-Stick', '시점'], ['D-Pad ↑', '카메라 각도'],
    ['Y', '리셋'], ['View', '설정'],
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
    ['C', 'View'], ['V', 'Cam angle'], ['R', 'Reset'], ['Esc', 'Settings'], ['M', 'City map'], ['T', 'English'],
  ],
  gamepad: [
    ['L-Stick', 'Steer'], ['RT', 'Accelerate'], ['LT', 'Brake'],
    ['A', 'Handbrake'], ['X', 'Accept'], ['R-Stick', 'View'], ['D-Pad ↑', 'Cam angle'],
    ['Y', 'Reset'], ['View', 'Settings'], ['LB', 'English'],
  ],
  touch: [
    ['Left', 'Throttle / brake'], ['Right', 'Steer'],
    ['Button', 'Handbrake'], ['Tap', 'Accept'],
  ],
};

const FOOT_LEGENDS = {
  keyboard: [
    ['W A S D', '이동'], ['Shift', '달리기'], ['Space', '점프'],
    ['F', '차량 탑승'], ['E', '수락'], ['R', '복귀'], ['M', '전체 지도'], ['Esc', '설정'],
  ],
  gamepad: [
    ['L-Stick', '이동'], ['R-Stick', '카메라'], ['RB', '달리기'],
    ['A', '점프'], ['B', '차량 탑승'], ['X', '수락'], ['Y', '복귀'],
  ],
  touch: [
    ['Left / Right', '이동'], ['JUMP', '점프'], ['VEHICLE', '차량 탑승'], ['Tap', '수락'],
  ],
};

const FOOT_ENGLISH_LEGENDS = {
  keyboard: [
    ['W A S D', 'Move'], ['Shift', 'Sprint'], ['Space', 'Jump'],
    ['F', 'Enter vehicle'], ['E', 'Accept'], ['R', 'Reset'], ['M', 'City map'], ['Esc', 'Settings'],
  ],
  gamepad: [
    ['L-Stick', 'Move'], ['R-Stick', 'Camera'], ['RB', 'Sprint'],
    ['A', 'Jump'], ['B', 'Enter vehicle'], ['X', 'Accept'], ['Y', 'Reset'],
  ],
  touch: [
    ['Left / Right', 'Move'], ['JUMP', 'Jump'], ['VEHICLE', 'Enter'], ['Tap', 'Accept'],
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
        <h2>서울 스낵 어택 · SEOUL SNACK ATTACK</h2>
        <div class="sub">INTERNAL PREVIEW · FIRST DELIVERY</div>
        <p id="h3intro">주문을 수락하고 식당에서 픽업한 뒤, 시간과 충격으로 배달 금액이 줄기 전에 목적지로 배달하세요.</p>
        <div class="keys"><span><b>WASD / Arrows</b> <span class="key-label">주행 · Drive</span></span><span><b>Space</b> <span class="key-label">사이드브레이크 · Handbrake</span></span><span><b>E / X</b> <span class="key-label">주문 수락 · Accept</span></span><span><b>R / Y</b> <span class="key-label">도로로 복귀 · Reset</span></span><span><b>M</b> <span class="key-label">전체 지도 · City map</span></span><span><b>첫 입력</b> <span class="key-label">오디오 활성화 · Audio unlock</span></span></div>
        <p class="mobile-control-help">${TOUCH_HELP}</p>
        <button id="h3start">첫 배달 시작 · START FIRST DELIVERY</button>
      </div>

      <div class="garage-menu" id="h3garage">
        <div class="garage-head"><h3 id="h3garagetitle">차고 · Garage</h3><button id="h3garageclose" type="button" aria-label="Close garage">×</button></div>
        <div class="garage-cash" id="h3garagecash">₩0</div>
        <div class="garage-list" id="h3garagelist"></div>
      </div>

      <div class="dive-readout" id="h3dive"><span id="h3divetitle"></span><strong id="h3divedepth"></strong><small id="h3divehelp"></small></div>
      <div class="rail">
        <div class="panel cash">
          <div class="amt" id="h3cash"><small>₩</small>0</div>
          <div class="lbl en">보유 현금 · Cash</div>
          <div class="day-progress" role="status"><span id="h3day"></span><span class="day-runs" id="h3dayruns"></span><span class="local-time" id="h3localtime"></span></div>
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
          <div class="req"><span class="k en" id="h3reqlabel">배달 요청사항</span><span class="t" id="h3req">—</span></div>
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
          <div class="dish" id="h3tdish">—</div>
          <div class="dish-view" id="h3tdishview"></div>
          <div class="dwell" id="h3dwell">
            <div class="k en" id="h3dwellk">존에 머무르세요 · Stay in zone</div>
            <div class="dwellbar"><i id="h3dwellbar"></i></div>
          </div>
          <div class="req"><span class="k en" id="h3treqlabel">배달 요청사항</span><span class="t" id="h3treq">—</span></div>
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
        <canvas id="h3map" width="440" height="440" aria-label="Heading-up route mini-map"></canvas>
        <div class="blade" id="h3blade" aria-live="polite">
          <span class="ko" id="h3streetko"></span><span class="en" id="h3streeten"></span>
        </div>
      </div>

      <div class="speed">
        <div class="v" id="h3speed">0</div><div class="u">km/h</div>
        <div class="gauge"><i id="h3gauge"></i></div>
      </div>

      <div class="stack">
        <div class="toasts" id="h3toasts"></div>
        <div class="translate-hint intro" id="h3translatehint"><b>T</b><span>HOLD FOR ENGLISH</span><i>LB</i></div>
        <div class="legend" id="h3legend"></div>
        <div class="garage-status" id="h3garagestatus" role="button" tabindex="0">차고 · GARAGE</div>
        <button class="settings-status" id="h3settingsstatus" type="button" aria-label="Settings" title="Settings">${icon('settings')}<span class="desktop-label">ESC · 설정 · SETTINGS</span></button>
        <div class="pad-status" id="h3padstatus" hidden>XBOX · PRESS ANY BUTTON IN THIS TAB</div>
        <button class="audio-status" id="h3audio" type="button" aria-live="polite" title="카세트 데크 · Open tape deck">${icon('cassette')}<span class="cassette-launcher-view" aria-hidden="true"></span><span class="cassette-launcher-label">TAPE DECK</span></button>
      </div>
    `;
    document.body.appendChild(el);
    this.el = el;

    const $ = (id) => el.querySelector(`#${id}`);
    this.$ = {
      cash: $('h3cash'), rating: $('h3rating'), deliv: $('h3deliv'),
      day: $('h3day'), dayRuns: $('h3dayruns'), localTime: $('h3localtime'),
      order: $('h3order'), shop: $('h3shop'), shopen: $('h3shopen'), dish: $('h3dish'),
      pay: $('h3pay'), dist: $('h3dist'), offerbar: $('h3offerbar'),
      req: $('h3req'), reqLabel: $('h3reqlabel'),
      ticket: $('h3ticket'), tstage: $('h3tstage'), tdist: $('h3tdist'), to: $('h3to'),
      tdish: $('h3tdish'), tdishview: $('h3tdishview'),
      dwell: $('h3dwell'), dwellk: $('h3dwellk'), dwellbar: $('h3dwellbar'),
      treq: $('h3treq'), treqLabel: $('h3treqlabel'),
      time: $('h3time'), timeLabel: $('h3timelabel'), tbar: $('h3tbar'), value: $('h3value'), valueLabel: $('h3valuelabel'), deduction: $('h3deduction'),
      cond: $('h3cond'), condpct: $('h3condpct'), segs: $('h3segs'),
      obj: $('h3obj'), objd: $('h3objd'), arrow: el.querySelector('.obj .arrow'),
      minimap: $('h3minimap'), map: $('h3map'), turn: $('h3turn'), mapNorth: $('h3mapnorth'),
      blade: $('h3blade'), streetKo: $('h3streetko'), streetEn: $('h3streeten'),
      speed: $('h3speed'), gauge: $('h3gauge'),
      toasts: $('h3toasts'), legend: $('h3legend'), acceptKey: $('h3acceptkey'),
      padStatus: $('h3padstatus'), settingsStatus: $('h3settingsstatus'), audio: $('h3audio'), release: $('h3release'), start: $('h3start'), translateHint: $('h3translatehint'),
      intro: $('h3intro'), garage: $('h3garage'), garageTitle: $('h3garagetitle'), garageClose: $('h3garageclose'), garageCash: $('h3garagecash'), garageList: $('h3garagelist'), garageStatus: $('h3garagestatus'),
    };

    this.$.segs.innerHTML = '<i></i>'.repeat(SEGMENTS);
    this.segEls = [...this.$.segs.querySelectorAll('i')];
    this.setCondition(1);
    this.mapContext = this.$.map.getContext('2d');
    this.foodPreview = new FoodPreview(this.$.tdishview);

    this.maxSpeed = 125;
    this._spillTimer = null;
    this._localized = new Set();
    this.englishMode = false;
    this.inputMode = 'keyboard';
    this.gameplayMode = 'driving';
    this.miniMapFlipX = false;
    this.miniMapFlipY = false;
    this._acceptRequested = false;
    this._startHandler = null;
    // ?intro=off is a probe/QA hook: skip the release card without persisting
    // the seen flag, so headless screenshots frame the world, not the overlay.
    this._onboardingVisible =
      localStorage.getItem('snack-attack-intro-seen') !== '1' &&
      new URLSearchParams(location.search).get('intro') !== 'off';
    const staticText = [
      [el.querySelector('.cash .lbl'), 'Cash'],
      [el.querySelector('.rating .k'), 'Rating'],
      [el.querySelector('.chips .panel:not(.rating) .k'), 'Runs'],
      [el.querySelector('.order .strip .en'), 'New order'],
      [el.querySelector('.order .accept span:last-child'), 'ACCEPT'],
      // The ticket's label is rewritten per leg by _setNote; this is its default
      // so hold-for-English works even before the first ticket appears.
      [this.$.reqLabel, 'Delivery note'],
      [this.$.treqLabel, 'Delivery note'],
      [this.$.timeLabel, 'Remaining'],
      [this.$.dwellk, 'Stay in zone'],
      [this.$.valueLabel, 'Delivery total'],
      [el.querySelector('.cond .k .en'), 'Food condition'],
      [el.querySelector('.obj > span.en'), 'Target'],
      [this.$.mapNorth, 'NORTH · N'],
      [this.$.intro, 'Accept an order, collect it, then deliver. Occasional delays and crashes deduct from the total.'],
      [this.$.start, 'START FIRST DELIVERY'],
      [this.$.garageTitle, 'GARAGE'],
      [this.$.garageStatus, 'GARAGE'],
      [this.$.settingsStatus.querySelector('.desktop-label'), 'SETTINGS'],
      [this.$.release.querySelector('h2'), 'SEOUL SNACK ATTACK'],
      [this.$.release.querySelectorAll('.keys b')[5], 'Any input'],
    ];
    staticText.forEach(([node, en]) => this._setLocalized(node, node?.textContent || '', en));
    const introKeysEn = ['Drive', 'Handbrake', 'Accept', 'Reset', 'City map', 'Audio unlock'];
    [...this.$.release.querySelectorAll('.key-label')]
      .forEach((node, i) => this._setLocalized(node, node.textContent, introKeysEn[i]));
    this.setInputMode('keyboard');
    this.setEnglishMode(false);
    this.updateLocalTime();
    this._clockTimer = setInterval(() => this.updateLocalTime(), 15000);
    this._hintIntroTimer = setTimeout(() => this._settleTranslateHint(), HINT_INTRO_MS);
    bindActivation(this.$.start, () => {
      this.dismissReleaseCard();
      this._wakeAudio?.();
      this._startHandler?.();
    });
    bindActivation(this.$.order, () => { this._acceptRequested = true; });
    // The audio chip opens the cassette deck (the deck absorbs the old
    // audio-menu's transport controls).
    bindActivation(this.$.audio, () => { this._wakeAudio?.(); this.deck?.toggle(); });
    bindActivation(this.$.garageStatus, () => this.setGarageOpen(!this.isGarageOpen()));
    this.$.garageStatus.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.$.garageStatus.click(); }
    });
    bindActivation(this.$.garageClose, () => this.setGarageOpen(false));
    bindActivation(this.$.settingsStatus, () => this._settingsHandler?.());
    // h3audio is a native button, so Enter/Space activation is supplied by the
    // browser (a manual key handler would toggle the deck twice).
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
    const onFoot = this.gameplayMode === 'onFoot' || this.gameplayMode === 'entering';
    const source = onFoot
      ? (this.englishMode ? FOOT_ENGLISH_LEGENDS : FOOT_LEGENDS)
      : (this.englishMode ? ENGLISH_LEGENDS : LEGENDS);
    const items = source[mode] ?? source.keyboard;
    this.$.legend.innerHTML = items
      .map(([k, v]) => `<span><b>${k}</b>${v}</span>`)
      .join('');
    if (this.$.acceptKey) this.$.acceptKey.textContent = mode === 'gamepad' ? 'X' : mode === 'touch' ? 'TAP' : 'E';

    this.$.legend.classList.remove('dim');
    // The legend is first-delivery onboarding. It stays fully legible until the
    // player proves the loop once, then the permanent list lives in Settings.
  }

  setGameplayMode(mode) {
    this.gameplayMode = mode;
    this.el?.classList.toggle('on-foot', mode === 'onFoot' || mode === 'entering');
    this.setInputMode(this.inputMode);
  }

  /**
   * Clear the gameplay chrome for a set piece.
   *
   * The abyssal dive (src/game/dive.js) needs the screen. Offering the player a
   * hotteok delivery and a street-level GPS while they are going down a
     * plughole reads as the game not having noticed. Depth replaces the city
     * rail; toasts, settings and music remain accessible.
   */
  setCinematic(on) {
    this.el?.classList.toggle('cinematic', !!on);
  }

  setDiveState(state, depth) {
    const visible = state === 'abyss' || state === 'arriving' || state === 'returning';
    const key = `${state}/${Math.round(depth)}/${this.inputMode}/${this.englishMode}`;
    if (key === this._diveKey) return;
    this._diveKey = key;
    this.el.querySelector('#h3dive')?.classList.toggle('visible', visible);
    if (!visible) return;
    this.el.querySelector('#h3divetitle').textContent = this.englishMode ? 'THE ABYSS' : '심연 · THE ABYSS';
    this.el.querySelector('#h3divedepth').textContent = `${Math.round(depth)} m`;
    const pad = this.inputMode === 'gamepad', touch = this.inputMode === 'touch';
    this.el.querySelector('#h3divehelp').textContent = touch
      ? (this.englishMode ? 'Rise / Dive · Light above leads home' : '상승 / 잠수 · 빛을 따라 수면으로')
      : this.englishMode
        ? `${pad ? 'RB' : 'Shift'} dive · ${pad ? 'A' : 'Space'} rise`
        : `${pad ? 'RB' : 'Shift'} 잠수 · ${pad ? 'A' : 'Space'} 상승`;
  }

  /** Drop the translate chip out of its intro state, once and for good. */
  _settleTranslateHint() {
    clearTimeout(this._hintIntroTimer);
    this.$.translateHint?.classList.remove('intro');
  }

  setEnglishMode(active) {
    if (this.englishMode === active) return;
    this.englishMode = active;
    this.el?.classList.toggle('english-mode', active);
    this.$.legend?.classList.toggle('translate-active', active);
    // Only the label swaps — the chip's key caps are elements, and textContent
    // on the container would delete them.
    const hint = this.$.translateHint;
    if (hint) {
      const label = hint.querySelector('span');
      if (label) label.textContent = active ? 'ENGLISH MODE ON' : 'HOLD FOR ENGLISH';
      hint.classList.toggle('active', active);
      // Reading it is the whole point of the intro, so the first use ends it.
      if (active) this._settleTranslateHint();
    }
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

  /** main.js hands us the opener; the chip is inert until it does. */
  onSettings(handler) { this._settingsHandler = handler; }

  // "XBOX · PRESS ANY BUTTON IN THIS TAB" sat on screen for every player who
  // has never owned a controller — a dev prompt wearing a HUD chip. The chip
  // now appears only once there is something to say: a pad is connected, or the
  // browser cannot do gamepads at all.
  setControllerStatus(status, name = '') {
    const connected = status === 'connected';
    this.$.padStatus.hidden = !connected && status !== 'unsupported';
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
      on: 'AUDIO · ON · CLICK FOR TAPE DECK',
      muted: 'AUDIO · MUTED · OPEN TAPE DECK TO UNMUTE',
    };
    const label = this.$.audio.querySelector('.cassette-launcher-label');
    if (label) label.textContent = status === 'muted' ? 'MUTED · TAPE DECK' : 'TAPE DECK';
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
    if (remember) localStorage.setItem('snack-attack-intro-seen', '1');
  }

  configureGarage({ vehicles, currentId, getSave, onChoose, onToggle }) {
    this._garageConfig = { vehicles, currentId, getSave, onChoose, onToggle };
    this.refreshGarage();
  }

  isGarageOpen() { return !!this._garageOpen; }

  /**
   * Open/close the garage overlay. `onToggle` (from configureGarage) lets
   * main.js pause gameplay while the menu covers the screen.
   */
  setGarageOpen(open) {
    open = !!open;
    if (open === this.isGarageOpen()) return;
    this._garageOpen = open;
    this.el.classList.toggle('garage-open', open);
    if (open) this.refreshGarage();
    this.$.garage.classList.toggle('show', open);
    this._garageConfig?.onToggle?.(open);
  }

  closeGarage() { this.setGarageOpen(false); }

  refreshGarage() {
    const config = this._garageConfig;
    if (!config) return;
    const save = config.getSave();
    const currentId = typeof config.currentId === 'function' ? config.currentId() : config.currentId;
    this.$.garageCash.textContent = `${this.englishMode ? 'CASH' : '보유 현금'} · ₩${save.cash.toLocaleString()}`;
    this.$.garageList.replaceChildren();
    for (const vehicle of config.vehicles) {
      const owned = save.owned.includes(vehicle.id);
      const current = currentId === vehicle.id;
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
    this._wakeAudio = wakeAudio;
    // The cassette deck owns transport, the tape rack and mute.
    this.deck = new CassetteDeck({ soundtrack, audio, hud: this, container: this.el, launcher: this.$.audio });
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
    if (deliveries != null) {
      this.$.deliv.textContent = deliveries;
      this.$.legend.hidden = deliveries > 0;
      const progress = dayProgress(deliveries);
      this._setLocalized(this.$.day, `${progress.day}일차 · ${progress.ko}`, `Day ${progress.day} · ${progress.en}`);
      this._setLocalized(this.$.dayRuns, `${progress.completed}/${DELIVERIES_PER_DAY} · ${progress.time}`, `${progress.completed}/${DELIVERIES_PER_DAY} · ${progress.time}`);
      this.$.day.parentElement.title = 'Four successful deliveries advance morning → afternoon → dusk → night. Finish a day to earn a tape.';
    }
  }

  updateLocalTime(now = new Date()) {
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.$.localTime.dataset.time = time;
    this._setLocalized(this.$.localTime, `현재 시각 · ${time}`, `Local time · ${time}`);
  }

  setSpeed(kmh) {
    const v = Math.abs(kmh);
    this.$.speed.textContent = Math.round(v);
    this.$.gauge.style.width = `${clamp01(v / this.maxSpeed) * 100}%`;
  }

  showOffer({ shop, shopEn, dish, dishEn = dish, pay, distanceKm, note, noteEn = note }) {
    this._setLocalized(this.$.shop, shop, shopEn);
    this._setLocalized(this.$.shopen, shopEn, '');
    this._setLocalized(this.$.dish, dish, dishEn);
    this.$.pay.innerHTML = won(pay);
    this.$.dist.textContent = `${distanceKm.toFixed(1)} km`;
    this._setNote(this.$.order, this.$.req, note, noteEn);
    this.$.order.classList.add('show');
    this.el.classList.add('offer-visible');
  }

  /**
   * Fill or clear a panel's request note. The label is optional because the
   * offer only ever carries the rider's instruction, while the ticket swaps
   * between the kitchen's and the rider's as the job changes hands.
   */
  _setNote(panel, textNode, ko, en = ko, labelNode = null, labelKo = '', labelEn = labelKo) {
    if (!panel || !textNode) return;
    panel.classList.toggle('has-req', !!ko);
    if (!ko) return;
    this._setLocalized(textNode, ko, en);
    if (labelNode && labelKo) this._setLocalized(labelNode, labelKo, labelEn);
  }
  /** @param {number} t 1 → 0 as the offer window closes */
  setOfferProgress(t) { this.$.offerbar.style.width = `${clamp01(t) * 100}%`; }
  hideOffer() {
    this.$.order.classList.remove('show');
    this.el.classList.remove('offer-visible');
  }

  /**
   * @param {string} to          destination, Korean
   * @param {string} stage       head label, e.g. '픽업 · Pickup'
   * @param {number} distanceKm  TOTAL job length — not remaining. Remaining lives
   *                             on the objective row, and showing the same number
   *                             twice on one panel is wasted space.
   * @param {boolean} timed      false on the pickup leg: no countdown, no condition
   * @param {string}  [dish]     ordered dish name — pickup leg only; the deliver leg
   *                             shows the food above the van, not in the panel
   * @param {object}  [order]    order object, for the 3D dish preview
   * @param {string}  [note]     customer request; the row is hidden without one
   * @param {string}  [noteLabel] whose request it is — kitchen on the pickup leg,
   *                              rider on the delivery leg
   */
  showTicket({ to, toEn = to, stage, stageEn = stage, seconds = 0, totalSeconds = 0, payout = 0, distanceKm, condition = 1, timed = true, dish, dishEn = dish, order, note, noteEn = note, noteLabel = '배달 요청사항', noteLabelEn = 'Delivery note' }) {
    this.setDwell(null);
    this._setLocalized(this.$.to, to, toEn);
    this._setLocalized(this.$.tstage, stage, stageEn);
    this.$.tdist.textContent = `${distanceKm.toFixed(1)} km`;
    this._setNote(this.$.ticket, this.$.treq, note, noteEn, this.$.treqLabel, noteLabel, noteLabelEn);
    this.$.ticket.classList.toggle('timed', timed);
    this.$.ticket.classList.toggle('has-dish', !!dish);
    if (dish) {
      this._setLocalized(this.$.tdish, dish, dishEn);
      this.foodPreview.setOrder(order);
    } else {
      this.foodPreview.clear();
    }
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

  /**
   * Stay-in-zone progress. `progress` null hides the bar; 0..1 fills it.
   * `paused` means the van is in the ring but still too fast.
   */
  setDwell(progress, { kind = 'pickup', paused = false } = {}) {
    if (progress == null || !this.$.ticket) {
      this.$.ticket?.classList.remove('dwelling', 'dwell-paused');
      return;
    }
    this.$.ticket.classList.add('dwelling');
    this.$.ticket.classList.toggle('dwell-paused', !!paused);
    this.$.dwellbar.style.width = `${clamp01(progress) * 100}%`;
    const labels = kind === 'drop'
      ? ['배달 존에 머무르세요', 'STAY TO DELIVER']
      : ['픽업 존에 머무르세요', 'STAY TO PICK UP'];
    const pausedLabels = ['12 km/h 이하로 감속', 'SLOW BELOW 12 KM/H'];
    this._setLocalized(
      this.$.dwellk,
      paused ? pausedLabels[0] : labels[0],
      paused ? pausedLabels[1] : labels[1],
    );
  }
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
  hideTicket() {
    this.$.ticket.classList.remove('show');
    this.setDwell(null);
    this.foodPreview.stop();
  }

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

  /**
   * Heading-up radar mini-map: the world rotates around the player, who sits
   * fixed below centre so more road ahead is visible. The old map drew the
   * whole city graph on a 252x176 canvas, which squeezed every road to a
   * 1 px hairline — the "ladder" nobody could read. A ~110 m window keeps
   * roads at their true width, and a single canvas transform (translate ->
   * rotate -> scale) replaces the per-point projection the old code repeated
   * for every layer.
   */
  setMiniMap({ graph, bounds, route = null, player = null, destination = null, maneuver = null, street = null } = {}) {
    if (!graph || !bounds) { this.$.minimap.classList.remove('show'); return; }
    this.$.minimap.classList.add('show');
    const canvas = this.$.map;
    const ctx = this.mapContext;
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const rim = Math.min(cx, cy) - 4;          // drawable radius inside the ring
    const VIEW_M = 110;                        // world metres visible at the rim
    const s = rim / VIEW_M;                    // world -> canvas scale
    const heading = player?.heading || 0;
    const ppos = player?.position
      || { x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2 };
    // North-up base rotation (see minimapArrowRotation); negating it spins the
    // world so the player's forward vector always points at the top of the disc.
    const t = minimapArrowRotation(heading, this.miniMapFlipX, this.miniMapFlipY);
    // Player screen anchor: 30% below centre = ~28 m of road behind, 192 ahead.
    const px = cx, py = cy + rim * 0.3;

    ctx.clearRect(0, 0, w, h);

    // Clip everything map-like to the disc.
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, rim, 0, Math.PI * 2); ctx.clip();

    const bg = ctx.createLinearGradient(0, cy - rim, 0, cy + rim);
    bg.addColorStop(0, 'rgba(6,12,21,.98)'); bg.addColorStop(1, 'rgba(9,16,26,.94)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    // ---- World layers: one transform, world-unit coordinates ---------------
    ctx.save();
    ctx.translate(px, py); ctx.rotate(-t); ctx.scale(s, s); ctx.translate(-ppos.x, -ppos.z);

    // District footprints first, so roads read as pale ribbons over dark blocks.
    const cells = graph.districts || [];
    cells.forEach((cell, i) => {
      const b = cell.bounds || cell;
      ctx.fillStyle = cell.color || (i % 2 ? 'rgba(32,50,66,.85)' : 'rgba(26,40,55,.9)');
      ctx.fillRect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z);
    });

    const roadW = graph.roadWidth * 0.8;
    // Connectors jog between street mouths a few metres apart; as drawn they
    // are short diagonals. Render the right-angle corner they physically are.
    const squared = (points) => {
      const a = points[0];
      const b = points[points.length - 1];
      if (Math.abs(b.x - a.x) < 0.5 || Math.abs(b.z - a.z) < 0.5) return points;
      return Math.abs(b.x - a.x) >= Math.abs(b.z - a.z)
        ? [a, { x: b.x, z: a.z }, b]
        : [a, { x: a.x, z: b.z }, b];
    };
    const lines = graph.edges.map((edge) => (edge.kind === 'connector' ? squared(edge.points) : edge.points));
    const strokePolyline = (points, color, width, glow = 0) => {
      if (!points?.length) return;
      ctx.beginPath();
      points.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.z); else ctx.moveTo(p.x, p.z); });
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = color; ctx.shadowBlur = glow; ctx.stroke(); ctx.shadowBlur = 0;
    };
    // Casing then carriageway. Widths are world metres, so they stay true at
    // any zoom — no pixel floors, which were what made the old map a mess.
    for (const points of lines) strokePolyline(points, 'rgba(2,6,12,.95)', roadW + 2.4 / s);
    for (const points of lines) strokePolyline(points, 'rgba(168,190,205,.92)', roadW);

    if (route) {
      strokePolyline(route.polyline, 'rgba(1,8,14,.9)', roadW * 0.72);
      strokePolyline(route.polyline, '#35d6ff', roadW * 0.5, 12);
    }

    if (destination) {
      // Pulsing pin; the pulse runs in canvas px so it survives the transform.
      const pulse = 1 + 0.18 * Math.sin(performance.now() / 240);
      ctx.beginPath(); ctx.arc(destination.x, destination.z, (10 * pulse) / s, 0, Math.PI * 2);
      ctx.fillStyle = '#ff2d78'; ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
      ctx.lineWidth = 3 / s; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.beginPath(); ctx.arc(destination.x, destination.z, 3 / s, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    ctx.restore();

    // Rim vignette: roads fade out at the edge instead of hard-clipping.
    const vig = ctx.createRadialGradient(cx, cy, rim * 0.55, cx, cy, rim);
    vig.addColorStop(0, 'rgba(3,7,13,0)'); vig.addColorStop(1, 'rgba(3,7,13,.88)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Off-screen destination: clamp an arrow to the rim pointing the way.
    if (destination) {
      const dx = (destination.x - ppos.x) * s, dz = (destination.z - ppos.z) * s;
      const cosA = Math.cos(-t), sinA = Math.sin(-t);
      const sx = dx * cosA - dz * sinA, sy = dx * sinA + dz * cosA;
      const d = Math.hypot(px + sx - cx, py + sy - cy);
      if (d > rim - 16 && d > 0) {
        const ux = (px + sx - cx) / d, uy = (py + sy - cy) / d;
        const ex = cx + ux * (rim - 14), ey = cy + uy * (rim - 14);
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.atan2(uy, ux) + Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.closePath();
        ctx.fillStyle = '#ff2d78'; ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 10; ctx.fill(); ctx.restore();
      }
    }

    // Compass tick: world north on screen is the north-up "up" spun by -t.
    const nx = -Math.sin(t), ny = -Math.cos(t);
    ctx.save();
    ctx.translate(cx + nx * (rim - 12), cy + ny * (rim - 12));
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(7,14,24,.85)'; ctx.fill();
    ctx.strokeStyle = 'rgba(77,200,255,.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = '800 12px sans-serif'; ctx.fillStyle = '#4dc8ff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, 1);
    ctx.restore();

    // Fixed zoom, so the scale bar is a constant: half the rim is 55 m.
    ctx.strokeStyle = 'rgba(238,244,255,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - rim + 16, cy + rim - 12); ctx.lineTo(cx - rim + 16 + rim / 2, cy + rim - 12); ctx.stroke();
    ctx.font = '600 12px sans-serif'; ctx.fillStyle = 'rgba(238,244,255,.6)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(VIEW_M / 2)} m`, cx - rim + 16, cy + rim - 16);

    // Player arrow: fixed at its anchor, always pointing up.
    ctx.save(); ctx.translate(px, py);
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 10); ctx.lineTo(0, 6); ctx.lineTo(-9, 10); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#4dc8ff'; ctx.shadowBlur = 15; ctx.fill();
    ctx.strokeStyle = '#087da5'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();

    this._setLocalized(this.$.mapNorth, '주변 · GPS', 'GPS');
    const turnLabels = this.englishMode
      ? { left: 'LEFT', right: 'RIGHT', straight: 'STRAIGHT' }
      : { left: '좌회전 · LEFT', right: '우회전 · RIGHT', straight: '직진 · STRAIGHT' };
    const turnIcons = { left: '↰', right: '↱', straight: '↑' };
    this.$.turn.textContent = maneuver
      ? `${turnIcons[maneuver.type]} ${turnLabels[maneuver.type]}`
      : (this.englishMode ? 'GPS' : '주변 · GPS');
    this._setStreet(street);
  }

  /**
   * Street blade under the disc. `street` is null for worlds with no name table
   * (the legacy procedural city), which hides the plate rather than printing a
   * routing id like 'ring_north_w' at the player.
   */
  _setStreet(street) {
    const blade = this.$.blade;
    if (!blade) return;
    if (!street) { blade.classList.remove('show'); return; }
    blade.classList.add('show');
    blade.classList.toggle('off', street.onStreet === false);
    // English mode promotes the roman name into the large tier; the CSS hides
    // the small one, so both nodes are always written and never fight.
    this.$.streetKo.textContent = this.englishMode ? street.en : street.ko;
    this.$.streetEn.textContent = street.en;
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

  dispose() {
    clearInterval(this._clockTimer);
    this.deck?.dispose();
    this.el.remove();
  }
}
