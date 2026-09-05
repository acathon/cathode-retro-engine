import type {
  BlockProgram,
  Expr,
  Hat,
  KeyName,
  Script,
  SpriteProgram,
  Stmt,
} from './program';

/**
 * What the interpreter needs from the outside world.
 *
 * Keeping this an interface rather than reaching for the SDK directly means
 * the block language can be tested without a browser, a canvas or a wasm
 * build — the editor passes a real adapter, the tests pass a fake one.
 */
export interface Actor {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  visible: boolean;
  setPosition(x: number, y: number): void;
  setVelocity(vx: number, vy: number): void;
  setFrame(frame: number): void;
  setFlip(flipX: boolean): void;
  setVisible(visible: boolean): void;
  /** True when the engine has zeroed the fall speed, i.e. standing on something. */
  isGrounded(): boolean;
  overlaps(other: Actor): boolean;
}

export interface Host {
  keyHeld(key: KeyName): boolean;
  keyJustPressed(key: KeyName): boolean;
  playSound(freq: number, waveform: string): void;
  actor(name: string): Actor | undefined;
}

/** A script that is mid-flight: its generator, plus any time left to wait. */
interface Running {
  gen: Generator<number, void, void>;
  sleep: number;
}

class StopSignal extends Error {
  constructor() {
    super('stop');
    this.name = 'StopSignal';
  }
}

/**
 * Runs a BlockProgram frame by frame.
 *
 * Each stack executes as a generator that yields the number of seconds it
 * wants to pause for, so `wait` suspends mid-stack and resumes exactly where
 * it left off on a later frame — the way a Scratch script behaves. `forever`
 * is a real loop that yields once per pass, so it never blocks the frame.
 */
export class Interpreter {
  private vars: Record<string, number>;
  private running = new Map<string, Running>();
  private started = false;

  constructor(
    private program: BlockProgram,
    private host: Host,
  ) {
    this.vars = { ...program.variables };
  }

  /** Current value of every variable — what a HUD would display. */
  get variables(): Record<string, number> {
    return { ...this.vars };
  }

  getVariable(name: string): number {
    return this.vars[name] ?? 0;
  }

  /** Re-arm the program: onStart hats fire again on the next tick. */
  reset(): void {
    this.vars = { ...this.program.variables };
    this.running.clear();
    this.started = false;
  }

  tick(dt: number): void {
    for (const sprite of this.program.sprites) {
      const actor = this.host.actor(sprite.name);
      if (!actor) continue;

      for (let i = 0; i < sprite.scripts.length; i++) {
        const script = sprite.scripts[i];
        const key = `${sprite.name}#${i}`;
        const active = this.running.get(key);

        if (active) {
          // Already mid-stack: let its wait run down, then resume it.
          active.sleep -= dt;
          if (active.sleep > 0) continue;
          this.advance(key, active, actor);
          continue;
        }

        if (!this.shouldRun(script.hat)) continue;

        const entry: Running = {
          gen: this.execBody(script.body, actor),
          sleep: 0,
        };
        this.advance(key, entry, actor);
      }
    }

    this.started = true;
  }

  /** Push a script forward one step, retiring it when it finishes. */
  private advance(key: string, entry: Running, _actor: Actor): void {
    try {
      const step = entry.gen.next();
      if (step.done) {
        this.running.delete(key);
        return;
      }
      entry.sleep = step.value;
      this.running.set(key, entry);
    } catch (err) {
      this.running.delete(key);
      if (!(err instanceof StopSignal)) throw err;
    }
  }

  private shouldRun(hat: Hat): boolean {
    switch (hat.kind) {
      case 'onStart':
        return !this.started;
      case 'everyFrame':
        return true;
      case 'onKey':
        return this.host.keyHeld(hat.key);
      case 'onKeyPressed':
        return this.host.keyJustPressed(hat.key);
    }
  }

  private *execBody(body: Stmt[], actor: Actor): Generator<number, void, void> {
    for (const stmt of body) {
      yield* this.execStmt(stmt, actor);
    }
  }

