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
		globals: true
	}
}));