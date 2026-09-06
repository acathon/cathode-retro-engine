import { describe, expect, it } from 'vitest';
import { Interpreter } from '../src/interpreter';
import type { Actor, Host } from '../src/interpreter';
import type { BlockProgram, KeyName, Stmt } from '../src/program';

/** A stand-in sprite that records what the blocks did to it. */
class FakeActor implements Actor {
  x = 0;
  y = 0;
  velocityX = 0;
  velocityY = 0;
  visible = true;
  frame = 0;
  flipX = false;
  grounded = false;
  touching = new Set<string>();

  constructor(public name = 'player') {}

  setPosition(x: number, y: number) { this.x = x; this.y = y; }
  setVelocity(vx: number, vy: number) { this.velocityX = vx; this.velocityY = vy; }
  setFrame(f: number) { this.frame = f; }
  setFlip(f: boolean) { this.flipX = f; }
  setVisible(v: boolean) { this.visible = v; }
  isGrounded() { return this.grounded; }
  overlaps(other: Actor) {
    return this.touching.has((other as FakeActor).name);
  }
}

class FakeHost implements Host {
  held = new Set<KeyName>();
  pressed = new Set<KeyName>();
  sounds: { freq: number; waveform: string }[] = [];
  actors = new Map<string, FakeActor>();

  keyHeld(k: KeyName) { return this.held.has(k); }
  keyJustPressed(k: KeyName) { return this.pressed.has(k); }
  playSound(freq: number, waveform: string) { this.sounds.push({ freq, waveform }); }
  actor(name: string) { return this.actors.get(name); }
}

const num = (value: number) => ({ kind: 'num' as const, value });

function setup(scripts: { hat: BlockProgram['sprites'][0]['scripts'][0]['hat']; body: Stmt[] }[],
                variables: Record<string, number> = {}) {
  const actor = new FakeActor('player');
  const host = new FakeHost();
  host.actors.set('player', actor);
  const program: BlockProgram = {
    sprites: [{ name: 'player', sheet: 0, frame: 0, x: 0, y: 0, scripts }],
    variables,
  };
  return { actor, host, interp: new Interpreter(program, host) };
}

describe('event hats', () => {
  it('runs an onStart stack exactly once', () => {
    const { actor, interp } = setup([
      { hat: { kind: 'onStart' }, body: [{ kind: 'changeVar', name: 'n', by: num(1) }] },
    ], { n: 0 });

    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);
    interp.tick(0.016);
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);
    expect(actor.x).toBe(0);
  });

  it('reset re-arms onStart', () => {
    const { interp } = setup([
      { hat: { kind: 'onStart' }, body: [{ kind: 'changeVar', name: 'n', by: num(1) }] },
    ], { n: 0 });

    interp.tick(0.016);
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);

    interp.reset();
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);
  });

  it('runs everyFrame on every tick', () => {
    const { interp } = setup([
      { hat: { kind: 'everyFrame' }, body: [{ kind: 'changeVar', name: 'n', by: num(1) }] },
    ], { n: 0 });

    interp.tick(0.016);
    interp.tick(0.016);
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(3);
  });

  it('runs onKey only while the key is held', () => {
    const { host, interp } = setup([
      { hat: { kind: 'onKey', key: 'right' }, body: [{ kind: 'changeVar', name: 'n', by: num(1) }] },
    ], { n: 0 });

    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(0);

    host.held.add('right');
    interp.tick(0.016);
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(2);

    host.held.delete('right');
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(2);
  });

  it('runs onKeyPressed only on the edge', () => {
    const { host, interp } = setup([
      { hat: { kind: 'onKeyPressed', key: 'a' }, body: [{ kind: 'changeVar', name: 'n', by: num(1) }] },
    ], { n: 0 });

    host.pressed.add('a');
    interp.tick(0.016);
    host.pressed.delete('a');
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);
  });
});

describe('motion blocks', () => {
  it('move offsets the sprite', () => {
    const { actor, interp } = setup([
      { hat: { kind: 'everyFrame' }, body: [{ kind: 'move', dx: num(3), dy: num(-2) }] },
    ]);
    interp.tick(0.016);
    expect([actor.x, actor.y]).toEqual([3, -2]);
  });

  it('setVelocity writes both axes', () => {
    const { actor, interp } = setup([
      { hat: { kind: 'everyFrame' }, body: [{ kind: 'setVelocity', vx: num(50), vy: num(0) }] },
    ]);
    interp.tick(0.016);
    expect(actor.velocityX).toBe(50);
  });

  it('jump only fires when grounded', () => {
    const { actor, interp } = setup([
      { hat: { kind: 'everyFrame' }, body: [{ kind: 'jump', strength: num(200) }] },
    ]);

    actor.grounded = false;
    interp.tick(0.016);
    expect(actor.velocityY).toBe(0);

    actor.grounded = true;
    interp.tick(0.016);
    expect(actor.velocityY).toBe(-200);
  });

  it('goTo teleports', () => {
    const { actor, interp } = setup([
      { hat: { kind: 'everyFrame' }, body: [{ kind: 'goTo', x: num(40), y: num(10) }] },
    ]);
    interp.tick(0.016);
    expect([actor.x, actor.y]).toEqual([40, 10]);
  });
});

