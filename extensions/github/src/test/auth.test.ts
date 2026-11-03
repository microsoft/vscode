/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { AuthenticationSession, version } from 'vscode';
import { AuthenticationError, OctokitService } from '../auth.js';

suite('GitHub GraphQL user agent', () => {
	const session: AuthenticationSession = {
		id: 'user-agent-test',
		accessToken: 'user-agent-test',
		account: { id: 'octocat', label: 'octocat' },
		scopes: ['repo']
	};

	test('sends the running VS Code version and preserves authentication on cached clients', async () => {
		let sessionRequests = 0;
		const service = new OctokitService(async () => {
			sessionRequests++;
			return session;
		});
		const requests: { authorization: string | null; userAgent: string | null }[] = [];
		const fetch: typeof globalThis.fetch = async (_url, init) => {
			const headers = new Headers(init?.headers);
			requests.push({
				authorization: headers.get('authorization'),
				userAgent: headers.get('user-agent')
			});
			return new Response(JSON.stringify({ data: { viewer: { login: 'octocat' } } }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		};

		try {
			const client = await service.getOctokitGraphql();
			const first = await client('query { viewer { login } }', { request: { fetch } });
			const cached = await service.getOctokitGraphql();
			const second = await cached('query { viewer { login } }', { request: { fetch } });
			const expectedHeaders = {
				authorization: `token ${session.accessToken}`,
				userAgent: `vscode.github/${version}`
			};
			assert.deepStrictEqual({
				requests,
				first,
				second,
				sessionRequests,
				reusedClient: client === cached
			}, {
				requests: [expectedHeaders, expectedHeaders],
				first: { viewer: { login: 'octocat' } },
				second: { viewer: { login: 'octocat' } },
				sessionRequests: 1,
				reusedClient: true
			});
		} finally {
			service.dispose();
		}
	});

	test('retries session lookup after authentication becomes available', async () => {
		let currentSession: AuthenticationSession | undefined;
		const service = new OctokitService(async () => currentSession);
		try {
			await assert.rejects(service.getOctokitGraphql(), AuthenticationError);
			currentSession = session;
			assert.ok(await service.getOctokitGraphql());
		} finally {
			service.dispose();
		}
	});
});
