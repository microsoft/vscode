/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestContext } from './context';

export function setup(context: TestContext) {
	describe('Desktop', () => {
		it('darwin', async () => {
			await context.downloadAndUnpack('darwin');
		});

		it('darwin-arm64', async () => {
			await context.downloadAndUnpack('darwin-arm64');
		});

		it('darwin-universal', async () => {
			await context.downloadAndUnpack('darwin-universal');
		});

		it('linux-arm64', async () => {
			await context.downloadAndUnpack('linux-arm64');
		});

		it('linux-armhf', async () => {
			await context.downloadAndUnpack('linux-armhf');
		});

		it('linux-deb-arm64', async () => {
			await context.downloadTarget('linux-deb-arm64');
		});

		it('linux-deb-armhf', async () => {
			await context.downloadTarget('linux-deb-armhf');
		});

		it('linux-deb-x64', async () => {
			await context.downloadTarget('linux-deb-x64');
		});

		it('linux-rpm-arm64', async () => {
			await context.downloadTarget('linux-rpm-arm64');
		});

		it('linux-rpm-armhf', async () => {
			await context.downloadTarget('linux-rpm-armhf');
		});

		it('linux-rpm-x64', async () => {
			await context.downloadTarget('linux-rpm-x64');
		});

		it('linux-snap-x64', async () => {
			await context.downloadTarget('linux-snap-x64');
		});

		it('linux-x64', async () => {
			await context.downloadAndUnpack('linux-x64');
		});

		it('win32-arm64', async () => {
			await context.downloadTarget('win32-arm64');
		});

		it('win32-arm64-archive', async () => {
			const dir = await context.downloadAndUnpack('win32-arm64-archive');
			context.validateAllSignatures(dir);
		});

		it('win32-arm64-user', async () => {
			await context.downloadTarget('win32-arm64-user');
		});

		it('win32-x64', async () => {
			await context.downloadTarget('win32-x64');
		});

		it('win32-x64-archive', async () => {
			const dir = await context.downloadAndUnpack('win32-x64-archive');
			context.validateAllSignatures(dir);
		});

		it('win32-x64-user', async () => {
			await context.downloadTarget('win32-x64-user');
		});
	});
}
