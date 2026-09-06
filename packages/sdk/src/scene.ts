import { Cathode } from './engine';
import { Sprite } from './sprite';
import { TileMap } from './tilemap';

export class Scene {
  private sprites = new Set<Sprite>();
  private tilemaps = new Set<TileMap>();
  private cameraTarget: Sprite | null = null;
  private cameraOffset = { x: 0, y: 0 };
  
  constructor(public eng: Cathode) {}

  update(dt: number) {
    // Input is snapshotted by Cathode.loop at the end of the frame, not
    // here: snapshotting mid-frame made justPressed always read false for a
    // game that checked it after calling scene.update().
    for (const sprite of this.sprites) {
      sprite._update(dt);
    }

    if (this.cameraTarget) {
      // Aim the engine's camera rather than positioning the renderer's, so
      // bounds, dead zones and smoothing all apply. Computing the top-left
      // here and writing it directly is what made setCameraBounds a no-op.
      this.eng.raw?.set_camera_target(
        this.cameraTarget.x + this.cameraOffset.x,
        this.cameraTarget.y + this.cameraOffset.y,
      );
    }
  }

  /**
   * Keep the camera on a sprite.
   *
   * The camera smooths toward it, and respects whatever bounds and dead zone
   * the engine has been given. For an instant snap set the lerp speed to 0.
   */
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
