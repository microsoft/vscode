/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentFinderRestProvider } from '../../../../../../platform/agentFinder/common/agentFinderRestProvider.js';
import { CustomizationMarketplaceChannel, CustomizationMarketplaceChannelClient, IPlatformCustomizationMarketplaceService } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceIpc.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceService, ICustomizationMarketplaceCursor, ICustomizationMarketplaceEntry, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceRequest, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceQuery } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IPluginMarketplacePage, IPluginMarketplaceQuery, IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { ICopilotConnector, ICopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { CustomizationMarketplaceWorkbenchService, PlatformCustomizationMarketplaceWorkbenchService } from '../../../browser/aiCustomization/customizationMarketplaceWorkbenchService.js';

suite('CustomizationMarketplaceWorkbenchService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createConnector(name: string, displayName = `Mail ${name}`): ICopilotConnector {
		return {
			name, displayName, description: 'Search mail', tags: [], keywords: [], capabilities: [], representativeQueries: [],
			connectionStatus: 'not_connected', scopes: [], mcpServers: [],
		};
	}


	function createConfiguration(enabledIds: readonly string[]) {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: enabledIds.includes(CustomizationMarketplaceSources.AgentFinderPublicFeed.id),
			[CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: enabledIds.includes(CustomizationMarketplaceSources.CopilotConnectors.id),
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		return configuration;
	}


	async function setEnabled(configuration: TestConfigurationService, setting: string, enabled: boolean): Promise<void> {
		await configuration.setUserConfiguration(setting, enabled);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === setting; }
		}());
	}

	function registerConnectorService(instantiationService: TestInstantiationService): void {
		instantiationService.stub(ICopilotConnectorsService, new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = Event.None;
			override readonly onDidChangeAccount = Event.None;
			override readonly onDidDisconnect = Event.None;
			override readonly connectors = [];
			override readonly connectedMcpServers = [];
			override readonly authorizationRequired = false;
			override readonly catalogMayRequireConsent = false;
			override readonly connectionStateKnown = false;
		}());
	}

	function createService(
		configuration: TestConfigurationService,
		platformService: ICustomizationMarketplaceService,
		connectorsService: ICopilotConnectorsService,
	): CustomizationMarketplaceWorkbenchService {
		const platformSources = platformService.allSources ?? platformService.sources ?? [CustomizationMarketplaceSources.AgentFinderPublicFeed];
		const normalizedPlatformService = new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = platformSources;
			override readonly allSources = platformSources;
			override query(options: ICustomizationMarketplaceQuery, token: CancellationToken) {
				return platformService.query(options, token);
			}
		}();
		const pluginMarketplaceService = new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override getMarketplaceReferences() { return []; }
		}();
		return new CustomizationMarketplaceWorkbenchService(
			configuration,
			normalizedPlatformService,
			pluginMarketplaceService,
			connectorsService,
			store.add(new TestInstantiationService()),
		);
	}

	function createMixedFixture(enabledIds: readonly string[]) {
		const configuration = createConfiguration(enabledIds);
		const publicEntries: ICustomizationMarketplaceEntry[] = Array.from({ length: 45 }, (_, index) => ({
			identifier: `public-${index}`, displayName: `Mail server ${index}`, description: '', score: 100 - index,
			mediaType: CustomizationMarketplaceMediaType.McpServer, tags: [], capabilities: [], representativeQueries: [],
		}));
		const connectors = Array.from({ length: 30 }, (_, index) => createConnector(`connector-${index}`));
		const ipcRequests: ICustomizationMarketplaceRequest[] = [];
		const nativeRequests: ICustomizationMarketplaceSourceQuery[] = [];
		const connectorCalls: CancellationToken[] = [];
		let publicInitializations = 0;
		const server = new CustomizationMarketplaceChannel(() => {
			publicInitializations++;
			return new CustomizationMarketplaceService([{
				id: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
				async query(options) {
					nativeRequests.push(options);
					const offset = Number(options.cursor ?? 0);
					const items = publicEntries.slice(offset, offset + Math.min(options.pageSize ?? 24, 5));
					return { items, total: publicEntries.length, nextCursor: offset + items.length < publicEntries.length ? String(offset + items.length) : undefined };
				},
			}]);
		});
		const publicService = new CustomizationMarketplaceChannelClient({
			async call<T>(command: string, options?: ICustomizationMarketplaceRequest, token?: CancellationToken): Promise<T> {
				assert.ok(options);
				ipcRequests.push(options);
				return JSON.parse(JSON.stringify(await server.call<ICustomizationMarketplacePage>('test', command, options, token)));
			},
			listen: () => Event.None,
		}, configuration);
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			cacheToken = CancellationToken.None;
			override async getConnectorsSnapshot(token: CancellationToken) {
				connectorCalls.push(token);
				return { connectors, cacheToken: this.cacheToken };
			}
		}();
		const service = createService(configuration, publicService, connectorsService);
		return { configuration, service, publicService, publicEntries, connectors, connectorsService, ipcRequests, nativeRequests, connectorCalls, publicInitializations: () => publicInitializations };
	}


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
		instantiationService.stub(IProductService, { mcpGallery: { serviceUrl: 'https://api.mcp.github.com' } } as IProductService);
		instantiationService.stub(IPlatformCustomizationMarketplaceService, instantiationService.createInstance(PlatformCustomizationMarketplaceWorkbenchService));
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override getMarketplaceReferences() { return []; }
		}());
		registerConnectorService(instantiationService);
		const service = instantiationService.createInstance(CustomizationMarketplaceWorkbenchService);
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
		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
		const whileDisabled = { creations: create.callCount, requests: requests.length };
		const pages = [
			await service.query({ sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id] }, CancellationToken.None),
			await service.query({ sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id], query: 'review' }, CancellationToken.None),
		];
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		await assert.rejects(service.query({ sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id] }, CancellationToken.None), isCancellationError);

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
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
		await configuration.setUserConfiguration(ChatConfiguration.PluginsEnabled, true);
		const customReference = parseMarketplaceReference('owner/catalog')!;
		const defaultReference = parseMarketplaceReference('github/awesome-copilot#marketplace')!;
		let publicCalls = 0;
		const pluginCalls: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IPlatformCustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.AgentFinderPublicFeed];
			override async query() {
				publicCalls++;
				return { items: [] };
			}
		}());
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override getMarketplaceReferences() { return [customReference, defaultReference]; }
			override async queryMarketplacePlugins(options: IPluginMarketplaceQuery) {
				const reference = options.marketplaceIds.has(defaultReference.canonicalId) ? defaultReference : customReference;
				pluginCalls.push(reference.canonicalId);
				return {
					items: [{
						name: reference === customReference ? 'Review' : 'Built-in', description: 'Code review', version: '1', source: 'review',
						sourceDescriptor: { kind: PluginSourceKind.RelativePath as const, path: 'review' },
						marketplace: reference.displayLabel, marketplaceReference: reference, marketplaceType: MarketplaceType.Copilot,
					}],
					total: 1,
					errors: [],
				};
			}
		}());
		registerConnectorService(instantiationService);
		const service = instantiationService.createInstance(CustomizationMarketplaceWorkbenchService);
		const page = await service.query({}, CancellationToken.None);
		assert.deepStrictEqual({
			sources: service.sources.map(source => source.id),
			items: page.items.map(item => [item.sourceId, item.displayName]),
			publicCalls, pluginCalls,
		}, {
			sources: [CustomizationMarketplaceSources.PluginMarketplaces.id, CustomizationMarketplaceSources.AgentFinderPublicFeed.id, CustomizationMarketplaceSources.CopilotConnectors.id],
			items: [['pluginMarketplaces', 'Review'], ['pluginMarketplaces', 'Built-in']],
			publicCalls: 0,
			pluginCalls: [customReference.canonicalId, defaultReference.canonicalId],
		});
	});

	test('enabled public and plugin feeds start together and retain source selection', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, true);
		await configuration.setUserConfiguration(ChatConfiguration.PluginsEnabled, true);
		const publicResult = new DeferredPromise<Awaited<ReturnType<ICustomizationMarketplaceService['query']>>>();
		const pluginResult = new DeferredPromise<IPluginMarketplacePage>();
		const calls: string[] = [];
		const reference = parseMarketplaceReference('owner/catalog')!;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IPlatformCustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.AgentFinderPublicFeed];
			override query() {
				calls.push('public');
				return publicResult.p;
			}
		}());
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override getMarketplaceReferences() { return [reference]; }
			override queryMarketplacePlugins() {
				calls.push('plugin');
				return pluginResult.p;
			}
		}());
		registerConnectorService(instantiationService);
		const service = instantiationService.createInstance(CustomizationMarketplaceWorkbenchService);
		const pending = service.query({ pageSize: 2 }, CancellationToken.None);
		await Promise.resolve();
		const started = [...calls];
		await publicResult.complete({
			items: [{
				sourceId: 'agentFinder', identifier: 'public', displayName: 'Public', description: '',
				mediaType: 'application/ai-skill', tags: [], capabilities: [], representativeQueries: [],
			}]
		});
		await pluginResult.complete({
			items: [{
				name: 'Plugin', description: 'Plugin from configured marketplace', version: '1', source: 'plugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugin' },
				marketplace: reference.displayLabel, marketplaceReference: reference, marketplaceType: MarketplaceType.Copilot,
			}],
			total: 1,
			errors: [],
		});
		const page = await pending;
		const selected = await service.query({ sourceIds: [CustomizationMarketplaceSources.PluginMarketplaces.id] }, CancellationToken.None);
		const search = await service.query({ query: 'plugin', pageSize: 2 }, CancellationToken.None);
		assert.deepStrictEqual({
			started, page: page.items.map(item => item.sourceId),
			selected: selected.items.map(item => item.sourceId),
			search: search.items.map(item => item.sourceId), calls,
		}, {
			started: ['plugin', 'public'], page: ['pluginMarketplaces', 'agentFinder'],
			selected: ['pluginMarketplaces'], search: ['pluginMarketplaces', 'agentFinder'],
			calls: ['plugin', 'public', 'plugin', 'plugin', 'public'],
		});
	});

	test('preserves recoverable public feed failures through the renderer composition', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IPlatformCustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.AgentFinderPublicFeed];
			override async query() {
				return {
					items: [{
						sourceId: 'agentFinder', identifier: 'public', displayName: 'Public', description: '',
						mediaType: 'application/ai-skill', tags: [], capabilities: [], representativeQueries: [],
					}],
					nextCursor: { token: 'next' },
					sourceErrors: [{ sourceId: 'agentFinder', message: 'Partial failure' }],
				};
			}
		}());
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override getMarketplaceReferences() { return []; }
		}());
		registerConnectorService(instantiationService);
		const service = instantiationService.createInstance(CustomizationMarketplaceWorkbenchService);
		const page = await service.query({ sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id], pageSize: 1 }, CancellationToken.None);
		assert.deepStrictEqual({
			items: page.items.map(item => item.identifier),
			hasMore: !!page.nextCursor,
			errors: page.sourceErrors,
		}, {
			items: ['public'],
			hasMore: true,
			errors: [{ sourceId: 'agentFinder', message: 'Partial failure' }],
		});
	});


	test('connector sign-in is offered only for a source requiring explicit authorization', async () => {
		const configuration = createConfiguration(['copilotConnectors']);
		const authorizations: CancellationToken[] = [];
		const signIns: CancellationToken[] = [];
		let authorizationRequired = true;
		let catalogMayRequireConsent = false;
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			override get authorizationRequired() { return authorizationRequired; }
			override get catalogMayRequireConsent() { return catalogMayRequireConsent; }
			override async signIn(token: CancellationToken) { signIns.push(token); authorizationRequired = false; }
			override async authorize(token: CancellationToken) { authorizations.push(token); authorizationRequired = false; }
		}();
		const service = createService(configuration, new class extends mock<ICustomizationMarketplaceService>() { }(), connectorsService);
		const unrelated = service.getSourceRecoveryAction('agentFinder');
		const action = service.getSourceRecoveryAction('copilotConnectors');
		assert.ok(action);
		await action.run(CancellationToken.None);
		authorizationRequired = true;
		catalogMayRequireConsent = true;
		const rolloutAction = service.getSourceRecoveryAction('copilotConnectors');
		await rolloutAction?.run(CancellationToken.None);
		assert.deepStrictEqual({
			unrelated, label: action.label, rolloutLabel: rolloutAction?.label, kind: action.kind, signIns, authorizations, afterConsent: service.getSourceRecoveryAction('copilotConnectors'),
		}, {
			unrelated: undefined, label: 'Sign In', rolloutLabel: 'Authorize Connectors', kind: 'signIn',
			signIns: [CancellationToken.None], authorizations: [CancellationToken.None], afterConsent: undefined,
		});
	});

	test('connector recovery does not inspect Connector state while the experiment is disabled', () => {
		const configuration = createConfiguration([]);
		let authorizationReads = 0;
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			override get authorizationRequired() {
				authorizationReads++;
				return true;
			}
		}();
		const service = createService(configuration, new class extends mock<ICustomizationMarketplaceService>() { }(), connectorsService);

		assert.deepStrictEqual({
			action: service.getSourceRecoveryAction(CustomizationMarketplaceSources.CopilotConnectors.id),
			authorizationReads,
		}, {
			action: undefined,
			authorizationReads: 0,
		});
	});


	test('composes the built-in catalog with Copilot connectors', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
			[CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const builtinService = new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.AgentFinderPublicFeed];
			override async query() {
				return {
					items: [{
						sourceId: 'agentFinder',
						identifier: 'registry/server',
						displayName: 'Registry server',
						description: 'Registry result',
						mediaType: CustomizationMarketplaceMediaType.McpServer,
						tags: [],
						capabilities: [],
						representativeQueries: [],
					}],
				};
			}
		}();
		const connector = createConnector('mail', 'Mail');
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = Event.None;
			override readonly connectors = [connector];
			override readonly connectedMcpServers = [];
			override async getConnectors() { return this.connectors; }
			override async getConnectorsSnapshot() { return { connectors: this.connectors, cacheToken: CancellationToken.None }; }
		}();
		const service = createService(configuration, builtinService, connectorsService);

		const page = await service.query({ mediaType: CustomizationMarketplaceMediaType.McpServer }, CancellationToken.None);

		assert.deepStrictEqual(page.items.map(item => ({
			sourceId: item.sourceId,
			identifier: item.identifier,
			installation: item.installation,
		})), [{
			sourceId: 'agentFinder',
			identifier: 'registry/server',
			installation: undefined,
		}, {
			sourceId: 'copilotConnectors',
			identifier: 'mail',
			installation: { kind: 'copilotConnector', name: 'mail' },
		}]);
	});


	test('queries each native source independently when composing it with connectors', async () => {
		const configuration = createConfiguration(['agentFinder', 'copilotConnectors']);
		const baseSources = [CustomizationMarketplaceSources.McpGallery, CustomizationMarketplaceSources.AgentFinderPublicFeed];
		const sourceRequests: (readonly string[] | undefined)[] = [];
		const baseService = new class extends mock<ICustomizationMarketplaceService>() {
			override readonly allSources = baseSources;
			override readonly sources = baseSources;
			override async query(options: ICustomizationMarketplaceQuery) {
				sourceRequests.push(options.sourceIds);
				const sourceId = options.sourceIds?.[0];
				assert.ok(sourceId);
				return {
					items: [{
						sourceId,
						identifier: `${sourceId}/server`,
						displayName: `${sourceId} server`,
						description: '',
						mediaType: CustomizationMarketplaceMediaType.McpServer,
						tags: [],
						capabilities: [],
						representativeQueries: [],
					}],
				};
			}
		}();
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			override async getConnectorsSnapshot() {
				return { connectors: [createConnector('mail', 'Mail')], cacheToken: CancellationToken.None };
			}
		}();
		const service = createService(configuration, baseService, connectorsService);

		const page = await service.query({ pageSize: 24 }, CancellationToken.None);

		assert.deepStrictEqual({
			sourceRequests: sourceRequests.map(sourceIds => [...sourceIds ?? []]).sort(),
			resultSources: [...new Set(page.items.map(item => item.sourceId))].sort(),
		}, {
			sourceRequests: [['agentFinder'], ['mcpGallery']],
			resultSources: ['agentFinder', 'copilotConnectors', 'mcpGallery'],
		});
	});


	for (const enabledIds of [[], ['agentFinder'], ['copilotConnectors'], ['agentFinder', 'copilotConnectors']]) {
		test(`queries only selected sources and keeps connectors out of IPC: ${enabledIds.join(', ') || 'none'}`, async () => {
			const fixture = createMixedFixture(enabledIds);
			const options = { query: 'mail', pageSize: 24, sourceIds: ['agentFinder', 'copilotConnectors', 'unselected'] };
			const result = fixture.service.query(options, CancellationToken.None);
			if (enabledIds.length) {
				const page = await result;
				assert.deepStrictEqual([...new Set(page.items.map(item => item.sourceId))], enabledIds);
			} else {
				await assert.rejects(result, isCancellationError);
			}
			assert.deepStrictEqual({
				publicInitializations: fixture.publicInitializations(),
				publicQueried: fixture.nativeRequests.length > 0,
				connectorsQueried: fixture.connectorCalls.length > 0,
				ipcSourceIds: fixture.ipcRequests.map(request => request.sourceIds),
				transportSources: fixture.publicService.sources,
				registeredSources: fixture.service.sources,
			}, {
				publicInitializations: enabledIds.includes('agentFinder') ? 1 : 0,
				publicQueried: enabledIds.includes('agentFinder'),
				connectorsQueried: enabledIds.includes('copilotConnectors'),
				ipcSourceIds: enabledIds.includes('agentFinder') ? [['agentFinder']] : [],
				transportSources: [CustomizationMarketplaceSources.AgentFinderPublicFeed],
				registeredSources: [CustomizationMarketplaceSources.AgentFinderPublicFeed, CustomizationMarketplaceSources.CopilotConnectors],
			});
		});
	}


	for (const query of [undefined, 'mail']) {
		test(`mixed ${query ? 'ranked search' : 'native browsing'} pins a changing catalog across global pages and IPC boundaries`, async () => {
			const fixture = createMixedFixture(['agentFinder', 'copilotConnectors']);
			const pages: ICustomizationMarketplacePage[] = [];
			const publicResults = fixture.publicEntries.map(item => ['agentFinder', item.identifier, item.score]);
			const connectorResults = fixture.connectors.map(item => ['copilotConnectors', item.name, query ? 90 : undefined]);
			const browseResults = publicResults.flatMap((item, index) => index < connectorResults.length ? [item, connectorResults[index]] : [item]);
			let cursor: ICustomizationMarketplaceCursor | undefined;
			do {
				const page = await fixture.service.query({ query, pageSize: 24, cursor }, CancellationToken.None);
				pages.push(page);
				cursor = page.nextCursor;
				if (pages.length === 1) {
					fixture.connectors.splice(0, fixture.connectors.length, createConnector('new', 'Mail'), createConnector('connector-29', 'Mail'));
				}
				assert.ok(pages.length <= 4, 'Pagination must reach exhaustion');
			} while (cursor);
			assert.deepStrictEqual({
				lengths: pages.map(page => page.items.length),
				totals: pages.map(page => page.total),
				results: pages.flatMap(page => page.items.map(item => [item.sourceId, item.identifier, item.score])),
				cursorKeys: pages.slice(0, -1).map(page => Object.keys(page.nextCursor!)),
				nativePageSizes: [...new Set(fixture.nativeRequests.map(request => request.pageSize))],
				nativeCalls: fixture.nativeRequests.length,
				connectorCalls: fixture.connectorCalls.length,
				ipcSourceIds: fixture.ipcRequests.map(request => request.sourceIds),
			}, {
				lengths: [24, 24, 24, 3],
				totals: [75, 75, 75, 75],
				results: query
					? [...publicResults.slice(0, 10), connectorResults[0], publicResults[10], ...connectorResults.slice(1), ...publicResults.slice(11)]
					: browseResults,
				cursorKeys: [['token'], ['token'], ['token']],
				nativePageSizes: [24],
				nativeCalls: 9,
				connectorCalls: 1,
				ipcSourceIds: [['agentFinder'], ['agentFinder']],
			});
		});
	}


	for (const pageSize of [1, 3]) {
		test(`queryless browsing preserves rotation and snapshots across ${pageSize}-entry pages and source exhaustion`, async () => {
			const fixture = createMixedFixture(['agentFinder', 'copilotConnectors']);
			fixture.publicEntries.splice(7);
			fixture.connectors.splice(4);
			const expected = [
				'public-0', 'connector-0', 'public-1', 'connector-1', 'public-2', 'connector-2',
				'public-3', 'connector-3', 'public-4', 'public-5', 'public-6',
			];
			const pages: ICustomizationMarketplacePage[] = [];
			let cursor: ICustomizationMarketplaceCursor | undefined;
			do {
				const page = await fixture.service.query({ pageSize, cursor }, CancellationToken.None);
				pages.push(page);
				cursor = page.nextCursor;
				if (pages.length === 1) {
					fixture.connectors.reverse();
					fixture.connectors.push(createConnector('new'));
				}
				assert.ok(pages.length <= expected.length);
			} while (cursor);
			assert.deepStrictEqual({
				pages: pages.map(page => page.items.map(item => item.identifier)),
				totals: [...new Set(pages.map(page => page.total))],
				publicCursorKeys: pages.slice(0, -1).map(page => Object.keys(page.nextCursor!)),
				connectorReads: fixture.connectorCalls.length,
			}, {
				pages: Array.from({ length: Math.ceil(expected.length / pageSize) }, (_, index) => expected.slice(index * pageSize, (index + 1) * pageSize)),
				totals: [11],
				publicCursorKeys: pages.slice(0, -1).map(() => ['token']),
				connectorReads: 1,
			});
		});
	}


	for (const query of [undefined, 'mail']) {
		test(`account invalidation refuses buffered ${query ? 'search' : 'browse'} connectors before any IPC or catalog reads`, async () => {
			const fixture = createMixedFixture(['agentFinder', 'copilotConnectors']);
			const context = store.add(new CancellationTokenSource());
			fixture.connectorsService.cacheToken = context.token;
			const options = { query, pageSize: 2 };
			const first = await fixture.service.query(options, CancellationToken.None);
			context.cancel();
			fixture.connectorsService.cacheToken = CancellationToken.None;
			fixture.connectors.splice(0, fixture.connectors.length, createConnector('new-account', 'Mail'));
			await assert.rejects(fixture.service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None), /Start a new search/);
			const readsBeforeNewSearch = [fixture.ipcRequests.length, fixture.connectorCalls.length];
			const fresh = await fixture.service.query(options, CancellationToken.None);
			assert.deepStrictEqual({
				oldIds: first.items.map(item => item.identifier),
				readsBeforeNewSearch,
				fresh: fresh.items.map(item => [item.sourceId, item.identifier, item.score]),
			}, {
				oldIds: ['public-0', query ? 'public-1' : 'connector-0'],
				readsBeforeNewSearch: [1, 1],
				fresh: [['agentFinder', 'public-0', 100], ['copilotConnectors', 'new-account', query ? 100 : undefined]],
			});
		});
	}


	test('forwards an opaque backend cursor without decoding it or exposing it in the combined cursor', async () => {
		const opaque = 'opaque+/=&{"installation":"not-provenance"}';
		const calls: ICustomizationMarketplaceQuery[] = [];
		const configuration = createConfiguration(['agentFinder']);
		const publicService = new class extends mock<ICustomizationMarketplaceService>() {
			override async query(options: ICustomizationMarketplaceQuery) {
				calls.push(options);
				return {
					items: [{
						sourceId: 'agentFinder', identifier: options.cursor ? 'second' : 'first', displayName: 'Mail', description: '',
						mediaType: CustomizationMarketplaceMediaType.McpServer, tags: [], capabilities: [], representativeQueries: [], score: 50,
					}],
					total: 2,
					nextCursor: options.cursor ? undefined : { token: opaque },
				};
			}
		}();
		const service = createService(configuration, publicService, new class extends mock<ICopilotConnectorsService>() { }());
		const first = await service.query({ query: 'mail', pageSize: 1 }, CancellationToken.None);
		const second = await service.query({ query: 'mail', pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			calls,
			items: [first, second].flatMap(page => page.items.map(item => [item.identifier, item.installation])),
			exposesBackendCursor: first.nextCursor?.token === opaque,
		}, {
			calls: [
				{ query: 'mail', mediaType: undefined, pageSize: 1, cursor: undefined, sourceIds: ['agentFinder'] },
				{ query: 'mail', mediaType: undefined, pageSize: 1, cursor: { token: opaque }, sourceIds: ['agentFinder'] },
			],
			items: [['first', undefined], ['second', undefined]],
			exposesBackendCursor: false,
		});
	});


	test('source toggles reject stale continuations and fresh queries do not touch the disabled source', async () => {
		const fixture = createMixedFixture(['agentFinder', 'copilotConnectors']);
		const first = await fixture.service.query({ query: 'mail', pageSize: 24 }, CancellationToken.None);
		await setEnabled(fixture.configuration, CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, false);
		await assert.rejects(fixture.service.query({ query: 'mail', pageSize: 24, cursor: first.nextCursor }, CancellationToken.None), /Start a new search/);
		const callsBefore = fixture.connectorCalls.length;
		const fresh = await fixture.service.query({ query: 'mail', pageSize: 24 }, CancellationToken.None);
		assert.deepStrictEqual({
			sourceIds: [...new Set(fresh.items.map(item => item.sourceId))],
			additionalConnectorCalls: fixture.connectorCalls.length - callsBefore,
		}, { sourceIds: ['agentFinder'], additionalConnectorCalls: 0 });
	});


	test('effective source changes cancel both transports, while unchanged settings preserve the request', async () => {
		const configuration = createConfiguration(['agentFinder', 'copilotConnectors']);
		const publicResponse = new DeferredPromise<ICustomizationMarketplacePage>();
		const connectorResponse = new DeferredPromise<readonly ICopilotConnector[]>();
		const tokens: CancellationToken[] = [];
		const publicService = new class extends mock<ICustomizationMarketplaceService>() {
			override query(_options: ICustomizationMarketplaceQuery, token: CancellationToken) {
				tokens.push(token);
				return publicResponse.p;
			}
		}();
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			override async getConnectorsSnapshot(token: CancellationToken) {
				tokens.push(token);
				return { connectors: await connectorResponse.p, cacheToken: CancellationToken.None };
			}
		}();
		const service = createService(configuration, publicService, connectorsService);
		const pending = service.query({ query: 'mail' }, CancellationToken.None);
		const cancelled = assert.rejects(pending, isCancellationError);
		await setEnabled(configuration, CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, true);
		const beforeToggle = tokens.map(token => token.isCancellationRequested);
		await setEnabled(configuration, CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, false);
		await cancelled;
		await publicResponse.complete({ items: [] });
		await connectorResponse.complete([createConnector('mail')]);
		assert.deepStrictEqual({
			beforeToggle,
			afterToggle: tokens.map(token => token.isCancellationRequested),
			listening: configuration.onDidChangeConfigurationEmitter.hasListeners(),
		}, { beforeToggle: [false, false], afterToggle: [true, true], listening: false });
	});


	test('unreachable connectors do not prevent public-feed pagination through IPC', async () => {
		const fixture = createMixedFixture(['agentFinder', 'copilotConnectors']);
		const unavailable = sinon.stub(fixture.connectorsService, 'getConnectorsSnapshot').rejects(new Error('Connector catalog unavailable'));
		store.add(toDisposable(() => unavailable.restore()));
		const options = { query: 'mail', pageSize: 24 };
		const first = await fixture.service.query(options, CancellationToken.None);
		const last = await fixture.service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			ids: [first, last].flatMap(page => page.items.map(item => item.identifier)),
			lengths: [first.items.length, last.items.length],
			errors: [first.sourceErrors, last.sourceErrors],
			totals: [first.total, last.total],
			ipcSources: fixture.ipcRequests.map(request => request.sourceIds),
			connectorCalls: unavailable.callCount,
		}, {
			ids: fixture.publicEntries.map(item => item.identifier),
			lengths: [24, 21],
			errors: Array.from({ length: 2 }, () => [{ sourceId: 'copilotConnectors', message: 'Connector catalog unavailable' }]),
			totals: [undefined, undefined],
			ipcSources: [['agentFinder'], ['agentFinder']],
			connectorCalls: 1,
		});
	});


	for (const partial of [false, true]) {
		test(`preserves ${partial ? 'partial' : 'empty'} public-feed failures across the nested IPC composition`, async () => {
			const configuration = createConfiguration(['agentFinder', 'copilotConnectors']);
			const server = new CustomizationMarketplaceChannel(() => new CustomizationMarketplaceService([{
				id: 'agentFinder',
				query: async options => {
					if (!partial || options.cursor) {
						throw new Error('Public feed unavailable');
					}
					return {
						items: [{
							identifier: 'public', displayName: 'Mail', description: '', score: 100,
							mediaType: CustomizationMarketplaceMediaType.McpServer, tags: [], capabilities: [], representativeQueries: [],
						}],
						nextCursor: 'next',
						total: 2,
					};
				},
			}]));
			const publicService = new CustomizationMarketplaceChannelClient({
				async call<T>(command: string, request?: ICustomizationMarketplaceRequest, token?: CancellationToken): Promise<T> {
					return JSON.parse(JSON.stringify(await server.call<ICustomizationMarketplacePage>('test', command, request, token)));
				},
				listen: () => Event.None,
			}, configuration);
			const connectorsService = new class extends mock<ICopilotConnectorsService>() {
				override async getConnectorsSnapshot() {
					return { connectors: [createConnector('mail', 'Mail')], cacheToken: CancellationToken.None };
				}
			}();
			const page = await createService(configuration, publicService, connectorsService).query({ query: 'mail', pageSize: 24 }, CancellationToken.None);
			assert.deepStrictEqual({
				ids: page.items.map(item => item.identifier),
				errors: page.sourceErrors,
				total: page.total,
				next: page.nextCursor,
			}, {
				ids: partial ? ['public', 'mail'] : ['mail'],
				errors: [{ sourceId: 'agentFinder', message: 'Public feed unavailable' }],
				total: undefined,
				next: undefined,
			});
		});
	}
});
