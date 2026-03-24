import { writable } from 'svelte/store';

export const browserPreviewUrl = writable<string | null>(null);
export const livePreviewEnabled = writable(true);