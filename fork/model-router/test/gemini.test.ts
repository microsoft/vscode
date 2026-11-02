/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streamUrl, toGeminiSchema } from '../src/adapters/gemini.ts';
import { createModelClient, type ModelConfig, type ToolCallPart } from '../src/index.ts';
import { collect, jsonResponse, mockFetch, sseResponse, textFrom } from './helpers.ts';

const config: ModelConfig = {
	id: 'gem',
	displayName: 'Gemini',
	apiFormat: 'gemini',
	baseUrl: 'https://generativelanguage.googleapis.com',
	apiKey: 'AIza-test',
	model: 'models/gemini-2.5-pro',
};

test('builds the streaming URL from a bare host or a versioned base', () => {
	assert.equal(
		streamUrl(new URL('https://generativelanguage.googleapis.com'), 'models/gemini-2.5-pro').toString(),
		'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse',
	);
	assert.equal(
		streamUrl(new URL('https://generativelanguage.googleapis.com/v1/'), 'gemini-2.5-flash').toString(),
		'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:streamGenerateContent?alt=sse',
	);
});

test('drops JSON Schema keys Gemini rejects', () => {
	assert.deepEqual(
		toGeminiSchema({ $schema: 'x', type: 'object', additionalProperties: false, properties: { a: { type: 'array', items: { type: 'string', additionalProperties: false } } } }),
		{ type: 'object', properties: { a: { type: 'array', items: { type: 'string' } } } },
	);
});

test('maps roles, function calls and function responses', async () => {
	const { fetch, calls } = mockFetch(() => sseResponse([]));
	const priorCall: ToolCallPart = { type: 'tool_call', id: 'call_1', name: 'read_file', arguments: { path: 'a.ts' }, providerData: { thoughtSignature: 'sig-1' } };
	await collect(createModelClient(config, { fetch }).stream({
		system: 'Be brief.',
		maxTokens: 200,
		temperature: 0.2,
		tools: [{ name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' } } } }],
		messages: [
			{ role: 'user', content: 'Open a.ts' },
			{ role: 'assistant', content: [priorCall] },
			{ role: 'user', content: [{ type: 'tool_result', toolCallId: 'call_1', toolName: 'read_file', content: 'x = 1' }] },
		],
	}));

	const [call] = calls;
	assert.equal(call.headers['x-goog-api-key'], 'AIza-test');
	assert.deepEqual(call.body, {
		contents: [
			{ role: 'user', parts: [{ text: 'Open a.ts' }] },
			{ role: 'model', parts: [{ functionCall: { name: 'read_file', args: { path: 'a.ts' } }, thoughtSignature: 'sig-1' }] },
			{ role: 'user', parts: [{ functionResponse: { name: 'read_file', response: { result: 'x = 1' } } }] },
		],
		systemInstruction: { parts: [{ text: 'Be brief.' }] },
		tools: [{ functionDeclarations: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } }] }],
		generationConfig: { maxOutputTokens: 200, temperature: 0.2 },
	});
});

test('streams text, skips thoughts and keeps thought signatures on calls', async () => {
	const { fetch } = mockFetch(() => sseResponse([
		{ candidates: [{ content: { role: 'model', parts: [{ text: 'thinking…', thought: true }] } }] },
		{ candidates: [{ content: { role: 'model', parts: [{ text: 'Reading ' }] } }] },
		{ candidates: [{ content: { role: 'model', parts: [{ text: 'it.' }, { functionCall: { name: 'read_file', args: { path: 'b.ts' } }, thoughtSignature: 'sig-2' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } },
	]));
	const client = createModelClient(config, { fetch });
	const events = await collect(client.stream({ messages: [{ role: 'user', content: 'go' }] }));
	assert.equal(textFrom(events), 'Reading it.');
	assert.deepEqual(events.filter(event => event.type === 'tool_call'), [
		{ type: 'tool_call', id: 'call_1', name: 'read_file', arguments: { path: 'b.ts' }, providerData: { thoughtSignature: 'sig-2' } },
	]);
	assert.deepEqual(events.at(-1), { type: 'done', stopReason: 'tool_use', usage: { inputTokens: 9, outputTokens: 4 } });
});

test('reports a blocked prompt', async () => {
	const { fetch } = mockFetch(() => sseResponse([{ promptFeedback: { blockReason: 'SAFETY' } }]));
	await assert.rejects(createModelClient(config, { fetch }).complete({ messages: [{ role: 'user', content: 'go' }] }), /SAFETY/);
});

test('lists only models that can generate content', async () => {
	const { fetch } = mockFetch(() => jsonResponse(200, { models: [
		{ name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent', 'countTokens'] },
		{ name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
	] }));
	assert.deepEqual(await createModelClient(config, { fetch }).listModels(), [{ id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' }]);
});
