import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMAT, PROFILES, parseProject, screenSize, validateProject } from '../src/index.js';

const minimal = () => ({
  format: 1,
  name: 'my-game',
  title: 'My Game',
  version: '1.0.0',
  screen: { profile: 'nes' },
  input: ['keyboard'],
});

/** The one error a single bad field produces. */
const errorFor = (patch) => validateProject({ ...minimal(), ...patch });

describe('a valid project', () => {
  it('needs only format, name, title, version, screen and input', () => {
    expect(validateProject(minimal())).toEqual([]);
  });

  it('accepts every optional field', () => {
    const full = {
      ...minimal(),
      description: 'A game.',
      id: 'com.example.mygame',
      screen: { width: 464, height: 360 },
      orientation: 'portrait',
      input: ['keyboard', 'touch', 'mouse', 'gamepad'],
      icon: 'assets/icon.png',
      credits: [{ what: 'Art', who: 'Someone', license: 'CC0', url: 'https://example.com' }],
    };
    expect(validateProject(full)).toEqual([]);
  });

  it('defaults orientation to landscape when parsed', () => {
    const { project, errors } = parseProject(JSON.stringify(minimal()));
    expect(errors).toEqual([]);
    expect(project.orientation).toBe('landscape');
  });

  it('keeps an orientation it was given', () => {
    const { project } = parseProject(JSON.stringify({ ...minimal(), orientation: 'portrait' }));
    expect(project.orientation).toBe('portrait');
  });
});

describe('the format version', () => {
  it('is required', () => {
    const { format, ...rest } = minimal();
    expect(validateProject(rest)).toEqual([`format is required. Use ${FORMAT}.`]);
  });

  it('says plainly when a project is from a newer Cathode', () => {
    expect(errorFor({ format: 2 })).toEqual(['format 2 is newer than this version of Cathode understands (1).']);
  });
});

describe('fields that reach the stores', () => {
  it.each(['1.0', 'v1.0.0', '1.0.0-beta', '1.0.0.0', 1])('rejects version %j — iOS takes numbers only', (version) => {
    expect(errorFor({ version })).toHaveLength(1);
  });

  it.each(['1.1000.0', '1.0.1000', '2100.0.0'])('rejects version %j — too big for Android to number', (version) => {
    expect(errorFor({ version })).toEqual(['version must keep MINOR and PATCH at most 999, and MAJOR at most 2099, so Android can number it.']);
  });

  it('accepts the largest version Android can number', () => {
    expect(errorFor({ version: '2099.999.999' })).toEqual([]);
  });

  it.each([
    ['com.example.my-game', 'Android forbids hyphens'],
    ['com.example.my_game', 'iOS forbids underscores'],
    ['com.example.2game', 'Android needs each part to start with a letter'],
    ['mygame', 'one part is not an ID'],
  ])('rejects id %s (%s)', (id) => {
    expect(errorFor({ id })).toHaveLength(1);
  });

  it('accepts an ID both stores take', () => {
    expect(errorFor({ id: 'io.github.someone.mygame2' })).toEqual([]);
  });
});

describe('screen', () => {
  it('takes a preset by name', () => {
    for (const profile of Object.keys(PROFILES)) expect(errorFor({ screen: { profile } })).toEqual([]);
  });

  it('rejects an unknown preset', () => {
    expect(errorFor({ screen: { profile: 'snes' } })[0]).toMatch(/not one of: nes, gameboy, neogeo, dos/);
  });

  it('refuses a preset and a size at once', () => {
    expect(errorFor({ screen: { profile: 'nes', width: 320, height: 240 } })).toEqual([
      'screen takes a profile or a width and height, not both.',
    ]);
  });

  it.each([[320, '240'], [8, 240], [320, 240.5], [320, undefined]])('rejects size %j x %j', (width, height) => {
    expect(errorFor({ screen: { width, height } })).toHaveLength(1);
  });

  it('resolves to pixels either way', () => {
    expect(screenSize({ screen: { profile: 'gameboy' } })).toEqual({ width: 160, height: 144 });
    expect(screenSize({ screen: { width: 464, height: 360 } })).toEqual({ width: 464, height: 360 });
  });

  it('hands back a copy, so a caller cannot change a preset', () => {
    screenSize({ screen: { profile: 'nes' } }).width = 1;
    expect(PROFILES.nes.width).toBe(256);
  });
});

describe('input', () => {
  it('is required and non-empty', () => {
    expect(errorFor({ input: [] })).toHaveLength(1);
    expect(errorFor({ input: undefined })).toHaveLength(1);
  });

  it('rejects unknown controls and duplicates', () => {
    expect(errorFor({ input: ['keyboard', 'joystick'] })).toEqual([
      'input "joystick" is not one of: keyboard, touch, mouse, gamepad.',
    ]);
    expect(errorFor({ input: ['touch', 'touch'] })).toEqual(['input lists a control twice.']);
  });
});

describe('mistakes it catches instead of ignoring', () => {
  it('a misspelt field', () => {
    expect(errorFor({ titel: 'Oops' })).toEqual(['Unknown field "titel".']);
  });

  it('an icon outside the project, or not a PNG', () => {
    for (const icon of ['/etc/icon.png', '../icon.png', 'assets/../../icon.png', 'assets/icon.jpg']) {
      expect(errorFor({ icon })).toHaveLength(1);
    }
  });

  it('a credit missing its author', () => {
    expect(errorFor({ credits: [{ what: 'Art' }] })[0]).toMatch(/credits\[0\]\.who is required/);
  });

  it('broken JSON, with the parser’s reason', () => {
    const { project, errors } = parseProject('{ "format": 1, }');
    expect(project).toBeNull();
    expect(errors[0]).toMatch(/^Not valid JSON: /);
  });

  it('several problems at once, all reported', () => {
    expect(validateProject({ format: 1 }).length).toBeGreaterThanOrEqual(5);
  });
});

describe('the repository', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));

  it('presets match the engine config in Rust', () => {
    const rust = readFileSync(`${root}crates/core/src/config.rs`, 'utf8');
    const found = {};
    for (const m of rust.matchAll(/pub fn (\w+)\(\) -> Self \{\s*Self \{\s*width: (\d+),\s*height: (\d+),/g)) {
      found[m[1]] = { width: Number(m[2]), height: Number(m[3]) };
    }
    expect(found).toEqual(PROFILES);
  });

  it('every example has a valid cathode.json named after its folder', () => {
    const examples = readdirSync(`${root}examples`, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(`${root}examples/${e.name}/index.html`))
      .map((e) => e.name);
    expect(examples.length).toBeGreaterThanOrEqual(16);
    for (const name of examples) {
      const file = `${root}examples/${name}/cathode.json`;
      expect(existsSync(file), `${name} has no cathode.json`).toBe(true);
      const { project, errors } = parseProject(readFileSync(file, 'utf8'));
      expect(errors, name).toEqual([]);
      expect(project.name, `${name}/cathode.json names a different folder`).toBe(name);
    }
  });
});
