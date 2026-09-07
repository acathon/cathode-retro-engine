/*
 * The hero demo: a fire effect at 320x200, in the VGA palette.
 *
 * This is the oldest trick in the DOS demoscene — seed the bottom row with
 * heat, then every pixel above averages its neighbours below and cools by a
 * little. It is here because it is exactly what the engine's new `dos`
 * profile is for, and because it draws itself: no assets, no engine, about
 * forty lines.
 *
 * Pure canvas 2D on purpose. The site should render on a page that has never
 * loaded WebAssembly.
 */
(() => {
  const canvas = document.getElementById('hero-demo');
  if (!canvas) return;

  const W = 320;
  const H = 200;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  /** A 37-step fire ramp: black, red, orange, yellow, white. */
  const ramp = [];
  for (let i = 0; i < 37; i++) {
    const t = i / 36;
    const r = Math.min(255, Math.round(t * 3 * 255));
    const g = Math.min(255, Math.round(Math.max(0, t - 0.33) * 3 * 255));
    const b = Math.min(255, Math.round(Math.max(0, t - 0.66) * 3 * 255));
    ramp.push([r, g, b]);
  }

  /*
   * The wordmark, burned into the heat buffer rather than painted over it.
   *
   * Seeding heat in the shape of letters is how a DOS intro did this: the
   * same cooling pass that makes the flames then licks at the glyphs, so the
   * logo shimmers instead of sitting on top like a sticker.
   */
  const GLYPHS = {
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  };
  const WORD = 'CATHODE';
  const SCALE = 5;
  const wordWidth = WORD.length * 6 * SCALE - SCALE;
  const wordX = Math.round((W - wordWidth) / 2);
  // Low enough that the plumes off the letters nearly meet the flames at
  // the base, rather than leaving a dead band across the middle.
  const wordY = 84;

  const heat = new Uint8Array(W * H);
  const image = ctx.createImageData(W, H);
  const pixels = image.data;

  /* Respect a reader who has asked for less motion: draw one frame, stop. */
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function seed() {
    for (let x = 0; x < W; x++) {
      heat[(H - 1) * W + x] = Math.random() < 0.92 ? 36 : 0;
    }
  }

  /** Re-seed the letters every frame so they stay lit as the fire eats them. */
  function brand() {
    for (let i = 0; i < WORD.length; i++) {
      const glyph = GLYPHS[WORD[i]];
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (glyph[gy][gx] !== '#') continue;
          for (let sy = 0; sy < SCALE; sy++) {
            for (let sx = 0; sx < SCALE; sx++) {
              const x = wordX + (i * 6 + gx) * SCALE + sx;
              const y = wordY + gy * SCALE + sy;
              if (x >= 0 && x < W && y >= 0 && y < H) heat[y * W + x] = 26;
            }
          }
        }
      }
    }
  }

  function cool() {
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W; x++) {
        const below = (y + 1) * W + x;
        const sum = heat[below]
          + heat[below + (x > 0 ? -1 : 0)]
          + heat[below + (x < W - 1 ? 1 : 0)]
          + heat[Math.min(H - 1, y + 2) * W + x];
        // The subtraction is the cooling; the random makes it flicker.
        // A lower cooling chance makes taller flames: at 0.38 the fire only
        // filled the bottom third of the panel.
        heat[y * W + x] = Math.max(0, (sum >> 2) - (Math.random() < 0.30 ? 1 : 0));
      }
    }
  }

  function paint() {
    for (let i = 0; i < W * H; i++) {
      const [r, g, b] = ramp[heat[i]];
      const o = i * 4;
      pixels[o] = r;
      pixels[o + 1] = g;
      pixels[o + 2] = b;
      pixels[o + 3] = 255;
    }
    stampWord();
    ctx.putImageData(image, 0, 0);
  }

  /**
   * The letters again, this time straight into the pixels at full brightness.
   *
   * Seeding heat alone made the plumes swallow the letterforms — a burning
   * logo you cannot read is just a fire. Seeding gives the flame something to
   * rise off; this keeps the word legible underneath it.
   */
  function stampWord() {
    for (let i = 0; i < WORD.length; i++) {
      const glyph = GLYPHS[WORD[i]];
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (glyph[gy][gx] !== '#') continue;
          for (let sy = 0; sy < SCALE; sy++) {
            for (let sx = 0; sx < SCALE; sx++) {
              const x = wordX + (i * 6 + gx) * SCALE + sx;
              const y = wordY + gy * SCALE + sy;
              if (x < 0 || x >= W || y < 0 || y >= H) continue;
              const o = (y * W + x) * 4;
              pixels[o] = 255;
              pixels[o + 1] = 244;
              pixels[o + 2] = 214;
            }
          }
        }
      }
    }
  }

  let running = true;
  // Stop burning CPU when the tab is hidden or the demo scrolls away.
  document.addEventListener('visibilitychange', () => { running = !document.hidden; });

  function frame() {
    if (running) {
      seed();
      brand();
      cool();
      paint();
    }
    if (!still) requestAnimationFrame(frame);
  }

  // Warm it up so the first painted frame is already a fire, not a black box.
  for (let i = 0; i < 140; i++) { seed(); brand(); cool(); }
  frame();
})();
