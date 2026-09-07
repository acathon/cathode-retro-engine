/**
 * Fail if package-lock.json only works on the machine that generated it.
 *
 *   node scripts/check-lockfile-portable.mjs
 *
 * Rollup, esbuild and the Tauri CLI ship their native binary as a set of
 * optional dependencies, one per platform, each constrained by `os` and `cpu`.
 * npm is supposed to record all of them and install the one that matches, but
 * a lockfile regenerated while `node_modules` already exists can be written
 * from the installed tree instead of a fresh resolve -- and the installed tree
 * only ever contains the current platform's binary. The other platforms are
 * then simply absent, and npm cannot install what the lockfile does not list.
 *
 * This repository shipped exactly that: a lockfile with two Rollup binaries,
 * both Linux. Every Windows and macOS clone failed on
 *
 *   Error: Cannot find module @rollup/rollup-win32-x64-msvc
 *
 * which npm's own message blames on a bug in npm, sending you to delete your
 * lockfile rather than fix it.
 *
 * The fix is a resolve from scratch, not a re-resolve:
 *
 *   rm -rf node_modules packages/../node_modules examples/../node_modules
 *   rm package-lock.json
 *   npm install
 */
import { readFileSync } from 'node:fs';

const REQUIRED = ['win32', 'darwin', 'linux'];

/**
 * Families this repository's build cannot run without.
 *
 * Checked by name because the general rule below compares a family's variants
 * against each other, and a lockfile that lost every non-host variant leaves
 * one behind with nothing to compare it to -- which is exactly how `@esbuild`,
 * reduced to a lone `linux-x64`, slipped past the first version of this check.
 */
const MUST_BE_PORTABLE = ['@rollup', '@esbuild', '@tauri-apps'];

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

/**
 * Platform-constrained packages, grouped by the family they belong to.
 *
 * The family is the scope (`@rollup`, `@esbuild`) or, unscoped, the package
 * name. A family that ships variants at all should ship them for every desktop
 * platform; a package that is genuinely single-platform has no siblings and is
 * skipped below.
 */
const families = new Map();
for (const [path, meta] of Object.entries(lock.packages ?? {})) {
  if (!path || !Array.isArray(meta.os)) continue;
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const family = name.startsWith('@') ? name.split('/')[0] : name;
  if (!families.has(family)) families.set(family, new Map());
  families.get(family).set(name, meta.os);
}

const broken = [];
for (const [family, members] of families) {
  // A family with one variant and no sibling to compare against is either a
  // genuinely single-platform package (fsevents is darwin-only, and correctly
  // so) or a family stripped down to the host. Only the named ones can tell
  // those apart, so the general rule leaves the rest alone.
  if (members.size < 2 && !MUST_BE_PORTABLE.includes(family)) continue;
  const covered = new Set([...members.values()].flat());
  const missing = REQUIRED.filter((os) => !covered.has(os));
  if (missing.length) broken.push({ family, missing, have: [...covered].sort() });
}

for (const family of MUST_BE_PORTABLE) {
  if (!families.has(family)) {
    broken.push({ family, missing: REQUIRED, have: ['nothing — the family is absent entirely'] });
  }
}

if (broken.length === 0) {
  const total = [...families.values()].reduce((n, m) => n + m.size, 0);
  console.log(`OK: ${total} platform binaries across ${families.size} families, all of ${REQUIRED.join('/')} covered.`);
  process.exit(0);
}

console.error('package-lock.json is not portable -- it only works on some platforms.\n');
for (const { family, missing, have } of broken) {
  console.error(`  ${family}: missing ${missing.join(', ')} (has only ${have.join(', ')})`);
}
console.error('\nA clone on a missing platform fails with "Cannot find module ...".');
console.error('Regenerate the lockfile from a clean slate -- a re-resolve is not enough,');
console.error('npm will copy the platform-specific tree it already has:\n');
console.error('  rm -rf node_modules packages/*/node_modules examples/*/node_modules');
console.error('  rm package-lock.json');
console.error('  npm install');
process.exit(1);
