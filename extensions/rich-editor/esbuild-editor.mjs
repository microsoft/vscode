/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
	entryPoints: ['media/editor/index.ts'],
	bundle: true,
	outfile: 'media/dist/editor.js',
	format: 'iife',
	platform: 'browser',
	target: 'es2020',
	sourcemap: true,
	minify: !watch,
	tsconfigRaw: '{}', // Ignore tsconfig to avoid ES2024 warning
});

if (watch) {
	await ctx.watch();
	console.log('Watching for changes...');
} else {
	await ctx.rebuild();
	await ctx.dispose();
	console.log('Build complete');
}

