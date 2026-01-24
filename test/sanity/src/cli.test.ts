/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
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
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	context.test('cli-win32-x64', ['windows', 'x64'], async () => {
		const dir = await context.downloadAndUnpack('cli-win32-x64');
		context.validateAllAuthenticodeSignatures(dir);
		const entryPoint = context.getCliEntryPoint(dir);
		await testCliApp(entryPoint);
	});

	async function testCliApp(entryPoint: string) {
		if (context.options.downloadOnly) {
			return;
		}

		const result = context.runNoErrors(entryPoint, '--version');
		const version = result.stdout.trim();
		assert.ok(version.includes(`(commit ${context.options.commit})`), `Expected CLI version to include commit ${context.options.commit}, got: ${version}`);

		const workspaceDir = context.createTempDir();
		process.chdir(workspaceDir);
		context.log(`Changed current directory to: ${workspaceDir}`);

		const args = [
			'--cli-data-dir', context.createTempDir(),
			'--user-data-dir', context.createTempDir(),
			'tunnel',
			'--accept-server-license-terms',
			'--server-data-dir', context.createTempDir(),
			'--extensions-dir', context.createTempDir(),
		];

		context.log(`Running CLI ${entryPoint} with args ${args.join(' ')}`);
		const cli = spawn(entryPoint, args, { detached: true });

		cli.stderr.on('data', (data) => {
			context.error(`[CLI Error] ${data.toString().trim()}`);
		});

		cli.stdout.on('data', (data) => {
			const text = data.toString().trim();
			text.split('\n').forEach((line: string) => {
				context.log(`[CLI Output] ${line}`);
			});

			const match = /Using GitHub for authentication/.exec(text);
			if (match !== null) {
				context.log(`CLI started successfully and is waiting for authentication`);
				context.killProcessTree(cli.pid!);
			}
		});

		await new Promise<void>((resolve, reject) => {
			cli.on('error', reject);
			cli.on('exit', resolve);
		});
	}
}
