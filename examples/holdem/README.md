# River Street

No-limit Texas hold'em against three bots, on a 560 x 400 screen.

```bash
bun install
bun dev          # http://localhost:3017
bun test         # 83 tests
```

| Key | Does |
| --- | --- |
| `Z` | Check or call |
| `X` | Fold |
| `↑` | Raise |
| `←` `→` | Change the raise |
| `Enter` | Deal the next hand |

## What it demonstrates

**A hand evaluator worth testing.** `src/evaluator.ts` finds the best five
cards in seven by scoring all twenty-one subsets. It is the part of a poker
game that must be exactly right and the part easiest to get subtly wrong — the
wheel straight ranks as a five, a flush beats the straight hiding in the same
seven cards, two pair breaks on the fifth card. Thirty-two tests cover those,
plus twelve thousand random deals that must produce every category.

**Side pots.** When a short stack is all in, every distinct all-in amount is a
layer: each seat pays up to it, and only the seats who reached it can win it.
Folded seats pay into the layers they reached and are eligible for none. The
tests assert the chips are conserved exactly, across sixty random hands.

**Opponents you can name.** ADA folds and then bets the house, BEN calls too
much, CAI raises with anything. Each decision in `src/ai.ts` is hand strength,
then pot odds, then personality — readable rather than optimal, because an
example whose AI is a black box teaches nobody anything.

Two bugs that showed up while tuning it are worth knowing about, and are
commented where they were fixed: a fold threshold built from pot odds plus a
margin can exceed the top of the strength scale, which folds a royal flush to
a big enough bet; and rating a pair by category alone makes a seven-deuce that
paired the board play exactly like pocket nines.
