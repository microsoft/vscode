// Builds LocalClaude for VS Code: the extension (Node, dist/) and the UI (webview, media/).
// `electron` is replaced by small stand-ins on both sides, so LocalClaude's modules work unchanged.
import * as path from 'node:path';
import { run as runExtension } from '../esbuild-extension-common.mts';
import { run as runWebview } from '../esbuild-webview-common.mts';

const root = import.meta.dirname;
const srcDir = path.join(root, 'src');

await Promise.all([
	runExtension({
		platform: 'node',
		entryPoints: { extension: path.join(srcDir, 'host', 'vscode', 'extension.ts') },
		srcDir,
		outdir: path.join(root, 'dist'),
		additionalOptions: {
			alias: { electron: path.join(srcDir, 'host', 'vscode', 'electronShim.ts') },
			// LocalClaude's modules are ES modules; the bundle is CommonJS, so give them import.meta.url
			define: { 'import.meta.url': '__lcImportMetaUrl' },
			banner: { js: `const __lcImportMetaUrl = require('url').pathToFileURL(__filename).href;` },
			// pdf.js (through unpdf) is loaded on demand from node_modules rather than bundled
			external: ['vscode', 'unpdf'],
		},
	}, process.argv),
	runWebview({
		entryPoints: { webview: path.join(srcDir, 'webview', 'index.ts') },
		srcDir,
		outdir: path.join(root, 'media'),
		additionalOptions: {
			alias: { electron: path.join(srcDir, 'webview', 'vscode', 'electron.ts') },
			define: {
				'process.platform': 'window.__lcBoot.platform',
				'process.env.NODE_ENV': '"production"',
			},
			jsx: 'automatic',
			loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
			assetNames: 'fonts/[name]-[hash]',
		},
	}, process.argv),
]);
