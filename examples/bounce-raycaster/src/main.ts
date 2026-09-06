/**
 * BOUNCE 3D — the same game as `examples/bounce-classic`, seen from inside
 * the ball.
 *
 * The rules are unchanged: you never stop bouncing, holding the bounce
 * button winds up a bigger hop, water carries you upward and spikes pop you.
 * What changes is that there is no side-on view to read, so the bounce has
 * to be felt instead: the camera's eye height *is* the ball's height off the
 * floor, and the pitch leans with the arc. Both come from the vertical axis
 * the raycaster gained for this game — before it, every first-person scene
 * was pinned to the horizon.
 *
 * Height is simulated here rather than by the ECS physics, because the
 * raycaster's world is a grid of cells with no floor geometry to collide
 * with: there is exactly one floor, at zero.
 */
import { Cathode, Raycaster, SoundChannel } from '@cathode/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const minimap = document.getElementById('minimap') as HTMLCanvasElement;

// --- Map -------------------------------------------------------------------
// Wall types are 1-based; the raycaster reads wall type N from texture N-1.
const W_WALL = 1;
const W_GLASS = 2;   // the bright blue trim, purely to read corners by
const W_EXIT = 3;
const TEX_RING = 3;  // billboards index the texture array directly
const TEX_SPIKE = 4;

const TEX = 32;

/**
 * The arena, one character per cell.
 *   # wall   | glass   X exit    ~ water   ^ spike
 *   O ring at rolling height       Q ring you have to bounce to
 *   P start  . floor
 */
const MAP = [
  '####################',
  '#P.......|.........#',
  '#..O..#..|....Q....#',
  '#.....#..|.....#...#',
  '#..^..#..........#.#',
  '#.....####|###...#.#',
  '#..........Q.......#',
  '#.###..~~~~~~..###.#',
  '#.#....~~~~~~....#.#',
  '#.#..O.~~~~~~..O.#.#',
  '#.#....~~~~~~....#.#',
  '#.###..~~~~~~..###.#',
  '#.........^........#',
  '#..|##....Q....##|.#',
  '#..#..........O..#.#',
  '#..#..^....^.....#.#',
  '#..######...######.#',
  '#........O........X#',
  '#..O...............#',
  '####################',
];

const COLS = MAP[0].length;
const ROWS = MAP.length;

// --- Tuning ----------------------------------------------------------------
// Heights are in cells: 0 is the floor, 1.0 the ceiling. The eye rides at
// 0.28 + height, so a resting ball still sees over the floor.
const EYE_REST = 0.28;
const GRAVITY = 3.4;          // cells/s²
const BOUNCE_SPEED = 1.3;     // cells/s, every landing: peaks at 0.25
const CHARGE_SPEED = 2.0;     // cells/s, fully wound up: peaks just under the
                              // ceiling, so a full charge is never wasted on it
const CHARGE_TIME = 0.32;
const CEILING = 0.66;         // the ball cannot rise past this
const FLOAT_SPEED = 1.35;     // upward terminal speed in water, cells/s
const FLOAT_ACCEL = 8;
const ROLL_SPEED = 2.1;       // cells/s
const TURN_SPEED = 2.3;       // radians/s
const BODY_RADIUS = 0.22;
const RING_REACH = 0.45;
const RING_LOW = 0.30;        // sits where a rolling ball already is
// Above (eye + an uncharged bounce's peak + the gate), so a free hop cannot
// reach it, but inside a charged bounce's arc.
const RING_HIGH = 0.78;
const RING_GATE = 0.15;       // how close the ball's height must be
const SPIKE_REACH = 0.38;
const SPIKE_CLEARANCE = 0.34; // bounce above this and the spikes miss you
const PITCH_GAIN = 26;        // px of horizon lean per cell/s of rise
const LIVES = 3;
const RESPAWN_FREEZE = 0.8;

type Cell = { x: number; y: number };

function charAt(col: number, row: number): string {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return '#';
  return MAP[row][col];
}

/** Wall type for the raycast map: only '#', '|' and 'X' are solid. */
function wallAt(col: number, row: number): number {
  switch (charAt(col, row)) {
    case '#': return W_WALL;
    case '|': return W_GLASS;
    case 'X': return W_EXIT;
    default: return 0;
  }
}

// --- Procedural textures ---------------------------------------------------
function wallTexture(): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const i = (y * TEX + x) * 4;
    const row = Math.floor(y / 8);
    const bx = (x + (row % 2) * 8) % 16;
    const mortar = bx < 1 || y % 8 === 0;
    const n = ((x * 13 + y * 7) % 16) - 8;
    if (mortar) { p[i] = 22; p[i + 1] = 28; p[i + 2] = 48; }
    else { p[i] = 58 + n; p[i + 1] = 70 + n; p[i + 2] = 108 + n; }
    p[i + 3] = 255;
  }
  return p;
}

