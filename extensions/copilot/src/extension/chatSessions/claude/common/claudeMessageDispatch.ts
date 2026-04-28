/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKAssistantMessage, SDKCompactBoundaryMessage, SDKHookProgressMessage, SDKHookResponseMessage, SDKHookStartedMessage, SDKMessage, SDKResultMessage, SDKUserMessage, SDKUserMessageReplay } from '@anthropic-ai/claude-agent-sdk';
import type { TodoWriteInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools';
import type Anthropic from '@anthropic-ai/sdk';
import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { vBoolean, vLiteral, vObj, vString, type ValidatorType } from '../../../../platform/configuration/common/validator';
import { ILogService } from '../../../../platform/log/common/logService';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName, IOTelService, SpanKind, SpanStatusCode, truncateForOTel, type ISpanHandle, type TraceContext } from '../../../../platform/otel/common/index';
import { CapturingToken } from '../../../../platform/requestLogger/common/capturingToken';
import { IRequestLogger } from '../../../../platform/requestLogger/common/requestLogger';
import { ServicesAccessor } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseThinkingProgressPart, LanguageModelTextPart, type ChatHookType } from '../../../../vscodeTypes';
import { ExternalEditTracker } from '../../../chatSessions/common/externalEditTracker';
import { ToolName } from '../../../tools/common/toolNames';
import { IToolsService } from '../../../tools/common/toolsService';
import { ClaudeToolNames, claudeEditTools, getAffectedUrisForEditTool } from './claudeTools';
import { IClaudeSessionStateService } from './claudeSessionStateService';
import { completeToolInvocation, createFormattedToolInvocation } from './toolInvocationFormatter';

// #region Types

/** Per-request state passed to each handler */
export interface MessageHandlerRequestContext {
	readonly stream: vscode.ChatResponseStream;
	readonly toolInvocationToken: vscode.ChatParticipantToolToken;
	readonly token: vscode.CancellationToken;
	readonly editTracker?: ExternalEditTracker;
}

/** Mutable state shared across handlers within a single _processMessages loop */
export interface MessageHandlerState {
	readonly unprocessedToolCalls: Map<string, Anthropic.Beta.Messages.BetaToolUseBlock>;
	readonly otelToolSpans: Map<string, ISpanHandle>;
	readonly otelHookSpans: Map<string, ISpanHandle>;
	readonly parentTraceContext?: TraceContext;
	/** Trace contexts for subagent tool spans, keyed by tool_use_id. Used to parent
	 *  child spans (chat, tool) from subagent messages under the Agent tool span. */
	readonly subagentTraceContexts: Map<string, TraceContext>;
}

export interface MessageHandlerResult {
	/** When true, the current request is complete and should be dequeued */
	readonly requestComplete: boolean;
}

// #endregion

// #region Message key

/**
 * Computes a stable lookup key for an SDK message.
 * Non-system messages use `type`; system messages use `type:subtype`.
 */
export function messageKey(message: SDKMessage): string {
	if (message.type === 'system') {
		return `system:${message.subtype}`;
	}
	return message.type;
}

// #endregion

// #region Known message keys

/**
 * Every message key the Claude Agent SDK can produce.
 * When the SDK adds new types, an unknown key will surface as a warning in logs.
 *
 * Keep this in sync with the SDKMessage union in @anthropic-ai/claude-agent-sdk.
 */
export const ALL_KNOWN_MESSAGE_KEYS = new Set([
	'assistant',
	'user',
	'result',
	'stream_event',
	// TODO: Show `tool_progress` — has `tool_name` and `elapsed_time_seconds` for live tool status
	// low pri, where would we show this?
	'tool_progress',
	// TODO: Show `tool_use_summary` — has `summary` text describing tool execution results
	// low pri, where would we show this?
	'tool_use_summary',
	// TODO: Show `auth_status` — has `output` lines and `error` for auth failures
	'auth_status',
	// TODO: Show `rate_limit_event` — has `rate_limit_info.status` (allowed_warning | rejected) and reset time
	'rate_limit_event',
	// TODO: Show `prompt_suggestion` — has `suggestion` text for follow-up prompts
	// low pri, follow ups are dead
	'prompt_suggestion',
	'system:init',
	'system:compact_boundary',
	'system:status',
	// TODO: Show `system:api_retry` — has `error`, `attempt`, `max_retries` for retry visibility
	'system:api_retry',
	// TODO: Show `system:local_command_output` — has `content` text from local slash commands
	'system:local_command_output',
	'system:hook_started',
	'system:hook_progress',
	'system:hook_response',
	// TODO: Show `system:task_notification` — has `summary` and `status` for subagent completion
	'system:task_notification',
	// TODO: Show `system:task_started` — has `description` and `prompt` for subagent launch
	'system:task_started',
	// TODO: Show `system:task_progress` — has `description` and `summary` for subagent progress
	'system:task_progress',
	'system:files_persisted',
	'system:elicitation_complete',
]);

