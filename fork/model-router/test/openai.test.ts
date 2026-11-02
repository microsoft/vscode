/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatCompletionsUrl, modelsUrl } from '../src/adapters/openai.ts';
import { createModelClient, ModelRouterError, type ModelConfig } from '../src/index.ts';
import { collect, jsonResponse, mockFetch, sseResponse, textFrom } from './helpers.ts';

const config: ModelConfig = {
	id: 'or',
	displayName: 'OpenRouter',
	apiFormat: 'openai',
	baseUrl: 'https://openrouter.ai/api/v1/',
	apiKey: 'sk-test',
	model: 'meta-llama/llama-3.1-70b-instruct',
};

test('builds endpoint URLs from a base URL or a full chat URL', () => {
	assert.equal(chatCompletionsUrl(new URL('https://openrouter.ai/api/v1/')).toString(), 'https://openrouter.ai/api/v1/chat/completions');
	assert.equal(chatCompletionsUrl(new URL('http://localhost:11434/v1/chat/completions')).toString(), 'http://localhost:11434/v1/chat/completions');
	assert.equal(modelsUrl(new URL('http://localhost:11434/v1/chat/completions')).toString(), 'http://localhost:11434/v1/models');
	assert.equal(
		chatCompletionsUrl(new URL('https://res.openai.azure.com/openai/deployments/gpt?api-version=2024-10-21')).toString(),
		'https://res.openai.azure.com/openai/deployments/gpt/chat/completions?api-version=2024-10-21',
	);
});

test('maps messages, tool calls and tool results to the OpenAI format', async () => {
	const { fetch, calls } = mockFetch(() => sseResponse(['[DONE]']));
	const client = createModelClient({ ...config, headers: { 'HTTP-Referer': 'https://fork.dev' } }, { fetch });
	await collect(client.stream({
		system: 'Be brief.',
		maxTokens: 100,
		tools: [{ name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }],
		messages: [
			{ role: 'user', content: 'Open main.ts' },
			{ role: 'assistant', content: [{ type: 'tool_call', id: 'c1', name: 'read_file', arguments: { path: 'main.ts' } }] },
			{ role: 'user', content: [{ type: 'tool_result', toolCallId: 'c1', toolName: 'read_file', content: 'console.log(1)' }] },
		],
	}));

	const [call] = calls;
	assert.equal(call.url, 'https://openrouter.ai/api/v1/chat/completions');
	assert.equal(call.headers.authorization, 'Bearer sk-test');
	assert.equal(call.headers['HTTP-Referer'], 'https://fork.dev');
	assert.equal(call.body?.max_tokens, 100);
	assert.equal(call.body?.stream, true);
	assert.deepEqual(call.body?.messages, [
		{ role: 'system', content: 'Be brief.' },
		{ role: 'user', content: 'Open main.ts' },
		{ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"main.ts"}' } }] },
		{ role: 'tool', tool_call_id: 'c1', content: 'console.log(1)' },
	]);
	assert.deepEqual(call.body?.tools, [{ type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }]);
});

test('uses max_completion_tokens for api.openai.com', async () => {
	const { fetch, calls } = mockFetch(() => sseResponse(['[DONE]']));
	await collect(createModelClient({ ...config, baseUrl: 'https://api.openai.com/v1', model: 'gpt-5' }, { fetch }).stream({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 50 }));
	assert.equal(calls[0].body?.max_completion_tokens, 50);
	assert.equal(calls[0].body?.max_tokens, undefined);
});

test('streams text and assembles tool calls split across chunks', async () => {
	const { fetch } = mockFetch(() => sseResponse([
		{ choices: [{ delta: { role: 'assistant', content: 'Let me ' } }] },
		{ choices: [{ delta: { content: 'look.' } }] },
		{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'read_file', arguments: '{"pa' } }] } }] },
		{ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a.ts"}' } }] } }] },
		{ choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_b', function: { name: 'grep', arguments: '{"q":"x"}' } }] } }] },
		{ choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
		{ choices: [], usage: { prompt_tokens: 12, completion_tokens: 7 } },
		'[DONE]',
	]));
	const events = await collect(createModelClient(config, { fetch }).stream({ messages: [{ role: 'user', content: 'go' }] }));
	assert.equal(textFrom(events), 'Let me look.');
	assert.deepEqual(events.filter(event => event.type === 'tool_call'), [
		{ type: 'tool_call', id: 'call_a', name: 'read_file', arguments: { path: 'a.ts' } },
		{ type: 'tool_call', id: 'call_b', name: 'grep', arguments: { q: 'x' } },
	]);
	assert.deepEqual(events.at(-1), { type: 'done', stopReason: 'tool_use', usage: { inputTokens: 12, outputTokens: 7 } });
});

test('treats a tool call reported with finish_reason "stop" as tool use', async () => {
	const { fetch } = mockFetch(() => sseResponse([
		{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'x', function: { name: 'ls', arguments: '{}' } }] }, finish_reason: 'stop' }] },
	]));
	const result = await createModelClient(config, { fetch }).complete({ messages: [{ role: 'user', content: 'go' }] });
	assert.equal(result.stopReason, 'tool_use');
	assert.equal(result.toolCalls.length, 1);
});

test('turns HTTP errors into typed errors with the provider message', async () => {
	const { fetch } = mockFetch(() => jsonResponse(401, { error: { message: 'Invalid API key provided' } }));
	await assert.rejects(
		collect(createModelClient(config, { fetch }).stream({ messages: [{ role: 'user', content: 'hi' }] })),
		(error: unknown) => error instanceof ModelRouterError && error.kind === 'auth' && error.status === 401 && /Invalid API key provided/.test(error.message),
	);
});

test('reports a non-streaming JSON answer as a protocol error', async () => {
	const { fetch } = mockFetch(() => jsonResponse(200, { choices: [{ message: { content: 'hi' } }] }));
	await assert.rejects(
		collect(createModelClient(config, { fetch }).stream({ messages: [{ role: 'user', content: 'hi' }] })),
		(error: unknown) => error instanceof ModelRouterError && error.kind === 'protocol',
	);
});

test('lists models', async () => {
	const { fetch, calls } = mockFetch(() => jsonResponse(200, { data: [{ id: 'a' }, { id: 'b' }, { name: 'no-id' }] }));
	assert.deepEqual(await createModelClient(config, { fetch }).listModels(), [{ id: 'a' }, { id: 'b' }]);
	assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/models');
});
