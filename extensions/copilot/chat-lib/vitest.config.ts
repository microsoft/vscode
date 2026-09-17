/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
	test: {
		include: ['**/*.spec.ts', '**/*.spec.tsx'],
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'**/.{idea,git,cache,output,temp}/**'
		],
		env: loadEnv(mode, process.cwd(), ''),
		environment: 'node',
		globals: true,
		// Vitest defaults (5s test / 10s hook) are below the scheduling noise floor of loaded CI
		// agents, where even trivial synchronous tests have been observed taking >5s and failing
		// with `Test timed out in 5000ms`. Keep these generous enough to absorb that jitter while
		// still catching genuinely hung tests.
		testTimeout: 30_000,
		hookTimeout: 30_000
	}
}));