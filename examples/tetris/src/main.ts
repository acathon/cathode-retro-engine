/**
 * TETRIS — drawn by the engine.
 *
 * This game used to draw itself into a second canvas with a hand-rolled 2D
 * context, with a comment explaining why: the engine capped sprites at 40 on
 * the Game Boy profile, and a Tetris well is 200 cells. The cap is gone —
 * hardware budgets are checked when you export rather than enforced while you
 * play — so the board is now 200 real engine sprites, and the only canvas on
 * the page is the engine's own.
 */
import { BitmapFont, Cathode, Scene, SoundChannel, Sprite } from '@cathode/sdk';

// ─── Constants ───────────────────────────────────────────────────────
const W = 160;
const H = 144;

const COLS = 10;
const ROWS = 20;
const CELL = 7;

// Board origin on screen
const BOARD_X = 8;
const BOARD_Y = 2;

// Next piece box
const NEXT_X = 88;
const NEXT_Y = 14;

// Score/level display positions
const TEXT_X = 88;

// Game Boy 4-shade green palette
const GB_COLORS = ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'];

// ─── Tetromino Definitions ───────────────────────────────────────────
const PIECES: number[][][][] = [
  // I
  [[[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]]],
  // O
  [[[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0], [1, 1]]],
  // T
  [[[0, 1], [1, 0], [1, 1], [1, 2]], [[0, 0], [1, 0], [1, 1], [2, 0]], [[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 1], [1, 0], [1, 1], [2, 1]]],
  // S
  [[[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]]],
  // Z
  [[[0, 0], [0, 1], [1, 1], [1, 2]], [[0, 1], [1, 0], [1, 1], [2, 0]], [[0, 0], [0, 1], [1, 1], [1, 2]], [[0, 1], [1, 0], [1, 1], [2, 0]]],
  // L
  [[[0, 0], [1, 0], [1, 1], [1, 2]], [[0, 0], [0, 1], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2], [1, 2]], [[0, 1], [1, 1], [2, 0], [2, 1]]],
  // J
  [[[0, 2], [1, 0], [1, 1], [1, 2]], [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 0], [0, 1], [0, 2], [1, 0]], [[0, 0], [0, 1], [1, 1], [2, 1]]],
];

// Shade index per piece type (indexes into GB_COLORS)
const PIECE_SHADE = [1, 0, 2, 1, 2, 0, 2];

type GameState = 'title' | 'playing' | 'gameover';

// ─── Sprite sheet ────────────────────────────────────────────────────
/** Tile indices in the generated sheet. */
const T_SHADE0 = 0;   // one per Game Boy shade
const T_FRAME = 4;    // the well's border
const T_GHOST = 5;    // where the piece will land

/**
 * Build the 6-tile sheet the whole game draws with: four block shades, a
 * frame block and a ghost block, each CELL x CELL.
 */
function buildSheet(): { pixels: Uint8Array; w: number; h: number } {
  const tiles = 6;
  const w = CELL * tiles;
  const h = CELL;
  const px = new Uint8Array(w * h * 4);

  const put = (tile: number, x: number, y: number, hex: string) => {
    const i = ((y * w) + tile * CELL + x) * 4;
    px[i] = parseInt(hex.slice(1, 3), 16);
    px[i + 1] = parseInt(hex.slice(3, 5), 16);
    px[i + 2] = parseInt(hex.slice(5, 7), 16);
    px[i + 3] = 255;
  };

  for (let shade = 0; shade < 4; shade++) {
    const base = GB_COLORS[shade];
    const light = shade > 0 ? GB_COLORS[shade - 1] : '#c6de78';
    const dark = shade < 3 ? GB_COLORS[shade + 1] : '#052005';
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        // A lit top-left edge and a shaded bottom-right is what makes a flat
        // square read as a block on a screen with four colours.
        let hex = base;
        if (x === 0 || y === 0) hex = light;
        if (x === CELL - 1 || y === CELL - 1) hex = dark;
        if (x >= 2 && x <= 3 && y >= 2 && y <= 3) hex = light;
        put(shade, x, y, hex);
      }
    }
  }

  // The wall is solid with a single inset highlight: giving it a dark border
  // like a block made the frame read as a dotted line of loose tiles rather
  // than as one continuous wall.
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const speck = (x + y) % 3 === 0;
      put(T_FRAME, x, y, speck ? GB_COLORS[3] : GB_COLORS[2]);
    }
  }

  // The ghost is an outline only, so it reads as "where this lands" rather
  // than as another block already on the board.
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const edge = x === 0 || y === 0 || x === CELL - 1 || y === CELL - 1;
      const i = ((y * w) + T_GHOST * CELL + x) * 4;
      if (edge) put(T_GHOST, x, y, GB_COLORS[2]);
      else px[i + 3] = 0;
    }
  }

  return { pixels: px, w, h };
}

