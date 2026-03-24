import { writable } from 'svelte/store';

export interface RetroProject {
  name: string;
  version: string;
  preset: string;
  resolution: { width: number; height: number };
  targetFps: number;
  audioChannels: number;
  spriteLimit: number;
  scanlines: boolean;
  entryScene: string;
  exportTargets: string[];
}

export const project = writable<RetroProject | null>(null);
export const projectPath = writable<string | null>(null);
export const recentProjects = writable<string[]>([]);
