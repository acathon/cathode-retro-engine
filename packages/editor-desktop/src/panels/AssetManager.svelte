<script lang="ts">
  import { invoke } from '@tauri-apps/api/tauri';
  import { open } from '@tauri-apps/api/dialog';
  import { projectPath } from '../store/project';
  import { scene, scenePath, type SceneFile } from '../store/scene';
  import { activeBottomPanel, activeMusicPath, activeScriptPath } from '../store/workspace';

  interface AssetInfo {
    name: string;
    path: string;
    type: string;
    size: number;
  }

  let assets: AssetInfo[] = [];
  let filter: 'all' | 'sprite' | 'map' | 'scene' | 'script' | 'music' | 'audio' = 'all';

  $: filteredAssets = filter === 'all' ? assets : assets.filter((a) => a.type === filter);
  $: if ($projectPath) refreshAssets();

  async function refreshAssets() {
    if (!$projectPath) return;
    try {
      assets = await invoke<AssetInfo[]>('list_assets', { projectDir: $projectPath });
    } catch (e) {
      console.error('Failed to list assets:', e);
    }
  }

  async function importSheet() {
    const file = await open({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp'] }],
    });
    if (!file || Array.isArray(file) || !$projectPath) return;

    // Copy to assets/sprites/
    const name = file.split(/[\\/]/).pop() ?? 'sheet.png';
    await invoke('copy_file', {
      src: file,
      dest: `${$projectPath}/assets/sprites/${name}`,
    });
    await refreshAssets();
  }

  async function openAsset(asset: AssetInfo) {
    if (!$projectPath) return;

    const fullPath = `${$projectPath}/${asset.path}`;
    if (asset.type === 'scene') {
      const json = await invoke<string>('read_scene', { path: fullPath });
      scene.set(JSON.parse(json) as SceneFile);
      scenePath.set(fullPath);
      return;
    }

    if (asset.type === 'script') {
      activeScriptPath.set(fullPath);
      activeBottomPanel.set('script');
      return;
    }

    if (asset.type === 'music') {
      activeMusicPath.set(fullPath);
      activeBottomPanel.set('music');
      return;
    }
  }

  function handleAssetKeydown(event: KeyboardEvent, asset: AssetInfo) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void openAsset(asset);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1048576).toFixed(1)}MB`;
  }
</script>

<div class="asset-manager">
  <div class="toolbar">
    <button on:click={importSheet}>Import Sheet</button>
    <button on:click={refreshAssets}>Refresh</button>
    <span class="sep">|</span>
    <button class:active={filter === 'all'} on:click={() => filter = 'all'}>All</button>
    <button class:active={filter === 'sprite'} on:click={() => filter = 'sprite'}>Sprites</button>
    <button class:active={filter === 'map'} on:click={() => filter = 'map'}>Maps</button>
    <button class:active={filter === 'scene'} on:click={() => filter = 'scene'}>Scenes</button>
    <button class:active={filter === 'script'} on:click={() => filter = 'script'}>Scripts</button>
    <button class:active={filter === 'music'} on:click={() => filter = 'music'}>Music</button>
  </div>
  <div class="grid">
    {#each filteredAssets as asset (asset.path)}
      <div class="asset-card" title={asset.path} on:click={() => openAsset(asset)} on:keydown={(e) => handleAssetKeydown(e, asset)} role="button" tabindex="0">
        <div class="asset-icon">{asset.type === 'sprite' ? '🖼' : asset.type === 'script' ? '📜' : asset.type === 'scene' ? '🎬' : asset.type === 'music' ? '🎵' : '📄'}</div>
        <div class="asset-name">{asset.name}</div>
        <div class="asset-size">{formatSize(asset.size)}</div>
      </div>
    {/each}
    {#if filteredAssets.length === 0}
      <p class="empty">No assets found</p>
    {/if}
  </div>
</div>

<style>
  .asset-manager { height: 100%; display: flex; flex-direction: column; }
  .toolbar {
    display: flex; gap: 4px; padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  .toolbar button {
    padding: 2px 8px; background: var(--bg-input); border: 1px solid var(--border);
    color: var(--text-primary); font-size: 11px; cursor: pointer; border-radius: 3px;
  }
  .toolbar button:hover { background: var(--accent); }
  .toolbar button.active { background: var(--accent); }
  .sep { color: var(--border); }
  .grid {
    flex: 1; overflow-y: auto; display: flex; flex-wrap: wrap;
    gap: 8px; padding: 8px; align-content: flex-start;
  }
  .asset-card {
    width: 80px; padding: 8px; background: var(--bg-input);
    border: 1px solid var(--border); border-radius: 4px;
    text-align: center; cursor: pointer;
  }
  .asset-card:hover { border-color: var(--accent); }
  .asset-card:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
  .asset-icon { font-size: 24px; }
  .asset-name {
    font-size: 10px; margin-top: 4px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .asset-size { font-size: 9px; color: var(--text-secondary); }
  .empty { color: var(--text-secondary); font-size: 11px; font-style: italic; padding: 16px; }
</style>
