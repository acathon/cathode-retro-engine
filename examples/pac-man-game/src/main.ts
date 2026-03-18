import { RetroEngine, Scene, Sprite, TileMap, SoundChannel, NOTE } from '@retro-engine/sdk';

// ─── Constants ────────────────────────────────────────────────────────────────
const TILE = 8;
const COLS = 28;   // maze columns
const ROWS = 30;   // maze rows
const TILE_COLS = 32;   // tilemap width: 32 × 8 = 256px = full NES canvas
const MAZE_OX = 2;    // maze starts at tilemap column 2 (centers 224px in 256px)

// Sprite sheet tile indices (16 tiles of 8×8 in a 128×8 sheet)
const T_EMPTY = 0;
const T_WALL = 1;
const T_DOT = 2;
const T_PELLET = 3;
const T_PAC_R = 4;   // pac-man open facing right
const T_PAC_L = 5;   // pac-man open facing left
const T_PAC_U = 6;   // pac-man open facing up
const T_PAC_D = 7;   // pac-man open facing down
const T_PAC_C = 8;   // pac-man closed (circle)
const T_BLINKY = 9;   // ghost red
const T_PINKY = 10;  // ghost pink
const T_INKY = 11;  // ghost cyan
const T_CLYDE = 12;  // ghost orange
const T_FRIGHT = 13;  // frightened ghost (blue)
const T_FLASH = 14;  // frightened ghost flashing (white)
const T_EYES = 15;  // eaten ghost (eyes only)

// ─── Types ────────────────────────────────────────────────────────────────────
type Dir = 'up' | 'down' | 'left' | 'right' | 'none';
type GhostMode = 'house' | 'exiting' | 'scatter' | 'chase' | 'frightened' | 'eaten';
type GamePhase = 'ready' | 'playing' | 'dying' | 'gameover' | 'win';

// ─── Maze layout ──────────────────────────────────────────────────────────────
// 0 = open passage   1 = wall   2 = dot   3 = power pellet   4 = ghost house
const MAZE_TEMPLATE: ReadonlyArray<ReadonlyArray<number>> = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],  // 0
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],  // 1
  [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],  // 2
  [1, 3, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 3, 1],  // 3  ← power pellets
  [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],  // 4
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],  // 5
  [1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1],  // 6
  [1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1],  // 7
  [1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 1],  // 8
  [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1],  // 9
  [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1],  // 10
  [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],  // 11
  [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 4, 4, 4, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],  // 12
  [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 4, 4, 4, 4, 4, 4, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],  // 13  ghost house
  [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],  // 14  ← tunnel row
  [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],  // 15
  [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],  // 16
  [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],  // 17
  [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],  // 18
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],  // 19
  [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],  // 20
  [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],  // 21
  [1, 3, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 3, 1],  // 22  ← power pellets
  [1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 0, 0, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1],  // 23  pac-man spawn col 13
  [1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 0, 0, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1],  // 24
  [1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 1],  // 25
  [1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1],  // 26
  [1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1],  // 27
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],  // 28
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],  // 29
];

