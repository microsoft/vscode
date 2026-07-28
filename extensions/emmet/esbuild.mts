/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';
import { run } from '../esbuild-extension-common.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist', 'node');

run({
	platform: 'node',
	entryPoints: {
		'emmetNodeMain': path.join(srcDir, 'node', 'emmetNodeMain.ts'),
	},
	srcDir,
	outdir: outDir,
}, process.argv);
