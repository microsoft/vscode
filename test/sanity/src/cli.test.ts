/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import { TestContext } from './context';

export function setup(context: TestContext) {
	describe('CLI', () => {
		if (context.platform === 'linux-arm64') {
			it('cli-alpine-arm64', async () => {
				const dir = await context.downloadAndUnpack('cli-alpine-arm64');
				const entryPoint = context.getEntryPoint('cli', dir);
				await testCliApp(entryPoint);
			});
		}

		if (context.platform === 'linux-x64') {
			it('cli-alpine-x64', async () => {
				const dir = await context.downloadAndUnpack('cli-alpine-x64');
				const entryPoint = context.getEntryPoint('cli', dir);
				await testCliApp(entryPoint);
			});
		}

		if (context.platform === 'darwin-arm64') {
			it('cli-darwin-arm64', async () => {
				const dir = await context.downloadAndUnpack('cli-darwin-arm64');
				const entryPoint = context.getEntryPoint('cli', dir);
				await testCliApp(entryPoint);
			});
		}

		if (context.platform === 'darwin-x64') {
			it('cli-darwin-x64', async () => {
				const dir = await context.downloadAndUnpack('cli-darwin-x64');
				const entryPoint = context.getEntryPoint('cli', dir);
				await testCliApp(entryPoint);
			});
		}

		if (context.platform === 'linux-arm64') {
			it('cli-linux-arm64', async () => {
				const dir = await context.downloadAndUnpack('cli-linux-arm64');
				const entryPoint = context.getEntryPoint('cli', dir);
				await testCliApp(entryPoint);
			});
		}

		if (context.platform === 'linux-arm') {
			it('cli-linux-armhf', async () => {
				const dir = await context.downloadAndUnpack('cli-linux-armhf');
				const entryPoint = context.getEntryPoint('cli', dir);
				await testCliApp(entryPoint);
			});
		}

		if (context.platform === 'linux-x64') {
			it('cli-linux-x64', async () => {
				const dir = await context.downloadAndUnpack('cli-linux-x64');
				const entryPoint = context.getEntryPoint('cli', dir);
				await testCliApp(entryPoint);
			});
		}

		if (context.platform === 'win32-arm64') {
			it('cli-win32-arm64', async () => {
				const dir = await context.downloadAndUnpack('cli-win32-arm64');
				context.validateAllSignatures(dir);
				const entryPoint = context.getEntryPoint('cli', dir);
				await testCliApp(entryPoint);
			});
		}

		if (context.platform === 'win32-x64') {
			it('cli-win32-x64', async () => {
				const dir = await context.downloadAndUnpack('cli-win32-x64');
				context.validateAllSignatures(dir);
				const entryPoint = context.getEntryPoint('cli', dir);
				await testCliApp(entryPoint);
			});
		}

		async function testCliApp(entryPoint: string) {
			const result = context.runNoErrors(entryPoint, '--version');
			const version = result.stdout.trim();
			assert.ok(version.includes(`(commit ${context.commit})`));

			const workspaceDir = context.createTempDir();
			process.chdir(workspaceDir);
			context.log(`Changed current directory to: ${workspaceDir}`);

			const cliDataDir = context.createTempDir();
			const userDataDir = context.createTempDir();
			const serverDataDir = context.createTempDir();
			const extensionsDir = context.createTempDir();
			const args = [
				'--cli-data-dir', cliDataDir,
				'--user-data-dir', userDataDir,
				'tunnel',
				'--accept-server-license-terms',
				'--server-data-dir', serverDataDir,
				'--extensions-dir', extensionsDir,
			];

			context.log(`Running CLI ${entryPoint} with args: ${args.join(' ')}`);
			const cli = spawn(entryPoint, args);

			cli.stderr.on('data', (data) => {
				context.error(`[CLI Error] ${data.toString().trim()}`);
			});

			let tunnelUrl: string | undefined = undefined;
			cli.stdout.on('data', (data) => {
				const text = data.toString();
				text.trim().split('\n').forEach((line: string) => {
					context.log(`[CLI Output] ${line}`);
				});

				const match = /Open this link in your browser (https:\/\/.+)/.exec(text);
				if (match !== null) {
					tunnelUrl = context.getTunnelUrl(match[1]);
					context.log(`Tunnel URL: ${tunnelUrl}`);
					cli.kill();
				}
			});

			await new Promise<void>((resolve, reject) => {
				cli.on('error', reject);
				cli.on('exit', () => resolve());
			});

			assert.ok(tunnelUrl, 'Expected to receive a tunnel URL from the CLI');
		}
	});
}
