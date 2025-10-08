/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

import { join } from 'path';
import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import del from 'rollup-plugin-delete';
import { urlToEsmPlugin } from '../rollup-url-to-module-plugin/index.mjs';

const root = join(import.meta.dirname, '../../../');
const outDir = join(import.meta.dirname, './out');

function changeExt(filePath, newExt) {
	const idx = filePath.lastIndexOf('.');
	if (idx === -1) {
		return filePath + newExt;
	} else {
		return filePath.substring(0, idx) + newExt;
	}
}

export default defineConfig({
	input: {
		//all: join(root, './src/vs/editor/editor.all.ts'),
		//api: join(root, './src/vs/editor/editor.v2.ts'),
		//main: join(root, './src/vs/editor/editor.main.ts'),
		entry: join(import.meta.dirname, './main.ts'),
	},
	moduleTypes: {
		//'.css': 'js',
	},
	output: {
		dir: outDir,
		format: 'es',
		/*entryFileNames: function (chunkInfo) {
			const moduleId = chunkInfo.facadeModuleId;
			if (moduleId) {
				const rootSrc = join(root, 'src/');
				if (moduleId.startsWith(rootSrc)) {
					return changeExt(moduleId.substring(rootSrc.length), '.js');
				}
			}
			return '[name].js';
		},*/
		preserveModules: false,

		/*
		cssChunkFileNames: function (chunkInfo) {
			const moduleId = chunkInfo.facadeModuleId;
			if (moduleId) {
				const rootSrc = join(root, 'src/');
				if (moduleId.startsWith(rootSrc)) {
					return changeExt(moduleId.substring(rootSrc.length), '.css');
				}
			}
			return '[name].css';
		},
		*/
	},



	plugins: [
		del({ targets: 'out/*' }),
		urlToEsmPlugin(),
		false ? undefined : dts({
			//oxc: true,
			compilerOptions: {
				stripInternal: true,
			}
		}),
	],
});
