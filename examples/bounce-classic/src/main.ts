/**
 * BOUNCE — the classic side-on version.
 *
 * A red ball that never stops bouncing. The engine owns gravity, integration
 * and every collision against the tilemap; this file decides what a bounce
 * is worth. The whole game is one rule applied to a level: when the engine
 * zeroes your downward speed, you were standing on something, so send the
 * ball back up.
 *
 * The first-person version of this same course lives in
 * `examples/bounce-raycaster`.
 */
import { Cathode, Scene, Sprite, TileMap, SoundChannel, ParticleEmitter } from '@cathode/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;

// --- Tiles -----------------------------------------------------------------
// Tile ids are 1-based: the renderer maps id N to sheet tile N-1.
const T_EMPTY = 0;
const T_WALL = 1;   // sheet 0 — solid
const T_PLATE = 2;  // sheet 1 — solid platform
const T_SPIKE = 3;  // sheet 2 — hazard, not solid
const T_WATER = 4;  // sheet 3 — buoyant, not solid

const TILE = 8;

/**
 * The course, one character per tile.
 *   # wall    = platform   ^ spike    ~ water
 *   O ring    C checkpoint P start    X exit    . empty
 */
const LEVEL = [
  '################################################################################################',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############........................#',
  '#..........................................................############..............O.........#',
  '#..........................................................############........................#',
  '#..........................................................############.............====.......#',
  '#....................................O.....................############........................#',
  '#..........................................................############........................#',
  '#..................................======..................############........................#',
  '#................................................O.........############........====............#',
  '#...........................O..............................^^^^^^^^^^^^........................#',
  '#..................O.......................................................O...................#',
  '#.........................======.............~~~~~~~~~~....................................O...#',
  '#........O...................................~~~~~~~~~~...................====.................#',
  '#............................................~~~~~~~~~~.........O..............................#',
  '#..P.......C.....^^^^^....................C..~~~~~~~~~~.................C.................^^^.X#',
  '#################^^^^^#######################..........###################################^^^###',
  '################################################################################################',
];

const COLS = LEVEL[0].length;
const ROWS = LEVEL.length;

// --- Tuning ----------------------------------------------------------------
// The ball is deliberately floaty: a Bounce ball is light, and a heavy one
// makes the spiked ceiling section unplayable.
const ROLL_SPEED = 104;
const AIR_STEER = 340;      // px/s2 of mid-air steering; ground speed is kept
const BOUNCE_SPEED = 150;   // every landing, free of charge
const CHARGE_SPEED = 300;   // a full charge clears a five-tile pit with room
const CHARGE_TIME = 0.32;   // seconds of holding for a full charge
const GRAVITY_SCALE = 0.92;
const FLOAT_SPEED = -205;   // terminal rise speed in water, px/s
const FLOAT_ACCEL = 30;     // how fast the ball reaches it; the pool is shallow
const BALL_BOX = 7;         // collider a touch smaller than the 8px sprite
const RING_REACH = 7;       // how close counts as passing through a ring
const LIVES = 3;
const RESPAWN_FREEZE = 0.7;  // seconds of stillness after a pop

type Vec = { x: number; y: number };

function charAt(col: number, row: number): string {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return '.';
  return LEVEL[row][col];
}

function tileAt(col: number, row: number): number {
  switch (charAt(col, row)) {
    case '#': return T_WALL;
    case '=': return T_PLATE;
    case '^': return T_SPIKE;
    case '~': return T_WATER;
    default: return T_EMPTY;
  }
}

