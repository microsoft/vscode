/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createLazyCustomizationMarketplaceSource, CustomizationMarketplaceMediaType, CustomizationMarketplaceService, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceCursor, ICustomizationMarketplaceEntry, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceSource, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../common/customizationMarketplaceService.js';

suite('CustomizationMarketplaceService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const entry: ICustomizationMarketplaceEntry = {
		identifier: 'shared-identifier',
		displayName: 'Example',
		description: '',
		mediaType: CustomizationMarketplaceMediaType.Skill,
		tags: [],
		capabilities: [],
		representativeQueries: [],
		version: '1.0',
	};

	test('aggregates registered sources without conflating identifiers or mutating their entries', async () => {
		const calls: { source: string; options: ICustomizationMarketplaceSourceQuery }[] = [];
		const sources = ['first', 'second'].map((id): ICustomizationMarketplaceSource => ({
			id,
			query: async options => {
				calls.push({ source: id, options });
				return { items: [entry], total: 1 };
			},
		}));
		const options = { query: '  review  ', mediaType: CustomizationMarketplaceMediaType.Skill, pageSize: 24 };
		const page = await new CustomizationMarketplaceService(sources).query({ ...options, sourceIds: ['first', 'second'] }, CancellationToken.None);
		assert.deepStrictEqual({
			page,
			calls,
			sourceEntryWasNotReused: page.items.every(item => item !== entry),
			originalQuery: options.query,
		}, {
			page: { items: sources.map(source => ({ ...entry, sourceId: source.id })), total: 2, nextCursor: undefined },
			calls: sources.map(source => ({ source: source.id, options: { ...options, query: 'review', cursor: undefined } })),
			sourceEntryWasNotReused: true,
			originalQuery: '  review  ',
		});
	});

	test('continues each source with its own opaque cursor and retains exhausted source totals', async () => {
		const calls: { source: string; cursor: string | undefined }[] = [];
		const source = (id: string, hasMore: boolean): ICustomizationMarketplaceSource => ({
			id,
			query: async options => {
				calls.push({ source: id, cursor: options.cursor });
				return { items: [entry], total: hasMore ? 2 : 1, nextCursor: hasMore && !options.cursor ? `${id}/opaque+/=&token` : undefined };
			},
		});
		const service = new CustomizationMarketplaceService([source('first', true), source('second', false)]);
		const first = await service.query({ sourceIds: ['first', 'second'], pageSize: 1 }, CancellationToken.None);
		const second = await service.query({ sourceIds: ['first', 'second'], pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);
		const third = await service.query({ sourceIds: ['first', 'second'], pageSize: 1, cursor: second.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({ calls, pages: [first, second, third].map(page => ({
			items: page.items.map(item => item.sourceId), total: page.total, hasMore: !!page.nextCursor,
		})) }, {
			calls: [
				{ source: 'first', cursor: undefined },
				{ source: 'second', cursor: undefined },
				{ source: 'first', cursor: 'first/opaque+/=&token' },
			],
			pages: [
				{ items: ['first'], total: 3, hasMore: true },
				{ items: ['first'], total: 3, hasMore: true },
				{ items: ['second'], total: 3, hasMore: false },
			],
		});
	});

	test('does not invent a total when an exhausted source did not report one', async () => {
		const service = new CustomizationMarketplaceService([
			{ id: 'unknown', query: async () => ({ items: [entry] }) },
			{ id: 'known', query: async options => ({ items: [entry], total: 2, nextCursor: options.cursor ? undefined : 'next' }) },
		]);
		const options = { sourceIds: ['unknown', 'known'], pageSize: 1 };
		const first = await service.query(options, CancellationToken.None);
		const second = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		const third = await service.query({ ...options, cursor: second.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual([first.total, second.total, third.total, third.items.map(item => item.sourceId), third.nextCursor], [undefined, undefined, undefined, ['known'], undefined]);
	});

	test('pagination and totals include only the selected sources', async () => {
		const calls: { source: string; cursor: string | undefined }[] = [];
		const sources = ['disabled', 'enabled'].map((id): ICustomizationMarketplaceSource => ({
			id,
			query: async options => {
				calls.push({ source: id, cursor: options.cursor });
				return { items: [entry], total: 2, nextCursor: options.cursor ? undefined : 'next' };
			},
		}));
		const service = new CustomizationMarketplaceService(sources);
		const first = await service.query({ sourceIds: ['enabled'], pageSize: 1 }, CancellationToken.None);
		const second = await service.query({ sourceIds: ['enabled'], pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({ calls, hasMore: !!first.nextCursor, second }, {
			calls: [{ source: 'enabled', cursor: undefined }, { source: 'enabled', cursor: 'next' }],
			hasMore: true,
			second: { items: [{ ...entry, sourceId: 'enabled' }], total: 2, nextCursor: undefined },
		});
	});

	test('does not fabricate installation provenance or reinterpret source metadata', async () => {
		const installation = { kind: 'plugin', repository: 'owner/repo', ref: 'release/next', path: 'plugins/demo' } as const;
		const entries = [entry, { ...entry, version: '2.0', installation }];
		const page = await new CustomizationMarketplaceService([
			{ id: 'catalog', query: async () => ({ items: entries }) },
		]).query({ sourceIds: ['catalog'] }, CancellationToken.None);
		assert.deepStrictEqual(page.items, entries.map(item => ({ ...item, sourceId: 'catalog' })));
	});

	test('resource keys distinguish sources, versions and delimiter-like identifiers', () => {
		const resources = [
			{ ...entry, sourceId: 'first' },
			{ ...entry, sourceId: 'second' },
			{ ...entry, sourceId: 'first', version: '2.0' },
			{ ...entry, sourceId: 'first', version: undefined },
			{ ...entry, sourceId: 'first', identifier: 'a:b', version: 'c' },
			{ ...entry, sourceId: 'first', identifier: 'a', version: 'b:c' },
		];
		const keys = resources.map(getCustomizationMarketplaceResourceKey);
		assert.deepStrictEqual({ unique: new Set(keys).size, stable: getCustomizationMarketplaceResourceKey({ ...resources[0] }) === keys[0] }, { unique: resources.length, stable: true });
	});

	test('rejects continuation after the query, type, page size, or source set changes', async () => {
		const calls: string[] = [];
		const sources = ['first', 'second'].map((id): ICustomizationMarketplaceSource => ({
			id, query: async () => {
				calls.push(id);
				return { items: [entry], nextCursor: id };
			},
		}));
		const service = new CustomizationMarketplaceService(sources);
		const options = { sourceIds: ['first', 'second'], query: 'review', mediaType: CustomizationMarketplaceMediaType.Skill, pageSize: 1 };
		const page = await service.query(options, CancellationToken.None);
		for (const change of [{ query: '' }, { query: 'another' }, { mediaType: CustomizationMarketplaceMediaType.McpServer }, { pageSize: 12 }, { sourceIds: ['second'] }]) {
			await assert.rejects(service.query({ ...options, ...change, cursor: page.nextCursor }, CancellationToken.None), /Start a new search/);
		}
		for (const changedSources of [[...sources].reverse(), sources.slice(1), [...sources, { id: 'third', query: sources[0].query }]]) {
			await assert.rejects(new CustomizationMarketplaceService(changedSources).query({ ...options, sourceIds: changedSources.map(source => source.id), cursor: page.nextCursor }, CancellationToken.None), /Start a new search/);
		}
		assert.deepStrictEqual(calls, ['first', 'second']);
	});

	test('merges ranked sources into globally bounded pages without losing buffered results', async () => {
		const calls: { id: string; cursor: string | undefined; pageSize: number | undefined }[] = [];
		const source = (id: string, scores: readonly number[]): ICustomizationMarketplaceSource => ({
			id,
			query: async options => {
				calls.push({ id, cursor: options.cursor, pageSize: options.pageSize });
				const offset = Number(options.cursor ?? 0);
				const items = scores.slice(offset, offset + options.pageSize!).map((score, index) => ({
					...entry, identifier: `${id}-${offset + index}`, score,
				}));
				return { items, total: scores.length, nextCursor: offset + items.length < scores.length ? String(offset + items.length) : undefined };
			},
		});
		const service = new CustomizationMarketplaceService([
			source('public', [100, 95, 90, 80, 60]),
			source('connectors', [98, 90, 85]),
		]);
		const options = { sourceIds: ['public', 'connectors'], query: 'mail', pageSize: 3 };
		const pages = [];
		let cursor: ICustomizationMarketplaceCursor | undefined;
		do {
			const page = await service.query({ ...options, cursor }, CancellationToken.None);
			pages.push({ scores: page.items.map(item => item.score), ids: page.items.map(item => item.identifier), total: page.total });
			cursor = page.nextCursor;
		} while (cursor);
		assert.deepStrictEqual({ pages, calls }, {
			pages: [
				{ scores: [100, 98, 95], ids: ['public-0', 'connectors-0', 'public-1'], total: 8 },
				{ scores: [90, 90, 85], ids: ['public-2', 'connectors-1', 'connectors-2'], total: 8 },
				{ scores: [80, 60], ids: ['public-3', 'public-4'], total: 8 },
			],
			calls: [
				{ id: 'public', cursor: undefined, pageSize: 3 },
				{ id: 'connectors', cursor: undefined, pageSize: 3 },
				{ id: 'public', cursor: '3', pageSize: 3 },
			],
		});
	});

	test('a 24-entry page remains globally capped across several native page boundaries', async () => {
		const sources = ['first', 'second', 'third'].map((id, index): ICustomizationMarketplaceSource => ({
			id, query: async options => {
				const offset = Number(options.cursor ?? 0);
				const items = Array.from({ length: Math.min(options.pageSize!, 35 - offset) }, (_, itemIndex) => ({
					...entry, identifier: `${id}-${offset + itemIndex}`, score: 100 - index - (offset + itemIndex) * 2,
				}));
				return { items, total: 35, nextCursor: offset + items.length < 35 ? String(offset + items.length) : undefined };
			},
		}));
		const service = new CustomizationMarketplaceService(sources);
		const options = { sourceIds: sources.map(source => source.id), query: 'mail', pageSize: 24 };
		const pages: ICustomizationMarketplacePage[] = [];
		let cursor: ICustomizationMarketplaceCursor | undefined;
		do {
			const page = await service.query({ ...options, cursor }, CancellationToken.None);
			pages.push(page);
			cursor = page.nextCursor;
		} while (cursor);
		const items = pages.flatMap(page => page.items);
		const scores = items.map(item => item.score!);
		assert.deepStrictEqual({
			lengths: pages.map(page => page.items.length),
			totals: pages.map(page => page.total),
			unique: new Set(items.map(getCustomizationMarketplaceResourceKey)).size,
			sorted: scores.every((score, index) => index === 0 || score <= scores[index - 1]),
		}, { lengths: [24, 24, 24, 24, 9], totals: [105, 105, 105, 105, 105], unique: 105, sorted: true });
	});

	test('backfills short source pages before emitting lower ranked buffered entries', async () => {
		const calls: string[] = [];
		const service = new CustomizationMarketplaceService([
			{ id: 'short', query: async options => {
				calls.push(options.cursor ?? 'first');
				return { items: [{ ...entry, score: options.cursor ? 90 : 100 }], nextCursor: options.cursor ? undefined : 'second' };
			} },
			{ id: 'other', query: async () => ({ items: [{ ...entry, score: 80 }, { ...entry, score: 70 }] }) },
		]);
		const options = { sourceIds: ['short', 'other'], query: 'mail', pageSize: 3 };
		const first = await service.query(options, CancellationToken.None);
		const second = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({ scores: [first, second].map(page => page.items.map(item => item.score)), calls, hasMore: !!second.nextCursor }, {
			scores: [[100, 90, 80], [70]], calls: ['first', 'second'], hasMore: false,
		});
	});

	test('search ranks unscored results last and breaks score ties by source order', async () => {
		const sources = [
			{ id: 'first', query: async () => ({ items: [{ ...entry, score: 90 }, entry] }) },
			{ id: 'second', query: async () => ({ items: [{ ...entry, score: 90 }, { ...entry, score: 0 }] }) },
		];
		const service = new CustomizationMarketplaceService(sources);
		const options = { sourceIds: ['first', 'second'] };
		const search = await service.query({ ...options, query: 'mail' }, CancellationToken.None);
		const browse = await service.query(options, CancellationToken.None);
		assert.deepStrictEqual([search, browse].map(page => page.items.map(item => [item.sourceId, item.score])), [
			[['first', 90], ['second', 90], ['first', undefined], ['second', 0]],
			[['first', 90], ['first', undefined], ['second', 90], ['second', 0]],
		]);
	});

	test('rejects invalid scores, out-of-order pages, and non-progressing continuations', async () => {
		for (const items of [[-1], [101], [NaN], [Infinity], [80, 90]]) {
			const service = new CustomizationMarketplaceService([{
				id: 'source', query: async () => ({ items: items.map(score => ({ ...entry, score })) }),
			}]);
			await assert.rejects(service.query({ sourceIds: ['source'], query: 'mail' }, CancellationToken.None), /invalid relevance ordering/);
		}
		for (const page of [
			{ items: [], nextCursor: 'next' },
			{ items: [entry], nextCursor: '' },
			{ items: [entry], total: -1 },
			{ items: [entry, entry] },
		]) {
			const service = new CustomizationMarketplaceService([{ id: 'source', query: async () => page }]);
			await assert.rejects(service.query({ sourceIds: ['source'], pageSize: 1 }, CancellationToken.None), /invalid page/);
		}
		const service = new CustomizationMarketplaceService([{
			id: 'source', query: async options => ({ items: [{ ...entry, score: options.cursor ? 100 : 90 }], nextCursor: options.cursor ? undefined : 'next' }),
		}]);
		const options = { sourceIds: ['source'], query: 'mail', pageSize: 1 };
		const first = await service.query(options, CancellationToken.None);
		await assert.rejects(service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None), /invalid relevance ordering/);
	});

	test('a failed continuation does not consume buffered entries and can be retried', async () => {
		let fail = true;
		const service = new CustomizationMarketplaceService([
			{ id: 'first', query: async options => {
				if (options.cursor && fail) {
					fail = false;
					throw new Error('temporary failure');
				}
				return { items: [{ ...entry, score: options.cursor ? 80 : 100 }], nextCursor: options.cursor ? undefined : 'next' };
			} },
			{ id: 'second', query: async () => ({ items: [{ ...entry, score: 90 }] }) },
		]);
		const options = { sourceIds: ['first', 'second'], query: 'mail', pageSize: 1 };
		const first = await service.query(options, CancellationToken.None);
		await assert.rejects(service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None), /temporary failure/);
		const second = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		const replay = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		const third = await service.query({ ...options, cursor: second.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual([first, second, replay, third].map(page => page.items.map(item => item.score)), [[100], [90], [90], [80]]);
	});

	test('cancelling a continuation preserves buffered results even if the source finishes late', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		const pending = new DeferredPromise<ICustomizationMarketplaceSourcePage>();
		let nextCalls = 0;
		const service = new CustomizationMarketplaceService([
			{ id: 'first', query: async options => {
				if (!options.cursor) {
					return { items: [{ ...entry, score: 100 }, { ...entry, score: 95 }], nextCursor: 'next' };
				}
				nextCalls++;
				return nextCalls === 1 ? pending.p : { items: [{ ...entry, score: 80 }] };
			} },
			{ id: 'second', query: async () => ({ items: [{ ...entry, score: 90 }] }) },
		]);
		const options = { sourceIds: ['first', 'second'], query: 'mail', pageSize: 2 };
		const first = await service.query(options, CancellationToken.None);
		const request = service.query({ ...options, cursor: first.nextCursor }, cancellation.token);
		const cancelled = assert.rejects(request, isCancellationError);
		cancellation.cancel();
		await cancelled;
		await pending.complete({ items: [{ ...entry, score: 80 }] });
		const retry = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({ scores: retry.items.map(item => item.score), nextCalls, hasMore: !!retry.nextCursor }, {
			scores: [90, 80], nextCalls: 2, hasMore: false,
		});
	});

	test('continuations expire and never accept caller-supplied buffered entries', async () => {
		await runWithFakedTimers({}, async () => {
			let calls = 0;
			const service = new CustomizationMarketplaceService([{
				id: 'source', query: async () => { calls++; return { items: [entry], nextCursor: 'next' }; },
			}]);
			const options = { sourceIds: ['source'], pageSize: 1 };
			const page = await service.query(options, CancellationToken.None);
			await assert.rejects(service.query({ ...options, cursor: { token: 'forged' } }, CancellationToken.None), /Start a new search/);
			await timeout(30 * 60_000);
			await assert.rejects(service.query({ ...options, cursor: page.nextCursor }, CancellationToken.None), /Start a new search/);
			assert.strictEqual(calls, 1);
		});
	});

	test('bounds retained continuations and rejects evicted cursors', async () => {
		const service = new CustomizationMarketplaceService([{
			id: 'source', query: async options => ({ items: [entry], nextCursor: options.cursor ? undefined : 'next' }),
		}]);
		const options = { sourceIds: ['source'], pageSize: 1 };
		const first = await service.query({ ...options, query: '0' }, CancellationToken.None);
		let latest = first;
		for (let index = 1; index <= 32; index++) {
			latest = await service.query({ ...options, query: String(index) }, CancellationToken.None);
		}
		await assert.rejects(service.query({ ...options, query: '0', cursor: first.nextCursor }, CancellationToken.None), /Start a new search/);
		const last = await service.query({ ...options, query: '32', cursor: latest.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual(last.items, [{ ...entry, sourceId: 'source' }]);
	});

	test('validates query bounds before calling sources and clamps page size consistently', async () => {
		const calls: ICustomizationMarketplaceSourceQuery[] = [];
		const service = new CustomizationMarketplaceService([{
			id: 'source', query: async options => {
				calls.push(options);
				return { items: [], total: 0 };
			},
		}]);
		const invalidQueries: ICustomizationMarketplaceQuery[] = [
			{ pageSize: 0 }, { pageSize: -1 }, { pageSize: 0.5 }, { pageSize: Infinity }, { pageSize: Number.MAX_SAFE_INTEGER + 1 },
			{ query: 'x'.repeat(4097) },
		];
		for (const options of invalidQueries) {
			await assert.rejects(service.query({ ...options, sourceIds: ['source'] }, CancellationToken.None), /query is invalid/);
		}
		await service.query({ sourceIds: ['source'] }, CancellationToken.None);
		await service.query({ sourceIds: ['source'], pageSize: 101 }, CancellationToken.None);
		assert.deepStrictEqual(calls, [
			{ query: '', mediaType: undefined, pageSize: 30, cursor: undefined },
			{ query: '', mediaType: undefined, pageSize: 100, cursor: undefined },
		]);
	});

	test('rejects duplicate and empty source IDs at registration', () => {
		const source: ICustomizationMarketplaceSource = { id: 'source', query: async () => ({ items: [] }) };
		assert.throws(() => new CustomizationMarketplaceService([source, source]), /unique, nonempty identifiers/);
		assert.throws(() => new CustomizationMarketplaceService([{ ...source, id: '' }]), /unique, nonempty identifiers/);
	});

	test('cancelled requests never call sources', async () => {
		let calls = 0;
		const service = new CustomizationMarketplaceService([{ id: 'source', query: async () => { calls++; return { items: [] }; } }]);
		await assert.rejects(service.query({ sourceIds: ['source'] }, CancellationToken.Cancelled), isCancellationError);
		assert.strictEqual(calls, 0);
	});

	test('cancellation rejects even an unresponsive source and reaches every active source', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		const pending = new DeferredPromise<ICustomizationMarketplaceSourcePage>();
		const tokens: CancellationToken[] = [];
		const sources = ['first', 'second'].map((id): ICustomizationMarketplaceSource => ({
			id, query: (_options, token) => {
				tokens.push(token);
				return pending.p;
			},
		}));
		const query = new CustomizationMarketplaceService(sources).query({ sourceIds: ['first', 'second'] }, cancellation.token);
		cancellation.cancel();
		await assert.rejects(query, isCancellationError);
		await pending.complete({ items: [] });
		assert.deepStrictEqual(tokens.map(token => token.isCancellationRequested), [true, true]);
	});

	test('a source failure rejects the page and cancels siblings instead of returning partial success', async () => {
		const error = new Error('The second catalog is unavailable');
		const pending = new DeferredPromise<ICustomizationMarketplaceSourcePage>();
		const calls: string[] = [];
		const tokens: CancellationToken[] = [];
		const sources = ['first', 'second'].map((id): ICustomizationMarketplaceSource => ({
			id, query: async (_options, token) => {
				calls.push(id);
				tokens.push(token);
				if (id === 'second') {
					throw error;
				}
				return pending.p;
			},
		}));
		await assert.rejects(new CustomizationMarketplaceService(sources).query({ sourceIds: ['first', 'second'] }, CancellationToken.None), actual => actual === error);
		await pending.complete({ items: [entry] });
		assert.deepStrictEqual({ calls, cancelled: tokens.map(token => token.isCancellationRequested) }, { calls: ['first', 'second'], cancelled: [true, true] });
	});

	test('only constructs and queries sources selected by the calling window', async () => {
		const creations: string[] = [];
		const calls: string[] = [];
		const sources = ['first', 'second'].map(id => createLazyCustomizationMarketplaceSource(id, () => {
			creations.push(id);
			return { query: async () => { calls.push(id); return { items: [entry], total: 1 }; } };
		}));
		const service = new CustomizationMarketplaceService(sources);
		await assert.rejects(service.query({ sourceIds: [] }, CancellationToken.None), isCancellationError);
		await assert.rejects(service.query({ sourceIds: ['first'] }, CancellationToken.Cancelled), isCancellationError);
		await assert.rejects(sources[0].query({}, CancellationToken.Cancelled), isCancellationError);
		for (const sourceIds of [['unknown'], ['first', 'first'], ['first', 'unknown']]) {
			await assert.rejects(service.query({ sourceIds }, CancellationToken.None), /query is invalid/);
		}
		const beforeQuery = [...creations];
		const second = await service.query({ sourceIds: ['second'] }, CancellationToken.None);
		const afterSecond = [...creations];
		await service.query({ sourceIds: ['first'] }, CancellationToken.None);
		await service.query({ sourceIds: ['second'] }, CancellationToken.None);
		assert.deepStrictEqual({ beforeQuery, afterSecond, creations, calls, page: second }, {
			beforeQuery: [], afterSecond: ['second'], creations: ['second', 'first'], calls: ['second', 'first', 'second'],
			page: { items: [{ ...entry, sourceId: 'second' }], total: 1, nextCursor: undefined },
		});
	});
});
