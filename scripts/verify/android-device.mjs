/**
 * Plays a game's Android test build on Android itself: an emulator in CI, or
 * a phone plugged in with USB debugging on.
 *
 *   cathode export android
 *   node scripts/verify/android-device.mjs out/my-game-0.1.0-debug.apk com.example.mygame
 *
 * Installs and starts the app, then looks inside its WebView through the
 * DevTools socket a test build opens: is the game drawing, does it have the
 * whole screen, are the on-screen controls up, and do they answer a finger on
 * the touchscreen -- `adb input`, the path a real thumb takes, not a scripted
 * event. Leaves a screenshot and the app's log in --out (default: out/).
 *
 * Needs the CLI built (npm run build -w packages/cli), and adb from the
 * Android SDK, found through ANDROID_HOME.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { arg, check, finish } from './lib.mjs';
import { decodePng } from '../../packages/cli/dist/mobile/png.js';

const [apk, id] = process.argv.slice(2);
if (!apk || !id || !fs.existsSync(apk)) {
  console.error('usage: node scripts/verify/android-device.mjs <apk> <application id> [--out dir] [--orientation landscape|portrait|any]');
  process.exit(2);
}
const OUT = arg('out', 'out');
const ORIENTATION = arg('orientation', 'landscape');
const PORT = 9223;
fs.mkdirSync(OUT, { recursive: true });

const ADB = process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb') : 'adb';
const adb = (...args) => {
  const r = spawnSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`adb ${args.join(' ')}: ${r.stderr || r.stdout}`);
  return r.stdout;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `fn` until it returns something truthy, or give up after `seconds`. */
async function waitFor(what, seconds, fn) {
  for (const end = Date.now() + seconds * 1000; Date.now() < end; await sleep(500)) {
    try {
      const value = await fn();
      if (value) return value;
    } catch { /* not yet */ }
  }
  throw new Error(`gave up waiting for ${what} after ${seconds}s`);
}

