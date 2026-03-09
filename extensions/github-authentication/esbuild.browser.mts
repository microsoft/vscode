/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';
import type { Plugin } from 'esbuild';
import { run } from '../esbuild-extension-common.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist', 'browser');

/**
 * Plugin that rewrites `./node/*` imports to `./browser/*` for the web build,
 * replacing the platform-specific implementations with their browser equivalents.
 */
const platformModulesPlugin: Plugin = {
	name: 'platform-modules',
	setup(build) {
		build.onResolve({ filter: /\/node\// }, args => {
			if (args.kind !== 'import-statement' || !args.resolveDir) {
				return;
			}
			const remapped = args.path.replace('/node/', '/browser/');
			return build.resolve(remapped, { resolveDir: args.resolveDir, kind: args.kind });
		});
	},
};

run({
	platform: 'browser',
	entryPoints: {
		'extension': path.join(srcDir, 'extension.ts'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		plugins: [platformModulesPlugin],
		tsconfig: path.join(import.meta.dirname, 'tsconfig.browser.json'),
	},
}, process.argv);
