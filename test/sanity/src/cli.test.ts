/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestContext } from './context';

export function setup(context: TestContext) {
	describe('CLI', () => {
		it('cli-alpine-arm64', async () => {
			await context.downloadAndUnpack('cli-alpine-arm64');
		});

		it('cli-alpine-x64', async () => {
			await context.downloadAndUnpack('cli-alpine-x64');
		});

		it('cli-darwin-arm64', async () => {
			await context.downloadAndUnpack('cli-darwin-arm64');
		});

		it('cli-darwin-x64', async () => {
			await context.downloadAndUnpack('cli-darwin-x64');
		});

		it('cli-linux-arm64', async () => {
			await context.downloadAndUnpack('cli-linux-arm64');
		});

		it('cli-linux-armhf', async () => {
			await context.downloadAndUnpack('cli-linux-armhf');
		});

		it('cli-linux-x64', async () => {
			await context.downloadAndUnpack('cli-linux-x64');
		});

		it('cli-win32-arm64', async () => {
			await context.downloadAndUnpack('cli-win32-arm64');
		});

		it('cli-win32-x64', async () => {
			await context.downloadAndUnpack('cli-win32-x64');
		});
	});
}
