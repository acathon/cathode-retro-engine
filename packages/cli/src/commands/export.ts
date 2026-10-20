/**
 * `cathode export web|android|ios`: the game, built for where it will run.
 *
 * Android and iOS builds wrap the web build in a native app with Capacitor.
 * The native projects in native/ are generated: everything in them comes from
 * cathode.json, and they are remade whenever that would differ from what is
 * there. Nothing in them is meant to be edited by hand.
 */
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { parseProject, type Project } from '@cathode/project';
import { decodePng, encodePng, type Image } from '../mobile/png.js';
import { adaptiveForeground, hex, iconBackground, placeholderIcon, splashScreen, squareIcon } from '../mobile/icons.js';
import {
  CAPACITOR_VERSION, NATIVE_DIR, type Platform,
  androidAppGradle, androidIconBackground, androidManifest, androidStrings, androidStyles,
  capacitorConfig, iosInfoPlist, iosProject, isPlaceholderId, placeholderId,
} from '../mobile/native.js';
import { GITIGNORE } from './new.js';

export const TARGETS = ['web', 'android', 'ios'] as const;
export type Target = (typeof TARGETS)[number];

export interface ExportOptions {
  /** A store build: an Android App Bundle, or an iOS archive exported for App Store Connect. */
  release?: boolean;
  /** Install and start it on a connected phone or a simulator. */
  run?: boolean;
  /** Open the native project in Android Studio or Xcode afterwards. */
  open?: boolean;
  /** `--no-build`: prepare the native project, but don't compile it. */
  build?: boolean;
}

const WIN = process.platform === 'win32';

function fail(message: string): never {
  console.error(chalk.red(`\n${message}`));
  process.exit(1);
}

const step = (message: string) => console.log(chalk.cyan(`\n▸ ${message}`));
const note = (message: string) => console.log(chalk.yellow(`  ${message}`));

/** Run a program, its output shown as it goes. Fails the export if it fails. */
function run(command: string, args: string[], cwd: string, extra: SpawnSyncOptions = {}): void {
  // npm, npx and gradlew.bat are scripts on Windows, which Node only starts through a shell.
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: WIN, ...extra });
  if (result.error) fail(`Could not start ${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${[command, ...args].join(' ')} failed (exit code ${result.status}).`);
}

/** Run a program quietly and return what it printed, or null if it isn't there. */
function output(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: WIN });
  if (result.error || result.status !== 0) return null;
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

async function loadProject(dir: string): Promise<Project> {
  const file = path.join(dir, 'cathode.json');
  if (!fs.existsSync(file)) {
    fail('There is no cathode.json here. Run this in your game\'s folder — the one `cathode new` made.');
  }
  const { project, errors } = parseProject(await fs.readFile(file, 'utf8'));
  if (!project) fail(`cathode.json needs fixing first:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  return project;
}

/** The web build everything else wraps: dist/, with paths that work from any folder. */
function buildWeb(dir: string): void {
  step('Building the game');
  const pkg = fs.readJsonSync(path.join(dir, 'package.json'), { throws: false }) ?? {};
  if (!fs.existsSync(path.join(dir, 'node_modules'))) run('npm', ['install'], dir);
  if (pkg.scripts?.build) run('npm', ['run', 'build'], dir);
  else run('npx', ['vite', 'build', '--base', './'], dir);
  if (!fs.existsSync(path.join(dir, 'dist', 'index.html'))) fail('The build finished but dist/index.html is missing.');
}

/** Add what `cathode export` makes to .gitignore, for projects made before it did. */
async function ignoreGenerated(dir: string): Promise<void> {
  const file = path.join(dir, '.gitignore');
  if (!fs.existsSync(file)) return;
  const lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/);
  const missing = GITIGNORE.trim().split('\n').filter((entry) => !lines.includes(entry) && !lines.includes(`${entry}/`));
  if (missing.length) await fs.appendFile(file, `${lines.at(-1) === '' ? '' : '\n'}${missing.join('\n')}\n`);
}

/** The game's icon, or a placeholder with a warning. */
async function loadIcon(dir: string, project: Project, release: boolean): Promise<Image> {
  if (!project.icon) {
    if (release) fail('A store build needs an icon. Add one to cathode.json, e.g. "icon": "assets/icon.png" — a square PNG. Pixel art is fine at any size; it is scaled up in whole steps.');
    note('No icon in cathode.json — using a placeholder letter. Add "icon": "assets/icon.png" before you publish.');
    return placeholderIcon(project.title, project.name);
  }
  const file = path.join(dir, project.icon);
  if (!fs.existsSync(file)) fail(`The icon cathode.json names, ${project.icon}, does not exist.`);
  try {
    const icon = decodePng(await fs.readFile(file));
    if (icon.width !== icon.height) note(`${project.icon} is ${icon.width}×${icon.height}; icons are square, so it will be centred with room around it.`);
    return icon;
  } catch (err: any) {
    fail(`${project.icon} can't be read: ${err.message}.`);
  }
}

