/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import { Page } from 'playwright';
import { TestContext } from './context';

/**
 * UI Test helper class to perform common UI actions and verifications.
 */
export class UITest {
	private _extensionsDir: string | undefined;
	private _workspaceDir: string | undefined;
	private _userDataDir: string | undefined;

	constructor(private readonly context: TestContext) {
	}

	/**
	 * The directory where extensions are installed.
	 */
	public get extensionsDir(): string {
		return this._extensionsDir ??= this.context.createTempDir();
	}

	/**
	 * The workspace directory used for testing.
	 */
	public get workspaceDir(): string {
		return this._workspaceDir ??= this.context.createTempDir();
	}

	/**
	 * The user data directory used for testing.
	 */
	public get userDataDir(): string {
		return this._userDataDir ??= this.context.createTempDir();
	}

	/**
	 * Run the UI test actions.
	 */
	public async run(page: Page) {
		await this.dismissWorkspaceTrustDialog(page);
		await this.createTextFile(page);
		await this.installExtension(page);
	}

	/**
	 * Validate the results of the UI test actions.
	 */
	public async validate() {
		this.verifyTextFileCreated();
		this.verifyExtensionInstalled();
	}

	/**
	 * Dismiss the workspace trust dialog.
	 */
	private async dismissWorkspaceTrustDialog(page: Page) {
		this.context.log('Dismissing workspace trust dialog');
		await page.getByText('Yes, I trust the authors').click();
		await page.waitForTimeout(500);
	}

	/**
	 * Create a new text file in the editor with some content and save it.
	 */
	private async createTextFile(page: Page) {
		this.context.log('Focusing Explorer view');
		await page.keyboard.press('Control+Shift+E');

		this.context.log('Clicking New File button');
		await page.getByLabel('New File...').click();

		this.context.log('Typing file name');
		await page.locator('input').fill('helloWorld.txt');
		await page.keyboard.press('Enter');

		this.context.log('Focusing the code editor');
		await page.getByText(/Start typing/).focus();

		this.context.log('Typing some content into the file');
		await page.keyboard.type('Hello, World!');

		this.context.log('Saving the file');
		await page.keyboard.press('Control+S');
		await page.waitForTimeout(1000);
	}

	/**
	 * Verify that the text file was created with the expected content.
	 */
	private verifyTextFileCreated() {
		this.context.log('Verifying file contents');
		const filePath = `${this.workspaceDir}/helloWorld.txt`;
		const fileContents = fs.readFileSync(filePath, 'utf-8');
		assert.strictEqual(fileContents, 'Hello, World!');
	}

	/**
	 * Install GitHub Pull Requests extension from the Extensions view.
	 */
	private async installExtension(page: Page) {
		this.context.log('Opening Extensions view');
		await page.keyboard.press('Control+Shift+X');
		await page.waitForSelector('.extension-list-item');

		this.context.log('Typing extension name to search for');
		await page.keyboard.type('GitHub Pull Requests');
		await page.waitForTimeout(2000);

		this.context.log('Clicking Install on the first extension in the list');
		await page.locator('.extension-action:not(.disabled)', { hasText: /Install/ }).first().click();

		this.context.log('Waiting for extension to be installed');
		await page.locator('.extension-action:not(.disabled)', { hasText: /Uninstall/ }).waitFor();
	}

	/**
	 * Verify that the GitHub Pull Requests extension is installed.
	 */
	private verifyExtensionInstalled() {
		this.context.log('Verifying extension is installed');
		const extensions = fs.readdirSync(this.extensionsDir);
		const hasExtension = extensions.some(ext => ext.startsWith('github.vscode-pull-request-github'));
		assert.strictEqual(hasExtension, true);
	}
}
