/**
 * Shared plumbing for the headless game checks.
 *
 * These drive a real browser against a running dev server, because the thing
 * they are checking — that the game boots, draws, and responds to a d-pad —
 * cannot be asserted from a unit test. They are deliberately not part of `npm
 * test`: they need a browser and a server, and a test suite that needs both
 * is a test suite people stop running.
 *
 *   npm i -D --no-save playwright@1.47.2
 *   cd examples/holdem && npx vite --port 3017 &
 *   node scripts/verify/holdem.mjs --port 3017
 *
 * Chromium comes from PLAYWRIGHT_BROWSERS_PATH; `playwright install` is not
 * needed and will not work behind a proxy.
 */
import { chromium } from 'playwright';

const CHROMIUM = process.env.CATHODE_CHROMIUM
  ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Open the page and wait for the game to publish its test hook.
 *
 * `hook` is the `window.__name` each game exposes; waiting for it rather than
 * for a timeout is what makes these checks stable — the wasm module and the
 * sprite sheets are loaded by the time it appears.
 */
export async function open(hook, { port, width = 1200, height = 1000 } = {}) {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage();
  await page.setViewportSize({ width, height });

  const errors = [];
  const failedRequests = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('requestfailed', (r) => {
    // A missing card sheet is the documented fallback, not a failure.
    if (!r.url().endsWith('playing_cards.png')) failedRequests.push(r.url().slice(-60));
  });

  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction((h) => !!window[h], hook, { timeout: 20000 });
  await page.waitForTimeout(1000);

  return {
    browser,
    page,
    errors,
    failedRequests,
    state: () => page.evaluate((h) => window[h].state(), hook),
    call: (fn, ...args) => page.evaluate(
      ([h, f, a]) => window[h][f](...a), [hook, fn, args],
    ),
    key: async (k, hold = 90) => {
      await page.keyboard.down(k);
      await page.waitForTimeout(hold);
      await page.keyboard.up(k);
      await page.waitForTimeout(140);
    },
    /**
     * How much of the canvas is not its most common colour.
     *
     * Counting distinct colours would call a healthy two-tone Game Boy screen
     * blank; "ink" is the share of pixels that are not the background, which
     * is the thing that actually distinguishes a drawn frame from an empty one.
     */
    ink: () => page.evaluate(() => {
      const c = document.getElementById('game');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const counts = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const total = d.length / 4;
      return {
        size: `${c.width}x${c.height}`,
        colours: counts.size,
        ink: Math.round(((total - Math.max(...counts.values())) / total) * 100),
      };
    }),
  };
}

/** Print a pass/fail line and remember whether anything failed. */
let failures = 0;
export function check(label, ok, detail = '') {
  failures += ok ? 0 : 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(28)} ${detail}`);
}

export function finish(session) {
  const { errors, failedRequests } = session;
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('no failed requests', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '));
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  return failures;
}
