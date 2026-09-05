/**
 * Blockly block definitions and the toolbox for the Retro Engine.
 *
 * Kept as plain data so this package stays free of a Blockly import: the
 * editor app registers these, and the tests can read them without pulling a
 * DOM library in.
 */

export interface BlockDef {
  type: string;
  message0: string;
  args0?: unknown[];
  previousStatement?: null;
  nextStatement?: null;
  output?: string | null;
  colour: number;
  tooltip: string;
}

/** Scratch-ish category colours. */
export const CATEGORY_COLOUR = {
  events: 40,
  motion: 210,
  looks: 280,
  sound: 330,
  control: 120,
  sensing: 190,
  variables: 20,
  firstPerson: 260,
} as const;

const KEY_OPTIONS: [string, string][] = [
  ['left arrow', 'left'],
  ['right arrow', 'right'],
  ['up arrow', 'up'],
  ['down arrow', 'down'],
  ['Z (A button)', 'a'],
  ['X (B button)', 'b'],
  ['enter (start)', 'start'],
];

const WAVEFORMS: [string, string][] = [
  ['pulse', 'pulse50'],
  ['triangle', 'triangle'],
  ['sawtooth', 'sawtooth'],
  ['noise', 'noise'],
  ['sine', 'sine'],
];

export const BLOCK_DEFS: BlockDef[] = [
  // --- Events -------------------------------------------------------------
  {
    type: 'retro_on_start',
    message0: 'when game starts',
    nextStatement: null,
    colour: CATEGORY_COLOUR.events,
    tooltip: 'Runs once when the game begins.',
  },
  {
    type: 'retro_every_frame',
    message0: 'every frame',
    nextStatement: null,
    colour: CATEGORY_COLOUR.events,
    tooltip: 'Runs once per frame, about 60 times a second.',
  },
  {
    type: 'retro_on_key',
    message0: 'while %1 is held',
    args0: [{ type: 'field_dropdown', name: 'KEY', options: KEY_OPTIONS }],
    nextStatement: null,
    colour: CATEGORY_COLOUR.events,
    tooltip: 'Runs every frame while the key is down.',
  },
  {
    type: 'retro_on_key_pressed',
    message0: 'when %1 is pressed',
    args0: [{ type: 'field_dropdown', name: 'KEY', options: KEY_OPTIONS }],
    nextStatement: null,
    colour: CATEGORY_COLOUR.events,
    tooltip: 'Runs once on the frame the key goes down.',
  },

  // --- Motion -------------------------------------------------------------
  {
    type: 'retro_move',
    message0: 'move by x %1 y %2',
    args0: [
      { type: 'input_value', name: 'DX', check: 'Number' },
      { type: 'input_value', name: 'DY', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.motion,
    tooltip: 'Shift the sprite by this many pixels.',
  },
  {
    type: 'retro_set_velocity',
    message0: 'set speed to x %1 y %2',
    args0: [
      { type: 'input_value', name: 'VX', check: 'Number' },
      { type: 'input_value', name: 'VY', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.motion,
    tooltip: 'Set how fast the sprite travels, in pixels per second.',
  },
  {
    type: 'retro_jump',
    message0: 'jump with strength %1',
    args0: [{ type: 'input_value', name: 'STRENGTH', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.motion,
    tooltip: 'Leap upward, but only when standing on something.',
  },
  {
    type: 'retro_go_to',
    message0: 'go to x %1 y %2',
    args0: [
      { type: 'input_value', name: 'X', check: 'Number' },
      { type: 'input_value', name: 'Y', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.motion,
    tooltip: 'Teleport the sprite.',
  },

  // --- Looks --------------------------------------------------------------
  {
    type: 'retro_set_frame',
    message0: 'switch to frame %1',
    args0: [{ type: 'input_value', name: 'FRAME', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.looks,
    tooltip: 'Show a different picture from the sprite sheet.',
  },
  {
    type: 'retro_set_flip',
    message0: 'face left %1',
    args0: [{ type: 'field_checkbox', name: 'FLIP', checked: false }],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.looks,
    tooltip: 'Mirror the sprite horizontally.',
  },
  {
    type: 'retro_show',
    message0: 'show',
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.looks,
    tooltip: 'Make the sprite visible.',
  },
  {
    type: 'retro_hide',
    message0: 'hide',
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.looks,
    tooltip: 'Make the sprite invisible.',
  },

  // --- Sound --------------------------------------------------------------
  {
    type: 'retro_play_sound',
    message0: 'play %1 tone at %2 Hz',
    args0: [
      { type: 'field_dropdown', name: 'WAVE', options: WAVEFORMS },
      { type: 'input_value', name: 'FREQ', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.sound,
    tooltip: 'Play a chiptune note.',
  },

  // --- Control ------------------------------------------------------------
  {
    type: 'retro_if',
    message0: 'if %1 then %2',
    args0: [
      { type: 'input_value', name: 'COND', check: 'Boolean' },
      { type: 'input_statement', name: 'THEN' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.control,
    tooltip: 'Run the blocks inside only when the test is true.',
  },
  {
    type: 'retro_if_else',
    message0: 'if %1 then %2 else %3',
    args0: [
      { type: 'input_value', name: 'COND', check: 'Boolean' },
      { type: 'input_statement', name: 'THEN' },
      { type: 'input_statement', name: 'ELSE' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.control,
    tooltip: 'Choose between two stacks of blocks.',
  },
  {
    type: 'retro_repeat',
    message0: 'repeat %1 times %2',
    args0: [
      { type: 'input_value', name: 'TIMES', check: 'Number' },
      { type: 'input_statement', name: 'BODY' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.control,
    tooltip: 'Run the blocks inside a set number of times.',
  },
  {
    type: 'retro_forever',
    message0: 'forever %1',
    args0: [{ type: 'input_statement', name: 'BODY' }],
    previousStatement: null,
    colour: CATEGORY_COLOUR.control,
    tooltip: 'Run the blocks inside once every frame, without stopping.',
  },
  {
    type: 'retro_wait',
    message0: 'wait %1 seconds',
    args0: [{ type: 'input_value', name: 'SECONDS', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.control,
    tooltip: 'Pause this stack, letting the rest of the game carry on.',
  },

  // --- Sensing ------------------------------------------------------------
  {
    type: 'retro_key_pressed',
    message0: '%1 is held',
    args0: [{ type: 'field_dropdown', name: 'KEY', options: KEY_OPTIONS }],
    output: 'Boolean',
    colour: CATEGORY_COLOUR.sensing,
    tooltip: 'True while the key is down.',
  },
  {
    type: 'retro_grounded',
    message0: 'is on the ground',
    output: 'Boolean',
    colour: CATEGORY_COLOUR.sensing,
    tooltip: 'True when the sprite is standing on something solid.',
  },
  {
    type: 'retro_touching',
    message0: 'touching %1',
    args0: [{ type: 'field_input', name: 'TARGET', text: 'sprite' }],
    output: 'Boolean',
    colour: CATEGORY_COLOUR.sensing,
    tooltip: 'True when this sprite overlaps the named one.',
  },

  // --- First person (raycaster) -------------------------------------------
  {
    type: 'retro_rc_move',
    message0: 'walk %1',
    args0: [{ type: 'input_value', name: 'SPEED', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.firstPerson,
    tooltip: 'Move the first-person camera forward. Negative walks backward.',
  },
  {
    type: 'retro_rc_strafe',
    message0: 'strafe %1',
    args0: [{ type: 'input_value', name: 'SPEED', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.firstPerson,
    tooltip: 'Slide sideways without turning.',
  },
  {
    type: 'retro_rc_turn',
    message0: 'turn %1',
    args0: [{ type: 'input_value', name: 'SPEED', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.firstPerson,
    tooltip: 'Rotate the camera. Negative turns left.',
  },
  {
    type: 'retro_rc_teleport',
    message0: 'teleport to x %1 y %2 facing %3',
    args0: [
      { type: 'input_value', name: 'X', check: 'Number' },
      { type: 'input_value', name: 'Y', check: 'Number' },
      { type: 'input_value', name: 'ANGLE', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.firstPerson,
    tooltip: 'Jump the camera to a spot on the map.',
  },
  {
    type: 'retro_rc_fog',
    message0: 'set view distance %1',
    args0: [{ type: 'input_value', name: 'DIST', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.firstPerson,
    tooltip: 'How far you can see before fog swallows the walls.',
  },
  {
    type: 'retro_rc_wall_ahead',
    message0: 'wall within %1',
    args0: [{ type: 'input_value', name: 'DIST', check: 'Number' }],
    output: 'Boolean',
    colour: CATEGORY_COLOUR.firstPerson,
    tooltip: 'True when a wall is closer than this many cells straight ahead.',
  },
  {
    type: 'retro_rc_x',
    message0: 'my map x',
    output: 'Number',
    colour: CATEGORY_COLOUR.firstPerson,
    tooltip: 'The camera position across the map.',
  },
  {
    type: 'retro_rc_y',
    message0: 'my map y',
    output: 'Number',
    colour: CATEGORY_COLOUR.firstPerson,
    tooltip: 'The camera position down the map.',
  },

  // --- Variables ----------------------------------------------------------
  {
    type: 'retro_set_var',
    message0: 'set %1 to %2',
    args0: [
      { type: 'field_input', name: 'NAME', text: 'score' },
      { type: 'input_value', name: 'VALUE', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.variables,
    tooltip: 'Store a number.',
  },
  {
    type: 'retro_change_var',
    message0: 'change %1 by %2',
    args0: [
      { type: 'field_input', name: 'NAME', text: 'score' },
      { type: 'input_value', name: 'BY', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: CATEGORY_COLOUR.variables,
    tooltip: 'Add to a stored number.',
  },
  {
    type: 'retro_get_var',
    message0: '%1',
    args0: [{ type: 'field_input', name: 'NAME', text: 'score' }],
    output: 'Number',
    colour: CATEGORY_COLOUR.variables,
    tooltip: 'The value of a stored number.',
  },
];

/** Blockly toolbox, grouped the way Scratch groups its palette. */
export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Events',
      colour: String(CATEGORY_COLOUR.events),
      contents: [
        { kind: 'block', type: 'retro_on_start' },
        { kind: 'block', type: 'retro_every_frame' },
        { kind: 'block', type: 'retro_on_key' },
        { kind: 'block', type: 'retro_on_key_pressed' },
      ],
    },
    {
      kind: 'category',
      name: 'Motion',
      colour: String(CATEGORY_COLOUR.motion),
      contents: [
        { kind: 'block', type: 'retro_move' },
        { kind: 'block', type: 'retro_set_velocity' },
        { kind: 'block', type: 'retro_jump' },
        { kind: 'block', type: 'retro_go_to' },
      ],
    },
    {
      kind: 'category',
      name: 'Looks',
      colour: String(CATEGORY_COLOUR.looks),
      contents: [
        { kind: 'block', type: 'retro_set_frame' },
        { kind: 'block', type: 'retro_set_flip' },
        { kind: 'block', type: 'retro_show' },
        { kind: 'block', type: 'retro_hide' },
      ],
    },
    {
      kind: 'category',
      name: 'Sound',
      colour: String(CATEGORY_COLOUR.sound),
      contents: [{ kind: 'block', type: 'retro_play_sound' }],
    },
    {
      kind: 'category',
      name: 'Control',
      colour: String(CATEGORY_COLOUR.control),
      contents: [
        { kind: 'block', type: 'retro_if' },
        { kind: 'block', type: 'retro_if_else' },
        { kind: 'block', type: 'retro_repeat' },
        { kind: 'block', type: 'retro_forever' },
        { kind: 'block', type: 'retro_wait' },
      ],
    },
    {
      kind: 'category',
      name: 'Sensing',
      colour: String(CATEGORY_COLOUR.sensing),
      contents: [
        { kind: 'block', type: 'retro_key_pressed' },
        { kind: 'block', type: 'retro_grounded' },
        { kind: 'block', type: 'retro_touching' },
      ],
    },
    {
      kind: 'category',
      name: 'First Person',
      colour: String(CATEGORY_COLOUR.firstPerson),
      contents: [
        { kind: 'block', type: 'retro_rc_move' },
        { kind: 'block', type: 'retro_rc_strafe' },
        { kind: 'block', type: 'retro_rc_turn' },
        { kind: 'block', type: 'retro_rc_teleport' },
        { kind: 'block', type: 'retro_rc_fog' },
        { kind: 'block', type: 'retro_rc_wall_ahead' },
        { kind: 'block', type: 'retro_rc_x' },
        { kind: 'block', type: 'retro_rc_y' },
      ],
    },
    {
      kind: 'category',
      name: 'Variables',
      colour: String(CATEGORY_COLOUR.variables),
      contents: [
        { kind: 'block', type: 'retro_set_var' },
        { kind: 'block', type: 'retro_change_var' },
        { kind: 'block', type: 'retro_get_var' },
      ],
    },
    {
      kind: 'category',
      name: 'Numbers',
      colour: '65',
      contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'math_arithmetic' },
      ],
    },
  ],
};
