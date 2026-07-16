/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Page } from 'playwright';
import { TestContext } from './context.js';

/**
 * Handles GitHub authentication flows in the browser.
 */
export class GitHubAuth {
	private readonly username = process.env.GITHUB_ACCOUNT;
	private readonly password = process.env.GITHUB_PASSWORD;

	public constructor(private readonly context: TestContext) { }

	/**
	 * Runs GitHub device authentication flow in a browser, signing in first.
	 * @param page Page to use.
	 * @param code Device authentication code to use.
	 */
	public async runDeviceCodeFlow(page: Page, code: string) {
		if (!this.username || !this.password) {
			this.context.error('GITHUB_ACCOUNT and GITHUB_PASSWORD environment variables must be set');
		}

		try {
			this.context.log(`Running GitHub device flow with code ${code}`);
			await page.goto('https://github.com/login/device');

			this.context.log('Signing in to GitHub');
			await page.getByLabel('Username or email address').fill(this.username);
			await page.getByLabel('Password').fill(this.password);
			await page.getByRole('button', { name: 'Sign in', exact: true }).click();

			this.context.log('Confirming signed-in account');
			await page.getByRole('button', { name: 'Continue' }).click();

			this.context.log('Entering device code');
			const codeChars = code.replace(/-/g, '');
			for (let i = 0; i < codeChars.length; i++) {
				await page.getByRole('textbox').nth(i).fill(codeChars[i]);
			}
			await page.getByRole('button', { name: 'Continue' }).click();

			this.context.log('Authorizing device');
			await page.getByRole('button', { name: 'Authorize' }).click();
		} catch (error) {
			this.context.log('Error during device code flow, capturing screenshot');
			await this.context.captureScreenshot(page);
			throw error;
		}
	}

	/**
	 * Handles the GitHub "Authorize" popup dialog.
	 * @param page Page to use.
	 */
	public async runAuthorizeFlow(page: Page) {
		try {
			this.context.log(`Authorizing app at ${page.url()}`);
			await page.getByRole('button', { name: 'Continue' }).click();
		} catch (error) {
			this.context.log('Error during authorization, capturing screenshot');
			await this.context.captureScreenshot(page);
			throw error;
		}
	}
}
