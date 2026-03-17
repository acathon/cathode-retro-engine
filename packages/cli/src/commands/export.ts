import { execSync } from 'child_process';
import chalk from 'chalk';

export default async function exportCommand(target: string) {
  if (target === 'web') {
    console.log(chalk.cyan('Exporting to web...'));
    try {
      execSync('retro build', { stdio: 'inherit' });
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
  } else {
    console.error(chalk.red(`Unknown target: ${target}. Supported: web, desktop, mobile.`));
    process.exit(1);
  }
}
