/**
 * Cathode Studio — a Godot-shaped editor for the Cathode.
 *
 * Left dock is the scene tree, right dock the inspector, centre the live
 * viewport, and the bottom dock holds the working panels: blocks, sprite
 * editor, sound maker, generated code and output. Selecting a sprite in the
 * scene tree re-points every panel at it, so each sprite owns its own pixels
 * and its own stack of blocks the way Scratch does.
 */
import * as Blockly from 'blockly';
import {
  BLOCK_DEFS,
  Interpreter,
  TOOLBOX,
  generateTypeScript,
  type Actor,
  type BlockProgram,
  type Host,
  type KeyName,
  type RaycastView,
} from '@cathode/blocks';
import { Raycaster, Cathode, Scene, SoundChannel, Sprite } from '@cathode/sdk';
import { scriptsFromWorkspace, variablesFromWorkspace } from './from-blockly';
import { SAMPLE_WORKSPACE } from './sample';
import {
  TILE,
  buildSheet,
  clearSaved,
  createProject,
  loadProject,
  saveProject,
  type StudioProject,
  type StudioSprite,
} from './project';
import { SceneTree } from './docks/scene-tree';
import { Inspector } from './docks/inspector';
import { SpriteEditor } from './panels/sprite-editor';
import { SoundMaker } from './panels/sound-maker';
import { SceneEditor } from './panels/scene-editor';
import { MapEditor } from './panels/map-editor';
import { buildWallTextures } from './wall-textures';

// --- State -----------------------------------------------------------------
let project: StudioProject = loadProject() ?? createProject();
if (!project.sprites.some((s) => s.workspace)) {
  // First run: give the player sprite a script so the editor demonstrates itself.
  const player = project.sprites[0];
  if (player) player.workspace = SAMPLE_WORKSPACE;
}

let engine: Cathode | null = null;
let interpreter: Interpreter | null = null;
let raycaster: Raycaster | null = null;
let raycastView: RaycastView | undefined;
let running = false;
let paused = false;
let loopStarted = false;

const el = {
  status: document.getElementById('status') as HTMLElement,
  vpStatus: document.getElementById('vp-status') as HTMLElement,
  code: document.getElementById('code') as HTMLElement,
  output: document.getElementById('output') as HTMLElement,
  canvas: document.getElementById('game') as HTMLCanvasElement,
  projName: document.getElementById('proj-name') as HTMLElement,
};

const setStatus = (msg: string) => { el.status.textContent = msg; };

function log(message: string): void {
  const time = new Date().toLocaleTimeString();
  el.output.textContent = `[${time}] ${message}\n${el.output.textContent}`.slice(0, 8000);
}

const activeSprite = (): StudioSprite | null =>
  project.sprites.find((s) => s.id === project.activeSpriteId) ?? null;

// --- Blockly ---------------------------------------------------------------
Blockly.defineBlocksWithJsonArray(BLOCK_DEFS as unknown as object[]);

const BLOCKLY_MEDIA = import.meta.env.DEV
  ? '/node_modules/blockly/media/'
  : './blockly-media/';

const workspace = Blockly.inject(document.getElementById('blockly') as HTMLElement, {
  media: BLOCKLY_MEDIA,
  toolbox: TOOLBOX as unknown as Blockly.utils.toolbox.ToolboxDefinition,
  grid: { spacing: 22, length: 3, colour: '#272c34', snap: true },
  zoom: { controls: true, wheel: true, startScale: 0.8 },
  trashcan: true,
  theme: Blockly.Theme.defineTheme('retro-studio', {
    name: 'retro-studio',
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#1d2229',
      toolboxBackgroundColour: '#23282f',
      toolboxForegroundColour: '#c3c9d1',
      flyoutBackgroundColour: '#21262d',
      flyoutForegroundColour: '#c3c9d1',
      scrollbarColour: '#2f353e',
    },
  }),
});

/** True while we are swapping workspaces, so the change listener stays quiet. */
let loadingWorkspace = false;

/**
 * Which sprite's blocks are currently in the workspace.
 *
 * Capturing keys off this rather than the selected sprite: at boot nothing is
 * loaded yet, and saving the empty workspace over the newly selected sprite
 * wiped its scripts before they were ever shown.
 */
