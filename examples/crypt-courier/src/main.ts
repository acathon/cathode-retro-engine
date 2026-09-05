/**
 * CRYPT COURIER — a first-person crawl built on the engine's DDA raycaster.
 *
 * Every crypt is generated at run time with a recursive-backtracker maze, so
 * no two runs share a layout. Relics are hidden in the dead ends; collect
 * them all and the golden door unseals, which is done by rebuilding the
 * raycast map with that cell opened and restoring the camera where it stood.
 */
import { Cathode, Raycaster, SoundChannel } from '@cathode/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const minimap = document.getElementById('minimap') as HTMLCanvasElement;

// --- Map constants ---------------------------------------------------------
// Wall types are 1-based; the raycaster reads wall type N from texture N-1.
const W_STONE = 1;
const W_MOSS = 2;
const W_DOOR = 3;
const TEX_RELIC = 3;   // billboards index the texture array directly

const CELLS = 9;                    // maze cells per side
const GRID = CELLS * 2 + 1;         // walls between cells -> odd grid
const TEX = 32;
const RELIC_COUNT = 5;
const PICKUP_RANGE = 0.55;

type Cell = { x: number; y: number };

// --- Deterministic RNG so a seed reproduces a crypt exactly ----------------
function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

/** Recursive-backtracker maze. Returns a GRID x GRID array of wall types. */
function generateMaze(rand: () => number): number[] {
  const cells = new Array(GRID * GRID).fill(W_STONE);
  const at = (x: number, y: number) => y * GRID + x;
  const visited = new Set<string>();
  const stack: Cell[] = [];

  const start = { x: 0, y: 0 };
  visited.add('0,0');
  stack.push(start);
  cells[at(1, 1)] = 0;

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const dirs: Cell[] = [
      { x: cur.x + 1, y: cur.y },
      { x: cur.x - 1, y: cur.y },
      { x: cur.x, y: cur.y + 1 },
      { x: cur.x, y: cur.y - 1 },
    ].filter(
      (n) => n.x >= 0 && n.y >= 0 && n.x < CELLS && n.y < CELLS && !visited.has(`${n.x},${n.y}`),
    );

    if (!dirs.length) { stack.pop(); continue; }

    const next = dirs[Math.floor(rand() * dirs.length) % dirs.length];
    visited.add(`${next.x},${next.y}`);

    // Carve the cell and the wall between it and the current cell.
    const gx = next.x * 2 + 1, gy = next.y * 2 + 1;
    const wx = cur.x * 2 + 1 + (gx - (cur.x * 2 + 1)) / 2;
    const wy = cur.y * 2 + 1 + (gy - (cur.y * 2 + 1)) / 2;
    cells[at(gx, gy)] = 0;
    cells[at(wx, wy)] = 0;

    stack.push(next);
  }

  // Knock a few extra holes so the maze has loops instead of one long path.
  for (let i = 0; i < CELLS; i++) {
    const x = 1 + Math.floor(rand() * (GRID - 2));
    const y = 1 + Math.floor(rand() * (GRID - 2));
    if ((x % 2 === 1) !== (y % 2 === 1)) cells[at(x, y)] = 0;
  }

  // Scatter mossy walls for visual variety.
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === W_STONE && rand() < 0.28) cells[i] = W_MOSS;
  }

  return cells;
}

/** Cells with exactly one open neighbour — the natural place to hide things. */
function deadEnds(cells: number[]): Cell[] {
  const out: Cell[] = [];
  for (let cy = 0; cy < CELLS; cy++) {
    for (let cx = 0; cx < CELLS; cx++) {
      const gx = cx * 2 + 1, gy = cy * 2 + 1;
      if (cells[gy * GRID + gx] !== 0) continue;
      let open = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (cells[(gy + dy) * GRID + (gx + dx)] === 0) open++;
      }
      if (open === 1) out.push({ x: gx, y: gy });
    }
  }
  return out;
}

// --- Procedural textures ---------------------------------------------------
function stoneTexture(): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const i = (y * TEX + x) * 4;
    const row = Math.floor(y / 8);
    const bx = (x + (row % 2) * 8) % 16;
    const mortar = bx < 1 || y % 8 === 0;
    const n = ((x * 13 + y * 7) % 18) - 9;
    if (mortar) { p[i] = 32; p[i + 1] = 30; p[i + 2] = 34; }
    else { p[i] = 96 + n; p[i + 1] = 88 + n; p[i + 2] = 74 + n; }
    p[i + 3] = 255;
  }
  return p;
}

function mossTexture(): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const i = (y * TEX + x) * 4;
    const n = ((x * 17 + y * 11) % 20) - 10;
    const moss = ((x * 5 + y * 3) % 13) < 5 && y > TEX * 0.35;
    if (moss) { p[i] = 40 + n; p[i + 1] = 92 + n; p[i + 2] = 46 + n; }
    else { p[i] = 74 + n; p[i + 1] = 70 + n; p[i + 2] = 62 + n; }
    p[i + 3] = 255;
  }
  return p;
}

