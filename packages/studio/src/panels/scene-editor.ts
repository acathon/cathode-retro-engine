/**
 * Visual scene editor: place sprites by dragging them, instead of typing
 * coordinates into the inspector.
 *
 * Draws every sprite's first frame at its world position over a grid the size
 * of the game screen, so what you arrange is what the game starts as.
 */
import { PALETTE, TILE, type StudioProject, type StudioSprite } from '../project';

const SCREEN_W = 256;
const SCREEN_H = 240;

export interface SceneEditorHooks {
  onSelect(id: string): void;
  onMove(): void;
}

export class SceneEditor {
  private canvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;
  private snapToggle = document.getElementById('scene-snap') as HTMLInputElement;

  private dragging: { sprite: StudioSprite; dx: number; dy: number } | null = null;

  constructor(
    private project: StudioProject,
    private hooks: SceneEditorHooks,
  ) {
    this.canvas.width = SCREEN_W;
    this.canvas.height = SCREEN_H;
    this.bind();
  }

  setProject(project: StudioProject): void {
    this.project = project;
    this.render();
  }

  /** Canvas pixel under the pointer, in world units. */
  private worldAt(ev: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * SCREEN_W,
      y: ((ev.clientY - rect.top) / rect.height) * SCREEN_H,
    };
  }

  /** Topmost sprite whose tile contains the point. */
  private hitTest(x: number, y: number): StudioSprite | null {
    const ordered = [...this.project.sprites].sort((a, b) => b.layer - a.layer);
    for (const sprite of ordered) {
      if (x >= sprite.x && x < sprite.x + TILE && y >= sprite.y && y < sprite.y + TILE) {
        return sprite;
      }
    }
    return null;
  }

  private bind(): void {
    this.canvas.addEventListener('mousedown', (ev) => {
      const { x, y } = this.worldAt(ev);
      const sprite = this.hitTest(x, y);
      if (!sprite) return;

      this.project.activeSpriteId = sprite.id;
      this.hooks.onSelect(sprite.id);
      this.dragging = { sprite, dx: x - sprite.x, dy: y - sprite.y };
      this.render();
    });

    window.addEventListener('mousemove', (ev) => {
      if (!this.dragging) return;
      const { x, y } = this.worldAt(ev);
      const snap = this.snapToggle?.checked ?? true;

      let nx = x - this.dragging.dx;
      let ny = y - this.dragging.dy;
      if (snap) {
        nx = Math.round(nx / 8) * 8;
        ny = Math.round(ny / 8) * 8;
      }

      this.dragging.sprite.x = Math.round(nx);
      this.dragging.sprite.y = Math.round(ny);
      this.render();
      this.hooks.onMove();
    });

    window.addEventListener('mouseup', () => { this.dragging = null; });
  }

  render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);

    ctx.fillStyle = '#12151a';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    // Grid on the sprite pitch, so snapping is legible.
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= SCREEN_W; x += TILE) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, SCREEN_H); ctx.stroke();
    }
    for (let y = 0; y <= SCREEN_H; y += TILE) {
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(SCREEN_W, y + 0.5); ctx.stroke();
    }

    const ordered = [...this.project.sprites].sort((a, b) => a.layer - b.layer);
    for (const sprite of ordered) {
      const frame = sprite.frames[0];
      if (frame && sprite.visible) {
        for (let py = 0; py < TILE; py++) {
          for (let px = 0; px < TILE; px++) {
            const idx = frame[py * TILE + px] ?? 0;
            if (!idx) continue;
            ctx.fillStyle = PALETTE[idx] ?? '#fff';
            ctx.fillRect(sprite.x + px, sprite.y + py, 1, 1);
          }
        }
      }

      // A solid's collider is usually wider than its art; outline the real
      // extent so a floor's true reach is visible while arranging a level.
      if (sprite.physics?.solid) {
        ctx.strokeStyle = 'rgba(103, 212, 116, 0.5)';
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(sprite.x + 0.5, sprite.y + 0.5, sprite.physics.width, sprite.physics.height);
        ctx.setLineDash([]);
      }

      if (sprite.id === this.project.activeSpriteId) {
        ctx.strokeStyle = '#5fb2e8';
        ctx.lineWidth = 1;
        ctx.strokeRect(sprite.x - 0.5, sprite.y - 0.5, TILE + 1, TILE + 1);
      }
    }
  }
}
