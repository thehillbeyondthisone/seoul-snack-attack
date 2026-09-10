// Seoul Snack Attack — cassette deck overlay (카세트 데크).
//
// The music player as an object: clicking the HUD's audio chip ejects a
// late-night pocha boombox tape deck. Every soundtrack track IS a cassette —
// the rack shows each tape with its own J-card colourway from the neon kit,
// picking one slides it into the slot (ghost tape + 3D drop-in), and the deck
// window shows the seated tape through dark glass while two hub overlays spin
// only while the music plays.
//
// Asset note: the source GLB (see ATTRIBUTION.md) bakes the reels into the
// shell texture, so spool motion is faked with DOM hub overlays positioned by
// projecting the cassette's real hub coordinates through the deck camera each
// frame — they stay glued to the tape while it sways.
//
// Renderer discipline follows food-preview.js: the three.js view is created
// lazily on first open, the rAF loop runs ONLY while the deck is open (zero
// cost when closed), pixel ratio is capped, and dispose() tears everything down.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Bible hexes (src/world/data/color-bible.js HUD block). The deck redefines
// them locally instead of leaning on #hud3's older values so this panel is
// judged against the frozen palette directly.
const BIBLE = {
  ink: '#fff2e0',
  money: '#ffd873',
  nav: '#3fd2e6',
  alarm: '#ff4d26',
  panel: '#120b08',
};

// J-card colourway per tape, drawn from the bible's NEON kit (local neon is
// allowed on objects; these are labels, not system accents).
const SKINS = ['#3fd2e6', '#ffd873', '#ff85b5', '#5fd068', '#ff9a3d', '#b46cff', '#ffedd0', '#ff4d26', '#e9dcab'];

// Hangul mixtape labels, one per track — the J-card scribble next to the
// English title. Deck-local flavour; the data file stays pure.
const FLAVOUR_KO = ['부대찌개 비트', '드랍 잇 레드', '레드 리믹스', '칼로리 폭탄', '크라운 스텝', '지글', '초음속 불꽃', '래피드 파이어', '카운트다운'];

// Fixed view size. The renderer is fixed-size (food-preview rule): a CSS box
// of a different size letterboxes the canvas, so the window is built around it.
const VIEW_W = 300;
const VIEW_H = 158;

// Cassette geometry, in model metres (shell is 101.7 × 65.9 mm). Hub centres
// sit ±21 mm from the middle — the compact-cassette standard — just proud of
// the front face. The DOM spools are projected through these.
const HUB_X = 0.021;
const HUB_Y = 0.002;
const HUB_Z = 0.0058;
const HUB_R = 0.0102; // visual disc radius, matched to the printed reels

const SPOOL_SVG = `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="47" fill="rgba(10,6,3,.30)"/>
  <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,205,140,.60)" stroke-width="7" stroke-dasharray="14 25.79"/>
  <circle cx="50" cy="50" r="21" fill="none" stroke="rgba(255,205,140,.30)" stroke-width="3"/>
  <circle cx="50" cy="50" r="7" fill="rgba(255,220,170,.55)"/>
</svg>`;

