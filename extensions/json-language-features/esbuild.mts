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
			'jsonClientMain': path.join(extensionRoot, 'client', 'src', 'node', 'jsonClientMain.ts'),
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
		format: 'esm',
		entryPoints: {
			'jsonServerMain': path.join(extensionRoot, 'server', 'src', 'node', 'jsonServerNodeMain.ts'),
		},
		srcDir: path.join(extensionRoot, 'server', 'src'),
		outdir: path.join(extensionRoot, 'server', 'dist', 'node'),
		additionalOptions: {
			tsconfig: path.join(extensionRoot, 'server', 'tsconfig.json'),
			external: ['vscode', 'typescript', 'fs'],
			banner: {
				// `@vscode/l10n` is bundled as CommonJS and still calls `require('fs')` internally.
				// Provide Node's `require` in the generated ESM output so those imports keep working.
				js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
			},
		},
	}, process.argv),
]);
