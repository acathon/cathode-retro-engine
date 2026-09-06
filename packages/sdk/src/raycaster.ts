import { Cathode } from './engine';

export interface RaycastMapDef {
  cols: number;
  rows: number;
  cells: number[];
}


/** What a shot fired with {@link Raycaster.hitscan} ran into. */
export interface HitscanResult {
  /** The wall that stopped the shot, if it reached one. */
  wall: { distance: number; tile: number } | null;
  /** The nearest billboard in front of that wall, if any. */
  billboard: { id: number; distance: number } | null;
  /** Where the shot ends — draw the impact here. */
  x: number;
  y: number;
}

export class Raycaster {
  private billboards = new Map<number, { textureType: number; scale: number }>();

  constructor(
    private engine: Cathode,
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

  /**
   * Upload a wall texture. `wallType` is 1-based to match the non-zero cell
   * values in the map, so wall type N is read from texture index N-1 — the
   * number {@link addBillboard} wants.
   */
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

  /**
   * Place a sprite in the world.
   *
   * `textureType` is the **index** into the texture array, while
   * {@link setTextureFromPixels} takes the **1-based wall type**. A texture
   * uploaded as wall type 5 is therefore billboard texture 4. Getting this
   * wrong asks for a texture that does not exist and the sprite draws as a
   * magenta block — which, standing close enough, fills the screen.
   */
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

  /**
   * Shear the horizon, in framebuffer pixels: positive looks down.
   *
   * A raycaster cannot really tilt, but shifting the horizon reads as
   * looking up and down — which is all the shooters of the era ever did.
   */
  setPitch(pixels: number): void {
    this.engine.raw!.raycaster_set_pitch(pixels);
  }

  /**
   * Where the eye sits between floor (0) and ceiling (1). 0.5 is standing;
   * lower to crouch, raise to jump.
   */
  setEyeHeight(height: number): void {
    this.engine.raw!.raycaster_set_eye_height(height);
  }

  /** Raise or lower a billboard between the floor (0) and ceiling (1). */
  setBillboardElevation(id: number, elevation: number): void {
    this.engine.raw!.raycaster_set_billboard_elevation(id, elevation);
  }

  /**
   * Fire a shot and report the first thing it hits.
   *
   * The ray walks the same DDA the renderer uses for a screen column, so a
   * shot can never disagree with what the player sees. Billboards are
   * treated as discs of `radius` cells; pass `ignore` to stop a shooter
   * from hitting its own sprite.
   */
  hitscan(
    x: number,
    y: number,
    angle: number,
    maxDistance = 32,
    radius = 0.35,
    ignore?: number,
  ): HitscanResult {
    const r = this.engine.raw!.raycaster_hitscan(
      x,
      y,
      angle,
      maxDistance,
      radius,
      ignore ?? -1,
    );
    return {
      wall: r[0] ? { distance: r[1], tile: r[2] } : null,
      billboard: r[3] ? { id: r[4], distance: r[5] } : null,
      x: r[6],
      y: r[7],
    };
  }

  /** True when nothing solid stands between the two points. */
  lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    return this.engine.raw!.raycaster_line_of_sight(x0, y0, x1, y1);
  }

  /**
   * Slide a circular body of `radius` cells by `(dx, dy)`, stopping at walls.
   *
   * The camera itself moves as a point, which lets it graze corners. Bots and
   * balls want a body with width, so they move through here instead.
   */
  slide(x: number, y: number, dx: number, dy: number, radius = 0.25): { x: number; y: number } {
    const r = this.engine.raw!.raycaster_slide(x, y, dx, dy, radius);
    return { x: r[0], y: r[1] };
  }

  /** The map cell at `(col, row)`. Out of bounds reads as solid. */
  cell(col: number, row: number): number {
    return this.engine.raw!.raycaster_cell(col, row);
  }

  /**
   * A* through the map, returned as corner waypoints in cell coordinates.
   * Empty when no route exists.
   */
  findPath(
    from: { x: number; y: number },
    to: { x: number; y: number },
    diagonal = false,
  ): { x: number; y: number }[] {
    const flat = this.engine.raw!.raycaster_find_path(
      Math.floor(from.x),
      Math.floor(from.y),
      Math.floor(to.x),
      Math.floor(to.y),
      diagonal,
    );
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      out.push({ x: flat[i], y: flat[i + 1] });
    }
    return out;
  }

  move(forwardSpeed: number, strafeSpeed: number, turnSpeed: number, _dt: number): void {
    this.engine.raw!.raycaster_move(forwardSpeed, strafeSpeed, turnSpeed);
  }
}
