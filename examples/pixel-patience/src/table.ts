/**
 * Everything on the table that is not a playing card.
 *
 * The cards come from the uploaded 8-bit sheet; the felt, the empty-pile
 * outlines and the cursor are generated here so the game needs exactly one
 * image file and nothing else.
 */

export const CARD_W = 58;
export const CARD_H = 80;

/** The sheet is a 15 x 4 grid: backs, A-K, joker; spades, diamonds, clubs, hearts. */
export const SHEET_COLS = 15;
export const BACK_COL = 0;
export const RANK_COL = 1;   // rank r (0 = Ace) lives at column RANK_COL + r

/** Which sheet row each suit sits on, in the rule module's suit order. */
export const SUIT_ROW = [0, 1, 2, 3];

/** Sheet frame for a face-up card. */
export const cardFrame = (suit: number, rank: number): number =>
  SUIT_ROW[suit] * SHEET_COLS + RANK_COL + rank;

/**
 * Sheet frame for a face-down card. Row 1 is the red back, which reads as a
 * deck against green felt where the grey back nearly disappears.
 */
export const BACK_FRAME = 1 * SHEET_COLS + BACK_COL;

// --- Generated table art ---------------------------------------------------

export const TILE = 8;
export const T_FELT = 1;
export const T_FELT_DARK = 2;
const FELT_TILES = 2;

const FELT = [26, 92, 56];
const FELT_SHADE = [22, 80, 48];

/** Two 8x8 felt tiles, checkered so the table is not one flat rectangle. */
export function feltSheet(): { pixels: Uint8Array; w: number; h: number } {
  const w = TILE * FELT_TILES;
  const px = new Uint8Array(w * TILE * 4);

  const put = (tile: number, x: number, y: number, c: number[]) => {
    const i = ((y * w) + tile * TILE + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  };

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // A woven speckle, so the felt has a texture at pixel scale rather than
      // being a solid fill that reads as empty space.
      const weave = (x + y) % 4 === 0;
      put(T_FELT - 1, x, y, weave ? FELT_SHADE : FELT);
      put(T_FELT_DARK - 1, x, y, weave ? FELT : FELT_SHADE);
    }
  }

  return { pixels: px, w, h: TILE };
}

// --- Overlays --------------------------------------------------------------
// Card-sized frames drawn behind or over the cards: an empty pile's outline,
// the cursor, and the highlight for cards you are carrying.

export const O_EMPTY = 0;
export const O_CURSOR = 1;
export const O_HELD = 2;
export const O_TARGET = 3;
const OVERLAY_TILES = 4;

/**
 * Four card-sized overlay frames. Each is a hollow rectangle, so what shows
 * through is the felt or the card underneath rather than a solid block.
 */
export function overlaySheet(): { pixels: Uint8Array; w: number; h: number } {
  const w = CARD_W * OVERLAY_TILES;
  const px = new Uint8Array(w * CARD_H * 4);

  const put = (tile: number, x: number, y: number, c: number[] | null) => {
    const i = ((y * w) + tile * CARD_W + x) * 4;
    if (!c) { px[i + 3] = 0; return; }
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3] ?? 255;
  };

  const rounded = (x: number, y: number) =>
    // Matches the corner radius of the card art, so an outline sits on the
    // card's edge instead of poking out past it.
    (x < 2 && y < 2) || (x > CARD_W - 3 && y < 2)
    || (x < 2 && y > CARD_H - 3) || (x > CARD_W - 3 && y > CARD_H - 3);

  for (let y = 0; y < CARD_H; y++) {
    for (let x = 0; x < CARD_W; x++) {
      const edge = x === 0 || y === 0 || x === CARD_W - 1 || y === CARD_H - 1;
      const inner = x === 1 || y === 1 || x === CARD_W - 2 || y === CARD_H - 2;
      const corner = rounded(x, y);

      // Empty pile: a dim dashed outline that says "something goes here".
      const dash = ((x + y) >> 1) % 3 !== 0;
      put(O_EMPTY, x, y, edge && !corner && dash ? [16, 62, 38] : null);

      // Cursor: a solid two-pixel gold frame, the brightest thing on the table.
      put(O_CURSOR, x, y, (edge || inner) && !corner ? [247, 190, 57] : null);

      // Held: white, so a carried card is unmistakable against the gold cursor.
      put(O_HELD, x, y, (edge || inner) && !corner ? [255, 255, 255] : null);

      // Target: where the held cards would land, in the same green as the felt
      // weave so it reads as a hint rather than as another selection.
      put(O_TARGET, x, y, edge && !corner ? [120, 232, 150] : null);
    }
  }

  return { pixels: px, w, h: CARD_H };
}
