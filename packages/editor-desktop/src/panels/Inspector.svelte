<script lang="ts">
  import { scene, entities, pushUndo } from '../store/scene';
  import { selectedIds } from '../store/selection';
  import type { EntityDef } from '../store/scene';

  $: selected = $entities.filter((e) => $selectedIds.has(e.id));
  $: entity = selected.length === 1 ? selected[0] : null;

  function updateEntity(id: string, patch: Partial<EntityDef>) {
    scene.update((s) => {
      if (!s) return s;
      pushUndo(s);
      return {
        ...s,
        entities: s.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      };
    });
  }

  function handleName(e: Event) {
    if (!entity) return;
    updateEntity(entity.id, { name: (e.target as HTMLInputElement).value });
  }
  function handleX(e: Event) {
    if (!entity) return;
    updateEntity(entity.id, { x: parseFloat((e.target as HTMLInputElement).value) || 0 });
  }
  function handleY(e: Event) {
    if (!entity) return;
    updateEntity(entity.id, { y: parseFloat((e.target as HTMLInputElement).value) || 0 });
  }
  function handleLayer(e: Event) {
    if (!entity) return;
    updateEntity(entity.id, { layer: parseInt((e.target as HTMLInputElement).value) || 0 });
  }
  function handleFrame(e: Event) {
    if (!entity) return;
    updateEntity(entity.id, { frame: parseInt((e.target as HTMLInputElement).value) || 0 });
  }
  function handleSolid(e: Event) {
    if (!entity) return;
    updateEntity(entity.id, { solid: (e.target as HTMLInputElement).checked });
  }
  function handleTags(e: Event) {
    if (!entity) return;
    const tags = (e.target as HTMLInputElement).value.split(',').map((t) => t.trim()).filter(Boolean);
    updateEntity(entity.id, { tags });
  }

  function toggleCollider() {
    if (!entity) return;
    if (entity.collider) {
      updateEntity(entity.id, { collider: undefined });
    } else {
      updateEntity(entity.id, { collider: { offsetX: 0, offsetY: 0, w: 16, h: 16 } });
    }
  }

  function handleCollider(field: string, e: Event) {
    if (!entity || !entity.collider) return;
    const val = parseFloat((e.target as HTMLInputElement).value) || 0;
    updateEntity(entity.id, {
      collider: { ...entity.collider, [field]: val },
    });
  }

  // Custom properties
  function addCustomProp() {
    if (!entity) return;
    const key = prompt('Property name:');
    if (!key) return;
    const value = prompt('Property value:', '');
    updateEntity(entity.id, { custom: { ...(entity.custom ?? {}), [key]: value } });
  }

  function removeCustomProp(key: string) {
    if (!entity) return;
    const custom = { ...(entity.custom ?? {}) };
    delete custom[key];
    updateEntity(entity.id, { custom });
  }
</script>

<div class="inspector">
  <div class="header">Inspector</div>
  {#if entity}
    <div class="section">
      <label>Name <input type="text" value={entity.name} on:change={handleName} /></label>
      <div class="row">
        <label>X <input type="number" value={entity.x} on:change={handleX} /></label>
        <label>Y <input type="number" value={entity.y} on:change={handleY} /></label>
      </div>
      <div class="row">
        <label>Layer <input type="number" value={entity.layer ?? 0} on:change={handleLayer} /></label>
        <label>Frame <input type="number" value={entity.frame ?? 0} on:change={handleFrame} /></label>
      </div>
      <label class="checkbox">
        <input type="checkbox" checked={entity.solid ?? false} on:change={handleSolid} /> Solid
      </label>
      <label>Tags <input type="text" value={(entity.tags ?? []).join(', ')} on:change={handleTags} /></label>
    </div>

    <div class="section">
      <div class="section-header">
        <span>Collider</span>
        <button on:click={toggleCollider}>{entity.collider ? 'Remove' : 'Add'}</button>
      </div>
      {#if entity.collider}
        <div class="row">
          <label>Offset X <input type="number" value={entity.collider.offsetX} on:change={(e) => handleCollider('offsetX', e)} /></label>
          <label>Offset Y <input type="number" value={entity.collider.offsetY} on:change={(e) => handleCollider('offsetY', e)} /></label>
        </div>
        <div class="row">
          <label>Width <input type="number" value={entity.collider.w} on:change={(e) => handleCollider('w', e)} /></label>
          <label>Height <input type="number" value={entity.collider.h} on:change={(e) => handleCollider('h', e)} /></label>
        </div>
      {/if}
    </div>

    <div class="section">
      <div class="section-header">
        <span>Animations</span>
      </div>
      {#if entity.anims}
        {#each Object.entries(entity.anims) as [name, anim]}
          <div class="anim-row">
            <span>{name}</span>
            <span class="anim-detail">{anim.frames.length} frames @ {anim.fps}fps</span>
          </div>
        {/each}
      {:else}
        <p class="empty">No animations defined</p>
      {/if}
    </div>

    <div class="section">
      <div class="section-header">
        <span>Script</span>
      </div>
      {#if entity.script}
        <p class="script-path">{entity.script}</p>
      {:else}
        <p class="empty">No script attached</p>
      {/if}
    </div>

    <div class="section">
      <div class="section-header">
        <span>Custom Properties</span>
        <button on:click={addCustomProp}>+</button>
      </div>
      {#if entity.custom}
        {#each Object.entries(entity.custom) as [key, value]}
          <div class="custom-row">
            <span class="custom-key">{key}</span>
            <span class="custom-val">{JSON.stringify(value)}</span>
            <button class="remove-btn" on:click={() => removeCustomProp(key)}>×</button>
          </div>
        {/each}
      {/if}
    </div>
  {:else if selected.length > 1}
    <p class="multi">{selected.length} entities selected</p>
  {:else}
    <p class="empty">No selection</p>
  {/if}
</div>

<style>
  .inspector { padding: 8px; }
  .header {
    font-weight: bold; font-size: 12px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
    margin-bottom: 8px;
  }
  .section { margin-bottom: 12px; }
  .section-header {
    display: flex; justify-content: space-between; align-items: center;
    font-weight: bold; font-size: 11px; margin-bottom: 4px;
    color: var(--text-secondary);
  }
  .section-header button {
    background: var(--bg-input); border: 1px solid var(--border);
    color: var(--text-primary); font-size: 10px; cursor: pointer;
    padding: 1px 6px; border-radius: 3px;
  }
  label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; }
  input[type="text"], input[type="number"] {
    background: var(--bg-input); border: 1px solid var(--border);
    color: var(--text-primary); padding: 3px 6px; font-size: 12px;
    border-radius: 3px; width: 100%;
  }
  .row { display: flex; gap: 8px; }
  .row label { flex: 1; }
  .checkbox { flex-direction: row; align-items: center; gap: 6px; }
  .empty { color: var(--text-secondary); font-size: 11px; font-style: italic; }
  .multi { color: var(--accent); font-size: 12px; padding: 16px; text-align: center; }
  .anim-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
  .anim-detail { color: var(--text-secondary); }
  .script-path { font-size: 11px; color: var(--accent); }
  .custom-row { display: flex; gap: 4px; align-items: center; font-size: 11px; padding: 2px 0; }
  .custom-key { color: var(--accent); min-width: 60px; }
  .custom-val { flex: 1; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; }
  .remove-btn { background: none; border: none; color: var(--danger); cursor: pointer; font-size: 14px; }
</style>
