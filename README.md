# 🕹️ Retro Engine

![Retro Engine Banner](./docs/assets/banner.png)

A high-performance, production-ready **Retro Game Engine** built with **Rust** and **WebAssembly**, featuring a TypeScript SDK and integrated CLI tools. 

Designed for developers who want the performance of Rust with the ergonomics of modern web development.

---

## 🚀 Features

-   **🦀 Rust Core**: High-performance ECS (`hecs`), software renderer, and audio mixer.
-   **🕸️ WASM-Powered**: Near-native performance in the browser via WebAssembly.
-   **📦 TypeScript SDK**: Fully typed API for entities, scenes, and asset management.
-   **🛠️ CLI Tooling**: Scaffolding, dev server, and export commands out of the box.
-   **🎶 Audio Mixer**: Authentic synth waveforms (Pulse, Triangle, Sawtooth, Noise, Sine).
-   **🖼️ Custom Renderer**: Tilemaps, animated sprites, layers, and retro palette support.
-   **🌀 Native Support**: Cross-platform desktop builds using `winit` and `pixels`.

---

## 🦖 Demo: T-Rex Runner

See the engine in action! This demo uses AI-generated 16-bit pixel art, parallax scrolling, and collision detection—all running through the WASM engine.

![T-Rex Runner Gameplay](./docs/assets/demo.webp)

---

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Logic** | Rust (Core Engine) |
| **Binding** | wasm-bindgen / WebAssembly |
| **Frontend** | TypeScript / Vite |
| **Graphics** | Software Renderer (RGBA buffer) |
| **Audio** | Custom Mixer (WebAudio / CPAL) |

---

## 📦 Monorepo Structure

```text
retro-engine/
├── crates/
│   ├── core/             # Core Engine Logic (ECS, Rendering, Audio)
│   ├── platform-web/      # WASM Bindings for Browser
│   └── platform-native/   # Native Desktop Implementation
├── packages/
│   ├── sdk/              # TypeScript SDK (@retro-engine/sdk)
│   ├── cli/              # Command Line Interface (@retro-engine/cli)
│   └── editor/           # In-browser Tilemap Editor
└── examples/
    ├── demo-game/        # Basic Platformer Demo
    └── trex-game/        # T-Rex Runner Implementation
```

---

## 🚦 Getting Started

### Prerequisites

-   [Rust](https://rustup.rs/) (stable)
-   [Node.js](https://nodejs.org/) (v18+)
-   [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

### Installation & Build

1. **Clone the repo**
   ```bash
   git clone https://github.com/youruser/retro-engine.git
   cd retro-engine
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the entire workspace** (WASM + SDK + CLI)
   ```bash
   npm run build:all
   ```

4. **Run the T-Rex Demo**
   ```bash
   npm run dev:demo
   ```

---

## 📜 Documentation

-   [Getting Started Guide](./docs/getting-started.md)
-   [T-Rex Tutorial](./docs/tutorial-trex.md)
-   [Architecture Overview](./docs/architecture.md)

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

MIT License - Copyright (c) 2026 Retro Engine Team.
