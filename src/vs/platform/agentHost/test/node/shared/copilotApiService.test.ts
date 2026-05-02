/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type Anthropic from '@anthropic-ai/sdk';
import { Iterable } from '../../../../../base/common/iterator.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { COPILOT_API_ERROR_STATUS_STREAMING, CopilotApiError, CopilotApiService, type FetchFunction } from '../../../node/shared/copilotApiService.js';
import { NullLogService } from '../../../../log/common/log.js';
import { IProductService } from '../../../../product/common/productService.js';
import product from '../../../../product/common/product.js';

// #region Test Helpers

const testProductService: IProductService = { _serviceBrand: undefined, ...product };

function sseLines(...lines: string[]): Uint8Array {
	return new TextEncoder().encode(lines.join('\n') + '\n');
}

function makeSseBody(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
	let index = 0;
	return new ReadableStream({
		pull(controller) {
			if (index < chunks.length) {
				controller.enqueue(chunks[index++]);
			} else {
				controller.close();
			}
		}
	});
}

const collect = Iterable.asyncToArray;

function getUrl(input: string | URL | Request): string {
	if (typeof input === 'string') {
		return input;
	}
	return input instanceof URL ? input.href : input.url;
}

function getText(msg: Anthropic.Message): string {
	return msg.content
		.filter((b): b is Anthropic.TextBlock => b.type === 'text')
		.map(b => b.text)
		.join('');
}

function tokenResponse(overrides?: Record<string, unknown>): Response {
	return new Response(JSON.stringify({
		token: 'copilot-tok-abc',
		expires_at: Date.now() / 1000 + 3600,
		refresh_in: 1800,
		...overrides,
	}), { status: 200 });
}

