import { Cathode } from './engine';

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
   * Generate a minimal built-in 8x8 monospace ASCII font (chars 32-127)
   * using the browser Canvas API. No PNG needed.
   */
  static builtin(engine: Cathode): BitmapFont {
    const charW = 8;
    const charH = 8;
    const firstChar = 32;
    const charCount = 96; // 32..127
    const cols = 16;
    const rows = Math.ceil(charCount / cols);
    const sheetW = cols * charW;
    const sheetH = rows * charH;

    // Rasterise large, then reduce. Asking the browser for 8px text gives
    // glyphs whose strokes are thinner than a pixel, so they arrive as faint
    // antialiasing that a hardware palette snaps away — letters came out with
    // holes in them ("NEXT" reading as "N E X I"). Drawing at 4x and taking a
    // majority vote per 4x4 block keeps every stroke at least one pixel wide.
    const SS = 4;
    const bigW = sheetW * SS;
    const bigH = sheetH * SS;

    const canvas = document.createElement('canvas');
    canvas.width = bigW;
    canvas.height = bigH;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, bigW, bigH);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    // Alphabetic rather than top: 'top' measures from the em box, which
    // includes the ascender, and pushed capitals off the bottom of the cell.
    ctx.textBaseline = 'alphabetic';
    // Sans, not monospace: a monospace 'I' carries serifs, and at this size
    // they survive the reduction as a crossbar — "LINES" came out "LTNES".
    // Each glyph is centred in its own fixed cell here, so the font itself
    // does not need to be monospaced.
    ctx.font = `bold ${charH * SS - SS}px "DejaVu Sans", Arial, sans-serif`;

    for (let i = 0; i < charCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      ctx.fillText(
        String.fromCharCode(firstChar + i),
        (col + 0.5) * charW * SS,
        (row + 1) * charH * SS - SS * 1.5,
      );
    }

    const big = ctx.getImageData(0, 0, bigW, bigH).data;
    const pixels = new Uint8Array(sheetW * sheetH * 4);

    for (let y = 0; y < sheetH; y++) {
      for (let x = 0; x < sheetW; x++) {
        let lit = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const bi = (((y * SS + sy) * bigW) + (x * SS + sx)) * 4;
            if (big[bi + 3] > 90) lit++;
          }
        }
        // A third of the block is enough: thin strokes cover fewer samples
        // than a solid fill, and demanding half of them erases them again.
        const on = lit >= (SS * SS) / 3;
        const i = (y * sheetW + x) * 4;
        pixels[i] = on ? 255 : 0;
        pixels[i + 1] = on ? 255 : 0;
        pixels[i + 2] = on ? 255 : 0;
        pixels[i + 3] = on ? 255 : 0;
      }
    }

    const sheetHandle = engine.raw!.upload_sheet(
      sheetW,
      sheetH,
      charW,
      charH,
      pixels,
    );

    return new BitmapFont(engine, sheetHandle, charW, charH, cols, firstChar);
  }
}
