<script lang="ts">
  import { scene, pushUndo } from '../store/scene';
  import { clearSelection, selectedIds } from '../store/selection';
  import { showColliders, showGrid } from '../store/editor';
  import type { SceneFile, EntityDef } from '../store/scene';

  function toggleGrid() { showGrid.update((value) => !value); }
  function toggleColliders() { showColliders.update((value) => !value); }

  function addEntity() {
    scene.update((s) => {
      if (!s) return s;
      pushUndo(s);
      const id = crypto.randomUUID();
      const newEntity: EntityDef = {
        id,
        name: `Entity_${s.entities.length}`,
        x: 0,
        y: 0,
        layer: 0,
      };
      return { ...s, entities: [...s.entities, newEntity] };
    });
  }

  function deleteSelected() {
    scene.update((s) => {
      if (!s || $selectedIds.size === 0) return s;
      pushUndo(s);
      return { ...s, entities: s.entities.filter((ent) => !$selectedIds.has(ent.id)) };
    });
    clearSelection();
  }
</script>

<div class="toolbar">
  <button on:click={addEntity} title="Add Entity">+ Entity</button>
  <button on:click={deleteSelected} title="Delete Selected">Delete</button>
  <span class="sep">|</span>
  <button class:active={$showGrid} on:click={toggleGrid} title="Toggle Grid">Grid</button>
  <button class:active={$showColliders} on:click={toggleColliders} title="Toggle Colliders">Colliders</button>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    height: 28px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    padding: 0 8px;
    gap: 4px;
  }
  button {
    padding: 2px 8px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-primary);
    font-size: 11px;
    cursor: pointer;
    border-radius: 3px;
  }
  button:hover { background: var(--accent); }
  button.active { background: var(--accent); }
  .sep { color: var(--border); font-size: 14px; }
</style>
