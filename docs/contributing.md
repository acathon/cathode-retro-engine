# Contributing

We love pull requests! Please read these conventions before contributing.

## Prerequisites
| Tool | Version | Purpose |
|---|---|---|
| Rust | \`stable\` | Core engine compilation |
| wasm-pack | \`latest\` | WASM compilation toolchain |
| Node.js | \`20+\` | Build CLI, SDK, and Editor |

## Getting Started
```bash
git clone https://github.com/retro-engine/retro-engine
cd retro-engine
npm install
make all
```

## Project Layout
- `crates/core`: Pure Rust portable engine core. No platform dependencies.
- `crates/platform-web`: `cdylib` crate exporting WASM bindings via `wasm-bindgen`.
- `crates/platform-native`: Executable crate using `winit` and `pixels` as native runtime.
- `packages/sdk`: TypeScript runtime bindings.
- `packages/cli`: `npx retro` command tool.
- `packages/editor`: Built-in web editor for assets.

## Rust Conventions
- Use `rustfmt` and run `cargo clippy`. No PRs will be accepted with warnings.
- Unsafe rust is prohibited unless strictly required for array manipulation (and heavily audited).
- Write `///` doc comments for all `pub` structs and functions. 

## TypeScript Conventions
- **No `any`**: All variables must be strictly typed.
- Prefer `interface` over `type` where inheritance might be useful.
- Use `ESM` modules.
- Ensure strict null checks are passing.

## Test Commands
```bash
make test
make lint
```

## Commit Message Style
Please prefix your commits using Conventional Commits, e.g. `feat: added sawtooth waveform` or `fix: camera offset bug`.
