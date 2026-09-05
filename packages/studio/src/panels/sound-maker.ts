/**
 * Chiptune workbench.
 *
 * Drives the engine's real synthesiser: waveform and ADSR go straight to the
 * audio channel, and the 16-step pattern is compiled to MML and handed to the
 * engine sequencer — the same path a game uses for its music.
 */
import type { RetroEngine } from '@retro-engine/sdk';
import type { StudioSound } from '../project';

const NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'G5'];

const NOTE_HZ: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0,
  A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
};

export interface SoundMakerHooks {
  engine(): RetroEngine | null;
  onChange(): void;
  log(message: string): void;
}

export class SoundMaker {
  private scope = document.getElementById('snd-scope') as HTMLCanvasElement;
  private grid = document.getElementById('seq-grid') as HTMLDivElement;
  private status = document.getElementById('snd-status') as HTMLSpanElement;
  private ctx = this.scope.getContext('2d')!;

  private playing = false;
  private step = 0;
  private stepTimer: number | null = null;

  constructor(
    private sound: StudioSound,
    private hooks: SoundMakerHooks,
  ) {
    this.bindControls();
    this.buildGrid();
    this.syncInputs();
    this.drawScope();
  }

  setSound(sound: StudioSound): void {
    this.sound = sound;
    this.buildGrid();
    this.syncInputs();
    this.drawScope();
  }

  private input(id: string): HTMLInputElement {
    return document.getElementById(id) as HTMLInputElement;
  }

  private bindControls(): void {
    const wave = document.getElementById('snd-wave') as HTMLSelectElement;
    wave.addEventListener('change', () => {
      this.sound.waveform = wave.value;
      this.drawScope();
      this.hooks.onChange();
    });

    const sliders: [string, keyof StudioSound][] = [
      ['snd-a', 'attack'], ['snd-d', 'decay'],
      ['snd-s', 'sustain'], ['snd-r', 'release'], ['snd-bpm', 'bpm'],
    ];

    for (const [id, key] of sliders) {
      this.input(id).addEventListener('input', () => {
        (this.sound[key] as number) = Number(this.input(id).value);
        this.syncOutputs();
        this.drawScope();
        this.hooks.onChange();
      });
    }

    document.getElementById('snd-preview')?.addEventListener('click', () => this.previewNote());
    document.getElementById('snd-playpattern')?.addEventListener('click', () => this.playPattern());
    document.getElementById('snd-stop')?.addEventListener('click', () => this.stop());
  }

  private syncInputs(): void {
    (document.getElementById('snd-wave') as HTMLSelectElement).value = this.sound.waveform;
    this.input('snd-a').value = String(this.sound.attack);
    this.input('snd-d').value = String(this.sound.decay);
    this.input('snd-s').value = String(this.sound.sustain);
    this.input('snd-r').value = String(this.sound.release);
    this.input('snd-bpm').value = String(this.sound.bpm);
    this.syncOutputs();
  }

  private syncOutputs(): void {
    const set = (id: string, value: string) => {
      const out = document.getElementById(id);
      if (out) out.textContent = value;
    };
    set('out-a', `${this.sound.attack.toFixed(3)}s`);
    set('out-d', `${this.sound.decay.toFixed(3)}s`);
    set('out-s', this.sound.sustain.toFixed(2));
    set('out-r', `${this.sound.release.toFixed(2)}s`);
    set('out-bpm', String(this.sound.bpm));
  }

