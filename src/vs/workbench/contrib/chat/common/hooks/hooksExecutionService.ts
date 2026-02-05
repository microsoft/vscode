/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../../base/common/uri.js';
import { HookType, HookTypeValue, IChatRequestHooks, IHookCommand } from '../promptSyntax/hookSchema.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { Extensions, IOutputChannelRegistry, IOutputService } from '../../../../services/output/common/output.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { localize } from '../../../../../nls.js';
import {
	HookCommandResultKind,
	IHookCommandInput,
	IHookCommandResult,
	IPreToolUseCommandInput,
} from './hooksCommandTypes.js';
import {
	commonHookOutputValidator,
	IHookResult,
	IPreToolUseCallerInput,
	IPreToolUseHookResult,
	preToolUseOutputValidator,
} from './hooksTypes.js';

export const hooksOutputChannelId = 'hooksExecution';
const hooksOutputChannelLabel = localize('hooksExecutionChannel', "Hooks");

export interface IHooksExecutionOptions {
	readonly input?: unknown;
	readonly token?: CancellationToken;
}

/**
 * Callback interface for hook execution proxies.
 * MainThreadHooks implements this to forward calls to the extension host.
 */
export interface IHooksExecutionProxy {
	runHookCommand(hookCommand: IHookCommand, input: unknown, token: CancellationToken): Promise<IHookCommandResult>;
}

export const IHooksExecutionService = createDecorator<IHooksExecutionService>('hooksExecutionService');

export interface IHooksExecutionService {
	_serviceBrand: undefined;

	/**
	 * Called by mainThreadHooks when extension host is ready
	 */
	setProxy(proxy: IHooksExecutionProxy): void;

	/**
	 * Register hooks for a session. Returns a disposable that unregisters them.
	 */
	registerHooks(sessionResource: URI, hooks: IChatRequestHooks): IDisposable;

	/**
	 * Get hooks registered for a session.
	 */
	getHooksForSession(sessionResource: URI): IChatRequestHooks | undefined;

	/**
	 * Execute hooks of the given type for the given session
	 */
	executeHook(hookType: HookTypeValue, sessionResource: URI, options?: IHooksExecutionOptions): Promise<IHookResult[]>;

	/**
	 * Execute preToolUse hooks with typed input and validated output.
	 * The execution service builds the full hook input from the caller input plus session context.
	 * Returns a combined result with common fields and permission decision.
	 */
	executePreToolUseHook(sessionResource: URI, input: IPreToolUseCallerInput, token?: CancellationToken): Promise<IPreToolUseHookResult | undefined>;
}

/**
 * Keys that should be redacted when logging hook input.
 */
const redactedInputKeys = ['toolArgs'];

export class HooksExecutionService implements IHooksExecutionService {
	declare readonly _serviceBrand: undefined;

