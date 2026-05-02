// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
	CopilotSseParser,
	CopilotStreamTranslator,
	mapFinishReason,
} from '../src/providers/copilot-stream.js';
import type { AgentEvent } from '../src/providers/types.js';

function runTranslator(chunks: object[]): AgentEvent[] {
	const t = new CopilotStreamTranslator('req-1', 'copilot');
	const out: AgentEvent[] = [];
	for (const c of chunks) {
		out.push(...t.translate(c as Parameters<CopilotStreamTranslator['translate']>[0]));
	}
	out.push(...t.finalize());
	return out;
}

describe('CopilotStreamTranslator', () => {
	test('translates a complete text-only response into the uniform event sequence', () => {
		const out = runTranslator([
			{ id: 'c1', model: 'gpt-4o', choices: [{ index: 0, delta: { role: 'assistant' } }] },
			{ id: 'c1', model: 'gpt-4o', choices: [{ index: 0, delta: { content: 'Hello ' } }] },
			{ id: 'c1', model: 'gpt-4o', choices: [{ index: 0, delta: { content: 'world' } }] },
			{ id: 'c1', model: 'gpt-4o', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
			{ id: 'c1', model: 'gpt-4o', choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } },
		]);

		assert.deepStrictEqual(out, [
			{ type: 'message_start', requestId: 'req-1', provider: 'copilot', model: 'gpt-4o' },
			{ type: 'text_delta', text: 'Hello ' },
			{ type: 'text_delta', text: 'world' },
			{
				type: 'usage',
				inputTokens: 10,
				outputTokens: 2,
				cacheCreationInputTokens: undefined,
				cacheReadInputTokens: undefined,
			},
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);
	});

	test('translates a streaming tool call into tool_use_{start,delta,stop}', () => {
		const out = runTranslator([
			{ model: 'gpt-4o', choices: [{ index: 0, delta: { role: 'assistant' } }] },
			{
				model: 'gpt-4o',
				choices: [{
					index: 0,
					delta: {
						tool_calls: [{
							index: 0,
							id: 'call_abc',
							type: 'function',
							function: { name: 'search', arguments: '{"q":' },
						}],
					},
				}],
			},
			{
				model: 'gpt-4o',
				choices: [{
					index: 0,
					delta: {
						tool_calls: [{ index: 0, function: { arguments: '"hi"}' } }],
					},
				}],
			},
			{ model: 'gpt-4o', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
		]);

		assert.deepStrictEqual(out, [
			{ type: 'message_start', requestId: 'req-1', provider: 'copilot', model: 'gpt-4o' },
			{ type: 'tool_use_start', toolUseId: 'call_abc', name: 'search' },
			{ type: 'tool_use_delta', toolUseId: 'call_abc', partialInput: '{"q":' },
			{ type: 'tool_use_delta', toolUseId: 'call_abc', partialInput: '"hi"}' },
			{ type: 'tool_use_stop', toolUseId: 'call_abc' },
			{ type: 'message_stop', stopReason: 'tool_use' },
		]);
	});

	test('forwards prompt_tokens_details.cached_tokens as cacheReadInputTokens', () => {
		const out = runTranslator([
			{ model: 'gpt-4o', choices: [{ index: 0, delta: { content: 'hi' } }] },
			{ model: 'gpt-4o', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
			{
				model: 'gpt-4o',
				choices: [],
				usage: {
					prompt_tokens: 100,
					completion_tokens: 5,
					prompt_tokens_details: { cached_tokens: 80 },
				},
			},
		]);
		const usage = out.find(e => e.type === 'usage');
		assert.ok(usage && usage.type === 'usage');
		assert.strictEqual(usage.cacheReadInputTokens, 80);
		assert.strictEqual(usage.inputTokens, 100);
		assert.strictEqual(usage.outputTokens, 5);
	});

	test('emits an error event when the chunk carries an error and skips message_start', () => {
		const t = new CopilotStreamTranslator('req-x', 'copilot');
		const out = t.translate({
			error: { code: 'rate_limit_exceeded', message: 'slow down' },
		} as Parameters<CopilotStreamTranslator['translate']>[0]);
		assert.deepStrictEqual(out, [
			{
				type: 'error',
				code: 'rate_limit_exceeded',
				message: 'slow down',
				retryable: true,
			},
		]);
		assert.strictEqual(t.hasStart, false);
	});

	test('finalize is idempotent and synthesises end_turn when no finish_reason was seen', () => {
		const t = new CopilotStreamTranslator('req-y', 'copilot');
		t.translate(({ model: 'gpt-4o', choices: [{ index: 0, delta: { content: 'x' } }] }) as Parameters<CopilotStreamTranslator['translate']>[0]);
		const first = t.finalize();
		const second = t.finalize();
		assert.deepStrictEqual(first, [{ type: 'message_stop', stopReason: 'end_turn' }]);
		assert.deepStrictEqual(second, []);
	});

	test('ignores empty content deltas and unknown delta fields', () => {
		const out = runTranslator([
			{ model: 'gpt-4o', choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] },
			{ model: 'gpt-4o', choices: [{ index: 0, delta: { content: null, refusal: null } }] },
			{ model: 'gpt-4o', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
		]);
		const types = out.map(e => e.type);
		assert.deepStrictEqual(types, ['message_start', 'message_stop']);
	});
});

describe('mapFinishReason', () => {
	test('maps known finish reasons and falls back to end_turn', () => {
		assert.deepStrictEqual(
			['stop', 'length', 'tool_calls', 'content_filter', 'something-new', undefined].map(mapFinishReason),
			['end_turn', 'max_tokens', 'tool_use', 'error', 'end_turn', 'end_turn'],
		);
	});
});

describe('CopilotSseParser', () => {
	test('parses well-formed chunks and ignores [DONE] sentinel', () => {
		const p = new CopilotSseParser();
		const events = p.feed(
			'data: {"id":"c","choices":[{"index":0,"delta":{"content":"hi"}}]}\n\n' +
			'data: [DONE]\n\n',
		);
		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].choices?.[0].delta.content, 'hi');
	});

	test('handles frames split across feed calls', () => {
		const p = new CopilotSseParser();
		assert.deepStrictEqual(p.feed('data: {"id":"c","choices":[{"index":0,"delta":{"con'), []);
		const events = p.feed('tent":"x"}}]}\n\ndata: [DONE]\n\n');
		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].choices?.[0].delta.content, 'x');
	});

	test('tolerates malformed JSON frames without throwing', () => {
		const p = new CopilotSseParser();
		const events = p.feed('data: not-json\n\ndata: {"choices":[]}\n\n');
		assert.strictEqual(events.length, 1);
		assert.deepStrictEqual(events[0].choices, []);
	});

	test('ignores frames without a data: line (e.g. comment heartbeats)', () => {
		const p = new CopilotSseParser();
		const events = p.feed(': keepalive\n\ndata: {"choices":[]}\n\n');
		assert.strictEqual(events.length, 1);
	});
});
