const path = require('path');

const srcDir = path.join(__dirname, 'renderer', 'src');
const outDir = path.join(__dirname, 'renderer', 'media');

require('../esbuild-webview-common').run({
	entryPoints: [
		path.join(srcDir, 'index.ts'),
	],
	srcDir,
	outdir: outDir,
	additionalOptions: {
		loader: {
			'.svg': 'dataurl',
			'.ttf': 'dataurl',
			'.woff': 'dataurl',
			'.woff2': 'dataurl',
			'.eot': 'dataurl',
		},
		define: {
			'define': 'undefined',
		},
	},
}, process.argv);

