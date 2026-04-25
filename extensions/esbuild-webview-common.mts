/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Common build script for extension scripts used in in webviews.
 */
import path from 'node:path';
import esbuild from 'esbuild';

export type BuildOptions = Partial<esbuild.BuildOptions> & {
	readonly entryPoints: esbuild.BuildOptions['entryPoints'];
	readonly outdir: string;
};

export async function run(
	config: {
		srcDir: string;
		outdir: string;
		entryPoints: BuildOptions['entryPoints'];
		additionalOptions?: Partial<esbuild.BuildOptions>;
	},
	args: string[],
	didBuild?: (outDir: string) => unknown
): Promise<void> {
	let outdir = config.outdir;
	const outputRootIndex = args.indexOf('--outputRoot');
	if (outputRootIndex >= 0) {
		const outputRoot = args[outputRootIndex + 1];
		const outputDirName = path.basename(outdir);
		outdir = path.join(outputRoot, outputDirName);
	}

	const resolvedOptions: BuildOptions = {
		bundle: true,
		minify: true,
		sourcemap: false,
		format: 'esm',
		platform: 'browser',
		target: ['es2024'],
		entryPoints: config.entryPoints,
		outdir,
		logOverride: {
			'import-is-undefined': 'error',
		},
		...(config.additionalOptions || {}),
	};

	const isWatch = args.indexOf('--watch') >= 0;
	if (isWatch) {
		if (didBuild) {
			resolvedOptions.plugins = [
				...(resolvedOptions.plugins || []),
				{
					name: 'did-build', setup(pluginBuild) {
						pluginBuild.onEnd(async result => {
							if (result.errors.length > 0) {
								return;
							}

							try {
								await didBuild(outdir);
							} catch (error) {
								console.error('didBuild failed:', error);
							}
						});
					},
				}
			];
		}
		const ctx = await esbuild.context(resolvedOptions);
		await ctx.watch();
	} else {
		try {
			await esbuild.build(resolvedOptions);
			await didBuild?.(outdir);
		} catch {
			process.exit(1);
		}
	}
}
