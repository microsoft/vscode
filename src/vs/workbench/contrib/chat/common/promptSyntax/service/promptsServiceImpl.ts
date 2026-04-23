/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { parse as parseJSONC } from '../../../../../../base/common/json.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../../../base/common/stopwatch.js';
import { autorun, IReader } from '../../../../../../base/common/observable.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { basename, dirname, isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { type ITextModel } from '../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../../platform/files/common/files.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IFilesConfigurationService } from '../../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { IVariableReference } from '../../chatModes.js';
import { PromptsConfig } from '../config/config.js';
import { AGENT_MD_FILENAME, CLAUDE_CONFIG_FOLDER, CLAUDE_LOCAL_MD_FILENAME, CLAUDE_MD_FILENAME, COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, getCleanPromptName, getSkillFolderName, GITHUB_CONFIG_FOLDER, IResolvedPromptSourceFolder, isInClaudeRulesFolder } from '../config/promptFileLocations.js';
import { PROMPT_LANGUAGE_ID, PromptFileSource, PromptsType, Target, getPromptsTypeForLanguageId } from '../promptTypes.js';
import { IWorkspaceInstructionFile, PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { evaluateApplyToPattern, PromptFileParser, ParsedPromptFile, PromptHeaderAttributes } from '../promptFileParser.js';
import { IAgentInstructions, type IAgentSource, IChatPromptSlashCommand, IConfiguredHooksInfo, ICustomAgent, IExtensionPromptPath, isExtensionPromptPath, ILocalPromptPath, IPluginPromptPath, IPromptPath, IPromptsService, IAgentSkill, IInstructionDiscoveryInfo, IInstructionDiscoveryResult, IInstructionFile, IUserPromptPath, PromptsStorage, CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT, INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT, IPromptFileContext, IPromptFileResource, PROMPT_FILE_PROVIDER_ACTIVATION_EVENT, SKILL_PROVIDER_ACTIVATION_EVENT, IPromptDiscoveryInfo, IPromptFileDiscoveryResult, IPromptSourceFolderResult, ICustomAgentVisibility, IAgentInstructionFile, AgentInstructionFileType, Logger, ISlashCommandDiscoveryInfo, ISlashCommandDiscoveryResult, IAgentDiscoveryInfo, IAgentDiscoveryResult, IHookDiscoveryInfo, IResolvedChatPromptSlashCommand } from './promptsService.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { ChatRequestHooks, parseSubagentHooksFromYaml } from '../hookSchema.js';
import { type IParsedHookCommand } from '../../../../../../platform/agentPlugins/common/pluginParsers.js';
import { HookType } from '../hookTypes.js';
import { HookSourceFormat, parseHooksFromFile } from '../hookCompatibility.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { getTarget, mapClaudeModels, mapClaudeTools } from '../languageProviders/promptFileAttributes.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { getCanonicalPluginCommandId, IAgentPlugin, IAgentPluginService } from '../../plugins/agentPluginService.js';
import { isContributionEnabled } from '../../enablement.js';
import { assertNever } from '../../../../../../base/common/assert.js';

/**
 * Error thrown when a skill file is missing the required name attribute.
 */
export class SkillMissingNameError extends Error {
	constructor(public readonly uri: URI) {
		super('Skill file must have a name attribute');
	}
}

/**
 * Error thrown when a skill file is missing the required description attribute.
 */
export class SkillMissingDescriptionError extends Error {
	constructor(public readonly uri: URI) {
		super('Skill file must have a description attribute');
	}
}

/**
 * Error thrown when a skill's name does not match its parent folder name.
 */
export class SkillNameMismatchError extends Error {
	constructor(
		public readonly uri: URI,
		public readonly skillName: string,
		public readonly folderName: string
	) {
		super(`Skill name must match folder name: expected "${folderName}" but got "${skillName}"`);
	}
}

type PromptFileProviderEntry = {
	extension: IExtensionDescription;
	type: PromptsType;
	onDidChangePromptFiles?: Event<void>;
	providePromptFiles: (context: IPromptFileContext, token: CancellationToken) => Promise<IPromptFileResource[] | undefined>;
};

/**
 * Provides prompt services.
 */
export class PromptsService extends Disposable implements IPromptsService {
	public declare readonly _serviceBrand: undefined;

	/**
	 * Prompt files locator utility.
	 */
	private readonly fileLocator: PromptFilesLocator;

	/**
	 * Cached agent discovery info.
	 */
	private readonly cachedCustomAgents: CachedPromise<IAgentDiscoveryInfo>;

	/**
	 * Cached slash command discovery info.
	 */
	private readonly cachedSlashCommands: CachedPromise<ISlashCommandDiscoveryInfo>;

	/**
	 * Cached hooks. Invalidated when hook files change.
	 */
	private readonly cachedHooks: CachedPromise<IHookDiscoveryInfo>;

	/**
	 * Cached skill discovery info.
	 */
	private readonly cachedSkills: CachedPromise<IPromptDiscoveryInfo>;

	/**
	 * Cached instructions.
	 */
	private readonly cachedInstructions: CachedPromise<IInstructionDiscoveryInfo>;

	/**
	 * Cache for parsed prompt files keyed by URI.
	 * The number in the returned tuple is textModel.getVersionId(), which is an internal VS Code counter that increments every time the text model's content changes.
	 */
	private readonly cachedParsedPromptFromModels = new ResourceMap<[number, ParsedPromptFile]>();

	/**
	 * Cached file locations commands. Caching only happens if the corresponding `fileLocatorEvents` event is used.
	 */
	private readonly cachedFileLocations: { [key in PromptsType]?: Promise<readonly IPromptPath[]> } = {};

	/**
	 * Lazily created events that notify listeners when the file locations for a given prompt type change.
	 * An event is created on demand for each prompt type and can be used by consumers to react to updates
	 * in the set of prompt files (e.g., when prompt files are added, removed, or modified).
	 */
	private readonly fileLocatorEvents: { [key in PromptsType]?: Event<void> } = {};


	/**
	 * Contributed files from extensions keyed by prompt type then name.
	 */
	private readonly contributedFiles = {
		[PromptsType.prompt]: new ResourceMap<Promise<IExtensionPromptPath>>(),
		[PromptsType.instructions]: new ResourceMap<Promise<IExtensionPromptPath>>(),
		[PromptsType.agent]: new ResourceMap<Promise<IExtensionPromptPath>>(),
		[PromptsType.skill]: new ResourceMap<Promise<IExtensionPromptPath>>(),
		[PromptsType.hook]: new ResourceMap<Promise<IExtensionPromptPath>>(),
	};

	/**
	 * Context keys referenced by contributed and provider-supplied `when` clauses.
	 */
	private readonly _contributedWhenKeys = new Set<string>();
	private readonly _contributedWhenClauses = new Map<string, string>();
	private readonly _providerWhenClauses = new Map<PromptFileProviderEntry, readonly string[]>();
	private readonly _onDidContributedWhenChange = this._register(new Emitter<void>());
	private readonly _onDidChangeInstructions = this._register(new Emitter<void>());
	private readonly _onDidPluginPromptFilesChange = this._register(new Emitter<void>());
	private readonly _onDidPluginHooksChange = this._register(new Emitter<void>());
	private _pluginPromptFilesByType = new Map<PromptsType, readonly IPluginPromptPath[]>();

	/**
	 * Pending URIs to mark as readonly, flushed on the next microtask.
	 * This batches multiple `registerContributedFile` calls (which happen
	 * synchronously in the extension point handler) into a single
	 * `updateReadonly` call to avoid firing `onDidChangeReadonly` per file.
	 */
	private _pendingReadonlyUris: URI[] = [];
	private _pendingReadonlyFlush = false;

	constructor(
		@ILogService public readonly logger: ILogService,
		@ILabelService private readonly labelService: ILabelService,
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IUserDataProfileService private readonly userDataService: IUserDataProfileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService protected readonly fileService: IFileService,
		@IFilesConfigurationService private readonly filesConfigService: IFilesConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IPathService protected readonly pathService: IPathService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService,
	) {
		super();

		this.fileLocator = this.createPromptFilesLocator();

		this._register(this.modelService.onModelRemoved((model) => {
			this.cachedParsedPromptFromModels.delete(model.uri);
		}));

		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(this._contributedWhenKeys)) {
				for (const type of Object.keys(this.cachedFileLocations) as PromptsType[]) {
					this.cachedFileLocations[type] = undefined;
				}
				this._onDidContributedWhenChange.fire();
			}
		}));

		const modelChangeEvent = this._register(new ModelChangeTracker(this.modelService)).onDidPromptChange;
		this.cachedCustomAgents = this._register(new CachedPromise(
			(token) => this.computeAgentDiscoveryInfo(token),
			() => Event.any(
				this.getFileLocatorEvent(PromptsType.agent),
				Event.filter(modelChangeEvent, e => e.promptType === PromptsType.agent),
				Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(PromptsConfig.USE_CHAT_HOOKS)),
				this._onDidContributedWhenChange.event,
				this._onDidPluginPromptFilesChange.event,
				this.workspaceTrustService.onDidChangeTrust,
			)
		));

		this.cachedSlashCommands = this._register(new CachedPromise(
			(token) => this.computeSlashCommandDiscoveryInfo(token),
			() => Event.any(
				this.getFileLocatorEvent(PromptsType.prompt),
				this.getFileLocatorEvent(PromptsType.skill),
				Event.filter(modelChangeEvent, e => e.promptType === PromptsType.prompt),
				Event.filter(modelChangeEvent, e => e.promptType === PromptsType.skill),
				this._onDidContributedWhenChange.event,
				this._onDidPluginPromptFilesChange.event),
		));

		this.cachedSkills = this._register(new CachedPromise(
			(token) => this.computeSkillDiscovery(token),
			() => Event.any(
				this.getFileLocatorEvent(PromptsType.skill),
				Event.filter(modelChangeEvent, e => e.promptType === PromptsType.skill),
				this._onDidContributedWhenChange.event,
				this._onDidPluginPromptFilesChange.event)
		));

		this.cachedHooks = this._register(new CachedPromise(
			(token) => this.computeHooks(token),
			() => Event.any(
				this.getFileLocatorEvent(PromptsType.hook),
				Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(PromptsConfig.USE_CHAT_HOOKS) || e.affectsConfiguration(PromptsConfig.USE_CLAUDE_HOOKS)),
				this._onDidPluginHooksChange.event,
				this.workspaceTrustService.onDidChangeTrust,
			)
		));

		this.cachedInstructions = this._register(new CachedPromise(
			(token) => this.computeInstructionFiles(token),
			() => Event.any(
				this.getFileLocatorEvent(PromptsType.instructions),
				this._onDidContributedWhenChange.event,
				this._onDidChangeInstructions.event,
				this._onDidPluginPromptFilesChange.event,
			)
		));

		this._register(this.watchPluginPromptFilesForType(
			PromptsType.prompt,
			(plugin, reader) => plugin.commands.read(reader),
		));
		this._register(this.watchPluginPromptFilesForType(
			PromptsType.skill,
			(plugin, reader) => plugin.skills.read(reader),
		));
		this._register(this.watchPluginPromptFilesForType(
			PromptsType.agent,
			(plugin, reader) => plugin.agents.read(reader),
		));
		this._register(this.watchPluginPromptFilesForType(
			PromptsType.instructions,
			(plugin, reader) => plugin.instructions.read(reader),
		));

		this._register(autorun(reader => {
			const plugins = this.agentPluginService.plugins.read(reader);
			const hookFiles: IPluginPromptPath[] = [];
			for (const plugin of plugins) {
				if (isContributionEnabled(plugin.enablement.read(reader))) {
					for (const hook of plugin.hooks.read(reader)) {
						hookFiles.push({
							uri: hook.uri,
							storage: PromptsStorage.plugin,
							type: PromptsType.hook,
							name: getCanonicalPluginCommandId(plugin, hook.originalId),
							pluginUri: plugin.uri,
							source: PromptFileSource.Plugin,
						});
					}
				}
			}

			this._pluginPromptFilesByType.set(PromptsType.hook, hookFiles);
			this.cachedFileLocations[PromptsType.hook] = undefined;
			this._onDidPluginHooksChange.fire();
		}));
	}

	private watchPluginPromptFilesForType(
		type: PromptsType,
		getItems: (plugin: IAgentPlugin, reader: IReader) => readonly { uri: URI; name: string }[],
	) {
		return autorun(reader => {
			const plugins = this.agentPluginService.plugins.read(reader);
			const nextFiles: IPluginPromptPath[] = [];
			for (const plugin of plugins) {
				if (!isContributionEnabled(plugin.enablement.read(reader))) {
					continue;
				}
				for (const item of getItems(plugin, reader)) {
					nextFiles.push({
						uri: item.uri,
						storage: PromptsStorage.plugin,
						type,
						name: getCanonicalPluginCommandId(plugin, item.name),
						pluginUri: plugin.uri,
						source: PromptFileSource.Plugin,
					});
				}
			}

			nextFiles.sort((a, b) => `${a.name ?? ''}|${a.uri.toString()}`.localeCompare(`${b.name ?? ''}|${b.uri.toString()}`));
			this._pluginPromptFilesByType.set(type, nextFiles);
			this.cachedFileLocations[type] = undefined;
			this._onDidPluginPromptFilesChange.fire();
		});
	}

	protected createPromptFilesLocator(): PromptFilesLocator {
		return this.instantiationService.createInstance(PromptFilesLocator);
	}

	private getFileLocatorEvent(type: PromptsType): Event<void> {
		let event = this.fileLocatorEvents[type];
		if (!event) {
			event = this.fileLocatorEvents[type] = this._register(this.fileLocator.createFilesUpdatedEvent(type)).event;
			this._register(event(() => {
				this.cachedFileLocations[type] = undefined;
			}));
		}
		return event;
	}

	public getParsedPromptFile(textModel: ITextModel): ParsedPromptFile {
		const cached = this.cachedParsedPromptFromModels.get(textModel.uri);
		if (cached && cached[0] === textModel.getVersionId()) {
			return cached[1];
		}
		const ast = new PromptFileParser().parse(textModel.uri, textModel.getValue());
		if (!cached || cached[0] < textModel.getVersionId()) {
			this.cachedParsedPromptFromModels.set(textModel.uri, [textModel.getVersionId(), ast]);
		}
		return ast;
	}

	public async listPromptFiles(type: PromptsType, token: CancellationToken): Promise<readonly IPromptPath[]> {
		let listPromise = this.cachedFileLocations[type];
		if (!listPromise) {
			listPromise = this.computeListPromptFiles(type, token);
			if (!this.fileLocatorEvents[type]) {
				return listPromise;
			}
			this.cachedFileLocations[type] = listPromise;
			return listPromise;
		}
		return listPromise;
	}

	private async computeListPromptFiles(type: PromptsType, token: CancellationToken): Promise<readonly IPromptPath[]> {
		const prompts = await Promise.all([
			this.fileLocator.listFiles(type, PromptsStorage.user, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.user, type } satisfies IUserPromptPath))),
			this.fileLocator.listFiles(type, PromptsStorage.local, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.local, type } satisfies ILocalPromptPath))),
			this.getExtensionPromptFiles(type, token),
			this._pluginPromptFilesByType.get(type) ?? [],
		]);

		return prompts.flat();
	}

	/**
	 * Collects diagnostic information about which source folders were searched for display in the debug panel.
	 */
	private async _collectSourceFolderDiagnostics(type: PromptsType): Promise<IPromptSourceFolderResult[]> {
		const resolvedFolders = await this.fileLocator.getSourceFoldersInDiscoveryOrder(type);
		return resolvedFolders.map(folder => ({
			uri: folder.uri,
			storage: folder.storage,
		}));
	}

	/**
	 * Registry of prompt file provider instances (custom agents, instructions, prompt files).
	 * Extensions can register providers via the proposed API.
	 */
	private readonly promptFileProviders: PromptFileProviderEntry[] = [];

	/**
	 * Registers a prompt file provider (CustomAgentProvider, InstructionsProvider, or PromptFileProvider).
	 * This will be called by the extension host bridge when
	 * an extension registers a provider via vscode.chat.registerCustomAgentProvider(),
	 * registerInstructionsProvider(), or registerPromptFileProvider().
	 */
	public registerPromptFileProvider(extension: IExtensionDescription, type: PromptsType, provider: {
		onDidChangePromptFiles?: Event<void>;
		providePromptFiles: (context: IPromptFileContext, token: CancellationToken) => Promise<IPromptFileResource[] | undefined>;
	}): IDisposable {
		const providerEntry = { extension, type, ...provider };
		this.promptFileProviders.push(providerEntry);

		const disposables = new DisposableStore();

		// Listen to provider change events to rerun computeListPromptFiles
		if (provider.onDidChangePromptFiles) {
			disposables.add(provider.onDidChangePromptFiles(() => {
				this.invalidatePromptFileCache(type);
			}));
		}

		// Invalidate cache when providers change
		this.invalidatePromptFileCache(type);

		disposables.add({
			dispose: () => {
				const index = this.promptFileProviders.findIndex((p) => p === providerEntry);
				if (index >= 0) {
					this.promptFileProviders.splice(index, 1);
					this._providerWhenClauses.delete(providerEntry);
					this._updateContributedWhenKeys();
					this.invalidatePromptFileCache(type);
				}
			}
		});

		return disposables;
	}

	private invalidatePromptFileCache(type: PromptsType): void {
		if (type === PromptsType.agent) {
			this.cachedFileLocations[PromptsType.agent] = undefined;
			this.cachedCustomAgents.refresh();
		} else if (type === PromptsType.instructions) {
			this.cachedFileLocations[PromptsType.instructions] = undefined;
			this._onDidChangeInstructions.fire();
		} else if (type === PromptsType.prompt) {
			this.cachedFileLocations[PromptsType.prompt] = undefined;
			this.cachedSlashCommands.refresh();
		} else if (type === PromptsType.skill) {
			this.cachedFileLocations[PromptsType.skill] = undefined;
			this.cachedSkills.refresh();
			this.cachedSlashCommands.refresh();
		}
	}

	/**
	 * Shared helper to list prompt files from registered providers for a given type.
	 */
	private async listFromProviders(type: PromptsType, activationEvent: string, token: CancellationToken): Promise<IExtensionPromptPath[]> {
		const result: IExtensionPromptPath[] = [];
		const readonlyUris: URI[] = [];

		// Activate extensions that might provide files for this type
		await this.extensionService.activateByEvent(activationEvent);

		const providers = this.promptFileProviders.filter(p => p.type === type);
		if (providers.length === 0) {
			return result;
		}

		// Collect files from all providers
		for (const providerEntry of providers) {
			try {
				const files = await providerEntry.providePromptFiles({}, token);
				this._providerWhenClauses.set(providerEntry, files?.flatMap(file => file.when ? [file.when] : []) ?? []);
				this._updateContributedWhenKeys();
				if (!files || token.isCancellationRequested) {
					continue;
				}

				for (const file of files) {
					readonlyUris.push(file.uri);
					result.push({
						uri: file.uri,
						storage: PromptsStorage.extension,
						type,
						extension: providerEntry.extension,
						source: PromptFileSource.ExtensionAPI,
						name: file.name,
						description: file.description,
						when: file.when,
						sessionTypes: file.sessionTypes,
					} satisfies IExtensionPromptPath);
				}
			} catch (e) {
				this.logger.error(`[listFromProviders] Failed to get ${type} files from provider`, e instanceof Error ? e.message : String(e));
			}
		}

		// Mark all collected files as readonly in a single batch to avoid
		// firing onDidChangeReadonly once per file (which causes a cascade
		// of event handlers and can freeze the renderer).
		void this.filesConfigService.updateReadonly(readonlyUris, true);

		return result;
	}


	public async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage, token: CancellationToken): Promise<readonly IPromptPath[]> {
		let promptPaths: readonly IPromptPath[];
		switch (storage) {
			case PromptsStorage.extension:
				promptPaths = await this.getExtensionPromptFiles(type, token);
				break;
			case PromptsStorage.local:
				promptPaths = await this.fileLocator.listFiles(type, PromptsStorage.local, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.local, type } satisfies ILocalPromptPath)));
				break;
			case PromptsStorage.user:
				promptPaths = await this.fileLocator.listFiles(type, PromptsStorage.user, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.user, type } satisfies IUserPromptPath)));
				break;
			case PromptsStorage.plugin:
				promptPaths = this._pluginPromptFilesByType.get(type) ?? [];
				break;
			default:
				throw new Error(`[listPromptFilesForStorage] Unsupported prompt storage type: ${storage}`);
		}

		return promptPaths;
	}

	private async getExtensionPromptFiles(type: PromptsType, token: CancellationToken): Promise<IExtensionPromptPath[]> {
		await this.extensionService.whenInstalledExtensionsRegistered();
		const settledResults = await Promise.allSettled(this.contributedFiles[type].values());
		const contributedFiles = settledResults
			.filter((result): result is PromiseFulfilledResult<IExtensionPromptPath> => result.status === 'fulfilled')
			.map(result => result.value);

		const activationEvent = this.getProviderActivationEvent(type);
		const providerFiles = activationEvent ? await this.listFromProviders(type, activationEvent, token) : [];

		return [...contributedFiles, ...providerFiles].filter(file => {
			if (!file.when) {
				return true;
			}

			const when = ContextKeyExpr.deserialize(file.when);
			if (!when) {
				this.logger.warn(`[getExtensionPromptFiles] Ignoring contributed prompt file with invalid when clause: ${file.when}`);
				return false;
			}

			return this.contextKeyService.contextMatchesRules(when);
		});
	}

	private getProviderActivationEvent(type: PromptsType): string | undefined {
		switch (type) {
			case PromptsType.agent:
				return CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.instructions:
				return INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.prompt:
				return PROMPT_FILE_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.skill:
				return SKILL_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.hook:
				return undefined; // hooks don't have extension providers
		}
	}

	public async getSourceFolders(type: PromptsType): Promise<readonly IPromptPath[]> {
		const result: IPromptPath[] = [];

		if (type === PromptsType.hook) {
			// For hooks, return the Copilot hooks folder for creating new hooks
			// (Claude paths are read-only and not included here)
			const hooksFolders = await this.fileLocator.getHookSourceFolders();
			for (const folder of hooksFolders) {
				result.push({ uri: folder.uri, storage: folder.storage, type, source: folder.source });
			}
		} else {
			for (const uri of await this.fileLocator.getConfigBasedSourceFolders(type)) {
				result.push({ uri, storage: PromptsStorage.local, type });
			}
		}

		if (type !== PromptsType.skill && type !== PromptsType.hook) {
			// no user source folders for skills and hooks
			const userHome = this.userDataService.currentProfile.promptsHome;
			result.push({ uri: userHome, storage: PromptsStorage.user, type });
		}

		return result;
	}

	public async getResolvedSourceFolders(type: PromptsType): Promise<readonly IResolvedPromptSourceFolder[]> {
		return this.fileLocator.getResolvedSourceFolders(type);
	}

	// slash prompt commands

	/**
	 * Emitter for slash commands change events.
	 */
	public get onDidChangeSlashCommands(): Event<void> {
		return this.cachedSlashCommands.onDidChangePromise;
	}

	public async getPromptSlashCommands(token: CancellationToken): Promise<readonly IChatPromptSlashCommand[]> {
		const discoveryInfo = await this.cachedSlashCommands.get(token);
		const result = this.slashCommandsFromDiscoveryInfo(discoveryInfo);
		return result;
	}

	/**
	 * Computes discovery info for slash commands, combining prompts and skills.
	 */
	private async computeSlashCommandDiscoveryInfo(token: CancellationToken): Promise<ISlashCommandDiscoveryInfo> {
		const stopWatch = StopWatch.create(true);
		const promptFiles = await this.listPromptFiles(PromptsType.prompt, token);
		const useAgentSkills = this.configurationService.getValue(PromptsConfig.USE_AGENT_SKILLS);
		const skills = useAgentSkills ? await this.listPromptFiles(PromptsType.skill, token) : [];
		const disabledSkills = this.getDisabledPromptFiles(PromptsType.skill);
		const slashCommandFiles = [
			...promptFiles,
			...skills.filter(s => !disabledSkills.has(s.uri)),
		];

		const parseResults = await Promise.all(slashCommandFiles.map(async promptPath => {
			try {
				const parsedPromptFile = await this.parseNew(promptPath.uri, token);
				const rawName = parsedPromptFile?.header?.name ?? promptPath.name ?? getCleanPromptName(promptPath.uri);
				// For plugin resources, ensure the canonical plugin prefix is always preserved even when the
				// file's frontmatter overrides the name.
				const name = promptPath.source === PromptFileSource.Plugin && promptPath.pluginUri
					? getCanonicalPluginCommandId({ uri: promptPath.pluginUri }, rawName)
					: rawName;
				const description = parsedPromptFile?.header?.description ?? promptPath.description;
				const argumentHint = parsedPromptFile?.header?.argumentHint;
				const userInvocable = parsedPromptFile?.header?.userInvocable;
				return { status: 'loaded', promptPath: this.withPromptPathMetadata(promptPath, name, description), argumentHint, userInvocable } satisfies ISlashCommandDiscoveryResult;
			} catch (e) {
				this.logger.error(`[computeSlashCommandDiscoveryInfo] Failed to parse prompt file for slash command: ${promptPath.uri}`, e instanceof Error ? e.message : String(e));
				return { status: 'skipped', skipReason: 'parse-error', errorMessage: e instanceof Error ? e.message : String(e), promptPath } satisfies ISlashCommandDiscoveryResult;
			}
		}));

		const files = parseResults;

		const promptSourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.prompt);
		const sourceFolders = [...promptSourceFolders];

		if (useAgentSkills) {
			const skillSourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.skill);
			sourceFolders.push(...skillSourceFolders);
		}
		return { type: PromptsType.prompt, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
	}

	/**
	 * Derives IChatPromptSlashCommand[] from cached discovery info.
	 */
	private slashCommandsFromDiscoveryInfo(discoveryInfo: ISlashCommandDiscoveryInfo): readonly IChatPromptSlashCommand[] {
		const result: IChatPromptSlashCommand[] = [];
		const seen = new ResourceSet();

		for (const file of discoveryInfo.files) {
			if (file.status === 'loaded') {
				result.push(this.asChatPromptSlashCommand(file.argumentHint, file.userInvocable, file.promptPath));
				seen.add(file.promptPath.uri);
			}
		}

		// Include untitled prompt models not covered by discovery
		for (const model of this.modelService.getModels()) {
			if (model.getLanguageId() === PROMPT_LANGUAGE_ID && model.uri.scheme === Schemas.untitled && !seen.has(model.uri)) {
				const parsedPromptFile = this.getParsedPromptFile(model);
				const name = parsedPromptFile?.header?.name ?? getCleanPromptName(model.uri);
				const description = parsedPromptFile?.header?.description;
				result.push(this.asChatPromptSlashCommand(parsedPromptFile?.header?.argumentHint, parsedPromptFile?.header?.userInvocable, { uri: model.uri, storage: PromptsStorage.local, type: PromptsType.prompt, name, description }));
			}
		}

		return result;
	}

	public isValidSlashCommandName(command: string): boolean {
		return command.match(/^[\p{L}\d_\-\.:]+$/u) !== null;
	}

	public async resolvePromptSlashCommand(name: string, token: CancellationToken): Promise<IResolvedChatPromptSlashCommand | undefined> {
		const commands = await this.getPromptSlashCommands(token);
		const command = commands.find(cmd => cmd.name === name);
		if (command) {
			return {
				...command,
				parsedPromptFile: await this.parseNew(command.uri, token),
			};
		}
		return undefined;
	}

	private asChatPromptSlashCommand(argumentHint: string | undefined, userInvocable: boolean | undefined, promptPath: IPromptPath): IChatPromptSlashCommand {
		let name = promptPath.name ?? getCleanPromptName(promptPath.uri);
		name = name.replace(/[^\p{L}\d_\-\.:]+/gu, '-'); // replace spaces with dashes
		const when = isExtensionPromptPath(promptPath) && promptPath.when
			? ContextKeyExpr.deserialize(promptPath.when) ?? undefined
			: undefined;
		return {
			uri: promptPath.uri,
			name: name,
			source: promptPath.source,
			storage: promptPath.storage,
			type: promptPath.type,
			extension: promptPath.extension,
			pluginUri: promptPath.pluginUri,
			description: promptPath.description,
			argumentHint: argumentHint,
			userInvocable: userInvocable ?? true,
			when,
			sessionTypes: promptPath.sessionTypes,
		};
	}

	public async getPromptSlashCommandName(uri: URI, token: CancellationToken): Promise<string> {
		const slashCommands = await this.getPromptSlashCommands(token);
		const slashCommand = slashCommands.find(c => isEqual(c.uri, uri));
		if (!slashCommand) {
			return getCleanPromptName(uri);
		}
		return slashCommand.name;
	}

	// custom agents

	/**
	 * Emitter for custom agents change events.
	 */
	public get onDidChangeCustomAgents(): Event<void> {
		return this.cachedCustomAgents.onDidChangePromise;
	}

	public get onDidChangeInstructions(): Event<void> {
		return this.cachedInstructions.onDidChangePromise;
	}

	public async getCustomAgents(token: CancellationToken): Promise<readonly ICustomAgent[]> {
		const discoveryInfo = await this.cachedCustomAgents.get(token);
		const result = this.agentsFromDiscoveryInfo(discoveryInfo);
		return result;
	}

	/**
	 * Derives ICustomAgent[] from cached discovery info.
	 */
	private agentsFromDiscoveryInfo(discoveryInfo: IAgentDiscoveryInfo): readonly ICustomAgent[] {
		const result: ICustomAgent[] = [];
		for (const file of discoveryInfo.files) {
			if (file.status === 'loaded' && file.agent) {
				result.push(file.agent);
			}
		}
		return result;
	}

	private async computeAgentDiscoveryInfo(token: CancellationToken): Promise<IAgentDiscoveryInfo> {
		const stopWatch = StopWatch.create(true);
		const allAgentFiles = await this.listPromptFiles(PromptsType.agent, token);
		const disabledAgents = this.getDisabledPromptFiles(PromptsType.agent);
		const useChatHooks = this.configurationService.getValue(PromptsConfig.USE_CHAT_HOOKS);
		const isWorkspaceTrusted = this.workspaceTrustService.isWorkspaceTrusted();

		// Get user home for tilde expansion in hook cwd paths
		const userHomeUri = await this.pathService.userHome();
		const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;
		const defaultFolder = this.workspaceService.getWorkspace().folders[0];

		const files = await Promise.all(allAgentFiles.map(async (promptPath): Promise<IAgentDiscoveryResult> => {
			const uri = promptPath.uri;

			if (disabledAgents.has(uri)) {
				return { status: 'skipped', skipReason: 'disabled', promptPath };
			}

			try {
				const ast = await this.parseNew(uri, token);

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let metadata: any | undefined;
				if (ast.header) {
					const advanced = ast.header.getAttribute(PromptHeaderAttributes.advancedOptions);
					if (advanced && advanced.value.type === 'map') {
						metadata = {};
						for (const [key, value] of Object.entries(advanced.value)) {
							if (value.type === 'scalar') {
								metadata[key] = value;
							}
						}
					}
				}
				const toolReferences: IVariableReference[] = [];
				if (ast.body) {
					const bodyOffset = ast.body.offset;
					const bodyVarRefs = ast.body.variableReferences;
					for (let i = bodyVarRefs.length - 1; i >= 0; i--) { // in reverse order
						const { name, offset, fullLength } = bodyVarRefs[i];
						const range = new OffsetRange(offset - bodyOffset, offset - bodyOffset + fullLength);
						toolReferences.push({ name, range });
					}
				}

				const agentInstructions = {
					content: ast.body?.getContent() ?? '',
					toolReferences,
					metadata,
				} satisfies IAgentInstructions;

				const name = ast.header?.name ?? promptPath.name ?? getCleanPromptName(uri);
				const description = ast.header?.description ?? promptPath.description;
				const target = getTarget(PromptsType.agent, ast.header ?? uri);

				const source: IAgentSource = IAgentSource.fromPromptPath(promptPath);
				const when = isExtensionPromptPath(promptPath) && promptPath.when
					? ContextKeyExpr.deserialize(promptPath.when) ?? undefined
					: undefined;
				if (!ast.header) {
					const agent: ICustomAgent = { uri, name, agentInstructions, source, target, visibility: { userInvocable: true, agentInvocable: true }, sessionTypes: promptPath.sessionTypes, ...(when !== undefined ? { when } : undefined) };
					return { status: 'loaded', promptPath: this.withPromptPathMetadata(promptPath, name, description), agent };
				}
				const visibility = {
					userInvocable: ast.header.userInvocable !== false,
					agentInvocable: ast.header.infer !== undefined ? ast.header.infer === true : ast.header.disableModelInvocation !== true,
				} satisfies ICustomAgentVisibility;

				let model = ast.header.model;
				if (target === Target.Claude && model) {
					model = mapClaudeModels(model);
				}
				let { tools, handOffs, argumentHint, agents } = ast.header;
				if (target === Target.Claude && tools) {
					tools = mapClaudeTools(tools);
				}

				// Parse hooks from the frontmatter if present
				let hooks: ChatRequestHooks | undefined;
				const hooksRaw = ast.header.hooksRaw;
				if (useChatHooks && isWorkspaceTrusted && hooksRaw) {
					const hookWorkspaceFolder = this.workspaceService.getWorkspaceFolder(uri) ?? defaultFolder;
					const workspaceRootUri = hookWorkspaceFolder?.uri;
					hooks = parseSubagentHooksFromYaml(hooksRaw, workspaceRootUri, userHome, target);
				}

				const agent: ICustomAgent = { uri, name, description, model, tools, handOffs, argumentHint, target, visibility, agents, hooks, agentInstructions, source, sessionTypes: promptPath.sessionTypes, ...(when !== undefined ? { when } : undefined) };
				return { status: 'loaded', promptPath: this.withPromptPathMetadata(promptPath, name, description), agent };
			} catch (e) {
				const error = e instanceof Error ? e : new Error(String(e));
				if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
					this.logger.warn(`[computeAgentDiscoveryInfo] Skipping agent file that does not exist: ${uri}`, error.message);
				} else {
					this.logger.error(`[computeAgentDiscoveryInfo] Failed to parse agent file: ${uri}`, error);
				}
				return {
					status: 'skipped',
					skipReason: 'parse-error',
					errorMessage: error.message,
					promptPath,
				};
			}
		}));

		const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.agent);
		return { type: PromptsType.agent, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
	}


	public async parseNew(uri: URI, token: CancellationToken): Promise<ParsedPromptFile> {
		const model = this.modelService.getModel(uri);
		if (model) {
			return this.getParsedPromptFile(model);
		}

		const fileContent = await this.fileService.readFile(uri);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return new PromptFileParser().parse(uri, fileContent.value.toString());
	}

	public registerContributedFile(type: PromptsType, uri: URI, extension: IExtensionDescription, name?: string, description?: string, when?: string, sessionTypes?: readonly string[]) {
		const bucket = this.contributedFiles[type];
		if (bucket.has(uri)) {
			// keep first registration per extension (handler filters duplicates per extension already)
			return Disposable.None;
		}
		const entryPromise = (async () => {
			// For skills, validate that the file follows the required structure
			if (type === PromptsType.skill) {
				try {
					const validated = await this.validateAndSanitizeSkillFile(uri, CancellationToken.None);
					name = validated.name;
					description = validated.description;
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					this.logger.error(`[registerContributedFile] Extension '${extension.identifier.value}' failed to validate skill file: ${uri}`, msg);
					throw e;
				}
			}

			return { uri, name, description, when, sessionTypes, storage: PromptsStorage.extension, type, extension, source: PromptFileSource.ExtensionContribution } satisfies IExtensionPromptPath;
		})();
		bucket.set(uri, entryPromise);

		// Enqueue the URI for a batched readonly update instead of calling
		// updateReadonly per file, which would fire onDidChangeReadonly each time.
		this._enqueueReadonlyUpdate(uri);

		if (when) {
			this._contributedWhenClauses.set(`${type}/${uri.toString()}`, when);
		}

		const flushCachesIfRequired = () => {
			this._updateContributedWhenKeys();
			this.cachedFileLocations[type] = undefined;
			switch (type) {
				case PromptsType.agent:
					this.cachedCustomAgents.refresh();
					break;
				case PromptsType.prompt:
					this.cachedSlashCommands.refresh();
					break;
				case PromptsType.skill:
					this.cachedSkills.refresh();
					this.cachedSlashCommands.refresh();
					break;
			}
		};
		flushCachesIfRequired();
		return {
			dispose: () => {
				bucket.delete(uri);
				this._contributedWhenClauses.delete(`${type}/${uri.toString()}`);
				flushCachesIfRequired();
			}
		};
	}

	private _enqueueReadonlyUpdate(uri: URI): void {
		this._pendingReadonlyUris.push(uri);
		if (!this._pendingReadonlyFlush) {
			this._pendingReadonlyFlush = true;
			queueMicrotask(() => {
				const uris = this._pendingReadonlyUris;
				this._pendingReadonlyUris = [];
				this._pendingReadonlyFlush = false;
				void this.filesConfigService.updateReadonly(uris, true);
			});
		}
	}

	private _updateContributedWhenKeys(): void {
		this._contributedWhenKeys.clear();
		for (const whenClause of this._contributedWhenClauses.values()) {
			const expr = ContextKeyExpr.deserialize(whenClause);
			for (const key of expr?.keys() ?? []) {
				this._contributedWhenKeys.add(key);
			}
		}
		for (const whenClauses of this._providerWhenClauses.values()) {
			for (const whenClause of whenClauses) {
				const expr = ContextKeyExpr.deserialize(whenClause);
				for (const key of expr?.keys() ?? []) {
					this._contributedWhenKeys.add(key);
				}
			}
		}
	}

	getPromptLocationLabel(promptPath: IPromptPath): string {
		switch (promptPath.storage) {
			case PromptsStorage.local: return this.labelService.getUriLabel(dirname(promptPath.uri), { relative: true });
			case PromptsStorage.user: return localize('user-data-dir.capitalized', 'User Data');
			case PromptsStorage.extension: {
				return localize('extension.with.id', 'Extension: {0}', promptPath.extension.displayName ?? promptPath.extension.id);
			}
			case PromptsStorage.plugin: return localize('plugin.capitalized', 'Plugin');
			default: assertNever(promptPath, 'Unknown prompt storage type');
		}
	}

	public async listNestedAgentMDs(token: CancellationToken): Promise<IAgentInstructionFile[]> {
		const useAgentMD = this.configurationService.getValue(PromptsConfig.USE_AGENT_MD);
		if (!useAgentMD) {
			return [];
		}
		const useNestedAgentMD = this.configurationService.getValue(PromptsConfig.USE_NESTED_AGENT_MD);
		if (useNestedAgentMD) {
			return await this.fileLocator.findAgentMDsInWorkspace(token);
		}
		return [];
	}

	public async listAgentInstructions(token: CancellationToken, logger: Logger | undefined): Promise<IAgentInstructionFile[]> {
		const resolvedAgentFiles: IAgentInstructionFile[] = [];
		const promises: Promise<IAgentInstructionFile[]>[] = [];

		const includeParents = this.configurationService.getValue(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS) === true;
		const rootFolders = await this.fileLocator.getWorkspaceFolderRoots(includeParents, logger);

		const rootFiles: IWorkspaceInstructionFile[] = [];
		const useAgentMD = this.configurationService.getValue(PromptsConfig.USE_AGENT_MD);
		if (!useAgentMD) {
			logger?.logInfo('Agent MD files are disabled via configuration.');
		} else {
			rootFiles.push({ fileName: AGENT_MD_FILENAME, type: AgentInstructionFileType.agentsMd });
		}
		const useClaudeMD = this.configurationService.getValue(PromptsConfig.USE_CLAUDE_MD);
		if (!useClaudeMD) {
			logger?.logInfo('Claude MD files are disabled via configuration.');
		} else {
			const claudeMdFile = { fileName: CLAUDE_MD_FILENAME, type: AgentInstructionFileType.claudeMd };
			rootFiles.push(claudeMdFile); // CLAUDE.md in workspace root
			rootFiles.push({ fileName: CLAUDE_LOCAL_MD_FILENAME, type: AgentInstructionFileType.claudeMd }); // CLAUDE.local.md in workspace root

			promises.push(this.fileLocator.findFilesInRoots(rootFolders, CLAUDE_CONFIG_FOLDER, [claudeMdFile], token, resolvedAgentFiles)); // CLAUDE.md in .claude folder under workspace root
			promises.push(this.fileLocator.findFilesInRoots([await this.pathService.userHome()], CLAUDE_CONFIG_FOLDER, [claudeMdFile], token, resolvedAgentFiles)); // CLAUDE.md in in ~/.claude folder
		}
		const useCopilotInstructionsFiles = this.configurationService.getValue(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES);
		if (!useCopilotInstructionsFiles) {
			logger?.logInfo('Copilot instructions files are disabled via configuration.');
		} else {
			const githubConfigFiles = [{ fileName: COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, type: AgentInstructionFileType.copilotInstructionsMd }];
			promises.push(this.fileLocator.findFilesInRoots(rootFolders, GITHUB_CONFIG_FOLDER, githubConfigFiles, token, resolvedAgentFiles));
		}

		promises.push(this.fileLocator.findFilesInRoots(rootFolders, undefined, rootFiles, token, resolvedAgentFiles));

		await Promise.all(promises);
		if (token.isCancellationRequested) {
			return [];
		}
		// first look at non-symlinked files, then add symlinks only if target not already included
		const seenFileURI = new ResourceSet();
		const symlinks: (IAgentInstructionFile & { realPath: URI })[] = [];
		const result: IAgentInstructionFile[] = [];
		const add = (file: IAgentInstructionFile) => {
			if (file.realPath) {
				symlinks.push(file as IAgentInstructionFile & { realPath: URI });
			} else {
				result.push(file);
				seenFileURI.add(file.uri);
			}
			return true;
		};
		resolvedAgentFiles.forEach(add);
		for (const symlink of symlinks) {
			if (seenFileURI.has(symlink.realPath)) {
				logger?.logInfo(`Skipping symlinked agent instructions file ${symlink.uri} as target already included: ${symlink.realPath}`);
			} else {
				result.push(symlink);
				seenFileURI.add(symlink.realPath);
			}
		}
		return result.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
	}

	public getAgentFileURIFromModeFile(oldURI: URI): URI | undefined {
		return this.fileLocator.getAgentFileURIFromModeFile(oldURI);
	}

	// --- Enabled Prompt Files -----------------------------------------------------------

	private readonly disabledPromptsStorageKeyPrefix = 'chat.disabledPromptFiles.';

	public getDisabledPromptFiles(type: PromptsType): ResourceSet {
		// Migration: if disabled key absent but legacy enabled key present, convert once.
		const disabledKey = this.disabledPromptsStorageKeyPrefix + type;
		const value = this.storageService.get(disabledKey, StorageScope.PROFILE, '[]');
		const result = new ResourceSet();
		try {
			const arr = JSON.parse(value);
			if (Array.isArray(arr)) {
				for (const s of arr) {
					try {
						result.add(URI.revive(s));
					} catch {
						// ignore
					}
				}
			}
		} catch {
			// ignore invalid storage values
		}
		return result;
	}

	public setDisabledPromptFiles(type: PromptsType, uris: ResourceSet): void {
		const disabled = Array.from(uris).map(uri => uri.toJSON());
		this.storageService.store(this.disabledPromptsStorageKeyPrefix + type, JSON.stringify(disabled), StorageScope.PROFILE, StorageTarget.USER);
		if (type === PromptsType.agent) {
			this.cachedCustomAgents.refresh();
		} else if (type === PromptsType.skill) {
			this.cachedSkills.refresh();
			this.cachedSlashCommands.refresh();
		}
	}

	// Agent skills

	private sanitizeAgentSkillText(text: string): string {
		// Remove XML tags
		return text.replace(/<[^>]+>/g, '');
	}

	/**
	 * Validates and sanitizes a skill file. Throws an error if validation fails.
	 * @returns The sanitized name and description
	 */
	private async validateAndSanitizeSkillFile(uri: URI, token: CancellationToken): Promise<{ name: string; description: string | undefined }> {
		const parsedFile = await this.parseNew(uri, token);
		const name = parsedFile.header?.name;

		if (!name) {
			this.logger.error(`[validateAndSanitizeSkillFile] Agent skill file missing name attribute: ${uri}`);
			throw new SkillMissingNameError(uri);
		}

		const description = parsedFile.header?.description;
		if (!description) {
			this.logger.error(`[validateAndSanitizeSkillFile] Agent skill file missing description attribute: ${uri}`);
			throw new SkillMissingDescriptionError(uri);
		}

		// Sanitize the name first (remove XML tags and truncate)
		const sanitizedName = this.truncateAgentSkillName(name, uri);

		// Validate that the sanitized name matches the parent folder name (per agentskills.io specification)
		const folderName = getSkillFolderName(uri);
		if (sanitizedName !== folderName) {
			this.logger.error(`[validateAndSanitizeSkillFile] Agent skill name "${sanitizedName}" does not match folder name "${folderName}": ${uri}`);
			throw new SkillNameMismatchError(uri, sanitizedName, folderName);
		}

		const sanitizedDescription = this.truncateAgentSkillDescription(parsedFile.header?.description, uri);
		return { name: sanitizedName, description: sanitizedDescription };
	}

	private truncateAgentSkillName(name: string, uri: URI): string {
		const MAX_NAME_LENGTH = 64;
		const sanitized = this.sanitizeAgentSkillText(name);
		if (sanitized !== name) {
			this.logger.debug(`[findAgentSkills] Agent skill name contains XML tags, removed: ${uri}`);
		}
		if (sanitized.length > MAX_NAME_LENGTH) {
			this.logger.debug(`[findAgentSkills] Agent skill name exceeds ${MAX_NAME_LENGTH} characters, truncated: ${uri}`);
			return sanitized.substring(0, MAX_NAME_LENGTH);
		}
		return sanitized;
	}

	private truncateAgentSkillDescription(description: string | undefined, uri: URI): string | undefined {
		if (!description) {
			return undefined;
		}
		const MAX_DESCRIPTION_LENGTH = 1024;
		const sanitized = this.sanitizeAgentSkillText(description);
		if (sanitized !== description) {
			this.logger.debug(`[findAgentSkills] Agent skill description contains XML tags, removed: ${uri}`);
		}
		if (sanitized.length > MAX_DESCRIPTION_LENGTH) {
			this.logger.debug(`[findAgentSkills] Agent skill description exceeds ${MAX_DESCRIPTION_LENGTH} characters, truncated: ${uri}`);
			return sanitized.substring(0, MAX_DESCRIPTION_LENGTH);
		}
		return sanitized;
	}

	public get onDidChangeSkills(): Event<void> {
		return this.cachedSkills.onDidChangePromise;
	}

	public get onDidChangeHooks(): Event<void> {
		return this.cachedHooks.onDidChangePromise;
	}

	public async findAgentSkills(token: CancellationToken): Promise<IAgentSkill[] | undefined> {
		const useAgentSkills = this.configurationService.getValue(PromptsConfig.USE_AGENT_SKILLS);
		if (!useAgentSkills) {
			return undefined;
		}

		const discoveryInfo = await this.cachedSkills.get(token);
		const result = this.skillsFromDiscoveryInfo(discoveryInfo);
		return result;
	}

	/**
	 * Derives IAgentSkill[] from cached discovery info.
	 */
	private skillsFromDiscoveryInfo(discoveryInfo: IPromptDiscoveryInfo): IAgentSkill[] {
		const result: IAgentSkill[] = [];
		for (const file of discoveryInfo.files) {
			if (file.status === 'loaded' && file.promptPath.name) {
				const sanitizedDescription = this.truncateAgentSkillDescription(file.promptPath.description, file.promptPath.uri);
				const when = isExtensionPromptPath(file.promptPath) && file.promptPath.when
					? ContextKeyExpr.deserialize(file.promptPath.when) ?? undefined
					: undefined;
				result.push({
					uri: file.promptPath.uri,
					storage: file.promptPath.storage,
					name: file.promptPath.name,
					description: sanitizedDescription,
					disableModelInvocation: file.disableModelInvocation ?? false,
					userInvocable: file.userInvocable ?? true,
					when,
					pluginUri: file.promptPath.pluginUri,
					extension: file.promptPath.extension,
					sessionTypes: file.promptPath.sessionTypes,
				});
			}
		}
		return result;
	}

	/**
	 * Computes the full skill discovery info, including source folders and telemetry.
	 */
	private async computeSkillDiscovery(token: CancellationToken): Promise<IPromptDiscoveryInfo> {
		const stopWatch = StopWatch.create(true);
		const files = await this.computeSkillDiscoveryInfo(token);
		const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.skill);

		// Count by source for telemetry
		const skillsBySource = new Map<PromptFileSource, number>();
		for (const file of files) {
			if (file.status === 'loaded' && file.promptPath.name) {
				const source = file.promptPath.source;
				if (source) {
					skillsBySource.set(source, (skillsBySource.get(source) || 0) + 1);
				}
			}
		}

		// Count skip reasons for telemetry
		let skippedMissingName = 0;
		let skippedMissingDescription = 0;
		let skippedDuplicateName = 0;
		let skippedParseFailed = 0;
		let skippedNameMismatch = 0;
		for (const file of files) {
			if (file.status === 'skipped') {
				switch (file.skipReason) {
					case 'missing-name': skippedMissingName++; break;
					case 'missing-description': skippedMissingDescription++; break;
					case 'duplicate-name': skippedDuplicateName++; break;
					case 'name-mismatch': skippedNameMismatch++; break;
					case 'parse-error': skippedParseFailed++; break;
				}
			}
		}

		// Send telemetry about skill usage
		type AgentSkillsFoundEvent = {
			totalSkillsFound: number;
			claudePersonal: number;
			claudeWorkspace: number;
			copilotPersonal: number;
			githubWorkspace: number;
			agentsPersonal: number;
			agentsWorkspace: number;
			configPersonal: number;
			configWorkspace: number;
			extensionContribution: number;
			extensionAPI: number;
			plugin: number;
			skippedDuplicateName: number;
			skippedMissingName: number;
			skippedMissingDescription: number;
			skippedNameMismatch: number;
			skippedParseFailed: number;
		};

		type AgentSkillsFoundClassification = {
			totalSkillsFound: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of agent skills found.' };
			claudePersonal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of Claude personal skills.' };
			claudeWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of Claude workspace skills.' };
			copilotPersonal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of Copilot personal skills.' };
			githubWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of GitHub workspace skills.' };
			agentsPersonal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of .agents personal skills.' };
			agentsWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of .agents workspace skills.' };
			configPersonal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of custom configured personal skills.' };
			configWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of custom configured workspace skills.' };
			extensionContribution: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of extension contributed skills.' };
			extensionAPI: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of extension API provided skills.' };
			plugin: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of plugin provided skills.' };
			skippedDuplicateName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to duplicate names.' };
			skippedMissingName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to missing name attribute.' };
			skippedMissingDescription: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to missing description attribute.' };
			skippedNameMismatch: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to name not matching folder name.' };
			skippedParseFailed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to parse failures.' };
			owner: 'pwang347';
			comment: 'Tracks agent skill usage, discovery, and skipped files.';
		};

		const totalSkillsFound = files.filter(f => f.status === 'loaded' && f.promptPath.name).length;
		this.telemetryService.publicLog2<AgentSkillsFoundEvent, AgentSkillsFoundClassification>('agentSkillsFound', {
			totalSkillsFound,
			claudePersonal: skillsBySource.get(PromptFileSource.ClaudePersonal) ?? 0,
			claudeWorkspace: skillsBySource.get(PromptFileSource.ClaudeWorkspace) ?? 0,
			copilotPersonal: skillsBySource.get(PromptFileSource.CopilotPersonal) ?? 0,
			githubWorkspace: skillsBySource.get(PromptFileSource.GitHubWorkspace) ?? 0,
			agentsPersonal: skillsBySource.get(PromptFileSource.AgentsPersonal) ?? 0,
			agentsWorkspace: skillsBySource.get(PromptFileSource.AgentsWorkspace) ?? 0,
			configWorkspace: skillsBySource.get(PromptFileSource.ConfigWorkspace) ?? 0,
			configPersonal: skillsBySource.get(PromptFileSource.ConfigPersonal) ?? 0,
			extensionContribution: skillsBySource.get(PromptFileSource.ExtensionContribution) ?? 0,
			extensionAPI: skillsBySource.get(PromptFileSource.ExtensionAPI) ?? 0,
			plugin: skillsBySource.get(PromptFileSource.Plugin) ?? 0,
			skippedDuplicateName,
			skippedMissingName,
			skippedMissingDescription,
			skippedNameMismatch,
			skippedParseFailed
		});

		return { type: PromptsType.skill, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
	}

	public async getHooks(token: CancellationToken): Promise<IConfiguredHooksInfo | undefined> {
		const discoveryInfo = await this.cachedHooks.get(token);
		const result = discoveryInfo.hooksInfo;
		return result;
	}

	public async getDiscoveryInfo(type: PromptsType, token: CancellationToken): Promise<IPromptDiscoveryInfo> {
		switch (type) {
			case PromptsType.instructions:
				return this.cachedInstructions.get(token);
			case PromptsType.prompt:
				return this.cachedSlashCommands.get(token);
			case PromptsType.agent:
				return this.cachedCustomAgents.get(token);
			case PromptsType.skill:
				return this.cachedSkills.get(token);
			case PromptsType.hook:
				return this.cachedHooks.get(token);
		}
	}

	public async getInstructionFiles(token: CancellationToken): Promise<readonly IInstructionFile[]> {
		const discoveryInfo = await this.cachedInstructions.get(token);
		const result = this.instructionsFromDiscoveryInfo(discoveryInfo);
		return result;
	}

	private instructionsFromDiscoveryInfo(discoveryInfo: IInstructionDiscoveryInfo): IInstructionFile[] {
		const result: IInstructionFile[] = [];
		for (const file of discoveryInfo.files) {
			if (file.status === 'loaded' && file.promptPath.name) {
				const when = isExtensionPromptPath(file.promptPath) && file.promptPath.when
					? ContextKeyExpr.deserialize(file.promptPath.when) ?? undefined
					: undefined;
				result.push({
					uri: file.promptPath.uri,
					storage: file.promptPath.storage,
					extension: file.promptPath.extension,
					pluginUri: file.promptPath.pluginUri,
					source: file.promptPath.source,
					name: file.promptPath.name,
					description: file.promptPath.description,
					pattern: file.pattern,
					when,
					sessionTypes: file.promptPath.sessionTypes,
				});
			}
		}
		return result;
	}

	private withPromptPathMetadata(promptPath: IPromptPath, name: string | undefined, description: string | undefined): IPromptPath {
		return { ...promptPath, name, description };
	}

	private async computeInstructionFiles(token: CancellationToken): Promise<IInstructionDiscoveryInfo> {
		return await this.getInstructionsDiscoveryInfo(token);
	}

	private async computeHooks(token: CancellationToken): Promise<IHookDiscoveryInfo> {
		const stopWatch = StopWatch.create(true);
		const useChatHooks = this.configurationService.getValue(PromptsConfig.USE_CHAT_HOOKS);

		if (!useChatHooks || !this.workspaceTrustService.isWorkspaceTrusted()) {
			const hookFiles = await this.listPromptFiles(PromptsType.hook, token);
			const skipReason: IPromptFileDiscoveryResult['skipReason'] = !useChatHooks ? 'disabled' : 'workspace-untrusted';
			const files = hookFiles.map(promptPath => ({
				status: 'skipped' as const,
				skipReason,
				promptPath: this.withPromptPathMetadata(promptPath, basename(promptPath.uri), promptPath.description),
			}));
			const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.hook);
			return { type: PromptsType.hook, files, sourceFolders, hooksInfo: undefined, durationInMillis: stopWatch.elapsed() };
		}

		const useClaudeHooks = this.configurationService.getValue<boolean>(PromptsConfig.USE_CLAUDE_HOOKS);
		const hookFiles = await this.listPromptFiles(PromptsType.hook, token);

		this.logger.trace(`[PromptsService] Found ${hookFiles.length} hook file(s).`);

		// Get user home for tilde expansion
		const userHomeUri = await this.pathService.userHome();
		const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;

		const defaultFolder = this.workspaceService.getWorkspace().folders[0];

		// Process each hook file in parallel
		const fileResults = await Promise.all(hookFiles.map(async (hookFile): Promise<{
			file?: IPromptFileDiscoveryResult;
			hooks?: Map<HookType, IParsedHookCommand[]>;
			sourceUri?: URI;
			hasDisabledClaudeHooks?: boolean;
		}> => {
			const name = basename(hookFile.uri);

			// Plugins are handled separately down below because they do their own parsing+interpolation
			if (hookFile.storage === PromptsStorage.plugin) {
				return {
					file: {
						status: 'loaded',
						promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description),
					},
				};
			}

			try {
				const content = await this.fileService.readFile(hookFile.uri);
				const json = parseJSONC(content.value.toString());

				// Validate it's an object
				if (!json || typeof json !== 'object') {
					return {
						file: {
							status: 'skipped',
							skipReason: 'parse-error',
							errorMessage: 'Invalid hooks file: must be a JSON object',
							promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description),
						},
					};
				}

				// Resolve the workspace folder that contains this hook file for cwd resolution,
				// falling back to the first workspace folder for user-level hooks outside the workspace
				const hookWorkspaceFolder = this.workspaceService.getWorkspaceFolder(hookFile.uri) ?? defaultFolder;
				const workspaceRootUri = hookWorkspaceFolder?.uri;

				// Use format-aware parsing that handles Copilot and Claude formats
				const { format, hooks: parsedHooks, disabledAllHooks } = parseHooksFromFile(hookFile.uri, json, workspaceRootUri, userHome);

				// Skip files that have all hooks disabled
				if (disabledAllHooks) {
					this.logger.trace(`[PromptsService] Skipping hook file with disableAllHooks: ${hookFile.uri}`);
					return {
						file: {
							status: 'skipped',
							skipReason: 'all-hooks-disabled',
							promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description),
						},
					};
				}

				// Skip Claude hooks when the setting is disabled (after parsing to check for commands)
				if (format === HookSourceFormat.Claude && useClaudeHooks === false) {
					const hasAnyCommands = [...parsedHooks.values()].some(({ hooks: cmds }) => cmds.length > 0);
					this.logger.trace(`[PromptsService] Skipping Claude hook file (disabled via setting): ${hookFile.uri}`);
					return {
						file: {
							status: 'skipped',
							skipReason: 'claude-hooks-disabled',
							promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description),
						},
						hasDisabledClaudeHooks: hasAnyCommands,
					};
				}

				const hooks = new Map<HookType, IParsedHookCommand[]>();
				for (const [hookType, { hooks: commands }] of parsedHooks) {
					for (const command of commands) {
						let bucket = hooks.get(hookType);
						if (!bucket) {
							bucket = [];
							hooks.set(hookType, bucket);
						}
						bucket.push(command);
						this.logger.trace(`[PromptsService] Collected ${hookType} hook from ${hookFile.uri} (format: ${format})`);
					}
				}

				return {
					file: { status: 'loaded', promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description) },
					hooks,
					sourceUri: hookFile.uri,
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				this.logger.warn(`[PromptsService] Failed to parse hook file: ${hookFile.uri}`, error);
				return {
					file: {
						status: 'skipped',
						skipReason: 'parse-error',
						errorMessage: msg,
						promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description),
					},
				};
			}
		}));

		// Merge results from parallel processing
		const files: IPromptFileDiscoveryResult[] = [];
		let hasDisabledClaudeHooks = false;
		const collectedHooks = new Map<HookType, IParsedHookCommand[]>();

		for (const { file, hooks, sourceUri, hasDisabledClaudeHooks: disabled } of fileResults) {
			if (file) {
				files.push(file);
			}
			if (disabled) {
				hasDisabledClaudeHooks = true;
			}
			if (hooks && sourceUri) {
				for (const [hookType, commands] of hooks) {
					let bucket = collectedHooks.get(hookType);
					if (!bucket) {
						bucket = [];
						collectedHooks.set(hookType, bucket);
					}
					for (const command of commands) {
						bucket.push({ ...command, sourceUri });
					}
				}
			}
		}

		// Collect hooks from agent plugins
		const plugins = this.agentPluginService.plugins.get();
		for (const plugin of plugins) {
			if (!isContributionEnabled(plugin.enablement.get())) {
				continue;
			}
			for (const hook of plugin.hooks.get()) {
				let bucket = collectedHooks.get(hook.type);
				if (!bucket) {
					bucket = [];
					collectedHooks.set(hook.type, bucket);
				}
				for (const command of hook.hooks) {
					bucket.push({ ...command, sourceUri: hook.uri });
				}
			}
		}

		const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.hook);

		// Check if any hooks were collected
		if (collectedHooks.size === 0) {
			this.logger.trace('[PromptsService] No valid hooks collected.');
			return { type: PromptsType.hook, files, sourceFolders, hooksInfo: undefined, durationInMillis: stopWatch.elapsed() };
		}

		// Build the result
		const result: ChatRequestHooks = Object.fromEntries(collectedHooks) as ChatRequestHooks;

		this.logger.trace(`[PromptsService] Collected hooks: ${JSON.stringify(Object.keys(result))}`);
		return { type: PromptsType.hook, files, sourceFolders, hooksInfo: { hooks: result, hasDisabledClaudeHooks }, durationInMillis: stopWatch.elapsed() };
	}

	/**
	 * Returns the discovery results for skill files.
	 */
	private async computeSkillDiscoveryInfo(token: CancellationToken): Promise<IPromptFileDiscoveryResult[]> {
		const files: IPromptFileDiscoveryResult[] = [];
		const seenNames = new Set<string>();
		const nameToUri = new Map<string, URI>();

		// Collect all skills with their metadata for sorting
		const allSkills: Array<IPromptPath> = [];
		const discoveredSkills = await this.fileLocator.findAgentSkills(token);
		const extensionSkills = await this.getExtensionPromptFiles(PromptsType.skill, token);
		const pluginSkills = this._pluginPromptFilesByType.get(PromptsType.skill) ?? [];
		allSkills.push(...discoveredSkills, ...extensionSkills, ...pluginSkills);

		const getPriority = (skill: IPromptPath): number => {
			if (skill.storage === PromptsStorage.local) {
				return 0; // workspace
			}
			if (skill.storage === PromptsStorage.user) {
				return 1; // personal
			}
			if (skill.storage === PromptsStorage.plugin) {
				return 2; // plugin
			}
			if (skill.source === PromptFileSource.ExtensionAPI) {
				return 3;
			}
			if (skill.source === PromptFileSource.ExtensionContribution) {
				return 4;
			}
			return 5;
		};
		// Stable sort; we should keep order consistent to the order in the user's configuration object
		allSkills.sort((a, b) => getPriority(a) - getPriority(b));

		for (const skill of allSkills) {
			const uri = skill.uri;
			const promptPath = skill;

			try {
				const parsedFile = await this.parseNew(uri, token);
				const folderName = getSkillFolderName(uri);

				let name = parsedFile.header?.name;
				const description = parsedFile.header?.description;

				if (!name) {
					this.logger.debug(`[computeSkillDiscoveryInfo] Agent skill file missing name attribute, using folder name "${folderName}": ${uri}`);
					name = folderName;
				}
				let sanitizedName = this.truncateAgentSkillName(name, uri);
				if (sanitizedName !== folderName) {
					this.logger.debug(`[computeSkillDiscoveryInfo] Agent skill name "${sanitizedName}" does not match folder name "${folderName}", using folder name: ${uri}`);
					sanitizedName = folderName;
				}

				if (seenNames.has(sanitizedName)) {
					this.logger.debug(`[computeSkillDiscoveryInfo] Skipping duplicate agent skill name: ${sanitizedName} at ${uri}`);
					files.push({ status: 'skipped', skipReason: 'duplicate-name', duplicateOf: nameToUri.get(sanitizedName), promptPath: this.withPromptPathMetadata(promptPath, sanitizedName, description) });
					continue;
				}

				seenNames.add(sanitizedName);
				nameToUri.set(sanitizedName, uri);
				const disableModelInvocation = parsedFile.header?.disableModelInvocation === true;
				const userInvocable = parsedFile.header?.userInvocable !== false;

				files.push({ status: 'loaded', promptPath: this.withPromptPathMetadata(promptPath, sanitizedName, description), disableModelInvocation, userInvocable });
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				this.logger.error(`[computeSkillDiscoveryInfo] Failed to validate Agent skill file: ${uri}`, msg);
				files.push({
					status: 'skipped',
					skipReason: 'parse-error',
					errorMessage: msg,
					promptPath,
				});
			}
		}

		return files;
	}

	private async getInstructionsDiscoveryInfo(token: CancellationToken): Promise<IInstructionDiscoveryInfo> {
		const stopWatch = StopWatch.create(true);
		const files: IInstructionDiscoveryResult[] = [];

		const instructionsFiles = await this.listPromptFiles(PromptsType.instructions, token);
		for (const promptPath of instructionsFiles) {
			const uri = promptPath.uri;

			try {
				const parsedPromptFile = await this.parseNew(uri, token);
				const name = parsedPromptFile?.header?.name ?? promptPath.name ?? getCleanPromptName(uri);
				const description = parsedPromptFile?.header?.description ?? promptPath.description;
				const pattern = evaluateApplyToPattern(parsedPromptFile.header, isInClaudeRulesFolder(uri));
				files.push({
					status: 'loaded',
					pattern,
					promptPath: this.withPromptPathMetadata(promptPath, name, description),
				});
			} catch (e) {
				files.push({
					status: 'skipped',
					skipReason: 'parse-error',
					errorMessage: e instanceof Error ? e.message : String(e),
					promptPath,
				});
			}
		}

		const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.instructions);
		return { type: PromptsType.instructions, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
	}
}

