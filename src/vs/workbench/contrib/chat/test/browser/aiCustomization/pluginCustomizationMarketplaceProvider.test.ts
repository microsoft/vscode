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
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { getPluginMarketplaceIdentifier, PluginCustomizationMarketplaceProvider } from '../../../browser/aiCustomization/pluginCustomizationMarketplaceProvider.js';
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
	function createProvider(service: IPluginMarketplaceService): PluginCustomizationMarketplaceProvider {
		const configuration = new TestConfigurationService();
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
			first: first.items.map(item => [item.identifier, item.mediaType, item.displayName, item.originLabel, item.score]),
			hasNextPage: first.nextCursor !== undefined,
			second: second.items.map(item => item.displayName),
			total: second.total,
			calls,
		}, {
			first: [[getPluginMarketplaceIdentifier(plugin), CustomizationMarketplaceMediaType.ClaudePlugin, 'Review', reference.displayLabel, 0]],
			hasNextPage: true,
			second: ['Different'],
			total: 2,
			calls: 1,
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
		assert.deepStrictEqual({ skipped, partial: { items: partial.items.map(item => item.displayName), total: partial.total, error: partial.error } }, {
			skipped: { items: [], total: 0 },
			partial: { items: ['Review'], total: undefined, error: 'microsoft/plugins#stable: Unavailable' },
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
