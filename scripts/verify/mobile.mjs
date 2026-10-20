/**
 * Plays every published game on an emulated phone, held both ways.
 *
 *   npm run build:dist
 *   node scripts/verify/mobile.mjs
 *
 * Asks what a player holding a phone would notice: does the game come up,
 * does it fit on the screen without scrolling, does it use the screen, are
 * there controls to press, do those controls respond to a thumb, and are the
 * keyboard instructions out of the way.
 *
 * The thumb is real: touches go through Chrome's DevTools protocol, so the
 * browser produces genuine touch pointer events — the path a phone takes —
 * rather than mouse clicks dressed up as taps.
 *
 * This is Chromium emulating an Android phone. It does not prove anything
 * about Safari on iOS, which only a device or the iOS simulator can.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium, devices } from 'playwright';
import { arg, check, finish } from './lib.mjs';

const ROOT = 'site/dist';
const PORT = Number(arg('port', 3036));
const CHROMIUM = process.env.CATHODE_CHROMIUM
  ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

if (!existsSync(join(ROOT, 'games'))) {
  console.error(`${ROOT}/games does not exist. Build it first:\n  npm run build:dist`);
  process.exit(1);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  let file = join(ROOT, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({ executablePath: CHROMIUM });
const errors = [];
const failedRequests = [];
const games = readdirSync(join(ROOT, 'games')).sort();

for (const phone of ['Pixel 7 landscape', 'Pixel 7']) {
  const context = await browser.newContext({ ...devices[phone] });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  page.on('pageerror', (e) => errors.push(`${phone}: ${String(e).slice(0, 140)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${phone}: ${m.text().slice(0, 140)}`); });

  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
  });

  console.log(`\n${phone} (${devices[phone].viewport.width}x${devices[phone].viewport.height})`);
  const failures = { fit: [], fill: [], controls: [], thumb: [], hints: [], settle: [] };

  for (const game of games) {
    await page.goto(`http://127.0.0.1:${PORT}/games/${game}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    // Settles: the canvas refits when the page around it changes, so make
    // sure that cannot feed itself -- an idle game's size must stop moving.
    const resizes = await page.evaluate(() => new Promise((done) => {
      let n = 0;
      const mo = new MutationObserver(() => n++);
      mo.observe(document.querySelector('canvas'), { attributes: true, attributeFilter: ['style'] });
      setTimeout(() => { mo.disconnect(); done(n); }, 1000);
    }));
    if (resizes > 1) failures.settle.push(`${game} (${resizes} resizes in an idle second)`);

    const layout = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      const overlays = document.querySelectorAll('[data-cathode-overlay]');
      const shown = [...document.querySelectorAll('[data-cathode-overlay] .ct')]
        .filter((el) => !el.hidden).map((el) => el.classList[1]);
      const hints = [...document.querySelectorAll('[data-keyboard-hint]')]
        .filter((el) => getComputedStyle(el).display !== 'none').length;
      // How far down the page's own content reaches: everything in its flow,
      // the canvas included, but not the floating controls.
      let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
      for (const el of document.body.querySelectorAll('*')) {
        if (el.closest('[data-cathode-overlay]') || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
        const pos = getComputedStyle(el).position;
        if (pos === 'fixed' || pos === 'absolute') continue;
        const b = el.getBoundingClientRect();
        if (b.width && b.height) {
          top = Math.min(top, b.top); bottom = Math.max(bottom, b.bottom);
          left = Math.min(left, b.left); right = Math.max(right, b.right);
        }
      }
      return {
        vw: innerWidth, vh: innerHeight, contentH: bottom - top, contentW: right - left,
        scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
        canvas: { w: r.width, h: r.height, top: r.top, left: r.left, bottom: r.bottom, right: r.right },
        overlays: overlays.length, shown, hints,
      };
    });

    // Fits: no scrolling, and the game is entirely on screen.
    const c = layout.canvas;
    if (layout.scrollW > layout.vw + 1 || layout.scrollH > layout.vh + 1 || c.top < -1 || c.left < -1 || c.bottom > layout.vh + 1 || c.right > layout.vw + 1) {
      failures.fit.push(`${game} (page ${layout.scrollW}x${layout.scrollH}, canvas ${Math.round(c.left)},${Math.round(c.top)} ${Math.round(c.w)}x${Math.round(c.h)})`);
    }
    // No wasted screen: either the game takes all the width the page's own
    // side padding leaves it, or the page -- game plus whatever else it shows
    // -- spans the height. How much of the screen the game itself gets
    // depends on how much else the page puts around it, which is the page's
    // design rather than the engine's fitting, so that is reported, not judged.
    const use = Math.max(c.w / layout.vw, c.h / layout.vh);
    const widthLeft = layout.vw - (layout.contentW - c.w);
    // 0.9, not higher: the engine deliberately gives up as much as a tenth of
    // the size for whole device pixels per game pixel (see fitScale).
    if (!(c.w >= widthLeft * 0.9 || layout.contentH >= layout.vh * 0.9)) {
      failures.fill.push(`${game} (game ${Math.round(c.w)}x${Math.round(c.h)}, page content ${Math.round(layout.contentH)}px of ${layout.vh})`);
    }

    // Exactly one set of controls, showing something to press.
    if (layout.overlays !== 1 || layout.shown.length === 0) {
      failures.controls.push(`${game} (${layout.overlays} overlays, showing ${layout.shown.join(' ') || 'nothing'})`);
    }
    if (layout.hints > 0) failures.hints.push(game);

    // A thumb on START (when there is one), then the d-pad: press, roll, let go.
    const start = await page.$('[data-cathode-overlay] .start:not([hidden])');
    if (start) {
      const b = await start.boundingBox();
      await touch('touchStart', b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(120);
      await touch('touchEnd');
      await page.waitForTimeout(400);
    }
    const pad = await page.$('[data-cathode-overlay] .pad:not([hidden])');
    if (pad) {
      const b = await pad.boundingBox();
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      await touch('touchStart', cx + b.width * 0.4, cy);          // right
      await page.waitForTimeout(80);
      const right = await page.$$eval('[data-cathode-overlay] .pad i[data-on]', (els) => els.map((e) => e.className).sort().join('+'));
      await touch('touchMove', cx + b.width * 0.3, cy - b.width * 0.3); // roll to up-right
      await page.waitForTimeout(80);
      const diagonal = await page.$$eval('[data-cathode-overlay] .pad i[data-on]', (els) => els.map((e) => e.className).sort().join('+'));
      await touch('touchEnd');
      await page.waitForTimeout(80);
      const released = await page.$$eval('[data-cathode-overlay] .pad i[data-on]', (els) => els.length);
      if (right !== 'right' || diagonal !== 'right+up' || released !== 0) {
        failures.thumb.push(`${game} (press "${right}", roll "${diagonal}", after release ${released} lit)`);
      }
    }

    const after = await page.$$eval('[data-cathode-overlay] .ct', (els) => els.filter((e) => !e.hidden).map((e) => e.classList[1]));
    console.log(`  ${game.padEnd(17)} ${Math.round(c.w)}x${Math.round(c.h)}  fills ${String(Math.round(use * 100)).padStart(3)}%  controls: ${after.join(' ')}`);
  }

  check(`${phone}: fits, no scrolling`, failures.fit.length === 0, failures.fit.slice(0, 3).join('; '));
  check(`${phone}: no wasted screen`, failures.fill.length === 0, failures.fill.slice(0, 4).join('; '));
  check(`${phone}: one set of controls`, failures.controls.length === 0, failures.controls.slice(0, 3).join('; '));
  check(`${phone}: d-pad follows a thumb`, failures.thumb.length === 0, failures.thumb.slice(0, 3).join('; '));
  check(`${phone}: keyboard hints hidden`, failures.hints.length === 0, failures.hints.join(', '));
  check(`${phone}: size settles`, failures.settle.length === 0, failures.settle.slice(0, 3).join('; '));
  await context.close();
}

const failed = finish({ errors, failedRequests });
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
