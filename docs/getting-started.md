# Getting Started

Welcome to the Retro Engine documentation! This guide will help you build your first game.

## Installation
The easiest way to start is using our CLI tool:
```bash
npx @retro-engine/cli new my-first-game
cd my-first-game
npm install
npm run dev
```

## Project Structure
Your new project looks like this:
```
my-first-game/
├── package.json
├── retro.config.json    # Game settings (resolution, audio channels, etc.)
├── index.html           # Canvas container
├── tsconfig.json
├── vite.config.ts
├── src/                 # TypeScript game logic
│   └── main.ts
└── assets/              # Static assets
    ├── sprites/
    ├── maps/
    └── audio/
```

## Configuration (`retro.config.json`)
You can tweak the constraints of your engine instance:
```json
{
  "resolution": { "width": 160, "height": 144 },
  "audioChannels": 4,
  "spriteLimit": 40,
  "scanlines": false,
  "targetFps": 60,
  "title": "My Game"
}
```

## Adding Assets
1. Open the included tilemap editor: `npm run dev:editor`
2. Import a `.png` file or draw directly into the editor.
3. Export the `.json` tilemap and save it to `assets/maps/level1.json`.
4. Load it in your code:
```typescript
const mapJson = await fetch('/assets/maps/level1.json').then(r => r.text());
engine.loadTileMap(mapJson);
```

## Exporting your Game
When you are ready to ship:
- **Web**: `npx retro export web` (outputs static files to `/dist`)
- **Desktop**: `npx retro export desktop` (uses Tauri under the hood)
- **Mobile**: `npx retro export mobile` (uses Capacitor)
