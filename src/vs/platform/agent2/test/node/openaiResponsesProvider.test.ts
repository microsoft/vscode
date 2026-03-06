/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { createUserMessage, IConversationMessage } from '../../common/conversation.js';
import { ModelResponseChunk } from '../../common/modelProvider.js';
import { OpenAIResponsesProvider } from '../../node/openaiResponsesProvider.js';
import { CopilotApiService } from '../../node/copilotToken.js';

// -- Test helpers -------------------------------------------------------------

const encoder = new TextEncoder();

function createSSEStream(events: string[]): ReadableStream<Uint8Array> {
	const raw = events.join('');
	return new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(raw));
			controller.close();
		},
	});
}

function sseEvent(data: unknown): string {
	return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Creates a CopilotApiService backed by a mock fetcher for OpenAI Responses API.
 */
function createMockSetup(sseEvents: string[]) {
	const log = new NullLogService();
	const futureExpiry = Math.floor(Date.now() / 1000) + 3600;

	const fetcher = {
		fetch(url: string, _fetchOptions: Record<string, unknown>): Promise<unknown> {
			// Token exchange request
			if (typeof url === 'string' && url.includes('copilot_internal')) {
				const tokenBody = {
					token: 'test-copilot-jwt',
					expires_at: futureExpiry,
					refresh_in: 1800,
					endpoints: { api: 'https://api.githubcopilot.com' },
					sku: 'copilot_for_business',
				};
				return Promise.resolve({
					ok: true, status: 200, statusText: 'OK',
					json: async () => tokenBody,
					text: async () => JSON.stringify(tokenBody),
				});
			}

			// Responses API request -- return SSE stream
			const stream = createSSEStream(sseEvents);
			return Promise.resolve({
				ok: true, status: 200, statusText: 'OK',
				body: stream,
				text: async () => '',
			});
		},
		fetchWithPagination() { return Promise.resolve([]); },
	};

	const apiService = new CopilotApiService(log, fetcher);
	apiService.setGitHubToken('test-github-token');
	const provider = new OpenAIResponsesProvider('gpt-4o', apiService, log);
	return { provider, log };
}

async function collectChunks(
	provider: OpenAIResponsesProvider,
	messages: readonly IConversationMessage[],
): Promise<ModelResponseChunk[]> {
	const chunks: ModelResponseChunk[] = [];
	for await (const chunk of provider.sendRequest('You are a test assistant.', messages, [], {}, CancellationToken.None)) {
		chunks.push(chunk);
	}
	return chunks;
}

// -- Tests --------------------------------------------------------------------

suite('OpenAIResponsesProvider', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('streams text deltas', async () => {
		const { provider } = createMockSetup([
			sseEvent({ type: 'response.output_text.delta', delta: 'Hello', item_id: 'msg_1', output_index: 0, content_index: 0, sequence_number: 1, logprobs: [] }),
			sseEvent({ type: 'response.output_text.delta', delta: ' world', item_id: 'msg_1', output_index: 0, content_index: 0, sequence_number: 2, logprobs: [] }),
			sseEvent({
				type: 'response.completed', sequence_number: 3,
				response: {
					id: 'resp_1', status: 'completed', output: [],
					usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
				},
			}),
		]);

		const messages = [createUserMessage('Hi')];
		const chunks = await collectChunks(provider, messages);

		const textDeltas = chunks.filter(c => c.type === 'text-delta');
		assert.strictEqual(textDeltas.length, 2);
		assert.strictEqual(textDeltas[0].text, 'Hello');
		assert.strictEqual(textDeltas[1].text, ' world');
	});

	test('handles function tool calls with distinct id and call_id', async () => {
		// In the Responses API, output_item.added provides an item with both `id`
		// (item identifier) and `call_id` (tool call identifier for result correlation).
		// Delta/done events reference by `item_id` (= the item's `id` field).
		// Our provider must emit call_id as toolCallId consistently.
		const { provider } = createMockSetup([
			sseEvent({
				type: 'response.output_item.added', output_index: 0, sequence_number: 1,
				item: { type: 'function_call', call_id: 'call_abc', name: 'read_file', arguments: '', id: 'item_123' },
			}),
			sseEvent({ type: 'response.function_call_arguments.delta', item_id: 'item_123', delta: '{"path":', output_index: 0, sequence_number: 2 }),
			sseEvent({ type: 'response.function_call_arguments.delta', item_id: 'item_123', delta: '"test.txt"}', output_index: 0, sequence_number: 3 }),
			sseEvent({ type: 'response.function_call_arguments.done', item_id: 'item_123', name: 'read_file', arguments: '{"path":"test.txt"}', output_index: 0, sequence_number: 4 }),
			sseEvent({
				type: 'response.completed', sequence_number: 5,
				response: {
					id: 'resp_1', status: 'completed', output: [],
					usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
				},
			}),
		]);

		const messages = [createUserMessage('Read test.txt')];
		const chunks = await collectChunks(provider, messages);

		const toolStarts = chunks.filter(c => c.type === 'tool-call-start');
		const toolDeltas = chunks.filter(c => c.type === 'tool-call-delta');
		const toolCompletes = chunks.filter(c => c.type === 'tool-call-complete');

		assert.strictEqual(toolStarts.length, 1);
		assert.strictEqual(toolStarts[0].toolName, 'read_file');
		// Must emit call_id, not item id
		assert.strictEqual(toolStarts[0].toolCallId, 'call_abc');

		assert.strictEqual(toolDeltas.length, 2);
		// Deltas must also emit call_id
		assert.strictEqual(toolDeltas[0].toolCallId, 'call_abc');
		assert.strictEqual(toolDeltas[1].toolCallId, 'call_abc');

		assert.strictEqual(toolCompletes.length, 1);
		assert.strictEqual(toolCompletes[0].toolName, 'read_file');
		assert.strictEqual(toolCompletes[0].toolCallId, 'call_abc');
		assert.strictEqual(toolCompletes[0].arguments, '{"path":"test.txt"}');
	});

	test('reports usage from completed event', async () => {
		const { provider } = createMockSetup([
			sseEvent({ type: 'response.output_text.delta', delta: 'Hi', item_id: 'msg_1', output_index: 0, content_index: 0, sequence_number: 1, logprobs: [] }),
			sseEvent({
				type: 'response.completed', sequence_number: 2,
				response: {
					id: 'resp_1', status: 'completed', output: [],
					usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150, input_tokens_details: { cached_tokens: 20 }, output_tokens_details: { reasoning_tokens: 10 } },
				},
			}),
		]);

		const messages = [createUserMessage('Hi')];
		const chunks = await collectChunks(provider, messages);

		const usageChunks = chunks.filter(c => c.type === 'usage');
		assert.strictEqual(usageChunks.length, 1);
		assert.strictEqual(usageChunks[0].inputTokens, 100);
		assert.strictEqual(usageChunks[0].outputTokens, 50);
		assert.strictEqual(usageChunks[0].reasoningTokens, 10);
		assert.strictEqual(usageChunks[0].cacheReadTokens, 20);
	});

	test('handles reasoning summary deltas', async () => {
		const { provider } = createMockSetup([
			sseEvent({ type: 'response.reasoning_summary_text.delta', delta: 'thinking...', item_id: 'r_1', output_index: 0, content_index: 0, sequence_number: 1 }),
			sseEvent({ type: 'response.output_text.delta', delta: 'result', item_id: 'msg_1', output_index: 1, content_index: 0, sequence_number: 2, logprobs: [] }),
			sseEvent({
				type: 'response.completed', sequence_number: 3,
				response: {
					id: 'resp_1', status: 'completed', output: [],
					usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
				},
			}),
		]);

		const messages = [createUserMessage('Think about this')];
		const chunks = await collectChunks(provider, messages);

		const thinkingDeltas = chunks.filter(c => c.type === 'thinking-delta');
		assert.strictEqual(thinkingDeltas.length, 1);
		assert.strictEqual(thinkingDeltas[0].text, 'thinking...');
	});

	test('lists models', async () => {
		const { provider } = createMockSetup([]);
		const models = await provider.listModels();
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].identity.provider, 'openai');
		assert.strictEqual(models[0].identity.modelId, 'gpt-4o');
	});
});