function glassTexture(): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const i = (y * TEX + x) * 4;
    const pane = x % 16 < 2 || y % 16 < 2;
    const shimmer = ((x * 5 + y * 3) % 17) < 3;
    if (pane) { p[i] = 40; p[i + 1] = 90; p[i + 2] = 130; }
    else { p[i] = shimmer ? 150 : 74; p[i + 1] = shimmer ? 225 : 168; p[i + 2] = 255; }
    p[i + 3] = 255;
  }
  return p;
}

function exitTexture(): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const i = (y * TEX + x) * 4;
    const frame = x < 3 || x >= TEX - 3 || y < 3 || y >= TEX - 3;
    const ring = Math.abs(Math.hypot(x - TEX / 2, y - TEX / 2) - 9) < 2.0;
    if (frame) { p[i] = 92; p[i + 1] = 52; p[i + 2] = 130; }
    else if (ring) { p[i] = 220; p[i + 1] = 150; p[i + 2] = 255; }
    else { p[i] = 140; p[i + 1] = 80; p[i + 2] = 200; }
    p[i + 3] = 255;
  }
  return p;
}

function ringTexture(): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const i = (y * TEX + x) * 4;
    const d = Math.hypot(x - TEX / 2 + 0.5, y - TEX / 2 + 0.5);
    if (d <= 14 && d >= 10) {
      const glow = 1 - Math.abs(d - 12) / 2;
      p[i] = 255; p[i + 1] = 180 + 60 * glow; p[i + 2] = 60; p[i + 3] = 255;
    } else {
      p[i + 3] = 0;
    }
  }
  return p;
}

function spikeTexture(): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const i = (y * TEX + x) * 4;
    // Three spikes standing on the bottom edge, on transparent.
    const band = x % 11;
    const halfWidth = ((TEX - y) / TEX) * 5;
    if (y > TEX * 0.35 && Math.abs(band - 5) < halfWidth) {
      const lit = band < 5;
      p[i] = lit ? 255 : 190; p[i + 1] = lit ? 120 : 70; p[i + 2] = 100; p[i + 3] = 255;
    } else {
      p[i + 3] = 0;
    }
  }
  return p;
}

