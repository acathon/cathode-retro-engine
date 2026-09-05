/**
 * The block program IR.
 *
 * A visual program is data, not source: the editor writes this shape, the
 * interpreter runs it directly (so pressing play is instant, the way Scratch
 * behaves), and the generator turns the same tree into readable TypeScript
 * for anyone who wants to graduate to writing code by hand.
 */

/** A value a block slot can hold: a literal, a variable, or a sensing block. */
export type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'var'; name: string }
  | { kind: 'keyPressed'; key: KeyName }
  | { kind: 'touching'; target: string }
  | { kind: 'grounded' }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr }
  | { kind: 'not'; value: Expr };

export type BinaryOp = '+' | '-' | '*' | '/' | '<' | '>' | '=' | 'and' | 'or';

export type KeyName = 'left' | 'right' | 'up' | 'down' | 'a' | 'b' | 'start';

/** A statement block — the puzzle pieces that stack vertically. */
export type Stmt =
  | { kind: 'move'; dx: Expr; dy: Expr }
  | { kind: 'setVelocity'; vx: Expr; vy: Expr }
  | { kind: 'jump'; strength: Expr }
  | { kind: 'goTo'; x: Expr; y: Expr }
  | { kind: 'setFrame'; frame: Expr }
  | { kind: 'setFlip'; flipX: Expr }
  | { kind: 'show' }
  | { kind: 'hide' }
  | { kind: 'playSound'; freq: Expr; waveform: string }
  | { kind: 'setVar'; name: string; value: Expr }
  | { kind: 'changeVar'; name: string; by: Expr }
  | { kind: 'if'; cond: Expr; then: Stmt[]; else?: Stmt[] }
  | { kind: 'repeat'; times: Expr; body: Stmt[] }
  | { kind: 'forever'; body: Stmt[] }
  | { kind: 'wait'; seconds: Expr }
  | { kind: 'stop' };

/** Event hats — the rounded blocks a stack hangs from. */
export type Hat =
  | { kind: 'onStart' }
  | { kind: 'onKey'; key: KeyName }
  | { kind: 'onKeyPressed'; key: KeyName }
  | { kind: 'everyFrame' };

export interface Script {
  hat: Hat;
  body: Stmt[];
}

export interface SpriteProgram {
  /** Name shown in the editor, and used for `touching` checks. */
  name: string;
  sheet: number;
  frame: number;
  x: number;
  y: number;
  physics?: { gravity?: number; width: number; height: number };
  scripts: Script[];
}

export interface BlockProgram {
  sprites: SpriteProgram[];
  variables: Record<string, number>;
}

export const emptyProgram = (): BlockProgram => ({ sprites: [], variables: {} });
