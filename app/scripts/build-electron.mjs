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
    sourcemap: false,
    minify: true,
    banner: {
      js: `
import { createRequire } from 'module';
import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirname_fn } from 'path';
const require = createRequire(import.meta.url);
`.trim(),
    },
  });

  console.log('Electron production build completed');
}

buildElectron().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
