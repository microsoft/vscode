/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { createAssistantMessage, createToolResultMessage, createUserMessage, IConversationMessage } from '../../common/conversation.js';
import { ModelResponseChunk } from '../../common/modelProvider.js';
import { AnthropicModelProvider } from '../../node/anthropicProvider.js';
import { CopilotTokenService } from '../../node/copilotToken.js';

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

function sseEvent(type: string, data: unknown): string {
	return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Creates a CopilotTokenService backed by a mock fetcher that:
 * 1. Returns a canned token response for CopilotToken requests
 * 2. Returns SSE stream responses for ChatMessages requests (model calls)
 */
function createMockSetup(sseEvents: string[], options?: { captureBody?: (body: string) => void; captureHeaders?: (headers: Record<string, string>) => void }) {
	const log = new NullLogService();
	const futureExpiry = Math.floor(Date.now() / 1000) + 3600;

	const fetcher = {
		fetch(url: string, fetchOptions: Record<string, unknown>): Promise<unknown> {
			// Token exchange request
			if (typeof url === 'string' && url.includes('copilot_internal')) {
				return Promise.resolve({
					token: 'test-copilot-jwt',
					expires_at: futureExpiry,
					refresh_in: 1800,
					endpoints: { api: 'https://test-api.example.com' },
					sku: 'copilot_for_business',
				});
			}

			// Capture request details if requested
			if (options?.captureBody && fetchOptions.body) {
				options.captureBody(fetchOptions.body as string);
			}
			if (options?.captureHeaders && fetchOptions.headers) {
				options.captureHeaders(fetchOptions.headers as Record<string, string>);
			}

			// Model request -> return SSE stream
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
				body: createSSEStream(sseEvents),
				text: async () => '',
			});
		},
		fetchWithPagination() {
			return Promise.resolve([]);
		},
	};

	const tokenService = new CopilotTokenService(log, fetcher);
	tokenService.setGitHubToken('test-github-token');
	const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log);
	return { tokenService, provider };
}

const SIMPLE_SSE_EVENTS = [
	sseEvent('message_start', {
		type: 'message_start',
		message: { id: 'msg-1', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10, output_tokens: 0 } },
	}),
	sseEvent('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
	sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } }),
	sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
	sseEvent('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }),
	sseEvent('message_stop', { type: 'message_stop' }),
];

async function collectChunks(
	provider: AnthropicModelProvider,
	messages: readonly IConversationMessage[] = [createUserMessage('Hello')],
	token: CancellationToken = CancellationToken.None,
): Promise<ModelResponseChunk[]> {
	const chunks: ModelResponseChunk[] = [];
	for await (const chunk of provider.sendRequest('You are a test assistant.', messages, [], {}, token)) {
		chunks.push(chunk);
	}
	return chunks;
}

// -- Tests --------------------------------------------------------------------

