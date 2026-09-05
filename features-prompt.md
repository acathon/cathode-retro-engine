# retro-engine — Full Feature Implementation Prompt

You are an expert Rust and TypeScript engineer. You are working on an existing
open-source retro game engine called **retor-engine** (note: typo in repo name,
keep it consistent). The repo lives at `github.com/acathon/retor-engine`.

## Current state (what already exists)

```
crates/
  core/          — Rust engine: ECS (hecs), RGBA software renderer, chiptune
                   audio (6 waveforms, Galois LFSR noise), AABB physics,
                   input abstraction, asset store, scene manager
  platform-web/  — wasm-bindgen WASM bindings → WebEngine JS class
  platform-native/ — winit + pixels + cpal desktop runner
packages/
  sdk/           — TypeScript SDK: Cathode, Scene, Sprite, TileMap,
                   SoundChannel, TouchControls, InputReader
  cli/           — retro-cli: new / run / build / export commands
  editor/        — vanilla JS browser tilemap editor
examples/
  space-game/    — Space Invaders clone (procedural graphics)
  tetris/        — Game Boy Tetris (SRS rotation, levels)
  trex-game/     — Endless T-Rex runner
  demo-game/     — Basic platformer
```

The engine already has:
- `engine.shake(intensity, duration)` — screen shake
- `scene.follow(sprite)` — basic camera follow
- `NOTE` map (C3–B5), `sfx.melody()`, `sfx.play(note, waveform, vol)`
- `Sprite.play(AnimConfig)` — frame animation
- `TouchControls` overlay for mobile

---

## Your task

Implement ALL of the following features. Every file must be complete — no
stubs, no `todo!()`, no `// TODO` comments, no placeholder bodies. All Rust
must pass `cargo check`. All TypeScript must be strict-mode valid.

Organise your output as one file at a time, with the full file path as a
header. Where a file already exists, show the complete replacement.

---

# PART 1 — RUST CORE FEATURES (`crates/core`)

## 1.1 Collision Event System

**File:** `crates/core/src/collision/mod.rs`

Add an event-driven collision system on top of the existing AABB physics.

```rust
pub enum CollisionSide { Top, Bottom, Left, Right }

pub struct CollisionEvent {
    pub entity_a: Entity,
    pub entity_b: Entity,
    pub side:     CollisionSide,
    pub overlap:  Vec2,
}

pub struct CollisionQueue {
    events: Vec<CollisionEvent>,
}

impl CollisionQueue {
    pub fn new() -> Self
    pub fn push(&mut self, event: CollisionEvent)
    pub fn drain(&mut self) -> impl Iterator<Item = CollisionEvent> + '_
    pub fn len(&self) -> usize
    pub fn is_empty(&self) -> bool
}
```

- After each physics step, populate a `CollisionQueue` on the `Engine`
- `CollisionEvent` is emitted for every dynamic↔solid pair that overlaps
- `CollisionSide` is determined by which axis was resolved (shallow axis rule)
- Add `engine.collisions: CollisionQueue` to the `Engine` struct
- Drain and expose via WASM as JSON array: `wasm.poll_collisions() -> JsValue`

---

## 1.2 Advanced Camera System

**File:** `crates/core/src/camera/mod.rs`

Replace the raw `Vec2` camera with a proper camera struct.

```rust
pub struct Camera {
    pub pos:        Vec2,       // current position
    pub target:     Vec2,       // where it wants to be
    pub lerp_speed: f32,        // 0.0=instant, 1.0=never catches up
    pub dead_zone:  Option<Rect>, // camera only moves when target leaves this rect
    pub bounds:     Option<Rect>, // world bounds — camera won't go past these
    pub zoom:       f32,        // 1.0 = normal, 2.0 = zoomed in
}

pub struct Rect { pub x: f32, pub y: f32, pub w: f32, pub h: f32 }

impl Camera {
    pub fn new() -> Self
    pub fn update(&mut self, dt: f32)  // lerp pos toward target
    pub fn follow(&mut self, pos: Vec2, entity_w: f32, entity_h: f32,
                  screen_w: f32, screen_h: f32)
    pub fn world_to_screen(&self, world: Vec2) -> Vec2
    pub fn screen_to_world(&self, screen: Vec2) -> Vec2
}
```

- Replace `renderer.camera: Vec2` with `renderer.camera: Camera`
- In `renderer.render()`, use `camera.pos` for tile layer offset
- `Camera::update(dt)` must lerp pos toward target using `lerp_speed`
- Dead zone: if target is inside the dead zone rect (relative to screen center),
  don't move the camera
- Bounds clamping: `pos.x.clamp(bounds.x, bounds.x + bounds.w - screen_w)`
- Expose via WASM:
  - `set_camera_target(x, y)`
  - `set_camera_lerp(speed: f32)`
  - `set_camera_bounds(x, y, w, h)`
  - `set_camera_dead_zone(x, y, w, h)`
  - `set_camera_zoom(zoom: f32)`
  - `get_camera_pos() -> Float32Array`

---

## 1.3 Particle System

**File:** `crates/core/src/particles/mod.rs`

