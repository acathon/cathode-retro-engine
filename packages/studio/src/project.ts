/**
 * The Studio project model.
 *
 * A project is a list of sprites; each owns its pixels, its transform, its
 * physics opt-in and its own stack of blocks — the same shape Scratch uses,
 * and the reason the scene tree can switch every panel at once.
 */
import type { Script } from '@retro-engine/blocks';

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

export interface StudioProject {
  name: string;
  sprites: StudioSprite[];
  sound: StudioSound;
  activeSpriteId: string | null;
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
  ground.x = 0;
  ground.y = 200;
  ground.layer = 4;
  ground.physics = { gravity: 0, width: 256, height: TILE, solid: true };

  return {
    name: 'Untitled Project',
    sprites: [player, ground],
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
