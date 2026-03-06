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

/**
 * Creates a ReadableStream from SSE event strings.
 * Each event should be a complete SSE event (e.g., "event: message_start\ndata: {...}\n\n").
 */
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

function createMockTokenService(): CopilotTokenService {
	const log = new NullLogService();
	const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
	const mockFetch: typeof globalThis.fetch = async () => {
		return {
			ok: true,
			status: 200,
			statusText: 'OK',
			json: async () => ({
				token: 'test-copilot-jwt',
				expires_at: futureExpiry,
				refresh_in: 1800,
				endpoints: { api: 'https://test-api.example.com' },
			}),
		} as Response;
	};
	const service = new CopilotTokenService(log, mockFetch);
	service.setGitHubToken('test-github-token');
	return service;
}

function createMockStreamFetch(sseEvents: string[]): typeof globalThis.fetch {
	return async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
		return {
			ok: true,
			status: 200,
			statusText: 'OK',
			body: createSSEStream(sseEvents),
		} as unknown as Response;
	};
}

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
	const log = new NullLogService();

	suite('SSE parsing', () => {
		test('parses a simple text response', async () => {
			const sseEvents = [
				sseEvent('message_start', {
					type: 'message_start',
					message: { id: 'msg-1', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10, output_tokens: 0 } },
				}),
				sseEvent('content_block_start', {
					type: 'content_block_start',
					index: 0,
					content_block: { type: 'text', text: '' },
				}),
				sseEvent('content_block_delta', {
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'text_delta', text: 'Hello ' },
				}),
				sseEvent('content_block_delta', {
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'text_delta', text: 'world!' },
				}),
				sseEvent('content_block_stop', {
					type: 'content_block_stop',
					index: 0,
				}),
				sseEvent('message_delta', {
					type: 'message_delta',
					delta: { stop_reason: 'end_turn' },
					usage: { output_tokens: 5 },
				}),
				sseEvent('message_stop', { type: 'message_stop' }),
			];

			const tokenService = createMockTokenService();
			const mockFetch = createMockStreamFetch(sseEvents);
			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log, mockFetch);

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
				sseEvent('message_start', {
					type: 'message_start',
					message: { id: 'msg-1', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10, output_tokens: 0 } },
				}),
				sseEvent('content_block_start', {
					type: 'content_block_start',
					index: 0,
					content_block: { type: 'tool_use', id: 'toolu_1', name: 'readFile' },
				}),
				sseEvent('content_block_delta', {
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'input_json_delta', partial_json: '{"path":' },
				}),
				sseEvent('content_block_delta', {
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'input_json_delta', partial_json: '"test.txt"}' },
				}),
				sseEvent('content_block_stop', {
					type: 'content_block_stop',
					index: 0,
				}),
				sseEvent('message_delta', {
					type: 'message_delta',
					delta: { stop_reason: 'tool_use' },
					usage: { output_tokens: 20 },
				}),
				sseEvent('message_stop', { type: 'message_stop' }),
			];

			const tokenService = createMockTokenService();
			const mockFetch = createMockStreamFetch(sseEvents);
			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log, mockFetch);

			const chunks = await collectChunks(provider);

			const toolStarts = chunks.filter(c => c.type === 'tool-call-start');
			assert.strictEqual(toolStarts.length, 1);
			if (toolStarts[0].type === 'tool-call-start') {
				assert.strictEqual(toolStarts[0].toolCallId, 'toolu_1');
				assert.strictEqual(toolStarts[0].toolName, 'readFile');
			}

			const toolDeltas = chunks.filter(c => c.type === 'tool-call-delta');
			assert.strictEqual(toolDeltas.length, 2);

			const toolCompletes = chunks.filter(c => c.type === 'tool-call-complete');
			assert.strictEqual(toolCompletes.length, 1);
			if (toolCompletes[0].type === 'tool-call-complete') {
				assert.strictEqual(toolCompletes[0].arguments, '{"path":"test.txt"}');
			}
		});

		test('parses thinking blocks', async () => {
			const sseEvents = [
				sseEvent('message_start', {
					type: 'message_start',
					message: { id: 'msg-1', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10, output_tokens: 0 } },
				}),
				sseEvent('content_block_start', {
					type: 'content_block_start',
					index: 0,
					content_block: { type: 'thinking' },
				}),
				sseEvent('content_block_delta', {
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'thinking_delta', thinking: 'Let me think...' },
				}),
				sseEvent('content_block_delta', {
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'signature_delta', signature: 'sig_xyz' },
				}),
				sseEvent('content_block_stop', {
					type: 'content_block_stop',
					index: 0,
				}),
				sseEvent('content_block_start', {
					type: 'content_block_start',
					index: 1,
					content_block: { type: 'text', text: '' },
				}),
				sseEvent('content_block_delta', {
					type: 'content_block_delta',
					index: 1,
					delta: { type: 'text_delta', text: 'The answer is 42.' },
				}),
				sseEvent('content_block_stop', {
					type: 'content_block_stop',
					index: 1,
				}),
				sseEvent('message_delta', {
					type: 'message_delta',
					delta: { stop_reason: 'end_turn' },
					usage: { output_tokens: 30 },
				}),
				sseEvent('message_stop', { type: 'message_stop' }),
			];

			const tokenService = createMockTokenService();
			const mockFetch = createMockStreamFetch(sseEvents);
			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log, mockFetch);

			const chunks = await collectChunks(provider);

			const thinkingDeltas = chunks.filter(c => c.type === 'thinking-delta');
			assert.strictEqual(thinkingDeltas.length, 1);
			if (thinkingDeltas[0].type === 'thinking-delta') {
				assert.strictEqual(thinkingDeltas[0].text, 'Let me think...');
			}

			const signatures = chunks.filter(c => c.type === 'thinking-signature');
			assert.strictEqual(signatures.length, 1);
			if (signatures[0].type === 'thinking-signature') {
				assert.strictEqual(signatures[0].signature, 'sig_xyz');
			}

			const textDeltas = chunks.filter(c => c.type === 'text-delta');
			assert.strictEqual(textDeltas.length, 1);
		});

		test('reports cache token usage', async () => {
			const sseEvents = [
				sseEvent('message_start', {
					type: 'message_start',
					message: {
						id: 'msg-1',
						model: 'claude-sonnet-4-20250514',
						usage: {
							input_tokens: 100,
							output_tokens: 0,
							cache_read_input_tokens: 50,
							cache_creation_input_tokens: 25,
						},
					},
				}),
				sseEvent('content_block_start', {
					type: 'content_block_start',
					index: 0,
					content_block: { type: 'text', text: '' },
				}),
				sseEvent('content_block_delta', {
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'text_delta', text: 'Hi' },
				}),
				sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
				sseEvent('message_delta', {
					type: 'message_delta',
					delta: { stop_reason: 'end_turn' },
					usage: { output_tokens: 5 },
				}),
				sseEvent('message_stop', { type: 'message_stop' }),
			];

			const tokenService = createMockTokenService();
			const mockFetch = createMockStreamFetch(sseEvents);
			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log, mockFetch);

			const chunks = await collectChunks(provider);

			const usageChunks = chunks.filter(c => c.type === 'usage');
			const messageStartUsage = usageChunks[0];
			if (messageStartUsage.type === 'usage') {
				assert.strictEqual(messageStartUsage.inputTokens, 100);
				assert.strictEqual(messageStartUsage.cacheReadTokens, 50);
				assert.strictEqual(messageStartUsage.cacheCreationTokens, 25);
			}
		});

		test('handles stream errors', async () => {
			const sseEvents = [
				sseEvent('error', {
					type: 'error',
					error: { message: 'Rate limit exceeded' },
				}),
			];

			const tokenService = createMockTokenService();
			const mockFetch = createMockStreamFetch(sseEvents);
			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log, mockFetch);

			await assert.rejects(
				() => collectChunks(provider),
				/Rate limit exceeded/,
			);
		});

		test('handles HTTP error', async () => {
			const tokenService = createMockTokenService();
			const mockFetch: typeof globalThis.fetch = async () => {
				return {
					ok: false,
					status: 429,
					statusText: 'Too Many Requests',
					text: async () => 'Rate limit exceeded',
				} as unknown as Response;
			};
			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log, mockFetch);

			await assert.rejects(
				() => collectChunks(provider),
				/Anthropic API error: 429/,
			);
		});
	});

	suite('message translation', () => {
		test('sends correct request body structure', async () => {
			let capturedBody: string | undefined;
			const tokenService = createMockTokenService();

			const sseEvents = [
				sseEvent('message_start', {
					type: 'message_start',
					message: { id: 'msg-1', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10, output_tokens: 0 } },
				}),
				sseEvent('content_block_start', {
					type: 'content_block_start',
					index: 0,
					content_block: { type: 'text', text: '' },
				}),
				sseEvent('content_block_delta', {
					type: 'content_block_delta',
					index: 0,
					delta: { type: 'text_delta', text: 'OK' },
				}),
				sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
				sseEvent('message_delta', {
					type: 'message_delta',
					delta: { stop_reason: 'end_turn' },
					usage: { output_tokens: 1 },
				}),
				sseEvent('message_stop', { type: 'message_stop' }),
			];

			const mockFetch: typeof globalThis.fetch = async (_input, init) => {
				capturedBody = init?.body as string;
				return {
					ok: true,
					status: 200,
					statusText: 'OK',
					body: createSSEStream(sseEvents),
				} as unknown as Response;
			};

			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log, mockFetch);

			const messages: IConversationMessage[] = [
				createUserMessage('What is 2+2?'),
			];

			await collectChunks(provider, messages);

			assert.ok(capturedBody);
			const parsed = JSON.parse(capturedBody!);

			assert.strictEqual(parsed.model, 'claude-sonnet-4-20250514');
			assert.strictEqual(parsed.stream, true);
			assert.deepStrictEqual(parsed.system, [{ type: 'text', text: 'You are a test assistant.' }]);
			assert.strictEqual(parsed.messages.length, 1);
			assert.strictEqual(parsed.messages[0].role, 'user');
			assert.deepStrictEqual(parsed.messages[0].content, [{ type: 'text', text: 'What is 2+2?' }]);
		});

		test('translates assistant messages with tool calls', async () => {
			let capturedBody: string | undefined;
			const tokenService = createMockTokenService();

			const sseEvents = [
				sseEvent('message_start', {
					type: 'message_start',
					message: { id: 'msg-1', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10, output_tokens: 0 } },
				}),
				sseEvent('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
				sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } }),
				sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
				sseEvent('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }),
				sseEvent('message_stop', { type: 'message_stop' }),
			];

			const mockFetch: typeof globalThis.fetch = async (_input, init) => {
				capturedBody = init?.body as string;
				return {
					ok: true,
					status: 200,
					statusText: 'OK',
					body: createSSEStream(sseEvents),
				} as unknown as Response;
			};

			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log, mockFetch);
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

			// Should have 3 messages: user, assistant (with tool_use), user (with tool_result)
			assert.strictEqual(parsed.messages.length, 3);

			// User message
			assert.strictEqual(parsed.messages[0].role, 'user');
			assert.strictEqual(parsed.messages[0].content[0].text, 'Read test.txt');

			// Assistant message with tool_use
			assert.strictEqual(parsed.messages[1].role, 'assistant');
			assert.strictEqual(parsed.messages[1].content.length, 2);
			assert.strictEqual(parsed.messages[1].content[0].type, 'text');
			assert.strictEqual(parsed.messages[1].content[1].type, 'tool_use');
			assert.strictEqual(parsed.messages[1].content[1].id, 'toolu_1');
			assert.strictEqual(parsed.messages[1].content[1].name, 'readFile');
			assert.deepStrictEqual(parsed.messages[1].content[1].input, { path: 'test.txt' });

			// Tool result as user message
			assert.strictEqual(parsed.messages[2].role, 'user');
			assert.strictEqual(parsed.messages[2].content[0].type, 'tool_result');
			assert.strictEqual(parsed.messages[2].content[0].tool_use_id, 'toolu_1');
			assert.strictEqual(parsed.messages[2].content[0].content, 'file contents');
		});

		test('includes tools in request body', async () => {
			let capturedBody: string | undefined;
			const tokenService = createMockTokenService();

			const sseEvents = [
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

			const mockFetch: typeof globalThis.fetch = async (_input, init) => {
				capturedBody = init?.body as string;
				return {
					ok: true,
					status: 200,
					statusText: 'OK',
					body: createSSEStream(sseEvents),
				} as unknown as Response;
			};

			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log, mockFetch);

			const tools = [
				{ name: 'readFile', description: 'Read a file', parametersSchema: { properties: { path: { type: 'string' } }, required: ['path'] } },
			];

			for await (const _chunk of provider.sendRequest('system', [createUserMessage('hi')], tools, {}, CancellationToken.None)) {
				// consume
			}

			assert.ok(capturedBody);
			const parsed = JSON.parse(capturedBody!);

			assert.strictEqual(parsed.tools.length, 1);
			assert.strictEqual(parsed.tools[0].name, 'readFile');
			assert.strictEqual(parsed.tools[0].description, 'Read a file');
			assert.strictEqual(parsed.tools[0].input_schema.type, 'object');
			assert.deepStrictEqual(parsed.tools[0].input_schema.required, ['path']);
		});

		test('sends correct auth headers', async () => {
			let capturedHeaders: Record<string, string> | undefined;
			const tokenService = createMockTokenService();

			const sseEvents = [
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

			const mockFetch: typeof globalThis.fetch = async (_input, init) => {
				capturedHeaders = Object.fromEntries(Object.entries(init?.headers ?? {}));
				return {
					ok: true,
					status: 200,
					statusText: 'OK',
					body: createSSEStream(sseEvents),
				} as unknown as Response;
			};

			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log, mockFetch);
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
			const tokenService = createMockTokenService();
			let streamStarted = false;

			const mockFetch: typeof globalThis.fetch = async (_input, init) => {
				streamStarted = true;

				// Create a stream that responds to the fetch abort signal
				const abortSignal = init?.signal;
				const stream = new ReadableStream({
					start(controller) {
						const event = sseEvent('message_start', {
							type: 'message_start',
							message: { id: 'msg-1', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10, output_tokens: 0 } },
						});
						controller.enqueue(encoder.encode(event));

						// When the fetch is aborted, close the stream with an error
						if (abortSignal) {
							abortSignal.addEventListener('abort', () => {
								try { controller.error(new Error('aborted')); } catch { /* already closed */ }
							});
						}
					},
				});

				return {
					ok: true,
					status: 200,
					statusText: 'OK',
					body: stream,
				} as unknown as Response;
			};

			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log, mockFetch);

			// Cancel after a short delay
			setTimeout(() => cts.cancel(), 50);

			await assert.rejects(
				() => collectChunks(provider, [createUserMessage('Hi')], cts.token),
				CancellationError,
			);
			assert.ok(streamStarted);
		});
	});

	suite('listModels', () => {
		test('returns the configured model', async () => {
			const tokenService = createMockTokenService();
			const provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log);

			const models = await provider.listModels();
			assert.strictEqual(models.length, 1);
			assert.strictEqual(models[0].identity.modelId, 'claude-sonnet-4-20250514');
			assert.strictEqual(models[0].identity.provider, 'anthropic');
			assert.strictEqual(models[0].supportsReasoning, true);
		});
	});
});