// #endregion

// #region Individual handlers

export const DENY_TOOL_MESSAGE = 'The user declined to run the tool';

export class KnownClaudeError extends Error { }

interface IManageTodoListToolInputParams {
	readonly operation?: 'write' | 'read';
	readonly todoList: readonly {
		readonly id: number;
		readonly title: string;
		readonly description: string;
		readonly status: 'not-started' | 'in-progress' | 'completed';
	}[];
}

/**
 * Model ID used by the SDK for synthetic messages (e.g., "No response requested." from abort).
 * These should be filtered out from display and processing.
 */
export const SYNTHETIC_MODEL_ID = '<synthetic>';

export function handleAssistantMessage(
	message: SDKAssistantMessage,
	accessor: ServicesAccessor,
	sessionId: string,
	request: MessageHandlerRequestContext,
	state: MessageHandlerState,
): void {
	if (message.message.model === SYNTHETIC_MODEL_ID) {
		accessor.get(ILogService).trace('[ClaudeMessageDispatch] Skipping synthetic message');
		return;
	}

	const logService = accessor.get(ILogService);
	const otelService = accessor.get(IOTelService);
	const { stream } = request;
	const { otelToolSpans, unprocessedToolCalls } = state;

	// Resolve the OTel parent context for spans in this message.
	// If the message is from a subagent (parent_tool_use_id is set), parent spans
	// under the Agent tool's execute_tool span. Otherwise, use the root invoke_agent context.
	const spanParentContext = (message.parent_tool_use_id
		? state.subagentTraceContexts.get(message.parent_tool_use_id)
		: undefined) ?? state.parentTraceContext;

	for (const item of message.message.content) {
		if (item.type === 'text') {
			stream.markdown(item.text);
		} else if (item.type === 'thinking') {
			stream.push(new ChatResponseThinkingProgressPart(item.thinking));
		} else if (item.type === 'tool_use') {
			unprocessedToolCalls.set(item.id, item);

			const toolSpan = otelService.startSpan(`execute_tool ${item.name}`, {
				kind: SpanKind.INTERNAL,
				attributes: {
					[GenAiAttr.OPERATION_NAME]: GenAiOperationName.EXECUTE_TOOL,
					[GenAiAttr.TOOL_NAME]: item.name,
					[GenAiAttr.TOOL_CALL_ID]: item.id,
					[CopilotChatAttr.CHAT_SESSION_ID]: sessionId,
				},
				parentTraceContext: spanParentContext,
			});
			if (item.input !== undefined) {
				try {
					toolSpan.setAttribute(GenAiAttr.TOOL_CALL_ARGUMENTS, truncateForOTel(
						typeof item.input === 'string' ? item.input : JSON.stringify(item.input)
					));
				} catch (e) {
					logService.warn(`[ClaudeMessageDispatch] Failed to serialize tool arguments for ${item.name}: ${e}`);
				}
			}
			otelToolSpans.set(item.id, toolSpan);

			// For Agent/Task (subagent) tool calls, store the span's trace context so that
			// child messages (with parent_tool_use_id = this tool's id) are parented here.
			if (item.name === ClaudeToolNames.Task || item.name === 'Agent') {
				const toolSpanCtx = toolSpan.getSpanContext();
				if (toolSpanCtx) {
					state.subagentTraceContexts.set(item.id, toolSpanCtx);
				}
			}

			if (request.editTracker && claudeEditTools.includes(item.name)) {
				try {
					const uris = getAffectedUrisForEditTool(item.name, item.input);
					void request.editTracker.trackEdit(item.id, uris, stream, request.token);
				} catch (e) {
					logService.warn(`[ClaudeMessageDispatch] Failed to track edit for ${item.name}: ${e}`);
				}
			}

			const invocation = createFormattedToolInvocation(item, false);
			if (invocation) {
				if (message.parent_tool_use_id) {
					invocation.subAgentInvocationId = message.parent_tool_use_id;
				}
				invocation.enablePartialUpdate = true;
				stream.push(invocation);
			}
		}
	}
}

