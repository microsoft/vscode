/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { URI, isUriComponents } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions, IOutputChannelRegistry, IOutputService } from '../../../../services/output/common/output.js';
import { HookType, HookTypeValue, IChatRequestHooks, IHookCommand } from '../promptSyntax/hookSchema.js';
import {
	HookCommandResultKind,
	IHookCommandInput,
	IHookCommandResult,
	IPostToolUseCommandInput,
	IPreToolUseCommandInput
} from './hooksCommandTypes.js';
import {
	commonHookOutputValidator,
	IHookResult,
	IPostToolUseCallerInput,
	IPostToolUseHookResult,
	IPreToolUseCallerInput,
	IPreToolUseHookResult,
	postToolUseOutputValidator,
	PreToolUsePermissionDecision,
	preToolUseOutputValidator
} from './hooksTypes.js';

export const hooksOutputChannelId = 'hooksExecution';
const hooksOutputChannelLabel = localize('hooksExecutionChannel', "Hooks");

export interface IHooksExecutionOptions {
	readonly input?: unknown;
	readonly token?: CancellationToken;
}

export interface IHookExecutedEvent {
	readonly hookType: HookTypeValue;
	readonly sessionResource: URI;
	readonly input: unknown;
	readonly results: readonly IHookResult[];
	readonly durationMs: number;
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
	 * Fires when a hook has finished executing.
	 */
	readonly onDidExecuteHook: Event<IHookExecutedEvent>;

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

	/**
	 * Execute postToolUse hooks with typed input and validated output.
	 * Called after a tool completes successfully. The execution service builds the full hook input
	 * from the caller input plus session context.
	 * Returns a combined result with decision and additional context.
	 */
	executePostToolUseHook(sessionResource: URI, input: IPostToolUseCallerInput, token?: CancellationToken): Promise<IPostToolUseHookResult | undefined>;
}

/**
 * Keys that should be redacted when logging hook input.
 */
const redactedInputKeys = ['toolArgs'];

