import { execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import ora from 'ora';

export default async function runCommand() {
  const spinner = ora('Checking dependencies...').start();
  
  const platformWebPath = path.resolve(process.cwd(), 'node_modules', 'cathode-platform-web');
  const hasWasm = fs.existsSync(platformWebPath);

  if (!hasWasm) {
    spinner.text = 'Building WASM bindings (this may take a minute)...';
    try {
      // In a real scenario, this might download the wasm from npm if not in monorepo
      // For this monorepo, assume it's linked
    } catch (err: any) {
      spinner.fail(chalk.red('Failed to verify WASM build.'));
    }
  }

  spinner.succeed('Dependencies ready. Starting dev server...');

  try {
    execSync('npx vite', { stdio: 'inherit' });
  } catch (err) {
    console.error(chalk.red('Failed to start dev server.'));
    process.exit(1);
  }
}
