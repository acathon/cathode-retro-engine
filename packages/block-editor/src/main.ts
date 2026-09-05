/**
 * Retro Engine block editor — a Scratch-style visual builder.
 *
 * Blocks are dragged in a Blockly workspace, converted to the block-program
 * IR, and run by the interpreter against real SDK sprites. The same IR is
 * printed as TypeScript in the side pane, so a project can graduate from
 * blocks to hand-written code without starting over.
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
} from '@retro-engine/blocks';
import { RetroEngine, Scene, SoundChannel, Sprite } from '@retro-engine/sdk';
import { scriptsFromWorkspace, variablesFromWorkspace } from './from-blockly';
import { SAMPLE_WORKSPACE } from './sample';

const el = {
  blockly: document.getElementById('blockly') as HTMLDivElement,
  canvas: document.getElementById('game') as HTMLCanvasElement,
  code: document.getElementById('code') as HTMLPreElement,
  vars: document.getElementById('vars') as HTMLDivElement,
  status: document.getElementById('status') as HTMLDivElement,
  run: document.getElementById('run') as HTMLButtonElement,
  stop: document.getElementById('stop') as HTMLButtonElement,
  sample: document.getElementById('sample') as HTMLButtonElement,
  copy: document.getElementById('copy') as HTMLButtonElement,
};

const setStatus = (msg: string) => { el.status.textContent = msg; };

// --- Blockly ---------------------------------------------------------------
Blockly.defineBlocksWithJsonArray(BLOCK_DEFS as unknown as object[]);

// Serve Blockly's icons and sounds from the local install. Left unset it
// fetches them from blockly-demo.appspot.com, which breaks offline.
const BLOCKLY_MEDIA = import.meta.env.DEV
  ? '/node_modules/blockly/media/'
  : './blockly-media/';

const workspace = Blockly.inject(el.blockly, {
  media: BLOCKLY_MEDIA,
  toolbox: TOOLBOX as unknown as Blockly.utils.toolbox.ToolboxDefinition,
  grid: { spacing: 22, length: 3, colour: '#252838', snap: true },
  zoom: { controls: true, wheel: true, startScale: 0.85 },
  trashcan: true,
  theme: Blockly.Theme.defineTheme('retro', {
    name: 'retro',
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#171922',
      toolboxBackgroundColour: '#1b1d27',
      toolboxForegroundColour: '#d8dae6',
      flyoutBackgroundColour: '#12131a',
      flyoutForegroundColour: '#d8dae6',
      scrollbarColour: '#2c2f3d',
    },
  }),
});

/** The single sprite this editor drives. Multi-sprite is future work. */
const SPRITE_NAME = 'player';

function currentProgram(): BlockProgram {
  return {
    sprites: [
      {
        name: SPRITE_NAME,
        sheet: 0,
        frame: 0,
        x: 124,
        y: 96,
        physics: { gravity: 1, width: 8, height: 8 },
        scripts: scriptsFromWorkspace(workspace),
      },
    ],
    variables: variablesFromWorkspace(workspace),
  };
}

function refreshCode() {
  el.code.textContent = generateTypeScript(currentProgram());
}

workspace.addChangeListener((event) => {
  if (event.isUiEvent) return;
  refreshCode();
});

// --- Engine ----------------------------------------------------------------
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
    return other instanceof SpriteActor ? this.sprite.overlaps(other.sprite, 8, 8) : false;
  }
}

let engine: RetroEngine | null = null;
let interpreter: Interpreter | null = null;
let running = false;

/** An 8x8 sheet: frame 0 a hero, frame 1 a coin, frame 2 a block. */
function buildSheet(): { pixels: Uint8Array; w: number; h: number } {
  const TILE = 8;
  const tiles = 3;
  const w = TILE * tiles;
  const px = new Uint8Array(w * TILE * 4);
  const set = (t: number, x: number, y: number, r: number, g: number, b: number, a = 255) => {
    const i = ((y * w) + t * TILE + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const dx = x - 3.5, dy = y - 3.5;
      if (dx * dx + dy * dy <= 11) set(0, x, y, 255, 236, 39);
      if (Math.abs(dx) + Math.abs(dy) <= 3) set(1, x, y, 41, 173, 255);
      set(2, x, y, y < 2 ? 0 : 40, y < 2 ? 228 : 120, y < 2 ? 54 : 60);
    }
  }
  set(0, 2, 3, 20, 20, 30);
  set(0, 5, 3, 20, 20, 30);

  return { pixels: px, w, h: TILE };
}

