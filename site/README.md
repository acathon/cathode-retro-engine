# The Cathode site

Four hand-written pages and eight generated ones.

```
site/
  index.html     what the engine is, a live demo, the profiles, a code sample
  games.html     all sixteen demos
  docs.html      the documentation hub
  docs/*.html    generated from docs/*.md — do not edit these
  assets/        the shared stylesheet and the hero demo
```

## Two ways to run it

**Browsing the repository.** Serve the repository root and open
`/site/index.html`. Game links point at `../examples/<name>/` and Vite
compiles each game on the fly:

```bash
npx vite --port 3021          # from the repository root
```

**Deploying it.** A static host has no Vite, so the games have to be built:

```bash
npm run build:dist            # -> site/dist/
```

That renders the docs, builds all sixteen examples with relative asset paths,
copies them under `site/dist/games/<name>/`, and rewrites the gallery links to
match. The result is a directory you can drop on any static host — no server
build step, no configuration. `site/dist/` is gitignored.

## Editing

- **Prose in the docs pages** — edit the markdown in `docs/`, then run
  `npm run build:site`. The HTML under `site/docs/` is generated and committed
  so that `site/` is servable without a build; editing it directly will be
  overwritten.
- **The other pages** — edit the HTML directly.
- **Styling** — `assets/style.css`, shared by every page.
- **The hero** — `assets/hero.js`. A fire effect at 320×200 with the wordmark
  burned into the heat buffer, in plain canvas 2D so the front page renders on
  a machine that has never loaded WebAssembly.

## Checking it

```bash
npm i -D --no-save playwright@1.47.2
npx vite --port 3021 &
node scripts/verify/site.mjs --port 3021
```

That asserts every page renders without horizontal overflow, every internal
link resolves, and — the part that matters — every game actually boots rather
than merely returning a 200.