const CSS = `
.cassette-deck {
  --ink: ${BIBLE.ink};
  --muted: rgba(255,242,224,0.55);
  --faint: rgba(255,242,224,0.30);
  --nav: ${BIBLE.nav};
  --money: ${BIBLE.money};
  --alarm: ${BIBLE.alarm};
  position: absolute; inset: 0; z-index: 30;
  pointer-events: none;
  color: var(--ink);
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}
.cassette-deck * { box-sizing: border-box; }

/* ---- scrim + stage ------------------------------------------------------ */
.cassette-deck .deck-scrim {
  position: absolute; inset: 0; background: rgba(6,3,1,0.55);
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
  opacity: 0; transition: opacity 0.34s ease;
}
.cassette-deck.show .deck-scrim { opacity: 1; pointer-events: auto; }
.cassette-deck .deck-stage {
  position: absolute; inset: 0; display: grid; place-items: center;
  perspective: 1100px; pointer-events: none; padding: 16px;
}

/* The deck door. Closed = hinged down and away; open swings it up flat. */
.cassette-deck .deck-unit {
  position: relative;
  width: min(600px, 100%);
  border-radius: 12px;
  padding: 0 0 4px;
  transform: rotateX(-74deg) translateY(24%);
  transform-origin: 50% 100%;
  opacity: 0;
  transition: transform 0.44s cubic-bezier(0.2, 0.85, 0.25, 1.03), opacity 0.28s ease;
}
.cassette-deck.show .deck-unit {
  transform: rotateX(0deg) translateY(0);
  opacity: 1; pointer-events: auto;
}
@media (prefers-reduced-motion: reduce) {
  .cassette-deck .deck-unit { transition-duration: 0.01s; }
}

/* ---- faceplate: brushed metal, not a gradient poster -------------------- */
.cassette-deck .deck-unit {
  background:
    repeating-linear-gradient(90deg, rgba(255,240,220,0.028) 0 1px, rgba(0,0,0,0) 1px 3px),
    linear-gradient(180deg, #372d25 0%, #251c16 55%, #191310 100%);
  border: 1px solid rgba(255,242,224,0.17);
  box-shadow:
    0 34px 90px rgba(0,0,0,0.78), 0 6px 22px rgba(0,0,0,0.6),
    inset 0 1px 0 rgba(255,236,200,0.10), inset 0 -16px 34px rgba(0,0,0,0.42);
}
/* Corner screws — four phillips heads holding the faceplate on. */
.cassette-deck .screw {
  position: absolute; width: 9px; height: 9px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #4a4038, #241d17 70%);
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,236,200,0.08);
}
.cassette-deck .screw::after {
  content: ''; position: absolute; left: 1.5px; right: 1.5px; top: 3.5px; height: 1.5px;
  background: rgba(0,0,0,0.75); transform: rotate(38deg);
}
.cassette-deck .screw.tl { top: 7px; left: 7px; }
.cassette-deck .screw.tr { top: 7px; right: 7px; transform: rotate(64deg); }
.cassette-deck .screw.bl { bottom: 7px; left: 7px; transform: rotate(-52deg); }
.cassette-deck .screw.br { bottom: 7px; right: 7px; transform: rotate(11deg); }

/* ---- head row: brand, VU, status LED, eject ----------------------------- */
.cassette-deck .deck-head {
  display: flex; align-items: center; gap: 14px;
  padding: 11px 20px 9px;
}
.cassette-deck .deck-brand { line-height: 1.15; }
.cassette-deck .deck-brand b { display: block; font-size: 13px; font-weight: 800; letter-spacing: 0.22em; }
.cassette-deck .deck-brand .en {
  display: block; margin-top: 2px;
  font-size: 8px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--faint);
}
.cassette-deck .np-vu { display: flex; align-items: flex-end; gap: 2px; height: 14px; margin-left: auto; }
.cassette-deck .np-vu i {
  width: 3px; height: 3px; background: rgba(63,210,230,0.16);
  transition: height 0.2s ease;
}
.cassette-deck.playing .np-vu i { animation: deckvu 0.92s ease-in-out infinite; }
.cassette-deck.playing .np-vu i:nth-child(odd) { animation-duration: 0.68s; }
.cassette-deck.playing .np-vu i:nth-child(3n) { animation-duration: 1.13s; }
@keyframes deckvu {
  0%, 100% { height: 3px; background: rgba(63,210,230,0.30); }
  40% { height: 13px; background: var(--nav); box-shadow: 0 0 6px rgba(63,210,230,0.6); }
  70% { height: 6px; }
}
.cassette-deck .deck-led {
  width: 8px; height: 8px; border-radius: 50%; flex: none;
  background: #6b5636; box-shadow: inset 0 0 3px rgba(0,0,0,0.7);
  transition: background 0.2s ease, box-shadow 0.2s ease;
}
.cassette-deck.playing .deck-led { background: var(--nav); box-shadow: 0 0 9px var(--nav); animation: deckled 1.6s ease-in-out infinite; }
.cassette-deck.paused .deck-led { background: var(--money); box-shadow: 0 0 7px rgba(255,216,115,0.7); }
.cassette-deck.muted .deck-led { background: var(--alarm); box-shadow: 0 0 9px var(--alarm); animation: none; }
@keyframes deckled { 50% { opacity: 0.55; } }
.cassette-deck .deck-eject {
  flex: none; padding: 6px 11px; cursor: pointer; font: inherit;
  font-size: 9px; font-weight: 700; letter-spacing: 0.14em;
  color: var(--muted); background: rgba(255,242,224,0.05);
  border: 1px solid rgba(255,242,224,0.20); border-radius: 3px;
  transition: color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.cassette-deck .deck-eject:hover { color: var(--ink); border-color: rgba(255,242,224,0.45); box-shadow: 0 0 10px rgba(255,242,224,0.12); }

/* ---- the window: dark glass over warm backlight ------------------------- */
.cassette-deck .deck-window {
  position: relative; width: ${VIEW_W + 2}px; height: ${VIEW_H + 2}px;
  margin: 2px auto 0; border-radius: 7px; overflow: hidden;
  background: radial-gradient(130% 140% at 50% 18%, #221409 0%, #0e0704 62%, #070302 100%);
  border: 1px solid rgba(255,220,170,0.16);
  box-shadow:
    inset 0 0 36px rgba(0,0,0,0.85), inset 0 0 14px rgba(255,170,80,0.10),
    0 1px 0 rgba(255,236,200,0.06);
}
/* Fluorescent flicker-on for the backlight the first time the door opens. */
.cassette-deck .deck-window::before {
  content: ''; position: absolute; inset: 0; z-index: 0;
  background: radial-gradient(60% 55% at 50% 42%, rgba(255,176,88,0.20), rgba(255,150,60,0.05) 60%, transparent 78%);
  opacity: 0;
}
.cassette-deck.show .deck-window::before { animation: deckglow 0.62s ease-out forwards; }
@keyframes deckglow {
  0% { opacity: 0; } 38% { opacity: 0.9; } 54% { opacity: 0.3; } 72% { opacity: 0.85; } 100% { opacity: 1; }
}
.cassette-deck .deck-view, .cassette-deck .deck-view canvas {
  position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 1;
}
/* Glass glare sits over everything in the window, pointers included. */
.cassette-deck .deck-glare {
  position: absolute; inset: 0; z-index: 4; pointer-events: none;
  background: linear-gradient(115deg, rgba(255,246,230,0.075) 0%, rgba(255,246,230,0.02) 26%, transparent 42%);
}
/* Spool hubs, projected onto the tape's real hub coordinates each frame. */
.cassette-deck .deck-spools i { position: absolute; left: 0; top: 0; z-index: 3; pointer-events: none; will-change: transform; }
.cassette-deck .deck-spools svg { width: 100%; height: 100%; display: block; animation: deckspin 1.7s linear infinite; animation-play-state: paused; }
.cassette-deck .deck-spools i.sr svg { animation-duration: 1.18s; }
.cassette-deck.playing .deck-spools svg { animation-play-state: running; }
@keyframes deckspin { to { transform: rotate(360deg); } }

/* Ghost tape: the DOM cassette that slides into the slot during a swap. */
.cassette-deck .deck-ghost {
  position: absolute; left: 50%; top: 14px; z-index: 2;
  width: 150px; height: 92px; margin-left: -75px;
  border-radius: 6px; opacity: 0; pointer-events: none;
  background: linear-gradient(180deg, #241a12, #120b07);
  border: 1px solid rgba(255,242,224,0.24);
  box-shadow: 0 8px 22px rgba(0,0,0,0.6);
}
.cassette-deck .deck-ghost .g-label {
  position: absolute; inset: 9px 12px 30px; border-radius: 3px;
  background: var(--skin, var(--nav)); opacity: 0.88;
}
.cassette-deck .deck-ghost .g-label::after {
  content: ''; position: absolute; left: 8px; right: 8px; top: 55%; height: 1px;
  background: rgba(10,6,3,0.5);
}
.cassette-deck .deck-ghost .g-hub {
  position: absolute; top: 52px; width: 11px; height: 11px; border-radius: 50%;
  background: #0b0603; box-shadow: inset 0 0 0 2px rgba(255,242,224,0.28);
}
.cassette-deck .deck-ghost .g-hub.l { left: 42px; }
.cassette-deck .deck-ghost .g-hub.r { right: 42px; }
.cassette-deck.inserting .deck-ghost { animation: tapein 0.36s cubic-bezier(0.2, 0.85, 0.3, 1) forwards; }
.cassette-deck.inserting .deck-ghost.from-left { animation-name: tapein-left; }
.cassette-deck.inserting .deck-ghost.from-right { animation-name: tapein-right; }
@keyframes tapein {
  0% { opacity: 0; transform: translateY(-72px) rotate(-7deg) scale(0.94); }
  45% { opacity: 1; }
  78% { opacity: 1; transform: translateY(8px) rotate(0deg) scale(1); }
  100% { opacity: 0; transform: translateY(14px) scale(0.99); }
}
@keyframes tapein-left {
  0% { opacity: 0; transform: translate(-64px, -46px) rotate(-10deg) scale(0.94); }
  45% { opacity: 1; }
  78% { opacity: 1; transform: translate(0, 8px) rotate(0deg) scale(1); }
  100% { opacity: 0; transform: translateY(14px); }
}
@keyframes tapein-right {
  0% { opacity: 0; transform: translate(64px, -46px) rotate(10deg) scale(0.94); }
  45% { opacity: 1; }
  78% { opacity: 1; transform: translate(0, 8px) rotate(0deg) scale(1); }
  100% { opacity: 0; transform: translateY(14px); }
}

/* The slot itself, under the window. Glows amber while a tape goes in. */
.cassette-deck .deck-slot {
  width: 200px; height: 7px; margin: 9px auto 0; border-radius: 3px;
  background: #050201;
  box-shadow: inset 0 2px 5px #000, 0 1px 0 rgba(255,236,200,0.07);
  transition: box-shadow 0.25s ease;
}
.cassette-deck.inserting .deck-slot { box-shadow: inset 0 2px 5px #000, 0 0 14px rgba(255,170,80,0.45); }

/* ---- now playing --------------------------------------------------------- */
.cassette-deck .deck-np {
  display: flex; align-items: baseline; gap: 12px;
  padding: 10px 22px 0;
}
.cassette-deck .np-meta { min-width: 0; }
.cassette-deck .np-label { font-size: 8.5px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--faint); }
.cassette-deck .np-title { margin-top: 3px; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cassette-deck .np-title b { font-size: 15px; font-weight: 800; letter-spacing: 0.02em; }
.cassette-deck .np-title span { margin-left: 8px; font-size: 10px; letter-spacing: 0.08em; color: var(--muted); }
.cassette-deck .np-counter {
  margin-left: auto; flex: none;
  font-size: 11px; font-weight: 700; letter-spacing: 0.14em; color: var(--money);
  padding: 3px 8px; border: 1px solid rgba(255,216,115,0.28); border-radius: 3px;
  background: rgba(255,216,115,0.06);
}

/* ---- tape rack ----------------------------------------------------------- */
.cassette-deck .deck-rack {
  display: flex; gap: 8px; margin: 11px 18px 0; padding: 2px 2px 5px;
  overflow-x: auto; scrollbar-width: thin; scrollbar-color: rgba(255,242,224,0.2) transparent;
}
.cassette-deck .tape-card {
  flex: 0 0 auto; width: 88px; padding: 6px 7px 6px; cursor: pointer;
  color: inherit; font: inherit; text-align: left;
  background: rgba(255,242,224,0.045);
  border: 1px solid rgba(255,242,224,0.14); border-radius: 4px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.cassette-deck .tape-card:hover { background: rgba(255,242,224,0.08); border-color: rgba(255,242,224,0.32); }
.cassette-deck .tape-card .tc-body {
  display: block; position: relative; height: 36px; border-radius: 3px;
  background: linear-gradient(180deg, rgba(255,242,224,0.10), rgba(0,0,0,0.30));
  border: 1px solid rgba(0,0,0,0.45);
}
.cassette-deck .tape-card .tc-label {
  position: absolute; inset: 5px 6px 13px; border-radius: 2px;
  background: var(--skin); opacity: 0.82;
}
.cassette-deck .tape-card .tc-label::after {
  content: ''; position: absolute; left: 4px; right: 4px; top: 58%; height: 1px;
  background: rgba(10,6,3,0.5);
}
.cassette-deck .tape-card .tc-hub {
  position: absolute; top: 15px; width: 8px; height: 8px; border-radius: 50%;
  background: #0d0705; box-shadow: inset 0 0 0 2px rgba(255,242,224,0.26);
}
.cassette-deck .tape-card .tc-hub.l { left: 24px; }
.cassette-deck .tape-card .tc-hub.r { right: 24px; }
.cassette-deck .tape-card .tc-title {
  display: block; margin-top: 5px;
  font-size: 8.5px; font-weight: 600; letter-spacing: 0.03em; color: var(--muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cassette-deck .tape-card.current {
  border-color: var(--skin);
  box-shadow: 0 0 13px color-mix(in srgb, var(--skin) 30%, transparent), inset 0 0 10px color-mix(in srgb, var(--skin) 10%, transparent);
}
.cassette-deck .tape-card.current .tc-title { color: var(--ink); }
.cassette-deck .tape-card.locked { opacity: 0.42; cursor: default; filter: grayscale(0.6); }

/* ---- transport ----------------------------------------------------------- */
.cassette-deck .deck-transport {
  display: grid; grid-template-columns: 1fr 1.35fr 1fr; gap: 8px;
  margin: 11px 18px 0;
}
.cassette-deck .deck-transport button {
  padding: 9px 6px; cursor: pointer; font: inherit;
  font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
  color: var(--ink); background: rgba(255,242,224,0.055);
  border: 1px solid rgba(255,242,224,0.20); border-radius: 4px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.cassette-deck .deck-transport button:hover { border-color: rgba(63,210,230,0.55); box-shadow: 0 0 12px rgba(63,210,230,0.18); background: rgba(63,210,230,0.07); }
.cassette-deck .deck-transport .t-play { color: var(--nav); border-color: rgba(63,210,230,0.42); background: rgba(63,210,230,0.08); }
.cassette-deck .deck-transport .t-play:hover { box-shadow: 0 0 14px rgba(63,210,230,0.30); }

/* ---- compact mix row ------------------------------------------------------ */
.cassette-deck .deck-mix {
  display: grid; grid-template-columns: repeat(4, 1fr) auto auto; gap: 10px; align-items: end;
  margin: 13px 18px 12px; padding-top: 11px;
  border-top: 1px solid rgba(255,242,224,0.10);
}
.cassette-deck .dm .k {
  display: flex; justify-content: space-between; margin-bottom: 4px;
  font-size: 8px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--faint);
}
.cassette-deck .dm output { color: var(--muted); letter-spacing: 0; }
.cassette-deck .dm input[type='range'] { width: 100%; height: 14px; accent-color: ${BIBLE.nav}; margin: 0; }
.cassette-deck .t-mute, .cassette-deck .t-reset {
  padding: 7px 10px; cursor: pointer; font: inherit;
  font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
  color: var(--muted); background: rgba(255,242,224,0.05);
  border: 1px solid rgba(255,242,224,0.20); border-radius: 3px;
  transition: color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.cassette-deck.muted .t-mute {
  color: var(--alarm); border-color: rgba(255,77,38,0.55);
  background: rgba(255,77,38,0.08); box-shadow: 0 0 10px rgba(255,77,38,0.25);
}

@media (max-width: 560px) {
  .cassette-deck .deck-mix { grid-template-columns: repeat(2, 1fr); }
  .cassette-deck .t-mute, .cassette-deck .t-reset { grid-column: span 1; }
  .cassette-deck .np-vu { display: none; }
}
`;

