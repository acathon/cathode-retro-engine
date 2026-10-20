/**
 * Reading and writing PNG files, with nothing but Node's zlib.
 *
 * App icons and splash screens are made from the game's own icon, in every
 * size each store asks for. Image libraries that do this (sharp, canvas) ship
 * native binaries per platform, which is a lot to add to every game project
 * for some rescaling. PNG itself is small: chunks, zlib, and a filter per row.
 */
import { deflateSync, inflateSync } from 'node:zlib';

/** An image as 8-bit RGBA, row by row, top to bottom. */
export interface Image {
  width: number;
  height: number;
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Channels per pixel for each PNG colour type. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode a PNG into RGBA. Throws a sentence a person can act on. */
export function decodePng(file: Uint8Array): Image {
  const buf = Buffer.from(file.buffer, file.byteOffset, file.byteLength);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('not a PNG file');
  }

  let width = 0;
  let height = 0;
  let depth = 0;
  let type = -1;
  let palette: Buffer | null = null;
  let transparency: Buffer | null = null;
  const parts: Buffer[] = [];

  for (let at = 8; at + 8 <= buf.length;) {
    const length = buf.readUInt32BE(at);
    const name = buf.toString('latin1', at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + length);
    at += 12 + length;
    if (name === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      if (body[12] !== 0) {
        throw new Error('interlaced PNGs are not supported; save it again with interlacing off');
      }
    } else if (name === 'PLTE') {
      palette = body;
    } else if (name === 'tRNS') {
      transparency = body;
    } else if (name === 'IDAT') {
      parts.push(body);
    } else if (name === 'IEND') {
      break;
    }
  }

  const channels = CHANNELS[type];
  if (!width || !height || channels === undefined || ![1, 2, 4, 8, 16].includes(depth)) {
    throw new Error('unsupported or damaged PNG header');
  }
  if (type === 3 && !palette) throw new Error('palette PNG without a palette');

  const raw = inflateSync(Buffer.concat(parts));
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  if (raw.length < (stride + 1) * height) throw new Error('PNG image data is truncated');

  // Undo each row's filter, in place, against the row above.
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error(`PNG row ${y} has an unknown filter (${filter})`);
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const up = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[row + x - bpp] : 0;
      const b = y > 0 ? rows[up + x] : 0;
      const c = x >= bpp && y > 0 ? rows[up + x - bpp] : 0;
      const v = raw[src + x];
      rows[row + x] =
        filter === 0 ? v
          : filter === 1 ? v + a
            : filter === 2 ? v + b
              : filter === 3 ? v + ((a + b) >> 1)
                : v + paeth(a, b, c);
    }
  }

  // One sample: the n-th value of a row, scaled to 0..255.
  const sample = (row: number, n: number): number => {
    if (depth === 8) return rows[row + n];
    if (depth === 16) return rows[row + n * 2];
    const perByte = 8 / depth;
    const byte = rows[row + Math.floor(n / perByte)];
    const shift = 8 - depth * ((n % perByte) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1;
  // A colour-keyed transparent value for grey and RGB images, as raw samples.
  const key = transparency && (type === 0 || type === 2)
    ? Array.from({ length: type === 0 ? 1 : 3 }, (_, i) => transparency!.readUInt16BE(i * 2))
    : null;
  const rawSample = (row: number, n: number): number => {
    if (depth === 16) return (rows[row + n * 2] << 8) | rows[row + n * 2 + 1];
    return sample(row, n);
  };

  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (type === 3) {
        const i = sample(row, x);
        data[o] = palette![i * 3];
        data[o + 1] = palette![i * 3 + 1];
        data[o + 2] = palette![i * 3 + 2];
        data[o + 3] = transparency && i < transparency.length ? transparency[i] : 255;
        continue;
      }
      const first = x * channels;
      const grey = type === 0 || type === 4;
      const r = sample(row, first) * scale;
      const g = grey ? r : sample(row, first + 1) * scale;
      const b = grey ? r : sample(row, first + 2) * scale;
      let alpha = type === 4 ? sample(row, first + 1) * scale : type === 6 ? sample(row, first + 3) * scale : 255;
      if (key && key.every((k, i) => rawSample(row, first + i) === k)) alpha = 0;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = alpha;
    }
  }
  return { width, height, data };
}

function chunk(name: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(name, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

/**
 * Encode RGBA as a PNG. With `alpha: false` the alpha channel is dropped
 * (the image should already be opaque): the App Store refuses icons that
 * have one at all, transparent or not.
 */
export function encodePng(image: Image, options: { alpha?: boolean } = {}): Buffer {
  const alpha = options.alpha ?? true;
  const { width, height, data } = image;
  const bpp = alpha ? 4 : 3;
  const stride = width * bpp;

  const pixels = new Uint8Array(stride * height);
  for (let i = 0, o = 0; i < width * height; i++) {
    pixels[o++] = data[i * 4];
    pixels[o++] = data[i * 4 + 1];
    pixels[o++] = data[i * 4 + 2];
    if (alpha) pixels[o++] = data[i * 4 + 3];
  }

  // Each row gets whichever filter leaves the smallest numbers, the usual
  // heuristic. Scaled-up pixel art repeats rows exactly, so "up" turns most
  // of them into zeros and the file stays small.
  const out = new Uint8Array((stride + 1) * height);
  const trial = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    let best = Infinity;
    for (let filter = 0; filter <= 4; filter++) {
      let cost = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? pixels[row + x - bpp] : 0;
        const b = y > 0 ? pixels[row - stride + x] : 0;
        const c = x >= bpp && y > 0 ? pixels[row - stride + x - bpp] : 0;
        const v = pixels[row + x];
        const f =
          filter === 0 ? v
            : filter === 1 ? v - a
              : filter === 2 ? v - b
                : filter === 3 ? v - ((a + b) >> 1)
                  : v - paeth(a, b, c);
        trial[x] = f;
        const signed = trial[x] < 128 ? trial[x] : 256 - trial[x];
        cost += signed;
        if (cost >= best) break;
      }
      if (cost < best) {
        best = cost;
        out[y * (stride + 1)] = filter;
        out.set(trial, y * (stride + 1) + 1);
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = alpha ? 6 : 2;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(out, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