describe('control blocks', () => {
  it('if runs only when the condition holds', () => {
    const body: Stmt[] = [
      {
        kind: 'if',
        cond: { kind: 'keyPressed', key: 'right' },
        then: [{ kind: 'changeVar', name: 'n', by: num(1) }],
      },
    ];
    const { host, interp } = setup([{ hat: { kind: 'everyFrame' }, body }], { n: 0 });

    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(0);
    host.held.add('right');
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);
  });

  it('if/else takes the other branch', () => {
    const body: Stmt[] = [
      {
        kind: 'if',
        cond: { kind: 'bool', value: false },
        then: [{ kind: 'setVar', name: 'n', value: num(1) }],
        else: [{ kind: 'setVar', name: 'n', value: num(2) }],
      },
    ];
    const { interp } = setup([{ hat: { kind: 'everyFrame' }, body }], { n: 0 });
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(2);
  });

  it('repeat loops the given number of times', () => {
    const { interp } = setup([
      {
        hat: { kind: 'onStart' },
        body: [{ kind: 'repeat', times: num(5), body: [{ kind: 'changeVar', name: 'n', by: num(2) }] }],
      },
    ], { n: 0 });
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(10);
  });

  it('repeat is bounded so a huge count cannot hang the editor', () => {
    const { interp } = setup([
      {
        hat: { kind: 'onStart' },
        body: [{ kind: 'repeat', times: num(1e9), body: [{ kind: 'changeVar', name: 'n', by: num(1) }] }],
      },
    ], { n: 0 });
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(10000);
  });

  it('forever runs one pass per frame rather than looping forever', () => {
    const { interp } = setup([
      {
        hat: { kind: 'everyFrame' },
        body: [{ kind: 'forever', body: [{ kind: 'changeVar', name: 'n', by: num(1) }] }],
      },
    ], { n: 0 });

    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(2);
  });

  it('wait parks the rest of the stack until the timer expires', () => {
    const body: Stmt[] = [
      { kind: 'changeVar', name: 'before', by: num(1) },
      { kind: 'wait', seconds: num(0.1) },
      { kind: 'changeVar', name: 'after', by: num(1) },
    ];
    const { interp } = setup([{ hat: { kind: 'everyFrame' }, body }], { before: 0, after: 0 });

    interp.tick(0.05);
    expect(interp.getVariable('before')).toBe(1);
    expect(interp.getVariable('after')).toBe(0);

    interp.tick(0.05);
    expect(interp.getVariable('after')).toBe(0);

    interp.tick(0.05);
    expect(interp.getVariable('after')).toBeGreaterThan(0);
  });

  it('resumes after a wait instead of restarting the stack', () => {
    // Regression: the interpreter used to re-run a woken stack from the top,
    // so anything after a `wait` never executed at all.
    const body: Stmt[] = [
      { kind: 'changeVar', name: 'before', by: num(1) },
      { kind: 'wait', seconds: num(0.1) },
      { kind: 'changeVar', name: 'after', by: num(1) },
    ];
    const { interp } = setup([{ hat: { kind: 'onStart' }, body }], { before: 0, after: 0 });

    interp.tick(0.05);
    expect(interp.getVariable('before')).toBe(1);
    expect(interp.getVariable('after')).toBe(0);

    // The tick that starts the wait does not count against it, so two more
    // 0.06s frames are what actually drains the 0.1s timer.
    interp.tick(0.06);
    expect(interp.getVariable('after')).toBe(0);
    interp.tick(0.06);

    expect(interp.getVariable('after')).toBe(1);
    expect(interp.getVariable('before')).toBe(1);
  });

  it('a forever loop keeps running across frames and can contain a wait', () => {
    const body: Stmt[] = [
      {
        kind: 'forever',
        body: [
          { kind: 'changeVar', name: 'n', by: num(1) },
          { kind: 'wait', seconds: num(0.1) },
        ],
      },
    ];
    const { interp } = setup([{ hat: { kind: 'onStart' }, body }], { n: 0 });

    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);

    // Still waiting out the 0.1s.
    interp.tick(0.03);
    expect(interp.getVariable('n')).toBe(1);

    // Timer expires, the loop comes back round.
    interp.tick(0.09);
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(2);
  });

  it('a bare forever yields each frame rather than hanging', () => {
    const body: Stmt[] = [
      { kind: 'forever', body: [{ kind: 'changeVar', name: 'n', by: num(1) }] },
    ];
    const { interp } = setup([{ hat: { kind: 'onStart' }, body }], { n: 0 });

    interp.tick(0.016);
    interp.tick(0.016);
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(3);
  });

  it('stop ends the stack early', () => {
    const body: Stmt[] = [
      { kind: 'changeVar', name: 'n', by: num(1) },
      { kind: 'stop' },
      { kind: 'changeVar', name: 'n', by: num(100) },
    ];
    const { interp } = setup([{ hat: { kind: 'everyFrame' }, body }], { n: 0 });
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);
  });
});

