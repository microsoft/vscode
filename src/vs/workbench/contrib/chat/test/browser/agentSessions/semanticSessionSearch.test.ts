/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ISessionSemanticRequest } from '../../../../../../platform/agentHost/common/sessionSemanticSearch.js';
import { buildChatUri } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IEmbeddingsService } from '../../../../../services/embeddings/common/embeddingsService.js';
import { MAX_SEMANTIC_SESSION_SEARCH_DOCUMENT_CHUNKS, mergeSessionSearchResults, SemanticSessionSearch, SemanticSessionSearchConsent } from '../../../browser/agentSessions/agentHost/semanticSessionSearch.js';

suite('SemanticSessionSearch', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const providerId = 'copilot.text-embedding-3-small';
	const session = URI.parse('copilotcli:/session');

	function embeddings(compute: IEmbeddingsService['computeEmbeddings'], allProviders = [providerId]): IEmbeddingsService {
		return upcastPartial<IEmbeddingsService>({ allProviders, onDidChange: Event.None, computeEmbeddings: compute });
	}

	function connection(search: NonNullable<IAgentConnection['sessionSemanticSearch']>): IAgentConnection {
		return upcastPartial<IAgentConnection>({ supportsSessionSemanticSearch: async () => true, sessionSemanticSearch: search });
	}

	for (const approved of [false, true]) {
		test(`requires explicit consent and offers only registered Copilot providers (${approved})`, async () => {
			const consent = store.add(new SemanticSessionSearchConsent());
			const actions: string[] = [];
			const service = embeddings(async () => { actions.push('compute'); return []; }, ['other.provider', providerId]);
			const result = await consent.enable(service, async providers => {
				actions.push(`select:${providers.join(',')}`);
				return providers[0];
			}, async provider => {
				actions.push(`confirm:${provider}`);
				return approved;
			});
			assert.deepStrictEqual({ result, provider: consent.approved?.providerId, actions }, {
				result: approved ? 'enabled' : 'cancelled',
				provider: approved ? providerId : undefined,
				actions: [`select:${providerId}`, `confirm:${providerId}`],
			});
		});
	}

	test('a missing Copilot provider never requests consent or computation', async () => {
		const consent = store.add(new SemanticSessionSearchConsent());
		const result = await consent.enable(embeddings(async () => assert.fail('compute'), ['other.provider']),
			async () => assert.fail('select'), async () => assert.fail('confirm'));
		assert.deepStrictEqual({ result, options: consent.approved }, { result: 'unavailable', options: undefined });
	});

	for (const action of ['query', 'workspace', 'hide'] as const) {
		test(`revokes pending consent on ${action} and ignores late approval`, async () => {
			const consent = store.add(new SemanticSessionSearchConsent());
			const confirmation = new DeferredPromise<boolean>();
			let token: CancellationToken | undefined;
			const enabling = consent.enable(embeddings(async () => assert.fail('compute')),
				async providers => providers[0], async (_provider, cancellation) => {
					token = cancellation;
					return confirmation.p;
				});
			await Promise.resolve();
			if (action === 'query') {
				consent.cancelPending();
			} else if (action === 'workspace') {
				consent.revoke();
			} else {
				consent.dispose();
			}
			await confirmation.complete(true);
			assert.deepStrictEqual({ result: await enabling, cancelled: token?.isCancellationRequested, approved: consent.approved },
				{ result: 'cancelled', cancelled: true, approved: undefined });
		});
	}

	test('scope revocation does not retain approval for a subsequent search', async () => {
		const consent = store.add(new SemanticSessionSearchConsent());
		await consent.enable(embeddings(async () => assert.fail('compute')), async providers => providers[0], async () => true);
		consent.revoke();
		assert.strictEqual(consent.approved, undefined);
	});

	test('shares one query embedding, stores exact pending identities, and reuses cached document vectors', async () => {
		const requests: ISessionSemanticRequest[] = [];
		const inputs: string[][] = [];
		const stored = new Set<string>();
		const service = embeddings(async (_provider, input) => {
			inputs.push(input);
			return input.map(() => ({ values: [1, 0] }));
		});
		const host = connection(async (uri, request) => {
			requests.push(request);
			if (request.kind === 'pending') {
				return { kind: 'pending', chunks: stored.has(uri.path) ? [] : [{ id: 7, contentHash: 'hash', text: 'a car can be repaired' }], hasMore: false };
			}
			if (request.kind === 'store') {
				stored.add(uri.path);
				return { kind: 'store' };
			}
			return { kind: 'search', matches: [], hasMore: false, incomplete: false };
		});
		const options = { providerId, embeddingsService: service };
		const generation = new SemanticSessionSearch('fix an automobile', options, CancellationToken.None);
		await Promise.all([generation.search(host, session), generation.search(host, URI.parse('copilotcli:/second'))]);
		await new SemanticSessionSearch('another query', options, CancellationToken.None).search(host, session);
		assert.deepStrictEqual({
			inputs,
			models: requests.every(request => request.model.id === providerId && request.model.dimensions === 2),
			stored: requests.filter(request => request.kind === 'store').map(request => request.values),
			searches: requests.filter(request => request.kind === 'search').map(request => request.vector),
		}, {
			inputs: [['fix an automobile'], ['a car can be repaired'], ['a car can be repaired'], ['another query']],
			models: true,
			stored: [[{ id: 7, contentHash: 'hash', vector: [1, 0] }], [{ id: 7, contentHash: 'hash', vector: [1, 0] }]],
			searches: [[1, 0], [1, 0], [1, 0]],
		});
	});

	test('cancellation while embedding a document prevents storage, search and further uploads', async () => {
		const source = store.add(new CancellationTokenSource());
		const started = new DeferredPromise<void>();
		const document = new DeferredPromise<{ values: number[] }[]>();
		const requests: string[] = [];
		const inputs: string[][] = [];
		let providerToken: CancellationToken | undefined;
		const service = embeddings(async (_provider, input, token) => {
			inputs.push(input);
			if (input[0] !== 'query') {
				providerToken = token;
				await started.complete();
				return document.p;
			}
			return [{ values: [1, 0] }];
		});
		const generation = new SemanticSessionSearch('query', { providerId, embeddingsService: service }, source.token);
		const searching = generation.search(connection(async (_uri, request) => {
			requests.push(request.kind);
			return { kind: 'pending', chunks: [{ id: 1, contentHash: 'hash', text: 'document' }], hasMore: true };
		}), session);
		const rejection = assert.rejects(searching, error => error instanceof Error && error.name === 'Canceled');
		await started.p;
		source.cancel();
		await rejection;
		await document.complete([{ values: [1, 0] }]);
		assert.deepStrictEqual({ requests, inputs, cancelled: providerToken?.isCancellationRequested }, {
			requests: ['pending'], inputs: [['query'], ['document']], cancelled: true,
		});
	});

	test('bounds embedding concurrency across generations and skips cancelled queued requests', async () => {
		const sources = Array.from({ length: 6 }, () => store.add(new CancellationTokenSource()));
		const started = new DeferredPromise<void>();
		const blocked = new DeferredPromise<{ values: number[] }[]>();
		const inputs: string[] = [];
		let active = 0;
		let maximumActive = 0;
		const service = embeddings(async (_provider, input) => {
			inputs.push(input[0]);
			active++;
			maximumActive = Math.max(maximumActive, active);
			if (active === 2) {
				await started.complete();
			}
			await blocked.p;
			active--;
			return [{ values: [1, 0] }];
		});
		const host = connection(async (_session, request) => request.kind === 'pending'
			? { kind: 'pending', chunks: [], hasMore: false }
			: { kind: 'search', matches: [], hasMore: false, incomplete: false });
		const operations = sources.map((source, index) => new SemanticSessionSearch(`query-${index}`, { providerId, embeddingsService: service }, source.token).search(host, session));
		const completed = Promise.allSettled(operations);
		await started.p;
		for (const source of sources) {
			source.cancel();
		}
		await blocked.complete([{ values: [1, 0] }]);
		await completed;
		assert.deepStrictEqual({ inputs, maximumActive }, { inputs: ['query-0', 'query-1'], maximumActive: 2 });
	});

	test('bounds pending uploads to 32 batches and reports incomplete coverage', async () => {
		let uploads = 0;
		const service = embeddings(async (_provider, input) => input.map(() => ({ values: [1, 0] })));
		const generation = new SemanticSessionSearch('query', { providerId, embeddingsService: service }, CancellationToken.None);
		const result = await generation.search(connection(async (_session, request) => {
			switch (request.kind) {
				case 'pending': return { kind: 'pending', chunks: [{ id: uploads, contentHash: 'hash', text: 'document' }], hasMore: true };
				case 'store': uploads++; return { kind: 'store' };
				case 'search': return { kind: 'search', matches: [], hasMore: false, incomplete: false };
			}
		}), session);
		assert.deepStrictEqual({ uploads, result }, { uploads: 32, result: { matches: [], hasMore: false, incomplete: true } });
	});

	test('shares a 2048-chunk budget across concurrent sessions, truncates the final batch, and still searches cached vectors', async () => {
		let queries = 0;
		let documents = 0;
		const batchSizes: number[] = [];
		const stored = new Map<string, number>();
		const searched: string[] = [];
		const service = embeddings(async (_provider, input) => {
			if (input[0] === 'query') {
				queries++;
			} else {
				documents += input.length;
				batchSizes.push(input.length);
			}
			return input.map(() => ({ values: [1, 0] }));
		});
		const host = connection(async (uri, request) => {
			if (request.kind === 'pending') {
				const offset = stored.get(uri.path) ?? 0;
				return {
					kind: 'pending',
					chunks: uri.path === '/cached' ? [] : Array.from({ length: 15 }, (_, index) => ({
						id: offset + index + 1, contentHash: 'a'.repeat(64), text: `synthetic document ${offset + index}`,
					})),
					hasMore: uri.path !== '/cached',
				};
			}
			if (request.kind === 'store') {
				stored.set(uri.path, (stored.get(uri.path) ?? 0) + request.values.length);
				return { kind: 'store' };
			}
			searched.push(uri.path);
			return {
				kind: 'search', matches: [{ chat: buildChatUri(uri, 'default'), turnId: 'turn', role: 'assistant', snippet: 'cached match', score: 1 }],
				hasMore: false, incomplete: false,
			};
		});
		const generation = new SemanticSessionSearch('query', { providerId, embeddingsService: service }, CancellationToken.None);
		const results = await Promise.all(Array.from({ length: 8 }, (_, index) => generation.search(host, URI.parse(`copilotcli:/${index}`))));
		const cached = await generation.search(host, URI.parse('copilotcli:/cached'));
		assert.deepStrictEqual({
			queries, documents, used: generation.documentChunksUsed, exhausted: generation.budgetExhausted,
			partialBatch: batchSizes.filter(size => size !== 15),
			stored: [...stored.values()].reduce((sum, count) => sum + count, 0),
			searched: searched.length, allIncomplete: results.every(result => result.incomplete),
			cached: { count: cached.matches.length, incomplete: cached.incomplete },
		}, {
			queries: 1, documents: MAX_SEMANTIC_SESSION_SEARCH_DOCUMENT_CHUNKS, used: 2048, exhausted: true,
			partialBatch: [8], stored: 2048, searched: 9, allIncomplete: true, cached: { count: 1, incomplete: false },
		});
	});

	test('rejects document vectors with a different dimension before storing', async () => {
		const requests: string[] = [];
		const service = embeddings(async (_provider, input) => [{ values: input[0] === 'query' ? [1, 0] : [1] }]);
		const generation = new SemanticSessionSearch('query', { providerId, embeddingsService: service }, CancellationToken.None);
		await assert.rejects(generation.search(connection(async (_session, request) => {
			requests.push(request.kind);
			return { kind: 'pending', chunks: [{ id: 1, contentHash: 'hash', text: 'document' }], hasMore: false };
		}), session), /Invalid semantic embeddings/);
		assert.deepStrictEqual(requests, ['pending']);
	});

	test('rejects a zero query vector before requesting saved messages', async () => {
		const generation = new SemanticSessionSearch('query', {
			providerId, embeddingsService: embeddings(async () => [{ values: [0, 0] }]),
		}, CancellationToken.None);
		await assert.rejects(generation.search(connection(async () => assert.fail('saved messages requested')), session), /Invalid semantic embeddings/);
	});

	test('fuses independent candidate lists by rank, deduplicates, and retains the keyword snippet', () => {
		const keyword = [{ id: 'literal', snippet: 'literal' }, { id: 'both', snippet: 'keyword excerpt' }];
		const semantic = [{ id: 'meaning', snippet: 'a paraphrase' }, { id: 'both', snippet: 'semantic excerpt' }];
		assert.deepStrictEqual(mergeSessionSearchResults([...keyword, keyword[1]], semantic, item => item.id), [
			{ item: keyword[1], source: 'both' },
			{ item: keyword[0], source: 'keyword' },
			{ item: semantic[0], source: 'semantic' },
		]);
	});
});
