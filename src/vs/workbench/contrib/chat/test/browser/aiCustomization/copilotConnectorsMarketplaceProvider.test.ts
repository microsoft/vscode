/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceSourceQuery } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CopilotConnectorsMarketplaceProvider, ICopilotConnector, ICopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { ChatConfiguration } from '../../../common/constants.js';

suite('CopilotConnectorsMarketplaceProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function connector(name: string, overrides: Partial<ICopilotConnector> = {}): ICopilotConnector {
		return {
			name, displayName: 'Entry', description: '', tags: [], keywords: [], capabilities: [], representativeQueries: [],
			agents: [], commands: [], skills: [], connectionStatus: 'not_connected', scopes: [], mcpServers: [],
			...overrides,
		};
	}

	function createSource(connectors: readonly ICopilotConnector[], enabled = true) {
		const calls: CancellationToken[] = [];
		const configuration = new TestConfigurationService({ [ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled]: enabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const service = new class extends mock<ICopilotConnectorsService>() {
			override connectors = connectors;
			cacheToken = CancellationToken.None;
			override async getConnectorsSnapshot(token: CancellationToken) {
				calls.push(token);
				return { connectors: this.connectors, cacheToken: this.cacheToken };
			}
		}();
		return { source: new CopilotConnectorsMarketplaceProvider(service, configuration), service, calls, configuration };
	}

	test('ranks exact names, prefixes, substrings, fuzzy names, keywords, and descriptions in distinct bands', async () => {
		const { source } = createSource([
			connector('id-9', { representativeQueries: ['Search Mail'] }),
			connector('id-8', { description: 'Mail' }),
			connector('id-7', { capabilities: ['Search Mail'] }),
			connector('id-6', { tags: ['Mail services'] }),
			connector('id-5', { keywords: ['Mail'] }),
			connector('id-4', { displayName: 'Messaging And Inbox Links' }),
			connector('id-3', { displayName: 'Acme Mail Tools' }),
			connector('id-2', { displayName: 'Mail Tools' }),
			connector('id-1', { displayName: 'Mail' }),
		]);
		const page = await source.query({ query: 'mail' }, CancellationToken.None);
		assert.deepStrictEqual(page.items.map(item => [item.identifier, item.score]), [
			['id-1', 100], ['id-2', 90], ['id-3', 85], ['id-4', 72],
			['id-5', 65], ['id-6', 60], ['id-7', 55], ['id-8', 35], ['id-9', 25],
		]);
	});

	test('case folding and camel-case abbreviations use the complete query', async () => {
		const { source } = createSource([connector('id-1', { displayName: 'WorkIQMail' })]);
		const results = [];
		for (const query of ['WorkIQMail', 'workiqmail', 'WORKIQMAIL', 'WIM', 'wim', 'wixm']) {
			const page = await source.query({ query }, CancellationToken.None);
			results.push(page.items.map(item => item.score));
		}
		assert.deepStrictEqual(results, [[100], [100], [100], [74], [74], []]);
	});

	test('every word must match, possibly in different fields and in a different order', async () => {
		const { source } = createSource([connector('id-1', { displayName: 'Mail', capabilities: ['Calendar'] })]);
		const results = [];
		for (const query of ['MAIL calendar', ' calendar   MAIL ', 'mail calendar nonexistent']) {
			const page = await source.query({ query }, CancellationToken.None);
			results.push(page.items.map(item => item.score));
		}
		assert.deepStrictEqual(results, [[80], [80], []]);
	});

	test('complete multi-word names outrank partial names and descriptive matches', async () => {
		const { source } = createSource([
			connector('id-3', { description: 'Search Work IQ Mail' }),
			connector('id-2', { displayName: 'Work IQ Mail Tools' }),
			connector('id-1', { displayName: 'Work IQ Mail' }),
		]);
		const page = await source.query({ query: 'Work IQ Mail' }, CancellationToken.None);
		assert.deepStrictEqual(page.items.map(item => [item.identifier, item.score]), [
			['id-1', 100], ['id-2', 87], ['id-3', 25],
		]);
	});

	test('matches names and all searchable metadata, including the last keyword and example query', async () => {
		const { source } = createSource([
			connector('mail'),
			connector('id-2', { keywords: [...Array.from({ length: 31 }, () => 'other'), 'mail'] }),
			connector('id-3', { capabilities: ['mail'] }),
			connector('id-4', { tags: ['mail'] }),
			connector('id-5', { description: 'mail' }),
			connector('id-6', { representativeQueries: [...Array.from({ length: 31 }, () => 'other'), 'mail'] }),
		]);
		const page = await source.query({ query: 'mail' }, CancellationToken.None);
		assert.deepStrictEqual(page.items.map(item => [item.identifier, item.score]), [
			['mail', 100], ['id-2', 65], ['id-3', 65], ['id-4', 65], ['id-5', 35], ['id-6', 35],
		]);
	});

	test('searches the ends of long fields and fuzzy matches across window boundaries', async () => {
		const { source } = createSource([
			connector('id-1', { description: `${'x'.repeat(4000)} WorkIQMail` }),
			connector('id-2', { representativeQueries: [`${'x'.repeat(500)} WorkIQMail`] }),
			connector('id-3', { keywords: [`${'x'.repeat(124)} WorkIQMail`] }),
		]);
		const contiguous = await source.query({ query: 'WorkIQMail' }, CancellationToken.None);
		const fuzzy = await source.query({ query: 'wim' }, CancellationToken.None);
		assert.deepStrictEqual({
			contiguous: contiguous.items.map(item => [item.identifier, item.score]),
			fuzzy: fuzzy.items.map(item => [item.identifier, item.score]),
		}, {
			contiguous: [['id-3', 55], ['id-1', 25], ['id-2', 25]],
			fuzzy: [['id-3', 44], ['id-1', 14], ['id-2', 14]],
		});
	});

	test('long words require their full contiguous match rather than a truncated fuzzy prefix', async () => {
		const name = 'a'.repeat(129);
		const { source } = createSource([connector(name)]);
		const exact = await source.query({ query: name }, CancellationToken.None);
		const nonmatch = await source.query({ query: `${'a'.repeat(128)}z` }, CancellationToken.None);
		assert.deepStrictEqual({
			exact: exact.items.map(item => item.score),
			nonmatch: nonmatch.items,
		}, {
			exact: [100],
			nonmatch: [],
		});
	});

	test('rejects oversized queries and invalid pagination before catalog access', async () => {
		const { source, calls } = createSource([connector('mail')]);
		const invalid: ICustomizationMarketplaceSourceQuery[] = [
			{ query: `${'mail '.repeat(51)}zz` },
			{ query: Array.from({ length: 17 }, () => 'mail').join(' ') },
			{ pageSize: 0 }, { pageSize: NaN }, { pageSize: 1.5 }, { cursor: 'invalid' },
		];
		for (const options of invalid) {
			await assert.rejects(source.query(options, CancellationToken.None), /Copilot connectors|connectors page/);
		}
		assert.deepStrictEqual(calls, []);
	});

	test('sorts the complete catalog before pagination and keeps native order for equal scores', async () => {
		const connectors = [
			connector('id-6', { description: 'Search Mail' }),
			connector('id-5', { tags: ['Mail'] }),
			connector('id-3', { displayName: 'Mail B' }),
			connector('id-4', { displayName: 'Acme Mail' }),
			connector('id-2', { displayName: 'Mail A' }),
			connector('id-1', { displayName: 'Mail' }),
		];
		const { source } = createSource(connectors);
		const first = await source.query({ query: 'mail', pageSize: 2 }, CancellationToken.None);
		const second = await source.query({ query: 'mail', pageSize: 2, cursor: first.nextCursor }, CancellationToken.None);
		const third = await source.query({ query: 'mail', pageSize: 2, cursor: second.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			pages: [first, second, third].map(page => ({
				items: page.items.map(item => [item.identifier, item.score]), total: page.total, hasMore: !!page.nextCursor,
			})),
			nativeOrder: connectors.map(connector => connector.name),
		}, {
			pages: [
				{ items: [['id-1', 100], ['id-3', 90]], total: 6, hasMore: true },
				{ items: [['id-2', 90], ['id-4', 85]], total: 6, hasMore: true },
				{ items: [['id-5', 65], ['id-6', 25]], total: 6, hasMore: false },
			],
			nativeOrder: ['id-6', 'id-5', 'id-3', 'id-4', 'id-2', 'id-1'],
		});
	});

	test('queryless browsing retains native order and does not invent quality scores', async () => {
		const { source } = createSource([connector('z'), connector('a'), connector('m')]);
		const first = await source.query({ query: ' \t ', pageSize: 2 }, CancellationToken.None);
		const second = await source.query({ cursor: first.nextCursor, pageSize: 2 }, CancellationToken.None);
		assert.deepStrictEqual([first, second].map(page => page.items.map(item => [item.identifier, item.score])), [
			[['z', undefined], ['a', undefined]], [['m', undefined]],
		]);
	});

	for (const query of [undefined, 'mail']) {
		test(`pins ${query ? 'ranked' : 'browsing'} metadata and totals when the catalog changes between pages`, async () => {
			const original = [
				connector('description', { description: 'Search Mail' }),
				connector('keyword', { keywords: ['Mail'] }),
				connector('prefix-a', { displayName: 'Mail Alpha' }),
				connector('prefix-b', { displayName: 'Mail Beta' }),
				connector('exact', { displayName: 'Mail' }),
			];
			const fixture = createSource(original);
			const options = { query, pageSize: 2 };
			const first = await fixture.source.query(options, CancellationToken.None);
			fixture.service.connectors = [
				connector('new', { displayName: 'Mail' }),
				connector('description', { displayName: 'Mail' }),
				connector('prefix-a', { description: 'Mail' }),
			];
			const second = await fixture.source.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
			const third = await fixture.source.query({ ...options, cursor: second.nextCursor }, CancellationToken.None);
			const replay = await fixture.source.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
			const readsBeforeNewSearch = fixture.calls.length;
			const fresh = await fixture.source.query(options, CancellationToken.None);
			assert.deepStrictEqual({
				originalPages: [first, second, third].flatMap(page => page.items.map(item => [item.identifier, item.score])),
				totals: [first, second, third, replay, fresh].map(page => page.total),
				replay: replay.items,
				fresh: fresh.items.map(item => [item.identifier, item.score]),
				reads: [readsBeforeNewSearch, fixture.calls.length],
			}, {
				originalPages: query ? [['exact', 100], ['prefix-a', 90], ['prefix-b', 90], ['keyword', 65], ['description', 25]] : original.map(item => [item.name, undefined]),
				totals: [5, 5, 5, 5, 3],
				replay: second.items,
				fresh: [['new', query ? 100 : undefined], ['description', query ? 100 : undefined]],
				reads: [1, 2],
			});
		});
	}

	test('binds native continuations to their source instance, query, type, and page size', async () => {
		const fixture = createSource([connector('mail'), connector('mail-two')]);
		const options = { query: 'mail', pageSize: 1 };
		const first = await fixture.source.query(options, CancellationToken.None);
		for (const change of [{ query: 'other' }, { pageSize: 2 }, { mediaType: CustomizationMarketplaceMediaType.McpServer }, { cursor: '1' }]) {
			await assert.rejects(fixture.source.query({ ...options, cursor: first.nextCursor, ...change }, CancellationToken.None), /Start a new search/);
		}
		const other = createSource([]);
		await assert.rejects(other.source.query({ ...options, cursor: first.nextCursor }, CancellationToken.None), /Start a new search/);
		const retry = await fixture.source.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({ ids: retry.items.map(item => item.identifier), reads: [fixture.calls.length, other.calls.length] }, { ids: ['mail-two'], reads: [1, 0] });
	});

	test('cancelling a continuation does not consume its snapshot', async () => {
		const fixture = createSource([connector('first'), connector('second')]);
		const first = await fixture.source.query({ pageSize: 1 }, CancellationToken.None);
		const options = { pageSize: 1, cursor: first.nextCursor };
		await assert.rejects(fixture.source.query(options, CancellationToken.Cancelled), isCancellationError);
		const retry = await fixture.source.query(options, CancellationToken.None);
		assert.deepStrictEqual({ ids: retry.items.map(item => item.identifier), reads: fixture.calls.length }, { ids: ['second'], reads: 1 });
	});

	test('refuses invalidated snapshots without consulting the new catalog', async () => {
		const fixture = createSource([connector('first'), connector('second')]);
		const context = store.add(new CancellationTokenSource());
		fixture.service.cacheToken = context.token;
		const first = await fixture.source.query({ pageSize: 1 }, CancellationToken.None);
		context.cancel();
		fixture.service.cacheToken = CancellationToken.None;
		fixture.service.connectors = [connector('new-account')];
		await assert.rejects(fixture.source.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None), /Start a new search/);
		const fresh = await fixture.source.query({}, CancellationToken.None);
		assert.deepStrictEqual({ ids: fresh.items.map(item => item.identifier), reads: fixture.calls.length }, { ids: ['new-account'], reads: 2 });
	});

	test('expires source-owned continuation snapshots after thirty minutes', async () => {
		await runWithFakedTimers({}, async () => {
			const fixture = createSource([connector('first'), connector('second')]);
			const first = await fixture.source.query({ pageSize: 1 }, CancellationToken.None);
			await timeout(30 * 60_000);
			await assert.rejects(fixture.source.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None), /Start a new search/);
			assert.strictEqual(fixture.calls.length, 1);
		});
	});

	test('bounds native continuations to thirty-two LRU entries', async () => {
		const fixture = createSource([connector('first'), connector('second')]);
		const cursors: string[] = [];
		for (let index = 0; index < 32; index++) {
			const page = await fixture.source.query({ pageSize: 1 }, CancellationToken.None);
			assert.ok(page.nextCursor);
			cursors.push(page.nextCursor);
		}
		await fixture.source.query({ pageSize: 1, cursor: cursors[0] }, CancellationToken.None);
		await fixture.source.query({ pageSize: 1 }, CancellationToken.None);
		await assert.rejects(fixture.source.query({ pageSize: 1, cursor: cursors[1] }, CancellationToken.None), /Start a new search/);
		const retained = await fixture.source.query({ pageSize: 1, cursor: cursors[0] }, CancellationToken.None);
		assert.deepStrictEqual({ ids: retained.items.map(item => item.identifier), reads: fixture.calls.length }, { ids: ['second'], reads: 33 });
	});

	test('does not access disabled or incompatible sources, or start already cancelled requests', async () => {
		const disabled = createSource([], false);
		const enabled = createSource([]);
		await disabled.source.query({}, CancellationToken.None);
		await enabled.source.query({ mediaType: CustomizationMarketplaceMediaType.Skill }, CancellationToken.None);
		await assert.rejects(enabled.source.query({}, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual([disabled.calls, enabled.calls], [[], []]);
	});

	test('cancellation discards an unresponsive catalog response', async () => {
		const configuration = new TestConfigurationService({ [ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const response = new DeferredPromise<readonly ICopilotConnector[]>();
		const service = new class extends mock<ICopilotConnectorsService>() {
			override async getConnectorsSnapshot() { return { connectors: await response.p, cacheToken: CancellationToken.None }; }
		}();
		const source = new CopilotConnectorsMarketplaceProvider(service, configuration);
		const cancellation = store.add(new CancellationTokenSource());
		const result = source.query({ query: 'mail' }, cancellation.token);
		const cancelled = assert.rejects(result, isCancellationError);
		cancellation.cancel();
		await cancelled;
		await response.complete([connector('mail')]);
	});
});
