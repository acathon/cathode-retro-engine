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

const OUT = 'site/dist';
const GAMES = join(OUT, 'games');

const examples = readdirSync('examples', { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join('examples', e.name, 'index.html')))
  .map((e) => e.name);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(GAMES, { recursive: true });

// --- The pages -------------------------------------------------------------
cpSync('site/assets', join(OUT, 'assets'), { recursive: true });
cpSync('site/docs', join(OUT, 'docs'), { recursive: true });
for (const page of ['index.html', 'games.html', 'docs.html']) {
  const html = readFileSync(join('site', page), 'utf8')
    // `../examples/tetris/` becomes `./games/tetris/`, which exists here.
    .replace(/\.\.\/examples\/([\w-]+)\//g, './games/$1/');
  writeFileSync(join(OUT, page), html);
}

// --- The games -------------------------------------------------------------
let built = 0;
for (const name of examples) {
  const dir = join('examples', name);
  process.stdout.write(`  ${name.padEnd(20)}`);
  try {
    execFileSync('npx', ['vite', 'build', '--base', './'], { cwd: dir, stdio: 'pipe' });
    cpSync(join(dir, 'dist'), join(GAMES, name), { recursive: true });
    rmSync(join(dir, 'dist'), { recursive: true, force: true });
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
