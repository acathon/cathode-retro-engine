/**
 * The arena, its wall textures, and the sprite art for everything that walks
 * or is dropped in it.
 *
 * Kept out of the game loop so `main.ts` reads as rules rather than pixels.
 */

/** Wall types are 1-based: the raycaster reads type N from texture N-1. */
export const W_CONCRETE = 1;
export const W_CRATE = 2;
export const W_SANDSTONE = 3;
export const W_DOOR = 4;

/** Billboard textures index the texture array directly. */
export const TEX_ENEMY = 4;
export const TEX_ALLY = 5;
export const TEX_BOMB = 6;
export const TEX_SPARK = 7;

export const TEX = 32;

/**
 * A bomb-defusal layout in miniature: two spawns at opposite corners, two
 * plantable sites, and three routes between them so neither team can hold
 * everything at once.
 *
 *   # concrete   = crate      s sandstone   + doorway
 *   T attacker spawn          C defender spawn
 *   A / B bomb sites          . floor
 */
export const MAP = [
  '############################',
  '#TTT#.........#............#',
  '#TTT+....==...+....AAA.....#',
  '#TTT#....==...#....AAA.....#',
  '#...#.........#....AAA.....#',
  '#...ssss+sssss#............#',
  '#.........................s#',
  '#.....==........====......s#',
  '#.....==........====......s#',
  '#.........................s#',
  '#sssssss+ssss#.............#',
  '#............#.............#',
  '#....BBB.....+......==.....#',
  '#....BBB.....#......==.....#',
  '#....BBB.....#.............#',
  '#............#.......ssss..#',
  '#....==......#.............#',
  '#....==......+........#CCC.#',
  '#............#........#CCC.#',
  '#..........sssssss....#CCC.#',
  '#.........................s#',
  '############################',
];

export const COLS = MAP[0].length;
export const ROWS = MAP.length;

export type Cell = { x: number; y: number };

export function charAt(col: number, row: number): string {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return '#';
  return MAP[row][col];
}

/** Wall type for the raycast map; 0 means you can walk through it. */
export function wallAt(col: number, row: number): number {
  switch (charAt(col, row)) {
    case '#': return W_CONCRETE;
    case '=': return W_CRATE;
    case 's': return W_SANDSTONE;
    case '+': return W_DOOR;
    default: return 0;
  }
}

export function buildCells(): number[] {
  const cells: number[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) cells.push(wallAt(col, row));
  }
  return cells;
}

/** Every cell centre marked with `mark`. */
export function spotsFor(mark: string): Cell[] {
  const out: Cell[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (charAt(col, row) === mark) out.push({ x: col + 0.5, y: row + 0.5 });
    }
  }
  return out;
}

// --- Wall textures ---------------------------------------------------------

function texture(fill: (x: number, y: number) => [number, number, number]): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const i = (y * TEX + x) * 4;
      const [r, g, b] = fill(x, y);
      p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = 255;
    }
  }
  return p;
}

export const concreteTexture = () => texture((x, y) => {
  const seam = y % 16 === 0 || (x + (Math.floor(y / 16) % 2) * 16) % 32 === 0;
  const n = ((x * 13 + y * 7) % 14) - 7;
  return seam ? [58, 54, 48] : [116 + n, 108 + n, 94 + n];
});

export const crateTexture = () => texture((x, y) => {
  const frame = x < 3 || x >= TEX - 3 || y < 3 || y >= TEX - 3;
  const brace = Math.abs(x - y) < 2 || Math.abs(x + y - TEX) < 2;
  const n = ((x * 5 + y * 3) % 12) - 6;
  if (frame || brace) return [120, 82, 40];
  return [158 + n, 116 + n, 62 + n];
});

export const sandstoneTexture = () => texture((x, y) => {
  const course = y % 11 === 0;
  const n = ((x * 17 + y * 11) % 16) - 8;
  return course ? [146, 118, 76] : [186 + n, 158 + n, 106 + n];
});

export const doorTexture = () => texture((x, y) => {
  const post = x < 4 || x >= TEX - 4;
  const lintel = y < 5;
  const n = ((x * 7 + y * 5) % 10) - 5;
  if (post || lintel) return [92, 88, 80];
  // The gap reads as an opening even though it is solid: doorways here are
  // landmarks for calling out positions, not passages.
  return [46 + n, 44 + n, 42 + n];
});

// --- Billboard art ---------------------------------------------------------

/** A standing figure in team colours, on transparent. */
function operator(body: [number, number, number], trim: [number, number, number]): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  const set = (x: number, y: number, c: [number, number, number]) => {
    const i = (y * TEX + x) * 4;
    p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; p[i + 3] = 255;
  };
  const dark: [number, number, number] = [
    Math.round(body[0] * 0.55), Math.round(body[1] * 0.55), Math.round(body[2] * 0.55),
  ];

  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const cx = x - TEX / 2 + 0.5;

      const head = y >= 3 && y < 10 && Math.abs(cx) < 3.5;
      const torso = y >= 10 && y < 21 && Math.abs(cx) < 6;
      const legs = y >= 21 && y < 31 && Math.abs(cx) > 1 && Math.abs(cx) < 5.5;
      const arms = y >= 12 && y < 19 && Math.abs(cx) >= 6 && Math.abs(cx) < 8;

      if (head) set(x, y, y < 6 ? dark : [206, 168, 132]);
      else if (torso) set(x, y, Math.abs(cx) > 4 ? dark : body);
      else if (legs) set(x, y, dark);
      else if (arms) set(x, y, body);
    }
  }

  // A rifle held across the chest, and a team stripe so the two sides read
  // apart instantly at distance — the whole point of team colours.
  for (let x = 8; x < 26; x++) set(x, 17, [38, 38, 42]);
  for (let x = 8; x < 26; x++) set(x, 18, [58, 58, 62]);
  for (let x = 11; x < 21; x++) set(x, 12, trim);
  return p;
}

export const enemyTexture = () => operator([196, 74, 52], [255, 196, 80]);
export const allyTexture = () => operator([64, 116, 196], [180, 226, 255]);

/** The bomb: a dark case with a blinking red face. */
export function bombTexture(): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const i = (y * TEX + x) * 4;
      const inCase = x > 8 && x < 24 && y > 14 && y < 26;
      const light = x > 13 && x < 19 && y > 17 && y < 21;
      if (light) { p[i] = 255; p[i + 1] = 60; p[i + 2] = 50; p[i + 3] = 255; }
      else if (inCase) { p[i] = 44; p[i + 1] = 46; p[i + 2] = 52; p[i + 3] = 255; }
      else p[i + 3] = 0;
    }
  }
  return p;
}

/** A muzzle-flash puff used to mark where a shot landed. */
export function sparkTexture(): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const i = (y * TEX + x) * 4;
      const d = Math.hypot(x - TEX / 2, y - TEX / 2);
      if (d < 7) {
        const t = 1 - d / 7;
        p[i] = 255; p[i + 1] = 200 * t + 40; p[i + 2] = 90 * t; p[i + 3] = 255;
      } else p[i + 3] = 0;
    }
  }
  return p;
}
