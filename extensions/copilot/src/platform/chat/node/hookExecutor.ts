/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { homedir } from 'os';
import type { CancellationToken, ChatHookCommand, Uri } from 'vscode';
import { basename, join } from '../../../util/vs/base/common/path';
import { isWindows } from '../../../util/vs/base/common/platform';
import { removeAnsiEscapeCodes } from '../../../util/vs/base/common/strings';
import { ILogService } from '../../log/common/logService';
import { HookCommandResultKind, IHookCommandResult, IHookExecutor } from '../common/hookExecutor';
import { IHooksOutputChannel } from '../common/hooksOutputChannel';

const SIGKILL_DELAY_MS = 5000;
const DEFAULT_TIMEOUT_SEC = 30;

export class NodeHookExecutor implements IHookExecutor {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IHooksOutputChannel private readonly _outputChannel: IHooksOutputChannel,
	) { }

	async executeCommand(
		hookCommand: ChatHookCommand,
		input: unknown,
		token: CancellationToken
	): Promise<IHookCommandResult> {
		this._logService.debug(`[HookExecutor] Running hook command: ${hookCommand.command}`);

		try {
			return await this._spawn(hookCommand, input, token);
		} catch (err) {
			// Spawn failures (e.g. command not found) are non-blocking warnings
			const errMessage = err instanceof Error ? err.message : String(err);
			const message = `Hook command failed to start: ${hookCommand.command}: ${errMessage}`;
			this._logService.warn(`[HookExecutor] ${message}`);
			this._outputChannel.appendLine(`[HookExecutor] ${message}`);
			return {
				kind: HookCommandResultKind.NonBlockingError,
				result: errMessage
			};
		}
	}

	private _spawn(hook: ChatHookCommand, input: unknown, token: CancellationToken): Promise<IHookCommandResult> {
		const cwd = hook.cwd ? uriToFsPath(hook.cwd) : homedir();

		const child = spawn(hook.command, [], {
			stdio: 'pipe',
			cwd,
			env: { ...process.env, ...hook.env },
			shell: getShell(),
		});

		return new Promise((resolve, reject) => {
			const stdout: string[] = [];
			const stderr: string[] = [];
			let exitCode: number | null = null;
			let exited = false;

			let sigkillTimer: ReturnType<typeof setTimeout> | undefined;
			let tokenListener: { dispose(): void } | undefined;
			let killReason: 'timeout' | 'cancelled' | undefined;

			const killWithEscalation = (reason: 'timeout' | 'cancelled') => {
				if (exited) {
					return;
				}
				killReason = reason;
				child.kill('SIGTERM');
				sigkillTimer = setTimeout(() => {
					if (!exited) {
						child.kill('SIGKILL');
					}
				}, SIGKILL_DELAY_MS);
			};

			const cleanup = () => {
				exited = true;
				if (sigkillTimer) {
					clearTimeout(sigkillTimer);
				}
				clearTimeout(timeoutTimer);
				tokenListener?.dispose();
			};

			// Collect output
			child.stdout.on('data', data => stdout.push(data.toString()));
			child.stderr.on('data', data => stderr.push(data.toString()));

			// Set up timeout
			const timeoutTimer = setTimeout(() => killWithEscalation('timeout'), (hook.timeout ?? DEFAULT_TIMEOUT_SEC) * 1000);

			// Set up cancellation
			if (token) {
				tokenListener = token.onCancellationRequested(() => killWithEscalation('cancelled'));
			}

			// Write input to stdin
			if (input !== undefined && input !== null) {
				try {
					child.stdin.write(JSON.stringify(input, (_key, value) => {
						// Convert URI-like objects to filesystem paths
						if (isUriLike(value)) {
							return uriToFsPath(value);
						}
						return value;
					}));
				} catch {
					// Ignore stdin write errors
				}
			}
			child.stdin.end();

			// Capture exit code
			child.on('exit', code => { exitCode = code; });

			// Resolve on close (after streams flush)
			child.on('close', () => {
				cleanup();

				if (killReason === 'timeout') {
					const message = `Hook command timed out after ${hook.timeout ?? DEFAULT_TIMEOUT_SEC}s: ${hook.command}`;
					this._logService.warn(`[HookExecutor] ${message}`);
					this._outputChannel.appendLine(`[HookExecutor] ${message}`);
				} else if (killReason === 'cancelled') {
					this._outputChannel.appendLine(`[HookExecutor] Hook command was cancelled: ${hook.command}`);
				}

				const code = exitCode ?? 1;
				const stdoutStr = stdout.join('');
				const stderrStr = removeAnsiEscapeCodes(stderr.join(''));

				if (code === 0) {
					let result: string | object = stdoutStr;
					if (stdoutStr) {
						try {
							result = JSON.parse(stdoutStr);
						} catch {
							const message = `Hook command returned non-JSON output: ${hook.command}`;
							this._logService.warn(`[HookExecutor] ${message}`);
							this._outputChannel.appendLine(`[HookExecutor] ${message}`);
						}
					}
					resolve({ kind: HookCommandResultKind.Success, result, exitCode: code });
				} else if (code === 2) {
					// Exit code 2: blocking error shown to model
					resolve({ kind: HookCommandResultKind.Error, result: stderrStr, exitCode: code });
				} else {
					// Other non-zero: non-blocking warning shown to user only
					resolve({ kind: HookCommandResultKind.NonBlockingError, result: stderrStr, exitCode: code });
				}
			});

			child.on('error', err => {
				cleanup();
				reject(err);
			});
		});
	}
}

function isUriLike(value: unknown): value is Uri {
	return typeof value === 'object' && value !== null && 'scheme' in value && 'path' in value;
}

function uriToFsPath(uri: Uri): string {
	// vscode.Uri has an fsPath getter
	if ('fsPath' in uri && typeof uri.fsPath === 'string') {
		return uri.fsPath;
	}
	// Fallback for URI-like objects
	return (uri as { path: string }).path;
}


function getShell(): string | true {
	if (!isWindows) {
		return true;
	}

	const comSpec = process.env.ComSpec;
	if (!comSpec || basename(comSpec).toLowerCase() !== 'cmd.exe') {
		return true;
	}

	const systemRoot = process.env.SystemRoot || process.env.WINDIR;
	if (!systemRoot) {
		return true;
	}

	return join(
		systemRoot,
		'System32',
		'WindowsPowerShell',
		'v1.0',
		'powershell.exe'
	);
}