# Contributing

This repository is intended to be approachable for both engine contributors and developers building on top of the engine. This guide explains how to work in the repo without guesswork.

## Good First Contributions

These are high-value contribution types:

- bug fixes with a reproducible example,
- documentation improvements,
- example game polish that teaches an engine feature,
- SDK ergonomics improvements,
- tests for engine behavior that currently relies on manual verification.

## Prerequisites

| Tool | Version | Purpose |
| --- | --- | --- |
| Rust | stable | engine core, WASM crate, native runtime |
| wasm-pack | latest | WebAssembly bindings |
| Bun | 1.x | workspace dependencies and web package commands |

## Local Setup

```bash
git clone https://github.com/acathon/retor-engine.git
cd retor-engine
bun install
bun run build:wasm
bun run build:sdk
```

If you are working on the CLI as well:

```bash
bun run build:cli
```

## Repository Layout

| Path | Purpose |
| --- | --- |
| `crates/core` | portable Rust engine core |
| `crates/platform-web` | WASM bindings exported to the browser |
| `crates/platform-native` | native desktop runtime |
| `packages/sdk` | TypeScript developer-facing SDK |
| `packages/cli` | project scaffolding and export tooling |
| `packages/editor` | browser-based editor |
| `packages/editor-desktop` | Tauri desktop editor |
| `examples` | reference games and demos |
| `docs` | onboarding, tutorials, architecture, contribution docs |

## Engineering Expectations

### Rust

- Run `cargo fmt` and `cargo clippy` before opening a PR.
- Prefer fixing root causes instead of adding defensive patches around symptoms.
- Avoid panics in developer-facing paths when a structured error or fallback is possible.
- Add tests where behavior is subtle, stateful, or easy to regress.

### TypeScript

- Keep public APIs clear and small.
- Avoid introducing loose types where a real interface is possible.
- Prefer examples and docs that use the public SDK surface instead of hidden internals unless the internal API is the point of the contribution.
- When changing SDK behavior, update the docs or examples that teach that behavior.

### Documentation

- Keep commands accurate and reproducible.
- Prefer a short working example over abstract explanation.
- Update docs whenever you change onboarding, build flows, or public APIs.

## Validation Commands

Run the smallest meaningful validation set for the area you changed.

### Core engine and native runtime

```bash
cargo test -p cathode-core -p cathode-platform-native
```

### Web platform bindings

```bash
cargo check -p cathode-platform-web --target wasm32-unknown-unknown
```

### Desktop editor

The Tauri editor is a **separate Cargo workspace**, so `cargo test --workspace`
at the repo root deliberately skips it — the engine itself never needs a
desktop GUI toolchain. Build it from its own directory:

```bash
cd packages/editor-desktop
bun run tauri build
```

On Linux that needs the GTK/WebKit development packages
(`libwebkit2gtk-4.0-dev`, `libgtk-3-dev`). The engine crates need only
`libasound2-dev` and `libudev-dev` for the native runtime.

### Example build smoke test

```bash
cd examples/doom-game
bun run build
```

### Root scripts

```bash
bun run build:wasm
bun run build:sdk
bun run build:cli
```

## Reporting Bugs Well

Include these details when possible:

1. what you expected,
2. what actually happened,
3. exact commands you ran,
4. the example or package involved,
5. screenshots or logs for rendering/editor issues,
6. a minimal reproduction if the bug is not obvious.

## Pull Request Guidance

Before opening a PR, make sure you have:

1. scoped the change clearly,
2. avoided unrelated cleanup,
3. updated the docs if onboarding or APIs changed,
4. run validation commands relevant to your change,
5. explained any known gaps or follow-up work.

## Community Principle

Treat examples and docs as part of the product, not as optional extras. A change that is technically correct but hard for a new developer to discover or understand is incomplete.
