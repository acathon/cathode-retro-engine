# Documentation Hub

This folder is the documentation map for Retro Engine. Use it as the table of contents for the repository.

## Fastest Paths

| If you want to... | Read this first |
| --- | --- |
| run the engine today | [getting-started.md](./getting-started.md) |
| build your first small game | [first-game.md](./first-game.md) |
| learn from a full project | [tutorial-trex.md](./tutorial-trex.md) |
| understand internals | [architecture.md](./architecture.md) |
| contribute changes | [contributing.md](./contributing.md) |

## Suggested Reading Order For New Developers

1. [getting-started.md](./getting-started.md)
2. [first-game.md](./first-game.md)
3. One example inside `examples/`
4. [tutorial-trex.md](./tutorial-trex.md)
5. [architecture.md](./architecture.md)

## What Each Document Covers

### [getting-started.md](./getting-started.md)

Tooling, installation, core commands, running examples, and creating a new project.

### [first-game.md](./first-game.md)

A minimal hands-on tutorial that builds a tiny playable game loop with score, movement, and collectibles.

### [tutorial-trex.md](./tutorial-trex.md)

A longer example-driven walkthrough using one of the included games as a teaching tool.

### [architecture.md](./architecture.md)

Subsystem reference for the Rust core, WASM bindings, SDK, runtime targets, and editor layout.

### [contributing.md](./contributing.md)

Community contribution expectations, local validation commands, and repo conventions.

## Where To Look In The Codebase

| Area | Location |
| --- | --- |
| Engine core | `crates/core/src` |
| Browser bindings | `crates/platform-web/src` |
| Native runtime | `crates/platform-native/src` |
| TypeScript SDK | `packages/sdk/src` |
| CLI | `packages/cli/src` |
| Browser editor | `packages/editor/src` |
| Desktop editor | `packages/editor-desktop/src` and `packages/editor-desktop/src-tauri/src` |
| Learning examples | `examples/*/src/main.ts` |

## Recommended Learning Strategy

Do not start with the architecture doc unless you are already blocked on internals.

For most developers, the best sequence is:

1. run an example,
2. build the tiny tutorial game,
3. copy patterns from an example,
4. read internals only for the subsystem you need.
