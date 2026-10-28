/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { ConsoleMessage, Page, Request, Response } from 'playwright';
import { TestContext } from './context.js';

/**
 * UI Test helper class to perform common UI actions and verifications.
 */
export class UITest {
	private _extensionsDir: string | undefined;
	private _workspaceDir: string | undefined;
	private _userDataDir: string | undefined;

	constructor(
		protected readonly context: TestContext,
		dataDir?: string
	) {
		if (dataDir) {
			this._extensionsDir = path.join(dataDir, 'extensions');
			this._userDataDir = path.join(dataDir, 'user-data');
		}
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
		try {
			await this.dismissWelcomeDialog(page);
			await this.createTextFile(page);
			await this.searchInWorkspace(page);
			await this.openMarkdownPreview(page);
			await this.installExtension(page);
		} catch (error) {
			await this.context.captureScreenshot(page);
			throw error;
		}
	}

	/**
	 * Copies the app's logs next to the screenshots. The reason for a product-side failure (such as
	 * an extension that fails to install) is only in those logs, in a user data dir that the test
	 * deletes afterwards. Call it after the app has closed, so its logs are complete.
	 */
	public captureAppLogs() {
		this.context.captureLogs(path.join(this.userDataDir, 'logs'));
	}

	/**
	 * Validate the results of the UI test actions.
	 */
	public validate() {
		this.verifyTextFileCreated();
		this.verifyExtensionInstalled();
	}

	/**
	 * Dismiss the welcome sign-in dialog if it is shown.
	 */
	public async dismissWelcomeDialog(page: Page) {
		this.context.log('Dismissing welcome dialog (if shown)');
		const closeButton = page.locator('button.onboarding-a-close-btn');
		try {
			await closeButton.waitFor({ state: 'visible', timeout: 8_000 });
		} catch {
			this.context.log('Welcome dialog not shown, continuing');
			return;
		}
		await closeButton.click();
		await closeButton.waitFor({ state: 'hidden' });
	}

	/**
	 * Run a command from the command palette.
	 */
	private async runCommand(page: Page, command: string) {
		this.context.log(`Running command: ${command}`);
		await page.keyboard.press('F1');
		const input = page.getByPlaceholder(/^Type the name of a command/);
		await input.fill(`>${command}`);
		const item = page.locator('span.monaco-highlighted-label', { hasText: new RegExp(`^${command}$`) });
		await item.click();
		await input.waitFor({ state: 'hidden' });
	}

	/**
	 * Create a new text file in the editor with some content and save it.
	 */
	private async createTextFile(page: Page) {
		await this.createFile(page, 'helloWorld.txt', 'Hello, World!');
	}

	/**
	 * Create a new file in the workspace root from the Explorer, type its content and save it.
	 */
	private async createFile(page: Page, fileName: string, content: string) {
		await this.runCommand(page, 'View: Show Explorer');

		this.context.log('Clicking New File button');
		await page.getByLabel('New File...').click();

		this.context.log(`Typing file name ${fileName}`);
		await page.getByRole('textbox', { name: /^Type file name/ }).fill(fileName);
		await page.keyboard.press('Enter');

		this.context.log('Focusing the code editor');
		await page.getByText(/Start typing/).focus();

		this.context.log('Typing some content into the file');
		await page.keyboard.type(content, { delay: 100 });

		await this.runCommand(page, 'File: Save');
	}

