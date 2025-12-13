/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestContext } from './context';

export function setup(context: TestContext) {
	describe('CLI', () => {
		it('cli-alpine-arm64', async () => {
			const dir = await context.downloadAndUnpack('cli-alpine-arm64');
			const entryPoint = context.getEntryPoint('cli', dir);
			await testCliApp(entryPoint);
		});

		it('cli-alpine-x64', async () => {
			const dir = await context.downloadAndUnpack('cli-alpine-x64');
			const entryPoint = context.getEntryPoint('cli', dir);
			await testCliApp(entryPoint);
		});

		it('cli-darwin-arm64', async () => {
			const dir = await context.downloadAndUnpack('cli-darwin-arm64');
			const entryPoint = context.getEntryPoint('cli', dir);
			await testCliApp(entryPoint);
		});

		it('cli-darwin-x64', async () => {
			const dir = await context.downloadAndUnpack('cli-darwin-x64');
			const entryPoint = context.getEntryPoint('cli', dir);
			await testCliApp(entryPoint);
		});

		it('cli-linux-arm64', async () => {
			const dir = await context.downloadAndUnpack('cli-linux-arm64');
			const entryPoint = context.getEntryPoint('cli', dir);
			await testCliApp(entryPoint);
		});

		it('cli-linux-armhf', async () => {
			const dir = await context.downloadAndUnpack('cli-linux-armhf');
			const entryPoint = context.getEntryPoint('cli', dir);
			await testCliApp(entryPoint);
		});

		it('cli-linux-x64', async () => {
			const dir = await context.downloadAndUnpack('cli-linux-x64');
			const entryPoint = context.getEntryPoint('cli', dir);
			await testCliApp(entryPoint);
		});

		it('cli-win32-arm64', async () => {
			const dir = await context.downloadAndUnpack('cli-win32-arm64');
			context.validateAllSignatures(dir);
			const entryPoint = context.getEntryPoint('cli', dir);
			await testCliApp(entryPoint);
		});

		it('cli-win32-x64', async () => {
			const dir = await context.downloadAndUnpack('cli-win32-x64');
			context.validateAllSignatures(dir);
			const entryPoint = context.getEntryPoint('cli', dir);
			await testCliApp(entryPoint);
		});

		async function testCliApp(entryPoint: string) {
			const result = context.runNoErrors(entryPoint, '--version');
			const version = result.stdout.trim();
			assert.ok(version.match(/^\d+\.\d+\.\d+/), `Unexpected version format: ${version}`);
		}
	});
}