export function handleUserMessage(
	message: SDKUserMessage | SDKUserMessageReplay,
	accessor: ServicesAccessor,
	sessionId: string,
	request: MessageHandlerRequestContext,
	state: MessageHandlerState,
): void {
	if (!Array.isArray(message.message.content)) {
		return;
	}
	for (const toolResult of message.message.content) {
		if (toolResult.type === 'tool_result') {
			processToolResult(toolResult, accessor, sessionId, request, state);
		}
	}
}

function logToolResult(
	toolUseId: string,
	toolUse: Anthropic.Beta.Messages.BetaToolUseBlock,
	toolResult: Anthropic.Messages.ToolResultBlockParam,
	logService: ILogService,
	requestLogger: IRequestLogger,
	otelToolSpans: Map<string, ISpanHandle>,
	capturingToken: CapturingToken | undefined,
): void {
	// OTel span
	const toolSpan = otelToolSpans.get(toolUseId);
	if (toolSpan) {
		if (toolResult.is_error) {
			const errContent = typeof toolResult.content === 'string' ? toolResult.content : 'tool error';
			toolSpan.setStatus(SpanStatusCode.ERROR, errContent);
			toolSpan.setAttribute(GenAiAttr.TOOL_CALL_RESULT, truncateForOTel(`ERROR: ${errContent}`));
		} else {
			toolSpan.setStatus(SpanStatusCode.OK);
			if (toolResult.content !== undefined) {
				try {
					const result = typeof toolResult.content === 'string' ? toolResult.content : JSON.stringify(toolResult.content);
					toolSpan.setAttribute(GenAiAttr.TOOL_CALL_RESULT, truncateForOTel(result));
				} catch (e) {
					logService.warn(`[ClaudeMessageDispatch] Failed to serialize tool result: ${e}`);
				}
			}
		}
		toolSpan.end();
		otelToolSpans.delete(toolUseId);
	}

	// Request logger
	try {
		const resultContent = typeof toolResult.content === 'string'
			? toolResult.content
			: JSON.stringify(toolResult.content, undefined, 2) ?? '';
		const response = { content: [new LanguageModelTextPart(resultContent)] };
		if (capturingToken) {
			void requestLogger.captureInvocation(capturingToken, async () =>
				requestLogger.logToolCall(toolUseId, toolUse.name, toolUse.input, response));
		} else {
			requestLogger.logToolCall(toolUseId, toolUse.name, toolUse.input, response);
		}
	} catch (e) {
		logService.warn(`[ClaudeMessageDispatch] Failed to log tool result: ${e}`);
	}
}

function processToolResult(
	toolResult: Anthropic.Messages.ToolResultBlockParam,
	accessor: ServicesAccessor,
	sessionId: string,
	request: MessageHandlerRequestContext,
	state: MessageHandlerState,
): void {
	const logService = accessor.get(ILogService);
	const requestLogger = accessor.get(IRequestLogger);
	const claudeSessionStateService = accessor.get(IClaudeSessionStateService);

	const { stream } = request;
	const { unprocessedToolCalls, otelToolSpans } = state;

	const toolUseId = toolResult.tool_use_id;
	const toolUse = unprocessedToolCalls.get(toolUseId);
	if (!toolUse) {
		logService.warn(`[ClaudeMessageDispatch] Received tool result for unknown tool use ID: ${toolUseId}`);
		return;
	}

	unprocessedToolCalls.delete(toolUseId);

	logToolResult(
		toolUseId,
		toolUse,
		toolResult,
		logService,
		requestLogger,
		otelToolSpans,
		claudeSessionStateService.getCapturingTokenForSession(sessionId)
	);

	// Tool-specific handling
	if (toolUse.name === ClaudeToolNames.TodoWrite) {
		processTodoWriteTool(toolUse, accessor, request);
	} else if (toolUse.name === ClaudeToolNames.EnterPlanMode) {
		claudeSessionStateService.setPermissionModeForSession(sessionId, 'plan');
	} else if (toolUse.name === ClaudeToolNames.ExitPlanMode) {
		claudeSessionStateService.setPermissionModeForSession(sessionId, 'acceptEdits');
	} else if (claudeEditTools.includes(toolUse.name)) {
		request.editTracker?.completeEdit(toolUseId);
	}

	// Create and push a formatted tool invocation to the stream
	const invocation = createFormattedToolInvocation(toolUse, true);
	if (invocation) {
		invocation.enablePartialUpdate = true;
		invocation.isComplete = true;
		invocation.isError = toolResult.is_error;
		if (toolResult.content === DENY_TOOL_MESSAGE) {
			invocation.isConfirmed = false;
		}
		completeToolInvocation(toolUse, toolResult, invocation);
		stream.push(invocation);
	}
}

