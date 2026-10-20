import { InputReader } from './input';
import { WaveformType, Preset, EngineConfig } from './types';
import type { Tween } from './tween';
import type { GameTimer } from './timer';
import { ScreenFit, applyMobileStyles, isTouchFirst, pauseWhenHidden } from './mobile';
import { TouchControls } from './touch';

// WebEngine type to avoid importing from unbuilt WASM in TS
// It matches the methods exposed by wasm_bindgen
type WebEngine = any;


/** One budget compared against what a game actually used. */
export interface TargetBudget<T> {
  budget: T | null;
  /** null when the target models no real hardware. */
  fits: boolean | null;
}

/** The result of {@link Cathode.checkTarget}. */
export interface TargetReport {
  target: string;
  sprites: TargetBudget<number> & { peak: number };
  resolution: TargetBudget<[number, number]> & { current: [number, number] };
  audio: TargetBudget<number> & { channels: number };
}

/**
 * How the engine treats the page it is on. Both default to on, which is right
 * for a game that owns its page. An editor that shows the engine in one panel
 * of a larger tool turns them off.
 */
export interface ScreenOptions {
  /** Size the canvas to the window, filling it on a phone. */
  fit?: boolean;
  /** Add on-screen controls on touch screens. */
  touchControls?: boolean;
}

export class Cathode {
  public raw: WebEngine | null = null;
  public input: InputReader;

  private wasmModule: any = null;
  private canvas: HTMLCanvasElement;
  private rafId = 0;
  private paused = false;
  private loopCb?: (dt: number) => void;

  // Audio context handling
  private audioCtx: AudioContext | null = null;
  private audioNode: ScriptProcessorNode | null = null;

  /** Keeps the canvas as large as the page allows. Null until the engine starts. */
  screen: ScreenFit | null = null;

