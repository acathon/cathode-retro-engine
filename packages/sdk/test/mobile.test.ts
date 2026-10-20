import { describe, expect, it } from 'vitest';
import { fitScale, padDirections, pauseWhenHidden } from '../src/mobile';
import { InputReader } from '../src/input';

const pressed = (d: ReturnType<typeof padDirections>) =>
  (['up', 'down', 'left', 'right'] as const).filter((k) => d[k]).join('+') || 'none';

describe('padDirections', () => {
  const R = 60;

  it('presses nothing in the dead zone, so a resting thumb does not drift', () => {
    expect(pressed(padDirections(0, 0, R))).toBe('none');
    expect(pressed(padDirections(10, -5, R))).toBe('none');
  });

  it.each([
    [40, 0, 'right'],
    [-40, 0, 'left'],
    [0, -40, 'up'],      // screen y grows downwards
    [0, 40, 'down'],
    [30, -30, 'up+right'],
    [-30, -30, 'up+left'],
    [30, 30, 'down+right'],
    [-30, 30, 'down+left'],
  ])('a thumb at (%i, %i) presses %s', (dx, dy, want) => {
    expect(pressed(padDirections(dx, dy, R))).toBe(want);
  });

  it('keeps steering after the thumb slides off the pad', () => {
    expect(pressed(padDirections(400, 0, R))).toBe('right');
  });

  it('rolling from left to up passes through the diagonal, never through nothing', () => {
    const seen = new Set<string>();
    for (let deg = 180; deg >= 90; deg -= 5) {
      const rad = (deg * Math.PI) / 180;
      seen.add(pressed(padDirections(Math.cos(rad) * 40, -Math.sin(rad) * 40, R)));
    }
    expect([...seen]).toEqual(['left', 'up+left', 'up']);
  });
});

describe('fitScale', () => {
  it('fills a phone screen, held sideways, limited by its height', () => {
    // NES 256x240 on an 844x390 landscape phone at 3x density.
    const s = fitScale(844, 390, 256, 240, 3, 3, true);
    expect(240 * s).toBeLessThanOrEqual(390);
    expect(240 * s).toBeGreaterThan(390 * 0.9);
  });

  it('snaps to whole device pixels per game pixel when that is nearly free', () => {
    // Game Boy on the same phone: 2.71x would snap to 2.67x, losing 1.5%.
    const s = fitScale(844, 390, 160, 144, 3, 3, true);
    expect(Number.isInteger(Math.round(s * 3 * 1e9) / 1e9)).toBe(true);
    expect(144 * s).toBeGreaterThan(390 * 0.98);
  });

  it('does not snap when it would cost more than a tenth of the size', () => {
    // NES on that phone: 1.625x would snap to 1.33x, losing 18%. Filling the
    // screen matters more than pixels a fifth of a device pixel uneven.
    const s = fitScale(844, 390, 256, 240, 3, 3, true);
    expect(s).toBeCloseTo(390 / 240, 5);
  });

  it('keeps fractional size rather than lose more than a tenth of it', () => {
    // On a 1x screen, snapping 2.73 down to 2 would cost a quarter of the size.
    const s = fitScale(700, 800, 256, 240, 1, 3, false);
    expect(s).toBeCloseTo(700 / 256, 5);
  });

  it('on a desktop, keeps the scale the game asked for when it fits', () => {
    expect(fitScale(1920, 1080, 256, 240, 1, 3, false)).toBe(3);
  });

  it('on a desktop, still shrinks to fit a window that is too small', () => {
    expect(fitScale(1920, 500, 256, 240, 1, 3, false) * 240).toBeLessThanOrEqual(500);
  });

  it('keeps the requested scale while there is no room to measure yet', () => {
    expect(fitScale(0, 0, 256, 240, 2, 3, true)).toBe(3);
  });
});

describe('pauseWhenHidden', () => {
  function fakePage() {
    const listeners = new Set<() => void>();
    const doc = {
      hidden: false,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      set(hidden: boolean) { doc.hidden = hidden; listeners.forEach((fn) => fn()); },
      listeners,
    };
    return doc;
  }
  function fakeGame(paused = false) {
    return { isPaused: paused, pause() { this.isPaused = true; }, resume() { this.isPaused = false; } };
  }

  it('pauses when the app goes to the background and resumes when it returns', () => {
    const page = fakePage(); const game = fakeGame();
    pauseWhenHidden(game, page as any);
    page.set(true);
    expect(game.isPaused).toBe(true);
    page.set(false);
    expect(game.isPaused).toBe(false);
  });

  it('leaves a game the player paused paused', () => {
    const page = fakePage(); const game = fakeGame(true);
    pauseWhenHidden(game, page as any);
    page.set(true);
    page.set(false);
    expect(game.isPaused).toBe(true);
  });

  it('stops listening when asked to', () => {
    const page = fakePage();
    const stop = pauseWhenHidden(fakeGame(), page as any);
    stop();
    expect(page.listeners.size).toBe(0);
  });
});

describe('InputReader: the buttons a game asks for', () => {
  it('records each button the first time it is read, and only once', () => {
    const input = new InputReader();
    const heard: string[] = [];
    input.onAsk((player, btn) => heard.push(`${player}:${btn}`));
    input.held(0, 'left');
    input.justPressed(0, 'a');
    input.held(0, 'left');
    input.justReleased(1, 'start');
    expect(heard).toEqual(['0:left', '0:a', '1:start']);
    expect([...input.askedFor(0)]).toEqual(['left', 'a']);
  });

  it('tells a late listener about buttons asked for before it arrived', () => {
    const input = new InputReader();
    input.held(0, 'start');
    const heard: string[] = [];
    input.onAsk((_, btn) => heard.push(btn));
    expect(heard).toEqual(['start']);
  });

  it('stops telling a listener that unsubscribed', () => {
    const input = new InputReader();
    const heard: string[] = [];
    const stop = input.onAsk((_, btn) => heard.push(btn));
    stop();
    input.held(0, 'b');
    expect(heard).toEqual([]);
  });

  it('reports what the overlay set, the same way it reports a key', () => {
    const input = new InputReader();
    input.setState(0, { left: true, a: true });
    expect(input.held(0, 'left')).toBe(true);
    expect(input.justPressed(0, 'a')).toBe(true);
    input.snapshot();
    expect(input.justPressed(0, 'a')).toBe(false);
  });
});
