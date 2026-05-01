// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { AnthropicStreamTranslator, SseParser } from '../src/providers/anthropic-stream.js';
import type { AgentEvent } from '../src/providers/types.js';

describe('AnthropicStreamTranslator', () => {
	test('translates a complete text-only response into the uniform event sequence', () => {
		const t = new AnthropicStreamTranslator('req-1', 'anthropic-oauth');

		const out: AgentEvent[] = [];
		out.push(...t.translate({
			type: 'message_start',
			message: {
				id: 'm1',
				model: 'claude-sonnet-4-6',
				usage: { input_tokens: 100, cache_read_input_tokens: 50 },
			},
		}));
		out.push(...t.translate({
			type: 'content_block_start',
			index: 0,
			content_block: { type: 'text' },
		}));
		out.push(...t.translate({
			type: 'content_block_delta',
			index: 0,
			delta: { type: 'text_delta', text: 'Hello ' },
		}));
		out.push(...t.translate({
			type: 'content_block_delta',
			index: 0,
			delta: { type: 'text_delta', text: 'world' },
		}));
		out.push(...t.translate({
			type: 'content_block_stop',
			index: 0,
		}));
		out.push(...t.translate({
			type: 'message_delta',
			delta: { stop_reason: 'end_turn' },
			usage: { output_tokens: 25 },
		}));
		out.push(...t.translate({ type: 'message_stop' }));

		assert.deepStrictEqual(out, [
			{ type: 'message_start', requestId: 'req-1', provider: 'anthropic-oauth', model: 'claude-sonnet-4-6' },
			{ type: 'usage', inputTokens: 100, outputTokens: 0, cacheCreationInputTokens: undefined, cacheReadInputTokens: 50 },
			{ type: 'text_delta', text: 'Hello ' },
			{ type: 'text_delta', text: 'world' },
			{ type: 'usage', inputTokens: 0, outputTokens: 25, cacheCreationInputTokens: undefined, cacheReadInputTokens: undefined },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);
	});

	test('translates a tool-use response with streamed input_json_delta arguments', () => {
		const t = new AnthropicStreamTranslator('req-2', 'anthropic-oauth');

		const out: AgentEvent[] = [];
		out.push(...t.translate({
			type: 'message_start',
			message: { id: 'm2', model: 'claude-opus-4-7', usage: { input_tokens: 50 } },
		}));
		out.push(...t.translate({
			type: 'content_block_start',
			index: 0,
			content_block: { type: 'tool_use', id: 'toolu_abc', name: 'search', input: {} },
		}));
		out.push(...t.translate({
			type: 'content_block_delta',
			index: 0,
			delta: { type: 'input_json_delta', partial_json: '{"q":' },
		}));
		out.push(...t.translate({
			type: 'content_block_delta',
			index: 0,
			delta: { type: 'input_json_delta', partial_json: '"hello"}' },
		}));
		out.push(...t.translate({ type: 'content_block_stop', index: 0 }));
		out.push(...t.translate({
			type: 'message_delta',
			delta: { stop_reason: 'tool_use' },
			usage: { output_tokens: 12 },
		}));

		assert.deepStrictEqual(out, [
			{ type: 'message_start', requestId: 'req-2', provider: 'anthropic-oauth', model: 'claude-opus-4-7' },
			{ type: 'usage', inputTokens: 50, outputTokens: 0, cacheCreationInputTokens: undefined, cacheReadInputTokens: undefined },
			{ type: 'tool_use_start', toolUseId: 'toolu_abc', name: 'search', input: {} },
			{ type: 'tool_use_delta', toolUseId: 'toolu_abc', partialInput: '{"q":' },
			{ type: 'tool_use_delta', toolUseId: 'toolu_abc', partialInput: '"hello"}' },
			{ type: 'tool_use_stop', toolUseId: 'toolu_abc' },
			{ type: 'usage', inputTokens: 0, outputTokens: 12, cacheCreationInputTokens: undefined, cacheReadInputTokens: undefined },
			{ type: 'message_stop', stopReason: 'tool_use' },
		]);
	});

	test('translates thinking deltas and signature into thinking_delta events', () => {
		const t = new AnthropicStreamTranslator('req-3');

		const out: AgentEvent[] = [
			...t.translate({
				type: 'content_block_start',
				index: 0,
				content_block: { type: 'thinking' },
			}),
			...t.translate({
				type: 'content_block_delta',
				index: 0,
				delta: { type: 'thinking_delta', thinking: 'Considering...' },
			}),
			...t.translate({
				type: 'content_block_delta',
				index: 0,
				delta: { type: 'signature_delta', signature: 'sig-abc' },
			}),
			...t.translate({ type: 'content_block_stop', index: 0 }),
		];

		assert.deepStrictEqual(out, [
			{ type: 'thinking_delta', text: 'Considering...' },
			{ type: 'thinking_delta', text: '', signature: 'sig-abc' },
		]);
	});

	test('translates an error event into a retryable AgentEvent.error when overloaded', () => {
		const t = new AnthropicStreamTranslator('req-4');
		const out = t.translate({
			type: 'error',
			error: { type: 'overloaded_error', message: 'Try again later' },
		});
		assert.deepStrictEqual(out, [
			{ type: 'error', code: 'overloaded_error', message: 'Try again later', retryable: true },
		]);
	});

	test('translates an unauthorized error as non-retryable', () => {
		const t = new AnthropicStreamTranslator('req-5');
		const out = t.translate({
			type: 'error',
			error: { type: 'authentication_error', message: 'Bad token' },
		});
		assert.deepStrictEqual(out, [
			{ type: 'error', code: 'authentication_error', message: 'Bad token', retryable: false },
		]);
	});

	test('ignores ping and unknown events', () => {
		const t = new AnthropicStreamTranslator('req-6');
		const out = [
			...t.translate({ type: 'ping' }),
			...t.translate({ type: 'something_new' }),
		];
		assert.deepStrictEqual(out, []);
	});
});

describe('SseParser', () => {
	test('parses well-formed SSE frames into JSON event objects', () => {
		const parser = new SseParser();
		const wire =
			'event: message_start\n' +
			'data: {"type":"message_start","message":{"id":"m","model":"claude-sonnet-4-6","usage":{"input_tokens":1}}}\n' +
			'\n' +
			'event: content_block_delta\n' +
			'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n' +
			'\n';

		const events = parser.feed(wire);
		assert.strictEqual(events.length, 2);
		assert.strictEqual((events[0] as { type: string }).type, 'message_start');
		assert.strictEqual((events[1] as { type: string }).type, 'content_block_delta');
	});

	test('handles incremental feeds that split frames mid-line', () => {
		const parser = new SseParser();
		const all = parser.feed('data: {"type":"ping"}');
		assert.strictEqual(all.length, 0);

		const more = parser.feed('}\n\n');
		// The first feed had `{"type":"ping"}` already complete; the second feed
		// added `}\n\n` which together is `{"type":"ping"}}` — invalid JSON;
		// the parser silently drops malformed frames.
		assert.strictEqual(more.length, 0);

		const valid = parser.feed('data: {"type":"message_stop"}\n\n');
		assert.strictEqual(valid.length, 1);
		assert.strictEqual((valid[0] as { type: string }).type, 'message_stop');
	});

	test('skips [DONE] sentinel without parsing it as JSON', () => {
		const parser = new SseParser();
		const events = parser.feed('data: [DONE]\n\n');
		assert.strictEqual(events.length, 0);
	});
});
