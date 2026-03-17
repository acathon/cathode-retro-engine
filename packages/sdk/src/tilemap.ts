import { Scene } from './scene';
import { TileMapOptions } from './types';

export class TileMap {
  public name: string;
  public cols: number;
  public rows: number;
  public tileWidth: number;
  public tileHeight: number;
  private layers: { name: string, sheet_handle: number, tiles: number[], fixed: boolean }[] = [];
  
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
      fixed
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

  commit() {
    const json = JSON.stringify({
      name: this.name,
      cols: this.cols,
      rows: this.rows,
      tile_width: this.tileWidth,
      tile_height: this.tileHeight,
      layers: this.layers
    });
    this.scene.eng.loadTileMap(json);
  }
}
