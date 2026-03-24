import { writable } from 'svelte/store';

export type BottomPanel = 'assets' | 'animation' | 'music' | 'script' | 'export';

export const activeBottomPanel = writable<BottomPanel>('assets');
export const activeScriptPath = writable<string | null>(null);
export const activeMusicPath = writable<string | null>(null);
export const saveRequestVersion = writable(0);

export function requestWorkspaceSave(): void {
  saveRequestVersion.update((value) => value + 1);
}