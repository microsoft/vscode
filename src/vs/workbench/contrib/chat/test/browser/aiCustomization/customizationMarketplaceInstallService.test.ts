/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { agentFinderMcpRegistryManifest } from '../../../../../../platform/agentFinder/common/agentFinderMcpRegistry.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { basename, dirname, isEqual, isEqualOrParent, joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource, ICustomizationMarketplaceService } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { FileType, IFileOverwriteOptions, IFileService, IFileWriteOptions, IStat } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IGalleryMcpServer, mcpGalleryServiceUrlConfig } from '../../../../../../platform/mcp/common/mcpManagement.js';
import { UnsupportedMcpGalleryPackageError } from '../../../../../../platform/mcp/common/mcpGalleryService.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService } from '../../../../../../platform/mcp/common/mcpGalleryManifest.js';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from '../../../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpServerInstallState } from '../../../../mcp/common/mcpTypes.js';
import { CopilotConnectorConnectionStatus, CopilotConnectorConnectionStatusDetail, ICopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { IWorkbenchLocalMcpServer } from '../../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { DELETE_AI_CUSTOMIZATION_ID } from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { CustomizationMarketplaceInstallationRecordStore } from '../../../browser/aiCustomization/customizationMarketplaceInstallationRecordStore.js';
import { CustomizationMarketplaceInstallService } from '../../../browser/aiCustomization/customizationMarketplaceInstallService.js';
import { IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IAgentPluginRepositoryService, IEnsureRepositoryOptions } from '../../../common/plugins/agentPluginRepositoryService.js';
import { IPluginGitService } from '../../../common/plugins/pluginGitService.js';
import { IInstallPluginFromSourceOptions, IInstallPluginFromSourceResult, IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { IPluginSource } from '../../../common/plugins/pluginSource.js';
import { IMarketplaceInstalledPlugin, IMarketplaceReference, IPluginMarketplaceService, IMarketplacePlugin, IPluginSourceDescriptor, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { SKILL_FILENAME } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';

const repository = URI.file('/cache/catalog');
const sourceDirectory = joinPath(repository, 'skills', 'demo-skill');
const destinationDirectory = URI.file('/workspace/.github/skills');
const skillDestination = joinPath(destinationDirectory, 'demo-skill');
const skillContent = '# Demo skill\n';
const connectorInstallationTarget = { kind: 'copilotConnector', name: 'mail' } as const;
const mcpGalleryTestSetting = 'test.marketplace.gallerySource.enabled';
const sources = [
	{ id: 'testSource', enablementSetting: CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled },
	{ id: 'copilotConnectors', enablementSetting: CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled },
	{ id: 'anotherSource', enablementSetting: 'test.anotherSource.enabled' },
	{ id: 'otherSource', enablementSetting: 'test.otherSource.enabled' },
	{ ...CustomizationMarketplaceSources.McpGallery, enablementSetting: mcpGalleryTestSetting },
];

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

function installedPlugin(sourceDescriptor: IPluginSourceDescriptor, source = 'plugins/demo', version = '1.0.0', pluginUri = URI.file('/cache/installed-plugin')): IMarketplaceInstalledPlugin {
	const reference = parseMarketplaceReference('owner/catalog#release');
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

function mcpServer(name = 'io.example/demo', installState = McpServerInstallState.Uninstalled, galleryName: string | null = name, galleryUrl = agentFinderMcpRegistryManifest.url): IWorkbenchMcpServer {
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

function isStaging(resource: URI): boolean {
	return resource.path.split('/').some(segment => segment.startsWith('.customization-marketplace-'));
}

class SkillFileSystemProvider extends InMemoryFileSystemProvider {
	readonly fileTypes = new Map<string, FileType>();
	readonly writes: URI[] = [];
	readonly moves: { source: URI; target: URI; overwrite: boolean }[] = [];
	statCalls = 0;
	activeStatCalls = 0;
	maxConcurrentStatCalls = 0;
	statDelayMs = 0;
	statErrorResource: URI | undefined;
	beforeWrite: ((resource: URI) => Promise<void>) | undefined;
	afterWrite: ((resource: URI) => Promise<void>) | undefined;
	beforeMove: (() => Promise<void>) | undefined;
	afterMove: (() => Promise<void>) | undefined;

	override async stat(resource: URI): Promise<IStat> {
		this.statCalls++;
		this.activeStatCalls++;
		this.maxConcurrentStatCalls = Math.max(this.maxConcurrentStatCalls, this.activeStatCalls);
		try {
			if (this.statDelayMs) {
				await timeout(this.statDelayMs);
			}
			if (this.statErrorResource && isEqual(resource, this.statErrorResource)) {
				throw new Error('Permission denied');
			}
			const stat = await super.stat(resource);
			return { ...stat, type: this.fileTypes.get(resource.path) ?? stat.type };
		} finally {
			this.activeStatCalls--;
		}
	}

	override async readdir(resource: URI): Promise<[string, FileType][]> {
		const entries = await super.readdir(resource);
		return entries.map(([name, type]) => [name, this.fileTypes.get(joinPath(resource, name).path) ?? type]);
	}

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		this.writes.push(resource);
		await this.beforeWrite?.(resource);
		await super.writeFile(resource, content, options);
		await this.afterWrite?.(resource);
	}

	override async rename(source: URI, target: URI, options: IFileOverwriteOptions): Promise<void> {
		this.moves.push({ source, target, overwrite: options.overwrite });
		await this.beforeMove?.();
		await super.rename(source, target, options);
		await this.afterMove?.();
	}
}

suite('CustomizationMarketplaceInstallService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createFixture(options: { enabled?: boolean; otherSourceEnabled?: boolean } = { enabled: true }) {
		const instantiationService = store.add(new TestInstantiationService());
		const logService = store.add(new NullLogService());
		const fileService = store.add(new FileService(logService));
		const provider = store.add(new SkillFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const storageService = store.add(new TestStorageService());
		const deletedSkills: URI[] = [];
		const commandService = new class extends mock<ICommandService>() {
			deleteEnabled = true;
			override async executeCommand<R = unknown>(commandId: string, ...args: unknown[]): Promise<R | undefined> {
				if (commandId === DELETE_AI_CUSTOMIZATION_ID && this.deleteEnabled) {
					const context = args[0] as { readonly uri: URI };
					deletedSkills.push(context.uri);
					await fileService.del(dirname(context.uri), { recursive: true });
				}
				return undefined;
			}
		}();
		await fileService.createFolder(destinationDirectory);
		await fileService.writeFile(joinPath(sourceDirectory, SKILL_FILENAME), VSBuffer.fromString(skillContent));
		provider.writes.length = 0;

		const installedPlugins = observableValue<readonly IMarketplaceInstalledPlugin[]>('installedPlugins', []);
		const marketplaceService = new class extends mock<IPluginMarketplaceService>() {
			readCount = 0;
			override get installedPlugins() {
				this.readCount++;
				return installedPlugins;
			}
		}();
		const agentPlugins = observableValue<readonly IAgentPlugin[]>('agentPlugins', []);
		const agentPluginService = new class extends mock<IAgentPluginService>() {
			override readonly plugins = agentPlugins;
		}();
		const pluginService = new class extends mock<IPluginInstallService>() {
			readonly calls: { source: string; options: IInstallPluginFromSourceOptions | undefined }[] = [];
			result: IInstallPluginFromSourceResult = { success: true };
			onInstall: (() => Promise<IInstallPluginFromSourceResult>) | undefined;
			autoMatch = true;
			version = '1.0.0';
			readonly versions = new Map<string, string>();
			override async installPluginFromSource(source: string, options?: IInstallPluginFromSourceOptions): Promise<IInstallPluginFromSourceResult> {
				this.calls.push({ source, options });
				const result = this.onInstall ? await this.onInstall() : this.result;
				if (!result.success || result.matchedPlugin || !this.autoMatch) {
					return result;
				}
				const reference = parseMarketplaceReference(source);
				assert.ok(reference?.githubRepo);
				const path = options?.path ?? '';
				const entry = installedPlugin({ kind: PluginSourceKind.GitHub, repo: reference.githubRepo, ref: reference.ref, path }, path, this.versions.get(path) ?? this.version, URI.file(`/cache/${reference.githubRepo}/ref_${reference.ref ?? 'default'}/${path || 'root'}`));
				installedPlugins.set([...installedPlugins.get(), entry], undefined);
				return { ...result, matchedPlugin: entry.plugin };
			}
			override getPluginInstallUri(plugin: IMarketplacePlugin): URI {
				return installedPlugins.get().find(entry => entry.plugin === plugin)?.pluginUri ?? URI.file('/cache/missing-plugin');
			}
		}();
		const pluginSource = new class extends mock<IPluginSource>() {
			override getCleanupTarget(): URI {
				return URI.file('/cache/plugin-repository');
			}
		}();
		const repositoryService = new class extends mock<IAgentPluginRepositoryService>() {
			override readonly agentPluginsHome = URI.file('/cache');
			readonly calls: { reference: IMarketplaceReference; options: IEnsureRepositoryOptions | undefined }[] = [];
			onEnsure: (() => Promise<URI>) | undefined;
			override getPluginSource(): IPluginSource {
				return pluginSource;
			}
			override async ensureRepository(reference: IMarketplaceReference, options?: IEnsureRepositoryOptions): Promise<URI> {
				this.calls.push({ reference, options });
				return this.onEnsure ? this.onEnsure() : repository;
			}
			override async ensurePluginSource(plugin: IMarketplacePlugin, options?: IEnsureRepositoryOptions): Promise<URI> {
				this.calls.push({ reference: plugin.marketplaceReference, options });
				let source = repository;
				for (const segment of plugin.source ? plugin.source.split('/') : []) {
					source = joinPath(source, segment);
				}
				return source;
			}
		}();
		const pluginGitService = new class extends mock<IPluginGitService>() {
			revision = 'a'.repeat(40);
			override async revParse(): Promise<string> {
				return this.revision;
			}
		}();
		const mcpChanges = store.add(new Emitter<IWorkbenchMcpServer | undefined>());
		const mcpService = new class extends mock<IMcpWorkbenchService>() {
			override readonly onChange = mcpChanges.event;
			override readonly onReset = Event.None;
			override local: IWorkbenchMcpServer[] = [];
			readonly lookups: string[] = [];
			readonly configuredGalleryLookups: string[] = [];
			readonly galleryLookupManifests: (string | undefined)[] = [];
			readonly feedVersions: string[] = [];
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
			override async getMcpServerFromAgentFinder(name: string, version: string): Promise<IWorkbenchMcpServer | undefined> {
				this.lookups.push(name);
				this.feedVersions.push(version);
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
		const connectedConnectors = new Set<string>();
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = connectorChanges.event;
			readonly connectCalls: string[] = [];
			readonly disconnectCalls: string[] = [];
			statusOverride: CopilotConnectorConnectionStatus | undefined;
			statusDetailOverride: CopilotConnectorConnectionStatusDetail | undefined;
			onConnect: ((name: string, token: CancellationToken) => Promise<void>) | undefined;
			onDisconnect: ((name: string, token: CancellationToken) => Promise<void>) | undefined;
			override get connectors() {
				return [{
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
				}];
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
			}
		}();
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = observableValue(this, 'test-harness');
			override readonly activeSessionResource = observableValue(this, URI.parse('test-harness:///session'));
			folders: readonly ICustomizationSourceFolder[] | undefined = [
				{ uri: destinationDirectory, label: 'Workspace', source: PromptsStorage.local },
			];
			readonly folderRequests: { session: URI; type: PromptsType }[] = [];
			override findHarnessById(id: string): IHarnessDescriptor | undefined {
				assert.strictEqual(id, 'test-harness');
				return {
					id,
					label: 'Test Harness',
					icon: Codicon.copilot,
					itemProvider: {
						onDidChange: Event.None,
						provideChatSessionCustomizations: async () => [],
						provideSourceFolders: async (session, type) => {
							this.folderRequests.push({ session, type });
							return this.folders;
						},
					},
				};
			}
		}();
		const workspaceService = new class extends mock<IAICustomizationWorkspaceService>() {
			override readonly activeProjectRoot = observableValue<URI | undefined>(this, URI.file('/workspace'));
			override getActiveProjectRoot(): URI | undefined {
				return this.activeProjectRoot.get();
			}
		}();
		const sentimentChanges = store.add(new Emitter<void>());
		const entitlementService = new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeSentiment = sentimentChanges.event;
			override readonly sentiment = { hidden: false };
		}();
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.PluginsEnabled]: true,
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[mcpGalleryServiceUrlConfig]: 'https://configured.registry.test',
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		for (const source of sources) {
			const enabled = source.id === 'testSource' ? options.enabled : options.otherSourceEnabled ?? options.enabled;
			if (enabled !== undefined) {
				await configurationService.setUserConfiguration(source.enablementSetting, enabled);
			}
		}
		const dialogService = new class extends mock<IDialogService>() {
			readonly confirmations: IConfirmation[] = [];
			result: IConfirmationResult = { confirmed: true };
			onConfirm: (() => Promise<IConfirmationResult>) | undefined;
			override async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
				this.confirmations.push(confirmation);
				return this.onConfirm ? this.onConfirm() : this.result;
			}
		}();
		const progressService = new class extends mock<IProgressService>() {
			readonly options: Parameters<IProgressService['withProgress']>[0][] = [];
			cancel: ((choice?: number) => void) | undefined;
			override async withProgress<R>(
				options: Parameters<IProgressService['withProgress']>[0],
				task: (progress: IProgress<IProgressStep>) => Promise<R>,
				onDidCancel?: (choice?: number) => void,
			): Promise<R> {
				this.options.push(options);
				this.cancel = onDidCancel;
				try {
					return await task({ report() { } });
				} finally {
					this.cancel = undefined;
				}
			}
		}();
		const quickInputService = new class extends mock<IQuickInputService>() {
			calls = 0;
			override async pick(): Promise<undefined> {
				this.calls++;
				return undefined;
			}
		}();
		const labelService = new class extends mock<ILabelService>() {
			override getUriLabel(uri: URI): string {
				return uri.path;
			}
		}();
		instantiationService.stub(IPluginInstallService, pluginService);
		instantiationService.stub(IPluginMarketplaceService, marketplaceService);
		instantiationService.stub(IAgentPluginService, agentPluginService);
		instantiationService.stub(IAgentPluginRepositoryService, repositoryService);
		instantiationService.stub(IPluginGitService, pluginGitService);
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
		instantiationService.stub(IAICustomizationWorkspaceService, workspaceService);
		instantiationService.stub(IChatEntitlementService, entitlementService);
		instantiationService.stub(ICustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = sources;
		}());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDialogService, dialogService);
		instantiationService.stub(IProgressService, progressService);
		instantiationService.stub(IQuickInputService, quickInputService);
		instantiationService.stub(ILabelService, labelService);
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ICommandService, commandService);
		const service = store.add(instantiationService.createInstance(CustomizationMarketplaceInstallService));
		return {
			service, instantiationService, fileService, provider, storageService, commandService, deletedSkills, installedPlugins, marketplaceService, agentPlugins, pluginService, repositoryService, pluginGitService, mcpService, mcpChanges,
			connectorsService, connectorChanges, mcpGalleryManifestService, harnessService, workspaceService, entitlementService, sentimentChanges, configurationService, dialogService, progressService, quickInputService,
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

	async function stagingDirectories(fileService: IFileService): Promise<string[]> {
		return (await fileService.resolve(dirname(destinationDirectory))).children?.filter(child => isStaging(child.resource)).map(child => child.name) ?? [];
	}

	async function readTree(fileService: IFileService, root: URI): Promise<[string, string | null][]> {
		const result: [string, string | null][] = [];
		const visit = async (directory: URI, prefix: string) => {
			for (const child of (await fileService.resolve(directory)).children ?? []) {
				const path = `${prefix}${child.name}`;
				result.push([path, child.isDirectory ? null : (await fileService.readFile(child.resource)).value.toString()]);
				if (child.isDirectory) {
					await visit(child.resource, `${path}/`);
				}
			}
		};
		await visit(root, '');
		return result.sort(([left], [right]) => left.localeCompare(right));
	}

	suite('source gates', () => {
		test('Marketplace visibility blocks installs without disabling the source', async () => {
			const fixture = await createFixture();
			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, false);
			fireConfigurationChange(fixture.configurationService, CustomizationMarketplaceConfiguration.MarketplaceEnabled);
			const state = fixture.service.getInstallState(pluginResource());
			await assert.rejects(fixture.service.install(pluginResource()), /Enable the customization marketplace/);
			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
			fireConfigurationChange(fixture.configurationService, CustomizationMarketplaceConfiguration.MarketplaceEnabled);
			await fixture.service.install(pluginResource());
			assert.deepStrictEqual({
				state,
				pluginInstalls: fixture.pluginService.calls,
				sourceStillEnabled: fixture.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled),
			}, {
				state: { kind: 'unavailable', message: 'Enable the customization marketplace to install this resource.' },
				pluginInstalls: [{ source: 'owner/catalog#release', options: { path: 'plugins/demo' } }],
				sourceStillEnabled: true,
			});
		});


		test('hiding Marketplace preserves record-backed uninstall while blocking repair', async () => {
			const fixture = await createFixture();
			const candidate = resource();
			await fixture.service.install(candidate);
			const missing = Event.toPromise(Event.filter(fixture.service.onDidChange, () => fixture.service.getInstallState(candidate).kind === 'missing'));
			await fixture.fileService.del(skillDestination, { recursive: true });
			await missing;
			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, false);
			fireConfigurationChange(fixture.configurationService, CustomizationMarketplaceConfiguration.MarketplaceEnabled);
			const state = fixture.service.getInstallState(candidate);
			await assert.rejects(fixture.service.repair(candidate), /Enable the customization marketplace/);
			await fixture.service.uninstall(candidate);
			assert.deepStrictEqual({
				state: state.kind,
				repairUnavailableMessage: state.kind === 'missing' ? state.repairUnavailableMessage : undefined,
				stateAfterUninstall: fixture.service.getInstallState(candidate).kind,
				recordedResources: fixture.service.getRecordedResources().length,
			}, {
				state: 'missing',
				repairUnavailableMessage: 'Enable the customization marketplace to install this resource.',
				stateAfterUninstall: 'unavailable',
				recordedResources: 0,
			});
		});
		test('hiding Marketplace cancels a pending skill import without disabling its feed', async () => {
			const fixture = await createFixture();
			const started = new DeferredPromise<void>();
			const continueRepository = new DeferredPromise<URI>();
			fixture.repositoryService.onEnsure = async () => {
				await started.complete();
				return continueRepository.p;
			};
			const result = Promise.allSettled([fixture.service.install(resource())]);
			await started.p;
			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, false);
			fireConfigurationChange(fixture.configurationService, CustomizationMarketplaceConfiguration.MarketplaceEnabled);
			const cancelled = fixture.repositoryService.calls[0].options?.token?.isCancellationRequested;
			await continueRepository.complete(repository);
			const [outcome] = await result;
			assert.deepStrictEqual({
				cancelled,
				failedWithCancellation: outcome.status === 'rejected' && isCancellationError(outcome.reason),
				installed: await fixture.fileService.exists(skillDestination),
				sourceEnabled: fixture.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled),
			}, {
				cancelled: true,
				failedWithCancellation: true,
				installed: false,
				sourceEnabled: true,
			});
		});

		test('a different enabled source cannot authorize disabled or unknown source installations', async () => {
			const fixture = await createFixture({ enabled: false, otherSourceEnabled: true });
			const candidates = [resource(), pluginResource(), mcpResource(), resource({ sourceId: 'unknown' })];
			for (const candidate of candidates) {
				await assert.rejects(fixture.service.install(candidate), /marketplace source/);
			}
			const enabledCandidate = { ...pluginResource(), sourceId: 'anotherSource' };
			await fixture.service.install(enabledCandidate);
			assert.deepStrictEqual({
				states: candidates.map(candidate => fixture.service.getInstallState(candidate).kind),
				registryLookups: fixture.mcpService.lookups,
				repositoryCalls: fixture.repositoryService.calls,
				folderRequests: fixture.harnessService.folderRequests,
				pluginInstalls: fixture.pluginService.calls,
			}, {
				states: ['unavailable', 'unavailable', 'unavailable', 'unavailable'],
				registryLookups: [], repositoryCalls: [], folderRequests: [],
				pluginInstalls: [{ source: 'owner/catalog#release', options: { path: 'plugins/demo' } }],
			});
		});

		test('disabling one source cancels only its pending skill import and preserves other source state', async () => {
			const fixture = await createFixture();
			const second = resource({ sourceId: 'anotherSource' });
			await fixture.service.install(second);
			const first = resource({
				installation: { kind: 'skill', repository: 'owner/catalog', ref: 'release', path: 'skills/first-skill' },
			});
			await fixture.fileService.writeFile(joinPath(repository, 'skills', 'first-skill', SKILL_FILENAME), VSBuffer.fromString(skillContent));
			const paused = new DeferredPromise<void>();
			const resume = new DeferredPromise<URI>();
			fixture.repositoryService.onEnsure = async () => {
				await paused.complete();
				return resume.p;
			};
			const firstOutcome = Promise.allSettled([fixture.service.install(first)]);
			await Promise.race([paused.p, firstOutcome]);
			const pluginResult = new DeferredPromise<IInstallPluginFromSourceResult>();
			fixture.pluginService.onInstall = () => pluginResult.p;
			const secondPlugin = { ...pluginResource(), sourceId: 'anotherSource' };
			const secondOperation = fixture.service.install(secondPlugin);
			await setSourcesEnabled(fixture.configurationService, false, ['testSource']);
			const afterDisable = {
				cancelled: fixture.repositoryService.calls.at(-1)?.options?.token?.isCancellationRequested,
				first: fixture.service.getInstallState(first).kind,
				second: fixture.service.getInstallState(second).kind,
				secondPlugin: fixture.service.getInstallState(secondPlugin).kind,
				mcpListener: fixture.mcpChanges.hasListeners(),
			};
			await assert.rejects(fixture.service.install(first), /marketplace source/);
			await pluginResult.complete({ success: true });
			await secondOperation;
			await resume.complete(repository);
			const [firstResult] = await firstOutcome;
			await setSourcesEnabled(fixture.configurationService, true, ['testSource']);
			assert.deepStrictEqual({
				afterDisable,
				firstCancelled: firstResult.status === 'rejected' && isCancellationError(firstResult.reason),
				firstTargetExists: await fixture.fileService.exists(joinPath(destinationDirectory, 'first-skill')),
				staging: await stagingDirectories(fixture.fileService),
				secondState: fixture.service.getInstallState(second).kind,
				secondFiles: await readTree(fixture.fileService, skillDestination),
				pluginInstalls: fixture.pluginService.calls.length,
			}, {
				afterDisable: { cancelled: true, first: 'unavailable', second: 'installed', secondPlugin: 'installing', mcpListener: true },
				firstCancelled: true, firstTargetExists: false, staging: [],
				secondState: 'installed', secondFiles: [[SKILL_FILENAME, skillContent]], pluginInstalls: 1,
			});
		});

		test('disabling another source does not cancel a pending skill import', async () => {
			const fixture = await createFixture();
			const candidate = resource({ sourceId: 'anotherSource' });
			fixture.repositoryService.onEnsure = async () => {
				await setSourcesEnabled(fixture.configurationService, false, ['testSource']);
				await setSourcesEnabled(fixture.configurationService, true, ['testSource']);
				assert.strictEqual(fixture.repositoryService.calls[0].options?.token?.isCancellationRequested, false);
				return repository;
			};
			await fixture.service.install(candidate);
			assert.deepStrictEqual({ state: fixture.service.getInstallState(candidate).kind, installedFiles: await readTree(fixture.fileService, skillDestination) }, {
				state: 'installed', installedFiles: [[SKILL_FILENAME, skillContent]],
			});
		});

		for (const enabled of [undefined, false]) {
			test(`blocks all installation activity when sources are ${enabled === undefined ? 'unset' : 'explicitly disabled'}`, async () => {
				const fixture = await createFixture({ enabled });
				await fixture.configurationService.setUserConfiguration('chat.agentFinder.enabled', true);
				await fixture.configurationService.setUserConfiguration('chat.customizations.unifiedMarketplace.enabled', true);
				const candidates = [resource(), pluginResource(), mcpResource()];
				for (const candidate of candidates) {
					await assert.rejects(fixture.service.install(candidate), /marketplace source/);
				}
				assert.deepStrictEqual({
					states: candidates.map(candidate => fixture.service.getInstallState(candidate).kind),
					registryLookups: fixture.mcpService.lookups,
					mcpInstalls: fixture.mcpService.installs,
					pluginInstalls: fixture.pluginService.calls,
					repositoryCalls: fixture.repositoryService.calls,
					folderRequests: fixture.harnessService.folderRequests,
					pickerCalls: fixture.quickInputService.calls,
					confirmations: fixture.dialogService.confirmations,
					progress: fixture.progressService.options,
					writes: fixture.provider.writes,
					moves: fixture.provider.moves,
					modelReads: fixture.marketplaceService.readCount,
					mcpListener: fixture.mcpChanges.hasListeners(),
					entitlementListener: fixture.sentimentChanges.hasListeners(),
					configurationListener: fixture.configurationService.onDidChangeConfigurationEmitter.hasListeners(),
				}, {
					states: ['unavailable', 'unavailable', 'unavailable'],
					registryLookups: [], mcpInstalls: [], pluginInstalls: [], repositoryCalls: [], folderRequests: [], pickerCalls: 0,
					confirmations: [], progress: [], writes: [], moves: [], modelReads: 0,
					mcpListener: false, entitlementListener: false, configurationListener: true,
				});
			});
		}

		for (const initiallyEnabled of [false, true]) {
			test(`keeps feature observers dormant ${initiallyEnabled ? 'after disabling' : 'from disabled construction'} and restores them on re-enable`, async () => {
				const fixture = await createFixture({ enabled: initiallyEnabled });
				if (initiallyEnabled) {
					await setSourcesEnabled(fixture.configurationService, false);
				}
				let changes = 0;
				store.add(fixture.service.onDidChange(() => changes++));
				const initialReads = fixture.marketplaceService.readCount;
				fixture.installedPlugins.set([installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', path: 'plugins/demo' })], undefined);
				fixture.harnessService.activeHarness.set('other-harness', undefined);
				fixture.harnessService.activeSessionResource.set(URI.parse('test-harness:///other-session'), undefined);
				fixture.workspaceService.activeProjectRoot.set(URI.file('/other-project'), undefined);
				fixture.mcpChanges.fire(undefined);
				fixture.sentimentChanges.fire();
				await fixture.configurationService.setUserConfiguration(ChatConfiguration.PluginsEnabled, false);
				fireConfigurationChange(fixture.configurationService, ChatConfiguration.PluginsEnabled);
				fireConfigurationChange(fixture.configurationService, 'editor.fontSize');
				const unrelatedFile = URI.file('/workspace/unrelated.txt');
				const fileChanged = Event.toPromise(Event.filter(fixture.fileService.onDidFilesChange, event => event.contains(unrelatedFile)));
				await fixture.fileService.writeFile(unrelatedFile, VSBuffer.fromString('Unrelated change'));
				await fileChanged;
				const disabled = {
					changes,
					modelReads: fixture.marketplaceService.readCount - initialReads,
					mcpListener: fixture.mcpChanges.hasListeners(),
					entitlementListener: fixture.sentimentChanges.hasListeners(),
				};
				await setSourcesEnabled(fixture.configurationService, true);
				changes = 0;
				const enabledReads = fixture.marketplaceService.readCount;
				fixture.installedPlugins.set([], undefined);
				fixture.mcpChanges.fire(undefined);
				fixture.sentimentChanges.fire();
				assert.deepStrictEqual({
					disabled,
					reenabled: {
						changes,
						modelReads: fixture.marketplaceService.readCount - enabledReads,
						mcpListener: fixture.mcpChanges.hasListeners(),
						entitlementListener: fixture.sentimentChanges.hasListeners(),
					},
				}, {
					disabled: { changes: 0, modelReads: 0, mcpListener: false, entitlementListener: false },
					reenabled: { changes: 3, modelReads: 1, mcpListener: true, entitlementListener: true },
				});
			});
		}

		for (const phase of ['repository acquisition', 'staged copying']) {
			test(`disabling during ${phase} cancels without committing and permits a fresh install after re-enable`, async () => {
				const fixture = await createFixture();
				const paused = new DeferredPromise<void>();
				const resume = new DeferredPromise<void>();
				if (phase === 'repository acquisition') {
					fixture.repositoryService.onEnsure = async () => {
						await paused.complete();
						await resume.p;
						return repository;
					};
				} else {
					fixture.provider.afterWrite = async uri => {
						if (isStaging(uri)) {
							await paused.complete();
							await resume.p;
						}
					};
				}
				const outcome = Promise.allSettled([fixture.service.install(resource())]);
				await Promise.race([paused.p, outcome]);
				const writesBeforeDisable = fixture.provider.writes.length;
				await setSourcesEnabled(fixture.configurationService, false);
				const tokenCancelled = fixture.repositoryService.calls[0]?.options?.token?.isCancellationRequested === true;
				await resume.complete();
				const [result] = await outcome;
				const cancelled = {
					tokenCancelled,
					rejectedWithCancellation: result.status === 'rejected' && isCancellationError(result.reason),
					state: fixture.service.getInstallState(resource()).kind,
					targetExists: await fixture.fileService.exists(skillDestination),
					staging: await stagingDirectories(fixture.fileService),
					moves: fixture.provider.moves.length,
					writesWhileDisabled: fixture.provider.writes.length - writesBeforeDisable,
				};
				fixture.repositoryService.onEnsure = undefined;
				fixture.provider.afterWrite = undefined;
				await setSourcesEnabled(fixture.configurationService, true);
				const stateBeforeRetry = fixture.service.getInstallState(resource()).kind;
				await fixture.service.install(resource());
				assert.deepStrictEqual({
					cancelled,
					stateBeforeRetry,
					stateAfterRetry: fixture.service.getInstallState(resource()).kind,
					cloneCalls: fixture.repositoryService.calls.length,
					installedFiles: await readTree(fixture.fileService, skillDestination),
				}, {
					cancelled: {
						tokenCancelled: true, rejectedWithCancellation: true, state: 'unavailable', targetExists: false,
						staging: [], moves: 0, writesWhileDisabled: 0,
					},
					stateBeforeRetry: 'available', stateAfterRetry: 'installed', cloneCalls: 2, installedFiles: [[SKILL_FILENAME, skillContent]],
				});
			});
		}

		test('disabling during registry resolution never hands off to the MCP installer', async () => {
			const fixture = await createFixture();
			fixture.mcpService.onLookup = async () => {
				await setSourcesEnabled(fixture.configurationService, false);
				return fixture.mcpService.galleryServer;
			};
			await assert.rejects(fixture.service.install(mcpResource()), isCancellationError);
			assert.deepStrictEqual({
				lookups: fixture.mcpService.lookups,
				eligibilityChecks: fixture.mcpService.eligibilityChecks,
				installs: fixture.mcpService.installs,
				state: fixture.service.getInstallState(mcpResource()).kind,
			}, { lookups: ['io.example/demo'], eligibilityChecks: [], installs: [], state: 'unavailable' });
		});

		test('re-enabling during a pending MCP lookup does not revive the old install', async () => {
			const fixture = await createFixture();
			const candidate = mcpResource();
			const started = new DeferredPromise<void>();
			const lookup = new DeferredPromise<IWorkbenchMcpServer | undefined>();
			fixture.mcpService.onLookup = async () => {
				await started.complete();
				return lookup.p;
			};
			const outcome = Promise.allSettled([fixture.service.install(candidate)]);
			await Promise.race([started.p, outcome]);
			await setSourcesEnabled(fixture.configurationService, false);
			await setSourcesEnabled(fixture.configurationService, true);
			await lookup.complete(fixture.mcpService.galleryServer);
			const [result] = await outcome;
			const oldOperation = {
				cancelled: result.status === 'rejected' && isCancellationError(result.reason),
				eligibilityChecks: fixture.mcpService.eligibilityChecks.length,
				installs: fixture.mcpService.installs.length,
				state: fixture.service.getInstallState(candidate).kind,
			};
			fixture.mcpService.onLookup = undefined;
			await fixture.service.install(candidate);
			assert.deepStrictEqual({
				oldOperation,
				lookups: fixture.mcpService.lookups,
				eligibilityChecks: fixture.mcpService.eligibilityChecks.length,
				installs: fixture.mcpService.installs.length,
				state: fixture.service.getInstallState(candidate).kind,
			}, {
				oldOperation: { cancelled: true, eligibilityChecks: 0, installs: 0, state: 'available' },
				lookups: ['io.example/demo', 'io.example/demo'], eligibilityChecks: 1, installs: 1, state: 'installed',
			});
		});

		test('re-enabling reconciles a recorded skill removed while disabled and allows repair', async () => {
			const fixture = await createFixture();
			const candidate = resource();
			await fixture.service.install(candidate);
			await setSourcesEnabled(fixture.configurationService, false);
			const deleted = Event.toPromise(Event.filter(fixture.fileService.onDidFilesChange, event => event.contains(skillDestination)));
			await fixture.fileService.del(skillDestination, { recursive: true });
			await deleted;
			await setSourcesEnabled(fixture.configurationService, true);
			await timeout(0);
			const stateBeforeRepair = fixture.service.getInstallState(candidate).kind;
			await fixture.service.repair(candidate);
			assert.deepStrictEqual({
				stateBeforeRepair,
				stateAfterRepair: fixture.service.getInstallState(candidate).kind,
				cloneCalls: fixture.repositoryService.calls.length,
				installedFileExists: await fixture.fileService.exists(joinPath(skillDestination, SKILL_FILENAME)),
			}, { stateBeforeRepair: 'missing', stateAfterRepair: 'installed', cloneCalls: 2, installedFileExists: true });
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
			pluginCalls: fixture.pluginService.calls,
			mcpLookups: fixture.mcpService.lookups,
			repositoryCalls: fixture.repositoryService.calls,
		}, {
			states: [CustomizationMarketplaceMediaType.Skill, CustomizationMarketplaceMediaType.CopilotPlugin, CustomizationMarketplaceMediaType.McpServer, CustomizationMarketplaceMediaType.CursorPlugin, 'application/unsupported']
				.map(mediaType => ({ mediaType, kind: 'unavailable', hasReason: true })),
			pluginCalls: [],
			mcpLookups: [],
			repositoryCalls: [],
		});
	});

	test('hidden AI features block every installer before prompting or resolving sources', async () => {
		const fixture = await createFixture();
		fixture.entitlementService.sentiment.hidden = true;
		for (const candidate of [resource(), pluginResource(), mcpResource()]) {
			await assert.rejects(fixture.service.install(candidate), /Enable AI features/);
		}
		assert.deepStrictEqual({
			states: [resource(), pluginResource(), mcpResource()].map(candidate => fixture.service.getInstallState(candidate).kind),
			pluginCalls: fixture.pluginService.calls,
			mcpLookups: fixture.mcpService.lookups,
			folderRequests: fixture.harnessService.folderRequests,
			confirmations: fixture.dialogService.confirmations,
		}, { states: ['unavailable', 'unavailable', 'unavailable'], pluginCalls: [], mcpLookups: [], folderRequests: [], confirmations: [] });
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
		cause = 'harness';
		fixture.harnessService.activeHarness.set('other-harness', undefined);
		cause = 'project';
		fixture.workspaceService.activeProjectRoot.set(URI.file('/other'), undefined);
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
		fixture.harnessService.activeHarness.set('test-harness', undefined);
		fixture.workspaceService.activeProjectRoot.set(undefined, undefined);
		fixture.sentimentChanges.fire();
		fireConfigurationChange(fixture.configurationService, ChatConfiguration.PluginsEnabled);
		assert.deepStrictEqual(changes, ['plugins', 'mcp', 'harness', 'project', 'entitlement', 'configuration']);
	});


	suite('installation records', () => {
		test('rejects malformed persisted targets and bounds record count', () => {
			const storage = store.add(new TestStorageService());
			const prefix = 'chat.customizations.marketplace.installationRecord.v1.';
			const id = 'a'.repeat(64);
			storage.store(`${prefix}${id}`, JSON.stringify({
				version: 1,
				record: {
					id,
					sourceId: 'testSource',
					identifier: 'bad-skill',
					displayName: 'Bad Skill',
					description: '',
					mediaType: CustomizationMarketplaceMediaType.Skill,
					installation: { kind: 'skill', repository: 'owner/repo', ref: 'main', path: 'skill' },
					target: { kind: 'skill', uri: URI.file('/outside/SKILL.md').toString(), files: [SKILL_FILENAME], resolvedRevision: 'a'.repeat(40), source: 'local', harness: 'test-harness', sourceFolder: URI.file('/workspace').toString() },
				},
			}), StorageScope.PROFILE, StorageTarget.MACHINE);
			const malformed = store.add(new CustomizationMarketplaceInstallationRecordStore(storage, store.add(new NullLogService())));
			for (let index = 0; index < 999; index++) {
				storage.store(`${prefix}${index.toString(16).padStart(64, '0')}`, '{}', StorageScope.PROFILE, StorageTarget.MACHINE);
			}
			let bounded = false;
			try {
				malformed.ensureCanAdd();
			} catch (error) {
				bounded = error instanceof Error && error.message === 'Too many customization marketplace installations are recorded. Uninstall an existing marketplace customization before installing another.';
			}
			assert.deepStrictEqual({ records: malformed.records.size, bounded }, { records: 0, bounded: true });
		});

		test('persists exact targets and reconciles a missing skill after service recreation', async () => {
			const fixture = await createFixture();
			const candidate = resource({ version: '1.0.0' });
			await fixture.service.install(candidate);
			const storageKey = fixture.storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE).find(key => key.includes('customizations.marketplace.installationRecord.v1'));
			assert.ok(storageKey);
			const stored = JSON.parse(fixture.storageService.get(storageKey, StorageScope.PROFILE)!);
			const storedRecord = stored.record;
			fixture.service.dispose();
			await fixture.fileService.del(skillDestination, { recursive: true });
			const restored = store.add(fixture.instantiationService.createInstance(CustomizationMarketplaceInstallService));
			await timeout(0);
			const state = restored.getInstallState(candidate);
			assert.deepStrictEqual({
				record: {
					version: stored.version,
					sourceId: storedRecord?.sourceId,
					identifier: storedRecord?.identifier,
					resourceVersion: storedRecord?.version,
					targetKind: storedRecord?.target.kind,
					targetUri: storedRecord?.target.uri,
					files: storedRecord?.target.files,
					resolvedRevision: storedRecord?.target.resolvedRevision,
				},
				state: state.kind,
				target: state.kind === 'missing' && state.target.kind === 'skill' ? state.target.uri : undefined,
			}, {
				record: {
					version: 1,
					sourceId: 'testSource',
					identifier: 'skill-resource',
					resourceVersion: '1.0.0',
					targetKind: 'skill',
					targetUri: joinPath(skillDestination, SKILL_FILENAME).toString(),
					files: [SKILL_FILENAME],
					resolvedRevision: 'a'.repeat(40),
				},
				state: 'missing',
				target: joinPath(skillDestination, SKILL_FILENAME),
			});
		});

		test('persists MCP gallery provenance across service recreation', async () => {
			const fixture = await createFixture();
			const candidate = galleryMcpResource();
			fixture.mcpService.galleryServer = mcpServer('io.example/demo', McpServerInstallState.Uninstalled, 'io.example/demo', 'https://configured.registry.test');
			await fixture.service.install(candidate);
			fixture.service.dispose();
			const restored = store.add(fixture.instantiationService.createInstance(CustomizationMarketplaceInstallService));
			await timeout(0);
			const state = restored.getInstallState(candidate);
			assert.deepStrictEqual({
				recorded: restored.getRecordedResources().map(resource => resource.installation),
				state: state.kind,
				target: state.kind === 'installed' ? state.target : undefined,
			}, {
				recorded: [candidate.installation],
				state: 'installed',
				target: { kind: 'mcp', id: 'mcp:io.example/demo:1.0.0' },
			});
		});


		test('round-trips file names accepted by the installed package', async () => {
			const fixture = await createFixture();
			const candidate = resource({ version: '1.0.0' });
			await fixture.fileService.writeFile(joinPath(sourceDirectory, 'notes:extra.md'), VSBuffer.fromString('notes'));
			await fixture.service.install(candidate);
			fixture.service.dispose();
			const restored = store.add(fixture.instantiationService.createInstance(CustomizationMarketplaceInstallService));
			await timeout(0);
			assert.deepStrictEqual({
				state: restored.getInstallState(candidate).kind,
				files: await readTree(fixture.fileService, skillDestination),
			}, { state: 'installed', files: [['notes:extra.md', 'notes'], [SKILL_FILENAME, skillContent]] });
		});

		test('does not associate an exact local plugin without an installation record', async () => {
			const fixture = await createFixture();
			const candidate = pluginResource();
			fixture.installedPlugins.set([installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', ref: 'release', path: 'plugins/demo' })], undefined);
			assert.deepStrictEqual(fixture.service.getInstallState(candidate), { kind: 'available' });
		});

		test('preserves independent records written by concurrent workbench services', async () => {
			const fixture = await createFixture();
			const second = store.add(fixture.instantiationService.createInstance(CustomizationMarketplaceInstallService));
			await fixture.service.install(mcpResource());
			await second.install(pluginResource());
			const storageKeys = fixture.storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE).filter(key => key.includes('customizations.marketplace.installationRecord.v1'));
			const restored = store.add(fixture.instantiationService.createInstance(CustomizationMarketplaceInstallService));
			assert.deepStrictEqual({
				storageKeys: storageKeys.length,
				recorded: restored.getRecordedResources().map(resource => resource.identifier).sort(),
			}, { storageKeys: 2, recorded: ['mcp-resource', 'plugin-resource'] });
		});

		test('reports verification errors instead of treating inaccessible files as missing', async () => {
			const fixture = await createFixture();
			const candidate = resource();
			await fixture.service.install(candidate);
			fixture.provider.statErrorResource = joinPath(skillDestination, SKILL_FILENAME);
			const verificationFailed = Event.toPromise(Event.filter(fixture.service.onDidChange, () => fixture.service.getInstallState(candidate).kind === 'error'));
			await fixture.fileService.writeFile(joinPath(skillDestination, 'trigger.txt'), VSBuffer.fromString('trigger'));
			await verificationFailed;
			const state = fixture.service.getInstallState(candidate);
			fixture.provider.statErrorResource = undefined;
			await fixture.service.uninstall(candidate);
			assert.deepStrictEqual({
				state: state.kind,
				message: state.kind === 'error' ? state.message : undefined,
				afterUninstall: fixture.service.getInstallState(candidate).kind,
			}, { state: 'error', message: 'Could not verify this customization installation. Permission denied', afterUninstall: 'available' });
		});

		test('does not rescan skill manifests for unrelated plugin or MCP changes', async () => {
			const fixture = await createFixture();
			await fixture.service.install(resource());
			await timeout(0);
			fixture.provider.statCalls = 0;
			fixture.installedPlugins.set([installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', ref: 'release', path: 'plugins/demo' })], undefined);
			fixture.mcpChanges.fire(undefined);
			await timeout(0);
			assert.strictEqual(fixture.provider.statCalls, 0);
		});

		test('bounds concurrent skill file verification', async () => {
			const fixture = await createFixture();
			for (let index = 0; index < 40; index++) {
				await fixture.fileService.writeFile(joinPath(sourceDirectory, `file-${index}.txt`), VSBuffer.fromString('content'));
			}
			await fixture.service.install(resource());
			fixture.provider.statCalls = 0;
			fixture.provider.maxConcurrentStatCalls = 0;
			fixture.provider.statDelayMs = 2;
			fixture.harnessService.activeHarness.set('other-harness', undefined);
			fixture.harnessService.activeHarness.set('test-harness', undefined);
			for (let attempt = 0; attempt < 200 && (fixture.provider.statCalls < 41 || fixture.provider.activeStatCalls > 0); attempt++) {
				await timeout(2);
			}
			assert.deepStrictEqual({ enoughChecked: fixture.provider.statCalls >= 41, settled: fixture.provider.activeStatCalls === 0, maxConcurrent: fixture.provider.maxConcurrentStatCalls }, { enoughChecked: true, settled: true, maxConcurrent: 16 });
		});
	});

	suite('plugins', () => {
		for (const path of ['plugins/demo', '']) {
			test(`delegates the exact repository, revision and ${path ? 'subdirectory' : 'root directory'} to the existing installer`, async () => {
				const fixture = await createFixture();
				const candidate = pluginResource(path);
				const states: string[] = [];
				store.add(fixture.service.onDidChange(() => states.push(fixture.service.getInstallState(candidate).kind)));
				await fixture.service.install(candidate);
				await fixture.service.install(candidate);
				assert.deepStrictEqual({
					calls: fixture.pluginService.calls,
					firstState: states[0],
					lastState: states.at(-1),
					state: fixture.service.getInstallState(candidate).kind,
				}, {
					calls: [{ source: 'owner/catalog#release', options: { path } }],
					firstState: 'available',
					lastState: 'installed',
					state: 'installed',
				});
			});
		}

		test('disabled plugins are unavailable and never reach the installer', async () => {
			const fixture = await createFixture();
			await fixture.configurationService.setUserConfiguration(ChatConfiguration.PluginsEnabled, false);
			const candidate = pluginResource();
			await assert.rejects(fixture.service.install(candidate), /Enable agent plugins/);
			assert.deepStrictEqual({
				state: fixture.service.getInstallState(candidate).kind,
				calls: fixture.pluginService.calls,
			}, { state: 'unavailable', calls: [] });
		});

		test('keeps missing plugin records uninstallable while plugin policy disables repair', async () => {
			const fixture = await createFixture();
			const candidate = pluginResource();
			await fixture.service.install(candidate);
			const missing = Event.toPromise(Event.filter(fixture.service.onDidChange, () => fixture.service.getInstallState(candidate).kind === 'missing'));
			fixture.installedPlugins.set([], undefined);
			await missing;
			await fixture.configurationService.setUserConfiguration(ChatConfiguration.PluginsEnabled, false);
			fireConfigurationChange(fixture.configurationService, ChatConfiguration.PluginsEnabled);
			const state = fixture.service.getInstallState(candidate);
			await assert.rejects(fixture.service.repair(candidate), /Enable agent plugins/);
			await fixture.service.uninstall(candidate);
			assert.deepStrictEqual({
				state: state.kind,
				repairUnavailableMessage: state.kind === 'missing' ? state.repairUnavailableMessage : undefined,
				afterUninstall: fixture.service.getInstallState(candidate).kind,
			}, {
				state: 'missing',
				repairUnavailableMessage: 'Enable agent plugins to install this resource.',
				afterUninstall: 'unavailable',
			});
		});

		test('deduplicates pending installs and continues after a view unsubscribes', async () => {
			const fixture = await createFixture();
			const candidate = pluginResource();
			const result = new DeferredPromise<IInstallPluginFromSourceResult>();
			fixture.pluginService.onInstall = () => result.p;
			const subscription = store.add(fixture.service.onDidChange(() => { }));
			const first = fixture.service.install(candidate);
			const duplicate = fixture.service.install({ ...candidate });
			const pendingState = fixture.service.getInstallState(candidate);
			subscription.dispose();
			fixture.installedPlugins.set([installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', ref: 'release', path: 'plugins/demo' })], undefined);
			await result.complete({ success: true });
			await Promise.all([first, duplicate]);
			assert.deepStrictEqual({
				calls: fixture.pluginService.calls.length,
				pendingState,
				state: fixture.service.getInstallState(candidate).kind,
			}, { calls: 1, pendingState: { kind: 'installing' }, state: 'installed' });
		});

		for (const identity of [{ sourceId: 'anotherSource' }, { version: '2.0' }]) {
			test(`does not share pending plugin installations across ${identity.sourceId ? 'sources' : 'versions'}`, async () => {
				const fixture = await createFixture();
				const first = { ...pluginResource(), version: '1.0' };
				const second = { ...pluginResource('plugins/other'), version: '1.0', ...identity };
				const result = new DeferredPromise<IInstallPluginFromSourceResult>();
				fixture.pluginService.version = '1.0';
				fixture.pluginService.versions.set('plugins/other', identity.version ?? '1.0');
				fixture.pluginService.onInstall = () => result.p;
				const firstInstall = fixture.service.install(first);
				const beforeSecondInstall = [first, second].map(candidate => fixture.service.getInstallState(candidate).kind);
				const secondInstall = fixture.service.install(second);
				const during = [first, second].map(candidate => fixture.service.getInstallState(candidate).kind);
				await result.complete({ success: true });
				await Promise.all([firstInstall, secondInstall]);
				assert.deepStrictEqual({ beforeSecondInstall, during, calls: fixture.pluginService.calls }, {
					beforeSecondInstall: ['installing', 'available'],
					during: ['installing', 'installing'],
					calls: [
						{ source: 'owner/catalog#release', options: { path: 'plugins/demo' } },
						{ source: 'owner/catalog#release', options: { path: 'plugins/other' } },
					],
				});
			});
		}

		test('dispatches identical identifiers from different sources to their own installation flows', async () => {
			const fixture = await createFixture();
			const plugin = pluginResource();
			const server = { ...mcpResource(), sourceId: 'otherSource', identifier: plugin.identifier };
			const result = new DeferredPromise<IInstallPluginFromSourceResult>();
			fixture.pluginService.onInstall = () => result.p;
			const pluginInstall = fixture.service.install(plugin);
			const mcpInstall = fixture.service.install(server);
			await result.complete({ success: true });
			await Promise.all([pluginInstall, mcpInstall]);
			assert.deepStrictEqual({
				plugins: fixture.pluginService.calls,
				mcpLookups: fixture.mcpService.lookups,
				mcpInstalls: fixture.mcpService.installs.map(server => server.name),
			}, {
				plugins: [{ source: 'owner/catalog#release', options: { path: 'plugins/demo' } }],
				mcpLookups: ['io.example/demo'],
				mcpInstalls: ['io.example/demo'],
			});
		});

		for (const result of [{ success: false, message: 'Plugin source is blocked by policy' }, { success: false }]) {
			test(`returns to available after ${result.message ? 'an installer error' : 'installer cancellation'} and allows retry`, async () => {
				const fixture = await createFixture();
				const candidate = pluginResource();
				fixture.pluginService.result = result;
				await assert.rejects(fixture.service.install(candidate), result.message ? /Plugin source is blocked by policy/ : isCancellationError);
				const failedState = fixture.service.getInstallState(candidate).kind;
				fixture.pluginService.result = { success: true };
				await fixture.service.install(candidate);
				assert.deepStrictEqual({
					failedState,
					retryState: fixture.service.getInstallState(candidate).kind,
					calls: fixture.pluginService.calls.length,
				}, { failedState: 'available', retryState: 'installed', calls: 2 });
			});
		}

		test('shares a failed in-flight operation without leaving either caller or state pending', async () => {
			const fixture = await createFixture();
			const candidate = pluginResource();
			const result = new DeferredPromise<IInstallPluginFromSourceResult>();
			fixture.pluginService.onInstall = () => result.p;
			const first = assert.rejects(fixture.service.install(candidate), /Install failed/);
			const duplicate = assert.rejects(fixture.service.install(candidate), /Install failed/);
			await result.error(new Error('Install failed'));
			await Promise.all([first, duplicate]);
			assert.deepStrictEqual({ calls: fixture.pluginService.calls.length, state: fixture.service.getInstallState(candidate) }, {
				calls: 1, state: { kind: 'available' },
			});
		});

		test('does not associate unrecorded plugins even when their repository provenance matches', async () => {
			const fixture = await createFixture();
			const candidate = pluginResource();
			const plugins = [
				installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'OWNER/CATALOG', ref: 'release', path: 'plugins/demo' }),
				installedPlugin({ kind: PluginSourceKind.RelativePath, path: './plugins/demo/' }, './plugins/demo/'),
				installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', path: 'plugins/other' }),
				installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'different/catalog', path: 'plugins/demo' }),
			];
			const states = plugins.map(plugin => {
				fixture.installedPlugins.set([plugin], undefined);
				return fixture.service.getInstallState(candidate).kind;
			});
			fixture.installedPlugins.set([], undefined);
			states.push(fixture.service.getInstallState(candidate).kind);
			assert.deepStrictEqual(states, ['available', 'available', 'available', 'available', 'available']);
		});

		test('does not treat another plugin revision or version at the same repository path as installed', async () => {
			const fixture = await createFixture();
			const candidate = pluginResource();
			const v1Installed = installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', ref: 'v1', path: 'plugins/demo' });
			fixture.installedPlugins.set([v1Installed], undefined);
			const v1 = { ...candidate, installation: { kind: 'plugin' as const, repository: 'owner/catalog', ref: 'v1', path: 'plugins/demo' } };
			const v2 = { ...candidate, version: '2.0', installation: { kind: 'plugin' as const, repository: 'owner/catalog', ref: 'v2', path: 'plugins/demo' } };
			const sameRefNewVersion = { ...v1, version: '2.0' };
			const states = [v1, v2, sameRefNewVersion].map(item => fixture.service.getInstallState(item).kind);
			const v2Installed = installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', ref: 'v2', path: 'plugins/demo' }, 'plugins/demo', '2.0', URI.file('/cache/v2-plugin'));
			fixture.pluginService.autoMatch = false;
			fixture.pluginService.onInstall = async () => {
				fixture.installedPlugins.set([v1Installed, v2Installed], undefined);
				return { success: true, matchedPlugin: v2Installed.plugin };
			};
			await fixture.service.install(v2);
			assert.deepStrictEqual({ states, installedV2: fixture.service.getInstallState(v2).kind, installs: fixture.pluginService.calls }, {
				states: ['available', 'available', 'available'], installedV2: 'installed',
				installs: [{ source: 'owner/catalog#v2', options: { path: 'plugins/demo' } }],
			});
		});


		test('pins plugin repair to the immutable revision recorded at install time', async () => {
			const fixture = await createFixture();
			const candidate = pluginResource();
			await fixture.service.install(candidate);
			const missing = Event.toPromise(Event.filter(fixture.service.onDidChange, () => fixture.service.getInstallState(candidate).kind === 'missing'));
			fixture.installedPlugins.set([], undefined);
			await missing;
			fixture.pluginGitService.revision = 'b'.repeat(40);
			fixture.pluginService.autoMatch = false;
			fixture.pluginService.onInstall = async () => ({
				success: true,
				matchedPlugin: installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', ref: 'a'.repeat(40), path: 'plugins/demo' }).plugin,
			});
			await assert.rejects(fixture.service.repair(candidate), /recorded plugin revision is no longer available/);
			assert.deepStrictEqual({
				repairSource: fixture.pluginService.calls[1]?.source,
				state: fixture.service.getInstallState(candidate).kind,
			}, { repairSource: `owner/catalog#${'a'.repeat(40)}`, state: 'missing' });
		});

		test('matches an immutable plugin SHA only when the requested revision is that SHA', async () => {
			const fixture = await createFixture();
			const sha = 'a'.repeat(40);
			fixture.installedPlugins.set([installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', sha, path: 'plugins/demo' })], undefined);
			const candidate = pluginResource();
			assert.deepStrictEqual({
				sha: fixture.service.getInstallState({ ...candidate, installation: { kind: 'plugin', repository: 'owner/catalog', ref: sha, path: 'plugins/demo' } }).kind,
				tag: fixture.service.getInstallState(candidate).kind,
			}, { sha: 'available', tag: 'available' });
		});

		test('uninstalls through the installed agent plugin', async () => {
			const fixture = await createFixture();
			const candidate = pluginResource();
			const installed = installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', ref: 'release', path: 'plugins/demo' });
			let removeCalls = 0;
			fixture.installedPlugins.set([installed], undefined);
			fixture.pluginService.autoMatch = false;
			fixture.pluginService.result = { success: true, matchedPlugin: installed.plugin };
			await fixture.service.install(candidate);
			fixture.agentPlugins.set([
				new class extends mock<IAgentPlugin>() {
					override readonly uri = installed.pluginUri;
					override async remove(): Promise<boolean> {
						removeCalls++;
						fixture.installedPlugins.set([], undefined);
						return true;
					}
				}(),
			], undefined);

			await fixture.service.uninstall(candidate);

			assert.deepStrictEqual({ removeCalls, state: fixture.service.getInstallState(candidate).kind }, { removeCalls: 1, state: 'available' });
		});
	});

	suite('MCP servers', () => {
		test('installs default gallery entries from their pinned registry only while public feed is off', async () => {
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

		test('resolves gallery items only through the configured registry and keeps installs distinct from GitHub Feed', async () => {
			const fixture = await createFixture();
			const candidate = galleryMcpResource();
			fixture.mcpService.galleryServer = mcpServer('io.example/demo', McpServerInstallState.Uninstalled, 'io.example/demo', 'https://configured.registry.test');
			await fixture.service.install(candidate);
			assert.deepStrictEqual({
				configuredLookups: fixture.mcpService.configuredGalleryLookups,
				feedLookups: fixture.mcpService.lookups,
				installed: fixture.service.getInstallState(candidate).kind,
				feedState: fixture.service.getInstallState(mcpResource()).kind,
			}, {
				configuredLookups: ['io.example/demo'], feedLookups: [], installed: 'installed', feedState: 'available',
			});
			await fixture.service.uninstall(candidate);
			assert.deepStrictEqual(fixture.mcpService.uninstalls.length, 1);
		});

		test('rejects a mismatched configured gallery server without installing it', async () => {
			const fixture = await createFixture();
			fixture.mcpService.galleryServer = mcpServer('io.example/other', McpServerInstallState.Uninstalled);
			await assert.rejects(fixture.service.install(galleryMcpResource()), /not available in the configured registry/);
			assert.deepStrictEqual({ configuredLookups: fixture.mcpService.configuredGalleryLookups, feedLookups: fixture.mcpService.lookups, installs: fixture.mcpService.installs.length }, {
				configuredLookups: ['io.example/demo'], feedLookups: [], installs: 0,
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

		test('uses the versioned feed record and the existing eligibility and install flow', async () => {
			const fixture = await createFixture();
			const candidate = mcpResource();
			await fixture.service.install(candidate);
			await fixture.service.install(candidate);
			assert.deepStrictEqual({
				lookups: fixture.mcpService.lookups,
				versions: fixture.mcpService.feedVersions,
				checkedFeedServer: fixture.mcpService.eligibilityChecks[0] === fixture.mcpService.galleryServer,
				installedFeedServer: fixture.mcpService.installs[0] === fixture.mcpService.galleryServer,
				installCount: fixture.mcpService.installs.length,
				state: fixture.service.getInstallState(candidate).kind,
			}, {
				lookups: ['io.example/demo'], versions: ['1.0.0'], checkedFeedServer: true, installedFeedServer: true,
				installCount: 1, state: 'installed',
			});
		});

		test('does not mistake a same-name local or root server for the registry installation', async () => {
			const fixture = await createFixture();
			const candidate = mcpResource();
			fixture.mcpService.local = [mcpServer('io.example/demo', McpServerInstallState.Installed, null)];
			const stateBeforeInstall = fixture.service.getInstallState(candidate);
			await fixture.service.install(candidate);
			assert.deepStrictEqual({
				stateBeforeInstall,
				lookups: fixture.mcpService.lookups,
				installs: fixture.mcpService.installs.length,
				stateAfterInstall: fixture.service.getInstallState(candidate).kind,
			}, { stateBeforeInstall: { kind: 'available' }, lookups: ['io.example/demo'], installs: 1, stateAfterInstall: 'installed' });
		});

		test('does not associate unrecorded MCP servers regardless of matching local provenance', async () => {
			const fixture = await createFixture();
			const candidate = mcpResource();
			const locals = [
				[mcpServer('io.example/demo', McpServerInstallState.Installed, 'io.example/other')],
				[mcpServer('io.example/other', McpServerInstallState.Installed, 'io.example/demo')],
				[mcpServer('io.example/demo', McpServerInstallState.Installing)],
				[mcpServer('io.example/demo', McpServerInstallState.Uninstalled)],
				[mcpServer('io.example/demo', McpServerInstallState.Installed, null), mcpServer('io.example/demo', McpServerInstallState.Installed)],
			];
			const states = locals.map(local => {
				fixture.mcpService.local = local;
				return fixture.service.getInstallState(candidate).kind;
			});
			assert.deepStrictEqual(states, ['available', 'available', 'available', 'available', 'available']);
		});

		test('keeps a recorded feed install associated after the configured registry changes without conflating versions', async () => {
			const fixture = await createFixture();
			const candidate = mcpResource();
			await fixture.service.install(candidate);
			const installed = fixture.mcpService.local[0];
			fixture.mcpService.local = [{ ...installed, id: 'mcp:moved', gallery: undefined }];
			const moved = Event.toPromise(Event.filter(fixture.service.onDidChange, () => {
				const state = fixture.service.getInstallState(candidate);
				return state.kind === 'installed' && state.target.kind === 'mcp' && state.target.id === 'mcp:moved';
			}));
			fixture.mcpChanges.fire(fixture.mcpService.local[0]);
			await moved;
			const firstVersion = fixture.service.getInstallState(candidate).kind;
			const otherVersion = fixture.service.getInstallState(resource({
				...candidate,
				version: '2.0.0',
				installation: { kind: 'mcp', name: 'io.example/demo', version: '2.0.0' },
			})).kind;
			assert.deepStrictEqual({ firstVersion, otherVersion }, { firstVersion: 'installed', otherVersion: 'available' });
		});

		test('reports a missing feed entry without falling back to the configured registry', async () => {
			const fixture = await createFixture();
			fixture.mcpService.galleryServer = undefined;
			await assert.rejects(fixture.service.install(mcpResource()), /no longer available from the GitHub Feed/);
			assert.deepStrictEqual({
				lookups: fixture.mcpService.lookups,
				checks: fixture.mcpService.eligibilityChecks,
				installs: fixture.mcpService.installs,
				state: fixture.service.getInstallState(mcpResource()),
			}, { lookups: ['io.example/demo'], checks: [], installs: [], state: { kind: 'available' } });
		});

		test('offers publisher setup instructions when the feed MCP package requires an unsupported local runtime', async () => {
			const fixture = await createFixture();
			const candidate = mcpResource();
			const instructions = URI.parse('https://github.com/owner/mcp-server');
			fixture.mcpService.onLookup = async () => { throw new UnsupportedMcpGalleryPackageError(instructions); };
			await assert.rejects(fixture.service.install(candidate), /requires manual setup/);
			const state = fixture.service.getInstallState(candidate);
			await assert.rejects(fixture.service.install(candidate), /requires manual setup/);
			assert.deepStrictEqual({
				state,
				lookups: fixture.mcpService.lookups,
			}, {
				state: { kind: 'unavailable', message: 'This MCP server requires manual setup. Review the publisher\'s instructions before adding it.', setupUrl: instructions },
				lookups: ['io.example/demo'],
			});
		});

		test('does not offer a setup link when an unsupported MCP package has no publisher instructions', async () => {
			const fixture = await createFixture();
			fixture.mcpService.onLookup = async () => { throw new UnsupportedMcpGalleryPackageError(undefined); };
			await assert.rejects(fixture.service.install(mcpResource()), /no publisher instructions are available/);
			assert.deepStrictEqual(fixture.service.getInstallState(mcpResource()), {
				kind: 'unavailable',
				message: 'This MCP server requires manual setup, but no publisher instructions are available.',
				setupUrl: undefined,
			});
		});

		test('surfaces registry policy rejection without installing', async () => {
			const fixture = await createFixture();
			fixture.mcpService.eligibility = new MarkdownString('This server is blocked by your organization.');
			await assert.rejects(fixture.service.install(mcpResource()), /blocked by your organization/);
			assert.deepStrictEqual({ installs: fixture.mcpService.installs, state: fixture.service.getInstallState(mcpResource()) }, {
				installs: [], state: { kind: 'available' },
			});
		});

		test('propagates cancellation from the existing installer without a false installed state', async () => {
			const fixture = await createFixture();
			fixture.mcpService.installError = new CancellationError();
			await assert.rejects(fixture.service.install(mcpResource()), isCancellationError);
			assert.deepStrictEqual(fixture.service.getInstallState(mcpResource()), { kind: 'available' });
		});

		test('rechecks AI enablement after the registry lookup', async () => {
			const fixture = await createFixture();
			fixture.mcpService.onLookup = async () => {
				fixture.entitlementService.sentiment.hidden = true;
				return fixture.mcpService.galleryServer;
			};
			await assert.rejects(fixture.service.install(mcpResource()), isCancellationError);
			fixture.entitlementService.sentiment.hidden = false;
			assert.deepStrictEqual({
				checks: fixture.mcpService.eligibilityChecks,
				installs: fixture.mcpService.installs,
				state: fixture.service.getInstallState(mcpResource()),
			}, { checks: [], installs: [], state: { kind: 'available' } });
		});

		test('uninstalls the exact server from its installation record', async () => {
			const fixture = await createFixture();
			const candidate = mcpResource();
			await fixture.service.install(candidate);
			const installed = fixture.mcpService.local[0];

			await fixture.service.uninstall(candidate);

			assert.deepStrictEqual({ uninstalls: fixture.mcpService.uninstalls, state: fixture.service.getInstallState(candidate).kind }, { uninstalls: [installed], state: 'available' });
		});
	});

	suite('Copilot connectors', () => {
		test('unknown connection status cannot start an installation or claim the service is disconnected', async () => {
			const fixture = await createFixture();
			fixture.connectorsService.statusOverride = 'unknown';
			const candidate = connectorResource();
			const state = fixture.service.getInstallState(candidate);
			await assert.rejects(fixture.service.install(candidate), /Check the connection status/);
			assert.deepStrictEqual({ state, connects: fixture.connectorsService.connectCalls }, {
				state: { kind: 'unavailable', message: 'Check the connection status in MCP Servers before connecting this resource.' },
				connects: [],
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
					{ kind: 'unavailable', message: 'This connector cannot be connected while its status is \'Connection pending\'. Open MCP Servers to review it.' },
					{ kind: 'unavailable', message: 'This connector cannot be connected while its status is \'Currently unavailable\'. Open MCP Servers to review it.' },
				],
				connects: [],
			});
		});

		test('uninstalls through the connector lifecycle without public-feed or registry access', async () => {
			const fixture = await createFixture({ enabled: false, otherSourceEnabled: true });
			const candidate = connectorResource();
			await fixture.service.install(candidate);
			const before = fixture.service.getInstallState(candidate);
			await fixture.service.uninstall(candidate);
			await fixture.service.uninstall(candidate);
			assert.deepStrictEqual({
				before,
				disconnects: fixture.connectorsService.disconnectCalls,
				registryLookups: fixture.mcpService.lookups,
				after: fixture.service.getInstallState(candidate),
			}, {
				before: { kind: 'installed', target: connectorInstallationTarget },
				disconnects: ['mail'],
				registryLookups: [],
				after: { kind: 'available' },
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

		test('uses the connector consent flow and reflects the connected state', async () => {
			const fixture = await createFixture();
			const candidate = connectorResource();
			const before = fixture.service.getInstallState(candidate);

			await fixture.service.install(candidate);
			await fixture.service.install(candidate);

			assert.deepStrictEqual({
				before,
				connectCalls: fixture.connectorsService.connectCalls,
				after: fixture.service.getInstallState(candidate),
				recordedResources: fixture.service.getRecordedResources(),
				installationRecordKeys: fixture.storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE).filter(key => key.includes('customizations.marketplace.installationRecord.v1')),
			}, {
				before: { kind: 'available' },
				connectCalls: ['mail'],
				after: { kind: 'installed', target: connectorInstallationTarget },
				recordedResources: [],
				installationRecordKeys: [],
			});
		});

		test('is unavailable when the connector experiment is disabled', async () => {
			const fixture = await createFixture();
			await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, false);

			const state = fixture.service.getInstallState(connectorResource());

			assert.deepStrictEqual(state, { kind: 'unavailable', message: 'Enable this resource\'s marketplace source to install it.' });
		});

		test('connector-only enablement permits consent without public-feed or registry access', async () => {
			const fixture = await createFixture({ enabled: false, otherSourceEnabled: true });
			await fixture.service.install(connectorResource());
			assert.deepStrictEqual({
				publicState: fixture.service.getInstallState(resource()).kind,
				connectorState: fixture.service.getInstallState(connectorResource()).kind,
				connects: fixture.connectorsService.connectCalls,
				registryLookups: fixture.mcpService.lookups,
			}, { publicState: 'unavailable', connectorState: 'installed', connects: ['mail'], registryLookups: [] });
		});

		test('disabling connectors cancels consent and refuses joining its pending operation while the public feed stays enabled', async () => {
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
			await assert.rejects(fixture.service.install(connectorResource()), /Enable this resource's marketplace source/);
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
				disabled: { cancelled: true, state: 'unavailable', publicState: 'available', connects: ['mail'] },
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

	suite('skills', () => {
		test('confirms provenance and copies the complete directory through an external staging directory', async () => {
			const fixture = await createFixture();
			await fixture.fileService.writeFile(joinPath(sourceDirectory, 'scripts', 'run.sh'), VSBuffer.fromString('#!/bin/sh\necho demo\n'));
			await fixture.fileService.writeFile(joinPath(sourceDirectory, 'assets', 'template.json'), VSBuffer.fromString('{"demo":true}'));
			await fixture.fileService.createFolder(joinPath(sourceDirectory, 'assets', 'empty'));
			await fixture.fileService.writeFile(joinPath(sourceDirectory, '.git', 'config'), VSBuffer.fromString('private git metadata'));
			await fixture.fileService.writeFile(joinPath(sourceDirectory, 'scripts', '.GiT'), VSBuffer.fromString('gitdir: elsewhere'));
			fixture.harnessService.folders = [
				{ uri: destinationDirectory, label: 'Workspace', source: PromptsStorage.local },
				{ uri: URI.file('/extensions/skills'), label: 'Extension', source: PromptsStorage.extension },
			];
			const states: string[] = [];
			store.add(fixture.service.onDidChange(() => states.push(fixture.service.getInstallState(resource()).kind)));
			await fixture.service.install(resource());
			await fixture.service.install(resource());
			const confirmationDetail = fixture.dialogService.confirmations[0]?.detail;
			const detail = typeof confirmationDetail === 'string' ? confirmationDetail : confirmationDetail?.value ?? '';
			assert.deepStrictEqual({
				files: await readTree(fixture.fileService, skillDestination),
				source: fixture.repositoryService.calls.map(call => call.reference.rawValue),
				sourceFolderRequests: fixture.harnessService.folderRequests.map(request => ({ session: request.session.toString(), type: request.type })),
				confirmation: {
					count: fixture.dialogService.confirmations.length,
					source: detail.includes('Source: owner/catalog/skills/demo-skill'),
					revision: detail.includes('Revision: release'),
					destination: detail.includes(`Destination: ${skillDestination.path}`),
					trustWarning: detail.includes('Only install resources from sources you trust.'),
				},
				moves: fixture.provider.moves.map(move => ({
					parent: dirname(move.source).path,
					outsideDestination: !isEqualOrParent(move.source, destinationDirectory),
					target: move.target.path,
					overwrite: move.overwrite,
				})),
				directWrites: fixture.provider.writes.filter(uri => isEqualOrParent(uri, destinationDirectory)),
				staging: await stagingDirectories(fixture.fileService),
				pickerCalls: fixture.quickInputService.calls,
				progressLocation: fixture.progressService.options[0]?.location,
				states,
			}, {
				files: [
					['assets', null],
					['assets/empty', null],
					['assets/template.json', '{"demo":true}'],
					['scripts', null],
					['scripts/run.sh', '#!/bin/sh\necho demo\n'],
					['SKILL.md', skillContent],
				],
				source: ['owner/catalog#release'],
				sourceFolderRequests: [{ session: URI.parse('test-harness:///session').toString(), type: PromptsType.skill }],
				confirmation: { count: 1, source: true, revision: true, destination: true, trustWarning: true },
				moves: [{ parent: '/workspace/.github', outsideDestination: true, target: skillDestination.path, overwrite: false }],
				directWrites: [],
				staging: [],
				pickerCalls: 0,
				progressLocation: ProgressLocation.Notification,
				states: ['installing', 'installed'],
			});
		});

		test('routes skill uninstall through normal deletion and keeps the record when deletion is cancelled', async () => {
			const fixture = await createFixture();
			const candidate = resource();
			await fixture.service.install(candidate);
			fixture.commandService.deleteEnabled = false;
			await assert.rejects(fixture.service.uninstall(candidate), isCancellationError);
			const cancelled = { exists: await fixture.fileService.exists(skillDestination), state: fixture.service.getInstallState(candidate).kind, deletions: fixture.deletedSkills.length };
			fixture.commandService.deleteEnabled = true;

			await fixture.service.uninstall(candidate);

			assert.deepStrictEqual({
				cancelled,
				exists: await fixture.fileService.exists(skillDestination),
				state: fixture.service.getInstallState(candidate).kind,
				deletions: fixture.deletedSkills.map(uri => uri.toString()),
			}, {
				cancelled: { exists: true, state: 'installed', deletions: 0 },
				exists: false,
				state: 'available',
				deletions: [joinPath(skillDestination, SKILL_FILENAME).toString()],
			});
		});


		test('retains the skill record when uninstall cannot verify the target', async () => {
			const fixture = await createFixture();
			const candidate = resource();
			await fixture.service.install(candidate);
			fixture.provider.statErrorResource = skillDestination;
			await assert.rejects(fixture.service.uninstall(candidate), /Permission denied/);
			assert.deepStrictEqual({
				state: fixture.service.getInstallState(candidate).kind,
				records: fixture.storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE).filter(key => key.includes('customizations.marketplace.installationRecord.v1')).length,
			}, { state: 'installed', records: 1 });
		});

		test('repairs only missing recorded files while preserving edits and extra files', async () => {
			const fixture = await createFixture();
			const candidate = resource();
			await fixture.fileService.writeFile(joinPath(sourceDirectory, 'scripts', 'run.sh'), VSBuffer.fromString('original script'));
			await fixture.service.install(candidate);
			await fixture.fileService.writeFile(joinPath(skillDestination, SKILL_FILENAME), VSBuffer.fromString('# Locally edited skill'));
			await fixture.fileService.writeFile(joinPath(skillDestination, 'notes.txt'), VSBuffer.fromString('local notes'));
			const reconciled = Event.toPromise(Event.filter(fixture.service.onDidChange, () => fixture.service.getInstallState(candidate).kind === 'missing'));
			await fixture.fileService.del(joinPath(skillDestination, 'scripts', 'run.sh'));
			await reconciled;
			const stateBeforeRepair = fixture.service.getInstallState(candidate).kind;

			await fixture.service.repair(candidate);

			assert.deepStrictEqual({
				stateBeforeRepair,
				stateAfterRepair: fixture.service.getInstallState(candidate).kind,
				files: await readTree(fixture.fileService, skillDestination),
				repositoryCalls: fixture.repositoryService.calls.length,
				confirmations: fixture.dialogService.confirmations.map(confirmation => confirmation.primaryButton),
			}, {
				stateBeforeRepair: 'missing',
				stateAfterRepair: 'installed',
				files: [
					['notes.txt', 'local notes'],
					['scripts', null],
					['scripts/run.sh', 'original script'],
					[SKILL_FILENAME, '# Locally edited skill'],
				],
				repositoryCalls: 2,
				confirmations: ['Install', 'Repair'],
			});
		});


		test('pins repair to the immutable revision recorded at install time', async () => {
			const fixture = await createFixture();
			const candidate = resource();
			await fixture.service.install(candidate);
			const missing = Event.toPromise(Event.filter(fixture.service.onDidChange, () => fixture.service.getInstallState(candidate).kind === 'missing'));
			await fixture.fileService.del(joinPath(skillDestination, SKILL_FILENAME));
			await missing;
			fixture.pluginGitService.revision = 'b'.repeat(40);
			await assert.rejects(fixture.service.repair(candidate), /recorded skill revision is no longer available/);
			assert.deepStrictEqual({
				repairReference: fixture.repositoryService.calls[1]?.reference.rawValue,
				state: fixture.service.getInstallState(candidate).kind,
				targetExists: await fixture.fileService.exists(joinPath(skillDestination, SKILL_FILENAME)),
			}, { repairReference: `owner/catalog#${'a'.repeat(40)}`, state: 'missing', targetExists: false });
		});

		test('associates projectless local records through the provider destination identity', async () => {
			const fixture = await createFixture();
			fixture.workspaceService.activeProjectRoot.set(undefined, undefined);
			fixture.harnessService.folders = [{ uri: destinationDirectory, label: 'Workspace', source: PromptsStorage.local, destinationGroupId: 'shared-workspace' }];
			const candidate = resource();
			await fixture.service.install(candidate);
			const mappedFolder = URI.file('/mapped/skills');
			const mappedSkill = joinPath(mappedFolder, 'demo-skill', SKILL_FILENAME);
			await fixture.fileService.writeFile(mappedSkill, VSBuffer.fromString(skillContent));
			fixture.harnessService.folders = [{ uri: mappedFolder, label: 'Workspace', source: PromptsStorage.local, destinationGroupId: 'shared-workspace' }];
			fixture.harnessService.activeSessionResource.set(URI.parse('test-harness:///another-session'), undefined);
			const associated = Event.toPromise(Event.filter(fixture.service.onDidChange, () => fixture.service.getInstallState(candidate).kind === 'installed'));
			await associated;
			const state = fixture.service.getInstallState(candidate);
			assert.deepStrictEqual({ kind: state.kind, target: state.kind === 'installed' && state.target.kind === 'skill' ? state.target.uri.toString() : undefined }, { kind: 'installed', target: mappedSkill.toString() });
		});

		test('supports a repository-root skill and the harness user source location', async () => {
			const fixture = await createFixture();
			const userDirectory = URI.file('/user/skills');
			fixture.harnessService.folders = [{ uri: userDirectory, label: 'User', source: PromptsStorage.user }];
			await fixture.fileService.del(joinPath(repository, 'skills'), { recursive: true });
			await fixture.fileService.writeFile(joinPath(repository, SKILL_FILENAME), VSBuffer.fromString(skillContent));
			await fixture.service.install(resource({ installation: { kind: 'skill', repository: 'owner/catalog', ref: 'release', path: '' } }));
			assert.deepStrictEqual({
				files: await readTree(fixture.fileService, joinPath(userDirectory, 'catalog')),
				pickerCalls: fixture.quickInputService.calls,
				target: fixture.provider.moves[0]?.target.path,
				stagingParent: fixture.provider.moves[0] && dirname(fixture.provider.moves[0].source).path,
			}, { files: [[SKILL_FILENAME, skillContent]], pickerCalls: 0, target: '/user/skills/catalog', stagingParent: '/user' });
		});

		test('requires explicit source confirmation before cloning or writing', async () => {
			const fixture = await createFixture();
			fixture.dialogService.result = { confirmed: false };
			await assert.rejects(fixture.service.install(resource()), isCancellationError);
			assert.deepStrictEqual({
				repositories: fixture.repositoryService.calls,
				writes: fixture.provider.writes,
				moves: fixture.provider.moves,
				state: fixture.service.getInstallState(resource()),
			}, { repositories: [], writes: [], moves: [], state: { kind: 'available' } });
		});

		test('cancelling the destination picker does not prompt for trust or clone', async () => {
			const fixture = await createFixture();
			fixture.harnessService.folders = [
				{ uri: destinationDirectory, label: 'Workspace', source: PromptsStorage.local },
				{ uri: URI.file('/user/skills'), label: 'User', source: PromptsStorage.user },
			];
			await assert.rejects(fixture.service.install(resource()), isCancellationError);
			assert.deepStrictEqual({
				pickerCalls: fixture.quickInputService.calls,
				confirmations: fixture.dialogService.confirmations,
				repositories: fixture.repositoryService.calls,
				state: fixture.service.getInstallState(resource()),
			}, { pickerCalls: 1, confirmations: [], repositories: [], state: { kind: 'available' } });
		});

		test('reports the absence of a writable harness source location', async () => {
			const fixture = await createFixture();
			fixture.harnessService.folders = [{ uri: URI.file('/extensions/skills'), label: 'Extension', source: PromptsStorage.extension }];
			await assert.rejects(fixture.service.install(resource()), /writable skill installation location/);
			assert.deepStrictEqual({
				repositories: fixture.repositoryService.calls,
				confirmations: fixture.dialogService.confirmations,
				state: fixture.service.getInstallState(resource()),
			}, { repositories: [], confirmations: [], state: { kind: 'available' } });
		});

		test('propagates a failed repository acquisition without creating a destination', async () => {
			const fixture = await createFixture();
			fixture.repositoryService.onEnsure = async () => { throw new Error('Repository is unavailable'); };
			await assert.rejects(fixture.service.install(resource()), /Repository is unavailable/);
			assert.deepStrictEqual({
				targetExists: await fixture.fileService.exists(skillDestination),
				staging: await stagingDirectories(fixture.fileService),
				state: fixture.service.getInstallState(resource()),
			}, { targetExists: false, staging: [], state: { kind: 'available' } });
		});

		test('never overwrites an existing destination', async () => {
			const fixture = await createFixture();
			await fixture.fileService.writeFile(joinPath(skillDestination, SKILL_FILENAME), VSBuffer.fromString('Existing skill'));
			await assert.rejects(fixture.service.install(resource()), /already exists/);
			assert.deepStrictEqual({
				files: await readTree(fixture.fileService, skillDestination),
				repositories: fixture.repositoryService.calls,
				confirmations: fixture.dialogService.confirmations,
				state: fixture.service.getInstallState(resource()),
			}, { files: [[SKILL_FILENAME, 'Existing skill']], repositories: [], confirmations: [], state: { kind: 'available' } });
		});

		test('preserves a destination created concurrently with the final rename and removes staging', async () => {
			const fixture = await createFixture();
			fixture.provider.beforeMove = async () => {
				await fixture.fileService.writeFile(joinPath(skillDestination, SKILL_FILENAME), VSBuffer.fromString('Concurrent skill'));
			};
			await assert.rejects(fixture.service.install(resource()), /exists/);
			assert.deepStrictEqual({
				files: await readTree(fixture.fileService, skillDestination),
				overwrite: fixture.provider.moves.map(move => move.overwrite),
				staging: await stagingDirectories(fixture.fileService),
				state: fixture.service.getInstallState(resource()),
			}, { files: [[SKILL_FILENAME, 'Concurrent skill']], overwrite: [false], staging: [], state: { kind: 'available' } });
		});

		for (const failure of ['write', 'move']) {
			test(`removes staging after a failed ${failure} without claiming installation`, async () => {
				const fixture = await createFixture();
				if (failure === 'write') {
					await fixture.fileService.writeFile(joinPath(sourceDirectory, 'asset.txt'), VSBuffer.fromString('Asset'));
					fixture.provider.beforeWrite = async uri => {
						if (isStaging(uri) && basename(uri) === 'asset.txt') {
							throw new Error('Staging write failed');
						}
					};
				} else {
					fixture.provider.beforeMove = async () => { throw new Error('Staging move failed'); };
				}
				await assert.rejects(fixture.service.install(resource()), /Staging (write|move) failed/);
				assert.deepStrictEqual({
					targetExists: await fixture.fileService.exists(skillDestination),
					staging: await stagingDirectories(fixture.fileService),
					state: fixture.service.getInstallState(resource()),
				}, { targetExists: false, staging: [], state: { kind: 'available' } });
			});
		}


		test('rejects a skill when its repository revision changes during staging', async () => {
			const fixture = await createFixture();
			fixture.provider.afterWrite = async uri => {
				if (isStaging(uri)) {
					fixture.pluginGitService.revision = 'b'.repeat(40);
				}
			};
			await assert.rejects(fixture.service.install(resource()), /source changed while it was being copied/);
			assert.deepStrictEqual({
				targetExists: await fixture.fileService.exists(skillDestination),
				staging: await stagingDirectories(fixture.fileService),
				state: fixture.service.getInstallState(resource()).kind,
			}, { targetExists: false, staging: [], state: 'available' });
		});

		test('rejects a skill whose staged SKILL.md disappears before commit', async () => {
			const fixture = await createFixture();
			await fixture.fileService.writeFile(joinPath(sourceDirectory, 'asset.txt'), VSBuffer.fromString('Asset'));
			fixture.provider.afterWrite = async uri => {
				if (isStaging(uri) && basename(uri) === 'asset.txt') {
					await fixture.fileService.del(joinPath(dirname(uri), SKILL_FILENAME));
				}
			};
			await assert.rejects(fixture.service.install(resource()), /source changed before the skill was fully copied/);
			assert.deepStrictEqual({
				targetExists: await fixture.fileService.exists(skillDestination),
				moves: fixture.provider.moves,
				staging: await stagingDirectories(fixture.fileService),
				state: fixture.service.getInstallState(resource()),
			}, { targetExists: false, moves: [], staging: [], state: { kind: 'available' } });
		});

		for (const path of ['../demo-skill', 'skills/../demo-skill', 'skills//demo-skill', '/skills/demo-skill', 'skills/./demo-skill', 'skills/.git/demo-skill', 'skills\\demo-skill', 'skills/Not Valid', `skills/${'x'.repeat(65)}`]) {
			test(`rejects unsafe or unsupported skill path ${JSON.stringify(path)}`, async () => {
				const fixture = await createFixture();
				await assert.rejects(fixture.service.install(resource({ installation: { kind: 'skill', repository: 'owner/catalog', ref: 'release', path } })), /invalid|not supported/);
				assert.deepStrictEqual({
					folderRequests: fixture.harnessService.folderRequests,
					confirmations: fixture.dialogService.confirmations,
					repositories: fixture.repositoryService.calls,
					moves: fixture.provider.moves,
					staging: await stagingDirectories(fixture.fileService),
				}, { folderRequests: [], confirmations: [], repositories: [], moves: [], staging: [] });
			});
		}

		test('rejects a repository source that is not GitHub shorthand', async () => {
			const fixture = await createFixture();
			await assert.rejects(fixture.service.install(resource({
				installation: { kind: 'skill', repository: 'https://untrusted.example/catalog.git', ref: 'release', path: 'skills/demo-skill' },
			})), /installation source is invalid/);
			assert.deepStrictEqual({ repositories: fixture.repositoryService.calls, moves: fixture.provider.moves }, { repositories: [], moves: [] });
		});

		for (const skillFile of ['missing', 'directory']) {
			test(`rejects a ${skillFile} SKILL.md`, async () => {
				const fixture = await createFixture();
				await fixture.fileService.del(joinPath(sourceDirectory, SKILL_FILENAME));
				if (skillFile === 'directory') {
					await fixture.fileService.createFolder(joinPath(sourceDirectory, SKILL_FILENAME));
				}
				await assert.rejects(fixture.service.install(resource()), /SKILL\.md/);
				assert.deepStrictEqual({
					targetExists: await fixture.fileService.exists(skillDestination),
					staging: await stagingDirectories(fixture.fileService),
					state: fixture.service.getInstallState(resource()),
				}, { targetExists: false, staging: [], state: { kind: 'available' } });
			});
		}

		test('rejects an empty SKILL.md without publishing a partial directory', async () => {
			const fixture = await createFixture();
			await fixture.fileService.writeFile(joinPath(sourceDirectory, SKILL_FILENAME), VSBuffer.fromString(' \n\t'));
			await assert.rejects(fixture.service.install(resource()), /SKILL\.md/);
			assert.deepStrictEqual({
				targetExists: await fixture.fileService.exists(skillDestination),
				staging: await stagingDirectories(fixture.fileService),
				state: fixture.service.getInstallState(resource()),
			}, { targetExists: false, staging: [], state: { kind: 'available' } });
		});

		test('rejects unsupported file types instead of silently dropping contents', async () => {
			const fixture = await createFixture();
			const unsupported = joinPath(sourceDirectory, 'special');
			await fixture.fileService.writeFile(unsupported, VSBuffer.fromString('Unsupported entry'));
			fixture.provider.fileTypes.set(unsupported.path, FileType.Unknown);
			await assert.rejects(fixture.service.install(resource()), /file type that cannot be installed/);
			assert.deepStrictEqual({
				targetExists: await fixture.fileService.exists(skillDestination),
				staging: await stagingDirectories(fixture.fileService),
				state: fixture.service.getInstallState(resource()),
			}, { targetExists: false, staging: [], state: { kind: 'available' } });
		});

		for (const entry of [
			{ path: 'skills', type: FileType.Directory },
			{ path: 'skills/demo-skill', type: FileType.Directory },
			{ path: 'skills/demo-skill/SKILL.md', type: FileType.File },
			{ path: 'skills/demo-skill/scripts', type: FileType.Directory },
			{ path: 'skills/demo-skill/scripts/run.sh', type: FileType.File },
		]) {
			test(`rejects symbolic links at ${entry.path}`, async () => {
				const fixture = await createFixture();
				await fixture.fileService.writeFile(joinPath(sourceDirectory, 'scripts', 'run.sh'), VSBuffer.fromString('echo demo'));
				fixture.provider.fileTypes.set(joinPath(repository, entry.path).path, entry.type | FileType.SymbolicLink);
				await assert.rejects(fixture.service.install(resource()), /symbolic links|regular SKILL\.md/);
				assert.deepStrictEqual({
					targetExists: await fixture.fileService.exists(skillDestination),
					staging: await stagingDirectories(fixture.fileService),
					state: fixture.service.getInstallState(resource()),
				}, { targetExists: false, staging: [], state: { kind: 'available' } });
			});
		}

		for (const change of ['harness', 'session', 'project', 'AI features', 'progress cancellation', 'service disposal']) {
			test(`stops before commit and removes staging after ${change} during copying`, async () => {
				const fixture = await createFixture();
				const paused = new DeferredPromise<void>();
				const resume = new DeferredPromise<void>();
				fixture.provider.afterWrite = async uri => {
					if (isStaging(uri)) {
						await paused.complete();
						await resume.p;
					}
				};
				const outcome = Promise.allSettled([fixture.service.install(resource())]);
				await Promise.race([paused.p, outcome]);
				switch (change) {
					case 'harness': fixture.harnessService.activeHarness.set('other-harness', undefined); break;
					case 'session': fixture.harnessService.activeSessionResource.set(URI.parse('test-harness:///different-session'), undefined); break;
					case 'project': fixture.workspaceService.activeProjectRoot.set(URI.file('/different-project'), undefined); break;
					case 'AI features': fixture.entitlementService.sentiment.hidden = true; break;
					case 'progress cancellation': fixture.progressService.cancel?.(); break;
					case 'service disposal': fixture.service.dispose(); break;
				}
				await resume.complete();
				const [result] = await outcome;
				fixture.entitlementService.sentiment.hidden = false;
				assert.deepStrictEqual({
					cancelled: result.status === 'rejected' && isCancellationError(result.reason),
					targetExists: await fixture.fileService.exists(skillDestination),
					moves: fixture.provider.moves,
					staging: await stagingDirectories(fixture.fileService),
					state: fixture.service.getInstallState(resource()),
				}, { cancelled: true, targetExists: false, moves: [], staging: [], state: { kind: 'available' } });
			});
		}

		for (const change of ['source disabled', 'harness', 'session', 'project', 'AI features', 'progress cancellation', 'service disposal']) {
			test(`removes a committed skill after ${change} during the final move`, async () => {
				const fixture = await createFixture();
				const paused = new DeferredPromise<void>();
				const resume = new DeferredPromise<void>();
				fixture.provider.afterMove = async () => {
					await paused.complete();
					await resume.p;
				};
				const outcome = Promise.allSettled([fixture.service.install(resource())]);
				await Promise.race([paused.p, outcome]);
				switch (change) {
					case 'source disabled': await setSourcesEnabled(fixture.configurationService, false, ['testSource']); break;
					case 'harness': fixture.harnessService.activeHarness.set('other-harness', undefined); break;
					case 'session': fixture.harnessService.activeSessionResource.set(URI.parse('test-harness:///different-session'), undefined); break;
					case 'project': fixture.workspaceService.activeProjectRoot.set(URI.file('/different-project'), undefined); break;
					case 'AI features': fixture.entitlementService.sentiment.hidden = true; break;
					case 'progress cancellation': fixture.progressService.cancel?.(); break;
					case 'service disposal': fixture.service.dispose(); break;
				}
				await resume.complete();
				const [result] = await outcome;
				fixture.entitlementService.sentiment.hidden = false;
				if (change === 'source disabled') {
					await setSourcesEnabled(fixture.configurationService, true, ['testSource']);
				}
				assert.deepStrictEqual({
					cancelled: result.status === 'rejected' && isCancellationError(result.reason),
					targetExists: await fixture.fileService.exists(skillDestination),
					moves: fixture.provider.moves.length,
					staging: await stagingDirectories(fixture.fileService),
					state: fixture.service.getInstallState(resource()),
				}, { cancelled: true, targetExists: false, moves: 1, staging: [], state: { kind: 'available' } });
			});
		}

		test('passes progress cancellation to repository acquisition and does not copy after it resolves', async () => {
			const fixture = await createFixture();
			const started = new DeferredPromise<void>();
			const repositoryResult = new DeferredPromise<URI>();
			fixture.repositoryService.onEnsure = async () => {
				await started.complete();
				return repositoryResult.p;
			};
			const outcome = Promise.allSettled([fixture.service.install(resource())]);
			await Promise.race([started.p, outcome]);
			const token = fixture.repositoryService.calls[0]?.options?.token ?? CancellationToken.None;
			fixture.progressService.cancel?.();
			const cancelled = token.isCancellationRequested;
			await repositoryResult.complete(repository);
			const [result] = await outcome;
			assert.deepStrictEqual({
				cancelled,
				rejectedWithCancellation: result.status === 'rejected' && isCancellationError(result.reason),
				targetExists: await fixture.fileService.exists(skillDestination),
				moves: fixture.provider.moves,
				staging: await stagingDirectories(fixture.fileService),
			}, { cancelled: true, rejectedWithCancellation: true, targetExists: false, moves: [], staging: [] });
		});

		test('cancels when the selected project changes while confirmation is open', async () => {
			const fixture = await createFixture();
			fixture.dialogService.onConfirm = async () => {
				fixture.workspaceService.activeProjectRoot.set(URI.file('/different-project'), undefined);
				return { confirmed: true };
			};
			await assert.rejects(fixture.service.install(resource()), isCancellationError);
			assert.deepStrictEqual({
				repositories: fixture.repositoryService.calls,
				moves: fixture.provider.moves,
				state: fixture.service.getInstallState(resource()),
			}, { repositories: [], moves: [], state: { kind: 'available' } });
		});

		for (const entries of [1000, 1001]) {
			test(`${entries === 1000 ? 'accepts' : 'rejects'} ${entries} total entries, counting directories as well as files`, async () => {
				const fixture = await createFixture();
				await fixture.fileService.createFolder(joinPath(sourceDirectory, 'assets'));
				for (let index = 0; index < entries - 2; index++) {
					await fixture.fileService.writeFile(joinPath(sourceDirectory, 'assets', `${index}.txt`), VSBuffer.fromString(''));
				}
				if (entries === 1000) {
					await fixture.service.install(resource());
				} else {
					await assert.rejects(fixture.service.install(resource()), /too many files/);
				}
				assert.deepStrictEqual({
					state: fixture.service.getInstallState(resource()).kind,
					targetExists: await fixture.fileService.exists(skillDestination),
					installedEntries: entries === 1000 ? (await readTree(fixture.fileService, skillDestination)).length : 0,
					staging: await stagingDirectories(fixture.fileService),
				}, { state: entries === 1000 ? 'installed' : 'available', targetExists: entries === 1000, installedEntries: entries === 1000 ? 1000 : 0, staging: [] });
			});
		}

		for (const excessBytes of [0, 1]) {
			test(`${excessBytes ? 'rejects one byte beyond' : 'accepts exactly'} the cumulative 50 MiB limit`, async () => {
				const fixture = await createFixture();
				const payloadBytes = 50 * 1024 * 1024 - VSBuffer.fromString(skillContent).byteLength;
				await fixture.fileService.writeFile(joinPath(sourceDirectory, 'payload.bin'), VSBuffer.alloc(payloadBytes));
				await fixture.fileService.writeFile(joinPath(sourceDirectory, 'tail.bin'), VSBuffer.alloc(excessBytes));
				if (excessBytes) {
					await assert.rejects(fixture.service.install(resource()), /too large|50 MB/);
				} else {
					await fixture.service.install(resource());
				}
				assert.deepStrictEqual({
					state: fixture.service.getInstallState(resource()).kind,
					targetExists: await fixture.fileService.exists(skillDestination),
					installedBytes: excessBytes ? 0 : (await fixture.fileService.stat(joinPath(skillDestination, 'payload.bin'))).size,
					staging: await stagingDirectories(fixture.fileService),
				}, { state: excessBytes ? 'available' : 'installed', targetExists: !excessBytes, installedBytes: excessBytes ? 0 : payloadBytes, staging: [] });
			});
		}

		test('does not reuse installed skill state across sources or versions', async () => {
			const fixture = await createFixture();
			const candidate = { ...resource(), version: '1.0' };
			await fixture.service.install(candidate);
			assert.deepStrictEqual([
				candidate,
				{ ...candidate, sourceId: 'anotherSource' },
				{ ...candidate, version: '2.0' },
			].map(item => fixture.service.getInstallState(item).kind), ['installed', 'available', 'available']);
		});

		test('scopes installed skills to the project and harness, and invalidates them when deleted', async () => {
			const fixture = await createFixture();
			const candidate = resource();
			await fixture.service.install(candidate);
			const states = [fixture.service.getInstallState(candidate).kind];
			fixture.workspaceService.activeProjectRoot.set(URI.file('/other'), undefined);
			states.push(fixture.service.getInstallState(candidate).kind);
			fixture.workspaceService.activeProjectRoot.set(URI.file('/workspace'), undefined);
			fixture.harnessService.activeHarness.set('other-harness', undefined);
			states.push(fixture.service.getInstallState(candidate).kind);
			fixture.harnessService.activeHarness.set('test-harness', undefined);
			states.push(fixture.service.getInstallState(candidate).kind);
			const missing = Event.toPromise(Event.filter(fixture.service.onDidChange, () => fixture.service.getInstallState(candidate).kind === 'missing'));
			await fixture.fileService.del(joinPath(skillDestination, SKILL_FILENAME));
			await missing;
			states.push(fixture.service.getInstallState(candidate).kind);
			assert.deepStrictEqual(states, ['installed', 'available', 'available', 'installed', 'missing']);
		});
	});
});
