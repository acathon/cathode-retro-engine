import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

interface PackedRect {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export default async function packCommand(
  globs: string[],
  options: { tileWidth?: string; tileHeight?: string; output?: string },
) {
  const tileW = parseInt(options.tileWidth ?? '8', 10);
  const tileH = parseInt(options.tileHeight ?? '8', 10);
  const outputBase = options.output ?? 'assets/atlas';
  const outputPng = outputBase.endsWith('.png') ? outputBase : outputBase + '.png';
  const outputJson = outputPng.replace(/\.png$/, '.json');

  const spinner = ora('Discovering input files...').start();

  // Resolve input files
  const inputFiles: string[] = [];
  for (const g of globs) {
    const resolved = path.resolve(process.cwd(), g);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      inputFiles.push(resolved);
    } else {
      // Simple glob: find all matching PNG files in the directory
      const dir = path.dirname(resolved);
      const pattern = path.basename(resolved);
      if (fs.existsSync(dir)) {
        const files = await fs.readdir(dir);
        for (const f of files) {
          if (matchWildcard(f, pattern)) {
            inputFiles.push(path.join(dir, f));
          }
        }
      }
    }
  }

  if (inputFiles.length === 0) {
    spinner.fail(chalk.red('No input files found.'));
    process.exit(1);
  }

  spinner.text = `Packing ${inputFiles.length} files (${tileW}×${tileH} tiles)...`;

  // Read image dimensions using simple PNG header parsing (width/height from IHDR)
  const images: { file: string; w: number; h: number }[] = [];
  for (const file of inputFiles) {
    const buf = await fs.readFile(file);
    const dims = readPngDimensions(buf);
    if (dims) {
      images.push({ file, w: dims.width, h: dims.height });
    } else {
      console.warn(chalk.yellow(`  Skipping ${path.basename(file)}: not a valid PNG`));
    }
  }

  if (images.length === 0) {
    spinner.fail(chalk.red('No valid PNG files found.'));
    process.exit(1);
  }

  // Shelf-packing algorithm
  // Sort by height descending for better packing
  images.sort((a, b) => b.h - a.h);

  // Determine atlas dimensions (power-of-two friendly)
  const totalArea = images.reduce((sum, img) => sum + img.w * img.h, 0);
  let atlasSize = 64;
  while (atlasSize * atlasSize < totalArea * 1.3) atlasSize *= 2;
  if (atlasSize > 4096) atlasSize = 4096;

  const packed: PackedRect[] = [];
  let shelfY = 0;
  let shelfX = 0;
  let shelfHeight = 0;

  for (const img of images) {
    // If image doesn't fit on current shelf row, start new shelf
    if (shelfX + img.w > atlasSize) {
      shelfY += shelfHeight;
      shelfX = 0;
      shelfHeight = 0;
    }
    // If we've gone past the atlas height, expand
    if (shelfY + img.h > atlasSize) {
      atlasSize *= 2;
      if (atlasSize > 8192) {
        spinner.fail(chalk.red('Atlas would exceed 8192×8192. Reduce input images.'));
        process.exit(1);
      }
    }

    packed.push({
      file: path.relative(process.cwd(), img.file),
      x: shelfX,
      y: shelfY,
      w: img.w,
      h: img.h,
    });

    shelfX += img.w;
    if (img.h > shelfHeight) shelfHeight = img.h;
  }

  const atlasHeight = shelfY + shelfHeight;

  // Build atlas JSON mapping
  const mapping: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const p of packed) {
    const name = path.basename(p.file, path.extname(p.file));
    mapping[name] = { x: p.x, y: p.y, w: p.w, h: p.h };
  }

  // Write atlas JSON
  await fs.ensureDir(path.dirname(path.resolve(process.cwd(), outputJson)));
  await fs.writeJson(path.resolve(process.cwd(), outputJson), {
    atlas: path.basename(outputPng),
    tileWidth: tileW,
    tileHeight: tileH,
    width: atlasSize,
    height: atlasHeight,
    frames: mapping,
  }, { spaces: 2 });

  // For the actual PNG compositing, we output a construction manifest
  // since we don't have a full PNG encoder in pure Node without sharp/jimp.
  // The JSON is the primary output; users can composite with any image tool.
  // We also attempt to use Canvas if available (e.g. via canvas npm package).
  try {
    const { createCanvas, loadImage } = await import('canvas' as string);
    const canvas = createCanvas(atlasSize, atlasHeight);
    const ctx = canvas.getContext('2d');

    for (const p of packed) {
      const img = await loadImage(path.resolve(process.cwd(), p.file));
      ctx.drawImage(img, p.x, p.y);
    }

    const pngBuffer = canvas.toBuffer('image/png');
    await fs.writeFile(path.resolve(process.cwd(), outputPng), pngBuffer);
    spinner.succeed(chalk.green(`Atlas packed: ${outputPng} (${atlasSize}×${atlasHeight}) + ${outputJson}`));
  } catch {
    // Canvas not available — write only the JSON manifest
    spinner.succeed(chalk.green(
      `Atlas mapping written to ${outputJson} (${atlasSize}×${atlasHeight}, ${images.length} sprites).\n` +
      `  Install 'canvas' package (npm i canvas) to auto-generate the PNG atlas.\n` +
      `  Or use the JSON mapping with any image compositing tool.`,
    ));
  }
}

function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
  // IHDR chunk starts at offset 8: 4 bytes length, 4 bytes type "IHDR", then width (4) + height (4)
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function matchWildcard(filename: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(filename);
}