```rust
pub struct Particle {
    pub pos:       Vec2,
    pub vel:       Vec2,
    pub color:     [u8; 4],   // RGBA
    pub size:      f32,       // pixels
    pub life:      f32,       // remaining seconds
    pub max_life:  f32,
    pub gravity:   f32,
    pub fade:      bool,      // alpha → 0 over lifetime
    pub shrink:    bool,      // size → 0 over lifetime
}

pub struct ParticleEmitter {
    pub pos:          Vec2,
    pub particles:    Vec<Particle>,
    pub max_particles: usize,
}

impl ParticleEmitter {
    pub fn new(max: usize) -> Self

    /// One-shot burst — `count` particles in a cone around `angle` ± `spread` radians.
    pub fn burst(&mut self, pos: Vec2, count: u32, config: &EmitConfig)

    /// Continuous emission — call each frame, rate = particles/second.
    pub fn emit(&mut self, pos: Vec2, rate: f32, dt: f32, config: &EmitConfig)

    /// Advance all particles, remove dead ones. Returns count removed.
    pub fn update(&mut self, dt: f32) -> u32

    /// Write all live particles into the framebuffer as colored squares.
    pub fn render(&self, fb: &mut FrameBuffer, camera: Vec2)
}

pub struct EmitConfig {
    pub angle:       f32,    // base angle in radians
    pub spread:      f32,    // ± spread in radians
    pub speed_min:   f32,    // px/s
    pub speed_max:   f32,
    pub life_min:    f32,    // seconds
    pub life_max:    f32,
    pub size_min:    f32,
    pub size_max:    f32,
    pub gravity:     f32,
    pub color_start: [u8; 4],
    pub color_end:   [u8; 4], // lerp toward this over lifetime
    pub fade:        bool,
    pub shrink:      bool,
}
```

- `Engine` owns a `Vec<ParticleEmitter>` — engines can have multiple emitters
- `Engine::update()` calls `emitter.update(dt)` for all emitters
- `Renderer::render()` calls `emitter.render(fb, camera)` after sprites
- Expose via WASM:
  - `create_emitter(max_particles: u32) -> u32` (returns emitter handle)
  - `emitter_burst(handle, x, y, count, config_json)`
  - `emitter_set_pos(handle, x, y)`
  - `destroy_emitter(handle)`

---

## 1.4 Tween Engine

**File:** `crates/core/src/tween/mod.rs`

```rust
pub enum EaseFn {
    Linear,
    EaseIn, EaseOut, EaseInOut,
    BounceOut, ElasticOut, BackOut,
}

pub struct Tween {
    pub from:     f32,
    pub to:       f32,
    pub duration: f32,
    pub elapsed:  f32,
    pub ease:     EaseFn,
    pub repeat:   bool,
    pub yoyo:     bool,   // ping-pong: reverses direction on repeat
    complete:     bool,
}

impl Tween {
    pub fn new(from: f32, to: f32, duration: f32, ease: EaseFn) -> Self
    pub fn update(&mut self, dt: f32) -> f32  // returns current value
    pub fn value(&self) -> f32
    pub fn is_complete(&self) -> bool
    pub fn reset(&mut self)
}

fn apply_ease(t: f32, ease: &EaseFn) -> f32
```

- Implement all easing functions mathematically (no lookup tables):
  - `BounceOut`: the standard 4-part bounce formula
  - `ElasticOut`: `c4 * 2^(-10t) * sin((t*10-0.75)*c4) + 1`
  - `BackOut`: `1 + c3*(t-1)^3 + c1*(t-1)^2` where c1=1.70158, c3=c1+1
- Expose via WASM as a managed tween pool:
  - `tween_create(from, to, duration_secs, ease_id: u8, repeat, yoyo) -> u32`
  - `tween_value(handle) -> f32`
  - `tween_is_complete(handle) -> bool`
  - `tween_reset(handle)`
  - `tween_destroy(handle)`
- Engine calls `tween.update(dt)` on all live tweens each frame

---

## 1.5 Bitmap Text Renderer

**File:** `crates/core/src/text/mod.rs`

```rust
pub struct BitmapFont {
    pub sheet_handle: u32,   // asset handle
    pub char_width:   u32,
    pub char_height:  u32,
    pub cols:         u32,   // chars per row in the sheet
    pub first_char:   u8,    // ASCII code of first char in sheet (usually 32 = space)
}

impl BitmapFont {
    pub fn new(sheet_handle: u32, char_w: u32, char_h: u32,
               cols: u32, first_char: u8) -> Self

    /// Draw `text` at pixel position (x, y) into the framebuffer.
    pub fn draw_text(&self, fb: &mut FrameBuffer, assets: &AssetStore,
                     text: &str, x: i32, y: i32, scale: u32)

    /// Measure text width in pixels.
    pub fn measure(&self, text: &str, scale: u32) -> u32
}
```

- `draw_text` iterates each char, computes its tile index as `(c as u8 - first_char)`,
  blits the correct tile from the font sheet at the correct screen position
- Scale: 1=normal, 2=2×, etc — just multiply positions and blit dimensions
- Transparent pixels in the font sheet are skipped (alpha==0)
- Newlines (`\n`) advance y by `char_height * scale`, reset x to origin
- `Engine` owns a `Vec<BitmapFont>` registered by handle
- Expose via WASM:
  - `register_font(sheet_handle, char_w, char_h, cols, first_char) -> u32`
  - `draw_text(font_handle, text, x, y, scale)`
  - `measure_text(font_handle, text, scale) -> u32`

---

## 1.6 Game Timer Utility

**File:** `crates/core/src/timer/mod.rs`

```rust
pub struct GameTimer {
    pub duration:  f32,
    pub elapsed:   f32,
    pub repeat:    bool,
    pub active:    bool,
    fired:         bool,
}

impl GameTimer {
    pub fn new(duration: f32, repeat: bool) -> Self
    pub fn update(&mut self, dt: f32) -> bool  // returns true when it fires
    pub fn reset(&mut self)
    pub fn stop(&mut self)
    pub fn start(&mut self)
    pub fn progress(&self) -> f32   // 0.0 → 1.0
    pub fn remaining(&self) -> f32
}
```

- `Engine` owns a `Vec<GameTimer>` (a managed pool)
- `Engine::update()` calls `timer.update(dt)` on all active timers and
  collects fired indices into an `Vec<u32>` accessible as
  `engine.fired_timers: Vec<u32>` (cleared each frame)
- Expose via WASM:
  - `timer_create(duration_secs, repeat) -> u32`
  - `timer_start(handle)`, `timer_stop(handle)`, `timer_reset(handle)`
  - `timer_progress(handle) -> f32`
  - `poll_fired_timers() -> Vec<u32>` (returns handles of all timers that fired this frame)

---

## 1.7 ADSR Audio Envelope

