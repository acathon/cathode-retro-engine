# Architecture

## Data-Flow Diagram
```mermaid
graph TD;
    Game_Code(Game Code TS/JS) --> SDK(TypeScript SDK)
    SDK --> WASM_API(WASM Bindings)
    WASM_API --> Core_Update(Rust core update)
    Core_Update --> ECS(ECS Simulation)
    Core_Update --> Physics(Physics Engine)
    Core_Update --> Input(Input State)
    Core_Update --> Audio(Audio Mixer)
    
    WASM_API --> Core_Render(Rust core render)
    Core_Render --> SpriteBatch(Sprite Batcher & Sorting)
    SpriteBatch --> FB[FrameBuffer (RGBA)]
    FB --> WebCanvas(Web Canvas 2D)
```

## ECS
The `hecs` crate acts as the backing simulation for all game entities and sprites. The web API translates ID handles so JavaScript can orchestrate components without touching Rust memory directly.

## Renderer Pipeline
1. `FrameBuffer::clear()`
2. Tile layers (back to front, with fixed layers ignoring camera offset).
3. ECS Sprites, queried via `Query<(&Position, &SpriteIndex)>` and sorted by `layer`.
4. Scanlines post-process step applied over the RGBA buffer.

## Audio Pipeline
44.1kHz sample rate output. The mixer iterates over a configurable number of `Channel`s.
Supported waveforms use integer/phase math. Noise leverages a 15-bit Galois LFSR for classic authentic static.

## Platform Targets
| Platform | Renderer | Audio | Input |
|---|---|---|---|
| Web (Default) | \`HtmlCanvasElement\` | \`AudioContext/ScriptProcessorNode\` | DOM Events |
| Desktop (Native) | \`pixels + winit\` | \`cpal\` | \`winit\` keyboard/gamepad events |
