import { RetroEngine } from './engine';

export type TransitionType =
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'pixelate'
  | 'checkerboard';

export class SceneTransition {
  private duration: number;

  constructor(
    private engine: RetroEngine,
    private type: TransitionType,
    durationSecs = 0.5,
  ) {
    this.duration = durationSecs;
  }

  async transition(onSwap: () => void): Promise<void> {
    const halfDuration = this.duration / 2;
    const fps = 60;
    const framesPerHalf = Math.ceil(halfDuration * fps);

    // OUT animation
    for (let i = 0; i <= framesPerHalf; i++) {
      const t = i / framesPerHalf;
      this.drawOverlay(t);
      await frame();
    }

    // Swap
    onSwap();

    // IN animation
    for (let i = framesPerHalf; i >= 0; i--) {
      const t = i / framesPerHalf;
      this.drawOverlay(t);
      await frame();
    }
  }

  private drawOverlay(t: number): void {
    if (!this.engine.raw) return;

    switch (this.type) {
      case 'fade': {
        const alpha = Math.round(t * 255);
        this.engine.raw.draw_overlay_rect(0, 0, 0, alpha);
        break;
      }
      case 'slide-left':
      case 'slide-right': {
        const alpha = Math.round(t * 255);
        this.engine.raw.draw_overlay_rect(0, 0, 0, alpha);
        break;
      }
      case 'pixelate': {
        const alpha = Math.round(t * 200);
        this.engine.raw.draw_overlay_rect(0, 0, 0, alpha);
        break;
      }
      case 'checkerboard': {
        const alpha = Math.round(t * 255);
        this.engine.raw.draw_overlay_rect(0, 0, 0, alpha);
        break;
      }
    }
  }
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
