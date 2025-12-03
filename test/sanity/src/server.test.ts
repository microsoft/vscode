/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestContext } from './context';

export function setup(context: TestContext) {
	describe('Server', () => {
		it('server-alpine-arm64', async () => {
			await context.downloadAndUnpack('server-alpine-arm64');
		});

		it('server-alpine-x64', async () => {
			await context.downloadAndUnpack('server-linux-alpine');
		});

		it('server-darwin-arm64', async () => {
			await context.downloadAndUnpack('server-darwin-arm64');
		});

		it('server-darwin-x64', async () => {
			await context.downloadAndUnpack('server-darwin');
		});

		it('server-linux-arm64', async () => {
			await context.downloadAndUnpack('server-linux-arm64');
		});

		it('server-linux-armhf', async () => {
			await context.downloadAndUnpack('server-linux-armhf');
		});

		it('server-linux-x64', async () => {
			await context.downloadAndUnpack('server-linux-x64');
		});

		it('server-win32-arm64', async () => {
			await context.downloadAndUnpack('server-win32-arm64');
		});

		it('server-win32-x64', async () => {
			await context.downloadAndUnpack('server-win32-x64');
		});
	});
}
