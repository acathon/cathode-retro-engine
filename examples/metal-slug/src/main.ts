import {
  Cathode, Scene, Sprite, TileMap,
  SoundChannel, TouchControls
} from '@cathode/sdk';

// ─── Procedural Sprite Drawing Helpers ───────────────────────────────
function makeSheet(
  engine: Cathode, tw: number, th: number,
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

function px(c: CanvasRenderingContext2D, x: number, y: number, col: string) {
  c.fillStyle = col; c.fillRect(x, y, 1, 1);
}
function rect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) {
  c.fillStyle = col; c.fillRect(x, y, w, h);
}

// ─── Sprite Sheets (all procedural — no image files!) ────────────────

// Player soldier (12×12, 6 frames: idle0, idle1, run0, run1, jump, crouch)
function drawSoldier(c: CanvasRenderingContext2D, f: number) {
  const crouch = f === 5;
  const jumping = f === 4;
  const yOff = crouch ? 4 : 0;

  // Boots
  if (!jumping) {
    const legSpread = (f === 2 || f === 3);
    rect(c, 3, 10 + yOff, 2, 2, '#542');
    rect(c, 7, 10 + yOff, 2, 2, '#542');
    if (legSpread && f === 2) { rect(c, 2, 10 + yOff, 2, 2, '#542'); rect(c, 8, 10 + yOff, 2, 2, '#542'); }
    if (legSpread && f === 3) { rect(c, 4, 10 + yOff, 2, 2, '#542'); rect(c, 6, 10 + yOff, 2, 2, '#542'); }
  } else {
    rect(c, 3, 8, 2, 2, '#542');
    rect(c, 7, 8, 2, 2, '#542');
  }

  // Pants
  if (!crouch) {
    rect(c, 3, 8 + yOff, 6, 2, '#363');
  }

  // Body
  rect(c, 3, 4 + yOff, 6, 4, '#585');  // shirt
  rect(c, 4, 3 + yOff, 4, 1, '#585');  // shoulders

  // Head
  rect(c, 4, 0 + yOff, 4, 3, '#ec9');  // face
  rect(c, 3, 0 + yOff, 6, 1, '#363');  // helmet
  rect(c, 4, 0 + yOff, 4, 1, '#474');  // helmet front
  px(c, 5, 1 + yOff, '#211');           // left eye
  px(c, 7, 1 + yOff, '#211');           // right eye

  // Gun arm
  if (!crouch) {
    rect(c, 9, 5 + yOff, 3, 1, '#888'); // gun barrel
    rect(c, 8, 5 + yOff, 2, 2, '#ec9'); // hand
  } else {
    rect(c, 9, 7 + yOff, 3, 1, '#888');
    rect(c, 8, 7 + yOff, 2, 2, '#ec9');
  }

  // Muzzle flash on frame 1 and 3
  if (f === 1 || f === 3) {
    px(c, 11, 4 + yOff, '#ff0');
    px(c, 11, 5 + yOff, '#fa0');
  }
}

// Enemy soldier (12×12, 4 frames: idle0, idle1, run0, run1)
function drawEnemy(c: CanvasRenderingContext2D, f: number) {
  const run = f >= 2;
  // Boots
  rect(c, 3, 10, 2, 2, '#222');
  rect(c, 7, 10, 2, 2, '#222');
  if (run && f === 2) { rect(c, 2, 10, 2, 2, '#222'); rect(c, 8, 10, 2, 2, '#222'); }
  if (run && f === 3) { rect(c, 4, 10, 2, 2, '#222'); rect(c, 6, 10, 2, 2, '#222'); }
  // Pants
  rect(c, 3, 8, 6, 2, '#633');
  // Body
  rect(c, 3, 4, 6, 4, '#944');
  rect(c, 4, 3, 4, 1, '#944');
  // Head
  rect(c, 4, 0, 4, 3, '#db9');
  rect(c, 3, 0, 6, 1, '#633'); // beret
  px(c, 5, 1, '#211'); px(c, 7, 1, '#211');
  // Gun
  rect(c, 0, 5, 3, 1, '#666');
  rect(c, 2, 5, 2, 2, '#db9');
  // Flash
  if (f === 1 || f === 3) { px(c, 0, 4, '#ff0'); px(c, 0, 5, '#fa0'); }
}

