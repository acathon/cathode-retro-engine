import type { PlayerIndex, ButtonName } from './types';

// Dummy WebEngine import to make TS happy before WASM loads
type WebEngine = any;

export class InputReader {
  private wasm: WebEngine | null = null;
  private states: Record<PlayerIndex, Record<ButtonName, boolean>> = {
    0: { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, start: false, select: false, l: false, r: false },
    1: { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, start: false, select: false, l: false, r: false },
  };
  private prevStates: Record<PlayerIndex, Record<ButtonName, boolean>> = {
    0: { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, start: false, select: false, l: false, r: false },
    1: { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, start: false, select: false, l: false, r: false },
  };

  private keymap: Record<string, [PlayerIndex, ButtonName]> = {
    'ArrowUp': [0, 'up'],
    'ArrowDown': [0, 'down'],
    'ArrowLeft': [0, 'left'],
    'ArrowRight': [0, 'right'],
    'z': [0, 'a'],
    'x': [0, 'b'],
    'a': [0, 'x'],
    's': [0, 'y'],
    'Enter': [0, 'start'],
    'Backspace': [0, 'select'],
    'q': [0, 'l'],
    'w': [0, 'r'],
  };

  attach(wasm: WebEngine) {
    this.wasm = wasm;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach() {
    this.wasm = null;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const mapped = this.keymap[e.key];
    if (mapped) {
      e.preventDefault();
      const [player, btn] = mapped;
      this.states[player][btn] = true;
      this.sync(player);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const mapped = this.keymap[e.key];
    if (mapped) {
      e.preventDefault();
      const [player, btn] = mapped;
      this.states[player][btn] = false;
      this.sync(player);
    }
  };

  setState(player: PlayerIndex, partial: Partial<Record<ButtonName, boolean>>) {
    this.states[player] = { ...this.states[player], ...partial };
    this.sync(player);
  }

  private sync(player: PlayerIndex) {
    if (this.wasm) {
      this.wasm.set_input(player, JSON.stringify(this.states[player]));
    }
  }

  snapshot() {
    for (const p of [0, 1] as PlayerIndex[]) {
      this.prevStates[p] = { ...this.states[p] };
    }
  }

  held(player: PlayerIndex, btn: ButtonName): boolean {
    return this.states[player][btn];
  }

  justPressed(player: PlayerIndex, btn: ButtonName): boolean {
    return this.states[player][btn] && !this.prevStates[player][btn];
  }

  justReleased(player: PlayerIndex, btn: ButtonName): boolean {
    return !this.states[player][btn] && this.prevStates[player][btn];
  }
}