export class HooksExecutionService extends Disposable implements IHooksExecutionService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidExecuteHook = this._register(new Emitter<IHookExecutedEvent>());
	readonly onDidExecuteHook: Event<IHookExecutedEvent> = this._onDidExecuteHook.event;

	private _proxy: IHooksExecutionProxy | undefined;
	private readonly _sessionHooks = new Map<string, IChatRequestHooks>();
	/** Stored transcript path per session (keyed by session URI string). */
	private readonly _sessionTranscriptPaths = new Map<string, URI>();
	private _channelRegistered = false;
	private _requestCounter = 0;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IOutputService private readonly _outputService: IOutputService,
	) {
		super();
	}

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

	/**
	 * JSON.stringify replacer that converts URI / UriComponents values to their string form.
	 */
	private readonly _uriReplacer = (_key: string, value: unknown): unknown => {
		if (URI.isUri(value)) {
			return value.fsPath;
		}
		if (isUriComponents(value)) {
			return URI.revive(value).fsPath;
		}
		return value;
	};

	private async _runSingleHook(
		requestId: number,
		hookType: HookTypeValue,
		hookCommand: IHookCommand,
		sessionResource: URI,
		callerInput: unknown,
		transcriptPath: URI | undefined,
		token: CancellationToken
	): Promise<IHookResult> {
		// Build the common hook input properties.
		// URI values are kept as URI objects through the RPC boundary, and converted
		// to filesystem paths on the extension host side during JSON serialization.
		const commonInput: IHookCommandInput = {
			timestamp: new Date().toISOString(),
			cwd: hookCommand.cwd ?? URI.file(''),
			sessionId: sessionResource.toString(),
			hookEventName: hookType,
			...(transcriptPath ? { transcript_path: transcriptPath } : undefined),
		};

		// Merge common properties with caller-specific input
		const fullInput = !!callerInput && typeof callerInput === 'object'
			? { ...commonInput, ...callerInput }
			: commonInput;

		const hookCommandJson = JSON.stringify(hookCommand, this._uriReplacer);
		this._log(requestId, hookType, `Running: ${hookCommandJson}`);
		const inputForLog = this._redactForLogging(fullInput);
		this._log(requestId, hookType, `Input: ${JSON.stringify(inputForLog, this._uriReplacer)}`);

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
			resultKind: 'error',
			output: errorMessage,
		};
	}

	private _toInternalResult(commandResult: IHookCommandResult): IHookResult {
		switch (commandResult.kind) {
			case HookCommandResultKind.Error: {
				// Blocking error - shown to model
				return this._createErrorResult(
					typeof commandResult.result === 'string' ? commandResult.result : JSON.stringify(commandResult.result)
				);
			}
			case HookCommandResultKind.NonBlockingError: {
				// Non-blocking error - shown to user only as warning
				const errorMessage = typeof commandResult.result === 'string' ? commandResult.result : JSON.stringify(commandResult.result);
				return {
					resultKind: 'warning',
					output: undefined,
					warningMessage: errorMessage,
				};
			}
			case HookCommandResultKind.Success: {
				// For string results, no common fields to extract
				if (typeof commandResult.result !== 'object') {
					return {
						resultKind: 'success',
						output: commandResult.result,
					};
				}

				// Extract and validate common fields
				const validationResult = commonHookOutputValidator.validate(commandResult.result);
				const commonFields = validationResult.error ? {} : validationResult.content;

				// Extract only known hook-specific fields for output
				const resultObj = commandResult.result as Record<string, unknown>;
				const hookOutput = this._extractHookSpecificOutput(resultObj);

				return {
					resultKind: 'success',
					stopReason: commonFields.stopReason,
					warningMessage: commonFields.systemMessage,
					output: Object.keys(hookOutput).length > 0 ? hookOutput : undefined,
				};
			}
			default: {
				// Unexpected result kind - treat as blocking error
				return this._createErrorResult(`Unexpected hook command result kind: ${commandResult.kind}`);
			}
		}
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
		const resultKindStr = result.kind === HookCommandResultKind.Success ? 'Success'
			: result.kind === HookCommandResultKind.NonBlockingError ? 'NonBlockingError'
				: 'Error';
		const resultStr = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
		const hasOutput = resultStr.length > 0 && resultStr !== '{}' && resultStr !== '[]';
		if (hasOutput) {
			this._log(requestId, hookType, `Completed (${resultKindStr}) in ${elapsed}ms`);
			this._log(requestId, hookType, `Output: ${resultStr}`);
		} else {
			this._log(requestId, hookType, `Completed (${resultKindStr}) in ${elapsed}ms, no output`);
		}
	}

	/**
	 * Extract `transcript_path` from hook input if present.
	 * The caller (e.g. SessionStart) may include it as a URI in the input object.
	 */
	private _extractTranscriptPath(input: unknown): URI | undefined {
		if (typeof input !== 'object' || input === null) {
			return undefined;
		}
		const transcriptPath = (input as Record<string, unknown>)['transcriptPath'];
		if (URI.isUri(transcriptPath)) {
			return transcriptPath;
		}
		if (isUriComponents(transcriptPath)) {
			return URI.revive(transcriptPath);
		}
		return undefined;
	}

	registerHooks(sessionResource: URI, hooks: IChatRequestHooks): IDisposable {
		const key = sessionResource.toString();
		this._sessionHooks.set(key, hooks);
		return toDisposable(() => {
			this._sessionHooks.delete(key);
			this._sessionTranscriptPaths.delete(key);
		});
	}

	getHooksForSession(sessionResource: URI): IChatRequestHooks | undefined {
		return this._sessionHooks.get(sessionResource.toString());
	}

	async executeHook(hookType: HookTypeValue, sessionResource: URI, options?: IHooksExecutionOptions): Promise<IHookResult[]> {
		const sw = StopWatch.create();
		const results: IHookResult[] = [];

		try {
			if (!this._proxy) {
				return results;
			}

			const sessionKey = sessionResource.toString();

			// Extract and store transcript_path from input when present (e.g. SessionStart)
			const inputTranscriptPath = this._extractTranscriptPath(options?.input);
			if (inputTranscriptPath) {
				this._sessionTranscriptPaths.set(sessionKey, inputTranscriptPath);
			}

			const hooks = this.getHooksForSession(sessionResource);
			if (!hooks) {
				return results;
			}

			const hookCommands = hooks[hookType];
			if (!hookCommands || hookCommands.length === 0) {
				return results;
			}

			const transcriptPath = this._sessionTranscriptPaths.get(sessionKey);

			const requestId = this._requestCounter++;
			const token = options?.token ?? CancellationToken.None;

			this._logService.debug(`[HooksExecutionService] Executing ${hookCommands.length} hook(s) for type '${hookType}'`);
			this._log(requestId, hookType, `Executing ${hookCommands.length} hook(s)`);

			for (const hookCommand of hookCommands) {
				const result = await this._runSingleHook(requestId, hookType, hookCommand, sessionResource, options?.input, transcriptPath, token);
				results.push(result);

				// If stopReason is set, stop processing remaining hooks
				if (result.stopReason) {
					this._log(requestId, hookType, `Stopping: ${result.stopReason}`);
					break;
				}
			}

			return results;
		} finally {
			this._onDidExecuteHook.fire({
				hookType,
				sessionResource,
				input: options?.input,
				results,
				durationMs: Math.round(sw.elapsed()),
			});
		}
	}

	async executePreToolUseHook(sessionResource: URI, input: IPreToolUseCallerInput, token?: CancellationToken): Promise<IPreToolUseHookResult | undefined> {
		const toolSpecificInput: IPreToolUseCommandInput = {
			tool_name: input.toolName,
			tool_input: input.toolInput,
			tool_use_id: input.toolCallId,
		};

		const results = await this.executeHook(HookType.PreToolUse, sessionResource, {
			input: toolSpecificInput,
			token: token ?? CancellationToken.None,
		});

		// Run all hooks and collapse results. Most restrictive decision wins: deny > ask > allow.
		// Collect all additionalContext strings from every hook.
		const allAdditionalContext: string[] = [];
		let mostRestrictiveDecision: PreToolUsePermissionDecision | undefined;
		let winningResult: IHookResult | undefined;
		let winningReason: string | undefined;
		let lastUpdatedInput: object | undefined;

		for (const result of results) {
			if (result.resultKind === 'success' && typeof result.output === 'object' && result.output !== null) {
				const validationResult = preToolUseOutputValidator.validate(result.output);
				if (!validationResult.error) {
					const hookSpecificOutput = validationResult.content.hookSpecificOutput;
					if (hookSpecificOutput) {
						// Validate hookEventName if present - must match the hook type
						if (hookSpecificOutput.hookEventName !== undefined && hookSpecificOutput.hookEventName !== HookType.PreToolUse) {
							this._logService.warn(`[HooksExecutionService] preToolUse hook returned invalid hookEventName '${hookSpecificOutput.hookEventName}', expected '${HookType.PreToolUse}'`);
							continue;
						}

						// Collect additionalContext from every hook
						if (hookSpecificOutput.additionalContext) {
							allAdditionalContext.push(hookSpecificOutput.additionalContext);
						}

						// Track the last updatedInput (later hooks override earlier ones)
						if (hookSpecificOutput.updatedInput) {
							lastUpdatedInput = hookSpecificOutput.updatedInput;
						}

						// Track the most restrictive decision: deny > ask > allow
						const decision = hookSpecificOutput.permissionDecision;
						if (decision && this._isMoreRestrictive(decision, mostRestrictiveDecision)) {
							mostRestrictiveDecision = decision;
							winningResult = result;
							winningReason = hookSpecificOutput.permissionDecisionReason;
						}
					}
				} else {
					this._logService.warn(`[HooksExecutionService] preToolUse hook output validation failed: ${validationResult.error.message}`);
				}
			}
		}

		if (!mostRestrictiveDecision && !lastUpdatedInput && allAdditionalContext.length === 0) {
			return undefined;
		}

		const baseResult = winningResult ?? results[0];
		return {
			...baseResult,
			permissionDecision: mostRestrictiveDecision,
			permissionDecisionReason: winningReason,
			updatedInput: lastUpdatedInput,
			additionalContext: allAdditionalContext.length > 0 ? allAdditionalContext : undefined,
		};
	}

	/**
	 * Returns true if `candidate` is more restrictive than `current`.
	 * Restriction order: deny > ask > allow.
	 */
	private _isMoreRestrictive(candidate: PreToolUsePermissionDecision, current: PreToolUsePermissionDecision | undefined): boolean {
		const order: Record<PreToolUsePermissionDecision, number> = { 'deny': 2, 'ask': 1, 'allow': 0 };
		return current === undefined || order[candidate] > order[current];
	}

	async executePostToolUseHook(sessionResource: URI, input: IPostToolUseCallerInput, token?: CancellationToken): Promise<IPostToolUseHookResult | undefined> {
		// Check if there are PostToolUse hooks registered before doing any work stringifying tool results
		const hooks = this.getHooksForSession(sessionResource);
		const hookCommands = hooks?.[HookType.PostToolUse];
		if (!hookCommands || hookCommands.length === 0) {
			return undefined;
		}

		// Lazily render tool response text only when hooks are registered
		const toolResponseText = input.getToolResponseText();

		const toolSpecificInput: IPostToolUseCommandInput = {
			tool_name: input.toolName,
			tool_input: input.toolInput,
			tool_response: toolResponseText,
			tool_use_id: input.toolCallId,
		};

		const results = await this.executeHook(HookType.PostToolUse, sessionResource, {
			input: toolSpecificInput,
			token: token ?? CancellationToken.None,
		});

		// Run all hooks and collapse results. Block is the most restrictive decision.
		// Collect all additionalContext strings from every hook.
		const allAdditionalContext: string[] = [];
		let hasBlock = false;
		let blockReason: string | undefined;
		let blockResult: IHookResult | undefined;

		for (const result of results) {
			if (result.resultKind === 'success' && typeof result.output === 'object' && result.output !== null) {
				const validationResult = postToolUseOutputValidator.validate(result.output);
				if (!validationResult.error) {
					const validated = validationResult.content;

					// Validate hookEventName if present
					if (validated.hookSpecificOutput?.hookEventName !== undefined && validated.hookSpecificOutput.hookEventName !== HookType.PostToolUse) {
						this._logService.warn(`[HooksExecutionService] postToolUse hook returned invalid hookEventName '${validated.hookSpecificOutput.hookEventName}', expected '${HookType.PostToolUse}'`);
						continue;
					}

					// Collect additionalContext from every hook
					if (validated.hookSpecificOutput?.additionalContext) {
						allAdditionalContext.push(validated.hookSpecificOutput.additionalContext);
					}

					// Track the first block decision (most restrictive)
					if (validated.decision === 'block' && !hasBlock) {
						hasBlock = true;
						blockReason = validated.reason;
						blockResult = result;
					}
				} else {
					this._logService.warn(`[HooksExecutionService] postToolUse hook output validation failed: ${validationResult.error.message}`);
				}
			}
		}

		// Return combined result if there's a block decision or any additional context
		if (!hasBlock && allAdditionalContext.length === 0) {
			return undefined;
		}

		const baseResult = blockResult ?? results[0];
		return {
			...baseResult,
			decision: hasBlock ? 'block' : undefined,
			reason: blockReason,
			additionalContext: allAdditionalContext.length > 0 ? allAdditionalContext : undefined,
		};
	}
}
