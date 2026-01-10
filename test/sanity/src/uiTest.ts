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
	public validate() {
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
	 * Run a command from the command palette.
	 */
	private async runCommand(page: Page, command: string) {
		this.context.log(`Running command: ${command}`);
		await page.keyboard.press('F1');
		await page.getByPlaceholder(/^Type the name of a command/).fill(`>${command}`);
		await page.locator('span.monaco-highlighted-label', { hasText: new RegExp(`^${command}$`) }).click();
	}

	/**
	 * Create a new text file in the editor with some content and save it.
	 */
	private async createTextFile(page: Page) {
		await this.runCommand(page, 'View: Show Explorer');

		this.context.log('Clicking New File button');
		await page.getByLabel('New File...').click();

		this.context.log('Typing file name');
		await page.getByRole('textbox', { name: /^Type file name/ }).fill('helloWorld.txt');
		await page.keyboard.press('Enter');

		this.context.log('Focusing the code editor');
		await page.getByText(/Start typing/).focus();

		this.context.log('Typing some content into the file');
		await page.keyboard.type('Hello, World!');

		await this.runCommand(page, 'File: Save');
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
		await this.runCommand(page, 'View: Show Extensions');

		this.context.log('Typing extension name to search for');
		await page.getByText('Search Extensions in Marketplace').focus();
		await page.keyboard.type('GitHub Pull Requests');

		this.context.log('Clicking Install on the first extension in the list');
		await page.locator('.extension-list-item').getByText(/^GitHub Pull Requests$/).waitFor();
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
