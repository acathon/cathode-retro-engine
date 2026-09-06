# Pixel Patience

Klondike solitaire, played with a d-pad.

```bash
bun install
bun dev          # http://localhost:3015
bun test         # 45 rule tests
```

## Controls

| Key | Does |
| --- | --- |
| `←` `→` | Move between piles |
| `↑` `↓` | Take more or fewer cards from a column |
| `Z` | Pick up · drop · deal from the stock |
| `X` | Send the card under the cursor wherever it should go |
| `Enter` | New deal |

Clear the board and the game finishes itself rather than making you click out
a foregone conclusion.

## What it demonstrates

**A custom hardware profile.** A card is 58x80, and seven columns of them do
not fit on any of the console presets. `Cathode.custom()` takes a 464x416
screen instead, which is the point of the presets being a starting position
rather than a cage — pick the platform at export, not at the start.

**52 sprites on screen at once.** Every card is its own sprite, pooled at
start-up and repositioned each frame, so nothing allocates in the loop. That
only works because sprite budgets are no longer enforced at run time; set
`sprite_limit` when you want a console's constraint back.

**Rules separated from pixels.** `src/klondike.ts` imports nothing from the
engine: it is a pure state machine over piles of cards, which is why the whole
rule set is unit-tested. `src/main.ts` never mutates the game directly — it
asks `applyMove` and draws whatever comes back.

**Sprite sheets written in code.** `src/deck.ts` draws a complete 52-card
deck — pips in their traditional layouts, rotated corner indices, a lattice
back — as an RGBA byte array. See [ASSETS.md](../../ASSETS.md) for how to use
your own card sheet instead.