  private buildGrid(): void {
    this.grid.innerHTML = '';
    this.sound.steps.forEach((note, index) => {
      const cell = document.createElement('button');
      cell.className = `seq-cell${note ? ' on' : ''}${index % 4 === 0 ? ' beat' : ''}`;
      cell.textContent = note ?? '·';
      cell.dataset.step = String(index);
      cell.title = 'Click to cycle the note, right-click to clear';

      cell.addEventListener('click', () => {
        // Cycle up the scale, then wrap back to a rest.
        const current = this.sound.steps[index];
        const at = current ? NOTES.indexOf(current) : -1;
        const next = at + 1 >= NOTES.length ? null : NOTES[at + 1];
        this.sound.steps[index] = next;
        this.buildGrid();
        this.hooks.onChange();
        if (next) this.playNote(next);
      });

      cell.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        this.sound.steps[index] = null;
        this.buildGrid();
        this.hooks.onChange();
      });

      this.grid.appendChild(cell);
    });
  }

  /** Apply the current envelope and waveform to a channel, then strike a note. */
  private playNote(note: string): void {
    const engine = this.hooks.engine();
    if (!engine?.raw) {
      this.status.textContent = 'Press ▶ once to start the engine, then sound works.';
      return;
    }

    const waveIds: Record<string, number> = {
      pulse25: 0, pulse50: 1, triangle: 2, sawtooth: 3, noise: 4, sine: 5,
    };

    engine.raw.audio_set_envelope(0, this.sound.attack, this.sound.decay, this.sound.sustain, this.sound.release);
    engine.raw.audio_play(0, NOTE_HZ[note] ?? 440, waveIds[this.sound.waveform] ?? 1, 0.5);
    window.setTimeout(() => engine.raw.audio_stop(0), 220);
    this.status.textContent = `${note} · ${this.sound.waveform}`;
  }

  private previewNote(): void {
    this.playNote('C4');
  }

  /** Compile the pattern to MML and hand it to the engine sequencer. */
  private toMml(): string {
    return this.sound.steps.map((n) => (n ? `${n}:8` : 'REST:8')).join(' ');
  }

  private playPattern(): void {
    const engine = this.hooks.engine();
    if (!engine?.raw) {
      this.status.textContent = 'Press ▶ once to start the engine, then sound works.';
      return;
    }

    engine.raw.audio_set_envelope(0, this.sound.attack, this.sound.decay, this.sound.sustain, this.sound.release);
    engine.raw.sequencer_load_mml(this.toMml(), this.sound.bpm);
    engine.raw.sequencer_play();

    this.playing = true;
    this.step = 0;
    this.hooks.log(`Sequencer: ${this.toMml()}`);
    this.status.textContent = `Playing at ${this.sound.bpm} BPM`;

    // Mirror the sequencer's timing so the grid shows where it is.
    const stepMs = (60_000 / this.sound.bpm) / 2;
    if (this.stepTimer !== null) window.clearInterval(this.stepTimer);
    this.stepTimer = window.setInterval(() => {
      this.grid.querySelectorAll('.seq-cell').forEach((n, i) => {
        n.classList.toggle('playing', i === this.step);
      });
      this.step = (this.step + 1) % this.sound.steps.length;
    }, stepMs);
  }

  stop(): void {
    const engine = this.hooks.engine();
    engine?.raw?.sequencer_stop?.();
    engine?.raw?.audio_stop_all?.();
    this.playing = false;
    if (this.stepTimer !== null) {
      window.clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
    this.grid.querySelectorAll('.seq-cell').forEach((n) => n.classList.remove('playing'));
    this.status.textContent = 'Stopped.';
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Draw one cycle of the waveform with the ADSR contour over it. */
  private drawScope(): void {
    const { width: w, height: h } = this.scope;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = '#2b313a';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Waveform, three cycles across the scope.
    ctx.strokeStyle = '#5fb2e8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let noiseState = 1;
    for (let x = 0; x < w; x++) {
      const phase = ((x / w) * 3) % 1;
      let v: number;
      switch (this.sound.waveform) {
        case 'pulse25': v = phase < 0.25 ? 1 : -1; break;
        case 'triangle': v = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase; break;
        case 'sawtooth': v = 2 * phase - 1; break;
        case 'sine': v = Math.sin(phase * Math.PI * 2); break;
        case 'noise': {
          const bit = (noiseState ^ (noiseState >> 1)) & 1;
          noiseState = (noiseState >> 1) | (bit << 14);
          v = (noiseState & 1) === 1 ? 1 : -1;
          break;
        }
        default: v = phase < 0.5 ? 1 : -1;
      }
      const y = h / 2 - v * (h / 2 - 8);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ADSR contour.
    const total = this.sound.attack + this.sound.decay + 0.3 + this.sound.release;
    const px = (t: number) => (t / total) * w;
    ctx.strokeStyle = '#ffca6a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, h - 4);
    ctx.lineTo(px(this.sound.attack), 4);
    ctx.lineTo(px(this.sound.attack + this.sound.decay), h - 4 - this.sound.sustain * (h - 8));
    ctx.lineTo(px(this.sound.attack + this.sound.decay + 0.3), h - 4 - this.sound.sustain * (h - 8));
    ctx.lineTo(w, h - 4);
    ctx.stroke();
  }
}
