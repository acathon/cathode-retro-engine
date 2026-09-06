import { describe, expect, it } from 'vitest';
import { Interpreter } from '../src/interpreter';
import type { Actor, Host, RaycastView } from '../src/interpreter';
import { generateTypeScript } from '../src/codegen';
import type { BlockProgram, KeyName, Stmt } from '../src/program';

const num = (value: number) => ({ kind: 'num' as const, value });

class StubActor implements Actor {
  x = 0; y = 0; velocityX = 0; velocityY = 0; visible = true;
  setPosition() {} setVelocity() {} setFrame() {} setFlip() {} setVisible() {}
  isGrounded() { return false; }
  overlaps() { return false; }
}

/** Records what the raycaster blocks asked the camera to do. */
class StubView implements RaycastView {
  x = 2.5; y = 2.5; angle = 0;
  fog = 10;
  wall = 5;
  moves: [number, number, number][] = [];

  move(forward: number, strafe: number, turn: number) {
    this.moves.push([forward, strafe, turn]);
    this.x += forward * 0.1;
    this.angle += turn * 0.1;
  }
  teleport(x: number, y: number, angle: number) { this.x = x; this.y = y; this.angle = angle; }
  setFog(distance: number) { this.fog = distance; }
  wallDistance() { return this.wall; }
}

/**
 * Build an interpreter around one stack. `view` is passed explicitly rather
 * than defaulted: a default would swallow an intentional `undefined`, which
 * is exactly the case the no-camera test needs to exercise.
 */
function setup(body: Stmt[], view: RaycastView | undefined) {
  const actor = new StubActor();
  const host: Host = {
    keyHeld: (_k: KeyName) => false,
    keyJustPressed: (_k: KeyName) => false,
    playSound: () => {},
    actor: () => actor,
    raycast: () => view,
  };
  const program: BlockProgram = {
    sprites: [{ name: 'camera', sheet: 0, frame: 0, x: 0, y: 0, scripts: [{ hat: { kind: 'everyFrame' }, body }] }],
    variables: { n: 0 },
  };
  return { interp: new Interpreter(program, host), view: view as StubView };
}

describe('first-person movement blocks', () => {
  it('walk drives the camera forward', () => {
    const { interp, view } = setup([{ kind: 'rcMove', speed: num(1) }], new StubView());
    interp.tick(0.016);
    expect(view.moves).toEqual([[1, 0, 0]]);
  });

  it('strafe and turn use their own axes', () => {
    const { interp, view } = setup([
      { kind: 'rcStrafe', speed: num(1) },
      { kind: 'rcTurn', speed: num(-1) },
    ], new StubView());
    interp.tick(0.016);
    expect(view.moves).toEqual([[0, 1, 0], [0, 0, -1]]);
  });

  it('teleport places the camera exactly', () => {
    const { interp, view } = setup([
      { kind: 'rcTeleport', x: num(6), y: num(7), angle: num(1.5) },
    ], new StubView());
    interp.tick(0.016);
    expect([view.x, view.y, view.angle]).toEqual([6, 7, 1.5]);
  });

  it('view distance reaches the camera', () => {
    const { interp, view } = setup([{ kind: 'rcFog', distance: num(4) }], new StubView());
    interp.tick(0.016);
    expect(view.fog).toBe(4);
  });
});

describe('first-person sensing', () => {
  it('wall-ahead compares against the measured distance', () => {
    const view = new StubView();
    view.wall = 1.2;

    const body: Stmt[] = [
      { kind: 'if', cond: { kind: 'rcWallAhead', distance: num(2) }, then: [{ kind: 'changeVar', name: 'n', by: num(1) }] },
    ];
    const { interp } = setup(body, view);

    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);

    view.wall = 9;
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(1);
  });

  it('map x and y read the camera position', () => {
    const view = new StubView();
    view.x = 4.25;
    const { interp } = setup([{ kind: 'setVar', name: 'n', value: { kind: 'rcX' } }], view);
    interp.tick(0.016);
    expect(interp.getVariable('n')).toBe(4.25);
  });
});

describe('a 2D project without a camera', () => {
  it('treats the first-person blocks as no-ops rather than errors', () => {
    const body: Stmt[] = [
      { kind: 'rcMove', speed: num(1) },
      { kind: 'rcTurn', speed: num(1) },
      { kind: 'rcTeleport', x: num(1), y: num(1), angle: num(0) },
      { kind: 'rcFog', distance: num(3) },
      { kind: 'if', cond: { kind: 'rcWallAhead', distance: num(1) }, then: [{ kind: 'changeVar', name: 'n', by: num(1) }] },
      { kind: 'setVar', name: 'n', value: { kind: 'rcX' } },
    ];
    const { interp } = setup(body, undefined);

    expect(() => interp.tick(0.016)).not.toThrow();
    expect(interp.getVariable('n')).toBe(0);
  });
});

describe('generated code', () => {
  const emit = (body: Stmt[]) =>
    generateTypeScript({
      sprites: [{ name: 'camera', sheet: 0, frame: 0, x: 0, y: 0, scripts: [{ hat: { kind: 'everyFrame' }, body }] }],
      variables: {},
    });

  it('emits raycaster SDK calls', () => {
    const code = emit([
      { kind: 'rcMove', speed: num(1) },
      { kind: 'rcStrafe', speed: num(-1) },
      { kind: 'rcTurn', speed: num(2) },
      { kind: 'rcFog', distance: num(8) },
    ]);
    expect(code).toContain('raycaster.move(1, 0, 0, dt);');
    expect(code).toContain('raycaster.move(0, -1, 0, dt);');
    expect(code).toContain('raycaster.move(0, 0, 2, dt);');
    expect(code).toContain('raycaster.setFog(8, 6, 5, 9);');
  });

  it('emits sensing reads', () => {
    const code = emit([
      { kind: 'if', cond: { kind: 'rcWallAhead', distance: num(1) }, then: [{ kind: 'stop' }] },
    ]);
    expect(code).toContain('wallDistance(raycaster) <= 1');
  });
});
