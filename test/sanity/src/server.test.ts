/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import { TestContext } from './context.js';

export function setup(context: TestContext) {
	context.test('server-alpine-arm64', ['alpine', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('server-alpine-arm64');
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-alpine-x64', ['alpine', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('server-linux-alpine');
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-darwin-arm64', ['darwin', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('server-darwin-arm64');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-darwin-x64', ['darwin', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('server-darwin');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-linux-arm64', ['linux', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('server-linux-arm64');
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-linux-armhf', ['linux', 'arm32'], async () => {
		const dir = await context.downloadAndUnpack('server-linux-armhf');
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-linux-x64', ['linux', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('server-linux-x64');
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-win32-arm64', ['windows', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('server-win32-arm64');
		context.validateAllAuthenticodeSignatures(dir);
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	context.test('server-win32-x64', ['windows', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('server-win32-x64');
		context.validateAllAuthenticodeSignatures(dir);
		const entryPoint = context.getServerEntryPoint(dir);
		await testServer(entryPoint);
	});

	async function testServer(entryPoint: string) {
		if (context.options.downloadOnly) {
			return;
		}

		const args = [
			'--accept-server-license-terms',
			'--connection-token', context.getRandomToken(),
			'--host', '0.0.0.0',
			'--port', context.getUniquePort(),
			'--server-data-dir', context.createTempDir(),
			'--extensions-dir', context.createTempDir(),
		];

		context.log(`Starting server ${entryPoint} with args ${args.join(' ')}`);
		const detached = !context.capabilities.has('windows');
		const server = spawn(entryPoint, args, { shell: true, detached });

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
		const response = await context.fetchNoErrors(url);
		const text = await response.text();
		assert.strictEqual(text, context.options.commit, `Expected commit ${context.options.commit} but got ${text}`);
	}
}
