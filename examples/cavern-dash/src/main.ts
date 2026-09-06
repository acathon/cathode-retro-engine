/**
 * CAVERN DASH — a tile-based platformer driven by the engine's own physics.
 *
 * Unlike the other examples, nothing here integrates positions in TypeScript.
 * The player is handed to the engine with `usePhysics`, the level's walls are
 * declared with `setSolidTiles`, and gravity, jumping and every wall, floor
 * and ceiling collision are resolved in Rust. This file only reads the
 * result back and decides what the game does about it.
 */
import { Cathode, Scene, Sprite, TileMap, SoundChannel, ParticleEmitter } from '@cathode/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;

// --- Tiles -----------------------------------------------------------------
// Tile ids are 1-based: the renderer maps id N to sheet tile N-1.
const T_EMPTY = 0;
const T_ROCK = 1;   // sheet tile 0 — solid cave wall
const T_MOSS = 2;   // sheet tile 1 — solid mossy platform
const T_SPIKE = 3;  // sheet tile 2 — hazard, not solid

const TILE = 8;

/**
 * The level, one character per tile.
 *   # rock   = solid      = moss platform (solid)
 *   ^ spike  . empty      G gem           P player start   X exit portal
 */
const LEVEL = [
  '################################################',
  '#..............................................#',
  '#.....G.........G.........G........G...........#',
  '#....===.......===.......===......===..........#',
  '#..............................................#',
  '#...G.........G..........G........G......G.....#',
  '#..===.......===........===......===....===....#',
  '#..............................................#',
  '#.......G.......G.........G.....G..............#',
  '#......===.....===.......===...===.............#',
  '#..............................................#',
  '#......G.....G...............G......G..........#',
  '#.....===...===.....^^^.....===....===.........#',
  '#..............................................#',
  '#.....G.........G.......G........G.............#',
  '#....===.......===.....===......===............#',
  '#..............................................#',
  '#..G......G..........G......G.........G........#',
  '#.===....===........===....===.......===.......#',
  '#..............................................#',
  '#....G........G.........G.........G............#',
  '#...===......===.......===.......===...........#',
  '#..............................................#',
  '#.P....G......G.......^^^^G......G.......G..X..#',
  '####..===....===.........===....===....=====####',
  '#...#..........................................#',
  '#...#..........................................#',
  '#...#^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^....#',
  '#...############################################',
  '################################################',
];

const COLS = LEVEL[0].length;
const ROWS = LEVEL.length;

// --- Tuning ----------------------------------------------------------------
const RUN_SPEED = 80;
const JUMP_SPEED = 245;   // clears the 3-tile gap between tiers
const GRAVITY_SCALE = 1.0;
const PLAYER_BOX = 7;      // collider is a touch smaller than the 8px sprite
const COYOTE_TIME = 0.09;  // grace period for jumping just after leaving ground
const GEM_TARGET = 12;     // gems needed before the portal unseals

type Vec = { x: number; y: number };

function tileAt(col: number, row: number): number {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return T_EMPTY;
  const ch = LEVEL[row][col];
  if (ch === '#') return T_ROCK;
  if (ch === '=') return T_MOSS;
  if (ch === '^') return T_SPIKE;
  return T_EMPTY;
}

