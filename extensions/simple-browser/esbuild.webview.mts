/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import { resolvePackageDirectory } from '../esbuild-common.mts';
import { run } from '../esbuild-webview-common.mts';

const srcDir = path.join(import.meta.dirname, 'preview-src');
const outDir = path.join(import.meta.dirname, 'media');

run({
	entryPoints: {
		'index': path.join(srcDir, 'index.ts'),
		'codicon': path.join(resolvePackageDirectory(import.meta.dirname, '@vscode/codicons'), 'dist', 'codicon.css'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		loader: {
			'.ttf': 'dataurl',
		}
	}
}, process.argv);
