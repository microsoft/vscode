/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANTHROPIC_VERSION, DEFAULT_MAX_TOKENS, messagesUrl, modelsUrl } from '../src/adapters/anthropic.ts';
import { createModelClient, ModelRouterError, type ModelConfig } from '../src/index.ts';
import { collect, jsonResponse, mockFetch, sseResponse, textFrom } from './helpers.ts';

const config: ModelConfig = {
	id: 'claude',
	displayName: 'Claude',
	apiFormat: 'anthropic',
	baseUrl: 'https://api.anthropic.com',
	apiKey: 'sk-ant-test',
	model: 'claude-sonnet-4-5',
};

test('accepts the base URL with or without /v1', () => {
	assert.equal(messagesUrl(new URL('https://api.anthropic.com')).toString(), 'https://api.anthropic.com/v1/messages');
	assert.equal(messagesUrl(new URL('https://api.anthropic.com/v1/')).toString(), 'https://api.anthropic.com/v1/messages');
	assert.equal(messagesUrl(new URL('https://gw.example.com/anthropic/v1/messages')).toString(), 'https://gw.example.com/anthropic/v1/messages');
	assert.equal(modelsUrl(new URL('https://gw.example.com/anthropic/v1/messages')).toString(), 'https://gw.example.com/anthropic/v1/models');
});

test('maps messages to the Messages API with tool results first', async () => {
	const { fetch, calls } = mockFetch(() => sseResponse([{ type: 'message_stop' }]));
	await collect(createModelClient(config, { fetch }).stream({
		system: 'Be brief.',
		tools: [{ name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } }],
		messages: [
			{ role: 'user', content: 'Open main.ts' },
			{ role: 'assistant', content: [{ type: 'text', text: 'Opening.' }, { type: 'tool_call', id: 'tu1', name: 'read_file', arguments: { path: 'main.ts' } }] },
			{ role: 'user', content: [{ type: 'text', text: 'Here:' }, { type: 'tool_result', toolCallId: 'tu1', toolName: 'read_file', content: 'oops', isError: true }] },
		],
	}));

	const [call] = calls;
	assert.equal(call.url, 'https://api.anthropic.com/v1/messages');
	assert.equal(call.headers['x-api-key'], 'sk-ant-test');
	assert.equal(call.headers['anthropic-version'], ANTHROPIC_VERSION);
	assert.equal(call.body?.max_tokens, DEFAULT_MAX_TOKENS);
	assert.equal(call.body?.system, 'Be brief.');
	assert.deepEqual(call.body?.messages, [
		{ role: 'user', content: [{ type: 'text', text: 'Open main.ts' }] },
		{ role: 'assistant', content: [{ type: 'text', text: 'Opening.' }, { type: 'tool_use', id: 'tu1', name: 'read_file', input: { path: 'main.ts' } }] },
		{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'oops', is_error: true }, { type: 'text', text: 'Here:' }] },
	]);
	assert.deepEqual(call.body?.tools, [{ name: 'read_file', description: 'Read a file', input_schema: { type: 'object' } }]);
});

test('streams text and a tool call built from JSON deltas', async () => {
	const { fetch } = mockFetch(() => sseResponse([
		{ event: 'message_start', data: { type: 'message_start', message: { usage: { input_tokens: 20, output_tokens: 1 } } } },
		{ event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
		{ event: 'ping', data: { type: 'ping' } },
		{ event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Checking ' } } },
		{ event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'the file.' } } },
		{ event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
		{ event: 'content_block_start', data: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: {} } } },
		{ event: 'content_block_delta', data: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"path": ' } } },
		{ event: 'content_block_delta', data: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"src/a.ts"}' } } },
		{ event: 'content_block_stop', data: { type: 'content_block_stop', index: 1 } },
		{ event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 31 } } },
		{ event: 'message_stop', data: { type: 'message_stop' } },
	]));
	const events = await collect(createModelClient(config, { fetch }).stream({ messages: [{ role: 'user', content: 'go' }] }));
	assert.equal(textFrom(events), 'Checking the file.');
	assert.deepEqual(events.filter(event => event.type === 'tool_call'), [{ type: 'tool_call', id: 'toolu_1', name: 'read_file', arguments: { path: 'src/a.ts' } }]);
	assert.deepEqual(events.at(-1), { type: 'done', stopReason: 'tool_use', usage: { inputTokens: 20, outputTokens: 31 } });
});

test('surfaces a mid-stream error event', async () => {
	const { fetch } = mockFetch(() => sseResponse([
		{ event: 'error', data: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } },
	]));
	await assert.rejects(
		collect(createModelClient(config, { fetch }).stream({ messages: [{ role: 'user', content: 'go' }] })),
		(error: unknown) => error instanceof ModelRouterError && error.kind === 'server' && error.message === 'Overloaded',
	);
});

test('maps 404 to not_found', async () => {
	const { fetch } = mockFetch(() => jsonResponse(404, { type: 'error', error: { type: 'not_found_error', message: 'model: claude-nope' } }));
	await assert.rejects(
		createModelClient(config, { fetch }).complete({ messages: [{ role: 'user', content: 'go' }] }),
		(error: unknown) => error instanceof ModelRouterError && error.kind === 'not_found' && /claude-nope/.test(error.message),
	);
});

test('lists models with display names', async () => {
	const { fetch, calls } = mockFetch(() => jsonResponse(200, { data: [{ id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' }] }));
	assert.deepEqual(await createModelClient(config, { fetch }).listModels(), [{ id: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5' }]);
	assert.equal(calls[0].url, 'https://api.anthropic.com/v1/models?limit=1000');
});
