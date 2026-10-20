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

  /**
   * The buttons each player's game has read, in the order it first asked.
   *
   * This is how on-screen controls know what to draw without any setup: a
   * title screen that only reads `start` shows only START, and the d-pad
   * appears the first time the game checks a direction.
   */
  private asked: Record<PlayerIndex, Set<ButtonName>> = { 0: new Set(), 1: new Set() };
  private askListeners = new Set<(player: PlayerIndex, btn: ButtonName) => void>();

  /**
   * The on-screen controls drawing into this reader, if any. A second set
   * replaces the first, so a game that builds its own overlay quietly takes
   * over from the one the engine adds on touch devices.
   */
  touch: { destroy(): void } | null = null;

  private keymap: Record<string, [PlayerIndex, ButtonName]> = {
    'ArrowUp': [0, 'up'],
    'ArrowDown': [0, 'down'],
    'ArrowLeft': [0, 'left'],
    'ArrowRight': [0, 'right'],
    'z': [0, 'a'],
    'x': [0, 'b'],
    'a': [0, 'x'],
    's': [0, 'y'],
    ' ': [0, 'a'],
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

  /**
   * Call `fn` for every button a player's game reads, starting with the ones
   * it already has. Returns a function that stops the calls.
   */
  onAsk(fn: (player: PlayerIndex, btn: ButtonName) => void): () => void {
    for (const p of [0, 1] as PlayerIndex[]) for (const btn of this.asked[p]) fn(p, btn);
    this.askListeners.add(fn);
    return () => this.askListeners.delete(fn);
  }

  /** The buttons a player's game has read so far. */
  askedFor(player: PlayerIndex): ReadonlySet<ButtonName> {
    return this.asked[player];
  }

  private note(player: PlayerIndex, btn: ButtonName) {
    if (this.asked[player].has(btn)) return;
    this.asked[player].add(btn);
    for (const fn of this.askListeners) fn(player, btn);
  }

  held(player: PlayerIndex, btn: ButtonName): boolean {
    this.note(player, btn);
    return this.states[player][btn];
  }

  justPressed(player: PlayerIndex, btn: ButtonName): boolean {
    this.note(player, btn);
    return this.states[player][btn] && !this.prevStates[player][btn];
  }

  justReleased(player: PlayerIndex, btn: ButtonName): boolean {
    this.note(player, btn);
    return !this.states[player][btn] && this.prevStates[player][btn];
  }
}
