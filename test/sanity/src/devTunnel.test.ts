/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Browser, Page } from 'playwright';
import { TestContext } from './context.js';
import { GitHubAuth } from './githubAuth.js';
import { UITest } from './uiTest.js';

export function setup(context: TestContext) {
	context.test('dev-tunnel-alpine-arm64', ['alpine', 'arm64', 'browser', 'github-account'], async () => {
		const dir = await context.downloadAndUnpack('cli-alpine-arm64');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('dev-tunnel-alpine-x64', ['alpine', 'x64', 'browser', 'github-account'], async () => {
		const dir = await context.downloadAndUnpack('cli-alpine-x64');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('dev-tunnel-darwin-arm64', ['darwin', 'arm64', 'browser', 'github-account'], async () => {
		const dir = await context.downloadAndUnpack('cli-darwin-arm64');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('dev-tunnel-darwin-x64', ['darwin', 'x64', 'browser', 'github-account'], async () => {
		const dir = await context.downloadAndUnpack('cli-darwin-x64');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('dev-tunnel-linux-arm64', ['linux', 'arm64', 'browser', 'github-account'], async () => {
		const dir = await context.downloadAndUnpack('cli-linux-arm64');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('dev-tunnel-linux-armhf', ['linux', 'arm32', 'browser', 'github-account'], async () => {
		const dir = await context.downloadAndUnpack('cli-linux-armhf');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('dev-tunnel-linux-x64', ['linux', 'x64', 'browser', 'github-account'], async () => {
		const dir = await context.downloadAndUnpack('cli-linux-x64');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('dev-tunnel-win32-arm64', ['windows', 'arm64', 'browser', 'github-account'], async () => {
		const dir = await context.downloadAndUnpack('cli-win32-arm64');
		context.validateAllAuthenticodeSignatures(dir);
		context.validateAllVersionInfo(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('dev-tunnel-win32-x64', ['windows', 'x64', 'browser', 'github-account'], async () => {
		const dir = await context.downloadAndUnpack('cli-win32-x64');
		context.validateAllAuthenticodeSignatures(dir);
		context.validateAllVersionInfo(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	async function testCliApp(entryPoint: string) {
		const cliDataDir = context.createTempDir();
		const test = new UITest(context);
		const auth = new GitHubAuth(context);
		let browser: Browser | undefined;
		let page: Page | undefined;

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
					page = await context.getPage(browser.newPage());
					await auth.runDeviceCodeFlow(page, deviceCode);
					return;
				}

				const tunnelUrl = /Open this link in your browser (https?:\/\/[^\s]+)/.exec(line)?.[1];
				if (tunnelUrl) {
					const tunnelId = new URL(tunnelUrl).pathname.split('/').pop()!;
					const url = context.getTunnelUrl(tunnelUrl, test.workspaceDir);
					context.log(`CLI started successfully with tunnel URL: ${url}`);

					if (!browser || !page) {
						throw new Error('Browser instance is not available');
					}

					try {
						context.log(`Navigating to ${url}`);
						await page.goto(url);

						context.log('Waiting for the workbench to load');
						await page.waitForSelector('.monaco-workbench');

						context.log('Selecting GitHub Account');
						await page.locator('span.monaco-highlighted-label', { hasText: 'GitHub' }).click();

						context.log('Clicking Allow on confirmation dialog');
						const popup = page.waitForEvent('popup');
						await page.getByRole('button', { name: 'Allow' }).click();

						await auth.runAuthorizeFlow(await popup);

						context.log('Waiting for connection to be established');
						await page.getByRole('button', { name: `remote ${tunnelId}` }).waitFor({ timeout: 5 * 60 * 1000 });
					} catch (error) {
						await context.captureScreenshot(page);
						throw error;
					}

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
