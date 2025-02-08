/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
const path = require('path');

const srcDir = path.join(__dirname, 'preview-src');
const outDir = path.join(__dirname, 'media');

require('../esbuild-webview-common').run({
	entryPoints: [
		path.join(srcDir, 'index.ts'),
		path.join(srcDir, 'pre'),
	],
	srcDir,
	outdir: outDir,
}, process.argv);
