import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: [resolve(__dirname, '../src/extension.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node18'],
  sourcemap: true,
  outfile: resolve(__dirname, '../dist/extension.js'),
  external: ['vscode'],
  banner: {
    js: "const require = ((m) => typeof require !== 'undefined' ? require : m)(import.meta.url);"
  }
};

async function run() {
  if (watch) {
    const ctx = await build({ ...options, watch: true });
    console.log('Watching cocode-collab sources...');
    return ctx;
  }
  await build(options);
  console.log('Built cocode-collab extension.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
