/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
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
		const args = [
			'--accept-server-license-terms',
			'--port', context.getUniquePort(),
			'--connection-token', token,
			'--server-data-dir', context.createTempDir(),
			'--extensions-dir', test.extensionsDir,
			'--user-data-dir', test.userDataDir
		];

		context.log(`Starting server ${entryPoint} with args ${args.join(' ')}`);
		const detached = !context.capabilities.has('windows');
		const server = spawn(entryPoint, args, { shell: true, detached });

		let testError: Error | undefined;

		server.stderr.on('data', (data) => {
			const text = data.toString().trim();
			if (!/ECONNRESET/.test(text)) {
				context.error(`[Server Error] ${text}`);
			}
		});

		server.stdout.on('data', (data) => {
			const text = data.toString().trim();
			text.split('\n').forEach((line: string) => {
				context.log(`[Server Output] ${line}`);
			});

			const port = /Extension host agent listening on (\d+)/.exec(text)?.[1];
			if (port) {
				const url = context.getWebServerUrl(port, token, test.workspaceDir).toString();
				runUITest(url, test)
					.catch((error) => { testError = error; })
					.finally(() => context.killProcessTree(server.pid!));
			}
		});

		await new Promise<void>((resolve, reject) => {
			server.on('error', reject);
			server.on('exit', resolve);
		});

		if (testError) {
			throw testError;
		}
	}

	async function runUITest(url: string, test: UITest) {
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
	}
}
