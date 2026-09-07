# @cathode/sdk

The TypeScript face of the engine: `Cathode` boots the wasm core against a
canvas, and everything else here — sprites, tilemaps, scenes, audio, input,
the raycaster, save slots, text — is a thin, typed layer over it.

```ts
import { BitmapFont, Cathode, Scene, Sprite } from '@cathode/sdk';

const engine = await Cathode.create(canvas, 'gameboy', 3);
const scene = new Scene(engine);
const font = BitmapFont.builtin(engine);

engine.loop((dt) => {
  scene.update(dt);
  font.draw('HELLO', 8, 8, 1);
});
```

See [docs/getting-started.md](../../docs/getting-started.md) to run something,
and [docs/architecture.md](../../docs/architecture.md) for how the layers fit
together.

## The built-in font

`BitmapFont.builtin` draws its glyphs from a hand-written 5x7 table in
`src/font-glyphs.ts` rather than rasterising a system typeface.

It used to do the latter — render a bold sans face at 4x and reduce it with a
threshold — and no threshold worked for every letter. Too low and the leg fell
off an `R`, so "ENTER" rendered as "ENTEN"; too high and the counters in `S`
and `O` filled in. Both shipped. Five by seven pixels is enough to draw every
glyph unambiguously, so they are drawn, and the output no longer depends on
which fonts the machine happens to have.

A game that wants its own glyphs passes a sheet to the `BitmapFont`
constructor; the built-in is the one that works before you have drawn
anything.

## Why `main` points at TypeScript source

`package.json` resolves `@cathode/sdk` to `src/index.ts`, not to a build.
Every consumer in this repository is a Vite app that compiles TypeScript
anyway, and pointing at `dist/` meant an example could silently run a stale
SDK: edit the source, reload the game, see the old behaviour, and have nothing
anywhere report a problem.

If the SDK is ever published to npm, that publish needs an `exports` map with
a built entry point — but nothing publishes it today, and until something
does, resolving to source is the configuration that cannot go stale.
