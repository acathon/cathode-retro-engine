<script lang="ts">
  import TopBar from './menus/TopBar.svelte';
  import Toolbar from './menus/Toolbar.svelte';
  import AutosaveBridge from './components/AutosaveBridge.svelte';
  import Hierarchy from './panels/Hierarchy.svelte';
  import SceneEditor from './panels/SceneEditor.svelte';
  import PreviewPanel from './panels/PreviewPanel.svelte';
  import Inspector from './panels/Inspector.svelte';
  import AssetManager from './panels/AssetManager.svelte';
  import AnimationEditor from './panels/AnimationEditor.svelte';
  import MusicEditor from './panels/MusicEditor.svelte';
  import ScriptEditor from './panels/ScriptEditor.svelte';
  import ExportManager from './panels/ExportManager.svelte';
  import { project } from './store/project';
  import { activeBottomPanel } from './store/workspace';
</script>

<div class="editor-root">
  <TopBar />
  <Toolbar />
  <div class="editor-body">
    {#if $project}
      <AutosaveBridge />
      <div class="left-panel">
        <Hierarchy />
      </div>
      <div class="center-panel">
        <div class="workspace-row">
          <div class="scene-panel">
            <SceneEditor />
          </div>
          <div class="preview-column">
            <PreviewPanel />
          </div>
        </div>
        <div class="bottom-tabs">
          <button class:active={$activeBottomPanel === 'assets'} on:click={() => activeBottomPanel.set('assets')}>Assets</button>
          <button class:active={$activeBottomPanel === 'animation'} on:click={() => activeBottomPanel.set('animation')}>Animation</button>
          <button class:active={$activeBottomPanel === 'music'} on:click={() => activeBottomPanel.set('music')}>Music</button>
          <button class:active={$activeBottomPanel === 'script'} on:click={() => activeBottomPanel.set('script')}>Script</button>
          <button class:active={$activeBottomPanel === 'export'} on:click={() => activeBottomPanel.set('export')}>Export</button>
        </div>
        <div class="bottom-panel">
          {#if $activeBottomPanel === 'assets'}
            <AssetManager />
          {:else if $activeBottomPanel === 'animation'}
            <AnimationEditor />
          {:else if $activeBottomPanel === 'music'}
            <MusicEditor />
          {:else if $activeBottomPanel === 'script'}
            <ScriptEditor />
          {:else if $activeBottomPanel === 'export'}
            <ExportManager />
          {/if}
        </div>
      </div>
      <div class="right-panel">
        <Inspector />
      </div>
    {:else}
      <div class="welcome">
        <h1>retro-engine editor</h1>
        <p>Open or create a project to get started.</p>
        <p class="hint">File → New Project / Open Project</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .editor-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-primary);
  }
  .editor-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  .left-panel {
    width: 200px;
    min-width: 150px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }
  .center-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .workspace-row {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .scene-panel {
    flex: 1 1 58%;
    min-width: 0;
    display: flex;
  }
  .preview-column {
    flex: 0 0 42%;
    min-width: 280px;
    display: flex;
  }
  .right-panel {
    width: 260px;
    min-width: 200px;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border);
    overflow-y: auto;
  }
  .bottom-tabs {
    display: flex;
    background: var(--bg-primary);
    border-top: 1px solid var(--border);
  }
  .bottom-tabs button {
    padding: 4px 12px;
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 12px;
    border-bottom: 2px solid transparent;
  }
  .bottom-tabs button.active {
    color: var(--text-primary);
    border-bottom-color: var(--accent);
  }
  .bottom-panel {
    height: 200px;
    min-height: 120px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    overflow-y: auto;
  }
  .welcome {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .welcome h1 { color: var(--accent); font-size: 28px; }
  .welcome p { color: var(--text-secondary); }
  .welcome .hint { font-style: italic; font-size: 12px; }

  @media (max-width: 1200px) {
    .workspace-row {
      flex-direction: column;
    }

    .preview-column {
      flex: 0 0 260px;
      min-width: 0;
    }
  }
</style>
