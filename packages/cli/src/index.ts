#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import newCmd from './commands/new.js';
import runCmd from './commands/run.js';
import buildCmd from './commands/build.js';
import exportCmd from './commands/export.js';
import packCmd from './commands/pack.js';

const program = new Command();

console.log(chalk.magenta(`
   ___     __               ___         _         
  / _ \\___/ /________      / __\\__  ___(_)__  ___ 
 / , _/ -_) __/ __/ _ \\   / _// _ \\/ _ \`/ / _ \\/ -_)
/_/|_|\\__/\\__/_/  \\___/  /___/._,_/\\_, /_/_//_/\\__/ 
                                  /___/             
`));

program
  .name('cathode')
  .description('Cathode CLI tool for building modern 2D retro games')
  .version('0.1.0');

program
  .command('new')
  .description('Create a new game project')
  .argument('<name>', 'Name of the project directory')
  .option('-t, --template <template>', 'Project template (default, platformer, shmup, puzzle, rpg, doom)', 'default')
  .action(newCmd);

program
  .command('run')
  .description('Run the development server')
  .action(runCmd);

program
  .command('build')
  .description('Build the project for production')
  .action(buildCmd);

program
  .command('export')
  .description('Export the project to a specific platform')
  .argument('<target>', 'Target platform (web, desktop, mobile, arm-linux, pwa, rom-gb, rom-nes)')
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