// Heavy enemy / turret (12×12, 2 frames)
function drawTurret(c: CanvasRenderingContext2D, f: number) {
  // Base
  rect(c, 1, 8, 10, 4, '#555');
  rect(c, 2, 7, 8, 1, '#666');
  // Barrel
  rect(c, 0, 4, 5, 2, '#888');
  rect(c, 0, 3, 2, 1, '#777');
  // Body
  rect(c, 4, 2, 6, 6, '#764');
  rect(c, 5, 1, 4, 1, '#875');
  // Viewport
  px(c, 5, 3, '#f00');
  px(c, 6, 3, f === 0 ? '#f00' : '#ff0');
  // Flash
  if (f === 1) { rect(c, 0, 2, 2, 2, '#ff0'); }
}

// Helicopter (16×12, 2 frames)
function drawHeli(c: CanvasRenderingContext2D, f: number) {
  // Body
  rect(c, 4, 4, 8, 5, '#556');
  rect(c, 3, 5, 10, 3, '#667');
  // Cockpit
  rect(c, 3, 5, 3, 3, '#8cf');
  // Tail
  rect(c, 12, 5, 4, 2, '#445');
  rect(c, 14, 3, 2, 2, '#556');  // rotor mount
  // Main rotor
  if (f === 0) { rect(c, 0, 2, 16, 1, '#999'); }
  else { rect(c, 2, 2, 12, 1, '#999'); px(c, 0, 3, '#999'); px(c, 15, 3, '#999'); }
  // Under gun
  rect(c, 6, 9, 2, 2, '#444');
  px(c, 6, 11, '#666');
  if (f === 1) { px(c, 6, 11, '#ff0'); }
}

// Player bullet (4×2)
function drawBullet(c: CanvasRenderingContext2D, f: number) {
  rect(c, 0, 0, 4, 2, f === 0 ? '#ff0' : '#fff');
}

// Enemy bullet (3×3)
function drawEBullet(c: CanvasRenderingContext2D, f: number) {
  rect(c, 0, 0, 3, 3, f === 0 ? '#f44' : '#fa0');
  px(c, 1, 1, '#ff0');
}

// Grenade (4×4)
function drawGrenade(c: CanvasRenderingContext2D, f: number) {
  rect(c, 0, 1, 4, 3, '#484');
  rect(c, 1, 0, 2, 4, '#484');
  px(c, 1, 0, f === 0 ? '#ff0' : '#fa0'); // fuse
}

// Explosion (12×12, 5 frames)
function drawExplosion(c: CanvasRenderingContext2D, f: number) {
  const colors = ['#fff', '#ff0', '#f80', '#f40', '#a20'];
  const col = colors[f];
  const s = 12 - f * 2;
  const o = f;
  rect(c, o, o, s, s, col);
  // Sparks
  if (f < 3) {
    px(c, 0, 5, '#ff0'); px(c, 11, 6, '#ff0');
    px(c, 5, 0, '#fa0'); px(c, 6, 11, '#fa0');
    px(c, 1, 1, '#fff'); px(c, 10, 10, '#fff');
  }
}

// Platform/ground tile (8×8, 3 frames: empty, ground top, ground fill)
function drawGroundTile(c: CanvasRenderingContext2D, f: number) {
  if (f === 0) return;
  if (f === 1) {
    // Ground top
    rect(c, 0, 0, 8, 2, '#5a3');
    rect(c, 0, 2, 8, 6, '#742');
    px(c, 1, 3, '#632'); px(c, 5, 4, '#632'); px(c, 3, 6, '#632');
  } else {
    // Below surface
    rect(c, 0, 0, 8, 8, '#742');
    px(c, 2, 2, '#632'); px(c, 6, 5, '#632'); px(c, 1, 6, '#853');
  }
}

// Crate/pickup (8×8, 2 frames: ammo crate, health crate)
function drawCrate(c: CanvasRenderingContext2D, f: number) {
  rect(c, 0, 0, 8, 8, '#975');
  rect(c, 1, 1, 6, 6, '#a86');
  rect(c, 2, 2, 4, 4, f === 0 ? '#ff0' : '#f44');
  if (f === 0) { px(c, 3, 3, '#aa0'); px(c, 4, 4, '#aa0'); } // ammo icon
  else { rect(c, 3, 2, 2, 4, '#fff'); rect(c, 2, 3, 4, 2, '#fff'); } // cross
}

