/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { LlmError, LlmEvent, LlmRequest } from '../kernel/llm';
import { buildChatBody, OpenAiCompatibleClient, parseChatCompletionStream } from '../llm/openAiCompatibleClient';
import { createOpenRouterClient, openRouterOptionsFromEnv } from '../llm/openRouter';

async function collect(events: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
	const out: LlmEvent[] = [];
	for await (const e of events) {
		out.push(e);
	}
	return out;
}

async function* chunks(...parts: string[]): AsyncGenerator<Uint8Array> {
	for (const part of parts) {
		yield new TextEncoder().encode(part);
	}
}

const sse = (...payloads: unknown[]) => payloads.map(p => `data: ${typeof p === 'string' ? p : JSON.stringify(p)}\n\n`).join('');

/** Shape of an OpenRouter stream for a parallel tool call, arguments split across chunks. */
const TOOL_STREAM = ': OPENROUTER PROCESSING\n\n' + sse(
	{ choices: [{ delta: { role: 'assistant', content: 'Reading registers. ' } }] },
	{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'read_peripheral', arguments: '' } }] } }] },
	{ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"name":' } }] } }] },
	{ choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_b', type: 'function', function: { name: 'backtrace', arguments: '{}' } }] } }] },
	{ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"RCC"}' } }] } }] },
	{ choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
	'[DONE]',
);

const REQUEST: LlmRequest = {
	system: 'sys',
	messages: [
		{ role: 'user', content: 'why no UART?' },
		{ role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'read_peripheral', input: { name: 'RCC' } }] },
		{ role: 'tool', toolCallId: 'c1', content: '{"APB1ENR":0}' },
	],
	tools: [{ name: 'read_peripheral', description: 'Read SFRs', inputSchema: { type: 'object', properties: { name: { type: 'string' } } } }],
};

suite('parseChatCompletionStream', () => {

	test('assembles fragmented tool calls in index order, ignoring comments', async () => {
		// Split mid-line to prove buffering.
		const mid = Math.floor(TOOL_STREAM.length / 2);
		assert.deepStrictEqual(await collect(parseChatCompletionStream(chunks(TOOL_STREAM.slice(0, mid), TOOL_STREAM.slice(mid)))), [
			{ kind: 'text-delta', text: 'Reading registers. ' },
			{ kind: 'tool-call', call: { id: 'call_a', name: 'read_peripheral', input: { name: 'RCC' } } },
			{ kind: 'tool-call', call: { id: 'call_b', name: 'backtrace', input: {} } },
			{ kind: 'finish', reason: 'tool-calls' },
		]);
	});

	test('streams text and maps finish reasons', async () => {
		const stream = sse({ choices: [{ delta: { content: 'O' } }] }, { choices: [{ delta: { content: 'K' }, finish_reason: 'length' }] }, '[DONE]');
		assert.deepStrictEqual(await collect(parseChatCompletionStream(chunks(stream))), [
			{ kind: 'text-delta', text: 'O' },
			{ kind: 'text-delta', text: 'K' },
			{ kind: 'finish', reason: 'length' },
		]);
	});

	test('keeps unparseable tool arguments and flags them instead of throwing', async () => {
		const stream = sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'x', function: { name: 'flash', arguments: '{"elf": ' } }] }, finish_reason: 'tool_calls' }] }, '[DONE]');
		const [call] = await collect(parseChatCompletionStream(chunks(stream)));
		assert.ok(call.kind === 'tool-call');
		assert.deepStrictEqual({ raw: call.call.rawArguments, hasError: !!call.call.inputError, input: call.call.input }, { raw: '{"elf": ', hasError: true, input: undefined });
	});

	test('throws on a mid-stream error payload and on a truncated stream', async () => {
		await assert.rejects(collect(parseChatCompletionStream(chunks(sse({ error: { message: 'Rate limited', code: 429 } })))), (err: LlmError) => err.status === 429 && /Rate limited/.test(err.message));
		await assert.rejects(collect(parseChatCompletionStream(chunks(sse({ choices: [{ delta: { content: 'partial' } }] })))), /ended before/);
	});

	test('accepts a stream that ends with finish_reason but no [DONE]', async () => {
		const events = await collect(parseChatCompletionStream(chunks(sse({ choices: [{ delta: { content: 'hi' }, finish_reason: 'stop' }] }))));
		assert.deepStrictEqual(events.at(-1), { kind: 'finish', reason: 'stop' });
	});
});

suite('buildChatBody', () => {

	test('maps messages and tools to the OpenAI wire format', () => {
		assert.deepStrictEqual(buildChatBody({ model: 'm', temperature: 0 }, REQUEST), {
			model: 'm',
			stream: true,
			messages: [
				{ role: 'system', content: 'sys' },
				{ role: 'user', content: 'why no UART?' },
				{ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_peripheral', arguments: '{"name":"RCC"}' } }] },
				{ role: 'tool', tool_call_id: 'c1', content: '{"APB1ENR":0}' },
			],
			tools: [{ type: 'function', function: { name: 'read_peripheral', description: 'Read SFRs', parameters: { type: 'object', properties: { name: { type: 'string' } } } } }],
			temperature: 0,
		});
	});

	test('omits tools when there are none', () => {
		assert.strictEqual(buildChatBody({ model: 'm' }, { ...REQUEST, tools: [] }).tools, undefined);
	});
});

interface Call { url: string; init: RequestInit }

function fakeFetch(responses: (() => Response | Promise<Response>)[], calls: Call[]): typeof fetch {
	return (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		const next = responses.shift();
		if (!next) {
			throw new Error('no more responses');
		}
		return next();
	}) as typeof fetch;
}

