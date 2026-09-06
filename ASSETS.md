# Assets

Fifteen of the sixteen examples ship no image files at all: they build their
sprite sheets in code at start-up. Nothing in this repository is redistributed
against its licence, and nothing is ripped from a commercial game.

That is a deliberate constraint rather than an accident, and it is worth
stating because retro engines attract retro sprite sheets, and most of those
sheets belong to someone. The one loose end is recorded below.

## Where the art comes from

| Example | Art |
| --- | --- |
| `demo-game`, `metal-slug`, `space-game` | Generated at run time |
| `cavern-dash`, `crypt-courier`, `doom-game` | Generated at run time |
| `tetris`, `ice-hockey-game`, `dust-protocol` | Generated at run time |
| `bounce-classic`, `bounce-raycaster` | Generated at run time |
| `pixel-patience`, `blackjack`, `holdem`, `gin-rummy` | Generated at run time, or your own card sheet — see below |
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

## Bringing your own art

All four card games are set up to use a licensed 8-bit card sheet if you have
one. Save it as `playing_cards.png` in the example's folder — the same file
works for all four — and the game picks it up on the next reload; the status
line under the canvas says which deck is in play. The file is in each
example's `.gitignore`, so it will not be committed by accident.

```bash
for game in pixel-patience blackjack holdem gin-rummy; do
  cp ~/my-cards.png "examples/$game/playing_cards.png"
done
```

The sheet must be a **15 x 4 grid of 58 x 80 cells**:

```
col  0        1   2   3  ...  13      14
row  back     A   2   3  ...  K       joker     spades
row  back     A   2   3  ...  K       joker     diamonds
row  back     A   2   3  ...  K       joker     clubs
row  back     A   2   3  ...  K       joker     hearts
```

`packages/cards/src/geometry.ts` holds those numbers, so a sheet with
different cell dimensions is a two-line change rather than a rewrite.

## Why the sheet is not in the repository

The card art this example was built against ships with a licence that reads,
in full:

```
- Free to use for personal and commercial projects
- No payment required
- Voluntary payment / tips are appreciated
- Credit is appreciated but not required
- Redistribution or reselling of the asset itself is not allowed
```

The first four lines permit exactly what this example does with it. The last
one does not permit committing the PNG to a public repository, because that
redistributes the asset itself — a clone would hand out the sheet to anyone
who asked, which is the thing the licence withholds.

So the games read the sheet if it is there and draw their own deck if it is
not. Both paths are covered by the headless checks in `scripts/verify/`. If you are
adding an example that needs third-party art, do the same: keep the loader,
keep the fallback, and put the licence terms in this file.
