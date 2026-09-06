/**
 * A playing-card sheet, drawn in code.
 *
 * The game prefers `playing_cards.png` when it is there, but that art is
 * licensed for use rather than for redistribution, so the repository cannot
 * carry it. This module generates a sheet with the identical geometry —
 * 15 columns by 4 rows of 58x80 cells, backs in column 0, Ace through King
 * in columns 1..13 — which means `cardFrame()` and `BACK_FRAME` address it
 * without knowing which of the two is loaded.
 *
 * It is also the example's answer to "where do sprites come from if I have
 * no artist": every pip, glyph and border below is a few dozen bytes of
 * pixel arithmetic.
 */
import { CARD_H, CARD_W, SHEET_COLS } from './table';

const ROWS = 4;

const INK = [24, 24, 40];
const RED = [196, 40, 62];
const PAPER = [244, 240, 228];
const PAPER_SHADE = [214, 208, 192];
const BACK_INK = [168, 32, 48];
const BACK_DARK = [116, 20, 36];

/** Suit order matches the rule module: spades, diamonds, clubs, hearts. */
const SUIT_IS_RED = [false, true, false, true];

// --- Pixel art -------------------------------------------------------------
// Everything below is written as strings because a 7x7 pip is easier to read,
// and to correct, as seven lines of '#' than as a hex blob.

const PIPS: string[][] = [
  [ // spade
    '...#...',
    '..###..',
    '.#####.',
    '#######',
    '#######',
    '...#...',
    '..###..',
  ],
  [ // diamond
    '...#...',
    '..###..',
    '.#####.',
    '#######',
    '.#####.',
    '..###..',
    '...#...',
  ],
  [ // club
    // The gaps in rows 2 and 4 are what separate the three lobes; without
    // them the whole pip fills in and reads as a black rectangle.
    '..###..',
    '.#####.',
    '#.###.#',
    '#######',
    '#.###.#',
    '...#...',
    '..###..',
  ],
  [ // heart
    '.##.##.',
    '#######',
    '#######',
    '#######',
    '.#####.',
    '..###..',
    '...#...',
  ],
];

const GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['#...#', '#...#', '#...#', '#####', '....#', '....#', '....#'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['....#', '....#', '....#', '....#', '#...#', '#...#', '.###.'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
};

const LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * Where the centre pips go, as (column, vertical fraction) pairs. These are
 * the traditional layouts — a seven is a six with one pip pushed up between
 * the top pair, not seven pips in a line.
 */
const LAYOUTS: [number, number][][] = [
  [[1, 0.5]],                                                            // A
  [[1, 0], [1, 1]],                                                      // 2
  [[1, 0], [1, 0.5], [1, 1]],                                            // 3
  [[0, 0], [2, 0], [0, 1], [2, 1]],                                      // 4
  [[0, 0], [2, 0], [1, 0.5], [0, 1], [2, 1]],                            // 5
  [[0, 0], [2, 0], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],                  // 6
  [[0, 0], [2, 0], [0, 0.5], [2, 0.5], [0, 1], [2, 1], [1, 0.25]],       // 7
  [[0, 0], [2, 0], [0, 0.5], [2, 0.5], [0, 1], [2, 1],
    [1, 0.25], [1, 0.75]],                                               // 8
  [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3],
    [0, 1], [2, 1], [1, 0.5]],                                           // 9
  [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3],
    [0, 1], [2, 1], [1, 1 / 6], [1, 5 / 6]],                             // 10
];

// --- Sheet -----------------------------------------------------------------

