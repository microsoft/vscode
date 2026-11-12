/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';
import { resolvePackageDirectory } from '../esbuild-common.mts';
import { run } from '../esbuild-extension-common.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist', 'browser');

run({
	platform: 'browser',
	entryPoints: {
		'emmetBrowserMain': path.join(srcDir, 'browser', 'emmetBrowserMain.ts'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		tsconfig: path.join(import.meta.dirname, 'tsconfig.browser.json'),
		alias: {
			// @vscode/emmet-helper imports Node.js's `util`: bundle the polyfill that this extension
			// declares, not the one that a project above it happens to provide.
			'util': resolvePackageDirectory(import.meta.dirname, 'util'),
		},
	},
}, process.argv);
