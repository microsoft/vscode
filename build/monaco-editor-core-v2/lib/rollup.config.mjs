/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

import { join, relative } from 'path';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import { urlToEsmPlugin } from '../rollup-url-to-module-plugin/index.mjs';
import del from 'rollup-plugin-delete';
import keepCssImports from 'rollup-plugin-keep-css-imports';

const root = join(import.meta.dirname, '../../../');
const outDir = join(import.meta.dirname, './out');

export default defineConfig({
	input: {
		/*all: join(root, './src/vs/editor/editor.all.ts'),
		api: join(root, './src/vs/editor/editor.api.ts'),
		main: join(root, './src/vs/editor/editor.main.ts'),*/
		entry: join(import.meta.dirname, './main.ts'),
	},
	output: {
		dir: outDir,
		format: 'es',
		/*chunkFileNames: function (chunkInfo) {
			if (chunkInfo.facadeModuleId) {
				return '[name].js';
			}
			return 'chunk.js';
		},*/
		preserveModules: true,
	},

	plugins: [
		del({ targets: 'out/*' }),

		undefined && urlToEsmPlugin(),
		esbuild(),
		keepCssImports({
			outputPath: (assetId) => {
				// Generate a custom output path based on the input assetId

				// Make the assetId path relative to the root directory
				const relativePath = join(outDir, relative(root, assetId));

				// Add a '.min' suffix before the file extension,
				// extension will be replaced with `outputExt` by the plugin
				return relativePath.replace(/(\.s[ca]ss)$/, ".min$1")
			},
		})
	],
});