	/**
	 * Open a Markdown preview and verify that its webview rendered. The preview content is
	 * rendered by scripts loaded as webview resources, so this catches webview resource
	 * loading regressions, such as remote authorities with uppercase letters (wsl+Ubuntu)
	 * being rejected with 401 (#341396).
	 */
	private async openMarkdownPreview(page: Page) {
		const failedResources: string[] = [];
		const diagnostics: string[] = [];
		const onResponse = (response: Response) => {
			if (response.status() >= 400 && response.url().includes('.vscode-resource.')) {
				this.context.log(`Webview resource failed with ${response.status()}: ${response.url()}`);
				failedResources.push(`${response.status()} ${response.url()}`);
			}
		};
		const onRequestFailed = (request: Request) => {
			if (/\.vscode-resource\.|vscode-cdn\.net/.test(request.url())) {
				const message = `Webview request failed with ${request.failure()?.errorText}: ${request.url()}`;
				this.context.log(message);
				diagnostics.push(message);
			}
		};
		const onConsole = (message: ConsoleMessage) => {
			if (message.type() === 'error') {
				diagnostics.push(`Console error: ${message.text()}`);
			}
		};

		page.on('response', onResponse);
		page.on('requestfailed', onRequestFailed);
		page.on('console', onConsole);
		try {
			await this.createFile(page, 'preview.md', '# Webview Sanity');
			await this.runCommand(page, 'Markdown: Open Preview');

			this.context.log('Waiting for the Markdown preview to render');
			const preview = page
				.frameLocator('iframe.webview.ready[src*="extensionId=vscode.markdown-language-features"]')
				.frameLocator('#active-frame');
			try {
				await preview.getByRole('heading', { name: 'Webview Sanity' }).waitFor({ timeout: 60_000 });

				// The heading can appear before asynchronous preview scripts finish loading.
				const previewElement = await preview.owner().elementHandle();
				assert.ok(previewElement, 'Markdown preview frame is missing');
				try {
					const frame = await previewElement.contentFrame();
					assert.ok(frame, 'Markdown preview frame is detached');
					await frame.waitForLoadState('load', { timeout: 60_000 });
				} finally {
					await previewElement.dispose();
				}
			} catch (error) {
				// Some browsers, such as Chromium on Debian 12, refuse to register the webview service worker,
				// so no webview can load there at all. That is a property of the browser, not a resource loading failure.
				if (failedResources.length === 0 && diagnostics.some(message => message.includes('NotSupportedError: Failed to register a ServiceWorker'))) {
					this.context.warn('Skipping the Markdown preview check: this browser does not allow webviews to register their service worker');
					await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
					return;
				}

				throw new Error([
					'Markdown preview did not render.',
					`Failed webview resources: ${failedResources.join(', ') || 'none observed'}`,
					...diagnostics.slice(0, 20),
				].join('\n'), { cause: error });
			}

			// Keyboard focus is now inside the preview webview; return it to the workbench before later steps press F1.
			this.context.log('Returning focus to the workbench');
			await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		} finally {
			page.off('response', onResponse);
			page.off('requestfailed', onRequestFailed);
			page.off('console', onConsole);
		}

		assert.deepStrictEqual(failedResources, [], 'Markdown preview failed to load some webview resources');
	}

	/**
	 * Verify that the text file was created with the expected content.
	 */
	protected verifyTextFileCreated() {
		this.context.log('Verifying file contents');
		const filePath = `${this.workspaceDir}/helloWorld.txt`;
		const fileContents = fs.readFileSync(filePath, 'utf-8');
		assert.strictEqual(fileContents, 'Hello, World!', 'File contents do not match expected value');
	}

	/**
	 * Run a workspace search (Search: Find in Files) and verify ripgrep returns
	 * the expected match from the file created in {@link createTextFile}.
	 */
	private async searchInWorkspace(page: Page) {
		await this.runCommand(page, 'Search: Find in Files');

		this.context.log('Typing search query');
		const searchInput = page.locator('.search-view .search-widget .search-container textarea').first();
		await searchInput.waitFor({ state: 'visible' });
		await searchInput.fill('Hello, World!');
		await page.keyboard.press('Enter');

		this.context.log('Waiting for search result text');
		const resultMessage = page.locator('.search-view .messages .message').first();
		await resultMessage.waitFor({ state: 'visible' });
		await page.waitForFunction(() => {
			const el = document.querySelector('.search-view .messages .message');
			return el && /\d+\s+result/.test(el.textContent ?? '');
		}, undefined, { timeout: 30_000 });

		const resultText = (await resultMessage.innerText()).trim();
		this.context.log(`Search result text: ${resultText}`);

		await this.context.captureScreenshot(page);

		assert.match(
			resultText,
			/1 result in 1 file/,
			`Expected exactly 1 search result for "Hello, World!", but got: ${resultText}`,
		);
	}

