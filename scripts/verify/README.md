# Headless game checks

Each script drives a real browser against a running dev server and asserts
what a unit test cannot: that the game boots, draws something, and responds to
a d-pad.

They are deliberately not part of `npm test`. They need a browser and a
server, and a test suite that needs both is a test suite people stop running.

```bash
npm i -D --no-save playwright@1.47.2

cd examples/gin-rummy && npx vite --port 3018 &
node scripts/verify/rummy.mjs --port 3018
```

| Script | Game | Default port |
| --- | --- | --- |
| `patience.mjs` | `examples/pixel-patience` | 3015 |
| `blackjack.mjs` | `examples/blackjack` | 3016 |
| `holdem.mjs` | `examples/holdem` | 3017 |
| `rummy.mjs` | `examples/gin-rummy` | 3018 |
| `site.mjs` | the whole site, plus all sixteen games | 3021 |

Each exits non-zero if any check fails, so they can be chained.

Chromium comes from `PLAYWRIGHT_BROWSERS_PATH`; override it with
`CATHODE_CHROMIUM` if yours is elsewhere. Do not run `playwright install` —
`npm install` prunes a `--no-save` playwright, so re-run the install line above
after any dependency change.

## Writing another one

Games expose a `window.__name` hook with a `state()` function and whatever
else the checks need to reach a position quickly — `stageAlmostWon()` in the
solitaire, `autoPlay()` in the card games. Reaching a rare branch by pressing
keys for two minutes is not a test, it is a wait.

`lib.mjs` measures "ink" rather than counting colours: the share of pixels
that are not the most common one. Counting distinct colours calls a healthy
two-tone Game Boy screen blank.

`site.mjs` checks that each game *boots*, not that its URL returns 200. An
earlier version checked only status codes and passed while every game on the
site was broken: the HTML loaded, the module inside it 404'd, and the canvas
sat at its untouched 300x150 default. A status code is not evidence that
anything ran.