function doorTexture(): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const i = (y * TEX + x) * 4;
    const frame = x < 3 || x >= TEX - 3 || y < 3 || y >= TEX - 3;
    const ring = Math.abs(Math.hypot(x - TEX / 2, y - TEX / 2) - 8) < 1.6;
    const n = ((x * 3 + y * 5) % 14) - 7;
    if (frame) { p[i] = 120; p[i + 1] = 94; p[i + 2] = 32; }
    else if (ring) { p[i] = 255; p[i + 1] = 214; p[i + 2] = 92; }
    else { p[i] = 168 + n; p[i + 1] = 132 + n; p[i + 2] = 44 + n; }
    p[i + 3] = 255;
  }
  return p;
}

function relicTexture(): Uint8Array {
  const p = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const i = (y * TEX + x) * 4;
    // A chalice: bowl, stem and base, on transparent.
    const cx = x - TEX / 2;
    const bowl = y > 6 && y < 16 && Math.abs(cx) < 8 - (y - 6) * 0.35;
    const stem = y >= 16 && y < 24 && Math.abs(cx) < 2;
    const base = y >= 24 && y < 27 && Math.abs(cx) < 7;
    if (bowl || stem || base) {
      const glow = 1 - Math.min(1, Math.abs(cx) / 9);
      p[i] = 200 + 55 * glow; p[i + 1] = 160 + 70 * glow; p[i + 2] = 40; p[i + 3] = 255;
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
  const amb = new SoundChannel(engine, 1);

  const el = {
    relics: document.getElementById('relics')!,
    total: document.getElementById('relics-total')!,
    depth: document.getElementById('depth')!,
    time: document.getElementById('time')!,
    status: document.getElementById('status')!,
  };
  const mctx = minimap.getContext('2d')!;

  let rc!: Raycaster;
  let cells: number[] = [];
  let relics: { id: number; x: number; y: number; taken: boolean }[] = [];
  let door: Cell = { x: 0, y: 0 };
  let doorOpen = false;
  let collected = 0;
  let depth = 1;
  let elapsed = 0;
  let won = false;
  let seen = new Set<string>();

  const setStatus = (text: string, colour: string) => {
    el.status.textContent = text;
    el.status.style.color = colour;
  };

  function uploadTextures() {
    rc.setTextureFromPixels(W_STONE, stoneTexture(), TEX);
    rc.setTextureFromPixels(W_MOSS, mossTexture(), TEX);
    rc.setTextureFromPixels(W_DOOR, doorTexture(), TEX);
    rc.setTextureFromPixels(TEX_RELIC + 1, relicTexture(), TEX);
    rc.setFloorColor(28, 24, 22);
    rc.setCeilingColor(12, 10, 16);
    rc.setFog(7.5, 6, 5, 9);
  }

  /** Rebuild the raycast map from `cells`, keeping the camera where it is. */
  function rebuildMap(keepPose = true) {
    const pose = keepPose && rc ? rc.pos : null;
    rc = new Raycaster(engine, { cols: GRID, rows: GRID, cells });
    uploadTextures();
    for (const relic of relics) {
      if (!relic.taken) rc.addBillboard(relic.id, relic.x, relic.y, TEX_RELIC, 0.55);
    }
    if (pose) rc.setPos(pose.x, pose.y, pose.angle);
  }

  function newCrypt(seed: number) {
    const rand = makeRng(seed);
    cells = generateMaze(rand);

    // The entrance cell is itself a dead end; drop it and anything adjacent
    // so a relic never spawns on top of the player at spawn.
    const ends = deadEnds(cells).filter((c) => Math.hypot(c.x - 1, c.y - 1) > 3);

    // Farthest dead end from the entrance becomes the sealed door.
    ends.sort((a, b) => (b.x + b.y) - (a.x + a.y));
    door = ends.length ? ends[0] : { x: GRID - 2, y: GRID - 2 };
    cells[door.y * GRID + door.x] = W_DOOR;

    const spots = ends.slice(1);
    relics = [];
    for (let i = 0; i < RELIC_COUNT && spots.length; i++) {
      const pick = spots.splice(Math.floor(rand() * spots.length) % spots.length, 1)[0];
      relics.push({ id: i + 1, x: pick.x + 0.5, y: pick.y + 0.5, taken: false });
    }

    collected = 0;
    doorOpen = false;
    won = false;
    elapsed = 0;
    seen = new Set();

    rc = undefined as unknown as Raycaster;
    rebuildMap(false);

    // Face down an open corridor rather than straight into a wall.
    const headings: [number, number, number][] = [
      [1, 0, 0],                    // east
      [0, 1, Math.PI / 2],          // south
      [-1, 0, Math.PI],             // west
      [0, -1, -Math.PI / 2],        // north
    ];
    const opening = headings.find(([dx, dy]) => cells[(1 + dy) * GRID + (1 + dx)] === 0);
    rc.setPos(1.5, 1.5, opening ? opening[2] : 0);

    el.relics.textContent = '0';
    el.total.textContent = String(relics.length);
    el.depth.textContent = String(depth);
    setStatus('FIND THE RELICS — THE GOLDEN DOOR IS SEALED', '#9fd98f');
  }

  function drawMinimap(px: number, py: number, angle: number) {
    const s = minimap.width / GRID;
    mctx.clearRect(0, 0, minimap.width, minimap.height);

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!seen.has(`${x},${y}`)) continue;      // fog of war
        const v = cells[y * GRID + x];
        if (v === 0) mctx.fillStyle = '#2a2620';
        else if (v === W_DOOR) mctx.fillStyle = doorOpen ? '#ffd65c' : '#8a6a1e';
        else mctx.fillStyle = '#584c3c';
        mctx.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s));
      }
    }

    for (const relic of relics) {
      if (relic.taken || !seen.has(`${Math.floor(relic.x)},${Math.floor(relic.y)}`)) continue;
      mctx.fillStyle = '#ffcc44';
      mctx.fillRect(relic.x * s - 1.5, relic.y * s - 1.5, 3, 3);
    }

    mctx.fillStyle = '#9fd98f';
    mctx.fillRect(px * s - 1.5, py * s - 1.5, 3, 3);
    mctx.strokeStyle = '#9fd98f';
    mctx.beginPath();
    mctx.moveTo(px * s, py * s);
    mctx.lineTo(px * s + Math.cos(angle) * 7, py * s + Math.sin(angle) * 7);
    mctx.stroke();
  }

  newCrypt((Math.random() * 0xffffffff) >>> 0);

  let ambTimer = 0;
  engine.loop((dt) => {
    const pose = rc.pos;

    if (engine.input.justPressed(0, 'start')) {
      depth++;
      newCrypt((Math.random() * 0xffffffff) >>> 0);
      return;
    }

    if (!won) {
      elapsed += dt;
      const mins = Math.floor(elapsed / 60);
      const secs = Math.floor(elapsed % 60);
      el.time.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

      // Movement. The raycaster resolves wall collisions itself, sliding
      // along whichever axis is blocked.
      let forward = 0, strafe = 0, turn = 0;
      if (engine.input.held(0, 'up')) forward = 1;
      if (engine.input.held(0, 'down')) forward = -1;
      if (engine.input.held(0, 'left')) turn = -1;
      if (engine.input.held(0, 'right')) turn = 1;
      if (engine.input.held(0, 'l')) strafe = -1;
      if (engine.input.held(0, 'r')) strafe = 1;
      rc.move(forward, strafe, turn, dt);

      // Footsteps
      if (forward !== 0 || strafe !== 0) {
        ambTimer += dt;
        if (ambTimer > 0.34) {
          ambTimer = 0;
          amb.play(70, 'noise', 0.16);
          setTimeout(() => amb.stop(), 45);
        }
      }
    }

    // Reveal the 3x3 around the player for the minimap's fog of war.
    const cx = Math.floor(pose.x), cy = Math.floor(pose.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) seen.add(`${cx + dx},${cy + dy}`);
    }

    // --- Relics -----------------------------------------------------------
    for (const relic of relics) {
      if (relic.taken) continue;
      if (Math.hypot(relic.x - pose.x, relic.y - pose.y) < PICKUP_RANGE) {
        relic.taken = true;
        rc.removeBillboard(relic.id);
        collected++;
        el.relics.textContent = String(collected);
        sfx.play(660 + collected * 90, 'triangle', 0.4);
        setTimeout(() => sfx.stop(), 110);

        if (collected >= relics.length && !doorOpen) {
          doorOpen = true;
          cells[door.y * GRID + door.x] = 0;   // unseal it
          rebuildMap();
          setStatus('THE GOLDEN DOOR GRINDS OPEN — FIND IT', '#ffcc44');
          sfx.play(180, 'sawtooth', 0.45);
          setTimeout(() => sfx.stop(), 420);
        } else if (!doorOpen) {
          setStatus(`RELIC RECOVERED — ${relics.length - collected} REMAIN`, '#9fd98f');
        }
      }
    }

    // --- Escape -----------------------------------------------------------
    if (doorOpen && !won) {
      if (Math.hypot(door.x + 0.5 - pose.x, door.y + 0.5 - pose.y) < 0.7) {
        won = true;
        setStatus(`ESCAPED DEPTH ${depth} — PRESS ENTER TO DELVE DEEPER`, '#ffd65c');
        sfx.play(880, 'pulse50', 0.45);
        setTimeout(() => sfx.stop(), 500);
      }
    }

    drawMinimap(pose.x, pose.y, pose.angle);
  });
}

initGame().catch((err) => {
  console.error(err);
  const status = document.getElementById('status');
  if (status) {
    status.textContent = 'FAILED TO START — BUILD THE WASM FIRST (bun run build:wasm)';
    status.style.color = '#ff5566';
  }
});
