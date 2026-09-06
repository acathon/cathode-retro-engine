# Prompt: Build retro-engine from scratch

You are an expert Rust and TypeScript engineer. Build a complete, open-source 2D retro arcade game engine monorepo called **retro-engine** from scratch. Every file must be fully implemented — no stubs, no placeholders, no TODOs.

---

## Goal

A modern game engine with the **look and feel of NES / Game Boy / NeoGeo** games, but with **modern developer ergonomics**. Developers write games like it's 2025; games look and sound like 1990. Constraints (resolution, palette, sprite limits, audio channels) are opt-in settings, not hard limits.

---

## Stack

- **Rust** — engine core (platform-agnostic, pure logic)
- **wasm-bindgen + wasm-pack** — compile Rust → WASM for the browser
- **TypeScript** — SDK, CLI, editor (all ESM, strict mode)
- **Vite** — dev server and bundler
- **hecs** — minimal ECS crate
- **glam** — SIMD math (Vec2, UVec2)
- **winit + pixels + cpal** — native desktop platform
- **web-sys + js-sys** — browser platform

---

## Monorepo layout

```
retro-engine/
├── Cargo.toml                  ← workspace (resolver = "2")
├── rust-toolchain.toml         ← stable + wasm32-unknown-unknown target
├── package.json                ← npm workspaces root
├── Makefile                    ← all build/dev/test targets
├── .gitignore
├── .github/workflows/ci.yml    ← CI: rust check/test/clippy + wasm build + TS build
├── README.md
├── docs/
│   ├── getting-started.md
│   ├── architecture.md
│   └── contributing.md
├── crates/
│   ├── core/                   ← cathode-core (pure Rust)
│   ├── platform-web/           ← cathode-platform-web (cdylib, wasm-bindgen)
│   └── platform-native/        ← cathode-platform-native (winit + pixels)
├── packages/
│   ├── sdk/                    ← @cathode/sdk (TypeScript)
│   ├── cli/                    ← @cathode/cli (retro-cli)
│   └── editor/                 ← browser tilemap + sprite editor (vanilla JS)
└── examples/
    └── demo-game/              ← playable side-scroller demo
```

---

## Part 1 — Rust Core (`crates/core`)

### Cargo.toml
- Workspace deps: `log`, `serde + derive`, `serde_json`, `thiserror`, `glam 0.27`, `hecs 0.10`
- Core crate has no platform deps whatsoever

### Modules to implement

#### `src/lib.rs`
- `pub struct Engine` — owns `config`, `world`, `renderer`, `audio`, `input`, `assets`, `scenes`, `tick: u64`, `delta_secs: f32`
- `Engine::new(config: EngineConfig) -> Self`
- `Engine::update(delta_secs: f32)` — clamp delta to 0.05, call `physics::step`, `scenes.update`, `input.end_frame`
- `Engine::render() -> &FrameBuffer` — call `scenes.draw` then `renderer.render`
- `Engine::tick() -> u64`, `Engine::delta() -> f32`

#### `src/config.rs`
- `enum HardwareProfile { Nes, GameBoy, NeoGeo, Custom }`
- `struct EngineConfig { width, height, fps, audio_channels, sprite_limit, scanlines, pixel_perfect, profile, title }`
- Presets: `EngineConfig::nes()` → 256×240, `::gameboy()` → 160×144, `::neogeo()` → 320×224
- Derive `Serialize, Deserialize, Default`

#### `src/ecs/mod.rs`
- Re-export `hecs::{Entity, Query, World}`
- Components (all `#[derive(Debug, Clone, Copy, Serialize, Deserialize)]`):
  - `Position(pub Vec2)`
  - `Velocity(pub Vec2)`
  - `SpriteIndex { sheet: u32, frame: u16, flip_x: bool, flip_y: bool, layer: u8 }`
  - `Collider { offset: Vec2, size: Vec2 }`
  - `GamepadState { up, down, left, right, a, b, x, y, start, select, l, r: bool }`
- Marker components: `Solid`, `CameraTarget`
- `ScriptHandle(pub u32)`

#### `src/renderer/mod.rs`
- `struct FrameBuffer { width: u32, height: u32, pixels: Vec<u8> }` — RGBA8 flat buffer
  - `new(w, h)`, `set_pixel(x, y, r, g, b, a)`, `clear(r, g, b)`, `apply_scanlines(intensity: f32)` (darken every other row), `as_ptr()`, `len()`
