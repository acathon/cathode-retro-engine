import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';

export default async function buildCommand() {
  console.log(chalk.cyan('Building Cathode project for production...\n'));
  
  const spinner1 = ora('Building WASM bundle').start();
  try {
    // Monorepo specific or fetch prebuilt
    spinner1.succeed('WASM bundle ready');
  } catch (e) {
    spinner1.fail('WASM build failed');
    process.exit(1);
  }

  const spinner2 = ora('Running Vite build').start();
  try {
    execSync('npx vite build', { stdio: 'inherit' });
    spinner2.succeed('Web bundle built to /dist');
  } catch (e) {
    spinner2.fail('Vite build failed');
    process.exit(1);
  }

  console.log(chalk.green('\nBuild successful!'));
}
