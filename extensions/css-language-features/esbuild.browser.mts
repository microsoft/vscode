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
		platform: 'browser',
		entryPoints: {
			'cssClientMain': path.join(extensionRoot, 'client', 'src', 'browser', 'cssClientMain.ts'),
		},
		srcDir: path.join(extensionRoot, 'client', 'src'),
		outdir: path.join(extensionRoot, 'client', 'dist', 'browser'),
		additionalOptions: {
			tsconfig: path.join(extensionRoot, 'client', 'tsconfig.browser.json'),
		},
	}, process.argv),

	// Build server
	run({
		platform: 'browser',
		entryPoints: {
			'cssServerMain': path.join(extensionRoot, 'server', 'src', 'browser', 'cssServerWorkerMain.ts'),
		},
		srcDir: path.join(extensionRoot, 'server', 'src'),
		outdir: path.join(extensionRoot, 'server', 'dist', 'browser'),
		additionalOptions: {
			tsconfig: path.join(extensionRoot, 'server', 'tsconfig.browser.json'),
		},
	}, process.argv),
]);
