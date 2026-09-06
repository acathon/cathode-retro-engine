import { Scene } from './scene';
import { PhysicsOptions, SpriteOptions } from './types';

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
  private _active = true;

  /**
   * Whether this sprite is drawn.
   *
   * Setting it false genuinely hides the sprite in the engine. It used to
   * only stop the TypeScript-side update, so a "hidden" sprite kept drawing
   * wherever it last stood — which is why games parked things at -9999.
   */
  get active(): boolean { return this._active; }
  set active(value: boolean) {
    if (this._active === value) return;
    this._active = value;
    this.scene.eng.raw?.set_visible(this.id, value);
  }

  private id: bigint;
  private anim: AnimConfig | null = null;
  private animTimer = 0;
  private animFrameIdx = 0;
  private physics = false;

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

    if (this.physics) {
      // The engine already integrated and resolved this body during tick();
      // read the result back rather than overwriting it.
      const pos = this.scene.eng.raw.get_position(this.id);
      this.x = pos[0];
      this.y = pos[1];

      const vel = this.scene.eng.raw.get_velocity(this.id);
      this.velocityX = vel[0];
      this.velocityY = vel[1];
    } else {
      if (this.velocityX !== 0 || this.velocityY !== 0) {
        this.x += this.velocityX * dt;
        this.y += this.velocityY * dt;
      }
      this.scene.eng.raw.set_position(this.id, this.x, this.y);
    }

    this.scene.eng.raw.set_flip(this.id, this.flipX, this.flipY);
  }

  /**
   * Hand this sprite's movement to the engine's physics step: gravity,
   * integration, and collision against solid sprites all happen in the
   * engine, and `x`/`y`/`velocityX`/`velocityY` are read back each frame.
   *
   * Without this a sprite is moved in TypeScript and ignores solids.
   */
  usePhysics(options: PhysicsOptions = {}): this {
    const raw = this.scene.eng.raw;
    this.physics = true;

    if (options.width !== undefined && options.height !== undefined) {
      raw.add_collider(
        this.id,
        options.offsetX ?? 0,
        options.offsetY ?? 0,
        options.width,
        options.height,
      );
    }
    if (options.gravity !== undefined) {
      raw.set_gravity(this.id, options.gravity);
    }
    if (options.solid) {
      raw.set_solid(this.id, true);
    }

    raw.set_position(this.id, this.x, this.y);
    raw.set_velocity(this.id, this.velocityX, this.velocityY);
    return this;
  }

  /** Set gravity strength as a multiple of the engine's base gravity. */
  setGravity(scale = 1): this {
    this.scene.eng.raw.set_gravity(this.id, scale);
    return this;
  }

  /** Stop this sprite being pulled down. */
  clearGravity(): this {
    this.scene.eng.raw.clear_gravity(this.id);
    return this;
  }

  /** Give this sprite a collision box, in pixels. */
  setCollider(width: number, height: number, offsetX = 0, offsetY = 0): this {
    this.scene.eng.raw.add_collider(this.id, offsetX, offsetY, width, height);
    return this;
  }

  /** Solid sprites never move and block bodies that use physics. */
  setSolid(solid = true): this {
    this.scene.eng.raw.set_solid(this.id, solid);
    return this;
  }

  /**
   * Teleport the sprite. Assigning `x`/`y` directly is enough in the default
   * mode, but under `usePhysics` the engine owns the position and would
   * overwrite it on the next frame, so respawns need this.
   */
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    this.scene.eng.raw.set_position(this.id, x, y);
    return this;
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
