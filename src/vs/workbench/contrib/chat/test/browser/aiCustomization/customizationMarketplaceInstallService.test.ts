/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { basename, dirname, isEqualOrParent, joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { FileType, IFileOverwriteOptions, IFileService, IFileWriteOptions, IStat } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IGalleryMcpServer } from '../../../../../../platform/mcp/common/mcpManagement.js';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from '../../../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpServerInstallState } from '../../../../mcp/common/mcpTypes.js';
import { ICopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { CustomizationMarketplaceInstallService } from '../../../browser/aiCustomization/customizationMarketplaceInstallService.js';
import { IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { IAgentPluginRepositoryService, IEnsureRepositoryOptions } from '../../../common/plugins/agentPluginRepositoryService.js';
import { IInstallPluginFromSourceOptions, IInstallPluginFromSourceResult, IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { IMarketplaceInstalledPlugin, IMarketplaceReference, IPluginMarketplaceService, IPluginSourceDescriptor, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { SKILL_FILENAME } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

const repository = URI.file('/cache/catalog');
const sourceDirectory = joinPath(repository, 'skills', 'demo-skill');
const destinationDirectory = URI.file('/workspace/.github/skills');
const skillDestination = joinPath(destinationDirectory, 'demo-skill');
const skillContent = '# Demo skill\n';

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
		url: URI.parse('https://untrusted.example/server.json'),
		installation: { kind: 'mcp', name: 'io.example/demo' },
	});
}

function connectorResource(): ICustomizationMarketplaceResource {
	return resource({
		identifier: 'mail',
		displayName: 'Mail',
		mediaType: CustomizationMarketplaceMediaType.McpServer,
		installation: { kind: 'copilotConnector', name: 'mail' },
	});
}

function installedPlugin(sourceDescriptor: IPluginSourceDescriptor, source = 'plugins/demo'): IMarketplaceInstalledPlugin {
	const reference = parseMarketplaceReference('owner/catalog#release');
	assert.ok(reference);
	return {
		pluginUri: URI.file('/cache/installed-plugin'),
		plugin: {
			name: 'demo',
			description: '',
			version: '1.0.0',
			source,
			sourceDescriptor,
			marketplace: 'Catalog',
			marketplaceReference: reference,
			marketplaceType: MarketplaceType.Copilot,
		},
	};
}

function mcpServer(name = 'io.example/demo', installState = McpServerInstallState.Uninstalled, galleryName: string | null = name): IWorkbenchMcpServer {
	const gallery = new class extends mock<IGalleryMcpServer>() {
		override readonly name = galleryName ?? name;
	}();
	return new class extends mock<IWorkbenchMcpServer>() {
		override readonly name = name;
		override readonly installState = installState;
		override readonly gallery = galleryName === null ? undefined : gallery;
	}();
}

function isStaging(resource: URI): boolean {
	return resource.path.split('/').some(segment => segment.startsWith('.customization-marketplace-'));
}

class SkillFileSystemProvider extends InMemoryFileSystemProvider {
	readonly fileTypes = new Map<string, FileType>();
	readonly writes: URI[] = [];
	readonly moves: { source: URI; target: URI; overwrite: boolean }[] = [];
	beforeWrite: ((resource: URI) => Promise<void>) | undefined;
	afterWrite: ((resource: URI) => Promise<void>) | undefined;
	beforeMove: (() => Promise<void>) | undefined;

	override async stat(resource: URI): Promise<IStat> {
		const stat = await super.stat(resource);
		return { ...stat, type: this.fileTypes.get(resource.path) ?? stat.type };
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
	}
}

suite('CustomizationMarketplaceInstallService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createFixture(options: { enabled?: boolean } = { enabled: true }) {
		const instantiationService = store.add(new TestInstantiationService());
		const logService = store.add(new NullLogService());
		const fileService = store.add(new FileService(logService));
		const provider = store.add(new SkillFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
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
		const pluginService = new class extends mock<IPluginInstallService>() {
			readonly calls: { source: string; options: IInstallPluginFromSourceOptions | undefined }[] = [];
			result: IInstallPluginFromSourceResult = { success: true };
			onInstall: (() => Promise<IInstallPluginFromSourceResult>) | undefined;
			override async installPluginFromSource(source: string, options?: IInstallPluginFromSourceOptions): Promise<IInstallPluginFromSourceResult> {
				this.calls.push({ source, options });
				return this.onInstall ? this.onInstall() : this.result;
			}
		}();
		const repositoryService = new class extends mock<IAgentPluginRepositoryService>() {
			readonly calls: { reference: IMarketplaceReference; options: IEnsureRepositoryOptions | undefined }[] = [];
			onEnsure: (() => Promise<URI>) | undefined;
			override async ensureRepository(reference: IMarketplaceReference, options?: IEnsureRepositoryOptions): Promise<URI> {
				this.calls.push({ reference, options });
				return this.onEnsure ? this.onEnsure() : repository;
			}
		}();
		const mcpChanges = store.add(new Emitter<IWorkbenchMcpServer | undefined>());
		const mcpService = new class extends mock<IMcpWorkbenchService>() {
			override readonly onChange = mcpChanges.event;
			override local: IWorkbenchMcpServer[] = [];
			readonly lookups: string[] = [];
			readonly eligibilityChecks: IWorkbenchMcpServer[] = [];
			readonly installs: IWorkbenchMcpServer[] = [];
			galleryServer: IWorkbenchMcpServer | undefined = mcpServer();
			eligibility: true | IMarkdownString = true;
			installError: Error | undefined;
			onLookup: (() => Promise<IWorkbenchMcpServer | undefined>) | undefined;
			override async getMcpServerFromGallery(name: string): Promise<IWorkbenchMcpServer | undefined> {
				this.lookups.push(name);
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
				const installed = mcpServer(server.name, McpServerInstallState.Installed);
				this.local = [installed];
				mcpChanges.fire(installed);
				return installed;
			}
		}();
		const connectorChanges = store.add(new Emitter<void>());
		const connectedConnectors = new Set<string>();
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = connectorChanges.event;
			readonly connectCalls: string[] = [];
			onConnect: ((name: string, token: CancellationToken) => Promise<void>) | undefined;
			override get connectors() {
				return [{
					name: 'mail',
					displayName: 'Mail',
					description: 'Search mail',
					tags: [],
					capabilities: [],
					representativeQueries: [],
					connectionStatus: connectedConnectors.has('mail') ? 'connected' : 'available',
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
			[ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled]: true,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		if (options.enabled !== undefined) {
			await configurationService.setUserConfiguration(ChatConfiguration.ChatCustomizationsUnifiedMarketplaceEnabled, options.enabled);
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
		instantiationService.stub(IAgentPluginRepositoryService, repositoryService);
		instantiationService.stub(IMcpWorkbenchService, mcpService);
		instantiationService.stub(ICopilotConnectorsService, connectorsService);
		instantiationService.stub(ICustomizationHarnessService, harnessService);
		instantiationService.stub(IAICustomizationWorkspaceService, workspaceService);
		instantiationService.stub(IChatEntitlementService, entitlementService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDialogService, dialogService);
		instantiationService.stub(IProgressService, progressService);
		instantiationService.stub(IQuickInputService, quickInputService);
		instantiationService.stub(ILabelService, labelService);
		instantiationService.stub(ILogService, logService);
		const service = store.add(instantiationService.createInstance(CustomizationMarketplaceInstallService));
		return {
			service, fileService, provider, installedPlugins, marketplaceService, pluginService, repositoryService, mcpService, mcpChanges,
			connectorsService, connectorChanges, harnessService, workspaceService, entitlementService, sentimentChanges, configurationService, dialogService, progressService, quickInputService,
		};
	}

	function fireConfigurationChange(configurationService: TestConfigurationService, key: string): void {
		configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === key; }
		}());
	}

	async function setExperimentEnabled(configurationService: TestConfigurationService, enabled: boolean): Promise<void> {
		await configurationService.setUserConfiguration(ChatConfiguration.ChatCustomizationsUnifiedMarketplaceEnabled, enabled);
		fireConfigurationChange(configurationService, ChatConfiguration.ChatCustomizationsUnifiedMarketplaceEnabled);
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

	suite('experiment gate', () => {
		for (const enabled of [undefined, false]) {
			test(`blocks all installation activity when the experiment is ${enabled === undefined ? 'unset' : 'explicitly disabled'}`, async () => {
				const fixture = await createFixture({ enabled });
				await fixture.configurationService.setUserConfiguration('chat.agentFinder.enabled', true);
				const candidates = [resource(), pluginResource(), mcpResource()];
				for (const candidate of candidates) {
					await assert.rejects(fixture.service.install(candidate), /unified marketplace experiment/);
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
					await setExperimentEnabled(fixture.configurationService, false);
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
				await setExperimentEnabled(fixture.configurationService, true);
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
				await setExperimentEnabled(fixture.configurationService, false);
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
				await setExperimentEnabled(fixture.configurationService, true);
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
				await setExperimentEnabled(fixture.configurationService, false);
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
			await setExperimentEnabled(fixture.configurationService, false);
			await setExperimentEnabled(fixture.configurationService, true);
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

		test('re-enabling does not reuse installed state for a skill removed while disabled', async () => {
			const fixture = await createFixture();
			await fixture.service.install(resource());
			await setExperimentEnabled(fixture.configurationService, false);
			const deleted = Event.toPromise(Event.filter(fixture.fileService.onDidFilesChange, event => event.contains(skillDestination)));
			await fixture.fileService.del(skillDestination, { recursive: true });
			await deleted;
			await setExperimentEnabled(fixture.configurationService, true);
			const stateBeforeRetry = fixture.service.getInstallState(resource()).kind;
			await fixture.service.install(resource());
			assert.deepStrictEqual({
				stateBeforeRetry,
				stateAfterRetry: fixture.service.getInstallState(resource()).kind,
				cloneCalls: fixture.repositoryService.calls.length,
				installedFileExists: await fixture.fileService.exists(joinPath(skillDestination, SKILL_FILENAME)),
			}, { stateBeforeRetry: 'available', stateAfterRetry: 'installed', cloneCalls: 2, installedFileExists: true });
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

	suite('plugins', () => {
		for (const path of ['plugins/demo', '']) {
			test(`delegates the exact repository, revision and ${path ? 'subdirectory' : 'root directory'} to the existing installer`, async () => {
				const fixture = await createFixture();
				const candidate = pluginResource(path);
				const states: string[] = [];
				store.add(fixture.service.onDidChange(() => states.push(fixture.service.getInstallState(candidate).kind)));
				await fixture.service.install(candidate);
				fixture.installedPlugins.set([installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', path })], undefined);
				await fixture.service.install(candidate);
				assert.deepStrictEqual({
					calls: fixture.pluginService.calls,
					firstState: states[0],
					lastState: states.at(-1),
					state: fixture.service.getInstallState(candidate),
				}, {
					calls: [{ source: 'owner/catalog#release', options: { path } }],
					firstState: 'installing',
					lastState: 'installed',
					state: { kind: 'installed' },
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
			fixture.installedPlugins.set([installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'owner/catalog', path: 'plugins/demo' })], undefined);
			await result.complete({ success: true });
			await Promise.all([first, duplicate]);
			assert.deepStrictEqual({
				calls: fixture.pluginService.calls.length,
				pendingState,
				state: fixture.service.getInstallState(candidate),
			}, { calls: 1, pendingState: { kind: 'installing' }, state: { kind: 'installed' } });
		});

		for (const identity of [{ sourceId: 'anotherSource' }, { version: '2.0' }]) {
			test(`does not share pending plugin installations across ${identity.sourceId ? 'sources' : 'versions'}`, async () => {
				const fixture = await createFixture();
				const first = { ...pluginResource(), version: '1.0' };
				const second = { ...pluginResource('plugins/other'), version: '1.0', ...identity };
				const result = new DeferredPromise<IInstallPluginFromSourceResult>();
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
				const states: string[] = [];
				store.add(fixture.service.onDidChange(() => states.push(fixture.service.getInstallState(candidate).kind)));
				fixture.pluginService.result = result;
				await assert.rejects(fixture.service.install(candidate), result.message ? /Plugin source is blocked by policy/ : isCancellationError);
				const failedState = fixture.service.getInstallState(candidate);
				fixture.pluginService.result = { success: true };
				await fixture.service.install(candidate);
				assert.deepStrictEqual({
					failedState,
					successWithoutInstalledEntry: fixture.service.getInstallState(candidate),
					calls: fixture.pluginService.calls.length,
					states,
				}, {
					failedState: { kind: 'available' }, successWithoutInstalledEntry: { kind: 'available' }, calls: 2,
					states: ['installing', 'available', 'installing', 'available'],
				});
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

		test('derives installed state from matching GitHub and relative marketplace sources, not other paths', async () => {
			const fixture = await createFixture();
			const candidate = pluginResource();
			const plugins = [
				installedPlugin({ kind: PluginSourceKind.GitHub, repo: 'OWNER/CATALOG', path: 'plugins/demo' }),
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
			assert.deepStrictEqual(states, ['installed', 'installed', 'available', 'available', 'available']);
		});
	});

	suite('MCP servers', () => {
		test('uses the configured registry by name and the existing eligibility and install flow', async () => {
			const fixture = await createFixture();
			const candidate = mcpResource();
			await fixture.service.install(candidate);
			await fixture.service.install(candidate);
			assert.deepStrictEqual({
				lookups: fixture.mcpService.lookups,
				checkedRegistryServer: fixture.mcpService.eligibilityChecks[0] === fixture.mcpService.galleryServer,
				installedRegistryServer: fixture.mcpService.installs[0] === fixture.mcpService.galleryServer,
				installCount: fixture.mcpService.installs.length,
				state: fixture.service.getInstallState(candidate),
			}, {
				lookups: ['io.example/demo'], checkedRegistryServer: true, installedRegistryServer: true, installCount: 1, state: { kind: 'installed' },
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
				stateAfterInstall: fixture.service.getInstallState(candidate),
			}, { stateBeforeInstall: { kind: 'available' }, lookups: ['io.example/demo'], installs: 1, stateAfterInstall: { kind: 'installed' } });
		});

		test('requires matching local and gallery names and a completed installation', async () => {
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
			assert.deepStrictEqual(states, ['available', 'available', 'available', 'available', 'installed']);
		});

		test('reports a missing registry entry without trying a catalog URL', async () => {
			const fixture = await createFixture();
			fixture.mcpService.galleryServer = undefined;
			await assert.rejects(fixture.service.install(mcpResource()), /not available in the configured registry/);
			assert.deepStrictEqual({
				lookups: fixture.mcpService.lookups,
				checks: fixture.mcpService.eligibilityChecks,
				installs: fixture.mcpService.installs,
				state: fixture.service.getInstallState(mcpResource()),
			}, { lookups: ['io.example/demo'], checks: [], installs: [], state: { kind: 'available' } });
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
	});

	suite('Copilot connectors', () => {
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
			}, {
				before: { kind: 'available' },
				connectCalls: ['mail'],
				after: { kind: 'installed' },
			});
		});

		test('is unavailable when the connector experiment is disabled', async () => {
			const fixture = await createFixture();
			await fixture.configurationService.setUserConfiguration(ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled, false);

			const state = fixture.service.getInstallState(connectorResource());

			assert.deepStrictEqual(state, { kind: 'unavailable', message: 'Enable the Copilot connectors experiment to connect this resource.' });
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
					state: fixture.service.getInstallState(resource()),
					targetExists: await fixture.fileService.exists(skillDestination),
					installedEntries: entries === 1000 ? (await readTree(fixture.fileService, skillDestination)).length : 0,
					staging: await stagingDirectories(fixture.fileService),
				}, { state: { kind: entries === 1000 ? 'installed' : 'available' }, targetExists: entries === 1000, installedEntries: entries === 1000 ? 1000 : 0, staging: [] });
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
					state: fixture.service.getInstallState(resource()),
					targetExists: await fixture.fileService.exists(skillDestination),
					installedBytes: excessBytes ? 0 : (await fixture.fileService.stat(joinPath(skillDestination, 'payload.bin'))).size,
					staging: await stagingDirectories(fixture.fileService),
				}, { state: { kind: excessBytes ? 'available' : 'installed' }, targetExists: !excessBytes, installedBytes: excessBytes ? 0 : payloadBytes, staging: [] });
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
			const changed = Event.toPromise(fixture.service.onDidChange);
			await fixture.fileService.del(joinPath(skillDestination, SKILL_FILENAME));
			await changed;
			states.push(fixture.service.getInstallState(candidate).kind);
			assert.deepStrictEqual(states, ['installed', 'available', 'available', 'installed', 'available']);
		});
	});
});
