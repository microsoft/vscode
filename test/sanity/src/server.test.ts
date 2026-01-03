/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestContext } from './context';

export function setup(context: TestContext) {
	describe('Server', () => {
		if (context.platform === 'linux-arm64') {
			it('server-alpine-arm64', async () => {
				await context.downloadAndUnpack('server-alpine-arm64');
			});
		}

		if (context.platform === 'linux-x64') {
			it('server-alpine-x64', async () => {
				await context.downloadAndUnpack('server-linux-alpine');
			});
		}

		if (context.platform === 'darwin-arm64') {
			it('server-darwin-arm64', async () => {
				await context.downloadAndUnpack('server-darwin-arm64');
			});
		}

		if (context.platform === 'darwin-x64') {
			it('server-darwin-x64', async () => {
				await context.downloadAndUnpack('server-darwin');
			});
		}

		if (context.platform === 'linux-arm64') {
			it('server-linux-arm64', async () => {
				await context.downloadAndUnpack('server-linux-arm64');
			});
		}

		if (context.platform === 'linux-arm') {
			it('server-linux-armhf', async () => {
				await context.downloadAndUnpack('server-linux-armhf');
			});
		}

		if (context.platform === 'linux-x64') {
			it('server-linux-x64', async () => {
				await context.downloadAndUnpack('server-linux-x64');
			});
		}

		if (context.platform === 'win32-arm64') {
			it('server-win32-arm64', async () => {
				const dir = await context.downloadAndUnpack('server-win32-arm64');
				context.validateAllSignatures(dir);
			});
		}

		if (context.platform === 'win32-x64') {
			it('server-win32-x64', async () => {
				const dir = await context.downloadAndUnpack('server-win32-x64');
				context.validateAllSignatures(dir);
			});
		}
	});
}
