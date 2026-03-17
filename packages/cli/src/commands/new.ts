import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

export default async function newCommand(name: string) {
  const targetDir = path.resolve(process.cwd(), name);
  
  if (fs.existsSync(targetDir)) {
    console.error(chalk.red(`Directory ${name} already exists.`));
    process.exit(1);
  }

  const spinner = ora(`Scaffolding new retro engine project: ${name}`).start();

  try {
    // 1. Create directories
    await fs.ensureDir(targetDir);
    await fs.ensureDir(path.join(targetDir, 'src'));
    await fs.ensureDir(path.join(targetDir, 'assets', 'sprites'));
    await fs.ensureDir(path.join(targetDir, 'assets', 'maps'));
    await fs.ensureDir(path.join(targetDir, 'assets', 'audio'));

    // 2. Package.json
    const pkgJson = {
      name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        "dev": "retro run",
        "build": "retro build"
      },
      dependencies: {
        "@retro-engine/sdk": "latest"
      },
      devDependencies: {
        "typescript": "^5.5.0",
        "vite": "^5.3.0"
      }
    };
    await fs.writeJson(path.join(targetDir, 'package.json'), pkgJson, { spaces: 2 });

    // 3. retro.config.json
    const retroConfig = {
      resolution: { width: 160, height: 144 },
      audioChannels: 4,
      spriteLimit: 40,
      scanlines: false,
      targetFps: 60,
      title: name
    };
    await fs.writeJson(path.join(targetDir, 'retro.config.json'), retroConfig, { spaces: 2 });

    // 4. index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <style>
        body { margin: 0; background-color: #0a0a0a; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
        canvas { box-shadow: 0 0 20px rgba(0,0,0,0.8); }
    </style>
</head>
<body>
    <canvas id="game"></canvas>
    <script type="module" src="/src/main.ts"></script>
</body>
</html>`;
    await fs.writeFile(path.join(targetDir, 'index.html'), indexHtml);

    // 5. tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        skipLibCheck: true
      },
      include: ["src/**/*"]
    };
    await fs.writeJson(path.join(targetDir, 'tsconfig.json'), tsconfig, { spaces: 2 });

    // 6. vite.config.ts
    const viteConfig = `import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 3000 }
});`;
    await fs.writeFile(path.join(targetDir, 'vite.config.ts'), viteConfig);

    // 7. src/main.ts
    const mainTs = `import { RetroEngine, Scene, Sprite, SoundChannel } from '@retro-engine/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;

async function bootstrap() {
  const engine = await RetroEngine.gameboy(canvas);
  const scene = new Scene(engine);
  // Example: const sheet = await engine.loadSheet('/assets/sprites/sheet.png', 8, 8);
  // const player = new Sprite(scene, { sheet, frame: 0, x: 76, y: 68 });
  
  engine.loop((dt) => {
    scene.update(dt);
    // if (engine.input.held(0, 'left')) player.x -= 50 * dt;
  });
}

bootstrap();`;
    await fs.writeFile(path.join(targetDir, 'src', 'main.ts'), mainTs);

    spinner.succeed(chalk.green(`Successfully created ${name}!`));
    console.log(`\nNext steps:\n  cd ${name}\n  npm install\n  npm run dev`);
  } catch (err: any) {
    spinner.fail(chalk.red(`Failed to scaffold config: ${err.message}`));
    process.exit(1);
  }
}