	/**
	 * Install GitHub Pull Requests extension from the Extensions view.
	 */
	private async installExtension(page: Page) {
		await this.runCommand(page, 'View: Show Extensions');

		this.context.log('Typing extension name to search for');
		await page.getByText('Search Extensions in Marketplace').focus();
		await page.keyboard.type('GitHub Pull Requests', { delay: 50 });

		this.context.log('Waiting for extension to appear in search results');
		const extensionListItem = page.locator('.extension-list-item').filter({ has: page.getByText(/^GitHub Pull Requests$/) }).first();
		const extensionItem = extensionListItem.getByText(/^GitHub Pull Requests$/);
		const messageContainer = page.locator('.extensions-viewlet .message-container:not(.hidden)').first();

		for (let attempt = 0; attempt < 5; attempt++) {
			const result = await Promise.race([
				extensionItem.waitFor().then(() => 'found' as const),
				messageContainer.waitFor().then(() => 'message' as const),
			]);

			if (result === 'found') {
				break;
			}

			const message = await messageContainer.locator('.message').innerText();
			this.context.log(`Marketplace message: ${message} (attempt ${attempt + 1}/5), clicking Refresh`);
			await page.getByRole('button', { name: 'Refresh' }).click();
			await page.waitForTimeout(5_000);
		}

		await extensionItem.waitFor();

		// Leave time for cleanup before Mocha's 10-minute timeout, which does not cancel async work.
		let lastFailure: string | undefined;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				this.context.log(`Clicking Install for GitHub Pull Requests (attempt ${attempt + 1}/3)`);
				const installButton = extensionListItem.locator('.extension-action.install:not(.disabled):not(.hide)').first();
				await installButton.click({ timeout: 30_000 });
				await installButton.waitFor({ state: 'hidden', timeout: 30_000 });

				this.context.log('Waiting for extension to be installed');
				const uninstallButton = page.getByRole('button', { name: 'Uninstall' }).first();
				const result = await Promise.race([
					uninstallButton.waitFor({ timeout: 60_000 }).then(() => 'installed' as const),
					installButton.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'retry' as const),
					messageContainer.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'message' as const),
				]);
				if (result === 'installed') {
					return;
				}
				lastFailure = result === 'retry'
					? 'Install button became available again before installation completed'
					: 'Marketplace error appeared before installation completed';
			} catch (error) {
				lastFailure = error instanceof Error ? error.message : String(error);
			}

			this.context.log(`Extension install attempt ${attempt + 1}/3 failed: ${lastFailure}`);

			const messageVisible = await messageContainer.isVisible().catch(() => false);
			if (messageVisible) {
				const message = await messageContainer.locator('.message').innerText().catch(() => '<unavailable>');
				this.context.log(`Marketplace message visible during failed install: ${message}`);
			}

			await this.context.captureScreenshot(page);

			if (attempt < 2) {
				this.context.log('Waiting 5s before retrying install');
				await page.waitForTimeout(5_000);
			}
		}

		throw new Error(`Failed to install extension after 3 attempts; last failure: ${lastFailure ?? '<none captured>'}`);
	}

	/**
	 * Verify that the GitHub Pull Requests extension is installed.
	 */
	protected verifyExtensionInstalled() {
		this.context.log('Verifying extension is installed');
		const extensions = fs.readdirSync(this.extensionsDir);
		const hasExtension = extensions.some(ext => ext.startsWith('github.vscode-pull-request-github'));
		assert.strictEqual(hasExtension, true, 'GitHub Pull Requests extension is not installed');
	}
}
