/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../util/vs/base/common/uuid';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName } from '../../../platform/otel/common/genAiAttributes';
import type { ICompletedSpanData } from '../../../platform/otel/common/otelService';
import type { IDebugLogEntry } from '../../../platform/chat/common/chatDebugFileLoggerService';
import type { SessionEvent, WorkingDirectoryContext } from './cloudSessionTypes';

// ── Event size limit (bytes) ────────────────────────────────────────────────────
// Whole events exceeding this size are dropped before buffering.

/** Maximum estimated JSON size for a single event before it is dropped. */
const MAX_EVENT_SIZE = 102_400;

/**
 * Cheap, short-circuiting estimate of the JSON-serialized size of an arbitrary
 * value. Walks strings/arrays/objects accumulating an approximate byte count and
 * bails out as soon as `limit` is reached, so large tool result/argument blobs
 * never trigger an expensive full serialization just to decide they are too big.
 */
function estimateValueSize(value: unknown, limit: number): number {
	if (typeof value === 'string') {
		return value.length + 2; // quotes
	}
	if (value === null || value === undefined) {
		return 4;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return 10;
	}
	if (Array.isArray(value)) {
		let size = 2; // [ ]
		for (const item of value) {
			if (size >= limit) {
				return size;
			}
			size += estimateValueSize(item, limit - size) + 1; // comma
		}
		return size;
	}
	if (typeof value === 'object') {
		let size = 2; // { }
		for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
			if (size >= limit) {
				return size;
			}
			size += key.length + 4; // "key":
			size += estimateValueSize(v, limit - size) + 1; // comma
		}
		return size;
	}
	return 10;
}

/**
 * Estimated JSON size of an event, short-circuiting once `limit` is reached.
 */
