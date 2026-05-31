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

function makeFetchResponse(status: number, body: unknown = {}): { ok: boolean; status: number; headers: { get: (n: string) => string | null }; json: () => Promise<unknown> } {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: { get: () => null },
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
});
