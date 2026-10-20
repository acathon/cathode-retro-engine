/**
 * What a game needs to behave on a phone: fill the screen around whatever
 * else is on its page, stay clear of the notch and the home bar, stop when
 * the app goes to the background, and not let a stray gesture zoom or scroll
 * the page out from under the player.
 *
 * The engine applies all of it on its own. A game written for a keyboard runs
 * on a phone without changing a line.
 */

/** A phone or tablet: the main pointer is a finger, not a mouse. */
export function isTouchFirst(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Space taken by the notch, rounded corners and home bar. Zero where there are none. */
export function safeAreaInsets(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;'
    + 'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const insets = {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

/**
 * The CSS scale to draw a `gameW` x `gameH` screen at, inside `availW` x
 * `availH` CSS pixels.
 *
 * With `grow`, the game fills the space (a phone). Without it, the scale the
 * game asked for is kept whenever it fits, and only shrinks when it would not
 * (a desktop page keeps its size unless the window is too small).
 *
 * The result is snapped down to a whole number of *device* pixels per game
 * pixel whenever that costs less than a tenth of the size, so every game pixel
 * covers the same number of screen pixels and nothing shimmers. On a phone's
 * dense screen the snap is nearly free.
 */
export function fitScale(
  availW: number,
  availH: number,
  gameW: number,
  gameH: number,
  dpr: number,
  preferred: number,
  grow: boolean,
): number {
  const max = Math.min(availW / gameW, availH / gameH);
  if (!(max > 0) || !Number.isFinite(max)) return preferred;
  const scale = grow ? max : Math.min(preferred, max);
  const snapped = Math.floor(scale * dpr) / dpr;
  return snapped > 0 && snapped >= scale * 0.9 ? snapped : scale;
}

export interface Directions {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Which directions a thumb at (`dx`, `dy`) from the d-pad's centre presses.
 * Screen coordinates: `dy` grows downwards.
 *
 * Eight-way: the circle is cut into eight slices of 45°, so a thumb between
 * right and up presses both. Within the dead zone it presses nothing, so a
 * thumb resting on the centre does not drift. Distance beyond the pad does
 * not matter, so a thumb that slides off the edge keeps steering.
 */
export function padDirections(dx: number, dy: number, radius: number, deadZone = 0.25): Directions {
  if (Math.hypot(dx, dy) < radius * deadZone) {
    return { up: false, down: false, left: false, right: false };
  }
  const sector = Math.round(Math.atan2(-dy, dx) / (Math.PI / 4)); // -4 .. 4, 0 is right
  return {
    right: sector >= -1 && sector <= 1,
    up: sector >= 1 && sector <= 3,
    left: sector >= 3 || sector <= -3,
    down: sector <= -1 && sector >= -3,
  };
}

/** Anything with a pause button. */
export interface Pausable {
  pause(): void;
  resume(): void;
  readonly isPaused: boolean;
}

/**
 * Pause while the page is hidden — the app sent to the background, the phone
 * locked — and resume on return. Only resumes what it paused: a game the
 * player had paused stays paused.
 *
 * Returns a function that stops listening.
 */
export function pauseWhenHidden(
  target: Pausable,
  doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> = document,
): () => void {
  let pausedByUs = false;
  const onChange = () => {
    if (doc.hidden) {
      if (!target.isPaused) {
        target.pause();
        pausedByUs = true;
      }
    } else if (pausedByUs) {
      pausedByUs = false;
      target.resume();
    }
  };
  doc.addEventListener('visibilitychange', onChange);
  return () => doc.removeEventListener('visibilitychange', onChange);
}

const STYLE_ID = 'cathode-mobile-style';

/**
 * Page rules for touch screens, added once.
 *
 * Elements marked `data-keyboard-hint` ("Z to jump") are hidden on a touch
 * screen, where they describe keys the player does not have.
 */
export function applyMobileStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@media (pointer: coarse) {
  html, body {
    overscroll-behavior: none;          /* no pull-to-refresh mid-game */
    touch-action: manipulation;         /* no double-tap zoom */
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;        /* no long-press menu */
    -webkit-tap-highlight-color: transparent;
  }
  [data-keyboard-hint] { display: none !important; }
}`;
  document.head.appendChild(style);
}

/**
 * Keeps a canvas as large as the screen allows, around everything else on its
 * page.
 *
 * Most game pages put a score bar above the canvas and instructions below it.
 * Rather than assume the canvas owns the screen, this measures how much room
 * the rest of the page needs and gives the canvas what is left.
 */
export class ScreenFit {
  /** The scale last applied, in CSS pixels per game pixel. */
  scale = 1;
  private readonly onResize = () => this.apply();

  /**
   * Refits when the page around the game changes size -- a score line the
   * game adds after it starts, a message that wraps onto a second line.
   * Each element is observed once: observing fires straight away, so
   * re-observing on every fit would refit forever.
   */
  private observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.schedule()) : null;
  private observed = new WeakSet<Element>();
  private pending = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private gameW: number,
    private gameH: number,
    private preferred: number,
    private grow: boolean,
  ) {
    this.apply();
    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
  }

  apply(): void {
    const insets = safeAreaInsets();
    const view = window.visualViewport;
    const viewW = view?.width ?? window.innerWidth;
    const viewH = view?.height ?? window.innerHeight;
    const screenW = viewW - insets.left - insets.right;
    const screenH = viewH - insets.top - insets.bottom;

    let availW = screenW;
    let availH = screenH;
    // Twice: the rest of the page can reflow when the canvas changes size.
    for (let pass = 0; pass < 2; pass++) {
      availH = screenH - this.pageAroundCanvas();
      this.resize(availW, availH);
    }
    // A desktop page is allowed to scroll. A phone game is not.
    if (!this.grow) return;

    // Whatever still overflows -- a wrapper's padding, a margin, a border --
    // comes out of the canvas, the one thing on the page that can give. The
    // floor stops a page whose other content is simply too big from
    // shrinking the game to nothing.
    for (let pass = 0; pass < 3; pass++) {
      // Two measures, because each misses what the other catches. A page that
      // centres its content spills over the top as well as the bottom, and
      // only the bottom half shows up as scrolling; the extent of its content
      // sees both. Padding on the body itself is in no element's box; the
      // scroll size sees it.
      const extent = this.pageExtent();
      const page = document.documentElement;
      const overX = Math.max(0, extent.width - viewW, page.scrollWidth - viewW);
      const overY = Math.max(0, extent.height - viewH, page.scrollHeight - viewH);
      if (overX < 1 && overY < 1) break;
      availW = Math.max(screenW * 0.6, availW - overX);
      availH = Math.max(screenH * 0.6, availH - overY);
      this.resize(availW, availH);
    }
  }

  /** One refit per frame, however many things changed size in it. */
  private schedule(): void {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      this.apply();
    });
  }

  private watch(el: Element): void {
    if (!this.observer || this.observed.has(el)) return;
    this.observed.add(el);
    this.observer.observe(el);
  }

  private resize(availW: number, availH: number): void {
    this.scale = fitScale(availW, availH, this.gameW, this.gameH, window.devicePixelRatio || 1, this.preferred, this.grow);
    this.canvas.style.width = `${this.gameW * this.scale}px`;
    this.canvas.style.height = `${this.gameH * this.scale}px`;
  }

  /**
   * Height the rest of the page needs, stacked above and below the canvas.
   *
   * Counts every visible element in the page's flow except the canvas and the
   * containers holding it — a full-height wrapper says nothing about how much
   * room the score bar needs. Fixed and absolute elements float over the game
   * and take no room.
   */
  private pageAroundCanvas(): number {
    const box = this.canvas.getBoundingClientRect();
    let top = box.top;
    let bottom = box.bottom;
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      if (el !== this.canvas && el.contains(this.canvas)) this.watch(el);
      if (el === this.canvas || el.contains(this.canvas) || el.closest('[data-cathode-overlay]')) continue;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      const position = getComputedStyle(el).position;
      if (position === 'fixed' || position === 'absolute') continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) continue;
      this.watch(el);
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    }
    return Math.max(0, bottom - top - box.height);
  }

  /**
   * The box the page's content occupies: every visible element in its flow,
   * containers and their padding included, the canvas included.
   */
  private pageExtent(): { width: number; height: number } {
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const el of [this.canvas, ...Array.from(document.body.querySelectorAll<HTMLElement>('*'))]) {
      if (el.closest('[data-cathode-overlay]') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      if (el !== this.canvas) {
        const position = getComputedStyle(el).position;
        if (position === 'fixed' || position === 'absolute') continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
    return { width: right - left, height: bottom - top };
  }

  destroy(): void {
    this.observer?.disconnect();
    cancelAnimationFrame(this.pending);
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
  }
}
