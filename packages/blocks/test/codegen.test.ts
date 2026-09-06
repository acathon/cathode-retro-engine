import { describe, expect, it } from 'vitest';
import { generateTypeScript } from '../src/codegen';
import type { BlockProgram } from '../src/program';

const num = (value: number) => ({ kind: 'num' as const, value });

function program(partial: Partial<BlockProgram> = {}): BlockProgram {
  return {
    sprites: [
      {
        name: 'player',
        sheet: 0,
        frame: 0,
        x: 32,
        y: 64,
        physics: { gravity: 1, width: 8, height: 8 },
        scripts: [],
      },
    ],
    variables: { score: 0 },
    ...partial,
  };
}

describe('generated program shape', () => {
  it('emits a runnable skeleton that imports the SDK', () => {
    const code = generateTypeScript(program());
    expect(code).toContain("from '@cathode/sdk'");
    expect(code).toContain('Cathode.nes(canvas, 3)');
    expect(code).toContain('engine.loop((dt) => {');
    expect(code).toContain('main();');
  });

  it('declares each sprite and its physics opt-in', () => {
    const code = generateTypeScript(program());
    expect(code).toContain('const player = new Sprite(scene, { sheet: 0, frame: 0, x: 32, y: 64 });');
    expect(code).toContain('player.usePhysics({ gravity: 1, width: 8, height: 8 });');
  });

  it('omits usePhysics for a sprite that did not opt in', () => {
    const p = program();
    delete p.sprites[0].physics;
    expect(generateTypeScript(p)).not.toContain('usePhysics');
  });

  it('seeds declared variables', () => {
    expect(generateTypeScript(program())).toContain('const vars = { score: 0 };');
  });
});

describe('hats become the right control flow', () => {
  it('onStart runs before the loop', () => {
    const p = program();
    p.sprites[0].scripts = [{ hat: { kind: 'onStart' }, body: [{ kind: 'goTo', x: num(1), y: num(2) }] }];
    const code = generateTypeScript(p);

    const startIdx = code.indexOf('self.setPosition(1, 2)');
    const loopIdx = code.indexOf('engine.loop(');
    expect(startIdx).toBeGreaterThan(-1);
    expect(startIdx).toBeLessThan(loopIdx);
  });

  it('onKey becomes a held check inside the loop', () => {
    const p = program();
    p.sprites[0].scripts = [
      { hat: { kind: 'onKey', key: 'right' }, body: [{ kind: 'setVelocity', vx: num(60), vy: num(0) }] },
    ];
    const code = generateTypeScript(p);
    expect(code).toContain("if (engine.input.held(0, 'right')) {");
    expect(code).toContain('self.move(60, 0);');
  });

  it('onKeyPressed becomes an edge check', () => {
    const p = program();
    p.sprites[0].scripts = [{ hat: { kind: 'onKeyPressed', key: 'a' }, body: [{ kind: 'jump', strength: num(200) }] }];
    const code = generateTypeScript(p);
    expect(code).toContain("if (engine.input.justPressed(0, 'a')) {");
  });

  it('forever becomes the frame body, never a while(true)', () => {
    const p = program();
    p.sprites[0].scripts = [
      {
        hat: { kind: 'everyFrame' },
        body: [{ kind: 'forever', body: [{ kind: 'changeVar', name: 'score', by: num(1) }] }],
      },
    ];
    const code = generateTypeScript(p);
    expect(code).not.toContain('while (true)');
    expect(code).toContain('runs once per frame');
    expect(code).toContain('vars.score += 1;');
  });
});

describe('statements', () => {
  const emit = (body: BlockProgram['sprites'][0]['scripts'][0]['body']) => {
    const p = program();
    p.sprites[0].scripts = [{ hat: { kind: 'everyFrame' }, body }];
    return generateTypeScript(p);
  };

  it('jump guards on being grounded, matching the interpreter', () => {
    const code = emit([{ kind: 'jump', strength: num(180) }]);
    expect(code).toContain('if (Math.abs(self.velocityY) < 0.001) {');
    expect(code).toContain('self.move(self.velocityX, -180);');
  });

  it('renders if/else', () => {
    const code = emit([
      {
        kind: 'if',
        cond: { kind: 'grounded' },
        then: [{ kind: 'setFrame', frame: num(0) }],
        else: [{ kind: 'setFrame', frame: num(1) }],
      },
    ]);
    expect(code).toContain('} else {');
    expect(code).toContain('self.frame = Math.round(0);');
  });

  it('renders repeat as a for loop', () => {
    expect(emit([{ kind: 'repeat', times: num(3), body: [{ kind: 'show' }] }]))
      .toContain('for (let i = 0; i < 3; i++) {');
  });

  it('renders sound with the chosen waveform', () => {
    expect(emit([{ kind: 'playSound', freq: num(440), waveform: 'triangle' }]))
      .toContain("sfx.play(440, 'triangle', 0.4);");
  });
});

describe('expressions', () => {
  const emitCond = (cond: Parameters<typeof generateTypeScript>[0] extends never ? never : any) => {
    const p = program();
    p.sprites[0].scripts = [{ hat: { kind: 'everyFrame' }, body: [{ kind: 'if', cond, then: [{ kind: 'show' }] }] }];
    return generateTypeScript(p);
  };

  it('uses === for equality rather than ==', () => {
    const code = emitCond({ kind: 'binary', op: '=', left: { kind: 'var', name: 'score' }, right: num(3) });
    expect(code).toContain('(vars.score === 3)');
  });

  it('guards division by zero the same way the interpreter does', () => {
    const code = emitCond({
      kind: 'binary', op: '<',
      left: { kind: 'binary', op: '/', left: num(1), right: { kind: 'var', name: 'score' } },
      right: num(2),
    });
    expect(code).toContain('vars.score === 0 ? 0 :');
  });

  it('maps sensing blocks onto SDK calls', () => {
    expect(emitCond({ kind: 'keyPressed', key: 'up' })).toContain("engine.input.held(0, 'up')");
    expect(emitCond({ kind: 'grounded' })).toContain('Math.abs(self.velocityY) < 0.001');
    expect(emitCond({ kind: 'touching', target: 'coin' })).toContain('self.overlaps(coin)');
  });

  it('renders not', () => {
    expect(emitCond({ kind: 'not', value: { kind: 'grounded' } })).toContain('!(');
  });
});

describe('empty input', () => {
  it('an empty program still generates something that compiles in shape', () => {
    const code = generateTypeScript({ sprites: [], variables: {} });
    expect(code).toContain('async function main()');
    expect(code).toContain('const vars: Record<string, number> = {};');
    expect(code).toContain('main();');
  });
});
