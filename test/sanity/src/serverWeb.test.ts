/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestContext } from './context.js';
import { UITest } from './uiTest.js';

export function setup(context: TestContext) {
	context.test('server-web-alpine-arm64', ['alpine', 'arm64', 'browser'], async () => {
		const dir = await context.downloadAndUnpack('server-alpine-arm64-web');
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-web-alpine-x64', ['alpine', 'x64', 'browser'], async () => {
		const dir = await context.downloadAndUnpack('server-linux-alpine-web');
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-web-darwin-arm64', ['darwin', 'arm64', 'browser'], async () => {
		const dir = await context.downloadAndUnpack('server-darwin-arm64-web');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-web-darwin-x64', ['darwin', 'x64', 'browser'], async () => {
		const dir = await context.downloadAndUnpack('server-darwin-web');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-web-linux-arm64', ['linux', 'arm64', 'browser'], async () => {
		const dir = await context.downloadAndUnpack('server-linux-arm64-web');
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-web-linux-armhf', ['linux', 'arm32', 'browser'], async () => {
		const dir = await context.downloadAndUnpack('server-linux-armhf-web');
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-web-linux-x64', ['linux', 'x64', 'browser'], async () => {
		const dir = await context.downloadAndUnpack('server-linux-x64-web');
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-web-win32-arm64', ['windows', 'arm64', 'browser'], async () => {
		const dir = await context.downloadAndUnpack('server-win32-arm64-web');
		context.validateAllAuthenticodeSignatures(dir);
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-web-win32-x64', ['windows', 'x64', 'browser'], async () => {
		const dir = await context.downloadAndUnpack('server-win32-x64-web');
		context.validateAllAuthenticodeSignatures(dir);
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	async function testServer(entryPoint: string) {
		if (context.options.downloadOnly) {
			return;
		}

		const token = context.getRandomToken();
		const test = new UITest(context);
		await context.runCliApp('Server', entryPoint,
			[
				'--accept-server-license-terms',
				'--port', context.getUniquePort(),
				'--connection-token', token,
				'--server-data-dir', context.createTempDir(),
				'--extensions-dir', test.extensionsDir,
				'--user-data-dir', test.userDataDir
			],
			async (line) => {
				const port = /Extension host agent listening on (\d+)/.exec(line)?.[1];
				if (!port) {
					return false;
				}

				const url = context.getWebServerUrl(port, token, test.workspaceDir).toString();
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
}
