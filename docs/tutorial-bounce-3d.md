# Tutorial: Bounce, From Inside the Ball

This tutorial builds **Bounce 3D** — the same game as
[tutorial-bounce.md](./tutorial-bounce.md), played from inside the bouncing
ball. The finished source is `examples/bounce-raycaster`.

Build the 2D version first. The rules are identical, and this tutorial is
about the one thing that changes: with no side-on view, the player cannot
*see* the arc, so the arc has to be felt.

**What you will learn**

- how to drive the raycaster's vertical axis: `setEyeHeight` and `setPitch`
- how billboard elevation turns a sprite into a puzzle
- why a first-person body needs `slide` and not `setPos`
- how to tune a jump against a ceiling instead of against gravity

**Before you start:**

```bash
bun run build:wasm && bun run build:sdk
cd examples/bounce-raycaster && bun dev
```

---

## 1. What a raycaster can and cannot do

The engine's raycaster is a Wolfenstein-class renderer: it walks one ray per
screen column through a grid of cells and draws the wall it hits. There is no
floor geometry and no notion of standing on anything — the world is flat, and
every wall runs from floor to ceiling.

So a bouncing ball cannot be simulated by the physics step here, the way it
is in the 2D version. There is exactly one floor, at zero, and you integrate
the height yourself:

```typescript
const GRAVITY = 3.4;        // cells/s²
const BOUNCE_SPEED = 1.3;   // cells/s, every landing
const CHARGE_SPEED = 2.0;   // cells/s, fully wound up
const CEILING = 0.66;

let height = 0;             // cells above the floor
let rise = 0;               // cells per second
```

Everything is in **cells**, not pixels: the raycaster's world unit is one map
cell, and heights run 0 (floor) to 1 (ceiling).

## 2. The arena

Same idea as the 2D level — one string per row — but the characters mean
cells rather than tiles:

```typescript
const MAP = [
  '####################',
  '#P.......|.........#',
  '#..O..#..|....Q....#',
  //  ...
];
```

`#` and `|` are solid, `~` is water, `^` a spike, `O` and `Q` rings at two
different heights, `P` the start. Only the solid characters go into the
raycast map:

```typescript
function wallAt(col: number, row: number): number {
  switch (charAt(col, row)) {
    case '#': return W_WALL;
    case '|': return W_GLASS;
    case 'X': return W_EXIT;
    default:  return 0;      // everything else is walkable
  }
}

const rc = new Raycaster(engine, { cols: COLS, rows: ROWS, cells });
```

Wall types are 1-based here too: type *N* draws texture *N−1*.

## 3. Moving a body, not a camera

The obvious way to move is to compute a new position and call `setPos`. It
works and it feels wrong: the raycaster's camera is a *point*, so it slips
diagonally through the corner where two walls meet — a gap no ball could fit
through.

Move a body with width instead:

```typescript
const BODY_RADIUS = 0.22;

const moved = rc.slide(pose.x, pose.y, dx, dy, BODY_RADIUS);
rc.setPos(moved.x, moved.y, angle);
```

`slide` resolves each axis separately against the map, so pressing into a
wall at an angle slides you along it rather than stopping you dead. Bots in
the shooter example use the same call, which is why they cannot take
shortcuts the player cannot.

## 4. The vertical axis

This is the part the 2D version does not have. Two calls carry the whole
feeling of bouncing:

```typescript
const EYE_REST = 0.28;      // eye height of a ball sitting on the floor
const PITCH_GAIN = 26;      // px of horizon lean per cell/s of rise

  rc.setEyeHeight(EYE_REST + height);
  rc.setPitch(-rise * PITCH_GAIN);
```

**`setEyeHeight`** puts the eye between the floor (0) and the ceiling (1).
It shifts the projection, not the screen: walls grow and shrink around you
correctly, so rising genuinely reads as rising rather than as the image
sliding down.

**`setPitch`** shears the horizon, in framebuffer pixels, positive looking
down. A raycaster cannot truly tilt without becoming a different renderer,
but shearing the horizon is what the shooters of the era did and it reads the
same.

Leaning the horizon *with the velocity* rather than with the height is the
detail that sells it. At the top of a bounce you are high but not moving, so
the view is level; on the way up and down it tips. Without the lean, a bounce
reads as the floor moving away from you instead of you leaving it.

## 5. The rule, again

Identical to the 2D game, only in the vertical axis you now own:

```typescript
    const grounded = height <= 0.0001;

    if (wet) {
      rise += (FLOAT_SPEED - rise) * Math.min(1, FLOAT_ACCEL * dt);
      charge = 0;
    } else if (grounded) {
      if (engine.input.held(0, 'a')) {
        charge = Math.min(CHARGE_TIME, charge + dt);
        rise = 0;
      } else if (charge > 0) {
        const power = charge / CHARGE_TIME;
        rise = BOUNCE_SPEED + (CHARGE_SPEED - BOUNCE_SPEED) * power;
        charge = 0;
      } else {
        rise = BOUNCE_SPEED;
      }
    } else {
      rise -= GRAVITY * dt;
    }

    height = Math.max(0, height + rise * dt);
```

