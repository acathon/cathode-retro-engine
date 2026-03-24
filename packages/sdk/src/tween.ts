import { RetroEngine } from './engine';
import { Sprite } from './sprite';

export type EaseName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'bounceOut'
  | 'elasticOut'
  | 'backOut';

const EASE_MAP: Record<EaseName, number> = {
  linear: 0,
  easeIn: 1,
  easeOut: 2,
  easeInOut: 3,
  bounceOut: 4,
  elasticOut: 5,
  backOut: 6,
};

export class Tween {
  private handle: number;
  private _updateCb?: (value: number) => void;
  private _completeCb?: () => void;
  private _completed = false;
  private _destroyed = false;

  constructor(
    private engine: RetroEngine,
    from: number,
    to: number,
    durationSecs: number,
    ease: EaseName = 'linear',
  ) {
    this.handle = this.engine.raw!.tween_create(
      from,
      to,
      durationSecs,
      EASE_MAP[ease] ?? 0,
      false,
      false,
    );
    this.engine._registerTween(this);
  }

  onUpdate(cb: (value: number) => void): this {
    this._updateCb = cb;
    return this;
  }

  onComplete(cb: () => void): this {
    this._completeCb = cb;
    return this;
  }

  repeat(yoyo = false): this {
    // Recreate with repeat flags — current WASM API sets at creation
    // For simplicity, destroy and recreate
    const from = this.engine.raw!.tween_value(this.handle);
    this.engine.raw!.tween_destroy(this.handle);
    this.handle = this.engine.raw!.tween_create(
      from,
      from, // will be overwritten
      1.0,
      0,
      true,
      yoyo,
    );
    return this;
  }

  start(): this {
    this.engine.raw!.tween_reset(this.handle);
    this._completed = false;
    return this;
  }

  stop(): this {
    // No pause in WASM, just let it reach completion or destroy
    return this;
  }

  /** Called by engine loop each frame */
  _tick(): void {
    if (this._destroyed || this._completed) return;

    const val = this.engine.raw!.tween_value(this.handle);
    if (this._updateCb) {
      this._updateCb(val);
    }

    if (this.engine.raw!.tween_is_complete(this.handle)) {
      this._completed = true;
      if (this._completeCb) {
        this._completeCb();
      }
    }
  }

  get value(): number {
    if (this._destroyed) return 0;
    return this.engine.raw!.tween_value(this.handle);
  }

  get isComplete(): boolean {
    if (this._destroyed) return true;
    return this.engine.raw!.tween_is_complete(this.handle);
  }

  destroy(): void {
    if (!this._destroyed) {
      this._destroyed = true;
      this.engine.raw!.tween_destroy(this.handle);
      this.engine._unregisterTween(this);
    }
  }
}

export function tweenSprite(
  sprite: Sprite,
  props: Partial<{ x: number; y: number; frame: number }>,
  durationSecs: number,
  ease: EaseName = 'linear',
): Tween {
  const engine = sprite.scene.eng;

  if (props.x !== undefined) {
    const t = new Tween(engine, sprite.x, props.x, durationSecs, ease);
    t.onUpdate((v) => {
      sprite.x = v;
    });
    return t;
  }

  if (props.y !== undefined) {
    const t = new Tween(engine, sprite.y, props.y, durationSecs, ease);
    t.onUpdate((v) => {
      sprite.y = v;
    });
    return t;
  }

  if (props.frame !== undefined) {
    const t = new Tween(engine, sprite.frame, props.frame, durationSecs, ease);
    t.onUpdate((v) => {
      sprite.frame = Math.round(v);
    });
    return t;
  }

  // Fallback: no-op tween
  return new Tween(engine, 0, 0, durationSecs, ease);
}
