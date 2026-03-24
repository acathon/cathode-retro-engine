import { RetroEngine } from './engine';

export class MusicPlayer {
  constructor(private engine: RetroEngine) { }

  play(mml: string, bpm = 120): void {
    if (!this.engine.raw) return;
    this.engine.raw.sequencer_load_mml(mml, bpm);
    this.engine.raw.sequencer_play();
  }

  stop(): void {
    if (this.engine.raw) this.engine.raw.sequencer_stop();
  }

  pause(): void {
    if (this.engine.raw) this.engine.raw.sequencer_pause();
  }

  resume(): void {
    if (this.engine.raw) this.engine.raw.sequencer_play();
  }

  setBpm(bpm: number): void {
    if (this.engine.raw) this.engine.raw.sequencer_set_bpm(bpm);
  }
}
