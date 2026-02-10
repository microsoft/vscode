/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { spawn } from 'child_process';
import { homedir } from 'os';
import * as nls from '../../../nls.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { OS } from '../../../base/common/platform.js';
import { URI, isUriComponents } from '../../../base/common/uri.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { HookTypeValue, getEffectiveCommandSource, resolveEffectiveCommand } from '../../contrib/chat/common/promptSyntax/hookSchema.js';
import { isToolInvocationContext, IToolInvocationContext } from '../../contrib/chat/common/tools/languageModelToolsService.js';
import { IHookCommandDto, MainContext, MainThreadHooksShape } from '../common/extHost.protocol.js';
import { IChatHookExecutionOptions, IExtHostHooks } from '../common/extHostHooks.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { HookCommandResultKind, IHookCommandResult } from '../../contrib/chat/common/hooks/hooksCommandTypes.js';
import { IHookResult } from '../../contrib/chat/common/hooks/hooksTypes.js';
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
			this._logService.error('[NodeExtHostHooks] Invalid or missing tool invocation token');
			return [];
		}

		const context = options.toolInvocationToken as IToolInvocationContext;

		const results = await this._mainThreadProxy.$executeHook(hookType, context.sessionResource, options.input, token ?? CancellationToken.None);
		return results.map(r => typeConverters.ChatHookResult.to(r as IHookResult));
	}

	async $runHookCommand(hookCommand: IHookCommandDto, input: unknown, token: CancellationToken): Promise<IHookCommandResult> {
		this._logService.debug(`[ExtHostHooks] Running hook command: ${JSON.stringify(hookCommand)}`);

		try {
			return await this._executeCommand(hookCommand, input, token);
		} catch (err) {
			return {
				kind: HookCommandResultKind.Error,
				result: err instanceof Error ? err.message : String(err)
			};
		}
	}

	private _executeCommand(hook: IHookCommandDto, input: unknown, token?: CancellationToken): Promise<IHookCommandResult> {
		const home = homedir();
		const cwdUri = hook.cwd ? URI.revive(hook.cwd) : undefined;
		const cwd = cwdUri ? cwdUri.fsPath : home;

		// Resolve the effective command for the current platform
		// This applies windows/linux/osx overrides and falls back to command
		const effectiveCommand = resolveEffectiveCommand(hook as Parameters<typeof resolveEffectiveCommand>[0], OS);
		if (!effectiveCommand) {
			return Promise.resolve({
				kind: HookCommandResultKind.NonBlockingError,
				result: nls.localize('noCommandForPlatform', "No command specified for the current platform")
			});
		}

		// Execute the command, preserving legacy behavior for explicit shell types:
		// - powershell source: run through PowerShell so PowerShell-specific commands work
		// - bash source: run through bash so bash-specific commands work
		// - otherwise: use default shell via spawn with shell: true
		const commandSource = getEffectiveCommandSource(hook as Parameters<typeof getEffectiveCommandSource>[0], OS);
		let shellExecutable: string | undefined;
		let shellArgs: string[] | undefined;

		if (commandSource === 'powershell') {
			shellExecutable = 'powershell.exe';
			shellArgs = ['-Command', effectiveCommand];
		} else if (commandSource === 'bash') {
			shellExecutable = 'bash';
			shellArgs = ['-c', effectiveCommand];
		}

		const child = shellExecutable && shellArgs
			? spawn(shellExecutable, shellArgs, {
				stdio: 'pipe',
				cwd,
				env: { ...process.env, ...hook.env },
			})
			: spawn(effectiveCommand, [], {
				stdio: 'pipe',
				cwd,
				env: { ...process.env, ...hook.env },
				shell: true,
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
					// Use a replacer to convert URI values to filesystem paths.
					// URIs arrive as UriComponents objects via the RPC boundary.
					child.stdin.write(JSON.stringify(input, (_key, value) => {
						if (isUriComponents(value)) {
							return URI.revive(value).fsPath;
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
					resolve({ kind: HookCommandResultKind.Success, result });
				} else if (code === 2) {
					// Blocking error - show stderr to model and stop processing
					resolve({ kind: HookCommandResultKind.Error, result: stderrStr });
				} else {
					// Non-blocking error - show stderr to user only
					resolve({ kind: HookCommandResultKind.NonBlockingError, result: stderrStr });
				}
			});

			child.on('error', err => {
				cleanup();
				reject(err);
			});
		});
	}
}
