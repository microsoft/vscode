/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from '@playwright/test';
import config from './playwright.config';
import * as dotenv from 'dotenv';

// Define environment on the dev box in .env file:
//  .env:
//    PLAYWRIGHT_SERVICE_ACCESS_KEY=XXX
//    PLAYWRIGHT_SERVICE_URL=XXX

// Define environment in your GitHub workflow spec.
//  env:
//    PLAYWRIGHT_SERVICE_ACCESS_KEY: ${{ secrets.PLAYWRIGHT_SERVICE_ACCESS_KEY }}
//    PLAYWRIGHT_SERVICE_URL: ${{ secrets.PLAYWRIGHT_SERVICE_URL }}
//    PLAYWRIGHT_SERVICE_RUN_ID: ${{ github.run_id }}-${{ github.run_attempt }}-${{ github.sha }}

dotenv.config();

// Name the test run if it's not named yet.
process.env.PLAYWRIGHT_SERVICE_RUN_ID = process.env.PLAYWRIGHT_SERVICE_RUN_ID || new Date().toISOString();

// Can be 'linux' or 'windows'.
const os = process.env.PLAYWRIGHT_SERVICE_OS || 'linux';

export default defineConfig(config, {
	// Define more generous timeout for the service operation if necessary.
	// timeout: 60000,
	// expect: {
	//   timeout: 10000,
	// },
	workers: 20,

	// Enable screenshot testing and configure directory with expectations.
	// https://learn.microsoft.com/azure/playwright-testing/how-to-configure-visual-comparisons
	ignoreSnapshots: false,
	snapshotPathTemplate: `{testDir}/__screenshots__/{testFilePath}/${os}/{arg}{ext}`,

	use: {
		// Specify the service endpoint.
		connectOptions: {
			wsEndpoint: `${process.env.PLAYWRIGHT_SERVICE_URL}?cap=${JSON.stringify({
				// Can be 'linux' or 'windows'.
				os,
				runId: process.env.PLAYWRIGHT_SERVICE_RUN_ID
			})}`,
			timeout: 30000,
			headers: {
				'x-mpt-access-key': process.env.PLAYWRIGHT_SERVICE_ACCESS_TOKEN!
			},
			// Allow service to access the localhost.
			exposeNetwork: '<loopback>'
		}
	}
});
