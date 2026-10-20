import { spawnSync } from 'node:child_process';
import chalk from 'chalk';

/** `cathode run`: the development server, which reloads the game as you save. */
export default async function runCommand() {
  const result = spawnSync('npx', ['vite'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0 && result.signal !== 'SIGINT') {
    console.error(chalk.red('The development server stopped. Is this a game folder, with `npm install` done?'));
    process.exit(1);
  }
}
