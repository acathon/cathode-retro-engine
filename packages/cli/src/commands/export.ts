import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export default async function exportCommand(target: string) {
  if (target === 'web') {
    console.log(chalk.cyan('Exporting to web...'));
    try {
      execSync('cathode build', { stdio: 'inherit' });
    } catch (e) {
      console.error(chalk.red('Web export failed'));
    }
  } else if (target === 'desktop') {
    console.log(chalk.cyan('Exporting to desktop (Tauri required)...'));
    try {
      execSync('npx tauri build', { stdio: 'inherit' });
    } catch (e) {
      console.error(chalk.red('Desktop export failed. Make sure @tauri-apps/cli is installed.'));
    }
  } else if (target === 'mobile') {
    console.log(chalk.cyan('Exporting to mobile (Capacitor required)...'));
    try {
      execSync('npx cap build', { stdio: 'inherit' });
    } catch (e) {
      console.error(chalk.red('Mobile export failed. Make sure @capacitor/cli is installed.'));
    }
  } else if (target === 'arm-linux') {
    console.log(chalk.cyan('Cross-compiling for ARM Linux (Anbernic/Miyoo/Pi)...'));
    const outDir = path.resolve(process.cwd(), 'dist', 'arm-linux');
    await fs.ensureDir(outDir);
    try {
      execSync(
        'cargo build -p cathode-platform-native --target armv7-unknown-linux-gnueabihf --release',
        { stdio: 'inherit' },
      );
      const binaryName = process.platform === 'win32' ? 'cathode-platform-native' : 'cathode-platform-native';
      const binarySrc = path.resolve(
        'target', 'armv7-unknown-linux-gnueabihf', 'release', binaryName,
      );
      if (fs.existsSync(binarySrc)) {
        await fs.copy(binarySrc, path.join(outDir, binaryName));
      }
      const launchScript = `#!/bin/sh\ncd "$(dirname "$0")"\n./${binaryName} "$@"\n`;
      await fs.writeFile(path.join(outDir, 'launch.sh'), launchScript, { mode: 0o755 });
      console.log(chalk.green(`ARM Linux build output to ${outDir}`));
    } catch (e) {
      console.error(chalk.red('ARM Linux export failed. Make sure the cross-compilation toolchain is installed.'));
    }
  } else if (target === 'pwa') {
    console.log(chalk.cyan('Adding PWA support...'));
    try {
      execSync('cathode build', { stdio: 'inherit' });
    } catch (e) {
      console.error(chalk.red('Build step failed'));
      return;
    }
    const distDir = path.resolve(process.cwd(), 'dist');
    if (!fs.existsSync(distDir)) {
      console.error(chalk.red('dist/ directory not found. Run build first.'));
      return;
    }

    let projectName = 'Retro Game';
    const configPath = path.resolve(process.cwd(), 'retro.config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = await fs.readJson(configPath);
        if (config.title) projectName = config.title;
      } catch { /* use default */ }
    }

    const manifest = {
      name: projectName,
      short_name: projectName,
      start_url: '.',
      display: 'standalone',
      background_color: '#0a0a0a',
      theme_color: '#7c3aff',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    };
    await fs.writeJson(path.join(distDir, 'manifest.json'), manifest, { spaces: 2 });

    const sw = `const CACHE_NAME = 'retro-game-v1';
const ASSETS = self.__WB_MANIFEST || ['/'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
`;
    await fs.writeFile(path.join(distDir, 'sw.js'), sw);

    // Inject manifest link + SW registration into index.html
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      let html = await fs.readFile(indexPath, 'utf-8');
      if (!html.includes('manifest.json')) {
        html = html.replace(
          '</head>',
          '    <link rel="manifest" href="/manifest.json">\n</head>',
        );
      }
      if (!html.includes('sw.js')) {
        html = html.replace(
          '</body>',
          `    <script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}</script>\n</body>`,
        );
      }
      await fs.writeFile(indexPath, html);
    }

    console.log(chalk.green('PWA manifest and service worker added to dist/'));
  } else if (target === 'rom-gb') {
    console.log(chalk.cyan('Generating GBDK-2020 project scaffold...'));
    const outDir = path.resolve(process.cwd(), 'dist', 'rom-gb');
    await fs.ensureDir(path.join(outDir, 'assets'));
    await fs.ensureDir(path.join(outDir, 'maps'));

    const makefile = `# GBDK-2020 Makefile
# Requires GBDK-2020 installed: https://github.com/gbdk-2020/gbdk-2020/releases
# Set GBDK_HOME to your GBDK-2020 install directory

GBDK_HOME ?= /opt/gbdk
CC = $(GBDK_HOME)/bin/lcc
ROM_NAME = game.gb

SRCS = main.c
OBJS = $(SRCS:.c=.o)

all: $(ROM_NAME)

$(ROM_NAME): $(SRCS)
\t$(CC) -o $@ $^

clean:
\trm -f $(ROM_NAME) $(OBJS)

.PHONY: all clean
`;
    await fs.writeFile(path.join(outDir, 'Makefile'), makefile);

    const mainC = `#include <gb/gb.h>
#include <stdio.h>

/* Game Boy ROM scaffold generated by Cathode CLI */
/* Requires GBDK-2020: https://github.com/gbdk-2020/gbdk-2020/releases */

/* TODO: Import your sprite and map data from assets/ and maps/ */

void main(void) {
    DISPLAY_ON;

    /* Palette: lightest to darkest */
    BGP_REG = 0xE4U;  /* 11 10 01 00 */
    OBP0_REG = 0xE4U;

    printf("RETRO ENGINE\\n");
    printf("GB ROM READY\\n");

    /* Main game loop */
    while(1) {
        /* Read joypad */
        UINT8 keys = joypad();

        /* Update game logic here */

        /* Wait for VBlank */
        wait_vbl_done();
    }
}
`;
    await fs.writeFile(path.join(outDir, 'main.c'), mainC);

    const readme = `# Game Boy ROM Project

Generated by Cathode CLI.

## Prerequisites

1. Install GBDK-2020: https://github.com/gbdk-2020/gbdk-2020/releases
2. Set the \`GBDK_HOME\` environment variable to your GBDK-2020 install directory

## Build

\`\`\`bash
export GBDK_HOME=/path/to/gbdk
make
\`\`\`

This produces \`game.gb\` which you can run in any Game Boy emulator (BGB, mGBA, etc.)
or flash to a cartridge.

## Structure

- \`main.c\` — Game loop skeleton with joypad input
- \`assets/\` — Place converted sprite data here (2bpp tile format)
- \`maps/\` — Place tilemap data as C arrays here

## Converting Assets

Use \`png2asset\` (included with GBDK-2020) to convert PNG sprites:
\`\`\`bash
$(GBDK_HOME)/bin/png2asset sprite.png -o assets/sprite.c -sw 8 -sh 8
\`\`\`
`;
    await fs.writeFile(path.join(outDir, 'README.md'), readme);

    console.log(chalk.green(`GBDK-2020 project scaffold generated in ${outDir}`));
  } else if (target === 'rom-nes') {
    console.log(chalk.cyan('Generating cc65/NESLib project scaffold...'));
    const outDir = path.resolve(process.cwd(), 'dist', 'rom-nes');
    await fs.ensureDir(path.join(outDir, 'chr'));
    await fs.ensureDir(path.join(outDir, 'maps'));

    const makefile = `# cc65 + NESLib Makefile
# Requires cc65 installed: https://cc65.github.io/
# Requires NESLib: https://github.com/clbr/neslib

CC65_HOME ?= /opt/cc65
CC = $(CC65_HOME)/bin/cc65
AS = $(CC65_HOME)/bin/ca65
LD = $(CC65_HOME)/bin/ld65
ROM_NAME = game.nes

SRCS = main.c
ASMS = $(SRCS:.c=.s)
OBJS = $(SRCS:.c=.o) crt0.o

all: $(ROM_NAME)

%.s: %.c
\t$(CC) -Oi -t nes -o $@ $<

%.o: %.s
\t$(AS) -t nes -o $@ $<

$(ROM_NAME): $(OBJS) nes.cfg
\t$(LD) -C nes.cfg -o $@ $(OBJS) nes.lib

clean:
\trm -f $(ROM_NAME) $(OBJS) $(ASMS)

.PHONY: all clean
`;
    await fs.writeFile(path.join(outDir, 'Makefile'), makefile);

    const mainC = `/* NES ROM scaffold generated by Cathode CLI */
/* Requires cc65: https://cc65.github.io/ */
/* Requires NESLib: https://github.com/clbr/neslib */

#include "neslib.h"

/* TODO: Import your CHR data from chr/ and map data from maps/ */

const unsigned char palette[16] = {
  0x0F, 0x11, 0x21, 0x30,  /* BG palette 0 */
  0x0F, 0x06, 0x16, 0x26,  /* BG palette 1 */
  0x0F, 0x09, 0x19, 0x29,  /* BG palette 2 */
  0x0F, 0x01, 0x11, 0x21   /* BG palette 3 */
};

void main(void) {
  pal_bg(palette);
  ppu_on_all();

  /* Main game loop */
  while(1) {
    ppu_wait_nmi();

    /* Read gamepad */
    unsigned char pad = pad_poll(0);

    /* Update game logic here */
    /* if (pad & PAD_LEFT)  { ... } */
    /* if (pad & PAD_RIGHT) { ... } */
    /* if (pad & PAD_A)     { ... } */
  }
}
`;
    await fs.writeFile(path.join(outDir, 'main.c'), mainC);

    const nesCfg = `MEMORY {
    ZP:     start = $0000, size = $0100, type = rw, define = yes;
    RAM:    start = $0200, size = $0600, type = rw, define = yes;
    HDR:    start = $0000, size = $0010, type = ro, file = %O, fill = yes;
    PRG:    start = $8000, size = $8000, type = ro, file = %O, fill = yes;
    CHR:    start = $0000, size = $2000, type = ro, file = %O, fill = yes;
}

SEGMENTS {
    ZEROPAGE: load = ZP,  type = zp;
    BSS:      load = RAM, type = bss, define = yes;
    HEADER:   load = HDR, type = ro;
    CODE:     load = PRG, type = ro, start = $8000;
    RODATA:   load = PRG, type = ro;
    VECTORS:  load = PRG, type = ro, start = $FFFA;
    CHARS:    load = CHR, type = ro;
}
`;
    await fs.writeFile(path.join(outDir, 'nes.cfg'), nesCfg);

    const readme = `# NES ROM Project

Generated by Cathode CLI.

## Prerequisites

1. Install cc65: https://cc65.github.io/
2. Install NESLib: https://github.com/clbr/neslib
3. Set \`CC65_HOME\` environment variable to your cc65 install directory

## Build

\`\`\`bash
export CC65_HOME=/path/to/cc65
make
\`\`\`

This produces \`game.nes\` which can be run in any NES emulator (FCEUX, Mesen, etc.)
or flashed to a cartridge.

## Structure

- \`main.c\` — NESLib game loop with palette and joypad input
- \`nes.cfg\` — cc65 linker configuration for iNES format
- \`chr/\` — Place 8x8 NES CHR tile data here
- \`maps/\` — Place tilemap data as C arrays here

## Converting Assets

Convert PNG to NES CHR format using a tool like YY-CHR or NES Screen Tool,
then include the binary data in your CHR segment.
`;
    await fs.writeFile(path.join(outDir, 'README.md'), readme);

    console.log(chalk.green(`cc65/NESLib project scaffold generated in ${outDir}`));
  } else {
    console.error(chalk.red(`Unknown target: ${target}. Supported: web, desktop, mobile, arm-linux, pwa, rom-gb, rom-nes.`));
    process.exit(1);
  }
}
