<script lang="ts">
  import { invoke } from '@tauri-apps/api/tauri';
  import { projectPath } from '../store/project';
  import { activeBottomPanel, activeScriptPath, saveRequestVersion } from '../store/workspace';
  import { onMount, onDestroy } from 'svelte';

  interface ScriptFile {
    name: string;
    path: string;
  }

  let scripts: ScriptFile[] = [];
  let activeScript: ScriptFile | null = null;
  let editorContent = '';
  let editorContainer: HTMLDivElement;
  let monacoEditor: any = null;
  let monacoLoaded = false;
  let lastSaveRequest = 0;

  $: if ($projectPath) loadScripts();
  $: if ($activeScriptPath) {
    const existing = scripts.find((script) => script.path === $activeScriptPath);
    if (existing && activeScript?.path !== existing.path) {
      void openScript(existing);
    }
  }
  $: if ($saveRequestVersion !== lastSaveRequest) {
    lastSaveRequest = $saveRequestVersion;
    if (activeScript) {
      void saveScript();
    }
  }

  async function loadScripts() {
    if (!$projectPath) return;
    try {
      const assets = await invoke<{ name: string; path: string; type: string }[]>(
        'list_assets',
        { projectDir: $projectPath },
      );
      scripts = assets
        .filter((a) => a.type === 'script')
        .map((a) => ({ name: a.name, path: `${$projectPath}/${a.path}` }));
    } catch {
      scripts = [];
    }
  }

  async function openScript(script: ScriptFile) {
    activeScript = script;
    try {
      editorContent = await invoke<string>('read_script', { path: script.path });
    } catch {
      editorContent = '// New script\n';
    }
    if (monacoEditor) {
      monacoEditor.setValue(editorContent);
    }
  }

  async function saveScript() {
    if (!activeScript) return;
    const content = monacoEditor ? monacoEditor.getValue() : editorContent;
    try {
      await invoke('write_script', { path: activeScript.path, content });
    } catch (e) {
      console.error('Failed to save script:', e);
    }
  }

  async function createScript() {
    if (!$projectPath) return;
    const rawName = prompt('Script name:', 'player');
    if (!rawName) return;
    const fileName = rawName.endsWith('.ts') ? rawName : `${rawName}.ts`;
    const path = `${$projectPath}/scripts/${fileName}`;
    const starter = `export function ${rawName.replace(/[^a-zA-Z0-9_]/g, '_')}() {\n  // Script logic here.\n}\n`;
    await invoke('write_script', { path, content: starter });
    await loadScripts();
    activeScriptPath.set(path);
    activeBottomPanel.set('script');
  }

  onMount(async () => {
    // Load Monaco from CDN
    try {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/monaco-editor@0.44.0/min/vs/loader.js';
      script.onload = () => {
        const require = (window as any).require;
        require.config({
          paths: { vs: 'https://unpkg.com/monaco-editor@0.44.0/min/vs' },
        });
        require(['vs/editor/editor.main'], (monaco: any) => {
          monacoLoaded = true;
          if (editorContainer) {
            monacoEditor = monaco.editor.create(editorContainer, {
              value: editorContent,
              language: 'typescript',
              theme: 'vs-dark',
              fontSize: 13,
              minimap: { enabled: false },
              automaticLayout: true,
            });
            // Ctrl+S to save
            monacoEditor.addCommand(
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
              () => saveScript(),
            );
          }
        });
      };
      document.head.appendChild(script);
    } catch {
      // Monaco not available — fallback to textarea
    }
  });

  onDestroy(() => {
    if (monacoEditor) monacoEditor.dispose();
  });

  function handleScriptKeydown(event: KeyboardEvent, script: ScriptFile) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openScript(script);
    }
  }
</script>

<div class="script-editor">
  <div class="file-tree">
    <div class="tree-header">
      <span>Scripts</span>
      <button on:click={createScript}>+</button>
    </div>
    {#each scripts as script (script.path)}
      <div
        class="script-item"
        class:active={activeScript?.path === script.path}
        on:click={() => openScript(script)}
        on:keydown={(e) => handleScriptKeydown(e, script)}
        role="button"
        tabindex="0"
      >
        📜 {script.name}
      </div>
    {/each}
    {#if scripts.length === 0}
      <p class="empty">No scripts in project</p>
    {/if}
  </div>
  <div class="editor-area">
    {#if activeScript}
      {#if monacoLoaded}
        <div bind:this={editorContainer} class="monaco-container" />
      {:else}
        <textarea
          class="fallback-editor"
          bind:value={editorContent}
          on:keydown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveScript(); } }}
        />
      {/if}
    {:else}
      <p class="empty">Select a script to edit</p>
    {/if}
  </div>
</div>

<style>
  .script-editor { display: flex; height: 100%; }
  .file-tree {
    width: 160px; border-right: 1px solid var(--border);
    overflow-y: auto;
  }
  .tree-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 4px 8px; font-size: 11px; font-weight: bold;
    border-bottom: 1px solid var(--border);
  }
  .tree-header button {
    background: var(--bg-input); border: 1px solid var(--border);
    color: var(--text-primary); cursor: pointer; font-size: 12px;
    width: 18px; height: 18px; border-radius: 3px;
  }
  .script-item {
    padding: 4px 8px; font-size: 12px; cursor: pointer;
    border-bottom: 1px solid var(--bg-primary);
  }
  .script-item:hover { background: var(--bg-input); }
  .script-item.active { background: var(--accent); color: #fff; }
  .editor-area { flex: 1; position: relative; }
  .monaco-container { width: 100%; height: 100%; }
  .fallback-editor {
    width: 100%; height: 100%; resize: none;
    background: var(--bg-primary); color: var(--text-primary);
    border: none; padding: 8px; font-family: monospace; font-size: 13px;
  }
  .empty { color: var(--text-secondary); font-size: 11px; font-style: italic; padding: 16px; }
</style>
