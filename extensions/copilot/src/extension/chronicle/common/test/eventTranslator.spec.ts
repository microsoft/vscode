/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import type { ICompletedSpanData } from '../../../../platform/otel/common/otelService';
import type { IDebugLogEntry } from '../../../../platform/chat/common/chatDebugFileLoggerService';
import { createSessionTranslationState, deriveTitleFromUserMessage, isTerminalFlushEvent, makeIdleEvent, makeShutdownEvent, STREAMING_EVENT_TYPES, TERMINAL_FLUSH_EVENT_TYPES, translateDebugLogEntry, translateSpan } from '../eventTranslator';
import type { SessionEvent } from '../cloudSessionTypes';

function makeSpan(overrides: Partial<ICompletedSpanData> = {}): ICompletedSpanData {
	return {
		name: 'test-span',
		spanId: 'span-1',
		traceId: 'trace-1',
		startTime: Date.now(),
		endTime: Date.now() + 100,
		status: { code: 0 },
		attributes: {},
		events: [],
		...overrides,
	};
}

describe('translateSpan', () => {
	it('emits session.start + user.message for first invoke_agent span', () => {
		const state = createSessionTranslationState();
		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'copilot_chat.chat_session_id': 'sess-1',
				'copilot_chat.user_request': 'How do I fix this bug?',
			},
		});

		const events = translateSpan(span, state);

		expect(events.length).toBeGreaterThanOrEqual(2);
		expect(events[0].type).toBe('session.start');
		expect(events[0].parentId).toBeNull();
		expect(events[0].data.producer).toBe('vscode-copilot-chat');
		expect(events[1].type).toBe('user.message');
		expect(events[1].data.content).toBe('How do I fix this bug?');
		expect(events[1].parentId).toBe(events[0].id);
	});

	it('does not emit session.start on subsequent invoke_agent spans', () => {
		const state = createSessionTranslationState();
		const span1 = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'copilot_chat.user_request': 'First message',
			},
		});
		const span2 = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'copilot_chat.user_request': 'Second message',
			},
		});

		translateSpan(span1, state);
		const events = translateSpan(span2, state);

		const starts = events.filter(e => e.type === 'session.start');
		expect(starts).toHaveLength(0);
		expect(events.some(e => e.type === 'user.message' && e.data.content === 'Second message')).toBe(true);
	});

	it('emits assistant.message when output_messages is present', () => {
		const state = createSessionTranslationState();
		const outputMessages = JSON.stringify([
			{ role: 'assistant', parts: [{ type: 'text', content: 'Here is the fix.' }] },
		]);
		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'copilot_chat.user_request': 'Fix it',
				'gen_ai.output.messages': outputMessages,
			},
		});

		const events = translateSpan(span, state);
		const assistantEvents = events.filter(e => e.type === 'assistant.message');
		expect(assistantEvents).toHaveLength(1);
		expect(assistantEvents[0].data.content).toBe('Here is the fix.');
	});

	it('emits tool.result for execute_tool spans', () => {
		const state = createSessionTranslationState();
		state.started = true; // simulate after session.start

		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'execute_tool',
				'gen_ai.tool.name': 'read_file',
				'gen_ai.tool.call.id': 'call-1',
				'gen_ai.tool.result': 'File contents here...',
			},
			status: { code: 0 },
		});

		const events = translateSpan(span, state);

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('tool.execution_complete');
		expect(events[0].data.success).toBe(true);
		expect(events[0].data.result).toBeDefined();
	});

	it('marks tool.result as failed when span status is ERROR', () => {
		const state = createSessionTranslationState();
		state.started = true;

		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'execute_tool',
				'gen_ai.tool.name': 'apply_patch',
			},
			status: { code: 2 }, // ERROR
		});

		const events = translateSpan(span, state);
		expect(events[0].data.success).toBe(false);
		expect(events[0].data.error).toBeDefined();
	});

	it('ignores chat spans without usage token attributes', () => {
		const state = createSessionTranslationState();
		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'chat',
			},
		});

		const events = translateSpan(span, state);
		expect(events).toHaveLength(0);
	});

	it('emits assistant.usage for chat spans with usage tokens', () => {
		const state = createSessionTranslationState();
		state.started = true;

		const span = makeSpan({
			startTime: 1000,
			endTime: 1500,
			attributes: {
				'gen_ai.operation.name': 'chat',
				'gen_ai.response.model': 'claude-sonnet-4-20250514',
				'gen_ai.usage.input_tokens': 12500,
				'gen_ai.usage.output_tokens': 800,
				'gen_ai.usage.cache_read.input_tokens': 5000,
				'copilot_chat.time_to_first_token': 230,
			},
		});

		const events = translateSpan(span, state);

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('assistant.usage');
		expect(events[0].data.model).toBe('claude-sonnet-4-20250514');
		expect(events[0].data.inputTokens).toBe(12500);
		expect(events[0].data.outputTokens).toBe(800);
		expect(events[0].data.cacheReadTokens).toBe(5000);
		expect(events[0].data.timeToFirstTokenMs).toBe(230);
		expect(events[0].data.duration).toBe(500);
		expect(events[0].ephemeral).toBe(true);
	});

	it('emits assistant.usage with request model as fallback', () => {
		const state = createSessionTranslationState();
		state.started = true;

		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'chat',
				'gen_ai.request.model': 'gpt-5.4',
				'gen_ai.usage.input_tokens': 100,
				'gen_ai.usage.output_tokens': 50,
			},
		});

		const events = translateSpan(span, state);

		expect(events).toHaveLength(1);
		expect(events[0].data.model).toBe('gpt-5.4');
		// Optional fields should be absent when not in span
		expect(events[0].data.cacheReadTokens).toBeUndefined();
		expect(events[0].data.timeToFirstTokenMs).toBeUndefined();
	});

	it('emits assistant.usage with subagentId for sub-agent chat spans', () => {
		const state = createSessionTranslationState();
		state.started = true;

		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'chat',
				'gen_ai.response.model': 'claude-sonnet-4-20250514',
				'gen_ai.usage.input_tokens': 200,
				'gen_ai.usage.output_tokens': 100,
			},
		});

		const events = translateSpan(span, state, undefined, 'sub-agent-123');

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('assistant.usage');
		expect(events[0].agentId).toBe('sub-agent-123');
	});

	it('chains parentId across events', () => {
		const state = createSessionTranslationState();
		const span1 = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'copilot_chat.user_request': 'First',
			},
		});
		const span2 = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'copilot_chat.user_request': 'Second',
			},
		});

		const events1 = translateSpan(span1, state);
		const events2 = translateSpan(span2, state);

		// Second batch should chain from last event of first batch
		const lastEvent1 = events1[events1.length - 1];
		expect(events2[0].parentId).toBe(lastEvent1.id);
	});

	it('includes context in session.start when provided', () => {
		const state = createSessionTranslationState();
		const context = { repository: 'microsoft/vscode', branch: 'main', headCommit: 'abc123' };
		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'copilot_chat.user_request': 'Hello',
			},
		});

		const events = translateSpan(span, state, context);
		const ctx = events[0].data.context as Record<string, unknown>;
		expect(ctx.repository).toBe('microsoft/vscode');
		expect(ctx.branch).toBe('main');
		expect(ctx.headCommit).toBe('abc123');
		expect(ctx.hostType).toBe('github');
	});

	it('drops oversized events and keeps parentId chain valid', () => {
		const state = createSessionTranslationState();
		// Assistant text fits, user_request is far larger than MAX_EVENT_SIZE (~100KB).
		const huge = 'x'.repeat(200_000);
		const outputMessages = JSON.stringify([
			{ role: 'assistant', parts: [{ type: 'text', content: 'small reply' }] },
		]);
		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'copilot_chat.user_request': huge,
				'gen_ai.output.messages': outputMessages,
			},
		});

		const events = translateSpan(span, state);

		// user.message should be dropped, session.start + assistant.message kept.
		expect(events.map(e => e.type)).toEqual(['session.start', 'assistant.message']);
		expect(state.droppedCount).toBe(1);
		// Critical: assistant.message must chain to session.start, not the dropped user.message.
		expect(events[1].parentId).toBe(events[0].id);
	});

	it('folds sub-agent spans into parent: skips session.start + user.message and tags agentId', () => {
		// Parent has already started (root invoke_agent emitted session.start + user.message).
		const state = createSessionTranslationState();
		state.started = true;
		state.lastEventId = 'parent-last-event-id';

		const outputMessages = JSON.stringify([
			{ role: 'assistant', parts: [{ type: 'text', content: 'sub-agent reply' }] },
		]);
		const subagentSpan = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'copilot_chat.user_request': 'synthetic prompt to sub-agent',
				'gen_ai.output.messages': outputMessages,
			},
		});

		const events = translateSpan(subagentSpan, state, undefined, 'child-session-id');

		// Only assistant.message should be emitted; session.start (parent owns it)
		// and user.message (synthetic sub-agent prompt) must be suppressed.
		expect(events.map(e => e.type)).toEqual(['assistant.message']);
		expect(events[0].agentId).toBe('child-session-id');
		expect(events[0].parentId).toBe('parent-last-event-id');
	});

	it('tags agentId on tool.execution_start events from sub-agent invoke_agent spans', () => {
		const state = createSessionTranslationState();
		state.started = true;
		state.lastEventId = 'parent-last';

		const outputMessages = JSON.stringify([
			{
				role: 'assistant',
				parts: [
					{ type: 'text', content: 'calling tool' },
					{ type: 'tool-call', toolCallId: 'call-1', toolName: 'read_file', args: { path: 'a.ts' } },
				],
			},
		]);
		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'gen_ai.output.messages': outputMessages,
			},
		});

		const events = translateSpan(span, state, undefined, 'child-session-id');

		expect(events.map(e => e.type)).toEqual(['assistant.message', 'tool.execution_start']);
		expect(events.every(e => e.agentId === 'child-session-id')).toBe(true);
	});

	it('tags agentId on tool.execution_complete events from sub-agent execute_tool spans', () => {
		const state = createSessionTranslationState();
		state.started = true;
		state.lastEventId = 'parent-last';

		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'execute_tool',
				'gen_ai.tool.name': 'read_file',
				'gen_ai.tool.call.id': 'call-1',
				'gen_ai.tool.result': 'file contents',
			},
		});

		const events = translateSpan(span, state, undefined, 'child-session-id');

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('tool.execution_complete');
		expect(events[0].agentId).toBe('child-session-id');
	});

	it('does not set agentId on events from non-sub-agent (root) spans', () => {
		const state = createSessionTranslationState();
		const outputMessages = JSON.stringify([
			{ role: 'assistant', parts: [{ type: 'text', content: 'root reply' }] },
		]);
		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'copilot_chat.user_request': 'hi',
				'gen_ai.output.messages': outputMessages,
			},
		});

		const events = translateSpan(span, state);

		expect(events.map(e => e.type)).toEqual(['session.start', 'user.message', 'session.title_changed', 'assistant.message']);
		expect(events.every(e => e.agentId === undefined)).toBe(true);
	});
});

