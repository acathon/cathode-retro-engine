# Getting Started

This guide is the shortest reliable path from a fresh checkout to a running game.

## Who This Guide Is For

Use this page if you want to:

- run the existing examples,
- understand which tools are required,
- create a new project with the CLI,
- avoid reading the whole repository before seeing something work.

If your goal is to build a tiny game step by step, continue with [first-game.md](./first-game.md) after finishing this page.

## Prerequisites

Install these tools first:

| Tool | Why you need it |
| --- | --- |
| Rust stable | Builds the engine core and native runtime |
| wasm-pack | Builds the web bindings used by the SDK |
| Bun 1.x | Installs workspace dependencies and runs the web projects |

Optional but useful:

- Git for cloning and updating the repository
- A modern browser for running Vite examples
- VS Code if you want to work on the TypeScript and Rust code together

## Clone And Install

```bash
git clone https://github.com/acathon/retor-engine.git
cd retor-engine
bun install
```

## Build The Shared Engine Pieces

Examples depend on the web bindings and SDK package being available.

```bash
bun run build:wasm
bun run build:sdk
```

If you are modifying the CLI as well:

```bash
bun run build:cli
```

## Run A Known-Good Example

Start with a small example before creating a new project.

```bash
cd examples/trex-game
bun dev
```

Other good entry points:

| Example | Command |
| --- | --- |
| Demo platformer | `cd examples/demo-game && bun dev` |
| Space game | `cd examples/space-game && bun dev` |
| Doom-style raycaster | `cd examples/doom-game && bun dev` |
| Tetris | `cd examples/tetris && bun dev` |

## Create A New Game With The CLI

The CLI can scaffold new projects with different templates.

From the monorepo:

```bash
bun run build:cli
node packages/cli/dist/index.js new my-first-game --template default
```

Available templates currently exposed by the CLI:

- `default`
- `platformer`
- `shmup`
- `puzzle`
- `rpg`
- `doom`

Then move into the generated project and start its dev server:

```bash
cd my-first-game
bun install
bun dev
```

## What To Read Next

Once you have a project or example running:

1. [first-game.md](./first-game.md) for a minimal playable project.
2. [tutorial-trex.md](./tutorial-trex.md) for a longer tutorial walkthrough.
3. [architecture.md](./architecture.md) when you need internals or subsystem context.

## Common Tasks

### Build the current example for production

```bash
cd examples/doom-game
bun run build
```

### Run the browser editor

```bash
bun run dev:editor
```

### Run Rust validation

```bash
cargo test -p cathode-core -p cathode-platform-native
cargo check -p cathode-platform-web --target wasm32-unknown-unknown
```

## Troubleshooting

### `cathode-platform-web` or WASM import errors

Rebuild the web bindings and SDK:

```bash
bun run build:wasm
bun run build:sdk
```

### An example builds but shows stale behavior

You may be using older generated bindings or cached browser assets. Rebuild the shared packages, then restart the example dev server.

### CLI command not found

Build the CLI first:

```bash
bun run build:cli
```

Then invoke it from `packages/cli/dist/index.js` inside the monorepo, or install the package in a separate project once published.