// ─── Sprite Sheet Builder ─────────────────────────────────────────────────────
// Returns a flat RGBA8 Uint8ClampedArray for 16 tiles of 8×8 (128×8 sheet).
function buildSpriteSheet(): Uint8ClampedArray {
  const NUM = 16;
  const buf = new Uint8ClampedArray(NUM * TILE * TILE * 4); // all transparent

  const setpx = (tile: number, tx: number, ty: number,
    r: number, g: number, b: number, a = 255) => {
    if (tx < 0 || tx >= TILE || ty < 0 || ty >= TILE) return;
    const i = (tile * TILE * TILE + ty * TILE + tx) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };

  const fillRect = (t: number, x1: number, y1: number, x2: number, y2: number,
    r: number, g: number, b: number) => {
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++)
        setpx(t, x, y, r, g, b);
  };

  const circle = (t: number, cx: number, cy: number, rad: number,
    r: number, g: number, b: number) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad)
          setpx(t, x, y, r, g, b);
  };

  // ── T1: Wall — blue fill with darker inner border
  fillRect(T_WALL, 0, 0, 7, 7, 0x21, 0x21, 0xDE);
  fillRect(T_WALL, 1, 1, 6, 6, 0x00, 0x00, 0xAA);

  // ── T2: Dot — 2×2 pale-yellow pixels at centre
  for (let dy = 3; dy <= 4; dy++)
    for (let dx = 3; dx <= 4; dx++)
      setpx(T_DOT, dx, dy, 255, 255, 190);

  // ── T3: Power pellet — larger glowing circle
  circle(T_PELLET, 3.5, 3.5, 2.8, 255, 255, 120);
  circle(T_PELLET, 3.5, 3.5, 1.8, 255, 255, 220);

  // ── T4–T7: Pac-Man open (right / left / up / down)
  const CX = 3.5, CY = 3.5, PR = 3.2;
  const MOUTH = 0.72; // mouth half-angle in radians (~41°)
  const pacFacing = [0, Math.PI, -Math.PI / 2, Math.PI / 2]; // R L U D
  for (let d = 0; d < 4; d++) {
    const tile = T_PAC_R + d;
    const facing = pacFacing[d];
    for (let ty = 0; ty < TILE; ty++) {
      for (let tx = 0; tx < TILE; tx++) {
        const dx = tx - CX, dy = ty - CY;
        if (dx * dx + dy * dy > PR * PR) continue;
        let ang = Math.atan2(dy, dx) - facing;
        while (ang > Math.PI) ang -= 2 * Math.PI;
        while (ang < -Math.PI) ang += 2 * Math.PI;
        if (Math.abs(ang) < MOUTH) continue; // mouth gap
        setpx(tile, tx, ty, 255, 220, 0);
      }
    }
  }

  // ── T8: Pac-Man closed — full yellow disc
  circle(T_PAC_C, CX, CY, PR, 255, 220, 0);

  // ── T9–T12: Coloured ghosts
  const GHOST_COLORS: [number, number, number][] = [
    [255, 0, 0], // Blinky
    [255, 184, 220], // Pinky
    [0, 255, 255], // Inky
    [255, 184, 81], // Clyde
  ];

  const drawGhost = (tile: number, br: number, bg_: number, bb: number,
    frightened = false, flash = false) => {
    const [r, g, b] = flash ? [255, 255, 255] as const
      : frightened ? [33, 33, 220] as const
        : [br, bg_, bb] as const;

    // Upper dome
    for (let ty = 0; ty <= 3; ty++)
      for (let tx = 0; tx < TILE; tx++)
        if ((tx - 3.5) ** 2 + (ty - 3.5) ** 2 <= 3.6 ** 2)
          setpx(tile, tx, ty, r, g, b);

    // Rectangular body
    for (let ty = 4; ty <= 6; ty++)
      for (let tx = 0; tx < TILE; tx++)
        setpx(tile, tx, ty, r, g, b);

    // Scalloped bottom (skip 3 valley pairs)
    for (let tx = 0; tx < TILE; tx++) {
      if (tx !== 0 && tx !== 1 && tx !== 3 && tx !== 4 && tx !== 6 && tx !== 7)
        setpx(tile, tx, 7, r, g, b);
    }

    if (!frightened && !flash) {
      // White eyes
      circle(tile, 2, 2.5, 1.4, 255, 255, 255);
      circle(tile, 5.5, 2.5, 1.4, 255, 255, 255);
      // Blue pupils
      circle(tile, 2.5, 2.5, 0.7, 0, 0, 200);
      circle(tile, 6, 2.5, 0.7, 0, 0, 200);
    } else {
      // Small white dot eyes
      setpx(tile, 2, 2, 255, 255, 255);
      setpx(tile, 5, 2, 255, 255, 255);
      // Wavy mouth
      const mx = [1, 2, 3, 4, 5, 6];
      const my = [6, 5, 6, 5, 6, 5];
      mx.forEach((x, i) => setpx(tile, x, my[i], 255, 255, 255));
    }
  };

  GHOST_COLORS.forEach(([r, g, b], i) => drawGhost(T_BLINKY + i, r, g, b));
  drawGhost(T_FRIGHT, 0, 0, 200, true, false);
  drawGhost(T_FLASH, 0, 0, 200, true, true);

  // ── T15: Ghost eyes only (eaten state)
  circle(T_EYES, 2, 2.5, 1.4, 255, 255, 255);
  circle(T_EYES, 5.5, 2.5, 1.4, 255, 255, 255);
  circle(T_EYES, 2.5, 2.5, 0.7, 0, 0, 200);
  circle(T_EYES, 6, 2.5, 0.7, 0, 0, 200);

  return buf;
}

