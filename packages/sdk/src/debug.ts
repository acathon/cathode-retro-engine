import { Cathode } from './engine';
import { Scene } from './scene';
import { BitmapFont } from './text';

export class DebugOverlay {
  private _visible = false;
  private font: BitmapFont | null = null;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(
    private engine: Cathode,
    private scene: Scene,
  ) {
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private ensureFont(): BitmapFont {
    if (!this.font) {
      this.font = BitmapFont.builtin(this.engine);
    }
    return this.font;
  }

  toggle(): void {
    this._visible = !this._visible;
  }

  show(): void {
    this._visible = true;
  }

  hide(): void {
    this._visible = false;
  }

  get visible(): boolean {
    return this._visible;
  }

  /** Call after scene.update() and engine.render() to draw debug info */
  render(dt: number): void {
    if (!this._visible || !this.engine.raw) return;

    const font = this.ensureFont();
    const fps = dt > 0 ? Math.round(1 / dt) : 0;
    const entities = this.engine.entityCount;
    const particles = this.engine.raw.particle_count?.() ?? 0;
    const tick = this.engine.raw.tick_count?.() ?? 0;

    // Draw semi-transparent background bar
    this.engine.raw.draw_overlay_rect(0, 0, 0, 100);

    // Draw text
    font.draw(`FPS:${fps} ENT:${entities} PRT:${particles} T:${tick}`, 2, 2, 1);

    // Camera info
    const cam = this.engine.raw.get_camera_pos?.();
    if (cam) {
      font.draw(`CAM:${Math.round(cam[0])},${Math.round(cam[1])}`, 2, 12, 1);
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyHandler);
  }
}
