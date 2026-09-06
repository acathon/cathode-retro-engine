import {
  Cathode, Scene, Sprite, TileMap,
  SoundChannel, TouchControls
} from '@cathode/sdk';

// ─── Procedural Sprite Sheet Generation ──────────────────────────────
// All graphics are generated at runtime — no external image files needed.

/** Create a tiny canvas, draw pixels on it, and upload to the engine as a sprite sheet. */
function makeSheet(
  engine: Cathode,
  tileW: number,
  tileH: number,
  frames: (ctx: CanvasRenderingContext2D, i: number) => void,
  frameCount: number,
): number {
  const w = tileW * frameCount;
  const h = tileH;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < frameCount; i++) {
    ctx.save();
    ctx.translate(i * tileW, 0);
    frames(ctx, i);
    ctx.restore();
  }
  const data = ctx.getImageData(0, 0, w, h);
  return engine.raw!.upload_sheet(w, h, tileW, tileH, new Uint8Array(data.data.buffer));
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// Player ship (8×8, 2 frames: normal + thrust)
function drawPlayer(ctx: CanvasRenderingContext2D, frame: number) {
  //     Body
  rect(ctx, 3, 0, 2, 1, '#0ff');   // tip
  rect(ctx, 2, 1, 4, 1, '#0cf');
  rect(ctx, 1, 2, 6, 1, '#0af');
  rect(ctx, 0, 3, 8, 2, '#08f');   // main body
  rect(ctx, 1, 5, 6, 1, '#06c');
  rect(ctx, 0, 6, 2, 1, '#06c');   // wings
  rect(ctx, 6, 6, 2, 1, '#06c');
  // Cockpit highlight
  px(ctx, 3, 2, '#fff');
  px(ctx, 4, 2, '#aef');
  // Thrust flame on frame 1
  if (frame === 1) {
    px(ctx, 3, 7, '#ff0');
    px(ctx, 4, 7, '#f80');
  }
}

// Enemy type A — squid (8×8, 2 frames for animation)
function drawEnemyA(ctx: CanvasRenderingContext2D, frame: number) {
  rect(ctx, 3, 0, 2, 1, '#f44');
  rect(ctx, 2, 1, 4, 1, '#f66');
  rect(ctx, 1, 2, 6, 1, '#f88');
  rect(ctx, 0, 3, 8, 1, '#faa');
  // Eyes
  px(ctx, 2, 3, '#000');
  px(ctx, 5, 3, '#000');
  rect(ctx, 1, 4, 6, 1, '#f66');
  // Tentacles alternate
  if (frame === 0) {
    px(ctx, 0, 5, '#f44'); px(ctx, 2, 5, '#f44'); px(ctx, 5, 5, '#f44'); px(ctx, 7, 5, '#f44');
    px(ctx, 0, 6, '#c22'); px(ctx, 7, 6, '#c22');
  } else {
    px(ctx, 1, 5, '#f44'); px(ctx, 3, 5, '#f44'); px(ctx, 4, 5, '#f44'); px(ctx, 6, 5, '#f44');
    px(ctx, 1, 6, '#c22'); px(ctx, 6, 6, '#c22');
  }
}

// Enemy type B — crab (8×8, 2 frames)
function drawEnemyB(ctx: CanvasRenderingContext2D, frame: number) {
  rect(ctx, 2, 0, 4, 1, '#0f0');
  rect(ctx, 1, 1, 6, 1, '#0d0');
  rect(ctx, 0, 2, 8, 2, '#0b0');
  px(ctx, 1, 2, '#000'); px(ctx, 6, 2, '#000'); // eyes
  rect(ctx, 1, 4, 6, 1, '#090');
  // Claws alternate
  if (frame === 0) {
    px(ctx, 0, 5, '#0d0'); px(ctx, 7, 5, '#0d0');
    px(ctx, 2, 5, '#060'); px(ctx, 5, 5, '#060');
  } else {
    px(ctx, 0, 4, '#0d0'); px(ctx, 7, 4, '#0d0');
    px(ctx, 1, 5, '#060'); px(ctx, 6, 5, '#060');
  }
}