// ─── Maze / Grid helpers ──────────────────────────────────────────────────────
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

const wrapCol = (c: number) => ((c % COLS) + COLS) % COLS;

const dirVec = (d: Dir): [number, number] => {
  if (d === 'up') return [0, -1];
  if (d === 'down') return [0, 1];
  if (d === 'left') return [-1, 0];
  if (d === 'right') return [1, 0];
  return [0, 0];
};

const reverseDir = (d: Dir): Dir => {
  if (d === 'up') return 'down';
  if (d === 'down') return 'up';
  if (d === 'left') return 'right';
  if (d === 'right') return 'left';
  return 'none';
};

// Convert maze col/row → pixel position (accounting for MAZE_OX centering offset)
const cellPx = (col: number, row: number): [number, number] =>
  [(col + MAZE_OX) * TILE, row * TILE];

function canMoveTo(maze: number[][], col: number, row: number, dir: Dir,
  isGhost = false, allowEnterHouse = false): boolean {
  const [dc, dr] = dirVec(dir);
  const nc = wrapCol(col + dc);
  const nr = row + dr;
  if (nr < 0 || nr >= ROWS) return false;
  const cell = maze[nr]?.[nc] ?? 1;
  if (cell === 1) return false;
  if (cell === 4) return isGhost || allowEnterHouse;
  return true;
}

