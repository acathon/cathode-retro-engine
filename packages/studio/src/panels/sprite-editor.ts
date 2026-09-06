/**
 * Pixel editor for the active sprite: paint frames on a zoomed grid with the
 * engine's own palette, flip through frames, and watch the animation preview.
 */
import { PALETTE, TILE, blankFrame, type Frame, type StudioSprite } from '../project';

type Tool = 'pen' | 'fill' | 'erase';

export interface SpriteEditorHooks {
  onChange(): void;
}

export class SpriteEditor {
  private canvas = document.getElementById('sprite-canvas') as HTMLCanvasElement;
  private preview = document.getElementById('sprite-preview') as HTMLCanvasElement;
  private strip = document.getElementById('frame-strip') as HTMLDivElement;
  private paletteHost = document.getElementById('palette') as HTMLDivElement;

  private ctx = this.canvas.getContext('2d')!;
  private previewCtx = this.preview.getContext('2d')!;

  private sprite: StudioSprite | null = null;
  private frameIndex = 0;
  private colour = 11;
  private tool: Tool = 'pen';
  private painting = false;
  private previewTick = 0;

  constructor(private hooks: SpriteEditorHooks) {
    this.buildPalette();
    this.bindTools();
    this.bindCanvas();
    this.bindFrameButtons();
    setInterval(() => this.drawPreview(), 160);
  }

  setSprite(sprite: StudioSprite | null): void {
    this.sprite = sprite;
    this.frameIndex = 0;
    this.render();
  }

  private get frame(): Frame | null {
    if (!this.sprite) return null;
    return this.sprite.frames[this.frameIndex] ?? null;
  }

  private buildPalette(): void {
    this.paletteHost.innerHTML = '';
    PALETTE.forEach((hex, index) => {
      const swatch = document.createElement('button');
      swatch.className = `swatch${index === 0 ? ' transparent' : ''}${index === this.colour ? ' active' : ''}`;
      if (index !== 0) swatch.style.background = hex;
      swatch.title = index === 0 ? 'Transparent' : hex;
      swatch.dataset.index = String(index);
      swatch.addEventListener('click', () => {
        this.colour = index;
        this.paletteHost.querySelectorAll('.swatch').forEach((n) => n.classList.remove('active'));
        swatch.classList.add('active');
      });
      this.paletteHost.appendChild(swatch);
    });
  }

  private bindTools(): void {
    document.querySelectorAll<HTMLButtonElement>('.tool[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.tool = btn.dataset.tool as Tool;
        document.querySelectorAll('.tool[data-tool]').forEach((n) => n.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  private bindFrameButtons(): void {
    document.getElementById('frame-add')?.addEventListener('click', () => {
      if (!this.sprite) return;
      // New frames copy the current one, which is how you animate: tweak a
      // duplicate rather than redraw from scratch.
      const source = this.frame;
      this.sprite.frames.splice(this.frameIndex + 1, 0, source ? Uint8Array.from(source) : blankFrame());
      this.frameIndex += 1;
      this.changed();
    });

    document.getElementById('frame-del')?.addEventListener('click', () => {
      if (!this.sprite || this.sprite.frames.length <= 1) return;
      this.sprite.frames.splice(this.frameIndex, 1);
      this.frameIndex = Math.max(0, this.frameIndex - 1);
      this.changed();
    });

    document.getElementById('sp-clear')?.addEventListener('click', () => {
      if (!this.sprite) return;
      this.sprite.frames[this.frameIndex] = blankFrame();
      this.changed();
    });
  }

  private bindCanvas(): void {
    const paintAt = (ev: MouseEvent) => {
      const frame = this.frame;
      if (!frame) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.floor(((ev.clientX - rect.left) / rect.width) * TILE);
      const y = Math.floor(((ev.clientY - rect.top) / rect.height) * TILE);
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;

      const value = this.tool === 'erase' ? 0 : this.colour;
      if (this.tool === 'fill') this.floodFill(frame, x, y, value);
      else frame[y * TILE + x] = value;

      this.changed();
    };

    this.canvas.addEventListener('mousedown', (ev) => { this.painting = true; paintAt(ev); });
    this.canvas.addEventListener('mousemove', (ev) => { if (this.painting) paintAt(ev); });
    window.addEventListener('mouseup', () => { this.painting = false; });
  }

  /** Flood fill the contiguous region sharing the clicked colour. */
  private floodFill(frame: Frame, sx: number, sy: number, value: number): void {
    const target = frame[sy * TILE + sx];
    if (target === value) return;

    const stack: [number, number][] = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) continue;
      const i = y * TILE + x;
      if (frame[i] !== target) continue;
      frame[i] = value;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  private changed(): void {
    this.render();
    this.hooks.onChange();
  }

  render(): void {
    this.drawGrid();
    this.drawStrip();
    this.drawPreview();
  }

  private drawFrameInto(ctx: CanvasRenderingContext2D, frame: Frame, size: number): void {
    const cell = size / TILE;
    ctx.clearRect(0, 0, size, size);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const idx = frame[y * TILE + x] ?? 0;
        if (idx === 0) continue;
        ctx.fillStyle = PALETTE[idx] ?? '#fff';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  private drawGrid(): void {
    const size = this.canvas.width;
    const cell = size / TILE;
    this.ctx.clearRect(0, 0, size, size);

    // Checkerboard so transparent pixels read as transparent.
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        this.ctx.fillStyle = (x + y) % 2 ? '#1a1e24' : '#20252c';
        this.ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    const frame = this.frame;
    if (frame) this.drawFrameInto(this.ctx, frame, size);

    this.ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= TILE; i++) {
      const p = i * cell;
      this.ctx.beginPath(); this.ctx.moveTo(p, 0); this.ctx.lineTo(p, size); this.ctx.stroke();
      this.ctx.beginPath(); this.ctx.moveTo(0, p); this.ctx.lineTo(size, p); this.ctx.stroke();
    }
  }

  private drawStrip(): void {
    this.strip.innerHTML = '';
    if (!this.sprite) return;

    this.sprite.frames.forEach((frame, index) => {
      const c = document.createElement('canvas');
      c.width = TILE; c.height = TILE;
      c.className = index === this.frameIndex ? 'active' : '';
      c.title = `Frame ${index}`;
      this.drawFrameInto(c.getContext('2d')!, frame, TILE);
      c.addEventListener('click', () => { this.frameIndex = index; this.render(); });
      this.strip.appendChild(c);
    });
  }

  private drawPreview(): void {
    if (!this.sprite || !this.sprite.frames.length) {
      this.previewCtx.clearRect(0, 0, this.preview.width, this.preview.height);
      return;
    }
    this.previewTick = (this.previewTick + 1) % (this.sprite.frames.length * 4);
    const frame = this.sprite.frames[Math.floor(this.previewTick / 4)];
    this.previewCtx.clearRect(0, 0, this.preview.width, this.preview.height);
    if (frame) this.drawFrameInto(this.previewCtx, frame, this.preview.width);
  }
}
