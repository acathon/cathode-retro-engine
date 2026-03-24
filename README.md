# Retro Engine

![Retro Engine Banner](./docs/assets/banner.png)

**Retro-first game engine with a Rust core, WebAssembly runtime, TypeScript SDK, CLI, and desktop editor.**

[Docs Hub](./docs/README.md) · [Getting Started](./docs/getting-started.md) · [Build Your First Game](./docs/first-game.md) · [T-Rex Tutorial](./docs/tutorial-trex.md) · [Architecture](./docs/architecture.md) · [Contributing](./docs/contributing.md)

Retro Engine is for developers who want the feel of old-school consoles without giving up modern tooling. You can prototype in the browser, ship through a TypeScript SDK, dig into a Rust core, export to multiple targets, and study complete example games inside the same repository.

## Start Here

Choose the shortest path for what you want to do:

| Goal | Start here |
| --- | --- |
| Run something immediately | [docs/getting-started.md](./docs/getting-started.md) |
| Build a tiny playable game | [docs/first-game.md](./docs/first-game.md) |
| Learn by reading a full example | [docs/tutorial-trex.md](./docs/tutorial-trex.md) |
| Understand the engine internals | [docs/architecture.md](./docs/architecture.md) |
| Contribute fixes or features | [docs/contributing.md](./docs/contributing.md) |

## What You Get

| Area | Included |
| --- | --- |
| Engine core | Rust ECS, software renderer, audio synth, collision, camera, particles, tweens, timers |
| Runtime targets | Browser via WASM and native desktop via winit/pixels/cpal |
| SDK | TypeScript APIs for scenes, sprites, tilemaps, input, audio, text, save data, raycasting |
| Tooling | CLI scaffolding, example games, browser editor, desktop editor |
| Learning material | Setup guide, first-game tutorial, T-Rex walkthrough, architecture reference |

## Quick Start

### 1. Install the prerequisites

- [Rust](https://rustup.rs/)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)
- [Bun](https://bun.sh/) 1.x

### 2. Clone and install

```bash
git clone https://github.com/acathon/retor-engine.git
cd retor-engine
bun install
```

### 3. Build the engine pieces used by the examples

```bash
bun run build:wasm
bun run build:sdk
```

### 4. Run an example

```bash
cd examples/trex-game
bun dev
```

Then open the local Vite URL shown in the terminal.

## New Developer Checklist

If you are new to the repo, this order is the fastest way to become productive:

1. Run one example game.
2. Read [docs/getting-started.md](./docs/getting-started.md).
3. Build the tutorial in [docs/first-game.md](./docs/first-game.md).
4. Open one example from the table below and trace how it is structured.
5. Use [docs/architecture.md](./docs/architecture.md) only after you know which subsystem you need.

## Examples

These examples are part demo, part reference implementation.

| Example | Folder | What it teaches |
| --- | --- | --- |
| Demo platformer | `examples/demo-game` | Side-scrolling movement, tilemap usage, simple collisions |
| T-Rex runner | `examples/trex-game` | Endless-runner structure, obstacle spawning, restart loop |
| Space game | `examples/space-game` | Procedural art, waves, projectiles, touch controls |
| Tetris | `examples/tetris` | Grid logic, HUD rendering, piece systems |
| Metal Slug-inspired demo | `examples/metal-slug` | Multi-layer scenes, scrolling action pacing |
| Doom-style demo | `examples/doom-game` | Raycaster setup, billboards, atmospheric rendering |

## Bun-First Commands

These are the most useful commands for daily work:

| Task | Command |
| --- | --- |
| Install dependencies | `bun install` |
| Build web bindings | `bun run build:wasm` |
| Build SDK package | `bun run build:sdk` |
| Build CLI package | `bun run build:cli` |
| Build everything exposed by root scripts | `bun run build:all` |
| Run the web editor | `bun run dev:editor` |
| Run the demo example | `bun run dev:demo` |
| Build an example | `cd examples/doom-game && bun run build` |

## Monorepo Map

```text
retor-engine/
├── crates/
│   ├── core/               # Portable Rust engine core
│   ├── platform-web/       # WebAssembly bindings
│   └── platform-native/    # Native desktop runtime
├── packages/
│   ├── sdk/                # TypeScript game SDK
│   ├── cli/                # retro CLI
│   ├── editor/             # Browser-based editor
│   └── editor-desktop/     # Tauri desktop editor
├── examples/               # Reference games and demos
└── docs/                   # Onboarding, tutorials, architecture, contribution docs
```

## Recommended Reading Paths

### I want to make my first game

1. [docs/getting-started.md](./docs/getting-started.md)
2. [docs/first-game.md](./docs/first-game.md)
3. One example folder closest to your genre

### I want to use the CLI

1. `packages/cli/src/index.ts`
2. [docs/getting-started.md](./docs/getting-started.md)
3. `packages/cli/src/commands/`

### I want to extend the engine

1. [docs/architecture.md](./docs/architecture.md)
2. `crates/core/src/`
3. [docs/contributing.md](./docs/contributing.md)

## Documentation

- [Docs Hub](./docs/README.md)
- [Getting Started](./docs/getting-started.md)
- [Build Your First Game](./docs/first-game.md)
- [T-Rex Tutorial](./docs/tutorial-trex.md)
- [Architecture](./docs/architecture.md)
- [Contributing](./docs/contributing.md)

## Community Readiness Notes

This repository already contains substantial engine code, examples, and editor work. The docs in this repository are intended to make that codebase usable by:

- first-time game developers who need a guided path,
- experienced developers who want subsystem documentation,
- contributors who need repo conventions and validation commands.

If you are opening an issue or planning a contribution, start with [docs/contributing.md](./docs/contributing.md).

## Repository Name Note

The GitHub repository currently uses the historical name `retor-engine`. Package names and the public display name use `retro-engine`.

## License

MIT
