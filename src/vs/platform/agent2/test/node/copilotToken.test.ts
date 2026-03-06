/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CopilotTokenService } from '../../node/copilotToken.js';

/**
 * Creates a mock fetcher service (ICAPIFetcherService) that returns
 * canned responses. CAPIClient delegates all HTTP to this service.
 */
function createMockFetcherService(handler: (url: string, options: Record<string, unknown>) => unknown) {
	return {
		fetch(url: string, options: Record<string, unknown>) {
			return Promise.resolve(handler(url, options));
		},
		fetchWithPagination() {
			return Promise.resolve([]);
		},
	};
}

function createTokenResponse(overrides?: Partial<{ token: string; expires_at: number; refresh_in: number; endpoints: { api?: string }; sku: string }>) {
	const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
	return {
		token: overrides?.token ?? 'copilot-jwt-123',
		expires_at: overrides?.expires_at ?? futureExpiry,
		refresh_in: overrides?.refresh_in ?? 1800,
		endpoints: overrides?.endpoints ?? { api: 'https://api.githubcopilot.com' },
		sku: overrides?.sku ?? 'copilot_for_business',
	};
}

suite('CopilotTokenService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const log = new NullLogService();

	test('exchanges GitHub token for Copilot JWT', async () => {
		const tokenResp = createTokenResponse({ token: 'copilot-jwt-abc', endpoints: { api: 'https://custom.api.example.com' } });
		const fetcher = createMockFetcherService(() => tokenResp);

		const service = new CopilotTokenService(log, fetcher);
		service.setGitHubToken('gh-token-abc');

		const token = await service.getToken(CancellationToken.None);

		assert.strictEqual(token.token, 'copilot-jwt-abc');
		assert.strictEqual(token.expiresAt, tokenResp.expires_at);
	});

	test('caches and reuses unexpired token', async () => {
		let fetchCount = 0;
		const tokenResp = createTokenResponse();
		const fetcher = createMockFetcherService(() => {
			fetchCount++;
			return tokenResp;
		});

		const service = new CopilotTokenService(log, fetcher);
		service.setGitHubToken('gh-token');

		const token1 = await service.getToken(CancellationToken.None);
		const token2 = await service.getToken(CancellationToken.None);

		assert.strictEqual(fetchCount, 1);
		assert.strictEqual(token1.token, token2.token);
	});

	test('refreshes expired token', async () => {
		let fetchCount = 0;
		const fetcher = createMockFetcherService(() => {
			fetchCount++;
			// First call: token that is already expired
			// Second call: fresh token
			const expiresAt = fetchCount === 1
				? Math.floor(Date.now() / 1000) - 100  // Already expired
				: Math.floor(Date.now() / 1000) + 3600; // Future
			return createTokenResponse({ token: `jwt-${fetchCount}`, expires_at: expiresAt });
		});

		const service = new CopilotTokenService(log, fetcher);
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
		const fetcher = createMockFetcherService(() => {
			fetchCount++;
			return createTokenResponse({ token: `jwt-${fetchCount}` });
		});

		const service = new CopilotTokenService(log, fetcher);

		service.setGitHubToken('gh-token-1');
		const token1 = await service.getToken(CancellationToken.None);

		service.setGitHubToken('gh-token-2');
		const token2 = await service.getToken(CancellationToken.None);

		assert.strictEqual(fetchCount, 2);
		assert.notStrictEqual(token1.token, token2.token);
	});

	test('throws when no GitHub token is set', async () => {
		const fetcher = createMockFetcherService(() => createTokenResponse());
		const service = new CopilotTokenService(log, fetcher);
		await assert.rejects(
			() => service.getToken(CancellationToken.None),
			/No GitHub token/,
		);
	});

	test('deduplicates concurrent token requests', async () => {
		let fetchCount = 0;
		const fetcher = createMockFetcherService(async () => {
			fetchCount++;
			// Simulate network latency
			await new Promise(resolve => setTimeout(resolve, 10));
			return createTokenResponse({ token: 'jwt-shared' });
		});

		const service = new CopilotTokenService(log, fetcher);
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

	test('makeRequest routes through CAPIClient', async () => {
		let requestedUrl: string | undefined;
		const fetcher = createMockFetcherService((url) => {
			requestedUrl = url;
			return { result: 'ok' };
		});

		const service = new CopilotTokenService(log, fetcher);

		await service.makeRequest({ method: 'GET' }, { type: 'Models' });

		// CAPIClient should have routed to the models URL
		assert.ok(requestedUrl);
		assert.ok(requestedUrl!.includes('models'), `Expected URL to contain 'models', got: ${requestedUrl}`);
	});
});