describe('makeIdleEvent', () => {
	it('creates an ephemeral session.idle event', () => {
		const state = createSessionTranslationState();
		const event = makeIdleEvent(state);
		expect(event.type).toBe('session.idle');
		expect(event.ephemeral).toBe(true);
	});
});

describe('makeShutdownEvent', () => {
	it('creates a session.shutdown event', () => {
		const state = createSessionTranslationState();
		const event = makeShutdownEvent(state);
		expect(event.type).toBe('session.shutdown');
		expect(event.ephemeral).toBeUndefined();
	});

	it('chains parentId from prior events', () => {
		const state = createSessionTranslationState();
		state.lastEventId = 'prev-event-id';
		const event = makeShutdownEvent(state);
		expect(event.parentId).toBe('prev-event-id');
	});
});

// ── translateDebugLogEntry ──────────────────────────────────────────────────

function makeDebugEntry(overrides: Partial<IDebugLogEntry>): IDebugLogEntry {
	return {
		ts: Date.now(),
		dur: 0,
		sid: 'session-1',
		type: 'generic',
		name: '',
		spanId: 'span-1',
		status: 'ok',
		attrs: {},
		...overrides,
	};
}

describe('translateDebugLogEntry', () => {
	it('emits session.start for session_start entry', () => {
		const state = createSessionTranslationState();
		const entry = makeDebugEntry({
			type: 'session_start',
			name: 'session_start',
			attrs: { cwd: '/workspace', repository: 'microsoft/vscode', branch: 'main' },
		});

		const events = translateDebugLogEntry(entry, 'sess-1', state);

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('session.start');
		expect(events[0].data.sessionId).toBe('sess-1');
		expect(events[0].parentId).toBeNull();
		expect((events[0].data.context as Record<string, unknown>).cwd).toBe('/workspace');
		expect((events[0].data.context as Record<string, unknown>).repository).toBe('microsoft/vscode');
		expect(state.started).toBe(true);
	});

	it('does not emit duplicate session.start', () => {
		const state = createSessionTranslationState();
		state.started = true;
		const entry = makeDebugEntry({ type: 'session_start', name: 'session_start' });

		const events = translateDebugLogEntry(entry, 'sess-1', state);
		expect(events).toHaveLength(0);
	});

	it('emits user.message for user_message entry', () => {
		const state = createSessionTranslationState();
		state.started = true;
		const entry = makeDebugEntry({
			type: 'user_message',
			name: 'user_message',
			attrs: { content: 'Fix the bug' },
		});

		const events = translateDebugLogEntry(entry, 'sess-1', state);

		expect(events).toHaveLength(2);
		expect(events[0].type).toBe('user.message');
		expect(events[0].data.content).toBe('Fix the bug');
		expect(events[1].type).toBe('session.title_changed');
		expect(events[1].data.title).toBe('Fix the bug');
	});

	it('emits user.message for turn_start entry with userRequest attr', () => {
		const state = createSessionTranslationState();
		state.started = true;
		const entry = makeDebugEntry({
			type: 'turn_start',
			name: 'turn_start',
			attrs: { userRequest: 'Add tests' },
		});

		const events = translateDebugLogEntry(entry, 'sess-1', state);
		expect(events).toHaveLength(2);
		expect(events[0].type).toBe('user.message');
		expect(events[0].data.content).toBe('Add tests');
		expect(events[1].type).toBe('session.title_changed');
		expect(events[1].data.title).toBe('Add tests');
	});

	it('emits assistant.message for agent_response entry', () => {
		const state = createSessionTranslationState();
		state.started = true;
		const entry = makeDebugEntry({
			type: 'agent_response',
			name: 'agent_response',
			attrs: { response: 'I fixed the bug.' },
		});

		const events = translateDebugLogEntry(entry, 'sess-1', state);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('assistant.message');
		expect(events[0].data.content).toBe('I fixed the bug.');
	});

	it('emits tool.execution_complete for tool_call entry', () => {
		const state = createSessionTranslationState();
		state.started = true;
		const entry = makeDebugEntry({
			type: 'tool_call',
			name: 'read_file',
			spanId: 'tool-span-1',
			status: 'ok',
			attrs: { result: 'file contents here' },
		});

		const events = translateDebugLogEntry(entry, 'sess-1', state);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('tool.execution_complete');
		expect(events[0].data.toolName).toBe('read_file');
		expect(events[0].data.toolCallId).toBe('tool-span-1');
		expect(events[0].data.success).toBe(true);
	});

	it('marks tool as failed for error status', () => {
		const state = createSessionTranslationState();
		state.started = true;
		const entry = makeDebugEntry({
			type: 'tool_call',
			name: 'apply_patch',
			status: 'error',
			attrs: { error: 'Patch failed' },
		});

		const events = translateDebugLogEntry(entry, 'sess-1', state);
		expect(events[0].data.success).toBe(false);
	});

	it('chains parentId across entries', () => {
		const state = createSessionTranslationState();
		const e1 = makeDebugEntry({ type: 'session_start', name: 'session_start' });
		const e2 = makeDebugEntry({ type: 'user_message', name: 'user_message', attrs: { content: 'hello' } });

		const events1 = translateDebugLogEntry(e1, 'sess-1', state);
		const events2 = translateDebugLogEntry(e2, 'sess-1', state);

		expect(events2[0].parentId).toBe(events1[0].id);
	});

	it('ignores unknown entry types', () => {
		const state = createSessionTranslationState();
		const entry = makeDebugEntry({ type: 'generic', name: 'something' });

		const events = translateDebugLogEntry(entry, 'sess-1', state);
		expect(events).toHaveLength(0);
	});

	it('drops oversized entries and keeps parentId chain valid', () => {
		const state = createSessionTranslationState();
		// session.start → kept, huge user_message → dropped, agent_response → kept
		const start = makeDebugEntry({ type: 'session_start', name: 'session_start' });
		const huge = makeDebugEntry({
			type: 'user_message',
			name: 'user_message',
			attrs: { content: 'x'.repeat(200_000) },
		});
		const reply = makeDebugEntry({
			type: 'agent_response',
			name: 'agent_response',
			attrs: { response: 'small reply' },
		});

		const startEvents = translateDebugLogEntry(start, 'sess-1', state);
		const dropped = translateDebugLogEntry(huge, 'sess-1', state);
		const replyEvents = translateDebugLogEntry(reply, 'sess-1', state);

		expect(startEvents).toHaveLength(1);
		expect(dropped).toHaveLength(0);
		expect(state.droppedCount).toBe(1);
		// Critical: assistant.message must chain to session.start, not the dropped user.message.
		expect(replyEvents[0].parentId).toBe(startEvents[0].id);
	});

	it('emits assistant.usage for llm_request entry with token data', () => {
		const state = createSessionTranslationState();
		state.started = true;
		const entry = makeDebugEntry({
			type: 'llm_request',
			name: 'llm_request',
			dur: 450,
			attrs: {
				model: 'claude-sonnet-4-20250514',
				inputTokens: 8000,
				outputTokens: 500,
				cachedTokens: 3000,
				ttft: 120,
			},
		});

		const events = translateDebugLogEntry(entry, 'sess-1', state);

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('assistant.usage');
		expect(events[0].data.model).toBe('claude-sonnet-4-20250514');
		expect(events[0].data.inputTokens).toBe(8000);
		expect(events[0].data.outputTokens).toBe(500);
		expect(events[0].data.cacheReadTokens).toBe(3000);
		expect(events[0].data.timeToFirstTokenMs).toBe(120);
		expect(events[0].data.duration).toBe(450);
		expect(events[0].ephemeral).toBe(true);
	});

	it('ignores llm_request entry without token data', () => {
		const state = createSessionTranslationState();
		state.started = true;
		const entry = makeDebugEntry({
			type: 'llm_request',
			name: 'llm_request',
			attrs: { model: 'gpt-5.4' },
		});

		const events = translateDebugLogEntry(entry, 'sess-1', state);
		expect(events).toHaveLength(0);
	});

	it('accepts cacheReadTokens as fallback field name', () => {
		const state = createSessionTranslationState();
		state.started = true;
		const entry = makeDebugEntry({
			type: 'llm_request',
			name: 'llm_request',
			dur: 200,
			attrs: {
				model: 'gpt-5.4',
				inputTokens: 1000,
				outputTokens: 200,
				cacheReadTokens: 500,
			},
		});

		const events = translateDebugLogEntry(entry, 'sess-1', state);

		expect(events).toHaveLength(1);
		expect(events[0].data.cacheReadTokens).toBe(500);
		expect(events[0].data.timeToFirstTokenMs).toBeUndefined();
	});
});
describe('deriveTitleFromUserMessage', () => {
	it('returns the content unchanged when shorter than the limit', () => {
		expect(deriveTitleFromUserMessage('Fix the bug')).toBe('Fix the bug');
	});

	it('truncates and appends ellipsis when content exceeds the limit', () => {
		const title = deriveTitleFromUserMessage('a'.repeat(80));
		expect(title).toBe('a'.repeat(60) + '...');
	});

	it('returns undefined for empty content', () => {
		expect(deriveTitleFromUserMessage('')).toBeUndefined();
	});
});
describe('terminal / streaming event classification', () => {
	function makeEvent(type: string): SessionEvent {
		return { id: 'e', timestamp: '2024-01-01T00:00:00.000Z', parentId: null, type, data: {} };
	}

	it('marks the documented terminal flush event types', () => {
		expect(TERMINAL_FLUSH_EVENT_TYPES).toEqual(new Set([
			'assistant.message',
			'tool.execution_complete',
			'session.idle',
			'session.shutdown',
			'session.error',
		]));
	});

	it('marks the documented streaming delta event types', () => {
		expect(STREAMING_EVENT_TYPES).toEqual(new Set([
			'assistant.streaming_delta',
			'assistant.reasoning_delta',
			'assistant.message_delta',
			'tool.execution_partial_result',
		]));
	});

	it('terminal and streaming sets are disjoint', () => {
		for (const t of TERMINAL_FLUSH_EVENT_TYPES) {
			expect(STREAMING_EVENT_TYPES.has(t)).toBe(false);
		}
	});

	it('isTerminalFlushEvent recognizes terminal events', () => {
		expect(isTerminalFlushEvent(makeEvent('assistant.message'))).toBe(true);
		expect(isTerminalFlushEvent(makeEvent('tool.execution_complete'))).toBe(true);
		expect(isTerminalFlushEvent(makeEvent('session.shutdown'))).toBe(true);
	});

	it('isTerminalFlushEvent returns false for non-terminal events', () => {
		expect(isTerminalFlushEvent(makeEvent('session.start'))).toBe(false);
		expect(isTerminalFlushEvent(makeEvent('user.message'))).toBe(false);
		expect(isTerminalFlushEvent(makeEvent('assistant.usage'))).toBe(false);
		expect(isTerminalFlushEvent(makeEvent('tool.execution_start'))).toBe(false);
		expect(isTerminalFlushEvent(makeEvent('assistant.streaming_delta'))).toBe(false);
	});
});
