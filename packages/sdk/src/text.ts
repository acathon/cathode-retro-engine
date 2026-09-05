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

    const canvas = document.createElement('canvas');
    canvas.width = sheetW;
    canvas.height = sheetH;
    const ctx = canvas.getContext('2d')!;

    // Clear to transparent
    ctx.clearRect(0, 0, sheetW, sheetH);

    // Draw each character
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.font = `${charH}px monospace`;
    // Use 'pixelated' rendering
    (ctx as any).imageSmoothingEnabled = false;

    for (let i = 0; i < charCount; i++) {
      const charCode = firstChar + i;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * charW;
      const y = row * charH;
      ctx.fillText(String.fromCharCode(charCode), x, y);
    }

    const imgData = ctx.getImageData(0, 0, sheetW, sheetH);
    const pixels = new Uint8Array(imgData.data.buffer);

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