// --- Game ------------------------------------------------------------------
async function initGame() {
  const engine = await Cathode.nes(canvas, 3);
  const sfx = new SoundChannel(engine, 0);
  const tone = new SoundChannel(engine, 1);

  const el = {
    rings: document.getElementById('rings')!,
    total: document.getElementById('rings-total')!,
    lives: document.getElementById('lives')!,
    time: document.getElementById('time')!,
    status: document.getElementById('status')!,
    charge: document.getElementById('charge')!,
  };
  const mctx = minimap.getContext('2d')!;

  // Read the arena out of the ASCII once.
  const cells: number[] = [];
  const ringSpots: { at: Cell; high: boolean }[] = [];
  const spikeSpots: Cell[] = [];
  const waterCells = new Set<string>();
  let start: Cell = { x: 1.5, y: 1.5 };
  let exitAt: Cell = { x: COLS - 2.5, y: ROWS - 2.5 };

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      cells.push(wallAt(col, row));
      const centre = { x: col + 0.5, y: row + 0.5 };
      switch (charAt(col, row)) {
        case 'O': ringSpots.push({ at: centre, high: false }); break;
        case 'Q': ringSpots.push({ at: centre, high: true }); break;
        case '^': spikeSpots.push(centre); break;
        case '~': waterCells.add(`${col},${row}`); break;
        case 'P': start = centre; break;
        case 'X': exitAt = centre; break;
      }
    }
  }

  const rc = new Raycaster(engine, { cols: COLS, rows: ROWS, cells });
  rc.setTextureFromPixels(W_WALL, wallTexture(), TEX);
  rc.setTextureFromPixels(W_GLASS, glassTexture(), TEX);
  rc.setTextureFromPixels(W_EXIT, exitTexture(), TEX);
  rc.setTextureFromPixels(TEX_RING + 1, ringTexture(), TEX);
  rc.setTextureFromPixels(TEX_SPIKE + 1, spikeTexture(), TEX);
  rc.setFloorColor(24, 30, 52);
  rc.setCeilingColor(10, 12, 24);
  rc.setFog(11, 8, 10, 20);

  const rings = ringSpots.map((spot, i) => ({
    id: i + 1,
    at: spot.at,
    height: spot.high ? RING_HIGH : RING_LOW,
    taken: false,
  }));
  for (const ring of rings) {
    rc.addBillboard(ring.id, ring.at.x, ring.at.y, TEX_RING, 0.6);
    // Where a ring hangs is the whole puzzle: a low one is on your path, a
    // high one is only reachable at the top of a charged bounce.
    rc.setBillboardElevation(ring.id, ring.height);
  }

  const SPIKE_ID_BASE = 1000;
  spikeSpots.forEach((at, i) => {
    const id = SPIKE_ID_BASE + i;
    rc.addBillboard(id, at.x, at.y, TEX_SPIKE, 0.55);
    // Standing on the floor: this is what elevation is for.
    rc.setBillboardElevation(id, 0.18);
  });

  el.total.textContent = String(rings.length);

  // --- State ---------------------------------------------------------------
  let height = 0;          // cells above the floor
  let rise = 0;            // cells per second
  let charge = 0;
  let lives = LIVES;
  let collected = 0;
  let elapsed = 0;
  let won = false;
  let respawnFreeze = 0;
  const seen = new Set<string>();

  const setStatus = (text: string, colour: string) => {
    el.status.textContent = text;
    el.status.style.color = colour;
  };

  const inWater = (x: number, y: number) =>
    waterCells.has(`${Math.floor(x)},${Math.floor(y)}`);

  function respawn() {
    rc.setPos(start.x, start.y, 0);
    height = 0;
    rise = 0;
    charge = 0;
    respawnFreeze = RESPAWN_FREEZE;
  }

  function pop() {
    lives--;
    el.lives.textContent = String(Math.max(0, lives));
    engine.raw.shake(5, 0.3);
    sfx.play(70, 'noise', 0.55);
    if (lives <= 0) {
      setStatus('OUT OF BALLS — ENTER TO TRY AGAIN', '#ff5a4d');
    } else {
      setStatus('POP! BACK TO THE START', '#ff5a4d');
      respawn();
    }
  }

  function restart() {
    lives = LIVES;
    collected = 0;
    elapsed = 0;
    won = false;
    el.lives.textContent = String(lives);
    el.rings.textContent = '0';
    for (const ring of rings) {
      if (ring.taken) {
        ring.taken = false;
        rc.addBillboard(ring.id, ring.at.x, ring.at.y, TEX_RING, 0.6);
        rc.setBillboardElevation(ring.id, ring.height);
      }
    }
    seen.clear();
    respawn();
    setStatus('ROLL THROUGH EVERY RING — THEN FIND THE EXIT', '#58d68d');
  }

  function drawMinimap(px: number, py: number, angle: number) {
    const s = minimap.width / COLS;
    mctx.clearRect(0, 0, minimap.width, minimap.height);

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (!seen.has(`${col},${row}`)) continue;
        const ch = charAt(col, row);
        if (ch === '#') mctx.fillStyle = '#2b3552';
        else if (ch === '|') mctx.fillStyle = '#4aa8d8';
        else if (ch === 'X') mctx.fillStyle = '#a45cff';
        else if (ch === '~') mctx.fillStyle = '#1d4f7a';
        else mctx.fillStyle = '#141a2c';
        mctx.fillRect(col * s, row * s, Math.ceil(s), Math.ceil(s));
      }
    }

    for (const ring of rings) {
      if (ring.taken || !seen.has(`${Math.floor(ring.at.x)},${Math.floor(ring.at.y)}`)) continue;
      mctx.fillStyle = '#ffd246';
      mctx.fillRect(ring.at.x * s - 1.5, ring.at.y * s - 1.5, 3, 3);
    }

    mctx.fillStyle = '#ff5a4d';
    mctx.beginPath();
    mctx.arc(px * s, py * s, 2.4, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = '#ff5a4d';
    mctx.beginPath();
    mctx.moveTo(px * s, py * s);
    mctx.lineTo((px + Math.cos(angle) * 1.4) * s, (py + Math.sin(angle) * 1.4) * s);
    mctx.stroke();
  }

  restart();

  // Exposed for the headless checks in the repo's verification scripts.
  (window as unknown as Record<string, unknown>).__bounce3d = {
    state: () => {
      const p = rc.pos;
      return {
        x: p.x, y: p.y, angle: p.angle, height, rise,
        rings: collected, total: rings.length, lives, won,
      };
    },
    teleport: (x: number, y: number, angle = 0) => {
      rc.setPos(x, y, angle);
      height = 0;
      rise = 0;
      respawnFreeze = 0;
    },
  };

  engine.loop((dt) => {
    const pose = rc.pos;
    seen.add(`${Math.floor(pose.x)},${Math.floor(pose.y)}`);

    if (won || lives <= 0) {
      if (engine.input.justPressed(0, 'start')) restart();
      drawMinimap(pose.x, pose.y, pose.angle);
      return;
    }

    if (respawnFreeze > 0) {
      respawnFreeze -= dt;
      drawMinimap(pose.x, pose.y, pose.angle);
      return;
    }

    elapsed += dt;
    el.time.textContent =
      `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;

    // --- Rolling -----------------------------------------------------------
    let forward = 0;
    let strafe = 0;
    let turn = 0;
    if (engine.input.held(0, 'up')) forward += 1;
    if (engine.input.held(0, 'down')) forward -= 1;
    if (engine.input.held(0, 'left')) turn -= 1;
    if (engine.input.held(0, 'right')) turn += 1;
    if (engine.input.held(0, 'l')) strafe -= 1;
    if (engine.input.held(0, 'r')) strafe += 1;

    const angle = pose.angle + turn * TURN_SPEED * dt;
    const wet = inWater(pose.x, pose.y);
    const speed = ROLL_SPEED * (wet ? 0.7 : 1) * dt;
    const dx = Math.cos(angle) * forward * speed + Math.cos(angle + Math.PI / 2) * strafe * speed;
    const dy = Math.sin(angle) * forward * speed + Math.sin(angle + Math.PI / 2) * strafe * speed;

    // slide, not setPos: the camera moves as a point and would graze corners
    // a ball with width could not fit through.
    const moved = rc.slide(pose.x, pose.y, dx, dy, BODY_RADIUS);
    rc.setPos(moved.x, moved.y, angle);

    // --- The one rule, in a vertical axis ----------------------------------
    const grounded = height <= 0.0001;
    if (wet) {
      rise += (FLOAT_SPEED - rise) * Math.min(1, FLOAT_ACCEL * dt);
      charge = 0;
    } else if (grounded) {
      if (engine.input.held(0, 'a')) {
        charge = Math.min(CHARGE_TIME, charge + dt);
        rise = 0;
      } else if (charge > 0) {
        const power = charge / CHARGE_TIME;
        rise = BOUNCE_SPEED + (CHARGE_SPEED - BOUNCE_SPEED) * power;
        charge = 0;
        sfx.play(180 + 260 * power, 'pulse50', 0.4);
      } else {
        rise = BOUNCE_SPEED;
        sfx.play(180, 'pulse50', 0.25);
      }
    } else {
      rise -= GRAVITY * dt;
    }

    height = Math.max(0, height + rise * dt);
    if (height >= CEILING && rise > 0) {
      // Clipping through the ceiling would put the eye outside the world.
      height = CEILING;
      rise = 0;
      sfx.play(120, 'noise', 0.25);
    }
    if (height <= 0) rise = Math.max(0, rise);

    // The eye rides the ball, and the horizon leans with the arc. Without the
    // lean a bounce reads as the floor moving, not as you leaving it.
    rc.setEyeHeight(EYE_REST + height);
    rc.setPitch(-rise * PITCH_GAIN);
    el.charge.style.width = `${(charge / CHARGE_TIME) * 100}%`;

    // --- Rings -------------------------------------------------------------
    for (const ring of rings) {
      if (ring.taken) continue;
      const flat = Math.hypot(moved.x - ring.at.x, moved.y - ring.at.y);
      // You pass through a ring only when you are at its height, so the high
      // ones cannot be collected by rolling underneath them.
      if (flat < RING_REACH && Math.abs(height + EYE_REST - ring.height) < RING_GATE) {
        ring.taken = true;
        rc.removeBillboard(ring.id);
        collected++;
        el.rings.textContent = String(collected);
        tone.play(660 + collected * 40, 'triangle', 0.35);
        if (collected === rings.length) {
          setStatus('EVERY RING — THE EXIT IS OPEN', '#c878ff');
        }
      }
    }

    // --- Spikes ------------------------------------------------------------
    for (const spike of spikeSpots) {
      if (Math.hypot(moved.x - spike.x, moved.y - spike.y) < SPIKE_REACH
        && height < SPIKE_CLEARANCE) {
        pop();
        drawMinimap(moved.x, moved.y, angle);
        return;
      }
    }

    // --- Exit --------------------------------------------------------------
    if (Math.hypot(moved.x - exitAt.x, moved.y - exitAt.y) < 1.3) {
      if (collected < rings.length) {
        setStatus(`THE EXIT WANTS ALL ${rings.length} RINGS`, '#ffd246');
      } else {
        won = true;
        setStatus(`FINISHED IN ${el.time.textContent} — ENTER TO PLAY AGAIN`, '#c878ff');
        tone.play(880, 'triangle', 0.6);
      }
    }

    drawMinimap(moved.x, moved.y, angle);
  });
}

initGame().catch((err) => {
  document.getElementById('status')!.textContent = `FAILED TO START: ${err}`;
});
