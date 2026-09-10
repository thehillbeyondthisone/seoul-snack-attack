// Seoul Expanse — the signage atlas, as data.
//
// M4 of the rebuild. Every lit sign in the city reads one cell of one
// 2048 x 1024 texture, so the whole of Seoul's shouting costs a single draw
// call per chunk and a single material. This module is the *layout* — cell
// rectangles, what each cell says and which neon tube it burns — and it is
// deliberately free of three.js and of canvas, because two very different
// consumers need it:
//
//   - `expanse-facades.js` picks cells for buildings, in Node, under the gate.
//   - `expanse-sign-art.js` paints the atlas, in the browser, at boot.
//
// A cell's `neon` is the contract between them. The colour bible gives each
// district a short neon list; the facade generator may only hand a building a
// cell whose tube is on that list, which is what keeps Bingsu Hanfront cyan and
// Pocha Alley red without either of them owning a texture.
//
// Two words per tube rather than one, because a district draws from three or
// four tubes and one word each put the same board on every shop in the street.
// Sixteen words is the point where a market row stops rhyming.
//
// The words are food. They are the same food the order system sells, so a
// player learning "that red sign means tteokbokki" is learning the menu.
import { NEON } from './color-bible.js';

/** Atlas size in pixels. Wide cells fill the top half, tall cells the bottom. */
export const SIGN_ATLAS_WIDTH = 2048;
export const SIGN_ATLAS_HEIGHT = 1024;

/**
 * Two cell shapes, because Seoul has two kinds of sign and they are not the
 * same object. A `wide` cell is the fascia board bolted over a shopfront; a
 * `tall` cell is the blade sign that projects out over the pavement, which is
 * the one you actually read from a car because it faces down the street rather
 * than across it. The pixel aspects match the metres the mesh builder gives
 * them — 4:1 and 1:4 — so no sign is ever stretched.
 */
export const SIGN_SHAPES = Object.freeze({
  wide: { width: 512, height: 128, cols: 4, rows: 4, originY: 0 },
  tall: { width: 128, height: 512, cols: 16, rows: 1, originY: 512 },
});

/**
 * Eight neon tubes — one per colour in the bible's kit — with two words each.
 * `style` picks the composition the painter uses; the three cycle so no tube
 * is only ever boxed or only ever outlined.
 */
const WORDS = [
  { neon: NEON.red, tube: 'red', ko: '떡볶이', en: 'TTEOKBOKKI' },
  { neon: NEON.gold, tube: 'gold', ko: '김밥', en: 'GIMBAP' },
  { neon: NEON.cyan, tube: 'cyan', ko: '빙수', en: 'BINGSU' },
  { neon: NEON.orange, tube: 'orange', ko: '호떡', en: 'HOTTEOK' },
  { neon: NEON.magenta, tube: 'magenta', ko: '노래방', en: 'NORAEBANG' },
  { neon: NEON.violet, tube: 'violet', ko: '치킨', en: 'CHIMAEK' },
  { neon: NEON.lime, tube: 'lime', ko: '분식', en: 'BUNSIK' },
  { neon: NEON.warmWhite, tube: 'warmWhite', ko: '포차', en: 'POCHA' },
  { neon: NEON.red, tube: 'red', ko: '순대', en: 'SUNDAE' },
  { neon: NEON.gold, tube: 'gold', ko: '만두', en: 'MANDU' },
  { neon: NEON.cyan, tube: 'cyan', ko: '어묵', en: 'EOMUK' },
  { neon: NEON.orange, tube: 'orange', ko: '튀김', en: 'TWIGIM' },
  { neon: NEON.magenta, tube: 'magenta', ko: '붕어빵', en: 'BUNGEOPPANG' },
  { neon: NEON.violet, tube: 'violet', ko: '맥주', en: 'MAEKJU' },
  { neon: NEON.lime, tube: 'lime', ko: '김치', en: 'KIMCHI' },
  { neon: NEON.warmWhite, tube: 'warmWhite', ko: '국밥', en: 'GUKBAP' },
];

const STYLES = ['boxed', 'banner', 'outline'];

function buildCells() {
  const cells = [];
  for (const shape of ['wide', 'tall']) {
    const spec = SIGN_SHAPES[shape];
    WORDS.forEach((word, index) => {
      const col = index % spec.cols;
      const row = Math.floor(index / spec.cols);
      const x = col * spec.width;
      const y = spec.originY + row * spec.height;
      cells.push({
        id: `${shape}_${word.tube}_${word.en.toLowerCase()}`,
        index: cells.length,
        shape,
        neon: word.neon,
        tube: word.tube,
        ko: word.ko,
        en: word.en,
        // Offset the style by shape so a shop's fascia and its blade sign are
        // rarely composed the same way.
        style: STYLES[(index + (shape === 'tall' ? 1 : 0)) % STYLES.length],
        // Pixel rectangle for the painter.
        x, y, width: spec.width, height: spec.height,
        // UV rectangle for the mesh builder. V is flipped because a canvas
        // paints downward and a texture samples upward.
        u0: x / SIGN_ATLAS_WIDTH,
        u1: (x + spec.width) / SIGN_ATLAS_WIDTH,
        v0: 1 - (y + spec.height) / SIGN_ATLAS_HEIGHT,
        v1: 1 - y / SIGN_ATLAS_HEIGHT,
        aspect: spec.width / spec.height,
      });
    });
  }
  return Object.freeze(cells.map(Object.freeze));
}

export const SIGN_CELLS = buildCells();

/** Cells of one shape whose tube is on `neons` — the district's own kit. */
export function signCellsFor(shape, neons) {
  const allowed = new Set(neons);
  return SIGN_CELLS.filter((cell) => cell.shape === shape && allowed.has(cell.neon));
}
