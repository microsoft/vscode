/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import { run } from '../esbuild-webview-common.mts';

const srcDir = path.join(import.meta.dirname, 'markdown-editor-src');
const outDir = path.join(import.meta.dirname, 'markdown-editor-out');

run({
	entryPoints: [
		path.join(srcDir, 'editor.ts'),
	],
	srcDir,
	outdir: outDir,
	additionalOptions: {
		loader: {
			'.woff': 'file',
			'.woff2': 'file',
			'.ttf': 'file',
			'.eot': 'file',
			'.svg': 'file',
		},
		assetNames: '[name]-[hash]',
	},
}, process.argv);