function processTodoWriteTool(
	toolUse: Anthropic.Beta.Messages.BetaToolUseBlock,
	accessor: ServicesAccessor,
	request: MessageHandlerRequestContext,
): void {
	const toolsService = accessor.get(IToolsService);
	const input = toolUse.input as TodoWriteInput;
	toolsService.invokeTool(ToolName.CoreManageTodoList, {
		input: {
			operation: 'write',
			todoList: input.todos.map((todo, i) => ({
				id: i,
				title: todo.content,
				description: '',
				status: todo.status === 'pending' ?
					'not-started' :
					(todo.status === 'in_progress' ?
						'in-progress' :
						'completed'),
			} satisfies IManageTodoListToolInputParams['todoList'][number])),
		} satisfies IManageTodoListToolInputParams,
		toolInvocationToken: request.toolInvocationToken,
	}, request.token);
}

export function handleCompactBoundary(
	_message: SDKCompactBoundaryMessage,
	request: MessageHandlerRequestContext,
): void {
	request.stream.markdown(`*${l10n.t('Conversation compacted')}*`);
}

export function handleHookStarted(
	message: SDKHookStartedMessage,
	accessor: ServicesAccessor,
	sessionId: string,
	state: MessageHandlerState,
): void {
	const otelService = accessor.get(IOTelService);
	const span = otelService.startSpan(`${GenAiOperationName.EXECUTE_HOOK} ${message.hook_name}`, {
		kind: SpanKind.INTERNAL,
		attributes: {
			[GenAiAttr.OPERATION_NAME]: GenAiOperationName.EXECUTE_HOOK,
			'copilot_chat.hook_type': message.hook_event,
			'copilot_chat.hook_command': message.hook_name,
			'copilot_chat.hook_id': message.hook_id,
			[CopilotChatAttr.CHAT_SESSION_ID]: sessionId,
		},
		parentTraceContext: state.parentTraceContext,
	});
	state.otelHookSpans.set(message.hook_id, span);
}

// #region Hook JSON output validator

/**
 * Validator for structured JSON output from hooks (exit code 0 only).
 *
 * Hooks can return JSON with these fields:
 * - `continue`: if false, stops processing entirely
 * - `stopReason`: message shown to user when `continue` is false
 * - `systemMessage`: warning shown to user
 * - `decision`: "block" to prevent the operation
 * - `reason`: explanation when `decision` is "block"
 *
 * @see https://code.claude.com/docs/en/hooks.md
 */
const vHookJsonOutput = vObj({
	continue: vBoolean(),
	stopReason: vString(),
	systemMessage: vString(),
	decision: vLiteral('block'),
	reason: vString(),
});

export type HookJsonOutput = ValidatorType<typeof vHookJsonOutput>;

/**
 * Parses JSON output from a hook's stdout.
 * Returns the validated fields, or undefined if parsing/validation fails.
 * Fields that are missing from the JSON are simply absent from the result.
 */
