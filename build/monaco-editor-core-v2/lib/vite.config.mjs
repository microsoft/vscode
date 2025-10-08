/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

import { join } from 'path';
import { defineConfig } from 'vite';
import { dts } from 'rolldown-plugin-dts';

const root = join(import.meta.dirname, '../../../');

export default defineConfig({
	build: {
		lib: {
			entry: join(import.meta.dirname, './main.ts'),
			formats: ['es'],
			fileName: 'main',
		},
		outDir: join(import.meta.dirname, './out'),
		emptyOutDir: true,
		rollupOptions: {
			output: {
				preserveModules: true,
				preserveModulesRoot: join(root, 'src'),
				chunkFileNames: '[name].js',
				entryFileNames: '[name].js',
			},
			plugins: [
				undefined && dts({
					rollupTypes: true,
					compilerOptions: {
						stripInternal: true,
					},
				}),
			]
		},
		sourcemap: true,
		minify: false,
	},
	plugins: [
	],
	resolve: {
		extensions: ['.ts', '.js', '.json'],
	},
});