function anthropicResponse(content: Array<{ type: string; text?: string }>, stopReason = 'end_turn'): Response {
	return new Response(JSON.stringify({
		id: 'msg_test',
		type: 'message',
		role: 'assistant',
		content,
		model: 'claude-sonnet-4-5-20250514',
		stop_reason: stopReason,
		usage: { input_tokens: 10, output_tokens: 50 },
	}), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function sseResponse(chunks: Uint8Array[]): Response {
	return new Response(makeSseBody(chunks), {
		status: 200,
		headers: { 'Content-Type': 'text/event-stream' },
	});
}

function modelsResponse(models: object[]): Response {
	return new Response(JSON.stringify({ data: models }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}

function createService(fetchImpl: FetchFunction): CopilotApiService {
	return new CopilotApiService(fetchImpl, new NullLogService(), testProductService);
}

type CapturedRequest = { url: string; init: RequestInit | undefined };

function routingFetch(
	messageResponse: (captured: CapturedRequest) => Response,
	tokenOverrides?: Record<string, unknown>,
): { fetch: FetchFunction; captured: () => CapturedRequest } {
	let lastCapture: CapturedRequest = { url: '', init: undefined };
	const impl: FetchFunction = async (input, init) => {
		const url = getUrl(input);
		if (url.includes('/token') || url.includes('/copilot_internal')) {
			return tokenResponse(tokenOverrides);
		}
		lastCapture = { url, init };
		return messageResponse(lastCapture);
	};
	return { fetch: impl, captured: () => lastCapture };
}

const userMsg: Anthropic.MessageParam[] = [{ role: 'user', content: 'hello' }];
const baseRequest = {
	model: 'claude-sonnet-4-5',
	messages: userMsg,
	max_tokens: 8192,
	stream: false as const,
};

function streamService(chunks: Uint8Array[], tokenOverrides?: Record<string, unknown>): CopilotApiService {
	const { fetch: fetchFn } = routingFetch(() => sseResponse(chunks), tokenOverrides);
	return createService(fetchFn);
}

// #endregion

suite('CopilotApiService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// #region Token Minting

	suite('Token Minting', () => {

		test('mints a token on first request', async () => {
			let mintCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					return tokenResponse();
				}
				return anthropicResponse([{ type: 'text', text: 'hi' }]);
			});

			await service.messages('gh-tok', baseRequest);
			assert.strictEqual(mintCount, 1);
		});

		test('reuses cached token for consecutive calls with same github token', async () => {
			let mintCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					return tokenResponse();
				}
				return anthropicResponse([{ type: 'text', text: 'hi' }]);
			});

			await service.messages('gh-tok', baseRequest);
			await service.messages('gh-tok', baseRequest);
			await service.messages('gh-tok', baseRequest);
			assert.strictEqual(mintCount, 1);
		});

		test('re-mints when the github token changes', async () => {
			let mintCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					return tokenResponse();
				}
				return anthropicResponse([{ type: 'text', text: 'hi' }]);
			});

			await service.messages('gh-tok-A', baseRequest);
			await service.messages('gh-tok-B', baseRequest);
			assert.strictEqual(mintCount, 2);
		});

		test('re-mints when the copilot token is within 5 minutes of expiry', async () => {
			let mintCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					// Both expires_at AND refresh_in must point to a soon-expiring token,
					// because cache validity prefers refresh_in over expires_at.
					return tokenResponse({ expires_at: Date.now() / 1000 + 120, refresh_in: 0 });
				}
				return anthropicResponse([{ type: 'text', text: 'hi' }]);
			});

			await service.messages('gh-tok', baseRequest);
			await service.messages('gh-tok', baseRequest);
			assert.strictEqual(mintCount, 2);
		});

		test('uses refresh_in (not expires_at) for cache validity to tolerate clock skew', async () => {
			// Server says expires_at is in the past (simulating client clock ahead of server),
			// but refresh_in is comfortably long. Cache must still be valid.
			let mintCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					return tokenResponse({ expires_at: Date.now() / 1000 - 999, refresh_in: 1800 });
				}
				return anthropicResponse([{ type: 'text', text: 'hi' }]);
			});

			await service.messages('gh-tok', baseRequest);
			await service.messages('gh-tok', baseRequest);
			assert.strictEqual(mintCount, 1);
		});

		test('invalidates cached token on 401 from messages so the next call re-mints', async () => {
			let mintCount = 0;
			let messageCallCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					return tokenResponse();
				}
				messageCallCount++;
				if (messageCallCount === 1) {
					return new Response('unauthorized', { status: 401, statusText: 'Unauthorized' });
				}
				return anthropicResponse([{ type: 'text', text: 'ok' }]);
			});

			await assert.rejects(() => service.messages('gh-tok', baseRequest));
			await service.messages('gh-tok', baseRequest);
			assert.strictEqual(mintCount, 2);
		});

		test('invalidates cached token on 403 from models so the next call re-mints', async () => {
			let mintCount = 0;
			let modelsCallCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					return tokenResponse();
				}
				modelsCallCount++;
				if (modelsCallCount === 1) {
					return new Response('forbidden', { status: 403, statusText: 'Forbidden' });
				}
				return modelsResponse([]);
			});

			await assert.rejects(() => service.models('gh-tok'));
			await service.models('gh-tok');
			assert.strictEqual(mintCount, 2);
		});

		test('does not re-mint when copilot token has plenty of time left', async () => {
			let mintCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					return tokenResponse({ expires_at: Date.now() / 1000 + 7200 });
				}
				return anthropicResponse([{ type: 'text', text: 'hi' }]);
			});

			await service.messages('gh-tok', baseRequest);
			await service.messages('gh-tok', baseRequest);
			assert.strictEqual(mintCount, 1);
		});

		test('uses endpoints.api from the token envelope as the CAPI base', async () => {
			const { fetch: fetchFn, captured } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }]),
				{ endpoints: { api: 'https://custom.copilot.example.com' } },
			);
			const service = createService(fetchFn);

			await service.messages('gh-tok', baseRequest);
			assert.strictEqual(captured().url, 'https://custom.copilot.example.com/v1/messages');
		});

		test('falls back to default API base when endpoints.api is missing', async () => {
			const { fetch: fetchFn, captured } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }]),
			);
			const service = createService(fetchFn);

			await service.messages('gh-tok', baseRequest);
			assert.strictEqual(captured().url, 'https://api.githubcopilot.com/v1/messages');
		});

		test('sends the github token as Authorization header to the mint endpoint', async () => {
			let capturedAuthHeader: string | undefined;
			const service = createService(async (input, init) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					const headers = init?.headers as Record<string, string>;
					capturedAuthHeader = headers?.['Authorization'];
					return tokenResponse();
				}
				return anthropicResponse([{ type: 'text', text: 'ok' }]);
			});

			await service.messages('my-secret-gh-token', baseRequest);
			assert.strictEqual(capturedAuthHeader, 'token my-secret-gh-token');
		});

		test('throws on 403 from token mint', async () => {
			const service = createService(async () => new Response('{"message":"Not authorized"}', { status: 403, statusText: 'Forbidden' }));
			await assert.rejects(
				() => service.messages('bad-tok', baseRequest),
				(err: Error) => err.message.includes('Copilot token minting failed: 403'),
			);
		});

		test('throws on 500 from token mint', async () => {
			const service = createService(async () => new Response('internal error', { status: 500, statusText: 'Internal Server Error' }));
			await assert.rejects(
				() => service.messages('gh-tok', baseRequest),
				(err: Error) => err.message.includes('Copilot token minting failed: 500'),
			);
		});

		test('does not double-mint when concurrent requests race on first call', async () => {
			let mintCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					await new Promise(r => setTimeout(r, 10)); // ensure overlap
					return tokenResponse();
				}
				return anthropicResponse([{ type: 'text', text: 'ok' }]);
			});

			await Promise.all([
				service.messages('gh-tok', baseRequest),
				service.messages('gh-tok', baseRequest),
			]);
			assert.strictEqual(mintCount, 1);
		});

		test('in-flight mint dedup spans concurrent messages + models calls', async () => {
			let mintCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					await new Promise(r => setTimeout(r, 10));
					return tokenResponse();
				}
				if (url.includes('/models')) {
					return modelsResponse([]);
				}
				return anthropicResponse([{ type: 'text', text: 'ok' }]);
			});

			await Promise.all([
				service.messages('gh-tok', baseRequest),
				service.models('gh-tok'),
			]);
			assert.strictEqual(mintCount, 1);
		});

		test('error from token mint does not include the github token', async () => {
			const service = createService(async () => new Response('forbidden', { status: 403, statusText: 'Forbidden' }));
			await assert.rejects(
				() => service.messages('super-secret-gh-token-xyz', baseRequest),
				(err: Error) => !err.message.includes('super-secret-gh-token-xyz'),
			);
		});

		test('error from CAPI does not include the copilot or github token', async () => {
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse({ token: 'super-secret-copilot-token-xyz' });
				}
				return new Response('rate limited', { status: 429, statusText: 'Too Many Requests' });
			});
			await assert.rejects(
				() => service.messages('super-secret-gh-token-xyz', baseRequest),
				(err: Error) => !err.message.includes('super-secret-copilot-token-xyz') && !err.message.includes('super-secret-gh-token-xyz'),
			);
		});

		test('mints independently for concurrent requests with different github tokens', async () => {
			const minted: string[] = [];
			const service = createService(async (input, init) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					const auth = (init?.headers as Record<string, string>)?.['Authorization'] ?? '';
					minted.push(auth);
					await new Promise(r => setTimeout(r, 10)); // ensure overlap
					return tokenResponse();
				}
				return anthropicResponse([{ type: 'text', text: 'ok' }]);
			});

			await Promise.all([
				service.messages('gh-tok-A', baseRequest),
				service.messages('gh-tok-B', baseRequest),
			]);
			assert.strictEqual(minted.length, 2);
			assert.ok(minted.some(h => h.includes('gh-tok-A')));
			assert.ok(minted.some(h => h.includes('gh-tok-B')));
		});
	});

	// #endregion

	// #region Request Format

	suite('Request Format', () => {

		test('sends system as a top-level text-block array', async () => {
			const { fetch: fetchFn, captured } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }]),
			);
			const service = createService(fetchFn);

			await service.messages('gh-tok', { ...baseRequest, system: 'You are helpful.' });
			const body = JSON.parse(captured().init?.body as string);

			assert.deepStrictEqual(body.system, [{ type: 'text', text: 'You are helpful.' }]);
		});

		test('omits system field entirely when not provided', async () => {
			const { fetch: fetchFn, captured } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }]),
			);
			const service = createService(fetchFn);

			await service.messages('gh-tok', baseRequest);
			const body = JSON.parse(captured().init?.body as string);

			assert.strictEqual(body.system, undefined);
		});

		test('sends max_tokens in the body', async () => {
			const { fetch: fetchFn, captured } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }]),
			);
			const service = createService(fetchFn);

			await service.messages('gh-tok', { ...baseRequest, max_tokens: 8192 });
			const body = JSON.parse(captured().init?.body as string);

			assert.strictEqual(body.max_tokens, 8192);
		});

		test('non-streaming sends stream=false in the body', async () => {
			const { fetch: fetchFn, captured } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }]),
			);
			const service = createService(fetchFn);

			await service.messages('gh-tok', baseRequest);
			const body = JSON.parse(captured().init?.body as string);

			assert.strictEqual(body.stream, false);
		});

		test('defaults to non-streaming when stream is omitted', async () => {
			const { fetch: fetchFn, captured } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }]),
			);
			const service = createService(fetchFn);

			await service.messages('gh-tok', baseRequest);
			const body = JSON.parse(captured().init?.body as string);

			assert.strictEqual(body.stream, false);
		});

		test('streaming sends stream=true in the body', async () => {
			const { fetch: fetchFn, captured } = routingFetch(
				() => sseResponse([sseLines('data: {"type":"message_stop"}')]),
			);
			const service = createService(fetchFn);

			await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			const body = JSON.parse(captured().init?.body as string);

			assert.strictEqual(body.stream, true);
		});

		test('sends correct CAPI headers', async () => {
			const { fetch: fetchFn, captured } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }]),
			);
			const service = createService(fetchFn);

			await service.messages('gh-tok', baseRequest);
			const headers = captured().init?.headers as Record<string, string>;

			assert.strictEqual(headers['Content-Type'], 'application/json');
			assert.strictEqual(headers['Authorization'], 'Bearer copilot-tok-abc');
			assert.strictEqual(headers['OpenAI-Intent'], 'conversation');
			assert.ok(headers['X-Request-Id'], 'should have a request id');
			assert.ok(headers['X-GitHub-Api-Version'], 'CAPIClient should inject API version');
			assert.ok(headers['VScode-SessionId'], 'CAPIClient should inject session id');
		});

		test('passes messages through as-is', async () => {
			const { fetch: fetchFn, captured } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }]),
			);
			const service = createService(fetchFn);

			const messages: Anthropic.MessageParam[] = [
				{ role: 'user', content: 'What is 2+2?' },
				{ role: 'assistant', content: '4' },
				{ role: 'user', content: 'Thanks!' },
			];
			await service.messages('gh-tok', { ...baseRequest, messages });
			const body = JSON.parse(captured().init?.body as string);

			assert.deepStrictEqual(body.messages, messages);
		});

		test('sends model in the body', async () => {
			const { fetch: fetchFn, captured } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }]),
			);
			const service = createService(fetchFn);

			await service.messages('gh-tok', { ...baseRequest, model: 'claude-opus-4-1-20250805' });
			const body = JSON.parse(captured().init?.body as string);

			assert.strictEqual(body.model, 'claude-opus-4-1-20250805');
		});

		test('merges caller-provided headers into the request', async () => {
			const { fetch: fetchFn, captured } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }]),
			);
			const service = createService(fetchFn);

			await service.messages('gh-tok', baseRequest, {
				headers: { 'X-Custom-Trace': 'abc-123', 'X-Session-Id': 'sess-456' },
			});
			const headers = captured().init?.headers as Record<string, string>;

			assert.strictEqual(headers['X-Custom-Trace'], 'abc-123');
			assert.strictEqual(headers['X-Session-Id'], 'sess-456');
			assert.strictEqual(headers['Authorization'], 'Bearer copilot-tok-abc', 'standard headers should not be overridden');
		});

		test('caller-supplied headers cannot override security-sensitive standard headers', async () => {
			// Documented invariant: Authorization, Content-Type, X-Request-Id, OpenAI-Intent
			// must always reflect the values the service computes — never the caller's.
			const { fetch: fetchFn, captured } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }]),
			);
			const service = createService(fetchFn);

			await service.messages('gh-tok', baseRequest, {
				headers: {
					'Authorization': 'Bearer attacker-token',
					'Content-Type': 'text/plain',
					'X-Request-Id': 'attacker-id',
					'OpenAI-Intent': 'attacker-intent',
				},
			});
			const headers = captured().init?.headers as Record<string, string>;

			assert.strictEqual(headers['Authorization'], 'Bearer copilot-tok-abc');
			assert.strictEqual(headers['Content-Type'], 'application/json');
			assert.notStrictEqual(headers['X-Request-Id'], 'attacker-id');
			assert.strictEqual(headers['OpenAI-Intent'], 'conversation');
		});
	});

	// #endregion

	// #region Non-Streaming Responses

	suite('Non-Streaming Responses', () => {

		test('returns text content from a single text block', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'The answer is 42.' }]),
			);
			const service = createService(fetchFn);

			const result = await service.messages('gh-tok', baseRequest);
			assert.strictEqual(getText(result), 'The answer is 42.');
		});

		test('concatenates multiple text blocks', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => anthropicResponse([
					{ type: 'text', text: 'First part. ' },
					{ type: 'text', text: 'Second part.' },
				]),
			);
			const service = createService(fetchFn);

			const result = await service.messages('gh-tok', baseRequest);
			assert.strictEqual(getText(result), 'First part. Second part.');
		});

		test('skips non-text content blocks (tool_use, thinking)', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => anthropicResponse([
					{ type: 'thinking', text: 'let me think...' },
					{ type: 'text', text: 'the answer' },
					{ type: 'tool_use' },
				]),
			);
			const service = createService(fetchFn);

			const result = await service.messages('gh-tok', baseRequest);
			assert.strictEqual(getText(result), 'the answer');
		});

		test('returns empty string when no text blocks are present', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => anthropicResponse([{ type: 'tool_use' }]),
			);
			const service = createService(fetchFn);

			const result = await service.messages('gh-tok', baseRequest);
			assert.strictEqual(getText(result), '');
		});

		test('returns the stop reason', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => anthropicResponse([{ type: 'text', text: 'ok' }], 'max_tokens'),
			);
			const service = createService(fetchFn);

			const result = await service.messages('gh-tok', baseRequest);
			assert.strictEqual(result.stop_reason, 'max_tokens');
		});

		test('stop_reason is null when missing from server response', async () => {
			const { fetch: fetchFn } = routingFetch(() => {
				return new Response(JSON.stringify({
					content: [{ type: 'text', text: 'ok' }],
				}), { status: 200 });
			});
			const service = createService(fetchFn);

			const result = await service.messages('gh-tok', baseRequest);
			assert.strictEqual(result.stop_reason ?? null, null);
		});

		test('throws on 429 rate limit', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => new Response('{"error":"rate_limited"}', { status: 429, statusText: 'Too Many Requests' }),
			);
			const service = createService(fetchFn);

			await assert.rejects(
				() => service.messages('gh-tok', baseRequest),
				(err: unknown) => err instanceof CopilotApiError
					&& err.status === 429
					&& err.message.includes('CAPI request failed: 429'),
			);
		});

		test('throws on 500 server error', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => new Response('internal server error', { status: 500, statusText: 'Internal Server Error' }),
			);
			const service = createService(fetchFn);

			await assert.rejects(
				() => service.messages('gh-tok', baseRequest),
				(err: unknown) => err instanceof CopilotApiError
					&& err.status === 500
					&& err.message.includes('CAPI request failed: 500'),
			);
		});
	});

	// #endregion

	// #region Streaming Responses

	suite('Streaming Responses', () => {

		function collectTextDeltas(events: Anthropic.MessageStreamEvent[]): string[] {
			return events
				.filter((e): e is Anthropic.RawContentBlockDeltaEvent =>
					e.type === 'content_block_delta' && e.delta.type === 'text_delta')
				.map(e => (e.delta as Anthropic.TextDelta).text);
		}

		test('yields text deltas from content_block_delta events', async () => {
			const service = streamService([
				sseLines(
					'event: content_block_delta',
					'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
					'',
					'event: content_block_delta',
					'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
				),
				sseLines(
					'event: message_stop',
					'data: {"type":"message_stop"}',
				),
			]);

			const events = await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			assert.deepStrictEqual(collectTextDeltas(events), ['Hello', ' world']);
		});

		test('handles data split across multiple network chunks', async () => {
			const encoder = new TextEncoder();
			const service = streamService([
				encoder.encode('event: content_block_delta\ndata: {"type":"content_bl'),
				encoder.encode('ock_delta","index":0,"delta":{"type":"text_delta","text":"split"}}\n'),
				sseLines(
					'event: message_stop',
					'data: {"type":"message_stop"}',
				),
			]);

			const events = await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			assert.deepStrictEqual(collectTextDeltas(events), ['split']);
		});

		test('handles a data line split right at the newline boundary', async () => {
			const encoder = new TextEncoder();
			const service = streamService([
				encoder.encode('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"chunk1"}}'),
				encoder.encode('\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"chunk2"}}\n'),
				sseLines('data: {"type":"message_stop"}'),
			]);

			const events = await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			assert.deepStrictEqual(collectTextDeltas(events), ['chunk1', 'chunk2']);
		});

		test('skips event: lines, comment lines, and blank lines', async () => {
			const service = streamService([
				sseLines(
					': keep-alive comment',
					'event: content_block_delta',
					'',
					'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
					'',
					'event: message_stop',
					'data: {"type":"message_stop"}',
				),
			]);

			const events = await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			assert.deepStrictEqual(collectTextDeltas(events), ['ok']);
		});

		test('handles many small deltas', async () => {
			const deltas = Array.from({ length: 100 }, (_, i) =>
				`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"w${i}"}}`
			);
			const service = streamService([
				sseLines(...deltas),
				sseLines('data: {"type":"message_stop"}'),
			]);

			const texts = collectTextDeltas(await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const })));
			assert.strictEqual(texts.length, 100);
			assert.strictEqual(texts[0], 'w0');
			assert.strictEqual(texts[99], 'w99');
		});

		test('throws on error event with message', async () => {
			const service = streamService([
				sseLines(
					'event: error',
					'data: {"type":"error","error":{"message":"overloaded"}}',
				),
			]);

			await assert.rejects(
				() => collect(service.messages('gh-tok', { ...baseRequest, stream: true as const })),
				(err: unknown) => err instanceof CopilotApiError
					&& err.status === COPILOT_API_ERROR_STATUS_STREAMING
					&& err.message === 'overloaded',
			);
		});

		test('throws on error event without message', async () => {
			const service = streamService([
				sseLines(
					'event: error',
					'data: {"type":"error","error":{}}',
				),
			]);

			await assert.rejects(
				() => collect(service.messages('gh-tok', { ...baseRequest, stream: true as const })),
				(err: unknown) => err instanceof CopilotApiError
					&& err.status === COPILOT_API_ERROR_STATUS_STREAMING
					&& err.message === 'Unknown streaming error',
			);
		});

		test('throws on non-200 CAPI response', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => new Response('overloaded', { status: 529, statusText: 'Overloaded' }),
			);
			const service = createService(fetchFn);

			await assert.rejects(
				() => collect(service.messages('gh-tok', { ...baseRequest, stream: true as const })),
				(err: unknown) => err instanceof CopilotApiError
					&& err.status === 529
					&& err.message.includes('CAPI request failed: 529'),
			);
		});

		test('throws when response has no body', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => new Response(null, { status: 200 }),
			);
			const service = createService(fetchFn);

			await assert.rejects(
				() => collect(service.messages('gh-tok', { ...baseRequest, stream: true as const })),
				(err: Error) => err.message.includes('no body'),
			);
		});

		test('survives malformed JSON in the stream (skips the line)', async () => {
			const service = streamService([
				sseLines(
					'data: not-valid-json',
					'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
					'data: {"type":"message_stop"}',
				),
			]);

			const events = await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			assert.deepStrictEqual(collectTextDeltas(events), ['ok']);
		});
	});

	// #endregion

	// #region Raw Event Stream (messages())

	suite('Raw Event Stream (messages())', () => {

		test('yields all six protocol event types in order', async () => {
			const service = streamService([
				sseLines(
					'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5","stop_reason":null,"usage":{"input_tokens":1,"output_tokens":1}}}',
					'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
					'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}',
					'data: {"type":"content_block_stop","index":0}',
					'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}',
					'data: {"type":"message_stop"}',
				),
			]);

			const events = await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			assert.deepStrictEqual(events.map(e => e.type), [
				'message_start',
				'content_block_start',
				'content_block_delta',
				'content_block_stop',
				'message_delta',
				'message_stop',
			]);
		});

		test('message_stop is the last yielded event', async () => {
			const service = streamService([
				sseLines(
					'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"a"}}',
					'data: {"type":"message_stop"}',
				),
			]);

			const events = await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			assert.strictEqual(events.length, 2);
			assert.strictEqual(events[events.length - 1].type, 'message_stop');
		});

		test('stops after message_stop even if extra SSE data follows', async () => {
			const service = streamService([
				sseLines(
					'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"a"}}',
					'data: {"type":"message_stop"}',
					'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"SHOULD_NOT_APPEAR"}}',
				),
			]);

			const events = await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			const texts = events
				.filter((e): e is Anthropic.RawContentBlockDeltaEvent => e.type === 'content_block_delta')
				.map(e => e.delta.type === 'text_delta' ? e.delta.text : '');
			assert.deepStrictEqual(texts, ['a']);
		});

		test('yields thinking_delta events (not filtered by messages())', async () => {
			const service = streamService([
				sseLines(
					'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}',
					'data: {"type":"message_stop"}',
				),
			]);

			const events = await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			const delta = events.find((e): e is Anthropic.RawContentBlockDeltaEvent => e.type === 'content_block_delta');
			assert.ok(delta);
			assert.strictEqual(delta.delta.type, 'thinking_delta');
		});

		test('yields input_json_delta events', async () => {
			const service = streamService([
				sseLines(
					'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"k\\":1}"}}',
					'data: {"type":"message_stop"}',
				),
			]);

			const events = await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			const delta = events.find((e): e is Anthropic.RawContentBlockDeltaEvent => e.type === 'content_block_delta');
			assert.ok(delta);
			assert.strictEqual(delta.delta.type, 'input_json_delta');
		});

		test('yields message_delta with stop_reason payload', async () => {
			const service = streamService([
				sseLines(
					'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens","stop_sequence":null},"usage":{"output_tokens":7}}',
					'data: {"type":"message_stop"}',
				),
			]);

			const events = await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			const msgDelta = events.find((e): e is Anthropic.RawMessageDeltaEvent => e.type === 'message_delta');
			assert.ok(msgDelta);
			assert.strictEqual(msgDelta.delta.stop_reason, 'max_tokens');
		});

		test('tool_use block events round-trip through messages()', async () => {
			const service = streamService([
				sseLines(
					'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu_1","name":"read_file","input":{}}}',
					'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}',
					'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"/tmp/x\\"}"}}',
					'data: {"type":"content_block_stop","index":0}',
					'data: {"type":"message_stop"}',
				),
			]);

			const events = await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));
			const blockStart = events.find((e): e is Anthropic.RawContentBlockStartEvent => e.type === 'content_block_start');
			assert.ok(blockStart, 'expected content_block_start event');
			assert.strictEqual(blockStart.content_block.type, 'tool_use');
			assert.strictEqual((blockStart.content_block as Anthropic.ToolUseBlock).name, 'read_file');

			const jsonDeltas = events.filter(
				(e): e is Anthropic.RawContentBlockDeltaEvent =>
					e.type === 'content_block_delta' && e.delta.type === 'input_json_delta',
			);
			assert.strictEqual(jsonDeltas.length, 2);
			assert.strictEqual(events[events.length - 1].type, 'message_stop');
		});
	});

	// #endregion

	// #region countTokens

	suite('countTokens', () => {

		test('throws "countTokens not supported by CAPI"', async () => {
			const service = createService(async () => new Response('{}', { status: 200 }));
			await assert.rejects(
				() => service.countTokens('gh-tok', { model: 'claude-sonnet-4-5', messages: [{ role: 'user', content: 'hi' }] }),
				(err: Error) => err.message.includes('countTokens not supported by CAPI'),
			);
		});

		test('does not mint a token before throwing', async () => {
			let mintCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					return tokenResponse();
				}
				return new Response('{}', { status: 200 });
			});

			await assert.rejects(
				() => service.countTokens('gh-tok', { model: 'claude-sonnet-4-5', messages: [{ role: 'user', content: 'hi' }] }),
			);
			assert.strictEqual(mintCount, 0);
		});
	});

	// #endregion

	// #region Streaming + Non-Streaming Shared Behavior

	suite('Shared Behavior', () => {

		test('streaming and non-streaming hit the same /v1/messages endpoint', async () => {
			const urls: string[] = [];
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse();
				}
				urls.push(url);
				if (urls.length === 1) {
					return anthropicResponse([{ type: 'text', text: 'ok' }]);
				}
				return sseResponse([sseLines('data: {"type":"message_stop"}')]);
			});

			await service.messages('gh-tok', baseRequest);
			await collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }));

			assert.strictEqual(urls.length, 2);
			assert.ok(urls[0].endsWith('/v1/messages'));
			assert.ok(urls[1].endsWith('/v1/messages'));
		});

		test('both modes share the same cached copilot token', async () => {
			let mintCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					return tokenResponse();
				}
				return anthropicResponse([{ type: 'text', text: 'ok' }]);
			});

			await service.messages('gh-tok', baseRequest);
			await service.messages('gh-tok', baseRequest);
			assert.strictEqual(mintCount, 1);
		});
	});

	// #endregion

	// #region CopilotApiError contract

	suite('CopilotApiError contract', () => {

		async function captureCopilotApiError(promise: Promise<unknown>): Promise<CopilotApiError> {
			try {
				await promise;
			} catch (err) {
				assert.ok(err instanceof CopilotApiError, `expected CopilotApiError, got: ${err instanceof Error ? err.message : String(err)}`);
				return err;
			}
			assert.fail('expected to throw CopilotApiError');
		}

		test('non-2xx with conforming Anthropic envelope: passthrough verbatim', async () => {
			const upstreamEnvelope: Anthropic.ErrorResponse = {
				type: 'error',
				error: { type: 'rate_limit_error', message: 'You are sending requests too fast.' },
				request_id: 'req_abc',
			};
			const { fetch: fetchFn } = routingFetch(
				() => new Response(JSON.stringify(upstreamEnvelope), { status: 429, statusText: 'Too Many Requests' }),
			);
			const service = createService(fetchFn);

			const err = await captureCopilotApiError(service.messages('gh-tok', baseRequest));
			assert.deepStrictEqual(
				{ status: err.status, envelope: err.envelope },
				{ status: 429, envelope: upstreamEnvelope },
			);
		});

		test('non-2xx with non-Anthropic JSON body: synthesizes api_error envelope', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => new Response('{"error":"rate_limited"}', { status: 429, statusText: 'Too Many Requests' }),
			);
			const service = createService(fetchFn);

			const err = await captureCopilotApiError(service.messages('gh-tok', baseRequest));
			assert.deepStrictEqual(
				{ status: err.status, envelope: err.envelope },
				{
					status: 429,
					envelope: {
						type: 'error',
						error: { type: 'api_error', message: '{"error":"rate_limited"}' },
						request_id: null,
					},
				},
			);
		});

		test('non-2xx with plain-text body: synthesizes api_error envelope using body', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => new Response('internal server error', { status: 500, statusText: 'Internal Server Error' }),
			);
			const service = createService(fetchFn);

			const err = await captureCopilotApiError(service.messages('gh-tok', baseRequest));
			assert.deepStrictEqual(
				{ status: err.status, envelope: err.envelope },
				{
					status: 500,
					envelope: {
						type: 'error',
						error: { type: 'api_error', message: 'internal server error' },
						request_id: null,
					},
				},
			);
		});

		test('non-2xx with empty body: synthesizes api_error envelope using status text', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => new Response('', { status: 502, statusText: 'Bad Gateway' }),
			);
			const service = createService(fetchFn);

			const err = await captureCopilotApiError(service.messages('gh-tok', baseRequest));
			assert.deepStrictEqual(
				{ status: err.status, envelope: err.envelope },
				{
					status: 502,
					envelope: {
						type: 'error',
						error: { type: 'api_error', message: '502 Bad Gateway' },
						request_id: null,
					},
				},
			);
		});

		test('SSE error frame with full envelope: passthrough type and message', async () => {
			const service = streamService([
				sseLines(
					'event: error',
					'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"},"request_id":"req_42"}',
				),
			]);

			const err = await captureCopilotApiError(
				collect(service.messages('gh-tok', { ...baseRequest, stream: true as const })),
			);
			assert.deepStrictEqual(
				{ status: err.status, envelope: err.envelope },
				{
					status: COPILOT_API_ERROR_STATUS_STREAMING,
					envelope: {
						type: 'error',
						error: { type: 'overloaded_error', message: 'Overloaded' },
						request_id: 'req_42',
					},
				},
			);
		});

		test('SSE error frame missing type: defaults to api_error', async () => {
			const service = streamService([
				sseLines(
					'event: error',
					'data: {"type":"error","error":{"message":"oh no"}}',
				),
			]);

			const err = await captureCopilotApiError(
				collect(service.messages('gh-tok', { ...baseRequest, stream: true as const })),
			);
			assert.deepStrictEqual(err.envelope, {
				type: 'error',
				error: { type: 'api_error', message: 'oh no' },
				request_id: null,
			});
		});

		test('SSE error frame missing message: defaults to "Unknown streaming error"', async () => {
			const service = streamService([
				sseLines(
					'event: error',
					'data: {"type":"error","error":{"type":"api_error"}}',
				),
			]);

			const err = await captureCopilotApiError(
				collect(service.messages('gh-tok', { ...baseRequest, stream: true as const })),
			);
			assert.deepStrictEqual(err.envelope, {
				type: 'error',
				error: { type: 'api_error', message: 'Unknown streaming error' },
				request_id: null,
			});
		});

		test('SSE error frame with conforming envelope is preserved verbatim (extra fields propagate)', async () => {
			// The Phase 2 proxy must be able to re-emit the original error frame
			// with full fidelity — any extra fields the upstream emits should
			// survive the round-trip through CopilotApiError.envelope.
			const service = streamService([
				sseLines(
					'event: error',
					'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded","request_id":"req_xyz"}}',
				),
			]);

			const err = await captureCopilotApiError(
				collect(service.messages('gh-tok', { ...baseRequest, stream: true as const })),
			);
			assert.deepStrictEqual(err.envelope, {
				type: 'error',
				error: { type: 'overloaded_error', message: 'Overloaded', request_id: 'req_xyz' },
			});
		});

		test('SSE error frame with unstructured-string error: uses the string as message', async () => {
			const service = streamService([
				sseLines(
					'event: error',
					'data: {"type":"error","error":"rate_limited"}',
				),
			]);

			const err = await captureCopilotApiError(
				collect(service.messages('gh-tok', { ...baseRequest, stream: true as const })),
			);
			assert.deepStrictEqual(err.envelope, {
				type: 'error',
				error: { type: 'api_error', message: 'rate_limited' },
				request_id: null,
			});
		});

		test('models() non-2xx throws typed error with synthesized envelope', async () => {
			const { fetch: fetchFn } = routingFetch(
				() => new Response('upstream down', { status: 503, statusText: 'Service Unavailable' }),
			);
			const service = createService(fetchFn);

			const err = await captureCopilotApiError(service.models('gh-tok'));
			assert.deepStrictEqual(
				{ status: err.status, envelope: err.envelope },
				{
					status: 503,
					envelope: {
						type: 'error',
						error: { type: 'api_error', message: 'upstream down' },
						request_id: null,
					},
				},
			);
			assert.ok(err.message.includes('CAPI models request failed: 503'));
		});

		test('models() non-2xx with conforming Anthropic envelope: passthrough verbatim', async () => {
			const upstreamEnvelope: Anthropic.ErrorResponse = {
				type: 'error',
				error: { type: 'authentication_error', message: 'Invalid token.' },
				request_id: 'req_def',
			};
			const { fetch: fetchFn } = routingFetch(
				() => new Response(JSON.stringify(upstreamEnvelope), { status: 401, statusText: 'Unauthorized' }),
			);
			const service = createService(fetchFn);

			const err = await captureCopilotApiError(service.models('gh-tok'));
			assert.deepStrictEqual(
				{ status: err.status, envelope: err.envelope },
				{ status: 401, envelope: upstreamEnvelope },
			);
		});

		test('error message never embeds auth tokens', async () => {
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse({ token: 'super-secret-copilot-token-xyz' });
				}
				return new Response('rate limited', { status: 429, statusText: 'Too Many Requests' });
			});

			const err = await captureCopilotApiError(service.messages('super-secret-gh-token-xyz', baseRequest));
			const serialized = JSON.stringify({ message: err.message, envelope: err.envelope });
			assert.ok(!serialized.includes('super-secret-copilot-token-xyz'));
			assert.ok(!serialized.includes('super-secret-gh-token-xyz'));
		});

		test('401 still invalidates the cached token (regression)', async () => {
			let mintCount = 0;
			let next401 = true;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					return tokenResponse();
				}
				if (next401) {
					next401 = false;
					return new Response('unauthorized', { status: 401, statusText: 'Unauthorized' });
				}
				return anthropicResponse([{ type: 'text', text: 'ok' }]);
			});

			await captureCopilotApiError(service.messages('gh-tok', baseRequest));
			await service.messages('gh-tok', baseRequest);
			assert.strictEqual(mintCount, 2);
		});
	});

	// #endregion

	// #region Cancellation

	suite('Cancellation', () => {

		test('forwards AbortSignal to fetch for messages', async () => {
			const controller = new AbortController();
			let capturedSignal: AbortSignal | undefined;
			const service = createService(async (input, init) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse();
				}
				capturedSignal = init?.signal as AbortSignal;
				return anthropicResponse([{ type: 'text', text: 'ok' }]);
			});

			await service.messages('gh-tok', baseRequest, { signal: controller.signal });
			assert.strictEqual(capturedSignal, controller.signal);
		});

		test('forwards AbortSignal to fetch for models', async () => {
			const controller = new AbortController();
			let capturedSignal: AbortSignal | undefined;
			const service = createService(async (input, init) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse();
				}
				capturedSignal = init?.signal as AbortSignal;
				return modelsResponse([]);
			});

			await service.models('gh-tok', { signal: controller.signal });
			assert.strictEqual(capturedSignal, controller.signal);
		});

		test('does not forward AbortSignal to the shared token mint fetch', async () => {
			const controller = new AbortController();
			let mintSignal: AbortSignal | undefined;
			const service = createService(async (input, init) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintSignal = init?.signal as AbortSignal;
					return tokenResponse();
				}
				return anthropicResponse([{ type: 'text', text: 'ok' }]);
			});

			await service.messages('gh-tok', baseRequest, { signal: controller.signal });
			assert.strictEqual(mintSignal, undefined);
		});

		test('cancels the underlying SSE stream when the consumer breaks early', async () => {
			let cancelled = false;
			const body = new ReadableStream<Uint8Array>({
				pull(controller) {
					controller.enqueue(sseLines(
						'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
					));
				},
				cancel() {
					cancelled = true;
				},
			});
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse();
				}
				return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
			});

			const iter = service.messages('gh-tok', { ...baseRequest, stream: true });
			for await (const _ of iter) {
				break; // abandon after first chunk
			}
			assert.strictEqual(cancelled, true);
		});

		test('cancels the underlying SSE stream after message_stop terminates the generator', async () => {
			let cancelled = false;
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(sseLines(
						'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
						'data: {"type":"message_stop"}',
					));
					// Server is still alive — connection must be released by the client
					// even though the producer hasn't closed yet.
				},
				cancel() {
					cancelled = true;
				},
			});
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse();
				}
				return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
			});

			await collect(service.messages('gh-tok', { ...baseRequest, stream: true }));
			assert.strictEqual(cancelled, true);
		});

		test('cancels the underlying SSE stream when the generator throws', async () => {
			let cancelled = false;
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(sseLines(
						'data: {"type":"error","error":{"message":"boom"}}',
					));
				},
				cancel() {
					cancelled = true;
				},
			});
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse();
				}
				return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
			});

			await assert.rejects(() => collect(service.messages('gh-tok', { ...baseRequest, stream: true })));
			assert.strictEqual(cancelled, true);
		});
	});

	// #endregion

	// #region Models

	suite('Models', () => {

		test('returns models from the data array', async () => {
			const fakeModels = [
				{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', vendor: 'anthropic', supported_endpoints: ['chat/messages'] },
				{ id: 'claude-opus-4', name: 'Claude Opus 4', vendor: 'anthropic', supported_endpoints: ['chat/messages'] },
			];
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse();
				}
				return modelsResponse(fakeModels);
			});

			const result = await service.models('gh-tok');
			assert.deepStrictEqual(result, fakeModels);
		});

		test('returns empty array when data is missing', async () => {
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse();
				}
				return new Response(JSON.stringify({}), { status: 200 });
			});

			const result = await service.models('gh-tok');
			assert.deepStrictEqual(result, []);
		});

		test('sends Bearer token in Authorization header', async () => {
			let capturedAuthHeader: string | undefined;
			const service = createService(async (input, init) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse();
				}
				capturedAuthHeader = (init?.headers as Record<string, string>)?.['Authorization'];
				return modelsResponse([]);
			});

			await service.models('gh-tok');
			assert.strictEqual(capturedAuthHeader, 'Bearer copilot-tok-abc');
		});

		test('throws on non-200 response', async () => {
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse();
				}
				return new Response('forbidden', { status: 403, statusText: 'Forbidden' });
			});

			await assert.rejects(
				() => service.models('gh-tok'),
				(err: unknown) => err instanceof CopilotApiError
					&& err.status === 403
					&& err.message.includes('CAPI models request failed: 403'),
			);
		});

		test('reuses cached token across messages and models calls', async () => {
			let mintCount = 0;
			const service = createService(async (input) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					mintCount++;
					return tokenResponse();
				}
				if (url.includes('/models')) {
					return modelsResponse([]);
				}
				return anthropicResponse([{ type: 'text', text: 'ok' }]);
			});

			await service.messages('gh-tok', baseRequest);
			await service.models('gh-tok');
			assert.strictEqual(mintCount, 1);
		});

		test('routes to the models endpoint URL', async () => {
			const { fetch: fetchFn, captured } = routingFetch(() => modelsResponse([]));
			const service = createService(fetchFn);

			await service.models('gh-tok');
			assert.ok(captured().url.includes('/models'), `expected models URL, got: ${captured().url}`);
		});

		test('caller-supplied headers cannot override Authorization in models()', async () => {
			let capturedHeaders: Record<string, string> | undefined;
			const service = createService(async (input, init) => {
				const url = getUrl(input);
				if (url.includes('/copilot_internal')) {
					return tokenResponse();
				}
				capturedHeaders = init?.headers as Record<string, string>;
				return modelsResponse([]);
			});

			await service.models('gh-tok', {
				headers: { 'Authorization': 'Bearer attacker-token' },
			});
			assert.strictEqual(capturedHeaders?.['Authorization'], 'Bearer copilot-tok-abc');
		});
	});

	// #endregion
});
