/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'node:path';
import { run } from '../esbuild-extension-common.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist');

await Promise.all([
	run({
		platform: 'node',
		entryPoints: {
			'extension': path.join(srcDir, 'extension.ts'),
		},
		srcDir,
		outdir: outDir,
	}, process.argv),
	run({
		platform: 'node',
		format: 'esm',
		entryPoints: {
			'worker': path.join(srcDir, 'worker.mts'),
		},
		srcDir,
		outdir: outDir,
		additionalOptions: {
			external: ['onnxruntime-node'],
			outExtension: { '.js': '.mjs' },
		},
	}, process.argv),
]);
