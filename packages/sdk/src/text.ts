import { Cathode } from './engine';
import { GLYPH_H, GLYPH_W, glyphFor } from './font-glyphs';

export class BitmapFont {
  private handle: number;

  constructor(
    private engine: Cathode,
    sheetHandle: number,
    charWidth: number,
    charHeight: number,
    cols: number,
    firstCharCode = 32,
  ) {
    this.handle = this.engine.raw!.register_font(
      sheetHandle,
      charWidth,
      charHeight,
      cols,
      firstCharCode,
    );
  }

  draw(text: string, x: number, y: number, scale = 1): void {
    this.engine.raw!.draw_text(this.handle, text, x, y, scale);
  }

  measure(text: string, scale = 1): number {
    return this.engine.raw!.measure_text(this.handle, text, scale);
  }

  /**
   * The built-in 8x8 font: chars 32-127, drawn from the glyph table rather
   * than rasterised from a system face.
   *
   * A game that wants exact glyphs of its own should supply a sheet to the
   * constructor; this is the fallback that means `font.draw` works before you
   * have drawn anything.
   */
  static builtin(engine: Cathode): BitmapFont {
    const charW = 8;
    const charH = 8;
    const firstChar = 32;
    const charCount = 96;                 // 32..127
    const cols = 16;
    const rows = Math.ceil(charCount / cols);
    const sheetW = cols * charW;
    const sheetH = rows * charH;

    const pixels = new Uint8Array(sheetW * sheetH * 4);

    for (let i = 0; i < charCount; i++) {
      const glyph = glyphFor(firstChar + i);
      const originX = (i % cols) * charW;
      const originY = Math.floor(i / cols) * charH;

      for (let y = 0; y < GLYPH_H; y++) {
        for (let x = 0; x < GLYPH_W; x++) {
          if (glyph[y][x] !== '#') continue;
          // One pixel of left bearing, so consecutive glyphs do not touch.
          const o = (((originY + y) * sheetW) + originX + x + 1) * 4;
          pixels[o] = 255;
          pixels[o + 1] = 255;
          pixels[o + 2] = 255;
          pixels[o + 3] = 255;
        }
      }
    }

    const sheetHandle = engine.raw!.upload_sheet(sheetW, sheetH, charW, charH, pixels);
    return new BitmapFont(engine, sheetHandle, charW, charH, cols, firstChar);
  }
}
