/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { disposableTimeout } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { HookTypeValue } from '../../contrib/chat/common/promptSyntax/hookSchema.js';
import { isToolInvocationContext, IToolInvocationContext } from '../../contrib/chat/common/tools/languageModelToolsService.js';
import { IHookCommandDto, MainContext, MainThreadHooksShape } from '../common/extHost.protocol.js';
import { IChatHookExecutionOptions, IExtHostHooks } from '../common/extHostHooks.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { HookResultKind, IHookResult } from '../../contrib/chat/common/hooksExecutionService.js';
import * as typeConverters from '../common/extHostTypeConverters.js';

const SIGKILL_DELAY_MS = 5000;

export class NodeExtHostHooks implements IExtHostHooks {

	private readonly _mainThreadProxy: MainThreadHooksShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@ILogService private readonly _logService: ILogService
	) {
		this._mainThreadProxy = extHostRpc.getProxy(MainContext.MainThreadHooks);
	}

	async executeHook(hookType: HookTypeValue, options: IChatHookExecutionOptions, token?: CancellationToken): Promise<vscode.ChatHookResult[]> {
		if (!options.toolInvocationToken || !isToolInvocationContext(options.toolInvocationToken)) {
			throw new Error('Invalid or missing tool invocation token');
		}

		const context = options.toolInvocationToken as IToolInvocationContext;

		const results = await this._mainThreadProxy.$executeHook(hookType, context.sessionResource, options.input, token ?? CancellationToken.None);
		return results.map(r => typeConverters.ChatHookResult.to({
			kind: r.kind as HookResultKind,
			result: r.result
		}));
	}

	async $runHookCommand(hookCommand: IHookCommandDto, input: unknown, token: CancellationToken): Promise<IHookResult> {
		this._logService.debug(`[ExtHostHooks] Running hook command: ${JSON.stringify(hookCommand)}`);

		try {
			return await this._executeCommand(hookCommand, input, token);
		} catch (err) {
			return {
				kind: HookResultKind.Error,
				result: err instanceof Error ? err.message : String(err)
			};
		}
	}

	private _executeCommand(hook: IHookCommandDto, input: unknown, token?: CancellationToken): Promise<IHookResult> {
		const home = homedir();
		const cwdUri = hook.cwd ? URI.revive(hook.cwd) : undefined;
		const cwd = cwdUri ? cwdUri.fsPath : home;

		// Determine command and args based on which property is specified
		// For bash/powershell: spawn the shell directly with explicit args to avoid double shell wrapping
		// For generic command: use shell=true to let the system shell handle it
		let command: string;
		let args: string[];
		let shell: boolean;
		if (hook.bash) {
			command = 'bash';
			args = ['-c', hook.bash];
			shell = false;
		} else if (hook.powershell) {
			command = 'powershell';
			args = ['-Command', hook.powershell];
			shell = false;
		} else {
			command = hook.command!;
			args = [];
			shell = true;
		}

		const child = spawn(command, args, {
			stdio: 'pipe',
			cwd,
			env: { ...process.env, ...hook.env },
			shell,
		});

		return new Promise((resolve, reject) => {
			const stdout: string[] = [];
			const stderr: string[] = [];
			let exitCode: number | null = null;
			let exited = false;

			const disposables = new DisposableStore();
			const sigkillTimeout = disposables.add(new MutableDisposable());

			const killWithEscalation = () => {
				if (exited) {
					return;
				}
				child.kill('SIGTERM');
				sigkillTimeout.value = disposableTimeout(() => {
					if (!exited) {
						child.kill('SIGKILL');
					}
				}, SIGKILL_DELAY_MS);
			};

			const cleanup = () => {
				exited = true;
				disposables.dispose();
			};

			// Collect output
			child.stdout.on('data', data => stdout.push(data.toString()));
			child.stderr.on('data', data => stderr.push(data.toString()));

			// Set up timeout (default 30 seconds)
			disposables.add(disposableTimeout(killWithEscalation, (hook.timeoutSec ?? 30) * 1000));

			// Set up cancellation
			if (token) {
				disposables.add(token.onCancellationRequested(killWithEscalation));
			}

			// Write input to stdin
			if (input !== undefined && input !== null) {
				try {
					child.stdin.write(JSON.stringify(input));
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
				const code = exitCode ?? 1;
				const stdoutStr = stdout.join('');
				const stderrStr = stderr.join('');

				if (code === 0) {
					// Success - try to parse stdout as JSON, otherwise return as string
					let result: string | object = stdoutStr;
					try {
						result = JSON.parse(stdoutStr);
					} catch {
						// Keep as string if not valid JSON
					}
					resolve({ kind: HookResultKind.Success, result });
				} else {
					// Error
					resolve({ kind: HookResultKind.Error, result: stderrStr });
				}
			});

			child.on('error', err => {
				cleanup();
				reject(err);
			});
		});
	}
}
