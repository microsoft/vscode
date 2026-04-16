/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../util/vs/base/common/uuid';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName } from '../../../platform/otel/common/genAiAttributes';
import type { ICompletedSpanData } from '../../../platform/otel/common/otelService';
import type { SessionEvent, WorkingDirectoryContext } from './cloudSessionTypes';

// ── Content size limits (bytes) ─────────────────────────────────────────────────
// Truncate content before buffering to keep memory and payload sizes bounded.

/** Maximum size for user message content. */
const MAX_USER_MESSAGE_SIZE = 10_240;

/** Maximum size for assistant message content. */
const MAX_ASSISTANT_MESSAGE_SIZE = 10_240;

/** Maximum size for tool result content blocks. */
const MAX_TOOL_RESULT_SIZE = 5_120;

/** Maximum estimated JSON size for a single event before it is dropped. */
const MAX_EVENT_SIZE = 51_200;

/**
 * Truncate a string to a maximum byte length (UTF-8 approximation).
 */
function truncate(str: string, maxBytes: number): string {
	if (str.length <= maxBytes) {
		return str;
	}
	return str.slice(0, maxBytes) + '... [truncated]';
}

/**
 * Rough estimate of the JSON-serialized size of an event.
 * Avoids the cost of actual serialization.
 */
function estimateEventSize(event: SessionEvent): number {
	// Base overhead: id (36) + timestamp (24) + type (~30) + parentId (36) + structure (~50)
	let size = 176;
	const data = event.data;
	for (const value of Object.values(data)) {
		if (typeof value === 'string') {
			size += value.length;
		} else if (typeof value === 'object' && value !== null) {
			// Rough estimate for nested objects
			size += JSON.stringify(value).length;
		} else {
			size += 10;
		}
	}
	return size;
}

/**
 * Tracks per-session state needed for event translation.
 */
export interface SessionTranslationState {
	/** Whether session.start has been emitted. */
	started: boolean;
	/** ID of the last event emitted (for parentId chaining). */
	lastEventId: string | null;
	/** Number of events dropped due to size gate. */
	droppedCount: number;
}

/**
 * Create a fresh translation state for a new session.
 */
export function createSessionTranslationState(): SessionTranslationState {
	return { started: false, lastEventId: null, droppedCount: 0 };
}

/**
 * Translate a completed OTel span into zero or more cloud SessionEvents.
 *
 * Returns the events to buffer, or an empty array if the span is not relevant.
 * Mutates `state` to track parentId chaining and session.start emission.
 *
 * @internal Exported for testing.
 */
export function translateSpan(
	span: ICompletedSpanData,
	state: SessionTranslationState,
	context?: WorkingDirectoryContext,
): SessionEvent[] {
	const operationName = span.attributes[GenAiAttr.OPERATION_NAME] as string | undefined;
	const events: SessionEvent[] = [];

	if (operationName === GenAiOperationName.INVOKE_AGENT) {
		// Extract user message first — needed for session.start summary
		const userRequest = span.attributes[CopilotChatAttr.USER_REQUEST] as string | undefined;

		// First invoke_agent span → session.start
		if (!state.started) {
			state.started = true;
			events.push(makeEvent(state, 'session.start', {
				sessionId: getSessionId(span) ?? generateUuid(),
				version: 1,
				producer: 'vscode-copilot-chat',
				copilotVersion: '1.0.0',
				startTime: new Date(span.startTime).toISOString(),
				selectedModel: span.attributes[GenAiAttr.REQUEST_MODEL] as string | undefined,
				context: {
					cwd: context?.cwd,
					repository: context?.repository,
					hostType: 'github',
					branch: context?.branch,
					headCommit: context?.headCommit,
				},
			}));
		}

		// Emit user.message (matches CLI format)
		if (userRequest) {
			events.push(makeEvent(state, 'user.message', {
				content: truncate(userRequest, MAX_USER_MESSAGE_SIZE),
				source: 'chat',
				agentMode: 'interactive',
			}));
		}

		// Extract assistant response + tool requests
		const assistantText = extractAssistantText(span);
		const toolRequests = extractToolRequests(span);
		if (assistantText || toolRequests.length > 0) {
			events.push(makeEvent(state, 'assistant.message', {
				messageId: generateUuid(),
				content: truncate(assistantText ?? '', MAX_ASSISTANT_MESSAGE_SIZE),
				toolRequests: toolRequests.length > 0 ? toolRequests : undefined,
			}));

			// Emit tool.execution_start for each tool request (matches CLI pattern)
			for (const req of toolRequests) {
				events.push(makeEvent(state, 'tool.execution_start', {
					toolCallId: req.toolCallId,
					toolName: req.name,
					arguments: req.arguments,
				}));
			}
		}
	}

	if (operationName === GenAiOperationName.EXECUTE_TOOL) {
		const toolName = span.attributes[GenAiAttr.TOOL_NAME] as string | undefined;
		if (toolName) {
			const toolCallId = (span.attributes[GenAiAttr.TOOL_CALL_ID] as string | undefined) ?? generateUuid();
			const resultText = span.attributes['gen_ai.tool.result'] as string | undefined;
			const success = span.status.code !== 2; // SpanStatusCode.ERROR = 2
			const truncatedResult = resultText ? truncate(resultText, MAX_TOOL_RESULT_SIZE) : '';

			// Emit tool.execution_complete (matches CLI format exactly)
			events.push(makeEvent(state, 'tool.execution_complete', {
				toolCallId,
				success,
				result: success ? {
					content: truncatedResult,
					detailedContent: truncatedResult,
				} : undefined,
				error: !success ? {
					message: truncatedResult || 'Tool execution failed',
					code: 'failure',
				} : undefined,
			}));
		}
	}

	// Filter out oversized events
	return events.filter(event => {
		const size = estimateEventSize(event);
		if (size > MAX_EVENT_SIZE) {
			state.droppedCount++;
			return false;
		}
		return true;
	});
}

