<script lang="ts">
  import { invoke } from '@tauri-apps/api/tauri';
  import { open, save } from '@tauri-apps/api/dialog';
  import { open as openExternal } from '@tauri-apps/api/shell';
  import { project, projectPath } from '../store/project';
  import { browserPreviewUrl } from '../store/preview';
  import { requestWorkspaceSave } from '../store/workspace';
  import { scene, scenePath, undo, redo } from '../store/scene';
  import type { RetroProject } from '../store/project';
  import type { SceneFile } from '../store/scene';

  let projectName = '';

  project.subscribe((p) => { projectName = p?.name ?? ''; });

  async function handleNewProject() {
    const dir = await open({ directory: true, title: 'Choose project location' });
    if (!dir || Array.isArray(dir)) return;

    const name = prompt('Project name:', 'my-game');
    if (!name) return;

    const preset = prompt('Preset (gameboy / nes / neogeo):', 'nes') ?? 'nes';

    const result = await invoke<RetroProject>('new_project', {
      path: `${dir}/${name}`,
      name,
      preset,
    });
    project.set(result);
    projectPath.set(`${dir}/${name}`);
    await loadEntryScene(`${dir}/${name}`, result.entryScene);
  }

  async function handleOpenProject() {
    const dir = await open({ directory: true, title: 'Open project folder' });
    if (!dir || Array.isArray(dir)) return;

    const result = await invoke<RetroProject>('open_project', { path: dir as string });
    project.set(result);
    projectPath.set(dir as string);
    await loadEntryScene(dir as string, result.entryScene);
  }

  async function handleSave() {
    requestWorkspaceSave();

    let pp: string | null = null;
    projectPath.subscribe((v) => { pp = v; })();
    let p: RetroProject | null = null;
    project.subscribe((v) => { p = v; })();
    if (!pp || !p) return;
    await invoke('save_project', { path: pp, project: p });

    // Save scene too
    let sp: string | null = null;
    scenePath.subscribe((v) => { sp = v; })();
    let s: SceneFile | null = null;
    scene.subscribe((v) => { s = v; })();
    if (sp && s) {
      await invoke('write_scene', { path: sp, json: JSON.stringify(s, null, 2) });
    }
  }

  async function loadEntryScene(base: string, entryScene: string) {
    const fullPath = `${base}/${entryScene}`;
    try {
      const json = await invoke<string>('read_scene', { path: fullPath });
      const parsed = JSON.parse(json) as SceneFile;
      scene.set(parsed);
      scenePath.set(fullPath);
    } catch {
      // Scene doesn't exist yet
      scene.set({
        name: 'Main Scene',
        entities: [],
        tileMaps: [],
        camera: { x: 0, y: 0, lerp: 0.1 },
        bgColor: [0, 0, 0],
      });
      scenePath.set(fullPath);
    }
  }

  async function handlePlay() {
    let pp: string | null = null;
    projectPath.subscribe((v) => { pp = v; })();
    if (!pp) return;
    const url = await invoke<string>('preview_game', { projectDir: pp });
    browserPreviewUrl.set(url);
    await openExternal(url);
  }

  function handleUndo() { undo(); }
  function handleRedo() { redo(); }

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); handleRedo(); }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="topbar">
  <div class="menu-group">
    <div class="menu-item">
      <span class="menu-label">File</span>
      <div class="dropdown">
        <button on:click={handleNewProject}>New Project</button>
        <button on:click={handleOpenProject}>Open Project</button>
        <button on:click={handleSave}>Save</button>
      </div>
    </div>
    <div class="menu-item">
      <span class="menu-label">Edit</span>
      <div class="dropdown">
        <button on:click={handleUndo}>Undo</button>
        <button on:click={handleRedo}>Redo</button>
      </div>
    </div>
    <div class="menu-item">
      <span class="menu-label">Run</span>
      <div class="dropdown">
        <button on:click={handlePlay}>Play in Browser</button>
      </div>
    </div>
  </div>
  <div class="title">{projectName ? `${projectName} — retro-engine editor` : 'retro-engine editor'}</div>
</div>

<style>
  .topbar {
    display: flex;
    align-items: center;
    height: 30px;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border);
    padding: 0 8px;
    user-select: none;
    -webkit-app-region: drag;
  }
  .menu-group {
    display: flex;
    gap: 2px;
    -webkit-app-region: no-drag;
  }
  .menu-item {
    position: relative;
  }
  .menu-label {
    padding: 4px 8px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
    border-radius: 4px;
  }
  .menu-label:hover { background: var(--bg-input); color: var(--text-primary); }
  .dropdown {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    min-width: 160px;
    z-index: 100;
    border-radius: 4px;
    padding: 4px 0;
  }
  .menu-item:hover .dropdown { display: block; }
  .dropdown button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 12px;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: 12px;
    cursor: pointer;
  }
  .dropdown button:hover { background: var(--accent); }
  .title {
    flex: 1;
    text-align: center;
    color: var(--text-secondary);
    font-size: 12px;
  }
</style>