export function parseHookJsonOutput(stdout: string): Partial<HookJsonOutput> | undefined {
	let raw: unknown;
	try {
		raw = JSON.parse(stdout);
	} catch {
		return undefined;
	}

	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return undefined;
	}

	// Use the validator to extract known fields with type safety.
	// vObj skips missing optional fields, so partial results are expected.
	const result = vHookJsonOutput.validate(raw);
	if (result.error) {
		// Validation error means some present field had the wrong type —
		// extract what we can by validating each field individually.
		const obj = raw as Record<string, unknown>;
		const partial: Partial<HookJsonOutput> = {};

		const continueResult = vBoolean().validate(obj['continue']);
		if (!continueResult.error) {
			partial.continue = continueResult.content;
		}
		const stopReasonResult = vString().validate(obj['stopReason']);
		if (!stopReasonResult.error) {
			partial.stopReason = stopReasonResult.content;
		}
		const systemMessageResult = vString().validate(obj['systemMessage']);
		if (!systemMessageResult.error) {
			partial.systemMessage = systemMessageResult.content;
		}
		const decisionResult = vLiteral('block').validate(obj['decision']);
		if (!decisionResult.error) {
			partial.decision = decisionResult.content;
		}
		const reasonResult = vString().validate(obj['reason']);
		if (!reasonResult.error) {
			partial.reason = reasonResult.content;
		}

		return Object.keys(partial).length > 0 ? partial : undefined;
	}

	return result.content;
}

// #endregion

/**
 * Formats a localized error message for a failed hook.
 * @param errorMessage The error message from the hook
 * @returns A localized error message string
 * @todo use a common function with: https://github.com/microsoft/vscode-copilot-chat/blob/9a9461734da42f28e4e2d0b975ebeae6162e9b4c/src/extension/intents/node/hookResultProcessor.ts#L142
 */
function formatHookErrorMessage(errorMessage: string): string {
	if (errorMessage) {
		return l10n.t('A hook prevented chat from continuing. Please check the GitHub Copilot Chat Hooks output channel for more details. \nError message: {0}', errorMessage);
	}
	return l10n.t('A hook prevented chat from continuing. Please check the GitHub Copilot Chat Hooks output channel for more details.');
}


export function handleHookProgress(
	message: SDKHookProgressMessage,
	accessor: ServicesAccessor,
	request: MessageHandlerRequestContext,
): void {
	const logService = accessor.get(ILogService);
	// TODO: can we map these types better
	const hookType = message.hook_event as ChatHookType;
	const progressText = message.stdout || message.stderr;

	logService.trace(`[ClaudeMessageDispatch] Hook progress "${message.hook_name}" (${message.hook_event}): ${progressText}`);

	if (progressText) {
		request.stream.hookProgress(hookType, undefined, progressText);
	}
}

