import { InputReader } from './input';
import { WaveformType, Preset, EngineConfig } from './types';
import type { Tween } from './tween';
import type { GameTimer } from './timer';

// WebEngine type to avoid importing from unbuilt WASM in TS
// It matches the methods exposed by wasm_bindgen
type WebEngine = any;

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

  // Managed tweens and timers
  private _tweens: Set<Tween> = new Set();
  private _timers: Set<GameTimer> = new Set();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.input = new InputReader();

    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.touchAction = 'none';
  }

  static async gameboy(canvas: HTMLCanvasElement, scale = 3): Promise<Cathode> {
    const eng = new Cathode(canvas);
    await eng._init('gameboy', scale);
    return eng;
  }

  static async nes(canvas: HTMLCanvasElement, scale = 3): Promise<Cathode> {
    const eng = new Cathode(canvas);
    await eng._init('nes', scale);
    return eng;
  }

  static async neogeo(canvas: HTMLCanvasElement, scale = 2): Promise<Cathode> {
    const eng = new Cathode(canvas);
    await eng._init('neogeo', scale);
    return eng;
  }

  static async custom(canvas: HTMLCanvasElement, config: EngineConfig, scale = 3): Promise<Cathode> {
    const eng = new Cathode(canvas);
    await eng._init('custom', scale, config);
    return eng;
  }

  protected async _init(preset: Preset, scale: number, config?: EngineConfig) {
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
    } else {
      this.raw = new this.wasmModule.WebEngine(JSON.stringify(config || {}));
    }

    this.input.attach(this.raw!);

    this.canvas.style.width = `${this.width * scale}px`;
    this.canvas.style.height = `${this.height * scale}px`;

    this.initAudio();
  }

  private initAudio() {
    const interactInit = () => {
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
      } else if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      window.removeEventListener('click', interactInit);
      window.removeEventListener('keydown', interactInit);
      window.removeEventListener('touchstart', interactInit);
    };

    window.addEventListener('click', interactInit);
    window.addEventListener('keydown', interactInit);
    window.addEventListener('touchstart', interactInit);
  }

  get width(): number { return this.raw?.resolution_w() ?? 0; }
  get height(): number { return this.raw?.resolution_h() ?? 0; }
  get fps(): number { return this.raw?.target_fps() ?? 60; }
  get isPaused(): boolean { return this.paused; }
  get entityCount(): number { return this.raw?.entity_count() ?? 0; }

  loop(cb: (dt: number) => void) {
    this.loopCb = cb;
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
