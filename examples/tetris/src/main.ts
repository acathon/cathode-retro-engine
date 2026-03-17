import { RetroEngine, Scene, Sprite, SoundChannel, NOTE } from '@retro-engine/sdk';

// ─── Constants ───────────────────────────────────────────────────────
const W = 160;
const H = 144;

// Playfield is 10 wide × 20 tall, each cell = 7×7 px
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
// Each piece = array of rotation states, each state = array of [row, col] offsets
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

// Shade index for each piece (0=lightest, 3=darkest in GB palette)
const PIECE_SHADE = [1, 0, 2, 1, 2, 0, 2];

type GameState = 'title' | 'playing' | 'gameover';

// ─── Sprite Sheet Helpers ────────────────────────────────────────────
function makeSheet(
  engine: RetroEngine, tw: number, th: number,
  draw: (ctx: CanvasRenderingContext2D, i: number) => void, count: number,
): number {
  const w = tw * count, h = th;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < count; i++) {
    ctx.save(); ctx.translate(i * tw, 0); draw(ctx, i); ctx.restore();
  }
  const data = ctx.getImageData(0, 0, w, h);
  return engine.raw!.upload_sheet(w, h, tw, th, new Uint8Array(data.data.buffer));
}

function rect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) {
  c.fillStyle = col; c.fillRect(x, y, w, h);
}

// Block tile (7×7): 4 shades matching Game Boy green palette
function drawBlockTile(ctx: CanvasRenderingContext2D, shade: number) {
  const base = GB_COLORS[shade];
  const light = shade > 0 ? GB_COLORS[shade - 1] : '#c6de78';
  const dark = shade < 3 ? GB_COLORS[shade + 1] : '#052005';

  rect(ctx, 0, 0, 7, 7, base);
  // Highlight top-left edges
  rect(ctx, 0, 0, 7, 1, light);
  rect(ctx, 0, 0, 1, 7, light);
  // Shadow bottom-right edges
  rect(ctx, 0, 6, 7, 1, dark);
  rect(ctx, 6, 0, 1, 7, dark);
  // Inner bevel
  rect(ctx, 1, 1, 5, 5, base);
  ctx.fillStyle = light; ctx.fillRect(2, 2, 2, 2); // tiny specular
}

// Border/frame tile (7×7)
function drawFrameTile(ctx: CanvasRenderingContext2D, _i: number) {
  rect(ctx, 0, 0, 7, 7, GB_COLORS[3]);
  rect(ctx, 1, 1, 5, 5, GB_COLORS[2]);
}

// Font tile (4×6): digits 0-9, 'S','C','O','R','E','L','V','N','X','T',' ',':'
// We'll use sprites placed manually instead of a tilemap font
// But for simplicity, render text on a canvas overlay sprite