export function handleHookResponse(
	message: SDKHookResponseMessage,
	accessor: ServicesAccessor,
	request: MessageHandlerRequestContext,
	state: MessageHandlerState,
): void {
	const logService = accessor.get(ILogService);
	// TODO: can we map these types better
	const hookType = message.hook_event as ChatHookType;

	// #region OTel span
	const span = state.otelHookSpans.get(message.hook_id);
	if (span) {
		if (message.outcome === 'error') {
			span.setStatus(SpanStatusCode.ERROR, message.stderr || message.output);
		} else if (message.outcome === 'cancelled') {
			span.setStatus(SpanStatusCode.ERROR, 'cancelled');
		} else {
			span.setStatus(SpanStatusCode.OK);
		}
		if (message.exit_code !== undefined) {
			span.setAttribute('copilot_chat.hook_exit_code', message.exit_code);
		}
		if (message.output) {
			span.setAttribute('copilot_chat.hook_output', truncateForOTel(message.output));
		}
		span.end();
		state.otelHookSpans.delete(message.hook_id);
	}
	// #endregion

	// Cancelled — log only, no user-facing output
	if (message.outcome === 'cancelled') {
		logService.trace(`[ClaudeMessageDispatch] Hook "${message.hook_name}" (${message.hook_event}) was cancelled`);
		return;
	}

	// Exit code 2 — blocking error (stderr is the message, JSON ignored)
	if (message.exit_code === 2) {
		const errorMessage = message.stderr || message.output;
		logService.warn(`[ClaudeMessageDispatch] Hook "${message.hook_name}" (${message.hook_event}) blocking error: ${errorMessage}`);
		request.stream.hookProgress(hookType, formatHookErrorMessage(errorMessage));
		return;
	}

	// Other non-zero exit codes — non-blocking warning
	if (message.exit_code !== undefined && message.exit_code !== 0) {
		const warningMessage = message.stderr || message.output;
		const loggedMessage = warningMessage || l10n.t('Exit Code: {0}', message.exit_code);
		logService.warn(`[ClaudeMessageDispatch] Hook "${message.hook_name}" (${message.hook_event}) non-blocking error (exit ${message.exit_code}): ${loggedMessage}`);
		if (warningMessage) {
			request.stream.hookProgress(hookType, undefined, warningMessage);
		}
		return;
	}

	// Outcome 'error' without a specific exit code — treat as blocking error
	if (message.outcome === 'error') {
		const errorMessage = message.stderr || message.output;
		logService.warn(`[ClaudeMessageDispatch] Hook "${message.hook_name}" (${message.hook_event}) failed: ${errorMessage}`);
		request.stream.hookProgress(hookType, formatHookErrorMessage(errorMessage));
		return;
	}

	// Exit code 0 (or undefined with success outcome) — parse JSON from stdout
	if (!message.stdout) {
		return;
	}

	const parsed = parseHookJsonOutput(message.stdout);
	if (!parsed) {
		logService.warn(`[ClaudeMessageDispatch] Hook "${message.hook_name}" returned non-JSON output`);
		return;
	}

	// Handle `decision: "block"` with `reason`
	if (parsed.decision === 'block') {
		request.stream.hookProgress(hookType, formatHookErrorMessage(parsed.reason ?? ''));
		return;
	}

	// Handle `continue: false` with optional `stopReason`
	if (parsed.continue === false) {
		request.stream.hookProgress(hookType, formatHookErrorMessage(parsed.stopReason ?? ''));
		return;
	}

	// Handle `systemMessage` — shown as a warning
	if (parsed.systemMessage) {
		request.stream.hookProgress(hookType, undefined, parsed.systemMessage);
	}
}

export function handleResultMessage(
	message: SDKResultMessage,
	request: MessageHandlerRequestContext,
): MessageHandlerResult {
	if (message.subtype === 'error_max_turns') {
		request.stream.progress(l10n.t('Maximum turns reached ({0})', message.num_turns));
	} else if (message.subtype === 'error_during_execution') {
		throw new KnownClaudeError(l10n.t('Error during execution'));
	}
	return { requestComplete: true };
}

// #endregion

// #region Dispatch

/**
 * Routes an SDK message to the appropriate handler.
 *
 * Designed as an `invokeFunction` target — services are resolved from the DI
 * accessor, extra arguments are passed through.
 *
 * Uses TypeScript discriminated union narrowing — no type assertions needed.
 * Handlers that don't exist for a given key are logged:
 * - Known keys without a handler → trace-logged.
 * - Unknown keys → warn-logged.
 */
export function dispatchMessage(
	accessor: ServicesAccessor,
	message: SDKMessage,
	sessionId: string,
	request: MessageHandlerRequestContext,
	state: MessageHandlerState,
): MessageHandlerResult | undefined {
	const logService = accessor.get(ILogService);

	switch (message.type) {
		case 'assistant':
			handleAssistantMessage(message, accessor, sessionId, request, state);
			return;
		case 'user':
			handleUserMessage(message, accessor, sessionId, request, state);
			return;
		case 'result':
			return handleResultMessage(message, request);
		case 'system':
			if (message.subtype === 'compact_boundary') {
				handleCompactBoundary(message, request);
				return;
			}
			if (message.subtype === 'hook_started') {
				handleHookStarted(message, accessor, sessionId, state);
				return;
			}
			if (message.subtype === 'hook_progress') {
				handleHookProgress(message, accessor, request);
				return;
			}
			if (message.subtype === 'hook_response') {
				handleHookResponse(message, accessor, request, state);
				return;
			}
			break;
	}

	// Not handled — log based on whether the key is expected
	const key = messageKey(message);
	if (ALL_KNOWN_MESSAGE_KEYS.has(key)) {
		logService.trace(`[ClaudeMessageDispatch] Unhandled known message type: ${key}`);
	} else {
		logService.warn(`[ClaudeMessageDispatch] Unknown message type: ${key}`);
	}
	return undefined;
}

// #endregion
