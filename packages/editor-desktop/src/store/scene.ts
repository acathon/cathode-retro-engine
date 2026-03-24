import { writable, derived } from 'svelte/store';

export interface EntityDef {
  id: string;
  name: string;
  x: number;
  y: number;
  sheet?: string;
  frame?: number;
  layer?: number;
  script?: string;
  collider?: { offsetX: number; offsetY: number; w: number; h: number };
  solid?: boolean;
  anims?: Record<string, { frames: number[]; fps: number; loop: boolean }>;
  tags?: string[];
  custom?: Record<string, unknown>;
  visible?: boolean; // editor-only
}

export interface SceneFile {
  name: string;
  entities: EntityDef[];
  tileMaps: { path: string; layer: number }[];
  camera: { x: number; y: number; lerp: number };
  bgColor: [number, number, number];
}

export const scene = writable<SceneFile | null>(null);
export const scenePath = writable<string | null>(null);

export const entities = derived(scene, ($scene) => $scene?.entities ?? []);
export const undoStack = writable<string[]>([]);
export const redoStack = writable<string[]>([]);

const MAX_UNDO = 80;

export function pushUndo(sceneSnapshot: SceneFile): void {
  undoStack.update((stack) => {
    const json = JSON.stringify(sceneSnapshot);
    const next = [...stack, json];
    if (next.length > MAX_UNDO) next.shift();
    return next;
  });
  redoStack.set([]);
}

export function undo(): void {
  undoStack.update((stack) => {
    if (stack.length === 0) return stack;
    const last = stack[stack.length - 1];
    const next = stack.slice(0, -1);
    scene.update((current) => {
      if (current) {
        redoStack.update((r) => [...r, JSON.stringify(current)]);
      }
      return JSON.parse(last);
    });
    return next;
  });
}

export function redo(): void {
  redoStack.update((stack) => {
    if (stack.length === 0) return stack;
    const last = stack[stack.length - 1];
    const next = stack.slice(0, -1);
    scene.update((current) => {
      if (current) {
        undoStack.update((u) => [...u, JSON.stringify(current)]);
      }
      return JSON.parse(last);
    });
    return next;
  });
}
