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
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { arg, check, finish } from './lib.mjs';
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
}
check('games boot as published', broken === 0, `${games.length} games, ${broken} broken`);
check('every example is published', games.length >= 16, `${games.length} in ${ROOT}/games/`);

const failed = finish(session);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
