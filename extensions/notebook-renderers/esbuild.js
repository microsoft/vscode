/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path = require('path');
const esbuild = require('esbuild');

const args = process.argv.slice(2);

const isWatch = args.indexOf('--watch') >= 0;

let outputRoot = __dirname;
const outputRootIndex = args.indexOf('--outputRoot');
if (outputRootIndex >= 0) {
	outputRoot = args[outputRootIndex + 1];
}

const outDir = path.join(outputRoot, 'renderer-out');

esbuild.build({
	entryPoints: [
		path.join(__dirname, 'src', 'index.ts'),
	],
	bundle: true,
	minify: false,
	sourcemap: false,
	format: 'esm',
	outdir: outDir,
	platform: 'browser',
	target: ['es2020'],
	watch: isWatch,
	incremental: isWatch,
}).catch(() => process.exit(1));
