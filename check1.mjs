import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const game = process.argv[2];
const port = 6100 + Math.floor(Math.random() * 300);
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort', `examples/${game}`], {
  stdio: 'ignore',
});

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
});
const page = await browser.newPage();
await page.setViewportSize({ width: 900, height: 800 });

const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 180)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 180)); });

for (let t = 0; t < 40; t++) {
  try { await page.goto(`http://localhost:${port}/`, { timeout: 1500 }); break; }
  catch { await new Promise((r) => setTimeout(r, 400)); }
}
await page.waitForSelector('canvas', { timeout: 12000 });
await page.waitForTimeout(2200);

const ink = () => page.evaluate(() =>
  [...document.querySelectorAll('canvas')]
    .filter((c) => c.offsetParent !== null && c.width >= 128)
    .map((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const m = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        m.set(k, (m.get(k) || 0) + 1);
      }
      const tot = d.length / 4;
      return `${c.id || '?'} ${c.width}x${c.height} ${m.size}c ${Math.round((tot - Math.max(...m.values())) / tot * 100)}% ink`;
    }));

console.log('title  ', await ink());
await page.screenshot({ path: `/tmp/port-${game}-title.png` });

for (const key of ['Enter', 'z']) {
  await page.keyboard.down(key);
  await page.waitForTimeout(140);
  await page.keyboard.up(key);
  await page.waitForTimeout(400);
}
await page.waitForTimeout(1600);
console.log('playing', await ink());
await page.screenshot({ path: `/tmp/port-${game}-play.png` });

if (errs.length) console.log('errors:', errs.slice(0, 3));
await browser.close();
server.kill('SIGKILL');
