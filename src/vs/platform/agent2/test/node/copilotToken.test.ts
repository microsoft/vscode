/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CopilotApiService } from '../../node/copilotToken.js';

/**
 * Mock fetcher that returns Response-like objects.
 * Routes based on URL -- token requests return a token envelope,
 * model/other requests return whatever the caller specifies.
 */
function createMockFetcherService(modelHandler?: (url: string, options: Record<string, unknown>) => unknown) {
	const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
	let tokenFetchCount = 0;

	return {
		fetcher: {
			fetch(url: string, options: Record<string, unknown>) {
				// Token exchange request
				if (typeof url === 'string' && url.includes('copilot_internal')) {
					tokenFetchCount++;
					const body = {
						token: `copilot-jwt-${tokenFetchCount}`,
						expires_at: futureExpiry,
						refresh_in: 1800,
						endpoints: { api: 'https://api.githubcopilot.com' },
						sku: 'copilot_for_business',
					};
					return Promise.resolve({
						ok: true, status: 200, statusText: 'OK',
						json: async () => body, text: async () => JSON.stringify(body),
					});
				}

				// Other requests
				if (modelHandler) {
					return Promise.resolve(modelHandler(url, options));
				}

				return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => ({}), text: async () => '' });
			},
			fetchWithPagination() { return Promise.resolve([]); },
		},
		getTokenFetchCount: () => tokenFetchCount,
	};
}

suite('CopilotApiService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const log = new NullLogService();

	test('sendModelRequest includes Authorization header automatically', async () => {
		let capturedHeaders: Record<string, string> | undefined;
		const { fetcher } = createMockFetcherService((url, options) => {
			capturedHeaders = (options as { headers?: Record<string, string> }).headers;
			return { ok: true, status: 200, statusText: 'OK', body: null, text: async () => '' };
		});

		const service = new CopilotApiService(log, undefined, fetcher);
		service.setGitHubToken('gh-token-abc');

		await service.sendModelRequest(
			{ model: 'test', messages: [] },
			{ type: 'ChatMessages' },
			{ 'anthropic-beta': 'test-beta' },
			CancellationToken.None,
		);

		assert.ok(capturedHeaders);
		assert.ok(capturedHeaders!['Authorization'].startsWith('Bearer copilot-jwt-'));
		assert.strictEqual(capturedHeaders!['Content-Type'], 'application/json');
		assert.strictEqual(capturedHeaders!['anthropic-beta'], 'test-beta');
	});

	test('caches token across multiple requests', async () => {
		const { fetcher, getTokenFetchCount } = createMockFetcherService(() => {
			return { ok: true, status: 200, statusText: 'OK', body: null, text: async () => '' };
		});

		const service = new CopilotApiService(log, undefined, fetcher);
		service.setGitHubToken('gh-token');

		await service.sendModelRequest({}, { type: 'ChatMessages' }, undefined, CancellationToken.None);
		await service.sendModelRequest({}, { type: 'ChatMessages' }, undefined, CancellationToken.None);

		assert.strictEqual(getTokenFetchCount(), 1, 'Should only exchange token once');
	});

	test('clears cached token when GitHub token changes', async () => {
		const { fetcher, getTokenFetchCount } = createMockFetcherService(() => {
			return { ok: true, status: 200, statusText: 'OK', body: null, text: async () => '' };
		});

		const service = new CopilotApiService(log, undefined, fetcher);

		service.setGitHubToken('gh-token-1');
		await service.sendModelRequest({}, { type: 'ChatMessages' }, undefined, CancellationToken.None);

		service.setGitHubToken('gh-token-2');
		await service.sendModelRequest({}, { type: 'ChatMessages' }, undefined, CancellationToken.None);

		assert.strictEqual(getTokenFetchCount(), 2, 'Should exchange token twice');
	});

	test('throws when no GitHub token is set', async () => {
		const { fetcher } = createMockFetcherService();
		const service = new CopilotApiService(log, undefined, fetcher);

		await assert.rejects(
			() => service.sendModelRequest({}, { type: 'ChatMessages' }, undefined, CancellationToken.None),
			/No GitHub token/,
		);
	});

	test('makeRequest routes through CAPIClient', async () => {
		let requestedUrl: string | undefined;
		const { fetcher } = createMockFetcherService((url) => {
			requestedUrl = url;
			return { ok: true, status: 200, statusText: 'OK', json: async () => ({ data: [] }), text: async () => '{"data":[]}' };
		});

		const service = new CopilotApiService(log, undefined, fetcher);
		service.setGitHubToken('gh-token');

		await service.sendRequest({ type: 'Models' }, undefined, CancellationToken.None);

		assert.ok(requestedUrl);
		assert.ok(requestedUrl!.includes('models'), `Expected URL to contain 'models', got: ${requestedUrl}`);
	});

	test('sendRequest parses JSON response', async () => {
		const expectedResponse = {
			data: [
				{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', vendor: 'anthropic', version: '1.0', model_picker_enabled: true, capabilities: { type: 'chat', family: 'claude-sonnet-4', supports: { vision: true, thinking: true }, limits: { max_context_window_tokens: 200000 } } },
				{ id: 'claude-opus-4-20250514', name: 'Claude Opus 4', vendor: 'anthropic', version: '1.0', model_picker_enabled: true, capabilities: { type: 'chat', family: 'claude-opus-4', supports: { vision: true, thinking: true }, limits: { max_context_window_tokens: 200000 } } },
			],
		};
		const { fetcher } = createMockFetcherService(() => {
			return { ok: true, status: 200, statusText: 'OK', json: async () => expectedResponse, text: async () => JSON.stringify(expectedResponse) };
		});

		const service = new CopilotApiService(log, undefined, fetcher);
		service.setGitHubToken('gh-token');

		const result = await service.sendRequest<{ data: { id: string }[] }>({ type: 'Models' }, undefined, CancellationToken.None);
		assert.strictEqual(result.data.length, 2);
		assert.strictEqual(result.data[0].id, 'claude-sonnet-4-20250514');
		assert.strictEqual(result.data[1].id, 'claude-opus-4-20250514');
	});

	test('sendRequest throws on non-OK response', async () => {
		const { fetcher } = createMockFetcherService(() => {
			return { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}), text: async () => 'auth required' };
		});

		const service = new CopilotApiService(log, undefined, fetcher);
		service.setGitHubToken('gh-token');

		await assert.rejects(
			() => service.sendRequest({ type: 'Models' }, undefined, CancellationToken.None),
			/401 Unauthorized/,
		);
	});

	test('model providers do not need to know about tokens', async () => {
		// This test verifies the key architectural property: the Authorization
		// header is set by CopilotApiService, not by the caller.
		let capturedHeaders: Record<string, string> | undefined;
		const { fetcher } = createMockFetcherService((url, options) => {
			capturedHeaders = (options as { headers?: Record<string, string> }).headers;
			return { ok: true, status: 200, statusText: 'OK', body: null, text: async () => '' };
		});

		const service = new CopilotApiService(log, undefined, fetcher);
		service.setGitHubToken('gh-token');

		// Caller only provides extra headers, NOT auth
		await service.sendModelRequest(
			{ prompt: 'test' },
			{ type: 'ChatCompletions' },
			{ 'X-Custom': 'value' },
			CancellationToken.None,
		);

		// Auth header should have been added by the service
		assert.ok(capturedHeaders!['Authorization'], 'Service should add Authorization automatically');
		assert.strictEqual(capturedHeaders!['X-Custom'], 'value', 'Extra headers should be preserved');
	});
});
