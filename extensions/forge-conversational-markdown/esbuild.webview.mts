import path from 'path';
import { run } from '../esbuild-webview-common.mts';

const srcDir = path.join(import.meta.dirname, 'webview-src');
const outDir = path.join(import.meta.dirname, 'media');

run(
	{
		entryPoints: [{ in: path.join(srcDir, 'index.tsx'), out: 'webview' }],
		srcDir,
		outdir: outDir,
		additionalOptions: {
			jsx: 'automatic',
			jsxImportSource: 'preact',
		},
	},
	process.argv,
);
