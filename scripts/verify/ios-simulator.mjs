/**
 * Plays a game's iOS simulator build in the iOS Simulator, on a Mac.
 *
 *   cathode export ios
 *   node scripts/verify/ios-simulator.mjs out/my-game-0.1.0-simulator.app com.example.mygame
 *
 * This is the check the browser-based ones cannot make: the game running in
 * WebKit, inside a real iOS app. It boots the newest iPhone simulator,
 * installs and starts the app, and reads what the app printed -- Capacitor
 * copies the page's console there -- and a screenshot, which must show a game,
 * not the black of a page whose engine never loaded. Leaves the screenshot and
 * the log in --out (default: out/).
 *
 * Needs the CLI built (npm run build -w packages/cli) and Xcode.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { arg, check, finish } from './lib.mjs';
import { decodePng } from '../../packages/cli/dist/mobile/png.js';

const [app, id] = process.argv.slice(2);
if (!app || !id || !fs.existsSync(app)) {
  console.error('usage: node scripts/verify/ios-simulator.mjs <app> <bundle id> [--out dir]');
  process.exit(2);
}
const OUT = path.resolve(arg('out', 'out'));
fs.mkdirSync(OUT, { recursive: true });

const simctl = (...args) => {
  const r = spawnSync('xcrun', ['simctl', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`simctl ${args.join(' ')}: ${r.stderr || r.stdout}`);
  return r.stdout;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `ready` every half second for up to `seconds`; true if it became true. */
async function waitFor(seconds, ready) {
  for (const end = Date.now() + seconds * 1000; Date.now() < end; await sleep(500)) {
    if (ready()) return true;
  }
  return false;
}

/** The share of a region of the screenshot that isn't its most common colour. */
function ink(image, region) {
  const counts = new Map();
  let total = 0;
  for (let y = region.y; y < region.y + region.h; y += 2) {
    for (let x = region.x; x < region.x + region.w; x += 2) {
      const o = (y * image.width + x) * 4;
      const key = (image.data[o] << 16) | (image.data[o + 1] << 8) | image.data[o + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
  }
  return { ink: Math.round(((total - Math.max(...counts.values())) / total) * 100), colours: counts.size };
}

const errors = [];
const logFile = path.join(OUT, 'ios-app.log');
let appOutput = null;
let log = '';
try {
  // The newest iOS the Simulator has, and its first iPhone.
  const runtimes = JSON.parse(simctl('list', 'devices', 'available', '-j')).devices;
  const device = Object.entries(runtimes)
    .filter(([runtime]) => runtime.includes('iOS'))
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .flatMap(([, devices]) => devices)
    .find((d) => d.name.startsWith('iPhone'));
  if (!device) throw new Error('no iPhone simulator is installed');
  console.log(`booting ${device.name} (${device.udid})`);
  if (device.state !== 'Booted') simctl('boot', device.udid);
  simctl('bootstatus', device.udid, '-b');

  simctl('install', device.udid, app);
  // Capacitor prints with Swift's print(), which only flushes a file or a
  // pipe when its buffer fills -- so the app's output is read through a
  // terminal (--console-pty), where every line arrives as it is printed.
  appOutput = spawn('xcrun', ['simctl', 'launch', '--console-pty', '--terminate-running-process', device.udid, id]);
  appOutput.stdout.on('data', (chunk) => { log += chunk; });
  appOutput.stderr.on('data', (chunk) => { log += chunk; });
  let launchExit = null;
  appOutput.on('exit', (code) => { launchExit = code; });

  // Wait for Capacitor to say the page loaded rather than for a fixed time:
  // the first launch on a simulator that has only just booted can be slow.
  const loaded = await waitFor(90, () => /WebView loaded/.test(log) || launchExit !== null);
  check('the app loaded the game', /WebView loaded/.test(log), 'Capacitor reports the page loaded');
  if (!/WebView loaded/.test(log)) {
    // Why not: did the launch fail, is the app running, did it crash?
    console.log(`launch ${launchExit === null ? 'still attached' : `exited with ${launchExit}`}${loaded ? '' : ' after 90 s'}`);
    console.log(`app output:\n${log.trim().split('\n').slice(0, 20).join('\n') || '(nothing)'}`);
    const running = spawnSync('xcrun', ['simctl', 'spawn', device.udid, 'launchctl', 'list'], { encoding: 'utf8' }).stdout ?? '';
    console.log(`launchctl: ${running.split('\n').filter((l) => l.includes(id)).join(' | ') || `no entry for ${id}`}`);
    const reports = path.join(os.homedir(), 'Library', 'Logs', 'DiagnosticReports');
    const crash = fs.existsSync(reports) && fs.readdirSync(reports).filter((f) => f.startsWith('App')).sort().at(-1);
    if (crash) console.log(`crash report ${crash}:\n${fs.readFileSync(path.join(reports, crash), 'utf8').slice(0, 1500)}`);
  }
  // The engine's WebAssembly and the first frames.
  await sleep(5000);

  const shotFile = path.join(OUT, 'ios.png');
  simctl('io', device.udid, 'screenshot', shotFile);
  const shot = decodePng(fs.readFileSync(shotFile));
  // The middle of the screen: clear of the status bar and home indicator, in either orientation.
  const middle = { x: Math.round(shot.width * 0.2), y: Math.round(shot.height * 0.2), w: Math.round(shot.width * 0.6), h: Math.round(shot.height * 0.6) };
  const drawn = ink(shot, middle);
  console.log(`screenshot ${shot.width}x${shot.height} -> ${shotFile}: ${drawn.ink}% ink, ${drawn.colours} colours in the middle`);
  check('starts and draws', drawn.ink >= 3 && drawn.colours >= 4, `${drawn.ink}% of the middle of the screen drawn, ${drawn.colours} colours`);

  console.log(log.split('\n').filter((l) => l.includes('⚡️')).slice(0, 12).join('\n'));
  for (const line of log.split('\n')) {
    // Capacitor's formats: a page's console.error is "⚡️  [error] - ...",
    // a script that failed at start is a "STARTUP JS ERROR" block.
    if (/⚡️\s+\[error\]|STARTUP JS ERROR|JS Eval error/.test(line)) errors.push(line.trim().slice(0, 200));
  }
} catch (error) {
  check('runs on iOS', false, String(error.message ?? error).slice(0, 300));
} finally {
  appOutput?.kill();
  fs.writeFileSync(logFile, log);
}

const failed = finish({ errors: [...new Set(errors)], failedRequests: [] });
process.exit(failed ? 1 : 0);
