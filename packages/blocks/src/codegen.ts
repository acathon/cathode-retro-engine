import type { BlockProgram, Expr, KeyName, Stmt } from './program';

/**
 * Turns a block program into readable TypeScript that uses the Retro Engine
 * SDK directly.
 *
 * This is the reason blocks aren't a dead end: a beginner builds by dragging,
 * then presses "See code" and finds the same program written the way the
 * examples in this repo are written, ready to keep editing by hand.
 */

const INDENT = '  ';

function ind(depth: number): string {
  return INDENT.repeat(depth);
}

function keyExpr(key: KeyName): string {
  return `'${key}'`;
}

function expr(e: Expr): string {
  switch (e.kind) {
    case 'num':
      return String(e.value);
    case 'str':
      return JSON.stringify(e.value);
    case 'bool':
      return String(e.value);
    case 'var':
      return `vars.${e.name}`;
    case 'keyPressed':
      return `engine.input.held(0, ${keyExpr(e.key)})`;
    case 'grounded':
      return `Math.abs(self.velocityY) < 0.001`;
    case 'touching':
      return `self.overlaps(${e.target})`;
    case 'not':
      return `!(${expr(e.value)})`;
    case 'binary': {
      const l = expr(e.left);
      const r = expr(e.right);
      switch (e.op) {
        case '=':
          return `(${l} === ${r})`;
        case 'and':
          return `(${l} && ${r})`;
        case 'or':
          return `(${l} || ${r})`;
        case '/':
          // Mirrors the interpreter, which yields 0 rather than Infinity.
          return `(${r} === 0 ? 0 : ${l} / ${r})`;
        default:
          return `(${l} ${e.op} ${r})`;
      }
    }
  }
}

function stmt(s: Stmt, depth: number): string[] {
  const pad = ind(depth);
  switch (s.kind) {
    case 'move':
      return [`${pad}self.setPosition(self.x + ${expr(s.dx)}, self.y + ${expr(s.dy)});`];
    case 'setVelocity':
      return [`${pad}self.move(${expr(s.vx)}, ${expr(s.vy)});`];
    case 'jump':
      return [
        `${pad}if (Math.abs(self.velocityY) < 0.001) {`,
        `${pad}${INDENT}self.move(self.velocityX, -${expr(s.strength)});`,
        `${pad}}`,
      ];
    case 'goTo':
      return [`${pad}self.setPosition(${expr(s.x)}, ${expr(s.y)});`];
    case 'setFrame':
      return [`${pad}self.frame = Math.round(${expr(s.frame)});`];
    case 'setFlip':
      return [`${pad}self.flipX = ${expr(s.flipX)};`];
    case 'show':
      return [`${pad}self.active = true;`];
    case 'hide':
      return [`${pad}self.active = false;`];
    case 'playSound':
      return [`${pad}sfx.play(${expr(s.freq)}, '${s.waveform}', 0.4);`];
    case 'setVar':
      return [`${pad}vars.${s.name} = ${expr(s.value)};`];
    case 'changeVar':
      return [`${pad}vars.${s.name} += ${expr(s.by)};`];
    case 'wait':
      return [`${pad}await wait(${expr(s.seconds)});`];
    case 'stop':
      return [`${pad}return;`];
    case 'if': {
      const out = [`${pad}if (${expr(s.cond)}) {`];
      for (const inner of s.then) out.push(...stmt(inner, depth + 1));
      if (s.else && s.else.length) {
        out.push(`${pad}} else {`);
        for (const inner of s.else) out.push(...stmt(inner, depth + 1));
      }
      out.push(`${pad}}`);
      return out;
    }
    case 'repeat': {
      const out = [`${pad}for (let i = 0; i < ${expr(s.times)}; i++) {`];
      for (const inner of s.body) out.push(...stmt(inner, depth + 1));
      out.push(`${pad}}`);
      return out;
    }
    case 'forever': {
      // `forever` is one pass per frame, so in generated code it is simply
      // the body of the frame callback — a `while (true)` would hang.
      const out = [`${pad}// forever: runs once per frame`];
      for (const inner of s.body) out.push(...stmt(inner, depth));
      return out;
    }
  }
}

