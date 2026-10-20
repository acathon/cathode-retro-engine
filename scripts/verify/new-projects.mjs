/**
 * Checks that `cathode new` makes games that work, for every template.
 *
 *   npm i -D --no-save playwright@1.47.2
 *   node scripts/verify/new-projects.mjs
 *
 * Each project is created outside the repository, so the workspace cannot
 * quietly supply anything the project failed to bring with it. Then it is
 * installed, typechecked, built, and played from a subfolder, the way it
 * would be served from itch.io or a project page.
 *
 * Every stage here has caught something. Projects used to depend on an npm
 * package that was never published, so none of them installed. One template
 * crashed on start. Another booted cleanly with platforms the player fell
 * straight through. A check that stops at "it builds" passes all of those.
 *
 * The unit tests in packages/cli cover the files a project is made of, and
 * typecheck each template offline; this covers what happens when someone
 * actually uses one.
 */
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { arg, check, finish } from './lib.mjs';
import { parseProject, screenSize } from '../../packages/project/src/index.js';

const PORT = Number(arg('port', 3035));
const CHROMIUM = process.env.CATHODE_CHROMIUM
  ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

execFileSync(NPM, ['run', 'build:cli'], { stdio: 'pipe' });
const CLI = join(process.cwd(), 'packages/cli/dist/index.js');
const { TEMPLATE_NAMES } = await import('../../packages/cli/dist/commands/new.js');

const work = mkdtempSync(join(tmpdir(), 'cathode-new-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });

// --- Make, install, typecheck and build each one ---------------------------
const built = [];
for (const template of TEMPLATE_NAMES) {
  const name = `game-${template}`;
  const dir = join(work, name);
  let stage = 'create';
  try {
    run(process.execPath, [CLI, 'new', name, '--template', template], work);
    stage = 'install';
    run(NPM, ['install', '--no-audit', '--no-fund'], dir);
    stage = 'typecheck';
    run(NPM, ['run', 'typecheck'], dir);
    stage = 'build';
    run(NPM, ['run', 'build'], dir);
    built.push(template);
    check(`${template}: made and built`, true, 'install, typecheck, build');
  } catch (error) {
    const detail = String(error.stdout || '') + String(error.stderr || '');
    check(`${template}: made and built`, false, `failed at ${stage}: ${detail.trim().split('\n').slice(-2).join(' / ')}`);
  }
}

// --- Play each one ---------------------------------------------------------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png' };
const server = createServer((req, res) => {
  let file = join(work, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage();
const errors = [];
const failedRequests = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${new URL(r.url()).pathname}`); });

for (const template of built) {
  const name = `game-${template}`;
  const before = errors.length;
  await page.goto(`http://127.0.0.1:${PORT}/${name}/dist/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
  const { project } = parseProject(readFileSync(join(work, name, 'cathode.json'), 'utf8'));
  const want = screenSize(project);
  const ok = canvas && canvas.w === want.width && canvas.h === want.height && errors.length === before;
  check(`${template}: runs`, ok, canvas
    ? `${canvas.w}x${canvas.h}, declares ${want.width}x${want.height}${errors.length > before ? ` | ${errors[before]}` : ''}`
    : 'no canvas');
}

const failed = finish({ errors, failedRequests });
await browser.close();
server.close();
rmSync(work, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