let loadedSpriteId: string | null = null;

function loadSpriteScripts(sprite: StudioSprite | null): void {
  loadingWorkspace = true;
  try {
    workspace.clear();
    if (sprite?.workspace) {
      Blockly.serialization.workspaces.load(sprite.workspace as object, workspace);
    }
  } catch (err) {
    log(`Could not load blocks for ${sprite?.name}: ${(err as Error).message}`);
  } finally {
    loadingWorkspace = false;
  }

  loadedSpriteId = sprite?.id ?? null;
  if (sprite) sprite.scripts = scriptsFromWorkspace(workspace);
  refreshCode();
}

/** Pull the workspace back into whichever sprite it belongs to. */
function captureScripts(): void {
  if (!loadedSpriteId) return;
  const sprite = project.sprites.find((s) => s.id === loadedSpriteId);
  if (!sprite) return;
  sprite.workspace = Blockly.serialization.workspaces.save(workspace);
  sprite.scripts = scriptsFromWorkspace(workspace);
  refreshCode();
}

workspace.addChangeListener((event) => {
  if (loadingWorkspace || event.isUiEvent) return;
  captureScripts();
  persist();
});

// --- Program assembly ------------------------------------------------------
/**
 * Variable names used anywhere in the project. Only the active sprite's
 * blocks are in the workspace, so the rest are recovered from their parsed
 * scripts instead.
 */
function collectVariables(): Record<string, number> {
  const vars: Record<string, number> = { ...variablesFromWorkspace(workspace) };

  const walkExpr = (expr: unknown): void => {
    if (!expr || typeof expr !== 'object') return;
    const e = expr as Record<string, unknown>;
    if (e.kind === 'var' && typeof e.name === 'string') vars[e.name] = 0;
    for (const value of Object.values(e)) {
      if (value && typeof value === 'object') walkExpr(value);
    }
  };

  const walkStmts = (stmts: unknown[]): void => {
    for (const raw of stmts) {
      const stmt = raw as Record<string, unknown>;
      if ((stmt.kind === 'setVar' || stmt.kind === 'changeVar') && typeof stmt.name === 'string') {
        vars[stmt.name] = 0;
      }
      for (const value of Object.values(stmt)) {
        if (Array.isArray(value)) walkStmts(value);
        else if (value && typeof value === 'object') walkExpr(value);
      }
    }
  };

  for (const sprite of project.sprites) {
    for (const script of sprite.scripts) walkStmts(script.body as unknown[]);
  }

  return vars;
}

function currentProgram(): BlockProgram {
  return {
    sprites: project.sprites.map((s) => ({
      name: s.name.replace(/[^A-Za-z0-9_]/g, '') || 'sprite',
      sheet: 0,
      frame: 0,
      x: s.x,
      y: s.y,
      physics: s.physics
        ? { gravity: s.physics.gravity, width: s.physics.width, height: s.physics.height }
        : undefined,
      scripts: s.scripts,
    })),
    variables: collectVariables(),
  };
}

function refreshCode(): void {
  el.code.textContent = generateTypeScript(currentProgram());
}

// --- Docks and panels ------------------------------------------------------
const inspector = new Inspector({
  onChange: () => {
    sceneTree.render();
    sceneEditor?.render();
    persist();
    setStatus('Property updated.');
  },
});

const spriteEditor = new SpriteEditor({
  onChange: () => {
    sceneTree.render();
    sceneEditor?.render();
    persist();
  },
});

const sceneTree = new SceneTree(project, {
  onSelect: (id) => selectSprite(id),
  onChange: () => { persist(); refreshCode(); },
});

const sceneEditor = new SceneEditor(project, {
  onSelect: (id) => selectSprite(id),
  onMove: () => {
    inspector.render(activeSprite());
    persist();
  },
});

const mapEditor = new MapEditor(project, {
  onChange: () => persist(),
});

const soundMaker = new SoundMaker(project.sound, {
  engine: () => engine,
  onChange: () => persist(),
  log,
});

function selectSprite(id: string): void {
  captureScripts();               // keep the outgoing sprite's edits
  project.activeSpriteId = id;
  const sprite = activeSprite();
  loadSpriteScripts(sprite);
  spriteEditor.setSprite(sprite);
  inspector.render(sprite);
  sceneTree.render();
  sceneEditor.render();
  setStatus(sprite ? `Selected ${sprite.name}.` : 'Nothing selected.');
}

