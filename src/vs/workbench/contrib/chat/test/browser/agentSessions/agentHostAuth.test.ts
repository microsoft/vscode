/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { resolveTokenForResource } from '../../../browser/agentSessions/agentHost/agentHostAuth.js';

function createMockAuthService(overrides: {
	getOrActivateProviderIdForServer?: (serverUri: URI, resourceUri: URI) => Promise<string | undefined>;
	getSessions?: (providerId: string, scopes: string[] | undefined, options: any, activate: boolean) => Promise<readonly { scopes: string[]; accessToken: string }[]>;
}): IAuthenticationService {
	return {
		getOrActivateProviderIdForServer: overrides.getOrActivateProviderIdForServer ?? (() => Promise.resolve(undefined)),
		getSessions: overrides.getSessions ?? (() => Promise.resolve([])),
	} as unknown as IAuthenticationService;
}

suite('resolveTokenForResource', () => {

	const log = new NullLogService();
	const resource = URI.parse('https://api.example.com');

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined when no authorization servers provided', async () => {
		const authService = createMockAuthService({});
		const token = await resolveTokenForResource(resource, [], ['read'], authService, log, 'test');
		assert.strictEqual(token, undefined);
	});

	test('returns undefined when no provider matches the server', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve(undefined),
		});
		const token = await resolveTokenForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test');
		assert.strictEqual(token, undefined);
	});

	test('returns token from exact scope match', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes && scopes.length === 1 && scopes[0] === 'read') {
					return Promise.resolve([{ scopes: ['read'], accessToken: 'exact-token' }]);
				}
				return Promise.resolve([]);
			},
		});
		const token = await resolveTokenForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test');
		assert.strictEqual(token, 'exact-token');
	});

	test('falls back to narrowest superset session when exact match fails', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes !== undefined) {
					// Exact match returns empty
					return Promise.resolve([]);
				}
				// All sessions — return two superset options
				return Promise.resolve([
					{ scopes: ['read', 'write', 'admin'], accessToken: 'wide-token' },
					{ scopes: ['read', 'write'], accessToken: 'narrow-token' },
				]);
			},
		});
		const token = await resolveTokenForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test');
		assert.strictEqual(token, 'narrow-token');
	});

	test('returns undefined when no session has matching scopes', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes !== undefined) {
					return Promise.resolve([]);
				}
				// No session contains the 'read' scope
				return Promise.resolve([
					{ scopes: ['write'], accessToken: 'wrong-token' },
				]);
			},
		});
		const token = await resolveTokenForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test');
		assert.strictEqual(token, undefined);
	});

	test('tries multiple authorization servers in order', async () => {
		const calls: string[] = [];
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: (serverUri) => {
				calls.push(serverUri.toString());
				if (serverUri.toString() === 'https://auth2.example.com/') {
					return Promise.resolve('provider-2');
				}
				return Promise.resolve(undefined);
			},
			getSessions: () => Promise.resolve([{ scopes: ['read'], accessToken: 'server2-token' }]),
		});
		const token = await resolveTokenForResource(
			resource,
			['https://auth1.example.com', 'https://auth2.example.com'],
			['read'], authService, log, 'test',
		);
		assert.strictEqual(token, 'server2-token');
		assert.strictEqual(calls.length, 2);
	});
});