// Enemy type C — UFO boss (8×8, 2 frames)
function drawEnemyC(ctx: CanvasRenderingContext2D, frame: number) {
  rect(ctx, 3, 0, 2, 1, '#ff0');   // dome
  rect(ctx, 2, 1, 4, 1, '#fd0');
  rect(ctx, 0, 2, 8, 2, '#fa0');   // saucer body
  px(ctx, 1, 2, frame === 0 ? '#fff' : '#fa0');
  px(ctx, 6, 2, frame === 1 ? '#fff' : '#fa0'); // blinking lights
  rect(ctx, 1, 4, 6, 1, '#f80');
  rect(ctx, 2, 5, 4, 1, '#c60');
  // Underlight
  px(ctx, 3, 6, frame === 0 ? '#ff0' : '#880');
  px(ctx, 4, 6, frame === 1 ? '#ff0' : '#880');
}

// Player bullet (2×4)
function drawBullet(ctx: CanvasRenderingContext2D, frame: number) {
  const color = frame === 0 ? '#0ff' : '#fff';
  rect(ctx, 0, 0, 2, 4, color);
}

// Enemy bullet (2×4)
function drawEnemyBullet(ctx: CanvasRenderingContext2D, frame: number) {
  const color = frame === 0 ? '#f44' : '#ff0';
  rect(ctx, 0, 0, 2, 4, color);
}

// Explosion particle (8×8, 4 frames)
function drawExplosion(ctx: CanvasRenderingContext2D, frame: number) {
  const colors = ['#fff', '#ff0', '#f80', '#f00'];
  const c = colors[frame] ?? '#f00';
  const s = 4 - frame; // shrinking
  const o = frame;     // offset
  rect(ctx, o, o, s * 2, s * 2, c);
  // Sparks
  if (frame < 2) {
    px(ctx, 0, 3, '#ff0'); px(ctx, 7, 3, '#ff0');
    px(ctx, 3, 0, '#ff0'); px(ctx, 4, 7, '#ff0');
  }
  if (frame < 3) {
    px(ctx, 1, 1, '#f80'); px(ctx, 6, 6, '#f80');
  }
}

// Star tile for background (8×8)
function drawStarTile(ctx: CanvasRenderingContext2D, frame: number) {
  // frame 0 = empty, frame 1-3 = different star patterns
  if (frame === 0) return;
  const stars: [number, number, string][][] = [
    [[2, 3, '#556'], [6, 1, '#889'], [4, 6, '#445']],
    [[1, 1, '#778'], [5, 4, '#557'], [7, 7, '#445']],
    [[3, 2, '#667'], [0, 5, '#889'], [6, 6, '#556']],
  ];
  for (const [sx, sy, sc] of stars[(frame - 1) % 3]) {
    px(ctx, sx, sy, sc);
  }
}

// Shield block (8×8)
function drawShield(ctx: CanvasRenderingContext2D, _frame: number) {
  rect(ctx, 1, 0, 6, 2, '#0a0');
  rect(ctx, 0, 2, 8, 4, '#0c0');
  rect(ctx, 0, 6, 3, 2, '#0a0');
  rect(ctx, 5, 6, 3, 2, '#0a0');
  // Cutout in middle-bottom
  rect(ctx, 3, 6, 2, 2, 'rgba(0,0,0,0)');
}

// ─── Game Constants ──────────────────────────────────────────────────
const W = 160;       // Game Boy resolution
const H = 144;
const PLAYER_SPEED = 80;
const BULLET_SPEED = 200;
const ENEMY_BULLET_SPEED = 80;
const SHOOT_COOLDOWN = 0.25;
const ENEMY_COLS = 8;
const ENEMY_ROWS = 4;
const ENEMY_SPACING_X = 16;
const ENEMY_SPACING_Y = 12;
const LIVES_MAX = 3;

// ─── State Types ─────────────────────────────────────────────────────
interface EnemyInfo {
  sprite: Sprite;
  type: number;    // 0=A, 1=B, 2=C
  hp: number;
  points: number;
}

type GameState = 'title' | 'playing' | 'gameover';

