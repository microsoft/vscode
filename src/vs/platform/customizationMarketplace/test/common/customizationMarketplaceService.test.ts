/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceService, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceEntry, ICustomizationMarketplaceQuery, ICustomizationMarketplaceSource, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../common/customizationMarketplaceService.js';

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
		const page = await new CustomizationMarketplaceService(sources).query(options, CancellationToken.None);
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
		const first = await service.query({ pageSize: 1 }, CancellationToken.None);
		const second = await service.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({ calls, firstCursor: first.nextCursor, second }, {
			calls: [
				{ source: 'first', cursor: undefined },
				{ source: 'second', cursor: undefined },
				{ source: 'first', cursor: 'first/opaque+/=&token' },
			],
			firstCursor: {
				query: '', mediaType: undefined, pageSize: 1,
				sources: [
					{ id: 'first', cursor: 'first/opaque+/=&token', total: 2 },
					{ id: 'second', cursor: undefined, total: 1 },
				],
			},
			second: { items: [{ ...entry, sourceId: 'first' }], total: 3, nextCursor: undefined },
		});
	});

	test('does not invent a total when an exhausted source did not report one', async () => {
		const service = new CustomizationMarketplaceService([
			{ id: 'unknown', query: async () => ({ items: [entry] }) },
			{ id: 'known', query: async options => ({ items: [entry], total: 2, nextCursor: options.cursor ? undefined : 'next' }) },
		]);
		const first = await service.query({}, CancellationToken.None);
		const second = await service.query({ cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual([first.total, second.total, second.items.map(item => item.sourceId), second.nextCursor], [undefined, undefined, ['known'], undefined]);
	});

	test('does not fabricate installation provenance or reinterpret source metadata', async () => {
		const installation = { kind: 'plugin', repository: 'owner/repo', ref: 'release/next', path: 'plugins/demo' } as const;
		const entries = [entry, { ...entry, version: '2.0', installation }];
		const page = await new CustomizationMarketplaceService([
			{ id: 'catalog', query: async () => ({ items: entries }) },
		]).query({}, CancellationToken.None);
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
		const options = { query: 'review', mediaType: CustomizationMarketplaceMediaType.Skill, pageSize: 24 };
		const page = await service.query(options, CancellationToken.None);
		for (const change of [{ query: '' }, { query: 'another' }, { mediaType: CustomizationMarketplaceMediaType.McpServer }, { pageSize: 12 }]) {
			await assert.rejects(service.query({ ...options, ...change, cursor: page.nextCursor }, CancellationToken.None), /Start a new search/);
		}
		for (const changedSources of [[...sources].reverse(), sources.slice(1), [...sources, { id: 'third', query: sources[0].query }]]) {
			await assert.rejects(new CustomizationMarketplaceService(changedSources).query({ ...options, cursor: page.nextCursor }, CancellationToken.None), /Start a new search/);
		}
		assert.deepStrictEqual(calls, ['first', 'second']);
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
			await assert.rejects(service.query(options, CancellationToken.None), /query is invalid/);
		}
		await service.query({}, CancellationToken.None);
		await service.query({ pageSize: 101 }, CancellationToken.None);
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
		await assert.rejects(service.query({}, CancellationToken.Cancelled), isCancellationError);
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
		const query = new CustomizationMarketplaceService(sources).query({}, cancellation.token);
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
		await assert.rejects(new CustomizationMarketplaceService(sources).query({}, CancellationToken.None), actual => actual === error);
		await pending.complete({ items: [entry] });
		assert.deepStrictEqual({ calls, cancelled: tokens.map(token => token.isCancellationRequested) }, { calls: ['first', 'second'], cancelled: [true, true] });
	});
});
