/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line no-restricted-imports
import * as path from 'path';
import { loadEnv } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';
import { defineConfig } from 'vitest/config';

const exclude = [
	/* repo specific: */ '**/.simulation/**', '**/.venv/**', '**/fixtures/**', 'chat-lib/**',
	/* default: */ '**/node_modules/**', '**/dist/**', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**', '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
];

// reference https://vitest.dev/config/#configuring-vitest
export default defineConfig(({ mode }) => ({
	test: {
		include: ['**/*.spec.ts', '**/*.spec.tsx'],
		exclude,
		env: loadEnv(mode, process.cwd(), ''),
		alias: {
			// similar to aliasing in the esbuild config `.esbuild.ts`
			// vitest requires aliases to be absolute paths. reference: https://vitejs.dev/config/shared-options#resolve-alias
			'vscode': path.resolve(__dirname, 'src/util/common/test/shims/vscodeTypesShim.ts'),
		}
	},
	server: {
		watch: {
			ignored: exclude,
		}
	},
	plugins: [
		wasm(),
		topLevelAwait()
	]
}));