/** Sprite sheet: 4 tiles of terrain, then ball, ring, checkpoint and exit. */
function buildSheet(): { pixels: Uint8Array; w: number; h: number } {
  const TILES = 8;
  const w = TILE * TILES;
  const h = TILE;
  const px = new Uint8Array(w * h * 4);

  const set = (tile: number, tx: number, ty: number, r: number, g: number, b: number, a = 255) => {
    const i = ((ty * w) + tile * TILE + tx) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  const clear = (tile: number, tx: number, ty: number) => set(tile, tx, ty, 0, 0, 0, 0);

  for (let ty = 0; ty < TILE; ty++) {
    for (let tx = 0; tx < TILE; tx++) {
      // 0: wall — dark brick with a mortar line
      const brick = ty % 4 === 0 || (tx + (ty < 4 ? 0 : 4)) % 8 === 0;
      set(0, tx, ty, brick ? 30 : 58, brick ? 36 : 68, brick ? 60 : 104);

      // 1: platform — bright cap over a darker body
      if (ty < 2) set(1, tx, ty, 96, 200, 255);
      else set(1, tx, ty, 38, 96, 150);

      // 2: spike — upward triangle on transparent
      const half = Math.abs(tx - 3.5);
      if (ty >= 2 && half <= (ty - 1) / 1.7) set(2, tx, ty, 255, 90, 77);
      else clear(2, tx, ty);

      // 3: water — translucent blue with a wave crest on top
      if (ty === 0) set(3, tx, ty, 120, 220, 255, 210);
      else set(3, tx, ty, 34, 110, 190, 170);

      // 4: ball — red sphere with a highlight
      const dx = tx - 3.5, dy = ty - 3.5;
      const rr = dx * dx + dy * dy;
      if (rr <= 12) {
        const lit = dx + dy < -2.2;
        set(4, tx, ty, lit ? 255 : 214, lit ? 120 : 45, lit ? 100 : 40);
      } else clear(4, tx, ty);

      // 5: ring — hollow gold circle
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 3.7 && d >= 2.1) set(5, tx, ty, 255, 210, 70);
      else clear(5, tx, ty);

      // 6: checkpoint — a thin green post
      if (tx >= 3 && tx <= 4) set(6, tx, ty, 88, 214, 141);
      else clear(6, tx, ty);

      // 7: exit — a filled portal that reads as "here"
      if (d <= 3.6) set(7, tx, ty, 200, 120, 255, 200);
      else clear(7, tx, ty);
    }
  }

  // Checkpoint flag, drawn on top of the post.
  for (let ty = 1; ty < 4; ty++) for (let tx = 5; tx < 8; tx++) set(6, tx, ty, 88, 214, 141);

  return { pixels: px, w, h };
}

