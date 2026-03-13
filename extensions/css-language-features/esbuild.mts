/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';
import { run } from '../esbuild-extension-common.mts';

const extensionRoot = import.meta.dirname;

await Promise.all([
	// Build client
	run({
		platform: 'node',
		entryPoints: {
			'cssClientMain': path.join(extensionRoot, 'client', 'src', 'node', 'cssClientMain.ts'),
		},
		srcDir: path.join(extensionRoot, 'client', 'src'),
		outdir: path.join(extensionRoot, 'client', 'dist', 'node'),
		additionalOptions: {
			tsconfig: path.join(extensionRoot, 'client', 'tsconfig.json'),
		},
	}, process.argv),

	// Build server
	run({
		platform: 'node',
		entryPoints: {
			'cssServerMain': path.join(extensionRoot, 'server', 'src', 'node', 'cssServerNodeMain.ts'),
		},
		srcDir: path.join(extensionRoot, 'server', 'src'),
		outdir: path.join(extensionRoot, 'server', 'dist', 'node'),
		additionalOptions: {
			tsconfig: path.join(extensionRoot, 'server', 'tsconfig.json'),
		},
	}, process.argv),
]);
