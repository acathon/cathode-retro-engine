/**
 * Checks the site: every page renders, and every game link actually starts a
 * game.
 *
 * The "actually starts" half exists because an earlier version of this check
 * only asked whether the link returned 200. It did — the HTML loaded fine.
 * What 404'd was the module inside it, because every example declared its
 * entry as `/src/main.ts`, which only resolves when that example folder is
 * the Vite root. The page came up, the canvas stayed at its default 300x150,
 * and the check was green. Status codes are not evidence that a game runs.
 *
 *   npm i -D --no-save playwright@1.47.2
 *   npx vite --port 3021 &            # from the repository root
 *   node scripts/verify/site.mjs --port 3021
 */
import { readdirSync, existsSync } from 'node:fs';
import { arg, check, finish } from './lib.mjs';
import { chromium } from 'playwright';

const PORT = arg('port', 3021);
const CHROMIUM = process.env.CATHODE_CHROMIUM
  ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const PAGES = ['site/index.html', 'site/games.html', 'site/docs.html',
  'site/docs/getting-started.html', 'site/docs/architecture.html', 'site/docs/tutorial-cards.html'];

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage();
const errors = [];
const failedRequests = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });

const session = { browser, page, errors, failedRequests };

// --- Pages render, and nothing pushes the layout sideways -------------------
const links = new Set();
for (const path of PAGES) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`http://localhost:${PORT}/${path}`, { waitUntil: 'networkidle' });
  const info = await page.evaluate(() => ({
    title: document.title,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    styled: getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)',
    hrefs: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
  }));
  check(path.replace('site/', ''), !info.overflow && info.styled && info.title.length > 0,
    info.overflow ? 'overflows horizontally' : `"${info.title.slice(0, 40)}"`);
  info.hrefs.forEach((h) => {
    if (!/^https?:|^#|^mailto:/.test(h)) links.add(new URL(h, `http://localhost:${PORT}/${path}`).pathname);
  });
}

// --- Every internal link resolves ------------------------------------------
let dead = 0;
for (const path of links) {
  const r = await page.request.get(`http://localhost:${PORT}${path}`);
  if (!r.ok()) { console.log(`      dead: ${path} -> ${r.status()}`); dead++; }
}
check('internal links resolve', dead === 0, `${links.size} checked, ${dead} dead`);

// --- Every game actually boots when reached the way a visitor reaches it ----
const games = readdirSync('examples', { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(`examples/${e.name}/index.html`))
  .map((e) => e.name);

let broken = 0;
for (const game of games) {
  const misses = [];
  const onResponse = (r) => { if (r.status() >= 400) misses.push(`${r.status()} ${new URL(r.url()).pathname}`); };
  page.on('response', onResponse);

  await page.goto(`http://localhost:${PORT}/examples/${game}/`, { waitUntil: 'networkidle' });
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
check('games boot from the site', broken === 0, `${games.length} games, ${broken} broken`);

process.exit(finish(session) ? 1 : 0);