/** A 15x4 grid of 58x80 cards, laid out exactly like the licensed sheet. */
export function generateDeckSheet(): { pixels: Uint8Array; w: number; h: number } {
  const w = CARD_W * SHEET_COLS;
  const h = CARD_H * ROWS;
  const px = new Uint8Array(w * h * 4);

  /** Plot into card cell (col,row); coordinates are card-local. */
  const plot = (col: number, row: number, x: number, y: number, c: number[]) => {
    if (x < 0 || y < 0 || x >= CARD_W || y >= CARD_H) return;
    const i = (((row * CARD_H + y) * w) + col * CARD_W + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  };

  /**
   * Stamp a string-art bitmap. `flip` turns it 180 degrees, which is how the
   * bottom-right index gets drawn without a second set of glyphs.
   */
  const stamp = (
    col: number, row: number, art: string[], ox: number, oy: number,
    c: number[], scale = 1, flip = false,
  ) => {
    const aw = art[0].length;
    const ah = art.length;
    for (let y = 0; y < ah; y++) {
      for (let x = 0; x < aw; x++) {
        if (art[flip ? ah - 1 - y : y][flip ? aw - 1 - x : x] !== '#') continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            plot(col, row, ox + x * scale + dx, oy + y * scale + dy, c);
          }
        }
      }
    }
  };

  /** Corners are clipped to a radius so cards read as cards, not as tiles. */
  const outside = (x: number, y: number) => {
    const r = 3;
    const cx = x < r ? r - x : x >= CARD_W - r ? x - (CARD_W - r - 1) : 0;
    const cy = y < r ? r - y : y >= CARD_H - r ? y - (CARD_H - r - 1) : 0;
    return cx * cy > 2;
  };

  /** The blank card: paper, a rounded outline, transparent past the corners. */
  const blank = (col: number, row: number, face: number[], edge: number[]) => {
    for (let y = 0; y < CARD_H; y++) {
      for (let x = 0; x < CARD_W; x++) {
        if (outside(x, y)) continue;
        // A pixel on the paper whose neighbour is off the card is the outline,
        // which is what gives the rounded corners their border for free.
        const rim = outside(x - 1, y) || outside(x + 1, y)
          || outside(x, y - 1) || outside(x, y + 1)
          || x === 0 || y === 0 || x === CARD_W - 1 || y === CARD_H - 1;
        plot(col, row, x, y, rim ? edge : face);
      }
    }
  };

  /** The rank index in a corner: glyph over pip, mirrored at the far corner. */
  const index = (col: number, row: number, rank: number, suit: number, c: number[]) => {
    const label = LABELS[rank];
    const glyphs = label.split('').map((ch) => GLYPHS[ch]);
    const width = glyphs.reduce((n, g) => n + g[0].length + 1, -1);

    let x = 4;
    for (const g of glyphs) {
      stamp(col, row, g, x, 5, c);
      x += g[0].length + 1;
    }
    stamp(col, row, PIPS[suit], 4 + ((width - 7) >> 1), 14, c);

    x = CARD_W - 4 - width;
    for (const g of glyphs) {
      stamp(col, row, g, x, CARD_H - 12, c, 1, true);
      x += g[0].length + 1;
    }
    stamp(col, row, PIPS[suit], CARD_W - 11 - ((width - 7) >> 1), CARD_H - 21, c, 1, true);
  };

  // --- Faces ---------------------------------------------------------------
  for (let suit = 0; suit < ROWS; suit++) {
    const ink = SUIT_IS_RED[suit] ? RED : INK;

    for (let rank = 0; rank < 13; rank++) {
      const col = 1 + rank;
      blank(col, suit, PAPER, INK);
      index(col, suit, rank, suit, ink);

      if (rank === 0) {
        // The ace gets one oversized pip, the way a real deck does.
        stamp(col, suit, PIPS[suit], (CARD_W - 21) >> 1, (CARD_H - 21) >> 1, ink, 3);
      } else if (rank < 10) {
        // Pips stay at 1:1. Doubling them would be chunkier, but three
        // 14-pixel columns do not fit across a 58-pixel card, and a ten needs
        // four rows down each side inside 80 pixels of height.
        const size = 7;
        const fieldX = [11, (CARD_W - size) >> 1, CARD_W - 11 - size];
        const fieldTop = 19;
        const fieldBottom = CARD_H - 19 - size;
        for (const [c, t] of LAYOUTS[rank]) {
          const y = Math.round(fieldTop + (fieldBottom - fieldTop) * t);
          // Pips below the middle are printed upside down on a real card.
          stamp(col, suit, PIPS[suit], fieldX[c], y, ink, 1, t > 0.5);
        }
      } else {
        // Court cards: a panel with the letter in it, rather than a portrait
        // that would be mud at 58x80.
        for (let y = 22; y < CARD_H - 22; y++) {
          for (let x = 14; x < CARD_W - 14; x++) {
            const edge = y === 22 || y === CARD_H - 23 || x === 14 || x === CARD_W - 15;
            plot(col, suit, x, y, edge ? ink : PAPER_SHADE);
          }
        }
        stamp(col, suit, GLYPHS[LABELS[rank]], (CARD_W - 15) >> 1, (CARD_H - 21) >> 1, ink, 3);
      }
    }

    // --- Backs -------------------------------------------------------------
    // Every row carries a back, so BACK_FRAME can point at any of them.
    blank(0, suit, BACK_INK, INK);
    for (let y = 4; y < CARD_H - 4; y++) {
      for (let x = 4; x < CARD_W - 4; x++) {
        const lattice = (x + y) % 6 < 2 || (x - y + CARD_H) % 6 < 2;
        const frame = x === 4 || y === 4 || x === CARD_W - 5 || y === CARD_H - 5;
        if (frame) plot(0, suit, x, y, PAPER);
        else if (lattice) plot(0, suit, x, y, BACK_DARK);
      }
    }

    // --- Joker ---------------------------------------------------------------
    // Column 14 is unused by Klondike but exists on the licensed sheet, and
    // leaving it blank would make the two sheets differently sized.
    blank(SHEET_COLS - 1, suit, PAPER, INK);
    stamp(SHEET_COLS - 1, suit, GLYPHS.J, (CARD_W - 15) >> 1, (CARD_H - 21) >> 1, RED, 3);
  }

  return { pixels: px, w, h };
}
