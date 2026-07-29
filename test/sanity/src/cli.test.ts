/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestContext } from './context.js';

export function setup(context: TestContext) {
	context.test('cli-alpine-arm64', ['alpine', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('cli-alpine-arm64');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-alpine-x64', ['alpine', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('cli-alpine-x64');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-darwin-arm64', ['darwin', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('cli-darwin-arm64');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-darwin-x64', ['darwin', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('cli-darwin-x64');
		context.validateAllCodesignSignatures(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-linux-arm64', ['linux', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('cli-linux-arm64');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-linux-armhf', ['linux', 'arm32'], async () => {
		const dir = await context.downloadAndUnpack('cli-linux-armhf');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-linux-x64', ['linux', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('cli-linux-x64');
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-win32-arm64', ['windows', 'arm64'], async () => {
		const dir = await context.downloadAndUnpack('cli-win32-arm64');
		context.validateAllAuthenticodeSignatures(dir);
		context.validateAllVersionInfo(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-win32-x64', ['windows', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('cli-win32-x64');
		context.validateAllAuthenticodeSignatures(dir);
		context.validateAllVersionInfo(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	async function testCliApp(entryPoint: string) {
		if (context.options.downloadOnly) {
			return;
		}

		const result = context.runNoErrors(entryPoint, '--version');
		const version = result.stdout.trim().match(/\(commit ([a-f0-9]+)\)/)?.[1];
		assert.strictEqual(version, context.options.commit, `Expected commit ${context.options.commit} but got ${version}`);
	}
}
