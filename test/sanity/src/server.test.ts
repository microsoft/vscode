/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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

		await context.runCliApp('Server', entryPoint,
			[
				'--accept-server-license-terms',
				'--connection-token', context.getRandomToken(),
				'--host', '0.0.0.0',
				'--port', context.getUniquePort(),
				'--server-data-dir', context.createTempDir(),
				'--extensions-dir', context.createTempDir()
			],
			async (line) => {
				const port = /Extension host agent listening on (\d+)/.exec(line)?.[1];
				if (!port) {
					return false;
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
}
