/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import path from 'path';
import { run } from '../esbuild-webview-common.mjs';

const srcDir = path.join(import.meta.dirname, 'editor-src');
const outDir = path.join(import.meta.dirname, 'media');

run({
	entryPoints: {
		'editor': path.join(srcDir, 'index.ts'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		format: 'iife',
	}
}, process.argv);