**File:** `crates/core/src/audio/envelope.rs`  
(modify `crates/core/src/audio/mod.rs`)

```rust
pub struct Envelope {
    pub attack:  f32,  // seconds to reach peak
    pub decay:   f32,  // seconds to drop to sustain
    pub sustain: f32,  // 0.0–1.0 sustained volume
    pub release: f32,  // seconds to fade to 0 after note_off
    // internal
    phase:   EnvPhase,
    elapsed: f32,
    level:   f32,
}

enum EnvPhase { Idle, Attack, Decay, Sustain, Release, Done }

impl Envelope {
    pub fn new(a: f32, d: f32, s: f32, r: f32) -> Self
    pub fn note_on(&mut self)
    pub fn note_off(&mut self)
    pub fn tick(&mut self, dt: f32) -> f32  // returns 0.0–1.0 amplitude multiplier
    pub fn is_done(&self) -> bool

    // Presets
    pub fn pluck()  -> Self  // short attack, fast decay, zero sustain
    pub fn pad()    -> Self  // slow attack, long sustain
    pub fn snare()  -> Self  // instant attack, fast decay, no sustain
    pub fn bass()   -> Self  // fast attack, medium decay, 0.6 sustain
}
```

- Add `envelope: Envelope` to `Channel`
- `Channel::sample()` multiplies raw waveform output by `envelope.tick(sample_dt)`
  where `sample_dt = 1.0 / sample_rate`
- `Channel::play()` calls `envelope.note_on()`
- `Channel::stop()` calls `envelope.note_off()` (channel stays active through release phase)
- Expose via WASM: `audio_set_envelope(ch, attack, decay, sustain, release)`
- Preset shortcuts: `audio_set_envelope_preset(ch, preset_name: &str)`
  where preset_name is "pluck" | "pad" | "snare" | "bass" | "default"

---

## 1.8 Music Pattern Sequencer

**File:** `crates/core/src/audio/sequencer.rs`

A simple step-sequencer / MML player for background music.

```rust
/// A single note event in a pattern.
pub struct NoteEvent {
    pub channel:   u8,
    pub note:      f32,    // frequency in Hz, 0.0 = REST
    pub waveform:  u8,
    pub volume:    f32,
    pub duration:  f32,    // seconds
}

/// An ordered list of NoteEvents that loops.
pub struct Pattern {
    pub events:  Vec<NoteEvent>,
    pub bpm:     f32,
}

pub struct Sequencer {
    pub pattern:   Option<Pattern>,
    pub playing:   bool,
    current_event: usize,
    timer:         f32,
}

impl Sequencer {
    pub fn new() -> Self
    pub fn load(&mut self, pattern: Pattern)
    pub fn play(&mut self)
    pub fn stop(&mut self)
    pub fn pause(&mut self)
    /// Returns Some((channel, freq, waveform, vol)) when a note should fire.
    pub fn update(&mut self, dt: f32) -> Vec<NoteEvent>

    /// Parse a simple MML string into a Pattern.
    /// Format: "C4:8 D4:8 E4:4 REST:4 G4:2" where number = note duration divisor
    /// Multi-channel: separate channels with "|"
    /// Example: "C4:8 E4:8 G4:4 | REST:4 C3:4 G3:4"
    pub fn parse_mml(mml: &str, bpm: f32) -> Pattern
}
```

- `Engine` owns a `Sequencer`
- `Engine::update()` calls `sequencer.update(dt)` and for each returned event,
  calls `audio.play(ch, freq, waveform, vol)`
- MML parsing rules:
  - Note names: `C3`–`B5` (use the same Hz table as the TS SDK)
  - `REST` = silence (stop channel)
  - Duration divisor: whole=`1`, half=`2`, quarter=`4`, eighth=`8`, sixteenth=`16`
  - BPM determines beat length: `beat_secs = 60.0 / bpm`
  - Note duration: `beat_secs / divisor`
- Expose via WASM:
  - `sequencer_load_mml(mml: &str, bpm: f32)`
  - `sequencer_play()`, `sequencer_stop()`, `sequencer_pause()`
  - `sequencer_set_bpm(bpm: f32)`

---

## 1.9 Raycaster Renderer (2.5D / Doom-style)

**File:** `crates/core/src/raycaster/mod.rs`

A software raycaster that writes directly into the `FrameBuffer`. This is an
additional render mode — the existing 2D renderer still works for HUD layers.

```rust
pub struct RaycastMap {
    pub cols:      u32,
    pub rows:      u32,
    pub cells:     Vec<u8>,      // 0=empty, 1+=wall type index
    pub cell_size: f32,
}

pub struct RaycastCamera {
    pub pos:        Vec2,
    pub angle:      f32,         // radians
    pub fov:        f32,         // default: 1.0472 (60°)
    pub move_speed: f32,         // units/second
    pub turn_speed: f32,         // radians/second
    pub fog_dist:   f32,         // distance at which walls reach bg color
}

pub struct WallTexture {
    pub pixels: Vec<u8>,         // RGBA8, must be power-of-two square
    pub size:   u32,
}

pub struct RaycastRenderer {
    pub map:      RaycastMap,
    pub camera:   RaycastCamera,
    pub textures: Vec<WallTexture>,
    pub floor_color:   [u8; 3],
    pub ceiling_color: [u8; 3],
    pub fog_color:     [u8; 3],
}

impl RaycastRenderer {
    pub fn new(map: RaycastMap) -> Self

    /// Full raycaster render pass into the framebuffer.
    /// Call BEFORE the 2D sprite/HUD pass.
    pub fn render(&self, fb: &mut FrameBuffer)

    pub fn move_forward(&mut self, dt: f32)
    pub fn move_backward(&mut self, dt: f32)
    pub fn strafe_left(&mut self, dt: f32)
    pub fn strafe_right(&mut self, dt: f32)
    pub fn turn_left(&mut self, dt: f32)
    pub fn turn_right(&mut self, dt: f32)
}
```