/**
 * Create a session.idle event (emitted when the chat session becomes idle).
 */
export function makeIdleEvent(state: SessionTranslationState): SessionEvent {
	return makeEvent(state, 'session.idle', {}, true);
}

/**
 * Create a session.shutdown event (emitted when the chat session is disposed).
 */
export function makeShutdownEvent(state: SessionTranslationState): SessionEvent {
	return makeEvent(state, 'session.shutdown', {});
}

// ── Internal helpers ────────────────────────────────────────────────────────────

function makeEvent(
	state: SessionTranslationState,
	type: string,
	data: Record<string, unknown>,
	ephemeral?: boolean,
): SessionEvent {
	const id = generateUuid();
	const event: SessionEvent = {
		id,
		timestamp: new Date().toISOString(),
		parentId: state.lastEventId,
		type,
		data,
	};
	if (ephemeral) {
		event.ephemeral = true;
	}
	state.lastEventId = id;
	return event;
}

function getSessionId(span: ICompletedSpanData): string | undefined {
	return (span.attributes[CopilotChatAttr.CHAT_SESSION_ID] as string | undefined)
		?? (span.attributes[GenAiAttr.CONVERSATION_ID] as string | undefined)
		?? (span.attributes[CopilotChatAttr.SESSION_ID] as string | undefined);
}

/**
 * Extract assistant response text from gen_ai.output.messages attribute.
 * Format: [{"role":"assistant","parts":[{"type":"text","content":"..."}]}]
 */
function extractAssistantText(span: ICompletedSpanData): string | undefined {
	const raw = span.attributes[GenAiAttr.OUTPUT_MESSAGES] as string | undefined;
	if (!raw) {
		return undefined;
	}
	try {
		const messages = JSON.parse(raw) as { role: string; parts: { type: string; content: string }[] }[];
		const parts = messages
			.filter(m => m.role === 'assistant')
			.flatMap(m => m.parts)
			.filter(p => p.type === 'text')
			.map(p => p.content);
		return parts.length > 0 ? parts.join('\n') : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Extract tool requests from gen_ai.output.messages (assistant messages with tool_calls).
 * CLI format: [{toolCallId, name, arguments, type}]
 */
function extractToolRequests(span: ICompletedSpanData): { toolCallId: string; name: string; arguments: unknown; type: string }[] {
	const raw = span.attributes[GenAiAttr.OUTPUT_MESSAGES] as string | undefined;
	if (!raw) {
		return [];
	}
	try {
		const messages = JSON.parse(raw) as { role: string; parts: { type: string; toolCallId?: string; toolName?: string; args?: unknown }[] }[];
		const toolParts = messages
			.filter(m => m.role === 'assistant')
			.flatMap(m => m.parts)
			.filter(p => p.type === 'tool-call' && p.toolCallId && p.toolName);
		return toolParts.map(p => ({
			toolCallId: p.toolCallId!,
			name: p.toolName!,
			arguments: p.args ?? {},
			type: 'function',
		}));
	} catch {
		return [];
	}
}
