/**
 * Generate the Rust glyph table from the TypeScript one.
 *
 *   npm run gen:font
 *
 * The font is defined once, in `packages/sdk/src/font-glyphs.ts`, so the
 * browser and the native runtime cannot drift into drawing different letters.
 * This mirrors it into `crates/core/src/text/glyphs.rs`.
 *
 * The table carries `#[rustfmt::skip]`: the string-art layout is the point —
 * a glyph you can read and correct as seven lines of `#` — and rustfmt breaks
 * every row onto its own line, which makes it unreadable and puts a diff in
 * every regeneration.
 */
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('packages/sdk/src/font-glyphs.ts', 'utf8');
const body = src.slice(src.indexOf('export const GLYPHS'), src.indexOf('/**\n * The glyph for a character code'));
const re = /(?:'((?:[^'\\]|\\.)+)'|"([^"]*)"|([A-Za-z0-9_$]+))\s*:\s*(BLANK|\[([^\]]*)\])/g;
const rows = [];
let m;
while ((m = re.exec(body))) {
  let key = m[1] ?? m[2] ?? m[3];
  if (key === undefined) continue;
  key = key.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const art = m[4] === 'BLANK'
    ? ['.....', '.....', '.....', '.....', '.....', '.....', '.....']
    : m[5].split(',').map(s => s.trim()).filter(Boolean).map(s => s.slice(1, -1));
  if (art.length !== 7 || art.some(r => r.length !== 5)) throw new Error('bad glyph ' + key);
  rows.push([key, art]);
}
const rustChar = (k) => k === '\\' ? "'\\\\'" : k === "'" ? "'\\''" : `'${k}'`;
const entries = rows.map(([k, art]) =>
  `    (${rustChar(k)}, [${art.map(r => `"${r}"`).join(', ')}]),`).join('\n');

writeFileSync('crates/core/src/text/glyphs.rs', `//! The built-in 5x7 font.
//!
//! Generated from \`packages/sdk/src/font-glyphs.ts\` so the native runtime and
//! the browser draw identical text. Edit the TypeScript table and regenerate;
//! do not edit this by hand.
//!
//! The font is drawn rather than rasterised from a system typeface because no
//! reduction threshold satisfied every letter at once: too low dropped the leg
//! off an \`R\` — shipped games read "ENTEN" — and too high closed the counters
//! in \`S\` and \`O\`.

/// Glyph cell, in pixels. Cells are padded to 8x8 on the sheet.
pub const GLYPH_W: u32 = 5;
pub const GLYPH_H: u32 = 7;

#[rustfmt::skip]
const BLANK: [&str; 7] = [".....", ".....", ".....", ".....", ".....", ".....", "....."];

/// Every glyph the built-in font draws, keyed by character.
#[rustfmt::skip]
pub const GLYPHS: [(char, [&str; 7]); ${rows.length}] = [
${entries}
];

/// The glyph for a character, mapping lowercase onto its capital.
///
/// At seven pixels tall a separate lowercase set would be mostly guesswork,
/// and a game printing "Score" should not lose four letters to that.
pub fn glyph_for(code: u8) -> [&'static str; 7] {
    let ch = code as char;
    for (key, art) in GLYPHS.iter() {
        if *key == ch {
            return *art;
        }
    }
    let upper = ch.to_ascii_uppercase();
    for (key, art) in GLYPHS.iter() {
        if *key == upper {
            return *art;
        }
    }
    BLANK
}

/// An 8x8 RGBA sheet of chars 32..127, laid out 16 to a row.
///
/// Hand it to [\`crate::assets::SpriteSheet::from_rgba\`] and register it with
/// [\`crate::text::FontRegistry\`] to draw text from Rust.
pub fn builtin_sheet() -> (u32, u32, Vec<u8>) {
    const CHAR: u32 = 8;
    const COLS: u32 = 16;
    const COUNT: u32 = 96;
    let rows = COUNT.div_ceil(COLS);
    let (w, h) = (COLS * CHAR, rows * CHAR);
    let mut pixels = vec![0u8; (w * h * 4) as usize];

    for i in 0..COUNT {
        let art = glyph_for((32 + i) as u8);
        let ox = (i % COLS) * CHAR;
        let oy = (i / COLS) * CHAR;
        for (gy, row) in art.iter().enumerate() {
            for (gx, cell) in row.bytes().enumerate() {
                if cell != b'#' {
                    continue;
                }
                // One pixel of left bearing, so glyphs do not touch.
                let x = ox + gx as u32 + 1;
                let y = oy + gy as u32;
                let o = ((y * w + x) * 4) as usize;
                pixels[o..o + 4].copy_from_slice(&[255, 255, 255, 255]);
            }
        }
    }

    (w, h, pixels)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_glyph_is_five_by_seven() {
        for (ch, art) in GLYPHS.iter() {
            assert_eq!(art.len(), 7, "{ch} is not seven rows");
            for row in art.iter() {
                assert_eq!(row.len(), 5, "{ch} has a row that is not five wide");
            }
        }
    }

    #[test]
    fn the_r_keeps_its_leg() {
        // The bug this font exists to fix: an R that reduced to an N.
        let r = glyph_for(b'R');
        assert_eq!(r[4], "#.#..");
        assert_ne!(r, glyph_for(b'N'));
    }

    #[test]
    fn lowercase_maps_onto_capitals() {
        assert_eq!(glyph_for(b'a'), glyph_for(b'A'));
    }

    #[test]
    fn unknown_characters_are_blank() {
        assert_eq!(glyph_for(0x7f), BLANK);
    }

    #[test]
    fn the_sheet_is_the_expected_size_and_not_empty() {
        let (w, h, pixels) = builtin_sheet();
        assert_eq!((w, h), (128, 48));
        assert_eq!(pixels.len(), (128 * 48 * 4) as usize);
        assert!(pixels.iter().any(|&b| b != 0), "the sheet is blank");
    }
}
`);
console.log('wrote crates/core/src/text/glyphs.rs with', rows.length, 'glyphs');
