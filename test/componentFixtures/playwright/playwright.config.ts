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
	timeout: 30_000,
	retries: 0,
	use: {
		trace: 'retain-on-failure',
	},
	webServer: {
		command: 'npx component-explorer serve -p ../component-explorer.json --background --attach -vv',
		cwd: __dirname,
		wait: {
			stdout: /current: http:\/\/localhost:(?<component_explorer_port>\d+)\/___explorer/,
		},
		timeout: 120_000,
	},
});
