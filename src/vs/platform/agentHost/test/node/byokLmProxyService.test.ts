/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IByokLmBridgeConnection, IByokLmChatRequest, IByokLmChatResult, IByokLmModelInfo } from '../../common/agentHostByokLm.js';
import { ByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService, type IByokLmProxyHandle } from '../../node/copilot/byokLmProxyService.js';

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
		chat: (request: IByokLmChatRequest) => Promise<IByokLmChatResult>,
		run: (handle: IByokLmProxyHandle) => Promise<void>,
	): Promise<void> {
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client-1', servingConnection(chat));
		const service = new ByokLmProxyService(new NullLogService(), registry);
		const handle = await service.start();
		try {
			await run(handle);
		} finally {
			handle.dispose();
			registration.dispose();
			service.dispose();
		}
	}

	function responsesUrl(handle: IByokLmProxyHandle, vendor: string): string {
		return `${handle.providerBaseUrl(vendor)}/responses`;
	}

	function authHeaders(handle: IByokLmProxyHandle, selectedSessionId = sessionId): Record<string, string> {
		return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${handle.nonce}.${selectedSessionId}` };
	}

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
				return { output: [] };
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
				// refresh its oldest entry, then overflow it with one abandoned session.
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
