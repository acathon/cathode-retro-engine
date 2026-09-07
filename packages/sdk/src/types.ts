export type Preset = "gameboy" | "nes" | "neogeo" | "dos" | "custom";

export type Resolution = { width: number; height: number };

export interface EngineConfig {
  resolution?: Resolution;
  audioChannels?: number;
  spriteLimit?: number;
  scanlines?: boolean;
  paletteColors?: string[];
  targetFps?: number;
}

export interface SpriteOptions {
  sheet: number;
  frame: number;
  x: number;
  y: number;
  layer?: number;
}

/** Options for handing a sprite's movement to the engine's physics step. */
export interface PhysicsOptions {
  /**
   * Gravity strength as a multiple of the engine's base gravity. 1 is a
   * normal fall, 0.35 is floaty. Omit it for top-down games, where nothing
   * should be pulled downward.
   */
  gravity?: number;
  /** Collision box size in pixels. Without one the sprite passes through solids. */
  width?: number;
  height?: number;
  /** Collision box offset from the sprite's position. Defaults to 0. */
  offsetX?: number;
  offsetY?: number;
  /** Solid sprites never move and block other bodies (floors, walls, platforms). */
  solid?: boolean;
}

export interface TileMapOptions {
  name: string;
  cols: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
}

export type WaveformType = "pulse25" | "pulse50" | "triangle" | "sawtooth" | "noise" | "sine";

export type PlayerIndex = 0 | 1;

export type ButtonName = "up" | "down" | "left" | "right" | "a" | "b" | "x" | "y" | "start" | "select" | "l" | "r";
