# Ten Card

Gin rummy to a hundred, against one opponent, on a 520 x 400 screen.

```bash
bun install
bun dev          # http://localhost:3018
bun test         # 65 tests
```

| Key | Does |
| --- | --- |
| `Z` | Draw from the stock · discard the selected card |
| `X` | Take the upcard |
| `←` `→` | Pick a card |
| `↑` | Knock |
| `Enter` | Next hand |

Knock with ten points or fewer. Gin — melding all ten — pays a 25 bonus and
cannot be laid off against. Knock too thin and the defender may undercut you,
taking the difference plus 25 for themselves.

## What it demonstrates

**A search, shown rather than summarised.** What a gin rummy hand is worth is
not a lookup: the same card can complete a set or a run, never both, so
`src/melds.ts` enumerates every meld in the hand and searches for the disjoint
combination leaving the least behind, memoised on which cards are spoken for.
The table then draws the answer — melded cards are outlined, loose ones are
not — so you can see what the solver decided instead of trusting a number.

The test that matters most is the one where a run of four gives up a card so a
set can form: both melds want the same seven, and only one order melds all six
cards. A solver that takes the first meld it finds gets it wrong.

**Laying off, repeatedly.** After a knock the defender puts what they can onto
the knocker's melds — and a card laid on the end of a run makes the next one
along legal too, so it loops until nothing more fits.

**A whole match in a unit test.** Nothing in `melds.ts`, `rummy.ts` or
`bot.ts` imports the engine, so a match to a hundred plays out in a
millisecond, asserting after every single turn that all 52 cards are still
accounted for.
