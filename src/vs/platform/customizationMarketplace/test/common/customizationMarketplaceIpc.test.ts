/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME, CustomizationMarketplaceChannel, CustomizationMarketplaceChannelClient } from '../../common/customizationMarketplaceIpc.js';
import { CustomizationMarketplaceInstallation, CustomizationMarketplaceMediaType, CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceQueryService, ICustomizationMarketplaceRequest, ICustomizationMarketplaceSourceInfo } from '../../common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration } from '../../common/customizationMarketplaceSources.js';

suite('CustomizationMarketplaceIpc', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createClient(service: ICustomizationMarketplaceQueryService, sources: readonly ICustomizationMarketplaceSourceInfo[] = [{ id: 'agentFinder', enablementSetting: CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled }]): CustomizationMarketplaceChannelClient {
		const server = new CustomizationMarketplaceChannel(() => service);
		const channel: IChannel = {
			async call<T>(command: string, options?: ICustomizationMarketplaceRequest, token?: CancellationToken): Promise<T> {
				return JSON.parse(JSON.stringify(await server.call<ICustomizationMarketplacePage>('test', command, options, token)));
			},
			listen<T>(event: string): Event<T> {
				return server.listen('test', event);
			},
		};
		const configuration = new TestConfigurationService(Object.fromEntries(sources.map(source => [source.enablementSetting, true])));
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		return new class extends CustomizationMarketplaceChannelClient {
			override readonly sources = sources;
		}(channel, configuration);
	}

	test('does not construct the shared-process catalog service until an uncancelled query', async () => {
		let constructed = 0;
		let queried = 0;
		const server = new CustomizationMarketplaceChannel(() => {
			constructed++;
			return {
				async query() { queried++; return { items: [] }; },
			};
		});
		const afterRegistration = constructed;
		assert.throws(() => server.call('test', 'invalid'), /Invalid call/);
		assert.throws(() => server.listen('test', 'invalid'), /Invalid listen/);
		await assert.rejects(server.call('test', 'query', { sourceIds: ['agentFinder'] }, CancellationToken.Cancelled), isCancellationError);
		await assert.rejects(server.call('test', 'query'), isCancellationError);
		await assert.rejects(server.call('test', 'query', { sourceIds: [] }), isCancellationError);
		const afterIgnoredCalls = constructed;
		await server.call('test', 'query', { sourceIds: ['agentFinder'] });
		await server.call('test', 'query', { sourceIds: ['agentFinder'] });

		assert.deepStrictEqual({ afterRegistration, afterIgnoredCalls, constructed, queried }, {
			afterRegistration: 0, afterIgnoredCalls: 0, constructed: 1, queried: 2,
		});
	});

	test('disabled or unset sources prevent renderer IPC calls regardless of the former marketplace flags', async () => {
		let calls = 0;
		const channel: IChannel = {
			async call() { calls++; throw new Error('The disabled client must not call IPC'); },
			listen: () => Event.None,
		};
		for (const enabled of [undefined, false]) {
			const configuration = new TestConfigurationService({
				[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: enabled,
				'chat.agentFinder.enabled': true,
				'chat.customizations.unifiedMarketplace.enabled': true,
			});
			disposables.add(configuration.onDidChangeConfigurationEmitter);
			const client = new CustomizationMarketplaceChannelClient(channel, configuration);
			await assert.rejects(client.query({}, CancellationToken.None), isCancellationError);
		}
		assert.strictEqual(calls, 0);
	});

	test('uses the source-neutral marketplace channel name', () => {
		assert.strictEqual(CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME, 'customizationMarketplace');
	});

	test('each window sends only its enabled source IDs and cancels its own requests', async () => {
		const secondSetting = 'test.marketplace.second.enabled';
		const requests: { options: ICustomizationMarketplaceRequest; token: CancellationToken; result: DeferredPromise<ICustomizationMarketplacePage> }[] = [];
		const server = new CustomizationMarketplaceChannel(() => ({
			query(options, token) {
				const result = new DeferredPromise<ICustomizationMarketplacePage>();
				requests.push({ options, token, result });
				return result.p;
			},
		}));
		const channel: IChannel = {
			call: (command, options, token) => server.call('test', command, options, token),
			listen: () => Event.None,
		};
		class TestChannelClient extends CustomizationMarketplaceChannelClient {
			override readonly sources = [
				{ id: 'agentFinder', enablementSetting: CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled },
				{ id: 'second', enablementSetting: secondSetting },
			];
		}
		const firstConfiguration = new TestConfigurationService({ [CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true });
		const secondConfiguration = new TestConfigurationService({ [secondSetting]: true });
		disposables.add(firstConfiguration.onDidChangeConfigurationEmitter);
		disposables.add(secondConfiguration.onDidChangeConfigurationEmitter);
		const first = new TestChannelClient(channel, firstConfiguration).query({}, CancellationToken.None);
		const second = new TestChannelClient(channel, secondConfiguration).query({}, CancellationToken.None);
		const cancelled = assert.rejects(first, isCancellationError);
		await firstConfiguration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		firstConfiguration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled; }
		}());
		await cancelled;
		const cancellationBeforeResults = requests.map(request => request.token.isCancellationRequested);
		await requests[0].result.complete({ items: [], total: 1 });
		await requests[1].result.complete({ items: [], total: 2 });
		assert.deepStrictEqual({ options: requests.map(request => request.options), cancellationBeforeResults, second: await second }, {
			options: [{ sourceIds: ['agentFinder'] }, { sourceIds: ['second'] }],
			cancellationBeforeResults: [true, false], second: { items: [], total: 2 },
		});
	});

	test('forwards browse and search options and cancellation tokens', async () => {
		const source = disposables.add(new CancellationTokenSource());
		const calls: { options: ICustomizationMarketplaceRequest; token: CancellationToken }[] = [];
		const client = createClient({
			async query(options, token) {
				calls.push({ options, token });
				return { items: [] };
			},
		});
		const queries: ICustomizationMarketplaceQuery[] = [
			{
				mediaType: CustomizationMarketplaceMediaType.McpServer, pageSize: 24,
				cursor: { token: 'browse-page-2' },
			},
			{
				query: 'postgres', mediaType: CustomizationMarketplaceMediaType.Skill, pageSize: 2,
				cursor: { token: 'opaque+/=&token' },
			},
		];
		for (const query of queries) {
			await client.query(query, source.token);
		}

		assert.deepStrictEqual({
			options: calls.map(call => call.options),
			requestsDisposed: calls.map(call => call.token.isCancellationRequested),
			callerCancelled: source.token.isCancellationRequested,
		}, {
			options: queries.map(options => ({ ...options, sourceIds: ['agentFinder'] })),
			requestsDisposed: [true, true],
			callerCancelled: false,
		});
	});

	test('defaults missing cancellation to none for an explicitly selected source', async () => {
		const calls: { options: ICustomizationMarketplaceQuery; token: CancellationToken }[] = [];
		const server = new CustomizationMarketplaceChannel(() => ({
			async query(options, token) {
				calls.push({ options, token });
				return { items: [] };
			},
		}));
		await server.call('test', 'query', { sourceIds: ['agentFinder'] });

		assert.deepStrictEqual(calls, [{ options: { sourceIds: ['agentFinder'] }, token: CancellationToken.None }]);
	});

	test('cancellation reaches the service through both channel adapters', async () => {
		const source = disposables.add(new CancellationTokenSource());
		let receivedToken: CancellationToken | undefined;
		const client = createClient({
			query(_options, token) {
				receivedToken = token;
				return raceCancellationError(new Promise<ICustomizationMarketplacePage>(() => { }), token);
			},
		});
		const pending = client.query({ query: 'postgres' }, source.token);
		source.cancel();

		await assert.rejects(pending, isCancellationError);
		assert.strictEqual(receivedToken?.isCancellationRequested, true);
	});

	test('revives all URI fields and preserves original external URL encoding and pagination', async () => {
		const externalUrl = 'https://api.mcp.github.com/oss/v0.1/servers/io.github.pgEdge%2Fpostgres-mcp/versions/latest?value=a%2Bb';
		const page: ICustomizationMarketplacePage = {
			items: [{
				sourceId: 'testSource',
				identifier: 'postgres',
				displayName: 'Postgres',
				description: 'Postgres discovery resource',
				mediaType: CustomizationMarketplaceMediaType.McpServer,
				tags: ['postgres'],
				capabilities: ['query'],
				representativeQueries: ['query postgres'],
				url: URI.parse(externalUrl),
				externalUrl,
				repository: URI.parse('https://github.com/Owner/Repository'),
				icon: URI.parse('https://github.com/Owner.png?size=64'),
				publisher: 'Owner',
				version: '1.0',
				score: 95,
			}],
			total: 10,
			nextCursor: { token: 'opaque+/=&token' },
		};
		const client = createClient({ query: async () => page });
		const result = await client.query({ query: 'postgres' }, CancellationToken.None);

		assert.deepStrictEqual({
			page: result,
			uriInstances: [result.items[0].url, result.items[0].repository, result.items[0].icon].map(uri => uri instanceof URI),
			externalUrl: result.items[0].externalUrl,
		}, {
			page,
			uriInstances: [true, true, true],
			externalUrl,
		});
	});

	test('does not fabricate absent URI fields or a search total', async () => {
		const page: ICustomizationMarketplacePage = {
			items: [{
				sourceId: 'testSource',
				identifier: 'test',
				displayName: 'Test',
				description: '',
				mediaType: CustomizationMarketplaceMediaType.Skill,
				tags: [],
				capabilities: [],
				representativeQueries: [],
			}],
			nextCursor: { token: 'next-page' },
		};
		const client = createClient({ query: async () => page });

		assert.deepStrictEqual(await client.query({}, CancellationToken.None), page);
	});

	test('continues a ranked merge across IPC without serializing buffered source entries', async () => {
		let calls = 0;
		const sources = ['agentFinder', 'other'].map((id, index) => ({
			id,
			query: async () => {
				calls++;
				return { items: (index ? [90, 80] : [100, 70]).map(score => ({
					identifier: String(score), displayName: id, description: '', score,
					mediaType: CustomizationMarketplaceMediaType.Skill,
					tags: [], capabilities: [], representativeQueries: [],
					repository: URI.parse('https://github.com/owner/repository'),
				})), total: 2 };
			},
		}));
		const client = createClient(new CustomizationMarketplaceService(sources), sources.map(source => ({
			id: source.id, enablementSetting: `test.${source.id}.enabled`,
		})));
		const options = { query: 'review', pageSize: 2 };
		const first = await client.query(options, CancellationToken.None);
		const second = await client.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			scores: [first, second].map(page => page.items.map(item => item.score)),
			cursorFields: Object.keys(first.nextCursor!),
			revived: second.items.every(item => item.repository instanceof URI),
			calls, hasMore: !!second.nextCursor,
		}, {
			scores: [[100, 90], [80, 70]], cursorFields: ['token'], revived: true, calls: 2, hasMore: false,
		});
	});

	test('preserves installation provenance, root paths and exact refs through IPC', async () => {
		const installations: CustomizationMarketplaceInstallation[] = [
			{ kind: 'skill', repository: 'ChromeDevTools/chrome-devtools-mcp', ref: 'release/next', path: 'skills/a11y-debugging' },
			{ kind: 'plugin', repository: 'JetBrains/go-modern-guidelines', ref: 'v1.2.3', path: '' },
			{ kind: 'mcp', name: 'ai.bittlebits/bittlebits' },
		];
		const page: ICustomizationMarketplacePage = {
			items: installations.map(installation => ({
				sourceId: 'testSource',
				identifier: installation.kind,
				displayName: installation.kind,
				description: '',
				mediaType: CustomizationMarketplaceMediaType.Skill,
				tags: [],
				capabilities: [],
				representativeQueries: [],
				installation,
			})),
		};
		const client = createClient({ query: async () => page });
		const result = await client.query({}, CancellationToken.None);

		assert.deepStrictEqual(result.items.map(item => item.installation), installations);
	});

	test('propagates service errors without falling back or retrying', async () => {
		let calls = 0;
		const client = createClient({
			async query() {
				calls++;
				throw new Error('The customization catalog is receiving too many requests. Try again later.');
			},
		});
		await assert.rejects(client.query({}, CancellationToken.None), {
			message: 'The customization catalog is receiving too many requests. Try again later.',
		});
		assert.strictEqual(calls, 1);
	});

	test('rejects unsupported commands and events without invoking the service', () => {
		let calls = 0;
		const server = new CustomizationMarketplaceChannel(() => ({
			async query() {
				calls++;
				return { items: [] };
			},
		}));
		for (const command of ['request', 'fetch', 'install', 'unknown', 'constructor', '__proto__']) {
			assert.throws(() => server.call('test', command, { sourceIds: ['agentFinder'], query: 'postgres' }), /Invalid call/);
		}
		assert.throws(() => server.listen('test', 'onDidChange'), /Invalid listen/);
		assert.strictEqual(calls, 0);
	});
});