  private *execStmt(stmt: Stmt, actor: Actor): Generator<number, void, void> {
    switch (stmt.kind) {
      case 'move':
        actor.setPosition(
          actor.x + this.num(stmt.dx, actor),
          actor.y + this.num(stmt.dy, actor),
        );
        break;

      case 'setVelocity':
        actor.setVelocity(this.num(stmt.vx, actor), this.num(stmt.vy, actor));
        break;

      case 'jump':
        // Only launches off the ground, which is what a player expects and
        // saves every project from re-implementing the same check.
        if (actor.isGrounded()) {
          actor.setVelocity(actor.velocityX, -this.num(stmt.strength, actor));
        }
        break;

      case 'goTo':
        actor.setPosition(this.num(stmt.x, actor), this.num(stmt.y, actor));
        break;

      case 'setFrame':
        actor.setFrame(Math.round(this.num(stmt.frame, actor)));
        break;

      case 'setFlip':
        actor.setFlip(this.bool(stmt.flipX, actor));
        break;

      case 'show':
        actor.setVisible(true);
        break;

      case 'hide':
        actor.setVisible(false);
        break;

      case 'playSound':
        this.host.playSound(this.num(stmt.freq, actor), stmt.waveform);
        break;

      case 'setVar':
        this.vars[stmt.name] = this.num(stmt.value, actor);
        break;

      case 'changeVar':
        this.vars[stmt.name] = (this.vars[stmt.name] ?? 0) + this.num(stmt.by, actor);
        break;

      case 'if':
        if (this.bool(stmt.cond, actor)) {
          yield* this.execBody(stmt.then, actor);
        } else if (stmt.else) {
          yield* this.execBody(stmt.else, actor);
        }
        break;

      case 'repeat': {
        // Bounded so a runaway count can't freeze the editor's preview.
        const times = Math.min(Math.max(0, Math.round(this.num(stmt.times, actor))), 10000);
        for (let i = 0; i < times; i++) {
          yield* this.execBody(stmt.body, actor);
        }
        break;
      }

      case 'forever':
        // A real loop, but it yields after every pass, so the frame ends and
        // the stack resumes here next tick instead of hanging.
        for (;;) {
          yield* this.execBody(stmt.body, actor);
          yield 0;
        }

      case 'wait':
        yield this.num(stmt.seconds, actor);
        break;

      case 'stop':
        throw new StopSignal();
    }
  }

  private num(expr: Expr, actor: Actor): number {
    const v = this.eval(expr, actor);
    return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0;
  }

  private bool(expr: Expr, actor: Actor): boolean {
    const v = this.eval(expr, actor);
    return typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : Boolean(v);
  }

  private eval(expr: Expr, actor: Actor): number | string | boolean {
    switch (expr.kind) {
      case 'num':
      case 'str':
      case 'bool':
        return expr.value;
      case 'var':
        return this.vars[expr.name] ?? 0;
      case 'keyPressed':
        return this.host.keyHeld(expr.key);
      case 'grounded':
        return actor.isGrounded();
      case 'touching': {
        const other = this.host.actor(expr.target);
        return other ? actor.overlaps(other) : false;
      }
      case 'not':
        return !this.bool(expr.value, actor);
      case 'binary': {
        const l = this.eval(expr.left, actor);
        const r = this.eval(expr.right, actor);
        switch (expr.op) {
          case '+': return Number(l) + Number(r);
          case '-': return Number(l) - Number(r);
          case '*': return Number(l) * Number(r);
          case '/': return Number(r) === 0 ? 0 : Number(l) / Number(r);
          case '<': return Number(l) < Number(r);
          case '>': return Number(l) > Number(r);
          case '=': return l === r;
          case 'and': return Boolean(l) && Boolean(r);
          case 'or': return Boolean(l) || Boolean(r);
        }
      }
    }
  }
}

export type { Script, SpriteProgram };
