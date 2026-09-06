/** Scene dock: the sprite list, with a thumbnail of each sprite's first frame. */
import { PALETTE, TILE, createSprite, nextId, type StudioProject, type StudioSprite } from '../project';

export interface SceneTreeHooks {
  onSelect(id: string): void;
  onChange(): void;
}

export class SceneTree {
  private host = document.getElementById('scene-tree') as HTMLUListElement;

  constructor(
    private project: StudioProject,
    private hooks: SceneTreeHooks,
  ) {
    document.getElementById('add-sprite')?.addEventListener('click', () => this.add());
    document.getElementById('dup-sprite')?.addEventListener('click', () => this.duplicate());
    document.getElementById('del-sprite')?.addEventListener('click', () => this.remove());
  }

  setProject(project: StudioProject): void {
    this.project = project;
    this.render();
  }

  private add(): void {
    const sprite = createSprite(`Sprite${this.project.sprites.length + 1}`, 9);
    this.project.sprites.push(sprite);
    this.project.activeSpriteId = sprite.id;
    this.hooks.onSelect(sprite.id);
    this.hooks.onChange();
    this.render();
  }

  private duplicate(): void {
    const source = this.project.sprites.find((s) => s.id === this.project.activeSpriteId);
    if (!source) return;

    const copy: StudioSprite = {
      ...source,
      id: nextId(),
      name: `${source.name} copy`,
      x: source.x + 16,
      frames: source.frames.map((f) => Uint8Array.from(f)),
      physics: source.physics ? { ...source.physics } : undefined,
      scripts: [],
      workspace: source.workspace,
    };

    this.project.sprites.push(copy);
    this.project.activeSpriteId = copy.id;
    this.hooks.onSelect(copy.id);
    this.hooks.onChange();
    this.render();
  }

  private remove(): void {
    // Always leave one sprite behind: an empty scene has nothing to edit.
    if (this.project.sprites.length <= 1) return;

    const index = this.project.sprites.findIndex((s) => s.id === this.project.activeSpriteId);
    if (index < 0) return;

    this.project.sprites.splice(index, 1);
    const next = this.project.sprites[Math.max(0, index - 1)];
    this.project.activeSpriteId = next?.id ?? null;
    if (next) this.hooks.onSelect(next.id);
    this.hooks.onChange();
    this.render();
  }

  render(): void {
    this.host.innerHTML = '';

    for (const sprite of this.project.sprites) {
      const li = document.createElement('li');
      li.className = sprite.id === this.project.activeSpriteId ? 'active' : '';

      const thumb = document.createElement('canvas');
      thumb.width = TILE;
      thumb.height = TILE;
      thumb.style.width = '18px';
      thumb.style.height = '18px';
      const ctx = thumb.getContext('2d')!;
      const frame = sprite.frames[0];
      if (frame) {
        for (let y = 0; y < TILE; y++) {
          for (let x = 0; x < TILE; x++) {
            const idx = frame[y * TILE + x] ?? 0;
            if (!idx) continue;
            ctx.fillStyle = PALETTE[idx] ?? '#fff';
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }

      const label = document.createElement('span');
      label.textContent = sprite.name;

      const badge = document.createElement('span');
      badge.className = 'badge';
      const bits: string[] = [];
      if (sprite.physics?.solid) bits.push('solid');
      else if (sprite.physics) bits.push('phys');
      if (sprite.frames.length > 1) bits.push(`${sprite.frames.length}f`);
      badge.textContent = bits.join(' · ');

      li.append(thumb, label, badge);
      li.addEventListener('click', () => {
        this.project.activeSpriteId = sprite.id;
        this.hooks.onSelect(sprite.id);
        this.render();
      });

      this.host.appendChild(li);
    }
  }
}
