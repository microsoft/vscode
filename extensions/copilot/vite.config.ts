/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { loadEnv } from 'vite';
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
		// Vitest defaults (5s test / 10s hook) are below the scheduling noise floor of loaded CI
		// agents, where even trivial synchronous tests have been observed taking >5s and failing
		// with `Test timed out in 5000ms`. Keep these generous enough to absorb that jitter while
		// still catching genuinely hung tests.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		alias: {
			// similar to aliasing in the esbuild config `.esbuild.mts`
			// vitest requires aliases to be absolute paths. reference: https://vitejs.dev/config/shared-options#resolve-alias
			'vscode': path.resolve(__dirname, 'src/util/common/test/shims/vscodeTypesShim.ts'),
		}
	},
	server: {
		watch: {
			ignored: exclude,
		}
	},
	oxc: {
		jsx: {
			development: false,
		}
	},
	plugins: [
		wasm()
	]
}));