// --- Persistence -----------------------------------------------------------
let saveTimer: number | null = null;
function persist(): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveProject(project), 400);
}

// --- Runtime ---------------------------------------------------------------
/** Bridges an SDK Sprite to the interpreter's Actor contract. */
class SpriteActor implements Actor {
  constructor(private sprite: Sprite) {}
  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }
  get velocityX() { return this.sprite.velocityX; }
  get velocityY() { return this.sprite.velocityY; }
  get visible() { return this.sprite.active; }
  setPosition(x: number, y: number) { this.sprite.setPosition(x, y); }
  setVelocity(vx: number, vy: number) { this.sprite.move(vx, vy); }
  setFrame(frame: number) { this.sprite.frame = frame; }
  setFlip(flipX: boolean) { this.sprite.flipX = flipX; }
  setVisible(visible: boolean) { this.sprite.active = visible; }
  isGrounded() { return Math.abs(this.sprite.velocityY) < 0.001; }
  overlaps(other: Actor) {
    return other instanceof SpriteActor ? this.sprite.overlaps(other.sprite, TILE, TILE) : false;
  }
}

async function run(): Promise<void> {
  try {
    captureScripts();
    setStatus('Starting…');

    if (!engine) engine = await Cathode.nes(el.canvas, 2);
    const eng = engine;

    const scene = new Scene(eng);
    const sheet = buildSheet(project.sprites);
    const sheetHandle = eng.raw.upload_sheet(sheet.width, sheet.height, TILE, TILE, sheet.pixels);
    eng.raw.set_bg_color(29, 34, 41);

    const program = currentProgram();
    const actors = new Map<string, Actor>();

    project.sprites.forEach((def, index) => {
      const first = sheet.firstFrame.get(def.id) ?? 0;
      const sprite = new Sprite(scene, {
        sheet: sheetHandle,
        frame: first,
        x: def.x,
        y: def.y,
        layer: def.layer,
      });
      sprite.active = def.visible;

      if (def.physics) {
        sprite.usePhysics({
          gravity: def.physics.solid ? undefined : def.physics.gravity,
          width: def.physics.width,
          height: def.physics.height,
        });
        if (def.physics.solid) sprite.setSolid(true);

        // A platform's collider is usually wider than its 16px art, so repeat
        // the tile across it. Without this a floor collides across its full
        // width but only *looks* one tile wide, which reads as a bug.
        if (def.physics.solid && def.physics.width > TILE && project.mode !== 'raycaster') {
          for (let x = TILE; x < def.physics.width; x += TILE) {
            const filler = new Sprite(scene, {
              sheet: sheetHandle,
              frame: first,
              x: def.x + x,
              y: def.y,
              layer: def.layer,
            });
            filler.active = def.visible;
          }
        }
      }

      // In first-person mode the raycaster owns the screen. The sprites still
      // exist so their scripts keep running, but they are parked off-screen
      // rather than drawn over the 3D view.
      if (project.mode === 'raycaster') sprite.setPosition(-9999, -9999);

      actors.set(program.sprites[index].name, new SpriteActor(sprite));
    });

    // First-person mode: swap the sprite stage for the DDA raycaster.
    raycaster = null;
    raycastView = undefined;

    if (project.mode === 'raycaster') {
      const map = project.raycast;
      raycaster = new Raycaster(eng, { cols: map.cols, rows: map.rows, cells: map.cells });

      const walls = buildWallTextures();
      walls.textures.forEach((tex, index) => {
        raycaster!.setTextureFromPixels(index + 1, tex, walls.size);
      });
      raycaster.setFloorColor(28, 24, 22);
      raycaster.setCeilingColor(12, 10, 16);
      raycaster.setFog(map.fogDist, 6, 5, 9);
      raycaster.setPos(map.spawnX, map.spawnY, map.spawnAngle);

      const rc = raycaster;
      raycastView = {
        get x() { return rc.pos.x; },
        get y() { return rc.pos.y; },
        get angle() { return rc.pos.angle; },
        move: (forward, strafe, turn) => rc.move(forward, strafe, turn, 0),
        teleport: (x, y, angle) => rc.setPos(x, y, angle),
        setFog: (distance) => rc.setFog(distance, 6, 5, 9),
        wallDistance: () => measureWallAhead(),
      };
    }

    const sfx = new SoundChannel(eng, 1);
    const host: Host = {
      keyHeld: (k: KeyName) => eng.input.held(0, k),
      keyJustPressed: (k: KeyName) => eng.input.justPressed(0, k),
      playSound: (freq, waveform) => {
        sfx.play(freq, waveform as never, 0.35);
        window.setTimeout(() => sfx.stop(), 120);
      },
      actor: (name) => actors.get(name),
      raycast: () => raycastView,
    };

    interpreter = new Interpreter(program, host);
    running = true;
    paused = false;

    if (!loopStarted) {
      loopStarted = true;
      eng.loop((dt) => {
        scene.update(dt);
        if (running && !paused && interpreter) interpreter.tick(dt);
      });
    }

    showView('game');
    const scriptCount = program.sprites.reduce((n, s) => n + s.scripts.length, 0);
    const label = project.mode === 'raycaster'
      ? `Running · first person · ${scriptCount} scripts`
      : `Running · ${project.sprites.length} sprites · ${scriptCount} scripts`;
    setVpStatus(true, label);
    log(`Run: ${project.sprites.length} sprites, ${scriptCount} scripts.`);
    setStatus('Running.');
  } catch (err) {
    console.error(err);
    log(`Start failed: ${(err as Error).message}`);
    setStatus('Could not start — build the wasm first (bun run build:wasm).');
  }
}

