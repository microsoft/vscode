/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import path from 'path';
import { run } from '../esbuild-webview-common.mjs';

const srcDir = path.join(import.meta.dirname, 'preview-src');
const outDir = path.join(import.meta.dirname, 'media');

run({
	entryPoints: {
		'index': path.join(srcDir, 'index.ts'),
		'codicon': path.join(import.meta.dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		loader: {
			'.ttf': 'dataurl',
		}
	}
}, process.argv);
