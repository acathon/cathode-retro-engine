#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import newCmd from './commands/new.js';
import runCmd from './commands/run.js';
import buildCmd from './commands/build.js';
import exportCmd from './commands/export.js';
import packCmd from './commands/pack.js';

const program = new Command();

console.log(chalk.magenta('▚ Cathode'));

program
  .name('cathode')
  .description('Make retro games, and ship them to Android and iOS')
  .version('0.1.0');

program
  .command('new')
  .description('Create a new game project')
  .argument('<name>', 'Name of the project directory')
  .option('-t, --template <template>', 'Project template (default, platformer, shmup, puzzle, rpg, doom)', 'default')
  .action(newCmd);

program
  .command('run')
  .description('Start the development server: the game reloads as you save')
  .action(runCmd);

program
  .command('build')
  .description('Build the game for the web, into dist/ (the same as export web)')
  .action(buildCmd);

program
  .command('export')
  .description('Build the game for the web, or as an Android or iOS app')
  .argument('<target>', 'web, android or ios')
  .option('--release', 'a store build: an Android App Bundle, or an iOS .ipa for App Store Connect')
  .option('--run', 'install and start it on a connected phone, emulator or simulator')
  .option('--open', 'open the native project in Android Studio or Xcode afterwards')
  .option('--no-build', 'prepare the native project in native/ without compiling it')
  .addHelpText('after', `
Examples:
  cathode export android            a test APK, in out/
  cathode export android --run      ...installed and started on a connected phone
  cathode export ios                a simulator build (on a Mac)
  cathode export android --release  an .aab for Google Play (see docs/shipping.md)`)
  .action(exportCmd);

program
  .command('pack')
  .description('Pack sprite PNGs into a texture atlas')
  .argument('<files...>', 'Input PNG file paths or glob patterns')
  .option('--tile-width <size>', 'Tile width in pixels', '8')
  .option('--tile-height <size>', 'Tile height in pixels', '8')
  .option('-o, --output <path>', 'Output atlas base path (without extension)', 'assets/atlas')
  .action(packCmd);

program.parse(process.argv);