/** Emit a complete, runnable TypeScript game from a block program. */
export function generateTypeScript(program: BlockProgram): string {
  const out: string[] = [];
  const varNames = Object.keys(program.variables);

  out.push(`// Generated from blocks by the Retro Engine block editor.`);
  out.push(`import { RetroEngine, Scene, Sprite, SoundChannel } from '@retro-engine/sdk';`);
  out.push('');
  out.push(`const canvas = document.getElementById('game') as HTMLCanvasElement;`);
  out.push('');
  out.push(`async function main() {`);
  out.push(`${ind(1)}const engine = await RetroEngine.nes(canvas, 3);`);
  out.push(`${ind(1)}const scene = new Scene(engine);`);
  out.push(`${ind(1)}const sfx = new SoundChannel(engine, 0);`);
  out.push(`${ind(1)}const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));`);
  out.push('');

  if (varNames.length) {
    const entries = varNames.map((n) => `${n}: ${program.variables[n]}`).join(', ');
    out.push(`${ind(1)}const vars = { ${entries} };`);
  } else {
    out.push(`${ind(1)}const vars: Record<string, number> = {};`);
  }
  out.push('');

  for (const sprite of program.sprites) {
    out.push(
      `${ind(1)}const ${sprite.name} = new Sprite(scene, ` +
        `{ sheet: ${sprite.sheet}, frame: ${sprite.frame}, x: ${sprite.x}, y: ${sprite.y} });`,
    );
    if (sprite.physics) {
      const p = sprite.physics;
      const gravity = p.gravity === undefined ? '' : `gravity: ${p.gravity}, `;
      out.push(
        `${ind(1)}${sprite.name}.usePhysics({ ${gravity}width: ${p.width}, height: ${p.height} });`,
      );
    }
  }
  out.push('');

  // onStart stacks run once, before the loop.
  for (const sprite of program.sprites) {
    const starts = sprite.scripts.filter((s) => s.hat.kind === 'onStart');
    for (const script of starts) {
      out.push(`${ind(1)}// ${sprite.name}: when the game starts`);
      out.push(`${ind(1)}{`);
      out.push(`${ind(2)}const self = ${sprite.name};`);
      for (const s of script.body) out.push(...stmt(s, 2));
      out.push(`${ind(1)}}`);
      out.push('');
    }
  }

  out.push(`${ind(1)}engine.loop((dt) => {`);
  out.push(`${ind(2)}scene.update(dt);`);
  out.push('');

  for (const sprite of program.sprites) {
    for (const script of sprite.scripts) {
      if (script.hat.kind === 'onStart') continue;
      const self = `${ind(2)}const self = ${sprite.name};`;

      if (script.hat.kind === 'everyFrame') {
        out.push(`${ind(2)}// ${sprite.name}: every frame`);
        out.push(`${ind(2)}{`);
        out.push(self);
        for (const s of script.body) out.push(...stmt(s, 3));
        out.push(`${ind(2)}}`);
      } else if (script.hat.kind === 'onKey') {
        out.push(`${ind(2)}// ${sprite.name}: while ${script.hat.key} is held`);
        out.push(`${ind(2)}if (engine.input.held(0, ${keyExpr(script.hat.key)})) {`);
        out.push(`${ind(3)}const self = ${sprite.name};`);
        for (const s of script.body) out.push(...stmt(s, 3));
        out.push(`${ind(2)}}`);
      } else if (script.hat.kind === 'onKeyPressed') {
        out.push(`${ind(2)}// ${sprite.name}: when ${script.hat.key} is pressed`);
        out.push(`${ind(2)}if (engine.input.justPressed(0, ${keyExpr(script.hat.key)})) {`);
        out.push(`${ind(3)}const self = ${sprite.name};`);
        for (const s of script.body) out.push(...stmt(s, 3));
        out.push(`${ind(2)}}`);
      }
      out.push('');
    }
  }

  out.push(`${ind(1)}});`);
  out.push(`}`);
  out.push('');
  out.push(`main();`);
  out.push('');

  return out.join('\n');
}
