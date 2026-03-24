<script lang="ts">
  import { invoke } from '@tauri-apps/api/tauri';
  import { listen } from '@tauri-apps/api/event';
  import { open } from '@tauri-apps/api/dialog';
  import { projectPath } from '../store/project';
  import { onMount, onDestroy } from 'svelte';

  let buildLog: string[] = [];
  let building = false;
  let logContainer: HTMLDivElement;
  let unlistenBuildLog: (() => void) | null = null;

  const targets = [
    { id: 'web', label: 'Web (HTML5)', desc: 'Build for browsers' },
    { id: 'windows', label: 'Windows', desc: 'x86_64-pc-windows-gnu', triple: 'x86_64-pc-windows-gnu' },
    { id: 'linux', label: 'Linux', desc: 'x86_64-unknown-linux-gnu', triple: 'x86_64-unknown-linux-gnu' },
    { id: 'macos', label: 'macOS', desc: 'aarch64-apple-darwin', triple: 'aarch64-apple-darwin' },
    { id: 'arm-linux', label: 'ARM Linux (Handhelds)', desc: 'armv7-unknown-linux-gnueabihf', triple: 'armv7-unknown-linux-gnueabihf' },
    { id: 'rom-gb', label: 'ROM-ready (Game Boy)', desc: 'GBDK-2020 project scaffold' },
    { id: 'rom-nes', label: 'ROM-ready (NES)', desc: 'cc65/NESLib project scaffold' },
  ];

  onMount(async () => {
    unlistenBuildLog = await listen<string>('build-log', (event) => {
      buildLog = [...buildLog, event.payload];
      requestAnimationFrame(() => {
        if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
      });
    });
  });

  onDestroy(() => {
    if (unlistenBuildLog) unlistenBuildLog();
  });

  async function buildWeb() {
    if (!$projectPath) return;
    building = true;
    buildLog = [];
    try {
      await invoke('build_wasm', { projectDir: $projectPath, release: true });
      await invoke('build_bundle', { projectDir: $projectPath });
      buildLog = [...buildLog, '✓ Web build complete!'];
    } catch (e) {
      buildLog = [...buildLog, `✗ Build failed: ${e}`];
    }
    building = false;
  }

  async function exportDesktop(triple: string) {
    if (!$projectPath) return;
    const outDir = await open({ directory: true, title: 'Choose output directory' });
    if (!outDir || Array.isArray(outDir)) return;

    building = true;
    buildLog = [];
    try {
      await invoke('export_desktop', {
        projectDir: $projectPath,
        targetTriple: triple,
        outDir: outDir as string,
      });
      buildLog = [...buildLog, `✓ Desktop export for ${triple} complete!`];
    } catch (e) {
      buildLog = [...buildLog, `✗ Export failed: ${e}`];
    }
    building = false;
  }

  async function exportRom(platform: string) {
    if (!$projectPath) return;
    const outDir = await open({ directory: true, title: 'Choose output directory' });
    if (!outDir || Array.isArray(outDir)) return;

    building = true;
    buildLog = [];
    try {
      await invoke('export_rom_ready', {
        projectDir: $projectPath,
        platform,
        outDir: outDir as string,
      });
      buildLog = [...buildLog, `✓ ${platform.toUpperCase()} ROM scaffold generated!`];
    } catch (e) {
      buildLog = [...buildLog, `✗ ROM export failed: ${e}`];
    }
    building = false;
  }

  function handleExport(target: typeof targets[0]) {
    switch (target.id) {
      case 'web': buildWeb(); break;
      case 'windows':
      case 'linux':
      case 'macos':
      case 'arm-linux':
        if (target.triple) exportDesktop(target.triple);
        break;
      case 'rom-gb': exportRom('gb'); break;
      case 'rom-nes': exportRom('nes'); break;
    }
  }
</script>

<div class="export-manager">
  <div class="targets">
    <div class="targets-header">Export Targets</div>
    {#each targets as target (target.id)}
      <div class="target-row">
        <div class="target-info">
          <span class="target-label">{target.label}</span>
          <span class="target-desc">{target.desc}</span>
        </div>
        <button on:click={() => handleExport(target)} disabled={building}>
          {building ? '...' : 'Export'}
        </button>
      </div>
    {/each}
  </div>
  <div class="build-log" bind:this={logContainer}>
    <div class="log-header">Build Log</div>
    {#each buildLog as line}
      <div class="log-line">{line}</div>
    {/each}
    {#if buildLog.length === 0}
      <div class="log-empty">No build output yet</div>
    {/if}
  </div>
</div>

<style>
  .export-manager { display: flex; height: 100%; }
  .targets { width: 300px; border-right: 1px solid var(--border); overflow-y: auto; }
  .targets-header {
    padding: 4px 8px; font-size: 11px; font-weight: bold;
    border-bottom: 1px solid var(--border);
  }
  .target-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 8px; border-bottom: 1px solid var(--bg-primary);
  }
  .target-info { display: flex; flex-direction: column; }
  .target-label { font-size: 12px; }
  .target-desc { font-size: 10px; color: var(--text-secondary); }
  .target-row button {
    padding: 3px 10px; background: var(--accent); border: none;
    color: #fff; font-size: 11px; cursor: pointer; border-radius: 3px;
  }
  .target-row button:hover { background: var(--accent-hover); }
  .target-row button:disabled { opacity: 0.5; cursor: not-allowed; }
  .build-log {
    flex: 1; overflow-y: auto; background: var(--bg-primary);
    font-family: monospace; font-size: 11px;
  }
  .log-header {
    padding: 4px 8px; font-size: 11px; font-weight: bold;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
  }
  .log-line { padding: 1px 8px; color: var(--text-primary); }
  .log-empty { padding: 8px; color: var(--text-secondary); font-style: italic; }
</style>