function estimateEventSize(event: SessionEvent, limit: number): number {
	// Base overhead: id (36) + timestamp (24) + type (~30) + parentId (36) + structure (~50)
	const base = 176;
	if (base >= limit) {
		return base;
	}
	return base + estimateValueSize(event.data, limit - base);
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
	subagentId?: string,
): SessionEvent[] {
	const operationName = span.attributes[GenAiAttr.OPERATION_NAME] as string | undefined;
	const events: SessionEvent[] = [];

	if (operationName === GenAiOperationName.INVOKE_AGENT) {
		// Extract user message first — needed for session.start summary
		const userRequest = span.attributes[CopilotChatAttr.USER_REQUEST] as string | undefined;

		// First invoke_agent span → session.start.
		// Skip when this span is from a sub-agent: the parent session owns
		// session.start, and sub-agent events fold into the parent's timeline.
		if (!state.started && !subagentId) {
			state.started = true;
			pushEvent(events, state, 'session.start', {
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
			});
		}

		// Emit user.message (matches CLI canonical format).
		// NOTE: do NOT set `source` — the cloud timeline filter treats any
		// `source` other than "user" (per UserMessageSource enum) as a
		// skill/system-injected message and hides it from the timeline.
		// Omitting `source` is normalized to `"user"` on the cloud side.
		//
		// Skip user.message for sub-agent spans — the "user request" of a
		// sub-agent is the synthetic prompt produced by the parent's tool
		// invocation, not a real user turn. The CLI explicitly does NOT bridge
		// user.message events from sub-agents to the parent session.
		if (userRequest && !subagentId) {
			pushEvent(events, state, 'user.message', {
				content: userRequest,
				agentMode: 'interactive',
			});
		}

		// Extract assistant response + tool requests
		const assistantText = extractAssistantText(span);
		const toolRequests = extractToolRequests(span);
		if (assistantText || toolRequests.length > 0) {
			pushEvent(events, state, 'assistant.message', {
				messageId: generateUuid(),
				content: assistantText ?? '',
				toolRequests: toolRequests.length > 0 ? toolRequests : undefined,
			}, /*ephemeral*/ false, subagentId);

			// Emit tool.execution_start for each tool request (matches CLI pattern)
			for (const req of toolRequests) {
				pushEvent(events, state, 'tool.execution_start', {
					toolCallId: req.toolCallId,
					toolName: req.name,
					arguments: req.arguments,
				}, /*ephemeral*/ false, subagentId);
			}
		}
	}

	if (operationName === GenAiOperationName.EXECUTE_TOOL) {
		const toolName = span.attributes[GenAiAttr.TOOL_NAME] as string | undefined;
		if (toolName) {
			const toolCallId = (span.attributes[GenAiAttr.TOOL_CALL_ID] as string | undefined) ?? generateUuid();
			const resultText = span.attributes['gen_ai.tool.result'] as string | undefined;
			const success = span.status.code !== 2; // SpanStatusCode.ERROR = 2
			const resultContent = resultText ?? '';

			// Emit tool.execution_complete (matches CLI format exactly)
			pushEvent(events, state, 'tool.execution_complete', {
				toolCallId,
				success,
				result: success ? {
					content: resultContent,
					detailedContent: resultContent,
				} : undefined,
				error: !success ? {
					message: resultContent || 'Tool execution failed',
					code: 'failure',
				} : undefined,
			}, /*ephemeral*/ false, subagentId);
		}
	}

	return events;
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

// ── Debug log entry → cloud event translation ───────────────────────────────────

/**
 * Translate a JSONL debug log entry into zero or more cloud SessionEvents.
 *
 * Used by the cloud reindex phase to upload historical sessions that were
 * never live-synced. Mirrors the event types produced by {@link translateSpan}
 * so the cloud sees a consistent format regardless of how events were captured.
 *
 * Mutates `state` to maintain parentId chaining across entries.
 */
export function translateDebugLogEntry(
	entry: IDebugLogEntry,
	sessionId: string,
	state: SessionTranslationState,
): SessionEvent[] {
	const events: SessionEvent[] = [];
	const ts = new Date(entry.ts).toISOString();

	switch (entry.type) {
		case 'session_start': {
			if (!state.started) {
				state.started = true;
				pushEventAt(events, state, ts, 'session.start', {
					sessionId,
					version: 1,
					producer: 'vscode-copilot-chat',
					copilotVersion: typeof entry.attrs.copilotVersion === 'string' ? entry.attrs.copilotVersion : '1.0.0',
					startTime: ts,
					context: {
						cwd: typeof entry.attrs.cwd === 'string' ? entry.attrs.cwd : undefined,
						repository: typeof entry.attrs.repository === 'string' ? entry.attrs.repository : undefined,
						hostType: 'github',
						branch: typeof entry.attrs.branch === 'string' ? entry.attrs.branch : undefined,
					},
				});
			}
			break;
		}

		case 'user_message':
		case 'turn_start': {
			const content = typeof entry.attrs.content === 'string'
				? entry.attrs.content
				: typeof entry.attrs.userRequest === 'string'
					? entry.attrs.userRequest
					: undefined;
			if (content) {
				// See translateSpan: do not set `source`, or the cloud renderer
				// will treat the message as synthetic and hide it.
				pushEventAt(events, state, ts, 'user.message', {
					content,
					agentMode: 'interactive',
				});
			}
			break;
		}

		case 'agent_response': {
			const response = typeof entry.attrs.response === 'string' ? entry.attrs.response : undefined;
			if (response) {
				pushEventAt(events, state, ts, 'assistant.message', {
					messageId: generateUuid(),
					content: response,
				});
			}
			break;
		}

		case 'tool_call': {
			const toolName = entry.name;
			if (toolName) {
				const toolCallId = entry.spanId || generateUuid();
				const resultText = typeof entry.attrs.result === 'string' ? entry.attrs.result : undefined;
				const success = entry.status === 'ok';
				const resultContent = resultText ?? '';

				pushEventAt(events, state, ts, 'tool.execution_complete', {
					toolCallId,
					toolName,
					success,
					result: success ? {
						content: resultContent,
						detailedContent: resultContent,
					} : undefined,
					error: !success ? {
						message: resultContent || (typeof entry.attrs.error === 'string' ? entry.attrs.error : 'Tool execution failed'),
						code: 'failure',
					} : undefined,
				});
			}
			break;
		}
	}

	return events;
}

// ── Internal helpers ────────────────────────────────────────────────────────────

function makeEvent(
	state: SessionTranslationState,
	type: string,
	data: Record<string, unknown>,
	ephemeral?: boolean,
): SessionEvent {
	return makeEventAt(state, new Date().toISOString(), type, data, ephemeral);
}

function makeEventAt(
	state: SessionTranslationState,
	timestamp: string,
	type: string,
	data: Record<string, unknown>,
	ephemeral?: boolean,
): SessionEvent {
	const id = generateUuid();
	const event: SessionEvent = {
		id,
		timestamp,
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

/**
 * Build a candidate event, run it past the size gate, and either commit it
 * (push + advance `state.lastEventId`) or drop it (increment `droppedCount`).
 *
 * Only kept events advance `lastEventId`, so the `parentId` chain stays valid
 * even when an event in the middle of a batch is dropped.
 */
function pushEvent(
	events: SessionEvent[],
	state: SessionTranslationState,
	type: string,
	data: Record<string, unknown>,
	ephemeral?: boolean,
	agentId?: string,
): void {
	pushEventAt(events, state, new Date().toISOString(), type, data, ephemeral, agentId);
}

function pushEventAt(
	events: SessionEvent[],
	state: SessionTranslationState,
	timestamp: string,
	type: string,
	data: Record<string, unknown>,
	ephemeral?: boolean,
	agentId?: string,
): void {
	const event: SessionEvent = {
		id: generateUuid(),
		timestamp,
		parentId: state.lastEventId,
		type,
		data,
	};
	if (ephemeral) {
		event.ephemeral = true;
	}
	if (agentId) {
		event.agentId = agentId;
	}
	if (estimateEventSize(event, MAX_EVENT_SIZE + 1) > MAX_EVENT_SIZE) {
		state.droppedCount++;
		return;
	}
	state.lastEventId = event.id;
	events.push(event);
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
