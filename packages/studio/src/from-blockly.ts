import type * as Blockly from 'blockly';
import type { Expr, Hat, KeyName, Script, Stmt } from '@cathode/blocks';

/**
 * Converts a Blockly workspace into the block-program IR.
 *
 * Blockly's own JavaScript generator emits source text; we want data instead,
 * so the interpreter can run a program without an eval step and the code
 * generator can print it as TypeScript.
 */

type Block = Blockly.Block;

function num(value: number): Expr {
  return { kind: 'num', value };
}

/** Read a value input, falling back when a socket is left empty. */
function readExpr(block: Block, name: string, fallback: Expr = num(0)): Expr {
  const target = block.getInputTargetBlock(name);
  return target ? exprFrom(target) : fallback;
}

function exprFrom(block: Block): Expr {
  switch (block.type) {
    case 'math_number':
      return num(Number(block.getFieldValue('NUM')) || 0);

    case 'retro_key_pressed':
      return { kind: 'keyPressed', key: block.getFieldValue('KEY') as KeyName };

    case 'retro_grounded':
      return { kind: 'grounded' };

    case 'retro_touching':
      return { kind: 'touching', target: String(block.getFieldValue('TARGET') || '') };

    case 'retro_get_var':
      return { kind: 'var', name: String(block.getFieldValue('NAME') || 'score') };

    case 'logic_negate':
      return { kind: 'not', value: readExpr(block, 'BOOL', { kind: 'bool', value: false }) };

    case 'logic_compare': {
      const opMap: Record<string, Expr extends never ? never : '<' | '>' | '='> = {
        LT: '<', GT: '>', EQ: '=',
      } as const;
      const op = opMap[block.getFieldValue('OP')] ?? '=';
      return { kind: 'binary', op, left: readExpr(block, 'A'), right: readExpr(block, 'B') };
    }

    case 'logic_operation': {
      const op = block.getFieldValue('OP') === 'OR' ? 'or' : 'and';
      return {
        kind: 'binary',
        op,
        left: readExpr(block, 'A', { kind: 'bool', value: false }),
        right: readExpr(block, 'B', { kind: 'bool', value: false }),
      };
    }

    case 'math_arithmetic': {
      const opMap: Record<string, '+' | '-' | '*' | '/'> = {
        ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/',
      };
      const op = opMap[block.getFieldValue('OP')] ?? '+';
      return { kind: 'binary', op, left: readExpr(block, 'A'), right: readExpr(block, 'B') };
    }

    default:
      return num(0);
  }
}

/** Walk a statement stack, following `next` connections. */
function stmtsFrom(first: Block | null): Stmt[] {
  const out: Stmt[] = [];
  let block: Block | null = first;

  while (block) {
    const stmt = stmtFrom(block);
    if (stmt) out.push(stmt);
    block = block.getNextBlock();
  }

  return out;
}

function stmtFrom(block: Block): Stmt | null {
  switch (block.type) {
    case 'retro_move':
      return { kind: 'move', dx: readExpr(block, 'DX'), dy: readExpr(block, 'DY') };

    case 'retro_set_velocity':
      return { kind: 'setVelocity', vx: readExpr(block, 'VX'), vy: readExpr(block, 'VY') };

    case 'retro_jump':
      return { kind: 'jump', strength: readExpr(block, 'STRENGTH', num(180)) };

    case 'retro_go_to':
      return { kind: 'goTo', x: readExpr(block, 'X'), y: readExpr(block, 'Y') };

    case 'retro_set_frame':
      return { kind: 'setFrame', frame: readExpr(block, 'FRAME') };

    case 'retro_set_flip':
      return { kind: 'setFlip', flipX: { kind: 'bool', value: block.getFieldValue('FLIP') === 'TRUE' } };

    case 'retro_show':
      return { kind: 'show' };

    case 'retro_hide':
      return { kind: 'hide' };

    case 'retro_play_sound':
      return {
        kind: 'playSound',
        freq: readExpr(block, 'FREQ', num(440)),
        waveform: String(block.getFieldValue('WAVE') || 'pulse50'),
      };

    case 'retro_set_var':
      return {
        kind: 'setVar',
        name: String(block.getFieldValue('NAME') || 'score'),
        value: readExpr(block, 'VALUE'),
      };

    case 'retro_change_var':
      return {
        kind: 'changeVar',
        name: String(block.getFieldValue('NAME') || 'score'),
        by: readExpr(block, 'BY', num(1)),
      };

    case 'retro_if':
      return {
        kind: 'if',
        cond: readExpr(block, 'COND', { kind: 'bool', value: false }),
        then: stmtsFrom(block.getInputTargetBlock('THEN')),
      };

    case 'retro_if_else':
      return {
        kind: 'if',
        cond: readExpr(block, 'COND', { kind: 'bool', value: false }),
        then: stmtsFrom(block.getInputTargetBlock('THEN')),
        else: stmtsFrom(block.getInputTargetBlock('ELSE')),
      };

    case 'retro_repeat':
      return {
        kind: 'repeat',
        times: readExpr(block, 'TIMES', num(10)),
        body: stmtsFrom(block.getInputTargetBlock('BODY')),
      };

    case 'retro_forever':
      return { kind: 'forever', body: stmtsFrom(block.getInputTargetBlock('BODY')) };

    case 'retro_wait':
      return { kind: 'wait', seconds: readExpr(block, 'SECONDS', num(1)) };

    default:
      return null;
  }
}

function hatFrom(block: Block): Hat | null {
  switch (block.type) {
    case 'retro_on_start':
      return { kind: 'onStart' };
    case 'retro_every_frame':
      return { kind: 'everyFrame' };
    case 'retro_on_key':
      return { kind: 'onKey', key: block.getFieldValue('KEY') as KeyName };
    case 'retro_on_key_pressed':
      return { kind: 'onKeyPressed', key: block.getFieldValue('KEY') as KeyName };
    default:
      return null;
  }
}

/** Every complete stack in the workspace, in top-to-bottom order. */
export function scriptsFromWorkspace(workspace: Blockly.Workspace): Script[] {
  const scripts: Script[] = [];

  for (const block of workspace.getTopBlocks(true)) {
    const hat = hatFrom(block);
    if (!hat) continue; // a loose stack with no event hat never runs
    scripts.push({ hat, body: stmtsFrom(block.getNextBlock()) });
  }

  return scripts;
}

/** Variable names mentioned anywhere, so the program can declare them. */
export function variablesFromWorkspace(workspace: Blockly.Workspace): Record<string, number> {
  const vars: Record<string, number> = {};

  for (const block of workspace.getAllBlocks(false)) {
    if (
      block.type === 'retro_set_var' ||
      block.type === 'retro_change_var' ||
      block.type === 'retro_get_var'
    ) {
      const name = String(block.getFieldValue('NAME') || '').trim();
      if (name) vars[name] = 0;
    }
  }

  return vars;
}