const okStream = (body: string) => () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
const noSleep = async () => { };

suite('OpenAiCompatibleClient', () => {

	test('posts to {baseUrl}/chat/completions with auth and extra headers, and streams events', async () => {
		const calls: Call[] = [];
		const client = createOpenRouterClient({ apiKey: 'sk-or-v1-test', model: 'vendor/model', appName: 'RoboAgent', appUrl: 'https://roboagent.dev', fetchImpl: fakeFetch([okStream(TOOL_STREAM)], calls) });
		const events = await collect(client.chat(REQUEST, new AbortController().signal));

		assert.strictEqual(events.length, 4);
		assert.strictEqual(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
		const headers = calls[0].init.headers as Record<string, string>;
		assert.deepStrictEqual(
			{ auth: headers['Authorization'], title: headers['X-Title'], referer: headers['HTTP-Referer'], model: JSON.parse(String(calls[0].init.body)).model },
			{ auth: 'Bearer sk-or-v1-test', title: 'RoboAgent', referer: 'https://roboagent.dev', model: 'vendor/model' },
		);
	});

	test('retries 429 and 5xx (honouring Retry-After) and network errors, then succeeds', async () => {
		const calls: Call[] = [];
		const delays: number[] = [];
		const client = new OpenAiCompatibleClient({
			baseUrl: 'https://x/v1/', apiKey: 'k', model: 'm', retryBaseDelayMs: 100,
			sleep: async ms => { delays.push(ms); },
			fetchImpl: fakeFetch([
				() => new Response('slow down', { status: 429, headers: { 'retry-after': '2' } }),
				() => new Response('oops', { status: 502 }),
				() => { throw new TypeError('fetch failed'); },
				okStream(sse({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }, '[DONE]')),
			], calls),
		});
		const events = await collect(client.chat(REQUEST, new AbortController().signal));
		assert.deepStrictEqual({ calls: calls.length, delays, url: calls[0].url, last: events.at(-1) }, { calls: 4, delays: [2000, 200, 400], url: 'https://x/v1/chat/completions', last: { kind: 'finish', reason: 'stop' } });
	});

	test('does not retry client errors and does not leak the key in the error', async () => {
		const calls: Call[] = [];
		const client = new OpenAiCompatibleClient({ baseUrl: 'https://x', apiKey: 'sk-or-v1-secretsecretsecret', model: 'm', sleep: noSleep, fetchImpl: fakeFetch([() => new Response('{"error":"No auth credentials found"}', { status: 401 })], calls) });
		await assert.rejects(collect(client.chat(REQUEST, new AbortController().signal)), (err: LlmError) =>
			err instanceof LlmError && err.status === 401 && !err.retryable && !err.message.includes('secret') && err.message.includes('No auth credentials'));
		assert.strictEqual(calls.length, 1);
	});

	test('gives up after maxRetries', async () => {
		const calls: Call[] = [];
		const client = new OpenAiCompatibleClient({ baseUrl: 'https://x', apiKey: 'k', model: 'm', maxRetries: 1, sleep: noSleep, fetchImpl: fakeFetch([() => new Response('', { status: 503 }), () => new Response('', { status: 503 })], calls) });
		await assert.rejects(collect(client.chat(REQUEST, new AbortController().signal)), (err: LlmError) => err.status === 503 && err.retryable);
		assert.strictEqual(calls.length, 2);
	});

	test('aborting the caller signal cancels the request', async () => {
		const controller = new AbortController();
		const client = new OpenAiCompatibleClient({
			baseUrl: 'https://x', apiKey: 'k', model: 'm', sleep: noSleep,
			fetchImpl: ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
				init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
				controller.abort();
			})) as typeof fetch,
		});
		await assert.rejects(collect(client.chat(REQUEST, controller.signal)), /aborted/);
	});

	test('an idle stream times out with a clear error', async () => {
		const client = new OpenAiCompatibleClient({
			baseUrl: 'https://x', apiKey: 'k', model: 'm', idleTimeoutMs: 20, sleep: noSleep,
			fetchImpl: (async (_url: string, init: RequestInit) => new Response(new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(sse({ choices: [{ delta: { content: 'a' } }] })));
					init.signal!.addEventListener('abort', () => controller.error(init.signal!.reason));
				},
			}), { status: 200 })) as typeof fetch,
		});
		await assert.rejects(collect(client.chat(REQUEST, new AbortController().signal)), /idle timeout/);
	});

	test('refuses to construct without a key or model', () => {
		assert.throws(() => new OpenAiCompatibleClient({ baseUrl: 'https://x', apiKey: '', model: 'm' }), /API key/);
		assert.throws(() => new OpenAiCompatibleClient({ baseUrl: 'https://x', apiKey: 'k', model: '' }), /model/);
	});
});

suite('openRouterOptionsFromEnv', () => {

	test('needs both key and model', () => {
		assert.deepStrictEqual(openRouterOptionsFromEnv({ OPENROUTER_API_KEY: ' k ', OPENROUTER_MODEL: 'a/b' }), { apiKey: 'k', model: 'a/b' });
		assert.strictEqual(openRouterOptionsFromEnv({ OPENROUTER_API_KEY: 'k' }), undefined);
		assert.strictEqual(openRouterOptionsFromEnv({}), undefined);
	});
});
