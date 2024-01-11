/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig, devices } from '@playwright/test';
import { join } from 'path';

const CI = !!process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || !!process.env.CI;

export default defineConfig({
	testDir: './out/src/tests',
	fullyParallel: true, 			// Run tests in files in parallel
	forbidOnly: CI, 				// Fail the build on CI if you accidentally left test.only in the source code.
	retries: CI ? 2 : 0, 			// Retry on CI only
	workers: CI ? 1 : undefined, 	// Opt out of parallel tests on CI.
	reporter: 'html', 				// Reporter to use. See https://playwright.dev/docs/test-reporters
	webServer: {
		command: join(__dirname, `..`, `..`, `scripts`, `code-server.${process.platform === 'win32' ? 'bat' : 'sh'} --without-connection-token`),
		url: 'http://localhost:9888'
	},
	use: {
		baseURL: 'http://localhost:9888', 	// Base URL to use in actions like `await page.goto('/')`.
		trace: 'on-first-retry', 			//  Collect trace when retrying the failed test
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] },
		},
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] },
		},
		{
			name: 'Microsoft Edge',
			use: { ...devices['Desktop Edge'], channel: 'msedge' },
		}
	]
});

