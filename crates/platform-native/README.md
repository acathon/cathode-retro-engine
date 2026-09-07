# Cathode on the desktop

A native binary running the same engine core the browser runs — no browser, no
WebAssembly, no JavaScript. It is a playable game rather than a placeholder:
**Cathode Bricks**, at 256×240.

```bash
cargo run -p cathode-platform-native
cargo run -p cathode-platform-native -- --preset=gameboy
```

| Key | Does |
| --- | --- |
| `←` `→` | Move the paddle |
| `Z` | Serve |
| `Enter` | Play again |
| `Esc` | Quit |

A gamepad works too, through `gilrs`; d-pad and south button are mapped to the
same actions.

## What it demonstrates

**The core is portable.** `crates/core` has no idea whether it is being driven
by a canvas or a window. Here it is `winit` for the window, `pixels` for the
GPU blit, `cpal` for audio and `gilrs` for gamepads — and the framebuffer it
copies out is the same one the browser copies.

**Rules and rendering split the same way as on the web.** `breakout.rs`
imports nothing but `GamepadState`: it takes a direction and a time step and
returns a position to draw and a list of noises to make. That is why it has 19
unit tests and the desktop app can be checked at all.

**The scene is ECS, not a bespoke loop.** Sixty bricks, a paddle and a ball are
entities with `Position` and `SpriteIndex`, spawned once and repositioned each
frame. A cleared brick is hidden, not despawned, so nothing allocates while
the game is running.

**Sheets are generated.** The paddle, the ball, the brick bands and the font
are all built in code at start-up, so the binary needs no files beside it.

## Headless rendering

```bash
cargo run -p cathode-platform-native -- --headless 900 --shot shot.png
```

Runs the game for 900 frames with no window and no GPU — the paddle plays
itself — and writes the last frame as a PNG.

This is not a toy. A native binary has no equivalent of opening a browser and
looking at it, so without this there is no way to check that a build still
draws the right thing, and no way to run it on a machine with no graphics
stack at all. Both bugs found while building this were found through it: HUD
text drawn 900 times on top of itself, and then no HUD text at all.

`render` drains the text queued during a step, so it pairs with a step exactly
once. Step many times before rendering and every frame's HUD lands in the same
picture; render again afterwards and the queue is empty. One render per step.

## If it will not open a window

```
Cathode could not open a graphics surface: AdapterNotFound
```

`wgpu` found no GPU it can use — usual on a headless box or a bare container.
Use `--headless` above, or run it somewhere with a graphics driver. It exits
with a message rather than a backtrace, which it did not always do.
