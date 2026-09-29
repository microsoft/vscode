/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';

export interface ICommandExecutor {
	executeWithTimeout(
		command: string,
		args: string[],
		cwd: string,
		timeoutMs?: number,
		expectZeroExitCode?: boolean,
		cancellationToken?: CancellationToken): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export class CommandExecutor implements ICommandExecutor {
	async executeWithTimeout(
		command: string,
		args: string[],
		cwd: string,
		timeoutMs?: number,
		expectZeroExitCode?: boolean,
		cancellationToken?: CancellationToken
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		return await executeWithTimeout(
			command,
			args,
			cwd,
			timeoutMs,
			expectZeroExitCode,
			cancellationToken
		);
	}
}

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10000;

async function executeWithTimeout(
	command: string,
	args: string[],
	cwd: string,
	timeoutMs: number = 60000,
	expectZeroExitCode: boolean = true,
	cancellationToken?: CancellationToken) {

	return await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		let settled = false;

		const child: cp.ChildProcessWithoutNullStreams = cp.spawn(command, args, {
			stdio: 'pipe',
			env: { ...process.env },
			cwd: cwd,
		});

		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');

		child.stdout.on('data', (data) => stdout.push(data));
		child.stderr.on('data', (data) => stderr.push(data));

		const timeoutHandler = setTimeout(() => {
			if (!settled) {
				settled = true;
				child.kill('SIGTERM');
				setTimeout(() => {
					if (!child.killed) {
						child.kill('SIGKILL');
					}
				}, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
				reject(new Error(`Process timed out after ${timeoutMs}ms`));
			}
		}, timeoutMs);

		const cancellationHandler = cancellationToken?.onCancellationRequested(() => {
			if (!settled) {
				settled = true;
				clearTimeout(timeoutHandler);
				child.kill('SIGTERM');
				setTimeout(() => {
					if (!child.killed) {
						child.kill('SIGKILL');
					}
				}, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
				reject(new Error(`Process cancelled`));
			}
		});

		child.on('error', (error) => {
			if (!settled) {
				settled = true;
				clearTimeout(timeoutHandler);
				cancellationHandler?.dispose();
				reject(error);
			}
		});

		child.on('close', (code) => {
			if (!settled) {
				settled = true;
				clearTimeout(timeoutHandler);
				cancellationHandler?.dispose();

				if (expectZeroExitCode && code !== 0) {
					reject(new Error(`Process ${child.pid} (${command}) failed with code ${code}.
stdout: ${stdout.join('')}
stderr: ${stderr.join('')}`));
				} else {
					resolve({
						stdout: stdout.join(''),
						stderr: stderr.join(''),
						exitCode: code ?? -1,
					});
				}
			}
		});
	});
}