- `struct Renderer { resolution, sprite_limit, camera: Vec2, bg_color, scanlines: bool, framebuffer, tilemaps: Vec<TileMap> }`
  - `render(&mut self, world, assets) -> &FrameBuffer`
  - Full render pipeline: clear → tile layers (back to front, camera offset, fixed layers skip camera) → ECS sprites sorted by `.layer` → scanline post-process
  - `blit()` helper: handles `flip_x`, `flip_y`, transparent pixels (alpha == 0 skip), bounds clipping

#### `src/renderer/tilemap.rs`
- `struct TileMap { name, cols, rows, tile_width, tile_height, layers: Vec<TileLayer> }`
- `struct TileLayer { name, sheet_handle: u32, tiles: Vec<u16>, fixed: bool }` — tile ID 0 = empty
- `TileMap::new(...)`, `add_layer(name, sheet_handle, fixed) -> usize`, `set_tile(layer, col, row, id)`
- Derive `Serialize, Deserialize` on both

#### `src/renderer/palette.rs`
- `struct Color(pub u8, pub u8, pub u8, pub u8)` — RGBA
  - Constants: `BLACK`, `WHITE`, `TRANSPARENT`, `RED`, `GREEN`, `BLUE`
  - `rgb(r,g,b)`, `rgba(r,g,b,a)`, `from_hex(s) -> Option<Self>` (handles #RRGGBB and #RRGGBBAA), `to_hex()`, `to_rgba() -> [u8;4]`, `lerp(a, b, t)`
- `struct Palette { colors: Vec<Color>, name: String }` — index 0 always transparent
  - `new(name)`, `set(idx, color)`, `get(idx) -> Color`, `len()`
  - Builtins: `gameboy()` (4 shades of green), `nes()` (54-color system palette), `Default` (PICO-8-inspired 16 colors)

#### `src/renderer/sprite.rs`
- `struct SpriteFlags` — associated consts: `NONE=0`, `FLIP_H=1`, `FLIP_V=2`, `PRIORITY=4`
- `struct Sprite { x, y: i32, pixels: [u8; 64], palette_id: usize, flags: u8, visible: bool, z: i16 }`
  - `new(x, y, pixels)`, `flip_h()`, `flip_v()` (builder pattern), `bounds() -> (i32,i32,i32,i32)`, `overlaps(other) -> bool`
- `struct AnimatedSprite { sprite, frames: Vec<[u8;64]>, frame_duration: u32, current_frame, timer, looping, playing }`
  - `new(x, y, frames, frame_duration)`, `update()` — advances LFSR-based frame timer, `play()`, `stop()`, `reset()`, `current_frame()`

#### `src/scene/mod.rs`
- `trait Scene: Send + Sync` — `name()`, `on_enter(&mut World)`, `on_exit(&mut World)`, `update(&mut World, &InputState) -> SceneTransition`, `draw(&mut Renderer, &World)`
- `enum SceneTransition { Stay, Push(Box<dyn Scene>), Replace(Box<dyn Scene>), Pop, Quit }`
- `struct SceneManager { stack: Vec<Box<dyn Scene>>, quit: bool }`
  - `push(scene, world)`, `update(world, input)`, `draw(renderer, world)`, `current_scene_name()`, `depth()`

#### `src/audio/mod.rs`
- `enum Waveform { Pulse25, Pulse50, Triangle, Sawtooth, Noise, Sine }`
- `struct Channel { waveform, frequency: f32, volume: f32, active: bool, phase: f32, noise_state: u16 }`
  - `sample(sample_rate: f32) -> f32`
  - Noise: **15-bit Galois LFSR** — `bit = (state ^ (state >> 1)) & 1; state = (state >> 1) | (bit << 14)`
  - All other waveforms: phase accumulator with `inc = freq / sample_rate`
- `struct AudioMixer { channels: Vec<Channel>, sample_rate: f32, master_vol: f32 }`
  - `new(channel_count: u8)` — sample_rate = 44100
  - `play(ch, freq, waveform, vol)`, `stop(ch)`, `stop_all()`
  - `fill_mono(buf: &mut [f32])`, `fill_stereo(buf: &mut [f32])` — clamp output to [-1, 1]

#### `src/input/mod.rs`
- `struct GamepadState` — 12 bool fields: up/down/left/right/a/b/x/y/start/select/l/r
- `struct InputState { players: [GamepadState; 2], prev_players: [GamepadState; 2] }`
  - `set_state(idx, state)`, `just_pressed(idx, btn) -> bool`, `just_released(idx, btn) -> bool`, `held(idx, btn) -> bool`, `end_frame()`
- `enum Button { Up, Down, Left, Right, A, B, X, Y, Start, Select, L, R }`
- `struct KeyMap` — default WASD+arrows, Z=A, X=B, Enter=Start

#### `src/physics/mod.rs`
- `const GRAVITY: f32 = 980.0`
- `fn step(world: &mut World, dt: f32)`
  1. Apply gravity to all entities with `Velocity` but not `Solid`
  2. Integrate: `pos += vel * dt`
  3. AABB collision resolve (dynamic vs solid): push out on shallowest axis, zero Y velocity on landing
- Collect solid AABBs first, then resolve each dynamic entity against all solids

#### `src/assets/mod.rs`
- `struct SpriteSheet { width, height, tile_width, tile_height, pixels: Vec<u8> }` — RGBA8
  - `from_rgba(w, h, tw, th, pixels)` — assert pixel length
- `struct AssetStore { sprite_sheets: Vec<SpriteSheet>, palettes: Vec<Palette>, audio_samples: Vec<Vec<f32>> }`
  - `add_sheet()`, `add_palette()`, `add_audio()` — all return handle `u32`

---

## Part 2 — WASM Platform (`crates/platform-web`)

### Cargo.toml
```toml
[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
cathode-core = { path = "../core" }
wasm-bindgen = "0.2"
js-sys = "0.3"
console_error_panic_hook = "0.1"
hecs = { workspace = true }
glam = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }

[dependencies.web-sys]
version = "0.3"
features = [
  "Window", "Document", "HtmlCanvasElement", "CanvasRenderingContext2d",
  "ImageData", "AudioContext", "AudioBufferSourceNode", "ScriptProcessorNode",
  "AudioProcessingEvent", "KeyboardEvent", "EventTarget", "Performance",
  "console", "TouchEvent", "Touch", "TouchList"
]
```

### `src/lib.rs`
- `#[wasm_bindgen(start)] fn main_js()` — calls `console_error_panic_hook::set_once()`
- `#[wasm_bindgen] pub struct WebEngine { engine: Engine, last_ts: f64 }`
- Constructors: `new(config_json: &str)`, `gameboy()`, `nes()`, `neogeo()`
- Game loop: `tick(timestamp: f64) -> f32` — compute delta from last_ts, call `engine.update(delta)`
- Render: `render_to_canvas(canvas: &HtmlCanvasElement)` — resize canvas if needed, `ImageData::new_with_u8_clamped_array_and_sh`, `ctx.put_image_data`
- Input: `set_input(player: usize, state_json: &str)` — deserialize `GamepadState`, call `engine.input.set_state`
- Assets: `upload_sheet(w, h, tw, th, pixels: Vec<u8>) -> u32`
- Tilemap: `load_tilemap(json: &str) -> Result<u32, JsValue>` — deserialize TileMap, push to `engine.renderer.tilemaps`
- Camera: `set_camera(x: f32, y: f32)`
- Renderer: `set_scanlines(bool)`, `set_bg_color(r, g, b: u8)`
- ECS: `spawn_sprite(x, y, sheet, frame, layer) -> u64`, `set_velocity(id, vx, vy)`, `set_position(id, x, y)`, `get_position(id) -> Float32Array`, `set_frame(id, frame)`, `set_flip(id, flip_x, flip_y)`, `destroy_entity(id)`
- Audio: `audio_play(ch, freq, waveform: u8, vol)`, `audio_stop(ch)`, `audio_stop_all()`, `audio_fill_mono(buf: &mut [f32])`, `audio_fill_stereo(buf: &mut [f32])`
- Accessors: `resolution_w()`, `resolution_h()`, `target_fps()`, `tick_count()`
- Private helper: `find_entity(id: u64) -> Option<hecs::Entity>`

---

## Part 3 — Native Platform (`crates/platform-native`)

### Cargo.toml
```toml
[[bin]]
name = "cathode-native"
path = "src/main.rs"

[dependencies]
cathode-core = { path = "../core" }
winit = "0.29"
pixels = "0.13"
cpal = "0.15"
log = { workspace = true }
serde_json = { workspace = true }
```

### `src/main.rs`
- Parse `--preset gameboy|nes|neogeo` CLI arg
- Create `winit` window sized `resolution × 4`
- Create `pixels::Pixels` surface
- Event loop: handle keyboard input → map to `GamepadState` → `engine.input.set_state(0, state)`
- `MainEventsCleared`: compute delta, `engine.update(delta)`, copy `engine.render().pixels` into `pixels.frame_mut()`, call `pixels.render()`
- Demo scene: generate a checkerboard RGBA sprite sheet in-memory, build a TileMap from it

---

## Part 4 — TypeScript SDK (`packages/sdk`)

All files under `src/`, output to `dist/`, strict TypeScript, ESM.

### `src/types.ts`
```ts
type Preset = "gameboy" | "nes" | "neogeo" | "custom"
type Resolution = { width: number; height: number }
interface EngineConfig { resolution, audioChannels, spriteLimit, scanlines, paletteColors, targetFps }
interface SpriteOptions { sheet, frame, x, y, layer? }
interface TileMapOptions { name, cols, rows, tileWidth, tileHeight }
type WaveformType = "pulse25"|"pulse50"|"triangle"|"sawtooth"|"noise"|"sine"
type PlayerIndex = 0 | 1
type ButtonName = "up"|"down"|"left"|"right"|"a"|"b"|"x"|"y"|"start"|"select"|"l"|"r"
```

### `src/engine.ts` — `class Cathode`
- Static factories: `gameboy(canvas, scale=3)`, `nes(canvas, scale=3)`, `neogeo(canvas, scale=2)`, `custom(canvas, cfg, scale=3)`
- `_init(preset, config?)` — dynamic import of WASM module, set canvas CSS size + `image-rendering: pixelated`
- `loop(cb: (dt: number) => void)` — rAF loop, calls `wasm.tick(ts)`, `cb(dt)`, `wasm.render_to_canvas`
- `pause()`, `resume()`
- `loadSheet(url, tileWidth, tileHeight) -> Promise<number>` — load image, draw to temp canvas, extract ImageData, call `wasm.upload_sheet`
- `loadTileMap(json: object) -> number`
- `setCamera(x, y)`, `setScanlines(bool)`, `setBgColor(r, g, b)`
- `spawnSprite(x, y, sheet, frame, layer) -> bigint`
- `audioPlay(ch, freq, waveform, vol)`, `audioStop(ch)`, `audioStopAll()`
- Getters: `input`, `width`, `height`, `fps`, `raw` (WASM escape hatch)

### `src/input.ts` — `class InputReader`
- Default keymap: ArrowUp/Down/Left/Right, Z=a, X=b, A=x, S=y, Enter=start, Backspace=select, Q=l, W=r
- `attach(wasm)` — add keydown/keyup listeners, call `wasm.set_input` on each
- `snapshot()` — copy current → prev (call before game logic each frame)
- `held(player, btn)`, `justPressed(player, btn)`, `justReleased(player, btn)`
- `setState(player, partial)` — for touch injection

### `src/scene.ts` — `class Scene`
- Owns `Set<Sprite>` and `Set<TileMap>`
- `update(dt)` — calls `engine.input.snapshot()`, updates all sprites, handles camera follow
- `follow(sprite, offsetX?, offsetY?)`, `unfollow()`
- `_addSprite`, `_removeSprite`, `_addTileMap` (internal, called by constructors)

### `src/sprite.ts` — `class Sprite`
- Constructor takes `(scene, SpriteOptions)` — calls `scene.eng.spawnSprite`, registers with scene
- Properties: `x, y, velocityX, velocityY, frame, layer, sheet, flipX, flipY, active`
- Animation: `play(AnimConfig)`, `stopAnim()` — `AnimConfig = { frames: number[], fps: number, loop?: boolean }`
- `_update(dt)` — step animation, integrate position, call `wasm.set_position/velocity/frame/flip`
- `move(vx, vy)`, `stop()`, `overlaps(other, w, h)`, `destroy()` — calls `wasm.destroy_entity`, removes from scene
- `onUpdate?: (dt, self) => void` callback

### `src/tilemap.ts` — `class TileMap`
- Constructor takes `(scene, TileMapOptions)`
- `addLayer(name, sheetHandle, fixed?) -> number`
- `setTile(layerIdx, col, row, tileId)`, `fill(layerIdx, tileId)`
- `commit()` — serialize to JSON and call `engine.loadTileMap`

### `src/audio.ts` — `class SoundChannel`
- Constructor takes `(engine, channelIndex)`
- `play(freq: number|string, waveform?, vol?)` — accepts note names like "C4", "A#3"
- `stop()`, `melody(notes: [string|number, number][]) -> Promise<void>`
- `NOTE` map: all notes C3–B5 as Hz
- Waveform map: `pulse25=0, pulse50=1, triangle=2, sawtooth=3, noise=4, sine=5`

### `src/touch.ts` — `class TouchControls`
- Creates a `position: absolute` overlay div inside the container
- Left side: D-pad (4 buttons: ▲▼◀▶) using absolute positioning in a square
- Right side: A, B, Start buttons
- Each button calls `input.setState(player, { [btn]: true/false })` on touchstart/end
- Configurable: `size`, `opacity`, `player`
- `destroy()` removes the overlay

### `src/index.ts`
Export everything: `Cathode`, `Scene`, `Sprite`, `TileMap`, `SoundChannel`, `NOTE`, `InputReader`, `TouchControls`, and all types.

---

## Part 5 — CLI (`packages/cli`)

### Entry: `src/index.ts`
- Uses `commander` for arg parsing
- Print ASCII logo in magenta on boot
- Commands: `new <name>`, `run`, `build`, `export <target>`

### `src/commands/new.ts`
- Create dir structure: `src/`, `assets/sprites/`, `assets/maps/`, `assets/audio/`
- Write: `retro.config.json`, `package.json`, `index.html`, `src/main.ts` (or `.js`), `tsconfig.json`, `vite.config.ts`
- `retro.config.json` — preset values for width/height/fps/channels/spriteLimit
- `index.html` — dark background, centered canvas, pixelated rendering
- `src/main.ts` template — imports SDK, creates engine, commented-out sprite/input examples, ready to run
- Use `ora` for spinner, `chalk` for colors, `fs-extra` for file ops

### `src/commands/run.ts`
- Load `retro.config.json`, call `ensureWasm()` (check if `node_modules/cathode-platform-web` exists, if not run wasm-pack), spawn Vite dev server

### `src/commands/build.ts`
- Step 1: `wasm-pack build` (with `--dev` or release flag)
- Step 2: `npx vite build`
- Use `execSync`, spinners for each step

### `src/commands/export.ts`
- `web` → `vite build`
- `desktop` → `npx tauri build` (with helpful error if not installed)
- `mobile` → `npx cap build` (with helpful error if not installed)

---

## Part 6 — Browser Editor (`packages/editor`)

Single-file vanilla JS + HTML, no framework, no build step (runs directly with `vite packages/editor/src`).

### `src/index.html`
Dark terminal-aesthetic UI (`#0d0d0d` bg, `#b44fff` accent, monospace font):
- **Top bar**: logo, tab buttons (Tilemap / Sprites / Palette), Import Sheet button, Export JSON button
- **Left panel**: sheet list (clickable) + tile picker canvas (click to select tile, highlight selected in purple)
- **Center toolbar**: Draw ✏️, Erase 🧹, Fill 🪣, Pick 🔬 buttons
- **Main canvas**: scrollable, mouse events for painting
- **Right panel**: map properties (cols, rows, tile W/H, zoom slider, layer select, Add Layer button, New Map button), selected tile info
- **Status bar**: current tool, selected tile ID, cursor position, active sheet

### `src/editor.js`
Full implementation:
- `state` object: `tool`, `selectedTile`, `currentLayer`, `zoom`, `sheets[]`, `activeSheet`, `map { cols, rows, tileWidth, tileHeight, layers[] }`
- `renderMap()` — draw grid, then all tile layers using `drawImage` with correct sheet offset per tile ID
- `renderPicker()` — draw sheet at scale, highlight selected tile with purple rect
- `applyTool(col, row)` — draw: set tile ID; erase: set 0; fill: flood fill (iterative stack, no recursion); pick: read tile ID
- `floodFill(layer, col, row, target, replacement)` — iterative 4-directional
- File import: `<input type="file" accept="image/*">`, `createObjectURL`, load as `Image`, prompt for tile size
- Export JSON: serialize all layers as `{ name, sheet_handle, tiles: number[], fixed: bool }`, download as `tilemap.json`
- All map property changes regenerate the map (preserving layer count)
- Zoom slider (1–8x) resizes the map canvas

---

## Part 7 — Demo Game (`examples/demo-game`)

### `src/main.ts`
A Game Boy-preset side-scroller that **requires no external assets** — all graphics are generated in code:

- Generate a 32×8 sprite sheet in memory (4 tiles × 8px): empty, ground (green), hero (magenta cross), bullet (yellow bar) — using raw `Uint8ClampedArray` and `putImageData`
- Upload via `engine.raw.upload_sheet(...)`
- Build a 40×18 TileMap in code: ground row at ROWS-2, 5 floating platforms at hardcoded positions
- Hero entity with manual gravity + vertical collision detection (tile-sample based `isGrounded()`)
- Bullet pool: spawn on B press, 200px/s horizontal, destroy when off-screen
- Input: ←→ to move (SPEED=80), Z to jump (JUMP_V=-260, GRAV=600 px/s²), X to shoot
- Shoot cooldown 0.25s
- Camera follows hero via `scene.follow(hero)`
- Chiptune: jump → triangle G4, shoot → pulse25 C5 (both stop after 80–120ms)
- Animated hero: `hero.play({ frames: [2, 3], fps: 6 })` — even if frame 3 is same tile, shows the system works

### `index.html`
- Centered canvas on `#0a0a0a` bg
- Controls legend below canvas: "Move: ← →  Jump: Z  Shoot: X"

---

## Part 8 — Build tooling

### `Cargo.toml` (workspace root)
```toml
[workspace]
resolver = "2"
members = ["crates/core", "crates/platform-web", "crates/platform-native"]

[workspace.package]
version = "0.1.0"
edition = "2021"

[workspace.dependencies]
log = "0.4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
glam = "0.27"
hecs = "0.10"
```

### `rust-toolchain.toml`
```toml
[toolchain]
channel = "stable"
targets = ["wasm32-unknown-unknown"]
components = ["rustfmt", "clippy"]
```

### `package.json` (root)
- `"workspaces": ["packages/*", "examples/*"]`
- Scripts: `build:wasm`, `build:wasm:dev`, `build:sdk`, `build:cli`, `build:all`, `dev:editor`, `dev:demo`

### `Makefile`
Targets: `all`, `wasm`, `wasm-dev`, `native`, `sdk`, `cli`, `build`, `dev-demo` (port 3001), `dev-editor` (port 3002), `test` (cargo test + npm test), `lint` (clippy + fmt), `clean`, `install`, `help`

### `.github/workflows/ci.yml`
Three jobs:
1. **rust** — `cargo check` (native + wasm32), `cargo test`, `cargo clippy`, `cargo fmt --check` — uses `dtolnay/rust-toolchain@stable` and `actions/cache`
2. **wasm** — install wasm-pack via curl, build WASM, upload artifact
3. **typescript** — download WASM artifact, `npm ci`, build sdk + cli
4. **release** — runs on main branch push (placeholder for npm/crates.io publish)

---

## Part 9 — Docs

### `README.md`
- Project tagline, philosophy, quick start (3 commands), presets table, SDK usage example, repo structure, build instructions, input map table, audio waveform examples, license (MIT)

### `docs/getting-started.md`
- Install CLI, `retro new`, project structure, `retro.config.json` fields, annotated game code example with sprite, tilemap, animation, input, audio, export commands, editor workflow

### `docs/architecture.md`
- ASCII data-flow diagram from game code → SDK → WASM → Rust core → FrameBuffer → platform
- ECS section, renderer pipeline, audio pipeline, physics description, platform targets table

### `docs/contributing.md`
- Prerequisites table, getting started (3 commands), project layout, Rust conventions (doc comments, clippy, fmt, unsafe rules), TypeScript conventions (no `any`), how to add a Rust module, how to add a WASM binding, test commands, commit message style guide

---

## Requirements

- Every file must be **fully implemented** — no `todo!()`, no `unimplemented!()`, no empty function bodies, no placeholder comments like `// ... implementation here`
- All Rust code must compile with `cargo check --workspace` and `cargo check -p cathode-core -p cathode-platform-web --target wasm32-unknown-unknown`
- All TypeScript must be strict-mode valid
- The demo game must be self-contained (no external PNG or asset files required)
- The editor must work as a single HTML+JS pair with no build step
- Include all `Cargo.toml`, `package.json`, `tsconfig.json`, `vite.config.ts` files for every crate/package
