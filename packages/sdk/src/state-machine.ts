export interface State<T extends string = string> {
  name: T;
  onEnter?: (from: T | null) => void;
  onExit?: (to: T) => void;
  onUpdate?: (dt: number) => void;
}

export class StateMachine<T extends string = string> {
  private states: Map<T, State<T>>;
  private _current: T;
  private _previous: T | null = null;

  constructor(states: State<T>[], initial: T) {
    this.states = new Map();
    for (const s of states) {
      this.states.set(s.name, s);
    }
    this._current = initial;

    const initialState = this.states.get(initial);
    if (initialState?.onEnter) {
      initialState.onEnter(null);
    }
  }

  transition(to: T): void {
    if (to === this._current) return;

    const currentState = this.states.get(this._current);
    if (currentState?.onExit) {
      currentState.onExit(to);
    }

    this._previous = this._current;
    this._current = to;

    const nextState = this.states.get(to);
    if (nextState?.onEnter) {
      nextState.onEnter(this._previous);
    }
  }

  update(dt: number): void {
    const state = this.states.get(this._current);
    if (state?.onUpdate) {
      state.onUpdate(dt);
    }
  }

  get current(): T {
    return this._current;
  }

  get previous(): T | null {
    return this._previous;
  }

  is(name: T): boolean {
    return this._current === name;
  }

  isOneOf(...names: T[]): boolean {
    return names.includes(this._current);
  }
}
