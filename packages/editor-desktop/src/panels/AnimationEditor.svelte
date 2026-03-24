<script lang="ts">
  import { scene, pushUndo } from '../store/scene';
  import { selectedIds } from '../store/selection';
  import type { EntityDef } from '../store/scene';

  $: entity = $scene?.entities.find((e) => $selectedIds.has(e.id)) ?? null;
  $: anims = entity?.anims ?? {};
  $: animNames = Object.keys(anims);

  let selectedAnim = '';
  let previewFrame = 0;
  let previewInterval: ReturnType<typeof setInterval> | null = null;

  $: currentAnim = selectedAnim && anims[selectedAnim] ? anims[selectedAnim] : null;

  function selectAnim(name: string) {
    selectedAnim = name;
    stopPreview();
  }

  function addAnim() {
    const name = prompt('Animation name:');
    if (!name || !entity) return;
    scene.update((s) => {
      if (!s) return s;
      pushUndo(s);
      return {
        ...s,
        entities: s.entities.map((e) => {
          if (e.id !== entity!.id) return e;
          return {
            ...e,
            anims: { ...(e.anims ?? {}), [name]: { frames: [0], fps: 8, loop: true } },
          };
        }),
      };
    });
    selectedAnim = name;
  }

  function removeAnim() {
    if (!selectedAnim || !entity) return;
    scene.update((s) => {
      if (!s) return s;
      pushUndo(s);
      return {
        ...s,
        entities: s.entities.map((e) => {
          if (e.id !== entity!.id) return e;
          const newAnims = { ...(e.anims ?? {}) };
          delete newAnims[selectedAnim];
          return { ...e, anims: newAnims };
        }),
      };
    });
    selectedAnim = '';
  }

  function addFrame() {
    if (!currentAnim || !entity) return;
    const frame = parseInt(prompt('Frame index:', '0') ?? '', 10);
    if (isNaN(frame)) return;
    scene.update((s) => {
      if (!s) return s;
      pushUndo(s);
      return {
        ...s,
        entities: s.entities.map((e) => {
          if (e.id !== entity!.id || !e.anims?.[selectedAnim]) return e;
          return {
            ...e,
            anims: {
              ...e.anims,
              [selectedAnim]: {
                ...e.anims[selectedAnim],
                frames: [...e.anims[selectedAnim].frames, frame],
              },
            },
          };
        }),
      };
    });
  }

  function setFps(e: Event) {
    if (!currentAnim || !entity) return;
    const fps = parseInt((e.target as HTMLInputElement).value) || 8;
    scene.update((s) => {
      if (!s) return s;
      pushUndo(s);
      return {
        ...s,
        entities: s.entities.map((en) => {
          if (en.id !== entity!.id || !en.anims?.[selectedAnim]) return en;
          return {
            ...en,
            anims: {
              ...en.anims,
              [selectedAnim]: { ...en.anims[selectedAnim], fps },
            },
          };
        }),
      };
    });
  }

  function toggleLoop() {
    if (!currentAnim || !entity) return;
    scene.update((s) => {
      if (!s) return s;
      pushUndo(s);
      return {
        ...s,
        entities: s.entities.map((en) => {
          if (en.id !== entity!.id || !en.anims?.[selectedAnim]) return en;
          return {
            ...en,
            anims: {
              ...en.anims,
              [selectedAnim]: { ...en.anims[selectedAnim], loop: !en.anims[selectedAnim].loop },
            },
          };
        }),
      };
    });
  }

  function playPreview() {
    if (!currentAnim) return;
    stopPreview();
    previewFrame = 0;
    previewInterval = setInterval(() => {
      if (currentAnim) {
        previewFrame = (previewFrame + 1) % currentAnim.frames.length;
      }
    }, 1000 / (currentAnim.fps || 8));
  }

  function stopPreview() {
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
    }
  }

  function handleAnimKeydown(event: KeyboardEvent, name: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectAnim(name);
    }
  }
</script>

<div class="animation-editor">
  {#if entity}
    <div class="anim-list">
      <div class="list-header">
        <span>Animations</span>
        <button on:click={addAnim}>+</button>
        <button on:click={removeAnim}>−</button>
      </div>
      {#each animNames as name}
        <div class="anim-item" class:active={selectedAnim === name} on:click={() => selectAnim(name)} on:keydown={(e) => handleAnimKeydown(e, name)} role="button" tabindex="0">
          {name}
        </div>
      {/each}
    </div>
    <div class="anim-detail">
      {#if currentAnim}
        <div class="timeline">
          <span class="label">Frames:</span>
          {#each currentAnim.frames as frame, i}
            <div class="frame-cell" class:highlight={previewInterval !== null && i === previewFrame}>{frame}</div>
          {/each}
          <button class="add-frame" on:click={addFrame}>+</button>
        </div>
        <div class="controls">
          <label>FPS: <input type="range" min="1" max="30" value={currentAnim.fps} on:input={setFps} /> <span>{currentAnim.fps}</span></label>
          <label class="checkbox"><input type="checkbox" checked={currentAnim.loop} on:change={toggleLoop} /> Loop</label>
          <button on:click={playPreview}>▶ Preview</button>
          <button on:click={stopPreview}>⏹ Stop</button>
        </div>
      {:else}
        <p class="empty">Select an animation</p>
      {/if}
    </div>
  {:else}
    <p class="empty">Select an entity to edit animations</p>
  {/if}
</div>

<style>
  .animation-editor { display: flex; height: 100%; }
  .anim-list {
    width: 140px; border-right: 1px solid var(--border);
    overflow-y: auto;
  }
  .list-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 4px 8px; font-size: 11px; font-weight: bold;
    border-bottom: 1px solid var(--border);
  }
  .list-header button {
    background: var(--bg-input); border: 1px solid var(--border);
    color: var(--text-primary); cursor: pointer; font-size: 12px;
    width: 18px; height: 18px; border-radius: 3px;
  }
  .anim-item {
    padding: 4px 8px; font-size: 12px; cursor: pointer;
    border-bottom: 1px solid var(--bg-primary);
  }
  .anim-item:hover { background: var(--bg-input); }
  .anim-item.active { background: var(--accent); color: #fff; }
  .anim-detail { flex: 1; padding: 8px; }
  .timeline { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
  .label { font-size: 11px; color: var(--text-secondary); }
  .frame-cell {
    width: 28px; height: 28px; background: var(--bg-input);
    border: 1px solid var(--border); display: flex; align-items: center;
    justify-content: center; font-size: 11px; border-radius: 3px;
  }
  .frame-cell.highlight { border-color: var(--accent); background: var(--accent); color: #fff; }
  .add-frame {
    width: 28px; height: 28px; background: var(--bg-input);
    border: 1px dashed var(--border); cursor: pointer;
    color: var(--text-secondary); font-size: 14px; border-radius: 3px;
  }
  .controls { display: flex; gap: 12px; align-items: center; font-size: 11px; }
  .controls label { display: flex; align-items: center; gap: 4px; color: var(--text-secondary); }
  .controls input[type="range"] { width: 80px; }
  .controls button {
    padding: 3px 8px; background: var(--bg-input); border: 1px solid var(--border);
    color: var(--text-primary); font-size: 11px; cursor: pointer; border-radius: 3px;
  }
  .controls button:hover { background: var(--accent); }
  .checkbox { display: flex; align-items: center; gap: 4px; }
  .empty { color: var(--text-secondary); font-size: 11px; font-style: italic; padding: 16px; }
</style>
