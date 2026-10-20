import { InputReader } from './input';
import { padDirections } from './mobile';
import { ButtonName, PlayerIndex } from './types';

export interface TouchConfig {
  player?: PlayerIndex;
  /** Width of the d-pad in CSS pixels. By default it scales with the screen. */
  size?: number;
  opacity?: number;
  /**
   * Which buttons to draw. `'auto'`, the default, draws each one the first
   * time the game reads it, so the controls always match the game without
   * being told what it uses.
   */
  buttons?: 'auto' | ButtonName[];
}

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
const LABELS: Partial<Record<ButtonName, string>> = {
  a: 'A', b: 'B', x: 'X', y: 'Y', l: 'L', r: 'R', start: 'START', select: 'SELECT',
};

const STYLE_ID = 'cathode-touch-style';
const STYLE = `
[data-cathode-overlay] {
  position: fixed; inset: 0; pointer-events: none; z-index: 100;
  font: bold 14px ui-monospace, Menlo, Consolas, monospace;
  --m: 16px;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
}
[data-cathode-overlay] .ct {
  position: absolute; pointer-events: auto; touch-action: none;
  display: flex; align-items: center; justify-content: center;
  color: #111; background: rgba(255,255,255,.9); box-shadow: 0 3px 0 rgba(0,0,0,.35);
}
[data-cathode-overlay] .ct[hidden] { display: none; }
[data-cathode-overlay] .ct[data-pressed] { transform: translateY(2px); box-shadow: 0 1px 0 rgba(0,0,0,.35); background: #ffd34d; }

/* The d-pad: one target, so a thumb can roll between directions. */
[data-cathode-overlay] .pad {
  left: calc(var(--m) + env(safe-area-inset-left)); bottom: calc(var(--m) + env(safe-area-inset-bottom));
  width: var(--pad); height: var(--pad); background: none; box-shadow: none;
}
[data-cathode-overlay] .pad::before, [data-cathode-overlay] .pad::after {
  content: ''; position: absolute; background: rgba(255,255,255,.9); border-radius: 6px;
  box-shadow: 0 3px 0 rgba(0,0,0,.35);
}
[data-cathode-overlay] .pad::before { left: 33%; width: 34%; height: 100%; }
[data-cathode-overlay] .pad::after { top: 33%; height: 34%; width: 100%; }
[data-cathode-overlay] .pad i {
  position: absolute; z-index: 1; width: 34%; height: 34%; border-radius: 6px;
  display: flex; align-items: center; justify-content: center; font-style: normal; color: #555;
}
[data-cathode-overlay] .pad i[data-on] { background: #ffd34d; color: #111; }
[data-cathode-overlay] .pad .up { left: 33%; top: 0; }
[data-cathode-overlay] .pad .down { left: 33%; bottom: 0; }
[data-cathode-overlay] .pad .left { top: 33%; left: 0; }
[data-cathode-overlay] .pad .right { top: 33%; right: 0; }

/* Face buttons, laid out like a handheld: B low and left, A high and right. */
[data-cathode-overlay] .round { width: calc(var(--pad) * .42); height: calc(var(--pad) * .42); border-radius: 50%; font-size: 18px; }
[data-cathode-overlay] .a { right: calc(var(--m) + env(safe-area-inset-right)); bottom: calc(var(--m) + var(--pad) * .34 + env(safe-area-inset-bottom)); }
[data-cathode-overlay] .b { right: calc(var(--m) + var(--pad) * .5 + env(safe-area-inset-right)); bottom: calc(var(--m) + env(safe-area-inset-bottom)); }
[data-cathode-overlay] .x { right: calc(var(--m) + var(--pad) * .5 + env(safe-area-inset-right)); bottom: calc(var(--m) + var(--pad) * .68 + env(safe-area-inset-bottom)); }
[data-cathode-overlay] .y { right: calc(var(--m) + var(--pad) * 1 + env(safe-area-inset-right)); bottom: calc(var(--m) + var(--pad) * .34 + env(safe-area-inset-bottom)); }

/* Shoulders in the top corners, menu buttons along the bottom edge. */
[data-cathode-overlay] .shoulder { width: calc(var(--pad) * .6); height: calc(var(--pad) * .28); border-radius: 10px; top: calc(var(--m) + env(safe-area-inset-top)); }
[data-cathode-overlay] .l { left: calc(var(--m) + env(safe-area-inset-left)); }
[data-cathode-overlay] .r { right: calc(var(--m) + env(safe-area-inset-right)); }
[data-cathode-overlay] .pill { height: 26px; padding: 0 12px; border-radius: 13px; font-size: 11px; bottom: calc(6px + env(safe-area-inset-bottom)); }
[data-cathode-overlay] .start { left: calc(50% + 6px); }
[data-cathode-overlay] .select { right: calc(50% + 6px); }
`;

