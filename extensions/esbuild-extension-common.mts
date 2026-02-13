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

/**
 * Build the source code once using esbuild.
 */
async function build(options: BuildOptions, didBuild?: (outDir: string) => unknown): Promise<void> {
	await esbuild.build(options);
	await didBuild?.(options.outdir);
}

/**
 * Build the source code once using esbuild, logging errors instead of throwing.
 */
async function tryBuild(options: BuildOptions, didBuild?: (outDir: string) => unknown): Promise<void> {
	try {
		await build(options, didBuild);
	} catch (err) {
		console.error(err);
	}
}

interface RunConfig {
	readonly platform: 'node' | 'browser';
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
		sourcemap: true,
		target: ['es2024'],
		external: ['vscode'],
		entryPoints: config.entryPoints,
		outdir,
		logOverride: {
			'import-is-undefined': 'error',
		},
		...(config.additionalOptions || {}),
	};

	if (config.platform === 'node') {
		options.format = 'cjs';
		options.mainFields = ['module', 'main'];
	} else if (config.platform === 'browser') {
		options.format = 'cjs';
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
		await tryBuild(resolvedOptions, didBuild);
		const watcher = await import('@parcel/watcher');
		watcher.subscribe(config.srcDir, () => tryBuild(resolvedOptions, didBuild));
	} else {
		return build(resolvedOptions, didBuild).catch(() => process.exit(1));
	}
}
