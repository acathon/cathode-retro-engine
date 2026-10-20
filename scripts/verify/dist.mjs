/**
 * Checks the bundle that actually gets published, served the way a host serves
 * it: plain static files, no Vite, under a subdirectory.
 *
 *   npm run build:dist
 *   node scripts/verify/dist.mjs
 *
 * `site.mjs` checks the site as a developer sees it, through the dev server at
 * the repository root. That is not what visitors get. GitHub Pages serves a
 * project site from `/<repo>/`, so every path is one directory deeper than it
 * was locally, and nothing compiles TypeScript on the way out. Both of those
 * have broken this site before: the games once 404'd their own entry module
 * because it was declared as an absolute `/src/main.ts`, and the published
 * index page was a redirect to `../site/games.html`, a path that only exists
 * in a checkout. Neither failure is visible from a dev server.
 *
 * So this serves `site/dist` under a base path from a dumb file server and
 * asks the questions a visitor would: does the page come up, do its links go
 * anywhere, and does the game draw a frame.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { arg, check, finish } from './lib.mjs';
import { parseProject, screenSize } from '../../packages/project/src/index.js';
import { chromium } from 'playwright';

const ROOT = 'site/dist';
const BASE = arg('base', '/cathode-retro-engine');
const PORT = Number(arg('port', 3030));
const CHROMIUM = process.env.CATHODE_CHROMIUM
  ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

if (!existsSync(ROOT)) {
  console.error(`${ROOT} does not exist. Build it first:\n  npm run build:dist`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith(`${BASE}/`) && path !== BASE) {
    res.writeHead(404).end('outside the base path');
    return;
  }
  // normalize collapses any `..`, so a request cannot climb out of site/dist.
  let file = join(ROOT, normalize(path.slice(BASE.length)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, resolve));

const origin = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage();
const errors = [];
const failedRequests = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });

const session = { browser, page, errors, failedRequests };

// --- The pages render at a base path ---------------------------------------
const links = new Set();
for (const name of ['index.html', 'games.html', 'docs.html', 'docs/getting-started.html']) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${origin}${BASE}/${name}`, { waitUntil: 'networkidle' });
  const info = await page.evaluate(() => ({
    title: document.title,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    styled: getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)',
    hrefs: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
  }));
  check(name, !info.overflow && info.styled && info.title.length > 0,
    info.overflow ? 'overflows horizontally' : `"${info.title.slice(0, 40)}"`);
  info.hrefs.forEach((h) => {
    if (!/^https?:|^#|^mailto:/.test(h)) links.add(new URL(h, `${origin}${BASE}/${name}`).pathname);
  });
}

// --- Nothing points outside the published tree ------------------------------
// The old published index.html redirected to `../site/games.html`, which sits
// above the site root and cannot resolve on any host.
const escaping = [...links].filter((p) => !p.startsWith(`${BASE}/`));
check('no links escape the site root', escaping.length === 0, escaping.slice(0, 3).join(', '));

let dead = 0;
for (const path of links) {
  const r = await page.request.get(`${origin}${path}`);
  if (!r.ok()) { console.log(`      dead: ${path} -> ${r.status()}`); dead++; }
}
check('internal links resolve', dead === 0, `${links.size} checked, ${dead} dead`);

// --- Every built game draws a frame ----------------------------------------
const games = readdirSync(join(ROOT, 'games'), { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name);

let broken = 0;
const mismatched = [];
for (const game of games) {
  const misses = [];
  const onResponse = (r) => { if (r.status() >= 400) misses.push(`${r.status()} ${new URL(r.url()).pathname}`); };
  page.on('response', onResponse);

  await page.goto(`${origin}${BASE}/games/${game}/`, { waitUntil: 'networkidle' });
  // A canvas the game never touched keeps the HTML default of 300x150.
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height } : null;
  }).catch(() => null);
  page.off('response', onResponse);

  const booted = canvas && !(canvas.w === 300 && canvas.h === 150);
  if (!booted || misses.length) {
    broken++;
    console.log(`      ${game}: canvas ${canvas ? `${canvas.w}x${canvas.h}` : 'missing'}`
      + (misses.length ? ` | ${misses.slice(0, 2).join(', ')}` : ''));
  }

  // What the project says its screen is, against what the game actually set
  // up. A store listing, a window size and a phone's aspect ratio are all
  // worked out from the declaration, so it has to be true.
  const manifest = join(ROOT, 'games', game, 'cathode.json');
  const { project } = existsSync(manifest) ? parseProject(readFileSync(manifest, 'utf8')) : { project: null };
  const declared = project && screenSize(project);
  if (!declared || !canvas || declared.width !== canvas.w || declared.height !== canvas.h) {
    mismatched.push(`${game}: declares ${declared ? `${declared.width}x${declared.height}` : 'nothing'}, runs at ${canvas ? `${canvas.w}x${canvas.h}` : '?'}`);
  }
}
check('games boot as published', broken === 0, `${games.length} games, ${broken} broken`);
for (const line of mismatched) console.log(`      ${line}`);
check('screens match their cathode.json', mismatched.length === 0, `${games.length - mismatched.length}/${games.length} agree`);
check('every example is published', games.length >= 16, `${games.length} in ${ROOT}/games/`);

// --- The Studio runs a game ------------------------------------------------
// Loading the page proves little. The Studio has three parts that each break
// on their own under a subpath: Blockly, which fetches its icons at run time
// from `./blockly-media/`; the starter program, which has to deserialize into
// blocks; and the engine, whose WebAssembly is only fetched when you press
// play. So press play.
{
  const misses = [];
  const onResponse = (r) => { if (r.status() >= 400) misses.push(`${r.status()} ${new URL(r.url()).pathname}`); };
  page.on('response', onResponse);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}${BASE}/studio/`, { waitUntil: 'networkidle' });

  const editor = await page.evaluate(() => ({
    title: document.title,
    blocks: document.querySelector('.blocklyBlockCanvas')?.children.length ?? 0,
    toolbox: !!document.querySelector('.blocklyToolboxDiv, .blocklyToolbox, .blocklyFlyout'),
  }));
  const opened = editor.title.includes('Studio') && editor.toolbox && editor.blocks > 0;
  check('studio opens', opened, `${editor.blocks} blocks in the starter program`);

  if (opened) {
    await page.click('#btn-play');
    await page.waitForTimeout(2000);
    const game = await page.evaluate(() => {
      const c = document.getElementById('game');
      return { shown: !c.hidden, w: c.width, h: c.height, status: document.getElementById('vp-status')?.textContent };
    });
    check('studio runs its game', game.shown && !(game.w === 300 && game.h === 150),
      `${game.w}x${game.h} · ${game.status}`);
  } else {
    check('studio runs its game', false, 'never opened, so there was nothing to play');
  }

  page.off('response', onResponse);
  check('studio assets resolve', misses.length === 0, misses.slice(0, 3).join(', '));
}

const failed = finish(session);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
