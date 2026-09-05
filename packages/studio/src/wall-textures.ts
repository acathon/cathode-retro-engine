/** Procedural wall textures for raycaster mode, matching the map brushes. */
const TEX = 32;

function make(paint: (x: number, y: number) => [number, number, number]): Uint8Array {
  const px = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * TEX + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  return px;
}

/** Wall type 1 = stone, 2 = moss, 3 = gold door. Index matches the brushes. */
export function buildWallTextures(): { size: number; textures: Uint8Array[] } {
  const stone = make((x, y) => {
    const row = Math.floor(y / 8);
    const bx = (x + (row % 2) * 8) % 16;
    const n = ((x * 13 + y * 7) % 18) - 9;
    if (bx < 1 || y % 8 === 0) return [32, 30, 34];
    return [110 + n, 102 + n, 86 + n];
  });

  const moss = make((x, y) => {
    const n = ((x * 17 + y * 11) % 20) - 10;
    const patch = ((x * 5 + y * 3) % 13) < 5 && y > TEX * 0.35;
    return patch ? [40 + n, 104 + n, 52 + n] : [74 + n, 72 + n, 62 + n];
  });

  const door = make((x, y) => {
    const frame = x < 3 || x >= TEX - 3 || y < 3 || y >= TEX - 3;
    const ring = Math.abs(Math.hypot(x - TEX / 2, y - TEX / 2) - 8) < 1.6;
    const n = ((x * 3 + y * 5) % 14) - 7;
    if (frame) return [120, 94, 32];
    if (ring) return [255, 214, 92];
    return [176 + n, 138 + n, 46 + n];
  });

  return { size: TEX, textures: [stone, moss, door] };
}
