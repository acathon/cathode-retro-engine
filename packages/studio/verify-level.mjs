import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage();
await page.setViewportSize({ width: 1500, height: 950 });
const errors = [], failed = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 180)); });
page.on('pageerror', e => errors.push(String(e).slice(0, 180)));
page.on('requestfailed', r => failed.push(r.url().slice(-70)));

await page.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__studio, null, { timeout: 20000 });
await page.waitForTimeout(1000);
const S = (fn, ...a) => page.evaluate(([fn, a]) => window.__studio[fn](...a), [fn, a]);

console.log('BOOT      mode', await S('mode'), '| level', JSON.stringify(await S('levelSize')),
  '| tiles', await S('levelTiles'), '| solid', JSON.stringify(await S('levelSolid')));

// The Level tab must exist and render a grid of cells.
await S('showPanel', 'level');
await page.waitForTimeout(500);
const grid = await page.evaluate(() => {
  const g = document.getElementById('level-grid');
  return { cells: g.querySelectorAll('.level-cell').length, solid: g.querySelectorAll('.level-cell.solid').length, spawn: g.querySelectorAll('.level-cell.spawn').length, brushes: document.querySelectorAll('#level-tools .map-brush').length };
});
console.log('PANEL     cells', grid.cells, '| solid-marked', grid.solid, '| spawn markers', grid.spawn, '| brushes', grid.brushes);

// Painting by clicking a cell.
const before = await S('levelTiles');
await page.evaluate(() => {
  const cells = document.querySelectorAll('#level-grid .level-cell');
  // Row 3 of a 32-wide grid, somewhere empty.
  cells[3 * 32 + 5].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
});
await page.waitForTimeout(300);
const after = await S('levelTiles');
console.log('PAINT     tiles', before, '->', after, after > before ? 'PAINTED' : 'NO CHANGE');

// Right-drag erases.
await page.evaluate(() => {
  const cells = document.querySelectorAll('#level-grid .level-cell');
  cells[3 * 32 + 5].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
});
await page.waitForTimeout(300);
console.log('ERASE     tiles ->', await S('levelTiles'), (await S('levelTiles')) === before ? 'ERASED' : 'STILL THERE');

// Resizing keeps what fits.
const tilesBeforeResize = await S('levelTiles');
await S('resizeLevel', 20, 10);
await page.waitForTimeout(300);
console.log('RESIZE    ', JSON.stringify(await S('levelSize')), '| tiles', tilesBeforeResize, '->', await S('levelTiles'));
await S('resizeLevel', 32, 15);
await page.waitForTimeout(300);

// Run it: the painted level must become a real tilemap the physics collides with.
await page.click('#btn-play');
await page.waitForTimeout(2500);
const stage = await page.evaluate(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const m = new Map();
  for (let i = 0; i < d.length; i += 4) { const k = (d[i]<<16)|(d[i+1]<<8)|d[i+2]; m.set(k, (m.get(k)||0)+1); }
  const tot = d.length / 4;
  return { colours: m.size, ink: Math.round((tot - Math.max(...m.values())) / tot * 100) };
});
console.log('RUN       running', await S('isRunning'), '| stage', stage.colours, 'colours,', stage.ink + '% ink',
  stage.ink > 2 ? 'LEVEL RENDERS' : 'BLANK');

console.log('CONSOLE ERRORS:', errors.length ? errors.slice(0, 4) : 'none');
console.log('FAILED REQUESTS:', failed.length ? failed.slice(0, 3) : 'none');
await browser.close();