// Background building (8×8, 3 frames: sky, building, window)
function drawBgTile(c: CanvasRenderingContext2D, f: number) {
  if (f === 0) {
    // Sky gradient
    rect(c, 0, 0, 8, 3, '#235');
    rect(c, 0, 3, 8, 3, '#346');
    rect(c, 0, 6, 8, 2, '#457');
  } else if (f === 1) {
    // Building
    rect(c, 0, 0, 8, 8, '#556');
    px(c, 1, 2, '#77a'); px(c, 3, 2, '#77a'); px(c, 5, 2, '#77a');
    px(c, 1, 5, '#77a'); px(c, 3, 5, '#77a'); px(c, 5, 5, '#77a');
  } else {
    // Building with lit window
    rect(c, 0, 0, 8, 8, '#445');
    px(c, 2, 3, '#ff8'); px(c, 3, 3, '#ff8');
    px(c, 2, 4, '#ff8'); px(c, 3, 4, '#ff8');
    px(c, 6, 1, '#77a');
  }
}

// ─── Game Constants ──────────────────────────────────────────────────
const W = 256;
const H = 240;
const GRAVITY = 600;
const PLAYER_SPEED = 90;
const JUMP_STRENGTH = -250;
const BULLET_SPEED = 300;
const EBULLET_SPEED = 120;
const GRENADE_SPEED = 150;
const GRENADE_GRAVITY = 400;
const GROUND_Y = 200; // base ground level in world coords
const LIVES_MAX = 3;
const GRENADE_MAX = 10;

// Level definition — column-based terrain heights and features
// Each entry: [ground_height (in tiles from bottom), platform_y? (optional floating platform)]
const LEVEL_WIDTH = 80; // in 8px tiles = 640px
const LEVEL_HEIGHT = 30; // 240px

type GameState = 'title' | 'playing' | 'gameover' | 'victory';

interface Bullet { sprite: Sprite; vx: number; vy: number; isGrenade?: boolean; bounced?: boolean; }
interface EnemyUnit {
  sprite: Sprite;
  type: 'soldier' | 'turret' | 'heli';
  hp: number;
  points: number;
  shootTimer: number;
  patrolDir: number;
  worldX: number;
  worldY: number;
}
interface Pickup { sprite: Sprite; type: 'ammo' | 'health'; worldX: number; worldY: number; }
interface Particle { sprite: Sprite; timer: number; }

