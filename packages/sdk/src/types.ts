export type Preset = "gameboy" | "nes" | "neogeo" | "custom";

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
