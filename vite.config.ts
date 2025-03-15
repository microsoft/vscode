/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Plugin } from 'vite';

// use defineConfig({...})
export default {
	build: {
		outDir: './dist',
	},
	esbuild: {
		target: 'es2020',
		tsconfigRaw: {
			compilerOptions: {
				experimentalDecorators: true,
			},
		},
	},
	plugins: [createHotClassSupport()],
	server: {
		port: 3000,
		watch: {
			atomic: true
		},
	},
};

function createHotClassSupport(): Plugin {
	return {
		name: 'read-config',
		transform(code, id) {
			if (id.endsWith('.ts')) {
				if (code.includes('createHotClass')) {
					code = code + `\n
if (import.meta.hot) {
	import.meta.hot.accept();
}`;
				}
				return code;
			}
			return undefined;
		},
	};
}