async function initGame() {
  const engine = await Cathode.nes(canvas, 3);
  const scene = new Scene(engine);

  const sheet = buildSheet();
  const sheetHandle = engine.raw.upload_sheet(sheet.w, sheet.h, TILE, TILE, sheet.pixels);
  engine.raw.set_bg_color(10, 13, 22);

  // --- Level geometry ------------------------------------------------------
  const map = new TileMap(scene, {
    name: 'Course',
    cols: COLS,
    rows: ROWS,
    tileWidth: TILE,
    tileHeight: TILE,
  });
  const layer = map.addLayer('Course', sheetHandle, false);

  let start: Vec = { x: TILE, y: TILE };
  let exitAt: Vec = { x: 0, y: 0 };
  const ringSpots: Vec[] = [];
  const checkpointSpots: Vec[] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = tileAt(col, row);
      if (id !== T_EMPTY) map.setTile(layer, col, row, id);

      const at = { x: col * TILE, y: row * TILE };
      switch (charAt(col, row)) {
        case 'P': start = at; break;
        case 'X': exitAt = at; break;
        case 'O': ringSpots.push(at); break;
        case 'C': checkpointSpots.push(at); break;
      }
    }
  }

  // Only walls and platforms stop the ball. Spikes and water are left out on
  // purpose so it rolls straight into them and the game can react.
  map.setSolidTiles(layer, [T_WALL, T_PLATE]);
  map.commit();

  // --- Actors --------------------------------------------------------------
  const exit = new Sprite(scene, { sheet: sheetHandle, frame: 7, x: exitAt.x, y: exitAt.y, layer: 4 });
  const checkpoints = checkpointSpots.map((at) => ({
    sprite: new Sprite(scene, { sheet: sheetHandle, frame: 6, x: at.x, y: at.y, layer: 5 }),
    at,
    reached: false,
  }));
  const rings = ringSpots.map((at) => ({
    sprite: new Sprite(scene, { sheet: sheetHandle, frame: 5, x: at.x, y: at.y, layer: 6 }),
    at,
    taken: false,
  }));

  const ball = new Sprite(scene, {
    sheet: sheetHandle,
    frame: 4,
    x: start.x,
    y: start.y,
    layer: 10,
  });

  // From here the engine owns the ball: gravity, integration and every wall,
  // floor and ceiling collision are resolved in Rust.
  ball.usePhysics({
    gravity: GRAVITY_SCALE,
    width: BALL_BOX,
    height: BALL_BOX,
    offsetX: 0.5,
    offsetY: 0.5,
  });

  // --- Feedback ------------------------------------------------------------
  const sfx = new SoundChannel(engine, 0);
  const tone = new SoundChannel(engine, 1);
  const splash = new ParticleEmitter(scene, 220);

  // --- State ---------------------------------------------------------------
  let spawn = { ...start };
  let lives = LIVES;
  let collected = 0;
  let elapsed = 0;
  let charge = 0;
  let dead = false;
  let won = false;
  let respawnFreeze = 0;

  const el = {
    rings: document.getElementById('rings')!,
    total: document.getElementById('rings-total')!,
    lives: document.getElementById('lives')!,
    time: document.getElementById('time')!,
    status: document.getElementById('status')!,
    charge: document.getElementById('charge')!,
  };
  el.total.textContent = String(rings.length);

  const setStatus = (text: string, colour: string) => {
    el.status.textContent = text;
    el.status.style.color = colour;
  };

  const camMaxX = Math.max(0, COLS * TILE - engine.width);
  const camMaxY = Math.max(0, ROWS * TILE - engine.height);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  /** Which terrain tile is the ball's centre inside right now? */
  function terrainUnder(): number {
    return tileAt(Math.floor((ball.x + TILE / 2) / TILE), Math.floor((ball.y + TILE / 2) / TILE));
  }

  /** Is there solid ground directly beneath the ball? */
  function onGround(): boolean {
    const left = Math.floor((ball.x + 0.5) / TILE);
    const right = Math.floor((ball.x + 0.5 + BALL_BOX - 0.01) / TILE);
    const row = Math.floor((ball.y + 0.5 + BALL_BOX + 1) / TILE);
    for (let col = left; col <= right; col++) {
      const t = tileAt(col, row);
      if (t === T_WALL || t === T_PLATE) return true;
    }
    return false;
  }

  /** Does the ball's box touch any spike? */
  function onSpikes(): boolean {
    const left = Math.floor((ball.x + 0.5) / TILE);
    const right = Math.floor((ball.x + 0.5 + BALL_BOX - 0.01) / TILE);
    const top = Math.floor((ball.y + 0.5) / TILE);
    const bottom = Math.floor((ball.y + 0.5 + BALL_BOX - 0.01) / TILE);
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        if (tileAt(col, row) === T_SPIKE) return true;
      }
    }
    return false;
  }

  function respawn() {
    // setPosition, not `ball.x = ...`: under usePhysics the engine owns the
    // position and would overwrite a direct assignment on the next frame.
    ball.setPosition(spawn.x, spawn.y);
    ball.move(0, 0);
    charge = 0;
    dead = false;
    respawnFreeze = RESPAWN_FREEZE;
  }

  function pop() {
    if (dead) return;
    dead = true;
    lives--;
    el.lives.textContent = String(Math.max(0, lives));
    engine.raw.shake(4, 0.3);
    sfx.play(70, 'noise', 0.55);
    splash.burst(ball.x + 4, ball.y + 4, 26);

    if (lives <= 0) {
      setStatus('OUT OF BALLS — ENTER TO TRY AGAIN', '#ff5a4d');
    } else {
      setStatus('POP! BACK TO THE LAST FLAG', '#ff5a4d');
      respawn();
    }
  }

  function restart() {
    lives = LIVES;
    collected = 0;
    elapsed = 0;
    won = false;
    spawn = { ...start };
    el.lives.textContent = String(lives);
    el.rings.textContent = '0';
    for (const ring of rings) {
      ring.taken = false;
      ring.sprite.active = true;
      ring.sprite.setPosition(ring.at.x, ring.at.y);
    }
    for (const cp of checkpoints) cp.reached = false;
    respawn();
    setStatus('ROLL RIGHT — PASS THROUGH EVERY RING', '#58d68d');
  }

  restart();

  // Exposed for the headless checks in the repo's verification scripts.
  (window as unknown as Record<string, unknown>).__bounce = {
    state: () => ({
      x: ball.x, y: ball.y, vx: ball.velocityX, vy: ball.velocityY,
      grounded: onGround(), rings: collected, total: rings.length, lives, won,
    }),
    teleport: (col: number, row: number) => {
      ball.setPosition(col * TILE, row * TILE);
      ball.move(0, 0);
      respawnFreeze = 0;
    },
  };

  engine.loop((dt) => {
    scene.update(dt);

    engine.setCamera(
      clamp(ball.x - engine.width / 2, 0, camMaxX),
      clamp(ball.y - engine.height / 2, 0, camMaxY),
    );

    if (won || lives <= 0) {
      if (engine.input.justPressed(0, 'start')) restart();
      return;
    }

    elapsed += dt;
    const mins = Math.floor(elapsed / 60);
    el.time.textContent = `${mins}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;

    // A pop leaves the ball still for a moment. Without it, a player holding
    // right when they die is driven straight back into the spikes that killed
    // them, and one mistake eats every life.
    if (respawnFreeze > 0) {
      respawnFreeze -= dt;
      ball.move(0, 0);
      return;
    }

    const inWater = terrainUnder() === T_WATER;
    const grounded = onGround();

    // --- Steering ----------------------------------------------------------
    // On the ground you simply set your speed. In the air the ball keeps the
    // speed it took off with and steering only nudges it: scaling airborne
    // speed down instead makes a bounce shorter than its run-up, and no
    // charged hop can then clear a gap you were sprinting at.
    const wanted =
      (engine.input.held(0, 'right') ? 1 : 0) - (engine.input.held(0, 'left') ? 1 : 0);
    let vx: number;
    if (grounded) {
      vx = wanted * ROLL_SPEED;
    } else {
      vx = clamp(ball.velocityX + wanted * AIR_STEER * dt, -ROLL_SPEED, ROLL_SPEED);
    }

    let vy = ball.velocityY;

    // --- The one rule ------------------------------------------------------
    // Touching the ground sends the ball back up. Holding the bounce button
    // pins it down instead, winding up a bigger hop the longer you hold.
    if (grounded && !inWater) {
      if (engine.input.held(0, 'a')) {
        charge = Math.min(CHARGE_TIME, charge + dt);
        vy = 0;
      } else if (charge > 0) {
        const power = charge / CHARGE_TIME;
        vy = -(BOUNCE_SPEED + (CHARGE_SPEED - BOUNCE_SPEED) * power);
        charge = 0;
        sfx.play(180 + 260 * power, 'pulse50', 0.4);
      } else {
        // A ball that stops bouncing is not a Bounce ball.
        vy = -BOUNCE_SPEED;
        sfx.play(180, 'pulse50', 0.25);
      }
    }

    // --- Water -------------------------------------------------------------
    // Water gives the ball a terminal *rise* speed instead of a push. An
    // upward force plus drag has to be tuned against whatever gravity the
    // engine added that frame, which makes the lift depend on the frame rate;
    // easing toward a speed does not.
    if (inWater) {
      vy += (FLOAT_SPEED - vy) * Math.min(1, FLOAT_ACCEL * dt);
      vx *= 0.8;
      charge = 0;
      if (Math.random() < 0.25) splash.burst(ball.x + 4, ball.y + 2, 1);
    }

    ball.move(vx, vy);
    // Show the wind-up. The ball keeps bouncing while you hold, so without a
    // meter there is no way to tell a half charge from a full one.
    el.charge.style.width = `${(charge / CHARGE_TIME) * 100}%`;

    // --- Rings -------------------------------------------------------------
    for (const ring of rings) {
      if (ring.taken) continue;
      if (Math.abs(ball.x - ring.at.x) < RING_REACH && Math.abs(ball.y - ring.at.y) < RING_REACH) {
        ring.taken = true;
        ring.sprite.active = false;
        // Parked off-screen as well as deactivated: a sprite the engine still
        // knows about will keep drawing wherever it last stood.
        ring.sprite.setPosition(-9999, -9999);
        collected++;
        el.rings.textContent = String(collected);
        tone.play(660 + collected * 40, 'triangle', 0.35);
        splash.burst(ring.at.x + 4, ring.at.y + 4, 10);
        if (collected === rings.length) {
          setStatus('EVERY RING — THE EXIT IS OPEN', '#c878ff');
        }
      }
    }

    // --- Checkpoints -------------------------------------------------------
    for (const cp of checkpoints) {
      if (cp.reached) continue;
      if (Math.abs(ball.x - cp.at.x) < 10 && Math.abs(ball.y - cp.at.y) < 12) {
        cp.reached = true;
        spawn = { ...cp.at };
        tone.play(520, 'triangle', 0.3);
        setStatus('CHECKPOINT', '#58d68d');
      }
    }

    // --- Hazards and the exit ----------------------------------------------
    if (onSpikes()) {
      pop();
      return;
    }

    if (Math.abs(ball.x - exitAt.x) < 10 && Math.abs(ball.y - exitAt.y) < 12) {
      if (collected < rings.length) {
        setStatus(`THE EXIT WANTS ALL ${rings.length} RINGS`, '#ffd246');
      } else {
        won = true;
        setStatus(`FINISHED IN ${el.time.textContent} — ENTER TO PLAY AGAIN`, '#c878ff');
        tone.play(880, 'triangle', 0.6);
      }
    }
  });
}

initGame().catch((err) => {
  document.getElementById('status')!.textContent = `FAILED TO START: ${err}`;
});
