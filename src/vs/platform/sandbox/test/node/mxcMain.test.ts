/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, rejects } from 'assert';
import { finished, PassThrough, Readable } from 'stream';
import { promisify } from 'util';
import type { ContainerRequest } from '@microsoft/mxc-sdk/v1';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWindowsMxc } from '../../node/mxcMain.js';

const waitForStream = promisify(finished);

suite('Windows MXC SDK runner', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards the V1 request, streams stdio, and preserves the exit code', async () => {
		const input = Readable.from(['terminal input']);
		const output = new PassThrough();
		const errorOutput = new PassThrough();
		const stdin = new PassThrough();
		const stdout = new PassThrough();
		const stderr = new PassThrough();
		let receivedRequest: ContainerRequest | undefined;
		let receivedInput = '';
		let receivedOutput = '';
		let receivedError = '';
		let disposed = false;
		stdin.on('data', chunk => receivedInput += chunk.toString());
		output.on('data', chunk => receivedOutput += chunk.toString());
		errorOutput.on('data', chunk => receivedError += chunk.toString());
		const request: ContainerRequest = {
			command: '"pwsh.exe" -NoProfile -Command "echo hello"',
			workingDirectory: 'C:\\workspace',
			environment: { PATH: 'C:\\tools', EXAMPLE: 'value=with=equals' },
			filesystem: { readonlyPaths: ['C:\\tools'], deniedPaths: ['C:\\secret'] },
			network: { egress: { default: 'deny' }, ingress: { default: 'deny' } },
			ui: { disable: false, clipboard: 'none', allowInputInjection: false },
		};
		const listenerCounts = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
		try {
			const exitCode = await runWindowsMxc(request, async value => {
				receivedRequest = value;
				return {
					standardInput: stdin,
					standardOutput: stdout,
					standardError: stderr,
					warnings: ['sandbox warning'],
					wait: async () => {
						await waitForStream(stdin);
						stdout.end('terminal output');
						stderr.end('terminal error');
						await Promise.all([waitForStream(stdout), waitForStream(stderr)]);
						return { exitCode: 7, timedOut: false };
					},
					kill: () => { },
					dispose: () => { disposed = true; },
				};
			}, input, output, errorOutput);
			deepStrictEqual({
				receivedRequest, receivedInput, receivedOutput, receivedError, exitCode, disposed,
				listenerCounts: [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')],
			}, {
				receivedRequest: request,
				receivedInput: 'terminal input',
				receivedOutput: 'terminal output',
				receivedError: 'terminal errorsandbox warning\n',
				exitCode: 7,
				disposed: true,
				listenerCounts,
			});
		} finally {
			for (const stream of [input, output, errorOutput, stdin, stdout, stderr]) {
				stream.destroy();
			}
		}
	});

	test('surfaces launch failures instead of running outside the sandbox', async () => {
		await rejects(runWindowsMxc({ command: 'echo hello' }, async () => {
			throw new Error('Sandbox unavailable');
		}), /Sandbox unavailable/);
	});

	test('disposes the process and signal handlers when execution fails', async () => {
		let disposed = false;
		const listenerCounts = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
		await rejects(runWindowsMxc({ command: 'echo hello' }, async () => ({
			standardInput: null,
			standardOutput: null,
			standardError: null,
			warnings: [],
			wait: async () => { throw new Error('Execution failed'); },
			kill: () => { },
			dispose: () => { disposed = true; },
		})), /Execution failed/);
		deepStrictEqual({
			disposed,
			listenerCounts: [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')],
		}, { disposed: true, listenerCounts });
	});
});
