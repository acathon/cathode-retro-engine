/**
 * The Studio project model.
 *
 * A project is a list of sprites; each owns its pixels, its transform, its
 * physics opt-in and its own stack of blocks — the same shape Scratch uses,
 * and the reason the scene tree can switch every panel at once.
 */
import type { Script } from '@cathode/blocks';

export const TILE = 16;
export const FRAME_PIXELS = TILE * TILE;

/** Engine's default palette (PICO-8 derived). Index 0 is transparent. */
export const PALETTE: string[] = [
  'transparent',
  '#000000', '#1D2B53', '#7E2553', '#008751',
  '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
  '#FF004D', '#FFA300', '#FFEC27', '#00E436',
  '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA',
];

/** One frame: palette indices, one per pixel. */
export type Frame = Uint8Array;

export interface StudioSprite {
  id: string;
  name: string;
  frames: Frame[];
  x: number;
  y: number;
  layer: number;
  visible: boolean;
  /** Undefined means the sprite is moved by blocks alone, not by physics. */
  physics?: {
    gravity: number;
    width: number;
    height: number;
    solid: boolean;
  };
  /** Blockly serialization for this sprite's own scripts. */
  workspace: unknown;
  /** Cached conversion of `workspace`, refreshed when the sprite is active. */
  scripts: Script[];
}

export interface StudioSound {
  name: string;
  waveform: string;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** 16 steps of note names, or null for a rest. */
  steps: (string | null)[];
  bpm: number;
}

/** The first-person map, used when the project runs in raycaster mode. */
export interface RaycastMapData {
  cols: number;
  rows: number;
  /** 0 = open floor, 1..3 = wall textures. */
  cells: number[];
  spawnX: number;
  spawnY: number;
  spawnAngle: number;
  fogDist: number;
}

/**
 * The 2D level: a tile grid painted with the project's own sprites.
 *
 * Tile 0 is empty; tile N draws sprite N-1's first frame. Reusing the
 * sprites you already drew means there is no separate tileset to manage —
 * paint the pixel editor, then paint the level with it.
 */
export interface LevelData {
  cols: number;
  rows: number;
  /** Pixels per tile. Matches the sprite frame size.  */
  tileSize: number;
  /** cols * rows entries; 0 is empty, N draws sprite N-1. */
  tiles: number[];
  /** Tile ids the engine's physics treats as walls. */
  solid: number[];
  spawnCol: number;
  spawnRow: number;
  /** Background colour behind the level, as r,g,b. */
  bg: [number, number, number];
}

export type ProjectMode = '2d' | 'raycaster';

export interface StudioProject {
  name: string;
  /** 2D sprite game, or a first-person raycaster game. */
  mode: ProjectMode;
  sprites: StudioSprite[];
  level: LevelData;
  raycast: RaycastMapData;
  sound: StudioSound;
  activeSpriteId: string | null;
}

/** A small starter maze: solid border, a couple of interior walls. */
export function defaultRaycastMap(): RaycastMapData {
  const cols = 16;
  const rows = 16;
  const cells = new Array(cols * rows).fill(0);

  for (let i = 0; i < cols; i++) {
    cells[i] = 1;                       // top
    cells[(rows - 1) * cols + i] = 1;   // bottom
    cells[i * cols] = 1;                // left
    cells[i * cols + cols - 1] = 1;     // right
  }
  for (let r = 4; r < 11; r++) cells[r * cols + 6] = 2;
  for (let c = 6; c < 12; c++) cells[10 * cols + c] = 2;
  cells[7 * cols + 13] = 3;             // a gold door to aim for

  return { cols, rows, cells, spawnX: 2.5, spawnY: 2.5, spawnAngle: 0, fogDist: 9 };
}

/**
 * A starter level: a floor, two ledges, and a spawn on the left.
 *
 * `groundTile` is which sprite paints it — 1-based, matching the tile ids —
 * so the floor is made of the Ground sprite rather than of whatever happens
 * to be first in the list.
 */
export function defaultLevel(groundTile = 2): LevelData {
  const cols = 32;
  const rows = 15;
  const tiles = new Array(cols * rows).fill(0);
  const at = (c: number, r: number) => r * cols + c;

  for (let c = 0; c < cols; c++) tiles[at(c, rows - 1)] = groundTile;
  for (let c = 6; c < 12; c++) tiles[at(c, rows - 5)] = groundTile;
  for (let c = 18; c < 25; c++) tiles[at(c, rows - 8)] = groundTile;

  return {
    cols,
    rows,
    tileSize: TILE,
    tiles,
    solid: [groundTile],
    spawnCol: 2,
    spawnRow: rows - 2,
    bg: [29, 34, 41],
  };
}

/** Resize a level, keeping whatever tiles still fit. */
export function resizeLevel(level: LevelData, cols: number, rows: number): void {
  const next = new Array(cols * rows).fill(0);
  const keepCols = Math.min(cols, level.cols);
  const keepRows = Math.min(rows, level.rows);
  for (let r = 0; r < keepRows; r++) {
    for (let c = 0; c < keepCols; c++) {
      next[r * cols + c] = level.tiles[r * level.cols + c] ?? 0;
    }
  }
  level.tiles = next;
  level.cols = cols;
  level.rows = rows;
  // A spawn left outside the new bounds would put the player in the void.
  level.spawnCol = Math.min(level.spawnCol, cols - 1);
  level.spawnRow = Math.min(level.spawnRow, rows - 1);
}

