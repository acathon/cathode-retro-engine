import { writable, derived } from 'svelte/store';
import type { EntityDef } from './scene';

export const selectedIds = writable<Set<string>>(new Set());

export function selectEntity(id: string, additive = false): void {
  selectedIds.update((set) => {
    if (additive) {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    }
    return new Set([id]);
  });
}

export function clearSelection(): void {
  selectedIds.set(new Set());
}

export const selectedCount = derived(selectedIds, ($ids) => $ids.size);
