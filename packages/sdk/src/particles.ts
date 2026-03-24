import { Scene } from './scene';
import { RetroEngine } from './engine';

export interface EmitConfig {
  angle?: number;
  spread?: number;
  speedMin?: number;
  speedMax?: number;
  lifeMin?: number;
  lifeMax?: number;
  sizeMin?: number;
  sizeMax?: number;
  gravity?: number;
  colorStart?: [number, number, number, number];
  colorEnd?: [number, number, number, number];
  fade?: boolean;
  shrink?: boolean;
}

function configToJson(config: EmitConfig = {}): string {
  return JSON.stringify({
    angle: config.angle ?? 0,
    spread: config.spread ?? Math.PI * 2,
    speed_min: config.speedMin ?? 20,
    speed_max: config.speedMax ?? 80,
    life_min: config.lifeMin ?? 0.5,
    life_max: config.lifeMax ?? 1.5,
    size_min: config.sizeMin ?? 1,
    size_max: config.sizeMax ?? 3,
    gravity: config.gravity ?? 0,
    color_start: config.colorStart ?? [255, 255, 255, 255],
    color_end: config.colorEnd ?? [255, 255, 255, 0],
    fade: config.fade ?? true,
    shrink: config.shrink ?? false,
  });
}

export class ParticleEmitter {
  private handle: number;
  private eng: RetroEngine;
  private _destroyed = false;

  constructor(scene: Scene, maxParticles = 200) {
    this.eng = scene.eng;
    this.handle = this.eng.raw!.create_emitter(maxParticles);
  }

  burst(x: number, y: number, count: number, config?: EmitConfig): void {
    if (this._destroyed) return;
    this.eng.raw!.emitter_burst(this.handle, x, y, count, configToJson(config));
  }

  emit(x: number, y: number, _rate: number, config?: EmitConfig): void {
    // For continuous emission, we burst 1 particle per call positioned correctly
    if (this._destroyed) return;
    this.eng.raw!.emitter_burst(this.handle, x, y, 1, configToJson(config));
  }

  stop(): void {
    // No-op for now; particles die naturally
  }

  destroy(): void {
    if (!this._destroyed) {
      this._destroyed = true;
      this.eng.raw!.destroy_emitter(this.handle);
    }
  }

  static explosion(scene: Scene, x: number, y: number): ParticleEmitter {
    const emitter = new ParticleEmitter(scene, 50);
    emitter.burst(x, y, 20, {
      spread: Math.PI * 2,
      speedMin: 60,
      speedMax: 150,
      lifeMin: 0.3,
      lifeMax: 0.8,
      sizeMin: 2,
      sizeMax: 4,
      gravity: 200,
      colorStart: [255, 150, 50, 255],
      colorEnd: [200, 30, 0, 0],
      fade: true,
      shrink: true,
    });
    return emitter;
  }

  static sparkle(scene: Scene, x: number, y: number, color?: [number, number, number]): ParticleEmitter {
    const c = color ?? [255, 255, 200];
    const emitter = new ParticleEmitter(scene, 20);
    emitter.burst(x, y, 8, {
      spread: Math.PI * 2,
      speedMin: 10,
      speedMax: 40,
      lifeMin: 0.5,
      lifeMax: 1.2,
      sizeMin: 1,
      sizeMax: 2,
      gravity: 0,
      colorStart: [c[0], c[1], c[2], 255],
      colorEnd: [c[0], c[1], c[2], 0],
      fade: true,
      shrink: false,
    });
    return emitter;
  }

  static dust(scene: Scene, x: number, y: number): ParticleEmitter {
    const emitter = new ParticleEmitter(scene, 20);
    emitter.burst(x, y, 5, {
      angle: -Math.PI / 2,
      spread: Math.PI / 6,
      speedMin: 15,
      speedMax: 40,
      lifeMin: 0.4,
      lifeMax: 0.9,
      sizeMin: 1,
      sizeMax: 2,
      gravity: 0,
      colorStart: [150, 150, 150, 200],
      colorEnd: [100, 100, 100, 0],
      fade: true,
      shrink: false,
    });
    return emitter;
  }

  static coin(scene: Scene, x: number, y: number): ParticleEmitter {
    const emitter = new ParticleEmitter(scene, 20);
    emitter.burst(x, y, 6, {
      angle: -Math.PI / 2,
      spread: Math.PI / 3,
      speedMin: 80,
      speedMax: 140,
      lifeMin: 0.3,
      lifeMax: 0.6,
      sizeMin: 1,
      sizeMax: 3,
      gravity: 400,
      colorStart: [255, 220, 50, 255],
      colorEnd: [255, 180, 0, 100],
      fade: true,
      shrink: false,
    });
    return emitter;
  }
}