**Rendering algorithm (DDA raycaster):**

For each screen column `x` from 0 to `screen_width`:
1. Compute ray direction from camera angle + FOV offset
2. DDA grid traversal: step through map cells until hitting a non-zero cell
3. Compute perpendicular wall distance (not Euclidean — corrects fisheye)
4. Wall column height = `(screen_height / perp_dist) * scale`
5. Determine which texture column to sample (wall hit offset 0.0–1.0)
6. If texture exists for wall type: draw a textured vertical strip with distance darkening
7. If no texture: draw a solid colored strip, darkened by distance
8. Draw floor (solid color below wall bottom) and ceiling (solid color above wall top)
9. Apply fog: lerp wall color toward `fog_color` based on `perp_dist / fog_dist`

Billboard sprites (enemies/items):
```rust
pub struct Billboard {
    pub pos:       Vec2,
    pub texture:   u32,     // texture handle
    pub scale:     f32,
}
```
- Sort billboards by distance from camera (farthest first)
- For each: compute screen x position, scale based on distance, draw vertical strips
  only where the z-buffer (populated during wall pass) shows the billboard is in front

**Engine integration:**
- `Engine` optionally owns a `RaycastRenderer` (wrapped in `Option<>`)
- When present, `Engine::render()` calls `raycaster.render(fb)` FIRST, then the 2D
  sprite/HUD layer renders on top
- Expose via WASM:
  - `raycaster_init(map_json: &str)` — map JSON: `{cols, rows, cells: number[]}`
  - `raycaster_set_texture(wall_type: u8, pixels: Vec<u8>, size: u32)`
  - `raycaster_move(forward, strafe, turn: f32)` — all per-frame deltas
  - `raycaster_set_pos(x, y, angle)`
  - `raycaster_get_pos() -> Float32Array` — [x, y, angle]
  - `raycaster_add_billboard(id: u32, x, y, texture: u32, scale: f32)`
  - `raycaster_remove_billboard(id: u32)`
  - `raycaster_set_fog(dist: f32, r, g, b: u8)`
  - `raycaster_set_floor_color(r, g, b: u8)`
  - `raycaster_set_ceiling_color(r, g, b: u8)`

---

## 1.10 Save / Load System

**File:** `crates/core/src/save/mod.rs`

```rust
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Default)]
pub struct SaveSlot {
    pub slot:  u8,
    pub data:  HashMap<String, serde_json::Value>,
}

impl SaveSlot {
    pub fn set<T: Serialize>(&mut self, key: &str, value: T) -> Result<(), serde_json::Error>
    pub fn get<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Option<T>
    pub fn remove(&mut self, key: &str)
    pub fn to_json(&self) -> String
    pub fn from_json(s: &str) -> Result<Self, serde_json::Error>
}

pub struct SaveManager {
    slots: Vec<SaveSlot>,   // 4 slots
}

impl SaveManager {
    pub fn new() -> Self   // initialise 4 empty slots
    pub fn save(&self, slot: u8) -> String     // serialise to JSON string
    pub fn load(&mut self, slot: u8, json: &str) -> Result<(), serde_json::Error>
    pub fn slot(&self, idx: u8) -> &SaveSlot
    pub fn slot_mut(&mut self, idx: u8) -> &mut SaveSlot
}
```

- `Engine` owns a `SaveManager`
- WASM exposes:
  - `save_set(slot, key, value_json)`
  - `save_get(slot, key) -> JsValue`
  - `save_remove(slot, key)`
  - `save_export(slot) -> String` — returns full JSON for the slot
  - `save_import(slot, json)` — loads JSON into slot

---

# PART 2 — TYPESCRIPT SDK FEATURES (`packages/sdk`)

## 2.1 Enhanced Camera API

**File:** `packages/sdk/src/camera.ts`

```ts
export class Camera {
  constructor(private engine: Cathode) {}

  follow(sprite: Sprite, lerpSpeed = 0.1): void
  unfollow(): void
  setTarget(x: number, y: number): void
  setBounds(x: number, y: number, w: number, h: number): void
  setDeadZone(x: number, y: number, w: number, h: number): void
  setLerp(speed: number): void     // 0=instant snap, 0.1=smooth, 1=never
  setZoom(zoom: number): void
  get pos(): { x: number; y: number }

  // Shake is already on engine — add it here for discoverability
  shake(intensity: number, duration: number): void
}
```

---

## 2.2 Particle System API

**File:** `packages/sdk/src/particles.ts`

```ts
export interface EmitConfig {
  angle?:      number;     // radians, default 0
  spread?:     number;     // radians, default Math.PI * 2 (all directions)
  speedMin?:   number;
  speedMax?:   number;
  lifeMin?:    number;
  lifeMax?:    number;
  sizeMin?:    number;
  sizeMax?:    number;
  gravity?:    number;
  colorStart?: [number, number, number, number]; // RGBA 0-255
  colorEnd?:   [number, number, number, number];
  fade?:       boolean;
  shrink?:     boolean;
}

export class ParticleEmitter {
  constructor(scene: Scene, maxParticles?: number)

  burst(x: number, y: number, count: number, config?: EmitConfig): void
  emit(x: number, y: number, rate: number, config?: EmitConfig): void
  stop(): void
  destroy(): void

  // Preset bursts
  static explosion(scene: Scene, x: number, y: number): ParticleEmitter
  static sparkle(scene: Scene, x: number, y: number, color?: [number,number,number]): ParticleEmitter
  static dust(scene: Scene, x: number, y: number): ParticleEmitter
  static coin(scene: Scene, x: number, y: number): ParticleEmitter
}
```

Preset implementations:
- `explosion`: 20 particles, all directions, orange→red, fast, gravity 200
- `sparkle`: 8 particles, all directions, given color→transparent, slow, no gravity
- `dust`: 5 particles, upward cone (270°±30°), grey, slow fade
- `coin`: 6 particles, upward burst, yellow, gravity 400

---

## 2.3 Tween API

