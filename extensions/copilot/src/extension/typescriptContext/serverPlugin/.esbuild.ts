/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as esbuild from 'esbuild';

const typeScriptServerPluginBuildOptions: esbuild.BuildOptions = {
	tsconfig: './tsconfig.json',
	bundle: true,
	format: 'cjs',
	// keepNames: true,
	logLevel: 'info',
	minify: false,
	outdir: './dist',
	platform: 'node',
	sourcemap: false,
	sourcesContent: false,
	treeShaking: true,
	external: [
		'typescript',
		'typescript/lib/tsserverlibrary'
	],
	entryPoints: [
		{ in: './src/node/main.ts', out: 'main' }
	]
} satisfies esbuild.BuildOptions;

async function main() {
	await Promise.all([
		esbuild.build(typeScriptServerPluginBuildOptions),
	]);
}

main();