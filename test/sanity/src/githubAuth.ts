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
	 * Runs GitHub device authentication flow in a browser.
	 * @param page Page to use.
	 * @param code Device authentication code to use.
	 */
	public async runDeviceCodeFlow(page: Page, code: string) {
		if (!this.username || !this.password) {
			this.context.error('GITHUB_ACCOUNT and GITHUB_PASSWORD environment variables must be set');
		}

		this.context.log(`Running GitHub device flow with code ${code}`);
		await page.goto('https://github.com/login/device');

		this.context.log('Filling in GitHub credentials');
		await page.getByLabel('Username or email address').fill(this.username);
		await page.getByLabel('Password').fill(this.password);
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();

		this.context.log('Confirming device activation');
		await page.getByRole('button', { name: 'Continue' }).click();

		this.context.log('Entering device code');
		const codeChars = code.replace(/-/g, '');
		for (let i = 0; i < codeChars.length; i++) {
			await page.getByRole('textbox').nth(i).fill(codeChars[i]);
		}
		await page.getByRole('button', { name: 'Continue' }).click();

		this.context.log('Authorizing device');
		await page.getByRole('button', { name: 'Authorize' }).click();
	}

	/**
	 * Handles the GitHub "Authorize" popup dialog.
	 * @param page Page to use.
	 */
	public async runAuthorizeFlow(page: Page) {
		this.context.log(`Authorizing app at ${page.url()}`);
		await page.getByRole('button', { name: 'Continue' }).click();
	}
}
