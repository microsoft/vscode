/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { IChatHookService, IPostToolUseHookResult, IPreToolUseHookResult } from '../../../platform/chat/common/chatHookService';
import { IPostToolUseHookCommandInput, IPostToolUseHookSpecificCommandOutput, IPreToolUseHookCommandInput, IPreToolUseHookSpecificCommandOutput } from '../../../platform/chat/common/hookCommandTypes';
import { HookCommandResultKind, IHookCommandResult, IHookExecutor } from '../../../platform/chat/common/hookExecutor';
import { IHooksOutputChannel } from '../../../platform/chat/common/hooksOutputChannel';
import { ISessionTranscriptService } from '../../../platform/chat/common/sessionTranscriptService';
import { ILogService } from '../../../platform/log/common/logService';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName, IOTelService, SpanKind, SpanStatusCode, truncateForOTel } from '../../../platform/otel/common/index';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { raceTimeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { formatHookErrorMessage, processHookResults } from '../../intents/node/hookResultProcessor';
import { IToolsService, isToolValidationError } from '../../tools/common/toolsService';
import { ChatHookTelemetry } from './chatHookTelemetry';

const permissionPriority: Record<string, number> = { 'deny': 2, 'ask': 1, 'allow': 0 };

/**
 * One-way compatible hook event name mappings. When a hook written for one event
 * type is reused under a different type (e.g. a Stop hook scoped to a custom
 * agent runs as SubagentStop), the hookEventName in the output won't match.
 *
 * The map key is the hookEventName from the output; the value is the hook type
 * it should also be accepted for. The mapping is intentionally one-way:
 * a Stop hook is accepted when running as SubagentStop, but a SubagentStop
 * hook's output is NOT accepted when running as a top-level Stop.
 */
const compatibleHookEventNames: ReadonlyMap<vscode.ChatHookType, vscode.ChatHookType> = new Map([
	['Stop', 'SubagentStop'],
	['SessionStart', 'SubagentStart'],
]);

export function isCompatibleHookEventName(hookEventName: string, hookType: string): boolean {
	return hookEventName === hookType || compatibleHookEventNames.get(hookEventName as vscode.ChatHookType) === hookType;
}

/**
 * Keys that should be redacted when logging hook input.
 */
const redactedInputKeys = ['toolArgs', 'tool_input'];

export class ChatHookService implements IChatHookService {
	declare readonly _serviceBrand: undefined;

	private _requestCounter = 0;
	private readonly _telemetry: ChatHookTelemetry;

	constructor(
		@ISessionTranscriptService private readonly _sessionTranscriptService: ISessionTranscriptService,
		@ILogService private readonly _logService: ILogService,
		@IHookExecutor private readonly _hookExecutor: IHookExecutor,
		@IHooksOutputChannel private readonly _outputChannel: IHooksOutputChannel,
		@ITelemetryService telemetryService: ITelemetryService,
		@IToolsService private readonly _toolsService: IToolsService,
		@IOTelService private readonly _otelService: IOTelService,
	) {
		this._telemetry = new ChatHookTelemetry(telemetryService);
	}

	private _log(requestId: number, hookType: string, message: string): void {
		this._outputChannel.appendLine(`[#${requestId}] [${hookType}] ${message}`);
	}

	private _redactForLogging(input: Record<string, unknown>): Record<string, unknown> {
		const result = { ...input };
		for (const key of redactedInputKeys) {
			if (Object.hasOwn(result, key)) {
				result[key] = '...';
			}
		}
		return result;
	}

	private _logCommandResult(requestId: number, hookType: string, commandResult: IHookCommandResult, elapsed: number): void {
		const elapsedRounded = Math.round(elapsed);
		const resultKindStr = commandResult.kind === HookCommandResultKind.Success ? 'Success'
			: commandResult.kind === HookCommandResultKind.NonBlockingError ? 'NonBlockingError'
				: 'Error';
		const resultStr = typeof commandResult.result === 'string' ? commandResult.result : JSON.stringify(commandResult.result);
		const hasOutput = resultStr.length > 0 && resultStr !== '{}' && resultStr !== '[]';
		if (hasOutput) {
			this._log(requestId, hookType, `Completed (${resultKindStr}) in ${elapsedRounded}ms`);
			this._log(requestId, hookType, `Output: ${resultStr}`);
		} else {
			this._log(requestId, hookType, `Completed (${resultKindStr}) in ${elapsedRounded}ms, no output`);
		}
	}

	logConfiguredHooks(hooks: vscode.ChatRequestHooks | undefined): void {
		if (hooks) {
			this._telemetry.logConfiguredHooks(hooks);
		}
	}

	async executeHook(hookType: vscode.ChatHookType, hooks: vscode.ChatRequestHooks | undefined, input: unknown, sessionId?: string, token?: vscode.CancellationToken): Promise<vscode.ChatHookResult[]> {
		if (!hooks) {
			return [];
		}

		const hookCommands = hooks[hookType];
		if (!hookCommands || hookCommands.length === 0) {
			return [];
		}

		const hookCount = hookCommands.length;
		const overallStopWatch = StopWatch.create();
		let hasError = false;
		let hasCaughtException = false;

		try {
			// Flush transcript before running hooks so scripts see up-to-date content
			let transcriptPath: vscode.Uri | undefined;
			if (sessionId) {
				await raceTimeout(this._sessionTranscriptService.flush(sessionId), 500);
				transcriptPath = this._sessionTranscriptService.getTranscriptPath(sessionId);
			}

			// Build common input properties merged with caller-specific input
			const commonInput = {
				timestamp: new Date().toISOString(),
				hook_event_name: hookType,
				...(sessionId ? { session_id: sessionId } : undefined),
				...(transcriptPath ? { transcript_path: transcriptPath.fsPath } : undefined),
			};
			const fullInput = (typeof input === 'object' && input !== null)
				? { ...commonInput, ...input }
				: commonInput;

			const results: vscode.ChatHookResult[] = [];
			const effectiveToken = token ?? CancellationToken.None;
			const requestId = this._requestCounter++;

			this._logService.debug(`[ChatHookService] Executing ${hookCommands.length} hook(s) for type '${hookType}'`);
			this._log(requestId, hookType, `Executing ${hookCommands.length} hook(s)`);

			const chatSessionId = sessionId;

			for (const hookCommand of hookCommands) {
				try {
					// Include per-command cwd in the input
					const commandInput = hookCommand.cwd
						? { ...fullInput, cwd: hookCommand.cwd.fsPath }
						: fullInput;

					this._log(requestId, hookType, `Running: ${JSON.stringify(hookCommand)}`);
					const inputForLog = this._redactForLogging(commandInput as Record<string, unknown>);
					this._log(requestId, hookType, `Input: ${JSON.stringify(inputForLog)}`);

					const span = this._otelService.startSpan(`execute_hook ${hookType}`, {
						kind: SpanKind.INTERNAL,
						attributes: {
							[GenAiAttr.OPERATION_NAME]: GenAiOperationName.EXECUTE_HOOK,
							[CopilotChatAttr.HOOK_TYPE]: hookType,
							'copilot_chat.hook_command': hookCommand.command,
							...(chatSessionId ? { [CopilotChatAttr.CHAT_SESSION_ID]: chatSessionId } : {}),
						},
					});

					try {
						// Capture hook input for debug panel resolve
						try {
							span.setAttribute(CopilotChatAttr.HOOK_INPUT, truncateForOTel(JSON.stringify(commandInput), this._otelService.config.maxAttributeSizeChars));
						} catch { /* swallow serialization errors */ }

						const sw = StopWatch.create();
						const commandResult = await this._hookExecutor.executeCommand(hookCommand, commandInput, effectiveToken);
						const elapsed = sw.elapsed();

						this._logCommandResult(requestId, hookType, commandResult, elapsed);

						// Record result on OTel span
						const resultKind = commandResult.kind === HookCommandResultKind.Success ? 'success'
							: commandResult.kind === HookCommandResultKind.NonBlockingError ? 'non_blocking_error'
								: 'error';
						span.setAttribute(CopilotChatAttr.HOOK_RESULT_KIND, resultKind);

						if (commandResult.kind === HookCommandResultKind.Error || commandResult.kind === HookCommandResultKind.NonBlockingError) {
							hasError = true;
							// Record exit code on error
							if (commandResult.exitCode !== undefined) {
								span.setAttribute('copilot_chat.hook_exit_code', commandResult.exitCode);
							}
							// Error output goes to span status message (displayed as errorMessage in resolve)
							span.setStatus(SpanStatusCode.ERROR, typeof commandResult.result === 'string' ? commandResult.result : undefined);
						} else {
							span.setStatus(SpanStatusCode.OK);
							// Capture hook output for debug panel resolve (success only — errors go to errorMessage)
							try {
								const output = typeof commandResult.result === 'string' ? commandResult.result : JSON.stringify(commandResult.result);
								if (output) {
									span.setAttribute(CopilotChatAttr.HOOK_OUTPUT, truncateForOTel(output, this._otelService.config.maxAttributeSizeChars));
								}
							} catch { /* swallow serialization errors */ }
						}

						const result = this._toHookResult(hookType, commandResult);
						results.push(result);

						// If stopReason is set (including empty string for "stop without message"), stop processing remaining hooks
						if (result.stopReason !== undefined) {
							this._log(requestId, hookType, `Stopping: ${result.stopReason}`);
							this._logService.debug(`[ChatHookService] Stopping after hook: ${result.stopReason}`);
							break;
						}
					} catch (spanErr) {
						const error = spanErr instanceof Error ? spanErr : new Error(String(spanErr));
						span.recordException(error);
						span.setStatus(SpanStatusCode.ERROR, error.message);
						throw spanErr;
					} finally {
						span.end();
					}
				} catch (err) {
					hasCaughtException = true;
					const errMessage = err instanceof Error ? err.message : String(err);
					this._log(requestId, hookType, `Error: ${errMessage}`);
					this._logService.error(err instanceof Error ? err : new Error(errMessage), '[ChatHookService] Error running hook command');
					results.push({
						resultKind: 'warning',
						output: undefined,
						warningMessage: errMessage,
					});
				}
			}

			return results;
		} catch (e) {
			hasCaughtException = true;
			this._logService.error(`[ChatHookService] Error executing ${hookType} hook`, e);
			return [];
		} finally {
			this._telemetry.logHookExecuted(hookType, hookCount, overallStopWatch.elapsed(), hasError, hasCaughtException);
		}
	}

	private _toHookResult(hookType: string, commandResult: IHookCommandResult): vscode.ChatHookResult {
		switch (commandResult.kind) {
			case HookCommandResultKind.Error: {
				// Exit code 2 - blocking error
				// Callers handle this based on hook type (e.g., deny for PreToolUse, blocking reason for Stop)
				const message = typeof commandResult.result === 'string' ? commandResult.result : JSON.stringify(commandResult.result);
				return {
					resultKind: 'error',
					output: message,
				};
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
				if (typeof commandResult.result !== 'object') {
					return {
						resultKind: 'success',
						output: commandResult.result,
					};
				}

				// Extract common fields (continue, stopReason, systemMessage)
				const resultObj = commandResult.result as Record<string, unknown>;
				const stopReason = typeof resultObj['stopReason'] === 'string' ? resultObj['stopReason'] : undefined;
				const continueFlag = resultObj['continue'];
				const systemMessage = typeof resultObj['systemMessage'] === 'string' ? resultObj['systemMessage'] : undefined;

				// Handle continue field: when false, stopReason is effective
				let effectiveStopReason = stopReason;
				if (continueFlag === false && !effectiveStopReason) {
					effectiveStopReason = '';
				}

				// Check hookEventName at top level — if present and mismatched, skip this result
				const topLevelHookEventName = resultObj['hookEventName'];
				if (typeof topLevelHookEventName === 'string' && !isCompatibleHookEventName(topLevelHookEventName, hookType)) {
					this._logService.trace(`[ChatHookService] Ignoring result with mismatched hookEventName '${topLevelHookEventName}' (expected '${hookType}')`);
					return {
						resultKind: 'success',
						output: undefined,
					};
				}

				// Check hookEventName inside hookSpecificOutput — if mismatched, strip hookSpecificOutput but keep the rest
				let stripHookSpecificOutput = false;
				const hookSpecificOutput = resultObj['hookSpecificOutput'];
				if (typeof hookSpecificOutput === 'object' && hookSpecificOutput !== null) {
					const nestedHookEventName = (hookSpecificOutput as Record<string, unknown>)['hookEventName'];
					if (typeof nestedHookEventName === 'string' && !isCompatibleHookEventName(nestedHookEventName, hookType)) {
						this._logService.trace(`[ChatHookService] Stripping hookSpecificOutput with mismatched hookEventName '${nestedHookEventName}' (expected '${hookType}')`);
						stripHookSpecificOutput = true;
					}
				}

				// Extract hook-specific output (everything except common fields)
				const commonFields = new Set(['continue', 'stopReason', 'systemMessage']);
				if (stripHookSpecificOutput) {
					commonFields.add('hookSpecificOutput');
				}
				const hookOutput: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(resultObj)) {
					if (value !== undefined && !commonFields.has(key)) {
						hookOutput[key] = value;
					}
				}

				return {
					resultKind: 'success',
					stopReason: effectiveStopReason,
					warningMessage: systemMessage,
					output: Object.keys(hookOutput).length > 0 ? hookOutput : undefined,
				};
			}
			default:
				return {
					resultKind: 'warning',
					warningMessage: `Unexpected hook command result kind: ${(commandResult as IHookCommandResult).kind}`,
					output: undefined,
				};
		}
	}

	async executePreToolUseHook(toolName: string, toolInput: unknown, toolCallId: string, hooks: vscode.ChatRequestHooks | undefined, sessionId?: string, token?: vscode.CancellationToken, outputStream?: vscode.ChatResponseStream): Promise<IPreToolUseHookResult | undefined> {
		const hookInput: IPreToolUseHookCommandInput = {
			tool_name: toolName,
			tool_input: toolInput,
			tool_use_id: toolCallId,
		};
		const results = await this.executeHook(
			'PreToolUse',
			hooks,
			hookInput,
			sessionId,
			token
		);

		if (results.length === 0) {
			return undefined;
		}

		// Collapse results: deny > ask > allow (most restrictive wins),
		// collect all additionalContext, last updatedInput wins
		let mostRestrictiveDecision: 'allow' | 'deny' | 'ask' | undefined;
		let winningReason: string | undefined;
		let lastUpdatedInput: object | undefined;
		const allAdditionalContext: string[] = [];

		processHookResults({
			hookType: 'PreToolUse',
			results,
			outputStream,
			logService: this._logService,
			onSuccess: (output) => {
				if (typeof output !== 'object' || output === null) {
					return;
				}

				const hookOutput = output as { hookSpecificOutput?: IPreToolUseHookSpecificCommandOutput };
				const hookSpecificOutput = hookOutput.hookSpecificOutput;
				if (!hookSpecificOutput) {
					return;
				}

				if (hookSpecificOutput.additionalContext) {
					allAdditionalContext.push(hookSpecificOutput.additionalContext);
				}

				if (hookSpecificOutput.updatedInput) {
					lastUpdatedInput = hookSpecificOutput.updatedInput;
				}

				const decision = hookSpecificOutput.permissionDecision;
				if (decision && !(decision in permissionPriority)) {
					const message = `Invalid permissionDecision value '${String(decision)}'. Expected 'allow', 'deny', or 'ask'. Field was ignored.`;
					this._logService.warn(`[ChatHookService] ${message}`);
					this._outputChannel.appendLine(`[PreToolUse] ${message}`);
				} else if (decision && (mostRestrictiveDecision === undefined || (permissionPriority[decision] ?? 0) > (permissionPriority[mostRestrictiveDecision] ?? 0))) {
					mostRestrictiveDecision = decision;
					winningReason = hookSpecificOutput.permissionDecisionReason;
				}
			},
			// Exit code 2 (error) means deny the tool
			onError: (errorMessage) => {
				const messageWithTool = errorMessage
					? l10n.t('Tried to use {0} - {1}', toolName, errorMessage)
					: l10n.t('Tried to use {0} - an unexpected error occurred', toolName);
				outputStream?.hookProgress('PreToolUse', formatHookErrorMessage(messageWithTool));
				mostRestrictiveDecision = 'deny';
				winningReason = messageWithTool || winningReason;
			},
		});

		// Validate updatedInput against the tool's input schema before returning it
		if (lastUpdatedInput) {
			const validationResult = this._toolsService.validateToolInput(toolName, JSON.stringify(lastUpdatedInput));
			if (isToolValidationError(validationResult)) {
				const message = `Discarding updatedInput for tool '${toolName}': schema validation failed: ${validationResult.error}`;
				this._logService.warn(`[ChatHookService] ${message}`);
				this._outputChannel.appendLine(`[PreToolUse] ${message}`);
				lastUpdatedInput = undefined;
			}
		}

		if (!mostRestrictiveDecision && !lastUpdatedInput && allAdditionalContext.length === 0) {
			return undefined;
		}

		const hookResult: IPreToolUseHookResult = {
			permissionDecision: mostRestrictiveDecision,
			permissionDecisionReason: winningReason,
			updatedInput: lastUpdatedInput,
			additionalContext: allAdditionalContext.length > 0 ? allAdditionalContext : undefined,
		};

		this._telemetry.logPreToolUseResult(hookResult);

		return hookResult;
	}

	async executePostToolUseHook(toolName: string, toolInput: unknown, toolResponseText: string, toolCallId: string, hooks: vscode.ChatRequestHooks | undefined, sessionId?: string, token?: vscode.CancellationToken, outputStream?: vscode.ChatResponseStream): Promise<IPostToolUseHookResult | undefined> {
		const hookInput: IPostToolUseHookCommandInput = {
			tool_name: toolName,
			tool_input: toolInput,
			tool_response: toolResponseText,
			tool_use_id: toolCallId,
		};
		const results = await this.executeHook(
			'PostToolUse',
			hooks,
			hookInput,
			sessionId,
			token
		);

		if (results.length === 0) {
			return undefined;
		}

		// Collapse results: first block wins, collect all additionalContext
		let hasBlock = false;
		let blockReason: string | undefined;
		const allAdditionalContext: string[] = [];

		processHookResults({
			hookType: 'PostToolUse',
			results,
			outputStream,
			logService: this._logService,
			onSuccess: (output) => {
				if (typeof output !== 'object' || output === null) {
					return;
				}

				const hookOutput = output as {
					decision?: string;
					reason?: string;
					hookSpecificOutput?: IPostToolUseHookSpecificCommandOutput;
				};

				// Collect additionalContext from hookSpecificOutput
				if (hookOutput.hookSpecificOutput?.additionalContext) {
					allAdditionalContext.push(hookOutput.hookSpecificOutput.additionalContext);
				}

				// Track the first block decision
				if (hookOutput.decision === 'block' && !hasBlock) {
					hasBlock = true;
					blockReason = hookOutput.reason;
				} else if (hookOutput.decision !== undefined && hookOutput.decision !== 'block') {
					const message = `Invalid PostToolUse decision value '${String(hookOutput.decision)}'. Expected 'block'. Field was ignored.`;
					this._logService.warn(`[ChatHookService] ${message}`);
					this._outputChannel.appendLine(`[PostToolUse] ${message}`);
				}
			},
			// Exit code 2 (error) means block the tool result
			onError: (errorMessage) => {
				if (!hasBlock) {
					hasBlock = true;
					const messageWithTool = errorMessage
						? l10n.t('Tried to use {0} - {1}', toolName, errorMessage)
						: l10n.t('Tried to use {0} - an unexpected error occurred', toolName);
					blockReason = messageWithTool || undefined;
					outputStream?.hookProgress('PostToolUse', formatHookErrorMessage(messageWithTool));
				} else {
					const messageWithTool = errorMessage
						? l10n.t('Tried to use {0} - {1}', toolName, errorMessage)
						: l10n.t('Tried to use {0} - an unexpected error occurred', toolName);
					outputStream?.hookProgress('PostToolUse', undefined, formatHookErrorMessage(messageWithTool));
				}
			},
		});

		if (!hasBlock && allAdditionalContext.length === 0) {
			return undefined;
		}

		const hookResult: IPostToolUseHookResult = {
			decision: hasBlock ? 'block' : undefined,
			reason: blockReason,
			additionalContext: allAdditionalContext.length > 0 ? allAdditionalContext : undefined,
		};

		this._telemetry.logPostToolUseResult(hookResult);

		return hookResult;
	}
}
