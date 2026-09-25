/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { mcpGalleryServiceUrlConfig } from '../../../mcp/common/mcpManagement.js';
import { ICustomizationMarketplacePage, ICustomizationMarketplaceRequest } from '../../common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources, getEnabledCustomizationMarketplaceSources, getVisibleCustomizationMarketplaceSources, queryEnabledCustomizationMarketplaceSources } from '../../common/customizationMarketplaceSources.js';

suite('CustomizationMarketplaceSources', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sources = [
		{ id: 'first', enablementSetting: 'test.first.enabled' },
		{ id: 'second', enablementSetting: 'test.second.enabled' },
	];

	function createConfiguration(enabledIds: readonly string[]) {
		const configuration = new TestConfigurationService(Object.fromEntries(sources.map(source => [source.enablementSetting, enabledIds.includes(source.id)])));
		store.add(configuration.onDidChangeConfigurationEmitter);
		return configuration;
	}

	test('Marketplace visibility does not disable legacy-capable feed queries', async () => {
		const configuration = createConfiguration(['first']);
		await setEnabled(configuration, CustomizationMarketplaceConfiguration.MarketplaceEnabled, false);
		const disabled = getVisibleCustomizationMarketplaceSources(configuration, sources);
		const legacyFeeds = getEnabledCustomizationMarketplaceSources(configuration, sources).map(source => source.id);
		const legacyPage = await queryEnabledCustomizationMarketplaceSources(configuration, sources, {}, CancellationToken.None, async () => ({ items: [], total: 1 }));
		const pendingResult = new DeferredPromise<ICustomizationMarketplacePage>();
		const pending = queryEnabledCustomizationMarketplaceSources(configuration, sources, {}, CancellationToken.None, () => pendingResult.p);
		await setEnabled(configuration, CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
		await setEnabled(configuration, CustomizationMarketplaceConfiguration.MarketplaceEnabled, false);
		await pendingResult.complete({ items: [] });
		assert.deepStrictEqual({
			disabled, legacyFeeds, legacyPage, pendingPage: await pending, cancelledListeners: configuration.onDidChangeConfigurationEmitter.hasListeners(),
			enabledFeeds: sources.map(source => configuration.getValue<boolean>(source.enablementSetting)),
		}, { disabled: [], legacyFeeds: ['first'], legacyPage: { items: [], total: 1 }, pendingPage: { items: [] }, cancelledListeners: false, enabledFeeds: [true, false] });
	});

	test('changing source query configuration cancels an in-flight request without disabling the source', async () => {
		const source = {
			id: 'mcpGallery',
			enablementSetting: CustomizationMarketplaceConfiguration.MarketplaceEnabled,
			configurationDependencies: [mcpGalleryServiceUrlConfig],
		};
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[mcpGalleryServiceUrlConfig]: 'https://old.registry.test',
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const deferred = new DeferredPromise<ICustomizationMarketplacePage>();
		const pending = queryEnabledCustomizationMarketplaceSources(configuration, [source], {}, CancellationToken.None, () => deferred.p);
		const cancelled = assert.rejects(pending, isCancellationError);
		await configuration.setUserConfiguration(mcpGalleryServiceUrlConfig, 'https://new.registry.test');
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === mcpGalleryServiceUrlConfig; }
		}());
		await cancelled;
		await deferred.complete({ items: [] });
		assert.deepStrictEqual({
			enabled: getEnabledCustomizationMarketplaceSources(configuration, [source]).map(source => source.id),
			listening: configuration.onDidChangeConfigurationEmitter.hasListeners(),
		}, { enabled: ['mcpGallery'], listening: false });
	});

	test('changing unselected source configuration preserves an in-flight request', async () => {
		const selected = { id: 'public', enablementSetting: 'test.public.enabled' };
		const unrelated = {
			id: 'mcpGallery',
			enablementSetting: CustomizationMarketplaceConfiguration.MarketplaceEnabled,
			configurationDependencies: [mcpGalleryServiceUrlConfig],
		};
		const configuration = new TestConfigurationService({
			'test.public.enabled': true,
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const deferred = new DeferredPromise<ICustomizationMarketplacePage>();
		const pending = queryEnabledCustomizationMarketplaceSources(configuration, [selected, unrelated], { sourceIds: ['public'] }, CancellationToken.None, () => deferred.p);
		await configuration.setUserConfiguration(mcpGalleryServiceUrlConfig, 'https://new.registry.test');
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === mcpGalleryServiceUrlConfig; }
		}());
		await deferred.complete({ items: [], total: 1 });
		assert.deepStrictEqual({
			page: await pending,
			listening: configuration.onDidChangeConfigurationEmitter.hasListeners(),
		}, {
			page: { items: [], total: 1 },
			listening: false,
		});
	});

	test('Marketplace visibility does not change legacy source enablement', () => {
		const cases = [
			{ marketplace: false, first: false, second: false, visible: [] },
			{ marketplace: false, first: true, second: false, visible: [] },
			{ marketplace: true, first: false, second: false, visible: [] },
			{ marketplace: true, first: true, second: false, visible: ['first'] },
			{ marketplace: true, first: true, second: true, visible: ['first', 'second'] },
		];
		assert.deepStrictEqual(cases.map(({ marketplace, first, second }) => {
			const configuration = new TestConfigurationService({
				[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: marketplace,
				'test.first.enabled': first,
				'test.second.enabled': second,
			});
			return {
				enabled: getEnabledCustomizationMarketplaceSources(configuration, sources).map(source => source.id),
				visible: getVisibleCustomizationMarketplaceSources(configuration, sources).map(source => source.id),
			};
		}), cases.map(({ first, second, visible }) => ({
			enabled: sources.filter(source => source.id === 'first' ? first : second).map(source => source.id),
			visible,
		})));
	});

	test('MCP sources follow Marketplace visibility and exclude default when public feed is enabled', () => {
		const cases = [
			{ marketplace: false, publicFeed: false, visible: [] },
			{ marketplace: true, publicFeed: false, visible: ['mcpGallery'] },
			{ marketplace: true, publicFeed: true, visible: ['mcpGallery', 'agentFinder'] },
		];
		assert.deepStrictEqual(cases.map(({ marketplace, publicFeed }) => {
			const configuration = new TestConfigurationService({
				[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: marketplace,
				[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: publicFeed,
			});
			return getVisibleCustomizationMarketplaceSources(configuration, Object.values(CustomizationMarketplaceSources)).map(source => source.id);
		}), cases.map(({ visible }) => visible));
	});

	async function setEnabled(configuration: TestConfigurationService, setting: string, enabled: boolean): Promise<void> {
		await configuration.setUserConfiguration(setting, enabled);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === setting; }
		}());
	}

	test('GitHub Feed requires both switches; legacy sources remain available without Marketplace', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: false,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
			'test.legacy.enabled': true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const marketplaceSources = [
			CustomizationMarketplaceSources.AgentFinderPublicFeed,
			{ id: 'legacy', enablementSetting: 'test.legacy.enabled' },
		];
		const calls: ICustomizationMarketplaceRequest[] = [];
		const query = async (request: ICustomizationMarketplaceRequest) => {
			calls.push(request);
			return { items: [] };
		};
		await assert.rejects(queryEnabledCustomizationMarketplaceSources(configuration, marketplaceSources, { sourceIds: ['agentFinder'] }, CancellationToken.None, query), isCancellationError);
		await queryEnabledCustomizationMarketplaceSources(configuration, marketplaceSources, {}, CancellationToken.None, query);
		await setEnabled(configuration, CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
		await queryEnabledCustomizationMarketplaceSources(configuration, marketplaceSources, {}, CancellationToken.None, query);
		await setEnabled(configuration, CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		await queryEnabledCustomizationMarketplaceSources(configuration, marketplaceSources, {}, CancellationToken.None, query);
		assert.deepStrictEqual({
			calls: calls.map(call => call.sourceIds),
			enabled: getEnabledCustomizationMarketplaceSources(configuration, marketplaceSources).map(source => source.id),
		}, {
			calls: [['legacy'], ['agentFinder', 'legacy'], ['legacy']],
			enabled: ['legacy'],
		});
	});

	test('hiding Marketplace cancels an in-flight GitHub Feed request but preserves a legacy source', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
			'test.legacy.enabled': true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const marketplaceSources = [CustomizationMarketplaceSources.AgentFinderPublicFeed, { id: 'legacy', enablementSetting: 'test.legacy.enabled' }];
		const deferred = new DeferredPromise<ICustomizationMarketplacePage>();
		let requestToken: CancellationToken | undefined;
		const pending = queryEnabledCustomizationMarketplaceSources(configuration, marketplaceSources, { sourceIds: ['agentFinder'] }, CancellationToken.None, (_request, token) => {
			requestToken = token;
			return deferred.p;
		});
		const cancelled = assert.rejects(pending, isCancellationError);
		await setEnabled(configuration, CustomizationMarketplaceConfiguration.MarketplaceEnabled, false);
		await cancelled;
		await deferred.complete({ items: [] });
		assert.deepStrictEqual({
			tokenCancelled: requestToken?.isCancellationRequested,
			enabled: getEnabledCustomizationMarketplaceSources(configuration, marketplaceSources).map(source => source.id),
			listening: configuration.onDidChangeConfigurationEmitter.hasListeners(),
		}, { tokenCancelled: true, enabled: ['legacy'], listening: false });
	});

	for (const enabledIds of [[], ['first'], ['second'], ['first', 'second']]) {
		test(`queries only enabled sources: ${enabledIds.join(', ') || 'none'}`, async () => {
			const configuration = createConfiguration(enabledIds);
			const calls: ICustomizationMarketplaceRequest[] = [];
			const tokens: CancellationToken[] = [];
			const options = { query: 'review', pageSize: 12 };
			const query = queryEnabledCustomizationMarketplaceSources(configuration, sources, options, CancellationToken.None, async (request, token) => {
				calls.push(request);
				tokens.push(token);
				return { items: [] };
			});
			if (enabledIds.length) {
				await query;
			} else {
				await assert.rejects(query, isCancellationError);
			}
			assert.deepStrictEqual({
				enabled: getEnabledCustomizationMarketplaceSources(configuration, sources).map(source => source.id),
				calls,
				tokensCancelled: tokens.map(token => token.isCancellationRequested),
				listening: configuration.onDidChangeConfigurationEmitter.hasListeners(),
			}, {
				enabled: enabledIds,
				calls: enabledIds.length ? [{ ...options, sourceIds: enabledIds }] : [],
				tokensCancelled: enabledIds.length ? [true] : [],
				listening: false,
			});
		});
	}

	test('does not query a disabled source explicitly selected by the caller', async () => {
		const configuration = createConfiguration(['first']);
		const calls: ICustomizationMarketplaceRequest[] = [];
		await assert.rejects(queryEnabledCustomizationMarketplaceSources(configuration, sources, { sourceIds: ['second'] }, CancellationToken.None, async request => {
			calls.push(request);
			return { items: [] };
		}), isCancellationError);
		assert.deepStrictEqual({ calls, listening: configuration.onDidChangeConfigurationEmitter.hasListeners() }, { calls: [], listening: false });
	});

	test('does not call a source for an already cancelled request', async () => {
		const configuration = createConfiguration(['first']);
		let calls = 0;
		await assert.rejects(queryEnabledCustomizationMarketplaceSources(configuration, sources, {}, CancellationToken.Cancelled, async () => {
			calls++;
			return { items: [] };
		}), isCancellationError);
		assert.deepStrictEqual({ calls, listening: configuration.onDidChangeConfigurationEmitter.hasListeners() }, { calls: 0, listening: false });
	});

	for (const change of [{ setting: sources[0].enablementSetting, enabled: false }, { setting: sources[1].enablementSetting, enabled: true }]) {
		test(`${change.enabled ? 'adding' : 'removing'} a source cancels unresponsive queries even if the source set is restored`, async () => {
			const configuration = createConfiguration(['first']);
			const deferred = new DeferredPromise<ICustomizationMarketplacePage>();
			const calls: ICustomizationMarketplaceRequest[] = [];
			const tokens: CancellationToken[] = [];
			const pending = queryEnabledCustomizationMarketplaceSources(configuration, sources, {}, CancellationToken.None, (request, token) => {
				calls.push(request);
				tokens.push(token);
				return deferred.p;
			});
			const cancelled = assert.rejects(pending, isCancellationError);
			await setEnabled(configuration, change.setting, change.enabled);
			await cancelled;
			await setEnabled(configuration, change.setting, !change.enabled);
			await deferred.complete({ items: [], total: 99 });
			const fresh = await queryEnabledCustomizationMarketplaceSources(configuration, sources, {}, CancellationToken.None, async request => {
				calls.push(request);
				return { items: [], total: 0 };
			});
			assert.deepStrictEqual({
				calls,
				cancelled: tokens[0].isCancellationRequested,
				fresh,
				listening: configuration.onDidChangeConfigurationEmitter.hasListeners(),
			}, {
				calls: [{ sourceIds: ['first'] }, { sourceIds: ['first'] }],
				cancelled: true,
				fresh: { items: [], total: 0 },
				listening: false,
			});
		});
	}

	test('unchanged enablement and unrelated settings preserve in-flight queries', async () => {
		const configuration = createConfiguration(['first']);
		const deferred = new DeferredPromise<ICustomizationMarketplacePage>();
		const tokens: CancellationToken[] = [];
		const pending = queryEnabledCustomizationMarketplaceSources(configuration, sources, {}, CancellationToken.None, (_request, token) => {
			tokens.push(token);
			return deferred.p;
		});
		await setEnabled(configuration, sources[0].enablementSetting, true);
		await setEnabled(configuration, sources[1].enablementSetting, false);
		await setEnabled(configuration, 'test.unrelated.enabled', true);
		const cancelledBeforeResult = tokens[0].isCancellationRequested;
		await deferred.complete({ items: [], total: 42 });
		assert.deepStrictEqual({ cancelledBeforeResult, result: await pending, listening: configuration.onDidChangeConfigurationEmitter.hasListeners() }, {
			cancelledBeforeResult: false, result: { items: [], total: 42 }, listening: false,
		});
	});

	test('caller cancellation reaches the source and releases configuration listeners', async () => {
		const configuration = createConfiguration(['first']);
		const cancellation = store.add(new CancellationTokenSource());
		const deferred = new DeferredPromise<ICustomizationMarketplacePage>();
		const tokens: CancellationToken[] = [];
		const pending = queryEnabledCustomizationMarketplaceSources(configuration, sources, {}, cancellation.token, (_request, token) => {
			tokens.push(token);
			return deferred.p;
		});
		const cancelled = assert.rejects(pending, isCancellationError);
		cancellation.cancel();
		await cancelled;
		await deferred.complete({ items: [] });
		assert.deepStrictEqual({ cancelled: tokens[0].isCancellationRequested, listening: configuration.onDidChangeConfigurationEmitter.hasListeners() }, {
			cancelled: true, listening: false,
		});
	});

	test('source failures propagate and release configuration listeners', async () => {
		const configuration = createConfiguration(['first']);
		const error = new Error('Source unavailable');
		await assert.rejects(queryEnabledCustomizationMarketplaceSources(configuration, sources, {}, CancellationToken.None, async () => {
			throw error;
		}), actual => actual === error);
		assert.strictEqual(configuration.onDidChangeConfigurationEmitter.hasListeners(), false);
	});
});
