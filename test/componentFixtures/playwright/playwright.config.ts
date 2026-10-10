/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from '@playwright/test';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	timeout: 30_000,
	// To avoid possible flaky (unstable) tests in the CI environment, try again 2 times, local 0
	retries: process.env.CI ? 2 : 0,
	// Limit the number of workers for resource optimization in a CI environment
	workers: process.env.CI ? 1 : undefined,
	use: {
		// DOM trace snapshots can exhaust the headless fixture's native-time render deadline.
		trace: { mode: 'retain-on-failure', snapshots: false },
	},
	// Use the 'dot' report for clean logs in a CI environment, and the 'html' report for local development.
	reporter: process.env.CI ? 'dot' : 'html',
	webServer: {
		command: 'npx component-explorer serve -p ../component-explorer.json --background --attach -vv',
		cwd: __dirname,
		wait: {
			stdout: /current: http:\/\/localhost:(?<component_explorer_port>\d+)\/___explorer/,
		},
		timeout: 120_000,
	},
});
