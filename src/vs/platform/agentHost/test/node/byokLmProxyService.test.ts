/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IByokLmChatRequest, IByokLmChatResult } from '../../common/agentHostByokLm.js';
import { ByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService, type IByokLmProxyHandle } from '../../node/copilot/byokLmProxyService.js';

/**
 * Exercises the inference path end-to-end without the Copilot SDK runtime:
 * the test plays the runtime's role by POSTing OpenAI Chat Completions
 * requests at the loopback proxy, and plays the renderer's role with a fake
 * {@link IByokLmChatRequest} -> {@link IByokLmChatResult} bridge function. The
 * only contract under test is the OpenAI wire format in, the bridge DTO out,
 * and the SSE wire format back.
 */
suite('ByokLmProxyService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionId = 'sess-1';

	async function withProxy(
		chat: (request: IByokLmChatRequest) => Promise<IByokLmChatResult>,
		run: (handle: IByokLmProxyHandle) => Promise<void>,
	): Promise<void> {
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client-1', { chat, listModels: async () => [] });
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

	function chatUrl(handle: IByokLmProxyHandle, vendor: string): string {
		return `${handle.providerBaseUrl(vendor)}/chat/completions`;
	}

	function authHeaders(handle: IByokLmProxyHandle): Record<string, string> {
		return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${handle.nonce}.${sessionId}` };
	}

	test('serves the unauthenticated health check', async () => {
		await withProxy(
			async () => ({ content: 'unused' }),
			async (handle) => {
				const response = await fetch(`${handle.baseUrl}/`);
				assert.strictEqual(response.status, 200);
				assert.strictEqual(await response.text(), 'ok');
			},
		);
	});

	test('rejects requests without a valid bearer token', async () => {
		await withProxy(
			async () => ({ content: 'unused' }),
			async (handle) => {
				const response = await fetch(chatUrl(handle, 'acme'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: 'm', messages: [] }),
				});
				assert.strictEqual(response.status, 401);
			},
		);
	});

	test('rejects a nonce-only bearer token (no session id)', async () => {
		await withProxy(
			async () => ({ content: 'unused' }),
			async (handle) => {
				const response = await fetch(chatUrl(handle, 'acme'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${handle.nonce}` },
					body: JSON.stringify({ model: 'm', messages: [] }),
				});
				assert.strictEqual(response.status, 401);
			},
		);
	});

	test('returns 404 for an authenticated but unknown route', async () => {
		await withProxy(
			async () => ({ content: 'unused' }),
			async (handle) => {
				const response = await fetch(`${handle.baseUrl}/v/acme/responses`, {
					method: 'POST',
					headers: authHeaders(handle),
					body: '{}',
				});
				assert.strictEqual(response.status, 404);
			},
		);
	});

	test('forwards a chat request to the bridge and streams an SSE completion', async () => {
		let captured: IByokLmChatRequest | undefined;
		await withProxy(
			async (request) => {
				captured = request;
				return { content: 'hello from byok' };
			},
			async (handle) => {
				const response = await fetch(chatUrl(handle, 'acme'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'claude', messages: [{ role: 'user', content: 'hi' }] }),
				});
				assert.strictEqual(response.status, 200);
				assert.strictEqual(response.headers.get('content-type'), 'text/event-stream');
				const text = await response.text();
				assert.ok(text.includes('hello from byok'), `expected content in SSE: ${text}`);
				assert.ok(text.trimEnd().endsWith('data: [DONE]'));
			},
		);
		assert.strictEqual(captured?.vendor, 'acme');
		assert.strictEqual(captured?.modelId, 'claude');
		assert.deepStrictEqual(captured?.messages, [{ role: 'user', content: 'hi', toolCalls: undefined, toolCallId: undefined }]);
	});

	test('decodes a url-encoded vendor path segment', async () => {
		let captured: IByokLmChatRequest | undefined;
		await withProxy(
			async (request) => { captured = request; return { content: 'ok' }; },
			async (handle) => {
				const response = await fetch(chatUrl(handle, 'acme corp'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'm', messages: [] }),
				});
				assert.strictEqual(response.status, 200);
				await response.text();
			},
		);
		assert.strictEqual(captured?.vendor, 'acme corp');
	});

	test('rejects a vendor that decodes to a multi-segment path (%2F)', async () => {
		await withProxy(
			async () => ({ content: 'unused' }),
			async (handle) => {
				// `encodeURIComponent('a/b')` → `a%2Fb`, which survives the
				// pre-decode segment check but decodes back into `a/b`.
				const response = await fetch(chatUrl(handle, 'a/b'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'm', messages: [] }),
				});
				assert.strictEqual(response.status, 404);
			},
		);
	});

	test('streams assistant tool calls as OpenAI tool_call deltas', async () => {
		await withProxy(
			async () => ({ content: '', toolCalls: [{ id: 'call_1', name: 'getWeather', argumentsJson: '{"city":"NYC"}' }] }),
			async (handle) => {
				const response = await fetch(chatUrl(handle, 'acme'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'weather?' }] }),
				});
				const text = await response.text();
				assert.ok(text.includes('"tool_calls"'), `expected tool_calls in SSE: ${text}`);
				assert.ok(text.includes('"finish_reason":"tool_calls"'), `expected tool_calls finish reason: ${text}`);
				assert.ok(text.includes('getWeather'));
			},
		);
	});

	test('returns a 502 when the bridge reports an error', async () => {
		await withProxy(
			async () => ({ content: '', error: 'model unavailable' }),
			async (handle) => {
				const response = await fetch(chatUrl(handle, 'acme'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'm', messages: [] }),
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
				const response = await fetch(chatUrl(handle, 'acme'), {
					method: 'POST',
					headers: authHeaders(handle),
					body: JSON.stringify({ model: 'm', messages: [] }),
				});
				assert.strictEqual(response.status, 502);
				const body = await response.json() as { error?: { message?: string } };
				assert.strictEqual(body.error?.message, 'bridge exploded');
			},
		);
	});

	test('rejects a malformed JSON body with 400', async () => {
		await withProxy(
			async () => ({ content: 'unused' }),
			async (handle) => {
				const response = await fetch(chatUrl(handle, 'acme'), {
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
			const response = await fetch(chatUrl(handle, 'acme'), {
				method: 'POST',
				headers: authHeaders(handle),
				body: JSON.stringify({ model: 'm', messages: [] }),
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
		// The serving window (editor): enumerates models and answers chat.
		const regServing = registry.register('editor', {
			chat: async () => { calls.push('serving'); return { content: 'from serving' }; },
			listModels: async () => [{ vendor: 'acme', id: 'claude' }],
		});
		// A non-serving window (connected without a BYOK handler): its bridge
		// rejects, so it must never be picked for routing even though it is connected.
		const regNonServing = registry.register('no-handler', {
			chat: async () => { calls.push('no-handler'); return { content: 'from non-serving' }; },
			listModels: async () => { throw new Error('no BYOK handler'); },
		});
		const service = new ByokLmProxyService(new NullLogService(), registry);
		// Warm the cache so the serving window is known before routing.
		await registry.listModels();
		const handle = await service.start();
		try {
			const res = await fetch(chatUrl(handle, 'acme'), {
				method: 'POST', headers: authHeaders(handle),
				body: JSON.stringify({ model: 'claude', messages: [] }),
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
		const registration = registry.register('client-1', { chat: async () => ({ content: 'ok' }), listModels: async () => [] });
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
