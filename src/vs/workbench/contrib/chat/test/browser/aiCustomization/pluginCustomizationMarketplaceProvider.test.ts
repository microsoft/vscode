/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMarketplaceMediaType } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { getPluginMarketplaceIdentifier, PluginCustomizationMarketplaceProvider } from '../../../browser/aiCustomization/pluginCustomizationMarketplaceProvider.js';
import { DEFAULT_PLUGIN_MARKETPLACE } from '../../../common/plugins/marketplaceReference.js';
import { IFetchMarketplacePluginsOptions, IMarketplacePlugin, IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';

suite('PluginCustomizationMarketplaceProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const reference = parseMarketplaceReference('microsoft/plugins#stable')!;
	const plugin: IMarketplacePlugin = {
		name: 'Review',
		description: 'Review code',
		version: '1.0',
		source: 'plugins/review',
		sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/review' },
		marketplace: reference.displayLabel,
		marketplaceReference: reference,
		marketplaceType: MarketplaceType.Claude,
	};
	function createProvider(service: IPluginMarketplaceService, configuration = new TestConfigurationService()): PluginCustomizationMarketplaceProvider {
		store.add(configuration.onDidChangeConfigurationEmitter);
		return store.add(new PluginCustomizationMarketplaceProvider(service, configuration));
	}

	test('maps authentic plugin metadata and bounds search pages', async () => {
		let calls = 0;
		const service = new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override isStrictMarketplacePolicyActive() { return false; }
			override async fetchMarketplacePlugins() {
				calls++;
				return [plugin, { ...plugin, name: 'Different', source: 'plugins/different', sourceDescriptor: { kind: PluginSourceKind.RelativePath as const, path: 'plugins/different' } }];
			}
		}();
		const provider = createProvider(service);
		const first = await provider.query({ query: 'plugins', pageSize: 1 }, CancellationToken.None);
		const second = await provider.query({ query: 'plugins', pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			first: first.items.map(item => [item.identifier, item.mediaType, item.displayName, item.originLabel, item.score, item.priority]),
			hasNextPage: first.nextCursor !== undefined,
			second: second.items.map(item => item.displayName),
			total: second.total,
			calls,
		}, {
			first: [[getPluginMarketplaceIdentifier(plugin), CustomizationMarketplaceMediaType.ClaudePlugin, 'Review', reference.displayLabel, 0, 1]],
			hasNextPage: true,
			second: ['Different'],
			total: 2,
			calls: 1,
		});
	});

	test('retains the default marketplace after custom entries only while the public feed is off', async () => {
		const builtIn = parseMarketplaceReference(DEFAULT_PLUGIN_MARKETPLACE)!;
		const configuration = new TestConfigurationService({ [CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: false });
		const service = new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override isStrictMarketplacePolicyActive() { return false; }
			override async fetchMarketplacePlugins() {
				return [
					{ ...plugin, name: 'Built-in', marketplace: builtIn.displayLabel, marketplaceReference: builtIn },
					plugin,
				];
			}
		}();
		const provider = createProvider(service, configuration);
		const first = await provider.query({ pageSize: 1 }, CancellationToken.None);
		const second = await provider.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);
		const searchWithDefault = await provider.query({ query: 'built-in' }, CancellationToken.None);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, true);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean {
				return section === CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled;
			}
		}());
		const staleCursor = assert.rejects(provider.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None), /plugin marketplace page is invalid/);
		const withPublic = await provider.query({ pageSize: 1 }, CancellationToken.None);
		const searchWithPublic = await provider.query({ query: 'built-in' }, CancellationToken.None);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		const restored = await provider.query({ pageSize: 2 }, CancellationToken.None);
		await staleCursor;
		assert.deepStrictEqual({
			first: first.items.map(item => [item.displayName, item.priority]),
			second: second.items.map(item => [item.displayName, item.priority]),
			total: first.total,
			searchWithDefault: searchWithDefault.items.map(item => [item.displayName, item.priority, item.score]),
			withPublic: withPublic.items.map(item => item.displayName),
			publicTotal: withPublic.total,
			searchWithPublic: searchWithPublic.items,
			restored: restored.items.map(item => [item.displayName, item.priority]),
		}, {
			first: [['Review', 1]], second: [['Built-in', 0]], total: 2,
			searchWithDefault: [['Built-in', 0, 0]],
			withPublic: ['Review'], publicTotal: 1, searchWithPublic: [],
			restored: [['Review', 1], ['Built-in', 0]],
		});
	});

	test('keeps custom entries ahead of the default across browse and search pages', async () => {
		const builtIn = parseMarketplaceReference(DEFAULT_PLUGIN_MARKETPLACE)!;
		const service = new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override isStrictMarketplacePolicyActive() { return false; }
			override async fetchMarketplacePlugins() {
				return [
					{ ...plugin, name: 'Review Default One', marketplace: builtIn.displayLabel, marketplaceReference: builtIn },
					{ ...plugin, name: 'Review Custom One' },
					{ ...plugin, name: 'Review Default Two', marketplace: builtIn.displayLabel, marketplaceReference: builtIn },
					{ ...plugin, name: 'Review Custom Two' },
				];
			}
		}();
		const provider = createProvider(service, new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: false,
		}));
		const pages = async (query?: string) => {
			const results: [string, number | undefined, number | undefined][][] = [];
			let cursor: string | undefined;
			do {
				const page = await provider.query({ query, pageSize: 1, cursor }, CancellationToken.None);
				results.push(page.items.map(item => [item.displayName, item.priority, item.score]));
				cursor = page.nextCursor;
			} while (cursor);
			return results;
		};
		assert.deepStrictEqual({ browse: await pages(), search: await pages('review') }, {
			browse: [[['Review Custom One', 1, undefined]], [['Review Custom Two', 1, undefined]], [['Review Default One', 0, undefined]], [['Review Default Two', 0, undefined]]],
			search: [[['Review Custom One', 1, 0]], [['Review Custom Two', 1, 0]], [['Review Default One', 0, 0]], [['Review Default Two', 0, 0]]],
		});
	});

	test('omits unsupported Cursor-format entries before pagination and totals', async () => {
		const service = new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override isStrictMarketplacePolicyActive() { return false; }
			override async fetchMarketplacePlugins() {
				return [
					{ ...plugin, name: 'Cursor One', marketplaceType: 'cursor' as MarketplaceType },
					{ ...plugin, name: 'Cursor Two', marketplaceType: 'cursor' as MarketplaceType },
					plugin,
					{ ...plugin, name: 'Open Plugin', marketplaceType: MarketplaceType.OpenPlugin },
				];
			}
		}();
		const provider = createProvider(service);
		const first = await provider.query({ pageSize: 1 }, CancellationToken.None);
		const second = await provider.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);
		const search = await provider.query({ query: 'cursor', pageSize: 1 }, CancellationToken.None);
		assert.deepStrictEqual({
			first: first.items.map(item => item.displayName),
			firstTotal: first.total,
			opaqueCursor: first.nextCursor !== undefined && !Number.isSafeInteger(Number(first.nextCursor)),
			second: second.items.map(item => [item.displayName, item.mediaType]),
			secondTotal: second.total,
			secondCursor: second.nextCursor,
			search: search.items,
			searchTotal: search.total,
			searchCursor: search.nextCursor,
		}, {
			first: ['Review'],
			firstTotal: 2,
			opaqueCursor: true,
			second: [['Open Plugin', CustomizationMarketplaceMediaType.CopilotPlugin]],
			secondTotal: 2,
			secondCursor: undefined,
			search: [],
			searchTotal: 0,
			searchCursor: undefined,
		});
	});

	test('filters media type and reports partial marketplace failures', async () => {
		const service = new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override isStrictMarketplacePolicyActive() { return false; }
			override async fetchMarketplacePlugins(_token: CancellationToken, _ids?: ReadonlySet<string>, options?: IFetchMarketplacePluginsOptions) {
				options?.onMarketplaceError?.(reference, new Error('Unavailable'));
				return [plugin];
			}
		}();
		const provider = createProvider(service);
		const skipped = await provider.query({ mediaType: CustomizationMarketplaceMediaType.Skill }, CancellationToken.None);
		const partial = await provider.query({}, CancellationToken.None);
		assert.deepStrictEqual({ skipped, partial: { items: partial.items.map(item => item.displayName), total: partial.total, warning: partial.warning } }, {
			skipped: { items: [], total: 0 },
			partial: { items: ['Review'], total: undefined, warning: 'microsoft/plugins#stable: Unavailable' },
		});
	});

	test('reports a partial failure on every native page without blocking supported entries', async () => {
		let fetches = 0;
		const service = new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override isStrictMarketplacePolicyActive() { return false; }
			override async fetchMarketplacePlugins(_token: CancellationToken, _ids?: ReadonlySet<string>, options?: IFetchMarketplacePluginsOptions) {
				fetches++;
				options?.onMarketplaceError?.(reference, new Error('Unavailable'));
				return [plugin, { ...plugin, name: 'Another' }, { ...plugin, name: 'Third' }];
			}
		}();
		const provider = createProvider(service);
		const first = await provider.query({ pageSize: 1 }, CancellationToken.None);
		const second = await provider.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);
		const third = await provider.query({ pageSize: 1, cursor: second.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			names: [first, second, third].map(page => page.items.map(item => item.displayName)),
			warnings: [first, second, third].map(page => page.warning),
			totals: [first, second, third].map(page => page.total),
			hasMore: [first.nextCursor !== undefined, second.nextCursor !== undefined, third.nextCursor !== undefined],
			fetches,
		}, {
			names: [['Review'], ['Another'], ['Third']],
			warnings: Array(3).fill('microsoft/plugins#stable: Unavailable'),
			totals: [undefined, undefined, undefined],
			hasMore: [true, true, false],
			fetches: 1,
		});
	});

	test('cancellation prevents publishing partial results', async () => {
		const pending = new DeferredPromise<IMarketplacePlugin[]>();
		const cancellation = store.add(new CancellationTokenSource());
		const service = new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override isStrictMarketplacePolicyActive() { return false; }
			override fetchMarketplacePlugins() { return pending.p; }
		}();
		const result = createProvider(service).query({}, cancellation.token);
		cancellation.cancel();
		await pending.complete([plugin]);
		await assert.rejects(result, isCancellationError);
	});

	test('strict policy excludes blocked marketplaces and invalidates cached pages', async () => {
		const changes = store.add(new Emitter<void>());
		let strict = false;
		const service = new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = changes.event;
			override isStrictMarketplacePolicyActive() { return strict; }
			override isMarketplaceTrusted() { return false; }
			override async fetchMarketplacePlugins() { return [plugin, { ...plugin, name: 'Another' }]; }
		}();
		const provider = createProvider(service);
		const page = await provider.query({ pageSize: 1 }, CancellationToken.None);
		strict = true;
		changes.fire();
		await assert.rejects(provider.query({ pageSize: 1, cursor: page.nextCursor }, CancellationToken.None), /plugin marketplace page is invalid/);
		const blocked = await provider.query({ pageSize: 1 }, CancellationToken.None);
		assert.deepStrictEqual({ first: page.items.length, blocked: blocked.items, blockedTotal: blocked.total }, { first: 1, blocked: [], blockedTotal: 0 });
	});
});
