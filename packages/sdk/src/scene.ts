import { RetroEngine } from './engine';
import { Sprite } from './sprite';
import { TileMap } from './tilemap';

export class Scene {
  private sprites = new Set<Sprite>();
  private tilemaps = new Set<TileMap>();
  private cameraTarget: Sprite | null = null;
  private cameraOffset = { x: 0, y: 0 };
  
  constructor(public eng: RetroEngine) {}

  update(dt: number) {
    this.eng.input.snapshot();
    
    for (const sprite of this.sprites) {
      sprite._update(dt);
    }

    if (this.cameraTarget) {
      const cx = this.cameraTarget.x - this.eng.width / 2 + this.cameraOffset.x;
      const cy = this.cameraTarget.y - this.eng.height / 2 + this.cameraOffset.y;
      this.eng.setCamera(cx, cy);
    }
  }

  follow(sprite: Sprite, offsetX = 0, offsetY = 0) {
    this.cameraTarget = sprite;
    this.cameraOffset = { x: offsetX, y: offsetY };
  }

  unfollow() {
    this.cameraTarget = null;
  }

  _addSprite(sprite: Sprite) {
    this.sprites.add(sprite);
  }

  _removeSprite(sprite: Sprite) {
    this.sprites.delete(sprite);
  }

  _addTileMap(map: TileMap) {
    this.tilemaps.add(map);
  }
}
