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
import { ICustomizationMarketplacePage, ICustomizationMarketplaceRequest } from '../../common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources, getEnabledCustomizationMarketplaceSources, queryEnabledCustomizationMarketplaceSources } from '../../common/customizationMarketplaceSources.js';

suite('CustomizationMarketplaceSources', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sources = [
		{ id: 'first', enablementSetting: 'test.first.enabled' },
		{ id: 'second', enablementSetting: 'test.second.enabled' },
	];

	test('configured plugin marketplaces have an independent disabled-by-default source setting', () => {
		const configuration = createConfiguration([]);
		assert.deepStrictEqual({
			setting: CustomizationMarketplaceSources.PluginMarketplaces.enablementSetting,
			publicSetting: CustomizationMarketplaceSources.AgentFinderPublicFeed.enablementSetting,
			enabled: getEnabledCustomizationMarketplaceSources(configuration, Object.values(CustomizationMarketplaceSources)),
		}, {
			setting: CustomizationMarketplaceConfiguration.PluginMarketplacesEnabled,
			publicSetting: CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled,
			enabled: [],
		});
	});

	function createConfiguration(enabledIds: readonly string[]) {
		const configuration = new TestConfigurationService(Object.fromEntries(sources.map(source => [source.enablementSetting, enabledIds.includes(source.id)])));
		store.add(configuration.onDidChangeConfigurationEmitter);
		return configuration;
	}

	async function setEnabled(configuration: TestConfigurationService, setting: string, enabled: boolean): Promise<void> {
		await configuration.setUserConfiguration(setting, enabled);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === setting; }
		}());
	}

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

			test('source picker never queries a different enabled source', async () => {
				const configuration = createConfiguration(['first', 'second']);
				const calls: ICustomizationMarketplaceRequest[] = [];
				await queryEnabledCustomizationMarketplaceSources(configuration, sources, { sourceIds: ['second'] }, CancellationToken.None, async request => {
					calls.push(request);
					return { items: [] };
				});
				assert.deepStrictEqual(calls, [{ sourceIds: ['second'] }]);
			});
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