function countDots(maze: number[][]): number {
  return maze.reduce((s, row) => s + row.filter(v => v === 2 || v === 3).length, 0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const engine = await RetroEngine.nes(canvas, 3);
  const scene = new Scene(engine);

  // Upload sprite sheet: 16 tiles × 8px wide × 8px tall = 128×8 pixels
  const sheetPx = buildSpriteSheet();
  const sheet = engine.raw.upload_sheet(
    16 * TILE, TILE, TILE, TILE,
    new Uint8Array(sheetPx.buffer)
  ) as number;

  // ── Working maze (mutable copy)
  let maze = MAZE_TEMPLATE.map(r => [...r]);

  // ── Tilemap (32 cols × 30 rows = 256×240 = full NES screen)
  const tileMap = new TileMap(scene, { name: 'maze', cols: TILE_COLS, rows: ROWS, tileWidth: TILE, tileHeight: TILE });
  const mazeLayer = tileMap.addLayer('maze', sheet);

  function syncTilemap() {
    for (let row = 0; row < ROWS; row++) {
      // left border columns (0–1) and right border (30–31): empty
      tileMap.setTile(mazeLayer, 0, row, T_EMPTY);
      tileMap.setTile(mazeLayer, 1, row, T_EMPTY);
      tileMap.setTile(mazeLayer, 30, row, T_EMPTY);
      tileMap.setTile(mazeLayer, 31, row, T_EMPTY);
      for (let col = 0; col < COLS; col++) {
        const v = maze[row][col];
        const id = v === 1 ? T_WALL : v === 2 ? T_DOT : v === 3 ? T_PELLET : T_EMPTY;
        tileMap.setTile(mazeLayer, col + MAZE_OX, row, id);
      }
    }
    tileMap.commit();
  }
  syncTilemap();

  // ── Pac-Man state
  let pacCol = 13, pacRow = 23;
  let pacTargetCol = 13, pacTargetRow = 23;
  let pacProgress = 1.0;
  let pacDir: Dir = 'none';
  let pacNextDir: Dir = 'none';
  let pacMouthOpen = false;
  let pacMouthTimer = 0;

  const [px0, py0] = cellPx(pacCol, pacRow);
  const pacSprite = new Sprite(scene, { x: px0, y: py0, sheet, frame: T_PAC_C, layer: 10 });
  pacSprite.velocityX = 0;
  pacSprite.velocityY = 0;

  // ── Ghost definitions
  interface GhostState {
    col: number; row: number;
    targetCol: number; targetRow: number;
    progress: number;
    speed: number;
    dir: Dir;
    mode: GhostMode;
    frightTimer: number;
    exitTimer: number;
    bobTime: number;
    sprite: Sprite;
    tileIdx: number;
    scatterCol: number;
    scatterRow: number;
    initCol: number;
    initRow: number;
  }

  const GHOST_DEFS = [
    { tile: T_BLINKY, col: 13, row: 13, scatter: [COLS - 2, 0], exit: 1.5 },
    { tile: T_PINKY, col: 14, row: 13, scatter: [1, 0], exit: 5 },
    { tile: T_INKY, col: 12, row: 13, scatter: [COLS - 2, ROWS - 1], exit: 10 },
    { tile: T_CLYDE, col: 15, row: 13, scatter: [1, ROWS - 1], exit: 16 },
  ];

  const ghosts: GhostState[] = GHOST_DEFS.map(def => {
    const [gx, gy] = cellPx(def.col, def.row);
    const sp = new Sprite(scene, { x: gx, y: gy, sheet, frame: def.tile, layer: 9 });
    sp.velocityX = 0;
    sp.velocityY = 0;
    return {
      col: def.col, row: def.row,
      targetCol: def.col, targetRow: def.row,
      progress: 1.0, speed: 0,
      dir: 'none',
      mode: 'house' as GhostMode,
      frightTimer: 0, exitTimer: def.exit,
      bobTime: 0,
      sprite: sp,
      tileIdx: def.tile,
      scatterCol: def.scatter[0], scatterRow: def.scatter[1],
      initCol: def.col, initRow: def.row,
    };
  });

  // ── Game state
  let phase: GamePhase = 'ready';
  let score = 0;
  let lives = 3;
  let level = 1;
  let dotsLeft = countDots(maze);
  let readyTimer = 2.5;
  let dyingTimer = 0;
  let mazeChanged = false;
  let globalModePhase = 0;
  let globalModeTimer = 0;
  let ghostEatCombo = 0;
  const MODE_DURATIONS = [7, 20, 7, 20, 5, 20, 5, 99999];

  // ── Audio channels
  const sfxA = new SoundChannel(engine, 0);
  const sfxB = new SoundChannel(engine, 1);

  // ── DOM HUD
  const scoreEl = document.getElementById('score')!;
  const livesEl = document.getElementById('lives')!;
  const levelEl = document.getElementById('level')!;
  const msgEl = document.getElementById('message') as HTMLDivElement;

  // ── Keyboard input (raw, bypasses engine input system)
  let inputDir: Dir = 'none';
  window.addEventListener('keydown', e => {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': inputDir = 'left'; break;
      case 'ArrowRight': case 'd': case 'D': inputDir = 'right'; break;
      case 'ArrowUp': case 'w': case 'W': inputDir = 'up'; break;
      case 'ArrowDown': case 's': case 'S': inputDir = 'down'; break;
    }
  });

  // ─── Resets ────────────────────────────────────────────────────────────────
  function resetPositions() {
    pacCol = pacTargetCol = 13;
    pacRow = pacTargetRow = 23;
    pacProgress = 1.0;
    pacDir = pacNextDir = 'none';
    const [px, py] = cellPx(pacCol, pacRow);
    pacSprite.x = px; pacSprite.y = py;
    pacSprite.frame = T_PAC_C;

    GHOST_DEFS.forEach((def, i) => {
      const g = ghosts[i];
      g.col = g.targetCol = g.initCol;
      g.row = g.targetRow = g.initRow;
      g.progress = 1.0; g.dir = 'none';
      g.mode = 'house';
      g.frightTimer = 0;
      g.exitTimer = def.exit;
      g.bobTime = 0;
      const [gx, gy] = cellPx(g.col, g.row);
      g.sprite.x = gx; g.sprite.y = gy;
      g.sprite.frame = def.tile;
    });
    ghostEatCombo = 0;
    globalModePhase = 0;
    globalModeTimer = 0;
  }

  function resetLevel() {
    maze = MAZE_TEMPLATE.map(r => [...r]);
    dotsLeft = countDots(maze);
    syncTilemap();
    resetPositions();
  }

  // ─── Ghost AI ──────────────────────────────────────────────────────────────
  function ghostTarget(g: GhostState, idx: number): [number, number] {
    if (g.mode === 'scatter') return [g.scatterCol, g.scatterRow];
    if (g.mode === 'eaten') return [13, 11]; // ghost house entrance

    // Chase targets
    const [pdc, pdr] = dirVec(pacDir === 'none' ? 'right' : pacDir);
    switch (idx) {
      case 0: // Blinky — direct chase
        return [pacCol, pacRow];
      case 1: // Pinky — 4 cells ahead of pac
        return [
          wrapCol(pacCol + pdc * 4),
          Math.max(0, Math.min(ROWS - 1, pacRow + pdr * 4)),
        ];
      case 2: { // Inky — reflect Blinky through 2 ahead of pac
        const bx = ghosts[0].col, by = ghosts[0].row;
        const vx = wrapCol(pacCol + pdc * 2), vy = Math.max(0, Math.min(ROWS - 1, pacRow + pdr * 2));
        return [wrapCol(2 * vx - bx), Math.max(0, Math.min(ROWS - 1, 2 * vy - by))];
      }
      case 3: // Clyde — chase if far, scatter if within 8 tiles
        return Math.hypot(g.col - pacCol, g.row - pacRow) > 8
          ? [pacCol, pacRow]
          : [g.scatterCol, g.scatterRow];
      default:
        return [pacCol, pacRow];
    }
  }

  function chooseGhostDir(g: GhostState, tc: number, tr: number): Dir {
    const priority: Dir[] = ['up', 'left', 'down', 'right'];
    const rev = reverseDir(g.dir);

    if (g.mode === 'frightened') {
      const valid = priority.filter(d =>
        d !== rev && canMoveTo(maze, g.col, g.row, d, true)
      );
      return valid.length ? valid[Math.floor(Math.random() * valid.length)] : rev;
    }

    let best: Dir = g.dir === 'none' ? 'left' : rev;
    let bestDist = Infinity;
    for (const d of priority) {
      if (d === rev && g.mode !== 'eaten') continue;
      if (!canMoveTo(maze, g.col, g.row, d, true, g.mode === 'eaten')) continue;
      const [dc, dr] = dirVec(d);
      const nc = wrapCol(g.col + dc), nr = g.row + dr;
      const dd = Math.hypot(nc - tc, nr - tr);
      if (dd < bestDist) { bestDist = dd; best = d; }
    }
    return best;
  }

  // ─── Update ghost ──────────────────────────────────────────────────────────
  function updateGhost(g: GhostState, idx: number, dt: number) {
    // House bob
    if (g.mode === 'house') {
      g.bobTime += dt;
      const [bx, by] = cellPx(g.col, g.row);
      g.sprite.x = bx;
      g.sprite.y = by + Math.sin(g.bobTime * 3) * 2;
      g.sprite.frame = g.tileIdx;
      return;
    }

    // Exiting house: centre at col 13 then move up to row 11
    if (g.mode === 'exiting') {
      g.speed = 4;
      g.progress += g.speed * dt;

      if (g.col !== 13) {
        // Step horizontally toward col 13
        const hDir: Dir = g.col < 13 ? 'right' : 'left';
        if (g.progress >= 1) {
          const [dc] = dirVec(hDir);
          g.col = wrapCol(g.col + dc);
          g.progress = 0;
        }
        const [gx, gy] = cellPx(g.col, g.row);
        const [dc] = dirVec(g.col < 13 ? 'right' : (g.col > 13 ? 'left' : 'none'));
        const [tx] = cellPx(wrapCol(g.col + dc), g.row);
        g.sprite.x = lerp(gx, tx, Math.min(g.progress, 1));
        g.sprite.y = gy;
      } else {
        // Move upward
        if (g.progress >= 1) {
          g.row--;
          g.progress = 0;
          if (g.row <= 11) {
            g.row = 11;
            g.mode = globalModePhase % 2 === 0 ? 'scatter' : 'chase';
            g.dir = 'left';
          }
        }
        const [gx, gy] = cellPx(g.col, g.row);
        const [, ty] = cellPx(g.col, g.row - 1);
        g.sprite.x = gx;
        g.sprite.y = lerp(gy, ty, Math.min(g.progress, 1));
      }
      g.sprite.frame = g.tileIdx;
      return;
    }

    // Normal AI movement
    const baseSpeed = 6 + (level - 1) * 0.4;
    g.speed = g.mode === 'frightened' ? baseSpeed * 0.6
      : g.mode === 'eaten' ? baseSpeed * 2
        : baseSpeed;
    g.progress += g.speed * dt;

    if (g.progress >= 1) {
      // Commit to current target cell
      const [dc, dr] = dirVec(g.dir);
      if (g.dir !== 'none') {
        g.col = wrapCol(g.col + dc);
        g.row += dr;
      }
      g.progress = 0;

      // Eaten ghost arrived at ghost house entrance
      if (g.mode === 'eaten' && g.col === 13 && g.row === 11) {
        g.mode = globalModePhase % 2 === 0 ? 'scatter' : 'chase';
        g.frightTimer = 0;
      }

      // Pick next direction using AI target
      const [tc, tr] = ghostTarget(g, idx);
      g.dir = chooseGhostDir(g, tc, tr);
    }

    // Smooth visual position
    const [gx, gy] = cellPx(g.col, g.row);
    const [dc, dr] = dirVec(g.dir);
    const [tx, ty] = cellPx(wrapCol(g.col + dc), g.row + dr);
    // Avoid visual wrap-around glitch in tunnel
    const wrapping = Math.abs((g.col + dc) - wrapCol(g.col + dc)) > 0;
    g.sprite.x = wrapping ? tx : lerp(gx, tx, g.progress);
    g.sprite.y = lerp(gy, ty, g.progress);

    // Frame
    g.sprite.frame = g.mode === 'frightened'
      ? (g.frightTimer < 2 ? T_FLASH : T_FRIGHT)
      : g.mode === 'eaten' ? T_EYES
        : g.tileIdx;
  }

  // ─── Update Pac-Man ────────────────────────────────────────────────────────
  function updatePacman(dt: number) {
    // Queue input direction
    if (inputDir !== 'none') pacNextDir = inputDir;

    // Mouth animation (only when moving)
    if (pacDir !== 'none') {
      pacMouthTimer += dt;
      if (pacMouthTimer >= 0.12) { pacMouthOpen = !pacMouthOpen; pacMouthTimer = 0; }
    } else {
      pacMouthOpen = false;
    }

    // Advance movement
    if (pacDir !== 'none' || pacNextDir !== 'none') {
      const speed = 8 + (level - 1) * 0.3;
      pacProgress += speed * dt;
    }

    if (pacProgress >= 1) {
      // Arrive at target
      pacCol = pacTargetCol;
      pacRow = pacTargetRow;
      pacProgress = 0;

      // Try queued direction first, fall back to current, else stop
      if (pacNextDir !== 'none' && canMoveTo(maze, pacCol, pacRow, pacNextDir)) {
        pacDir = pacNextDir;
        pacNextDir = 'none';
      } else if (pacDir !== 'none' && !canMoveTo(maze, pacCol, pacRow, pacDir)) {
        pacDir = 'none';
      }

      if (pacDir !== 'none') {
        const [dc, dr] = dirVec(pacDir);
        pacTargetCol = wrapCol(pacCol + dc);
        pacTargetRow = pacRow + dr;
      }

      // Eat dot / pellet at newly arrived cell
      const cell = maze[pacRow]?.[pacCol] ?? 0;
      if (cell === 2) {
        maze[pacRow][pacCol] = 0;
        dotsLeft--;
        score += 10;
        mazeChanged = true;
        sfxA.play(NOTE['C5'], 'pulse25', 0.12);
        setTimeout(() => sfxA.stop(), 55);
      } else if (cell === 3) {
        maze[pacRow][pacCol] = 0;
        dotsLeft--;
        score += 50;
        mazeChanged = true;
        ghostEatCombo = 0;
        sfxA.play(NOTE['G4'], 'pulse50', 0.28);
        setTimeout(() => sfxA.stop(), 220);
        // Frighten all non-dead ghosts
        ghosts.forEach(g => {
          if (g.mode === 'scatter' || g.mode === 'chase' || g.mode === 'frightened') {
            g.mode = 'frightened';
            g.frightTimer = 6.0;
            g.dir = reverseDir(g.dir);
          }
        });
      }
    }

    // Visual interpolation
    const [px1, py1] = cellPx(pacCol, pacRow);
    const [px2, py2] = cellPx(pacTargetCol, pacTargetRow);
    const wrapping = Math.abs(pacTargetCol - pacCol) > 2;
    pacSprite.x = wrapping ? px2 : lerp(px1, px2, pacProgress);
    pacSprite.y = lerp(py1, py2, pacProgress);

    // Pac-Man frame
    if (!pacMouthOpen || pacDir === 'none') {
      pacSprite.frame = T_PAC_C;
    } else {
      pacSprite.frame = pacDir === 'right' ? T_PAC_R
        : pacDir === 'left' ? T_PAC_L
          : pacDir === 'up' ? T_PAC_U
            : T_PAC_D;
    }
  }

  // ─── Show initial READY message ────────────────────────────────────────────
  msgEl.textContent = 'READY!';

  // ─── Main loop ─────────────────────────────────────────────────────────────
  engine.loop((rawDt: number) => {
    const dt = Math.min(rawDt, 0.05);

    // HUD
    scoreEl.textContent = `SCORE: ${score}`;
    livesEl.textContent = 'LIVES: ' + '❤ '.repeat(Math.max(0, lives)).trim();
    levelEl.textContent = `LEVEL: ${level}`;

    // ── READY ──
    if (phase === 'ready') {
      readyTimer -= dt;
      if (readyTimer <= 0) { phase = 'playing'; msgEl.textContent = ''; }
      scene.update(dt);
      return;
    }

    // ── DYING ──
    if (phase === 'dying') {
      dyingTimer -= dt;
      // Blink pac-man
      pacSprite.frame = (Math.floor(dyingTimer * 8) % 2 === 0) ? T_PAC_C : T_EMPTY;
      if (dyingTimer <= 0) {
        lives--;
        if (lives <= 0) {
          phase = 'gameover';
          msgEl.textContent = 'GAME OVER';
        } else {
          resetPositions();
          phase = 'ready';
          readyTimer = 2.0;
          msgEl.textContent = 'READY!';
        }
      }
      scene.update(dt);
      return;
    }

    // ── WIN / GAME OVER ── (static)
    if (phase === 'win' || phase === 'gameover') {
      scene.update(dt);
      return;
    }

    // ── PLAYING ────────────────────────────────────────────────────────────
    // Global scatter/chase mode timer
    globalModeTimer += dt;
    if (globalModePhase < MODE_DURATIONS.length - 1 &&
      globalModeTimer >= MODE_DURATIONS[globalModePhase]) {
      globalModeTimer = 0;
      globalModePhase++;
      ghosts.forEach(g => {
        if (g.mode === 'scatter' || g.mode === 'chase') {
          g.mode = globalModePhase % 2 === 0 ? 'scatter' : 'chase';
          g.dir = reverseDir(g.dir);
        }
      });
    }

    // Ghost house exit countdown
    ghosts.forEach(g => {
      if (g.mode === 'house') {
        g.exitTimer -= dt;
        if (g.exitTimer <= 0) g.mode = 'exiting';
      }
    });

    // Frightened timer countdown
    ghosts.forEach(g => {
      if (g.mode === 'frightened') {
        g.frightTimer -= dt;
        if (g.frightTimer <= 0)
          g.mode = globalModePhase % 2 === 0 ? 'scatter' : 'chase';
      }
    });

    // Update actors
    updatePacman(dt);
    ghosts.forEach((g, i) => updateGhost(g, i, dt));

    // Ghost ↔ Pac-Man collisions
    ghosts.forEach(g => {
      if (g.mode === 'house' || g.mode === 'exiting') return;
      const dx = g.sprite.x - pacSprite.x;
      const dy = g.sprite.y - pacSprite.y;
      if (Math.sqrt(dx * dx + dy * dy) >= TILE * 0.9) return;

      if (g.mode === 'frightened') {
        g.mode = 'eaten';
        ghostEatCombo++;
        const pts = 200 * (1 << Math.min(ghostEatCombo - 1, 3));
        score += pts;
        sfxB.play(NOTE['E5'], 'triangle', 0.4);
        setTimeout(() => sfxB.stop(), 200);
      } else if (g.mode !== 'eaten') {
        phase = 'dying';
        dyingTimer = 2.0;
        sfxA.play(NOTE['C3'], 'noise', 0.4);
        setTimeout(() => sfxA.stop(), 900);
      }
    });

    // Win condition
    if (dotsLeft <= 0) {
      phase = 'win';
      level++;
      msgEl.textContent = `🎉 LEVEL ${level}!`;
      setTimeout(() => {
        resetLevel();
        phase = 'ready';
        readyTimer = 2.5;
        msgEl.textContent = 'READY!';
      }, 2500);
    }

    // Flush maze tile changes
    if (mazeChanged) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = maze[r][c];
          const id = v === 1 ? T_WALL : v === 2 ? T_DOT : v === 3 ? T_PELLET : T_EMPTY;
          tileMap.setTile(mazeLayer, c + MAZE_OX, r, id);
        }
      }
      tileMap.commit();
      mazeChanged = false;
    }

    scene.update(dt);
  });
}

main().catch(console.error);
