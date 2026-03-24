import { RetroEngine } from './engine';

export class GameTimer {
  private handle: number;
  private _fireCb?: () => void;
  private _destroyed = false;

  constructor(
    private engine: RetroEngine,
    durationSecs: number,
    options?: { repeat?: boolean; autoStart?: boolean },
  ) {
    const repeat = options?.repeat ?? false;
    const autoStart = options?.autoStart ?? false;

    this.handle = this.engine.raw!.timer_create(durationSecs, repeat);

    if (autoStart) {
      this.start();
    }

    this.engine._registerTimer(this);
  }

  onFire(cb: () => void): this {
    this._fireCb = cb;
    return this;
  }

  start(): this {
    this.engine.raw!.timer_start(this.handle);
    return this;
  }

  stop(): this {
    this.engine.raw!.timer_stop(this.handle);
    return this;
  }

  reset(): this {
    this.engine.raw!.timer_reset(this.handle);
    return this;
  }

  get progress(): number {
    return this.engine.raw!.timer_progress(this.handle);
  }

  get remaining(): number {
    return (1 - this.progress) * this._getDuration();
  }

  private _getDuration(): number {
    // approximate from progress
    return 1; // placeholder; actual value is in WASM
  }

  /** Called by engine loop */
  _checkFired(firedHandles: number[]): void {
    if (this._destroyed) return;
    if (firedHandles.includes(this.handle) && this._fireCb) {
      this._fireCb();
    }
  }

  get _handle(): number {
    return this.handle;
  }

  destroy(): void {
    if (!this._destroyed) {
      this._destroyed = true;
      this.engine._unregisterTimer(this);
    }
  }
}