/** Build the 3-tile sprite sheet plus player, gem and portal frames. */
function buildSheet(): { pixels: Uint8Array; w: number; h: number } {
  const TILES = 6; // rock, moss, spike, player, gem, portal
  const w = TILE * TILES;
  const h = TILE;
  const px = new Uint8Array(w * h * 4);

  const set = (tile: number, tx: number, ty: number, r: number, g: number, b: number, a = 255) => {
    const x = tile * TILE + tx;
    const i = (ty * w + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };

  for (let ty = 0; ty < TILE; ty++) {
    for (let tx = 0; tx < TILE; tx++) {
      // 0: rock — dark slate with a lighter speckle
      const speck = (tx * 7 + ty * 13) % 11 === 0;
      set(0, tx, ty, speck ? 95 : 62, speck ? 87 : 57, speck ? 110 : 79);

      // 1: moss platform — grassy top over stone
      if (ty < 2) set(1, tx, ty, 0, 228, 54);
      else set(1, tx, ty, 40, 120, 60);

      // 2: spike — upward triangle on transparent
      const half = Math.abs(tx - 3.5);
      if (ty >= 2 && half <= (ty - 1) / 1.7) set(2, tx, ty, 255, 77, 109);
      else set(2, tx, ty, 0, 0, 0, 0);

      // 3: player — a small round explorer with a lamp
      const dx = tx - 3.5, dy = ty - 3.5;
      const inBody = dx * dx + dy * dy <= 11;
      if (inBody) set(3, tx, ty, 255, 236, 39);
      else set(3, tx, ty, 0, 0, 0, 0);

      // 4: gem — diamond
      const d = Math.abs(tx - 3.5) + Math.abs(ty - 3.5);
      if (d <= 3) set(4, tx, ty, 41, 173, 255);
      else set(4, tx, ty, 0, 0, 0, 0);

      // 5: portal — hollow ring
      const rr = Math.sqrt((tx - 3.5) ** 2 + (ty - 3.5) ** 2);
      if (rr <= 3.6 && rr >= 1.9) set(5, tx, ty, 131, 118, 156);
      else set(5, tx, ty, 0, 0, 0, 0);
    }
  }

  // Player eyes, drawn after the body so they sit on top.
  set(3, 2, 3, 20, 20, 30); set(3, 5, 3, 20, 20, 30);

  return { pixels: px, w, h };
}

async function initGame() {
  const engine = await Cathode.nes(canvas, 3);
  const scene = new Scene(engine);

  const sheet = buildSheet();
  const sheetHandle = engine.raw.upload_sheet(sheet.w, sheet.h, TILE, TILE, sheet.pixels);
  engine.raw.set_bg_color(11, 13, 26);

  // --- Level geometry ------------------------------------------------------
  const map = new TileMap(scene, {
    name: 'Cavern',
    cols: COLS,
    rows: ROWS,
    tileWidth: TILE,
    tileHeight: TILE,
  });
  const groundLayer = map.addLayer('Cavern', sheetHandle, false);

  let playerStart: Vec = { x: TILE, y: TILE };
  let exitAt: Vec = { x: 0, y: 0 };
  const gemSpots: Vec[] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ch = LEVEL[row][col];
      const id = tileAt(col, row);
      if (id !== T_EMPTY) map.setTile(groundLayer, col, row, id);

      if (ch === 'P') playerStart = { x: col * TILE, y: row * TILE };
      if (ch === 'X') exitAt = { x: col * TILE, y: row * TILE };
      if (ch === 'G') gemSpots.push({ x: col * TILE, y: row * TILE });
    }
  }

  // This is the line that matters: the engine now owns wall collision.
  // Spikes are deliberately left out so the player runs into them.
  map.setSolidTiles(groundLayer, [T_ROCK, T_MOSS]);
  map.commit();

  // --- Actors --------------------------------------------------------------
  const portal = new Sprite(scene, { sheet: sheetHandle, frame: 5, x: exitAt.x, y: exitAt.y, layer: 5 });

  const gems = gemSpots.map((spot) => ({
    sprite: new Sprite(scene, { sheet: sheetHandle, frame: 4, x: spot.x, y: spot.y, layer: 6 }),
    taken: false,
    home: spot,
  }));

  const player = new Sprite(scene, {
    sheet: sheetHandle,
    frame: 3,
    x: playerStart.x,
    y: playerStart.y,
    layer: 10,
  });

  // Hand the player to the engine: gravity, integration and every collision
  // against the tilemap are resolved in Rust from here on.
  player.usePhysics({
    gravity: GRAVITY_SCALE,
    width: PLAYER_BOX,
    height: PLAYER_BOX,
    offsetX: 0.5,
    offsetY: 1,
  });

  // Follow the player, but never scroll past the edges of the level.
  const camMaxX = Math.max(0, COLS * TILE - engine.width);
  const camMaxY = Math.max(0, ROWS * TILE - engine.height);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const trackCamera = () => {
    engine.setCamera(
      clamp(player.x - engine.width / 2, 0, camMaxX),
      clamp(player.y - engine.height / 2, 0, camMaxY),
    );
  };

  // --- Feedback ------------------------------------------------------------
  const sfx = new SoundChannel(engine, 0);
  const music = new SoundChannel(engine, 1);
  const sparks = new ParticleEmitter(scene, 240);

  // --- Game state ----------------------------------------------------------
  let collected = 0;
  let deaths = 0;
  let won = false;
  let sinceGrounded = COYOTE_TIME;
  let bob = 0;
  let best: number | null = engine.raw.save_get(0, 'bestDeaths') as number | null;

  const el = {
    gems: document.getElementById('gems')!,
    gemsTotal: document.getElementById('gems-total')!,
    deaths: document.getElementById('deaths')!,
    best: document.getElementById('best')!,
    status: document.getElementById('status')!,
  };
  el.gemsTotal.textContent = String(GEM_TARGET);
  el.best.textContent = best === null ? '—' : String(best);

  const setStatus = (text: string, color: string) => {
    el.status.textContent = text;
    el.status.style.color = color;
  };

  function respawn(message: string) {
    deaths++;
    el.deaths.textContent = String(deaths);
    // setPosition, not `player.x = …`: under usePhysics the engine owns the
    // position and would overwrite a direct assignment on the next frame.
    player.setPosition(playerStart.x, playerStart.y);
    player.move(0, 0);
    engine.raw.shake(3, 0.25);
    sfx.play(90, 'noise', 0.5);
    setStatus(message, '#ff004d');
  }

  function restart() {
    won = false;
    collected = 0;
    el.gems.textContent = '0';
    for (const gem of gems) {
      if (gem.taken) {
        gem.taken = false;
        gem.sprite.active = true;
        gem.sprite.setPosition(gem.home.x, gem.home.y);
      }
    }
    player.setPosition(playerStart.x, playerStart.y);
    player.move(0, 0);
    setStatus('REACH THE BLUE PORTAL', '#00e436');
  }

  /** Does the player's box overlap any spike tile right now? */
  function touchingSpikes(px: number, py: number): boolean {
    const left = Math.floor((px + 0.5) / TILE);
    const right = Math.floor((px + 0.5 + PLAYER_BOX - 0.01) / TILE);
    const top = Math.floor((py + 1) / TILE);
    const bottom = Math.floor((py + 1 + PLAYER_BOX - 0.01) / TILE);

    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        if (tileAt(col, row) === T_SPIKE) return true;
      }
    }
    return false;
  }

  engine.loop((dt) => {
    scene.update(dt);
    trackCamera();
    bob += dt;

    if (won) {
      if (engine.input.justPressed(0, 'start')) restart();
      return;
    }

    // The engine zeroes velocity.y on impact, so a body that has stopped
    // falling is standing on something. That readback is why get_velocity
    // exists.
    const grounded = Math.abs(player.velocityY) < 0.001;
    sinceGrounded = grounded ? 0 : sinceGrounded + dt;

    let vx = 0;
    if (engine.input.held(0, 'left')) { vx = -RUN_SPEED; player.flipX = true; }
    if (engine.input.held(0, 'right')) { vx = RUN_SPEED; player.flipX = false; }

    let vy = player.velocityY;
    if (engine.input.justPressed(0, 'a') && sinceGrounded <= COYOTE_TIME) {
      vy = -JUMP_SPEED;
      sinceGrounded = COYOTE_TIME + 1; // consume the coyote window
      sfx.play(520, 'pulse50', 0.35);
      setTimeout(() => sfx.stop(), 70);
    }
    player.move(vx, vy);

    if (engine.input.justPressed(0, 'start')) restart();

    // --- Hazards ---------------------------------------------------------
    if (touchingSpikes(player.x, player.y)) {
      sparks.burst(player.x + 4, player.y + 4, 18, {
        colorStart: [255, 77, 109, 255],
        colorEnd: [255, 236, 39, 0],
        speedMin: 30, speedMax: 90, lifeMin: 0.2, lifeMax: 0.5, gravity: 220,
      });
      respawn('OUCH — SPIKES!');
      return;
    }

    if (player.y > ROWS * TILE + 32) {
      respawn('FELL INTO THE DARK');
      return;
    }

    // --- Collectibles ----------------------------------------------------
    for (const gem of gems) {
      if (gem.taken) continue;
      // Gems bob gently in place.
      gem.sprite.setPosition(gem.home.x, gem.home.y + Math.sin(bob * 3 + gem.home.x) * 1.2);

      if (player.overlaps(gem.sprite, 8, 8)) {
        gem.taken = true;
        gem.sprite.active = false;
        gem.sprite.setPosition(-999, -999);
        collected++;
        el.gems.textContent = String(collected);
        sparks.burst(gem.home.x + 4, gem.home.y + 4, 14, {
          colorStart: [41, 173, 255, 255],
          colorEnd: [255, 255, 255, 0],
          speedMin: 20, speedMax: 70, lifeMin: 0.2, lifeMax: 0.6,
        });
        sfx.play(880 + collected * 40, 'triangle', 0.4);
        setTimeout(() => sfx.stop(), 90);
      }
    }

    // --- Exit -------------------------------------------------------------
    portal.setPosition(exitAt.x, exitAt.y + Math.sin(bob * 2) * 1.5);

    if (player.overlaps(portal, 8, 8)) {
      if (collected < GEM_TARGET) {
        setStatus(`PORTAL SEALED — ${GEM_TARGET - collected} GEMS LEFT`, '#ffa300');
      } else {
        won = true;
        setStatus('ESCAPED! PRESS ENTER TO RUN IT AGAIN', '#ffec27');
        music.play(660, 'pulse25', 0.4);
        setTimeout(() => music.stop(), 400);
        sparks.burst(portal.x + 4, portal.y + 4, 60, {
          colorStart: [255, 236, 39, 255],
          colorEnd: [41, 173, 255, 0],
          speedMin: 40, speedMax: 130, lifeMin: 0.4, lifeMax: 1.1,
        });

        if (best === null || deaths < best) {
          best = deaths;
          el.best.textContent = String(best);
          engine.raw.save_set(0, 'bestDeaths', JSON.stringify(best));
        }
      }
    }
  });
}

initGame().catch((err) => {
  console.error(err);
  const status = document.getElementById('status');
  if (status) {
    status.textContent = 'FAILED TO START — BUILD THE WASM FIRST (bun run build:wasm)';
    status.style.color = '#ff004d';
  }
});
