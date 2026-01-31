/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { _electron } from 'playwright';
import { TestContext } from './context.js';
import { UITest } from './uiTest.js';

export function setup(context: TestContext) {
	context.test('wsl-server-arm64', ['windows', 'arm64', 'wsl'], async () => {
		const dir = await context.downloadAndUnpack('server-linux-arm64');
		const entryPoint = context.getServerEntryPoint(dir, true);
		await testServer(entryPoint);
	});

	context.test('wsl-server-x64', ['windows', 'x64', 'wsl'], async () => {
		const dir = await context.downloadAndUnpack('server-linux-x64');
		const entryPoint = context.getServerEntryPoint(dir, true);
		await testServer(entryPoint);
	});

	context.test('wsl-server-web-arm64', ['windows', 'arm64', 'wsl', 'browser'], async () => {
		const dir = await context.downloadAndUnpack('server-linux-arm64-web');
		const entryPoint = context.getServerEntryPoint(dir, true);
		await testServerWeb(entryPoint);
	});

	context.test('wsl-server-web-x64', ['windows', 'x64', 'wsl', 'browser'], async () => {
		const dir = await context.downloadAndUnpack('server-linux-x64-web');
		const entryPoint = context.getServerEntryPoint(dir, true);
		await testServerWeb(entryPoint);
	});

	context.test('wsl-desktop-arm64', ['windows', 'arm64', 'wsl', 'desktop'], async () => {
		const dir = await context.downloadAndUnpack('win32-arm64-archive');
		context.validateAllAuthenticodeSignatures(dir);
		if (!context.options.downloadOnly) {
			const entryPoint = context.getDesktopEntryPoint(dir);
			const dataDir = context.createPortableDataDir(dir);
			await testDesktopApp(entryPoint, dataDir);
		}
	});

	context.test('wsl-desktop-x64', ['windows', 'x64', 'wsl', 'desktop'], async () => {
		const dir = await context.downloadAndUnpack('win32-x64-archive');
		context.validateAllAuthenticodeSignatures(dir);
		if (!context.options.downloadOnly) {
			const entryPoint = context.getDesktopEntryPoint(dir);
			const dataDir = context.createPortableDataDir(dir);
			await testDesktopApp(entryPoint, dataDir);
		}
	});

	async function testServer(entryPoint: string) {
		if (context.options.downloadOnly) {
			return;
		}

		await context.runCliApp('WSL Server', 'wsl',
			[
				context.toWslPath(entryPoint),
				'--accept-server-license-terms',
				'--connection-token', context.getRandomToken(),
				'--host', '0.0.0.0',
				'--port', context.getUniquePort(),
				'--server-data-dir', context.createWslTempDir(),
				'--extensions-dir', context.createWslTempDir(),
			],
			async (line) => {
				const port = /Extension host agent listening on (\d+)/.exec(line)?.[1];
				if (!port) {
					return;
				}

				const url = new URL('version', context.getWebServerUrl(port)).toString();

				context.log(`Fetching version from ${url}`);
				const response = await context.fetchNoErrors(url);
				const version = await response.text();
				assert.strictEqual(version, context.options.commit, `Expected commit ${context.options.commit} but got ${version}`);

				return true;
			}
		);
	}

	async function testServerWeb(entryPoint: string) {
		if (context.options.downloadOnly) {
			return;
		}

		const wslWorkspaceDir = context.createWslTempDir();
		const wslExtensionsDir = context.createWslTempDir();
		const token = context.getRandomToken();
		const test = new WslUITest(context, undefined, wslWorkspaceDir, wslExtensionsDir);

		await context.runCliApp('WSL Server', 'wsl',
			[
				context.toWslPath(entryPoint),
				'--accept-server-license-terms',
				'--connection-token', token,
				'--host', '0.0.0.0',
				'--port', context.getUniquePort(),
				'--server-data-dir', context.createWslTempDir(),
				'--extensions-dir', wslExtensionsDir,
				'--user-data-dir', context.createWslTempDir(),
			],
			async (line) => {
				const port = /Extension host agent listening on (\d+)/.exec(line)?.[1];
				if (!port) {
					return false;
				}

				const url = context.getWebServerUrl(port, token, wslWorkspaceDir).toString();
				const browser = await context.launchBrowser();
				const page = await context.getPage(browser.newPage());

				context.log(`Navigating to ${url}`);
				await page.goto(url, { waitUntil: 'networkidle' });

				context.log('Waiting for the workbench to load');
				await page.waitForSelector('.monaco-workbench');

				await test.run(page);

				context.log('Closing browser');
				await browser.close();

				test.validate();
				return true;
			}
		);
	}

	async function testDesktopApp(entryPoint: string, dataDir: string) {
		const wslExtensionsDir = context.getWslServerExtensionsDir();
		context.deleteWslDir(wslExtensionsDir);

		const wslWorkspaceDir = context.createWslTempDir();
		const wslDistro = context.getDefaultWslDistro();
		const test = new WslUITest(context, dataDir, wslWorkspaceDir, wslExtensionsDir);

		const args = [
			'--extensions-dir', context.createTempDir(),
			'--user-data-dir', test.userDataDir,
			'--folder-uri', `vscode-remote://wsl+${wslDistro}${wslWorkspaceDir}`,
		];

		context.log(`Starting VS Code ${entryPoint} with args ${args.join(' ')}`);
		const app = await _electron.launch({ executablePath: entryPoint, args });
		const window = await context.getPage(app.firstWindow());

		context.log('Installing WSL extension');
		await window.getByRole('button', { name: 'Install and Reload' }).click();

		context.log('Waiting for WSL connection');
		await window.getByText(/WSL/).waitFor();

		await test.run(window);

		context.log('Closing the application');
		await app.close();

		test.validate();
	}
}

/**
 * UI Test subclass for WSL that validates files in WSL filesystem.
 */
class WslUITest extends UITest {
	constructor(
		context: TestContext,
		dataDir: string | undefined,
		private readonly wslWorkspaceDir: string,
		private readonly wslExtensionsDir: string
	) {
		super(context, dataDir);
	}

	protected override verifyTextFileCreated() {
		this.context.log('Verifying file contents in WSL');
		const result = this.context.runNoErrors('wsl', 'cat', `${this.wslWorkspaceDir}/helloWorld.txt`);
		assert.strictEqual(result.stdout.trim(), 'Hello, World!', 'File contents in WSL do not match expected value');
	}

	protected override verifyExtensionInstalled() {
		this.context.log(`Verifying extension is installed in WSL at ${this.wslExtensionsDir}`);
		const result = this.context.runNoErrors('wsl', 'ls', this.wslExtensionsDir);
		const hasExtension = result.stdout.split('\n').some(ext => ext.startsWith('github.vscode-pull-request-github'));
		assert.strictEqual(hasExtension, true, 'GitHub Pull Requests extension is not installed in WSL');
	}
}
