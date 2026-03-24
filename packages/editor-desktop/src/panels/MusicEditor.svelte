<script lang="ts">
  import { invoke } from '@tauri-apps/api/tauri';
  import { onMount } from 'svelte';
  import { projectPath } from '../store/project';
  import { activeBottomPanel, activeMusicPath, saveRequestVersion } from '../store/workspace';

  interface MusicFile {
    name: string;
    path: string;
  }

  let tracks: MusicFile[] = [];
  let activeTrack: MusicFile | null = null;
  let content = '';
  let lastSaveRequest = 0;

  $: if ($projectPath) loadTracks();
  $: if ($activeMusicPath) {
    const existing = tracks.find((track) => track.path === $activeMusicPath);
    if (existing && activeTrack?.path !== existing.path) {
      void openTrack(existing);
    }
  }
  $: if ($saveRequestVersion !== lastSaveRequest) {
    lastSaveRequest = $saveRequestVersion;
    if (activeTrack) {
      void saveTrack();
    }
  }

  onMount(() => {
    if ($projectPath) {
      loadTracks();
    }
  });

  async function loadTracks() {
    if (!$projectPath) return;
    const assets = await invoke<{ name: string; path: string; type: string }[]>('list_assets', {
      projectDir: $projectPath,
    });
    tracks = assets
      .filter((asset) => asset.type === 'music')
      .map((asset) => ({ name: asset.name, path: `${$projectPath}/${asset.path}` }));
  }

  async function openTrack(track: MusicFile) {
    activeTrack = track;
    content = await invoke<string>('read_script', { path: track.path });
  }

  async function saveTrack() {
    if (!activeTrack) return;
    await invoke('write_script', { path: activeTrack.path, content });
    await loadTracks();
  }

  async function createTrack() {
    if (!$projectPath) return;
    const rawName = prompt('Track name:', 'theme');
    if (!rawName) return;
    const fileName = rawName.endsWith('.mml') ? rawName : `${rawName}.mml`;
    const path = `${$projectPath}/music/${fileName}`;
    const starter = 'C4:8 E4:8 G4:8 C5:8 | G4:8 E4:8 C4:4';
    await invoke('write_script', { path, content: starter });
    await loadTracks();
    activeMusicPath.set(path);
    activeBottomPanel.set('music');
    await openTrack({ name: fileName, path });
  }

  function handleTrackKeydown(event: KeyboardEvent, track: MusicFile) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openTrack(track);
    }
  }
</script>

<div class="music-editor">
  <div class="track-list">
    <div class="header">
      <span>Music</span>
      <button on:click={createTrack}>+</button>
    </div>
    {#each tracks as track (track.path)}
      <div
        class="track-item"
        class:active={activeTrack?.path === track.path}
        on:click={() => openTrack(track)}
        on:keydown={(e) => handleTrackKeydown(e, track)}
        role="button"
        tabindex="0"
      >
        🎵 {track.name}
      </div>
    {/each}
    {#if tracks.length === 0}
      <p class="empty">No music tracks yet</p>
    {/if}
  </div>
  <div class="editor-pane">
    {#if activeTrack}
      <div class="editor-toolbar">
        <span>{activeTrack.name}</span>
        <button on:click={saveTrack}>Save</button>
      </div>
      <textarea bind:value={content} spellcheck="false" />
      <div class="hint">Write MML here, for example: `C4:8 E4:8 G4:8 | C5:4`</div>
    {:else}
      <p class="empty">Select or create a music track</p>
    {/if}
  </div>
</div>

<style>
  .music-editor { display: flex; height: 100%; }
  .track-list {
    width: 180px;
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: bold;
    border-bottom: 1px solid var(--border);
  }
  .header button,
  .editor-toolbar button {
    padding: 2px 8px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-primary);
    font-size: 11px;
    cursor: pointer;
    border-radius: 3px;
  }
  .track-item {
    padding: 6px 8px;
    font-size: 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--bg-primary);
  }
  .track-item:hover { background: var(--bg-input); }
  .track-item.active { background: var(--accent); color: #fff; }
  .editor-pane { flex: 1; display: flex; flex-direction: column; }
  .editor-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    font-size: 11px;
  }
  textarea {
    flex: 1;
    resize: none;
    border: none;
    outline: none;
    padding: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: monospace;
    font-size: 13px;
  }
  .hint,
  .empty {
    color: var(--text-secondary);
    font-size: 11px;
    font-style: italic;
    padding: 8px;
  }
</style>