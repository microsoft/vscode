/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import path from 'node:path';
import { run } from '../esbuild-webview-common.mjs';

const srcDir = path.join(import.meta.dirname, 'notebook-src');
const outDir = path.join(import.meta.dirname, 'notebook-out');

run({
	entryPoints: [
		path.join(srcDir, 'cellAttachmentRenderer.ts'),
	],
	srcDir,
	outdir: outDir,
}, process.argv);
