/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';
import { run } from '../esbuild-extension-common.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist');

run({
	platform: 'node',
	entryPoints: {
		'extension': path.join(srcDir, 'extension.ts'),
		'worker': path.join(srcDir, 'node', 'worker.ts'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		// Native module with prebuilt per-platform binaries; packaged next to the bundle.
		external: ['vscode', 'onnxruntime-node'],
	},
}, process.argv);