export class CassetteDeck {
  /**
   * @param {object}   options
   * @param {object}   options.soundtrack  shared Soundtrack instance (playback state lives there)
   * @param {object}   options.audio       shared AudioManager (mix levels + master mute)
   * @param {object}   options.hud         HUD3, for bilingual labels + toasts
   * @param {HTMLElement} options.container element the deck mounts into (the #hud3 root)
   */
  constructor({ soundtrack, audio, hud, container }) {
    this.soundtrack = soundtrack;
    this.audio = audio;
    this.hud = hud;
    this.available = true;

    if (!document.getElementById('cassette-deck-style')) {
      const style = document.createElement('style');
      style.id = 'cassette-deck-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const el = document.createElement('div');
    el.className = 'cassette-deck';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="deck-scrim"></div>
      <div class="deck-stage">
        <div class="deck-unit" role="dialog" aria-label="카세트 테이프 데크 · Tape deck">
          <span class="screw tl"></span><span class="screw tr"></span>
          <span class="screw bl"></span><span class="screw br"></span>
          <div class="deck-head">
            <div class="deck-brand"><b>서울 스낵 어택</b><span class="en">SNACK-DECK · STEREO CASSETTE</span></div>
            <div class="np-vu" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
            <div class="deck-led"></div>
            <button class="deck-eject" type="button">꺼내기 · EJECT</button>
          </div>
          <div class="deck-window">
            <div class="deck-view"></div>
            <div class="deck-spools"><i class="sl">${SPOOL_SVG}</i><i class="sr">${SPOOL_SVG}</i></div>
            <div class="deck-ghost"><span class="g-label"></span><span class="g-hub l"></span><span class="g-hub r"></span></div>
            <div class="deck-glare"></div>
          </div>
          <div class="deck-slot"></div>
          <div class="deck-np">
            <div class="np-meta">
              <div class="np-label">지금 재생중 · NOW PLAYING</div>
              <div class="np-title"><b class="ko">—</b><span class="en-t">—</span></div>
            </div>
            <div class="np-counter">-- / --</div>
          </div>
          <div class="deck-rack"></div>
          <div class="deck-transport">
            <button class="t-prev" type="button">◀◀ 이전</button>
            <button class="t-play" type="button">▶ 재생</button>
            <button class="t-next" type="button">다음 ▶▶</button>
          </div>
          <div class="deck-mix">
            <label class="dm"><span class="k"><span>마스터 · Master</span><output>-%</output></span><input data-mix="master" type="range" min="0" max="1" step="0.01"></label>
            <label class="dm"><span class="k"><span>음악 · Music</span><output>-%</output></span><input data-mix="music" type="range" min="0" max="1" step="0.01"></label>
            <label class="dm"><span class="k"><span>효과 · Effects</span><output>-%</output></span><input data-mix="sfx" type="range" min="0" max="1" step="0.01"></label>
            <label class="dm"><span class="k"><span>환경 · Ambience</span><output>-%</output></span><input data-mix="ambience" type="range" min="0" max="1" step="0.01"></label>
            <button class="t-mute" type="button">음소거 · MUTE</button>
            <button class="t-reset" type="button">리셋 · RESET</button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(el);
    this.el = el;
    // QA hook for headless probes: the live instance without a global.
    el.__deck = this;

    const q = (sel) => el.querySelector(sel);
    this.$ = {
      scrim: q('.deck-scrim'),
      eject: q('.deck-eject'),
      view: q('.deck-view'),
      spoolL: q('.deck-spools .sl'),
      spoolR: q('.deck-spools .sr'),
      ghost: q('.deck-ghost'),
      ghostLabel: q('.deck-ghost .g-label'),
      titleKo: q('.np-title .ko'),
      titleEn: q('.np-title .en-t'),
      counter: q('.np-counter'),
      rack: q('.deck-rack'),
      play: q('.t-play'),
      prev: q('.t-prev'),
      next: q('.t-next'),
      mute: q('.t-mute'),
      reset: q('.t-reset'),
      mixes: [...el.querySelectorAll('input[data-mix]')],
    };

    // Bilingual static labels ride the HUD's hold-for-English system.
    const L = (node, ko, en) => hud?._setLocalized?.(node, ko, en);
    L(q('.deck-brand b'), '서울 스낵 어택', 'SEOUL SNACK ATTACK');
    L(q('.deck-brand .en'), 'SNACK-DECK · STEREO CASSETTE', 'SNACK-DECK · STEREO CASSETTE');
    L(q('.np-label'), '지금 재생중 · NOW PLAYING', 'NOW PLAYING');
    L(this.$.eject, '꺼내기 · EJECT', 'EJECT');
    L(this.$.prev, '◀◀ 이전', '◀◀ PREV');
    L(this.$.play, '▶ 재생', '▶ PLAY');
    L(this.$.next, '다음 ▶▶', 'NEXT ▶▶');
    L(this.$.mute, '음소거 · MUTE', 'MUTE');

    // Playback state lives in Soundtrack; mirror it on play/pause so the deck
    // stays honest even when the M key or an order event changes it.
    this._onAudioPlay = () => this.refresh();
    this._onAudioPause = () => this.refresh();
    soundtrack.audio.addEventListener('play', this._onAudioPlay);
    soundtrack.audio.addEventListener('pause', this._onAudioPause);

    this._onKey = (event) => {
      if (event.key === 'Escape' && this.isOpen()) this.close();
    };
    document.addEventListener('keydown', this._onKey);

    this.$.scrim.addEventListener('click', () => this.close());
    this.$.eject.addEventListener('click', () => this.close());
    this.$.play.addEventListener('click', () => {
      this._wake();
      if (this.soundtrack.paused) this.soundtrack.resume(); else this.soundtrack.pause();
      this.refresh();
    });
    this.$.prev.addEventListener('click', () => this._swap(-1));
    this.$.next.addEventListener('click', () => this._swap(1));
    this.$.mute.addEventListener('click', () => {
      this._wake();
      // Master mute covers music too; keyboard M is reserved for the city map.
      const muted = this.audio.toggleMute();
      this.soundtrack.audio.muted = muted;
      this.hud?.setAudioStatus?.(muted ? 'muted' : 'on');
      this.refresh();
    });
    this.$.mixes.forEach((input) => {
      input.addEventListener('input', () => {
        this._wake();
        const value = Number(input.value);
        const out = input.parentElement.querySelector('output');
        out.textContent = `${Math.round(value * 100)}%`;
        switch (input.dataset.mix) {
          case 'master': this.audio.setMasterVolume(value); break;
          case 'music': this.soundtrack.setVolume(value); break;
          case 'sfx': this.audio.setSfxVolume(value); break;
          case 'ambience': this.audio.setAmbienceVolume(value); break;
        }
      });
    });
    this._setMixInputs();
    this.$.reset.addEventListener('click', async () => {
      this._wake();
      this.audio.reset();
      await this.soundtrack.reset();
      this.hud?.setAudioStatus?.('on');
      this._setMixInputs();
      this.refresh();
    });

    this._raf = 0;
    this._renderer = null;
    this._loadPromise = null;
    this._shownTape = null;
    this._tween = null;
    this._insertTimers = [];
    this._disposed = false;
    this.refresh();
  }

  // ---- open / close -------------------------------------------------------

  isOpen() { return this.el.classList.contains('show'); }

  open() {
    if (this.isOpen()) return;
    this.el.classList.add('show');
    this.el.setAttribute('aria-hidden', 'false');
    this.refresh();
    this._ensureView().then(() => {
      if (!this.isOpen()) return;
      this.showTape(this.soundtrack.index);
      this.refresh();
      this._startLoop();
    });
  }

  close() {
    if (!this.isOpen()) return;
    this.el.classList.remove('show');
    this.el.setAttribute('aria-hidden', 'true');
    // Let the door-shut transition play before stopping the loop.
    setTimeout(() => { if (!this.isOpen()) this._stopLoop(); }, 460);
  }

  toggle() { this.isOpen() ? this.close() : this.open(); }

  // ---- tape selection -----------------------------------------------------

  /** Bonus tracks may arrive with `locked: true` (data hook — no unlock logic yet). */
  _isLocked(i) { return !!this.soundtrack.tracks[i]?.locked; }

  _skin(i) { return SKINS[i % SKINS.length]; }

  _flavour(i) { return FLAVOUR_KO[i % FLAVOUR_KO.length] || ''; }

  _wake() {
    this.audio.wake?.();
    this.soundtrack.wake?.();
  }

  /** Select a tape from the rack. Same tape toggles play; a new one inserts. */
  _select(i) {
    if (this._isLocked(i)) {
      this.hud?.toast?.('아직 개봉하지 않은 테이프', 'Tape locked');
      return;
    }
    this._wake();
    if (i === this.soundtrack.index) {
      if (this.soundtrack.paused) this.soundtrack.resume(); else this.soundtrack.pause();
      this.refresh();
      return;
    }
    this._insert(i, 0);
  }

  /** PREV/NEXT swap tapes with a directional slide. */
  _swap(dir) {
    const tracks = this.soundtrack.tracks.length;
    const target = (this.soundtrack.index + dir + tracks) % tracks;
    if (this._isLocked(target)) {
      this.hud?.toast?.('아직 개봉하지 않은 테이프', 'Tape locked');
      return;
    }
    this._wake();
    this._insert(target, dir);
  }

  _insert(i, dir) {
    this._insertTimers.forEach(clearTimeout);
    const ghost = this.$.ghost;
    ghost.classList.remove('from-left', 'from-right');
    if (dir < 0) ghost.classList.add('from-left');
    if (dir > 0) ghost.classList.add('from-right');
    ghost.style.setProperty('--skin', this._skin(i));
    this.el.classList.remove('inserting');
    void this.el.offsetWidth; // restart the insert animation
    this.el.classList.add('inserting');
    // The 3D tape drops in as the ghost reaches the slot.
    this._insertTimers = [
      setTimeout(() => this.showTape(i, { insert: true }), 210),
      setTimeout(() => {
        this.el.classList.remove('inserting');
        this.refresh();
      }, 580),
    ];
    // setTrack keeps wasPlaying semantics: an inserted tape always plays,
    // like a car stereo swallowing a cassette.
    this.soundtrack.setTrack(i, { autoplay: true });
    this.refresh();
  }

  // ---- DOM state ----------------------------------------------------------

  /** Push the shared mix levels into the compact sliders. */
  _setMixInputs() {
    const levels = {
      master: this.audio.masterLevel,
      music: this.soundtrack.audio.volume,
      sfx: this.audio.sfxLevel,
      ambience: this.audio.ambienceLevel,
    };
    this.$.mixes.forEach((input) => {
      const value = levels[input.dataset.mix];
      input.value = value;
      input.parentElement.querySelector('output').textContent = `${Math.round(value * 100)}%`;
    });
  }

  refresh() {
    const st = this.soundtrack;
    const i = st.index;
    const track = st.tracks[i];
    if (track) {
      this.$.titleKo.textContent = this._flavour(i) || track.title;
      this.$.titleEn.textContent = this.hud?.englishMode ? '' : track.title;
      if (this.hud?.englishMode) this.$.titleKo.textContent = track.title;
    }
    const n = st.tracks.length;
    this.$.counter.textContent = `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    const playing = !st.paused;
    this.el.classList.toggle('playing', playing && !this.audio.muted);
    this.el.classList.toggle('paused', !playing && !this.audio.muted);
    this.el.classList.toggle('muted', this.audio.muted);
    this._setLocalizedPlay(playing);
    this._buildRack();
  }

  _setLocalizedPlay(playing) {
    const ko = playing ? '⏸ 일시정지' : '▶ 재생';
    const en = playing ? '⏸ PAUSE' : '▶ PLAY';
    const node = this.$.play;
    node.dataset.langKo = ko;
    node.dataset.langEn = en;
    node.textContent = this.hud?.englishMode ? en : ko;
    // Keep the HUD's localization registry in sync for hold-T re-renders.
    if (this.hud?._localized) this.hud._localized.add(node);
  }

  _buildRack() {
    const st = this.soundtrack;
    const rack = this.$.rack;
    rack.replaceChildren();
    st.tracks.forEach((track, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'tape-card';
      card.style.setProperty('--skin', this._skin(i));
      if (i === st.index) card.classList.add('current');
      if (this._isLocked(i)) card.classList.add('locked');
      card.innerHTML = `
        <span class="tc-body"><span class="tc-label"></span><span class="tc-hub l"></span><span class="tc-hub r"></span></span>
        <span class="tc-title"></span>`;
      card.querySelector('.tc-title').textContent = track.title;
      card.addEventListener('click', () => this._select(i));
      rack.appendChild(card);
    });
  }

  // ---- three.js view (lazy, open-only) ------------------------------------

  _ensureView() {
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = (async () => {
      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      } catch (error) {
        console.warn('cassette deck: WebGL unavailable, window shows the flat fallback:', error);
        this.available = false;
        this.el.classList.add('noview');
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(VIEW_W, VIEW_H);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.9;
      this._renderer = renderer;
      this.$.view.appendChild(renderer.domElement);

      this._scene = new THREE.Scene();
      // Neutral room env for the metallic shell reflections; kept dim so the
      // amber key light stays the story.
      const pmrem = new THREE.PMREMGenerator(renderer);
      this._scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this._scene.environmentIntensity = 0.3;
      pmrem.dispose();

      const key = new THREE.DirectionalLight(0xffd9a0, 1.9);
      key.position.set(0.4, 0.6, 0.9);
      this._scene.add(key);
      const rim = new THREE.DirectionalLight(BIBLE.nav, 1.5);
      rim.position.set(-0.7, 0.2, -0.6);
      this._scene.add(rim);
      const under = new THREE.PointLight(0xff9a3d, 0.7, 0.6);
      under.position.set(0, -0.09, 0.12);
      this._scene.add(under);
      this._scene.add(new THREE.AmbientLight(0x2c2115, 0.9));

      this._camera = new THREE.PerspectiveCamera(28, VIEW_W / VIEW_H, 0.01, 2);
      this._camera.position.set(0, 0.042, 0.215);
      this._camera.lookAt(0, 0, 0);

      this._tapeRoot = new THREE.Group();
      this._scene.add(this._tapeRoot);

      const url = `${import.meta.env.BASE_URL}assets/ui/cassette.glb`;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(url);
      if (this._disposed) return; // torn down while loading
      // The GLB holds two shell variants side by side; show one at a time and
      // alternate by track index so the tapes read apart. GLTFLoader makes the
      // wrapper nodes plain Object3D, so keep every named node, not just
      // meshes and Groups.
      const byName = new Map();
      gltf.scene.traverse((node) => byName.set(node.name, node));
      const makeTape = (sourceName) => {
        const group = new THREE.Group();
        const source = byName.get(sourceName);
        if (source) {
          source.position.set(0, 0, 0);
          group.add(source);
        }
        group.visible = false;
        this._tapeRoot.add(group);
        return group;
      };
      this.tapeA = makeTape('CassetteTape_Main_low_01_2'); // opaque shell
      this.tapeB = makeTape('CassetteTape_Main_low_02_2'); // clear shell
    })().catch((error) => {
      console.warn('cassette deck: model failed to load:', error);
      this.available = false;
      this.el.classList.add('noview');
    });
    return this._loadPromise;
  }

  /** Seat tape `i` in the window. `insert` plays the mechanical drop-in. */
  showTape(i, { insert = false } = {}) {
    if (!this.tapeA) return;
    const tape = i % 2 ? this.tapeB : this.tapeA;
    if (this._shownTape && this._shownTape !== tape) this._shownTape.visible = false;
    tape.visible = true;
    tape.position.set(0, 0, 0);
    tape.rotation.set(0, 0, 0);
    this._shownTape = tape;
    this._tween = insert ? { t0: performance.now(), dur: 380 } : null;
  }

  _startLoop() {
    if (this._raf || !this._renderer) return;
    this._last = performance.now();
    const tick = (now) => {
      if (!this.isOpen()) { this._raf = 0; return; }
      const dt = Math.min((now - this._last) / 1000, 0.1);
      this._last = now;
      this._tick(now, dt);
      this._renderer.render(this._scene, this._camera);
      this._placeSpools();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (!this._raf) return;
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _tick(now) {
    const root = this._tapeRoot;
    if (!root) return;
    const playing = !this.soundtrack.paused;
    if (this._tween) {
      const t = Math.min(1, (now - this._tween.t0) / this._tween.dur);
      // Mild ease-out-back: the deck clamps the tape with a small overshoot.
      const c1 = 1.3;
      const e = 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      root.position.y = (1 - e) * 0.085;
      root.rotation.x = -(1 - e) * 0.5;
      root.rotation.y = 0;
      if (t >= 1) this._tween = null;
    } else {
      root.position.y = playing ? Math.sin(now * 0.0013) * 0.0014 : 0;
      // Idle sway only while playing; settle gently when paused.
      const target = playing ? Math.sin(now * 0.0006) * 0.1 : 0;
      root.rotation.y += (target - root.rotation.y) * 0.08;
      root.rotation.x += (0 - root.rotation.x) * 0.1;
    }
  }

  /** Project the tape's hub coordinates to CSS px and park the DOM spools there. */
  _placeSpools() {
    const tape = this._shownTape;
    if (!tape || !this._camera) return;
    const v = new THREE.Vector3();
    const hub = new THREE.Vector3();
    const radius = new THREE.Vector3();
    tape.updateWorldMatrix(true, false);
    for (const [el, x] of [[this.$.spoolL, -HUB_X], [this.$.spoolR, HUB_X]]) {
      hub.set(x, HUB_Y, HUB_Z).applyMatrix4(tape.matrixWorld).project(this._camera);
      radius.set(x + HUB_R, HUB_Y, HUB_Z).applyMatrix4(tape.matrixWorld).project(this._camera);
      const px = (hub.x * 0.5 + 0.5) * VIEW_W;
      const py = (-hub.y * 0.5 + 0.5) * VIEW_H;
      const r = Math.hypot((radius.x - hub.x) * VIEW_W, (radius.y - hub.y) * VIEW_H);
      el.style.width = `${r * 2}px`;
      el.style.height = `${r * 2}px`;
      el.style.transform = `translate(${px - r}px, ${py - r}px)`;
    }
  }

  dispose() {
    this._disposed = true;
    this._insertTimers.forEach(clearTimeout);
    this.soundtrack.audio.removeEventListener('play', this._onAudioPlay);
    this.soundtrack.audio.removeEventListener('pause', this._onAudioPause);
    document.removeEventListener('keydown', this._onKey);
    this._stopLoop();
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer.forceContextLoss?.();
      this._renderer = null;
    }
    this.el.remove();
  }
}
