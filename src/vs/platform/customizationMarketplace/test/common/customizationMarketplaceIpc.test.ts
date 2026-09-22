/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME, CustomizationMarketplaceChannel, CustomizationMarketplaceChannelClient } from '../../common/customizationMarketplaceIpc.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceInstallation, CustomizationMarketplaceMediaType, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService } from '../../common/customizationMarketplaceService.js';

suite('CustomizationMarketplaceIpc', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createClient(service: ICustomizationMarketplaceService): CustomizationMarketplaceChannelClient {
		const server = new CustomizationMarketplaceChannel(() => service);
		const channel: IChannel = {
			async call<T>(command: string, options?: ICustomizationMarketplaceQuery, token?: CancellationToken): Promise<T> {
				return JSON.parse(JSON.stringify(await server.call<ICustomizationMarketplacePage>('test', command, options, token)));
			},
			listen<T>(event: string): Event<T> {
				return server.listen('test', event);
			},
		};
		const configuration = new TestConfigurationService({ [CustomizationMarketplaceConfiguration.Enabled]: true });
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		return new CustomizationMarketplaceChannelClient(channel, configuration);
	}

	test('does not construct the shared-process catalog service until an uncancelled query', async () => {
		let constructed = 0;
		let queried = 0;
		const server = new CustomizationMarketplaceChannel(() => {
			constructed++;
			return {
				_serviceBrand: undefined,
				async query() { queried++; return { items: [] }; },
			};
		});
		const afterRegistration = constructed;
		assert.throws(() => server.call('test', 'invalid'), /Invalid call/);
		assert.throws(() => server.listen('test', 'invalid'), /Invalid listen/);
		await assert.rejects(server.call('test', 'query', {}, CancellationToken.Cancelled), isCancellationError);
		const afterIgnoredCalls = constructed;
		await server.call('test', 'query', {});
		await server.call('test', 'query', {});

		assert.deepStrictEqual({ afterRegistration, afterIgnoredCalls, constructed, queried }, {
			afterRegistration: 0, afterIgnoredCalls: 0, constructed: 1, queried: 2,
		});
	});

	test('disabled or unset experiment prevents renderer IPC calls', async () => {
		let calls = 0;
		const channel: IChannel = {
			async call() { calls++; throw new Error('The disabled client must not call IPC'); },
			listen: () => Event.None,
		};
		for (const enabled of [undefined, false]) {
			const configuration = new TestConfigurationService({ [CustomizationMarketplaceConfiguration.Enabled]: enabled, 'chat.agentFinder.enabled': true });
			disposables.add(configuration.onDidChangeConfigurationEmitter);
			const client = new CustomizationMarketplaceChannelClient(channel, configuration);
			await assert.rejects(client.query({}, CancellationToken.None), isCancellationError);
		}
		assert.strictEqual(calls, 0);
	});

	test('uses the source-neutral marketplace channel name', () => {
		assert.strictEqual(CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME, 'customizationMarketplace');
	});

	test('forwards marketplace source descriptors', async () => {
		const sources = [{ id: 'first', label: 'Marketplace 1' }, { id: 'second', label: 'Marketplace 2' }];
		const client = createClient({
			_serviceBrand: undefined,
			getSources: async () => sources,
			query: async () => ({ items: [] }),
		});

		assert.deepStrictEqual(await client.getSources(), sources);
	});

	test('forwards browse and search options and cancellation tokens', async () => {
		const source = disposables.add(new CancellationTokenSource());
		const calls: { options: ICustomizationMarketplaceQuery; token: CancellationToken }[] = [];
		const client = createClient({
			_serviceBrand: undefined,
			async query(options, token) {
				calls.push({ options, token });
				return { items: [] };
			},
		});
		const queries: ICustomizationMarketplaceQuery[] = [
			{
				mediaType: CustomizationMarketplaceMediaType.McpServer, pageSize: 24,
				cursor: { query: '', mediaType: CustomizationMarketplaceMediaType.McpServer, pageSize: 24, sources: [{ id: 'testSource', cursor: 'browse-page-2' }] },
			},
			{
				query: 'postgres', mediaType: CustomizationMarketplaceMediaType.Skill, sourceIds: ['testSource'], pageSize: 2,
				cursor: { query: 'postgres', mediaType: CustomizationMarketplaceMediaType.Skill, pageSize: 2, sources: [{ id: 'testSource', cursor: 'opaque+/=&token' }] },
			},
		];
		for (const query of queries) {
			await client.query(query, source.token);
		}

		assert.deepStrictEqual(calls, queries.map(options => ({ options, token: source.token })));
	});

	test('defaults missing server arguments to an initial browse and no cancellation', async () => {
		const calls: { options: ICustomizationMarketplaceQuery; token: CancellationToken }[] = [];
		const server = new CustomizationMarketplaceChannel(() => ({
			_serviceBrand: undefined,
			async query(options, token) {
				calls.push({ options, token });
				return { items: [] };
			},
		}));
		await server.call('test', 'query');

		assert.deepStrictEqual(calls, [{ options: {}, token: CancellationToken.None }]);
	});

	test('cancellation reaches the service through both channel adapters', async () => {
		const source = disposables.add(new CancellationTokenSource());
		let receivedToken: CancellationToken | undefined;
		const client = createClient({
			_serviceBrand: undefined,
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
			}],
			total: 10,
			nextCursor: {
				query: 'postgres', pageSize: 30,
				sources: [{ id: 'testSource', cursor: 'opaque+/=&token', total: 8 }, { id: 'otherSource', total: 2 }],
			},
		};
		const client = createClient({ _serviceBrand: undefined, query: async () => page });
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
			nextCursor: { query: '', pageSize: 30, sources: [{ id: 'testSource', cursor: 'next-page' }] },
		};
		const client = createClient({ _serviceBrand: undefined, query: async () => page });

		assert.deepStrictEqual(await client.query({}, CancellationToken.None), page);
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
		const client = createClient({ _serviceBrand: undefined, query: async () => page });
		const result = await client.query({}, CancellationToken.None);

		assert.deepStrictEqual(result.items.map(item => item.installation), installations);
	});

	test('propagates service errors without falling back or retrying', async () => {
		let calls = 0;
		const client = createClient({
			_serviceBrand: undefined,
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
			_serviceBrand: undefined,
			async query() {
				calls++;
				return { items: [] };
			},
		}));
		for (const command of ['request', 'fetch', 'install', 'unknown', 'constructor', '__proto__']) {
			assert.throws(() => server.call('test', command, { query: 'postgres' }), /Invalid call/);
		}
		assert.throws(() => server.listen('test', 'onDidChange'), /Invalid listen/);
		assert.strictEqual(calls, 0);
	});
});