/**
 * Distance in cells to the wall straight ahead.
 *
 * Marched in small steps rather than a full DDA: the block only ever asks
 * "is something close", so a short march is accurate enough and keeps the
 * studio free of a second raycast implementation.
 */
function measureWallAhead(): number {
  if (!raycaster) return Infinity;
  const map = project.raycast;
  const { x, y, angle } = raycaster.pos;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  for (let t = 0.1; t <= 12; t += 0.1) {
    const col = Math.floor(x + dx * t);
    const row = Math.floor(y + dy * t);
    if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return t;
    if ((map.cells[row * map.cols + col] ?? 0) !== 0) return t;
  }
  return Infinity;
}

function setVpStatus(active: boolean, text: string): void {
  el.vpStatus.textContent = text;
  el.vpStatus.classList.toggle('running', active);
  document.getElementById('btn-play')?.classList.toggle('on', active);
}

function stop(): void {
  running = false;
  paused = false;
  interpreter?.reset();
  soundMaker.stop();
  setVpStatus(false, 'Stopped');
  showView('scene');
  setStatus('Stopped.');
}

function togglePause(): void {
  if (!running) return;
  paused = !paused;
  setVpStatus(!paused, paused ? 'Paused' : 'Running');
  setStatus(paused ? 'Paused.' : 'Resumed.');
}

// --- Chrome wiring ---------------------------------------------------------
document.getElementById('btn-play')?.addEventListener('click', () => void run());
document.getElementById('btn-stop')?.addEventListener('click', stop);
document.getElementById('btn-pause')?.addEventListener('click', togglePause);

document.getElementById('menu-save')?.addEventListener('click', () => {
  saveProject(project);
  setStatus('Project saved to this browser.');
  log('Project saved.');
});

document.getElementById('menu-new')?.addEventListener('click', () => {
  if (!confirm('Start a new project? Unsaved changes are lost.')) return;
  clearSaved();
  project = createProject();
  const player = project.sprites[0];
  if (player) player.workspace = SAMPLE_WORKSPACE;
  sceneTree.setProject(project);
  soundMaker.setSound(project.sound);
  selectSprite(project.activeSpriteId ?? project.sprites[0].id);
  stop();
  log('New project.');
});

document.getElementById('menu-export')?.addEventListener('click', async () => {
  refreshCode();
  showPanel('code');
  try {
    await navigator.clipboard.writeText(el.code.textContent ?? '');
    setStatus('TypeScript copied to the clipboard.');
  } catch {
    setStatus('Clipboard blocked — the code is in the Code tab.');
  }
});

