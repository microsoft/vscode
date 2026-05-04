/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import type { ICompletedSpanData } from '../../../../platform/otel/common/otelService';
import type { IDebugLogEntry } from '../../../../platform/chat/common/chatDebugFileLoggerService';
import { createSessionTranslationState, makeIdleEvent, makeShutdownEvent, translateDebugLogEntry, translateSpan } from '../eventTranslator';

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

	it('ignores non-relevant operation names', () => {
		const state = createSessionTranslationState();
		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'chat',
			},
		});

		const events = translateSpan(span, state);
		expect(events).toHaveLength(0);
	});

	it('truncates oversized user message content', () => {
		const state = createSessionTranslationState();
		const longMessage = 'x'.repeat(20_000);
		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'copilot_chat.user_request': longMessage,
			},
		});

		const events = translateSpan(span, state);
		const userEvent = events.find(e => e.type === 'user.message');
		expect(userEvent).toBeDefined();
		expect((userEvent!.data.content as string).length).toBeLessThan(longMessage.length);
		expect((userEvent!.data.content as string)).toContain('[truncated]');
	});

	it('truncates oversized tool result content', () => {
		const state = createSessionTranslationState();
		state.started = true;
		const longResult = 'x'.repeat(10_000);

		const span = makeSpan({
			attributes: {
				'gen_ai.operation.name': 'execute_tool',
				'gen_ai.tool.name': 'read_file',
				'gen_ai.tool.result': longResult,
			},
		});

		const events = translateSpan(span, state);
		const result = events[0].data.result as { content: string };
		expect(result.content.length).toBeLessThan(longResult.length);
		expect(result.content).toContain('[truncated]');
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

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('user.message');
		expect(events[0].data.content).toBe('Fix the bug');
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
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('user.message');
		expect(events[0].data.content).toBe('Add tests');
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

	it('truncates oversized user message', () => {
		const state = createSessionTranslationState();
		state.started = true;
		const entry = makeDebugEntry({
			type: 'user_message',
			name: 'user_message',
			attrs: { content: 'x'.repeat(20_000) },
		});

		const events = translateDebugLogEntry(entry, 'sess-1', state);
		expect((events[0].data.content as string).length).toBeLessThan(20_000);
		expect((events[0].data.content as string)).toContain('[truncated]');
	});
});