async function ensureEngine(): Promise<RetroEngine> {
  if (engine) return engine;
  engine = await RetroEngine.nes(el.canvas, 1);
  return engine;
}

async function run() {
  try {
    setStatus('Starting…');
    const eng = await ensureEngine();
    const program = currentProgram();

    // Fresh scene each run so a re-run starts from a clean stage.
    const scene = new Scene(eng);
    const sheet = buildSheet();
    const sheetHandle = eng.raw.upload_sheet(sheet.w, sheet.h, 8, 8, sheet.pixels);
    eng.raw.set_bg_color(18, 19, 26);

    const def = program.sprites[0];
    const sprite = new Sprite(scene, { sheet: sheetHandle, frame: def.frame, x: def.x, y: def.y });
    if (def.physics) sprite.usePhysics(def.physics);

    // A floor so gravity has something to land on. One tile carries the full
    // width collider; the rest are decoration, so the stage reads as a scene
    // rather than a single block floating in the dark.
    const FLOOR_Y = 200;
    const floor = new Sprite(scene, { sheet: sheetHandle, frame: 2, x: 0, y: FLOOR_Y, layer: 4 });
    floor.usePhysics({ width: eng.width, height: 8, solid: true });
    for (let x = 8; x < eng.width; x += 8) {
      new Sprite(scene, { sheet: sheetHandle, frame: 2, x, y: FLOOR_Y, layer: 4 });
    }

    const sfx = new SoundChannel(eng, 0);
    const actors = new Map<string, Actor>([[def.name, new SpriteActor(sprite)]]);

    const host: Host = {
      keyHeld: (k: KeyName) => eng.input.held(0, k),
      keyJustPressed: (k: KeyName) => eng.input.justPressed(0, k),
      playSound: (freq, waveform) => {
        sfx.play(freq, waveform as never, 0.35);
        setTimeout(() => sfx.stop(), 120);
      },
      actor: (name) => actors.get(name),
    };

    interpreter = new Interpreter(program, host);
    running = true;

    eng.loop((dt) => {
      scene.update(dt);
      if (running && interpreter) {
        interpreter.tick(dt);
        const vars = interpreter.variables;
        const names = Object.keys(vars);
        el.vars.innerHTML = names.length
          ? names.map((n) => `${n} <b>${vars[n]}</b>`).join(' &nbsp; ')
          : '';
      }
    });

    const scriptCount = program.sprites[0].scripts.length;
    setStatus(`Running — ${scriptCount} script${scriptCount === 1 ? '' : 's'}.`);
  } catch (err) {
    console.error(err);
    setStatus(`Could not start: ${(err as Error).message}. Build the wasm first (bun run build:wasm).`);
  }
}

function stop() {
  running = false;
  interpreter?.reset();
  setStatus('Stopped.');
}

el.run.addEventListener('click', () => void run());
el.stop.addEventListener('click', stop);
el.sample.addEventListener('click', () => {
  Blockly.serialization.workspaces.load(SAMPLE_WORKSPACE, workspace);
  refreshCode();
  setStatus('Sample loaded — press Run.');
});
el.copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el.code.textContent ?? '');
    setStatus('TypeScript copied to the clipboard.');
  } catch {
    setStatus('Clipboard blocked — select the code and copy manually.');
  }
});

// Start with something on screen so the editor is never a blank page.
Blockly.serialization.workspaces.load(SAMPLE_WORKSPACE, workspace);
refreshCode();
setStatus('Ready — press Run, or drag blocks from the palette.');

// Exposed for the headless smoke test.
(window as unknown as Record<string, unknown>).__blockEditor = {
  program: currentProgram,
  code: () => el.code.textContent,
  blockCount: () => workspace.getAllBlocks(false).length,
  isRunning: () => running,
  variables: () => interpreter?.variables ?? {},
};
