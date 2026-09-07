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

To build games, one tool:

| Tool | Why you need it |
| --- | --- |
| Node.js 20+, or Bun 1.x | Installs dependencies and runs the web projects |

That is the whole list. The engine's WebAssembly build is committed to the
repository at `packages/sdk/wasm`, so you do not need Rust, wasm-pack, or a C++
toolchain to run an example, build a game, or ship one.

Optional but useful:

- Git for cloning and updating the repository
- A modern browser for running Vite examples
- VS Code if you want to work on the TypeScript and Rust code together

## Clone And Install

```bash
git clone https://github.com/acathon/cathode-retro-engine.git
cd cathode-retro-engine
npm install          # or: bun install
```

There is no build step here. `npm install` links the committed engine into
`packages/sdk/node_modules/cathode-platform-web`, and the SDK is consumed as
TypeScript source, so Vite compiles both on demand.

## Run A Known-Good Example

Start with a small example before creating a new project.

```bash
cd examples/trex-game
npm run dev          # or: bun dev
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

## Changing The Engine Itself

Everything above works without Rust. This section is for editing the engine
under `crates/` — the core, the web bindings, or the native runtime.

| Tool | Why you need it |
| --- | --- |
| [Rust stable](https://rustup.rs/) | Compiles the engine |
| [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) | Produces the web build |
| A host C/C++ linker | Rust needs one even for a WebAssembly build |

That last row surprises people. `wasm-pack build` targets
`wasm32-unknown-unknown`, but Cargo still compiles build scripts and procedural
macros — `serde`, `quote`, `wasm-bindgen-shared` — **for your own machine**, and
linking those needs a native linker.

- **Windows** — install [Build Tools for Visual Studio](https://visualstudio.microsoft.com/downloads/)
  and tick the *Desktop development with C++* workload. VS Code is a different
  product and is not sufficient. Without it the build stops at
  `error: linker 'link.exe' not found`.
- **macOS** — `xcode-select --install`.
- **Debian/Ubuntu** — `sudo apt install build-essential`. The native runtime
  additionally needs `libasound2-dev libudev-dev libdbus-1-dev pkg-config`.

Then rebuild the committed engine and commit the result:

```bash
npm run build:wasm
git add packages/sdk/wasm
```

The build output is checked in on purpose, which means it can fall behind the
code it came from. CI rebuilds it and fails if the generated bindings no longer
match the Rust source; you can run the same check yourself:

```bash
node scripts/check-wasm-current.mjs
```

To validate the Rust without producing a web build:

```bash
cargo test --workspace
cargo check -p cathode-platform-web --target wasm32-unknown-unknown
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

### `Could not find package.json for ... dependency "cathode-platform-web"`

The committed engine build is missing from your checkout. It lives at
`packages/sdk/wasm` and is tracked by git, so restore it:

```bash
git checkout -- packages/sdk/wasm
```

If you are on a clone from before that directory was committed, pull `main`.
npm fails more quietly than Bun here: it prints no error and simply leaves the
package unlinked, and the game then fails in the browser with
`Failed to load cathode-platform-web WASM module`.

### `error: linker 'link.exe' not found` on Windows

You are building the engine from source, which needs a native C++ linker even
though the output is WebAssembly. Either install the Visual Studio C++ build
tools (see [Changing The Engine Itself](#changing-the-engine-itself)), or skip
the build entirely — the compiled engine is already in the repository, and
`npm install` is enough to run every example.

### `Cannot find module @rollup/rollup-win32-x64-msvc` (or `@esbuild/...`)

Rollup and esbuild ship their native binary as one optional dependency per
platform. If `package-lock.json` was generated without the entry for yours, npm
cannot install it, and npm's own error blames a bug in npm and tells you to
delete your lockfile.

Deleting it is not the fix here -- the lockfile in this repository lists every
platform, so first make sure you are up to date with `main`:

```bash
git pull
rm -rf node_modules
npm install
```

`node scripts/check-lockfile-portable.mjs` reports whether the lockfile covers
Windows, macOS and Linux; CI runs it on every push.

### `Failed to load cathode-platform-web WASM module` in the browser

The package is not linked into `node_modules`. Re-run `npm install`, and check
that `packages/sdk/wasm/cathode_platform_web_bg.wasm` exists.

### An example builds but shows stale behavior

Vite caches aggressively across dependency changes. Clear its cache and restart
the dev server:

```bash
rm -rf node_modules/.vite
```

If you changed Rust, remember that examples use the *committed* build — run
`npm run build:wasm` to regenerate it.

### CLI command not found

Build the CLI first:

```bash
bun run build:cli
```

Then invoke it from `packages/cli/dist/index.js` inside the monorepo, or install the package in a separate project once published.
