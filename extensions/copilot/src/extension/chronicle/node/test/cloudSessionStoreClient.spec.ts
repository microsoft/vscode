/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import type { ICopilotTokenManager } from '../../../../platform/authentication/common/copilotTokenManager';
import type { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import type { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { CloudSessionStoreClient } from '../cloudSessionStoreClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function makeFetchResponse(status: number, body: unknown): { ok: boolean; status: number; json: () => Promise<unknown> } {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	};
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CloudSessionStoreClient', () => {
	describe('executeQuery', () => {
		it('returns rows on success', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(200, {
				columns: ['id', 'summary'],
				column_types: ['VARCHAR', 'VARCHAR'],
				data: [['session-1', 'Test session'], ['session-2', 'Another']],
				row_count: 2,
				truncated: false,
			}));

			const client = new CloudSessionStoreClient(tokenManager, authService, fetcherService);
			const result = await client.executeQuery('SELECT * FROM sessions');

			expect(result).toBeDefined();
			expect(result).not.toBeUndefined();
			expect('rows' in result!).toBe(true);
			if (result && 'rows' in result) {
				expect(result.rows).toHaveLength(2);
				expect(result.rows[0]).toEqual({ id: 'session-1', summary: 'Test session' });
				expect(result.rows[1]).toEqual({ id: 'session-2', summary: 'Another' });
				expect(result.truncated).toBe(false);
			}
		});

		it('returns truncated flag when set', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(200, {
				columns: ['id'],
				column_types: ['VARCHAR'],
				data: [['session-1']],
				row_count: 1,
				truncated: true,
			}));

			const client = new CloudSessionStoreClient(tokenManager, authService, fetcherService);
			const result = await client.executeQuery('SELECT * FROM sessions LIMIT 10000');

			expect(result).toBeDefined();
			if (result && 'rows' in result) {
				expect(result.truncated).toBe(true);
			}
		});

		it('returns error for 400 bad SQL', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(400, {
				error: 'Binder Error: column "foo" not found',
			}));

			const client = new CloudSessionStoreClient(tokenManager, authService, fetcherService);
			const result = await client.executeQuery('SELECT foo FROM sessions');

			expect(result).toBeDefined();
			expect(result).not.toBeUndefined();
			expect('error' in result!).toBe(true);
			if (result && 'error' in result) {
				expect(result.error).toContain('Binder Error');
			}
		});

		it('returns undefined for 401 auth failure', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(401, { message: 'Unauthorized' }));

			const client = new CloudSessionStoreClient(tokenManager, authService, fetcherService);
			const result = await client.executeQuery('SELECT * FROM sessions');

			expect(result).toBeUndefined();
		});

		it('returns undefined for 403 forbidden', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(403, { message: 'Forbidden' }));

			const client = new CloudSessionStoreClient(tokenManager, authService, fetcherService);
			const result = await client.executeQuery('SELECT * FROM sessions');

			expect(result).toBeUndefined();
		});

		it('returns error with HTTP status for 500 server error', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(500, {}));

			const client = new CloudSessionStoreClient(tokenManager, authService, fetcherService);
			const result = await client.executeQuery('SELECT * FROM sessions');

			expect(result).toBeDefined();
			if (result && 'error' in result) {
				expect(result.error).toContain('500');
			}
		});

		it('returns undefined on network error', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockRejectedValue(new Error('ECONNREFUSED'));

			const client = new CloudSessionStoreClient(tokenManager, authService, fetcherService);
			const result = await client.executeQuery('SELECT * FROM sessions');

			expect(result).toBeUndefined();
		});

		it('returns undefined when no API endpoint is configured', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(tokenManager.getCopilotToken as any).mockResolvedValue({ token: 'test', endpoints: {} });

			const client = new CloudSessionStoreClient(tokenManager, authService, fetcherService);
			const result = await client.executeQuery('SELECT * FROM sessions');

			expect(result).toBeUndefined();
		});

		it('converts columnar response to row objects', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(200, {
				columns: ['id', 'repository', 'branch', 'updated_at'],
				column_types: ['VARCHAR', 'VARCHAR', 'VARCHAR', 'TIMESTAMP'],
				data: [
					['s1', 'microsoft/vscode', 'main', '2026-05-01T10:00:00Z'],
					['s2', 'microsoft/vscode', 'feature', '2026-05-01T11:00:00Z'],
				],
				row_count: 2,
				truncated: false,
			}));

			const client = new CloudSessionStoreClient(tokenManager, authService, fetcherService);
			const result = await client.executeQuery('SELECT * FROM sessions');

			if (result && 'rows' in result) {
				expect(result.rows[0]).toEqual({
					id: 's1',
					repository: 'microsoft/vscode',
					branch: 'main',
					updated_at: '2026-05-01T10:00:00Z',
				});
			}
		});

		it('returns empty rows for empty data', async () => {
			const { tokenManager, authService, fetcherService } = createMockServices();
			(fetcherService.fetch as any).mockResolvedValue(makeFetchResponse(200, {
				columns: ['id'],
				column_types: ['VARCHAR'],
				data: [],
				row_count: 0,
				truncated: false,
			}));

			const client = new CloudSessionStoreClient(tokenManager, authService, fetcherService);
			const result = await client.executeQuery('SELECT * FROM sessions WHERE 1=0');

			if (result && 'rows' in result) {
				expect(result.rows).toHaveLength(0);
			}
		});
	});
});
