import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import type { Project } from '@cathode/project';
import { decodePng, encodePng, type Image } from '../src/mobile/png.js';
import { blank, fit, isOpaque } from '../src/mobile/image.js';
import { adaptiveForeground, iconBackground, placeholderIcon, splashScreen, squareIcon } from '../src/mobile/icons.js';
import {
  androidAppGradle, androidIconBackground, androidManifest, androidStrings, androidStyles,
  capacitorConfig, iosInfoPlist, iosProject, placeholderId, versionCode,
} from '../src/mobile/native.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/capacitor-8.5.3/', import.meta.url));
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const pixel = (img: Image, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

/** A PNG of any colour type and depth, written by hand, to read back. */
function rawPng(width: number, height: number, type: number, depth: number, rows: number[][], extra: [string, number[]][] = []) {
  const chunk = (name: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length);
    head.write(name, 4, 'latin1');
    return Buffer.concat([head, body, Buffer.alloc(4)]); // the reader does not check CRCs
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = depth;
  ihdr[9] = type;
  const data = Buffer.concat(rows.map((r) => Buffer.from([0, ...r])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...extra.map(([name, body]) => chunk(name, Buffer.from(body))),
    chunk('IDAT', deflateSync(data)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('PNG', () => {
  it('reads back exactly what it wrote, with and without alpha', () => {
    const img = blank(5, 3);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 37) % 256;
    expect(Buffer.from(decodePng(encodePng(img)).data)).toEqual(Buffer.from(img.data));

    const opaque = blank(4, 4, [10, 200, 30]);
    const back = decodePng(encodePng(opaque, { alpha: false }));
    expect(pixel(back, 3, 3)).toEqual([10, 200, 30, 255]);
  });

  it('writes the colour type asked for: RGB when there must be no alpha channel', () => {
    expect(encodePng(blank(2, 2, [1, 2, 3]), { alpha: false })[25]).toBe(2);
    expect(encodePng(blank(2, 2))[25]).toBe(6);
  });

  it('reads palette images with transparency, the usual format for pixel art', () => {
    // 2 bits per pixel: indices 0..3, index 0 transparent.
    const png = rawPng(4, 1, 3, 2, [[0b00011011]], [
      ['PLTE', [0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]],
      ['tRNS', [0]],
    ]);
    const img = decodePng(png);
    expect(pixel(img, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(img, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(img, 3, 0)).toEqual([0, 0, 255, 255]);
  });

  it('reads grey, grey with alpha, and 16-bit images', () => {
    expect(pixel(decodePng(rawPng(1, 1, 0, 8, [[128]])), 0, 0)).toEqual([128, 128, 128, 255]);
    expect(pixel(decodePng(rawPng(1, 1, 4, 8, [[50, 7]])), 0, 0)).toEqual([50, 50, 50, 7]);
    expect(pixel(decodePng(rawPng(1, 1, 2, 16, [[0xff, 0x00, 0x80, 0x00, 0x00, 0xff]])), 0, 0)).toEqual([255, 128, 0, 255]);
    expect(pixel(decodePng(rawPng(2, 1, 0, 1, [[0b10000000]])), 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('honours a colour key on RGB images', () => {
    const png = rawPng(2, 1, 2, 8, [[1, 2, 3, 9, 9, 9]], [['tRNS', [0, 1, 0, 2, 0, 3]]]);
    const img = decodePng(png);
    expect(pixel(img, 0, 0)[3]).toBe(0);
    expect(pixel(img, 1, 0)[3]).toBe(255);
  });

  it('says what is wrong with a file it cannot read', () => {
    expect(() => decodePng(Buffer.from('GIF89a'))).toThrow('not a PNG');
    const interlaced = rawPng(1, 1, 0, 8, [[0]]);
    interlaced[8 + 8 + 12] = 1;
    expect(() => decodePng(interlaced)).toThrow('interlac');
  });
});

describe('fitting an icon', () => {
  it('grows pixel art by whole numbers only, so every pixel stays square', () => {
    const sprite = blank(16, 16, [255, 0, 0]);
    const big = fit(sprite, 100); // 6.25x would blur; 6x is crisp
    expect([big.width, big.height]).toEqual([96, 96]);
  });

  it('can instead fill the box exactly, for artwork that must reach its edges', () => {
    const art = blank(640, 640, [0, 0, 255]);
    expect(fit(art, 1024, false).width).toBe(1024);
    expect(fit(art, 1024).width).toBe(640);
  });

  it('shrinks large artwork smoothly to fit', () => {
    const art = blank(1000, 500, [0, 0, 255]);
    const small = fit(art, 100);
    expect([small.width, small.height]).toEqual([100, 50]);
    expect(pixel(small, 50, 25)).toEqual([0, 0, 255, 255]);
  });
});

describe('icons', () => {
  const sprite = () => {
    const img = blank(8, 8); // transparent, with a red middle
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) img.data.set([255, 0, 0, 255], (y * 8 + x) * 4);
    return img;
  };

  it('never has transparency in the App Store icon', () => {
    for (const icon of [sprite(), blank(32, 32, [0, 128, 0])]) {
      const out = squareIcon(icon, 1024);
      expect([out.width, out.height]).toEqual([1024, 1024]);
      expect(isOpaque(out)).toBe(true);
    }
  });

  it('sets a sprite on black with room around it', () => {
    const out = squareIcon(sprite(), 1024);
    expect(iconBackground(sprite())).toEqual([0, 0, 0]);
    expect(pixel(out, 5, 5)).toEqual([0, 0, 0, 255]);
    expect(pixel(out, 512, 512)).toEqual([255, 0, 0, 255]);
  });

  it('lets full artwork fill the icon edge to edge, at any size', () => {
    const art = blank(640, 640, [0, 128, 0]);
    art.data.set([255, 255, 255, 255], 0); // a marked corner
    const out = squareIcon(art, 1024);
    expect(pixel(out, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(out, 1023, 1023)).toEqual([0, 128, 0, 255]);
  });

  it('cuts the round icon to a circle', () => {
    const out = squareIcon(blank(16, 16, [9, 9, 9]), 48, true);
    expect(pixel(out, 0, 0)[3]).toBe(0);
    expect(pixel(out, 24, 24)[3]).toBe(255);
  });

  it('keeps an adaptive foreground inside the part every launcher shows', () => {
    const out = adaptiveForeground(sprite(), 432);
    const visible = (432 * 72) / 108;
    const margin = (432 - visible) / 2;
    for (let y = 0; y < 432; y++) {
      for (let x = 0; x < 432; x++) {
        if (out.data[(y * 432 + x) * 4 + 3] === 0) continue;
        expect(x >= margin && x < 432 - margin && y >= margin && y < 432 - margin).toBe(true);
      }
    }
  });

  it('centres the icon on a black launch screen of any shape', () => {
    const out = splashScreen(sprite(), 1920, 1280);
    expect([out.width, out.height]).toEqual([1920, 1280]);
    expect(pixel(out, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixel(out, 960, 640)).toEqual([255, 0, 0, 255]);
    expect(isOpaque(out)).toBe(true);
  });

  it('gives a game without an icon a placeholder that tells games apart', () => {
    const a = placeholderIcon('Rocket Rush', 'rocket-rush');
    const b = placeholderIcon('Moon Miner', 'moon-miner');
    expect([a.width, a.height]).toEqual([16, 16]);
    expect(isOpaque(a)).toBe(true);
    expect(pixel(a, 0, 0)).not.toEqual(pixel(b, 0, 0));
    // The letter is drawn in white.
    expect(Array.from(a.data).some((v, i) => i % 4 === 0 && v === 255 && a.data[i + 1] === 255)).toBe(true);
  });
});

const project: Project = {
  format: 1,
  name: 'rocket-rush',
  title: "Rocket Rush: Bob's \"Revenge\" & <More>",
  version: '1.2.3',
  id: 'io.github.someone.rocketrush',
  screen: { profile: 'nes' },
  orientation: 'portrait',
  input: ['keyboard', 'touch'],
};
const ID = project.id!;

describe('store versions', () => {
  it('turns 1.2.3 into a build number that rises with every version', () => {
    expect(versionCode('1.2.3')).toBe(1_002_003);
    expect(versionCode('0.1.0')).toBe(1_000);
    expect(versionCode('1.10.0')).toBeGreaterThan(versionCode('1.9.999'));
    expect(versionCode('2.0.0')).toBeGreaterThan(versionCode('1.999.999'));
  });

  it('makes a placeholder ID both stores would parse, even for a name starting with a digit', () => {
    expect(placeholderId('rocket-rush')).toBe('com.example.rocketrush');
    expect(placeholderId('2048-clone')).toBe('com.example.g2048clone');
  });
});

describe('the Android project', () => {
  it('takes its store ID and version from cathode.json', () => {
    const out = androidAppGradle(fixture('build.gradle'), project, ID);
    expect(out).toContain(`applicationId "${ID}"`);
    expect(out).toContain('versionCode 1002003');
    expect(out).toContain('versionName "1.2.3"');
    expect(out).not.toContain('com.example.probegame"\n        minSdk');
  });

  it('signs release builds from the environment, never from a password in the file', () => {
    const out = androidAppGradle(fixture('build.gradle'), project, ID);
    expect(out).toContain("System.getenv('CATHODE_KEYSTORE')");
    expect(out).not.toMatch(/storePassword\s+["']/);
  });

  it('names the app with the title, escaped the way Android resources need', () => {
    const out = androidStrings(fixture('strings.xml'), project);
    expect(out).toContain(`<string name="app_name">Rocket Rush: Bob\\'s \\"Revenge\\" &amp; &lt;More&gt;</string>`);
    expect(out).toContain('<string name="title_activity_main">Rocket Rush');
  });

  it.each([
    ['portrait', 'android:screenOrientation="sensorPortrait"'],
    ['landscape', 'android:screenOrientation="sensorLandscape"'],
  ] as const)('holds a %s game the right way, either way up', (orientation, expected) => {
    const out = androidManifest(fixture('AndroidManifest.xml'), { ...project, orientation });
    expect(out).toContain(expected);
    expect(out.match(/screenOrientation/g)).toHaveLength(1);
  });

  it('lets a game for any orientation turn freely', () => {
    const locked = androidManifest(fixture('AndroidManifest.xml'), project);
    expect(androidManifest(locked, { ...project, orientation: 'any' })).not.toContain('screenOrientation');
  });

  it('shows black, not white, before the game draws', () => {
    const out = androidStyles(fixture('styles.xml'));
    expect(out).toMatch(/NoActionBarLaunch[^]*windowSplashScreenBackground">#000000</);
    expect(out).toMatch(/"AppTheme.NoActionBar"[^]*android:windowBackground">@android:color\/black</);
  });

  it('sets the colour behind the adaptive icon', () => {
    expect(androidIconBackground(fixture('ic_launcher_background.xml'), '#123456')).toContain('>#123456<');
  });
});

describe('the iOS project', () => {
  it('takes its bundle ID and versions from cathode.json, in every configuration', () => {
    const out = iosProject(fixture('project.pbxproj'), project, ID);
    expect(out.match(/PRODUCT_BUNDLE_IDENTIFIER = io\.github\.someone\.rocketrush;/g)).toHaveLength(2);
    expect(out.match(/MARKETING_VERSION = 1\.2\.3;/g)).toHaveLength(2);
    expect(out.match(/CURRENT_PROJECT_VERSION = 1002003;/g)).toHaveLength(2);
    expect(out).not.toContain('probegame');
  });

  it('names the app, hides the status bar, and holds the phone the right way', () => {
    const out = iosInfoPlist(fixture('Info.plist'), project);
    expect(out).toContain('<string>Rocket Rush: Bob\'s "Revenge" &amp; &lt;More&gt;</string>');
    expect(out).toMatch(/<key>UIStatusBarHidden<\/key>\s*<true\/>/);
    const phone = out.match(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>([^]*?)<\/array>/)![1];
    expect(phone.match(/<string>/g)).toHaveLength(1);
    expect(phone).toContain('UIInterfaceOrientationPortrait');
    const pad = out.match(/<key>UISupportedInterfaceOrientations~ipad<\/key>\s*<array>([^]*?)<\/array>/)![1];
    expect(pad.match(/<string>/g)).toHaveLength(4);
  });

  it('is still a property list Xcode can read', () => {
    const out = iosInfoPlist(fixture('Info.plist'), project);
    expect(out.trimEnd().endsWith('</dict>\n</plist>')).toBe(true);
    expect(out.match(/<key>/g)!.length).toBe(fixture('Info.plist').match(/<key>/g)!.length + 1);
  });
});

describe('applying cathode.json twice', () => {
  it.each([
    ['build.gradle', (t: string) => androidAppGradle(t, project, ID)],
    ['strings.xml', (t: string) => androidStrings(t, project)],
    ['AndroidManifest.xml', (t: string) => androidManifest(t, project)],
    ['styles.xml', androidStyles],
    ['Info.plist', (t: string) => iosInfoPlist(t, project)],
    ['project.pbxproj', (t: string) => iosProject(t, project, ID)],
  ])('changes nothing the second time: %s', (file, apply) => {
    const once = apply(fixture(file));
    expect(apply(once)).toBe(once);
  });
});

describe('capacitor.config.json', () => {
  it('keeps the native projects in native/ and the game full screen', () => {
    const config = capacitorConfig(project, ID) as Record<string, any>;
    expect(config.appId).toBe(ID);
    expect(config.appName).toBe(project.title);
    expect(config.webDir).toBe('dist');
    expect(config.android.path).toBe('native/android');
    expect(config.ios.path).toBe('native/ios');
    expect(config.plugins.SystemBars.hidden).toBe(true);
    // Not "css": it injects a script that can run before the page exists.
    expect(config.plugins.SystemBars.insetsHandling).toBe('native');
  });
});
