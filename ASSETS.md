# Assets

Fourteen of the sixteen examples ship no image files at all: they build their
sprite sheets in code at start-up. The two that do are recorded below, with
what is known about where their art came from.

That is a deliberate constraint rather than an accident, and it is worth
stating because retro engines attract retro sprite sheets, and most of those
sheets belong to someone.

## Where the art comes from

| Example | Art |
| --- | --- |
| `demo-game`, `metal-slug`, `space-game` | Generated at run time |
| `cavern-dash`, `crypt-courier`, `doom-game` | Generated at run time |
| `tetris`, `ice-hockey-game`, `dust-protocol` | Generated at run time |
| `bounce-classic`, `bounce-raycaster` | Generated at run time |
| `pixel-patience`, `blackjack`, `holdem`, `gin-rummy` | The 8-bit playing card sheet in `packages/cards/assets`, with a generated deck as a fallback — see below |
| `trex-game` | Five PNGs of unrecorded origin — **see the note below** |

### `trex-game` needs a provenance check

`examples/trex-game/public/` carries five PNGs that predate this policy and
have no recorded source or licence. They may well be fine, but "may well be"
is not a licence, so treat them as unresolved: do not copy them into a new
example, and if you know where they came from, record it here. Replacing them
with generated art, the way the other fifteen examples work, would close the
question outright.

"Generated at run time" means the game builds its sprite sheets as RGBA byte
arrays and hands them to `upload_sheet`. `packages/cards/src/sheet.ts` is the
fullest example: a complete 52-card deck, pips and all, in about 250 lines of
pixel arithmetic.

## The card art

The four card games use **[8-bit Playing Cards][pack]** by **sdkfz181tiger**.
Its terms, in full:

[pack]: https://sdkfz181tiger.itch.io/assets-for-8bit-playing-card-games

```
- Free to use for personal and commercial projects
- No payment required
- Voluntary payment / tips are appreciated
- Credit is appreciated but not required
- Redistribution or reselling of the asset itself is not allowed
```

Credit is not required and is given anyway: every card game prints
`CARD ART: 8-BIT PLAYING CARDS BY SDKFZ181TIGER` under its controls, and
repeats it with a link under the canvas on the page. That text comes from one
place — `CARD_ART` in `packages/cards/src/assets.ts` — so it stays consistent
across all four games and is one edit to change.

The last clause is about repackaging or reselling the sheet as an asset, not
about using it in a game. Do not lift `packages/cards/assets/playing_cards.png`
out of this repository and redistribute it as art.

One copy lives in `packages/cards/assets/`, not four in the examples: the
games import `CARD_SHEET_URL` from `@cathode/cards`, so there is a single
55 KB file and a single credit line behind all of them.

### Swapping in a different sheet

`CardTable.create` takes a `cardsUrl`, and failing to load it is not an error
— the table falls back to the deck `packages/cards/src/sheet.ts` draws, which
has the same geometry. `table.deckSource` says which is in play, and the
status line under each canvas prints it. Both paths are covered by the
headless checks in `scripts/verify/`.

A replacement sheet must be a **15 x 4 grid of 58 x 80 cells**:

```
col  0        1   2   3  ...  13      14
row  back     A   2   3  ...  K       joker     spades
row  back     A   2   3  ...  K       joker     diamonds
row  back     A   2   3  ...  K       joker     clubs
row  back     A   2   3  ...  K       joker     hearts
```

`packages/cards/src/geometry.ts` holds those numbers, so a sheet with
different cell dimensions is a two-line change rather than a rewrite.

## Adding art to a new example

Prefer generating it. Twelve examples do, and it costs less than you would
think — `packages/cards/src/sheet.ts` draws a complete 52-card deck, pips and
all, in about 250 lines of pixel arithmetic.

If you do bring in third-party art: record its licence in this file, credit
the artist in the game rather than only in a file nobody opens, and keep a
generated fallback so the example still runs for someone who cannot use that
art.
