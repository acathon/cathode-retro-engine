/**
 * Grid editor for the first-person map.
 *
 * Paint wall types onto a grid and drop the spawn point — the same data the
 * DDA raycaster consumes, so a maze can be built without writing a map array
 * by hand.
 */
import type { StudioProject } from '../project';

/** 0 is open floor; 1..3 are the wall textures the runtime uploads. */
export const WALL_COLOURS = ['#12151a', '#8a8172', '#4d7a4f', '#b08a2e'];
export const WALL_NAMES = ['Erase (floor)', 'Stone', 'Moss', 'Gold door'];

export interface MapEditorHooks {
  onChange(): void;
}

export class MapEditor {
  private host = document.getElementById('map-grid') as HTMLDivElement;
  private tools = document.getElementById('map-tools') as HTMLDivElement;
  private brush = 1;
  private placingSpawn = false;
  private painting = false;

  constructor(
    private project: StudioProject,
    private hooks: MapEditorHooks,
  ) {
    this.buildTools();
    window.addEventListener('mouseup', () => { this.painting = false; });
  }

  setProject(project: StudioProject): void {
    this.project = project;
    this.render();
  }

  private buildTools(): void {
    this.tools.innerHTML = '';

    WALL_NAMES.forEach((name, index) => {
      const btn = document.createElement('button');
      btn.className = `map-brush${index === this.brush ? ' active' : ''}`;
      btn.title = name;
      btn.textContent = index === 0 ? '⌫' : String(index);
      btn.style.background = WALL_COLOURS[index];
      btn.style.color = index === 0 ? '#c3c9d1' : '#12151a';
      btn.addEventListener('click', () => {
        this.brush = index;
        this.placingSpawn = false;
        this.buildTools();
      });
      this.tools.appendChild(btn);
    });

    const spawn = document.createElement('button');
    spawn.className = `map-brush wide${this.placingSpawn ? ' active' : ''}`;
    spawn.textContent = '◎ Spawn';
    spawn.title = 'Click the map to move the player start';
    spawn.addEventListener('click', () => {
      this.placingSpawn = !this.placingSpawn;
      this.buildTools();
    });
    this.tools.appendChild(spawn);
  }

  private paint(col: number, row: number): void {
    const map = this.project.raycast;
    if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return;

    if (this.placingSpawn) {
      // Standing inside a wall renders a solid screen, so open the cell too.
      map.cells[row * map.cols + col] = 0;
      map.spawnX = col + 0.5;
      map.spawnY = row + 0.5;
    } else {
      map.cells[row * map.cols + col] = this.brush;
    }

    this.render();
    this.hooks.onChange();
  }

  render(): void {
    const map = this.project.raycast;
    // Fixed track width: 1fr would stretch the columns across the dock and
    // pull the square cells apart.
    this.host.style.gridTemplateColumns = `repeat(${map.cols}, 17px)`;
    this.host.innerHTML = '';

    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        const value = map.cells[row * map.cols + col] ?? 0;
        const cell = document.createElement('div');
        cell.className = 'map-cell';
        cell.style.background = WALL_COLOURS[value] ?? WALL_COLOURS[1];

        const isSpawn = Math.floor(map.spawnX) === col && Math.floor(map.spawnY) === row;
        if (isSpawn) {
          cell.classList.add('spawn');
          cell.textContent = '◎';
        }

        cell.addEventListener('mousedown', () => { this.painting = true; this.paint(col, row); });
        cell.addEventListener('mouseenter', () => { if (this.painting) this.paint(col, row); });

        this.host.appendChild(cell);
      }
    }
  }
}
