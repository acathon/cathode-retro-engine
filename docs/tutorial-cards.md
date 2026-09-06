# Building a card game

Four of the examples are card games, and they share one small package. This
walks through what is in it, how to build a fifth game on it, and the two
design decisions that make the difference between a card game you can test and
one you can only play.

By the end you will have written a working game of War — the simplest card
game there is — and will know where to put the interesting parts of a harder
one.

**Prerequisites:** [getting-started.md](./getting-started.md). This assumes you
have run an example.

---

## 1. The one decision that matters

Every card game here is split the same way:

```
src/
  <rules>.ts    the game, as a value you push actions into — no engine imports
  main.ts       the table: layout, input, drawing
```

That split is not tidiness. It is the reason a poker hand evaluator, a
blackjack payout table and a gin rummy meld search are covered by 232 unit
tests that run in under two seconds with no browser anywhere.

The rule is simple and worth being strict about:

> The rules module may not import from `@cathode/sdk`.

If it needs to know where a card is on screen, the split is in the wrong place.
`main.ts` decides *which* move to ask for; the rules module decides whether it
is legal and what it does.

A useful shape for the rules module:

```ts
export interface Game { /* the whole position, as plain data */ }

export function createGame(seed: number): Game;
export function legalActions(game: Game): Legal;   // what may happen now
export function act(game: Game, action: Action): boolean;  // false = illegal
```

`act` returning `false` rather than throwing means "did it move?" and "was it
allowed?" are the same question, which is exactly what a UI wants to ask.

---

## 2. What `@cathode/cards` gives you

```ts
import {
  Bankroll, CARD_SHEET_URL, CardTable, Shoe,
  freshDeck, makeRng, shuffle, pokerRank, type Card,
} from '@cathode/cards';
```

### Cards

A `Card` is `{ suit, rank, faceUp }`. Rank runs 0–12 with the **ace at 0**,
because that is the order the sprite sheet's columns are in. Every game wants
something else, so the conversions live in the package rather than in four
copies:

```ts
pokerRank(card)        // 2..14, ace high
blackjackValues(card)  // [1, 11] for an ace, [10] for a court card
```

### Dealing

`shuffle` is seeded, so a seed always deals the same game — which is what makes
a failing test reproducible:

```ts
const deck = shuffle(freshDeck(), makeRng(seed));
```

For games that deal continuously, `Shoe` handles multiple decks and reshuffles
at a penetration point, the way a casino shoe does:

```ts
const shoe = new Shoe(seed, 6);   // six decks
const card = shoe.draw();         // reshuffles itself when it runs down
```

### Money

`Bankroll` keeps wagers separate from the stack, and clamps an oversized bet to
the stack rather than erroring — because betting more than you hold is not a
mistake, it is going all in:

```ts
const bank = new Bankroll(500);
bank.wager(1000);   // returns 500; that is what all in means
bank.settle(0);     // a loss: nothing comes back
bank.settle(bet);   // a push
bank.settle(bet * 2);  // even money
```

### The table

`CardTable` owns the sheets, the felt and the sprite pools:

```ts
const table = await CardTable.create(engine, scene, {
  cardsUrl: CARD_SHEET_URL,
  width: SCREEN_W,
  height: SCREEN_H,
});
```

Then, once per frame, a draw list:

```ts
table.begin();
hand.forEach((card, i) => table.card(card, x + i * 24, y));
table.marker('cursor', x + selected * 24, y);
table.chips(pot, 200, 150);
table.end();      // hides whatever the frame did not claim
```

Sprites are handed out in call order and layered in call order, so a card drawn
later overlaps one drawn earlier — the same rule as a real table. Pools grow to
the frame's busiest moment and are never rebuilt, so nothing allocates in the
loop.

---

## 3. Pick a screen, not a console

A playing card is 58 × 80 pixels. Seven columns of them do not fit on a Game
Boy, and neither do four hands and a five-card board:

```ts
const engine = await Cathode.custom(canvas, {
  width: 464, height: 416, fps: 60, audio_channels: 4,
  sprite_limit: 0,          // 0 is unlimited
  scanlines: false, pixel_perfect: true,
  profile: 'Custom', title: 'My Card Game',
} as never, 2);
```

Two things there are worth pausing on.

**`sprite_limit: 0`.** The console presets carry real sprite budgets, and a
full solitaire tableau is 52 cards plus overlays — well past all of them. Caps
are not enforced at run time; you set one when you *want* a console's
constraint back, and check against a target at export instead.

**The screen size is yours.** Each card game here picks a different one: 464 ×
416 for solitaire, 464 × 360 for blackjack, 560 × 400 for four-handed poker.
Padding a game out to a console's aspect ratio only adds empty felt.

---

## 4. Writing one: War

War has no decisions in it, which makes it a good first target — you can get
the whole loop working before thinking about rules.

### The rules module

`src/war.ts`, with no engine imports:

