/** The few image operations icons and splash screens need, on RGBA images. */
import type { Image } from './png.js';

export type RGB = readonly [number, number, number];

export function blank(width: number, height: number, colour: RGB | null = null): Image {
  const data = new Uint8Array(width * height * 4);
  if (colour) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = colour[0];
      data[i + 1] = colour[1];
      data[i + 2] = colour[2];
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

export function isOpaque(image: Image): boolean {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 255) return false;
  return true;
}

/** Resize by repeating pixels: by a whole number, every source pixel becomes a crisp square. */
export function scaleNearest(image: Image, width: number, height: number): Image {
  const out = blank(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.floor((y * image.height) / height);
    for (let x = 0; x < width; x++) {
      const s = (sy * image.width + Math.floor((x * image.width) / width)) * 4;
      out.data.set(image.data.subarray(s, s + 4), (y * width + x) * 4);
    }
  }
  return out;
}

/** Scale down by averaging, weighting colour by alpha so edges don't darken. */
export function scaleDown(image: Image, width: number, height: number): Image {
  const out = blank(width, height);
  const sx = image.width / width;
  const sy = image.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const s = (yy * image.width + xx) * 4;
          const alpha = image.data[s + 3];
          r += image.data[s] * alpha;
          g += image.data[s + 1] * alpha;
          b += image.data[s + 2] * alpha;
          a += alpha;
          n++;
        }
      }
      const o = (y * width + x) * 4;
      if (a > 0) {
        out.data[o] = Math.round(r / a);
        out.data[o + 1] = Math.round(g / a);
        out.data[o + 2] = Math.round(b / a);
      }
      out.data[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

/**
 * The image at the largest size that fits a `box` x `box` square.
 *
 * Large images shrink smoothly. Small ones grow by repeating pixels, by a
 * whole number when `whole` is set, so pixel art stays square and sharp;
 * otherwise to exactly fill the box, for artwork that must reach its edges.
 */
export function fit(image: Image, box: number, whole = true): Image {
  const room = Math.min(box / image.width, box / image.height);
  const w = Math.max(1, Math.round(image.width * room));
  const h = Math.max(1, Math.round(image.height * room));
  if (room < 1) return scaleDown(image, w, h);
  if (whole) return scaleNearest(image, image.width * Math.floor(room), image.height * Math.floor(room));
  return scaleNearest(image, w, h);
}

/** Draw `top` over `base`, centred, blending by alpha. Changes `base`. */
export function drawCentred(base: Image, top: Image): Image {
  const ox = Math.floor((base.width - top.width) / 2);
  const oy = Math.floor((base.height - top.height) / 2);
  for (let y = 0; y < top.height; y++) {
    const by = y + oy;
    if (by < 0 || by >= base.height) continue;
    for (let x = 0; x < top.width; x++) {
      const bx = x + ox;
      if (bx < 0 || bx >= base.width) continue;
      const s = (y * top.width + x) * 4;
      const o = (by * base.width + bx) * 4;
      const a = top.data[s + 3] / 255;
      const under = base.data[o + 3] / 255;
      const outA = a + under * (1 - a);
      if (outA === 0) continue;
      for (let c = 0; c < 3; c++) {
        base.data[o + c] = Math.round((top.data[s + c] * a + base.data[o + c] * under * (1 - a)) / outA);
      }
      base.data[o + 3] = Math.round(outA * 255);
    }
  }
  return base;
}

/** Clear everything outside the largest circle that fits. Changes `image`. */
export function cropCircle(image: Image): Image {
  const r = Math.min(image.width, image.height) / 2;
  const cx = image.width / 2;
  const cy = image.height / 2;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) image.data[(y * image.width + x) * 4 + 3] = 0;
    }
  }
  return image;
}