**File:** `packages/sdk/src/tween.ts`

```ts
export type EaseName =
  | "linear" | "easeIn" | "easeOut" | "easeInOut"
  | "bounceOut" | "elasticOut" | "backOut";

export class Tween {
  constructor(
    private engine: Cathode,
    from: number,
    to: number,
    durationSecs: number,
    ease?: EaseName
  )

  onUpdate(cb: (value: number) => void): this
  onComplete(cb: () => void): this
  repeat(yoyo?: boolean): this
  start(): this
  stop(): this

  get value(): number
  get isComplete(): boolean
  destroy(): void
}

// Convenience: tween a sprite property
export function tweenSprite(
  sprite: Sprite,
  props: Partial<{ x: number; y: number; frame: number }>,
  durationSecs: number,
  ease?: EaseName
): Tween
```

The `onUpdate` callback is called every frame with the current value. The TS
side polls `wasm.tween_value(handle)` and `wasm.tween_is_complete(handle)` each
frame from inside the engine loop automatically (engine keeps a list of live tweens).

---

## 2.4 Text Rendering API

**File:** `packages/sdk/src/text.ts`

```ts
export class BitmapFont {
  constructor(
    engine: Cathode,
    sheetHandle: number,
    charWidth: number,
    charHeight: number,
    cols: number,
    firstCharCode?: number  // default 32 (space)
  )

  draw(text: string, x: number, y: number, scale?: number): void
  measure(text: string, scale?: number): number

  // Built-in: generates a minimal ASCII font sheet procedurally
  // Returns a font ready to use — no PNG needed
  static builtin(engine: Cathode): BitmapFont
}
```

`BitmapFont.builtin()` generates a 128×48 sprite sheet in-memory containing
ASCII chars 32–127 as 8×8 pixel characters drawn with `CanvasRenderingContext2d`
using a monospace font, then uploads it via `engine.raw.upload_sheet()`.

This means every game can call `BitmapFont.builtin(engine)` and have text with
zero setup — no font PNG file needed.

---

## 2.5 Timer API

**File:** `packages/sdk/src/timer.ts`

```ts
export class GameTimer {
  constructor(engine: Cathode, durationSecs: number, options?: {
    repeat?:   boolean;
    autoStart?: boolean;
  })

  onFire(cb: () => void): this
  start(): this
  stop(): this
  reset(): this
  get progress(): number     // 0.0 → 1.0
  get remaining(): number    // seconds
  destroy(): void
}
```

