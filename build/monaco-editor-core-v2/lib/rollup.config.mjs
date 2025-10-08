/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

import { join } from 'path';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import { urlToEsmPlugin } from '../rollup-url-to-module-plugin/index.mjs';
import postcss from 'rollup-plugin-postcss';
import copyAssets from 'postcss-copy-assets';

const root = join(import.meta.dirname, '../../../');

export default defineConfig({
	input: {
		all: join(root, './src/vs/editor/editor.all.ts'),
		api: join(root, './src/vs/editor/editor.api.ts'),
		main: join(root, './src/vs/editor/editor.main.ts'),
	},
	output: {
		dir: join(import.meta.dirname, './out'),
		format: 'es',
		chunkFileNames: function (chunkInfo) {
			if (chunkInfo.facadeModuleId) {
				return '[name].js';
			}
			return 'chunk.js';
		},
		preserveModules: true,
	},

	plugins: [
		urlToEsmPlugin(),
		esbuild(),
		postcss({
			extract: true,
			to: join(import.meta.dirname, './out/monaco-editor-core.css'),
			plugins: [
				copyAssets({
					base: join(import.meta.dirname, './out'),
				})
			]
		}),

		/*libStylePlugin({
			scopedName: '[local]',
			customCSSPath: id => id,
		})*/
	],
});