let counter = 0;
export function nextId(prefix = 'sprite'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function blankFrame(): Frame {
  return new Uint8Array(FRAME_PIXELS);
}

/** A small filled circle, so a new sprite is visible rather than blank. */
function starterFrame(colour: number): Frame {
  const f = blankFrame();
  const c = (TILE - 1) / 2;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const dx = x - c;
      const dy = y - c;
      if (dx * dx + dy * dy <= (TILE / 2 - 1.5) ** 2) f[y * TILE + x] = colour;
    }
  }
  return f;
}

export function createSprite(name: string, colour = 11): StudioSprite {
  return {
    id: nextId(),
    name,
    frames: [starterFrame(colour)],
    x: 120,
    y: 90,
    layer: 10,
    visible: true,
    physics: { gravity: 1, width: TILE, height: TILE, solid: false },
    workspace: null,
    scripts: [],
  };
}

export function defaultSound(): StudioSound {
  return {
    name: 'Blip',
    waveform: 'pulse50',
    attack: 0.01,
    decay: 0.08,
    sustain: 0.5,
    release: 0.12,
    steps: ['C4', null, 'E4', null, 'G4', null, 'C5', null,
            'G4', null, 'E4', null, 'C4', null, null, null],
    bpm: 140,
  };
}

export function createProject(): StudioProject {
  const player = createSprite('Player', 11);
  const ground = createSprite('Ground', 4);

  // A wide, flat platform to stand on.
  ground.frames = [(() => {
    const f = blankFrame();
    for (let y = 0; y < 4; y++) for (let x = 0; x < TILE; x++) f[y * TILE + x] = 12;
    for (let y = 4; y < TILE; y++) for (let x = 0; x < TILE; x++) f[y * TILE + x] = 4;
    return f;
  })()];
  // The floor is painted in the level editor now, so the Ground sprite is a
  // tile to paint with rather than a body sitting in the scene. Parked out of
  // the way so it does not double up on the level's own floor.
  ground.x = 0;
  ground.y = -TILE * 2;
  ground.layer = 4;

  return {
    name: 'Untitled Project',
    mode: '2d',
    sprites: [player, ground],
    level: defaultLevel(2),
    raycast: defaultRaycastMap(),
    sound: defaultSound(),
    activeSpriteId: player.id,
  };
}

// --- Persistence -----------------------------------------------------------
const STORAGE_KEY = 'retro-studio-project';

interface SerialisedSprite extends Omit<StudioSprite, 'frames' | 'scripts'> {
  frames: number[][];
}

export function saveProject(project: StudioProject): void {
  try {
    const data = {
      ...project,
      sprites: project.sprites.map((s) => ({
        ...s,
        frames: s.frames.map((f) => Array.from(f)),
        scripts: undefined,
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // A full or blocked localStorage must never take the editor down.
  }
}

export function loadProject(): StudioProject | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StudioProject & { sprites: SerialisedSprite[] };
    if (!Array.isArray(data.sprites) || !data.sprites.length) return null;

    return {
      ...data,
      mode: data.mode === 'raycaster' ? 'raycaster' : '2d',
      // Merged against the defaults so a project saved before levels existed
      // still opens, rather than loading with an undefined grid.
      level: { ...defaultLevel(), ...(data.level ?? {}) },
      raycast: { ...defaultRaycastMap(), ...(data.raycast ?? {}) },
      sound: { ...defaultSound(), ...(data.sound ?? {}) },
      sprites: data.sprites.map((s) => ({
        ...s,
        frames: (s.frames ?? []).map((f) => Uint8Array.from(f)),
        scripts: [],
      })),
    };
  } catch {
    return null;
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// --- Rendering helpers -----------------------------------------------------
function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Pack every sprite's frames into one RGBA sheet for the engine.
 * Returns the sheet plus, per sprite, the frame index it starts at.
 */
export function buildSheet(sprites: StudioSprite[]): {
  pixels: Uint8Array;
  width: number;
  height: number;
  firstFrame: Map<string, number>;
} {
  const frames: Frame[] = [];
  const firstFrame = new Map<string, number>();

  for (const sprite of sprites) {
    firstFrame.set(sprite.id, frames.length);
    if (!sprite.frames.length) frames.push(blankFrame());
    else frames.push(...sprite.frames);
  }
  if (!frames.length) frames.push(blankFrame());

  const width = frames.length * TILE;
  const pixels = new Uint8Array(width * TILE * 4);

  frames.forEach((frame, index) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const idx = frame[y * TILE + x] ?? 0;
        const dst = ((y * width) + index * TILE + x) * 4;
        if (idx === 0) continue; // transparent
        const [r, g, b] = hexToRgb(PALETTE[idx] ?? '#FFFFFF');
        pixels[dst] = r;
        pixels[dst + 1] = g;
        pixels[dst + 2] = b;
        pixels[dst + 3] = 255;
      }
    }
  });

  return { pixels, width, height: TILE, firstFrame };
}
