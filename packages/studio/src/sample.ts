/**
 * A small starter program, in Blockly's serialization format.
 *
 * Walk left and right, jump with Z, and count how many jumps you have made —
 * enough to show an event hat, a sensing block, motion and a variable without
 * anyone having to build it first.
 */
export const SAMPLE_WORKSPACE = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'retro_on_key',
        x: 40,
        y: 40,
        fields: { KEY: 'left' },
        next: {
          block: {
            type: 'retro_set_velocity',
            inputs: {
              VX: { block: { type: 'math_number', fields: { NUM: -60 } } },
              VY: { block: { type: 'math_number', fields: { NUM: 0 } } },
            },
            next: { block: { type: 'retro_set_flip', fields: { FLIP: 'TRUE' } } },
          },
        },
      },
      {
        type: 'retro_on_key',
        x: 40,
        y: 200,
        fields: { KEY: 'right' },
        next: {
          block: {
            type: 'retro_set_velocity',
            inputs: {
              VX: { block: { type: 'math_number', fields: { NUM: 60 } } },
              VY: { block: { type: 'math_number', fields: { NUM: 0 } } },
            },
            next: { block: { type: 'retro_set_flip', fields: { FLIP: 'FALSE' } } },
          },
        },
      },
      {
        type: 'retro_on_key_pressed',
        x: 40,
        y: 360,
        fields: { KEY: 'a' },
        next: {
          block: {
            type: 'retro_jump',
            inputs: { STRENGTH: { block: { type: 'math_number', fields: { NUM: 200 } } } },
            next: {
              block: {
                type: 'retro_change_var',
                fields: { NAME: 'jumps' },
                inputs: { BY: { block: { type: 'math_number', fields: { NUM: 1 } } } },
                next: {
                  block: {
                    type: 'retro_play_sound',
                    fields: { WAVE: 'pulse50' },
                    inputs: { FREQ: { block: { type: 'math_number', fields: { NUM: 520 } } } },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
};
