import { spawn } from 'child_process';
import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');

async function buildElectron() {
  await build({
    entryPoints: [
      resolve(appRoot, 'electron/main.ts'),
      resolve(appRoot, 'electron/preload.ts'),
    ],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outdir: resolve(appRoot, 'dist/electron'),
    external: [
      'electron',
      'better-sqlite3',
      'node-pty',
    ],
    sourcemap: true,
    banner: {
      js: `
import { createRequire } from 'module';
import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirname_fn } from 'path';
const require = createRequire(import.meta.url);
`.trim(),
    },
  });
  console.log('Electron built successfully');
}

async function startElectron() {
  // Wait for Vite dev server
  console.log('Waiting for Vite dev server...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  await buildElectron();

  const electronPath = resolve(appRoot, 'node_modules/.bin/electron');
  const mainPath = resolve(appRoot, 'dist/electron/main.js');

  const proc = spawn(electronPath, [mainPath], {
    cwd: appRoot,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'inherit',
  });

  proc.on('close', (code) => {
    process.exit(code || 0);
  });
}

startElectron().catch(console.error);
