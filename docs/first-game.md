# Build Your First Game

This tutorial builds a tiny collectible game with:

- one player sprite,
- keyboard movement,
- one collectible,
- a score counter,
- no external art files.

The goal is not to build a polished game. The goal is to show the smallest useful loop you can extend.

## Before You Start

Complete [getting-started.md](./getting-started.md) first so your local toolchain and SDK builds are already working.

## Project Setup

Create a new folder with a standard Vite TypeScript app, then install the SDK package the same way you would in a normal game project.

At minimum, you need:

```text
my-first-game/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    └── main.ts
```

Your `index.html` only needs a canvas:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My First Retro Game</title>
    <style>
      body {
        margin: 0;
        background: #111;
        display: grid;
        place-items: center;
        min-height: 100vh;
      }

      canvas {
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## The Game Code

Create `src/main.ts` with this code:

```ts
import { BitmapFont, Cathode, Scene, Sprite } from '@cathode/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;

function createSheet(engine: Cathode): number {
  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = 16;
  sheetCanvas.height = 8;

  const ctx = sheetCanvas.getContext('2d')!;

  // Frame 0: player
  ctx.fillStyle = '#2dd4bf';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(2, 2, 1, 1);
  ctx.fillRect(5, 2, 1, 1);

  // Frame 1: collectible
  ctx.fillStyle = '#facc15';
  ctx.fillRect(10, 1, 4, 6);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(11, 2, 2, 4);

  const data = ctx.getImageData(0, 0, sheetCanvas.width, sheetCanvas.height);

  return engine.raw!.upload_sheet(
    sheetCanvas.width,
    sheetCanvas.height,
    8,
    8,
    new Uint8Array(data.data.buffer),
  );
}

function randomGrid(max: number): number {
  return Math.floor(Math.random() * max) * 8;
}

async function bootstrap() {
  const engine = await Cathode.gameboy(canvas, 4);
  const scene = new Scene(engine);
  const font = BitmapFont.builtin(engine);
  const sheet = createSheet(engine);

  const player = new Sprite(scene, {
    x: 40,
    y: 40,
    sheet,
    frame: 0,
    layer: 5,
  });

  const pickup = new Sprite(scene, {
    x: 96,
    y: 72,
    sheet,
    frame: 1,
    layer: 4,
  });

  let score = 0;
  const speed = 70;

  engine.loop((dt) => {
    if (engine.input.held(0, 'left')) player.x -= speed * dt;
    if (engine.input.held(0, 'right')) player.x += speed * dt;
    if (engine.input.held(0, 'up')) player.y -= speed * dt;
    if (engine.input.held(0, 'down')) player.y += speed * dt;

    player.x = Math.max(0, Math.min(engine.width - 8, player.x));
    player.y = Math.max(0, Math.min(engine.height - 8, player.y));

    if (player.overlaps(pickup)) {
      score += 1;
      pickup.x = randomGrid(Math.floor(engine.width / 8));
      pickup.y = randomGrid(Math.floor(engine.height / 8));
    }

    scene.update(dt);
    font.draw(`SCORE ${score}`, 4, 4, 1);
    font.draw('MOVE WITH ARROWS', 4, engine.height - 12, 1);
  });
}

bootstrap();
```

## Why This Example Is Useful

This single file teaches the most important building blocks:

- `Cathode.gameboy(...)` creates a configured engine preset.
- `Scene` owns your sprite updates.
- `Sprite` gives you simple game objects with positions and frames.
- `BitmapFont.builtin(...)` gives you HUD text without shipping a bitmap font file.
- `engine.loop(...)` is your main update/render cycle.

## Run It

Start your local dev server:

```bash
bun dev
```

If the SDK or WASM bindings are linked from the monorepo, make sure you already ran the shared setup from [getting-started.md](./getting-started.md).

## Where To Go Next

After this works, extend it in one small step at a time:

1. Add sound using `SoundChannel`.
2. Add enemies using more `Sprite` instances.
3. Replace the procedural sprite sheet with a real PNG via `engine.loadSheet(...)`.
4. Move to `TileMap` when you want level structure.
5. Study a complete example in `examples/` once you need more systems.

## Good Next Examples

- `examples/demo-game` if you want platforming.
- `examples/space-game` if you want arcade action.
- `examples/doom-game` if you want the raycaster path.
