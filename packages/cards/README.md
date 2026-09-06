# @cathode/cards

The layer under the four card games: a deck, a bankroll, and a table that
pools its sprites.

Nothing in `card.ts`, `chips.ts` or `sheet.ts` imports the engine, so the
parts worth testing are tested without a canvas. Only `render.ts` touches
`@cathode/sdk`.

## What is in it

| Module | What it holds |
| --- | --- |
| `card.ts` | `Card`, a seeded shuffle, and a `Shoe` that reshuffles at a penetration point |
| `chips.ts` | `Bankroll` (wager, refund, settle) and `chipStack`, which breaks an amount into the fewest chips |
| `geometry.ts` | Card dimensions, sheet frame arithmetic, and generated felt, overlay and chip art |
| `sheet.ts` | A complete 52-card deck drawn in code — pips, rotated corner indices, a lattice back |
| `render.ts` | `CardTable`: sheets, sprite pools, and a per-frame draw list |

## Ranks

A card stores rank 0–12 with the ace at 0, because that is the order the
sprite sheet's columns are in. Every game wants something else, so the
conversions are here rather than repeated:

```ts
pokerRank(card)        // 2..14, ace high
blackjackValues(card)  // [1, 11] for an ace, [10] for a court card
deadwoodValue(card)    // gin rummy's, in examples/gin-rummy
```

## Drawing a table

`CardTable` hands out sprites in call order and layers them the same way, so
a card drawn later overlaps one drawn earlier — the same rule as a real
table. Pools grow to the frame's peak and are never rebuilt:

```ts
const table = await CardTable.create(engine, scene, {
  cardsUrl: new URL('../playing_cards.png', import.meta.url).href,
  width: 464, height: 416,
});

table.begin();
for (const [i, card] of hand.entries()) table.card(card, x + i * 24, y);
table.chips(pot, 200, 150);
table.marker('cursor', x, y);
table.end();          // hides whatever the frame did not claim
```

`cardsUrl` is optional and failing to load it is not an error: the table
falls back to the deck `sheet.ts` draws, which has the same 15 x 4 geometry.
`table.deckSource` says which one is in play. See [ASSETS.md](../../ASSETS.md)
for why.