// ─── Init ────────────────────────────────────────────────────────────
async function init() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const scoreEl = document.getElementById('score')!;
  const waveEl = document.getElementById('wave')!;
  const livesEl = document.getElementById('lives')!;
  const msgEl = document.getElementById('msg')!;

  const engine = await Cathode.gameboy(canvas, 3);
  const scene = new Scene(engine);

  // Touch controls for mobile
  const gameContainer = document.getElementById('game-container')!;
  new TouchControls(engine.input, gameContainer, { opacity: 0.35, size: 90 });

  // ── Generate Sprite Sheets ──
  const playerSheet = makeSheet(engine, 8, 8, drawPlayer, 2);
  const enemyASheet = makeSheet(engine, 8, 8, drawEnemyA, 2);
  const enemyBSheet = makeSheet(engine, 8, 8, drawEnemyB, 2);
  const enemyCSheet = makeSheet(engine, 8, 8, drawEnemyC, 2);
  const bulletSheet = makeSheet(engine, 2, 4, drawBullet, 2);
  const eBulletSheet = makeSheet(engine, 2, 4, drawEnemyBullet, 2);
  const explosionSheet = makeSheet(engine, 8, 8, drawExplosion, 4);
  const starSheet = makeSheet(engine, 8, 8, drawStarTile, 4);
  const shieldSheet = makeSheet(engine, 8, 8, drawShield, 1);

  const enemySheets = [enemyASheet, enemyBSheet, enemyCSheet];

  // ── Sound Channels ──
  const sfxShoot = new SoundChannel(engine, 0);
  const sfxHit = new SoundChannel(engine, 1);
  const sfxExplode = new SoundChannel(engine, 2);
  const sfxDie = new SoundChannel(engine, 3);

  // ── Starfield Background Tilemap ──
  const starMap = new TileMap(scene, {
    name: 'stars',
    cols: Math.ceil(W / 8),
    rows: Math.ceil(H / 8),
    tileWidth: 8,
    tileHeight: 8,
  });
  const starLayer = starMap.addLayer('bg', starSheet, true);
  // Randomly fill with star tiles
  for (let r = 0; r < starMap.rows; r++) {
    for (let c = 0; c < starMap.cols; c++) {
      starMap.setTile(starLayer, c, r, Math.random() < 0.25 ? (1 + Math.floor(Math.random() * 3)) : 0);
    }
  }
  starMap.commit();

  // ── Game State ──
  let state: GameState = 'title';
  let score = 0;
  let wave = 1;
  let lives = LIVES_MAX;
  let shootTimer = 0;
  let enemyDir = 1;         // 1 = right, -1 = left
  let enemySpeed = 12;      // pixels/sec base
  let enemyDropTimer = 0;
  let enemyShootTimer = 0;
  let invincibleTimer = 0;
  let formationX = 0;
  let formationY = 0;

  const enemies: EnemyInfo[] = [];
  const playerBullets: Sprite[] = [];
  const enemyBullets: Sprite[] = [];
  const explosions: { sprite: Sprite; timer: number }[] = [];
  const shields: Sprite[] = [];

  let player: Sprite | null = null;

  // ── Helper Functions ──────────────────────────────────────────────

  function spawnExplosion(x: number, y: number) {
    const exp = new Sprite(scene, { x, y, sheet: explosionSheet, frame: 0, layer: 20 });
    exp.play({ frames: [0, 1, 2, 3], fps: 12, loop: false });
    explosions.push({ sprite: exp, timer: 4 / 12 });
  }

  function spawnFormation() {
    // Clear any remaining enemies
    for (const e of enemies) e.sprite.destroy();
    enemies.length = 0;

    formationX = (W - ENEMY_COLS * ENEMY_SPACING_X) / 2;
    formationY = 16;
    enemyDir = 1;

    const rowTypes = wave <= 2
      ? [0, 0, 1, 1]           // waves 1-2: A and B only
      : [2, 0, 1, 1];          // wave 3+: add UFO row

    for (let row = 0; row < ENEMY_ROWS; row++) {
      for (let col = 0; col < ENEMY_COLS; col++) {
        const type = rowTypes[row];
        const sx = formationX + col * ENEMY_SPACING_X + 4;
        const sy = formationY + row * ENEMY_SPACING_Y;
        const sheet = enemySheets[type];
        const sprite = new Sprite(scene, { x: sx, y: sy, sheet, frame: 0, layer: 10 });
        sprite.play({ frames: [0, 1], fps: 6 + wave * 0.5, loop: true });
        enemies.push({
          sprite,
          type,
          hp: type === 2 ? 2 : 1,     // UFOs take 2 hits
          points: (type + 1) * 10,     // 10, 20, 30
        });
      }
    }

    // Increase speed with wave
    enemySpeed = 12 + wave * 4;
    enemyShootTimer = 1.5;
  }

  function spawnShields() {
    for (const s of shields) s.destroy();
    shields.length = 0;
    const positions = [20, 56, 92, 128];
    for (const sx of positions) {
      shields.push(new Sprite(scene, { x: sx, y: H - 30, sheet: shieldSheet, frame: 0, layer: 5 }));
    }
  }

  function resetGame() {
    // Clean up everything
    for (const e of enemies) e.sprite.destroy();
    enemies.length = 0;
    for (const b of playerBullets) b.destroy();
    playerBullets.length = 0;
    for (const b of enemyBullets) b.destroy();
    enemyBullets.length = 0;
    for (const e of explosions) e.sprite.destroy();
    explosions.length = 0;

    if (player) player.destroy();
    player = new Sprite(scene, { x: W / 2 - 4, y: H - 16, sheet: playerSheet, frame: 0, layer: 15 });
    player.play({ frames: [0, 1], fps: 6, loop: true });

    score = 0;
    wave = 1;
    lives = LIVES_MAX;
    shootTimer = 0;
    invincibleTimer = 0;

    spawnFormation();
    spawnShields();
    updateHUD();
  }

  function updateHUD() {
    scoreEl.textContent = String(score);
    waveEl.textContent = String(wave);
    livesEl.textContent = '♥'.repeat(lives) + '♡'.repeat(LIVES_MAX - lives);
  }

  function playerShoot() {
    if (!player || shootTimer > 0 || playerBullets.length >= 3) return;
    const b = new Sprite(scene, { x: player.x + 3, y: player.y - 4, sheet: bulletSheet, frame: 0, layer: 12 });
    b.play({ frames: [0, 1], fps: 10, loop: true });
    playerBullets.push(b);
    shootTimer = SHOOT_COOLDOWN;
    sfxShoot.play(800, 'pulse25', 0.3);
    setTimeout(() => sfxShoot.stop(), 60);
  }

  function enemyShoot() {
    if (enemies.length === 0) return;
    // Pick a random enemy from the bottom of each column
    const bottomEnemies: EnemyInfo[] = [];
    const colMap = new Map<number, EnemyInfo>();
    for (const e of enemies) {
      const col = Math.round(e.sprite.x / ENEMY_SPACING_X);
      const prev = colMap.get(col);
      if (!prev || e.sprite.y > prev.sprite.y) {
        colMap.set(col, e);
      }
    }
    for (const e of colMap.values()) bottomEnemies.push(e);

    if (bottomEnemies.length > 0) {
      const shooter = bottomEnemies[Math.floor(Math.random() * bottomEnemies.length)];
      const b = new Sprite(scene, {
        x: shooter.sprite.x + 3,
        y: shooter.sprite.y + 8,
        sheet: eBulletSheet,
        frame: 0,
        layer: 12,
      });
      b.play({ frames: [0, 1], fps: 8, loop: true });
      enemyBullets.push(b);
    }
  }

  function hitPlayer() {
    if (!player || invincibleTimer > 0) return;
    lives--;
    updateHUD();
    engine.shake(6, 0.4);
    sfxDie.play(200, 'noise', 0.7);
    setTimeout(() => sfxDie.stop(), 300);
    spawnExplosion(player.x, player.y);

    if (lives <= 0) {
      player.destroy();
      player = null;
      state = 'gameover';
      msgEl.textContent = `GAME OVER — Score: ${score} — Press ENTER to restart`;
    } else {
      // Brief invincibility
      invincibleTimer = 2.0;
      player.x = W / 2 - 4;
      player.y = H - 16;
    }
  }

  // ── Main Game Loop ─────────────────────────────────────────────────
  engine.loop((dt) => {
    const input = engine.input;

    // ── Title Screen ──
    if (state === 'title') {
      if (input.justPressed(0, 'start') || input.justPressed(0, 'a')) {
        state = 'playing';
        resetGame();
        msgEl.textContent = '';
      }
      scene.update(dt);
      return;
    }

    // ── Game Over ──
    if (state === 'gameover') {
      if (input.justPressed(0, 'start')) {
        state = 'playing';
        resetGame();
        msgEl.textContent = '';
      }
      scene.update(dt);
      return;
    }

    // ── Playing ──
    if (!player) return;

    // Player movement
    if (input.held(0, 'left')) player.x -= PLAYER_SPEED * dt;
    if (input.held(0, 'right')) player.x += PLAYER_SPEED * dt;
    // Clamp to screen
    if (player.x < 0) player.x = 0;
    if (player.x > W - 8) player.x = W - 8;

    // Shooting
    shootTimer = Math.max(0, shootTimer - dt);
    if (input.held(0, 'a') || input.justPressed(0, 'a')) {
      playerShoot();
    }

    // Invincibility flash
    if (invincibleTimer > 0) {
      invincibleTimer -= dt;
      // Make player blink by toggling visibility via layer hack:
      // We just toggle flipX rapidly as a visual indicator
      player.flipX = Math.floor(invincibleTimer * 10) % 2 === 0;
    } else if (player) {
      player.flipX = false;
    }

    // ── Move Enemy Formation ──
    let edgeHit = false;
    for (const e of enemies) {
      e.sprite.x += enemySpeed * enemyDir * dt;
      if (e.sprite.x <= 2 || e.sprite.x >= W - 10) edgeHit = true;
    }
    if (edgeHit) {
      enemyDir *= -1;
      enemyDropTimer = 0.1;
    }
    if (enemyDropTimer > 0) {
      enemyDropTimer -= dt;
      if (enemyDropTimer <= 0) {
        for (const e of enemies) e.sprite.y += 4;
      }
    }

    // Enemy shooting
    enemyShootTimer -= dt;
    if (enemyShootTimer <= 0) {
      enemyShoot();
      enemyShootTimer = Math.max(0.4, 1.8 - wave * 0.15);
    }

    // ── Update Player Bullets ──
    for (let i = playerBullets.length - 1; i >= 0; i--) {
      const b = playerBullets[i];
      b.y -= BULLET_SPEED * dt;
      if (b.y < -4) {
        b.destroy();
        playerBullets.splice(i, 1);
        continue;
      }

      // Check hit on enemies
      let hitEnemy = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (b.overlaps(e.sprite, 8, 8)) {
          e.hp--;
          if (e.hp <= 0) {
            score += e.points;
            spawnExplosion(e.sprite.x, e.sprite.y);
            sfxHit.play(300, 'noise', 0.4);
            setTimeout(() => sfxHit.stop(), 80);
            e.sprite.destroy();
            enemies.splice(j, 1);
          } else {
            // Flash hit
            sfxHit.play(500, 'pulse25', 0.3);
            setTimeout(() => sfxHit.stop(), 50);
          }
          hitEnemy = true;
          break;
        }
      }
      if (hitEnemy) {
        b.destroy();
        playerBullets.splice(i, 1);
        updateHUD();
      }

      // Check hit on shields (remove shield on hit)
      if (!hitEnemy) {
        for (let s = shields.length - 1; s >= 0; s--) {
          if (b.overlaps(shields[s], 8, 8)) {
            // Bullet passes through shields (friendly fire doesn't destroy them)
            break;
          }
        }
      }
    }

    // ── Update Enemy Bullets ──
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      b.y += ENEMY_BULLET_SPEED * dt;
      if (b.y > H + 4) {
        b.destroy();
        enemyBullets.splice(i, 1);
        continue;
      }

      // Hit player?
      if (player && invincibleTimer <= 0 && b.overlaps(player, 8, 8)) {
        b.destroy();
        enemyBullets.splice(i, 1);
        hitPlayer();
        continue;
      }

      // Hit shields
      for (let s = shields.length - 1; s >= 0; s--) {
        if (b.overlaps(shields[s], 8, 8)) {
          b.destroy();
          enemyBullets.splice(i, 1);
          shields[s].destroy();
          shields.splice(s, 1);
          spawnExplosion(b.x - 3, b.y - 2);
          break;
        }
      }
    }

    // ── Enemy reaching player's row = hit ──
    for (const e of enemies) {
      if (e.sprite.y + 8 >= H - 16) {
        hitPlayer();
        break;
      }
    }

    // ── Update Explosions ──
    for (let i = explosions.length - 1; i >= 0; i--) {
      explosions[i].timer -= dt;
      if (explosions[i].timer <= 0) {
        explosions[i].sprite.destroy();
        explosions.splice(i, 1);
      }
    }

    // ── Wave Complete? ──
    if (enemies.length === 0 && state === 'playing') {
      wave++;
      updateHUD();
      spawnFormation();
      spawnShields();
      engine.shake(3, 0.2);
      sfxExplode.play(600, 'triangle', 0.5);
      setTimeout(() => sfxExplode.stop(), 200);
      msgEl.textContent = `WAVE ${wave}`;
      setTimeout(() => { if (state === 'playing') msgEl.textContent = ''; }, 1500);
    }

    // Sync all sprite positions to WASM
    scene.update(dt);
  });
}

init();
