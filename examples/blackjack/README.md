# Twenty-One

Blackjack against the house, on a 464 x 360 screen.

```bash
bun install
bun dev          # http://localhost:3016
bun test         # 52 rule tests
```

| Key | Does |
| --- | --- |
| `←` `→` | Change your bet |
| `Z` | Deal · hit · take insurance |
| `X` | Stand · decline insurance |
| `↑` | Double |
| `↓` | Split |
| `Enter` | Next hand |

House rules: six decks, dealer stands on soft 17, blackjack pays 3:2, split
up to four hands, double after split allowed.

## What it demonstrates

**A screen that fits the game.** Two hands and a stake need 360 rows, so that
is what the profile asks for. Padding it out to a console's aspect ratio would
only have added empty felt.

**Rules as a value.** `src/blackjack.ts` is a `Table` you push actions into,
and every question — may I split, what does this hand pay, must the dealer
draw — is a function of it. That is what lets the dealer policy and the whole
payout table be tested rather than played by hand, including the cases that
are awkward to reach live: split aces, an insurance bet against a dealer
blackjack, a doubled hand against a bust dealer.

**Soft and hard totals.** `handValue` returns both the total and whether an
ace is counting as eleven, because a soft 17 can be hit without risk and a
hard 17 cannot — and the S17/H17 rule turns on exactly that one bit.
