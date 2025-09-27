/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from 'vite';
import { join } from 'path';
import { urlToEsmPlugin } from '../rollup-url-to-module-plugin/index.mjs';

export default defineConfig({
	plugins: [
		urlToEsmPlugin()
	],
	esbuild: {
		target: 'es6', // to fix property initialization issues, not needed when loading monaco-editor from npm package
	},
	server: {
		fs: {
			allow: [
				// To allow loading from sources, not needed when loading monaco-editor from npm package
				join(import.meta.dirname, '../../../')
			]
		}
	}
});