  // Managed tweens and timers
  private _tweens: Set<Tween> = new Set();
  private _timers: Set<GameTimer> = new Set();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.input = new InputReader();

    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.touchAction = 'none';
  }

  static async gameboy(canvas: HTMLCanvasElement, scale = 3, options: ScreenOptions = {}): Promise<Cathode> {
    const eng = new Cathode(canvas);
    await eng._init('gameboy', scale, undefined, options);
    return eng;
  }

  static async nes(canvas: HTMLCanvasElement, scale = 3, options: ScreenOptions = {}): Promise<Cathode> {
    const eng = new Cathode(canvas);
    await eng._init('nes', scale, undefined, options);
    return eng;
  }

  static async neogeo(canvas: HTMLCanvasElement, scale = 2, options: ScreenOptions = {}): Promise<Cathode> {
    const eng = new Cathode(canvas);
    await eng._init('neogeo', scale, undefined, options);
    return eng;
  }

  /**
   * VGA mode 13h: 320x200 in 256 colours, at its real 70 Hz refresh.
   *
   * This is the *look* of a DOS game, not the machine — the engine still runs
   * where it always ran. See docs/architecture.md for why an actual MS-DOS
   * executable is a different project.
   */
  static async dos(canvas: HTMLCanvasElement, scale = 3, options: ScreenOptions = {}): Promise<Cathode> {
    const eng = new Cathode(canvas);
    await eng._init('dos', scale, undefined, options);
    return eng;
  }

  static async custom(canvas: HTMLCanvasElement, config: EngineConfig, scale = 3, options: ScreenOptions = {}): Promise<Cathode> {
    const eng = new Cathode(canvas);
    await eng._init('custom', scale, config, options);
    return eng;
  }

  protected async _init(preset: Preset, scale: number, config?: EngineConfig, options: ScreenOptions = {}) {
    try {
      this.wasmModule = await import('cathode-platform-web');
      await this.wasmModule.default(); // init wasm
    } catch (e) {
      console.error("Failed to load cathode-platform-web WASM module. Make sure it is built.", e);
      throw e;
    }

    if (preset === 'gameboy') {
      this.raw = this.wasmModule.WebEngine.gameboy();
    } else if (preset === 'nes') {
      this.raw = this.wasmModule.WebEngine.nes();
    } else if (preset === 'neogeo') {
      this.raw = this.wasmModule.WebEngine.neogeo();
    } else if (preset === 'dos') {
      this.raw = this.wasmModule.WebEngine.dos();
    } else {
      this.raw = new this.wasmModule.WebEngine(JSON.stringify(config || {}));
    }

    this.input.attach(this.raw!);

    // On a phone the game fills the screen around the rest of its page; on a
    // desktop it keeps the scale it asked for unless the window is too small.
    const touchFirst = isTouchFirst();
    applyMobileStyles();
    if (options.fit === false) {
      this.canvas.style.width = `${this.width * scale}px`;
      this.canvas.style.height = `${this.height * scale}px`;
    } else {
      this.screen = new ScreenFit(this.canvas, this.width, this.height, scale, touchFirst);
    }
    pauseWhenHidden(this);
    // On-screen controls that draw whatever the game reads. A game that makes
    // its own replaces these.
    if (touchFirst && options.touchControls !== false && !this.input.touch) new TouchControls(this.input);

    this.initAudio();
  }

  /** The on-screen controls, when there are any. */
  get touch(): TouchControls | null {
    return this.input.touch instanceof TouchControls ? this.input.touch : null;
  }

  /**
   * Browsers keep audio silent until the player does something. The first
   * gesture creates the audio context; every later one resumes it if it has
   * stopped, which also covers iOS suspending it for a phone call.
   *
   * `touchstart` is deliberately not in the list: it does not count as a
   * gesture that may start audio, so a context resumed from it stays silent.
   * The listeners stay attached for the same reason a phone call matters --
   * audio that was running can stop again.
   */
  private initAudio() {
    const unlock = () => {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.audioNode = this.audioCtx.createScriptProcessor(2048, 0, 2);

        this.audioNode.onaudioprocess = (e) => {
          if (!this.raw || this.paused) return;
          const left = e.outputBuffer.getChannelData(0);
          const right = e.outputBuffer.getChannelData(1);

          const buf = new Float32Array(left.length * 2);
          this.raw.audio_fill_stereo(buf);

          for (let i = 0; i < left.length; i++) {
            left[i] = buf[i * 2];
            right[i] = buf[i * 2 + 1];
          }
        };

        this.audioNode.connect(this.audioCtx.destination);
      }
      // Never undo a pause the game asked for.
      if (this.audioCtx.state !== 'running' && !this.paused) void this.audioCtx.resume();
    };

    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
      window.addEventListener(type, unlock, { capture: true });
    }
  }

  get width(): number { return this.raw?.resolution_w() ?? 0; }
  get height(): number { return this.raw?.resolution_h() ?? 0; }
  get fps(): number { return this.raw?.target_fps() ?? 60; }
  get isPaused(): boolean { return this.paused; }
  get entityCount(): number { return this.raw?.entity_count() ?? 0; }

  loop(cb: (dt: number) => void) {
    this.loopCb = cb;
    // The game has built its page by now -- score bars and all -- so fit the
    // canvas around what is actually there.
    this.screen?.apply();
    const step = (ts: number) => {
      if (!this.paused && this.raw) {
        const dt = this.raw.tick(ts);

        // Update managed tweens
        for (const tween of this._tweens) {
          tween._tick();
        }

        // Check fired timers
        const firedTimers: number[] = this.raw.poll_fired_timers?.() ?? [];
        if (firedTimers.length > 0) {
          for (const timer of this._timers) {
            timer._checkFired(firedTimers);
          }
        }

        cb(dt);

        // Snapshot input last, once every frame, so justPressed/justReleased
        // compare against the previous frame no matter where in the callback
        // a game reads them.
        this.input.snapshot();

        this.raw.render_to_canvas(this.canvas);
      }
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  pause() {
    this.paused = true;
    if (this.audioCtx && this.audioCtx.state === 'running') {
      this.audioCtx.suspend();
    }
  }

  resume() {
    this.paused = false;
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  async loadSheet(url: string, tileWidth: number, tileHeight: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return reject("Failed to get 2d context for spritesheet");
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);

        const handle = this.raw!.upload_sheet(
          img.width,
          img.height,
          tileWidth,
          tileHeight,
          new Uint8Array(imgData.data.buffer)
        );
        resolve(handle);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  loadSheetFromCanvas(canvas: HTMLCanvasElement, tileWidth: number, tileHeight: number): number {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2d context for spritesheet canvas');
    }

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return this.raw!.upload_sheet(
      canvas.width,
      canvas.height,
      tileWidth,
      tileHeight,
      new Uint8Array(imgData.data.buffer),
    );
  }

  loadTileMap(json: string): number {
    return this.raw!.load_tilemap(json);
  }

  setCamera(x: number, y: number) {
    if (this.raw) this.raw.set_camera(x, y);
  }

  /**
   * Switch the hardware look — palette, background, scanlines — at any time.
   *
   * The profile is a view setting, not a contract: nothing is capped while
   * you build, so you can author in full colour and flip to `'gameboy'` to
   * check how the art reads. Choose a target when you export.
   */
  setProfile(profile: 'nes' | 'gameboy' | 'neogeo' | 'custom'): void {
    this.raw?.set_profile(profile);
  }

  /** The profile currently being rendered. */
  get profile(): string {
    return this.raw?.profile() ?? 'custom';
  }

  /** Most sprites drawn in any single frame so far. */
  get peakSprites(): number {
    return this.raw?.peak_sprites() ?? 0;
  }

  /** Forget the peak, e.g. when starting a new level. */
  resetPeakSprites(): void {
    this.raw?.reset_peak_sprites();
  }

  /**
   * Check what this game has actually used against a target's real limits.
   *
   * Hardware budgets are reported here rather than enforced while you play:
   * a cap that silently drops sprites turns "too many objects" into "the
   * player disappeared", which tells you nothing. This tells you the number.
   */
  checkTarget(target: 'nes' | 'gameboy' | 'neogeo' | 'custom'): TargetReport {
    return JSON.parse(this.raw?.check_target(target) ?? '{}');
  }

  setScanlines(enabled: boolean) {
    if (this.raw) this.raw.set_scanlines(enabled);
  }

  setBgColor(r: number, g: number, b: number) {
    if (this.raw) this.raw.set_bg_color(r, g, b);
  }

  spawnSprite(x: number, y: number, sheet: number, frame: number, layer: number): bigint {
    return typeof this.raw!.spawn_sprite === 'function'
      ? BigInt(this.raw!.spawn_sprite(x, y, sheet, frame, layer))
      : 0n;
  }

  audioPlay(ch: number, freq: number, waveform: number, vol: number) {
    if (this.raw) this.raw.audio_play(ch, freq, waveform, vol);
  }

  audioStop(ch: number) {
    if (this.raw) this.raw.audio_stop(ch);
  }

  audioStopAll() {
    if (this.raw) this.raw.audio_stop_all();
  }

  shake(intensity: number, duration: number) {
    if (this.raw) this.raw.shake(intensity, duration);
  }

  // --- Internal tween/timer management ---

  _registerTween(tween: Tween): void {
    this._tweens.add(tween);
  }

  _unregisterTween(tween: Tween): void {
    this._tweens.delete(tween);
  }

  _registerTimer(timer: GameTimer): void {
    this._timers.add(timer);
  }

  _unregisterTimer(timer: GameTimer): void {
    this._timers.delete(timer);
  }
}
