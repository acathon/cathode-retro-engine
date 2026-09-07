# Documentation Hub

This folder is the documentation map for Cathode. Use it as the table of contents for the repository.

These pages are also rendered as a website: `npm run build:site` turns every
`.md` here into a styled page under `site/docs/`, and
[`site/docs.html`](../site/docs.html) is the hub. Edit the markdown, not the
generated HTML.

## Fastest Paths

| If you want to... | Read this first |
| --- | --- |
| run the engine today | [getting-started.md](./getting-started.md) |
| build your first small game | [first-game.md](./first-game.md) |
| learn from a full project | [tutorial-trex.md](./tutorial-trex.md) |
| build a physics game with the engine's own collisions | [tutorial-bounce.md](./tutorial-bounce.md) |
| build a first-person game | [tutorial-bounce-3d.md](./tutorial-bounce-3d.md) |
| build a card game | [tutorial-cards.md](./tutorial-cards.md) |
| understand internals | [architecture.md](./architecture.md) |
| contribute changes | [contributing.md](./contributing.md) |

## Suggested Reading Order For New Developers

1. [getting-started.md](./getting-started.md)
2. [first-game.md](./first-game.md)
3. One example inside `examples/`
4. [tutorial-trex.md](./tutorial-trex.md) or [tutorial-bounce.md](./tutorial-bounce.md)
5. [architecture.md](./architecture.md)

## What Each Document Covers

### [getting-started.md](./getting-started.md)

Tooling, installation, core commands, running examples, and creating a new project.

### [first-game.md](./first-game.md)

A minimal hands-on tutorial that builds a tiny playable game loop with score, movement, and collectibles.

### [tutorial-trex.md](./tutorial-trex.md)

A longer example-driven walkthrough using one of the included games as a teaching tool.

### [tutorial-bounce.md](./tutorial-bounce.md)

Builds `examples/bounce-classic` end to end: handing a body to the engine's
physics with `usePhysics`, declaring solid tiles, and the two tuning mistakes
(air control as a multiplier, buoyancy as a force) that quietly break a
bouncing game.

### [tutorial-bounce-3d.md](./tutorial-bounce-3d.md)

The same game from inside the ball. Covers the raycaster's vertical axis —
eye height, horizon pitch and billboard elevation — and how to tune a jump
against a ceiling rather than against gravity.

### [tutorial-cards.md](./tutorial-cards.md)

Builds a working game of War on `@cathode/cards`, and explains the split every
card game here uses: rules as a plain value with no engine imports, so a poker
evaluator or a gin rummy meld search can be unit-tested without a browser.
Also covers picking your own screen size instead of a console preset.

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
| Block language | `packages/blocks/src` |
| Cathode Studio | `packages/studio/src` |
| Card game layer | `packages/cards/src` |
| Headless game checks | `scripts/verify` |
| Project website | `site` |

## Recommended Learning Strategy

Do not start with the architecture doc unless you are already blocked on internals.

For most developers, the best sequence is:

1. run an example,
2. build the tiny tutorial game,
3. copy patterns from an example,
4. read internals only for the subsystem you need.
