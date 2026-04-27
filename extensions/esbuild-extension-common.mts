/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Common build script for extensions.
 */
import path from 'node:path';
import esbuild from 'esbuild';

type BuildOptions = Partial<esbuild.BuildOptions> & {
	outdir: string;
};

interface RunConfig {
	readonly platform: 'node' | 'browser';
	readonly format?: 'cjs' | 'esm';
	readonly srcDir: string;
	readonly outdir: string;
	readonly entryPoints: string[] | Record<string, string> | { in: string; out: string }[];
	readonly additionalOptions?: Partial<esbuild.BuildOptions>;
}

function resolveOptions(config: RunConfig, outdir: string): BuildOptions {
	const options: BuildOptions = {
		platform: config.platform,
		bundle: true,
		minify: true,
		treeShaking: true,
		sourcemap: true,
		target: ['es2024'],
		external: ['vscode'],
		format: config.format ?? 'cjs',
		entryPoints: config.entryPoints,
		outdir,
		logOverride: {
			'import-is-undefined': 'error',
		},
		...(config.additionalOptions || {}),
	};

	if (config.platform === 'node') {
		options.mainFields = ['module', 'main'];
	} else if (config.platform === 'browser') {
		options.mainFields = ['browser', 'module', 'main'];
		options.alias = {
			'path': 'path-browserify',
		};
		options.define = {
			'process.platform': JSON.stringify('web'),
			'process.env': JSON.stringify({}),
			'process.env.BROWSER_ENV': JSON.stringify('true'),
		};
	}

	return options;
}

export async function run(config: RunConfig, args: string[], didBuild?: (outDir: string) => unknown): Promise<void> {
	let outdir = config.outdir;
	const outputRootIndex = args.indexOf('--outputRoot');
	if (outputRootIndex >= 0) {
		const outputRoot = args[outputRootIndex + 1];
		const outputDirName = path.basename(outdir);
		outdir = path.join(outputRoot, outputDirName);
	}

	const resolvedOptions = resolveOptions(config, outdir);

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