```ts
import { freshDeck, makeRng, pokerRank, shuffle, type Card } from '@cathode/cards';

export interface Game {
  hands: [Card[], Card[]];
  /** Cards face up on the table this turn. */
  table: [Card[], Card[]];
  winner: number;     // -1 while nobody has won
  turns: number;
}

export function createGame(seed: number): Game {
  const deck = shuffle(freshDeck(true), makeRng(seed));
  return {
    hands: [deck.slice(0, 26), deck.slice(26)],
    table: [[], []],
    winner: -1,
    turns: 0,
  };
}

/**
 * Play one turn. Returns false when the game is already over.
 *
 * A tie puts three cards face down and turns a fourth — the "war" the game is
 * named for — and the winner takes everything on the table.
 */
export function playTurn(game: Game): boolean {
  if (game.winner >= 0) return false;

  game.table = [[], []];
  let contested = true;

  while (contested) {
    for (const seat of [0, 1]) {
      const card = game.hands[seat].shift();
      if (!card) { game.winner = 1 - seat; return true; }
      game.table[seat].push(card);
    }

    const a = game.table[0][game.table[0].length - 1];
    const b = game.table[1][game.table[1].length - 1];

    if (pokerRank(a) === pokerRank(b)) {
      // Three down each, then turn again.
      for (const seat of [0, 1]) {
        for (let i = 0; i < 3; i++) {
          const card = game.hands[seat].shift();
          if (card) game.table[seat].push(card);
        }
      }
    } else {
      const winner = pokerRank(a) > pokerRank(b) ? 0 : 1;
      game.hands[winner].push(...game.table[0], ...game.table[1]);
      contested = false;
    }
  }

  game.turns++;
  if (!game.hands[0].length) game.winner = 1;
  if (!game.hands[1].length) game.winner = 0;
  return true;
}
```

### The tests, before the pixels

```ts
import { describe, expect, it } from 'vitest';
import { createGame, playTurn } from '../src/war';

describe('war', () => {
  it('deals twenty-six each', () => {
    const g = createGame(1);
    expect(g.hands[0]).toHaveLength(26);
    expect(g.hands[1]).toHaveLength(26);
  });

  it('never loses or invents a card', () => {
    const g = createGame(7);
    for (let i = 0; i < 500 && g.winner < 0; i++) playTurn(g);
    const all = [...g.hands[0], ...g.hands[1], ...g.table[0], ...g.table[1]];
    expect(new Set(all.map((c) => `${c.suit}:${c.rank}`)).size).toBe(52);
  });

  it('ends with somebody holding everything', () => {
    const g = createGame(3);
    for (let i = 0; i < 5000 && g.winner < 0; i++) playTurn(g);
    if (g.winner >= 0) expect(g.hands[g.winner].length).toBeGreaterThan(0);
  });
});
```

That second test — *never loses or invents a card* — is the single most
valuable test in any card game. Write it first. It catches every splice
off-by-one you are going to make.

### The table

```ts
const table = await CardTable.create(engine, scene, {
  cardsUrl: CARD_SHEET_URL, width: SCREEN_W, height: SCREEN_H,
});

engine.loop((dt) => {
  scene.update(dt);
  if (engine.input.justPressed(0, 'a')) playTurn(game);

  table.begin();
  // Two decks, face down, and whatever is face up between them.
  if (game.hands[0].length) table.back(60, 40);
  if (game.hands[1].length) table.back(60, 240);
  game.table[0].forEach((c, i) => table.face(c, 200 + i * 18, 40));
  game.table[1].forEach((c, i) => table.face(c, 200 + i * 18, 240));
  table.end();

  font.draw(`${game.hands[0].length} v ${game.hands[1].length}`, 8, 8, 1);
});
```

That is a complete game. Everything harder is more rules, not more drawing.

---

## 5. Where the hard parts go

The three non-trivial card games here each put their difficulty in one pure,
testable module. If you are writing something similar, copy the shape:

| Game | The hard part | Where it lives |
| --- | --- | --- |
| Blackjack | Soft/hard aces, and the S17/H17 rule that turns on them | `handValue` returns `{ total, soft }` — the *hand* knows, not the card |
| Hold'em | Best five of seven | `evaluate` scores all twenty-one subsets and takes the max |
| Gin rummy | Which arrangement of melds leaves least behind | `bestArrangement` searches, memoised on which cards are used |

Two of those look expensive and are not. Twenty-one five-card scores per hand
is nothing at four players; a gin rummy hand yields a few dozen candidate melds
and the search is milliseconds. **Reach for the exhaustive version first.** The
score a player sees is then the score, not an estimate they can beat by
rearranging their own cards by hand — and you will not spend an evening
wondering whether a greedy solver was wrong or the rules were.

---

## 6. Art

`CardTable` prefers the sheet you give it and falls back to a deck it draws
itself if that fails to load:

```ts
table.deckSource   // 'playing_cards.png' or 'generated deck'
```

The generated deck lives in `packages/cards/src/sheet.ts` — a complete 52 cards
in about 250 lines of pixel arithmetic, which is worth reading if you have ever
assumed you need an artist to start. It is also why the card games have two
paths worth testing, and why `scripts/verify/` exercises both.

To use a different sheet, keep the geometry: **15 columns by 4 rows of 58 × 80
cells**, backs in column 0, ace through king in columns 1–13.
`packages/cards/src/geometry.ts` holds those numbers.

See [ASSETS.md](../ASSETS.md) for the licence on the art that ships here.

---

## 7. Checking it works

Unit tests cover the rules. For the table itself, `scripts/verify/` drives a
real browser against the dev server and asserts what a unit test cannot — that
the game boots, draws, and answers a d-pad:

```bash
npm i -D --no-save playwright@1.47.2
cd examples/my-card-game && npx vite --port 3019 &
node scripts/verify/my-card-game.mjs --port 3019
```

Expose a `window.__mygame` hook with a `state()` function and whatever else
lets a check reach a position quickly — `stageAlmostWon()` in the solitaire,
`autoPlay()` in the others. Reaching a rare branch by pressing keys for two
minutes is not a test, it is a wait.

---

## Next

- [`packages/cards/README.md`](../packages/cards/README.md) — the API in full
- [`examples/gin-rummy`](../examples/gin-rummy) — the most interesting rules module of the four
- [`examples/holdem`](../examples/holdem) — the evaluator, side pots, and opponents
- [tutorial-bounce.md](./tutorial-bounce.md) — the same treatment for a physics game
