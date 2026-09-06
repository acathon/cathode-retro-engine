import { Scene } from './scene';
import { TileMapOptions } from './types';

export class TileMap {
  /** Unload every tilemap. Handles from earlier commits become stale. */
  static clearAll(engine: { raw: { clear_tilemaps(): void } | null }): void {
    engine.raw?.clear_tilemaps();
  }

  public name: string;
  public cols: number;
  public rows: number;
  public tileWidth: number;
  public tileHeight: number;
  private layers: { name: string, sheet_handle: number, tiles: number[], fixed: boolean, solid_tiles: number[] }[] = [];
  private solidIds: Map<number, Set<number>> = new Map();
  /** Engine-side handle, set once commit() uploads the map. */
  private handle: number | null = null;

  constructor(public scene: Scene, options: TileMapOptions) {
    this.name = options.name;
    this.cols = options.cols;
    this.rows = options.rows;
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;
    this.scene._addTileMap(this);
  }

  addLayer(name: string, sheetHandle: number, fixed = false): number {
    this.layers.push({
      name,
      sheet_handle: sheetHandle,
      tiles: new Array(this.cols * this.rows).fill(0),
      fixed,
      solid_tiles: []
    });
    return this.layers.length - 1;
  }

  setTile(layerIdx: number, col: number, row: number, tileId: number) {
    if (layerIdx >= 0 && layerIdx < this.layers.length && col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
      this.layers[layerIdx].tiles[row * this.cols + col] = tileId;
    }
  }

  fill(layerIdx: number, tileId: number) {
    if (layerIdx >= 0 && layerIdx < this.layers.length) {
      this.layers[layerIdx].tiles.fill(tileId);
    }
  }

  /**
   * Upload the map to the engine.
   *
   * Each call adds a map rather than replacing one, so a game that rebuilds
   * its level should call {@link TileMap.clearAll} first — otherwise the old
   * level stays drawn underneath the new one.
   */
  commit() {
    const json = JSON.stringify({
      name: this.name,
      cols: this.cols,
      rows: this.rows,
      tile_width: this.tileWidth,
      tile_height: this.tileHeight,
      layers: this.layers
    });
    this.handle = this.scene.eng.loadTileMap(json);
  }

  /** Engine-side handle, or null until commit() has run. */
  get mapHandle(): number | null { return this.handle; }

  // --- Collision helpers ---

  /**
   * Declare which tile ids are walls. The engine's physics resolves bodies
   * that called `Sprite.usePhysics` against them, and `isSolid` reads the
   * same set. Safe to call before or after `commit()`.
   */
  setSolidTiles(layerIdx: number, solidTileIds: number[]): void {
    this.solidIds.set(layerIdx, new Set(solidTileIds));
    if (this.layers[layerIdx]) {
      this.layers[layerIdx].solid_tiles = [...solidTileIds];
    }
    if (this.handle !== null) {
      this.scene.eng.raw.set_tilemap_solid_tiles(
        this.handle,
        layerIdx,
        new Uint16Array(solidTileIds),
      );
    }
  }

  isSolid(layerIdx: number, worldX: number, worldY: number): boolean {
    const { col, row } = this.worldToTile(worldX, worldY);
    const tileId = this.getTileAtCoord(layerIdx, col, row);
    const solids = this.solidIds.get(layerIdx);
    return solids ? solids.has(tileId) : false;
  }

  getTileAt(layerIdx: number, worldX: number, worldY: number): number {
    const { col, row } = this.worldToTile(worldX, worldY);
    return this.getTileAtCoord(layerIdx, col, row);
  }

  getTileAtCoord(layerIdx: number, col: number, row: number): number {
    if (layerIdx < 0 || layerIdx >= this.layers.length) return 0;
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return 0;
    return this.layers[layerIdx].tiles[row * this.cols + col];
  }

  worldToTile(worldX: number, worldY: number): { col: number; row: number } {
    return {
      col: Math.floor(worldX / this.tileWidth),
      row: Math.floor(worldY / this.tileHeight),
    };
  }

  tileToWorld(col: number, row: number): { x: number; y: number } {
    return {
      x: col * this.tileWidth,
      y: row * this.tileHeight,
    };
  }

  raycast(
    layerIdx: number,
    ox: number,
    oy: number,
    dx: number,
    dy: number,
    maxDist: number,
  ): { hit: boolean; x: number; y: number; tileId: number } | null {
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return null;
    const ndx = dx / len;
    const ndy = dy / len;

    const step = Math.min(this.tileWidth, this.tileHeight) * 0.5;
    let dist = 0;

    while (dist < maxDist) {
      const wx = ox + ndx * dist;
      const wy = oy + ndy * dist;

      if (this.isSolid(layerIdx, wx, wy)) {
        const tileId = this.getTileAt(layerIdx, wx, wy);
        return { hit: true, x: wx, y: wy, tileId };
      }

      dist += step;
    }

    return null;
  }
}