// ─── Init ────────────────────────────────────────────────────────────
async function init() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const scoreEl = document.getElementById('score')!;
  const stageEl = document.getElementById('stage')!;
  const ammoEl = document.getElementById('ammo')!;
  const livesEl = document.getElementById('lives')!;
  const msgEl = document.getElementById('msg')!;

  const engine = await Cathode.nes(canvas, 3);
  const scene = new Scene(engine);

  // Touch controls
  new TouchControls(engine.input, document.getElementById('game-container')!, { opacity: 0.3, size: 100 });

  // ── Generate Sprite Sheets ──
  const soldierSheet = makeSheet(engine, 12, 12, drawSoldier, 6);
  const enemySheet = makeSheet(engine, 12, 12, drawEnemy, 4);
  const turretSheet = makeSheet(engine, 12, 12, drawTurret, 2);
  const heliSheet = makeSheet(engine, 16, 12, drawHeli, 2);
  const bulletSheet = makeSheet(engine, 4, 2, drawBullet, 2);
  const eBulletSheet = makeSheet(engine, 3, 3, drawEBullet, 2);
  const grenadeSheet = makeSheet(engine, 4, 4, drawGrenade, 2);
  const explosionSheet = makeSheet(engine, 12, 12, drawExplosion, 5);
  const groundSheet = makeSheet(engine, 8, 8, drawGroundTile, 3);
  const crateSheet = makeSheet(engine, 8, 8, drawCrate, 2);
  const bgSheet = makeSheet(engine, 8, 8, drawBgTile, 3);

  // ── Sound Channels ──
  const sfxShoot = new SoundChannel(engine, 0);
  const sfxExplode = new SoundChannel(engine, 1);
  const sfxJump = new SoundChannel(engine, 2);
  const sfxPickup = new SoundChannel(engine, 3);

  // ── Generate Level Tilemap ──
  // Ground height map (tiles from bottom, 1–6)
  const groundHeights: number[] = [];
  for (let col = 0; col < LEVEL_WIDTH; col++) {
    if (col < 5) groundHeights.push(4); // flat start
    else if (col >= LEVEL_WIDTH - 5) groundHeights.push(4); // flat end
    else {
      const prev = groundHeights[col - 1];
      const r = Math.random();
      if (r < 0.15 && prev > 2) groundHeights.push(prev - 1);
      else if (r < 0.3 && prev < 6) groundHeights.push(prev + 1);
      else groundHeights.push(prev);
    }
  }

  // Platforms — occasional floating platforms
  const platforms: { col: number; width: number; row: number }[] = [];
  for (let col = 10; col < LEVEL_WIDTH - 10; col += 8 + Math.floor(Math.random() * 6)) {
    const gRow = LEVEL_HEIGHT - groundHeights[col];
    const pRow = gRow - 3 - Math.floor(Math.random() * 3);
    if (pRow > 2) {
      const pw = 2 + Math.floor(Math.random() * 3);
      platforms.push({ col, width: pw, row: pRow });
    }
  }

  // Background tilemap (parallax layer)
  const bgMap = new TileMap(scene, {
    name: 'bg', cols: LEVEL_WIDTH, rows: LEVEL_HEIGHT, tileWidth: 8, tileHeight: 8
  });
  const bgLayer = bgMap.addLayer('sky', bgSheet, false);
  for (let r = 0; r < LEVEL_HEIGHT; r++) {
    for (let col = 0; col < LEVEL_WIDTH; col++) {
      if (r < LEVEL_HEIGHT - 10) bgMap.setTile(bgLayer, col, r, 0); // sky
      else if (Math.random() < 0.3) bgMap.setTile(bgLayer, col, r, 2);
      else bgMap.setTile(bgLayer, col, r, 1);
    }
  }
  bgMap.commit();

  // Ground tilemap
  const groundMap = new TileMap(scene, {
    name: 'ground', cols: LEVEL_WIDTH, rows: LEVEL_HEIGHT, tileWidth: 8, tileHeight: 8
  });
  const gndLayer = groundMap.addLayer('terrain', groundSheet, false);
  for (let col = 0; col < LEVEL_WIDTH; col++) {
    const gh = groundHeights[col];
    const topRow = LEVEL_HEIGHT - gh;
    groundMap.setTile(gndLayer, col, topRow, 1); // top tile
    for (let r = topRow + 1; r < LEVEL_HEIGHT; r++) {
      groundMap.setTile(gndLayer, col, r, 2); // fill tile
    }
  }
  // Draw platforms into tilemap
  for (const p of platforms) {
    for (let dx = 0; dx < p.width; dx++) {
      groundMap.setTile(gndLayer, p.col + dx, p.row, 1);
    }
  }
  groundMap.commit();

  // ── Get ground Y at a world X ──
  function getGroundY(worldX: number): number {
    const col = Math.floor(worldX / 8);
    if (col < 0 || col >= LEVEL_WIDTH) return GROUND_Y;
    return (LEVEL_HEIGHT - groundHeights[Math.min(col, LEVEL_WIDTH - 1)]) * 8;
  }

  // Check platform collision at world position
  function getPlatformY(worldX: number, worldY: number, vy: number): number | null {
    if (vy < 0) return null; // only collide falling down
    for (const p of platforms) {
      const px1 = p.col * 8;
      const px2 = (p.col + p.width) * 8;
      const py = p.row * 8;
      if (worldX >= px1 && worldX < px2 && worldY >= py - 4 && worldY <= py + 4) {
        return py;
      }
    }
    return null;
  }

  // ── Game State ──
  let state: GameState = 'title';
  let score = 0;
  let lives = LIVES_MAX;
  let grenades = GRENADE_MAX;
  let stage = 1;
  let cameraX = 0;
  let invincTimer = 0;
  let shootTimer = 0;

  let playerX = 40;
  let playerY = 0;
  let playerVY = 0;
  let playerOnGround = true;
  let crouching = false;
  let facingRight = true;

  let player: Sprite | null = null;
  const playerBullets: Bullet[] = [];
  const enemyBullets: Bullet[] = [];
  const enemyUnits: EnemyUnit[] = [];
  const pickups: Pickup[] = [];
  const particles: Particle[] = [];

  // ── Spawn Helpers ──
  function spawnExplosion(wx: number, wy: number, big = false) {
    const exp = new Sprite(scene, { x: wx - cameraX, y: wy, sheet: explosionSheet, frame: 0, layer: 25 });
    exp.play({ frames: [0, 1, 2, 3, 4], fps: big ? 8 : 14, loop: false });
    particles.push({ sprite: exp, timer: 5 / (big ? 8 : 14) });
    if (big) engine.shake(5, 0.3);
  }

  function spawnEnemy(type: EnemyUnit['type'], wx: number, wy: number) {
    const sheet = type === 'soldier' ? enemySheet : type === 'turret' ? turretSheet : heliSheet;
    const sprite = new Sprite(scene, { x: wx - cameraX, y: wy, sheet, frame: 0, layer: 10 });
    sprite.play({ frames: type === 'heli' ? [0, 1] : [0, 1], fps: type === 'heli' ? 12 : 4, loop: true });
    enemyUnits.push({
      sprite, type,
      hp: type === 'heli' ? 5 : type === 'turret' ? 3 : 1,
      points: type === 'heli' ? 500 : type === 'turret' ? 200 : 100,
      shootTimer: 1 + Math.random() * 2,
      patrolDir: Math.random() < 0.5 ? -1 : 1,
      worldX: wx, worldY: wy,
    });
  }

  function spawnPickup(type: 'ammo' | 'health', wx: number, wy: number) {
    const sprite = new Sprite(scene, { x: wx - cameraX, y: wy, sheet: crateSheet, frame: type === 'ammo' ? 0 : 1, layer: 5 });
    pickups.push({ sprite, type, worldX: wx, worldY: wy });
  }

  function populateLevel() {
    // Enemies along the level
    for (let col = 15; col < LEVEL_WIDTH - 5; col += 6 + Math.floor(Math.random() * 8)) {
      const gh = getGroundY(col * 8);
      const r = Math.random();
      if (r < 0.5) spawnEnemy('soldier', col * 8, gh - 12);
      else if (r < 0.8) spawnEnemy('turret', col * 8, gh - 12);
      else spawnEnemy('heli', col * 8, gh - 60 - Math.random() * 40);
    }
    // Pickups
    for (let col = 12; col < LEVEL_WIDTH - 5; col += 10 + Math.floor(Math.random() * 8)) {
      const gh = getGroundY(col * 8);
      spawnPickup(Math.random() < 0.6 ? 'ammo' : 'health', col * 8, gh - 8);
    }
  }

  function resetGame() {
    // Cleanup
    for (const e of enemyUnits) e.sprite.destroy();
    enemyUnits.length = 0;
    for (const b of playerBullets) b.sprite.destroy();
    playerBullets.length = 0;
    for (const b of enemyBullets) b.sprite.destroy();
    enemyBullets.length = 0;
    for (const p of particles) p.sprite.destroy();
    particles.length = 0;
    for (const p of pickups) p.sprite.destroy();
    pickups.length = 0;

    if (player) player.destroy();
    player = new Sprite(scene, { x: 40, y: 0, sheet: soldierSheet, frame: 0, layer: 15 });
    player.play({ frames: [0, 1], fps: 4, loop: true });

    score = 0; lives = LIVES_MAX; grenades = GRENADE_MAX;
    playerX = 40; playerY = getGroundY(40) - 12;
    playerVY = 0; playerOnGround = true;
    crouching = false; facingRight = true;
    cameraX = 0; invincTimer = 0; shootTimer = 0;

    populateLevel();
    updateHUD();
  }

  function updateHUD() {
    scoreEl.textContent = String(score);
    stageEl.textContent = String(stage);
    ammoEl.textContent = '∞ G:' + grenades;
    livesEl.textContent = '♥'.repeat(lives) + '♡'.repeat(LIVES_MAX - lives);
  }

  function fireBullet() {
    if (!player || shootTimer > 0) return;
    const dir = facingRight ? 1 : -1;
    const bx = playerX + (facingRight ? 10 : -4);
    const by = playerY + (crouching ? 8 : 5);
    const b = new Sprite(scene, { x: bx - cameraX, y: by, sheet: bulletSheet, frame: 0, layer: 12 });
    b.play({ frames: [0, 1], fps: 10, loop: true });
    if (!facingRight) b.flipX = true;
    playerBullets.push({ sprite: b, vx: BULLET_SPEED * dir, vy: 0 });
    shootTimer = 0.1;
    sfxShoot.play(900, 'noise', 0.2);
    setTimeout(() => sfxShoot.stop(), 30);
  }

  function fireGrenade() {
    if (!player || grenades <= 0 || shootTimer > 0) return;
    grenades--;
    const dir = facingRight ? 1 : -1;
    const gx = playerX + (facingRight ? 10 : -4);
    const gy = playerY + 3;
    const g = new Sprite(scene, { x: gx - cameraX, y: gy, sheet: grenadeSheet, frame: 0, layer: 12 });
    g.play({ frames: [0, 1], fps: 6, loop: true });
    playerBullets.push({ sprite: g, vx: GRENADE_SPEED * dir, vy: -120, isGrenade: true, bounced: false });
    shootTimer = 0.3;
    updateHUD();
  }

  function hitPlayer() {
    if (!player || invincTimer > 0) return;
    lives--;
    updateHUD();
    engine.shake(8, 0.5);
    sfxExplode.play(180, 'noise', 0.6);
    setTimeout(() => sfxExplode.stop(), 200);
    spawnExplosion(playerX, playerY, true);

    if (lives <= 0) {
      player.destroy();
      player = null;
      state = 'gameover';
      msgEl.textContent = `GAME OVER — Score: ${score} — Press ENTER to restart`;
    } else {
      invincTimer = 2.0;
      playerX = Math.max(cameraX + 20, playerX - 40);
      playerY = getGroundY(playerX) - 12;
      playerVY = 0;
      playerOnGround = true;
    }
  }

  function enemyShoot(e: EnemyUnit) {
    const dx = playerX - e.worldX;
    const dy = playerY - e.worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const b = new Sprite(scene, { x: e.worldX - cameraX + 5, y: e.worldY + 5, sheet: eBulletSheet, frame: 0, layer: 12 });
    b.play({ frames: [0, 1], fps: 8, loop: true });
    enemyBullets.push({ sprite: b, vx: nx * EBULLET_SPEED, vy: ny * EBULLET_SPEED });
  }

  // ── GAME LOOP ──────────────────────────────────────────────────────
  engine.loop((dt) => {
    const input = engine.input;

    // ─ Title ─
    if (state === 'title') {
      if (input.justPressed(0, 'start') || input.justPressed(0, 'a')) {
        state = 'playing';
        resetGame();
        msgEl.textContent = '';
      }
      scene.update(dt);
      return;
    }

    // ─ Game Over / Victory ─
    if (state === 'gameover' || state === 'victory') {
      if (input.justPressed(0, 'start')) {
        state = 'playing';
        resetGame();
        msgEl.textContent = '';
      }
      scene.update(dt);
      return;
    }

    // ─ Playing ─
    if (!player) return;
    shootTimer = Math.max(0, shootTimer - dt);

    // Player input
    crouching = input.held(0, 'down');
    if (input.held(0, 'left') && !crouching) {
      playerX -= PLAYER_SPEED * dt;
      facingRight = false;
    }
    if (input.held(0, 'right') && !crouching) {
      playerX += PLAYER_SPEED * dt;
      facingRight = true;
    }
    // Jump
    if (input.justPressed(0, 'up') && playerOnGround) {
      playerVY = JUMP_STRENGTH;
      playerOnGround = false;
      sfxJump.play(500, 'triangle', 0.3);
      setTimeout(() => sfxJump.stop(), 80);
    }
    // Shoot
    if (input.held(0, 'a')) fireBullet();
    // Grenade
    if (input.justPressed(0, 'b')) fireGrenade();

    // Gravity
    playerVY += GRAVITY * dt;
    playerY += playerVY * dt;

    // Ground collision
    const gndY = getGroundY(playerX);
    const platY = getPlatformY(playerX, playerY + 12, playerVY);
    const landY = platY !== null ? platY : gndY;

    if (playerY + 12 >= landY) {
      playerY = landY - 12;
      playerVY = 0;
      playerOnGround = true;
    } else {
      playerOnGround = false;
    }

    // Clamp X
    if (playerX < cameraX + 4) playerX = cameraX + 4;
    if (playerX > (LEVEL_WIDTH * 8) - 16) playerX = (LEVEL_WIDTH * 8) - 16;

    // Camera follow
    const targetCam = playerX - W / 3;
    cameraX += (targetCam - cameraX) * 3 * dt;
    if (cameraX < 0) cameraX = 0;
    if (cameraX > LEVEL_WIDTH * 8 - W) cameraX = LEVEL_WIDTH * 8 - W;
    engine.setCamera(cameraX, 0);

    // Player animation
    player.flipX = !facingRight;
    if (!playerOnGround) {
      player.frame = 4; // jump frame
      player.stopAnim();
    } else if (crouching) {
      player.frame = 5;
      player.stopAnim();
    } else if (input.held(0, 'left') || input.held(0, 'right')) {
      if (!player.flipX === facingRight) player.play({ frames: [2, 3], fps: 8, loop: true });
    } else {
      player.play({ frames: [0, 1], fps: 4, loop: true });
    }

    // Update player sprite position
    player.x = playerX - cameraX;
    player.y = playerY;

    // Invincibility
    if (invincTimer > 0) {
      invincTimer -= dt;
      player.flipY = Math.floor(invincTimer * 12) % 2 === 0;
    } else {
      player.flipY = false;
    }

    // ─ Update Enemy Units ─
    for (let i = enemyUnits.length - 1; i >= 0; i--) {
      const e = enemyUnits[i];
      const screenX = e.worldX - cameraX;

      // Only active if reasonably close to camera
      if (screenX < -50 || screenX > W + 100) {
        e.sprite.x = screenX;
        e.sprite.y = e.worldY;
        continue;
      }

      // AI: soldiers patrol
      if (e.type === 'soldier') {
        e.worldX += e.patrolDir * 25 * dt;
        const solGnd = getGroundY(e.worldX);
        e.worldY = solGnd - 12;
        const colNow = Math.floor(e.worldX / 8);
        if (colNow <= 1 || colNow >= LEVEL_WIDTH - 2) e.patrolDir *= -1;
        e.sprite.flipX = e.patrolDir > 0;
      }

      // AI: helicopter moves
      if (e.type === 'heli') {
        e.worldX += e.patrolDir * 40 * dt;
        e.worldY += Math.sin(Date.now() / 500) * 0.5;
        if (e.worldX < cameraX - 20 || e.worldX > cameraX + W + 20) e.patrolDir *= -1;
        e.sprite.flipX = e.patrolDir < 0;
      }

      // Shoot timer
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        const distToPlayer = Math.abs(e.worldX - playerX);
        if (distToPlayer < 200) {
          enemyShoot(e);
        }
        e.shootTimer = e.type === 'heli' ? 0.8 : e.type === 'turret' ? 1.2 : 2.0;
      }

      e.sprite.x = e.worldX - cameraX;
      e.sprite.y = e.worldY;
    }

    // ─ Update Player Bullets ─
    for (let i = playerBullets.length - 1; i >= 0; i--) {
      const b = playerBullets[i];
      const worldX = b.sprite.x + cameraX + b.vx * dt;
      b.sprite.x += b.vx * dt;

      if (b.isGrenade) {
        b.vy += GRENADE_GRAVITY * dt;
        b.sprite.y += b.vy * dt;
        // Grenade ground bounce
        const gY = getGroundY(worldX);
        if (b.sprite.y + 4 >= gY) {
          if (!b.bounced) {
            b.vy = -80;
            b.vx *= 0.5;
            b.bounced = true;
          } else {
            // Explode
            spawnExplosion(worldX, b.sprite.y, true);
            sfxExplode.play(200, 'noise', 0.5);
            setTimeout(() => sfxExplode.stop(), 150);
            // Damage nearby enemies
            for (let j = enemyUnits.length - 1; j >= 0; j--) {
              const e = enemyUnits[j];
              const dx = e.worldX - worldX;
              const dy = e.worldY - b.sprite.y;
              if (Math.sqrt(dx * dx + dy * dy) < 30) {
                e.hp -= 3;
                if (e.hp <= 0) {
                  score += e.points;
                  spawnExplosion(e.worldX, e.worldY, e.type === 'heli');
                  e.sprite.destroy();
                  enemyUnits.splice(j, 1);
                }
              }
            }
            b.sprite.destroy();
            playerBullets.splice(i, 1);
            updateHUD();
            continue;
          }
        }
      } else {
        b.sprite.y += b.vy * dt;
      }

      // Off screen
      if (b.sprite.x < -10 || b.sprite.x > W + 10 || b.sprite.y > H + 10) {
        b.sprite.destroy();
        playerBullets.splice(i, 1);
        continue;
      }

      // Hit enemies (non-grenade bullets)
      if (!b.isGrenade) {
        for (let j = enemyUnits.length - 1; j >= 0; j--) {
          const e = enemyUnits[j];
          if (b.sprite.overlaps(e.sprite, e.type === 'heli' ? 16 : 12, 12)) {
            e.hp--;
            if (e.hp <= 0) {
              score += e.points;
              spawnExplosion(e.worldX, e.worldY, e.type === 'heli');
              sfxExplode.play(250, 'noise', 0.35);
              setTimeout(() => sfxExplode.stop(), 100);
              e.sprite.destroy();
              enemyUnits.splice(j, 1);
            }
            b.sprite.destroy();
            playerBullets.splice(i, 1);
            updateHUD();
            break;
          }
        }
      }
    }

    // ─ Update Enemy Bullets ─
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      b.sprite.x += b.vx * dt;
      b.sprite.y += b.vy * dt;

      if (b.sprite.x < -10 || b.sprite.x > W + 10 || b.sprite.y > H + 10 || b.sprite.y < -10) {
        b.sprite.destroy();
        enemyBullets.splice(i, 1);
        continue;
      }

      // Hit player
      if (player && invincTimer <= 0) {
        const px = playerX - cameraX;
        const py = playerY;
        if (b.sprite.x > px - 2 && b.sprite.x < px + 10 &&
          b.sprite.y > py && b.sprite.y < py + 12) {
          b.sprite.destroy();
          enemyBullets.splice(i, 1);
          hitPlayer();
          continue;
        }
      }
    }

    // ─ Update Pickups ─
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.sprite.x = p.worldX - cameraX;
      p.sprite.y = p.worldY;

      // Player overlap
      const px = playerX - cameraX;
      const py = playerY;
      if (p.sprite.x > px - 6 && p.sprite.x < px + 10 &&
        p.sprite.y > py - 4 && p.sprite.y < py + 12) {
        if (p.type === 'health' && lives < LIVES_MAX) { lives++; }
        else if (p.type === 'ammo') { grenades = Math.min(grenades + 5, 99); }
        else { score += 50; }
        sfxPickup.play(800, 'triangle', 0.3);
        setTimeout(() => sfxPickup.stop(), 100);
        p.sprite.destroy();
        pickups.splice(i, 1);
        updateHUD();
      }
    }

    // ─ Update Particles ─
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].timer -= dt;
      if (particles[i].timer <= 0) {
        particles[i].sprite.destroy();
        particles.splice(i, 1);
      }
    }

    // Contact damage
    if (player && invincTimer <= 0) {
      for (const e of enemyUnits) {
        const dx = Math.abs(e.worldX - playerX);
        const dy = Math.abs(e.worldY - playerY);
        const range = e.type === 'heli' ? 14 : 10;
        if (dx < range && dy < range) {
          hitPlayer();
          break;
        }
      }
    }

    // ─ Victory check ─
    if (playerX > (LEVEL_WIDTH - 3) * 8) {
      state = 'victory';
      msgEl.textContent = `STAGE CLEAR! Score: ${score} — Press ENTER to play again`;
    }

    scene.update(dt);
  });
}

init();
