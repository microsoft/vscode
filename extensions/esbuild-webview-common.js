/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

/**
 * @fileoverview Common build script for extension scripts used in in webviews.
 */

const path = require('path');
const esbuild = require('esbuild');

/**
 * @typedef {Partial<import('esbuild').BuildOptions> & {
 * 	entryPoints: string[] | Record<string, string> | { in: string, out: string }[];
 * 	outdir: string;
 * }} BuildOptions
 */

/**
 * Build the source code once using esbuild.
 *
 * @param {BuildOptions} options
 * @param {(outDir: string) => unknown} [didBuild]
 */
async function build(options, didBuild) {
	await esbuild.build({
		bundle: true,
		minify: true,
		sourcemap: false,
		format: 'esm',
		platform: 'browser',
		target: ['es2020'],
		...options,
	});

	await didBuild?.(options.outdir);
}

/**
 * Build the source code once using esbuild, logging errors instead of throwing.
 *
 * @param {BuildOptions} options
 * @param {(outDir: string) => unknown} [didBuild]
 */
async function tryBuild(options, didBuild) {
	try {
		await build(options, didBuild);
	} catch (err) {
		console.error(err);
	}
}

/**
 * @param {{
 * 	srcDir: string;
 *  outdir: string;
 *  entryPoints: string[] | Record<string, string> | { in: string, out: string }[];
 * 	additionalOptions?: Partial<import('esbuild').BuildOptions>
 * }} config
 * @param {string[]} args
 * @param {(outDir: string) => unknown} [didBuild]
 */
module.exports.run = function (config, args, didBuild) {
	let outdir = config.outdir;

	const outputRootIndex = args.indexOf('--outputRoot');
	if (outputRootIndex >= 0) {
		const outputRoot = args[outputRootIndex + 1];
		const outputDirName = path.basename(outdir);
		outdir = path.join(outputRoot, outputDirName);
	}

	/** @type {BuildOptions} */
	const resolvedOptions = {
		entryPoints: config.entryPoints,
		outdir,
		...(config.additionalOptions || {}),
	};

	const isWatch = args.indexOf('--watch') >= 0;
	if (isWatch) {
		tryBuild(resolvedOptions);

		const watcher = require('@parcel/watcher');
		watcher.subscribe(config.srcDir, () => tryBuild(resolvedOptions, didBuild));
	} else {
		return build(resolvedOptions, didBuild).catch(() => process.exit(1));
	}
};
