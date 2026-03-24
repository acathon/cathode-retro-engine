import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

type TemplateName = 'default' | 'platformer' | 'shmup' | 'puzzle' | 'rpg' | 'doom';

const TEMPLATES: Record<TemplateName, { resolution: { width: number; height: number }; main: string }> = {
  default: {
    resolution: { width: 160, height: 144 },
    main: `import { RetroEngine, Scene, Sprite, SoundChannel } from '@retro-engine/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;

async function bootstrap() {
  const engine = await RetroEngine.gameboy(canvas);
  const scene = new Scene(engine);

  engine.loop((dt) => {
    scene.update(dt);
  });
}

bootstrap();
`,
  },
  platformer: {
    resolution: { width: 256, height: 240 },
    main: `import {
  RetroEngine, Scene, Sprite, SoundChannel,
  BitmapFont, StateMachine, GameTimer, ParticleEmitter,
} from '@retro-engine/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;

async function bootstrap() {
  const engine = await RetroEngine.nes(canvas, 2);
  const scene = new Scene(engine);
  const font = BitmapFont.builtin(engine);
  const sfx = new SoundChannel(engine, 0);

  // Procedural 8x8 sprite sheet: frame 0 = player, frame 1 = ground, frame 2 = coin
  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = 24; sheetCanvas.height = 8;
  const sctx = sheetCanvas.getContext('2d')!;
  // Player (blue square with eyes)
  sctx.fillStyle = '#3366ff'; sctx.fillRect(0, 0, 8, 8);
  sctx.fillStyle = '#fff'; sctx.fillRect(1, 2, 2, 2); sctx.fillRect(5, 2, 2, 2);
  // Ground tile (brown)
  sctx.fillStyle = '#8B4513'; sctx.fillRect(8, 0, 8, 8);
  sctx.fillStyle = '#654321'; sctx.fillRect(8, 0, 8, 2);
  // Coin (yellow circle)
  sctx.fillStyle = '#FFD700'; sctx.fillRect(18, 2, 4, 4);
  sctx.fillStyle = '#FFA500'; sctx.fillRect(19, 1, 2, 6);

  const sheet = await engine.loadSheetFromCanvas(sheetCanvas, 8, 8);

  const player = new Sprite(scene, { sheet, frame: 0, x: 40, y: 200, layer: 1 });
  player.setCollider(0, 0, 8, 8, true);

  // Ground tiles
  for (let i = 0; i < 32; i++) {
    const ground = new Sprite(scene, { sheet, frame: 1, x: i * 8, y: 232, layer: 0 });
    ground.setCollider(0, 0, 8, 8, true);
  }

  // Platforms
  const platformPositions = [[48, 200], [80, 180], [120, 160], [160, 180], [200, 200]];
  for (const [px, py] of platformPositions) {
    for (let i = 0; i < 4; i++) {
      const plat = new Sprite(scene, { sheet, frame: 1, x: px + i * 8, y: py, layer: 0 });
      plat.setCollider(0, 0, 8, 8, true);
    }
  }

  // Coins
  let score = 0;
  const coins: Sprite[] = [];
  const coinPositions = [[60, 190], [96, 170], [136, 150], [176, 170]];
  for (const [cx, cy] of coinPositions) {
    const coin = new Sprite(scene, { sheet, frame: 2, x: cx, y: cy, layer: 1 });
    coin.setCollider(0, 0, 8, 8, false);
    coins.push(coin);
  }

  let velY = 0;
  const GRAVITY = 400;
  const JUMP_VEL = -180;
  const MOVE_SPEED = 80;
  let grounded = false;

  type PState = 'idle' | 'walk' | 'jump';
  const fsm = new StateMachine<PState>([
    {
      name: 'idle',
      onUpdate: (dt) => {
        if (engine.input.held(0, 'left') || engine.input.held(0, 'right')) fsm.transition('walk');
        if (engine.input.justPressed(0, 'a') && grounded) fsm.transition('jump');
      },
    },
    {
      name: 'walk',
      onUpdate: (dt) => {
        if (engine.input.held(0, 'left')) player.x -= MOVE_SPEED * dt;
        if (engine.input.held(0, 'right')) player.x += MOVE_SPEED * dt;
        if (!engine.input.held(0, 'left') && !engine.input.held(0, 'right')) fsm.transition('idle');
        if (engine.input.justPressed(0, 'a') && grounded) fsm.transition('jump');
      },
    },
    {
      name: 'jump',
      onEnter: () => { velY = JUMP_VEL; grounded = false; sfx.play(440, 'square', 0.3); },
      onUpdate: (dt) => {
        if (engine.input.held(0, 'left')) player.x -= MOVE_SPEED * dt;
        if (engine.input.held(0, 'right')) player.x += MOVE_SPEED * dt;
        if (grounded) fsm.transition('idle');
      },
    },
  ], 'idle');

  scene.follow(player);

  engine.loop((dt) => {
    fsm.update(dt);

    // Gravity
    velY += GRAVITY * dt;
    player.y += velY * dt;

    // Simple ground collision on bottom of screen
    if (player.y >= 224) { player.y = 224; velY = 0; grounded = true; }

    // Coin collection
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      if (Math.abs(player.x - c.x) < 8 && Math.abs(player.y - c.y) < 8) {
        ParticleEmitter.coin(scene, c.x + 4, c.y + 4);
        c.destroy();
        coins.splice(i, 1);
        score += 100;
        sfx.play(880, 'square', 0.4);
      }
    }

    scene.update(dt);
    font.draw(\`SCORE:\${score}\`, 4, 4, 1);
  });
}

bootstrap();
`,
  },
  shmup: {
    resolution: { width: 256, height: 240 },
    main: `import {
  RetroEngine, Scene, Sprite, SoundChannel,
  BitmapFont, GameTimer, ParticleEmitter,
} from '@retro-engine/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;

async function bootstrap() {
  const engine = await RetroEngine.nes(canvas, 2);
  const scene = new Scene(engine);
  const font = BitmapFont.builtin(engine);
  const sfxShoot = new SoundChannel(engine, 0);
  const sfxExplode = new SoundChannel(engine, 1);

  // Procedural sheet: 0=player, 1=bullet, 2=enemy
  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = 24; sheetCanvas.height = 8;
  const sctx = sheetCanvas.getContext('2d')!;
  // Player ship (green triangle)
  sctx.fillStyle = '#00ff66';
  sctx.beginPath(); sctx.moveTo(4, 0); sctx.lineTo(0, 7); sctx.lineTo(7, 7); sctx.fill();
  // Bullet (yellow dot)
  sctx.fillStyle = '#ffff00'; sctx.fillRect(11, 2, 2, 4);
  // Enemy (red diamond)
  sctx.fillStyle = '#ff3333';
  sctx.beginPath(); sctx.moveTo(20, 0); sctx.lineTo(16, 4); sctx.lineTo(20, 7); sctx.lineTo(23, 4); sctx.fill();

  const sheet = await engine.loadSheetFromCanvas(sheetCanvas, 8, 8);

  const player = new Sprite(scene, { sheet, frame: 0, x: 124, y: 220, layer: 1 });
  const SPEED = 120;
  let score = 0;
  let wave = 1;

  const bullets: Sprite[] = [];
  const enemies: Sprite[] = [];

  const spawnTimer = new GameTimer(engine, 1.5, { repeat: true, autoStart: true });
  spawnTimer.onFire(() => {
    const count = Math.min(wave + 2, 10);
    for (let i = 0; i < count; i++) {
      const ex = 16 + Math.floor(Math.random() * 224);
      const e = new Sprite(scene, { sheet, frame: 2, x: ex, y: -8, layer: 1 });
      (e as any)._velY = 40 + wave * 10;
      enemies.push(e);
    }
    wave++;
  });

  engine.loop((dt) => {
    // Player movement
    if (engine.input.held(0, 'left')) player.x -= SPEED * dt;
    if (engine.input.held(0, 'right')) player.x += SPEED * dt;
    if (engine.input.held(0, 'up')) player.y -= SPEED * dt;
    if (engine.input.held(0, 'down')) player.y += SPEED * dt;
    player.x = Math.max(0, Math.min(248, player.x));
    player.y = Math.max(0, Math.min(232, player.y));

    // Shoot
    if (engine.input.justPressed(0, 'a')) {
      const b = new Sprite(scene, { sheet, frame: 1, x: player.x + 3, y: player.y - 4, layer: 0 });
      bullets.push(b);
      sfxShoot.play(600, 'noise', 0.2);
    }

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      bullets[i].y -= 300 * dt;
      if (bullets[i].y < -8) { bullets[i].destroy(); bullets.splice(i, 1); }
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      enemies[i].y += ((enemies[i] as any)._velY ?? 50) * dt;
      if (enemies[i].y > 250) { enemies[i].destroy(); enemies.splice(i, 1); continue; }

      // Bullet-enemy collision
      for (let j = bullets.length - 1; j >= 0; j--) {
        if (Math.abs(bullets[j].x - enemies[i].x) < 8 && Math.abs(bullets[j].y - enemies[i].y) < 8) {
          ParticleEmitter.explosion(scene, enemies[i].x + 4, enemies[i].y + 4);
          sfxExplode.play(100, 'noise', 0.5);
          enemies[i].destroy(); enemies.splice(i, 1);
          bullets[j].destroy(); bullets.splice(j, 1);
          score += 50;
          break;
        }
      }
    }

    scene.update(dt);
    font.draw(\`SCORE:\${score}\`, 4, 4, 1);
    font.draw(\`WAVE:\${wave}\`, 200, 4, 1);
  });
}

bootstrap();
`,
  },
  puzzle: {
    resolution: { width: 160, height: 144 },
    main: `import {
  RetroEngine, Scene, Sprite, SoundChannel,
  BitmapFont, GameTimer,
} from '@retro-engine/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;

async function bootstrap() {
  const engine = await RetroEngine.gameboy(canvas, 2);
  const scene = new Scene(engine);
  const font = BitmapFont.builtin(engine);
  const sfx = new SoundChannel(engine, 0);

  // 6x6 grid puzzle, swap gems to match 3
  const COLS = 6, ROWS = 6, TILE = 16, OFFSET_X = 16, OFFSET_Y = 24;
  const COLORS = ['#ff3333', '#33ff33', '#3333ff', '#ffff33', '#ff33ff'];

  // Procedural sheet: 5 colored tiles
  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = COLORS.length * TILE; sheetCanvas.height = TILE;
  const sctx = sheetCanvas.getContext('2d')!;
  for (let i = 0; i < COLORS.length; i++) {
    sctx.fillStyle = COLORS[i]; sctx.fillRect(i * TILE + 1, 1, TILE - 2, TILE - 2);
    sctx.fillStyle = '#000'; sctx.strokeStyle = '#fff'; sctx.lineWidth = 1;
    sctx.strokeRect(i * TILE + 0.5, 0.5, TILE - 1, TILE - 1);
  }
  const sheet = await engine.loadSheetFromCanvas(sheetCanvas, TILE, TILE);

  // Grid state
  const grid: number[][] = [];
  const sprites: (Sprite | null)[][] = [];

  function randGem(): number { return Math.floor(Math.random() * COLORS.length); }

  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    sprites[r] = [];
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = randGem();
      sprites[r][c] = new Sprite(scene, {
        sheet, frame: grid[r][c],
        x: OFFSET_X + c * TILE, y: OFFSET_Y + r * TILE, layer: 0,
      });
    }
  }

  let score = 0;
  let selR = 0, selC = 0;
  let selected = false;
  let selR2 = -1, selC2 = -1;

  function checkMatches(): boolean {
    let found = false;
    const toRemove = new Set<string>();
    // Horizontal
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 2; c++) {
        if (grid[r][c] >= 0 && grid[r][c] === grid[r][c+1] && grid[r][c] === grid[r][c+2]) {
          toRemove.add(\`\${r},\${c}\`); toRemove.add(\`\${r},\${c+1}\`); toRemove.add(\`\${r},\${c+2}\`);
          found = true;
        }
      }
    }
    // Vertical
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS - 2; r++) {
        if (grid[r][c] >= 0 && grid[r][c] === grid[r+1][c] && grid[r][c] === grid[r+2][c]) {
          toRemove.add(\`\${r},\${c}\`); toRemove.add(\`\${r+1},\${c}\`); toRemove.add(\`\${r+2},\${c}\`);
          found = true;
        }
      }
    }
    for (const key of toRemove) {
      const [r, c] = key.split(',').map(Number);
      grid[r][c] = -1;
      sprites[r][c]?.destroy();
      sprites[r][c] = null;
      score += 10;
    }
    return found;
  }

  function dropAndFill(): void {
    for (let c = 0; c < COLS; c++) {
      let empty = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (grid[r][c] >= 0) {
          if (r !== empty) {
            grid[empty][c] = grid[r][c]; grid[r][c] = -1;
            if (sprites[r][c]) {
              sprites[r][c]!.y = OFFSET_Y + empty * TILE;
              sprites[empty][c] = sprites[r][c]; sprites[r][c] = null;
            }
          }
          empty--;
        }
      }
      for (let r = empty; r >= 0; r--) {
        grid[r][c] = randGem();
        sprites[r][c] = new Sprite(scene, {
          sheet, frame: grid[r][c],
          x: OFFSET_X + c * TILE, y: OFFSET_Y + r * TILE, layer: 0,
        });
      }
    }
  }

  function swap(r1: number, c1: number, r2: number, c2: number): void {
    const tmp = grid[r1][c1]; grid[r1][c1] = grid[r2][c2]; grid[r2][c2] = tmp;
    if (sprites[r1][c1]) sprites[r1][c1]!.x = OFFSET_X + c1 * TILE;
    if (sprites[r1][c1]) sprites[r1][c1]!.y = OFFSET_Y + r1 * TILE;
    if (sprites[r2][c2]) sprites[r2][c2]!.x = OFFSET_X + c2 * TILE;
    if (sprites[r2][c2]) sprites[r2][c2]!.y = OFFSET_Y + r2 * TILE;
    const tmpS = sprites[r1][c1]; sprites[r1][c1] = sprites[r2][c2]; sprites[r2][c2] = tmpS;
  }

  // Initial match clear
  while (checkMatches()) { dropAndFill(); }

  engine.loop((dt) => {
    // Cursor movement
    if (engine.input.justPressed(0, 'up')) selR = Math.max(0, selR - 1);
    if (engine.input.justPressed(0, 'down')) selR = Math.min(ROWS - 1, selR + 1);
    if (engine.input.justPressed(0, 'left')) selC = Math.max(0, selC - 1);
    if (engine.input.justPressed(0, 'right')) selC = Math.min(COLS - 1, selC + 1);

    if (engine.input.justPressed(0, 'a')) {
      if (!selected) {
        selected = true; selR2 = selR; selC2 = selC;
        sfx.play(440, 'square', 0.2);
      } else {
        const dr = Math.abs(selR - selR2), dc = Math.abs(selC - selC2);
        if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
          swap(selR2, selC2, selR, selC);
          if (!checkMatches()) {
            swap(selR2, selC2, selR, selC); // swap back
          } else {
            while (true) { dropAndFill(); if (!checkMatches()) break; }
            sfx.play(880, 'square', 0.3);
          }
        }
        selected = false;
      }
    }

    scene.update(dt);

    // Draw cursor
    const cx = OFFSET_X + selC * TILE, cy = OFFSET_Y + selR * TILE;
    engine.raw!.debug_draw_rect(cx - 1, cy - 1, TILE + 2, TILE + 2, 255, 255, 255);
    if (selected) {
      const sx = OFFSET_X + selC2 * TILE, sy = OFFSET_Y + selR2 * TILE;
      engine.raw!.debug_draw_rect(sx - 1, sy - 1, TILE + 2, TILE + 2, 255, 255, 0);
    }

    font.draw(\`SCORE:\${score}\`, 4, 4, 1);
    font.draw('MATCH 3!', 100, 4, 1);
  });
}

bootstrap();
`,
  },
  rpg: {
    resolution: { width: 256, height: 240 },
    main: `import {
  RetroEngine, Scene, Sprite, SoundChannel,
  BitmapFont, TileMap, StateMachine, SaveManager,
} from '@retro-engine/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;

async function bootstrap() {
  const engine = await RetroEngine.nes(canvas, 2);
  const scene = new Scene(engine);
  const font = BitmapFont.builtin(engine);
  const sfx = new SoundChannel(engine, 0);
  const saves = new SaveManager(engine);
  saves.autoload('rpg-save');

  // Procedural sheet: 0=player, 1=grass, 2=wall, 3=npc, 4=chest
  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = 80; sheetCanvas.height = 16;
  const sctx = sheetCanvas.getContext('2d')!;
  // Player (little knight)
  sctx.fillStyle = '#4488ff'; sctx.fillRect(2, 0, 12, 16);
  sctx.fillStyle = '#ffcc88'; sctx.fillRect(4, 1, 8, 6); // head
  sctx.fillStyle = '#333'; sctx.fillRect(5, 3, 2, 2); sctx.fillRect(9, 3, 2, 2); // eyes
  // Grass
  sctx.fillStyle = '#228822'; sctx.fillRect(16, 0, 16, 16);
  sctx.fillStyle = '#33aa33'; sctx.fillRect(18, 4, 3, 2); sctx.fillRect(26, 10, 3, 2);
  // Wall
  sctx.fillStyle = '#666'; sctx.fillRect(32, 0, 16, 16);
  sctx.fillStyle = '#555'; sctx.fillRect(32, 0, 16, 2); sctx.fillRect(40, 8, 8, 2);
  // NPC
  sctx.fillStyle = '#ff6644'; sctx.fillRect(50, 2, 12, 14);
  sctx.fillStyle = '#ffcc88'; sctx.fillRect(52, 3, 8, 6);
  sctx.fillStyle = '#333'; sctx.fillRect(53, 5, 2, 2); sctx.fillRect(57, 5, 2, 2);
  // Chest
  sctx.fillStyle = '#cc8833'; sctx.fillRect(64, 4, 16, 12);
  sctx.fillStyle = '#ffcc00'; sctx.fillRect(70, 8, 4, 4);

  const sheet = await engine.loadSheetFromCanvas(sheetCanvas, 16, 16);

  // 16x15 map (grass=1, wall=2)
  const mapData = [
    2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,
    2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
    2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
    2,1,1,2,2,1,1,1,1,1,2,2,1,1,1,2,
    2,1,1,2,1,1,1,1,1,1,1,2,1,1,1,2,
    2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
    2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
    2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
    2,1,1,2,2,2,1,1,1,2,2,2,1,1,1,2,
    2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
    2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
    2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
    2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
    2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
    2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,
  ];

  const tilemap = new TileMap(engine, {
    layers: [{ data: mapData, cols: 16, rows: 15, tileWidth: 16, tileHeight: 16 }],
    sheet,
  });
  tilemap.setSolidTiles(0, [2]);

  const player = new Sprite(scene, { sheet, frame: 0, x: 32, y: 32, layer: 1 });
  const npc = new Sprite(scene, { sheet, frame: 3, x: 128, y: 80, layer: 1 });
  const chest = new Sprite(scene, { sheet, frame: 4, x: 192, y: 192, layer: 1 });

  let gold = saves.get<number>('gold') ?? 0;
  let chestOpened = saves.get<boolean>('chestOpened') ?? false;
  let showDialog = false;
  let dialogText = '';
  const SPEED = 80;

  const inventory: string[] = saves.get<string[]>('inventory') ?? [];

  scene.follow(player);

  engine.loop((dt) => {
    if (showDialog) {
      if (engine.input.justPressed(0, 'a')) showDialog = false;
    } else {
      let nx = player.x, ny = player.y;
      if (engine.input.held(0, 'up')) ny -= SPEED * dt;
      if (engine.input.held(0, 'down')) ny += SPEED * dt;
      if (engine.input.held(0, 'left')) nx -= SPEED * dt;
      if (engine.input.held(0, 'right')) nx += SPEED * dt;

      // Tile collision
      if (!tilemap.isSolid(0, nx, player.y) && !tilemap.isSolid(0, nx + 15, player.y) &&
          !tilemap.isSolid(0, nx, player.y + 15) && !tilemap.isSolid(0, nx + 15, player.y + 15)) {
        player.x = nx;
      }
      if (!tilemap.isSolid(0, player.x, ny) && !tilemap.isSolid(0, player.x + 15, ny) &&
          !tilemap.isSolid(0, player.x, ny + 15) && !tilemap.isSolid(0, player.x + 15, ny + 15)) {
        player.y = ny;
      }

      // NPC interaction
      if (engine.input.justPressed(0, 'a')) {
        if (Math.abs(player.x - npc.x) < 24 && Math.abs(player.y - npc.y) < 24) {
          showDialog = true;
          dialogText = 'Hello traveler! Find the treasure chest to the south.';
          sfx.play(440, 'triangle', 0.3);
        }
        if (!chestOpened && Math.abs(player.x - chest.x) < 24 && Math.abs(player.y - chest.y) < 24) {
          chestOpened = true;
          gold += 100;
          inventory.push('Gold Key');
          showDialog = true;
          dialogText = 'You found 100 gold and a Gold Key!';
          sfx.play(880, 'square', 0.4);
        }
      }
    }

    scene.update(dt);
    font.draw(\`GOLD:\${gold}\`, 4, 4, 1);
    if (inventory.length > 0) font.draw(\`INV:\${inventory.join(',')}\`, 4, 14, 1);

    if (showDialog) {
      engine.raw!.draw_overlay_rect(0, 0, 0, 150);
      font.draw(dialogText, 8, 200, 1);
      font.draw('[A] to close', 8, 220, 1);
    }

    // Autosave
    saves.set('gold', gold);
    saves.set('chestOpened', chestOpened);
    saves.set('inventory', inventory);
    saves.autosave('rpg-save');
  });
}

bootstrap();
`,
  },
  doom: {
    resolution: { width: 256, height: 240 },
    main: `import {
  RetroEngine, Scene, Raycaster, BitmapFont, SaveManager, SoundChannel,
} from '@retro-engine/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;

function generateBrickTexture(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const brickH = 8, brickW = 16;
      const row = Math.floor(y / brickH);
      const bx = (x + (row % 2) * (brickW / 2)) % brickW;
      const by = y % brickH;
      if (bx === 0 || by === 0) {
        pixels[i] = 80; pixels[i+1] = 80; pixels[i+2] = 80; pixels[i+3] = 255;
      } else {
        const s = 140 + ((x*7 + y*13) % 30);
        pixels[i] = s; pixels[i+1] = s-10; pixels[i+2] = s-10; pixels[i+3] = 255;
      }
    }
  }
  return pixels;
}

function generateWoodTexture(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const base = (x % 8 < 4) ? 120 : 100;
      const n = ((x*17+y*31) % 20) - 10;
      pixels[i] = base+n+20; pixels[i+1] = base+n-10; pixels[i+2] = 30+n; pixels[i+3] = 255;
    }
  }
  return pixels;
}

async function bootstrap() {
  const engine = await RetroEngine.nes(canvas, 2);
  const scene = new Scene(engine);

  const MAP = [
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,2,2,0,0,0,0,0,2,2,0,0,0,1,
    1,0,0,2,0,0,0,0,0,0,0,2,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  ];

  const raycaster = new Raycaster(engine, { cols: 16, rows: 16, cells: MAP });
  raycaster.setTextureFromPixels(1, generateBrickTexture(32), 32);
  raycaster.setTextureFromPixels(2, generateWoodTexture(32), 32);
  raycaster.setFloorColor(40, 40, 40);
  raycaster.setCeilingColor(15, 15, 20);
  raycaster.setFog(10, 0, 0, 0);
  raycaster.setPos(2.5, 2.5, 0);

  const font = BitmapFont.builtin(engine);
  const sfx = new SoundChannel(engine, 0);
  const saves = new SaveManager(engine);
  saves.autoload('doom-save');

  let score = saves.get<number>('score') ?? 0;
  let health = 100;

  const keys: Record<string, boolean> = {};
  window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  engine.loop((dt) => {
    scene.update(dt);
    let fwd = 0, str = 0, trn = 0;
    if (keys['w']) fwd = 1; if (keys['s']) fwd = -1;
    if (keys['a']) str = -1; if (keys['d']) str = 1;
    if (engine.input.held(0, 'left')) trn = -1;
    if (engine.input.held(0, 'right')) trn = 1;
    engine.raw!.raycaster_move(fwd, str, trn);

    if (engine.input.justPressed(0, 'a')) {
      sfx.play(200, 'noise', 0.6);
      score += 10;
      engine.shake(2, 0.1);
    }

    font.draw(\`HP:\${health}\`, 4, 2, 1);
    font.draw(\`SCORE:\${score}\`, engine.width - 80, 2, 1);

    saves.set('score', score);
    saves.autosave('doom-save');
  });
}

bootstrap();
`,
  },
};