// ─── Init ────────────────────────────────────────────────────────────
async function init() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;

  const engine = await RetroEngine.gameboy(canvas, 4);
  const scene = new Scene(engine);

  // Sheets: 4 block shades + 1 frame + 1 empty
  const blockSheet = makeSheet(engine, 7, 7, (ctx, i) => {
    if (i < 4) drawBlockTile(ctx, i);
    else if (i === 4) drawFrameTile(ctx, i);
    // i === 5 → empty (transparent)
  }, 6);

  // HUD text overlay sheet: a 1-pixel white tile for drawing text via sprites
  const hudSheet = makeSheet(engine, W, H, (ctx, _i) => {
    // We'll use this as a canvas to draw all text at once, updated each frame
  }, 1);

  // Sound channels
  const sfxMove = new SoundChannel(engine, 0);
  const sfxRotate = new SoundChannel(engine, 1);
  const sfxDrop = new SoundChannel(engine, 2);
  const sfxClear = new SoundChannel(engine, 3);

  // ── Playfield board (0 = empty, 1-7 = piece type shade index + 1)
  const board: number[][] = [];
  for (let r = 0; r < ROWS; r++) board.push(new Array(COLS).fill(0));

  // Block sprites on screen (reusable pool)
  const blockSprites: Sprite[] = [];
  function getBlockSprite(idx: number): Sprite {
    while (blockSprites.length <= idx) {
      blockSprites.push(new Sprite(scene, { x: -20, y: -20, sheet: blockSheet, frame: 5, layer: 10 }));
    }
    return blockSprites[idx];
  }

  // Frame border sprites
  const framePieces: Sprite[] = [];
  // Left border
  for (let r = 0; r < ROWS; r++) {
    framePieces.push(new Sprite(scene, { x: BOARD_X - 7, y: BOARD_Y + r * CELL, sheet: blockSheet, frame: 4, layer: 5 }));
  }
  // Right border
  for (let r = 0; r < ROWS; r++) {
    framePieces.push(new Sprite(scene, { x: BOARD_X + COLS * CELL, y: BOARD_Y + r * CELL, sheet: blockSheet, frame: 4, layer: 5 }));
  }
  // Bottom border
  for (let c = -1; c <= COLS; c++) {
    framePieces.push(new Sprite(scene, { x: BOARD_X + c * CELL, y: BOARD_Y + ROWS * CELL, sheet: blockSheet, frame: 4, layer: 5 }));
  }

  // Next piece box frame
  for (let i = 0; i < 6; i++) {
    framePieces.push(new Sprite(scene, { x: NEXT_X - 7 + i * CELL, y: NEXT_Y - 7, sheet: blockSheet, frame: 4, layer: 5 }));
    framePieces.push(new Sprite(scene, { x: NEXT_X - 7 + i * CELL, y: NEXT_Y + 4 * CELL, sheet: blockSheet, frame: 4, layer: 5 }));
  }
  for (let r = 0; r < 4; r++) {
    framePieces.push(new Sprite(scene, { x: NEXT_X - 7, y: NEXT_Y + r * CELL, sheet: blockSheet, frame: 4, layer: 5 }));
    framePieces.push(new Sprite(scene, { x: NEXT_X + 4 * CELL, y: NEXT_Y + r * CELL, sheet: blockSheet, frame: 4, layer: 5 }));
  }

  // HUD overlay sprite (for text rendering)
  const hudSprite = new Sprite(scene, { x: 0, y: 0, sheet: hudSheet, frame: 0, layer: 30 });

  function updateHudTexture() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.font = '8px monospace';

    if (state === 'title') {
      ctx.fillStyle = GB_COLORS[0];
      ctx.font = 'bold 12px monospace';
      ctx.fillText('TETRIS', 52, 50);
      ctx.font = '7px monospace';
      ctx.fillStyle = GB_COLORS[1];
      ctx.fillText('Press ENTER', 44, 80);
      ctx.fillStyle = GB_COLORS[2];
      ctx.font = '6px monospace';
      ctx.fillText('← → Move  ↑ Rotate', 28, 100);
      ctx.fillText('↓ Drop  Z Hard Drop', 28, 110);
    } else {
      // Score
      ctx.fillStyle = GB_COLORS[1];
      ctx.font = '6px monospace';
      ctx.fillText('SCORE', TEXT_X, NEXT_Y + 48);
      ctx.fillStyle = GB_COLORS[0];
      ctx.font = '7px monospace';
      ctx.fillText(String(score), TEXT_X, NEXT_Y + 58);

      // Level
      ctx.fillStyle = GB_COLORS[1];
      ctx.font = '6px monospace';
      ctx.fillText('LEVEL', TEXT_X, NEXT_Y + 74);
      ctx.fillStyle = GB_COLORS[0];
      ctx.font = '7px monospace';
      ctx.fillText(String(level), TEXT_X, NEXT_Y + 84);

      // Lines
      ctx.fillStyle = GB_COLORS[1];
      ctx.font = '6px monospace';
      ctx.fillText('LINES', TEXT_X, NEXT_Y + 100);
      ctx.fillStyle = GB_COLORS[0];
      ctx.font = '7px monospace';
      ctx.fillText(String(lines), TEXT_X, NEXT_Y + 110);

      // NEXT label
      ctx.fillStyle = GB_COLORS[1];
      ctx.font = '6px monospace';
      ctx.fillText('NEXT', NEXT_X + 2, NEXT_Y - 10);

      if (state === 'gameover') {
        ctx.fillStyle = GB_COLORS[3];
        rect(ctx, 20, 60, 120, 24, 'rgba(15,56,15,0.85)');
        ctx.fillStyle = GB_COLORS[0];
        ctx.font = 'bold 9px monospace';
        ctx.fillText('GAME OVER', 42, 75);
        ctx.font = '6px monospace';
        ctx.fillStyle = GB_COLORS[1];
        ctx.fillText('Press ENTER', 48, 84);
      }
    }

    // Upload as new sheet
    const imgData = ctx.getImageData(0, 0, W, H);
    engine.raw!.upload_sheet(W, H, W, H, new Uint8Array(imgData.data.buffer));
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
      // 7-bag randomizer
      for (let i = 0; i < 7; i++) bag.push(i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop()!;
  }

  function getDropSpeed(): number {
    // Classic Game Boy speeds (frames → seconds at 60fps)
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
    const shade = PIECE_SHADE[currentPiece] + 1; // +1 because 0 = empty
    for (const [r, c] of cells) {
      const nr = currentY + r;
      const nc = currentX + c;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        board[nr][nc] = shade;
      }
    }

    // Check for line clears
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(cell => cell !== 0)) {
        board.splice(r, 1);
        board.unshift(new Array(COLS).fill(0));
        cleared++;
        r++; // re-check this row
      }
    }

    if (cleared > 0) {
      // Scoring: original Game Boy scoring
      const points = [0, 40, 100, 300, 1200];
      score += points[cleared] * level;
      lines += cleared;
      linesUntilLevel -= cleared;
      if (linesUntilLevel <= 0) {
        level++;
        linesUntilLevel += 10;
      }
      sfxClear.play(cleared === 4 ? 600 : 400, 'pulse50', 0.4);
      setTimeout(() => sfxClear.stop(), cleared === 4 ? 300 : 150);
      if (cleared === 4) engine.shake(3, 0.2); // Tetris!
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

  // ── Melody (Type A — Korobeiniki) ──
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
    const ch = new SoundChannel(engine, 0);
    while (state === 'playing' && melodyPlaying) {
      for (const [note, dur] of melody) {
        if (state !== 'playing' || !melodyPlaying) break;
        if (note === 'REST') { ch.stop(); }
        else { ch.play(note, 'pulse25', 0.2); }
        await new Promise(r => setTimeout(r, dur));
      }
    }
    ch.stop();
  }

  // ── Render board + piece to sprites ──
  function renderBoard() {
    let sprIdx = 0;

    // Draw locked blocks
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] !== 0) {
          const s = getBlockSprite(sprIdx++);
          s.x = BOARD_X + c * CELL;
          s.y = BOARD_Y + r * CELL;
          s.frame = board[r][c] - 1; // shade 0-3
        }
      }
    }

    // Draw ghost piece
    if (state === 'playing') {
      const ghostY = getGhostY();
      const cells = PIECES[currentPiece][currentRot % 4];
      for (const [r, col] of cells) {
        const gr = ghostY + r;
        if (gr >= 0) {
          const s = getBlockSprite(sprIdx++);
          s.x = BOARD_X + (currentX + col) * CELL;
          s.y = BOARD_Y + gr * CELL;
          s.frame = 4; // frame tile for ghost
        }
      }

      // Draw current piece
      for (const [r, col] of cells) {
        const nr = currentY + r;
        if (nr >= 0) {
          const s = getBlockSprite(sprIdx++);
          s.x = BOARD_X + (currentX + col) * CELL;
          s.y = BOARD_Y + nr * CELL;
          s.frame = PIECE_SHADE[currentPiece];
        }
      }
    }

    // Draw next piece in preview box
    const nextCells = PIECES[nextPiece][0];
    for (const [r, c] of nextCells) {
      const s = getBlockSprite(sprIdx++);
      s.x = NEXT_X + c * CELL;
      s.y = NEXT_Y + r * CELL;
      s.frame = PIECE_SHADE[nextPiece];
    }

    // Hide unused sprites
    for (let i = sprIdx; i < blockSprites.length; i++) {
      blockSprites[i].x = -20;
      blockSprites[i].y = -20;
    }
  }

  // ── Background color ──
  engine.setBgColor(0x0f, 0x38, 0x0f); // GB darkest green

  // ── Initial state ──
  nextPiece = nextFromBag();
  updateHudTexture();

  // ── Game Loop ──────────────────────────────────────────────────────
  engine.loop((dt) => {
    const input = engine.input;

    // ─ Title ─
    if (state === 'title') {
      if (input.justPressed(0, 'start') || input.justPressed(0, 'a')) {
        state = 'playing';
        resetGame();
        playMelody();
      }
      updateHudTexture();
      renderBoard();
      scene.update(dt);
      return;
    }

    // ─ Game Over ─
    if (state === 'gameover') {
      melodyPlaying = false;
      if (input.justPressed(0, 'start')) {
        state = 'playing';
        resetGame();
        playMelody();
      }
      updateHudTexture();
      renderBoard();
      scene.update(dt);
      return;
    }

    // ─ Playing ─

    // Move left/right with DAS (Delayed Auto Shift)
    if (input.justPressed(0, 'left')) {
      if (canPlace(currentPiece, currentRot, currentX - 1, currentY)) {
        currentX--;
        sfxMove.play(300, 'pulse25', 0.08);
        setTimeout(() => sfxMove.stop(), 20);
      }
      dasDir = -1;
      dasTimer = 0.17; // initial delay
    } else if (input.justPressed(0, 'right')) {
      if (canPlace(currentPiece, currentRot, currentX + 1, currentY)) {
        currentX++;
        sfxMove.play(300, 'pulse25', 0.08);
        setTimeout(() => sfxMove.stop(), 20);
      }
      dasDir = 1;
      dasTimer = 0.17;
    }

    // DAS repeat
    if (dasDir !== 0 && input.held(0, dasDir === -1 ? 'left' : 'right')) {
      dasTimer -= dt;
      if (dasTimer <= 0) {
        if (canPlace(currentPiece, currentRot, currentX + dasDir, currentY)) {
          currentX += dasDir;
        }
        dasTimer = 0.05; // repeat rate
      }
    } else {
      dasDir = 0;
    }

    // Rotate
    if (input.justPressed(0, 'up') || input.justPressed(0, 'a')) {
      const newRot = (currentRot + 1) % 4;
      if (canPlace(currentPiece, newRot, currentX, currentY)) {
        currentRot = newRot;
        sfxRotate.play(500, 'pulse25', 0.1);
        setTimeout(() => sfxRotate.stop(), 25);
      } else if (canPlace(currentPiece, newRot, currentX - 1, currentY)) {
        // Wall kick left
        currentX--;
        currentRot = newRot;
        sfxRotate.play(500, 'pulse25', 0.1);
        setTimeout(() => sfxRotate.stop(), 25);
      } else if (canPlace(currentPiece, newRot, currentX + 1, currentY)) {
        // Wall kick right
        currentX++;
        currentRot = newRot;
        sfxRotate.play(500, 'pulse25', 0.1);
        setTimeout(() => sfxRotate.stop(), 25);
      }
    }

    // Hard drop (Z / button a)
    if (input.justPressed(0, 'b')) {
      hardDrop();
    }

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
        if (lockTimer >= 0.5) {
          lockPiece();
        }
      }
    }

    // Also lock if sitting on surface for too long
    if (!canPlace(currentPiece, currentRot, currentX, currentY + 1)) {
      lockTimer += dt;
      if (lockTimer >= 0.5) {
        lockPiece();
      }
    }

    updateHudTexture();
    renderBoard();
    scene.update(dt);
  });
}

init();