function storeId(project: Project, release: boolean): string {
  if (project.id && !(release && isPlaceholderId(project.id))) return project.id;
  if (release) {
    fail(`A store build needs your own "id" in cathode.json${project.id ? ` instead of ${project.id}` : ''}. ` +
      'It identifies the game on Google Play and the App Store, and cannot change after the first upload. ' +
      `Reverse a domain or account you control, e.g. "io.github.yourname.${project.name.replace(/-/g, '')}".`);
  }
  return project.id ?? placeholderId(project.name);
}

// --- Capacitor ---------------------------------------------------------------

function capacitor(dir: string, args: string[]): void {
  run(process.execPath, [path.join(dir, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), ...args], dir, { shell: false });
}

/** Capacitor's packages, added to the project the first time it goes native. Returns the version in use. */
function ensureCapacitor(dir: string, platform: Platform): string {
  const packages = ['@capacitor/cli', '@capacitor/core', `@capacitor/${platform}`];
  const missing = packages.filter((p) => !fs.existsSync(path.join(dir, 'node_modules', p, 'package.json')));
  if (missing.length) {
    step(`Adding Capacitor ${CAPACITOR_VERSION} for ${platform} (first time only)`);
    run('npm', ['install', '--save-dev', '--save-exact', ...missing.map((p) => `${p}@${CAPACITOR_VERSION}`)], dir);
  }
  return fs.readJsonSync(path.join(dir, 'node_modules', '@capacitor', platform, 'package.json')).version;
}

/** Make native/<platform> match cathode.json, generating it again when it can't simply be updated. */
async function prepareNative(dir: string, project: Project, id: string, platform: Platform, icon: Image): Promise<string> {
  const version = ensureCapacitor(dir, platform);
  await fs.writeJson(path.join(dir, 'capacitor.config.json'), capacitorConfig(project, id), { spaces: 2 });

  const native = path.join(dir, NATIVE_DIR[platform]);
  const stampFile = path.join(native, '.cathode.json');
  const stamp = { capacitor: version, id };
  const previous = fs.readJsonSync(stampFile, { throws: false });
  // The store ID is baked into Android's source folders, so a new one means a new project.
  if (previous?.capacitor === stamp.capacitor && previous?.id === stamp.id) {
    step(`Updating ${NATIVE_DIR[platform]}`);
    capacitor(dir, ['sync', platform]);
  } else {
    step(`Generating ${NATIVE_DIR[platform]}`);
    await fs.remove(native);
    capacitor(dir, ['add', platform]);
    await fs.writeJson(stampFile, stamp, { spaces: 2 });
  }

  if (platform === 'android') await applyAndroid(native, project, id, icon);
  else await applyIos(native, project, id, icon);
  return native;
}

async function edit(file: string, change: (text: string) => string): Promise<void> {
  const before = await fs.readFile(file, 'utf8');
  const after = change(before);
  if (after !== before) await fs.writeFile(file, after);
}

/** The size of a PNG, from its header. */
function pngSize(file: string): [number, number] {
  const head = fs.readFileSync(file).subarray(16, 24);
  return [head.readUInt32BE(0), head.readUInt32BE(4)];
}

/** Every file called `name` in the folders under `root` whose names pass `folder`. */
function findImages(root: string, folder: (name: string) => boolean, name: (file: string) => boolean): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((d) => folder(d) && fs.statSync(path.join(root, d)).isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(root, d)).filter(name).map((f) => path.join(root, d, f)));
}

