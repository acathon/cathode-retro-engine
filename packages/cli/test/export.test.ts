import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import exportCommand from '../src/commands/export.js';

// What `cathode export` refuses, before it builds or installs anything. The
// builds themselves need the Android SDK and Xcode, and are proven in CI by
// .github/workflows/mobile.yml.

let work: string;
let cwd: string;
let said: string;

beforeEach(async () => {
  cwd = process.cwd();
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'cathode-export-'));
  process.chdir(work);
  said = '';
  vi.spyOn(console, 'error').mockImplementation((...args) => { said += args.join(' '); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit ${code}`);
  }) as never);
});

afterEach(async () => {
  process.chdir(cwd);
  await fs.remove(work);
  vi.restoreAllMocks();
});

const game = (fields: Record<string, unknown> = {}) => fs.writeJson(path.join(work, 'cathode.json'), {
  format: 1, name: 'rocket-rush', title: 'Rocket Rush', version: '1.0.0',
  screen: { profile: 'nes' }, input: ['keyboard', 'touch'], ...fields,
});

describe('cathode export refuses', () => {
  it('a folder that is not a game', async () => {
    await expect(exportCommand('android')).rejects.toThrow('exit 1');
    expect(said).toContain('no cathode.json here');
  });

  it('a target it cannot build', async () => {
    await game();
    await expect(exportCommand('desktop')).rejects.toThrow('exit 1');
    expect(said).toContain('web, android, ios');
  });

  it('a cathode.json with problems, and names them', async () => {
    await game({ version: '1.0' });
    await expect(exportCommand('android')).rejects.toThrow('exit 1');
    expect(said).toContain('version is required as MAJOR.MINOR.PATCH');
  });

  it.each(['android', 'ios'])('a %s store build without the game’s own id', async (target) => {
    await game({ id: 'com.example.rocketrush', icon: 'icon.png' });
    await expect(exportCommand(target, { release: true })).rejects.toThrow('exit 1');
    expect(said).toContain('needs your own "id"');
    expect(said).toContain('io.github.yourname.rocketrush');
  });

  it('a store build without an icon', async () => {
    await game({ id: 'io.github.someone.rocketrush' });
    await expect(exportCommand('android', { release: true })).rejects.toThrow('exit 1');
    expect(said).toContain('needs an icon');
  });

  it('an icon that is not there, or not a PNG it can read', async () => {
    await game({ id: 'io.github.someone.rocketrush', icon: 'icon.png' });
    await expect(exportCommand('android', { release: true })).rejects.toThrow('exit 1');
    expect(said).toContain('icon.png, does not exist');

    said = '';
    await fs.writeFile(path.join(work, 'icon.png'), 'GIF89a');
    await expect(exportCommand('android', { release: true })).rejects.toThrow('exit 1');
    expect(said).toContain("icon.png can't be read: not a PNG file");
  });

  it('running a store build, which no device will install', async () => {
    await game({ id: 'io.github.someone.rocketrush', icon: 'icon.png' });
    await expect(exportCommand('android', { release: true, run: true })).rejects.toThrow('exit 1');
    expect(said).toContain('--run installs a test build');
  });
});