/** Viewport tabs: arrange the scene, or watch the running game. */
function showView(view: 'scene' | 'game'): void {
  document.querySelectorAll<HTMLElement>('.vp-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  const sceneCanvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
  const gameCanvas = document.getElementById('game') as HTMLCanvasElement;
  sceneCanvas.hidden = view !== 'scene';
  gameCanvas.hidden = view !== 'game';
  if (view === 'scene') sceneEditor.render();
}

document.querySelectorAll<HTMLElement>('.vp-tab').forEach((tab) => {
  tab.addEventListener('click', () => showView((tab.dataset.view as 'scene' | 'game') ?? 'scene'));
});

const modeSelect = document.getElementById('mode-select') as HTMLSelectElement;
modeSelect.addEventListener('change', () => {
  project.mode = modeSelect.value === 'raycaster' ? 'raycaster' : '2d';
  persist();
  stop();
  setStatus(
    project.mode === 'raycaster'
      ? 'First-person mode — paint a maze in Map Editor, then press ▶.'
      : '2D mode — arrange sprites in the Scene view.',
  );
  if (project.mode === 'raycaster') showPanel('map');
});

/** Bottom dock tabs. */
function showPanel(name: string): void {
  document.querySelectorAll<HTMLElement>('#bottom-tabs .dock-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.panel === name);
  });
  document.querySelectorAll<HTMLElement>('.panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === name);
  });
  // Blockly only measures itself correctly once its container is visible.
  if (name === 'blocks') window.setTimeout(() => Blockly.svgResize(workspace), 0);
  if (name === 'sprite') spriteEditor.render();
  if (name === 'map') mapEditor.render();
}

document.querySelectorAll<HTMLElement>('#bottom-tabs .dock-tab').forEach((tab) => {
  tab.addEventListener('click', () => showPanel(tab.dataset.panel ?? 'blocks'));
});

/** Draggable dock splitters. */
function wireSplitters(): void {
  document.querySelectorAll<HTMLElement>('.splitter').forEach((splitter) => {
    const targetId = splitter.dataset.target;
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;

    const vertical = splitter.classList.contains('horizontal');

    splitter.addEventListener('mousedown', (down) => {
      down.preventDefault();
      const startPos = vertical ? down.clientY : down.clientX;
      const startSize = vertical ? target.offsetHeight : target.offsetWidth;
      // Left dock grows rightward; right and bottom docks grow the other way.
      const sign = targetId === 'dock-left' ? 1 : -1;

      const move = (ev: MouseEvent) => {
        const delta = ((vertical ? ev.clientY : ev.clientX) - startPos) * sign;
        const size = Math.min(720, Math.max(150, startSize + delta));
        if (vertical) target.style.height = `${size}px`;
        else target.style.width = `${size}px`;
        Blockly.svgResize(workspace);
      };

      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };

      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  });
}

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'F5') { ev.preventDefault(); void run(); }
  if (ev.key === 'F8') { ev.preventDefault(); stop(); }
});

window.addEventListener('resize', () => Blockly.svgResize(workspace));

// --- Boot ------------------------------------------------------------------
wireSplitters();
el.projName.textContent = project.name;
modeSelect.value = project.mode;
mapEditor.render();
sceneTree.setProject(project);
selectSprite(project.activeSpriteId ?? project.sprites[0]?.id ?? '');
showPanel('blocks');
log('Cathode Studio ready.');
setStatus('Ready — press ▶ to run, or edit blocks, sprites and sound below.');

// Exposed for the headless smoke test.
(window as unknown as Record<string, unknown>).__studio = {
  project: () => project,
  spriteCount: () => project.sprites.length,
  activeSprite: () => activeSprite()?.name ?? null,
  code: () => el.code.textContent,
  blockCount: () => workspace.getAllBlocks(false).length,
  isRunning: () => running,
  variables: () => interpreter?.variables ?? {},
  showPanel,
  selectSprite,
  addSprite: () => (document.getElementById('add-sprite') as HTMLButtonElement).click(),
  showView,
  setMode: (mode: string) => {
    modeSelect.value = mode;
    modeSelect.dispatchEvent(new Event('change'));
  },
  mode: () => project.mode,
  mapCells: () => project.raycast.cells.filter((c) => c !== 0).length,
  cameraPos: () => (raycaster ? raycaster.pos : null),
};
