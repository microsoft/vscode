/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentFinderMediaType, AgentFinderService, IAgentFinderPage, IAgentFinderProvider, IAgentFinderQuery } from '../../common/agentFinderService.js';

suite('AgentFinderService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService() {
		const calls: { provider: 'browse' | 'search'; options: IAgentFinderQuery; token: CancellationToken }[] = [];
		const pages: Record<'browse' | 'search', IAgentFinderPage> = {
			browse: { items: [], total: 0 },
			search: { items: [] },
		};
		const provider = (name: 'browse' | 'search'): IAgentFinderProvider => ({
			query: async (options, token) => {
				calls.push({ provider: name, options, token });
				return pages[name];
			},
		});
		return { service: new AgentFinderService(provider('browse'), provider('search')), calls, pages };
	}

	test('routes absent, empty, and whitespace-only queries to browsing', async () => {
		const { service, calls, pages } = createService();
		const results = [];
		for (const query of [undefined, '', ' \t\n ']) {
			results.push(await service.query({ query }, CancellationToken.None) === pages.browse);
		}
		assert.deepStrictEqual({
			results,
			calls: calls.map(call => ({ provider: call.provider, query: call.options.query })),
		}, {
			results: [true, true, true],
			calls: [
				{ provider: 'browse', query: '' },
				{ provider: 'browse', query: '' },
				{ provider: 'browse', query: '' },
			],
		});
	});

	test('routes trimmed text to the independently supplied search provider', async () => {
		const { service, calls, pages } = createService();
		const token = store.add(new CancellationTokenSource()).token;
		const options = Object.freeze<IAgentFinderQuery>({
			query: '  postgres  ',
			mediaType: AgentFinderMediaType.McpServer,
			pageSize: 24,
			cursor: { kind: 'search', pageToken: 'opaque/token==' },
		});
		const page = await service.query(options, token);
		assert.deepStrictEqual({
			calls,
			samePage: page === pages.search,
			originalQuery: options.query,
		}, {
			calls: [{ provider: 'search', options: { ...options, query: 'postgres' }, token }],
			samePage: true,
			originalQuery: '  postgres  ',
		});
	});

	test('forwards browse filters and pagination without invoking search', async () => {
		const { service, calls } = createService();
		const options: IAgentFinderQuery = {
			mediaType: AgentFinderMediaType.ClaudePlugin,
			pageSize: 24,
			cursor: { kind: 'browse', offset: 24 },
		};
		await service.query(options, CancellationToken.None);
		assert.deepStrictEqual(calls, [{
			provider: 'browse',
			options: { ...options, query: '' },
			token: CancellationToken.None,
		}]);
	});

	test('does not reinterpret provider resources or manufacture installation provenance', async () => {
		const page: IAgentFinderPage = {
			items: [{
				identifier: 'provider-resource',
				displayName: 'Resource',
				description: '',
				mediaType: AgentFinderMediaType.Skill,
				tags: [],
				capabilities: [],
				representativeQueries: [],
				externalUrl: 'https://github.com/example/skills/blob/main/review/SKILL.md',
			}],
			nextCursor: { kind: 'search', pageToken: 'next' },
		};
		const provider: IAgentFinderProvider = { query: async () => page };
		const service = new AgentFinderService(provider, provider);
		assert.strictEqual(await service.query({ query: 'review' }, CancellationToken.None), page);
	});

	for (const operation of ['browse', 'search'] as const) {
		test(`${operation} failures do not fall back to another provider`, async () => {
			const error = new Error('Provider refused the request');
			const calls: string[] = [];
			const provider = (name: string): IAgentFinderProvider => ({
				query: async () => {
					calls.push(name);
					throw error;
				},
			});
			const service = new AgentFinderService(provider('browse'), provider('search'));
			await assert.rejects(service.query({ query: operation === 'search' ? 'review' : undefined }, CancellationToken.None), actual => actual === error);
			assert.deepStrictEqual(calls, [operation]);
		});
	}

	test('cancelled requests do not invoke either provider', async () => {
		const { service, calls } = createService();
		await assert.rejects(service.query({}, CancellationToken.Cancelled), isCancellationError);
		await assert.rejects(service.query({ query: 'review' }, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual(calls, []);
	});
});
