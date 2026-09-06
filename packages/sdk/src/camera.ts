import { Cathode } from './engine';
import { Sprite } from './sprite';

export class Camera {
  private followTarget: Sprite | null = null;
  private followLerp = 0.1;

  constructor(private engine: Cathode) { }

  follow(sprite: Sprite, lerpSpeed = 0.1): void {
    this.followTarget = sprite;
    this.followLerp = lerpSpeed;
    this.setLerp(lerpSpeed);
  }

  unfollow(): void {
    this.followTarget = null;
  }

  /** Must be called each frame if following a sprite */
  _update(): void {
    if (this.followTarget && this.engine.raw) {
      this.engine.raw.set_camera_target(this.followTarget.x, this.followTarget.y);
    }
  }

  setTarget(x: number, y: number): void {
    if (this.engine.raw) this.engine.raw.set_camera_target(x, y);
  }

  setBounds(x: number, y: number, w: number, h: number): void {
    if (this.engine.raw) this.engine.raw.set_camera_bounds(x, y, w, h);
  }

  setDeadZone(x: number, y: number, w: number, h: number): void {
    if (this.engine.raw) this.engine.raw.set_camera_dead_zone(x, y, w, h);
  }

  setLerp(speed: number): void {
    if (this.engine.raw) this.engine.raw.set_camera_lerp(speed);
  }

  setZoom(zoom: number): void {
    if (this.engine.raw) this.engine.raw.set_camera_zoom(zoom);
  }

  get pos(): { x: number; y: number } {
    if (this.engine.raw) {
      const arr = this.engine.raw.get_camera_pos();
      return { x: arr[0], y: arr[1] };
    }
    return { x: 0, y: 0 };
  }

  shake(intensity: number, duration: number): void {
    this.engine.shake(intensity, duration);
  }
}
