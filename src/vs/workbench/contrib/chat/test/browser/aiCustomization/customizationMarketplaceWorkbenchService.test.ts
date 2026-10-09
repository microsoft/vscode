/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IPlatformCustomizationMarketplaceService } from '../../../../../../platform/customizationMarketplace/common/platformCustomizationMarketplaceService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceRecoveryGroup, ICustomizationMarketplaceCursor, ICustomizationMarketplaceEntry, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IPluginMarketplacePage, IPluginMarketplaceQuery, IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationMarketplaceSearchProvider, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ICopilotConnector, ICopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { CustomizationMarketplaceWorkbenchService } from '../../../browser/aiCustomization/customizationMarketplaceWorkbenchService.js';
import { getPluginCustomizationMarketplaceSourceId } from '../../../browser/aiCustomization/pluginCustomizationMarketplaceProvider.js';

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

	function registerConnectorService(instantiationService: TestInstantiationService, marketplaceSearchProvider?: ICustomizationMarketplaceSearchProvider): void {
		instantiationService.stub(ICopilotConnectorsService, new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = Event.None;
			override readonly onDidChangeAccount = Event.None;
			override readonly onDidDisconnect = Event.None;
			override readonly connectors = [];
			override readonly connectedMcpServers = [];
			override readonly authorizationRequired = false;
			override readonly connectionStateKnown = false;
		}());
		const harness = { id: 'local', label: 'Local', icon: { id: 'vm' }, marketplaceSearchProvider } satisfies IHarnessDescriptor;
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = observableValue(this, harness.id);
			override readonly activeSessionResource = observableValue(this, URI.parse('vscode-chat-session://local/session'));
			override getActiveDescriptor() { return harness; }
		}());
	}

	function createService(
		configuration: TestConfigurationService,
		platformService: ICustomizationMarketplaceService,
		connectorsService: ICopilotConnectorsService,
		marketplaceSearchProvider?: ICustomizationMarketplaceSearchProvider,
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
		const harness = { id: 'local', label: 'Local', icon: { id: 'vm' }, marketplaceSearchProvider } satisfies IHarnessDescriptor;
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = observableValue(this, harness.id);
			override readonly activeSessionResource = observableValue(this, URI.parse('vscode-chat-session://local/session'));
			override getActiveDescriptor() { return harness; }
		}();
		return store.add(new CustomizationMarketplaceWorkbenchService(
			configuration,
			normalizedPlatformService,
			pluginMarketplaceService,
			connectorsService,
			harnessService,
			store.add(new TestInstantiationService()),
		));
	}

	function createMixedFixture(enabledIds: readonly string[]) {
		const configuration = createConfiguration(enabledIds);
		const publicEntries: ICustomizationMarketplaceEntry[] = Array.from({ length: 45 }, (_, index) => ({
			identifier: `public-${index}`, displayName: `Mail server ${index}`, description: '', score: 100 - index,
			mediaType: CustomizationMarketplaceMediaType.McpServer, tags: [], capabilities: [], representativeQueries: [],
		}));
		const connectors = Array.from({ length: 30 }, (_, index) => createConnector(`connector-${index}`));
		const nativeRequests: ICustomizationMarketplaceSourceQuery[] = [];
		const connectorCalls: CancellationToken[] = [];
		const harnessProvider: ICustomizationMarketplaceSearchProvider = {
			async query(_session, options) {
				nativeRequests.push(options);
				const offset = Number(options.cursor ?? 0);
				const items = publicEntries.slice(offset, offset + Math.min(options.pageSize ?? 24, 5));
				return { items, total: publicEntries.length, nextCursor: offset + items.length < publicEntries.length ? String(offset + items.length) : undefined };
			},
		};
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			cacheToken = CancellationToken.None;
			override async getConnectorsSnapshot(token: CancellationToken) {
				connectorCalls.push(token);
				return { connectors, cacheToken: this.cacheToken };
			}
		}();
		const platformService = new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.McpGallery];
			override readonly allSources = this.sources;
			override async query() { return { items: [], total: 0 }; }
		}();
		const service = createService(configuration, platformService, connectorsService, harnessProvider);
		return { configuration, service, publicEntries, connectors, connectorsService, nativeRequests, connectorCalls };
	}


	test('Local omits the GitHub Feed while keeping existing platform registries', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const platformRequests: ICustomizationMarketplaceQuery[] = [];
		const platformService = new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.McpGallery];
			override readonly allSources = this.sources;
			override async query(options: ICustomizationMarketplaceQuery) {
				platformRequests.push(options);
				return {
					items: [{
						sourceId: CustomizationMarketplaceSources.McpGallery.id,
						identifier: 'registry-server',
						displayName: 'Registry Server',
						description: '',
						mediaType: CustomizationMarketplaceMediaType.McpServer,
						tags: [],
						capabilities: [],
						representativeQueries: [],
					}],
				};
			}
		}();
		const service = createService(configuration, platformService, new class extends mock<ICopilotConnectorsService>() { }());
		await assert.rejects(service.query({ sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id] }, CancellationToken.None), isCancellationError);
		const page = await service.query({}, CancellationToken.None);

		assert.deepStrictEqual({
			sources: service.sources.map(source => source.id),
			items: page.items.map(item => item.sourceId),
			platformRequests,
		}, {
			sources: [CustomizationMarketplaceSources.McpGallery.id, CustomizationMarketplaceSources.CopilotConnectors.id],
			items: [CustomizationMarketplaceSources.McpGallery.id],
			platformRequests: [{ query: '', mediaType: undefined, pageSize: 30, cursor: undefined, sourceIds: [CustomizationMarketplaceSources.McpGallery.id] }],
		});
	});

	test('strict marketplace policy does not query the public feed', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, true);
		await configuration.setUserConfiguration(ChatConfiguration.PluginsEnabled, true);
		await configuration.setUserConfiguration(ChatConfiguration.StrictMarketplaces, [{ source: 'github', repo: 'owner/catalog' }]);
		const customReference = parseMarketplaceReference('owner/catalog')!;
		let platformCalls = 0;
		let githubFeedCalls = 0;
		const pluginCalls: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IPlatformCustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.McpGallery];
			override async query() {
				platformCalls++;
				return { items: [] };
			}
		}());
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override getMarketplaceReferences() { return [customReference]; }
			override async queryMarketplacePlugins(options: IPluginMarketplaceQuery) {
				pluginCalls.push(customReference.canonicalId);
				return {
					items: [{
						name: 'Review', description: 'Code review', version: '1', source: 'review',
						sourceDescriptor: { kind: PluginSourceKind.RelativePath as const, path: 'review' },
						marketplace: customReference.displayLabel, marketplaceReference: customReference, marketplaceType: MarketplaceType.Copilot,
					}],
					total: 1,
					errors: [],
				};
			}
		}());
		registerConnectorService(instantiationService, {
			async query() {
				githubFeedCalls++;
				return { items: [] };
			},
		});
		const service = store.add(instantiationService.createInstance(CustomizationMarketplaceWorkbenchService));
		const page = await service.query({}, CancellationToken.None);
		const customSourceId = getPluginCustomizationMarketplaceSourceId(customReference);
		assert.deepStrictEqual({
			sources: service.sources.map(source => source.id),
			items: page.items.map(item => [item.sourceId, item.displayName]),
			platformCalls, githubFeedCalls, pluginCalls,
		}, {
			sources: [customSourceId, CustomizationMarketplaceSources.McpGallery.id, CustomizationMarketplaceSources.CopilotConnectors.id],
			items: [[customSourceId, 'Review']],
			platformCalls: 1,
			githubFeedCalls: 0,
			pluginCalls: [customReference.canonicalId],
		});
	});

	test('keeps all source metadata current when configured marketplaces change', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[ChatConfiguration.PluginsEnabled]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const marketplaceChanges = store.add(new Emitter<void>());
		const references: ReturnType<typeof parseMarketplaceReference>[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IPlatformCustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [];
			override readonly allSources = [];
			override readonly onDidChangeSources = Event.None;
			override async query() { return { items: [] }; }
		}());
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = marketplaceChanges.event;
			override getMarketplaceReferences() { return references.filter(reference => reference !== undefined); }
		}());
		registerConnectorService(instantiationService);
		const service = store.add(instantiationService.createInstance(CustomizationMarketplaceWorkbenchService));
		const before = service.allSources.map(source => source.id);
		const reference = parseMarketplaceReference('owner/catalog')!;
		references.push(reference);
		marketplaceChanges.fire();

		assert.deepStrictEqual({
			before,
			after: service.allSources.map(source => source.id),
		}, {
			before: [CustomizationMarketplaceSources.PluginMarketplaces.id, CustomizationMarketplaceSources.AgentFinderPublicFeed.id, CustomizationMarketplaceSources.CopilotConnectors.id],
			after: [CustomizationMarketplaceSources.PluginMarketplaces.id, getPluginCustomizationMarketplaceSourceId(reference), CustomizationMarketplaceSources.AgentFinderPublicFeed.id, CustomizationMarketplaceSources.CopilotConnectors.id],
		});
	});

	test('enabled public and plugin feeds start together and retain source selection', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, true);
		await configuration.setUserConfiguration(ChatConfiguration.PluginsEnabled, true);
		const publicResult = new DeferredPromise<ICustomizationMarketplaceSourcePage>();
		const pluginResult = new DeferredPromise<IPluginMarketplacePage>();
		const calls: string[] = [];
		const reference = parseMarketplaceReference('owner/catalog')!;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IPlatformCustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.McpGallery];
			override async query() { return { items: [] }; }
		}());
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override getMarketplaceReferences() { return [reference]; }
			override queryMarketplacePlugins() {
				calls.push('plugin');
				return pluginResult.p;
			}
		}());
		registerConnectorService(instantiationService, {
			query: async () => {
				calls.push('public');
				return publicResult.p;
			},
		});
		const service = store.add(instantiationService.createInstance(CustomizationMarketplaceWorkbenchService));
		const pending = service.query({ pageSize: 2 }, CancellationToken.None);
		await Promise.resolve();
		const started = [...calls];
		await publicResult.complete({
			items: [{
				identifier: 'public', displayName: 'Public', description: '',
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
		const pluginSourceId = getPluginCustomizationMarketplaceSourceId(reference);
		const selected = await service.query({ sourceIds: [pluginSourceId] }, CancellationToken.None);
		const search = await service.query({ query: 'plugin', pageSize: 2 }, CancellationToken.None);
		assert.deepStrictEqual({
			started, page: page.items.map(item => item.sourceId),
			selected: selected.items.map(item => item.sourceId),
			search: search.items.map(item => item.sourceId), calls,
		}, {
			started: ['plugin', 'public'], page: [pluginSourceId, 'agentFinder'],
			selected: [pluginSourceId], search: [pluginSourceId, 'agentFinder'],
			calls: ['plugin', 'public', 'plugin', 'plugin', 'public'],
		});
	});

	test('preserves recoverable public feed failures through the renderer composition', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const service = createService(
			configuration,
			new class extends mock<ICustomizationMarketplaceService>() {
				override readonly sources = [CustomizationMarketplaceSources.McpGallery];
				override async query() { return { items: [] }; }
			}(),
			new class extends mock<ICopilotConnectorsService>() { }(),
			{
				async query() {
					return {
						items: [{
							identifier: 'public', displayName: 'Public', description: '',
							mediaType: 'application/ai-skill', tags: [], capabilities: [], representativeQueries: [],
						}],
						nextCursor: 'next',
						warning: 'Partial failure',
					};
				},
			},
		);
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


	test('connector catalog recovery offers only ordinary sign-in', async () => {
		const configuration = createConfiguration(['copilotConnectors']);
		const signIns: CancellationToken[] = [];
		let authorizationRequired = true;
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			override get authorizationRequired() { return authorizationRequired; }
			override async signIn(token: CancellationToken) { signIns.push(token); authorizationRequired = false; }
		}();
		const service = createService(configuration, new class extends mock<ICustomizationMarketplaceService>() { }(), connectorsService);
		const unrelated = service.getSourceRecoveryAction('agentFinder');
		const action = service.getSourceRecoveryAction('copilotConnectors');
		assert.ok(action);
		await action.run(CancellationToken.None);
		assert.deepStrictEqual({
			unrelated, label: action.label, kind: action.kind, groupId: action.groupId,
			signIns, afterSignIn: service.getSourceRecoveryAction('copilotConnectors'),
		}, {
			unrelated: undefined, label: 'Sign In', kind: 'signIn',
			groupId: CustomizationMarketplaceRecoveryGroup.GitHubDefaultAccount,
			signIns: [CancellationToken.None], afterSignIn: undefined,
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

	test('GitHub Feed exposes only the active harness recovery action', async () => {
		const configuration = createConfiguration([CustomizationMarketplaceSources.AgentFinderPublicFeed.id]);
		const recoveries: CancellationToken[] = [];
		const harnessProvider: ICustomizationMarketplaceSearchProvider = {
			async query() { return { items: [] }; },
			getRecoveryAction() {
				return {
					label: 'Sign In',
					kind: 'signIn',
					groupId: CustomizationMarketplaceRecoveryGroup.GitHubDefaultAccount,
					async run(token) { recoveries.push(token); },
				};
			},
		};
		const service = createService(
			configuration,
			new class extends mock<ICustomizationMarketplaceService>() { }(),
			new class extends mock<ICopilotConnectorsService>() { }(),
			harnessProvider,
		);

		const action = service.getSourceRecoveryAction(CustomizationMarketplaceSources.AgentFinderPublicFeed.id);
		await action?.run(CancellationToken.None);

		assert.deepStrictEqual({
			label: action?.label,
			kind: action?.kind,
			groupId: action?.groupId,
			recoveries,
		}, {
			label: 'Sign In',
			kind: 'signIn',
			groupId: CustomizationMarketplaceRecoveryGroup.GitHubDefaultAccount,
			recoveries: [CancellationToken.None],
		});
	});


	test('uses the active harness catalog provider instead of the platform public feed', async () => {
		const configuration = createConfiguration([CustomizationMarketplaceSources.AgentFinderPublicFeed.id]);
		let platformQueries = 0;
		const platformService = new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.AgentFinderPublicFeed];
			override async query() {
				platformQueries++;
				return { items: [] };
			}
		}();
		const harnessQueries: ICustomizationMarketplaceSourceQuery[] = [];
		const harnessProvider: ICustomizationMarketplaceSearchProvider = {
			async query(_session, options) {
				harnessQueries.push(options);
				return {
					items: [{
						identifier: 'sdk-selection',
						displayName: 'SDK Skill',
						description: '',
						mediaType: CustomizationMarketplaceMediaType.Skill,
						tags: [],
						capabilities: [],
						representativeQueries: [],
					}],
				};
			},
		};
		const service = createService(configuration, platformService, new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = Event.None;
			override readonly connectors = [];
			override readonly connectedMcpServers = [];
		}(), harnessProvider);

		const page = await service.query({ query: 'sdk' }, CancellationToken.None);

		assert.deepStrictEqual({
			platformQueries,
			harnessQueries,
			items: page.items.map(item => ({ sourceId: item.sourceId, identifier: item.identifier })),
		}, {
			platformQueries: 0,
			harnessQueries: [{ query: 'sdk', mediaType: undefined, pageSize: 30, cursor: undefined }],
			items: [{ sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id, identifier: 'sdk-selection' }],
		});
	});

	test('does not fall back to a platform GitHub Feed while the harness catalog is unavailable', async () => {
		const configuration = createConfiguration([CustomizationMarketplaceSources.AgentFinderPublicFeed.id]);
		let platformQueries = 0;
		const platformService = new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.AgentFinderPublicFeed];
			override async query() {
				platformQueries++;
				return {
					items: [{
						sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
						identifier: 'rest-result',
						displayName: 'REST result',
						description: '',
						mediaType: CustomizationMarketplaceMediaType.Skill,
						tags: [],
						capabilities: [],
						representativeQueries: [],
					}],
				};
			}
		}();
		const service = createService(configuration, platformService, new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = Event.None;
			override readonly connectors = [];
			override readonly connectedMcpServers = [];
		}(), { query: async () => undefined });

		const page = await service.query({}, CancellationToken.None);

		assert.deepStrictEqual({
			platformQueries,
			items: page.items.map(item => item.identifier),
		}, {
			platformQueries: 0,
			items: [],
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
			override readonly sources = [CustomizationMarketplaceSources.McpGallery];
			override async query() { return { items: [] }; }
		}();
		const connector = createConnector('mail', 'Mail');
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = Event.None;
			override readonly connectors = [connector];
			override readonly connectedMcpServers = [];
			override async getConnectors() { return this.connectors; }
			override async getConnectorsSnapshot() { return { connectors: this.connectors, cacheToken: CancellationToken.None }; }
		}();
		const service = createService(configuration, builtinService, connectorsService, {
			async query() {
				return {
					items: [{
						identifier: 'registry/server',
						displayName: 'Registry server',
						description: 'Registry result',
						mediaType: CustomizationMarketplaceMediaType.McpServer,
						tags: [],
						capabilities: [],
						representativeQueries: [],
					}],
				};
			},
		});

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
		const harnessRequests: ICustomizationMarketplaceSourceQuery[] = [];
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
		const harnessProvider: ICustomizationMarketplaceSearchProvider = {
			async query(_session, options) {
				harnessRequests.push(options);
				return {
					items: [{
						identifier: 'agentFinder/server',
						displayName: 'agentFinder server',
						description: '',
						mediaType: CustomizationMarketplaceMediaType.McpServer,
						tags: [],
						capabilities: [],
						representativeQueries: [],
					}],
				};
			},
		};
		const composed = createService(configuration, baseService, connectorsService, harnessProvider);

		const page = await composed.query({ pageSize: 24 }, CancellationToken.None);

		assert.deepStrictEqual({
			sourceRequests: sourceRequests.map(sourceIds => [...sourceIds ?? []]).sort(),
			harnessRequests,
			resultSources: [...new Set(page.items.map(item => item.sourceId))].sort(),
		}, {
			sourceRequests: [['mcpGallery']],
			harnessRequests: [{ query: '', mediaType: undefined, pageSize: 24, cursor: undefined }],
			resultSources: ['agentFinder', 'copilotConnectors', 'mcpGallery'],
		});
	});


	for (const enabledIds of [[], ['agentFinder'], ['copilotConnectors'], ['agentFinder', 'copilotConnectors']]) {
		test(`queries only selected sources: ${enabledIds.join(', ') || 'none'}`, async () => {
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
				publicQueried: fixture.nativeRequests.length > 0,
				connectorsQueried: fixture.connectorCalls.length > 0,
				registeredSources: fixture.service.sources,
			}, {
				publicQueried: enabledIds.includes('agentFinder'),
				connectorsQueried: enabledIds.includes('copilotConnectors'),
				registeredSources: [CustomizationMarketplaceSources.McpGallery, CustomizationMarketplaceSources.AgentFinderPublicFeed, CustomizationMarketplaceSources.CopilotConnectors],
			});
		});
	}


	for (const query of [undefined, 'mail']) {
		test(`mixed ${query ? 'ranked search' : 'native browsing'} pins a changing harness catalog across global pages`, async () => {
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
		test(`account invalidation refuses buffered ${query ? 'search' : 'browse'} connectors before any catalog reads`, async () => {
			const fixture = createMixedFixture(['agentFinder', 'copilotConnectors']);
			const context = store.add(new CancellationTokenSource());
			fixture.connectorsService.cacheToken = context.token;
			const options = { query, pageSize: 2 };
			const first = await fixture.service.query(options, CancellationToken.None);
			context.cancel();
			fixture.connectorsService.cacheToken = CancellationToken.None;
			fixture.connectors.splice(0, fixture.connectors.length, createConnector('new-account', 'Mail'));
			await assert.rejects(fixture.service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None), /Start a new search/);
			const readsBeforeNewSearch = [fixture.nativeRequests.length, fixture.connectorCalls.length];
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
		const calls: ICustomizationMarketplaceSourceQuery[] = [];
		const configuration = createConfiguration(['agentFinder']);
		const harnessProvider: ICustomizationMarketplaceSearchProvider = {
			async query(_session, options) {
				calls.push(options);
				return {
					items: [{
						identifier: options.cursor ? 'second' : 'first', displayName: 'Mail', description: '',
						mediaType: CustomizationMarketplaceMediaType.McpServer, tags: [], capabilities: [], representativeQueries: [], score: 50,
					}],
					total: 2,
					nextCursor: options.cursor ? undefined : opaque,
				};
			},
		};
		const service = createService(configuration, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.McpGallery];
			override async query() { return { items: [] }; }
		}(), new class extends mock<ICopilotConnectorsService>() { }(), harnessProvider);
		const first = await service.query({ query: 'mail', pageSize: 1 }, CancellationToken.None);
		const second = await service.query({ query: 'mail', pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			calls,
			items: [first, second].flatMap(page => page.items.map(item => [item.identifier, item.installation])),
			exposesBackendCursor: first.nextCursor?.token === opaque,
		}, {
			calls: [
				{ query: 'mail', mediaType: undefined, pageSize: 1, cursor: undefined },
				{ query: 'mail', mediaType: undefined, pageSize: 1, cursor: opaque },
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


	test('activating strict marketplace policy cancels an in-flight public feed query', async () => {
		const configuration = createConfiguration(['agentFinder']);
		const publicResponse = new DeferredPromise<ICustomizationMarketplaceSourcePage>();
		const tokens: CancellationToken[] = [];
		let publicCalls = 0;
		const harnessProvider: ICustomizationMarketplaceSearchProvider = {
			query(_session, _options, token) {
				publicCalls++;
				tokens.push(token);
				return publicResponse.p;
			},
		};
		const service = createService(configuration, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.McpGallery];
			override async query() { return { items: [] }; }
		}(), new class extends mock<ICopilotConnectorsService>() { }(), harnessProvider);
		const pending = service.query({ sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id] }, CancellationToken.None);
		const cancelled = assert.rejects(pending, isCancellationError);
		await configuration.setUserConfiguration(ChatConfiguration.StrictMarketplaces, []);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === ChatConfiguration.StrictMarketplaces; }
		}());
		await cancelled;
		await publicResponse.complete({ items: [] });
		await assert.rejects(service.query({ sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id] }, CancellationToken.None), isCancellationError);
		assert.deepStrictEqual({
			publicCalls,
			tokensCancelled: tokens.map(token => token.isCancellationRequested),
			sources: service.sources.map(source => source.id),
			listening: configuration.onDidChangeConfigurationEmitter.hasListeners(),
		}, {
			publicCalls: 1,
			tokensCancelled: [true],
			sources: [CustomizationMarketplaceSources.McpGallery.id, CustomizationMarketplaceSources.CopilotConnectors.id],
			listening: false,
		});
	});


	test('effective source changes cancel both transports, while unchanged settings preserve the request', async () => {
		const configuration = createConfiguration(['agentFinder', 'copilotConnectors']);
		const publicResponse = new DeferredPromise<ICustomizationMarketplaceSourcePage>();
		const connectorResponse = new DeferredPromise<readonly ICopilotConnector[]>();
		const tokens: CancellationToken[] = [];
		const harnessProvider: ICustomizationMarketplaceSearchProvider = {
			query(_session, _options, token) {
				tokens.push(token);
				return publicResponse.p;
			},
		};
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			override async getConnectorsSnapshot(token: CancellationToken) {
				tokens.push(token);
				return { connectors: await connectorResponse.p, cacheToken: CancellationToken.None };
			}
		}();
		const service = createService(configuration, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = [CustomizationMarketplaceSources.McpGallery];
			override async query() { return { items: [] }; }
		}(), connectorsService, harnessProvider);
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


	test('unreachable connectors do not prevent harness catalog pagination', async () => {
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
			connectorCalls: unavailable.callCount,
		}, {
			ids: fixture.publicEntries.map(item => item.identifier),
			lengths: [24, 21],
			errors: Array.from({ length: 2 }, () => [{ sourceId: 'copilotConnectors', message: 'Connector catalog unavailable' }]),
			totals: [undefined, undefined],
			connectorCalls: 1,
		});
	});


	for (const partial of [false, true]) {
		test(`preserves ${partial ? 'partial' : 'empty'} harness catalog failures`, async () => {
			const configuration = createConfiguration(['agentFinder', 'copilotConnectors']);
			const harnessProvider: ICustomizationMarketplaceSearchProvider = {
				query: async (_session, options) => {
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
			};
			const connectorsService = new class extends mock<ICopilotConnectorsService>() {
				override async getConnectorsSnapshot() {
					return { connectors: [createConnector('mail', 'Mail')], cacheToken: CancellationToken.None };
				}
			}();
			const page = await createService(configuration, new class extends mock<ICustomizationMarketplaceService>() {
				override readonly sources = [CustomizationMarketplaceSources.McpGallery];
				override async query() { return { items: [] }; }
			}(), connectorsService, harnessProvider).query({ query: 'mail', pageSize: 24 }, CancellationToken.None);
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
