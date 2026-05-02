// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
	ChatGPTSseParser,
	ChatGPTStreamTranslator,
	mapResponsesStopReason,
} from '../src/providers/chatgpt-stream.js';
import type { AgentEvent } from '../src/providers/types.js';

/**
 * Captured-SSE fixtures (§5.2 of AGENTIC_PLATFORM_PLAN.md). Each fixture is the
 * exact byte sequence we expect the ChatGPT backend to emit for a given
 * conversation shape; the translator turns these into uniform AgentEvents.
 *
 * Keeping the fixtures inline (rather than as separate files) makes the
 * mapping legible at review time and avoids a fixture-loader dependency.
 */
const FIXTURE_TEXT_ONLY = [
	'event: response.created\n',
	'data: {"type":"response.created","response":{"id":"resp_1","model":"gpt-5-codex"}}\n\n',
	'event: response.output_item.added\n',
	'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"msg_1","type":"message","status":"in_progress"}}\n\n',
	'event: response.output_text.delta\n',
	'data: {"type":"response.output_text.delta","output_index":0,"delta":"Hello "}\n\n',
	'event: response.output_text.delta\n',
	'data: {"type":"response.output_text.delta","output_index":0,"delta":"world"}\n\n',
	'event: response.output_text.done\n',
	'data: {"type":"response.output_text.done","output_index":0,"text":"Hello world"}\n\n',
	'event: response.output_item.done\n',
	'data: {"type":"response.output_item.done","output_index":0,"item":{"id":"msg_1","type":"message"}}\n\n',
	'event: response.completed\n',
	'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5-codex","usage":{"input_tokens":12,"output_tokens":3,"input_tokens_details":{"cached_tokens":4}}}}\n\n',
].join('');

const FIXTURE_TOOL_CALL = [
	'event: response.created\n',
	'data: {"type":"response.created","response":{"id":"resp_2","model":"gpt-5-codex"}}\n\n',
	'event: response.output_item.added\n',
	'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"fc_1","type":"function_call","call_id":"call_abc","name":"search"}}\n\n',
	'event: response.function_call_arguments.delta\n',
	'data: {"type":"response.function_call_arguments.delta","output_index":0,"delta":"{\\"q\\":"}\n\n',
	'event: response.function_call_arguments.delta\n',
	'data: {"type":"response.function_call_arguments.delta","output_index":0,"delta":"\\"hello\\"}"}\n\n',
	'event: response.function_call_arguments.done\n',
	'data: {"type":"response.function_call_arguments.done","output_index":0,"arguments":"{\\"q\\":\\"hello\\"}"}\n\n',
	'event: response.output_item.done\n',
	'data: {"type":"response.output_item.done","output_index":0,"item":{"id":"fc_1","type":"function_call","call_id":"call_abc","name":"search","arguments":"{\\"q\\":\\"hello\\"}"}}\n\n',
	'event: response.completed\n',
	'data: {"type":"response.completed","response":{"id":"resp_2","model":"gpt-5-codex","usage":{"input_tokens":50,"output_tokens":7}}}\n\n',
].join('');

const FIXTURE_REASONING_THEN_TEXT = [
	'event: response.created\n',
	'data: {"type":"response.created","response":{"id":"resp_3","model":"o4-mini"}}\n\n',
	'event: response.output_item.added\n',
	'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"r_1","type":"reasoning"}}\n\n',
	'event: response.reasoning_summary_text.delta\n',
	'data: {"type":"response.reasoning_summary_text.delta","output_index":0,"summary_index":0,"delta":"Thinking..."}\n\n',
	'event: response.reasoning_summary_text.done\n',
	'data: {"type":"response.reasoning_summary_text.done","output_index":0,"text":"Thinking..."}\n\n',
	'event: response.output_item.done\n',
	'data: {"type":"response.output_item.done","output_index":0,"item":{"id":"r_1","type":"reasoning"}}\n\n',
	'event: response.output_item.added\n',
	'data: {"type":"response.output_item.added","output_index":1,"item":{"id":"msg_2","type":"message"}}\n\n',
	'event: response.output_text.delta\n',
	'data: {"type":"response.output_text.delta","output_index":1,"delta":"Done."}\n\n',
	'event: response.output_item.done\n',
	'data: {"type":"response.output_item.done","output_index":1,"item":{"id":"msg_2","type":"message"}}\n\n',
	'event: response.completed\n',
	'data: {"type":"response.completed","response":{"id":"resp_3","model":"o4-mini","usage":{"input_tokens":100,"output_tokens":4,"output_tokens_details":{"reasoning_tokens":12}}}}\n\n',
].join('');

