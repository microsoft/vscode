// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
	AgentEvent,
	addUsage,
	emptyUsage,
	isError,
	isMessageStart,
	isMessageStop,
	isTerminal,
	isTextDelta,
	isThinkingDelta,
	isToolUseDelta,
	isToolUseStart,
	isToolUseStop,
	isUsage,
} from '../index.js';

describe('AgentEvent type guards', () => {
	const sample: Record<string, AgentEvent> = {
		message_start: { type: 'message_start', requestId: 'r1', provider: 'anthropic-oauth', model: 'claude-opus-4-7' },
		text_delta: { type: 'text_delta', text: 'Hello' },
		tool_use_start: { type: 'tool_use_start', toolUseId: 't1', name: 'search' },
		tool_use_delta: { type: 'tool_use_delta', toolUseId: 't1', partialInput: '{"q":' },
		tool_use_stop: { type: 'tool_use_stop', toolUseId: 't1' },
		thinking_delta: { type: 'thinking_delta', text: 'Considering options...', signature: 'sig' },
		usage: { type: 'usage', inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 1000 },
		message_stop: { type: 'message_stop', stopReason: 'end_turn' },
		error: { type: 'error', code: 'rate_limited', message: 'Slow down', retryable: true },
	};

	test('each guard returns true only for its own variant', () => {
		const guards: Array<[string, (e: AgentEvent) => boolean]> = [
			['message_start', isMessageStart],
			['text_delta', isTextDelta],
			['tool_use_start', isToolUseStart],
			['tool_use_delta', isToolUseDelta],
			['tool_use_stop', isToolUseStop],
			['thinking_delta', isThinkingDelta],
			['usage', isUsage],
			['message_stop', isMessageStop],
			['error', isError],
		];

		const result = guards.map(([variant, guard]) =>
			Object.entries(sample).map(([k, e]) => [variant, k, guard(e)] as const)
		).flat();

		const expected = guards.map(([variant]) =>
			Object.keys(sample).map(k => [variant, k, variant === k] as const)
		).flat();

		assert.deepStrictEqual(result, expected);
	});

	test('isTerminal matches only message_stop and error', () => {
		const terminalKeys = Object.entries(sample)
			.filter(([, e]) => isTerminal(e))
			.map(([k]) => k)
			.sort();
		assert.deepStrictEqual(terminalKeys, ['error', 'message_stop']);
	});
});

describe('Usage helpers', () => {
	test('emptyUsage returns zeroed totals', () => {
		assert.deepStrictEqual(emptyUsage(), {
			type: 'usage',
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});
	});

	test('addUsage sums all fields, treating undefined cache fields as zero', () => {
		const a = emptyUsage();
		const b: AgentEvent = { type: 'usage', inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 200 };
		const c: AgentEvent = { type: 'usage', inputTokens: 25, outputTokens: 10, cacheCreationInputTokens: 75 };

		assert.ok(b.type === 'usage' && c.type === 'usage');
		const total = addUsage(addUsage(a, b), c);

		assert.deepStrictEqual(total, {
			type: 'usage',
			inputTokens: 125,
			outputTokens: 60,
			cacheCreationInputTokens: 75,
			cacheReadInputTokens: 200,
		});
	});
});

describe('Discriminated union exhaustiveness', () => {
	test('switch over event.type compiles for every variant and produces the right label', () => {
		const label = (e: AgentEvent): string => {
			switch (e.type) {
				case 'message_start': return `start:${e.provider}/${e.model}`;
				case 'text_delta': return `text:${e.text.length}`;
				case 'tool_use_start': return `tool_start:${e.name}`;
				case 'tool_use_delta': return `tool_delta:${e.partialInput.length}`;
				case 'tool_use_stop': return `tool_stop:${e.toolUseId}`;
				case 'thinking_delta': return `thinking:${e.text.length}`;
				case 'usage': return `usage:${e.inputTokens + e.outputTokens}`;
				case 'message_stop': return `stop:${e.stopReason}`;
				case 'error': return `error:${e.code}`;
			}
		};

		const labels = [
			label({ type: 'message_start', requestId: 'r', provider: 'p', model: 'm' }),
			label({ type: 'text_delta', text: 'abc' }),
			label({ type: 'tool_use_start', toolUseId: 't', name: 'foo' }),
			label({ type: 'tool_use_delta', toolUseId: 't', partialInput: '{}' }),
			label({ type: 'tool_use_stop', toolUseId: 't' }),
			label({ type: 'thinking_delta', text: 'hmm' }),
			label({ type: 'usage', inputTokens: 5, outputTokens: 3 }),
			label({ type: 'message_stop', stopReason: 'end_turn' }),
			label({ type: 'error', code: 'x', message: 'y', retryable: false }),
		];

		assert.deepStrictEqual(labels, [
			'start:p/m',
			'text:3',
			'tool_start:foo',
			'tool_delta:2',
			'tool_stop:t',
			'thinking:3',
			'usage:8',
			'stop:end_turn',
			'error:x',
		]);
	});
});
