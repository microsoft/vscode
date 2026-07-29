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
 * Plugin to redirect `./node/net` imports to `./browser/net` for the browser build.
 */
const browserNetPlugin: Plugin = {
	name: 'browser-net-redirect',
	setup(build) {
		build.onResolve({ filter: /\/node\/net$/ }, args => {
			return { path: path.join(path.dirname(args.resolveDir), 'src', 'browser', 'net.ts') };
		});
	},
};

run({
	platform: 'browser',
	entryPoints: {
		'configurationEditingMain': path.join(srcDir, 'configurationEditingMain.ts'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		plugins: [browserNetPlugin],
		tsconfig: path.join(import.meta.dirname, 'tsconfig.browser.json'),
	},
}, process.argv);
