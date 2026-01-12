/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import os from 'os';
import { TestContext } from './context';

export function setup(context: TestContext) {
	describe('Server', () => {
		if (context.platform === 'linux-arm64') {
			it('server-alpine-arm64', async () => {
				const dir = await context.downloadAndUnpack('server-alpine-arm64');
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'linux-x64') {
			it('server-alpine-x64', async () => {
				const dir = await context.downloadAndUnpack('server-linux-alpine');
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'darwin-arm64') {
			it('server-darwin-arm64', async () => {
				const dir = await context.downloadAndUnpack('server-darwin-arm64');
				context.validateAllCodesignSignatures(dir);
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'darwin-x64') {
			it('server-darwin-x64', async () => {
				const dir = await context.downloadAndUnpack('server-darwin');
				context.validateAllCodesignSignatures(dir);
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'linux-arm64') {
			it('server-linux-arm64', async () => {
				const dir = await context.downloadAndUnpack('server-linux-arm64');
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'linux-arm') {
			it('server-linux-armhf', async () => {
				const dir = await context.downloadAndUnpack('server-linux-armhf');
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'linux-x64') {
			it('server-linux-x64', async () => {
				const dir = await context.downloadAndUnpack('server-linux-x64');
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'win32-arm64') {
			it('server-win32-arm64', async () => {
				const dir = await context.downloadAndUnpack('server-win32-arm64');
				context.validateAllAuthenticodeSignatures(dir);
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		if (context.platform === 'win32-x64') {
			it('server-win32-x64', async () => {
				const dir = await context.downloadAndUnpack('server-win32-x64');
				context.validateAllAuthenticodeSignatures(dir);
				const entryPoint = context.getServerEntryPoint(dir);
				await testServer(entryPoint);
			});
		}

		async function testServer(entryPoint: string) {
			const args = [
				'--accept-server-license-terms',
				'--connection-token', context.getRandomToken(),
				'--port', context.getRandomPort(),
				'--server-data-dir', context.createTempDir(),
				'--extensions-dir', context.createTempDir(),
			];

			context.log(`Starting server ${entryPoint} with args ${args.join(' ')}`);
			const server = spawn(entryPoint, args, { shell: true, detached: os.platform() !== 'win32' });

			let testError: Error | undefined;

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
					const url = context.getWebServerUrl(port);
					url.pathname = '/version';
					runWebTest(url.toString())
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

		async function runWebTest(url: string) {
			context.log(`Fetching ${url}`);
			const response = await fetch(url);
			assert.strictEqual(response.status, 200, `Expected status 200 but got ${response.status}`);

			const text = await response.text();
			assert.strictEqual(text, context.commit, `Expected commit ${context.commit} but got ${text}`);
		}
	});
}
