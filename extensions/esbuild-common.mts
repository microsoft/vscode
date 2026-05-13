/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'node:path';
import esbuild from 'esbuild';

export interface RunConfig {
	readonly srcDir: string;
	readonly outdir: string;
	readonly entryPoints: esbuild.BuildOptions['entryPoints'];
	readonly additionalOptions?: Partial<esbuild.BuildOptions>;
}

/**
 * Shared build/watch runner for extension esbuild scripts.
 */
export async function runBuild(
	config: RunConfig,
	baseOptions: esbuild.BuildOptions,
	args: string[],
	didBuild?: (outDir: string) => unknown,
): Promise<void> {
	let outdir = config.outdir;
	const outputRootIndex = args.indexOf('--outputRoot');
	if (outputRootIndex >= 0) {
		const outputRoot = args[outputRootIndex + 1];
		const outputDirName = path.basename(outdir);
		outdir = path.join(outputRoot, outputDirName);
	}

	const resolvedOptions: esbuild.BuildOptions = {
		...baseOptions,
		entryPoints: config.entryPoints,
		outdir,
		...(config.additionalOptions || {}),
	};

	const isWatch = args.indexOf('--watch') >= 0;
	if (isWatch) {
		const ctx = await esbuild.context(resolvedOptions);
		await watchWithParcel(ctx, config.srcDir, () => didBuild?.(outdir));
	} else {
		try {
			await esbuild.build(resolvedOptions);
			await didBuild?.(outdir);
		} catch {
			process.exit(1);
		}
	}
}

// We use @parcel/watcher as it has much lower cpu usage when idle compared to esbuild's watch mode
async function watchWithParcel(ctx: esbuild.BuildContext, srcDir: string, didBuild?: () => Promise<unknown> | unknown): Promise<void> {
	let debounce: ReturnType<typeof setTimeout> | undefined;
	const rebuild = () => {
		if (debounce) {
			clearTimeout(debounce);
		}
		debounce = setTimeout(async () => {
			try {
				await ctx.cancel();
				const result = await ctx.rebuild();
				if (result.errors.length === 0) {
					await didBuild?.();
				}
			} catch (error) {
				console.error('[watch] build error:', error);
			}
		}, 100);
	};

	const watcher = await import('@parcel/watcher');
	await watcher.subscribe(srcDir, (_err, _events) => {
		rebuild();
	}, {
		ignore: ['**/node_modules/**', '**/dist/**', '**/out/**']
	});
	rebuild();
}
