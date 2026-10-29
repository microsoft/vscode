/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as http from 'http';
import { AddressInfo } from 'net';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ChannelClient, ChannelServer } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IByokLmBridgeConnection, IByokLmChatRequest, IByokLmChatResult, IByokLmModelInfo } from '../../common/agentHostByokLm.js';
import { AgentHostClientByokLmChannel, createAgentHostClientByokLmConnection } from '../../common/agentHostClientByokLmChannel.js';
import { ByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService, type IByokLmProxyHandle, type IByokLmToolsCappedEvent } from '../../node/copilot/byokLmProxyService.js';
import { BYOK_MAX_TOOLS } from '../../node/copilot/byokResponsesTranslation.js';
import { IProxyInFlight } from '../../node/shared/loopbackProxyServer.js';

/**
 * Exercises the inference path end-to-end without the Copilot SDK runtime:
 * the test plays the runtime's role by POSTing OpenAI Responses
 * requests at the loopback proxy, and plays the renderer's role with a fake
 * {@link IByokLmChatRequest} -> {@link IByokLmChatResult} bridge function. The
 * only contract under test is the OpenAI wire format in, the bridge DTO out,
 * and the SSE wire format back.
 */
suite('ByokLmProxyService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const sessionId = 'sess-1';

	class TestByokLmProxyService extends ByokLmProxyService {
		inFlight: ReadonlySet<IProxyInFlight> = new Set();
		response: http.ServerResponse | undefined;

		protected override async handleRequest(...args: Parameters<ByokLmProxyService['handleRequest']>): Promise<void> {
			this.inFlight = args[2].inFlight;
			this.response = args[1];
			return super.handleRequest(...args);
		}
	}

	/**
	 * A serving bridge connection: it pushes its model snapshot (default empty)
	 * synchronously when the registry subscribes, so it is a valid routing target.
	 */
	function servingConnection(chat: IByokLmBridgeConnection['chat'], models: IByokLmModelInfo[] = []): IByokLmBridgeConnection {
		const emitter = store.add(new Emitter<IByokLmModelInfo[]>({
			onDidAddFirstListener: () => emitter.fire(models),
		}));
		return { chat, onDidChangeModels: emitter.event };
	}

	async function withProxy(
		chat: IByokLmBridgeConnection['chat'],
		run: (handle: IByokLmProxyHandle, service: TestByokLmProxyService, disconnect: () => void) => Promise<void>,
	): Promise<void> {
		const transport = new DisposableStore();
		const toRenderer = transport.add(new Emitter<VSBuffer>());
		const toHost = transport.add(new Emitter<VSBuffer>());
		const client = transport.add(new ChannelClient({ onMessage: toHost.event, send: buffer => toRenderer.fire(buffer) }));
		const server = transport.add(new ChannelServer({ onMessage: toRenderer.event, send: buffer => toHost.fire(buffer) }, undefined));
		server.registerChannel('byok', new AgentHostClientByokLmChannel({ _serviceBrand: undefined, chat, listModels: async () => [] }, new NullLogService()));
		const connection = createAgentHostClientByokLmConnection(client.getChannel('byok'));
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client-1', servingConnection(connection.chat));
		const service = new TestByokLmProxyService(new NullLogService(), registry);
		const handle = await service.start();
		try {
			await run(handle, service, () => transport.dispose());
		} finally {
			handle.dispose();
			registration.dispose();
			service.dispose();
			transport.dispose();
		}
	}

	function responsesUrl(handle: IByokLmProxyHandle, vendor: string): string {
		return `${handle.providerBaseUrl(vendor)}/responses`;
	}

	function authHeaders(handle: IByokLmProxyHandle, selectedSessionId = sessionId): Record<string, string> {
		return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${handle.nonce}.${selectedSessionId}` };
	}

	for (const phase of ['prompt', 'stream'] as const) {
		for (const stop of ['client', 'shutdown', 'disconnect'] as const) {
			test(`aborts the upstream HTTP request during ${phase} on ${stop}`, async function () {
				this.timeout(10_000);
				const http = await import('http');
				const started = new DeferredPromise<void>();
				const stopped = new DeferredPromise<void>();
				let activeListeners = 0;
				let activeProcessing = 0;
				const provider = http.createServer(async (req, res) => {
					assert.strictEqual(req.url, '/v1/chat/completions');
					for await (const _chunk of req) {}
					activeProcessing++;
					res.once('close', () => {
						activeProcessing--;
						stopped.complete();
					});
					if (phase === 'stream') {
						res.writeHead(200, { 'Content-Type': 'text/event-stream' });
						res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }] })}\n\n`);
					}
					started.complete();
				});
				await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve));
				try {
					await withProxy(async (request, token) => {
						assert.ok(token);
						const controller = new AbortController();
						const listener = token.onCancellationRequested(() => controller.abort());
						activeListeners++;
						try {
							const upstream = await fetch(`http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1/chat/completions`, {
								method: 'POST',
								body: JSON.stringify({ model: request.modelId, messages: [], stream: phase === 'stream' }),
								signal: controller.signal,
							});
							await upstream.text();
							return { output: [] };
						} finally {
							listener.dispose();
							activeListeners--;
						}
					}, async (handle, service, disconnect) => {
						const controller = new AbortController();
						const pending = fetch(responsesUrl(handle, 'acme'), {
							method: 'POST', headers: authHeaders(handle),
							body: JSON.stringify({ model: 'm', input: 'hello', stream: true }),
							signal: controller.signal,
						});
						const settled = pending.then(response => response.text(), () => undefined);
						await started.p;
						if (stop === 'client') {
							controller.abort();
						} else if (stop === 'shutdown') {
							service.dispose();
						} else {
							disconnect();
						}
						await stopped.p;
						await settled;
						assert.deepStrictEqual({ activeProcessing, activeListeners, pending: service.inFlight.size, closeListeners: service.response?.listenerCount('close') }, {
							activeProcessing: 0, activeListeners: 0, pending: 0, closeListeners: 0,
						});
					});
				} finally {
					provider.closeAllConnections();
					await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve()));
				}
			});
		}
	}

	test('releases a cancelled proxy request before a late bridge completion', async () => {
		const started = new DeferredPromise<void>();
		const late = new DeferredPromise<IByokLmChatResult>();
		await withProxy(async () => {
			started.complete();
			return late.p;
		}, async (handle, service) => {
			const controller = new AbortController();
			const pending = fetch(responsesUrl(handle, 'acme'), {
				method: 'POST', headers: authHeaders(handle),
				body: JSON.stringify({ model: 'm', input: 'hello' }), signal: controller.signal,
			});
			const rejected = assert.rejects(pending);
			await started.p;
			controller.abort();
			await rejected;
			await new Promise<void>(resolve => service.response!.once('close', resolve));
			await new Promise<void>(resolve => setImmediate(resolve));
			assert.strictEqual(service.inFlight.size, 0);
			late.complete({ responseId: 'late', output: [{ type: 'message', content: [{ type: 'text', text: 'late' }] }] });
		});
	});

	test('serves the unauthenticated health check', async () => {
		await withProxy(
			async () => ({ output: [] }),
			async (handle) => {
				const response = await fetch(`${handle.baseUrl}/`);
				assert.strictEqual(response.status, 200);
				assert.strictEqual(await response.text(), 'ok');
			},
		);
	});

	test('rejects requests without a valid bearer token', async () => {
		await withProxy(
			async () => ({ output: [] }),
			async (handle) => {
				const response = await fetch(responsesUrl(handle, 'acme'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: 'm', input: [] }),
				});
				assert.strictEqual(response.status, 401);
			},
		);
	});

	test('rejects a nonce-only bearer token (no session id)', async () => {
		await withProxy(
			async () => ({ output: [] }),
			async (handle) => {
				const response = await fetch(responsesUrl(handle, 'acme'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${handle.nonce}` },
					body: JSON.stringify({ model: 'm', input: [] }),
				});
				assert.strictEqual(response.status, 401);
			},
		);
	});

	test('returns 404 for an authenticated but unknown route', async () => {
		await withProxy(
			async () => ({ output: [] }),
			async (handle) => {
				const response = await fetch(`${handle.baseUrl}/v/acme/chat/completions`, {
					method: 'POST',
					headers: authHeaders(handle),
					body: '{}',
				});
				assert.strictEqual(response.status, 404);
			},
		);
	});

	test('caps tools at the BYOK limit, reports the session, and still serves the request', async () => {
		const bridgeToolCounts: (number | undefined)[] = [];
		const capEvents: IByokLmToolsCappedEvent[] = [];
		const tools = (count: number) => Array.from({ length: count }, (_, i) => ({ type: 'function', name: `tool_${i}`, parameters: { type: 'object' } }));
		await withProxy(
			async (request) => {
				bridgeToolCounts.push(request.tools?.length);
				return { output: [{ type: 'message', content: [{ type: 'text', text: 'ok' }] }] };
			},
			async (handle, service) => {
				const listener = service.onDidCapTools(e => capEvents.push(e));
				try {
					const statuses: number[] = [];
					for (const count of [BYOK_MAX_TOOLS, 200]) {
						const response = await fetch(responsesUrl(handle, 'acme'), {
							method: 'POST',
							headers: authHeaders(handle),
							body: JSON.stringify({ model: 'm', input: 'hi', tools: tools(count) }),
						});
						statuses.push(response.status);
						await response.text();
					}
					assert.deepStrictEqual(statuses, [200, 200]);
				} finally {
					listener.dispose();
				}
			},
		);
		assert.deepStrictEqual({ bridgeToolCounts, capEvents }, {
			bridgeToolCounts: [BYOK_MAX_TOOLS, BYOK_MAX_TOOLS],
			capEvents: [{ sessionId, requestedToolCount: 200, sentToolCount: BYOK_MAX_TOOLS }],
		});
	});

	test('forwards a Responses request to the bridge and returns JSON by default', async () => {
		let captured: IByokLmChatRequest | undefined;
		await withProxy(
			async (request) => {
				captured = request;
				return { output: [{ type: 'message', content: [{ type: 'text', text: 'hello from byok' }] }] };
			},
			async (handle) => {
				const response = await fetch(responsesUrl(handle, 'acme'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'claude', input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }] }),
				});
				assert.strictEqual(response.status, 200);
				assert.strictEqual(response.headers.get('content-type'), 'application/json');
				const body = await response.json() as { output: Array<{ content: Array<{ text: string }> }> };
				assert.strictEqual(body.output[0].content[0].text, 'hello from byok');
			},
		);
		assert.strictEqual(captured?.vendor, 'acme');
		assert.strictEqual(captured?.modelId, 'claude');
		assert.deepStrictEqual(captured?.input, [{ type: 'message', role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
	});

	test('forwards the authenticated session as conversation ID while preserving model options', async () => {
		const captured: IByokLmChatRequest[] = [];
		await withProxy(
			async request => {
				captured.push(request);
				return { output: [{ type: 'message', content: [{ type: 'text', text: 'ok' }] }] };
			},
			async handle => {
				for (const selectedSessionId of [sessionId, sessionId, 'sess-2']) {
					const response = await fetch(responsesUrl(handle, 'acme'), {
						method: 'POST',
						headers: authHeaders(handle, selectedSessionId),
						body: JSON.stringify({ model: 'm', input: 'hi', temperature: 0.5, top_p: 0.9, max_output_tokens: 100 }),
					});
					assert.strictEqual(response.status, 200);
					await response.text();
				}
			},
		);
		assert.deepStrictEqual(captured.map(request => request.modelOptions), [
			{ temperature: 0.5, top_p: 0.9, max_tokens: 100, _conversationId: sessionId },
			{ temperature: 0.5, top_p: 0.9, max_tokens: 100, _conversationId: sessionId },
			{ temperature: 0.5, top_p: 0.9, max_tokens: 100, _conversationId: 'sess-2' },
		]);
	});

	test('forwards image input on the initial and subsequent turns', async () => {
		const captured: IByokLmChatRequest[] = [];
		const statuses: number[] = [];
		const imageMessage = {
			type: 'message',
			role: 'user',
			content: [
				{ type: 'input_text', text: 'What is in this image?' },
				{ type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgo=' },
			],
		};

		await withProxy(
			async request => {
				captured.push(request);
				return { output: [{ type: 'message', content: [{ type: 'text', text: 'an image' }] }] };
			},
			async handle => {
				for (const input of [
					[imageMessage],
					[imageMessage, { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Try again without a new image.' }] }],
				]) {
					const response = await fetch(responsesUrl(handle, 'gemini'), {
						method: 'POST',
						headers: authHeaders(handle),
						body: JSON.stringify({ model: 'gemini-3.6-flash', input }),
					});
					statuses.push(response.status);
					await response.text();
				}
			},
		);

		assert.deepStrictEqual({ statuses, input: captured.map(request => request.input) }, {
			statuses: [200, 200],
			input: [
				[
					{
						type: 'message',
						role: 'user',
						content: [
							{ type: 'text', text: 'What is in this image?' },
							{ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
						],
					},
				],
				[
					{
						type: 'message',
						role: 'user',
						content: [
							{ type: 'text', text: 'What is in this image?' },
							{ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
						],
					},
					{
						type: 'message',
						role: 'user',
						content: [
							{ type: 'text', text: 'Try again without a new image.' },
						],
					},
				],
			],
		});
	});

	test('rejects image URLs that cannot be forwarded as inline data', async () => {
		await withProxy(
			async () => ({ output: [] }),
			async handle => {
				const responses: Array<{ status: number; body: unknown }> = [];
				for (const imageUrl of ['https://example.com/image.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,not valid']) {
					const response = await fetch(responsesUrl(handle, 'gemini'), {
						method: 'POST',
						headers: authHeaders(handle),
						body: JSON.stringify({
							model: 'gemini-3.6-flash',
							input: [{
								type: 'message',
								role: 'user',
								content: [{ type: 'input_image', image_url: imageUrl }],
							}],
						}),
					});
					responses.push({ status: response.status, body: await response.json() });
				}

				assert.deepStrictEqual(responses, [
					{
						status: 400,
						body: {
							error: {
								message: 'Unsupported input[0].content[0].image_url',
								type: 'invalid_request_error',
							},
						},
					},
					{
						status: 400,
						body: {
							error: {
								message: 'Unsupported input[0].content[0].image_url MIME type \'image/svg+xml\'',
								type: 'invalid_request_error',
							},
						},
					},
					{
						status: 400,
						body: {
							error: {
								message: 'Invalid input[0].content[0].image_url',
								type: 'invalid_request_error',
							},
						},
					},
				]);
			},
		);
	});

	test('forwards custom tool call history with freeform input', async () => {
		let captured: IByokLmChatRequest | undefined;
		await withProxy(
			async (request) => {
				captured = request;
				return { output: [{ type: 'message', content: [{ type: 'text', text: 'done' }] }] };
			},
			async (handle) => {
				const response = await fetch(responsesUrl(handle, 'acme'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({
						model: 'm',
						input: [
							{
								type: 'custom_tool_call',
								call_id: 'call_1',
								name: 'apply_patch',
								input: '*** Begin Patch\n*** End Patch',
							},
							{ type: 'custom_tool_call_output', call_id: 'call_1', output: 'Done!' },
						],
					}),
				});
				assert.strictEqual(response.status, 200);
				await response.text();
			},
		);
		assert.deepStrictEqual(captured?.input, [
			{
				type: 'custom_tool_call',
				callId: 'call_1',
				name: 'apply_patch',
				input: '*** Begin Patch\n*** End Patch',
			},
			{ type: 'custom_tool_call_output', callId: 'call_1', output: 'Done!' },
		]);
	});

	test('recovers only the exact scoped tool continuation without overriding explicit state', async () => {
		const captured: IByokLmChatRequest[] = [];
		const initialInput = [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Use both tools.' }] }];
		const outputs = [
			{ type: 'function_call_output', call_id: 'function_1', output: 'Rain' },
			{ type: 'custom_tool_call_output', call_id: 'custom_1', output: 'Applied patch.' },
		];
		const replayedInput = [
			...initialInput,
			{ type: 'function_call', call_id: 'function_1', name: 'get_weather', arguments: '{}' },
			{ type: 'custom_tool_call', call_id: 'custom_1', name: 'apply_patch', input: '*** Begin Patch\n*** End Patch' },
			...outputs,
		];

		await withProxy(
			async request => {
				captured.push(request);
				if (captured.length === 1) {
					return {
						responseId: 'resp_provider_1',
						output: [
							{ type: 'function_call', callId: 'function_1', name: 'get_weather', argumentsJson: '{}' },
							{ type: 'custom_tool_call', callId: 'custom_1', name: 'apply_patch', input: '*** Begin Patch\n*** End Patch' },
						],
					};
				}
				if (captured.length === 6) {
					return { responseId: 'resp_provider_2', output: [{ type: 'message', content: [{ type: 'text', text: 'done' }] }] };
				}
				return { output: [], error: 'not a valid continuation' };
			},
			async handle => {
				const post = (vendor: string, model: string, requestSessionId: string, input: unknown, previousResponseId?: string) => fetch(responsesUrl(handle, vendor), {
					method: 'POST',
					headers: authHeaders(handle, requestSessionId),
					body: JSON.stringify({ model, input, ...(previousResponseId ? { previous_response_id: previousResponseId } : {}) }),
				});

				let response = await post('acme', 'm', sessionId, initialInput);
				assert.strictEqual(response.status, 200);
				await response.text();

				response = await post('acme', 'm', sessionId, replayedInput, 'resp_explicit');
				assert.strictEqual(response.status, 502);
				await response.text();

				for (const [vendor, model, requestSessionId] of [
					['acme', 'm', 'sess-2'],
					['other', 'm', sessionId],
					['acme', 'other-model', sessionId],
				]) {
					response = await post(vendor, model, requestSessionId, replayedInput);
					assert.strictEqual(response.status, 502);
					await response.text();
				}

				response = await post('acme', 'm', sessionId, replayedInput);
				assert.strictEqual(response.status, 200);
				await response.text();

				response = await post('acme', 'm', sessionId, replayedInput);
				assert.strictEqual(response.status, 502);
				await response.text();
			},
		);

		assert.strictEqual(captured[1]?.previousResponseId, 'resp_explicit');
		assert.deepStrictEqual(captured.map(request => request.modelOptions), [
			{ _conversationId: sessionId },
			{ _conversationId: sessionId },
			{ _conversationId: 'sess-2' },
			{ _conversationId: sessionId },
			{ _conversationId: sessionId },
			{ _conversationId: sessionId },
			{ _conversationId: sessionId },
		]);
		assert.deepStrictEqual(captured.slice(2, 5).map(request => request.previousResponseId), [undefined, undefined, undefined]);
		assert.deepStrictEqual({
			previousResponseId: captured[5]?.previousResponseId,
			input: captured[5]?.input,
			clearedPreviousResponseId: captured[6]?.previousResponseId,
		}, {
			previousResponseId: 'resp_provider_1',
			input: [
				{ type: 'function_call_output', callId: 'function_1', output: 'Rain' },
				{ type: 'custom_tool_call_output', callId: 'custom_1', output: 'Applied patch.' },
			],
			clearedPreviousResponseId: undefined,
		});
	});

	test('recovers a tool continuation with image output', async () => {
		const captured: IByokLmChatRequest[] = [];
		const initialInput = [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'View the image.' }] }];
		const toolOutput = {
			type: 'function_call_output',
			call_id: 'call_1',
			output: [
				{ type: 'input_text', text: 'Image contents:' },
				{ type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgo=' },
			],
		};
		const replayedInput = [
			...initialInput,
			{ type: 'function_call', call_id: 'call_1', name: 'view', arguments: '{}' },
			toolOutput,
		];

		await withProxy(
			async request => {
				captured.push(request);
				return captured.length === 1
					? { responseId: 'resp_provider_1', output: [{ type: 'function_call', callId: 'call_1', name: 'view', argumentsJson: '{}' }] }
					: { output: [{ type: 'message', content: [{ type: 'text', text: 'done' }] }] };
			},
			async handle => {
				for (const input of [initialInput, replayedInput]) {
					const response = await fetch(responsesUrl(handle, 'acme'), {
						method: 'POST',
						headers: authHeaders(handle),
						body: JSON.stringify({ model: 'm', input }),
					});
					assert.strictEqual(response.status, 200);
					await response.text();
				}
			},
		);

		assert.deepStrictEqual({
			previousResponseId: captured[1]?.previousResponseId,
			input: captured[1]?.input,
		}, {
			previousResponseId: 'resp_provider_1',
			input: [
				{
					type: 'function_call_output',
					callId: 'call_1',
					output: 'Image contents:',
					content: [
						{ type: 'text', text: 'Image contents:' },
						{ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
					],
				},
			],
		});
	});

	test('consumes an explicit continuation only after a successful bridge result', async () => {
		const captured: IByokLmChatRequest[] = [];
		const output = { type: 'function_call_output', call_id: 'call_1', output: 'done' };
		const replayedInput = [
			{ type: 'function_call', call_id: 'call_1', name: 'tool', arguments: '{}' },
			output,
		];

		await withProxy(
			async request => {
				captured.push(request);
				if (captured.length === 1) {
					return {
						responseId: 'resp_1',
						output: [{ type: 'function_call', callId: 'call_1', name: 'tool', argumentsJson: '{}' }],
					};
				}
				return captured.length === 2
					? { output: [], error: 'retryable failure' }
					: { output: [{ type: 'message', content: [{ type: 'text', text: 'done' }] }] };
			},
			async handle => {
				const post = (input: unknown, previousResponseId?: string) => fetch(responsesUrl(handle, 'acme'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'm', input, ...(previousResponseId ? { previous_response_id: previousResponseId } : {}) }),
				});

				for (const [input, previousResponseId, expectedStatus] of [
					[[], undefined, 200],
					[[output], 'resp_1', 502],
					[[output], 'resp_1', 200],
					[replayedInput, undefined, 200],
				] as const) {
					const response = await post(input, previousResponseId);
					assert.strictEqual(response.status, expectedStatus);
					await response.text();
				}
			},
		);

		assert.deepStrictEqual({
			previousResponseIds: captured.map(request => request.previousResponseId),
			finalInput: captured[3]?.input,
		}, {
			previousResponseIds: [undefined, 'resp_1', 'resp_1', undefined],
			finalInput: [
				{ type: 'function_call', callId: 'call_1', name: 'tool', argumentsJson: '{}' },
				{ type: 'function_call_output', callId: 'call_1', output: 'done' },
			],
		});
	});

	test('preserves full stateless replay when no resumable provider state is reported', async () => {
		const captured: IByokLmChatRequest[] = [];
		const initialInput = [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Use the tool.' }] }];
		const replayedInput = [
			...initialInput,
			{ type: 'function_call', call_id: 'call_1', name: 'tool', arguments: '{}' },
			{ type: 'function_call_output', call_id: 'call_1', output: 'done' },
		];

		await withProxy(
			async request => {
				captured.push(request);
				return captured.length === 1
					? { output: [{ type: 'function_call', callId: 'call_1', name: 'tool', argumentsJson: '{}' }] }
					: { output: [{ type: 'message', content: [{ type: 'text', text: 'done' }] }] };
			},
			async handle => {
				for (const input of [initialInput, replayedInput]) {
					const response = await fetch(responsesUrl(handle, 'acme'), {
						method: 'POST',
						headers: authHeaders(handle),
						body: JSON.stringify({ model: 'm', input }),
					});
					assert.strictEqual(response.status, 200);
					await response.text();
				}
			},
		);

		assert.deepStrictEqual({
			previousResponseId: captured[1]?.previousResponseId,
			input: captured[1]?.input,
		}, {
			previousResponseId: undefined,
			input: [
				{ type: 'message', role: 'user', content: [{ type: 'text', text: 'Use the tool.' }] },
				{ type: 'function_call', callId: 'call_1', name: 'tool', argumentsJson: '{}' },
				{ type: 'function_call_output', callId: 'call_1', output: 'done' },
			],
		});
	});

	test('keeps interleaved parent and subagent continuations in the same scope', async () => {
		const captured: IByokLmChatRequest[] = [];
		const parentInitial = [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Parent' }] }];
		const subagentInitial = [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Subagent' }] }];
		const replay = (input: object[], callId: string) => [
			...input,
			{ type: 'function_call', call_id: callId, name: 'tool', arguments: '{}' },
			{ type: 'function_call_output', call_id: callId, output: 'done' },
		];

		await withProxy(
			async request => {
				captured.push(request);
				if (captured.length <= 2) {
					const trajectory = captured.length === 1 ? 'parent' : 'subagent';
					return {
						responseId: `resp_${trajectory}`,
						output: [{ type: 'function_call', callId: `call_${trajectory}`, name: 'tool', argumentsJson: '{}' }],
					};
				}
				return { output: [{ type: 'message', content: [{ type: 'text', text: 'done' }] }] };
			},
			async handle => {
				for (const input of [
					parentInitial,
					subagentInitial,
					replay(parentInitial, 'call_parent'),
					replay(subagentInitial, 'call_subagent'),
				]) {
					const response = await fetch(responsesUrl(handle, 'acme'), {
						method: 'POST',
						headers: authHeaders(handle),
						body: JSON.stringify({ model: 'm', input }),
					});
					assert.strictEqual(response.status, 200);
					await response.text();
				}
			},
		);

		assert.deepStrictEqual(captured.map(request => ({
			previousResponseId: request.previousResponseId,
			input: request.input,
		})), [
			{ previousResponseId: undefined, input: [{ type: 'message', role: 'user', content: [{ type: 'text', text: 'Parent' }] }] },
			{ previousResponseId: undefined, input: [{ type: 'message', role: 'user', content: [{ type: 'text', text: 'Subagent' }] }] },
			{ previousResponseId: 'resp_parent', input: [{ type: 'function_call_output', callId: 'call_parent', output: 'done' }] },
			{ previousResponseId: 'resp_subagent', input: [{ type: 'function_call_output', callId: 'call_subagent', output: 'done' }] },
		]);
	});

	test('preserves full replay when multiple pending responses match', async () => {
		const captured: IByokLmChatRequest[] = [];
		const replayedInput = [
			{ type: 'function_call', call_id: 'call_shared', name: 'tool', arguments: '{}' },
			{ type: 'function_call_output', call_id: 'call_shared', output: 'done' },
		];

		await withProxy(
			async request => {
				captured.push(request);
				return captured.length <= 2
					? { responseId: `resp_${captured.length}`, output: [{ type: 'function_call', callId: 'call_shared', name: 'tool', argumentsJson: '{}' }] }
					: { output: [{ type: 'message', content: [{ type: 'text', text: 'done' }] }] };
			},
			async handle => {
				for (const input of [[], [], replayedInput]) {
					const response = await fetch(responsesUrl(handle, 'acme'), {
						method: 'POST',
						headers: authHeaders(handle),
						body: JSON.stringify({ model: 'm', input }),
					});
					assert.strictEqual(response.status, 200);
					await response.text();
				}
			},
		);

		assert.deepStrictEqual({
			previousResponseId: captured[2]?.previousResponseId,
			input: captured[2]?.input,
		}, {
			previousResponseId: undefined,
			input: [
				{ type: 'function_call', callId: 'call_shared', name: 'tool', argumentsJson: '{}' },
				{ type: 'function_call_output', callId: 'call_shared', output: 'done' },
			],
		});
	});

	test('bounds abandoned tool continuations while preserving recent state', async () => {
		const captured: IByokLmChatRequest[] = [];
		const maximumPendingContinuations = 256;

		await withProxy(
			async request => {
				const index = captured.length;
				captured.push(request);
				if (index <= maximumPendingContinuations + 1) {
					return {
						responseId: `resp_${index}`,
						output: [{ type: 'function_call', callId: `call_${index}`, name: 'tool', argumentsJson: '{}' }],
					};
				}
				return { output: [{ type: 'message', content: [{ type: 'text', text: 'done' }] }] };
			},
			async handle => {
				const post = async (index: number, input: unknown) => {
					const response = await fetch(responsesUrl(handle, 'acme'), {
						method: 'POST',
						headers: authHeaders(handle, `sess-${index}`),
						body: JSON.stringify({ model: 'm', input }),
					});
					assert.strictEqual(response.status, 200);
					await response.text();
				};

				// Sessions can disappear after receiving a tool call. Fill the proxy,
				// add another candidate in its oldest scope, then overflow it.
				for (let index = 0; index < maximumPendingContinuations; index++) {
					await post(index, []);
				}
				await post(0, []);
				await post(maximumPendingContinuations, []);

				for (const [session, call] of [[1, 1], [0, maximumPendingContinuations]]) {
					await post(session, [
						{ type: 'function_call', call_id: `call_${call}`, name: 'tool', arguments: '{}' },
						{ type: 'function_call_output', call_id: `call_${call}`, output: 'done' },
					]);
				}
			},
		);

		assert.deepStrictEqual(captured.slice(-2).map(request => request.previousResponseId), [
			undefined,
			`resp_${maximumPendingContinuations}`,
		]);
	});

	test('decodes a url-encoded vendor path segment', async () => {
		let captured: IByokLmChatRequest | undefined;
		await withProxy(
			async (request) => { captured = request; return { output: [{ type: 'message', content: [{ type: 'text', text: 'ok' }] }] }; },
			async (handle) => {
				const response = await fetch(responsesUrl(handle, 'acme corp'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'm', input: [] }),
				});
				assert.strictEqual(response.status, 200);
				await response.text();
			},
		);
		assert.strictEqual(captured?.vendor, 'acme corp');
	});

	test('rejects a vendor that decodes to a multi-segment path (%2F)', async () => {
		await withProxy(
			async () => ({ output: [] }),
			async (handle) => {
				// `encodeURIComponent('a/b')` → `a%2Fb`, which survives the
				// pre-decode segment check but decodes back into `a/b`.
				const response = await fetch(responsesUrl(handle, 'a/b'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'm', input: [] }),
				});
				assert.strictEqual(response.status, 404);
			},
		);
	});

	test('streams assistant tool calls as OpenAI tool_call deltas', async () => {
		await withProxy(
			async () => ({ output: [{ type: 'function_call', callId: 'call_1', name: 'getWeather', argumentsJson: '{"city":"NYC"}' }] }),
			async (handle) => {
				const response = await fetch(responsesUrl(handle, 'acme'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'm', input: 'weather?', stream: true }),
				});
				const text = await response.text();
				assert.ok(text.includes('"type":"function_call"'), `expected function_call in SSE: ${text}`);
				assert.ok(text.includes('event: response.completed'), `expected completed response: ${text}`);
				assert.ok(text.includes('getWeather'));
			},
		);
	});

	test('returns a 502 when the bridge reports an error', async () => {
		await withProxy(
			async () => ({ output: [], error: 'model unavailable' }),
			async (handle) => {
				const response = await fetch(responsesUrl(handle, 'acme'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'm', input: [] }),
				});
				assert.strictEqual(response.status, 502);
				const body = await response.json() as { error?: { message?: string } };
				assert.strictEqual(body.error?.message, 'model unavailable');
			},
		);
	});

	test('returns a 502 when the bridge throws', async () => {
		await withProxy(
			async () => { throw new Error('bridge exploded'); },
			async (handle) => {
				const response = await fetch(responsesUrl(handle, 'acme'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'm', input: [] }),
				});
				assert.strictEqual(response.status, 502);
				const body = await response.json() as { error?: { message?: string } };
				assert.strictEqual(body.error?.message, 'bridge exploded');
			},
		);
	});

	test('reports an empty response to a user message as a non-retryable error instead of an empty completion', async () => {
		const userMessage = (text: string) => ({ type: 'message', role: 'user', content: [{ type: 'input_text', text }] });
		await withProxy(
			async () => ({
				output: [
					{ type: 'reasoning', id: 'rs_1', summary: [' '], encryptedContent: 'opaque' },
					{ type: 'message', content: [{ type: 'text', text: '\n\n' }] },
				],
			}),
			async (handle) => {
				const results: Array<{ status: number; message?: string }> = [];
				for (const input of [
					[userMessage('hi')],
					// A replacement turn after a cancelled turn keeps that turn's tool results.
					[
						userMessage('weather?'),
						{ type: 'function_call', call_id: 'call_1', name: 'getWeather', arguments: '{}' },
						{ type: 'function_call_output', call_id: 'call_1', output: 'cancelled' },
						userMessage('replacement'),
					],
				]) {
					const response = await fetch(responsesUrl(handle, 'acme'), {
						method: 'POST',
						headers: authHeaders(handle),
						body: JSON.stringify({ model: 'qwen', stream: true, input }),
					});
					const body = await response.json() as { error?: { message?: string } };
					results.push({ status: response.status, message: body.error?.message });
				}
				const expected = {
					status: 422,
					message: 'The model \'qwen\' returned an empty response with no text or tool calls. This can happen when the conversation exceeds the model\'s context window or output token limit. Try again, start a new session, or choose a different model.',
				};
				assert.deepStrictEqual(results, [expected, expected]);
			},
		);
	});

	test('streams an empty response that continues a turn after tool results', async () => {
		await withProxy(
			async () => ({ output: [] }),
			async (handle) => {
				const response = await fetch(responsesUrl(handle, 'acme'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({
						model: 'qwen',
						stream: true,
						input: [
							{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'weather?' }] },
							{ type: 'function_call', call_id: 'call_1', name: 'getWeather', arguments: '{}' },
							{ type: 'function_call_output', call_id: 'call_1', output: 'sunny' },
						],
					}),
				});
				const text = await response.text();
				assert.strictEqual(response.status, 200);
				assert.ok(text.includes('event: response.completed'), `expected completed response: ${text}`);
			},
		);
	});

	test('rejects a malformed JSON body with 400', async () => {
		await withProxy(
			async () => ({ output: [] }),
			async (handle) => {
				const response = await fetch(responsesUrl(handle, 'acme'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: 'not json',
				});
				assert.strictEqual(response.status, 400);
			},
		);
	});

	test('returns a 503 when no renderer bridge is connected', async () => {
		const registry = new ByokLmBridgeRegistry();
		const service = new ByokLmProxyService(new NullLogService(), registry);
		const handle = await service.start();
		try {
			const response = await fetch(responsesUrl(handle, 'acme'), {
				method: 'POST',
				headers: authHeaders(handle),
				body: JSON.stringify({ model: 'm', input: [] }),
			});
			assert.strictEqual(response.status, 503);
		} finally {
			handle.dispose();
			service.dispose();
		}
	});

	test('routes requests to a serving window and excludes a non-serving one', async () => {
		const registry = new ByokLmBridgeRegistry();
		const calls: string[] = [];
		// The serving window (editor): pushes models and answers chat.
		const regServing = registry.register('editor', servingConnection(
			async () => { calls.push('serving'); return { output: [{ type: 'message', content: [{ type: 'text', text: 'from serving' }] }] }; },
			[{ vendor: 'acme', id: 'claude' }],
		));
		// A non-serving window (connected without a BYOK handler): it never pushes
		// a snapshot, so it must never be picked for routing even though connected.
		const regNonServing = registry.register('no-handler', {
			chat: async () => { calls.push('no-handler'); return { output: [{ type: 'message', content: [{ type: 'text', text: 'from non-serving' }] }] }; },
			onDidChangeModels: Event.None,
		});
		const service = new ByokLmProxyService(new NullLogService(), registry);
		const handle = await service.start();
		try {
			const res = await fetch(responsesUrl(handle, 'acme'), {
				method: 'POST', headers: authHeaders(handle),
				body: JSON.stringify({ model: 'claude', input: [] }),
			});
			assert.deepStrictEqual({
				routedToServing: (await res.text()).includes('from serving'),
				calls,
			}, { routedToServing: true, calls: ['serving'] });
		} finally {
			handle.dispose();
			regServing.dispose();
			regNonServing.dispose();
			service.dispose();
		}
	});

	test('rebinds with a fresh nonce after every handle is disposed', async () => {
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client-1', servingConnection(async () => ({ output: [{ type: 'message', content: [{ type: 'text', text: 'ok' }] }] })));
		const service = new ByokLmProxyService(new NullLogService(), registry);
		const first = await service.start();
		const firstNonce = first.nonce;
		first.dispose();
		const second = await service.start();
		try {
			assert.notStrictEqual(second.nonce, firstNonce);
		} finally {
			second.dispose();
			registration.dispose();
			service.dispose();
		}
	});
});
