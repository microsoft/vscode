/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Browser, Page } from 'playwright';
import { TestContext } from './context.js';

/**
 * Handles GitHub authentication flows in the browser.
 */
export class GitHubAuth {
	// private readonly username = process.env.GITHUB_ACCOUNT;
	// private readonly password = process.env.GITHUB_PASSWORD;

	public constructor(private readonly context: TestContext) { }

	/**
	 * Runs GitHub device authentication flow in a browser.
	 * @param browser Browser to use.
	 * @param code Device authentication code to use.
	 */
	public async runDeviceCodeFlow(browser: Browser, code: string) {
		this.context.log(`Running GitHub device flow with code ${code}`);
		const page = await browser.newPage();
		await page.goto('https://github.com/login/device');
	}

	/**
	 * Runs GitHub user authentication flow in the browser.
	 * @param page Authentication page.
	 */
	public async runUserWebFlow(page: Page) {
		this.context.log(`Running GitHub browser flow at ${page.url()}`);
	}
}
