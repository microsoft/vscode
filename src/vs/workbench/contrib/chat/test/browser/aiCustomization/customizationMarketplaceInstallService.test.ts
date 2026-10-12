/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { isEqual, joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource, ICustomizationMarketplaceService } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IPlatformCustomizationMarketplaceService } from '../../../../../../platform/customizationMarketplace/common/platformCustomizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IGalleryMcpServer, mcpGalleryServiceUrlConfig } from '../../../../../../platform/mcp/common/mcpManagement.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService } from '../../../../../../platform/mcp/common/mcpGalleryManifest.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpServerInstallState } from '../../../../mcp/common/mcpTypes.js';
import { CopilotConnectorsError } from '../../../../../../platform/copilotConnectors/common/copilotConnectorsRequestService.js';
import { CopilotConnectorConnectionStatus, CopilotConnectorConnectionStatusDetail, ICopilotConnectorAccount, ICopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { IWorkbenchLocalMcpServer } from '../../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { CustomizationMarketplaceInstallService } from '../../../browser/aiCustomization/customizationMarketplaceInstallService.js';
import { CustomizationMarketplaceWorkbenchService } from '../../../browser/aiCustomization/customizationMarketplaceWorkbenchService.js';
import { getPluginCustomizationMarketplaceSourceId, getPluginMarketplaceIdentifier } from '../../../browser/aiCustomization/pluginCustomizationMarketplaceProvider.js';
import { ICustomizationMarketplaceInstallProvider, ICustomizationMarketplaceInstallService, IRecordedCustomizationMarketplaceResource } from '../../../common/customizationMarketplaceInstallService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { IEnablementModel } from '../../../common/enablement.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { IMarketplaceInstalledPlugin, IMarketplaceReference, IPluginMarketplaceService, IMarketplacePlugin, IPluginSourceDescriptor, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { SKILL_FILENAME } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';

const skillDestination = URI.file('/workspace/.github/skills/demo-skill');
const connectorInstallationTarget = { kind: 'copilotConnector', name: 'mail' } as const;
const mcpGalleryTestSetting = 'test.marketplace.gallerySource.enabled';
const sources = [
	{ id: 'testSource', enablementSetting: CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled },
	{ id: 'copilotConnectors', enablementSetting: CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled },
	{ id: 'anotherSource', enablementSetting: 'test.anotherSource.enabled' },
	{ id: 'otherSource', enablementSetting: 'test.otherSource.enabled' },
	CustomizationMarketplaceSources.PluginMarketplaces,
	{ ...CustomizationMarketplaceSources.McpGallery, enablementSetting: mcpGalleryTestSetting },
];

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

	override publicLog2(eventName?: string, data?: Record<string, unknown>): void {
		if (eventName && data) {
			this.events.push({ name: eventName, data });
		}
	}
}

function resource(overrides: Partial<ICustomizationMarketplaceResource> = {}): ICustomizationMarketplaceResource {
	return {
		sourceId: 'testSource',
		identifier: 'skill-resource',
		displayName: 'Demo Skill',
		description: 'A skill with scripts and assets',
		mediaType: CustomizationMarketplaceMediaType.Skill,
		tags: [],
		capabilities: [],
		representativeQueries: [],
		installation: { kind: 'skill', repository: 'owner/catalog', ref: 'release', path: 'skills/demo-skill' },
		...overrides,
	};
}

function pluginResource(path = 'plugins/demo'): ICustomizationMarketplaceResource {
	return resource({
		identifier: 'plugin-resource',
		mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
		installation: { kind: 'plugin', repository: 'owner/catalog', ref: 'release', path },
	});
}

function configuredPluginResource(plugin: IMarketplacePlugin): ICustomizationMarketplaceResource {
	return resource({
		sourceId: CustomizationMarketplaceSources.PluginMarketplaces.id,
		identifier: getPluginMarketplaceIdentifier(plugin),
		displayName: plugin.name,
		mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
		installation: {
			kind: 'configuredPlugin',
			name: plugin.name,
			marketplace: plugin.marketplaceName,
			marketplaceId: plugin.marketplaceReference.canonicalId,
			marketplaceSource: plugin.marketplaceReference.rawValue,
		},
	});
}

function mcpResource(): ICustomizationMarketplaceResource {
	return resource({
		identifier: 'mcp-resource',
		mediaType: CustomizationMarketplaceMediaType.McpServer,
		version: '1.0.0',
		url: URI.parse('https://untrusted.example/server.json'),
		installation: { kind: 'mcp', name: 'io.example/demo', version: '1.0.0' },
	});
}

function connectorResource(): ICustomizationMarketplaceResource {
	return resource({
		sourceId: 'copilotConnectors',
		identifier: 'mail',
		displayName: 'Mail',
		mediaType: CustomizationMarketplaceMediaType.McpServer,
		installation: { kind: 'copilotConnector', name: 'mail' },
	});
}

function galleryMcpResource(): ICustomizationMarketplaceResource {
	return resource({
		sourceId: CustomizationMarketplaceSources.McpGallery.id,
		identifier: 'gallery-mcp-resource',
		mediaType: CustomizationMarketplaceMediaType.McpServer,
		version: '1.0.0',
		installation: { kind: 'mcpGallery', name: 'io.example/demo', registry: 'custom', registryUrl: 'https://configured.registry.test' },
	});
}

function installedPlugin(sourceDescriptor: IPluginSourceDescriptor, source = 'plugins/demo', version = '1.0.0', pluginUri = URI.file('/cache/installed-plugin'), marketplace = 'owner/catalog#release'): IMarketplaceInstalledPlugin {
	const reference = parseMarketplaceReference(marketplace);
	assert.ok(reference);
	return {
		pluginUri,
		plugin: {
			name: 'demo',
			description: '',
			version,
			source,
			sourceDescriptor,
			marketplace: 'Catalog',
			marketplaceReference: reference,
			marketplaceType: MarketplaceType.Copilot,
		},
	};
}

function mcpServer(name = 'io.example/demo', installState = McpServerInstallState.Uninstalled, galleryName: string | null = name, galleryUrl = 'https://configured.registry.test'): IWorkbenchMcpServer {
	const gallery = new class extends mock<IGalleryMcpServer>() {
		override readonly name = galleryName ?? name;
		override readonly version = '1.0.0';
		override readonly galleryUrl = galleryUrl;
	}();
	return new class extends mock<IWorkbenchMcpServer>() {
		override readonly id = `mcp:${name}:${gallery.version}`;
		override readonly name = name;
		override readonly installState = installState;
		override readonly gallery = galleryName === null ? undefined : gallery;
		override readonly local = installState === McpServerInstallState.Installed ? new class extends mock<IWorkbenchLocalMcpServer>() {
			override readonly name = name;
			override readonly version = '1.0.0';
			override readonly galleryUrl = galleryName === null ? undefined : galleryUrl;
		}() : undefined;
	}();
}

suite('CustomizationMarketplaceInstallService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function recordedResources(service: ICustomizationMarketplaceInstallService): readonly ICustomizationMarketplaceResource[] {
		return service.installations.get().installations.map(installation => installation.resource);
	}

	async function createFixture(options: { enabled?: boolean; otherSourceEnabled?: boolean; installProvider?: ICustomizationMarketplaceInstallProvider; legacyInstallationRecord?: boolean } = { enabled: true }) {
		const instantiationService = store.add(new TestInstantiationService());
		const logService = store.add(new NullLogService());
		const fileService = store.add(new FileService(logService));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const storageService = store.add(new TestStorageService());
		if (options.legacyInstallationRecord) {
			storageService.store('chat.customizations.marketplace.installationRecord.v1.legacy', '{}', StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		const installedPlugins = observableValue<readonly IMarketplaceInstalledPlugin[]>('installedPlugins', []);
		const marketplaceChanges = store.add(new Emitter<void>());
		const marketplaceService = new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = marketplaceChanges.event;
			readCount = 0;
			availablePlugins: IMarketplaceInstalledPlugin['plugin'][] = [];
			strictMarketplacePolicy = false;
			override async fetchMarketplacePlugins() { return this.availablePlugins; }
			override isStrictMarketplacePolicyActive() { return this.strictMarketplacePolicy; }
			references: IMarketplaceReference[] | undefined;
			override getMarketplaceReferences() { return this.references ?? this.availablePlugins.map(plugin => plugin.marketplaceReference); }
			override get installedPlugins() {
				this.readCount++;
				return installedPlugins;
			}
		}();
		const agentPlugins = observableValue<readonly IAgentPlugin[]>('agentPlugins', []);
		const agentPluginService = new class extends mock<IAgentPluginService>() {
			override readonly plugins = agentPlugins;
			override readonly enablementModel = new class extends mock<IEnablementModel>() { }();
		}();
		const pluginService = new class extends mock<IPluginInstallService>() {
			readonly directInstalls: IMarketplaceInstalledPlugin['plugin'][] = [];
			readonly uninstalls: URI[] = [];
			readonly trustChecks: IMarketplaceReference[] = [];
			trustResult = true;
			onDirectInstall: ((token: CancellationToken | undefined) => Promise<void>) | undefined;
			override async ensureMarketplaceTrusted(reference: IMarketplaceReference): Promise<boolean> {
				this.trustChecks.push(reference);
				return this.trustResult;
			}
			override async installPlugin(plugin: IMarketplaceInstalledPlugin['plugin'], token?: CancellationToken) {
				this.directInstalls.push(plugin);
				await this.onDirectInstall?.(token);
				await this.createInstalledPluginDirectory(plugin);
			}
			override async uninstallPlugin(pluginUri: URI): Promise<boolean> {
				this.uninstalls.push(pluginUri);
				const current = installedPlugins.get();
				if (!current.some(candidate => isEqual(candidate.pluginUri, pluginUri))) {
					return false;
				}
				installedPlugins.set(current.filter(candidate => !isEqual(candidate.pluginUri, pluginUri)), undefined);
				return true;
			}
			override getPluginInstallUri(plugin: IMarketplacePlugin): URI {
				return installedPlugins.get().find(entry => entry.plugin === plugin)?.pluginUri ?? URI.file('/cache/missing-plugin');
			}
			private async createInstalledPluginDirectory(plugin: IMarketplacePlugin): Promise<void> {
				const installed = installedPlugins.get().find(entry => entry.plugin === plugin);
				if (installed) {
					await fileService.createFolder(installed.pluginUri);
				}
			}
		}();
		const mcpChanges = store.add(new Emitter<IWorkbenchMcpServer | undefined>());
		const mcpService = new class extends mock<IMcpWorkbenchService>() {
			override readonly onChange = mcpChanges.event;
			override readonly onReset = Event.None;
			override local: IWorkbenchMcpServer[] = [];
			readonly configuredGalleryLookups: string[] = [];
			readonly galleryLookupManifests: (string | undefined)[] = [];
			readonly eligibilityChecks: IWorkbenchMcpServer[] = [];
			readonly installs: IWorkbenchMcpServer[] = [];
			readonly uninstalls: IWorkbenchMcpServer[] = [];
			galleryServer: IWorkbenchMcpServer | undefined = mcpServer();
			eligibility: true | IMarkdownString = true;
			installError: Error | undefined;
			onLookup: (() => Promise<IWorkbenchMcpServer | undefined>) | undefined;
			override async getMcpServerFromGallery(name: string, manifest?: IMcpGalleryManifest): Promise<IWorkbenchMcpServer | undefined> {
				this.configuredGalleryLookups.push(name);
				this.galleryLookupManifests.push(manifest?.url);
				return this.onLookup ? this.onLookup() : this.galleryServer;
			}
			override canInstall(server: IWorkbenchMcpServer): true | IMarkdownString {
				this.eligibilityChecks.push(server);
				return this.eligibility;
			}
			override async install(server: IWorkbenchMcpServer): Promise<IWorkbenchMcpServer> {
				this.installs.push(server);
				if (this.installError) {
					throw this.installError;
				}
				const installed = mcpServer(server.name, McpServerInstallState.Installed, server.gallery?.name, server.gallery?.galleryUrl);
				this.local = [installed];
				mcpChanges.fire(installed);
				return installed;
			}
			override async uninstall(server: IWorkbenchMcpServer): Promise<void> {
				this.uninstalls.push(server);
				this.local = this.local.filter(candidate => candidate !== server);
				mcpChanges.fire(undefined);
			}
		}();
		const connectorChanges = store.add(new Emitter<void>());
		const connectorAccountChanges = store.add(new Emitter<void>());
		const connectorDisconnected = store.add(new Emitter<string>());
		const connectedConnectors = new Set<string>();
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = connectorChanges.event;
			override readonly onDidChangeAccount = connectorAccountChanges.event;
			override readonly onDidDisconnect = connectorDisconnected.event;
			accountOverride: ICopilotConnectorAccount | undefined = { providerId: 'github', accountName: 'octocat', enterprise: false };
			override get account() { return this.accountOverride; }
			connectionStateKnownOverride = true;
			override get connectionStateKnown() { return this.connectionStateKnownOverride; }
			readonly connectCalls: string[] = [];
			readonly disconnectCalls: string[] = [];
			statusOverride: CopilotConnectorConnectionStatus | undefined;
			statusDetailOverride: CopilotConnectorConnectionStatusDetail | undefined;
			catalogVisible = true;
			onConnect: ((name: string, token: CancellationToken) => Promise<void>) | undefined;
			onDisconnect: ((name: string, token: CancellationToken) => Promise<void>) | undefined;
			override get connectors() {
				return this.catalogVisible ? [{
					name: 'mail',
					displayName: 'Mail',
					description: 'Search mail',
					tags: [],
					keywords: [],
					capabilities: [],
					representativeQueries: [],
					connectionStatus: this.statusOverride ?? (connectedConnectors.has('mail') ? 'connected' as const : 'not_connected' as const),
					connectionStatusDetail: this.statusDetailOverride,
					scopes: [],
					mcpServers: [],
				}] : [];
			}
			override readonly connectedMcpServers = [];
			override async connect(name: string, token: CancellationToken): Promise<void> {
				this.connectCalls.push(name);
				if (this.onConnect) {
					return this.onConnect(name, token);
				}
				connectedConnectors.add(name);
				connectorChanges.fire();
			}
			override async disconnect(name: string, token: CancellationToken): Promise<void> {
				this.disconnectCalls.push(name);
				if (this.onDisconnect) {
					return this.onDisconnect(name, token);
				}
				connectedConnectors.delete(name);
				connectorChanges.fire();
				connectorDisconnected.fire(name);
			}
		}();
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = observableValue(this, 'test-harness');
			override readonly activeSessionResource = observableValue(this, URI.parse('test-harness:///session'));
			override getActiveDescriptor(): IHarnessDescriptor {
				return this.findHarnessById(this.activeHarness.get())!;
			}
			override findHarnessById(id: string): IHarnessDescriptor | undefined {
				return {
					id,
					label: 'Test Harness',
					icon: Codicon.copilot,
					marketplaceInstallProvider: id === 'test-harness' ? options.installProvider : undefined,
				};
			}
		}();
		const sentimentChanges = store.add(new Emitter<void>());
		const entitlementService = new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeSentiment = sentimentChanges.event;
			override readonly sentiment = { hidden: false };
		}();
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.PluginsEnabled]: true,
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: options.enabled === true || options.otherSourceEnabled === true,
			[mcpGalleryServiceUrlConfig]: 'https://configured.registry.test',
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		for (const source of sources) {
			if (source.id === CustomizationMarketplaceSources.PluginMarketplaces.id) {
				continue;
			}
			const enabled = source.id === 'testSource' ? options.enabled : options.otherSourceEnabled ?? options.enabled;
			if (enabled !== undefined) {
				await configurationService.setUserConfiguration(source.enablementSetting, enabled);
			}
		}
		instantiationService.stub(IPluginInstallService, pluginService);
		instantiationService.stub(IPluginMarketplaceService, marketplaceService);
		instantiationService.stub(IAgentPluginService, agentPluginService);
		instantiationService.stub(IMcpWorkbenchService, mcpService);
		instantiationService.stub(ICopilotConnectorsService, connectorsService);
		const mcpGalleryManifestService = new class extends mock<IMcpGalleryManifestService>() {
			customUrl = 'https://configured.registry.test';
			defaultUrl: string | undefined = 'https://api.mcp.github.com';
			override async getMcpGalleryManifest() { return { url: this.customUrl, version: 'v0.1', resources: [] }; }
			override async getDefaultMcpGalleryManifest() { return this.defaultUrl ? { url: this.defaultUrl, version: 'v0.1', resources: [] } : null; }
		}();
		instantiationService.stub(IMcpGalleryManifestService, mcpGalleryManifestService);
		instantiationService.stub(ICustomizationHarnessService, harnessService);
		instantiationService.stub(IChatEntitlementService, entitlementService);
		instantiationService.stub(ICustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override get sources() { return sources.map(source => ({ ...source })); }
		}());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, logService);
		const telemetryService = new TestTelemetryService();
		instantiationService.stub(ITelemetryService, telemetryService);
		instantiationService.stub(IStorageService, storageService);
		const service = store.add(instantiationService.createInstance(CustomizationMarketplaceInstallService));
		return {
			service, instantiationService, fileService, storageService, installedPlugins, marketplaceService, marketplaceChanges, agentPlugins, pluginService, mcpService, mcpChanges,
			connectorsService, connectedConnectors, connectorChanges, connectorAccountChanges, connectorDisconnected, mcpGalleryManifestService, entitlementService, sentimentChanges, configurationService,
			telemetryService,
		};
	}

	function fireConfigurationChange(configurationService: TestConfigurationService, key: string): void {
		configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === key; }
		}());
	}

	async function setSourcesEnabled(configurationService: TestConfigurationService, enabled: boolean, sourceIds = sources.map(source => source.id)): Promise<void> {
		const changedSources = sources.filter(source => sourceIds.includes(source.id));
		for (const source of changedSources) {
			await configurationService.setUserConfiguration(source.enablementSetting, enabled);
		}
		for (const source of changedSources) {
			fireConfigurationChange(configurationService, source.enablementSetting);
		}
	}

	suite('source gates', () => {
		test('observes Connector state only while the experiment is enabled', async () => {
			const fixture = await createFixture({ enabled: false });
			const readListeners = () => ({
				change: fixture.connectorChanges.hasListeners(),
				account: fixture.connectorAccountChanges.hasListeners(),
				disconnect: fixture.connectorDisconnected.hasListeners(),
			});
			const disabled = readListeners();

			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
			fireConfigurationChange(fixture.configurationService, CustomizationMarketplaceConfiguration.MarketplaceEnabled);
			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, true);
			fireConfigurationChange(fixture.configurationService, CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled);
			const enabled = readListeners();

			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, false);
			fireConfigurationChange(fixture.configurationService, CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled);

			assert.deepStrictEqual({ disabled, enabled, disabledAgain: readListeners() }, {
				disabled: { change: false, account: false, disconnect: false },
				enabled: { change: true, account: true, disconnect: true },
				disabledAgain: { change: false, account: false, disconnect: false },
			});
		});
	});


	test('resources without validated installation metadata are unavailable and never invoke installers', async () => {
		const fixture = await createFixture();
		const states = [];
		for (const mediaType of [CustomizationMarketplaceMediaType.Skill, CustomizationMarketplaceMediaType.CopilotPlugin, CustomizationMarketplaceMediaType.McpServer, CustomizationMarketplaceMediaType.CursorPlugin, 'application/unsupported']) {
			const candidate = resource({ mediaType, installation: undefined });
			const state = fixture.service.getInstallState(candidate);
			states.push({ mediaType, kind: state.kind, hasReason: state.kind === 'unavailable' && state.message.length > 0 });
			await assert.rejects(fixture.service.install(candidate), /installation source|Cursor plugins/);
		}
		assert.deepStrictEqual({
			states,
			pluginInstalls: fixture.pluginService.directInstalls,
			mcpLookups: fixture.mcpService.configuredGalleryLookups,
		}, {
			states: [CustomizationMarketplaceMediaType.Skill, CustomizationMarketplaceMediaType.CopilotPlugin, CustomizationMarketplaceMediaType.McpServer, CustomizationMarketplaceMediaType.CursorPlugin, 'application/unsupported']
				.map(mediaType => ({ mediaType, kind: 'unavailable', hasReason: true })),
			pluginInstalls: [],
			mcpLookups: [],
		});
	});

	test('requires a harness provider for SDK catalog installation kinds', async () => {
		const fixture = await createFixture();
		const candidates = [resource(), pluginResource(), mcpResource()];
		assert.deepStrictEqual(candidates.map(candidate => fixture.service.getInstallState(candidate)), candidates.map(() => ({
			kind: 'unavailable',
			message: 'The active agent cannot install this catalog resource.',
		})));
		for (const candidate of candidates) {
			await assert.rejects(fixture.service.install(candidate), /active agent cannot install/);
		}
		assert.deepStrictEqual({
			pluginInstalls: fixture.pluginService.directInstalls,
			mcpLookups: fixture.mcpService.configuredGalleryLookups,
		}, { pluginInstalls: [], mcpLookups: [] });
	});

	test('notifies on installation sources and policy changes, and removes subscriptions on disposal', async () => {
		const fixture = await createFixture();
		const changes: string[] = [];
		let cause = '';
		store.add(fixture.service.onDidChange(() => changes.push(cause)));
		cause = 'plugins';
		fixture.installedPlugins.set([installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', path: 'plugins/demo' })], undefined);
		cause = 'mcp';
		fixture.mcpChanges.fire(undefined);
		cause = 'entitlement';
		fixture.sentimentChanges.fire();
		cause = 'configuration';
		fireConfigurationChange(fixture.configurationService, ChatConfiguration.PluginsEnabled);
		cause = 'irrelevant configuration';
		fireConfigurationChange(fixture.configurationService, 'editor.fontSize');
		fixture.service.dispose();
		cause = 'disposed';
		fixture.installedPlugins.set([], undefined);
		fixture.mcpChanges.fire(undefined);
		fixture.sentimentChanges.fire();
		fireConfigurationChange(fixture.configurationService, ChatConfiguration.PluginsEnabled);
		assert.deepStrictEqual(changes, ['plugins', 'mcp', 'entitlement', 'configuration']);
	});

	test('uses provider inventory as authority and enriches it with observed catalog icons without persistence', async () => {
		const providerChanges = store.add(new Emitter<void>());
		const candidate = resource({ version: '1.0.0', icon: URI.parse('https://example.com/skill.png') });
		const providerResource: ICustomizationMarketplaceResource = { ...candidate, icon: undefined };
		const provider = new class implements ICustomizationMarketplaceInstallProvider {
			readonly onDidChange = providerChanges.event;
			readonly installations = [{
				installationId: 'sdk-skill',
				resource: providerResource,
				state: { kind: 'installed' as const, target: { kind: 'skill' as const, uri: joinPath(skillDestination, SKILL_FILENAME), name: 'demo-skill' } },
			}];
			getInstallations(): Promise<typeof this.installations> { return Promise.resolve(this.installations); }
			install(): Promise<void> { throw new Error('Unexpected install'); }
			repair(): Promise<void> { throw new Error('Unexpected repair'); }
			uninstall(): Promise<void> { throw new Error('Unexpected uninstall'); }
		}();
		const fixture = await createFixture({ enabled: true, installProvider: provider, legacyInstallationRecord: true });
		await timeout(0);

		const state = fixture.service.getInstallState(candidate);
		await timeout(0);
		const associated = fixture.service.installations.get().findByResource(candidate);
		const storageKeys = fixture.storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE)
			.filter(key => key.includes('customizations.marketplace.installationRecord'));

		assert.deepStrictEqual({
			state: {
				kind: state.kind,
				target: state.kind === 'installed' ? {
					...state.target,
					uri: state.target.kind === 'skill' || state.target.kind === 'plugin' ? state.target.uri?.toString() : undefined,
				} : undefined,
			},
			installationId: associated?.installationId,
			icon: URI.isUri(associated?.resource.icon) ? associated.resource.icon.toString() : undefined,
			storageKeys,
		}, {
			state: { kind: 'installed', target: { kind: 'skill', uri: joinPath(skillDestination, SKILL_FILENAME).toString(), name: 'demo-skill' } },
			installationId: 'sdk-skill',
			icon: 'https://example.com/skill.png',
			storageKeys: [],
		});
	});

	test('joins a Registry receipt URN to its exact catalog card URL', async () => {
		const itemUrl = 'https://api.mcp.github.com/oss/v0.1/servers/com.figma.mcp%2Fmcp/versions/latest';
		const candidate = resource({
			sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
			identifier: itemUrl,
			displayName: 'Figma MCP Server',
			description: 'Use Figma design context.',
			mediaType: CustomizationMarketplaceMediaType.McpServer,
			icon: URI.parse('https://example.com/figma.png'),
			installation: { kind: 'providerCatalog', resourceKind: 'mcp', selectionId: 'figma', itemUrl },
		});
		const providerResource: ICustomizationMarketplaceResource = {
			...candidate,
			identifier: 'urn:air:api.mcp.github.com:com.figma.mcp:mcp',
			icon: undefined,
			installation: undefined,
		};
		const provider = new class implements ICustomizationMarketplaceInstallProvider {
			readonly onDidChange = Event.None;
			getInstallations(): Promise<readonly IRecordedCustomizationMarketplaceResource[]> {
				return Promise.resolve([{
					installationId: 'figma-installation',
					resource: providerResource,
					state: { kind: 'installed', target: { kind: 'mcp', name: 'com.figma.mcp/mcp' } },
				}]);
			}
			install(): Promise<void> { throw new Error('Unexpected install'); }
			repair(): Promise<void> { throw new Error('Unexpected repair'); }
			uninstall(): Promise<void> { throw new Error('Unexpected uninstall'); }
		}();
		const fixture = await createFixture({ enabled: true, installProvider: provider });
		await timeout(0);

		fixture.service.getInstallState(providerResource);
		const state = fixture.service.getInstallState(candidate);
		await timeout(0);
		const snapshot = fixture.service.installations.get();
		const associated = snapshot.findByResource(candidate);

		assert.deepStrictEqual({
			state,
			installationCount: snapshot.installations.length,
			installationId: associated?.installationId,
			resourceIdentifier: associated?.resource.identifier,
			icon: URI.isUri(associated?.resource.icon) ? associated.resource.icon.toString() : undefined,
		}, {
			state: { kind: 'installed', target: { kind: 'mcp', name: 'com.figma.mcp/mcp' } },
			installationCount: 1,
			installationId: 'figma-installation',
			resourceIdentifier: itemUrl,
			icon: 'https://example.com/figma.png',
		});
	});

	test('routes install, repair, and uninstall through the active harness provider', async () => {
		const calls: string[] = [];
		const changes = store.add(new Emitter<void>());
		const candidate = resource();
		let installed = false;
		let state: 'installed' | 'missing' = 'installed';
		const provider = new class implements ICustomizationMarketplaceInstallProvider {
			readonly onDidChange = changes.event;
			getInstallations() {
				return Promise.resolve(installed ? [{
					installationId: 'sdk-skill',
					resource: candidate,
					state: { kind: state, target: { kind: 'skill' as const, uri: joinPath(skillDestination, SKILL_FILENAME), name: 'demo-skill' } },
				}] : []);
			}
			async install(): Promise<void> { calls.push('install'); installed = true; state = 'installed'; }
			async repair(): Promise<void> { calls.push('repair'); state = 'installed'; }
			async uninstall(): Promise<void> { calls.push('uninstall'); installed = false; }
		}();
		const fixture = await createFixture({ enabled: true, installProvider: provider });
		await timeout(0);

		await fixture.service.install(candidate);
		state = 'missing';
		changes.fire();
		await timeout(0);
		await fixture.service.repair(candidate);
		await fixture.service.uninstall(candidate);

		assert.deepStrictEqual({ calls, state: fixture.service.getInstallState(candidate).kind }, {
			calls: ['install', 'repair', 'uninstall'],
			state: 'available',
		});
	});

	test('treats provider inventory absence as authoritative over Local plugin and MCP discovery', async () => {
		const provider = new class implements ICustomizationMarketplaceInstallProvider {
			readonly onDidChange = Event.None;
			getInstallations() { return Promise.resolve([]); }
			install(): Promise<void> { throw new Error('Unexpected install'); }
			repair(): Promise<void> { throw new Error('Unexpected repair'); }
			uninstall(): Promise<void> { throw new Error('Unexpected uninstall'); }
		}();
		const fixture = await createFixture({ enabled: true, installProvider: provider });
		const localPlugin = installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', ref: 'release', path: 'plugins/demo' });
		fixture.installedPlugins.set([localPlugin], undefined);
		fixture.mcpService.local = [mcpServer('io.example/demo', McpServerInstallState.Installed)];
		await timeout(0);

		const plugin = pluginResource();
		const mcp = mcpResource();
		const states = [fixture.service.getInstallState(plugin).kind, fixture.service.getInstallState(mcp).kind];
		await fixture.service.uninstall(plugin);
		await fixture.service.uninstall(mcp);

		assert.deepStrictEqual({
			states,
			associations: fixture.service.installations.get().installations.length,
			localPlugins: fixture.installedPlugins.get().length,
			localMcpServers: fixture.mcpService.local.length,
			pluginUninstalls: fixture.pluginService.uninstalls,
			mcpUninstalls: fixture.mcpService.uninstalls,
		}, {
			states: ['available', 'available'],
			associations: 0,
			localPlugins: 1,
			localMcpServers: 1,
			pluginUninstalls: [],
			mcpUninstalls: [],
		});
	});

	test('preserves independently owned gallery and connector state with an active provider', async () => {
		const provider = new class implements ICustomizationMarketplaceInstallProvider {
			readonly onDidChange = Event.None;
			getInstallations() { return Promise.resolve([]); }
			getInstallUnavailableMessage() { return 'Provider catalog unavailable'; }
			install(): Promise<void> { throw new Error('Unexpected install'); }
			repair(): Promise<void> { throw new Error('Unexpected repair'); }
			uninstall(): Promise<void> { throw new Error('Unexpected uninstall'); }
		}();
		const fixture = await createFixture({ enabled: true, installProvider: provider });
		fixture.mcpService.local = [mcpServer('io.example/demo', McpServerInstallState.Installed, 'io.example/demo', fixture.mcpGalleryManifestService.customUrl)];
		fixture.connectedConnectors.add('mail');
		fixture.connectorChanges.fire();
		await timeout(0);

		const gallery = fixture.service.getInstallState(galleryMcpResource());
		const connector = fixture.service.getInstallState(connectorResource());

		assert.deepStrictEqual([gallery.kind, connector.kind], ['installed', 'installed']);
	});

	test('validates SDK-featured plugin marketplace trust before invoking the provider', async () => {
		const installs: ICustomizationMarketplaceResource[] = [];
		const provider = new class implements ICustomizationMarketplaceInstallProvider {
			readonly onDidChange = Event.None;
			getInstallations() { return Promise.resolve([]); }
			async install(_session: URI, resource: ICustomizationMarketplaceResource): Promise<void> { installs.push(resource); }
			repair(): Promise<void> { throw new Error('Unexpected repair'); }
			uninstall(): Promise<void> { throw new Error('Unexpected uninstall'); }
		}();
		const fixture = await createFixture({ enabled: true, installProvider: provider });
		const spoofedPlugin = { ...installedPlugin({ kind: PluginSourceKind.RelativePath, path: 'plugins/demo' }).plugin, name: 'azure', marketplaceName: 'awesome-copilot' };
		fixture.marketplaceService.availablePlugins = [spoofedPlugin];
		const marketplaceReference = parseMarketplaceReference('github/awesome-copilot')!;
		const candidate = resource({
			identifier: '["GitHub: github/awesome-copilot","awesome-copilot","azure"]',
			displayName: 'Azure',
			mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
			installation: { kind: 'providerPlugin', name: 'azure', marketplace: 'awesome-copilot', marketplaceSource: 'GitHub: github/awesome-copilot' },
		});

		await fixture.service.install(candidate);

		assert.deepStrictEqual({
			installs,
			trustChecks: fixture.pluginService.trustChecks.map(reference => reference.canonicalId),
		}, {
			installs: [candidate],
			trustChecks: [marketplaceReference.canonicalId],
		});
	});

	test('does not invoke the provider when SDK-featured plugin marketplace trust is declined', async () => {
		let providerInstalls = 0;
		const provider = new class implements ICustomizationMarketplaceInstallProvider {
			readonly onDidChange = Event.None;
			getInstallations() { return Promise.resolve([]); }
			async install(): Promise<void> { providerInstalls++; }
			repair(): Promise<void> { throw new Error('Unexpected repair'); }
			uninstall(): Promise<void> { throw new Error('Unexpected uninstall'); }
		}();
		const fixture = await createFixture({ enabled: true, installProvider: provider });
		fixture.pluginService.trustResult = false;
		const marketplaceReference = parseMarketplaceReference('github/awesome-copilot')!;
		const candidate = resource({
			identifier: '["GitHub: github/awesome-copilot","awesome-copilot","azure"]',
			displayName: 'Azure',
			mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
			installation: { kind: 'providerPlugin', name: 'azure', marketplace: 'awesome-copilot', marketplaceSource: 'GitHub: github/awesome-copilot' },
		});

		await assert.rejects(fixture.service.install(candidate), isCancellationError);

		assert.deepStrictEqual({
			providerInstalls,
			trustChecks: fixture.pluginService.trustChecks.map(reference => reference.canonicalId),
		}, {
			providerInstalls: 0,
			trustChecks: [marketplaceReference.canonicalId],
		});
	});

	test('passes a policy-filtered SDK-featured marketplace source through the trust gate', async () => {
		let providerInstalls = 0;
		const provider = new class implements ICustomizationMarketplaceInstallProvider {
			readonly onDidChange = Event.None;
			getInstallations() { return Promise.resolve([]); }
			async install(): Promise<void> { providerInstalls++; }
			repair(): Promise<void> { throw new Error('Unexpected repair'); }
			uninstall(): Promise<void> { throw new Error('Unexpected uninstall'); }
		}();
		const fixture = await createFixture({ enabled: true, installProvider: provider });
		fixture.marketplaceService.strictMarketplacePolicy = true;
		fixture.marketplaceService.references = [];
		fixture.pluginService.trustResult = false;
		const marketplaceReference = parseMarketplaceReference('blocked/marketplace')!;
		const candidate = resource({
			identifier: '["GitHub: blocked/marketplace","managed-marketplace","azure"]',
			displayName: 'Azure',
			mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
			installation: { kind: 'providerPlugin', name: 'azure', marketplace: 'managed-marketplace', marketplaceSource: 'GitHub: blocked/marketplace' },
		});

		await assert.rejects(fixture.service.install(candidate), isCancellationError);

		assert.deepStrictEqual({
			providerInstalls,
			trustChecks: fixture.pluginService.trustChecks.map(reference => reference.canonicalId),
		}, {
			providerInstalls: 0,
			trustChecks: [marketplaceReference.canonicalId],
		});
	});

	test('validates configured marketplace trust before invoking the SDK provider', async () => {
		let providerInstalls = 0;
		const provider = new class implements ICustomizationMarketplaceInstallProvider {
			readonly onDidChange = Event.None;
			getInstallations() { return Promise.resolve([]); }
			async install(): Promise<void> { providerInstalls++; }
			repair(): Promise<void> { throw new Error('Unexpected repair'); }
			uninstall(): Promise<void> { throw new Error('Unexpected uninstall'); }
		}();
		const fixture = await createFixture({ enabled: true, installProvider: provider });
		const plugin = { ...installedPlugin({ kind: PluginSourceKind.RelativePath, path: 'plugins/demo' }).plugin, marketplaceName: 'owner-catalog' };
		fixture.marketplaceService.availablePlugins = [plugin];
		const candidate = configuredPluginResource(plugin);
		if (isWeb) {
			await assert.rejects(fixture.service.install(candidate), /not available in VS Code for the Web/);
			assert.deepStrictEqual({ providerInstalls, trustChecks: fixture.pluginService.trustChecks }, { providerInstalls: 0, trustChecks: [] });
			return;
		}

		await fixture.service.install(candidate);

		assert.deepStrictEqual({
			providerInstalls,
			trustChecks: fixture.pluginService.trustChecks.map(reference => reference.canonicalId),
		}, {
			providerInstalls: 1,
			trustChecks: [plugin.marketplaceReference.canonicalId],
		});
	});

	test('blocks stale configured marketplaces under strict policy before invoking the SDK provider', async () => {
		let providerInstalls = 0;
		const provider = new class implements ICustomizationMarketplaceInstallProvider {
			readonly onDidChange = Event.None;
			getInstallations() { return Promise.resolve([]); }
			async install(): Promise<void> { providerInstalls++; }
			repair(): Promise<void> { throw new Error('Unexpected repair'); }
			uninstall(): Promise<void> { throw new Error('Unexpected uninstall'); }
		}();
		const fixture = await createFixture({ enabled: true, installProvider: provider });
		const plugin = { ...installedPlugin({ kind: PluginSourceKind.RelativePath, path: 'plugins/demo' }).plugin, marketplaceName: 'owner-catalog' };
		fixture.marketplaceService.strictMarketplacePolicy = true;
		fixture.pluginService.trustResult = false;
		const candidate = configuredPluginResource(plugin);
		if (isWeb) {
			await assert.rejects(fixture.service.install(candidate), /not available in VS Code for the Web/);
			assert.deepStrictEqual({ providerInstalls, trustChecks: fixture.pluginService.trustChecks }, { providerInstalls: 0, trustChecks: [] });
			return;
		}

		await assert.rejects(fixture.service.install(candidate), isCancellationError);

		assert.deepStrictEqual({
			providerInstalls,
			trustChecks: fixture.pluginService.trustChecks.map(reference => reference.canonicalId),
		}, {
			providerInstalls: 0,
			trustChecks: [plugin.marketplaceReference.canonicalId],
		});
	});

	test('keeps only the newest provider inventory response', async () => {
		const changes = store.add(new Emitter<void>());
		const candidate = resource();
		const first = new DeferredPromise<readonly IRecordedCustomizationMarketplaceResource[]>();
		const second = new DeferredPromise<readonly IRecordedCustomizationMarketplaceResource[]>();
		let requests = 0;
		const provider = new class implements ICustomizationMarketplaceInstallProvider {
			readonly onDidChange = changes.event;
			getInstallations() { return requests++ === 0 ? first.p : second.p; }
			install(): Promise<void> { throw new Error('Unexpected install'); }
			repair(): Promise<void> { throw new Error('Unexpected repair'); }
			uninstall(): Promise<void> { throw new Error('Unexpected uninstall'); }
		}();
		const fixture = await createFixture({ enabled: true, installProvider: provider });
		changes.fire();
		await timeout(0);
		second.complete([{
			installationId: 'sdk-skill',
			resource: candidate,
			state: { kind: 'installed', target: { kind: 'skill', name: 'demo-skill' } },
		}]);
		await timeout(0);
		first.complete([{
			installationId: 'sdk-skill',
			resource: candidate,
			state: { kind: 'missing', target: { kind: 'skill', name: 'demo-skill' } },
		}]);
		await timeout(0);

		assert.deepStrictEqual({ requests, state: fixture.service.getInstallState(candidate).kind }, { requests: 2, state: 'installed' });
	});

	test('surfaces provider installation limitations before invoking it', async () => {
		let installs = 0;
		const provider = new class implements ICustomizationMarketplaceInstallProvider {
			readonly onDidChange = Event.None;
			getInstallations() { return Promise.resolve([]); }
			getInstallUnavailableMessage() { return 'Pinned SDK plugin installation is unavailable.'; }
			async install(): Promise<void> { installs++; }
			repair(): Promise<void> { throw new Error('Unexpected repair'); }
			uninstall(): Promise<void> { throw new Error('Unexpected uninstall'); }
		}();
		const fixture = await createFixture({ enabled: true, installProvider: provider });
		const candidate = pluginResource();
		await timeout(0);

		assert.deepStrictEqual(fixture.service.getInstallState(candidate), {
			kind: 'unavailable',
			message: 'Pinned SDK plugin installation is unavailable.',
		});
		await assert.rejects(fixture.service.install(candidate), /Pinned SDK plugin installation is unavailable/);
		assert.strictEqual(installs, 0);
	});


	suite('plugins', () => {
		test('installs from a marketplace added after constructing the workbench marketplace service', async () => {
			const fixture = await createFixture();
			fixture.service.dispose();
			fixture.instantiationService.stub(IPlatformCustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
				override readonly sources = [];
				override readonly allSources = [];
				override readonly onDidChangeSources = Event.None;
				override async query() { return { items: [] }; }
			}());
			const marketplaceService = store.add(fixture.instantiationService.createInstance(CustomizationMarketplaceWorkbenchService));
			fixture.instantiationService.stub(ICustomizationMarketplaceService, marketplaceService);
			const installService = store.add(fixture.instantiationService.createInstance(CustomizationMarketplaceInstallService));
			const plugin = installedPlugin({ kind: PluginSourceKind.RelativePath, path: 'plugins/demo' });
			fixture.marketplaceService.references = [plugin.plugin.marketplaceReference];
			fixture.marketplaceService.availablePlugins = [plugin.plugin];
			fixture.pluginService.onDirectInstall = async () => fixture.installedPlugins.set([plugin], undefined);
			fixture.marketplaceChanges.fire();
			const candidate = resource({
				sourceId: getPluginCustomizationMarketplaceSourceId(plugin.plugin.marketplaceReference),
				identifier: getPluginMarketplaceIdentifier(plugin.plugin),
				displayName: plugin.plugin.name,
				mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
				installation: { kind: 'configuredPlugin' },
			});

			if (isWeb) {
				await assert.rejects(installService.install(candidate), /not available in VS Code for the Web/);
				return;
			}
			await installService.install(candidate);

			assert.deepStrictEqual({
				state: installService.getInstallState(candidate).kind,
				installs: fixture.pluginService.directInstalls,
				sourceNames: marketplaceService.allSources.map(source => source.displayName ?? source.id),
			}, {
				state: 'installed',
				installs: [plugin.plugin],
				sourceNames: ['Configured Plugin Marketplaces', plugin.plugin.marketplaceReference.displayLabel, 'GitHub Feed', 'Copilot Connectors'],
			});
		});

		test('configured marketplace entries install through the plugin trust path only while Marketplace is enabled', async () => {
			const fixture = await createFixture();
			const plugin = installedPlugin({ kind: PluginSourceKind.RelativePath, path: 'plugins/demo' });
			fixture.marketplaceService.availablePlugins = [plugin.plugin];
			const candidate = resource({
				sourceId: CustomizationMarketplaceSources.PluginMarketplaces.id,
				identifier: getPluginMarketplaceIdentifier(plugin.plugin),
				displayName: plugin.plugin.name,
				mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
				installation: { kind: 'configuredPlugin' },
			});
			fixture.pluginService.onDirectInstall = async () => fixture.installedPlugins.set([plugin], undefined);
			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, false);
			const disabled = fixture.service.getInstallState(candidate);
			await assert.rejects(fixture.service.install(candidate), /Enable the customization marketplace/);
			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
			const available = fixture.service.getInstallState(candidate);
			if (isWeb) {
				await assert.rejects(fixture.service.install(candidate), /not available in VS Code for the Web/);
				assert.deepStrictEqual({
					disabled, available, directInstalls: fixture.pluginService.directInstalls,
				}, {
					disabled: { kind: 'unavailable', message: 'Enable the customization marketplace to install this resource.' },
					available: { kind: 'unavailable', message: 'Installing configured marketplace plugins is not available in VS Code for the Web.' },
					directInstalls: [],
				});
				return;
			}
			await fixture.service.install(candidate);
			fixture.service.dispose();
			const restored = store.add(fixture.instantiationService.createInstance(CustomizationMarketplaceInstallService));
			await timeout(0);
			const installed = restored.getInstallState(candidate);
			assert.deepStrictEqual({
				disabled, available, installed,
				directInstalls: fixture.pluginService.directInstalls,
				recordedInstallations: recordedResources(restored).map(resource => resource.installation),
			}, {
				disabled: { kind: 'unavailable', message: 'Enable the customization marketplace to install this resource.' },
				available: { kind: 'available' },
				installed: { kind: 'installed', target: { kind: 'plugin', uri: plugin.pluginUri } },
				directInstalls: [plugin.plugin],
				recordedInstallations: [{ kind: 'configuredPlugin' }],
			});
		});

		test('does not record a configured marketplace plugin when the existing installer does not register it', async () => {
			const fixture = await createFixture();
			const plugin = installedPlugin({ kind: PluginSourceKind.RelativePath, path: 'plugins/demo' }).plugin;
			fixture.marketplaceService.availablePlugins = [plugin];
			const candidate = resource({
				sourceId: CustomizationMarketplaceSources.PluginMarketplaces.id,
				identifier: getPluginMarketplaceIdentifier(plugin),
				displayName: plugin.name,
				mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
				installation: { kind: 'configuredPlugin' },
			});
			if (isWeb) {
				await assert.rejects(fixture.service.install(candidate), /not available in VS Code for the Web/);
				return;
			}
			await assert.rejects(fixture.service.install(candidate), /could not be installed/);
			assert.deepStrictEqual({
				directInstalls: fixture.pluginService.directInstalls,
				records: recordedResources(fixture.service),
			}, {
				directInstalls: [plugin],
				records: [],
			});
		});

		test('rejects stale configured marketplace entries rather than guessing a repository', async () => {
			const fixture = await createFixture();
			const candidate = resource({
				sourceId: CustomizationMarketplaceSources.PluginMarketplaces.id,
				identifier: 'stale',
				mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
				installation: { kind: 'configuredPlugin' },
			});
			await assert.rejects(fixture.service.install(candidate), /no longer available/);
			assert.deepStrictEqual(fixture.pluginService.directInstalls, []);
		});

		test('passes Marketplace-disable cancellation through to the existing plugin installer', async () => {
			const fixture = await createFixture();
			const plugin = installedPlugin({ kind: PluginSourceKind.RelativePath, path: 'plugins/demo' }).plugin;
			fixture.marketplaceService.availablePlugins = [plugin];
			const candidate = resource({
				sourceId: CustomizationMarketplaceSources.PluginMarketplaces.id,
				identifier: getPluginMarketplaceIdentifier(plugin),
				mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
				installation: { kind: 'configuredPlugin' },
			});
			if (isWeb) {
				await assert.rejects(fixture.service.install(candidate), /not available in VS Code for the Web/);
				assert.deepStrictEqual(fixture.pluginService.directInstalls, []);
				return;
			}
			const started = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			let installerToken: CancellationToken | undefined;
			fixture.pluginService.onDirectInstall = async token => {
				installerToken = token;
				await started.complete();
				await release.p;
			};
			const install = fixture.service.install(candidate);
			await started.p;
			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, false);
			fireConfigurationChange(fixture.configurationService, CustomizationMarketplaceConfiguration.MarketplaceEnabled);
			const cancelledBeforeInstallerResolves = installerToken?.isCancellationRequested;
			await release.complete();
			await assert.rejects(install, isCancellationError);
			assert.deepStrictEqual({
				calls: fixture.pluginService.directInstalls.length,
				cancelledBeforeInstallerResolves,
				state: fixture.service.getInstallState(candidate).kind,
			}, { calls: 1, cancelledBeforeInstallerResolves: true, state: 'unavailable' });
		});

		for (const change of ['configured marketplaces', 'strict policy'] as const) {
			test(`cancels an install when its ${change} change`, async () => {
				const fixture = await createFixture();
				const plugin = installedPlugin({ kind: PluginSourceKind.RelativePath, path: 'plugins/demo' }).plugin;
				fixture.marketplaceService.availablePlugins = [plugin];
				const candidate = resource({
					sourceId: CustomizationMarketplaceSources.PluginMarketplaces.id,
					identifier: getPluginMarketplaceIdentifier(plugin),
					mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
					installation: { kind: 'configuredPlugin' },
				});
				if (isWeb) {
					await assert.rejects(fixture.service.install(candidate), /not available in VS Code for the Web/);
					assert.deepStrictEqual(fixture.pluginService.directInstalls, []);
					return;
				}
				const started = new DeferredPromise<void>();
				const release = new DeferredPromise<void>();
				let installerToken: CancellationToken | undefined;
				fixture.pluginService.onDirectInstall = async token => {
					installerToken = token;
					await started.complete();
					await release.p;
				};
				const install = fixture.service.install(candidate);
				await started.p;
				if (change === 'configured marketplaces') {
					fixture.marketplaceChanges.fire();
				} else {
					fireConfigurationChange(fixture.configurationService, ChatConfiguration.StrictMarketplaces);
				}
				const cancelledBeforeInstallerResolves = installerToken?.isCancellationRequested;
				await release.complete();
				await assert.rejects(install, isCancellationError);
				assert.deepStrictEqual({
					calls: fixture.pluginService.directInstalls.length,
					cancelledBeforeInstallerResolves,
				}, { calls: 1, cancelledBeforeInstallerResolves: true });
			});
		}

	});

	suite('MCP servers', () => {
		test('installs default gallery entries independently of the SDK GitHub Feed setting', async () => {
			const fixture = await createFixture({ enabled: false, otherSourceEnabled: true });
			const candidate = {
				...galleryMcpResource(), sourceId: CustomizationMarketplaceSources.McpGallery.id,
				installation: { kind: 'mcpGallery' as const, name: 'io.example/demo', registry: 'default' as const, registryUrl: 'https://api.mcp.github.com' }
			};
			fixture.mcpService.galleryServer = mcpServer('io.example/demo', McpServerInstallState.Uninstalled, 'io.example/demo', 'https://api.mcp.github.com');
			await fixture.service.install(candidate);
			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, true);
			const state = fixture.service.getInstallState(candidate);
			await fixture.service.install(candidate);
			assert.deepStrictEqual({
				state,
				lookups: fixture.mcpService.configuredGalleryLookups,
				manifests: fixture.mcpService.galleryLookupManifests,
				installs: fixture.mcpService.installs.length,
			}, {
				state: { kind: 'installed', target: { kind: 'mcp', id: 'mcp:io.example/demo:1.0.0' } },
				lookups: ['io.example/demo'],
				manifests: ['https://api.mcp.github.com'],
				installs: 1,
			});
		});

		test('installs an active gallery entry when no product gallery is declared', async () => {
			const fixture = await createFixture({ enabled: false, otherSourceEnabled: true });
			const activeUrl = 'https://active.registry.test';
			fixture.mcpGalleryManifestService.customUrl = activeUrl;
			fixture.mcpGalleryManifestService.defaultUrl = undefined;
			fixture.mcpService.galleryServer = mcpServer('io.example/demo', McpServerInstallState.Uninstalled, 'io.example/demo', activeUrl);
			const candidate = {
				...galleryMcpResource(),
				installation: { kind: 'mcpGallery' as const, name: 'io.example/demo', registry: 'default' as const, registryUrl: activeUrl }
			};
			await fixture.service.install(candidate);
			assert.deepStrictEqual({
				lookups: fixture.mcpService.configuredGalleryLookups,
				manifests: fixture.mcpService.galleryLookupManifests,
				installs: fixture.mcpService.installs.length,
			}, {
				lookups: ['io.example/demo'],
				manifests: [activeUrl],
				installs: 1,
			});
		});

		test('resolves gallery items only through the configured registry and leaves provider catalog items unavailable', async () => {
			const fixture = await createFixture();
			const candidate = galleryMcpResource();
			fixture.mcpService.galleryServer = mcpServer('io.example/demo', McpServerInstallState.Uninstalled, 'io.example/demo', 'https://configured.registry.test');
			await fixture.service.install(candidate);
			assert.deepStrictEqual({
				configuredLookups: fixture.mcpService.configuredGalleryLookups,
				installed: fixture.service.getInstallState(candidate).kind,
				feedState: fixture.service.getInstallState(mcpResource()).kind,
			}, {
				configuredLookups: ['io.example/demo'], installed: 'installed', feedState: 'unavailable',
			});
			await fixture.service.uninstall(candidate);
			assert.deepStrictEqual(fixture.mcpService.uninstalls.length, 1);
		});

		test('rejects a mismatched configured gallery server without installing it', async () => {
			const fixture = await createFixture();
			fixture.mcpService.galleryServer = mcpServer('io.example/other', McpServerInstallState.Uninstalled);
			await assert.rejects(fixture.service.install(galleryMcpResource()), /not available in the configured registry/);
			assert.deepStrictEqual({ configuredLookups: fixture.mcpService.configuredGalleryLookups, installs: fixture.mcpService.installs.length }, {
				configuredLookups: ['io.example/demo'], installs: 0,
			});
		});

		test('rejects a stale custom gallery entry after the configured registry changes', async () => {
			const fixture = await createFixture();
			await fixture.configurationService.setUserConfiguration(mcpGalleryServiceUrlConfig, 'https://new.registry.test');
			fixture.mcpGalleryManifestService.customUrl = 'https://new.registry.test';
			const state = fixture.service.getInstallState(galleryMcpResource());
			await assert.rejects(fixture.service.install(galleryMcpResource()), /registry changed/);
			await fixture.service.uninstall(galleryMcpResource());
			assert.deepStrictEqual({
				state,
				configuredLookups: fixture.mcpService.configuredGalleryLookups,
				installs: fixture.mcpService.installs.length,
				uninstalls: fixture.mcpService.uninstalls.length,
			}, {
				state: { kind: 'unavailable', message: 'The MCP registry changed after \'io.example/demo\' was discovered. Refresh Discover and try again.' },
				configuredLookups: [],
				installs: 0,
				uninstalls: 0,
			});
		});

		test('rejects a custom gallery entry while the manifest still identifies the previous registry', async () => {
			const fixture = await createFixture();
			fixture.mcpGalleryManifestService.customUrl = 'https://old.registry.test';
			await assert.rejects(fixture.service.install(galleryMcpResource()), /registry changed/);
			assert.deepStrictEqual({
				configuredLookups: fixture.mcpService.configuredGalleryLookups,
				installs: fixture.mcpService.installs.length,
			}, {
				configuredLookups: [],
				installs: 0,
			});
		});

		test('does not attribute an unproven same-name installation to the configured gallery', async () => {
			const fixture = await createFixture();
			fixture.mcpService.local = [mcpServer('io.example/demo', McpServerInstallState.Installed, null)];
			assert.deepStrictEqual(fixture.service.getInstallState(galleryMcpResource()), { kind: 'available' });
		});

		test('does not attribute or uninstall a same-name custom server from a default gallery entry', async () => {
			const fixture = await createFixture({ enabled: false, otherSourceEnabled: true });
			fixture.mcpService.local = [mcpServer('io.example/demo', McpServerInstallState.Installed, 'io.example/demo', 'https://configured.registry.test')];
			const candidate = {
				...galleryMcpResource(), sourceId: CustomizationMarketplaceSources.McpGallery.id,
				installation: { kind: 'mcpGallery' as const, name: 'io.example/demo', registry: 'default' as const, registryUrl: 'https://api.mcp.github.com' }
			};
			const state = fixture.service.getInstallState(candidate);
			await fixture.service.uninstall(candidate);
			assert.deepStrictEqual({ state, uninstalls: fixture.mcpService.uninstalls.length }, {
				state: { kind: 'available' }, uninstalls: 0,
			});
		});

		test('does not uninstall a same-name server from an old registry after syncing current gallery metadata', async () => {
			const fixture = await createFixture();
			const oldServer = mcpServer('io.example/demo', McpServerInstallState.Installed, 'io.example/demo', 'https://old.registry.test');
			const currentGallery = mcpServer('io.example/demo', McpServerInstallState.Uninstalled, 'io.example/demo', 'https://current.registry.test').gallery;
			fixture.mcpService.local = [{ ...oldServer, gallery: currentGallery }];
			const candidate = galleryMcpResource();
			const state = fixture.service.getInstallState(candidate);
			await fixture.service.uninstall(candidate);
			assert.deepStrictEqual({ state, uninstalls: fixture.mcpService.uninstalls.length }, {
				state: { kind: 'available' }, uninstalls: 0,
			});
		});

	});

	suite('Copilot connectors', () => {
		test('unknown connection status can start an explicit Marketplace connection', async () => {
			const fixture = await createFixture();
			fixture.connectorsService.statusOverride = 'unknown';
			const candidate = connectorResource();
			const state = fixture.service.getInstallState(candidate);
			fixture.connectorsService.onConnect = async name => {
				fixture.connectorsService.statusOverride = undefined;
				fixture.connectedConnectors.add(name);
				fixture.connectorChanges.fire();
			};
			await fixture.service.install(candidate);
			assert.deepStrictEqual({ state, connects: fixture.connectorsService.connectCalls, installed: fixture.service.getInstallState(candidate).kind }, {
				state: { kind: 'available' },
				connects: ['mail'],
				installed: 'installed',
			});
		});

		test('pending and unavailable connectors cannot start duplicate or unactionable connections', async () => {
			const fixture = await createFixture();
			const candidate = connectorResource();
			const states: Array<ReturnType<typeof fixture.service.getInstallState>> = [];
			for (const scenario of [
				{ status: 'pending' as const, detail: undefined },
				{ status: 'error' as const, detail: 'unavailable' as const },
			]) {
				fixture.connectorsService.statusOverride = scenario.status;
				fixture.connectorsService.statusDetailOverride = scenario.detail;
				const state = fixture.service.getInstallState(candidate);
				states.push(state);
				await assert.rejects(fixture.service.install(candidate), /cannot be connected/);
			}
			assert.deepStrictEqual({
				states,
				connects: fixture.connectorsService.connectCalls,
			}, {
				states: [
					{ kind: 'unavailable', message: 'This connector cannot be connected while its status is \'Connection pending\'. Refresh and try again.' },
					{ kind: 'unavailable', message: 'This connector cannot be connected while its status is \'Currently unavailable\'. Refresh and try again.' },
				],
				connects: [],
			});
		});

		test('uninstalls through the connector lifecycle without SDK feed or registry access', async () => {
			const fixture = await createFixture({ enabled: false, otherSourceEnabled: true });
			const candidate = connectorResource();
			await fixture.service.install(candidate);
			const before = fixture.service.getInstallState(candidate);
			await fixture.service.uninstall(candidate);
			await fixture.service.uninstall(candidate);
			assert.deepStrictEqual({
				before,
				disconnects: fixture.connectorsService.disconnectCalls,
				registryLookups: fixture.mcpService.configuredGalleryLookups,
				after: fixture.service.getInstallState(candidate),
				recordedResources: recordedResources(fixture.service),
			}, {
				before: { kind: 'installed', target: connectorInstallationTarget },
				disconnects: ['mail'],
				registryLookups: [],
				after: { kind: 'available' },
				recordedResources: [],
			});
		});

		test('a failed disconnect remains installed and can be retried', async () => {
			const fixture = await createFixture();
			const candidate = connectorResource();
			await fixture.service.install(candidate);
			fixture.connectorsService.onDisconnect = async () => { throw new Error('Disconnect failed'); };
			await assert.rejects(fixture.service.uninstall(candidate), /Disconnect failed/);
			const failed = fixture.service.getInstallState(candidate);
			fixture.connectorsService.onDisconnect = undefined;
			await fixture.service.uninstall(candidate);
			assert.deepStrictEqual({ failed, disconnects: fixture.connectorsService.disconnectCalls, after: fixture.service.getInstallState(candidate) }, {
				failed: { kind: 'installed', target: connectorInstallationTarget }, disconnects: ['mail', 'mail'], after: { kind: 'available' },
			});
		});

		for (const change of ['source disabled', 'AI hidden'] as const) {
			test(`a pending disconnect is deduplicated and cancelled when ${change}`, async () => {
				const fixture = await createFixture();
				const candidate = connectorResource();
				await fixture.service.install(candidate);
				const disconnect = new DeferredPromise<void>();
				let disconnectToken: CancellationToken | undefined;
				fixture.connectorsService.onDisconnect = (_name, token) => {
					disconnectToken = token;
					return disconnect.p;
				};
				const pending = fixture.service.uninstall(candidate);
				const joined = fixture.service.uninstall(candidate);
				const cancelled = Promise.all([assert.rejects(pending, isCancellationError), assert.rejects(joined, isCancellationError)]);
				const during = fixture.service.getInstallState(candidate);
				if (change === 'source disabled') {
					await setSourcesEnabled(fixture.configurationService, false, ['copilotConnectors']);
					await setSourcesEnabled(fixture.configurationService, true, ['copilotConnectors']);
				} else {
					fixture.entitlementService.sentiment.hidden = true;
					fixture.sentimentChanges.fire();
					fixture.entitlementService.sentiment.hidden = false;
					fixture.sentimentChanges.fire();
				}
				await disconnect.complete();
				await cancelled;
				assert.deepStrictEqual({
					during,
					cancelled: disconnectToken?.isCancellationRequested,
					disconnects: fixture.connectorsService.disconnectCalls,
					after: fixture.service.getInstallState(candidate),
				}, {
					during: { kind: 'uninstalling', target: connectorInstallationTarget },
					cancelled: true,
					disconnects: ['mail'],
					after: { kind: 'installed', target: connectorInstallationTarget },
				});
			});
		}

		test('a connector record created during disconnect keeps the operation deduplicated', async () => {
			const fixture = await createFixture();
			const candidate = connectorResource();
			fixture.connectedConnectors.add('mail');
			const disconnect = new DeferredPromise<void>();
			fixture.connectorsService.onDisconnect = async name => {
				await disconnect.p;
				fixture.connectorDisconnected.fire(name);
			};

			const pending = fixture.service.uninstall(candidate);
			fixture.connectorChanges.fire();
			await timeout(0);
			const during = fixture.service.getInstallState(candidate);
			const joined = fixture.service.uninstall(candidate);
			disconnect.complete();
			await Promise.all([pending, joined]);

			assert.deepStrictEqual({
				during,
				disconnects: fixture.connectorsService.disconnectCalls,
				recorded: recordedResources(fixture.service),
			}, {
				during: { kind: 'uninstalling', target: connectorInstallationTarget },
				disconnects: ['mail'],
				recorded: [],
			});
		});

		test('uses the connector consent flow and records the account-scoped connection', async () => {
			const fixture = await createFixture();
			const candidate = connectorResource();
			const before = fixture.service.getInstallState(candidate);

			await fixture.service.install(candidate);
			await fixture.service.install(candidate);

			assert.deepStrictEqual({
				before,
				connectCalls: fixture.connectorsService.connectCalls,
				after: fixture.service.getInstallState(candidate),
				recordedResources: recordedResources(fixture.service).map(resource => ({
					sourceId: resource.sourceId,
					identifier: resource.identifier,
					installation: resource.installation,
				})),
				installationRecordCount: fixture.storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE).filter(key => key.includes('customizations.marketplace.installationRecord.v1')).length,
			}, {
				before: { kind: 'available' },
				connectCalls: ['mail'],
				after: { kind: 'installed', target: connectorInstallationTarget },
				recordedResources: [{
					sourceId: 'copilotConnectors',
					identifier: 'mail',
					installation: { kind: 'copilotConnector', name: 'mail' },
				}],
				installationRecordCount: 0,
			});
		});

		test('retains a previously connected connector when it leaves the catalog', async () => {
			const fixture = await createFixture();
			await fixture.service.install(connectorResource());
			fixture.connectorsService.catalogVisible = false;
			fixture.connectorsService.connectionStateKnownOverride = false;
			fixture.connectorChanges.fire();
			await timeout(0);
			const beforeAuthoritativeCatalog = fixture.service.getInstallState(connectorResource());
			fixture.connectorsService.connectionStateKnownOverride = true;
			fixture.connectorChanges.fire();
			await timeout(0);
			const recorded = recordedResources(fixture.service);
			const state = fixture.service.getInstallState(recorded[0]);

			assert.deepStrictEqual({
				beforeAuthoritativeCatalog,
				recorded: recorded.map(resource => resource.displayName),
				state,
			}, {
				beforeAuthoritativeCatalog: { kind: 'checking', target: connectorInstallationTarget },
				recorded: ['Mail'],
				state: {
					kind: 'missing',
					target: connectorInstallationTarget,
					repairUnavailableMessage: 'This connector is no longer available from the Copilot Connectors catalog.',
				},
			});
		});

		test('records a connector that was already connected outside this workbench', async () => {
			const fixture = await createFixture();
			const recorded = Event.toPromise(Event.filter(fixture.service.onDidChange, () => recordedResources(fixture.service).some(resource => resource.identifier === 'mail')));
			fixture.connectedConnectors.add('mail');
			fixture.connectorChanges.fire();
			await recorded;

			assert.deepStrictEqual({
				recorded: recordedResources(fixture.service).map(resource => resource.identifier),
				state: fixture.service.getInstallState(connectorResource()),
			}, {
				recorded: ['mail'],
				state: { kind: 'installed', target: connectorInstallationTarget },
			});
		});

		test('restores an account-scoped connector record after service recreation', async () => {
			const fixture = await createFixture();
			const candidate = connectorResource();
			await fixture.service.install(candidate);
			fixture.service.dispose();

			const restored = store.add(fixture.instantiationService.createInstance(CustomizationMarketplaceInstallService));
			if (!recordedResources(restored).some(resource => resource.identifier === 'mail')) {
				await Event.toPromise(Event.filter(restored.onDidChange, () => recordedResources(restored).some(resource => resource.identifier === 'mail')));
			}

			assert.deepStrictEqual({
				recorded: recordedResources(restored).map(resource => resource.identifier),
				state: restored.getInstallState(candidate),
			}, {
				recorded: ['mail'],
				state: { kind: 'installed', target: connectorInstallationTarget },
			});
		});

		test('explicitly disconnecting a connector that left the catalog removes its record', async () => {
			const fixture = await createFixture();
			await fixture.service.install(connectorResource());
			fixture.connectorsService.catalogVisible = false;
			fixture.connectorChanges.fire();
			await timeout(0);
			const recorded = recordedResources(fixture.service)[0];

			await fixture.service.uninstall(recorded);

			assert.deepStrictEqual({
				disconnects: fixture.connectorsService.disconnectCalls,
				recorded: recordedResources(fixture.service),
			}, {
				disconnects: [],
				recorded: [],
			});
		});

		test('disconnecting from another connector surface removes the record', async () => {
			const fixture = await createFixture();
			await fixture.service.install(connectorResource());

			await fixture.connectorsService.disconnect('mail', CancellationToken.None);

			assert.deepStrictEqual({
				disconnects: fixture.connectorsService.disconnectCalls,
				recorded: recordedResources(fixture.service),
			}, {
				disconnects: ['mail'],
				recorded: [],
			});
		});

		test('a not-found disconnect removes a stale connector record', async () => {
			const fixture = await createFixture();
			const candidate = connectorResource();
			await fixture.service.install(candidate);
			fixture.connectedConnectors.delete('mail');
			fixture.connectorChanges.fire();
			await timeout(0);
			fixture.connectorsService.onDisconnect = async () => {
				throw new CopilotConnectorsError('Not found', 404);
			};

			await fixture.service.uninstall(candidate);

			assert.deepStrictEqual({
				disconnects: fixture.connectorsService.disconnectCalls,
				recorded: recordedResources(fixture.service),
			}, {
				disconnects: ['mail'],
				recorded: [],
			});
		});

		test('repairs a recorded connector by reconnecting it', async () => {
			const fixture = await createFixture();
			const candidate = connectorResource();
			await fixture.service.install(candidate);
			fixture.connectedConnectors.delete('mail');
			fixture.connectorChanges.fire();
			await timeout(0);
			const before = fixture.service.getInstallState(candidate);

			await fixture.service.repair(candidate);

			assert.deepStrictEqual({
				before,
				connectCalls: fixture.connectorsService.connectCalls,
				after: fixture.service.getInstallState(candidate),
				recorded: recordedResources(fixture.service).map(resource => resource.identifier),
			}, {
				before: { kind: 'missing', target: connectorInstallationTarget, repairUnavailableMessage: undefined },
				connectCalls: ['mail', 'mail'],
				after: { kind: 'installed', target: connectorInstallationTarget },
				recorded: ['mail'],
			});
		});

		test('cancels a pending connector repair and restores the disconnected state', async () => {
			const fixture = await createFixture();
			const candidate = connectorResource();
			await fixture.service.install(candidate);
			fixture.connectedConnectors.delete('mail');
			fixture.connectorChanges.fire();
			await timeout(0);
			let operationToken: CancellationToken | undefined;
			fixture.connectorsService.onConnect = async (_name, token) => new Promise<void>((_resolve, reject) => {
				operationToken = token;
				const listener = token.onCancellationRequested(() => {
					listener.dispose();
					reject(new CancellationError());
				});
			});

			const repair = fixture.service.repair(candidate);
			assert.strictEqual(fixture.service.getInstallState(candidate).kind, 'repairing');
			fixture.service.cancelConnectorOperation(candidate);
			await assert.rejects(repair, isCancellationError);

			assert.deepStrictEqual({
				cancelled: operationToken?.isCancellationRequested,
				state: fixture.service.getInstallState(candidate),
			}, {
				cancelled: true,
				state: { kind: 'missing', target: connectorInstallationTarget, repairUnavailableMessage: undefined },
			});
		});

		test('shows connector records only for the account that created them', async () => {
			const fixture = await createFixture();
			await fixture.service.install(connectorResource());
			const originalAccount = recordedResources(fixture.service).map(resource => resource.identifier);

			fixture.connectorsService.accountOverride = { providerId: 'github', accountName: 'hubot', enterprise: false };
			fixture.connectorAccountChanges.fire();
			const otherAccount = recordedResources(fixture.service);

			fixture.connectorsService.accountOverride = { providerId: 'github', accountName: 'octocat', enterprise: false };
			fixture.connectorAccountChanges.fire();

			assert.deepStrictEqual({
				originalAccount,
				otherAccount,
				restoredAccount: recordedResources(fixture.service).map(resource => resource.identifier),
			}, {
				originalAccount: ['mail'],
				otherAccount: [],
				restoredAccount: ['mail'],
			});
		});

		test('hides persisted connector state while the experiment is disabled', async () => {
			const fixture = await createFixture();
			const candidate = connectorResource();
			await fixture.service.install(candidate);

			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, false);
			fireConfigurationChange(fixture.configurationService, CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled);
			const disabled = {
				recorded: recordedResources(fixture.service),
				state: fixture.service.getInstallState(candidate),
			};

			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, true);
			fireConfigurationChange(fixture.configurationService, CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled);

			assert.deepStrictEqual({
				disabled,
				restoredRecords: recordedResources(fixture.service).map(resource => resource.identifier),
				restoredState: fixture.service.getInstallState(candidate),
			}, {
				disabled: {
					recorded: [],
					state: { kind: 'unavailable', message: 'Enable the Copilot connectors experiment to connect this resource.' },
				},
				restoredRecords: ['mail'],
				restoredState: { kind: 'installed', target: connectorInstallationTarget },
			});
		});

		test('is unavailable when the connector experiment is disabled', async () => {
			const fixture = await createFixture();
			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, false);

			const state = fixture.service.getInstallState(connectorResource());

			assert.deepStrictEqual(state, { kind: 'unavailable', message: 'Enable the Copilot connectors experiment to connect this resource.' });
		});

		test('connector-only enablement permits consent without SDK feed or registry access', async () => {
			const fixture = await createFixture({ enabled: false, otherSourceEnabled: true });
			await fixture.service.install(connectorResource());
			assert.deepStrictEqual({
				publicState: fixture.service.getInstallState(resource()).kind,
				connectorState: fixture.service.getInstallState(connectorResource()).kind,
				connects: fixture.connectorsService.connectCalls,
				registryLookups: fixture.mcpService.configuredGalleryLookups,
			}, { publicState: 'unavailable', connectorState: 'installed', connects: ['mail'], registryLookups: [] });
		});

		test('disabling connectors cancels consent while the SDK feed setting stays enabled', async () => {
			const fixture = await createFixture();
			const consent = new DeferredPromise<void>();
			let consentToken: CancellationToken | undefined;
			fixture.connectorsService.onConnect = (_name, token) => {
				consentToken = token;
				return consent.p;
			};
			const pending = fixture.service.install(connectorResource());
			const cancelled = assert.rejects(pending, isCancellationError);
			await setSourcesEnabled(fixture.configurationService, false, ['copilotConnectors']);
			await assert.rejects(fixture.service.install(connectorResource()), /Enable the Copilot connectors experiment/);
			await consent.complete();
			await cancelled;
			const disabled = {
				cancelled: consentToken?.isCancellationRequested,
				state: fixture.service.getInstallState(connectorResource()).kind,
				publicState: fixture.service.getInstallState(resource()).kind,
				connects: [...fixture.connectorsService.connectCalls],
			};
			fixture.connectorsService.onConnect = undefined;
			await setSourcesEnabled(fixture.configurationService, true, ['copilotConnectors']);
			await fixture.service.install(connectorResource());
			assert.deepStrictEqual({
				disabled,
				afterRetry: fixture.service.getInstallState(connectorResource()).kind,
				connects: fixture.connectorsService.connectCalls,
			}, {
				disabled: { cancelled: true, state: 'unavailable', publicState: 'unavailable', connects: ['mail'] },
				afterRetry: 'installed',
				connects: ['mail', 'mail'],
			});
		});

		test('connector observation has its own enablement lifetime', async () => {
			const fixture = await createFixture();
			const listening = [fixture.connectorChanges.hasListeners()];
			await setSourcesEnabled(fixture.configurationService, false, ['copilotConnectors']);
			listening.push(fixture.connectorChanges.hasListeners());
			const publicStillObserved = fixture.mcpChanges.hasListeners();
			await setSourcesEnabled(fixture.configurationService, true, ['copilotConnectors']);
			listening.push(fixture.connectorChanges.hasListeners());
			await setSourcesEnabled(fixture.configurationService, false);
			listening.push(fixture.connectorChanges.hasListeners());
			assert.deepStrictEqual({ listening, publicStillObserved, finalPublicObservation: fixture.mcpChanges.hasListeners() }, {
				listening: [true, false, true, false], publicStillObserved: true, finalPublicObservation: false,
			});
		});

		test('cancels connector authorization when AI features are hidden', async () => {
			const fixture = await createFixture();
			fixture.connectorsService.onConnect = async (_name, token) => new Promise<void>((_resolve, reject) => {
				const listener = token.onCancellationRequested(() => {
					listener.dispose();
					reject(new CancellationError());
				});
			});
			const install = fixture.service.install(connectorResource());
			fixture.entitlementService.sentiment.hidden = true;
			fixture.sentimentChanges.fire();

			await assert.rejects(install, isCancellationError);

			assert.deepStrictEqual(fixture.connectorsService.connectCalls, ['mail']);
		});
	});

});