Buoyancy uses the same ease-toward-a-speed shape as the 2D version, and for
the same reason: a force plus drag has to be tuned against the frame length.

## 6. Tuning a jump against a ceiling

In 2D, the sky is the limit and you tune the charge against the width of your
pits. In a raycaster there is a hard ceiling one cell up, and clipping the
eye through it puts the camera outside the world:

```typescript
    if (height >= CEILING && rise > 0) {
      height = CEILING;
      rise = 0;
    }
```

That clamp creates a trap. Pick a charge that *would* peak above the ceiling
and the clamp eats the surplus: your fully-charged bounce ends early, comes
down sooner, and covers less ground than you designed for. A charge that
peaks exactly under the ceiling is strictly better than a bigger one.

Peak height is `v² / 2g`, so with `g = 3.4` and a ceiling at `0.66`:

```
v_max = sqrt(2 × 3.4 × 0.66) = 2.12 cells/s
```

`CHARGE_SPEED = 2.0` sits just under it. That is not a magic number — it is
the ceiling divided back through gravity.

Do the same for the free bounce: at `BOUNCE_SPEED = 1.3` it peaks at
`1.3² / 6.8 = 0.25` cells, which is the number the next two sections are
built on.

## 7. Rings at two heights

In 2D, a ring is a position. Here it can also be an *altitude*, which is what
billboard elevation is for:

```typescript
const RING_LOW = 0.30;    // where a rolling ball already is
const RING_HIGH = 0.78;   // above the peak of a free bounce
const RING_GATE = 0.15;   // how close you must be to pass through

  rc.addBillboard(ring.id, ring.at.x, ring.at.y, TEX_RING, 0.6);
  rc.setBillboardElevation(ring.id, ring.height);
```

`setBillboardElevation` puts a sprite's centre between the floor (0) and the
ceiling (1); 0.5, eye level, is the default and is where every billboard sat
before the engine had this. Drop it to stand something on the floor — the
spikes in this game are at 0.18 — or raise it to hang something overhead.

Collecting is then a two-part test, horizontal *and* vertical:

```typescript
      const flat = Math.hypot(moved.x - ring.at.x, moved.y - ring.at.y);
      if (flat < RING_REACH && Math.abs(height + EYE_REST - ring.height) < RING_GATE) {
```

Where you put `RING_HIGH` decides whether the game has a mechanic or not. The
first attempt used 0.58, and it did nothing: with the eye resting at 0.28 and
a free bounce peaking at 0.25, the eye already reaches 0.53 on every hop — a
"high" ring you collect by walking under it and waiting.

The threshold is:

```
RING_HIGH > EYE_REST + free-bounce peak + RING_GATE
          = 0.28   + 0.25              + 0.15  = 0.68
```

and it must stay inside a charged bounce's reach (`0.28 + 0.59 + 0.15 = 1.02`).
`0.78` sits comfortably between. Any high ring is now unreachable without
charging, and reachable with it.

## 8. Spikes you bounce over

Same idea in reverse. A spike hurts only if you are low:

```typescript
const SPIKE_CLEARANCE = 0.34;

    for (const spike of spikeSpots) {
      if (Math.hypot(moved.x - spike.x, moved.y - spike.y) < SPIKE_REACH
        && height < SPIKE_CLEARANCE) {
        pop();
      }
    }
```

`0.34` sits just above the free bounce's 0.25 peak and well under the charged
bounce's 0.59. So a spike cannot be crossed by drifting over it — you have to
mean it.

Three constants, one arithmetic relationship, and the game has a skill.

## 9. A minimap with fog of war

The player has no overview, which is the point. A minimap that shows the
whole arena hands it back, so reveal only cells you have stood in:

```typescript
    seen.add(`${Math.floor(pose.x)},${Math.floor(pose.y)}`);
    // ... and when drawing:
    if (!seen.has(`${col},${row}`)) continue;
```

## 10. What differs from the 2D version

| | Classic | First person |
| --- | --- | --- |
| Height | engine physics, via `usePhysics` | integrated in the game loop |
| Collision | tilemap solids, resolved in Rust | `rc.slide` per frame |
| Reading the arc | you see it | eye height and horizon lean |
| Rings | a position | a position *and* an altitude |
| Jump limit | pit width | the ceiling |

The rules are the same game. Everything in this table is a consequence of
where the camera sits.

## 11. Where to go next

- **Move a ring while the game runs.** `setBillboardElevation` can be called
  every frame; a ring that rises and falls needs no new engine feature.
- **Add pitch to the look controls.** `setPitch` is already exposed; wire it
  to two keys and clamp it, and you have free look.
- **Read `examples/dust-protocol`**, which uses the same vertical axis for
  recoil, and adds `hitscan`, `lineOfSight` and `findPath` to make a shooter
  out of it.
