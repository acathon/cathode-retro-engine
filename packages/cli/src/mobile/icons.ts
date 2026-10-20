/**
 * A game's app icon and splash screen, in every shape the two stores want,
 * made from the one `icon` in its cathode.json.
 *
 * Two kinds of icon come in. Full artwork with no transparency fills each
 * shape edge to edge. A sprite on a transparent background is set on black,
 * with room around it, so a launcher's mask doesn't clip it.
 */
import type { Image } from './png.js';
import { blank, cropCircle, drawCentred, fit, isOpaque, type RGB } from './image.js';

const BLACK: RGB = [0, 0, 0];

/**
 * The icon at the size of its place. A sprite grows by whole steps, the black
 * around it hiding the remainder; full artwork must reach the edges, so it
 * fills its place exactly.
 */
const sized = (icon: Image, box: number) => fit(icon, box, !isOpaque(icon));

/** What shows behind and around the icon: its own corner colour if it has no transparency, else black. */
export function iconBackground(icon: Image): RGB {
  return isOpaque(icon) ? [icon.data[0], icon.data[1], icon.data[2]] : BLACK;
}

/**
 * A square icon with no transparency: the iOS App Store icon, and Android's
 * pre-8.0 launcher icon. `round` cuts it to a circle (Android's round icon).
 */
export function squareIcon(icon: Image, size: number, round = false): Image {
  const share = isOpaque(icon) ? 1 : round ? 0.6 : 0.8;
  const out = drawCentred(blank(size, size, iconBackground(icon)), sized(icon, Math.floor(size * share)));
  return round ? cropCircle(out) : out;
}

/**
 * The foreground of an Android adaptive icon. Launchers show only the middle
 * two thirds (72 of 108dp) and may cut that to a circle, so full artwork fills
 * the visible part and a sprite stays well inside it.
 */
export function adaptiveForeground(icon: Image, size: number): Image {
  const share = isOpaque(icon) ? 72 / 108 : 0.5;
  return drawCentred(blank(size, size), sized(icon, Math.floor(size * share)));
}

/** The launch screen: the icon, centred on black. */
export function splashScreen(icon: Image, width: number, height: number): Image {
  return drawCentred(blank(width, height, BLACK), sized(icon, Math.floor(Math.min(width, height) / 4)));
}

/** hex, as Android colour resources want it. */
export function hex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

// A 5x7 pixel font, for the placeholder icon: each glyph is seven rows of five.
const GLYPHS: Record<string, string> = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11100 10010 10001 10001 10001 10010 11100',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110',
  1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111',
  3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010',
  5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110',
  7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00010 01100',
};

const PLACEHOLDER_COLOURS: RGB[] = [
  [228, 87, 46], [46, 134, 171], [59, 178, 115], [119, 104, 174],
  [214, 140, 40], [225, 85, 84], [77, 157, 224], [160, 120, 60],
];

/**
 * An icon for a game that has none yet: the first letter of its title, on a
 * colour picked from its name, so two games on one phone look different.
 * Good enough to test with. Not for a store.
 */
export function placeholderIcon(title: string, name: string): Image {
  const letter = [...title.toUpperCase()].find((c) => c in GLYPHS) ?? 'C';
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const icon = blank(16, 16, PLACEHOLDER_COLOURS[hash % PLACEHOLDER_COLOURS.length]);
  GLYPHS[letter].split(' ').forEach((row, y) => {
    [...row].forEach((bit, x) => {
      if (bit !== '1') return;
      // Each font pixel is 2x2, the 10x14 letter centred in the 16x16 icon.
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          icon.data.fill(255, ((1 + y * 2 + dy) * 16 + 3 + x * 2 + dx) * 4, ((1 + y * 2 + dy) * 16 + 3 + x * 2 + dx) * 4 + 4);
        }
      }
    });
  });
  return icon;
}
