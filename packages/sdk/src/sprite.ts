import { Scene } from './scene';
import { SpriteOptions } from './types';

export interface AnimConfig {
  frames: number[];
  fps: number;
  loop?: boolean;
}

export class Sprite {
  public x: number;
  public y: number;
  public velocityX = 0;
  public velocityY = 0;
  private _frame: number;
  public layer: number;
  public sheet: number;
  public flipX = false;
  public flipY = false;
  public active = true;

  private id: bigint;
  private anim: AnimConfig | null = null;
  private animTimer = 0;
  private animFrameIdx = 0;

  public onUpdate?: (dt: number, self: Sprite) => void;

  /** Readonly access to the ECS entity id (for advanced raw WASM calls). */
  get entityId(): bigint { return this.id; }

  get frame(): number { return this._frame; }
  set frame(value: number) {
    this._frame = value;
    if (this.active) this.scene.eng.raw.set_frame(this.id, value);
  }

  constructor(public scene: Scene, options: SpriteOptions) {
    this.x = options.x;
    this.y = options.y;
    this.sheet = options.sheet;
    this._frame = options.frame;
    this.layer = options.layer ?? 10;

    this.id = this.scene.eng.spawnSprite(this.x, this.y, this.sheet, this.frame, this.layer);
    this.scene._addSprite(this);
  }

  play(anim: AnimConfig) {
    this.anim = anim;
    this.animTimer = 0;
    this.animFrameIdx = 0;
    this._frame = anim.frames[0];
    this.scene.eng.raw.set_frame(this.id, this._frame);
  }

  stopAnim() {
    this.anim = null;
  }

  _update(dt: number) {
    if (!this.active) return;

    if (this.onUpdate) {
      this.onUpdate(dt, this);
    }

    if (this.anim && this.anim.frames.length > 0 && this.anim.fps > 0) {
      this.animTimer += dt;
      const frameDuration = 1 / this.anim.fps;

      if (this.animTimer >= frameDuration) {
        this.animTimer -= frameDuration;
        this.animFrameIdx++;

        if (this.animFrameIdx >= this.anim.frames.length) {
          if (this.anim.loop ?? true) {
            this.animFrameIdx = 0;
          } else {
            this.animFrameIdx--; // clamp to last frame
            this.stopAnim();
          }
        }

        this._frame = this.anim!.frames[this.animFrameIdx];
        this.scene.eng.raw.set_frame(this.id, this._frame);
      }
    }

    if (this.velocityX !== 0 || this.velocityY !== 0) {
      this.x += this.velocityX * dt;
      this.y += this.velocityY * dt;
    }

    this.scene.eng.raw.set_position(this.id, this.x, this.y);
    this.scene.eng.raw.set_flip(this.id, this.flipX, this.flipY);
  }

  move(vx: number, vy: number) {
    this.velocityX = vx;
    this.velocityY = vy;
    this.scene.eng.raw.set_velocity(this.id, vx, vy);
  }

  stop() {
    this.move(0, 0);
  }

  overlaps(other: Sprite, w = 8, h = 8): boolean {
    return this.x < other.x + w &&
      this.x + w > other.x &&
      this.y < other.y + h &&
      this.y + h > other.y;
  }

  destroy() {
    this.active = false;
    this.scene.eng.raw.destroy_entity(this.id);
    this.scene._removeSprite(this);
  }
}