// helpers

class CachedPromise<T> extends Disposable {
	private cachedPromise: Promise<T> | undefined = undefined;
	private readonly onDidUpdatePromiseEmitter: Emitter<void>;

	constructor(private readonly computeFn: (token: CancellationToken) => Promise<T>, private readonly getEvent: () => Event<void>, private readonly delay: number = 0) {
		super();
		this.onDidUpdatePromiseEmitter = this._register(new Emitter<void>());
		const delayer = this._register(new Delayer<void>(this.delay));
		this._register(this.getEvent()(() => {
			this.cachedPromise = undefined;
			delayer.trigger(() => this.onDidUpdatePromiseEmitter.fire());
		}));
	}

	public get onDidChangePromise(): Event<void> {
		return this.onDidUpdatePromiseEmitter.event;
	}

	public get(token: CancellationToken): Promise<T> {
		if (this.cachedPromise !== undefined) {
			return this.cachedPromise;
		}
		const promise = this.computeFn(token).catch(err => {
			if (this.cachedPromise === promise) {
				this.cachedPromise = undefined;
			}
			throw err;
		});
		this.cachedPromise = promise;
		return promise;
	}

	public refresh(): void {
		this.cachedPromise = undefined;
		this.onDidUpdatePromiseEmitter?.fire();
	}
}

