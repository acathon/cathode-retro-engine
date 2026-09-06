/**
 * Tile editor for 2D levels.
 *
 * The palette is the project's own sprites: draw something in the pixel
 * editor and it immediately becomes a tile you can paint with. That keeps a
 * level and its art in one place, and means there is no separate tileset to
 * import, name or keep in sync.
 *
 * Which tiles are solid is a per-tile toggle rather than a property of the
 * art, because solidity is a gameplay decision — the same block can be a wall
 * in one level and scenery in the next.
 */
import { resizeLevel, type StudioProject, type StudioSprite } from '../project';

export interface LevelEditorHooks {
  onChange(): void;
}

/** Longest side of the drawn grid, in screen pixels. */
const MAX_VIEW = 620;

export class LevelEditor {
  private host = document.getElementById('level-grid') as HTMLDivElement;
  private tools = document.getElementById('level-tools') as HTMLDivElement;
  private brush = 1;
  private placingSpawn = false;
  private painting = false;
  private erasing = false;

  constructor(
    private project: StudioProject,
    private hooks: LevelEditorHooks,
  ) {
    window.addEventListener('mouseup', () => {
      this.painting = false;
      this.erasing = false;
    });
    // Painting with the right button erases, which is what every tile editor
    // does and what people try first.
    this.host.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setProject(project: StudioProject): void {
    this.project = project;
    this.render();
  }

  /** Thumbnail of a sprite's first frame, for the palette and the grid. */
  private thumb(sprite: StudioSprite, size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const tile = this.project.level.tileSize;
    canvas.width = tile;
    canvas.height = tile;
    const ctx = canvas.getContext('2d')!;
    const frame = sprite.frames[0];
    const image = ctx.createImageData(tile, tile);

    for (let i = 0; i < tile * tile; i++) {
      const index = frame?.[i] ?? 0;
      const [r, g, b] = paletteRgb(index);
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = index === 0 ? 0 : 255;
    }
    ctx.putImageData(image, 0, 0);

    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.style.imageRendering = 'pixelated';
    return canvas;
  }

  private buildTools(): void {
    const level = this.project.level;
    this.tools.innerHTML = '';

    const erase = document.createElement('button');
    erase.className = `map-brush${this.brush === 0 && !this.placingSpawn ? ' active' : ''}`;
    erase.textContent = '⌫';
    erase.title = 'Erase';
    erase.addEventListener('click', () => {
      this.brush = 0;
      this.placingSpawn = false;
      this.buildTools();
    });
    this.tools.appendChild(erase);

    this.project.sprites.forEach((sprite, index) => {
      const id = index + 1;
      const wrap = document.createElement('div');
      wrap.className = 'tile-brush';

      const btn = document.createElement('button');
      btn.className = `map-brush${this.brush === id && !this.placingSpawn ? ' active' : ''}`;
      btn.title = `Paint with ${sprite.name}`;
      btn.appendChild(this.thumb(sprite, 20));
      btn.addEventListener('click', () => {
        this.brush = id;
        this.placingSpawn = false;
        this.buildTools();
      });
      wrap.appendChild(btn);

      const solid = document.createElement('label');
      solid.className = 'tile-solid';
      solid.title = `Is ${sprite.name} a wall?`;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = level.solid.includes(id);
      box.addEventListener('change', () => {
        const next = level.solid.filter((t) => t !== id);
        if (box.checked) next.push(id);
        level.solid = next;
        this.hooks.onChange();
        this.render();
      });
      solid.appendChild(box);
      solid.append('wall');
      wrap.appendChild(solid);

      this.tools.appendChild(wrap);
    });

    const spawn = document.createElement('button');
    spawn.className = `map-brush wide${this.placingSpawn ? ' active' : ''}`;
    spawn.textContent = '◎ Spawn';
    spawn.title = 'Click the level to move the player start';
    spawn.addEventListener('click', () => {
      this.placingSpawn = !this.placingSpawn;
      this.buildTools();
    });
    this.tools.appendChild(spawn);

    const size = document.createElement('span');
    size.className = 'level-size';
    for (const [label, key] of [['W', 'cols'], ['H', 'rows']] as const) {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '4';
      input.max = '200';
      input.value = String(level[key]);
      input.title = `Level ${key}`;
      input.addEventListener('change', () => {
        const cols = key === 'cols' ? clampSize(input.value) : level.cols;
        const rows = key === 'rows' ? clampSize(input.value) : level.rows;
        resizeLevel(level, cols, rows);
        this.hooks.onChange();
        this.render();
      });
      size.append(label);
      size.appendChild(input);
    }
    this.tools.appendChild(size);

    const clear = document.createElement('button');
    clear.className = 'map-brush wide';
    clear.textContent = '✕ Clear';
    clear.title = 'Empty the level';
    clear.addEventListener('click', () => {
      level.tiles = new Array(level.cols * level.rows).fill(0);
      this.hooks.onChange();
      this.render();
    });
    this.tools.appendChild(clear);
  }

  private paint(col: number, row: number, erase: boolean): void {
    const level = this.project.level;
    if (col < 0 || row < 0 || col >= level.cols || row >= level.rows) return;

    if (this.placingSpawn) {
      level.spawnCol = col;
      level.spawnRow = row;
    } else {
      const value = erase ? 0 : this.brush;
      if (level.tiles[row * level.cols + col] === value) return;
      level.tiles[row * level.cols + col] = value;
    }

    this.render();
    this.hooks.onChange();
  }

  render(): void {
    const level = this.project.level;
    this.buildTools();

    // Scale to fit the dock rather than assuming a cell size: a 100-wide
    // level at 17px would run off the panel with no way back to it.
    const cell = Math.max(6, Math.min(22, Math.floor(MAX_VIEW / Math.max(level.cols, level.rows))));
    this.host.style.gridTemplateColumns = `repeat(${level.cols}, ${cell}px)`;
    this.host.innerHTML = '';

    const thumbs = new Map<number, string>();
    this.project.sprites.forEach((sprite, index) => {
      thumbs.set(index + 1, this.thumb(sprite, cell).toDataURL());
    });

    for (let row = 0; row < level.rows; row++) {
      for (let col = 0; col < level.cols; col++) {
        const id = level.tiles[row * level.cols + col] ?? 0;
        const el = document.createElement('div');
        el.className = 'level-cell';
        el.style.width = `${cell}px`;
        el.style.height = `${cell}px`;

        const art = thumbs.get(id);
        if (art) {
          el.style.backgroundImage = `url(${art})`;
          el.style.backgroundSize = '100% 100%';
          el.style.imageRendering = 'pixelated';
          if (level.solid.includes(id)) el.classList.add('solid');
        }

        if (level.spawnCol === col && level.spawnRow === row) {
          el.classList.add('spawn');
          el.textContent = '◎';
        }

        el.addEventListener('mousedown', (e) => {
          const erase = e.button === 2;
          if (erase) this.erasing = true;
          else this.painting = true;
          this.paint(col, row, erase);
        });
        el.addEventListener('mouseenter', () => {
          if (this.painting) this.paint(col, row, false);
          else if (this.erasing) this.paint(col, row, true);
        });

        this.host.appendChild(el);
      }
    }
  }
}

function clampSize(value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 16;
  return Math.max(4, Math.min(200, n));
}

// Kept local rather than imported so the palette lookup stays a pure function
// of the index, which is all the thumbnails need.
import { PALETTE } from '../project';

function paletteRgb(index: number): [number, number, number] {
  const hex = PALETTE[index] ?? PALETTE[0];
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
