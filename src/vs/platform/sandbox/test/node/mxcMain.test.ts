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
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGBREAK'];

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
		const listenerCounts = signals.map(signal => process.listenerCount(signal));
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
						setImmediate(() => {
							stdout.end('terminal output');
							setImmediate(() => stderr.end('terminal error'));
						});
						return { exitCode: 7, timedOut: false };
					},
					kill: () => { },
					dispose: () => {
						disposed = true;
						stdout.destroy();
						stderr.destroy();
					},
				};
			}, input, output, errorOutput);
			deepStrictEqual({
				receivedRequest, receivedInput, receivedOutput, receivedError, exitCode, disposed,
				listenerCounts: signals.map(signal => process.listenerCount(signal)),
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

	for (const signal of signals) {
		test(`forwards ${signal} to the sandbox and removes the handler`, async () => {
			let killCount = 0;
			let disposed = false;
			const listenerCounts = signals.map(signal => process.listenerCount(signal));
			const exitCode = await runWindowsMxc({ command: 'echo hello' }, async () => ({
				standardInput: null,
				standardOutput: null,
				standardError: null,
				warnings: [],
				wait: async () => {
					process.emit(signal);
					return { exitCode: 1, timedOut: false };
				},
				kill: () => { killCount++; },
				dispose: () => { disposed = true; },
			}));
			deepStrictEqual({
				killCount, disposed, exitCode,
				listenerCounts: signals.map(signal => process.listenerCount(signal)),
			}, { killCount: 1, disposed: true, exitCode: 1, listenerCounts });
		});
	}

	test('surfaces output errors and cleans up stream and signal handlers', async () => {
		const stdout = new PassThrough();
		const output = new PassThrough();
		let disposed = false;
		const listenerCounts = signals.map(signal => process.listenerCount(signal));
		const streamListenerCounts = ['end', 'finish', 'error', 'close'].map(event => stdout.listenerCount(event));
		try {
			await rejects(runWindowsMxc({ command: 'echo hello' }, async () => ({
				standardInput: null,
				standardOutput: stdout,
				standardError: null,
				warnings: [],
				wait: async () => {
					setImmediate(() => stdout.destroy(new Error('Output failed')));
					return { exitCode: 0, timedOut: false };
				},
				kill: () => { },
				dispose: () => { disposed = true; },
			}), Readable.from([]), output), /Output failed/);
			deepStrictEqual({
				disposed,
				listenerCounts: signals.map(signal => process.listenerCount(signal)),
				streamListenerCounts: ['end', 'finish', 'error', 'close'].map(event => stdout.listenerCount(event)),
			}, { disposed: true, listenerCounts, streamListenerCounts });
		} finally {
			stdout.destroy();
			output.destroy();
		}
	});

	test('disposes the process and signal handlers when execution fails', async () => {
		let disposed = false;
		const listenerCounts = signals.map(signal => process.listenerCount(signal));
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
			listenerCounts: signals.map(signal => process.listenerCount(signal)),
		}, { disposed: true, listenerCounts });
	});
});
