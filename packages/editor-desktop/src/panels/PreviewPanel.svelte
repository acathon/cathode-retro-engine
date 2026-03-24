<script lang="ts">
  import { onMount } from 'svelte';
  import { BitmapFont, RetroEngine, Scene, Sprite } from '@retro-engine/sdk';
  import { project } from '../store/project';
  import { scene, type EntityDef, type SceneFile } from '../store/scene';
  import { selectedIds } from '../store/selection';
  import { livePreviewEnabled } from '../store/preview';

  let canvas: HTMLCanvasElement;
  let engine: RetroEngine | null = null;
  let runtimeScene: Scene | null = null;
  let font: BitmapFont | null = null;
  let placeholderSheet = -1;
  let currentPreset = '';
  let currentScene: SceneFile | null = null;
  let status = 'Initializing preview...';
  const previewSprites = new Map<string, Sprite>();

  function hash(text: string): number {
    let value = 0;
    for (let index = 0; index < text.length; index += 1) {
      value = (value * 33 + text.charCodeAt(index)) >>> 0;
    }
    return value;
  }

  function createPlaceholderSheet(runtime: RetroEngine): number {
    const tileSize = 8;
    const cols = 4;
    const rows = 4;
    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = cols * tileSize;
    sheetCanvas.height = rows * tileSize;
    const ctx = sheetCanvas.getContext('2d')!;

    const colors = [
      '#9bbc0f', '#8bac0f', '#306230', '#0f380f',
      '#3b82f6', '#ef4444', '#eab308', '#22c55e',
      '#a855f7', '#f97316', '#14b8a6', '#f43f5e',
      '#84cc16', '#64748b', '#38bdf8', '#facc15',
    ];

    colors.forEach((color, index) => {
      const x = (index % cols) * tileSize;
      const y = Math.floor(index / cols) * tileSize;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, tileSize, tileSize);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x + 1, y + 1, tileSize - 2, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + 1, y + tileSize - 3, tileSize - 2, 2);
    });

    const imageData = ctx.getImageData(0, 0, sheetCanvas.width, sheetCanvas.height);
    return runtime.raw!.upload_sheet(
      sheetCanvas.width,
      sheetCanvas.height,
      tileSize,
      tileSize,
      new Uint8Array(imageData.data.buffer),
    );
  }

  async function createEngineForPreset(preset: string): Promise<void> {
    if (!canvas) return;
    currentPreset = preset;
    status = 'Starting runtime...';

    if (preset === 'gameboy') {
      engine = await RetroEngine.gameboy(canvas, 1);
    } else if (preset === 'neogeo') {
      engine = await RetroEngine.neogeo(canvas, 1);
    } else {
      engine = await RetroEngine.nes(canvas, 1);
    }

    runtimeScene = new Scene(engine);
    font = BitmapFont.builtin(engine);
    placeholderSheet = createPlaceholderSheet(engine);

    engine.loop((dt) => {
      if (!runtimeScene || !engine || !font || !$livePreviewEnabled) return;
      runtimeScene.update(dt);

      if (currentScene) {
        font.draw(currentScene.name || 'Scene Preview', 4, 4, 1);
        font.draw(`ENTITIES ${currentScene.entities.filter((entity) => entity.visible !== false).length}`, 4, 14, 1);
        font.draw(`SELECTED ${$selectedIds.size}`, 4, 24, 1);
        font.draw('LIVE PREVIEW', 4, engine.height - 12, 1);
      } else {
        font.draw('LIVE PREVIEW', 4, 4, 1);
        font.draw(status, 4, 14, 1);
      }
    });

    syncPreview();
    status = 'Live preview running';
  }

  function destroyMissingSprites(liveIds: Set<string>) {
    for (const [id, sprite] of previewSprites) {
      if (!liveIds.has(id)) {
        sprite.destroy();
        previewSprites.delete(id);
      }
    }
  }

  function spriteFrameForEntity(entity: EntityDef): number {
    if (typeof entity.frame === 'number') {
      return Math.abs(entity.frame) % 16;
    }
    return hash(entity.name) % 16;
  }

  function syncPreview() {
    if (!engine || !runtimeScene || !currentScene || placeholderSheet < 0) return;

    engine.setBgColor(currentScene.bgColor[0], currentScene.bgColor[1], currentScene.bgColor[2]);
    engine.setCamera(currentScene.camera.x, currentScene.camera.y);

    const liveEntities = currentScene.entities.filter((entity) => entity.visible !== false);
    const liveIds = new Set(liveEntities.map((entity) => entity.id));
    destroyMissingSprites(liveIds);

    for (const entity of liveEntities) {
      const frame = spriteFrameForEntity(entity);
      const layer = entity.layer ?? 0;
      const existing = previewSprites.get(entity.id);

      if (!existing) {
        previewSprites.set(entity.id, new Sprite(runtimeScene, {
          x: entity.x,
          y: entity.y,
          sheet: placeholderSheet,
          frame,
          layer,
        }));
        continue;
      }

      existing.x = entity.x;
      existing.y = entity.y;
      existing.frame = frame;
    }
  }

  $: currentScene = $scene;
  $: if (engine && currentScene) {
    syncPreview();
  }

  $: if ($project && canvas && (!$livePreviewEnabled || currentPreset !== $project.preset) && !engine) {
    // no-op guard; initialization is handled in onMount after canvas is bound
  }

  $: if (engine && $project && currentPreset !== $project.preset) {
    status = `Preset changed to ${$project.preset}. Reopen preview panel to fully reset runtime.`;
  }

  onMount(async () => {
    if ($project) {
      await createEngineForPreset($project.preset);
    } else {
      status = 'Open a project to start preview';
    }
  });

  $: if (!engine && $project && canvas) {
    void createEngineForPreset($project.preset);
  }
</script>

<div class="preview-panel">
  <div class="preview-header">
    <span>Live Preview</span>
    <label class="toggle">
      <input type="checkbox" bind:checked={$livePreviewEnabled} />
      Enabled
    </label>
  </div>
  <div class="preview-stage">
    <canvas bind:this={canvas} class="preview-canvas" />
    {#if !$project}
      <div class="overlay">Open a project to start the runtime preview.</div>
    {:else if !$livePreviewEnabled}
      <div class="overlay">Live preview paused.</div>
    {/if}
  </div>
  <div class="preview-status">{status}</div>
</div>

<style>
  .preview-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border);
  }
  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-weight: bold;
  }
  .toggle {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 11px;
    color: var(--text-secondary);
  }
  .preview-stage {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 8px;
    background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.1));
  }
  .preview-canvas {
    width: 100% !important;
    max-width: 100%;
    max-height: 100%;
    height: auto !important;
    aspect-ratio: auto;
    image-rendering: pixelated;
    border: 1px solid var(--border);
    background: #000;
  }
  .overlay {
    position: absolute;
    inset: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    color: var(--text-primary);
    font-size: 12px;
    text-align: center;
    padding: 12px;
  }
  .preview-status {
    padding: 6px 8px;
    border-top: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 11px;
    min-height: 28px;
  }
</style>