async function applyAndroid(native: string, project: Project, id: string, icon: Image): Promise<void> {
  const main = path.join(native, 'app', 'src', 'main');
  const res = path.join(main, 'res');
  await edit(path.join(native, 'app', 'build.gradle'), (t) => androidAppGradle(t, project, id));
  await edit(path.join(res, 'values', 'strings.xml'), (t) => androidStrings(t, project));
  await edit(path.join(main, 'AndroidManifest.xml'), (t) => androidManifest(t, project));
  await edit(path.join(res, 'values', 'styles.xml'), androidStyles);
  await edit(path.join(res, 'values', 'ic_launcher_background.xml'), (t) => androidIconBackground(t, hex(iconBackground(icon))));

  for (const file of findImages(res, (d) => d.startsWith('mipmap-'), (f) => f.startsWith('ic_launcher') && f.endsWith('.png'))) {
    const [size] = pngSize(file);
    const base = path.basename(file, '.png');
    const image = base === 'ic_launcher_foreground' ? adaptiveForeground(icon, size)
      : squareIcon(icon, size, base === 'ic_launcher_round');
    await fs.writeFile(file, encodePng(image));
  }
  for (const file of findImages(res, (d) => d.startsWith('drawable'), (f) => f === 'splash.png')) {
    const [w, h] = pngSize(file);
    await fs.writeFile(file, encodePng(splashScreen(icon, w, h), { alpha: false }));
  }
}

async function applyIos(native: string, project: Project, id: string, icon: Image): Promise<void> {
  const app = path.join(native, 'App');
  await edit(path.join(app, 'App', 'Info.plist'), (t) => iosInfoPlist(t, project));
  await edit(path.join(app, 'App.xcodeproj', 'project.pbxproj'), (t) => iosProject(t, project, id));

  const assets = path.join(app, 'App', 'Assets.xcassets');
  const png = (f: string) => f.endsWith('.png');
  for (const file of findImages(assets, (d) => d === 'AppIcon.appiconset', png)) {
    const [size] = pngSize(file);
    // The App Store refuses an icon with an alpha channel, even an unused one.
    await fs.writeFile(file, encodePng(squareIcon(icon, size), { alpha: false }));
  }
  for (const file of findImages(assets, (d) => d === 'Splash.imageset', png)) {
    const [w, h] = pngSize(file);
    await fs.writeFile(file, encodePng(splashScreen(icon, w, h), { alpha: false }));
  }
}

// --- Android -----------------------------------------------------------------

function androidSdk(): string | null {
  const home = os.homedir();
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(home, 'Library', 'Android', 'sdk'), // Android Studio on macOS
    path.join(home, 'Android', 'Sdk'), // on Linux
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'), // on Windows
  ];
  return candidates.find((c): c is string => !!c && fs.existsSync(c)) ?? null;
}

