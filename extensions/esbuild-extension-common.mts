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
	await esbuild.build({
		bundle: true,
		minify: true,
		sourcemap: false,
		format: 'cjs',
		platform: 'node',
		target: ['es2024'],
		external: ['vscode'],
		...options,
	});

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
	srcDir: string;
	outdir: string;
	entryPoints: string[] | Record<string, string> | { in: string; out: string }[];
	additionalOptions?: Partial<esbuild.BuildOptions>;
}

export async function run(config: RunConfig, args: string[], didBuild?: (outDir: string) => unknown): Promise<void> {
	let outdir = config.outdir;
	const outputRootIndex = args.indexOf('--outputRoot');
	if (outputRootIndex >= 0) {
		const outputRoot = args[outputRootIndex + 1];
		const outputDirName = path.basename(outdir);
		outdir = path.join(outputRoot, outputDirName);
	}

	const resolvedOptions: BuildOptions = {
		entryPoints: config.entryPoints,
		outdir,
		logOverride: {
			'import-is-undefined': 'error',
		},
		...(config.additionalOptions || {}),
	};

	const isWatch = args.indexOf('--watch') >= 0;
	if (isWatch) {
		await tryBuild(resolvedOptions, didBuild);
		const watcher = await import('@parcel/watcher');
		watcher.subscribe(config.srcDir, () => tryBuild(resolvedOptions, didBuild));
	} else {
		return build(resolvedOptions, didBuild).catch(() => process.exit(1));
	}
}
