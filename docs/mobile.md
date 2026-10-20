# Games on Phones

A Cathode game runs on a phone without changing a line of it. On a touch
screen the engine:

- **fills the screen** around whatever else your page shows — a score bar, a
  status line — and stays clear of the notch and the home bar;
- **adds on-screen controls that match your game**, showing only the buttons
  it actually reads;
- **pauses when the app goes to the background**, and resumes when it comes
  back — unless the player had paused it themselves;
- **starts the sound on the first tap**, and restarts it if the phone stopped
  it, as iOS does for a phone call;
- **stops stray gestures**: no pinch zoom, no double-tap zoom, no
  pull-to-refresh, no long-press menu in the middle of a jump.

On a desktop nothing changes: the game keeps the scale it asked for, unless
the window is too small for it.

## The Controls Draw Themselves

The controls show a button the first time your game reads it through
`engine.input` — `held`, `justPressed` or `justReleased`. So a title screen
that only checks `start` shows only **START**, and the d-pad appears the
moment the game first checks a direction. Nothing to configure, and no
buttons the game ignores.

| Your game reads | The player sees |
| --- | --- |
| `up` `down` `left` `right` | a d-pad, bottom left |
| `a` `b` `x` `y` | face buttons, bottom right — B low and left, A high and right |
| `l` `r` | shoulder buttons in the top corners |
| `start` `select` | small buttons along the bottom edge |

The d-pad is one target, not four buttons, so a thumb can roll from ◀ to ▲
without lifting, and press diagonals. A thumb resting on its centre presses
nothing, and one that slides off the edge keeps steering. Each finger is
tracked separately, so the d-pad and A work at the same time.

## What Your Game Has To Get Right

The engine cannot fix these from the outside. Each one was a real bug in a
demo in this repository.

**Read every action through `engine.input`.** On a phone, a listener on
`keydown` hears nothing. The first-person demo listened for Z and Enter itself,
so a phone player could walk but never shoot. Read `engine.input.justPressed(0,
'a')` instead — the keyboard still works, because Z, space and Enter map to A
and START.

**Mark keyboard instructions.** "Press Z to jump" is wrong on a phone. Add
`data-keyboard-hint` and touch screens hide it:

```html
<div id="keys" data-keyboard-hint>← → MOVE · Z JUMP</div>
```

Don't put it on an element your game writes messages into — the message would
vanish too.

**Don't size the canvas yourself.** Leave it to the engine. A page that sets
the game's size in CSS fights the fitting: the ice hockey demo fixed its
screen at 768 × 720 inside a wrapper, so on a phone held sideways the page was
807 pixels tall on a 360-pixel screen.

**Keep the page fluid.** One element with `width: 768px` makes the whole page
768 pixels wide on a 412-pixel phone, and the browser shrinks everything to
fit. Write `width: min(768px, 100%)`.

**Declare it.** Add `"touch"` to `input` in your
[`cathode.json`](./project-format.md), once all of the above holds.

## Your Own Controls

Create a `TouchControls` and it replaces the engine's:

```ts
import { TouchControls } from '@cathode/sdk';

new TouchControls(engine.input, document.body, {
  buttons: ['left', 'right', 'a'], // a fixed set instead of drawing as asked
  size: 120,                       // d-pad width in CSS pixels
  opacity: 0.5,
});
```

`engine.touch` is whichever set is on screen, or `null`.

## Showing the Engine Inside Something Else

The fitting and the controls assume the game owns its page. An editor that
shows the engine in one panel of a larger tool turns both off:

```ts
const engine = await Cathode.nes(canvas, 2, { fit: false, touchControls: false });
```

Cathode Studio does exactly this.

## Checking It

```bash
npm run build:dist
node scripts/verify/mobile.mjs
```

Every published game is played on an emulated Pixel 7, held both ways, with
real touch events. It fails if a game scrolls, leaves part of the screen
unused that it could have had, shows no controls or two sets of them, ignores
a thumb on the d-pad, keeps its keyboard hints, or never stops resizing.

This is Chromium emulating Android. It says nothing certain about Safari on
iOS — that needs the iOS simulator or a device.