	private _proxy: IHooksExecutionProxy | undefined;
	private readonly _sessionHooks = new Map<string, IChatRequestHooks>();
	private _channelRegistered = false;
	private _requestCounter = 0;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IOutputService private readonly _outputService: IOutputService,
	) { }

	setProxy(proxy: IHooksExecutionProxy): void {
		this._proxy = proxy;
	}

	private _ensureOutputChannel(): void {
		if (this._channelRegistered) {
			return;
		}
		Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).registerChannel({
			id: hooksOutputChannelId,
			label: hooksOutputChannelLabel,
			log: false
		});
		this._channelRegistered = true;
	}

	private _log(requestId: number, hookType: HookTypeValue, message: string): void {
		this._ensureOutputChannel();
		const channel = this._outputService.getChannel(hooksOutputChannelId);
		if (channel) {
			channel.append(`${new Date().toISOString()} [#${requestId}] [${hookType}] ${message}\n`);
		}
	}

	private _redactForLogging(input: object): object {
		const result: Record<string, unknown> = { ...input };
		for (const key of redactedInputKeys) {
			if (Object.hasOwn(result, key)) {
				result[key] = '...';
			}
		}
		return result;
	}

	private async _runSingleHook(
		requestId: number,
		hookType: HookTypeValue,
		hookCommand: IHookCommand,
		sessionResource: URI,
		callerInput: unknown,
		token: CancellationToken
	): Promise<IHookResult> {
		// Build the common hook input properties
		const commonInput: IHookCommandInput = {
			timestamp: new Date().toISOString(),
			cwd: hookCommand.cwd?.fsPath ?? '',
			sessionId: sessionResource.toString(),
			hookEventName: hookType,
		};

		// Merge common properties with caller-specific input
		const fullInput = !!callerInput && typeof callerInput === 'object'
			? { ...commonInput, ...callerInput }
			: commonInput;

		const hookCommandJson = JSON.stringify({
			...hookCommand,
			cwd: hookCommand.cwd?.fsPath
		});
		this._log(requestId, hookType, `Running: ${hookCommandJson}`);
		const inputForLog = this._redactForLogging(fullInput);
		this._log(requestId, hookType, `Input: ${JSON.stringify(inputForLog)}`);

		const sw = StopWatch.create();
		try {
			const commandResult = await this._proxy!.runHookCommand(hookCommand, fullInput, token);
			const result = this._toInternalResult(commandResult);
			this._logCommandResult(requestId, hookType, commandResult, Math.round(sw.elapsed()));
			return result;
		} catch (err) {
			const errMessage = err instanceof Error ? err.message : String(err);
			this._log(requestId, hookType, `Error in ${Math.round(sw.elapsed())}ms: ${errMessage}`);
			return this._createErrorResult(errMessage);
		}
	}

	private _createErrorResult(errorMessage: string): IHookResult {
		return {
			output: errorMessage,
			success: false,
		};
	}

	private _toInternalResult(commandResult: IHookCommandResult): IHookResult {
		if (commandResult.kind !== HookCommandResultKind.Success) {
			return this._createErrorResult(
				typeof commandResult.result === 'string' ? commandResult.result : JSON.stringify(commandResult.result)
			);
		}

		// For string results, no common fields to extract
		if (typeof commandResult.result !== 'object') {
			return {
				output: commandResult.result,
				success: true,
			};
		}

		// Extract and validate common fields
		const validationResult = commonHookOutputValidator.validate(commandResult.result);
		const commonFields = validationResult.error ? {} : validationResult.content;

		// Extract only known hook-specific fields for output
		const resultObj = commandResult.result as Record<string, unknown>;
		const hookOutput = this._extractHookSpecificOutput(resultObj);

		return {
			stopReason: commonFields.stopReason,
			messageForUser: commonFields.systemMessage,
			output: Object.keys(hookOutput).length > 0 ? hookOutput : undefined,
			success: true,
		};
	}

	/**
	 * Extract hook-specific output fields, excluding common fields.
	 */
	private _extractHookSpecificOutput(result: Record<string, unknown>): Record<string, unknown> {
		const commonFields = new Set(['stopReason', 'systemMessage']);
		const output: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(result)) {
			if (value !== undefined && !commonFields.has(key)) {
				output[key] = value;
			}
		}

		return output;
	}

	private _logCommandResult(requestId: number, hookType: HookTypeValue, result: IHookCommandResult, elapsed: number): void {
		const resultKindStr = result.kind === HookCommandResultKind.Success ? 'Success' : 'Error';
		const resultStr = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
		const hasOutput = resultStr.length > 0 && resultStr !== '{}' && resultStr !== '[]';
		if (hasOutput) {
			this._log(requestId, hookType, `Completed (${resultKindStr}) in ${elapsed}ms`);
			this._log(requestId, hookType, `Output: ${resultStr}`);
		} else {
			this._log(requestId, hookType, `Completed (${resultKindStr}) in ${elapsed}ms, no output`);
		}
	}

	registerHooks(sessionResource: URI, hooks: IChatRequestHooks): IDisposable {
		const key = sessionResource.toString();
		this._sessionHooks.set(key, hooks);
		return toDisposable(() => {
			this._sessionHooks.delete(key);
		});
	}

	getHooksForSession(sessionResource: URI): IChatRequestHooks | undefined {
		return this._sessionHooks.get(sessionResource.toString());
	}

	async executeHook(hookType: HookTypeValue, sessionResource: URI, options?: IHooksExecutionOptions): Promise<IHookResult[]> {
		if (!this._proxy) {
			return [];
		}

		const hooks = this.getHooksForSession(sessionResource);
		if (!hooks) {
			return [];
		}

		const hookCommands = hooks[hookType];
		if (!hookCommands || hookCommands.length === 0) {
			return [];
		}

		const requestId = this._requestCounter++;
		const token = options?.token ?? CancellationToken.None;

		this._logService.debug(`[HooksExecutionService] Executing ${hookCommands.length} hook(s) for type '${hookType}'`);
		this._log(requestId, hookType, `Executing ${hookCommands.length} hook(s)`);

		const results: IHookResult[] = [];
		for (const hookCommand of hookCommands) {
			const result = await this._runSingleHook(requestId, hookType, hookCommand, sessionResource, options?.input, token);
			results.push(result);

			// If stopReason is set, stop processing remaining hooks
			if (result.stopReason) {
				this._log(requestId, hookType, `Stopping: ${result.stopReason}`);
				break;
			}
		}

		return results;
	}

	async executePreToolUseHook(sessionResource: URI, input: IPreToolUseCallerInput, token?: CancellationToken): Promise<IPreToolUseHookResult | undefined> {
		// Convert camelCase caller input to snake_case for external command
		const toolSpecificInput: IPreToolUseCommandInput = {
			tool_name: input.toolName,
			tool_input: input.toolInput,
			tool_use_id: input.toolCallId,
		};

		const results = await this.executeHook(HookType.PreToolUse, sessionResource, {
			input: toolSpecificInput,
			token: token ?? CancellationToken.None,
		});

		// Collect all valid outputs - "any deny wins" for security
		let lastAllowResult: IPreToolUseHookResult | undefined;
		for (const result of results) {
			if (result.success && typeof result.output === 'object' && result.output !== null) {
				const validationResult = preToolUseOutputValidator.validate(result.output);
				if (!validationResult.error) {
					// Extract from hookSpecificOutput wrapper
					const hookSpecificOutput = validationResult.content.hookSpecificOutput;
					if (hookSpecificOutput) {
						const preToolUseResult: IPreToolUseHookResult = {
							...result,
							permissionDecision: hookSpecificOutput.permissionDecision,
							permissionDecisionReason: hookSpecificOutput.permissionDecisionReason,
							additionalContext: hookSpecificOutput.additionalContext,
						};

						// If any hook denies, return immediately with that denial
						if (hookSpecificOutput.permissionDecision === 'deny') {
							return preToolUseResult;
						}
						// Track the last allow in case we need to return it
						if (hookSpecificOutput.permissionDecision === 'allow') {
							lastAllowResult = preToolUseResult;
						}
					}
				} else {
					// If validation fails, log a warning and continue to next result
					this._logService.warn(`[HooksExecutionService] preToolUse hook output validation failed: ${validationResult.error.message}`);
				}
			}
		}

		// Return the last allow result, or undefined if no valid outputs
		return lastAllowResult;
	}
}
