/**
 * Fail if the committed web build no longer matches the Rust source.
 *
 *   node scripts/check-wasm-current.mjs
 *
 * `packages/sdk/wasm` is a build artifact that is checked in on purpose, so
 * that cloning the repository and running `npm install` is enough to play and
 * build games -- no Rust toolchain, no wasm-pack, no C++ linker. The price of
 * that is a file which can silently fall behind the code it was generated
 * from: add a method to `crates/platform-web`, forget to rebuild, and the game
 * that calls it fails in the browser with nothing to point at the cause.
 *
 * This rebuilds the package and compares the generated TypeScript declarations
 * -- the engine's whole public surface -- against the committed ones. The
 * binary itself is not compared: two builds of identical source do not produce
 * identical bytes, so that would fail constantly and mean nothing.
 *
 * The rebuild happens in place, so afterwards the working tree holds the fresh
 * build. When this fails, that is exactly what you want to commit.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const DTS = 'packages/sdk/wasm/cathode_platform_web.d.ts';

/** The declarations in a wasm-bindgen `.d.ts`, as a set of normalised lines. */
function surface(source) {
  return new Set(
    source
      .split('\n')
      .map((line) => line.trim().replace(/\s+/g, ' '))
      .filter((line) => line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*'))
  );
}

if (!existsSync(DTS)) {
  console.error(`${DTS} is missing.\n`);
  console.error('The web engine build is committed to this repository. Restore it with:');
  console.error('  git checkout -- packages/sdk/wasm');
  console.error('or rebuild it with:');
  console.error('  npm run build:wasm');
  process.exit(1);
}

const committed = surface(readFileSync(DTS, 'utf8'));

console.log('Rebuilding packages/sdk/wasm from crates/platform-web...');
execFileSync('npm', ['run', 'build:wasm'], { stdio: 'inherit' });

const fresh = surface(readFileSync(DTS, 'utf8'));

const added = [...fresh].filter((line) => !committed.has(line)).sort();
const removed = [...committed].filter((line) => !fresh.has(line)).sort();

if (added.length === 0 && removed.length === 0) {
  console.log(`\nOK: the committed build matches the Rust source (${committed.size} declarations).`);
  process.exit(0);
}

console.error('\nThe committed web build is out of date with crates/platform-web.\n');
for (const line of removed) console.error(`  - ${line}`);
for (const line of added) console.error(`  + ${line}`);
console.error('\nRebuild it and commit the result:');
console.error('  npm run build:wasm');
console.error('  git add packages/sdk/wasm');
process.exit(1);
