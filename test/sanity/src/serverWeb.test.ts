/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import path from 'path';
import { TestContext } from './context';
import { UITest } from './uiTest';

export function setup(context: TestContext) {
	describe('Server Web', () => {
		if (context.platform === 'linux-arm64') {
			it('server-web-alpine-arm64', async () => {
				const dir = await context.downloadAndUnpack('server-alpine-arm64-web');
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'linux-x64') {
			it('server-web-alpine-x64', async () => {
				const dir = await context.downloadAndUnpack('server-linux-alpine-web');
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'darwin-arm64') {
			it('server-web-darwin-arm64', async () => {
				const dir = await context.downloadAndUnpack('server-darwin-arm64-web');
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'darwin-x64') {
			it('server-web-darwin-x64', async () => {
				const dir = await context.downloadAndUnpack('server-darwin-web');
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'linux-arm64') {
			it('server-web-linux-arm64', async () => {
				const dir = await context.downloadAndUnpack('server-linux-arm64-web');
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'linux-arm') {
			it('server-web-linux-armhf', async () => {
				const dir = await context.downloadAndUnpack('server-linux-armhf-web');
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'linux-x64') {
			it('server-web-linux-x64', async () => {
				const dir = await context.downloadAndUnpack('server-linux-x64-web');
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'win32-arm64') {
			it('server-web-win32-arm64', async () => {
				const dir = await context.downloadAndUnpack('server-win32-arm64-web');
				context.validateAllSignatures(dir);
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'win32-x64') {
			it('server-web-win32-x64', async () => {
				const dir = await context.downloadAndUnpack('server-win32-x64-web');
				context.validateAllSignatures(dir);
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		async function testServer(entryPoint: string) {
			const token = '12345';
			const test = new UITest(context);
			const args = [
				'--accept-server-license-terms',
				'--connection-token', token,
				'--server-data-dir', context.createTempDir(),
				'--extensions-dir', test.extensionsDir,
				'--user-data-dir', test.userDataDir
			];

			context.log(`Starting server ${entryPoint} with args ${args.join(' ')}`);
			const server = spawn(entryPoint, args, { shell: true });

			server.stderr.on('data', (data) => {
				context.error(`[Server Error] ${data.toString().trim()}`);
			});

			server.stdout.on('data', (data) => {
				const text = data.toString().trim();
				text.split('\n').forEach((line: string) => {
					context.log(`[Server Output] ${line}`);
				});

				const port = /Extension host agent listening on (\d+)/.exec(text)?.[1];
				if (port) {
					(async function () {
						try {
							const browser = await context.launchBrowser();
							const page = await browser.newPage();

							const url = `http://localhost:${port}?tkn=${token}&folder=/${test.workspaceDir.replaceAll(path.sep, '/')}`;
							context.log(`Navigating to ${url}`);
							await page.goto(url, { waitUntil: 'networkidle' });

							context.log('Waiting for the workbench to load');
							await page.waitForSelector('.monaco-workbench');

							context.log('Verifying page title contains "Visual Studio Code"');
							assert.match(await page.title(), /Visual Studio Code/);

							await test.run(page);

							context.log('Closing browser');
							await browser.close();

							test.validate();
						} catch (error) {
							assert.fail(error instanceof Error ? error.message : String(error));
						} finally {
							context.killProcessTree(server.pid!);
						}
					})();
				}
			});

			await new Promise<void>((resolve, reject) => {
				server.on('error', reject);
				server.on('exit', resolve);
			});
		}
	});
}
