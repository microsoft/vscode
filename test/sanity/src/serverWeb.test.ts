/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestContext } from './context';

export function setup(context: TestContext) {
	describe('Server Web', () => {
		it('server-alpine-arm64-web', async () => {
			await context.downloadAndUnpack('server-alpine-arm64-web');
		});

		it('server-alpine-x64-web', async () => {
			await context.downloadAndUnpack('server-linux-alpine-web');
		});

		it('server-darwin-arm64-web', async () => {
			await context.downloadAndUnpack('server-darwin-arm64-web');
		});

		it('server-darwin-x64-web', async () => {
			await context.downloadAndUnpack('server-darwin-web');
		});

		it('server-linux-arm64-web', async () => {
			await context.downloadAndUnpack('server-linux-arm64-web');
		});

		it('server-linux-armhf-web', async () => {
			await context.downloadAndUnpack('server-linux-armhf-web');
		});

		it('server-linux-x64-web', async () => {
			await context.downloadAndUnpack('server-linux-x64-web');
		});

		it('server-win32-arm64-web', async () => {
			const dir = await context.downloadAndUnpack('server-win32-arm64-web');
			context.validateAllSignatures(dir);
		});

		it('server-win32-x64-web', async () => {
			const dir = await context.downloadAndUnpack('server-win32-x64-web');
			context.validateAllSignatures(dir);
		});
	});
}
