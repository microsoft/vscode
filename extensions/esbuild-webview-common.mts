/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Common build script for extension scripts used in in webviews.
 */
import { runBuild, type RunConfig } from './esbuild-common.mts';

const baseOptions = {
	bundle: true,
	minify: true,
	sourcemap: false,
	format: 'esm' as const,
	platform: 'browser' as const,
	target: ['es2024'],
	logOverride: {
		'import-is-undefined': 'error',
	},
};

export async function run(
	config: RunConfig,
	args: string[],
	didBuild?: (outDir: string) => unknown
): Promise<void> {
	return runBuild(config, baseOptions, args, didBuild);
}
