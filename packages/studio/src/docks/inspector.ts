/** Inspector dock: edit the selected sprite's transform and physics. */
import type { StudioSprite } from '../project';
import { TILE } from '../project';

export interface InspectorHooks {
  onChange(): void;
}

export class Inspector {
  private host = document.getElementById('inspector') as HTMLDivElement;

  constructor(private hooks: InspectorHooks) {}

  render(sprite: StudioSprite | null): void {
    this.host.innerHTML = '';

    if (!sprite) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Select a sprite in the Scene dock.';
      this.host.appendChild(empty);
      return;
    }

    this.host.appendChild(
      this.section('Node', [
        this.text('Name', sprite.name, (v) => { sprite.name = v || 'Sprite'; }),
        this.number('Layer', sprite.layer, (v) => { sprite.layer = v; }),
        this.check('Visible', sprite.visible, (v) => { sprite.visible = v; }),
      ]),
    );

    this.host.appendChild(
      this.section('Transform', [
        this.number('Position X', sprite.x, (v) => { sprite.x = v; }),
        this.number('Position Y', sprite.y, (v) => { sprite.y = v; }),
      ]),
    );

    const physicsRows = [
      this.check('Enabled', !!sprite.physics, (v) => {
        sprite.physics = v ? { gravity: 1, width: TILE, height: TILE, solid: false } : undefined;
        this.render(sprite); // the rest of the section appears or disappears
      }),
    ];

    if (sprite.physics) {
      const p = sprite.physics;
      physicsRows.push(
        this.number('Gravity', p.gravity, (v) => { p.gravity = v; }, 0.1),
        this.number('Box width', p.width, (v) => { p.width = v; }),
        this.number('Box height', p.height, (v) => { p.height = v; }),
        this.check('Solid', p.solid, (v) => { p.solid = v; }),
      );
    }

    this.host.appendChild(this.section('Physics', physicsRows));

    this.host.appendChild(
      this.section('Frames', [
        this.readonly('Count', String(sprite.frames.length)),
        this.readonly('Size', `${TILE} × ${TILE}`),
      ]),
    );
  }

  // --- field builders ------------------------------------------------------
  private section(title: string, rows: HTMLElement[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'insp-section';

    const head = document.createElement('div');
    head.className = 'insp-head';
    head.textContent = title;

    const body = document.createElement('div');
    body.className = 'insp-body';
    rows.forEach((r) => body.appendChild(r));

    wrap.append(head, body);
    return wrap;
  }

  private row(label: string, control: HTMLElement, extraClass = ''): HTMLElement {
    const field = document.createElement('div');
    field.className = `field ${extraClass}`.trim();
    const l = document.createElement('label');
    l.textContent = label;
    field.append(l, control);
    return field;
  }

  private text(label: string, value: string, apply: (v: string) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.addEventListener('change', () => { apply(input.value); this.hooks.onChange(); });
    return this.row(label, input);
  }

  private number(label: string, value: number, apply: (v: number) => void, step = 1): HTMLElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.step = String(step);
    input.addEventListener('change', () => {
      const parsed = Number(input.value);
      apply(Number.isFinite(parsed) ? parsed : 0);
      this.hooks.onChange();
    });
    return this.row(label, input);
  }

  private check(label: string, value: boolean, apply: (v: boolean) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => { apply(input.checked); this.hooks.onChange(); });
    return this.row(label, input, 'check');
  }

  private readonly(label: string, value: string): HTMLElement {
    const span = document.createElement('span');
    span.textContent = value;
    span.style.color = 'var(--text-dim)';
    return this.row(label, span);
  }
}