export default async function newCommand(name: string, options: { template?: string }) {
  const targetDir = path.resolve(process.cwd(), name);
  const templateName = (options.template ?? 'default') as TemplateName;

  if (!TEMPLATES[templateName]) {
    console.error(chalk.red(`Unknown template: ${templateName}. Available: ${Object.keys(TEMPLATES).join(', ')}`));
    process.exit(1);
  }

  if (fs.existsSync(targetDir)) {
    console.error(chalk.red(`Directory ${name} already exists.`));
    process.exit(1);
  }

  const spinner = ora(`Scaffolding new retro engine project: ${name} (template: ${templateName})`).start();
  const template = TEMPLATES[templateName];

  try {
    await fs.ensureDir(targetDir);
    await fs.ensureDir(path.join(targetDir, 'src'));
    await fs.ensureDir(path.join(targetDir, 'assets', 'sprites'));
    await fs.ensureDir(path.join(targetDir, 'assets', 'maps'));
    await fs.ensureDir(path.join(targetDir, 'assets', 'audio'));

    const pkgJson = {
      name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        "dev": "retro run",
        "build": "retro build"
      },
      dependencies: {
        "@retro-engine/sdk": "latest"
      },
      devDependencies: {
        "typescript": "^5.5.0",
        "vite": "^5.3.0"
      }
    };
    await fs.writeJson(path.join(targetDir, 'package.json'), pkgJson, { spaces: 2 });

    const retroConfig = {
      resolution: template.resolution,
      audioChannels: 4,
      spriteLimit: 40,
      scanlines: false,
      targetFps: 60,
      title: name
    };
    await fs.writeJson(path.join(targetDir, 'retro.config.json'), retroConfig, { spaces: 2 });

    const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <style>
        body { margin: 0; background-color: #0a0a0a; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
        canvas { box-shadow: 0 0 20px rgba(0,0,0,0.8); }
    </style>
</head>
<body>
    <canvas id="game"></canvas>
    <script type="module" src="/src/main.ts"></script>
</body>
</html>`;
    await fs.writeFile(path.join(targetDir, 'index.html'), indexHtml);

    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        skipLibCheck: true
      },
      include: ["src/**/*"]
    };
    await fs.writeJson(path.join(targetDir, 'tsconfig.json'), tsconfig, { spaces: 2 });

    const viteConfig = `import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 3000 }
});`;
    await fs.writeFile(path.join(targetDir, 'vite.config.ts'), viteConfig);

    await fs.writeFile(path.join(targetDir, 'src', 'main.ts'), template.main);

    spinner.succeed(chalk.green(`Successfully created ${name} with "${templateName}" template!`));
    console.log(`\nNext steps:\n  cd ${name}\n  npm install\n  npm run dev`);
  } catch (err: any) {
    spinner.fail(chalk.red(`Failed to scaffold config: ${err.message}`));
    process.exit(1);
  }
}
