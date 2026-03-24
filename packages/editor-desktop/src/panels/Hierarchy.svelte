<script lang="ts">
  import { scene, pushUndo, entities } from '../store/scene';
  import { selectedIds, selectEntity, clearSelection } from '../store/selection';
  import type { EntityDef } from '../store/scene';

  $: sortedEntities = [...$entities].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));

  function handleClick(id: string, e: MouseEvent) {
    selectEntity(id, e.shiftKey);
  }

  function handleDoubleClick(entity: EntityDef) {
    const newName = prompt('Rename entity:', entity.name);
    if (newName && newName !== entity.name) {
      scene.update((s) => {
        if (!s) return s;
        pushUndo(s);
        return {
          ...s,
          entities: s.entities.map((ent) =>
            ent.id === entity.id ? { ...ent, name: newName } : ent,
          ),
        };
      });
    }
  }

  function toggleVisibility(entity: EntityDef) {
    scene.update((s) => {
      if (!s) return s;
      return {
        ...s,
        entities: s.entities.map((ent) =>
          ent.id === entity.id ? { ...ent, visible: ent.visible === false ? true : false } : ent,
        ),
      };
    });
  }

  function addEntity() {
    scene.update((s) => {
      if (!s) return s;
      pushUndo(s);
      const id = crypto.randomUUID();
      return {
        ...s,
        entities: [
          ...s.entities,
          { id, name: `Entity_${s.entities.length}`, x: 0, y: 0, layer: 0 },
        ],
      };
    });
  }

  function removeSelected() {
    scene.update((s) => {
      if (!s) return s;
      pushUndo(s);
      return { ...s, entities: s.entities.filter((e) => !$selectedIds.has(e.id)) };
    });
    clearSelection();
  }

  function handleEntityKeydown(event: KeyboardEvent, entity: EntityDef) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectEntity(entity.id, event.shiftKey);
    }
  }
</script>

<div class="hierarchy">
  <div class="header">
    <span>Hierarchy</span>
    <div class="actions">
      <button on:click={addEntity} title="Add entity">+</button>
      <button on:click={removeSelected} title="Remove selected">−</button>
    </div>
  </div>
  <div class="list">
    {#each sortedEntities as entity (entity.id)}
      <div
        class="entity-row"
        class:selected={$selectedIds.has(entity.id)}
        on:click={(e) => handleClick(entity.id, e)}
        on:keydown={(e) => handleEntityKeydown(e, entity)}
        on:dblclick={() => handleDoubleClick(entity)}
        role="button"
        tabindex="0"
      >
        <button class="vis-toggle" on:click|stopPropagation={() => toggleVisibility(entity)}>
          {entity.visible !== false ? '👁' : '○'}
        </button>
        <span class="layer-badge">L{entity.layer ?? 0}</span>
        <span class="entity-name">{entity.name}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .hierarchy { display: flex; flex-direction: column; height: 100%; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    font-weight: bold;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }
  .actions { display: flex; gap: 4px; }
  .actions button {
    width: 20px; height: 20px;
    background: var(--bg-input); border: 1px solid var(--border);
    color: var(--text-primary); cursor: pointer; font-size: 14px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 3px;
  }
  .actions button:hover { background: var(--accent); }
  .list { flex: 1; overflow-y: auto; }
  .entity-row {
    display: flex; align-items: center; gap: 6px;
    padding: 3px 8px; cursor: pointer; font-size: 12px;
    border-bottom: 1px solid var(--bg-primary);
  }
  .entity-row:hover { background: var(--bg-input); }
  .entity-row.selected { background: var(--accent); color: #fff; }
  .vis-toggle {
    background: none; border: none; cursor: pointer; font-size: 10px;
    color: var(--text-secondary); width: 16px;
  }
  .layer-badge {
    font-size: 10px; color: var(--text-secondary);
    background: var(--bg-primary); padding: 1px 4px; border-radius: 3px;
  }
  .entity-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