const errors = [];
let ws;
try {
  adb('wait-for-device');
  console.log(`installing ${path.basename(apk)}`);
  adb('install', '-r', apk);
  adb('logcat', '-c');
  adb('shell', 'monkey', '-p', id, '-c', 'android.intent.category.LAUNCHER', '1');

  const pid = await waitFor('the app to start', 30, () => adb('shell', 'pidof', id).trim().split(/\s+/)[0]);
  const socket = `webview_devtools_remote_${pid}`;
  await waitFor('the WebView to open its DevTools socket', 60, () => adb('shell', 'cat', '/proc/net/unix').includes(socket));
  adb('forward', `tcp:${PORT}`, `localabstract:${socket}`);

  const target = await waitFor('the game page', 60, async () => {
    const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    return pages.find((p) => p.type === 'page' && p.url.startsWith('https://localhost'));
  });
  console.log(`connected to ${target.url}`);

  // The DevTools protocol, by hand: one request at a time is all this needs.
  // Built from the id: through a forwarded socket, the URL the page reports may have no host.
  ws = new WebSocket(`ws://127.0.0.1:${PORT}/devtools/page/${target.id}`);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description?.slice(0, 160) ?? 'exception');
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 160));
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const n = nextId++;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (fn) => {
    const reply = await send('Runtime.evaluate', { expression: `(${fn})()`, returnByValue: true, awaitPromise: true });
    if (reply.result?.exceptionDetails) throw new Error(reply.result.exceptionDetails.text);
    return reply.result?.result?.value;
  };
  await send('Runtime.enable');

  await waitFor('the game to draw', 60, () => evaluate(() => {
    const c = document.querySelector('canvas');
    return !!(c && c.width > 0 && document.querySelector('[data-cathode-overlay] .ct:not([hidden])'));
  }));
  await sleep(2000);

  const page = await evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const counts = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const pad = document.querySelector('[data-cathode-overlay] .pad:not([hidden])')?.getBoundingClientRect();
    return {
      vw: innerWidth, vh: innerHeight, sw: screen.width, sh: screen.height, dpr: devicePixelRatio,
      touch: matchMedia('(pointer: coarse)').matches,
      canvas: { w: Math.round(r.width), h: Math.round(r.height), pixels: `${c.width}x${c.height}` },
      ink: Math.round(((d.length / 4 - Math.max(...counts.values())) / (d.length / 4)) * 100),
      shown: [...document.querySelectorAll('[data-cathode-overlay] .ct')].filter((e) => !e.hidden).map((e) => e.classList[1]),
      pad: pad && { x: pad.left, y: pad.top, w: pad.width, h: pad.height },
      scrolls: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  console.log(JSON.stringify(page));

  check('starts and draws', page.ink > 0, `${page.canvas.pixels} game screen, ${page.ink}% of it drawn`);
  check('knows it is a touch screen', page.touch);
  check('on-screen controls are up', page.shown.length > 0, page.shown.join(' '));
  const [long, short] = [Math.max(page.vw, page.vh), Math.min(page.vw, page.vh)];
  const [screenLong, screenShort] = [Math.max(page.sw, page.sh), Math.min(page.sw, page.sh)];
  check('has the whole screen', long >= screenLong * 0.95 && short >= screenShort * 0.95,
    `page ${page.vw}x${page.vh} of a ${page.sw}x${page.sh} screen`);
  if (ORIENTATION !== 'any') {
    check(`held ${ORIENTATION}`, ORIENTATION === 'landscape' ? page.vw > page.vh : page.vh > page.vw, `${page.vw}x${page.vh}`);
  }
  check('game fills the screen', page.canvas.w >= page.vw * 0.9 || page.canvas.h >= page.vh * 0.9,
    `${page.canvas.w}x${page.canvas.h} on ${page.vw}x${page.vh}`);
  check('does not scroll', !page.scrolls);

  // A finger held on the right arm of the d-pad, through the touchscreen.
  // Near its tip: a display cutout can shift the page right of where its
  // CSS pixels say, and this keeps the press on the arm either way.
  if (page.pad) {
    const x = Math.round((page.pad.x + page.pad.w * 0.92) * page.dpr);
    const y = Math.round((page.pad.y + page.pad.h / 2) * page.dpr);
    const finger = spawn(ADB, ['shell', 'input', 'touchscreen', 'swipe', `${x}`, `${y}`, `${x}`, `${y}`, '2500']);
    const held = await waitFor('the d-pad to light', 8, async () => {
      const lit = await evaluate(() => [...document.querySelectorAll('[data-cathode-overlay] .pad i[data-on]')].map((e) => e.className).join('+'));
      return lit || null;
    }).catch(() => '');
    await new Promise((resolve) => finger.on('exit', resolve));
    await sleep(300);
    const after = await evaluate(() => document.querySelectorAll('[data-cathode-overlay] .pad i[data-on]').length);
    check('d-pad answers a finger', held === 'right' && after === 0, `held "${held}", ${after} still lit after lifting`);
  } else {
    check('d-pad answers a finger', false, 'no d-pad on screen');
  }
} catch (error) {
  check('runs on Android', false, String(error.message ?? error).slice(0, 300));
} finally {
  ws?.close();
  try {
    fs.writeFileSync(path.join(OUT, 'android.png'), spawnSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }).stdout);
    const shot = decodePng(fs.readFileSync(path.join(OUT, 'android.png')));
    console.log(`screenshot ${shot.width}x${shot.height} -> ${path.join(OUT, 'android.png')}`);
  } catch (error) {
    console.log(`no screenshot: ${error.message}`);
  }
  const log = spawnSync(ADB, ['logcat', '-d', '-v', 'brief'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout ?? '';
  fs.writeFileSync(path.join(OUT, 'android-logcat.txt'), log);
  // Capacitor copies the page's console to the log; console.error arrives as an E line.
  for (const line of log.split('\n')) {
    if (/^E\/Capacitor\/Console/.test(line)) errors.push(line.slice(0, 200));
  }
}

const failed = finish({ errors: [...new Set(errors)], failedRequests: [] });
process.exit(failed ? 1 : 0);