const FIXTURE_FAILED = [
	'event: response.created\n',
	'data: {"type":"response.created","response":{"id":"resp_4","model":"gpt-5"}}\n\n',
	'event: response.failed\n',
	'data: {"type":"response.failed","response":{"id":"resp_4","model":"gpt-5","error":{"code":"rate_limit_exceeded","message":"slow down"}}}\n\n',
].join('');

const FIXTURE_INCOMPLETE_MAX_TOKENS = [
	'event: response.created\n',
	'data: {"type":"response.created","response":{"id":"resp_5","model":"gpt-5"}}\n\n',
	'event: response.output_item.added\n',
	'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"msg_3","type":"message"}}\n\n',
	'event: response.output_text.delta\n',
	'data: {"type":"response.output_text.delta","output_index":0,"delta":"abc"}\n\n',
	'event: response.incomplete\n',
	'data: {"type":"response.incomplete","response":{"id":"resp_5","model":"gpt-5","usage":{"input_tokens":1,"output_tokens":1},"incomplete_details":{"reason":"max_output_tokens"}}}\n\n',
].join('');

function feedAndTranslate(fixture: string, requestId = 'req-test'): AgentEvent[] {
	const parser = new ChatGPTSseParser();
	const translator = new ChatGPTStreamTranslator(requestId);
	const events: AgentEvent[] = [];
	for (const ev of parser.feed(fixture)) {
		events.push(...translator.translate(ev as { type: string }));
	}
	return events;
}

function summarise(events: readonly AgentEvent[]): string[] {
	return events.map(e => {
		switch (e.type) {
			case 'message_start': return `start:${e.model}`;
			case 'text_delta': return `text:${e.text}`;
			case 'tool_use_start': return `tool_start:${e.toolUseId}:${e.name}`;
			case 'tool_use_delta': return `tool_delta:${e.toolUseId}:${e.partialInput}`;
			case 'tool_use_stop': return `tool_stop:${e.toolUseId}`;
			case 'thinking_delta': return `think:${e.text}`;
			case 'usage': return `usage:in=${e.inputTokens},out=${e.outputTokens},cached=${e.cacheReadInputTokens ?? 0}`;
			case 'message_stop': return `stop:${e.stopReason}`;
			case 'error': return `error:${e.code}:retry=${e.retryable}`;
		}
	});
}