// ─── Init ────────────────────────────────────────────────────────────
async function init() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const engine = await Cathode.gameboy(canvas, 3);

  const scene = new Scene(engine);
  const sheet = buildSheet();
  const sheetHandle = engine.raw.upload_sheet(sheet.w, sheet.h, CELL, CELL, sheet.pixels);
  const font = BitmapFont.builtin(engine);

  /** A pool of sprites reused every frame, so nothing is created in the loop. */
  function pool(count: number, layer: number): Sprite[] {
    return Array.from({ length: count }, () => {
      const sprite = new Sprite(scene, { sheet: sheetHandle, frame: T_FRAME, x: 0, y: 0, layer });
      sprite.active = false;
      return sprite;
    });
  }

  /** Show a pooled sprite at a screen position with a given tile. */
  function place(sprite: Sprite, x: number, y: number, frame: number): void {
    sprite.active = true;
    sprite.frame = frame;
    sprite.x = x;
    sprite.y = y;
  }

  const boardSprites = pool(COLS * ROWS, 4);
  const ghostSprites = pool(4, 5);
  const pieceSprites = pool(4, 6);
  const nextSprites = pool(4, 4);

  // The frame never moves, so it is placed once and left alone.
  const frameSprites = pool(ROWS * 2 + COLS + 2 + 20, 3);
  {
    let n = 0;
    const frame = (x: number, y: number) => place(frameSprites[n++], x, y, T_FRAME);
    for (let r = 0; r < ROWS; r++) {
      frame(BOARD_X - CELL, BOARD_Y + r * CELL);
      frame(BOARD_X + COLS * CELL, BOARD_Y + r * CELL);
    }
    for (let c = -1; c <= COLS; c++) frame(BOARD_X + c * CELL, BOARD_Y + ROWS * CELL);
    for (let i = 0; i < 6; i++) {
      frame(NEXT_X - CELL + i * CELL, NEXT_Y - CELL);
      frame(NEXT_X - CELL + i * CELL, NEXT_Y + 4 * CELL);
    }
    for (let r = 0; r < 4; r++) {
      frame(NEXT_X - CELL, NEXT_Y + r * CELL);
      frame(NEXT_X + 4 * CELL, NEXT_Y + r * CELL);
    }
  }

  /** Hide the frame and the well while the title screen is up. */
  function showWell(visible: boolean): void {
    for (const sprite of frameSprites) {
      if (sprite.x !== 0 || sprite.y !== 0) sprite.active = visible;
    }
  }

  // Sound channels (Game Boy has 4: 0-3)
  const sfxMove = new SoundChannel(engine, 1);
  const sfxRotate = new SoundChannel(engine, 2);
  const sfxDrop = new SoundChannel(engine, 3);
  const sfxClear = new SoundChannel(engine, 3);
  const melodyChannel = new SoundChannel(engine, 0);

  // ── Playfield board (0 = empty, 1+ = shade index + 1)
  const board: number[][] = [];
  for (let r = 0; r < ROWS; r++) board.push(new Array(COLS).fill(0));

  // ── Drawing ─────────────────────────────────────────────────────────
  // Every draw call below moves pooled sprites rather than painting pixels.
  // The engine composites them, applies the Game Boy palette and blits once.

  function drawBoard(): void {
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const value = board[r][c];
        const sprite = boardSprites[n++];
        if (value === 0) {
          sprite.active = false;
        } else {
          place(sprite, BOARD_X + c * CELL, BOARD_Y + r * CELL, T_SHADE0 + value - 1);
        }
      }
    }
  }

  function drawPiece(): void {
    const cells = PIECES[currentPiece][currentRot % 4];

    const ghostY = getGhostY();
    ghostSprites.forEach((sprite, i) => {
      const cell = cells[i];
      const gr = ghostY + cell[0];
      // A ghost under the piece itself is noise, not guidance.
      if (gr < 0 || ghostY === currentY) sprite.active = false;
      else place(sprite, BOARD_X + (currentX + cell[1]) * CELL, BOARD_Y + gr * CELL, T_GHOST);
    });

    pieceSprites.forEach((sprite, i) => {
      const cell = cells[i];
      const nr = currentY + cell[0];
      if (nr < 0) sprite.active = false;
      else {
        place(
          sprite,
          BOARD_X + (currentX + cell[1]) * CELL,
          BOARD_Y + nr * CELL,
          T_SHADE0 + PIECE_SHADE[currentPiece],
        );
      }
    });
  }

  function hidePiece(): void {
    for (const sprite of [...ghostSprites, ...pieceSprites]) sprite.active = false;
  }

  function drawNextPiece(): void {
    const cells = PIECES[nextPiece][0];
    nextSprites.forEach((sprite, i) => {
      const cell = cells[i];
      place(
        sprite,
        NEXT_X + cell[1] * CELL,
        NEXT_Y + cell[0] * CELL,
        T_SHADE0 + PIECE_SHADE[nextPiece],
      );
    });
  }

  function drawHud(): void {
    // Queued, not painted: text is drawn after the world so it lands on top.
    if (state === 'title') {
      font.draw('TETRIS', 56, 44, 2);
      font.draw('PRESS ENTER', 36, 76, 1);
      font.draw('< > MOVE  ^ ROTATE', 12, 100, 1);
      font.draw('v DROP  Z HARDDROP', 12, 112, 1);
      return;
    }

    font.draw('NEXT', NEXT_X + 2, NEXT_Y - 14, 1);
    font.draw('SCORE', TEXT_X, NEXT_Y + 44, 1);
    font.draw(String(score), TEXT_X, NEXT_Y + 54, 1);
    font.draw('LEVEL', TEXT_X, NEXT_Y + 70, 1);
    font.draw(String(level), TEXT_X, NEXT_Y + 80, 1);
    font.draw('LINES', TEXT_X, NEXT_Y + 96, 1);
    font.draw(String(lines), TEXT_X, NEXT_Y + 106, 1);

    if (state === 'gameover') {
      font.draw('GAME OVER', 42, 66, 1);
      font.draw('PRESS ENTER', 36, 80, 1);
    }
  }

  function render(): void {
    const playing = state !== 'title';
    showWell(playing);

    if (playing) {
      drawBoard();
      drawNextPiece();
      if (state === 'playing') drawPiece();
      else hidePiece();
    } else {
      for (const sprite of [...boardSprites, ...nextSprites]) sprite.active = false;
      hidePiece();
    }

    drawHud();
  }

  // ── Game State ──
  let state: GameState = 'title';
  let score = 0;
  let level = 1;
  let lines = 0;
  let currentPiece = 0;
  let currentRot = 0;
  let currentX = 3;
  let currentY = 0;
  let nextPiece = 0;
  let dropTimer = 0;
  let dasTimer = 0;
  let dasDir = 0;
  let lockTimer = 0;
  let linesUntilLevel = 10;
  let melodyPlaying = false;

  const bag: number[] = [];
  function nextFromBag(): number {
    if (bag.length === 0) {
      for (let i = 0; i < 7; i++) bag.push(i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop()!;
  }

  function getDropSpeed(): number {
    const speeds = [0.8, 0.72, 0.63, 0.55, 0.47, 0.38, 0.3, 0.22, 0.13, 0.1, 0.08, 0.07, 0.06, 0.05, 0.04];
    return speeds[Math.min(level - 1, speeds.length - 1)];
  }

  function canPlace(piece: number, rot: number, px: number, py: number): boolean {
    const cells = PIECES[piece][rot % 4];
    for (const [r, c] of cells) {
      const nr = py + r;
      const nc = px + c;
      if (nc < 0 || nc >= COLS || nr >= ROWS) return false;
      if (nr >= 0 && board[nr][nc] !== 0) return false;
    }
    return true;
  }

  function lockPiece() {
    const cells = PIECES[currentPiece][currentRot % 4];
    const shade = PIECE_SHADE[currentPiece] + 1;
    for (const [r, c] of cells) {
      const nr = currentY + r;
      const nc = currentX + c;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        board[nr][nc] = shade;
      }
    }

    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(cell => cell !== 0)) {
        board.splice(r, 1);
        board.unshift(new Array(COLS).fill(0));
        cleared++;
        r++;
      }
    }

    if (cleared > 0) {
      const points = [0, 40, 100, 300, 1200];
      score += points[cleared] * level;
      lines += cleared;
      linesUntilLevel -= cleared;
      if (linesUntilLevel <= 0) { level++; linesUntilLevel += 10; }
      sfxClear.play(cleared === 4 ? 600 : 400, 'pulse50', 0.4);
      setTimeout(() => sfxClear.stop(), cleared === 4 ? 300 : 150);
      if (cleared === 4) engine.shake(3, 0.2);
    } else {
      sfxDrop.play(150, 'noise', 0.15);
      setTimeout(() => sfxDrop.stop(), 40);
    }

    spawnPiece();
  }

  function spawnPiece() {
    currentPiece = nextPiece;
    nextPiece = nextFromBag();
    currentRot = 0;
    currentX = 3;
    currentY = 0;
    dropTimer = 0;
    lockTimer = 0;
    if (!canPlace(currentPiece, currentRot, currentX, currentY)) {
      state = 'gameover';
      engine.shake(5, 0.4);
    }
  }

  function hardDrop() {
    while (canPlace(currentPiece, currentRot, currentX, currentY + 1)) {
      currentY++;
      score += 2;
    }
    lockPiece();
    sfxDrop.play(200, 'noise', 0.3);
    setTimeout(() => sfxDrop.stop(), 60);
    engine.shake(2, 0.1);
  }

  function getGhostY(): number {
    let gy = currentY;
    while (canPlace(currentPiece, currentRot, currentX, gy + 1)) gy++;
    return gy;
  }

  function resetGame() {
    for (let r = 0; r < ROWS; r++) board[r].fill(0);
    score = 0; level = 1; lines = 0; linesUntilLevel = 10;
    bag.length = 0;
    nextPiece = nextFromBag();
    spawnPiece();
    dropTimer = 0; dasTimer = 0; dasDir = 0;
  }

  // ── Melody (Type A — Korobeiniki) on channel 0 ──
  async function playMelody() {
    melodyPlaying = true;
    const melody: [string, number][] = [
      ['E5', 200], ['B4', 100], ['C5', 100], ['D5', 200], ['C5', 100], ['B4', 100],
      ['A4', 200], ['A4', 100], ['C5', 100], ['E5', 200], ['D5', 100], ['C5', 100],
      ['B4', 300], ['C5', 100], ['D5', 200], ['E5', 200],
      ['C5', 200], ['A4', 200], ['A4', 400],
      ['REST', 100],
      ['D5', 200], ['F5', 100], ['A5', 200], ['G5', 100], ['F5', 100],
      ['E5', 300], ['C5', 100], ['E5', 200], ['D5', 100], ['C5', 100],
      ['B4', 200], ['B4', 100], ['C5', 100], ['D5', 200], ['E5', 200],
      ['C5', 200], ['A4', 200], ['A4', 400],
    ];
    while (state === 'playing' && melodyPlaying) {
      for (const [note, dur] of melody) {
        if (state !== 'playing' || !melodyPlaying) break;
        if (note === 'REST') { melodyChannel.stop(); }
        else { melodyChannel.play(note, 'pulse25', 0.2); }
        await new Promise(r => setTimeout(r, dur));
      }
    }
    melodyChannel.stop();
  }

  // ── Background color ──
  engine.setBgColor(0x0f, 0x38, 0x0f);

  // ── Initial state ──
  nextPiece = nextFromBag();
  render();

  // ── Game Loop ──────────────────────────────────────────────────────
  engine.loop((dt) => {
    const input = engine.input;
    scene.update(dt);

    if (state === 'title') {
      if (input.justPressed(0, 'start')) {
        state = 'playing';
        resetGame();
        playMelody();
      }
      render();
      return;
    }

    if (state === 'gameover') {
      melodyPlaying = false;
      if (input.justPressed(0, 'start')) {
        state = 'playing';
        resetGame();
        playMelody();
      }
      render();
      return;
    }

    // ─ Playing ─
    if (input.justPressed(0, 'left')) {
      if (canPlace(currentPiece, currentRot, currentX - 1, currentY)) {
        currentX--;
        sfxMove.play(300, 'pulse25', 0.08);
        setTimeout(() => sfxMove.stop(), 20);
      }
      dasDir = -1; dasTimer = 0.17;
    } else if (input.justPressed(0, 'right')) {
      if (canPlace(currentPiece, currentRot, currentX + 1, currentY)) {
        currentX++;
        sfxMove.play(300, 'pulse25', 0.08);
        setTimeout(() => sfxMove.stop(), 20);
      }
      dasDir = 1; dasTimer = 0.17;
    }

    if (dasDir !== 0 && input.held(0, dasDir === -1 ? 'left' : 'right')) {
      dasTimer -= dt;
      if (dasTimer <= 0) {
        if (canPlace(currentPiece, currentRot, currentX + dasDir, currentY)) currentX += dasDir;
        dasTimer = 0.05;
      }
    } else { dasDir = 0; }

    // Rotate (Up arrow)
    if (input.justPressed(0, 'up')) {
      const newRot = (currentRot + 1) % 4;
      if (canPlace(currentPiece, newRot, currentX, currentY)) {
        currentRot = newRot;
      } else if (canPlace(currentPiece, newRot, currentX - 1, currentY)) {
        currentX--; currentRot = newRot;
      } else if (canPlace(currentPiece, newRot, currentX + 1, currentY)) {
        currentX++; currentRot = newRot;
      }
      if (currentRot === newRot) {
        sfxRotate.play(500, 'pulse25', 0.1);
        setTimeout(() => sfxRotate.stop(), 25);
      }
    }

    // Hard drop (Z key = button 'a')
    if (input.justPressed(0, 'a')) { hardDrop(); }

    // Soft drop
    const softDrop = input.held(0, 'down');
    const speed = softDrop ? 0.03 : getDropSpeed();

    dropTimer += dt;
    if (dropTimer >= speed) {
      dropTimer = 0;
      if (canPlace(currentPiece, currentRot, currentX, currentY + 1)) {
        currentY++;
        if (softDrop) score += 1;
        lockTimer = 0;
      } else {
        lockTimer += speed;
        if (lockTimer >= 0.5) lockPiece();
      }
    }

    if (!canPlace(currentPiece, currentRot, currentX, currentY + 1)) {
      lockTimer += dt;
      if (lockTimer >= 0.5) lockPiece();
    }

    render();
  });
}

init();
