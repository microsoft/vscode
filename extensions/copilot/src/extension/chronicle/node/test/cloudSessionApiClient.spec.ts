/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import type { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import type { ICopilotTokenManager } from '../../../../platform/authentication/common/copilotTokenManager';
import type { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { CloudSessionApiClient } from '../cloudSessionApiClient';

function createMockServices() {
	const tokenManager: ICopilotTokenManager = {
		_serviceBrand: undefined as any,
		getCopilotToken: vi.fn(async () => ({
			token: 'test-token',
			endpoints: { api: 'https://api.test.com' },
		})),
	} as any;

	const authService: IAuthenticationService = {
		_serviceBrand: undefined as any,
		anyGitHubSession: { accessToken: 'gh-token' },
	} as any;

	const fetcherService: IFetcherService = {
		_serviceBrand: undefined as any,
		fetch: vi.fn(),
	} as any;

	return { tokenManager, authService, fetcherService };
}

function makeFetchResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}): { ok: boolean; status: number; headers: { get: (n: string) => string | null }; json: () => Promise<unknown> } {
	const lowerCased = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: { get: (name: string) => lowerCased.get(name.toLowerCase()) ?? null },
		json: async () => body,
	};
}

describe('CloudSessionApiClient', () => {
	describe('createSession', () => {
		it('returns ok with response on success', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(200, { id: 'sess-1', task_id: 'task-1' }));

			const client = new CloudSessionApiClient(tokenManager, authService, fetcherService);
			const result = await client.createSession(1, 2, 'local-1');

			expect(result).toEqual({ ok: true, response: { id: 'sess-1', task_id: 'task-1' } });
		});

		it('maps HTTP 403 to policy_blocked', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(403));

			const client = new CloudSessionApiClient(tokenManager, authService, fetcherService);
			const result = await client.createSession(1, 2, 'local-1');

			expect(result).toEqual({ ok: false, reason: 'policy_blocked' });
		});

		it('maps other 4xx/5xx to error', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(500));

			const client = new CloudSessionApiClient(tokenManager, authService, fetcherService);
			const result = await client.createSession(1, 2, 'local-1');

			expect(result).toEqual({ ok: false, reason: 'error' });
		});

		it('maps HTTP 429 to rate_limited', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(429));

			const client = new CloudSessionApiClient(tokenManager, authService, fetcherService);
			const result = await client.createSession(1, 2, 'local-1');

			expect(result).toEqual({ ok: false, reason: 'rate_limited' });
		});
	});

	describe('submitSessionEvents', () => {
		it('returns ok on success', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(200));

			const client = new CloudSessionApiClient(tokenManager, authService, fetcherService);
			const result = await client.submitSessionEvents('sess-1', []);

			expect(result).toEqual({ ok: true });
		});

		it('maps HTTP 403 to policy_blocked', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(403));

			const client = new CloudSessionApiClient(tokenManager, authService, fetcherService);
			const result = await client.submitSessionEvents('sess-1', []);

			expect(result).toEqual({ ok: false, reason: 'policy_blocked' });
		});

		it('maps other 4xx/5xx to error', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(500));

			const client = new CloudSessionApiClient(tokenManager, authService, fetcherService);
			const result = await client.submitSessionEvents('sess-1', []);

			expect(result).toEqual({ ok: false, reason: 'error' });
		});

		it('maps HTTP 429 to rate_limited', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(429));

			const client = new CloudSessionApiClient(tokenManager, authService, fetcherService);
			const result = await client.submitSessionEvents('sess-1', []);

			expect(result).toEqual({ ok: false, reason: 'rate_limited' });
		});
	});

	describe('rate limiting', () => {
		it('skips requests while rate limited and resumes once the window passes', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			let now = Date.UTC(2026, 0, 1);
			const fetch = fetcherService.fetch as any;
			fetch.mockResolvedValue(makeFetchResponse(429, {}, { 'retry-after': '120' }));

			const client = new CloudSessionApiClient(tokenManager, authService, fetcherService, () => now);

			const first = await client.submitSessionEvents('sess-1', []);
			const callsAfterLimit = fetch.mock.calls.length;

			// Inside the window the call short-circuits without touching the network.
			now += 60_000;
			const during = await client.submitSessionEvents('sess-1', []);
			const callsDuringWindow = fetch.mock.calls.length;

			// Past the window the client tries again and recovers.
			now += 61_000;
			fetch.mockResolvedValue(makeFetchResponse(200));
			const after = await client.submitSessionEvents('sess-1', []);

			expect({ first, during, after, callsAfterLimit, callsDuringWindow, callsTotal: fetch.mock.calls.length, limitedNow: client.isRateLimited() }).toEqual({
				first: { ok: false, reason: 'rate_limited' },
				during: { ok: false, reason: 'rate_limited' },
				after: { ok: true },
				callsAfterLimit: 1,
				callsDuringWindow: 1,
				callsTotal: 2,
				limitedNow: false,
			});
		});

		it('reports each new limit once through onRateLimited', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			let now = Date.UTC(2026, 0, 1);
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(429, {}, { 'retry-after': '90' }));

			const client = new CloudSessionApiClient(tokenManager, authService, fetcherService, () => now);
			const reported: Array<{ callSite: string; retryAfterSec: number }> = [];
			client.onRateLimited = (callSite, retryAfterSec) => reported.push({ callSite, retryAfterSec });

			await client.createSession(1, 2, 'local-1');
			// A follow-up blocked by the same window must not report again.
			now += 30_000;
			await client.createSession(1, 2, 'local-2');

			expect(reported).toEqual([{ callSite: 'createSession', retryAfterSec: 90 }]);
		});

		it('clamps an implausible retry-after to the maximum backoff', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			const now = Date.UTC(2026, 0, 1);
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(429, {}, { 'retry-after': '86400' }));

			const client = new CloudSessionApiClient(tokenManager, authService, fetcherService, () => now);
			const reported: number[] = [];
			client.onRateLimited = (_callSite, retryAfterSec) => reported.push(retryAfterSec);

			await client.getSession('sess-1');

			expect(reported).toEqual([600]);
		});
	});
});
