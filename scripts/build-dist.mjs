/**
 * Assemble a self-contained static site into `site/dist/`.
 *
 *   npm run build:dist
 *
 * `site/` on its own is browsable from a dev server at the repository root,
 * where its game links point at `../examples/<name>/` and Vite compiles the
 * TypeScript on the fly. A static host has no Vite, so this builds every
 * example, copies the output under `site/dist/games/<name>/`, and rewrites the
 * links to match. The result is a directory you can drop on any static host.
 *
 * Games are built with `--base ./` so their asset URLs are relative and work
 * at whatever depth the host serves them from.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject } from '../packages/project/src/index.js';

const OUT = 'site/dist';
const GAMES = join(OUT, 'games');

const examples = readdirSync('examples', { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join('examples', e.name, 'index.html')))
  .map((e) => e.name);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(GAMES, { recursive: true });

// --- The pages -------------------------------------------------------------
// In a checkout, pages link into the repository: `../examples/tetris/` and
// `../packages/studio/`, one level deeper from `docs/`. Here those become the
// built copies under `games/` and `studio/`.
function relink(html, up) {
  const here = up.slice(3) || './';
  const pattern = new RegExp(`${up.replace(/\./g, '\\.')}examples/([\\w-]+)/`, 'g');
  return html
    .replace(pattern, `${here}games/$1/`)
    .replaceAll(`${up}packages/studio/`, `${here}studio/`);
}

cpSync('site/assets', join(OUT, 'assets'), { recursive: true });
for (const page of ['index.html', 'games.html', 'docs.html']) {
  writeFileSync(join(OUT, page), relink(readFileSync(join('site', page), 'utf8'), '../'));
}
mkdirSync(join(OUT, 'docs'), { recursive: true });
for (const page of readdirSync('site/docs').filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(join('site/docs', page), 'utf8');
  writeFileSync(join(OUT, 'docs', page), relink(html, '../../'));
}

/** Build one Vite project with relative URLs and move its output to `to`. */
function build(dir, to) {
  execFileSync('npx', ['vite', 'build', '--base', './'], { cwd: dir, stdio: 'pipe' });
  cpSync(join(dir, 'dist'), to, { recursive: true });
  rmSync(join(dir, 'dist'), { recursive: true, force: true });
}

// --- The Studio --------------------------------------------------------------
// The builder ships with the site so that making a game needs a browser and
// nothing else -- no clone, no Node, no toolchain.
process.stdout.write(`  ${'studio'.padEnd(20)}`);
try {
  build('packages/studio', join(OUT, 'studio'));
  console.log('ok');
} catch (error) {
  console.log('FAILED');
  console.error(String(error.stderr ?? error).slice(0, 400));
  process.exitCode = 1;
}

// --- The games -------------------------------------------------------------
let built = 0;
for (const name of examples) {
  const dir = join('examples', name);
  process.stdout.write(`  ${name.padEnd(20)}`);

  // A game without a valid project file is not built: the file is what the
  // gallery and the checks know the game by.
  const manifest = join(dir, 'cathode.json');
  const { project, errors } = existsSync(manifest)
    ? parseProject(readFileSync(manifest, 'utf8'))
    : { project: null, errors: ['no cathode.json — see docs/project-format.md'] };
  if (project && project.name !== name) errors.push(`name is "${project.name}" but the folder is "${name}"`);
  if (errors.length) {
    console.log('INVALID');
    for (const error of errors) console.error(`      ${error}`);
    process.exitCode = 1;
    continue;
  }

  try {
    build(dir, join(GAMES, name));
    // Published beside the game, so anything reading the site can tell what
    // each game is without reaching back into the repository.
    cpSync(manifest, join(GAMES, name, 'cathode.json'));
    built++;
    console.log('ok');
  } catch (error) {
    console.log('FAILED');
    console.error(String(error.stderr ?? error).slice(0, 400));
    process.exitCode = 1;
  }
}

console.log(`\n${built}/${examples.length} games built into ${GAMES}/`);
console.log(`Serve ${OUT}/ with any static host.`);
