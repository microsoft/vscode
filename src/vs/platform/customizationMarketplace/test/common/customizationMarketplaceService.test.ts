/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createLazyCustomizationMarketplaceProvider, CustomizationMarketplaceMediaType, CustomizationMarketplaceService, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceCursor, ICustomizationMarketplaceEntry, ICustomizationMarketplacePage, ICustomizationMarketplaceProvider, ICustomizationMarketplaceQuery, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../common/customizationMarketplaceService.js';

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
		const sources = ['first', 'second'].map((id): ICustomizationMarketplaceProvider => ({
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
		const source = (id: string, hasMore: boolean): ICustomizationMarketplaceProvider => ({
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
		assert.deepStrictEqual({
			calls, pages: [first, second, third].map(page => ({
				items: page.items.map(item => item.sourceId), total: page.total, hasMore: !!page.nextCursor,
			}))
		}, {
			calls: [
				{ source: 'first', cursor: undefined },
				{ source: 'second', cursor: undefined },
				{ source: 'first', cursor: 'first/opaque+/=&token' },
			],
			pages: [
				{ items: ['first'], total: 3, hasMore: true },
				{ items: ['second'], total: 3, hasMore: true },
				{ items: ['first'], total: 3, hasMore: false },
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
		const sources = ['disabled', 'enabled'].map((id): ICustomizationMarketplaceProvider => ({
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
		const sources = ['first', 'second'].map((id): ICustomizationMarketplaceProvider => ({
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
		const source = (id: string, scores: readonly number[]): ICustomizationMarketplaceProvider => ({
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
				{ scores: [90, 90, 85], ids: ['connectors-1', 'public-2', 'connectors-2'], total: 8 },
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
		const sources = ['first', 'second', 'third'].map((id, index): ICustomizationMarketplaceProvider => ({
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
			{
				id: 'short', query: async options => {
					calls.push(options.cursor ?? 'first');
					return { items: [{ ...entry, score: options.cursor ? 90 : 100 }], nextCursor: options.cursor ? undefined : 'second' };
				}
			},
			{ id: 'other', query: async () => ({ items: [{ ...entry, score: 80 }, { ...entry, score: 70 }] }) },
		]);
		const options = { sourceIds: ['short', 'other'], query: 'mail', pageSize: 3 };
		const first = await service.query(options, CancellationToken.None);
		const second = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({ scores: [first, second].map(page => page.items.map(item => item.score)), calls, hasMore: !!second.nextCursor }, {
			scores: [[100, 90, 80], [70]], calls: ['first', 'second'], hasMore: false,
		});
	});

	test('search ranks unscored results last and rotates equal-score sources', async () => {
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
			[['first', 90], ['second', 90], ['first', undefined], ['second', 0]],
		]);
	});

	test('browse prioritizes custom entries and round-robins equal tiers across pages', async () => {
		const source = (id: string, priorities: readonly number[]): ICustomizationMarketplaceProvider => ({
			id,
			query: async options => {
				const offset = Number(options.cursor ?? 0);
				const items = priorities.slice(offset, offset + options.pageSize!).map((priority, index) => ({
					...entry, identifier: `${id}-${offset + index}`, priority,
				}));
				return { items, total: priorities.length, nextCursor: offset + items.length < priorities.length ? String(offset + items.length) : undefined };
			},
		});
		const service = new CustomizationMarketplaceService([
			source('public', [0, 0]),
			source('plugin', [1, 1, 0]),
			source('mcp', [1, 1]),
		]);
		const options = { sourceIds: ['public', 'plugin', 'mcp'], pageSize: 3 };
		const pages: ICustomizationMarketplacePage[] = [];
		let cursor: ICustomizationMarketplaceCursor | undefined;
		do {
			const page = await service.query({ ...options, cursor }, CancellationToken.None);
			pages.push(page);
			cursor = page.nextCursor;
		} while (cursor);
		assert.deepStrictEqual({
			pages: pages.map(page => page.items.map(item => item.identifier)),
			prioritiesAreInternal: pages.flatMap(page => page.items).every(item => !Object.hasOwn(item, 'priority')),
			totals: pages.map(page => page.total),
		}, {
			pages: [
				['plugin-0', 'mcp-0', 'plugin-1'],
				['mcp-1', 'public-0', 'plugin-2'],
				['public-1'],
			],
			prioritiesAreInternal: true,
			totals: [7, 7, 7],
		});
	});

	test('search retains relevance above feed priority and uses priority to break equal scores', async () => {
		const service = new CustomizationMarketplaceService([
			{ id: 'public', query: async () => ({ items: [{ ...entry, identifier: 'public-95', score: 95 }, { ...entry, identifier: 'public-90', score: 90 }] }) },
			{ id: 'custom', query: async () => ({ items: [{ ...entry, identifier: 'custom-90', score: 90, priority: 1 }] }) },
		]);
		const page = await service.query({ sourceIds: ['public', 'custom'], query: 'review', pageSize: 3 }, CancellationToken.None);
		assert.deepStrictEqual(page.items.map(item => item.identifier), ['public-95', 'custom-90', 'public-90']);
	});

	test('browsing interleaves feeds across page boundaries and backfills after one exhausts', async () => {
		const sources = ['first', 'second'].map((id, index): ICustomizationMarketplaceProvider => ({
			id, query: async options => {
				const total = index ? 3 : 5;
				const offset = Number(options.cursor ?? 0);
				const items = Array.from({ length: Math.min(options.pageSize!, total - offset) }, (_, itemIndex) => ({
					...entry, identifier: `${id}-${offset + itemIndex}`, score: offset + itemIndex,
				}));
				return { items, total, nextCursor: offset + items.length < total ? String(offset + items.length) : undefined };
			},
		}));
		const service = new CustomizationMarketplaceService(sources);
		const options = { sourceIds: sources.map(source => source.id), pageSize: 3 };
		const first = await service.query(options, CancellationToken.None);
		const second = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		const third = await service.query({ ...options, cursor: second.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({ ids: [first, second, third].map(page => page.items.map(item => item.identifier)), hasMore: !!third.nextCursor }, {
			ids: [
				['first-0', 'second-0', 'first-1'],
				['second-1', 'first-2', 'second-2'],
				['first-3', 'first-4'],
			],
			hasMore: false,
		});
	});

	test('rejects invalid scores or priorities, out-of-order pages, and non-progressing continuations', async () => {
		for (const items of [[-1], [101], [NaN], [Infinity], [80, 90]]) {
			const service = new CustomizationMarketplaceService([{
				id: 'source', query: async () => ({ items: items.map(score => ({ ...entry, score })) }),
			}]);
			await assert.rejects(service.query({ sourceIds: ['source'], query: 'mail' }, CancellationToken.None), /invalid relevance ordering/);
		}
		for (const priorities of [[-1], [11], [NaN], [0.5], [0, 1]]) {
			const service = new CustomizationMarketplaceService([{
				id: 'source', query: async () => ({ items: priorities.map(priority => ({ ...entry, priority })) }),
			}]);
			await assert.rejects(service.query({ sourceIds: ['source'] }, CancellationToken.None), /invalid priority ordering/);
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
			{
				id: 'first', query: async options => {
					if (options.cursor && fail) {
						fail = false;
						throw new Error('temporary failure');
					}
					return { items: [{ ...entry, score: options.cursor ? 80 : 100 }], nextCursor: options.cursor ? undefined : 'next' };
				}
			},
			{ id: 'second', query: async () => ({ items: [{ ...entry, score: 90 }] }) },
		]);
		const options = { sourceIds: ['first', 'second'], query: 'mail', pageSize: 1 };
		const first = await service.query(options, CancellationToken.None);
		const partial = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		const second = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		const replay = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		const third = await service.query({ ...options, cursor: second.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			scores: [first, partial, second, replay, third].map(page => page.items.map(item => item.score)),
			errors: partial.sourceErrors,
		}, {
			scores: [[100], [90], [90], [90], [80]],
			errors: [{ sourceId: 'first', message: 'temporary failure' }],
		});
	});

	test('cancelling a continuation preserves buffered results even if the source finishes late', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		const pending = new DeferredPromise<ICustomizationMarketplaceSourcePage>();
		let nextCalls = 0;
		const service = new CustomizationMarketplaceService([
			{
				id: 'first', query: async options => {
					if (!options.cursor) {
						return { items: [{ ...entry, score: 100 }, { ...entry, score: 95 }], nextCursor: 'next' };
					}
					nextCalls++;
					return nextCalls === 1 ? pending.p : { items: [{ ...entry, score: 80 }] };
				}
			},
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
		const source: ICustomizationMarketplaceProvider = { id: 'source', query: async () => ({ items: [] }) };
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
		const sources = ['first', 'second'].map((id): ICustomizationMarketplaceProvider => ({
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

	test('a source failure waits for healthy siblings and reports an explicit partial result', async () => {
		const error = new Error('The second catalog is unavailable');
		const pending = new DeferredPromise<ICustomizationMarketplaceSourcePage>();
		const calls: string[] = [];
		const tokens: CancellationToken[] = [];
		const sources = ['first', 'second'].map((id): ICustomizationMarketplaceProvider => ({
			id, query: async (_options, token) => {
				calls.push(id);
				tokens.push(token);
				if (id === 'second') {
					throw error;
				}
				return pending.p;
			},
		}));
		const query = new CustomizationMarketplaceService(sources).query({ sourceIds: ['first', 'second'] }, CancellationToken.None);
		await timeout(0);
		const cancelledWhileWaiting = tokens.map(token => token.isCancellationRequested);
		await pending.complete({ items: [entry] });
		const page = await query;
		assert.deepStrictEqual({ calls, cancelledWhileWaiting, page }, {
			calls: ['first', 'second'],
			cancelledWhileWaiting: [false, false],
			page: {
				items: [{ ...entry, sourceId: 'first' }],
				total: undefined,
				nextCursor: undefined,
				sourceErrors: [{ sourceId: 'second', message: error.message }],
			},
		});
	});

	test('only constructs and queries sources selected by the calling window', async () => {
		const creations: string[] = [];
		const calls: string[] = [];
		const sources = ['first', 'second'].map(id => createLazyCustomizationMarketplaceProvider(id, () => {
			creations.push(id);
			return { id, query: async () => { calls.push(id); return { items: [entry], total: 1 }; } };
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

	test('isolates an unavailable source while paginating healthy results with explicit warnings and unknown totals', async () => {
		let failedCalls = 0;
		const service = new CustomizationMarketplaceService([
			{
				id: 'healthy', query: async options => ({
					items: [{ ...entry, identifier: options.cursor ? 'second' : 'first', score: options.cursor ? 40 : 50 }],
					total: 2,
					nextCursor: options.cursor ? undefined : 'next',
				})
			},
			{
				id: 'failed', query: async () => {
					failedCalls++;
					throw new Error('Catalog unavailable');
				}
			},
		]);
		const options = { sourceIds: ['healthy', 'failed'], query: 'mail', pageSize: 1 };
		const first = await service.query(options, CancellationToken.None);
		const second = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({ ...second, firstIds: first.items.map(item => item.identifier), failedCalls }, {
			items: [{ ...entry, identifier: 'second', score: 40, sourceId: 'healthy' }],
			total: undefined,
			nextCursor: undefined,
			sourceErrors: [{ sourceId: 'failed', message: 'Catalog unavailable' }],
			firstIds: ['first'],
			failedCalls: 1,
		});
	});

	for (const query of ['', 'mail']) {
		test(`isolated ${query ? 'search' : 'browse'} failures preserve the global cap and never resume a source mid-continuation`, async () => {
			const catalog = Array.from({ length: 50 }, (_, index) => ({ ...entry, identifier: `healthy-${index}`, score: 90 - index }));
			let failures = 0;
			let failing = true;
			const service = new CustomizationMarketplaceService([
				{
					id: 'healthy', query: async options => {
						const offset = Number(options.cursor ?? 0);
						const items = catalog.slice(offset, offset + Math.min(5, options.pageSize!));
						return { items, total: catalog.length, nextCursor: offset + items.length < catalog.length ? String(offset + items.length) : undefined };
					}
				},
				{
					id: 'recovering', query: async () => {
						if (failing) {
							failures++;
							throw new Error('Temporarily unavailable');
						}
						return { items: [{ ...entry, identifier: 'recovered', score: 100 }], total: 1 };
					}
				},
			]);
			const options = { sourceIds: ['healthy', 'recovering'], query, pageSize: 24 };
			const first = await service.query(options, CancellationToken.None);
			failing = false;
			const second = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
			const last = await service.query({ ...options, cursor: second.nextCursor }, CancellationToken.None);
			const fresh = await service.query(options, CancellationToken.None);
			assert.deepStrictEqual({
				lengths: [first, second, last].map(page => page.items.length),
				ids: [first, second, last].flatMap(page => page.items.map(item => item.identifier)),
				errors: [first, second, last].map(page => page.sourceErrors),
				totals: [first, second, last].map(page => page.total),
				lastCursor: last.nextCursor,
				failures,
				freshIds: fresh.items.slice(0, 2).map(item => item.identifier),
				freshErrors: fresh.sourceErrors,
				freshTotal: fresh.total,
			}, {
				lengths: [24, 24, 2],
				ids: catalog.map(item => item.identifier),
				errors: Array.from({ length: 3 }, () => [{ sourceId: 'recovering', message: 'Temporarily unavailable' }]),
				totals: [undefined, undefined, undefined],
				lastCursor: undefined,
				failures: 1,
				freshIds: query ? ['recovered', 'healthy-0'] : ['healthy-0', 'recovered'],
				freshErrors: undefined,
				freshTotal: 51,
			});
		});
	}

	test('all source failures are explicit, incomplete, and exhausted', async () => {
		const sources = ['first', 'second'].map(id => ({ id, query: async () => { throw new Error(`${id} unavailable`); } }));
		const page = await new CustomizationMarketplaceService(sources).query({ sourceIds: sources.map(source => source.id) }, CancellationToken.None);
		assert.deepStrictEqual(page, {
			items: [],
			total: undefined,
			nextCursor: undefined,
			sourceErrors: sources.map(source => ({ sourceId: source.id, message: `${source.id} unavailable` })),
		});
	});

	test('partial native pages preserve fetched items and their warning while stopping the source', async () => {
		let calls = 0;
		const service = new CustomizationMarketplaceService([
			{
				id: 'partial', query: async () => {
					calls++;
					return { items: [{ ...entry, score: 80 }, { ...entry, score: 70 }], error: 'Later native page failed' };
				}
			},
			{ id: 'healthy', query: async () => ({ items: [{ ...entry, score: 100 }, { ...entry, score: 90 }], total: 2 }) },
		]);
		const options = { sourceIds: ['partial', 'healthy'], query: 'mail', pageSize: 2 };
		const first = await service.query(options, CancellationToken.None);
		const second = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			scores: [first, second].map(page => page.items.map(item => item.score)),
			errors: [first, second].map(page => page.sourceErrors),
			totals: [first.total, second.total],
			next: second.nextCursor,
			calls,
		}, {
			scores: [[100, 90], [80, 70]],
			errors: Array.from({ length: 2 }, () => [{ sourceId: 'partial', message: 'Later native page failed' }]),
			totals: [undefined, undefined],
			next: undefined,
			calls: 1,
		});

	});

	test('non-terminal source warnings persist while buffered entries and later native pages remain available', async () => {
		const cursors: (string | undefined)[] = [];
		const service = new CustomizationMarketplaceService([{
			id: 'partial',
			query: async options => {
				cursors.push(options.cursor);
				return options.cursor
					? { items: [{ ...entry, identifier: 'third', score: 60 }] }
					: {
						items: [{ ...entry, identifier: 'first', score: 80 }, { ...entry, identifier: 'second', score: 70 }],
						nextCursor: 'native-next',
						warning: 'Another marketplace is unavailable',
					};
			},
		}, {
			id: 'healthy',
			query: async () => ({ items: [{ ...entry, identifier: 'healthy-first', score: 100 }, { ...entry, identifier: 'healthy-second', score: 90 }], total: 2 }),
		}]);
		const options = { sourceIds: ['partial', 'healthy'], query: 'mail', pageSize: 2 };
		const first = await service.query(options, CancellationToken.None);
		const second = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		const third = await service.query({ ...options, cursor: second.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			items: [first, second, third].map(page => page.items.map(item => item.identifier)),
			errors: [first, second, third].map(page => page.sourceErrors),
			totals: [first, second, third].map(page => page.total),
			cursors,
		}, {
			items: [['healthy-first', 'healthy-second'], ['first', 'second'], ['third']],
			errors: Array.from({ length: 3 }, () => [{ sourceId: 'partial', message: 'Another marketplace is unavailable' }]),
			totals: [undefined, undefined, undefined],
			cursors: [undefined, 'native-next'],
		});
	});

	test('source cancellation is never converted into an unavailable-source warning', async () => {
		const pending = new DeferredPromise<ICustomizationMarketplaceSourcePage>();
		let siblingToken = CancellationToken.None;
		const service = new CustomizationMarketplaceService([
			{ id: 'cancelled', query: async () => { throw new CancellationError(); } },
			{ id: 'healthy', query: async (_options, token) => { siblingToken = token; return pending.p; } },
		]);
		await assert.rejects(service.query({ sourceIds: ['cancelled', 'healthy'] }, CancellationToken.None), isCancellationError);
		await pending.complete({ items: [entry] });
		assert.strictEqual(siblingToken.isCancellationRequested, true);
	});
	test('rejects a lazy provider whose ID differs from its registration', async () => {
		const provider = createLazyCustomizationMarketplaceProvider('registered', () => ({
			id: 'unexpected',
			query: async () => ({ items: [entry] }),
		}));
		await assert.rejects(provider.query({}, CancellationToken.None), /unexpected identifier/);
	});
});
