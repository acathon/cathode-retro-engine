# Tutorial: Bounce, in Two Dimensions

This tutorial builds **Bounce** — a red ball that never stops bouncing —
from an empty scene to the finished game in `examples/bounce-classic`. Along
the way you will hand a body to the engine's physics, declare which tiles are
walls, and discover the two tuning mistakes that make a bouncing game
unplayable.

The first-person version of the same game is
[tutorial-bounce-3d.md](./tutorial-bounce-3d.md). Build this one first: the
rules are easier to see from the side.

**What you will learn**

- how to let the engine own a body's gravity, movement and collisions
- how `setSolidTiles` turns a drawing into geometry
- why momentum, not speed, is what a jump needs
- how to model buoyancy so it does not depend on the frame rate

**Before you start:** [getting-started.md](./getting-started.md), and a build
of the engine:

```bash
bun run build:wasm && bun run build:sdk
```

Run the finished game at any point to see where you are heading:

```bash
cd examples/bounce-classic && bun dev
```

---

## 1. The one rule

Every mechanic in Bounce falls out of a single sentence:

> When the ball touches the ground, send it back up.

Not "when the player presses jump". The ball has no idle state, so the whole
game becomes about *steering* a bounce you did not ask for — which is what
makes it feel like Bounce and not like a platformer.

Hold that sentence. Everything below is either implementing it or protecting
it.

## 2. A scene with a ball in it

Start with the engine, a scene, and a sprite sheet you draw in code. Drawing
art procedurally keeps the tutorial to one file, and the pixels are easier to
tweak than an image.

```typescript
import { Cathode, Scene, Sprite, TileMap } from '@cathode/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const TILE = 8;

async function initGame() {
  const engine = await Cathode.nes(canvas, 3);
  const scene = new Scene(engine);

  const sheet = buildSheet();                       // see the example file
  const sheetHandle = engine.raw.upload_sheet(sheet.w, sheet.h, TILE, TILE, sheet.pixels);
  engine.raw.set_bg_color(10, 13, 22);

  engine.loop((dt) => {
    scene.update(dt);
  });
}
```

`Cathode.nes(canvas, 3)` gives you a 256×240 framebuffer at 3× scale. Every
number in this tutorial is in those framebuffer pixels, not screen pixels.

## 3. A level you can read

The course is one string per row, one character per tile. This is worth doing
even for a small game: you can see the level in the source, and changing it
is editing text.

```typescript
const LEVEL = [
  '################################################################################################',
  '#..............................................................................................#',
  //  ... 28 more rows ...
];

const T_EMPTY = 0;
const T_WALL = 1;    // sheet tile 0
const T_PLATE = 2;   // sheet tile 1
const T_SPIKE = 3;   // sheet tile 2
const T_WATER = 4;   // sheet tile 3
```

Tile ids are **1-based**: the renderer maps id *N* to sheet tile *N−1*, so id
0 can mean "nothing here".

Build the tilemap by walking the strings:

```typescript
  const map = new TileMap(scene, {
    name: 'Course', cols: COLS, rows: ROWS, tileWidth: TILE, tileHeight: TILE,
  });
  const layer = map.addLayer('Course', sheetHandle, false);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = tileAt(col, row);
      if (id !== T_EMPTY) map.setTile(layer, col, row, id);
    }
  }
```

## 4. The line that matters

```typescript
  map.setSolidTiles(layer, [T_WALL, T_PLATE]);
  map.commit();
```

That is the whole of collision setup. From here the engine's physics step
resolves the ball against every wall and platform in the level, in Rust,
without any TypeScript running per collision.

Notice what is **not** in that list. Spikes and water are drawn but not
solid, deliberately, so the ball rolls straight into them and the game can
decide what that means. Solidity is a gameplay decision, not a drawing one.

## 5. Handing the ball to the engine

```typescript
  const ball = new Sprite(scene, {
    sheet: sheetHandle, frame: 4, x: start.x, y: start.y, layer: 10,
  });

  ball.usePhysics({
    gravity: 0.92,        // a multiple of the engine's base gravity, 980 px/s²
    width: 7, height: 7,  // collider, a touch smaller than the 8px sprite
    offsetX: 0.5, offsetY: 0.5,
  });
```

`usePhysics` moves this sprite from "you move it in TypeScript" to "the
engine moves it". Gravity, integration and every wall, floor and ceiling
collision now happen in Rust; `ball.x`, `ball.y`, `ball.velocityX` and
`ball.velocityY` are read back each frame.

One consequence bites everyone once: **assigning `ball.x` no longer works.**
The engine owns the position and overwrites it on the next frame. Respawning
needs `ball.setPosition(x, y)`, which tells the engine too.

## 6. Implementing the rule

The tempting way to detect a landing is to watch the velocity: the engine
zeroes vertical speed the moment it resolves a floor, so `wasFalling && vy === 0`
looks like a landing.

Don't. It breaks the instant you want to *hold* the ball on the ground to
charge a bigger hop — you set `vy = 0` yourself, and now you cannot tell your
own zero from the engine's. Ask the level directly instead:

```typescript
  function onGround(): boolean {
    const left = Math.floor((ball.x + 0.5) / TILE);
    const right = Math.floor((ball.x + 0.5 + BALL_BOX - 0.01) / TILE);
    const row = Math.floor((ball.y + 0.5 + BALL_BOX + 1) / TILE);
    for (let col = left; col <= right; col++) {
      const t = tileAt(col, row);
      if (t === T_WALL || t === T_PLATE) return true;
    }
    return false;
  }
```

Now the rule, in full:

