const path = require('path');

const srcDir = path.join(__dirname, 'media', 'src');
const outDir = path.join(__dirname, 'media');

require('../esbuild-webview-common.mjs').run({
	entryPoints: [
		path.join(srcDir, 'ssh-terminal.js'),
		path.join(srcDir, 'redis-terminal.js'),
		path.join(srcDir, 'connection.js'),
		path.join(srcDir, 'results.js'),
		path.join(srcDir, 'design.js'),
		path.join(srcDir, 'forward.js'),
		path.join(srcDir, 'status.js'),
		path.join(srcDir, 'redis-key.js'),
		path.join(srcDir, 'redis-status.js'),
		path.join(srcDir, 'struct-diff.js'),
		path.join(srcDir, 'data-grid.js'),
		path.join(srcDir, 'cell-editors.js'),
		path.join(srcDir, 'type-validators.js'),
		path.join(srcDir, 'vscode-messaging.js'),
	],
	srcDir,
	outdir: outDir,
	additionalOptions: {
		loader: {
			'.css': 'text',
		},
		external: ['vscode'],
	},
}, process.argv);
