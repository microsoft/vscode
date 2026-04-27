/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OTelSqliteStore } from '../otelSqliteStore';
import { SpanStatusCode, type ICompletedSpanData } from '../../../common/otelService';

function makeSpan(overrides: Partial<ICompletedSpanData> & { spanId: string; traceId: string }): ICompletedSpanData {
	return {
		name: overrides.name ?? 'test-span',
		spanId: overrides.spanId,
		traceId: overrides.traceId,
		parentSpanId: overrides.parentSpanId,
		startTime: overrides.startTime ?? 1700000000000,
		endTime: overrides.endTime ?? 1700000001000,
		status: overrides.status ?? { code: SpanStatusCode.OK },
		attributes: overrides.attributes ?? {},
		events: overrides.events ?? [],
	};
}

describe('OTelSqliteStore', () => {
	let store: OTelSqliteStore;

	beforeEach(() => {
		store = new OTelSqliteStore(':memory:');
	});

	afterEach(() => {
		store.close();
	});

	it('inserts and retrieves a span by trace ID', () => {
		store.insertSpan(makeSpan({
			spanId: 'span-1',
			traceId: 'trace-1',
			name: 'invoke_agent copilot',
			attributes: {
				'gen_ai.operation.name': 'invoke_agent',
				'gen_ai.agent.name': 'copilot',
				'gen_ai.conversation.id': 'session-123',
			},
		}));

		const spans = store.getSpansByTraceId('trace-1');
		expect(spans).toHaveLength(1);
		expect(spans[0].span_id).toBe('span-1');
		expect(spans[0].operation_name).toBe('invoke_agent');
		expect(spans[0].agent_name).toBe('copilot');
		expect(spans[0].conversation_id).toBe('session-123');
	});

	it('stores and retrieves all span attributes', () => {
		store.insertSpan(makeSpan({
			spanId: 'span-1',
			traceId: 'trace-1',
			attributes: {
				'gen_ai.operation.name': 'chat',
				'gen_ai.response.model': 'gpt-4o',
				'gen_ai.output.messages': '[{"role":"assistant","parts":[{"type":"text","content":"Hello"}]}]',
				'gen_ai.usage.input_tokens': 100,
				'gen_ai.usage.output_tokens': 50,
			},
		}));

		const attrs = store.getSpanAttributes('span-1');
		expect(attrs.length).toBeGreaterThanOrEqual(5);

		const outputMsg = store.getSpanAttribute('span-1', 'gen_ai.output.messages');
		expect(outputMsg).toContain('Hello');

		const spans = store.getSpansByTraceId('trace-1');
		expect(spans[0].response_model).toBe('gpt-4o');
		expect(spans[0].input_tokens).toBe(100);
		expect(spans[0].output_tokens).toBe(50);
	});

	it('stores and retrieves span events', () => {
		store.insertSpan(makeSpan({
			spanId: 'span-1',
			traceId: 'trace-1',
			events: [
				{ name: 'user_message', timestamp: 1700000000500, attributes: { content: 'Help me' } },
			],
		}));

		const events = store.getSpanEvents('span-1');
		expect(events).toHaveLength(1);
		expect(events[0].name).toBe('user_message');
		expect(events[0].timestamp_ms).toBe(1700000000500);

		const attrs = JSON.parse(events[0].attributes!);
		expect(attrs.content).toBe('Help me');
	});

	it('builds parent-child hierarchy', () => {
		store.insertSpan(makeSpan({
			spanId: 'parent',
			traceId: 'trace-1',
			name: 'invoke_agent',
			attributes: { 'gen_ai.operation.name': 'invoke_agent' },
		}));
		store.insertSpan(makeSpan({
			spanId: 'child-chat',
			traceId: 'trace-1',
			parentSpanId: 'parent',
			name: 'chat gpt-4o',
			startTime: 1700000001000,
			attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.response.model': 'gpt-4o' },
		}));
		store.insertSpan(makeSpan({
			spanId: 'child-tool',
			traceId: 'trace-1',
			parentSpanId: 'child-chat',
			name: 'execute_tool read_file',
			startTime: 1700000002000,
			attributes: { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'read_file' },
		}));

		const spans = store.getSpansByTraceId('trace-1');
		expect(spans).toHaveLength(3);
		// Ordered by start_time_ms
		expect(spans[0].span_id).toBe('parent');
		expect(spans[1].span_id).toBe('child-chat');
		expect(spans[2].span_id).toBe('child-tool');
		expect(spans[2].parent_span_id).toBe('child-chat');
		expect(spans[2].tool_name).toBe('read_file');
	});

	it('retrieves spans by conversation ID', () => {
		store.insertSpan(makeSpan({
			spanId: 'span-1',
			traceId: 'trace-1',
			attributes: { 'gen_ai.conversation.id': 'conv-abc' },
		}));
		store.insertSpan(makeSpan({
			spanId: 'span-2',
			traceId: 'trace-2',
			attributes: { 'gen_ai.conversation.id': 'conv-xyz' },
		}));

		const result = store.getSpansByConversationId('conv-abc');
		expect(result).toHaveLength(1);
		expect(result[0].span_id).toBe('span-1');
	});

	it('retrieves distinct trace IDs', () => {
		store.insertSpan(makeSpan({ spanId: 's1', traceId: 'trace-a' }));
		store.insertSpan(makeSpan({ spanId: 's2', traceId: 'trace-a' }));
		store.insertSpan(makeSpan({ spanId: 's3', traceId: 'trace-b' }));

		const traceIds = store.getTraceIds();
		expect(traceIds).toHaveLength(2);
		expect(traceIds).toContain('trace-a');
		expect(traceIds).toContain('trace-b');
	});

	it('cleans up old spans', () => {
		const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
		store.insertSpan(makeSpan({
			spanId: 'old-span',
			traceId: 'trace-old',
			startTime: oldTime,
			endTime: oldTime + 1000,
		}));
		store.insertSpan(makeSpan({
			spanId: 'new-span',
			traceId: 'trace-new',
			startTime: Date.now() - 1000,
			endTime: Date.now(),
		}));

		const deleted = store.cleanup(7 * 24 * 60 * 60 * 1000);
		expect(deleted).toBe(1);

		expect(store.getSpansByTraceId('trace-old')).toHaveLength(0);
		expect(store.getSpansByTraceId('trace-new')).toHaveLength(1);
	});

	it('handles INSERT OR REPLACE for duplicate span IDs', () => {
		store.insertSpan(makeSpan({
			spanId: 'span-1',
			traceId: 'trace-1',
			attributes: { 'gen_ai.agent.name': 'original' },
		}));
		store.insertSpan(makeSpan({
			spanId: 'span-1',
			traceId: 'trace-1',
			attributes: { 'gen_ai.agent.name': 'updated' },
		}));

		const spans = store.getSpansByTraceId('trace-1');
		expect(spans).toHaveLength(1);
		expect(spans[0].agent_name).toBe('updated');
	});

	it('denormalizes copilot_chat.time_to_first_token into ttft_ms', () => {
		store.insertSpan(makeSpan({
			spanId: 'fg-chat',
			traceId: 'trace-fg',
			attributes: {
				'gen_ai.operation.name': 'chat',
				'copilot_chat.time_to_first_token': 450,
			},
		}));

		const spans = store.getSpansByTraceId('trace-fg');
		expect(spans[0].ttft_ms).toBe(450);
	});

	it('denormalizes github.copilot.time_to_first_chunk (seconds) into ttft_ms (ms)', () => {
		store.insertSpan(makeSpan({
			spanId: 'cli-chat',
			traceId: 'trace-cli',
			attributes: {
				'gen_ai.operation.name': 'chat',
				'github.copilot.time_to_first_chunk': 0.4386763570001349,
			},
		}));

		const spans = store.getSpansByTraceId('trace-cli');
		expect(spans[0].ttft_ms).toBe(439);
	});

	it('prefers copilot_chat.time_to_first_token over github.copilot.time_to_first_chunk', () => {
		store.insertSpan(makeSpan({
			spanId: 'both-chat',
			traceId: 'trace-both',
			attributes: {
				'gen_ai.operation.name': 'chat',
				'copilot_chat.time_to_first_token': 500,
				'github.copilot.time_to_first_chunk': 0.6,
			},
		}));

		const spans = store.getSpansByTraceId('trace-both');
		expect(spans[0].ttft_ms).toBe(500);
	});
});