interface ModelChangeEvent {
	readonly promptType: PromptsType;
	readonly uri: URI;
}

class ModelChangeTracker extends Disposable {

	private readonly listeners = new ResourceMap<IDisposable>();
	private readonly onDidPromptModelChange: Emitter<ModelChangeEvent>;

	public get onDidPromptChange(): Event<ModelChangeEvent> {
		return this.onDidPromptModelChange.event;
	}

	constructor(modelService: IModelService) {
		super();
		this.onDidPromptModelChange = this._register(new Emitter<ModelChangeEvent>());
		const onAdd = (model: ITextModel) => {
			const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
			if (promptType !== undefined) {
				this.listeners.set(model.uri, model.onDidChangeContent(() => this.onDidPromptModelChange.fire({ uri: model.uri, promptType })));
			}
			return promptType;
		};
		const onRemove = (languageId: string, uri: URI) => {
			const promptType = getPromptsTypeForLanguageId(languageId);
			if (promptType !== undefined) {
				this.listeners.get(uri)?.dispose();
				this.listeners.delete(uri);
			}
			return promptType;
		};
		this._register(modelService.onModelAdded(model => onAdd(model)));
		this._register(modelService.onModelLanguageChanged(e => {
			const removedPromptType = onRemove(e.oldLanguageId, e.model.uri);
			const addedPromptType = onAdd(e.model);
			if (removedPromptType !== addedPromptType) {
				if (removedPromptType) {
					this.onDidPromptModelChange.fire({ uri: e.model.uri, promptType: removedPromptType });
				}
				if (addedPromptType) {
					this.onDidPromptModelChange.fire({ uri: e.model.uri, promptType: addedPromptType });
				}
			}
		}));
		this._register(modelService.onModelRemoved(model => onRemove(model.getLanguageId(), model.uri)));
	}

	public override dispose(): void {
		super.dispose();
		this.listeners.forEach(listener => listener.dispose());
		this.listeners.clear();
	}
}

namespace IAgentSource {
	export function fromPromptPath(promptPath: IPromptPath): IAgentSource {
		if (promptPath.storage === PromptsStorage.extension) {
			return {
				storage: PromptsStorage.extension,
				extensionId: promptPath.extension.identifier,
				type: promptPath.source
			};
		} else if (promptPath.storage === PromptsStorage.plugin) {
			return {
				storage: PromptsStorage.plugin,
				pluginUri: promptPath.pluginUri
			};
		} else {
			return {
				storage: promptPath.storage
			};
		}
	}
}

