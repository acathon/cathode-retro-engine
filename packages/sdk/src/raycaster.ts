import { RetroEngine } from './engine';

export interface RaycastMapDef {
  cols: number;
  rows: number;
  cells: number[];
}

export class Raycaster {
  private billboards = new Map<number, { textureType: number; scale: number }>();

  constructor(
    private engine: RetroEngine,
    map: RaycastMapDef,
  ) {
    this.engine.raw!.raycaster_init(
      JSON.stringify({ cols: map.cols, rows: map.rows, cells: map.cells }),
    );
  }

  async setTexture(wallType: number, imageUrl: string): Promise<void> {
    // Load image, extract RGBA pixels, upload to WASM
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height);
        this.engine.raw!.raycaster_set_texture(
          wallType,
          new Uint8Array(data.data.buffer),
          img.width,
        );
        resolve();
      };
      img.onerror = reject;
      img.src = imageUrl;
    });
  }

  setTextureFromPixels(wallType: number, pixels: Uint8Array | Uint8ClampedArray, size: number): void {
    const view = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
    this.engine.raw!.raycaster_set_texture(wallType, new Uint8Array(view), size);
  }

  setFloorColor(r: number, g: number, b: number): void {
    this.engine.raw!.raycaster_set_floor_color(r, g, b);
  }

  setCeilingColor(r: number, g: number, b: number): void {
    this.engine.raw!.raycaster_set_ceiling_color(r, g, b);
  }

  setFog(distance: number, r: number, g: number, b: number): void {
    this.engine.raw!.raycaster_set_fog(distance, r, g, b);
  }

  addBillboard(id: number, x: number, y: number, textureType: number, scale = 1.0): void {
    this.billboards.set(id, { textureType, scale });
    this.engine.raw!.raycaster_add_billboard(id, x, y, textureType, scale);
  }

  removeBillboard(id: number): void {
    this.billboards.delete(id);
    this.engine.raw!.raycaster_remove_billboard(id);
  }

  updateBillboard(id: number, x: number, y: number): void {
    if (typeof this.engine.raw!.raycaster_update_billboard === 'function') {
      this.engine.raw!.raycaster_update_billboard(id, x, y);
      return;
    }

    const meta = this.billboards.get(id);
    if (!meta) {
      return;
    }

    this.engine.raw!.raycaster_remove_billboard(id);
    this.engine.raw!.raycaster_add_billboard(id, x, y, meta.textureType, meta.scale);
  }

  update(dt: number): void {
    // Auto-handle WASD + arrows from engine input
    let forward = 0;
    let strafe = 0;
    let turn = 0;

    if (this.engine.input.held(0, 'up')) forward = 1;
    if (this.engine.input.held(0, 'down')) forward = -1;
    if (this.engine.input.held(0, 'left')) turn = -1;
    if (this.engine.input.held(0, 'right')) turn = 1;
    if (this.engine.input.held(0, 'l')) strafe = -1;
    if (this.engine.input.held(0, 'r')) strafe = 1;

    this.engine.raw!.raycaster_move(forward, strafe, turn);
  }

  setPos(x: number, y: number, angle: number): void {
    this.engine.raw!.raycaster_set_pos(x, y, angle);
  }

  get pos(): { x: number; y: number; angle: number } {
    const arr = this.engine.raw!.raycaster_get_pos();
    return { x: arr[0], y: arr[1], angle: arr[2] };
  }

  move(forwardSpeed: number, strafeSpeed: number, turnSpeed: number, _dt: number): void {
    this.engine.raw!.raycaster_move(forwardSpeed, strafeSpeed, turnSpeed);
  }
}
