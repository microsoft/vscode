/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CopilotTokenService } from '../../node/copilotToken.js';

function createMockFetch(responses: { status: number; body: unknown }[]): typeof globalThis.fetch {
	let callIndex = 0;
	return async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
		const resp = responses[callIndex++];
		if (!resp) {
			throw new Error('Mock fetch: no more responses');
		}
		return {
			ok: resp.status >= 200 && resp.status < 300,
			status: resp.status,
			statusText: resp.status === 200 ? 'OK' : 'Error',
			text: async () => typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body),
			json: async () => resp.body,
		} as Response;
	};
}

suite('CopilotTokenService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const log = new NullLogService();

	test('exchanges GitHub token for Copilot JWT', async () => {
		const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
		const mockFetch = createMockFetch([
			{
				status: 200,
				body: {
					token: 'copilot-jwt-123',
					expires_at: futureExpiry,
					refresh_in: 1800,
					endpoints: { api: 'https://custom.api.example.com' },
				},
			},
		]);

		const service = new CopilotTokenService(log, mockFetch);
		service.setGitHubToken('gh-token-abc');

		const token = await service.getToken(CancellationToken.None);

		assert.strictEqual(token.token, 'copilot-jwt-123');
		assert.strictEqual(token.expiresAt, futureExpiry);
		assert.strictEqual(token.apiBaseUrl, 'https://custom.api.example.com');
	});

	test('uses default API base URL when not provided', async () => {
		const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
		const mockFetch = createMockFetch([
			{
				status: 200,
				body: {
					token: 'copilot-jwt-456',
					expires_at: futureExpiry,
					refresh_in: 1800,
				},
			},
		]);

		const service = new CopilotTokenService(log, mockFetch);
		service.setGitHubToken('gh-token-abc');

		const token = await service.getToken(CancellationToken.None);
		assert.strictEqual(token.apiBaseUrl, 'https://api.githubcopilot.com');
	});

	test('caches and reuses unexpired token', async () => {
		let fetchCount = 0;
		const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
		const mockFetch: typeof globalThis.fetch = async () => {
			fetchCount++;
			return {
				ok: true,
				status: 200,
				statusText: 'OK',
				json: async () => ({
					token: `jwt-${fetchCount}`,
					expires_at: futureExpiry,
					refresh_in: 1800,
				}),
			} as Response;
		};

		const service = new CopilotTokenService(log, mockFetch);
		service.setGitHubToken('gh-token');

		const token1 = await service.getToken(CancellationToken.None);
		const token2 = await service.getToken(CancellationToken.None);

		assert.strictEqual(fetchCount, 1);
		assert.strictEqual(token1.token, token2.token);
	});

	test('refreshes expired token', async () => {
		let fetchCount = 0;
		const mockFetch: typeof globalThis.fetch = async () => {
			fetchCount++;
			// First call: token that is already expired
			// Second call: fresh token
			const expiresAt = fetchCount === 1
				? Math.floor(Date.now() / 1000) - 100  // Already expired
				: Math.floor(Date.now() / 1000) + 3600; // Future
			return {
				ok: true,
				status: 200,
				statusText: 'OK',
				json: async () => ({
					token: `jwt-${fetchCount}`,
					expires_at: expiresAt,
					refresh_in: 1800,
				}),
			} as Response;
		};

		const service = new CopilotTokenService(log, mockFetch);
		service.setGitHubToken('gh-token');

		const token1 = await service.getToken(CancellationToken.None);
		assert.strictEqual(token1.token, 'jwt-1');

		// Second call should trigger a refresh because the first token is expired
		const token2 = await service.getToken(CancellationToken.None);
		assert.strictEqual(token2.token, 'jwt-2');
		assert.strictEqual(fetchCount, 2);
	});

	test('clears cache when GitHub token changes', async () => {
		let fetchCount = 0;
		const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
		const mockFetch: typeof globalThis.fetch = async () => {
			fetchCount++;
			return {
				ok: true,
				status: 200,
				statusText: 'OK',
				json: async () => ({
					token: `jwt-${fetchCount}`,
					expires_at: futureExpiry,
					refresh_in: 1800,
				}),
			} as Response;
		};

		const service = new CopilotTokenService(log, mockFetch);

		service.setGitHubToken('gh-token-1');
		const token1 = await service.getToken(CancellationToken.None);

		service.setGitHubToken('gh-token-2');
		const token2 = await service.getToken(CancellationToken.None);

		assert.strictEqual(fetchCount, 2);
		assert.notStrictEqual(token1.token, token2.token);
	});

	test('throws when no GitHub token is set', async () => {
		const service = new CopilotTokenService(log);
		await assert.rejects(
			() => service.getToken(CancellationToken.None),
			/No GitHub token set/,
		);
	});

	test('throws on HTTP error response', async () => {
		const mockFetch = createMockFetch([
			{ status: 401, body: 'Unauthorized' },
		]);

		const service = new CopilotTokenService(log, mockFetch);
		service.setGitHubToken('bad-token');

		await assert.rejects(
			() => service.getToken(CancellationToken.None),
			/Copilot token exchange failed: 401/,
		);
	});

	test('deduplicates concurrent token requests', async () => {
		let fetchCount = 0;
		const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
		const mockFetch: typeof globalThis.fetch = async () => {
			fetchCount++;
			// Add a small delay to simulate network latency
			await new Promise(resolve => setTimeout(resolve, 10));
			return {
				ok: true,
				status: 200,
				statusText: 'OK',
				json: async () => ({
					token: 'jwt-shared',
					expires_at: futureExpiry,
					refresh_in: 1800,
				}),
			} as Response;
		};

		const service = new CopilotTokenService(log, mockFetch);
		service.setGitHubToken('gh-token');

		// Fire three concurrent requests
		const [t1, t2, t3] = await Promise.all([
			service.getToken(CancellationToken.None),
			service.getToken(CancellationToken.None),
			service.getToken(CancellationToken.None),
		]);

		assert.strictEqual(fetchCount, 1);
		assert.strictEqual(t1.token, 'jwt-shared');
		assert.strictEqual(t2.token, 'jwt-shared');
		assert.strictEqual(t3.token, 'jwt-shared');
	});
});
