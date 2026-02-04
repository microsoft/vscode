/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Browser } from 'playwright';
import { TestContext } from './context.js';
import { GitHubAuth } from './githubAuth.js';
import { UITest } from './uiTest.js';

export function setup(context: TestContext) {
	context.test('cli-alpine-arm64', ['alpine', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('cli-alpine-arm64');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-alpine-x64', ['alpine', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('cli-alpine-x64');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-darwin-arm64', ['darwin', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('cli-darwin-arm64');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-darwin-x64', ['darwin', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('cli-darwin-x64');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-linux-arm64', ['linux', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('cli-linux-arm64');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-linux-armhf', ['linux', 'arm32'], async () => {
		const dir = await context.downloadAndUnpack('cli-linux-armhf');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-linux-x64', ['linux', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('cli-linux-x64');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-win32-arm64', ['windows', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('cli-win32-arm64');
		context.validateAllAuthenticodeSignatures(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-win32-x64', ['windows', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('cli-win32-x64');
		context.validateAllAuthenticodeSignatures(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	async function testCliApp(entryPoint: string) {
		if (context.options.downloadOnly) {
			return;
		}

		const result = context.runNoErrors(entryPoint, '--version');
		const version = result.stdout.trim().match(/\(commit ([a-f0-9]+)\)/)?.[1];
		assert.strictEqual(version, context.options.commit, `Expected commit ${context.options.commit} but got ${version}`);

		if (!context.capabilities.has('github-account')) {
			return;
		}

		const cliDataDir = context.createTempDir();
		const test = new UITest(context);
		const auth = new GitHubAuth(context);
		let browser: Browser | undefined;

		context.log('Logging out of Dev Tunnel to ensure fresh authentication');
		context.run(entryPoint, '--cli-data-dir', cliDataDir, 'tunnel', 'user', 'logout');

		context.log('Starting Dev Tunnel to local server using CLI');
		await context.runCliApp('CLI', entryPoint,
			[
				'--cli-data-dir', cliDataDir,
				'tunnel',
				'--accept-server-license-terms',
				'--server-data-dir', context.createTempDir(),
				'--extensions-dir', test.extensionsDir,
				'--verbose'
			],
			async (line) => {
				const deviceCode = /To grant access .* use code ([A-Z0-9-]+)/.exec(line)?.[1];
				if (deviceCode) {
					context.log(`Device code detected: ${deviceCode}, starting device flow authentication`);
					browser = await context.launchBrowser();
					await auth.runDeviceCodeFlow(browser, deviceCode);
					return;
				}

				const tunnelUrl = /Open this link in your browser (https?:\/\/[^\s]+)/.exec(line)?.[1];
				if (tunnelUrl) {
					const tunnelId = new URL(tunnelUrl).pathname.split('/').pop()!;
					const url = context.getTunnelUrl(tunnelUrl, test.workspaceDir);
					context.log(`CLI started successfully with tunnel URL: ${url}`);

					if (!browser) {
						throw new Error('Browser instance is not available');
					}

					context.log(`Navigating to ${url}`);
					const page = await context.getPage(browser.newPage());
					await page.goto(url);

					context.log('Waiting for the workbench to load');
					await page.waitForSelector('.monaco-workbench');

					context.log('Selecting GitHub Account');
					await page.locator('span.monaco-highlighted-label', { hasText: 'GitHub' }).click();

					context.log('Clicking Allow on confirmation dialog');
					await page.getByRole('button', { name: 'Allow' }).click();

					await auth.runUserWebFlow(page);

					context.log('Waiting for connection to be established');
					await page.getByRole('button', { name: `remote ${tunnelId}` }).waitFor({ timeout: 5 * 60 * 1000 });

					await test.run(page);

					context.log('Closing browser');
					await browser.close();

					test.validate();
					return true;
				}
			}
		);
	}
}