suite('AnthropicModelProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('SSE parsing', () => {
		test('parses a simple text response', async () => {
			const sseEvents = [
				sseEvent('message_start', {
					type: 'message_start',
					message: { id: 'msg-1', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10, output_tokens: 0 } },
				}),
				sseEvent('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
				sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } }),
				sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'world!' } }),
				sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
				sseEvent('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }),
				sseEvent('message_stop', { type: 'message_stop' }),
			];

			const { provider } = createMockSetup(sseEvents);
			const chunks = await collectChunks(provider);

			const textDeltas = chunks.filter(c => c.type === 'text-delta');
			assert.strictEqual(textDeltas.length, 2);
			assert.strictEqual(textDeltas[0].text, 'Hello ');
			assert.strictEqual(textDeltas[1].text, 'world!');

			const usageChunks = chunks.filter(c => c.type === 'usage');
			assert.ok(usageChunks.length >= 1);
		});

		test('parses tool_use blocks', async () => {
			const sseEvents = [
				sseEvent('message_start', { type: 'message_start', message: { id: 'msg-1', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10, output_tokens: 0 } } }),
				sseEvent('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'readFile' } }),
				sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":' } }),
				sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"test.txt"}' } }),
				sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
				sseEvent('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } }),
				sseEvent('message_stop', { type: 'message_stop' }),
			];

			const { provider } = createMockSetup(sseEvents);
			const chunks = await collectChunks(provider);

			const toolCompletes = chunks.filter(c => c.type === 'tool-call-complete');
			assert.strictEqual(toolCompletes.length, 1);
			if (toolCompletes[0].type === 'tool-call-complete') {
				assert.strictEqual(toolCompletes[0].arguments, '{"path":"test.txt"}');
			}
		});

		test('parses thinking blocks', async () => {
			const sseEvents = [
				sseEvent('message_start', { type: 'message_start', message: { id: 'msg-1', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10, output_tokens: 0 } } }),
				sseEvent('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }),
				sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Let me think...' } }),
				sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig_xyz' } }),
				sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
				sseEvent('content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
				sseEvent('content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'The answer is 42.' } }),
				sseEvent('content_block_stop', { type: 'content_block_stop', index: 1 }),
				sseEvent('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 30 } }),
				sseEvent('message_stop', { type: 'message_stop' }),
			];

			const { provider } = createMockSetup(sseEvents);
			const chunks = await collectChunks(provider);

			const thinkingDeltas = chunks.filter(c => c.type === 'thinking-delta');
			assert.strictEqual(thinkingDeltas.length, 1);

			const signatures = chunks.filter(c => c.type === 'thinking-signature');
			assert.strictEqual(signatures.length, 1);
		});

		test('handles stream errors', async () => {
			const sseEvents = [
				sseEvent('error', { type: 'error', error: { message: 'Rate limit exceeded' } }),
			];

			const { provider } = createMockSetup(sseEvents);
			await assert.rejects(() => collectChunks(provider), /Rate limit exceeded/);
		});

		test('handles HTTP error', async () => {
			const log2 = new NullLogService();
			const fetcher = {
				fetch(url: string) {
					if (url.includes('copilot_internal')) {
						return Promise.resolve({
							token: 'jwt', expires_at: Math.floor(Date.now() / 1000) + 3600,
							refresh_in: 1800, endpoints: {}, sku: 'test',
						});
					}
					// 400 is not retryable -- should fail immediately
					return Promise.resolve({
						ok: false, status: 400, statusText: 'Bad Request',
						text: async () => 'Invalid request body',
					});
				},
				fetchWithPagination() { return Promise.resolve([]); },
			};
			const tokenService = new CopilotTokenService(log2, fetcher);
			tokenService.setGitHubToken('test');
			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log2);
			await assert.rejects(() => collectChunks(provider), /Anthropic API error: 400/);
		});
	});

	suite('message translation', () => {
		test('sends correct request body structure', async () => {
			let capturedBody: string | undefined;
			const { provider } = createMockSetup(SIMPLE_SSE_EVENTS, {
				captureBody: (body) => { capturedBody = body; },
			});

			await collectChunks(provider, [createUserMessage('What is 2+2?')]);

			assert.ok(capturedBody);
			const parsed = JSON.parse(capturedBody!);
			assert.strictEqual(parsed.model, 'claude-sonnet-4-20250514');
			assert.strictEqual(parsed.stream, true);
			assert.deepStrictEqual(parsed.system, [{ type: 'text', text: 'You are a test assistant.' }]);
			assert.strictEqual(parsed.messages.length, 1);
			assert.strictEqual(parsed.messages[0].role, 'user');
		});

		test('translates assistant messages with tool calls', async () => {
			let capturedBody: string | undefined;
			const { provider } = createMockSetup(SIMPLE_SSE_EVENTS, {
				captureBody: (body) => { capturedBody = body; },
			});

			const model = { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514' };
			const messages: IConversationMessage[] = [
				createUserMessage('Read test.txt'),
				createAssistantMessage([
					{ type: 'text', text: 'I will read that file.' },
					{ type: 'tool-call', toolCallId: 'toolu_1', toolName: 'readFile', arguments: { path: 'test.txt' } },
				], model),
				createToolResultMessage('toolu_1', 'readFile', 'file contents'),
			];

			await collectChunks(provider, messages);

			assert.ok(capturedBody);
			const parsed = JSON.parse(capturedBody!);
			assert.strictEqual(parsed.messages.length, 3);
			assert.strictEqual(parsed.messages[1].content[1].type, 'tool_use');
			assert.strictEqual(parsed.messages[2].content[0].type, 'tool_result');
		});

		test('sends correct auth headers', async () => {
			let capturedHeaders: Record<string, string> | undefined;
			const { provider } = createMockSetup(SIMPLE_SSE_EVENTS, {
				captureHeaders: (headers) => { capturedHeaders = headers; },
			});

			await collectChunks(provider);

			assert.ok(capturedHeaders);
			assert.strictEqual(capturedHeaders!['Authorization'], 'Bearer test-copilot-jwt');
			assert.ok(capturedHeaders!['anthropic-beta']);
			assert.strictEqual(capturedHeaders!['Content-Type'], 'application/json');
		});
	});

	suite('cancellation', () => {
		test('cancels mid-stream', async () => {
			const cts = store.add(new CancellationTokenSource());
			const log2 = new NullLogService();

			const fetcher = {
				fetch(url: string, fetchOptions: Record<string, unknown>) {
					if (url.includes('copilot_internal')) {
						return Promise.resolve({
							token: 'jwt', expires_at: Math.floor(Date.now() / 1000) + 3600,
							refresh_in: 1800, endpoints: {}, sku: 'test',
						});
					}

					const abortSignal = fetchOptions.signal as AbortSignal | undefined;
					const stream = new ReadableStream({
						start(controller) {
							const event = sseEvent('message_start', {
								type: 'message_start',
								message: { id: 'msg-1', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10, output_tokens: 0 } },
							});
							controller.enqueue(encoder.encode(event));
							if (abortSignal) {
								abortSignal.addEventListener('abort', () => {
									try { controller.error(new Error('aborted')); } catch { /* already closed */ }
								});
							}
						},
					});
					return Promise.resolve({ ok: true, status: 200, statusText: 'OK', body: stream });
				},
				fetchWithPagination() { return Promise.resolve([]); },
			};

			const tokenService = new CopilotTokenService(log2, fetcher);
			tokenService.setGitHubToken('test');
			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log2);

			setTimeout(() => cts.cancel(), 50);

			await assert.rejects(
				() => collectChunks(provider, [createUserMessage('Hi')], cts.token),
				CancellationError,
			);
		});
	});

	suite('listModels', () => {
		test('returns the configured model', async () => {
			const { provider } = createMockSetup([]);
			const models = await provider.listModels();
			assert.strictEqual(models.length, 1);
			assert.strictEqual(models[0].identity.modelId, 'claude-sonnet-4-20250514');
			assert.strictEqual(models[0].identity.provider, 'anthropic');
		});
	});
});
