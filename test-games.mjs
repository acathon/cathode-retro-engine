/**
 * Boots every example in a headless browser and reports whether it actually
 * runs: console errors, whether a canvas draws anything, whether it responds
 * to input, and whether the drawing happens in the engine's own canvas.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';

const EXEC = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const BASE_PORT = 4200 + Math.floor(Math.random() * 40) * 20;

const games = readdirSync('examples', { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`examples/${d.name}/package.json`))
  .map((d) => d.name)
  .sort();

const only = process.argv.slice(2);
const list = only.length ? games.filter((g) => only.includes(g)) : games;

function sampleCanvas() {
  const measure = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const counts = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const total = d.length / 4;
    return {
      id: c.id || '(no id)',
      size: `${c.width}x${c.height}`,
      colours: counts.size,
      // Share of the screen that is not one flat colour. A palette-limited
      // game can be fully alive on four colours, so counting colours alone
      // calls healthy Game Boy games blank.
      ink: Math.round(((total - Math.max(...counts.values())) / total) * 100),
    };
  };

  const canvases = [...document.querySelectorAll('canvas')]
    .filter((c) => c.offsetParent !== null && c.width >= 128)
    .map(measure);
  if (!canvases.length) return { ink: 0, engineInk: 0, best: {} };

  const engine = canvases.find((c) => c.id === 'game');
  return {
    ink: Math.max(...canvases.map((c) => c.ink)),
    engineInk: engine ? engine.ink : null,
    best: canvases.reduce((a, b) => (b.ink > a.ink ? b : a)),
  };
}

const browser = await chromium.launch({ executablePath: EXEC });
const results = [];

for (const [i, game] of list.entries()) {
  const port = BASE_PORT + i;
  const server = spawn('npx', ['vite', '--port', String(port), '--strictPort', `examples/${game}`], {
    stdio: 'ignore',
  });

  const page = await browser.newPage();
  const errors = [];
  let ready = false;
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  const row = { game, errors };
  try {
    for (let t = 0; t < 40; t++) {
      try { await page.goto(`http://localhost:${port}/`, { timeout: 1500 }); ready = true; break; }
      catch { await new Promise((r) => setTimeout(r, 400)); }
    }
    if (!ready) throw new Error('dev server never answered');
    await page.waitForSelector('canvas', { timeout: 12000 });
    await page.waitForTimeout(2200);
    row.before = await page.evaluate(sampleCanvas);

    // Hold each key across several frames: an instantaneous press can land
    // entirely between two and be missed.
    for (const key of ['Enter', 'Space', 'z', 'x']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(120);
      await page.keyboard.up(key);
      await page.waitForTimeout(400);
    }
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowRight');
    row.after = await page.evaluate(sampleCanvas);
    row.changed = JSON.stringify(row.before) !== JSON.stringify(row.after);
  } catch (e) {
    row.fatal = String(e).split('\n')[0].slice(0, 140);
  }

  await page.close();
  server.kill('SIGKILL');
  await new Promise((r) => setTimeout(r, 250));
  results.push(row);

  const ink = Math.max(row.before?.ink ?? 0, row.after?.ink ?? 0);
  const engineInk = Math.max(row.before?.engineInk ?? 0, row.after?.engineInk ?? 0);
  const best = row.after?.best ?? row.before?.best ?? {};
  const status = row.fatal ? 'FATAL'
    : errors.length ? 'ERRORS'
    : ink < 2 ? 'BLANK'
    : engineInk < 2 ? 'BYPASS'
    : 'ok';

  console.log(
    `${game.padEnd(18)} ${status.padEnd(7)} ${best.size ?? '-'} ` +
    `${best.colours ?? '-'} colours, ${ink}% ink` +
    `${status === 'BYPASS' ? ` (drawn in #${best.id}, engine canvas empty)` : ''}` +
    `${row.changed ? ' | responds' : row.after ? ' | STATIC' : ''}` +
    `${errors.length ? ` | ${errors.length} console errors` : ''}` +
    `${row.fatal ? ` | ${row.fatal}` : ''}`,
  );
  if (errors.length) console.log(`  └─ ${errors[0]}`);
}

await browser.close();
const bad = results.filter(
  (r) => r.fatal || r.errors.length || Math.max(r.before?.ink ?? 0, r.after?.ink ?? 0) < 2,
);
const bypass = results.filter(
  (r) => !bad.includes(r) && Math.max(r.before?.engineInk ?? 0, r.after?.engineInk ?? 0) < 2,
);
console.log(`\n${results.length - bad.length}/${results.length} healthy`);
if (bad.length) console.log('needs work:', bad.map((r) => r.game).join(', '));
if (bypass.length) console.log('draw outside the engine:', bypass.map((r) => r.game).join(', '));