The engine polls `wasm.poll_fired_timers()` each frame inside `engine.loop()`
(before calling the user's callback) and fires the appropriate TS callbacks.

---

## 2.6 State Machine

**File:** `packages/sdk/src/state-machine.ts`

```ts
export interface State<T extends string = string> {
  name:      T;
  onEnter?:  (from: T | null) => void;
  onExit?:   (to: T) => void;
  onUpdate?: (dt: number) => void;
}

export class StateMachine<T extends string = string> {
  constructor(states: State<T>[], initial: T)

  transition(to: T): void
  update(dt: number): void
  get current(): T
  get previous(): T | null
  is(name: T): boolean
  isOneOf(...names: T[]): boolean
}
```

Pure TypeScript — no WASM involved. Usage:

```ts
type HeroState = "idle" | "walk" | "jump" | "attack" | "hurt";

const fsm = new StateMachine<HeroState>([
  {
    name: "idle",
    onEnter: () => hero.play(ANIM.idle),
    onUpdate: (dt) => { if (engine.input.held(0, "right")) fsm.transition("walk"); }
  },
  {
    name: "walk",
    onEnter: () => hero.play(ANIM.walk),
    onUpdate: (dt) => {
      hero.velocityX = 80;
      if (!engine.input.held(0, "right")) fsm.transition("idle");
      if (engine.input.justPressed(0, "a")) fsm.transition("jump");
    }
  },
  // ... more states
], "idle");

engine.loop((dt) => {
  fsm.update(dt);
  scene.update(dt);
});
```

---

## 2.7 Tilemap Collision Helpers

**File:** `packages/sdk/src/tilemap.ts` (extend existing class)

Add to the existing `TileMap` class:

```ts
// Mark tile IDs as solid
setSolidTiles(layerIdx: number, solidIds: number[]): void

// Query
isSolid(layerIdx: number, worldX: number, worldY: number): boolean
getTileAt(layerIdx: number, worldX: number, worldY: number): number
getTileAtCoord(layerIdx: number, col: number, row: number): number
worldToTile(worldX: number, worldY: number): { col: number; row: number }
tileToWorld(col: number, row: number): { x: number; y: number }

// Simple tile-based raycast — returns first solid tile hit
raycast(layerIdx: number, ox: number, oy: number,
        dx: number, dy: number, maxDist: number
): { hit: boolean; x: number; y: number; tileId: number } | null
```

These operate purely on the JS-side tile arrays — no WASM round-trip needed.

---

## 2.8 Scene Transitions

**File:** `packages/sdk/src/transitions.ts`

```ts
export type TransitionType =
  | "fade"          // black fade out → fade in
  | "slide-left"    | "slide-right"
  | "pixelate"      // increases pixel size to 16×16, then shrinks
  | "checkerboard"; // classic 8-bit checkerboard wipe

export class SceneTransition {
  constructor(engine: Cathode, type: TransitionType, durationSecs?: number)

  /** Run out-animation, swap callback, run in-animation. Returns a Promise. */
  transition(onSwap: () => void): Promise<void>
}
```

Implementation: uses tweens internally. The transition renders a full-screen
overlay on top of everything else via `engine.raw.draw_overlay_rect(r,g,b,a)`
(add this WASM binding too — draws a fullscreen RGBA rectangle at max layer).

---

## 2.9 Music Sequencer API

**File:** `packages/sdk/src/music.ts`

```ts
export class MusicPlayer {
  constructor(engine: Cathode)

  /** Load and play MML notation.
   *  Format: "C4:8 D4:4 REST:8 G4:4 | C3:4 REST:4 G3:4 REST:4"
   *  | separates channels. Numbers = duration divisor (4 = quarter note).
   */
  play(mml: string, bpm?: number): void
  stop(): void
  pause(): void
  resume(): void
  setBpm(bpm: number): void
}
```

---

## 2.10 Raycaster API

**File:** `packages/sdk/src/raycaster.ts`

```ts
export interface RaycastMapDef {
  cols:  number;
  rows:  number;
  cells: number[];  // 0=empty, 1+=wall type
}

export class Raycaster {
  constructor(engine: Cathode, map: RaycastMapDef)

  setTexture(wallType: number, imageUrl: string): Promise<void>
  setFloorColor(r: number, g: number, b: number): void
  setCeilingColor(r: number, g: number, b: number): void
  setFog(distance: number, r: number, g: number, b: number): void

  addBillboard(id: number, x: number, y: number, textureType: number, scale?: number): void
  removeBillboard(id: number): void
  updateBillboard(id: number, x: number, y: number): void

  /** Call inside engine.loop() with the dt — handles input automatically */
  update(dt: number): void

  // Direct camera control
  setPos(x: number, y: number, angle: number): void
  get pos(): { x: number; y: number; angle: number }

  // Move relative to camera facing
  move(forwardSpeed: number, strafeSpeed: number, turnSpeed: number, dt: number): void
}
```

---

## 2.11 Save / Load API

**File:** `packages/sdk/src/save.ts`

```ts
export class SaveManager {
  constructor(engine: Cathode)

  set(key: string, value: unknown, slot?: number): void
  get<T = unknown>(key: string, slot?: number): T | undefined
  remove(key: string, slot?: number): void

  /** Export slot to JSON string (for localStorage / file) */
  export(slot?: number): string

  /** Import from JSON string */
  import(json: string, slot?: number): void

  /** Write slot to localStorage automatically */
  autosave(key: string, slot?: number): void

  /** Restore from localStorage */
  autoload(key: string, slot?: number): boolean
}
```

`autosave` / `autoload` use `localStorage` on the JS side (the WASM just provides
serialisation). `autosave` can be called inside the game loop — it debounces
writes to max once per second.

---

## 2.12 Debug Overlay

**File:** `packages/sdk/src/debug.ts`

```ts
export class DebugOverlay {
  constructor(engine: Cathode, scene: Scene)

  /** Toggle with F3 automatically, or call manually */
  toggle(): void
  show(): void
  hide(): void

  get visible(): boolean
}
```

When visible, renders on top of everything using a `BitmapFont.builtin()`:
- Top-left: FPS (computed as `1/dt`), entity count, particle count, tick number
- Collider wireframes: for each entity with a `Collider` component, draw an outline
  rect by calling `engine.raw.debug_draw_rect(x, y, w, h, r, g, b)` (add this WASM binding)
- Camera info: camera pos, zoom, target

`DebugOverlay` automatically registers a `keydown` listener for `F3` on construction.

---

# PART 3 — TAURI DESKTOP EDITOR (`packages/editor-desktop`)

This is a brand-new Tauri application — a full desktop IDE for building retro games.

## Overview

```
packages/editor-desktop/
├── src-tauri/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs           ← Tauri entry point
│   │   ├── commands/
│   │   │   ├── fs.rs         ← file system operations
│   │   │   ├── build.rs      ← wasm-pack + vite build runner
│   │   │   ├── preview.rs    ← embedded engine preview
│   │   │   └── export.rs     ← cross-compile export
│   │   └── state.rs          ← app state (current project path etc.)
└── src/
    ├── main.ts               ← editor boot
    ├── App.svelte             ← root component (or React if preferred)
    ├── panels/
    │   ├── SceneEditor.svelte
    │   ├── Inspector.svelte
    │   ├── Hierarchy.svelte
    │   ├── AssetManager.svelte
    │   ├── AnimationEditor.svelte
    │   ├── ScriptEditor.svelte
    │   └── ExportManager.svelte
    ├── menus/
    │   ├── TopBar.svelte
    │   └── Toolbar.svelte
    └── store/
        ├── project.ts        ← project state (Svelte store or Zustand)
        ├── scene.ts          ← active scene entity tree
        └── selection.ts      ← currently selected entity
```

You may use **Svelte** or **React** — choose whichever produces cleaner code.
Use TypeScript throughout. Style with plain CSS variables — dark IDE theme
matching the existing editor palette (`#0d0d0d`, `#1a1a1a`, `#7c3aff` accent).

## Project format

```ts
// retro.project.json
interface RetroProject {
  name:       string;
  version:    string;   // semver
  preset:     "gameboy" | "nes" | "neogeo" | "custom";
  resolution: { width: number; height: number };
  targetFps:  number;
  audioChannels: number;
  spriteLimit:   number;
  scanlines:     boolean;
  entryScene: string;  // path to default scene file
  exportTargets: ExportTarget[];
}

// scenes/level_01.scene.json
interface SceneFile {
  name:     string;
  entities: EntityDef[];
  tileMaps: TileMapRef[];
  camera:   { x: number; y: number; lerp: number };
  bgColor:  [number, number, number];
}

interface EntityDef {
  id:         string;   // uuid
  name:       string;
  x:          number;
  y:          number;
  sheet?:     string;   // path to sprite sheet asset
  frame?:     number;
  layer?:     number;
  script?:    string;   // path to .ts script
  collider?:  { offsetX: number; offsetY: number; w: number; h: number };
  solid?:     boolean;
  anims?:     Record<string, AnimConfig>;
  tags?:      string[];
  custom?:    Record<string, unknown>;  // user-defined properties
}
```

## Tauri commands to implement

```rust
// src-tauri/src/commands/fs.rs

#[tauri::command]
async fn open_project(path: String) -> Result<RetroProjectJson, String>

#[tauri::command]
async fn save_project(path: String, project: RetroProjectJson) -> Result<(), String>

#[tauri::command]
async fn new_project(path: String, name: String, preset: String) -> Result<RetroProjectJson, String>

#[tauri::command]
async fn read_scene(path: String) -> Result<String, String>   // returns JSON

#[tauri::command]
async fn write_scene(path: String, json: String) -> Result<(), String>

#[tauri::command]
async fn list_assets(project_dir: String) -> Result<Vec<AssetInfo>, String>

#[tauri::command]
async fn read_script(path: String) -> Result<String, String>

#[tauri::command]
async fn write_script(path: String, content: String) -> Result<(), String>

// src-tauri/src/commands/build.rs

#[tauri::command]
async fn build_wasm(project_dir: String, release: bool,
                    window: tauri::Window) -> Result<(), String>
// streams build output as events: window.emit("build-log", line)

#[tauri::command]
async fn build_bundle(project_dir: String, window: tauri::Window) -> Result<(), String>

// src-tauri/src/commands/export.rs

#[tauri::command]
async fn export_web(project_dir: String, out_dir: String) -> Result<(), String>

#[tauri::command]
async fn export_desktop(project_dir: String, target_triple: String,
                         out_dir: String, window: tauri::Window) -> Result<(), String>
// Uses cargo cross-compile. target_triple examples:
//   x86_64-pc-windows-gnu
//   x86_64-unknown-linux-gnu
//   aarch64-apple-darwin
//   armv7-unknown-linux-gnueabihf  (Anbernic/Miyoo handhelds)

#[tauri::command]
async fn export_rom_ready(project_dir: String, platform: String,
                           out_dir: String) -> Result<(), String>
// platform: "gb" | "nes"
// Generates a structured C/assembly project scaffold for the homebrew toolchain.
// Does NOT compile — outputs the source project for the developer to compile.
//
// For "gb": generates a GBDK-2020 project with:
//   - Makefile
//   - main.c with game loop skeleton
//   - assets/ with sprites converted to GB tile format (2bpp)
//   - maps/ with tilemap data as C arrays
//
// For "nes": generates a cc65 + NESLib project with:
//   - Makefile
//   - main.c with NESLib game loop
//   - chr/ with sprite data as 8×8 NES CHR tiles
//   - maps/ with tilemap data as C arrays
```

## Panel specifications

### SceneEditor panel
- Full-canvas 2D view of the scene
- Grid overlay (togglable, snaps to tileWidth×tileHeight)
- Drag-to-pan (Space+drag), scroll-to-zoom
- Entity rendering: draw each `EntityDef` as its sprite frame if a sheet is
  loaded, otherwise as a colored rectangle labeled with the entity name
- Click to select entity (highlight border, populate Inspector)
- Drag to move selected entity (updates x/y in the scene JSON, live)
- Multi-select with Shift+click
- Delete key removes selected entities
- Ctrl+D duplicates selected entity
- Undo/redo stack (80 ops): every move/add/delete/property-change is undoable
- Minimap in corner showing full scene

### Inspector panel
- Shows all properties of the selected entity
- Editable fields: name, x, y, layer, frame, solid (checkbox), tags (comma list)
- Collider section: enable/disable, offset X/Y, width, height — with live preview
  overlay on the scene canvas
- Animation section: list of defined `AnimConfig`s, add/remove, edit frames/fps
- Script section: shows attached script filename, "Open Script" button
- Custom properties: key→value table, add/remove rows

### Hierarchy panel
- Tree list of all entities in the scene (sorted by layer)
- Click to select, double-click to rename
- Drag to reorder layers
- Eye icon to toggle visibility (editor-only flag)
- +/− buttons to add/remove entities

### AssetManager panel
- Grid of imported sprite sheet thumbnails
- "Import Sheet" button → opens native file picker → copies PNG to `assets/sprites/`
- Each sheet: shows dimensions, tile size (editable), handle number
- Right-click → "Slice" → opens a modal with the sheet and a tile grid overlay,
  click individual tiles to name them
- Shows scripts in `scripts/`, scenes in `scenes/`, maps in `assets/maps/`

### AnimationEditor panel
- Timeline of frames for the selected animation clip
- Click frames from the sheet picker on the left
- FPS slider, loop toggle, preview playback button
- Output: updates the entity's `anims` object in the scene file

### ScriptEditor panel
- Monaco Editor component (load from CDN: `unpkg.com/monaco-editor`)
- TypeScript language mode
- The engine SDK types are injected as ambient declarations so autocomplete works
- Auto-save on Ctrl+S (calls `write_script` Tauri command)
- Shows all scripts in the project in a file tree on the left

### ExportManager panel
- List of export targets with status indicators
- **Web**: outDir picker, Build + Open Folder buttons, shows bundle size
- **Windows / macOS / Linux**: target triple selector, "Cross-compile" button,
  requires `cross` or `cargo` in PATH
- **ARM Linux (Handhelds)**: preset for `armv7-unknown-linux-gnueabihf`,
  shows a short guide for copying to device
- **ROM-ready (Game Boy)**: shows prerequisite (GBDK-2020 install link),
  Output Dir picker, "Generate Project" button, then "Open in File Manager"
- **ROM-ready (NES)**: same but for cc65 + NESLib
- Build log stream: a scrolling terminal output showing live `build_wasm` events

### TopBar
- File menu: New Project, Open Project, Save, Recent Projects
- Edit menu: Undo, Redo, Preferences
- View menu: toggle panels, toggle grid, toggle colliders
- Run menu: Play (launch in browser), Build, Export
- Window title shows `{ProjectName} — retro-engine editor`

---

# PART 4 — CLI ENHANCEMENTS (`packages/cli`)

## 4.1 New templates

Add to `retro new`:
```
retro new my-game --template platformer  ← jump, gravity, tilemap collision
retro new my-game --template shmup       ← bullet pool, enemy waves, score
retro new my-game --template puzzle      ← grid, swap mechanic, win condition
retro new my-game --template rpg         ← top-down, dialogue, inventory stub
retro new my-game --template doom        ← raycaster setup, WASD + mouse look
```

Each template generates a complete, playable (not just empty) `src/main.ts` that
demonstrates all the features relevant to that genre. The platformer template
uses `StateMachine`, `BitmapFont.builtin()`, `GameTimer`, and `ParticleEmitter`.
The doom template uses the `Raycaster` class.

## 4.2 `retro export` additions

```
retro export arm-linux      ← cross-compile for Anbernic/Miyoo/Pi
retro export pwa            ← adds manifest.json + service worker for PWA install
retro export rom-gb         ← generates GBDK-2020 project scaffold
retro export rom-nes        ← generates cc65/NESLib project scaffold
```

`retro export pwa` adds to the existing `dist/`:
- `manifest.json` — PWA manifest with game name, icon sizes, theme color
- `sw.js` — service worker that caches all assets for offline play
- Updates `index.html` to register the SW and link the manifest

`retro export arm-linux` runs:
```bash
cargo build -p cathode-platform-native \
  --target armv7-unknown-linux-gnueabihf \
  --release
```
Then packages the binary with a launch script into `dist/arm-linux/`.

## 4.3 `retro pack` command

```
retro pack assets/sprites/*.png --tile-width 8 --tile-height 8 --output assets/atlas.png
```

Reads all PNGs, packs them into a single texture atlas using a shelf-packing
algorithm, outputs:
- `atlas.png` — the packed texture
- `atlas.json` — mapping of original filename → `{x, y, w, h}` in the atlas

Uses `image` crate (or `jimp` on the JS side — your choice).

---

# PART 5 — NEW EXAMPLE: DOOM-STYLE GAME

**Directory:** `examples/doom-game/`

A complete playable Wolfenstein-style game using the raycaster:

```
examples/doom-game/
├── index.html
├── package.json
├── vite.config.ts
└── src/
    └── main.ts
```

`main.ts` implements:
- **NES preset** (256×240) at scale 2
- A 16×16 map with corridors, rooms, dead ends — defined as a hardcoded array
- Textured walls: 4 wall types, each with a procedurally-generated texture
  (no PNG files — draw patterns with `Uint8ClampedArray`)
  - Type 1: grey brick pattern
  - Type 2: wooden panel stripes
  - Type 3: red stone
  - Type 4: exit door (checkerboard)
- Floor: dark grey, Ceiling: near-black
- Fog at distance 10 units
- **3 enemy billboards** (sprites) that patrol a fixed path
- HUD rendered with 2D overlay on top of raycaster:
  - `BitmapFont.builtin()` for score, health, ammo text
  - Weapon sprite (procedurally drawn gun) at bottom-center
- WASD movement + `←→` to turn (or mouse drag for turning on desktop)
- Shooting: `Z` key, plays a blast sound on channel 0 (noise waveform burst)
- Health system: taking damage triggers screen flash red (full-screen red tween)
- `SaveManager.autosave()` saves high score to localStorage

---

# PART 6 — REFACTORING REQUIREMENTS

## 6.1 Replace `wee_alloc`
Remove `wee_alloc` from `platform-web/Cargo.toml` — it is deprecated.
Use the default allocator. If binary size is a concern, use `dlmalloc` feature
on `wasm-bindgen`.

## 6.2 Repo name fix
The GitHub repo is `retor-engine` (typo). All internal package names, docs,
and CLI output should consistently use `retor-engine` as the package scoped
name to match the repo, but display text should say `retro-engine`. Add a note
in the README acknowledging this.

## 6.3 `platform-native` — proper CPAL audio
The current native runner has no audio. Wire up `cpal` for real audio output:
- Create a `cpal` output stream in `main.rs`
- In the audio callback, call `engine.audio.fill_stereo(buf)`
- This makes the native desktop build produce actual chiptune audio

## 6.4 `platform-native` — gamepad support via `gilrs`
Add `gilrs = "0.10"` to `platform-native/Cargo.toml`.
In the event loop, poll `gilrs` each frame and map gamepad buttons to
`GamepadState` (Btn::South=A, Btn::East=B, DPadLeft/Right/Up/Down, Start, Select).

## 6.5 Update `docs/architecture.md`
Replace the current sparse architecture doc with a comprehensive one covering:
- All new modules and their data flow
- The raycaster pipeline diagram
- The Tauri editor architecture diagram
- Updated platform targets table (add ARM Linux, PWA)
- Export pipeline diagram

---

# IMPLEMENTATION REQUIREMENTS

1. **Every file must be fully implemented.** No `todo!()`, `unimplemented!()`,
   empty function bodies, or `// ... implementation` comments.

2. **Rust must pass `cargo check --workspace`** and
   `cargo check -p cathode-core -p cathode-platform-web --target wasm32-unknown-unknown`.

3. **TypeScript must pass `tsc --noEmit --strict`** in all packages.

4. **The doom example must be self-contained** — no external PNG or audio files.
   All assets are generated with `Uint8ClampedArray` in code.

5. **The Tauri editor** must build with `tauri build`. Its backend must compile
   on macOS, Windows, and Linux. Use conditional compilation (`#[cfg(target_os)]`)
   for any OS-specific paths.

6. **Easing functions** must be implemented as pure math — no lookup tables,
   no external crates.

7. **The MML parser** must handle: note names C0–B7, REST, duration divisors
   1/2/4/8/16, dotted notes (add a `.` suffix to extend duration by 50%),
   and multi-channel separation with `|`.

8. **ROM-ready export** must output a project that actually compiles when the
   developer installs the referenced toolchain. Include a `README.md` in the
   generated project with exact toolchain install instructions.

9. **All new WASM bindings** must have corresponding TypeScript SDK wrappers.
   No raw `engine.raw.xxx()` calls should be necessary for the new features.

10. **`BitmapFont.builtin()`** must work without any external font files.
    Use the browser Canvas API to rasterise an 8×8 monospace font and upload
    the result as a sprite sheet.
