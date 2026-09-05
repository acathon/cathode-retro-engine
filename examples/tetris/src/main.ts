import { Cathode, SoundChannel } from '@cathode/sdk';

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

// ─── Canvas drawing helpers ──────────────────────────────────────────
function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, shade: number) {
  const base = GB_COLORS[shade];
  const light = shade > 0 ? GB_COLORS[shade - 1] : '#c6de78';
  const dark = shade < 3 ? GB_COLORS[shade + 1] : '#052005';
  ctx.fillStyle = base; ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = light; ctx.fillRect(x, y, CELL, 1); ctx.fillRect(x, y, 1, CELL);
  ctx.fillStyle = dark; ctx.fillRect(x, y + 6, CELL, 1); ctx.fillRect(x + 6, y, 1, CELL);
  ctx.fillStyle = base; ctx.fillRect(x + 1, y + 1, 5, 5);
  ctx.fillStyle = light; ctx.fillRect(x + 2, y + 2, 2, 2);
}

function drawFrameBlock(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = GB_COLORS[3]; ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = GB_COLORS[2]; ctx.fillRect(x + 1, y + 1, 5, 5);
}

function drawGhostBlock(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = GB_COLORS[3]; ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = GB_COLORS[2]; ctx.fillRect(x + 1, y + 1, 5, 5);
}

// ─── Init ────────────────────────────────────────────────────────────
async function init() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const engine = await Cathode.gameboy(canvas, 3);

  // Overlay canvas where we draw everything (bypasses WASM sprite limit)
  const hudCanvas = document.getElementById('hud') as HTMLCanvasElement;
  const scale = 3;
  hudCanvas.width = W;
  hudCanvas.height = H;
  hudCanvas.style.width = `${W * scale}px`;
  hudCanvas.style.height = `${H * scale}px`;
  const ctx = hudCanvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  // Sound channels (Game Boy has 4: 0-3)
  const sfxMove = new SoundChannel(engine, 1);
  const sfxRotate = new SoundChannel(engine, 2);
  const sfxDrop = new SoundChannel(engine, 3);
  const sfxClear = new SoundChannel(engine, 3);
  const melodyChannel = new SoundChannel(engine, 0);

  // ── Playfield board (0 = empty, 1+ = shade index + 1)
  const board: number[][] = [];
  for (let r = 0; r < ROWS; r++) board.push(new Array(COLS).fill(0));

  // ── Drawing ──
  function drawBorders() {
    // Left border
    for (let r = 0; r < ROWS; r++) drawFrameBlock(ctx, BOARD_X - CELL, BOARD_Y + r * CELL);
    // Right border
    for (let r = 0; r < ROWS; r++) drawFrameBlock(ctx, BOARD_X + COLS * CELL, BOARD_Y + r * CELL);
    // Bottom border
    for (let c = -1; c <= COLS; c++) drawFrameBlock(ctx, BOARD_X + c * CELL, BOARD_Y + ROWS * CELL);

    // Next piece box
    for (let i = 0; i < 6; i++) {
      drawFrameBlock(ctx, NEXT_X - CELL + i * CELL, NEXT_Y - CELL);
      drawFrameBlock(ctx, NEXT_X - CELL + i * CELL, NEXT_Y + 4 * CELL);
    }
    for (let r = 0; r < 4; r++) {
      drawFrameBlock(ctx, NEXT_X - CELL, NEXT_Y + r * CELL);
      drawFrameBlock(ctx, NEXT_X + 4 * CELL, NEXT_Y + r * CELL);
    }
  }

  function drawBoard() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] !== 0) {
          drawBlock(ctx, BOARD_X + c * CELL, BOARD_Y + r * CELL, board[r][c] - 1);
        }
      }
    }
  }

  function drawPiece() {
    if (state !== 'playing') return;
    const cells = PIECES[currentPiece][currentRot % 4];

    // Ghost
    const ghostY = getGhostY();
    for (const [r, col] of cells) {
      const gr = ghostY + r;
      if (gr >= 0) drawGhostBlock(ctx, BOARD_X + (currentX + col) * CELL, BOARD_Y + gr * CELL);
    }

    // Current piece (drawn after ghost so it overlaps)
    for (const [r, col] of cells) {
      const nr = currentY + r;
      if (nr >= 0) drawBlock(ctx, BOARD_X + (currentX + col) * CELL, BOARD_Y + nr * CELL, PIECE_SHADE[currentPiece]);
    }
  }

  function drawNextPiece() {
    const cells = PIECES[nextPiece][0];
    for (const [r, c] of cells) {
      drawBlock(ctx, NEXT_X + c * CELL, NEXT_Y + r * CELL, PIECE_SHADE[nextPiece]);
    }
  }

  function drawHud() {
    if (state === 'title') {
      ctx.fillStyle = GB_COLORS[0];
      ctx.font = 'bold 12px monospace';
      ctx.fillText('TETRIS', 52, 50);
      ctx.font = '7px monospace';
      ctx.fillStyle = GB_COLORS[1];
      ctx.fillText('Press ENTER', 44, 80);
      ctx.fillStyle = GB_COLORS[2];
      ctx.font = '6px monospace';
      ctx.fillText('\u2190 \u2192 Move  \u2191 Rotate', 28, 100);
      ctx.fillText('\u2193 Drop  Z Hard Drop', 28, 110);
    } else {
      ctx.fillStyle = GB_COLORS[1]; ctx.font = '6px monospace';
      ctx.fillText('SCORE', TEXT_X, NEXT_Y + 48);
      ctx.fillStyle = GB_COLORS[0]; ctx.font = '7px monospace';
      ctx.fillText(String(score), TEXT_X, NEXT_Y + 58);

      ctx.fillStyle = GB_COLORS[1]; ctx.font = '6px monospace';
      ctx.fillText('LEVEL', TEXT_X, NEXT_Y + 74);
      ctx.fillStyle = GB_COLORS[0]; ctx.font = '7px monospace';
      ctx.fillText(String(level), TEXT_X, NEXT_Y + 84);

      ctx.fillStyle = GB_COLORS[1]; ctx.font = '6px monospace';
      ctx.fillText('LINES', TEXT_X, NEXT_Y + 100);
      ctx.fillStyle = GB_COLORS[0]; ctx.font = '7px monospace';
      ctx.fillText(String(lines), TEXT_X, NEXT_Y + 110);

      ctx.fillStyle = GB_COLORS[1]; ctx.font = '6px monospace';
      ctx.fillText('NEXT', NEXT_X + 2, NEXT_Y - 10);

      if (state === 'gameover') {
        ctx.fillStyle = 'rgba(15,56,15,0.85)';
        ctx.fillRect(20, 60, 120, 24);
        ctx.fillStyle = GB_COLORS[0]; ctx.font = 'bold 9px monospace';
        ctx.fillText('GAME OVER', 42, 75);
        ctx.font = '6px monospace'; ctx.fillStyle = GB_COLORS[1];
        ctx.fillText('Press ENTER', 48, 84);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (state !== 'title') {
      drawBorders();
      drawBoard();
      drawPiece();
      drawNextPiece();
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
