/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentFinderRestProvider } from '../../../../../../platform/agentFinder/common/agentFinderRestProvider.js';
import { IPublicCustomizationMarketplaceService } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceIpc.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { ICustomizationMarketplaceService } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IMarketplacePlugin, IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { CustomizationMarketplaceWorkbenchService, PublicCustomizationMarketplaceWorkbenchService } from '../../../browser/aiCustomization/customizationMarketplaceWorkbenchService.js';

suite('CustomizationMarketplaceWorkbenchService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disabled and cancelled queries do not instantiate the catalog client or perform requests', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const requests: IRequestOptions[] = [];
		const requestService = new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions) {
				requests.push(options);
				const results = [{ identifier: 'example', displayName: 'Example', type: 'application/ai-skill' }];
				const response = options.type === 'POST' ? { results } : { results, total: 1, offset: 0, pageSize: 30 };
				return { res: { statusCode: 200, headers: {} }, stream: bufferToStream(VSBuffer.fromString(JSON.stringify(response))) };
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IRequestService, requestService);
		instantiationService.stub(IPublicCustomizationMarketplaceService, instantiationService.createInstance(PublicCustomizationMarketplaceWorkbenchService));
		const service = store.add(instantiationService.createInstance(CustomizationMarketplaceWorkbenchService));
		const create = sinon.spy(instantiationService, 'createInstance');
		store.add(toDisposable(() => create.restore()));

		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);
		await configuration.setUserConfiguration('chat.agentFinder.enabled', true);
		await configuration.setUserConfiguration('chat.customizations.unifiedMarketplace.enabled', true);
		await configuration.setUserConfiguration('chat.customizations.marketplace.sources.agentFinderPublicFeed.enabled', true);
		await configuration.setUserConfiguration('chat.customizations.marketplace.sources.publicGitHubFeed.enabled', true);
		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);
		await assert.rejects(service.query({ query: 'review' }, CancellationToken.None), isCancellationError);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, true);
		await assert.rejects(service.query({}, CancellationToken.Cancelled), isCancellationError);
		await assert.rejects(service.query({ query: 'review' }, CancellationToken.Cancelled), isCancellationError);
		const whileDisabled = { creations: create.callCount, requests: requests.length };
		const pages = [
			await service.query({}, CancellationToken.None),
			await service.query({ query: 'review' }, CancellationToken.None),
		];
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);

		assert.deepStrictEqual({
			whileDisabled,
			createdCatalogClient: create.firstCall.args[0] === AgentFinderRestProvider,
			creations: create.callCount,
			requests: requests.map(request => request.type),
			sources: pages.map(page => page.items.map(item => item.sourceId)),
		}, { whileDisabled: { creations: 0, requests: 0 }, createdCatalogClient: true, creations: 1, requests: ['GET', 'POST'], sources: [['agentFinder'], ['agentFinder']] });
	});

	test('plugin-only Discover does not query the public feed', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.PluginMarketplacesEnabled, true);
		const reference = parseMarketplaceReference('owner/catalog')!;
		let publicCalls = 0;
		let pluginCalls = 0;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IPublicCustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override async query() {
				publicCalls++;
				return { items: [] };
			}
		}());
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override isStrictMarketplacePolicyActive() { return false; }
			override async fetchMarketplacePlugins() {
				pluginCalls++;
				return [{
					name: 'Review', description: 'Code review', version: '1', source: 'review',
					sourceDescriptor: { kind: PluginSourceKind.RelativePath as const, path: 'review' },
					marketplace: reference.displayLabel, marketplaceReference: reference, marketplaceType: MarketplaceType.Copilot,
				}];
			}
		}());
		const service = store.add(instantiationService.createInstance(CustomizationMarketplaceWorkbenchService));
		const page = await service.query({}, CancellationToken.None);
		assert.deepStrictEqual({
			sources: service.sources.map(source => source.id),
			items: page.items.map(item => [item.sourceId, item.displayName]),
			publicCalls, pluginCalls,
		}, {
			sources: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id, CustomizationMarketplaceSources.PluginMarketplaces.id],
			items: [['pluginMarketplaces', 'Review']],
			publicCalls: 0, pluginCalls: 1,
		});
	});

	test('enabled public and plugin feeds start together and retain source selection', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, true);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.PluginMarketplacesEnabled, true);
		const publicResult = new DeferredPromise<Awaited<ReturnType<ICustomizationMarketplaceService['query']>>>();
		const pluginResult = new DeferredPromise<IMarketplacePlugin[]>();
		const calls: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IPublicCustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override query() {
				calls.push('public');
				return publicResult.p;
			}
		}());
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override isStrictMarketplacePolicyActive() { return false; }
			override fetchMarketplacePlugins() {
				calls.push('plugin');
				return pluginResult.p;
			}
		}());
		const service = store.add(instantiationService.createInstance(CustomizationMarketplaceWorkbenchService));
		const pending = service.query({ pageSize: 2 }, CancellationToken.None);
		await Promise.resolve();
		const started = [...calls];
		await publicResult.complete({ items: [{
			sourceId: 'agentFinder', identifier: 'public', displayName: 'Public', description: '',
			mediaType: 'application/ai-skill', tags: [], capabilities: [], representativeQueries: [],
		}] });
		await pluginResult.complete([]);
		const page = await pending;
		const selected = await service.query({ sourceIds: [CustomizationMarketplaceSources.PluginMarketplaces.id] }, CancellationToken.None);
		assert.deepStrictEqual({
			started, page: page.items.map(item => item.sourceId),
			selected: selected.items, calls,
		}, {
			started: ['public', 'plugin'], page: ['agentFinder'],
			selected: [], calls: ['public', 'plugin', 'plugin'],
		});
	});
});