describe('ChatGPTStreamTranslator', () => {
	test('translates a text-only fixture into the uniform event sequence', () => {
		const events = feedAndTranslate(FIXTURE_TEXT_ONLY, 'req-1');
		assert.deepStrictEqual(summarise(events), [
			'start:gpt-5-codex',
			'text:Hello ',
			'text:world',
			'usage:in=12,out=3,cached=4',
			'stop:end_turn',
		]);
	});

	test('translates a tool-call fixture with streamed JSON arguments', () => {
		const events = feedAndTranslate(FIXTURE_TOOL_CALL, 'req-2');
		assert.deepStrictEqual(summarise(events), [
			'start:gpt-5-codex',
			'tool_start:call_abc:search',
			'tool_delta:call_abc:{"q":',
			'tool_delta:call_abc:"hello"}',
			'tool_stop:call_abc',
			'usage:in=50,out=7,cached=0',
			'stop:tool_use',
		]);
	});

	test('does not double-emit tool_use_stop when both function_call_arguments.done and output_item.done arrive', () => {
		const events = feedAndTranslate(FIXTURE_TOOL_CALL, 'req-2b');
		const stops = events.filter(e => e.type === 'tool_use_stop');
		assert.strictEqual(stops.length, 1);
	});

	test('emits a thinking_delta then text_delta for a reasoning-then-message fixture', () => {
		const events = feedAndTranslate(FIXTURE_REASONING_THEN_TEXT, 'req-3');
		assert.deepStrictEqual(summarise(events), [
			'start:o4-mini',
			'think:Thinking...',
			'text:Done.',
			'usage:in=100,out=4,cached=0',
			'stop:end_turn',
		]);
	});

	test('translates response.failed into a retryable error and a terminal message_stop', () => {
		const events = feedAndTranslate(FIXTURE_FAILED, 'req-4');
		assert.deepStrictEqual(summarise(events), [
			'start:gpt-5',
			'error:rate_limit_exceeded:retry=true',
			'stop:error',
		]);
	});

	test('treats response.incomplete with max_output_tokens as a max_tokens stop', () => {
		const events = feedAndTranslate(FIXTURE_INCOMPLETE_MAX_TOKENS, 'req-5');
		assert.deepStrictEqual(summarise(events), [
			'start:gpt-5',
			'text:abc',
			'usage:in=1,out=1,cached=0',
			'stop:max_tokens',
		]);
	});

	test('falls back to the SSE event-name field when the JSON omits a top-level type', () => {
		const parser = new ChatGPTSseParser();
		const events = parser.feed(
			'event: response.output_text.delta\n' +
			'data: {"output_index":0,"delta":"hi"}\n\n',
		);
		assert.strictEqual(events.length, 1);
		assert.strictEqual((events[0] as { type: string }).type, 'response.output_text.delta');
	});

	test('ignores unknown event types and intermediate response.in_progress frames', () => {
		const parser = new ChatGPTSseParser();
		const t = new ChatGPTStreamTranslator('req-6');
		const wire =
			'event: response.in_progress\n' +
			'data: {"type":"response.in_progress","response":{"id":"r","model":"x"}}\n\n' +
			'event: response.something_new\n' +
			'data: {"type":"response.something_new","output_index":0}\n\n';
		const out: AgentEvent[] = [];
		for (const ev of parser.feed(wire)) {
			out.push(...t.translate(ev as { type: string }));
		}
		assert.deepStrictEqual(out, []);
	});

	test('emits an error AgentEvent for top-level error events', () => {
		const t = new ChatGPTStreamTranslator('req-7');
		const out = t.translate({
			type: 'error',
			code: 'server_error',
			message: 'upstream blew up',
		} as { type: string });
		assert.deepStrictEqual(out, [
			{ type: 'error', code: 'server_error', message: 'upstream blew up', retryable: true },
		]);
	});

	test('forwards eagerly-attached function_call arguments as a tool_use_delta', () => {
		const t = new ChatGPTStreamTranslator('req-8');
		const events = t.translate({
			type: 'response.output_item.added',
			output_index: 0,
			item: { type: 'function_call', call_id: 'call_x', name: 'search', arguments: '{"q":"x"}' },
		} as { type: string });
		assert.deepStrictEqual(events, [
			{ type: 'tool_use_start', toolUseId: 'call_x', name: 'search' },
			{ type: 'tool_use_delta', toolUseId: 'call_x', partialInput: '{"q":"x"}' },
		]);
	});
});

describe('ChatGPTSseParser', () => {
	test('parses well-formed Responses-API frames into JSON event objects', () => {
		const parser = new ChatGPTSseParser();
		const wire =
			'event: response.created\n' +
			'data: {"type":"response.created","response":{"id":"r","model":"m"}}\n\n' +
			'event: response.output_text.delta\n' +
			'data: {"type":"response.output_text.delta","output_index":0,"delta":"hi"}\n\n';
		const events = parser.feed(wire);
		assert.strictEqual(events.length, 2);
		assert.strictEqual((events[0] as { type: string }).type, 'response.created');
		assert.strictEqual((events[1] as { type: string }).type, 'response.output_text.delta');
	});

	test('handles incremental feeds that split frames mid-line', () => {
		const parser = new ChatGPTSseParser();
		assert.strictEqual(parser.feed('event: response.created\ndata: {"type":"response.created"').length, 0);
		const events = parser.feed(',"response":{"id":"r","model":"m"}}\n\n');
		assert.strictEqual(events.length, 1);
		assert.strictEqual((events[0] as { type: string }).type, 'response.created');
	});

	test('skips [DONE] sentinel frames', () => {
		const parser = new ChatGPTSseParser();
		assert.strictEqual(parser.feed('data: [DONE]\n\n').length, 0);
	});

	test('drops malformed JSON frames without throwing', () => {
		const parser = new ChatGPTSseParser();
		const events = parser.feed('event: x\ndata: {not-json\n\n');
		assert.strictEqual(events.length, 0);
	});
});

describe('mapResponsesStopReason', () => {
	test('maps known reason strings to uniform stop reasons', () => {
		assert.deepStrictEqual(
			[
				mapResponsesStopReason('completed'),
				mapResponsesStopReason('tool_calls'),
				mapResponsesStopReason('max_output_tokens'),
				mapResponsesStopReason(undefined),
				mapResponsesStopReason('something_else'),
			],
			['end_turn', 'tool_use', 'max_tokens', 'end_turn', 'end_turn'],
		);
	});
});
