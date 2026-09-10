// Seoul Expanse — painting the signage atlas.
//
// The browser half of `data/expanse-signage.js`. That module owns the layout —
// which cell is where, what it says, which neon tube it burns — and this one
// owns the pixels. Splitting them is what lets the Node gate assert that every
// sign in the city references a real cell whose tube is on its district's own
// list, without Node ever needing a canvas.
//
// One 2048 x 1024 texture serves the whole city as both `map` and
// `emissiveMap`: the backing is painted near-black so it contributes nothing to
// the emissive pass, and only the tube and the lettering glow. That is why
// signs can be ordinary opaque boxes merged into one mesh per chunk rather than
// sorted transparencies.
//
// The lettering is real Hangul, set in whatever CJK face the device has. It is
// the same food the order system sells, so a player learning "the red sign is
// tteokbokki" is learning the menu.
import * as THREE from 'three';
import { SIGN_ATLAS_WIDTH, SIGN_ATLAS_HEIGHT, SIGN_CELLS } from './data/expanse-signage.js';
import { cssHex, mixHex, scaleHex } from './data/color-bible.js';

/** Sign backing. Dark enough that an unlit board reads as a board at noon. */
const BACKING = 0x0b0809;

/** Korean faces first, then anything with a CJK fallback. */
const HANGUL_STACK = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", '
  + '"Nanum Gothic", "Yu Gothic", sans-serif';

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * A neon stroke: a wide soft pass for the halo, then a tight hot pass for the
 * tube itself. Two passes is what stops a glowing line reading as a sticker.
 */
function neonStroke(ctx, colour, draw, { width = 6, glow = 26 } = {}) {
  ctx.save();
  ctx.strokeStyle = cssHex(mixHex(colour, 0xffffff, 0.15));
  ctx.shadowColor = cssHex(colour);
  ctx.shadowBlur = glow;
  ctx.lineWidth = width * 1.9;
  ctx.globalAlpha = 0.55;
  draw();
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = width;
  ctx.strokeStyle = cssHex(mixHex(colour, 0xffffff, 0.55));
  draw();
  ctx.stroke();
  ctx.restore();
}

function neonText(ctx, colour, text, x, y, { glow = 22 } = {}) {
  ctx.save();
  ctx.shadowColor = cssHex(colour);
  ctx.shadowBlur = glow;
  ctx.fillStyle = cssHex(mixHex(colour, 0xffffff, 0.3));
  ctx.fillText(text, x, y);
  // A second pass with a near-white core: a lit tube is white at its centre
  // and coloured at its edge, and the eye reads the difference as brightness.
  ctx.shadowBlur = glow * 0.4;
  ctx.fillStyle = cssHex(mixHex(colour, 0xffffff, 0.72));
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Wide cell: a fascia board. Horizontal Korean, roman kicker underneath. */
function paintWide(ctx, cell, s) {
  const w = cell.width * s;
  const h = cell.height * s;
  const pad = 7 * s;

  if (cell.style === 'boxed') {
    // Solid tube colour with the words punched out of it — the loudest board
    // on the street, and the one that survives being seen at 60 km/h.
    ctx.fillStyle = cssHex(scaleHex(cell.neon, 0.82));
    roundedRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 10 * s);
    ctx.fill();
    ctx.fillStyle = cssHex(BACKING);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(h * 0.5)}px ${HANGUL_STACK}`;
    ctx.fillText(cell.ko, w * 0.42, h * 0.5);
    ctx.font = `700 ${Math.round(h * 0.17)}px system-ui, sans-serif`;
    ctx.fillText(cell.en, w * 0.82, h * 0.54);
  } else if (cell.style === 'banner') {
    neonStroke(ctx, cell.neon, () => roundedRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 8 * s),
      { width: 4 * s, glow: 22 * s });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(h * 0.52)}px ${HANGUL_STACK}`;
    neonText(ctx, cell.neon, cell.ko, pad * 2.4, h * 0.5, { glow: 24 * s });
    ctx.textAlign = 'right';
    ctx.font = `600 ${Math.round(h * 0.18)}px system-ui, sans-serif`;
    neonText(ctx, mixHex(cell.neon, 0xffffff, 0.5), cell.en, w - pad * 2.4, h * 0.54,
      { glow: 10 * s });
  } else {
    // Outline: the board is dark, the letters are the only light on it.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(h * 0.58)}px ${HANGUL_STACK}`;
    neonText(ctx, cell.neon, cell.ko, w * 0.5, h * 0.42, { glow: 30 * s });
    ctx.font = `600 ${Math.round(h * 0.15)}px system-ui, sans-serif`;
    neonText(ctx, mixHex(cell.neon, 0xffffff, 0.55), cell.en, w * 0.5, h * 0.82, { glow: 12 * s });
  }
}

/** Tall cell: a blade sign. One syllable per line, stacked down the board. */
function paintTall(ctx, cell, s) {
  const w = cell.width * s;
  const h = cell.height * s;
  const pad = 8 * s;
  const glyphs = [...cell.ko];
  const step = (h - pad * 3.4) / Math.max(glyphs.length, 1);

  if (cell.style === 'boxed') {
    ctx.fillStyle = cssHex(scaleHex(cell.neon, 0.8));
    roundedRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 9 * s);
    ctx.fill();
    ctx.fillStyle = cssHex(BACKING);
  } else {
    neonStroke(ctx, cell.neon, () => roundedRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 9 * s),
      { width: 3.5 * s, glow: 20 * s });
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(Math.min(step * 0.86, w * 0.62))}px ${HANGUL_STACK}`;
  glyphs.forEach((glyph, index) => {
    const y = pad * 1.7 + step * (index + 0.5);
    if (cell.style === 'boxed') ctx.fillText(glyph, w * 0.5, y);
    else neonText(ctx, cell.neon, glyph, w * 0.5, y, { glow: 24 * s });
  });

  // A hanging bracket at the top: the sign is bolted to a wall, not floating.
  ctx.fillStyle = cssHex(0x2a2622);
  ctx.fillRect(w * 0.5 - 2 * s, 0, 4 * s, pad * 1.1);
}

/**
 * Paint the atlas. `scale` shrinks it for the mobile profile — the layout is
 * in atlas units, so every UV in the city keeps working at any scale.
 */
export function createExpanseSignAtlas({ scale = 1, anisotropy = 8 } = {}) {
  const width = Math.max(512, Math.round(SIGN_ATLAS_WIDTH * scale));
  const s = width / SIGN_ATLAS_WIDTH;
  const height = Math.round(SIGN_ATLAS_HEIGHT * s);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = cssHex(BACKING);
  ctx.fillRect(0, 0, width, height);

  for (const cell of SIGN_CELLS) {
    ctx.save();
    ctx.translate(cell.x * s, cell.y * s);
    // Every cell keeps its own dark backing, so a mip that blends two cells
    // together blends two dark edges rather than two hot ones.
    ctx.fillStyle = cssHex(BACKING);
    ctx.fillRect(0, 0, cell.width * s, cell.height * s);
    ctx.beginPath();
    ctx.rect(0, 0, cell.width * s, cell.height * s);
    ctx.clip();
    if (cell.shape === 'wide') paintWide(ctx, cell, s);
    else paintTall(ctx, cell, s);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'expanse_sign_atlas';
  texture.colorSpace = THREE.SRGBColorSpace;
  // An atlas must never wrap: a blade sign sampling one texel past its cell
  // would pick up the sign next to it.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}
