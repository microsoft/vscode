/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from 'vite';
import { join } from 'path';
/// @ts-ignore
import { urlToEsmPlugin } from './rollup-url-to-module-plugin/index.mjs';

export default defineConfig({
	plugins: [
		urlToEsmPlugin()
	],
	esbuild: {
		target: 'es6', // to fix property initialization issues, not needed when loading monaco-editor from npm package
	},

	server: {
		cors: true,
		port: 5199,
		origin: 'http://localhost:5199',
		fs: {
			allow: [
				// To allow loading from sources, not needed when loading monaco-editor from npm package
				/// @ts-ignore
				join(import.meta.dirname, '../../../')
			]
		}
	}
});