/**
 * On-screen controls for touch screens: a d-pad and the face, shoulder and
 * menu buttons, feeding the same {@link InputReader} the keyboard does.
 *
 * The engine adds one by itself on phones and tablets, so a game written for
 * a keyboard needs no changes. Creating one yourself replaces it.
 */
export class TouchControls {
  private root: HTMLDivElement;
  private pad: HTMLDivElement;
  private padArrows = new Map<string, HTMLElement>();
  private buttons = new Map<ButtonName, HTMLDivElement>();
  private player: PlayerIndex;
  private stopAsking: (() => void) | null = null;

  constructor(private input: InputReader, parent: HTMLElement = document.body, config: TouchConfig = {}) {
    this.player = config.player ?? 0;

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = STYLE;
      document.head.appendChild(style);
    }

    // One set of controls per reader: a game's own replaces the engine's.
    input.touch?.destroy();
    input.touch = this;

    this.root = document.createElement('div');
    this.root.dataset.cathodeOverlay = '';
    this.root.style.setProperty('--pad', config.size ? `${config.size}px` : 'clamp(104px, 27vmin, 160px)');
    this.root.style.opacity = String(config.opacity ?? 0.6);

    this.pad = this.makePad();
    for (const [btn, label] of Object.entries(LABELS) as [ButtonName, string][]) {
      const kind = btn === 'l' || btn === 'r' ? 'shoulder' : btn === 'start' || btn === 'select' ? 'pill' : 'round';
      this.buttons.set(btn, this.makeButton(btn, label, kind));
    }

    if (Array.isArray(config.buttons)) {
      for (const btn of config.buttons) this.show(btn);
    } else {
      this.stopAsking = input.onAsk((player, btn) => {
        if (player === this.player) this.show(btn);
      });
    }

    parent.appendChild(this.root);
  }

  /** Show a button. A direction shows the whole d-pad. */
  show(btn: ButtonName): void {
    if ((DIRECTIONS as readonly string[]).includes(btn)) this.pad.hidden = false;
    else if (this.buttons.has(btn)) this.buttons.get(btn)!.hidden = false;
  }

  /** The buttons currently drawn, for checks and for games that want to know. */
  get shown(): ButtonName[] {
    const out: ButtonName[] = this.pad.hidden ? [] : [...DIRECTIONS];
    for (const [btn, el] of this.buttons) if (!el.hidden) out.push(btn);
    return out;
  }

  private makePad(): HTMLDivElement {
    const pad = document.createElement('div');
    pad.className = 'ct pad';
    pad.hidden = true;
    pad.setAttribute('aria-label', 'D-pad');
    for (const [dir, arrow] of [['up', '▲'], ['down', '▼'], ['left', '◀'], ['right', '▶']]) {
      const i = document.createElement('i');
      i.className = dir;
      i.textContent = arrow;
      pad.appendChild(i);
      this.padArrows.set(dir, i);
    }

    let pointer: number | null = null;
    const steer = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      const dirs = padDirections(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width / 2);
      this.input.setState(this.player, dirs);
      for (const dir of DIRECTIONS) this.padArrows.get(dir)!.toggleAttribute('data-on', dirs[dir]);
    };
    const letGo = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      this.input.setState(this.player, { up: false, down: false, left: false, right: false });
      for (const dir of DIRECTIONS) this.padArrows.get(dir)!.removeAttribute('data-on');
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pointer = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      steer(e);
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) steer(e); });
    pad.addEventListener('pointerup', letGo);
    pad.addEventListener('pointercancel', letGo);
    pad.addEventListener('lostpointercapture', letGo);

    this.root.appendChild(pad);
    return pad;
  }

  private makeButton(btn: ButtonName, label: string, kind: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `ct ${kind} ${btn}`;
    el.textContent = label;
    el.hidden = true;
    el.setAttribute('aria-label', label);

    let pointer: number | null = null;
    const press = (e: PointerEvent) => {
      e.preventDefault();
      pointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.setAttribute('data-pressed', '');
      this.input.setState(this.player, { [btn]: true });
      // A short tick where the platform allows it (Android); iOS ignores this.
      navigator.vibrate?.(8);
    };
    const release = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      el.removeAttribute('data-pressed');
      this.input.setState(this.player, { [btn]: false });
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);

    this.root.appendChild(el);
    return el;
  }

  destroy(): void {
    this.stopAsking?.();
    this.stopAsking = null;
    // Nothing held down outlives the controls that were holding it.
    const released = Object.fromEntries([...DIRECTIONS, ...this.buttons.keys()].map((b) => [b, false]));
    this.input.setState(this.player, released);
    this.root.remove();
    if (this.input.touch === this) this.input.touch = null;
  }
}