```typescript
    if (grounded && !inWater) {
      if (engine.input.held(0, 'a')) {
        charge = Math.min(CHARGE_TIME, charge + dt);
        vy = 0;                                   // wind up, stay put
      } else if (charge > 0) {
        const power = charge / CHARGE_TIME;
        vy = -(BOUNCE_SPEED + (CHARGE_SPEED - BOUNCE_SPEED) * power);
        charge = 0;
      } else {
        vy = -BOUNCE_SPEED;                       // the free bounce
      }
    }
```

Three branches: winding up, releasing a charge, and the bounce you get for
free. That last branch is the rule from step 1.

## 7. The mistake that breaks every jump

Here is the natural way to write air control:

```typescript
  let vx = 0;
  if (held('left'))  vx -= ROLL_SPEED;
  if (held('right')) vx += ROLL_SPEED;
  if (!grounded) vx *= AIR_CONTROL;   // 0.7 — looks harmless
```

It is wrong, and it is wrong in a way that only shows up in level design.
Multiplying airborne speed makes **every jump shorter than its own run-up**.
Sprint at a gap at full speed, leave the ground, and you instantly slow to
70%. No charge, however long, clears a gap you were sprinting at — and you
will spend an afternoon widening the charge instead of finding the bug.

What a jump needs is momentum:

```typescript
  const wanted = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
  let vx: number;
  if (grounded) {
    vx = wanted * ROLL_SPEED;                 // on the ground you set your speed
  } else {
    // in the air you keep the speed you took off with; steering only nudges it
    vx = clamp(ball.velocityX + wanted * AIR_STEER * dt, -ROLL_SPEED, ROLL_SPEED);
  }
```

`AIR_STEER` is an acceleration (340 px/s²), not a multiplier. The ball leaves
the ground at whatever speed it had and stays there unless you steer.

### Checking your numbers

You can predict a jump before you play it. With gravity `g = 980 × 0.92 = 902`
and a launch speed `v`:

| quantity | formula | full charge (v = 300) |
| --- | --- | --- |
| peak height | v² / 2g | 50 px ≈ 6 tiles |
| time in the air | 2v / g | 0.67 s |
| distance at 104 px/s | 2v / g × 104 | 69 px ≈ 8.6 tiles |

So a five-tile spike pit is comfortably clearable and a nine-tile one is not.
Design against the arithmetic, and playtest to confirm it.

## 8. The mistake that makes water frame-rate dependent

Buoyancy looks like an upward force with drag:

```typescript
  if (inWater) vy = vy * WATER_DRAG + WATER_LIFT * dt;   // don't
```

The problem is that the engine already added gravity to `vy` this frame. Your
lift is being tuned against that addition, so the speed the ball settles at
depends on how long the frame was. Tune it at 60 fps and it sinks at 30.

Ease toward a target speed instead:

```typescript
  const FLOAT_SPEED = -205;   // terminal rise speed, px/s
  const FLOAT_ACCEL = 30;

  if (inWater) {
    vy += (FLOAT_SPEED - vy) * Math.min(1, FLOAT_ACCEL * dt);
    vx *= 0.8;
    charge = 0;               // you cannot wind up while swimming
  }
```

Now the ball rises at 205 px/s in water regardless of frame rate, leaves the
surface at that speed, and coasts 23 px higher — which is what puts the ring
above the pool in reach of nothing but a swim.

## 9. Hazards, and the death loop

Spikes are a tile test against the ball's box:

```typescript
  function onSpikes(): boolean {
    // same box walk as onGround, testing for T_SPIKE
  }
```

Wire it up and the game is playable — and then unplayable for a reason that
has nothing to do with spikes.

Put a checkpoint two tiles from a spike pit, and a player who dies respawns
still holding *right*, rolls straight back into the pit, and loses all three
lives in about two seconds. One mistake eats the whole run.

Two fixes, both small:

```typescript
const RESPAWN_FREEZE = 0.7;

  if (respawnFreeze > 0) {
    respawnFreeze -= dt;
    ball.move(0, 0);
    return;                    // ignore input while the player lets go
  }
```

and place checkpoints a clear run-up short of each hazard, never beside one.

This is the general shape of the lesson: a hazard is not just its damage, it
is also what happens *after* it.

## 10. Rings, checkpoints and the exit

Everything left is proximity tests in the loop:

```typescript
    for (const ring of rings) {
      if (ring.taken) continue;
      if (Math.abs(ball.x - ring.at.x) < RING_REACH
        && Math.abs(ball.y - ring.at.y) < RING_REACH) {
        ring.taken = true;
        ring.sprite.active = false;
        ring.sprite.setPosition(-9999, -9999);
        collected++;
      }
    }
```

Note both lines for removing a ring. `active = false` stops it updating;
parking it off-screen stops it *drawing*. A sprite the engine still knows
about keeps rendering wherever it last stood, so collectibles that vanish
need both.

## 11. Showing the charge

The ball never stops bouncing, which means you cannot stand still and wind
up: holding the button only starts charging once you next land. Without
feedback that reads as the button being broken.

```html
<div id="charge-track"><div id="charge"></div></div>
```

```typescript
    el.charge.style.width = `${(charge / CHARGE_TIME) * 100}%`;
```

Six lines, and the mechanic becomes legible.

## 12. Where to go next

- **Change the level.** It is a string array; every hazard in the game is one
  character. Widen the first pit to nine tiles and confirm the arithmetic in
  step 7 was right.
- **Add a moving platform.** Give a sprite `setSolid(true)` and move it: the
  engine's physics will push the ball with it.
- **Build the same game in first person** with
  [tutorial-bounce-3d.md](./tutorial-bounce-3d.md), where the bounce has to be
  felt instead of seen.

The finished source is `examples/bounce-classic/src/main.ts`, just under 500 lines
including the procedural art.