/** The major version of the Java that Gradle will use, or null if there is none. */
function javaVersion(): number | null {
  const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : 'java';
  const text = output(java, ['-version']);
  const match = text?.match(/version "(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return match[1] === '1' ? Number(match[2]) : Number(match[1]);
}

function buildAndroid(dir: string, native: string, project: Project, options: ExportOptions): string {
  const sdk = androidSdk();
  if (!sdk) {
    fail('Building for Android needs the Android SDK. Install Android Studio, which includes it, ' +
      `or set ANDROID_HOME to where the SDK is. The project is ready in ${NATIVE_DIR.android}.`);
  }
  const java = javaVersion();
  if (java === null || java < 21) {
    fail(`Building for Android needs Java 21 or later${java ? ` (found Java ${java})` : ''}. ` +
      'Android Studio includes one: set JAVA_HOME to its jbr folder, or install a JDK 21.');
  }
  // Gradle finds the SDK through this file even where ANDROID_HOME isn't set.
  fs.writeFileSync(path.join(native, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (options.release) {
    const missing = ['CATHODE_KEYSTORE', 'CATHODE_KEYSTORE_PASSWORD', 'CATHODE_KEY_ALIAS'].filter((v) => !process.env[v]);
    if (missing.length) {
      fail(`A store build is signed with your upload key. Set ${missing.join(', ')} — see docs/shipping.md for making a key.`);
    }
    const keystore = path.resolve(dir, process.env.CATHODE_KEYSTORE!);
    if (!fs.existsSync(keystore)) fail(`CATHODE_KEYSTORE names ${keystore}, which does not exist.`);
    env.CATHODE_KEYSTORE = keystore;
  } else {
    // The project only signs release builds when this is set; keep it out of test builds.
    delete env.CATHODE_KEYSTORE;
  }

  step(options.release ? 'Building the Android App Bundle for Google Play' : 'Building a test APK');
  const gradlew = path.join(native, WIN ? 'gradlew.bat' : 'gradlew');
  if (!WIN) fs.chmodSync(gradlew, 0o755);
  run(gradlew, [options.release ? 'bundleRelease' : 'assembleDebug', '--console=plain'], native, { env });

  const built = options.release
    ? path.join(native, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')
    : path.join(native, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const out = path.join(dir, 'out', `${project.name}-${project.version}${options.release ? '.aab' : '-debug.apk'}`);
  fs.ensureDirSync(path.dirname(out));
  fs.copyFileSync(built, out);
  return out;
}

function runAndroid(apk: string, id: string): void {
  const sdk = androidSdk()!;
  const adb = path.join(sdk, 'platform-tools', WIN ? 'adb.exe' : 'adb');
  const devices = output(adb, ['devices'])?.split('\n').slice(1).filter((l) => /\sdevice$/.test(l.trim())) ?? [];
  if (!devices.length) fail('No Android phone or emulator is connected. Plug one in with USB debugging on, or start an emulator in Android Studio.');
  step('Installing and starting it');
  run(adb, ['install', '-r', apk], path.dirname(apk), { shell: false });
  run(adb, ['shell', 'monkey', '-p', id, '-c', 'android.intent.category.LAUNCHER', '1'], path.dirname(apk), { shell: false, stdio: 'ignore' });
}

// --- iOS ---------------------------------------------------------------------

function requireXcode(): void {
  if (process.platform !== 'darwin') {
    fail('Building for iOS needs a Mac with Xcode. The Xcode project is ready in native/ios: ' +
      'build it on a Mac, or have GitHub build it for you — see docs/shipping.md.');
  }
  const version = output('xcodebuild', ['-version'])?.match(/Xcode (\d+)/);
  if (!version) fail('Building for iOS needs Xcode, from the Mac App Store. If it is installed, run: sudo xcode-select -s /Applications/Xcode.app');
  if (Number(version[1]) < 26) fail(`Building for iOS needs Xcode 26 or later; this Mac has Xcode ${version[1]}. The App Store accepts nothing older.`);
}

/** xcodebuild's App Store Connect API key arguments, when they are set. */
function appStoreKey(): string[] {
  const { CATHODE_ASC_KEY, CATHODE_ASC_KEY_ID, CATHODE_ASC_ISSUER } = process.env;
  if (!CATHODE_ASC_KEY || !CATHODE_ASC_KEY_ID || !CATHODE_ASC_ISSUER) return [];
  return ['-authenticationKeyPath', path.resolve(CATHODE_ASC_KEY), '-authenticationKeyID', CATHODE_ASC_KEY_ID, '-authenticationKeyIssuerID', CATHODE_ASC_ISSUER];
}

function buildIos(dir: string, native: string, project: Project, options: ExportOptions): string {
  requireXcode();
  const xcodeProject = path.join(native, 'App', 'App.xcodeproj');
  const derived = path.join(native, 'build');
  const out = path.join(dir, 'out');
  fs.ensureDirSync(out);

  if (!options.release) {
    step('Building for the iOS Simulator');
    run('xcodebuild', [
      '-project', xcodeProject, '-scheme', 'App', '-configuration', 'Debug',
      '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', derived,
      'CODE_SIGNING_ALLOWED=NO', 'build',
    ], dir, { shell: false });
    const app = path.join(out, `${project.name}-${project.version}-simulator.app`);
    fs.removeSync(app);
    fs.copySync(path.join(derived, 'Build', 'Products', 'Debug-iphonesimulator', 'App.app'), app);
    return app;
  }

  const team = process.env.CATHODE_APPLE_TEAM;
  if (!team) fail('A store build is signed by your Apple developer team. Set CATHODE_APPLE_TEAM to its 10-character Team ID — see docs/shipping.md.');
  const archive = path.join(derived, `${project.name}.xcarchive`);
  step('Archiving for the App Store');
  run('xcodebuild', [
    '-project', xcodeProject, '-scheme', 'App', '-configuration', 'Release',
    '-destination', 'generic/platform=iOS', '-archivePath', archive,
    `DEVELOPMENT_TEAM=${team}`, 'CODE_SIGN_STYLE=Automatic', '-allowProvisioningUpdates', ...appStoreKey(), 'archive',
  ], dir, { shell: false });

  const exportOptions = path.join(derived, 'ExportOptions.plist');
  fs.writeFileSync(exportOptions, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>teamID</key>
	<string>${team}</string>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>destination</key>
	<string>export</string>
</dict>
</plist>
`);
  step('Exporting the .ipa');
  const exported = path.join(derived, 'export');
  fs.removeSync(exported);
  run('xcodebuild', [
    '-exportArchive', '-archivePath', archive, '-exportPath', exported,
    '-exportOptionsPlist', exportOptions, '-allowProvisioningUpdates', ...appStoreKey(),
  ], dir, { shell: false });
  const ipa = fs.readdirSync(exported).find((f) => f.endsWith('.ipa'));
  if (!ipa) fail(`Xcode exported no .ipa into ${exported}.`);
  const target = path.join(out, `${project.name}-${project.version}.ipa`);
  fs.copyFileSync(path.join(exported, ipa), target);
  return target;
}

function runIos(app: string, id: string): void {
  const list = (filter: string) => JSON.parse(output('xcrun', ['simctl', 'list', 'devices', filter, '-j']) ?? '{"devices":{}}')
    .devices as Record<string, { udid: string; name: string; state: string }[]>;
  let device = Object.values(list('booted')).flat()[0];
  if (!device) {
    // The newest iOS runtime's first iPhone.
    const runtimes = Object.entries(list('available')).filter(([runtime]) => runtime.includes('iOS')).sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }));
    device = runtimes.flatMap(([, devices]) => devices).find((d) => d.name.startsWith('iPhone'))!;
    if (!device) fail('There is no iPhone simulator. Add one in Xcode: Window → Devices and Simulators.');
    step(`Starting the ${device.name} simulator`);
    run('xcrun', ['simctl', 'boot', device.udid], path.dirname(app), { shell: false });
    spawnSync('open', ['-a', 'Simulator']);
  }
  step('Installing and starting it');
  run('xcrun', ['simctl', 'install', device.udid, app], path.dirname(app), { shell: false });
  run('xcrun', ['simctl', 'launch', device.udid, id], path.dirname(app), { shell: false });
}

// --- the command -------------------------------------------------------------

const size = (file: string) => {
  const bytes = fs.statSync(file).isDirectory()
    ? fs.readdirSync(file, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).reduce((n, e) => n + fs.statSync(path.join(e.parentPath, e.name)).size, 0)
    : fs.statSync(file).size;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default async function exportCommand(target: string, options: ExportOptions = {}): Promise<void> {
  if (!TARGETS.includes(target as Target)) {
    fail(`Unknown target "${target}". Cathode exports to: ${TARGETS.join(', ')}.`);
  }
  const dir = process.cwd();
  const project = await loadProject(dir);
  const release = !!options.release;
  if (options.run && release) fail('--run installs a test build. Leave out --release to run it, or upload the store build to TestFlight or Google Play\'s internal testing.');

  if (target === 'web') {
    buildWeb(dir);
    console.log(chalk.green(`\n✔ dist/ is the game. Upload the folder to any web host — it works from a subfolder too.`));
    return;
  }

  const platform = target as Platform;
  const id = storeId(project, release);
  if (!project.id) note(`No id in cathode.json — using ${id} for this test build.`);
  else if (isPlaceholderId(id)) note(`${id} is fine for testing. Google Play refuses com.example — set your own id before a store build.`);
  const icon = await loadIcon(dir, project, release);

  await ignoreGenerated(dir);
  buildWeb(dir);
  const native = await prepareNative(dir, project, id, platform, icon);

  if (options.build === false) {
    console.log(chalk.green(`\n✔ ${NATIVE_DIR[platform]} is ready.`));
  } else {
    const built = platform === 'android'
      ? buildAndroid(dir, native, project, options)
      : buildIos(dir, native, project, options);
    console.log(chalk.green(`\n✔ ${path.relative(dir, built)} (${size(built)})`));
    if (release) {
      console.log(platform === 'android'
        ? '  Upload it in the Google Play Console. Each upload needs a higher version in cathode.json.'
        : '  Upload it with Transporter, or xcrun altool. Each upload needs a higher version in cathode.json.');
    }
    if (options.run) {
      if (platform === 'android') runAndroid(built, id);
      else runIos(built, id);
    }
  }
  if (options.open) capacitor(dir, ['open', platform]);
}
