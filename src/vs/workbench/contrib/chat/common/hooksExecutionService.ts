/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';
import { HookType, HookTypeValue, IChatRequestHooks, IHookCommand } from './promptSyntax/hookSchema.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { Extensions, IOutputChannelRegistry, IOutputService } from '../../../services/output/common/output.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { localize } from '../../../../nls.js';
import { vEnum, vObj, vOptionalProp, vString } from '../../../../base/common/validation.js';

export const hooksOutputChannelId = 'hooksExecution';
const hooksOutputChannelLabel = localize('hooksExecutionChannel', "Hooks");

//#region Hook Input Types

/**
 * Common properties added to all hook inputs by the execution service.
 * These are built internally when executing hooks - callers don't provide them.
 */
export interface ICommonHookInput {
	readonly timestamp: string;
	readonly cwd: string;
	readonly sessionId: string;
	readonly hookEventName: string;
}

//#endregion

//#region Common Hook Output

/**
 * Common output fields that can be present in any hook result.
 * These fields control execution flow and user feedback.
 */
export interface ICommonHookOutput {
	/**
	 * If set, stops processing entirely after this hook.
	 * The message is shown to the user but not to the agent.
	 */
	readonly stopReason?: string;
	/**
	 * Message shown to the user.
	 */
	readonly systemMessage?: string;
}

const commonHookOutputValidator = vObj({
	stopReason: vOptionalProp(vString()),
	systemMessage: vOptionalProp(vString()),
});

//#endregion

//#region PreToolUse Hook Types

/**
 * Input provided by the caller when invoking the preToolUse hook.
 * This is the minimal set of data that the tool service knows about.
 */
export interface IPreToolUseCallerInput {
	readonly toolName: string;
	readonly toolArgs: unknown;
}

/**
 * Full input passed to the preToolUse hook.
 * Combines the caller input with common hook properties.
 */
export interface IPreToolUseHookInput extends ICommonHookInput {
	readonly toolName: string;
	readonly toolArgs: unknown;
}

/**
 * Valid permission decisions for preToolUse hooks.
 */
export type PreToolUsePermissionDecision = 'allow' | 'deny';

/**
 * Output from the preToolUse hook.
 */
export interface IPreToolUseHookOutput {
	readonly permissionDecision: PreToolUsePermissionDecision;
	readonly permissionDecisionReason?: string;
}

const preToolUseOutputValidator = vObj({
	permissionDecision: vEnum('allow', 'deny'),
	permissionDecisionReason: vOptionalProp(vString()),
});

//#endregion

export const enum HookCommandResultKind {
	Success = 1,
	Error = 2
}

//#region Hook Result Types

/**
 * Raw result from spawning a hook command.
 * This is the low-level result before semantic processing.
 */
export interface IHookCommandResult {
	readonly kind: HookCommandResultKind;
	/**
	 * For success, this is stdout (parsed as JSON if valid, otherwise string).
	 * For errors, this is stderr.
	 */
	readonly result: string | object;
}

/**
 * Semantic hook result with common fields extracted and defaults applied.
 * This is what callers receive from executeHook.
 */
export interface IHookResult {
	/**
	 * If set, the agent should stop processing entirely after this hook.
	 * The message is shown to the user but not to the agent.
	 */
	readonly stopReason?: string;
	/**
	 * Message shown to the user.
	 */
	readonly messageForUser?: string;
	/**
	 * The hook's output (hook-specific fields only).
	 * For errors, this is the error message string.
	 */
	readonly output: unknown;
	/**
	 * Whether the hook command executed successfully (exit code 0).
	 */
	readonly success: boolean;
}

/**
 * Result from preToolUse hooks with permission decision fields.
 */
export interface IPreToolUseHookResult extends IHookResult {
	readonly permissionDecision?: PreToolUsePermissionDecision;
	readonly permissionDecisionReason?: string;
}

//#endregion

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

	private async _runSingleHook(
		requestId: number,
		hookType: HookTypeValue,
		hookCommand: IHookCommand,
		sessionResource: URI,
		callerInput: unknown,
		token: CancellationToken
	): Promise<IHookResult> {
		// Build the common hook input properties
		const commonInput: ICommonHookInput = {
			timestamp: new Date().toISOString(),
			cwd: hookCommand.cwd?.fsPath ?? '',
			sessionId: sessionResource.toString(),
			hookEventName: hookType,
		};

		// Merge common properties with caller-specific input
		const fullInput = callerInput !== undefined && callerInput !== null && typeof callerInput === 'object'
			? { ...commonInput, ...callerInput }
			: commonInput;

		const hookCommandJson = JSON.stringify({
			...hookCommand,
			cwd: hookCommand.cwd?.fsPath
		});
		this._log(requestId, hookType, `Running: ${hookCommandJson}`);
		// Log input with toolArgs truncated to avoid excessively long logs
		const inputForLog = { ...fullInput as object, toolArgs: '...' };
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
	 * Extract only known hook-specific output fields.
	 * This prevents unknown fields from being passed through.
	 */
	private _extractHookSpecificOutput(result: Record<string, unknown>): Record<string, unknown> {
		const output: Record<string, unknown> = {};

		// PreToolUse hook fields
		if (result.permissionDecision !== undefined) {
			output.permissionDecision = result.permissionDecision;
		}
		if (result.permissionDecisionReason !== undefined) {
			output.permissionDecisionReason = result.permissionDecisionReason;
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
		// Pass the caller input directly - common properties are added in _runSingleHook
		const results = await this.executeHook(HookType.PreToolUse, sessionResource, {
			input,
			token: token ?? CancellationToken.None,
		});

		// Collect all valid outputs - "any deny wins" for security
		let lastAllowResult: IPreToolUseHookResult | undefined;
		for (const result of results) {
			if (result.success && typeof result.output === 'object' && result.output !== null) {
				const validationResult = preToolUseOutputValidator.validate(result.output);
				if (!validationResult.error) {
					const hookOutput = validationResult.content;
					const preToolUseResult: IPreToolUseHookResult = {
						...result,
						permissionDecision: hookOutput.permissionDecision,
						permissionDecisionReason: hookOutput.permissionDecisionReason,
					};

					// If any hook denies, return immediately with that denial
					if (hookOutput.permissionDecision === 'deny') {
						return preToolUseResult;
					}
					// Track the last allow in case we need to return it
					if (hookOutput.permissionDecision === 'allow') {
						lastAllowResult = preToolUseResult;
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
