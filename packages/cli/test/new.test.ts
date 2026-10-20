import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseProject, screenSize } from '@cathode/project';
import newCommand, { TEMPLATE_NAMES, copyEngine } from '../src/commands/new.js';

let work: string;
let cwd: string;

beforeEach(async () => {
  cwd = process.cwd();
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'cathode-new-'));
  process.chdir(work);
});

afterEach(async () => {
  process.chdir(cwd);
  await fs.remove(work);
  vi.restoreAllMocks();
});

/** Make process.exit throw, so a refusal can be asserted instead of ending the run. */
function trapExit() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit ${code}`);
  }) as never);
}

describe.each(TEMPLATE_NAMES)('cathode new --template %s', (template) => {
  const dir = () => path.join(work, 'my-game');

  beforeEach(async () => {
    await newCommand('my-game', { template });
  });

  it('writes a valid cathode.json', async () => {
    const { project, errors } = parseProject(await fs.readFile(path.join(dir(), 'cathode.json'), 'utf8'));
    expect(errors).toEqual([]);
    expect(project).toMatchObject({ name: 'my-game', title: 'My Game', version: '0.1.0' });
  });

  it('declares the screen its own code asks the engine for', async () => {
    const { project } = parseProject(await fs.readFile(path.join(dir(), 'cathode.json'), 'utf8'));
    const main = await fs.readFile(path.join(dir(), 'src', 'main.ts'), 'utf8');
    const called = main.match(/Cathode\.(gameboy|nes|neogeo|dos)\(/)?.[1];
    expect(called).toBeTruthy();
    expect(project!.screen).toEqual({ profile: called });
    expect(screenSize(project!).width).toBeGreaterThan(0);
  });

  it('carries its own engine instead of fetching one from a registry', async () => {
    const pkg = await fs.readJson(path.join(dir(), 'package.json'));
    expect(pkg.dependencies).toEqual({ '@cathode/sdk': 'file:./cathode-sdk' });
    expect(await fs.pathExists(path.join(dir(), 'cathode-sdk', 'wasm', 'cathode_platform_web_bg.wasm'))).toBe(true);
    expect(await fs.pathExists(path.join(dir(), 'cathode-sdk', 'src', 'index.ts'))).toBe(true);
  });

  it('runs with Node alone: plain Vite scripts, not a global CLI', async () => {
    const pkg = await fs.readJson(path.join(dir(), 'package.json'));
    expect(pkg.scripts).toEqual({
      dev: 'vite', build: 'vite build --base ./', preview: 'vite preview', typecheck: 'tsc --noEmit',
    });
  });

  it('points at its entry with a relative path', async () => {
    const html = await fs.readFile(path.join(dir(), 'index.html'), 'utf8');
    expect(html).toContain('src="./src/main.ts"');
    expect(html).not.toContain('src="/src/');
  });

  it('keeps the engine in the game’s own repository', async () => {
    const ignore = await fs.readFile(path.join(dir(), '.gitignore'), 'utf8');
    expect(ignore).not.toMatch(/cathode-sdk|\*\.wasm/);
  });

  it('leaves what `cathode export` generates out of the repository', async () => {
    const ignore = (await fs.readFile(path.join(dir(), '.gitignore'), 'utf8')).split('\n');
    expect(ignore).toEqual(expect.arrayContaining(['native', 'out', 'capacitor.config.json', 'dist', 'node_modules']));
  });

  it('is ready for a phone: touch controls declared, the notch respected, a store id to replace', async () => {
    const { project } = parseProject(await fs.readFile(path.join(dir(), 'cathode.json'), 'utf8'));
    expect(project!.input).toEqual(['keyboard', 'touch']);
    expect(project!.id).toBe('com.example.mygame');
    const html = await fs.readFile(path.join(dir(), 'index.html'), 'utf8');
    expect(html).toContain('viewport-fit=cover');
    const main = await fs.readFile(path.join(dir(), 'src', 'main.ts'), 'utf8');
    // A key listener of its own would never hear the on-screen buttons.
    expect(main).not.toMatch(/addEventListener\(\s*['"]key/);
  });

  it('brings none of the engine’s own build and test tools into the game', async () => {
    const pkg = await fs.readJson(path.join(dir(), 'cathode-sdk', 'package.json'));
    expect(pkg.devDependencies).toBeUndefined();
    expect(pkg.scripts).toBeUndefined();
    expect(pkg.dependencies).toEqual({ 'cathode-platform-web': 'file:./wasm' });
    expect(pkg.main).toBe('./src/index.ts');
  });

  // The templates are strings inside the CLI, so nothing else ever compiles
  // them -- and Vite strips types without checking. This found a template
  // that crashed on start, and colliders sized 0x0 by arguments in the wrong
  // order. Offline: @cathode/sdk resolves to the copy the project carries.
  it('typechecks against the engine it carries', async () => {
    await fs.writeJson(path.join(dir(), 'tsconfig.check.json'), {
      extends: './tsconfig.json',
      compilerOptions: {
        noEmit: true,
        baseUrl: '.',
        paths: {
          '@cathode/sdk': ['./cathode-sdk/src/index.ts'],
          'cathode-platform-web': ['./cathode-sdk/wasm/cathode_platform_web.d.ts'],
        },
      },
    });
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
    let output = '';
    try {
      execFileSync(process.execPath, [tsc, '-p', 'tsconfig.check.json'], { cwd: dir(), encoding: 'utf8' });
    } catch (error: any) {
      output = String(error.stdout || error.message);
    }
    expect(output).toBe('');
  }, 60_000);

  it('writes no leftover retro.config.json', async () => {
    expect(await fs.pathExists(path.join(dir(), 'retro.config.json'))).toBe(false);
  });
});

describe('copyEngine', () => {
  it('drops the wasm-pack .gitignore that would hide the engine from git', async () => {
    const sdk = path.join(work, 'fixture-sdk');
    await fs.outputJson(path.join(sdk, 'package.json'), { name: '@cathode/sdk', devDependencies: { vitest: '*' } });
    await fs.outputFile(path.join(sdk, 'README.md'), '');
    await fs.outputFile(path.join(sdk, 'src', 'index.ts'), '');
    await fs.outputFile(path.join(sdk, 'wasm', 'engine.wasm'), '');
    await fs.outputFile(path.join(sdk, 'wasm', '.gitignore'), '*');
    await fs.outputFile(path.join(sdk, 'node_modules', 'junk', 'index.js'), '');

    const to = path.join(work, 'copied');
    await copyEngine(to, sdk);

    expect(await fs.pathExists(path.join(to, 'wasm', 'engine.wasm'))).toBe(true);
    expect(await fs.pathExists(path.join(to, 'wasm', '.gitignore'))).toBe(false);
    expect(await fs.pathExists(path.join(to, 'node_modules'))).toBe(false);
  });
});

describe('refusals', () => {
  it('a name that cannot be a project name, with the reason', async () => {
    trapExit();
    await expect(newCommand('My Game', {})).rejects.toThrow('exit 1');
    expect(await fs.pathExists(path.join(work, 'My Game'))).toBe(false);
  });

  it('an unknown template', async () => {
    trapExit();
    await expect(newCommand('my-game', { template: 'mmo' })).rejects.toThrow('exit 1');
  });

  it('a directory that already exists, left untouched', async () => {
    await fs.outputFile(path.join(work, 'my-game', 'keep.txt'), 'mine');
    trapExit();
    await expect(newCommand('my-game', {})).rejects.toThrow('exit 1');
    expect(await fs.readFile(path.join(work, 'my-game', 'keep.txt'), 'utf8')).toBe('mine');
  });
});