describe('expressions', () => {
  it('evaluates arithmetic and comparison', () => {
    const { interp } = setup([
      {
        hat: { kind: 'onStart' },
        body: [
          {
            kind: 'setVar',
            name: 'n',
            value: { kind: 'binary', op: '*', left: num(6), right: num(7) },
          },
        ],
      },
    ], { n: 0 });
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(42);
  });

  it('division by zero yields 0 rather than Infinity', () => {
    const { interp } = setup([
      {
        hat: { kind: 'onStart' },
        body: [
          { kind: 'setVar', name: 'n', value: { kind: 'binary', op: '/', left: num(1), right: num(0) } },
        ],
      },
    ], { n: 0 });
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(0);
  });

  it('reads sensing blocks', () => {
    const { actor, interp } = setup([
      {
        hat: { kind: 'everyFrame' },
        body: [{ kind: 'if', cond: { kind: 'grounded' }, then: [{ kind: 'changeVar', name: 'n', by: num(1) }] }],
      },
    ], { n: 0 });

    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(0);
    actor.grounded = true;
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);
  });

  it('touching reports overlap with a named sprite', () => {
    const actor = new FakeActor('player');
    const coin = new FakeActor('coin');
    const host = new FakeHost();
    host.actors.set('player', actor);
    host.actors.set('coin', coin);

    const interp = new Interpreter(
      {
        sprites: [{
          name: 'player', sheet: 0, frame: 0, x: 0, y: 0,
          scripts: [{
            hat: { kind: 'everyFrame' },
            body: [{ kind: 'if', cond: { kind: 'touching', target: 'coin' }, then: [{ kind: 'changeVar', name: 'n', by: num(1) }] }],
          }],
        }],
        variables: { n: 0 },
      },
      host,
    );

    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(0);

    actor.touching.add('coin');
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);
  });

  it('touching an unknown sprite is false, not a crash', () => {
    const { interp } = setup([
      {
        hat: { kind: 'everyFrame' },
        body: [{ kind: 'if', cond: { kind: 'touching', target: 'ghost' }, then: [{ kind: 'changeVar', name: 'n', by: num(1) }] }],
      },
    ], { n: 0 });
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(0);
  });
});

describe('sound and looks', () => {
  it('playSound reaches the host', () => {
    const { host, interp } = setup([
      { hat: { kind: 'onStart' }, body: [{ kind: 'playSound', freq: num(440), waveform: 'triangle' }] },
    ]);
    interp.tick(0.016);
    expect(host.sounds).toEqual([{ freq: 440, waveform: 'triangle' }]);
  });

  it('show and hide toggle visibility', () => {
    const { actor, interp } = setup([
      { hat: { kind: 'onStart' }, body: [{ kind: 'hide' }] },
    ]);
    interp.tick(0.016);
    expect(actor.visible).toBe(false);
  });
});

describe('robustness', () => {
  it('a sprite with no matching actor is skipped', () => {
    const host = new FakeHost(); // no actors registered
    const interp = new Interpreter(
      {
        sprites: [{
          name: 'missing', sheet: 0, frame: 0, x: 0, y: 0,
          scripts: [{ hat: { kind: 'everyFrame' }, body: [{ kind: 'changeVar', name: 'n', by: num(1) }] }],
        }],
        variables: { n: 0 },
      },
      host,
    );

    expect(() => interp.tick(0.016)).not.toThrow();
    expect(interp.getVariable('n')).toBe(0);
  });

  it('an empty program ticks harmlessly', () => {
    const interp = new Interpreter({ sprites: [], variables: {} }, new FakeHost());
    expect(() => interp.tick(0.016)).not.toThrow();
  });
});
