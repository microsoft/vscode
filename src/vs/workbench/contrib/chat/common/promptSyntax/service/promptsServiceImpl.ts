/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { dirname, isEqual } from '../../../../../../base/common/resources.js';
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
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { getCleanPromptName } from '../config/promptFileLocations.js';
import { PROMPT_LANGUAGE_ID, PromptsType, getPromptsTypeForLanguageId } from '../promptTypes.js';
import { PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { PromptFileParser, ParsedPromptFile, PromptHeaderAttributes } from '../promptFileParser.js';
import { IAgentInstructions, IAgentSource, IChatPromptSlashCommand, ICustomAgent, IExtensionPromptPath, ILocalPromptPath, IPromptPath, IPromptsService, IAgentSkill, IUserPromptPath, PromptsStorage, ExtensionAgentSourceType, CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT, INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT, IPromptFileQueryOptions, IPromptFileResource, PROMPT_FILE_PROVIDER_ACTIVATION_EVENT } from './promptsService.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { Schemas } from '../../../../../../base/common/network.js';

/**
 * Represents a cached prompt file resource stored in storage.
 */
interface ICachedPromptFileResource {
	readonly name: string;
	readonly description: string;
	readonly uri: string; // Serialized URI string
	readonly isEditable?: boolean;
}

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
	 * Cached custom agents. Caching only happens if the `onDidChangeCustomAgents` event is used.
	 */
	private readonly cachedCustomAgents: CachedPromise<readonly ICustomAgent[]>;

	/**
	 * Cached slash commands. Caching only happens if the `onDidChangeSlashCommands` event is used.
	 */
	private readonly cachedSlashCommands: CachedPromise<readonly IChatPromptSlashCommand[]>;

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
	};

	/**
	 * Storage key prefix for cached prompt file resources from providers.
	 * These are resources that are provided by extensions but can be cached for use before activation.
	 */
	private readonly cachedProviderResourcesStorageKeyPrefix = 'chat.cachedProviderResources.';

	/**
	 * Storage key for tracking extension IDs that have registered prompt file providers.
	 */
	private readonly cachedProviderExtensionsStorageKey = 'chat.cachedProviderExtensions';

	constructor(
		@ILogService public readonly logger: ILogService,
		@ILabelService private readonly labelService: ILabelService,
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataProfileService private readonly userDataService: IUserDataProfileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IFilesConfigurationService private readonly filesConfigService: IFilesConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();

		this.fileLocator = this.instantiationService.createInstance(PromptFilesLocator);
		this._register(this.modelService.onModelRemoved((model) => {
			this.cachedParsedPromptFromModels.delete(model.uri);
		}));

		const modelChangeEvent = this._register(new ModelChangeTracker(this.modelService)).onDidPromptChange;
		this.cachedCustomAgents = this._register(new CachedPromise(
			(token) => this.computeCustomAgents(token),
			() => Event.any(this.getFileLocatorEvent(PromptsType.agent), Event.filter(modelChangeEvent, e => e.promptType === PromptsType.agent))
		));

		this.cachedSlashCommands = this._register(new CachedPromise(
			(token) => this.computePromptSlashCommands(token),
			() => Event.any(this.getFileLocatorEvent(PromptsType.prompt), Event.filter(modelChangeEvent, e => e.promptType === PromptsType.prompt))
		));
	}

	/**
	 * Gets cached prompt file resources for a specific extension and type.
	 */
	private getCachedProviderResources(extensionId: string, type: PromptsType): ICachedPromptFileResource[] {
		const key = `${this.cachedProviderResourcesStorageKeyPrefix}${extensionId}.${type}`;
		const value = this.storageService.get(key, StorageScope.PROFILE, '[]');
		try {
			const arr = JSON.parse(value);
			if (Array.isArray(arr)) {
				return arr;
			}
		} catch (e) {
			this.logger.warn(`[getCachedProviderResources] Failed to parse cached value for ${key}:`, e instanceof Error ? e.message : String(e));
		}
		return [];
	}

	/**
	 * Saves cached prompt file resources for a specific extension and type.
	 * Only resources marked as cacheable (isCacheable !== false) are stored.
	 */
	private setCachedProviderResources(extensionId: string, type: PromptsType, resources: IPromptFileResource[]): void {
		const key = `${this.cachedProviderResourcesStorageKeyPrefix}${extensionId}.${type}`;
		this.logger.info(`[setCachedProviderResources] Setting cache for ${extensionId}/${type}, input resources:`, JSON.stringify(resources.map(r => ({ name: r.name, description: r.description, uri: r.uri?.toString(), isEditable: r.isEditable, isCacheable: r.isCacheable }))));
		// Filter to only cacheable resources (isCacheable defaults to true)
		const cacheableResources: ICachedPromptFileResource[] = resources
			.filter(r => r.isCacheable !== false)
			.map(r => ({
				name: r.name,
				description: r.description,
				uri: r.uri.toString(),
				isEditable: r.isEditable
			}));
		this.logger.info(`[setCachedProviderResources] Storing ${cacheableResources.length} cacheable resources for key=${key}:`, JSON.stringify(cacheableResources));
		this.storageService.store(key, JSON.stringify(cacheableResources), StorageScope.PROFILE, StorageTarget.MACHINE);

		// Track that this extension has registered a provider for this type
		this.addCachedProviderExtension(extensionId, type);
	}

	/**
	 * Gets the set of extension IDs that have registered providers for each type.
	 */
	private getCachedProviderExtensions(): { [type in PromptsType]?: string[] } {
		const value = this.storageService.get(this.cachedProviderExtensionsStorageKey, StorageScope.PROFILE, '{}');
		try {
			return JSON.parse(value);
		} catch {
			return {};
		}
	}

	/**
	 * Adds an extension ID to the set of cached provider extensions for a type.
	 */
	private addCachedProviderExtension(extensionId: string, type: PromptsType): void {
		const extensions = this.getCachedProviderExtensions();
		if (!extensions[type]) {
			extensions[type] = [];
		}
		if (!extensions[type]!.includes(extensionId)) {
			extensions[type]!.push(extensionId);
			this.storageService.store(this.cachedProviderExtensionsStorageKey, JSON.stringify(extensions), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
	}

	/**
	 * Converts cached resources to IPromptPath entries.
	 */
	private cachedResourcesToPromptPaths(cached: ICachedPromptFileResource[], extension: IExtensionDescription, type: PromptsType): IExtensionPromptPath[] {
		const result: IExtensionPromptPath[] = [];

		for (const r of cached) {
			let uri: URI;
			try {
				uri = URI.parse(r.uri);
			} catch (error) {
				this.logger.warn('Failed to parse cached prompt file URI', r.uri, error);
				continue;
			}

			result.push({
				uri,
				name: r.name,
				description: r.description,
				storage: PromptsStorage.extension,
				type,
				extension,
				source: ExtensionAgentSourceType.provider
			} satisfies IExtensionPromptPath);
		}

		return result;
	}

	/**
	 * Gets cached resources for extensions that have registered providers previously but haven't activated yet.
	 * This allows showing resources before extension activation.
	 */
	private async getCachedResourcesForUnactivatedExtensions(type: PromptsType): Promise<IExtensionPromptPath[]> {
		const result: IExtensionPromptPath[] = [];
		const registeredExtensionIds = new Set(this.promptFileProviders.filter(p => p.type === type).map(p => p.extension.identifier.value));

		// Get extension IDs that have previously registered providers
		const cachedExtensions = this.getCachedProviderExtensions();
		const cachedExtensionIds = cachedExtensions[type] ?? [];

		for (const extensionId of cachedExtensionIds) {
			// Skip if this extension has already registered a provider (it will be handled by listXFromProvider)
			if (registeredExtensionIds.has(extensionId)) {
				continue;
			}

			// Get the extension description if available
			const extensionDescription = await this.extensionService.getExtension(extensionId);
			if (!extensionDescription) {
				// Extension is no longer installed, clear its cache
				this.clearCachedProviderResources(extensionId, type);
				continue;
			}

			// Get cached resources for this extension
			const cached = this.getCachedProviderResources(extensionId, type);
			if (cached.length > 0) {
				result.push(...this.cachedResourcesToPromptPaths(cached, extensionDescription, type));
			}
		}

		return result;
	}

	/**
	 * Clears cached prompt file resources for a specific extension and type.
	 * Also removes the extension from the tracked provider extensions list.
	 */
	private clearCachedProviderResources(extensionId: string, type: PromptsType): void {
		// Clear the cached resources
		const key = `${this.cachedProviderResourcesStorageKeyPrefix}${extensionId}.${type}`;
		this.storageService.remove(key, StorageScope.PROFILE);

		// Remove from tracked extensions list
		const extensions = this.getCachedProviderExtensions();
		if (extensions[type]) {
			const index = extensions[type]!.indexOf(extensionId);
			if (index >= 0) {
				extensions[type]!.splice(index, 1);
				this.storageService.store(this.cachedProviderExtensionsStorageKey, JSON.stringify(extensions), StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		}
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
		]);

		return [...prompts.flat()];
	}

	/**
	 * Registry of prompt file provider instances (custom agents, instructions, prompt files).
	 * Extensions can register providers via the proposed API.
	 */
	private readonly promptFileProviders: Array<{
		extension: IExtensionDescription;
		type: PromptsType;
		onDidChangePromptFiles?: Event<void>;
		providePromptFiles: (options: IPromptFileQueryOptions, token: CancellationToken) => Promise<IPromptFileResource[] | undefined>;
	}> = [];

	/**
	 * Registers a prompt file provider (CustomAgentProvider, InstructionsProvider, or PromptFileProvider).
	 * This will be called by the extension host bridge when
	 * an extension registers a provider via vscode.chat.registerCustomAgentProvider(),
	 * registerInstructionsProvider(), or registerPromptFileProvider().
	 */
	public registerPromptFileProvider(extension: IExtensionDescription, type: PromptsType, provider: {
		onDidChangePromptFiles?: Event<void>;
		providePromptFiles: (options: IPromptFileQueryOptions, token: CancellationToken) => Promise<IPromptFileResource[] | undefined>;
	}): IDisposable {
		const providerEntry = { extension, type, ...provider };
		this.promptFileProviders.push(providerEntry);

		const disposables = new DisposableStore();

		// Listen to provider change events to rerun computeListPromptFiles
		if (provider.onDidChangePromptFiles) {
			disposables.add(provider.onDidChangePromptFiles(() => {
				if (type === PromptsType.agent) {
					this.cachedFileLocations[PromptsType.agent] = undefined;
					this.cachedCustomAgents.refresh();
				} else if (type === PromptsType.instructions) {
					this.cachedFileLocations[PromptsType.instructions] = undefined;
				} else if (type === PromptsType.prompt) {
					this.cachedFileLocations[PromptsType.prompt] = undefined;
					this.cachedSlashCommands.refresh();
				}
			}));
		}

		// Invalidate cache when providers change
		if (type === PromptsType.agent) {
			this.cachedFileLocations[PromptsType.agent] = undefined;
			this.cachedCustomAgents.refresh();
		} else if (type === PromptsType.instructions) {
			this.cachedFileLocations[PromptsType.instructions] = undefined;
		} else if (type === PromptsType.prompt) {
			this.cachedFileLocations[PromptsType.prompt] = undefined;
			this.cachedSlashCommands.refresh();
		}

		disposables.add({
			dispose: () => {
				const index = this.promptFileProviders.findIndex((p) => p === providerEntry);
				if (index >= 0) {
					this.promptFileProviders.splice(index, 1);
					if (type === PromptsType.agent) {
						this.cachedFileLocations[PromptsType.agent] = undefined;
						this.cachedCustomAgents.refresh();
					} else if (type === PromptsType.instructions) {
						this.cachedFileLocations[PromptsType.instructions] = undefined;
					} else if (type === PromptsType.prompt) {
						this.cachedFileLocations[PromptsType.prompt] = undefined;
						this.cachedSlashCommands.refresh();
					}
				}
			}
		});

		return disposables;
	}

	/**
	 * Shared helper to list prompt files from registered providers for a given type.
	 */
	private async listFromProviders(type: PromptsType, activationEvent: string, token: CancellationToken): Promise<IPromptPath[]> {
		const result: IPromptPath[] = [];

		// First, get cached resources for extensions that haven't activated yet
		const cachedResources = await this.getCachedResourcesForUnactivatedExtensions(type);
		result.push(...cachedResources);

		// Activate extensions that might provide files for this type
		await this.extensionService.activateByEvent(activationEvent);

		const providers = this.promptFileProviders.filter(p => p.type === type);
		if (providers.length === 0) {
			return result;
		}

		// Track which extension IDs have provided resources (for filtering out cached duplicates)
		const activeProviderExtensionIds = new Set<string>();

		// Collect files from all providers
		for (const providerEntry of providers) {
			try {
				const files = await providerEntry.providePromptFiles({}, token);
				if (!files || token.isCancellationRequested) {
					continue;
				}

				// Mark this extension as having an active provider
				activeProviderExtensionIds.add(providerEntry.extension.identifier.value);

				// Update cache for this extension's resources
				this.setCachedProviderResources(providerEntry.extension.identifier.value, type, files);

				for (const file of files) {
					if (!file.isEditable) {
						try {
							await this.filesConfigService.updateReadonly(file.uri, true);
						} catch (e) {
							const msg = e instanceof Error ? e.message : String(e);
							this.logger.error(`[listFromProviders] Failed to make file readonly: ${file.uri}`, msg);
						}
					}

					result.push({
						uri: file.uri,
						name: file.name,
						description: file.description,
						storage: PromptsStorage.extension,
						type,
						extension: providerEntry.extension,
						source: ExtensionAgentSourceType.provider
					} satisfies IExtensionPromptPath);
				}
			} catch (e) {
				this.logger.error(`[listFromProviders] Failed to get ${type} files from provider`, e instanceof Error ? e.message : String(e));
			}
		}

		// Filter out cached resources from extensions that now have active providers
		// (the provider's resources replace the cached ones, even if URIs differ due to dynamic content)
		const cachedExtensionIds = new Set(cachedResources.map(c => (c as IExtensionPromptPath).extension.identifier.value));
		return result.filter(r => {
			if (r.storage !== PromptsStorage.extension) {
				return true;
			}
			const extensionPath = r as IExtensionPromptPath;
			const extensionId = extensionPath.extension.identifier.value;
			// If this is a cached resource and the extension now has an active provider, filter it out
			if (cachedExtensionIds.has(extensionId) && activeProviderExtensionIds.has(extensionId)) {
				// Keep only if it came from the provider (not from cache)
				// Cached resources were added first, provider resources added after
				// We can identify cached ones by checking if they're in the original cachedResources array
				return !cachedResources.some(c => c.uri.toString() === r.uri.toString());
			}
			return true;
		});
	}

	public async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage, token: CancellationToken): Promise<readonly IPromptPath[]> {
		switch (storage) {
			case PromptsStorage.extension:
				return this.getExtensionPromptFiles(type, token);
			case PromptsStorage.local:
				return this.fileLocator.listFiles(type, PromptsStorage.local, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.local, type } satisfies ILocalPromptPath)));
			case PromptsStorage.user:
				return this.fileLocator.listFiles(type, PromptsStorage.user, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.user, type } satisfies IUserPromptPath)));
			default:
				throw new Error(`[listPromptFilesForStorage] Unsupported prompt storage type: ${storage}`);
		}
	}

	private async getExtensionPromptFiles(type: PromptsType, token: CancellationToken): Promise<IPromptPath[]> {
		await this.extensionService.whenInstalledExtensionsRegistered();
		const contributedFiles = await Promise.all(this.contributedFiles[type].values());

		const activationEvent = this.getProviderActivationEvent(type);
		if (activationEvent) {
			const providerFiles = await this.listFromProviders(type, activationEvent, token);
			return [...contributedFiles, ...providerFiles];
		} else {
			this.logger.warn(`[getExtensionPromptFiles] No activation event found for prompt type: ${type}`);
		}

		return contributedFiles;
	}

	private getProviderActivationEvent(type: PromptsType): string | undefined {
		switch (type) {
			case PromptsType.agent:
				return CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.instructions:
				return INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.prompt:
				return PROMPT_FILE_PROVIDER_ACTIVATION_EVENT;
			default:
				return undefined;
		}
	}

	public getSourceFolders(type: PromptsType): readonly IPromptPath[] {
		const result: IPromptPath[] = [];

		if (type === PromptsType.agent) {
			const folders = this.fileLocator.getAgentSourceFolder();
			for (const uri of folders) {
				result.push({ uri, storage: PromptsStorage.local, type });
			}
		} else {
			for (const uri of this.fileLocator.getConfigBasedSourceFolders(type)) {
				result.push({ uri, storage: PromptsStorage.local, type });
			}
		}

		const userHome = this.userDataService.currentProfile.promptsHome;
		result.push({ uri: userHome, storage: PromptsStorage.user, type });

		return result;
	}

	// slash prompt commands

	/**
	 * Emitter for slash commands change events.
	 */
	public get onDidChangeSlashCommands(): Event<void> {
		return this.cachedSlashCommands.onDidChange;
	}

	public async getPromptSlashCommands(token: CancellationToken): Promise<readonly IChatPromptSlashCommand[]> {
		return this.cachedSlashCommands.get(token);
	}

	private async computePromptSlashCommands(token: CancellationToken): Promise<readonly IChatPromptSlashCommand[]> {
		const promptFiles = await this.listPromptFiles(PromptsType.prompt, token);
		const details = await Promise.all(promptFiles.map(async promptPath => {
			try {
				const parsedPromptFile = await this.parseNew(promptPath.uri, token);
				return this.asChatPromptSlashCommand(parsedPromptFile, promptPath);
			} catch (e) {
				this.logger.error(`[computePromptSlashCommands] Failed to parse prompt file for slash command: ${promptPath.uri}`, e instanceof Error ? e.message : String(e));
				return undefined;
			}
		}));
		const result = [];
		const seen = new ResourceSet();
		for (const detail of details) {
			if (detail) {
				result.push(detail);
				seen.add(detail.promptPath.uri);
			}
		}
		for (const model of this.modelService.getModels()) {
			if (model.getLanguageId() === PROMPT_LANGUAGE_ID && model.uri.scheme === Schemas.untitled && !seen.has(model.uri)) {
				const parsedPromptFile = this.getParsedPromptFile(model);
				result.push(this.asChatPromptSlashCommand(parsedPromptFile, { uri: model.uri, storage: PromptsStorage.local, type: PromptsType.prompt }));
			}
		}
		return result;
	}

	public isValidSlashCommandName(command: string): boolean {
		return command.match(/^[\p{L}\d_\-\.]+$/u) !== null;
	}

	public async resolvePromptSlashCommand(name: string, token: CancellationToken): Promise<IChatPromptSlashCommand | undefined> {
		const commands = await this.getPromptSlashCommands(token);
		return commands.find(cmd => cmd.name === name);
	}

	private asChatPromptSlashCommand(parsedPromptFile: ParsedPromptFile, promptPath: IPromptPath): IChatPromptSlashCommand {
		let name = parsedPromptFile?.header?.name ?? promptPath.name ?? getCleanPromptName(promptPath.uri);
		name = name.replace(/[^\p{L}\d_\-\.]+/gu, '-'); // replace spaces with dashes
		return {
			name: name,
			description: parsedPromptFile?.header?.description ?? promptPath.description,
			argumentHint: parsedPromptFile?.header?.argumentHint,
			parsedPromptFile,
			promptPath
		};
	}

	public async getPromptSlashCommandName(uri: URI, token: CancellationToken): Promise<string> {
		const slashCommands = await this.getPromptSlashCommands(token);
		const slashCommand = slashCommands.find(c => isEqual(c.promptPath.uri, uri));
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
		return this.cachedCustomAgents.onDidChange;
	}

	public async getCustomAgents(token: CancellationToken): Promise<readonly ICustomAgent[]> {
		return this.cachedCustomAgents.get(token);
	}

	private async computeCustomAgents(token: CancellationToken): Promise<readonly ICustomAgent[]> {
		let agentFiles = await this.listPromptFiles(PromptsType.agent, token);
		const disabledAgents = this.getDisabledPromptFiles(PromptsType.agent);
		agentFiles = agentFiles.filter(promptPath => !disabledAgents.has(promptPath.uri));
		const customAgentsResults = await Promise.allSettled(
			agentFiles.map(async (promptPath): Promise<ICustomAgent> => {
				const uri = promptPath.uri;
				const ast = await this.parseNew(uri, token);

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let metadata: any | undefined;
				if (ast.header) {
					const advanced = ast.header.getAttribute(PromptHeaderAttributes.advancedOptions);
					if (advanced && advanced.value.type === 'object') {
						metadata = {};
						for (const [key, value] of Object.entries(advanced.value)) {
							if (['string', 'number', 'boolean'].includes(value.type)) {
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
						const { name, offset } = bodyVarRefs[i];
						const range = new OffsetRange(offset - bodyOffset, offset - bodyOffset + name.length + 1);
						toolReferences.push({ name, range });
					}
				}

				const agentInstructions = {
					content: ast.body?.getContent() ?? '',
					toolReferences,
					metadata,
				} satisfies IAgentInstructions;

				const name = ast.header?.name ?? promptPath.name ?? getCleanPromptName(uri);

				const source: IAgentSource = IAgentSource.fromPromptPath(promptPath);
				if (!ast.header) {
					return { uri, name, agentInstructions, source };
				}
				const { description, model, tools, handOffs, argumentHint, target, infer } = ast.header;
				return { uri, name, description, model, tools, handOffs, argumentHint, target, infer, agentInstructions, source };
			})
		);

		const customAgents: ICustomAgent[] = [];
		for (let i = 0; i < customAgentsResults.length; i++) {
			const result = customAgentsResults[i];
			if (result.status === 'fulfilled') {
				customAgents.push(result.value);
			} else {
				const uri = agentFiles[i].uri;
				const error = result.reason;
				if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
					this.logger.warn(`[computeCustomAgents] Skipping agent file that does not exist: ${uri}`, error.message);
				} else {
					this.logger.error(`[computeCustomAgents] Failed to parse agent file: ${uri}`, error);
				}
			}
		}

		return customAgents;
	}


	public async parseNew(uri: URI, token: CancellationToken): Promise<ParsedPromptFile> {
		const model = this.modelService.getModel(uri);
		if (model) {
			return this.getParsedPromptFile(model);
		}

		// Handle virtual prompt URIs with embedded content in query string
		if (uri.scheme === Schemas.vscodeChatPrompt) {
			const content = decodeURIComponent(uri.query);
			return new PromptFileParser().parse(uri, content);
		}

		const fileContent = await this.fileService.readFile(uri);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return new PromptFileParser().parse(uri, fileContent.value.toString());
	}

	public registerContributedFile(type: PromptsType, uri: URI, extension: IExtensionDescription, name?: string, description?: string) {
		const bucket = this.contributedFiles[type];
		if (bucket.has(uri)) {
			// keep first registration per extension (handler filters duplicates per extension already)
			return Disposable.None;
		}
		const entryPromise = (async () => {
			try {
				await this.filesConfigService.updateReadonly(uri, true);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				this.logger.error(`[registerContributedFile] Failed to make prompt file readonly: ${uri}`, msg);
			}
			return { uri, name, description, storage: PromptsStorage.extension, type, extension, source: ExtensionAgentSourceType.contribution } satisfies IExtensionPromptPath;
		})();
		bucket.set(uri, entryPromise);

		const flushCachesIfRequired = () => {
			this.cachedFileLocations[type] = undefined;
			switch (type) {
				case PromptsType.agent:
					this.cachedCustomAgents.refresh();
					break;
				case PromptsType.prompt:
					this.cachedSlashCommands.refresh();
					break;
			}
		};
		flushCachesIfRequired();
		return {
			dispose: () => {
				bucket.delete(uri);
				flushCachesIfRequired();
			}
		};
	}

	getPromptLocationLabel(promptPath: IPromptPath): string {
		switch (promptPath.storage) {
			case PromptsStorage.local: return this.labelService.getUriLabel(dirname(promptPath.uri), { relative: true });
			case PromptsStorage.user: return localize('user-data-dir.capitalized', 'User Data');
			case PromptsStorage.extension: {
				return localize('extension.with.id', 'Extension: {0}', promptPath.extension.displayName ?? promptPath.extension.id);
			}
			default: throw new Error('Unknown prompt storage type');
		}
	}

	findAgentMDsInWorkspace(token: CancellationToken): Promise<URI[]> {
		return this.fileLocator.findAgentMDsInWorkspace(token);
	}

	public async listAgentMDs(token: CancellationToken, includeNested: boolean): Promise<URI[]> {
		const useAgentMD = this.configurationService.getValue(PromptsConfig.USE_AGENT_MD);
		if (!useAgentMD) {
			return [];
		}
		if (includeNested) {
			return await this.fileLocator.findAgentMDsInWorkspace(token);
		} else {
			return await this.fileLocator.findAgentMDsInWorkspaceRoots(token);
		}
	}

	public async listCopilotInstructionsMDs(token: CancellationToken): Promise<URI[]> {
		const useCopilotInstructionsFiles = this.configurationService.getValue(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES);
		if (!useCopilotInstructionsFiles) {
			return [];
		}
		return await this.fileLocator.findCopilotInstructionsMDsInWorkspace(token);
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
		}
	}

	// Agent skills

	private sanitizeAgentSkillText(text: string): string {
		// Remove XML tags
		return text.replace(/<[^>]+>/g, '');
	}

	private truncateAgentSkillName(name: string, uri: URI): string {
		const MAX_NAME_LENGTH = 64;
		const sanitized = this.sanitizeAgentSkillText(name);
		if (sanitized !== name) {
			this.logger.warn(`[findAgentSkills] Agent skill name contains XML tags, removed: ${uri}`);
		}
		if (sanitized.length > MAX_NAME_LENGTH) {
			this.logger.warn(`[findAgentSkills] Agent skill name exceeds ${MAX_NAME_LENGTH} characters, truncated: ${uri}`);
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
			this.logger.warn(`[findAgentSkills] Agent skill description contains XML tags, removed: ${uri}`);
		}
		if (sanitized.length > MAX_DESCRIPTION_LENGTH) {
			this.logger.warn(`[findAgentSkills] Agent skill description exceeds ${MAX_DESCRIPTION_LENGTH} characters, truncated: ${uri}`);
			return sanitized.substring(0, MAX_DESCRIPTION_LENGTH);
		}
		return sanitized;
	}

	public async findAgentSkills(token: CancellationToken): Promise<IAgentSkill[] | undefined> {
		const useAgentSkills = this.configurationService.getValue(PromptsConfig.USE_AGENT_SKILLS);
		const defaultAccount = await this.defaultAccountService.getDefaultAccount();
		const previewFeaturesEnabled = defaultAccount?.chat_preview_features_enabled ?? true;
		if (useAgentSkills && previewFeaturesEnabled) {
			const result: IAgentSkill[] = [];
			const seenNames = new Set<string>();
			const skillTypes = new Map<string, number>();
			let skippedMissingName = 0;
			let skippedDuplicateName = 0;
			let skippedParseFailed = 0;

			const process = async (uri: URI, skillType: string, scopeType: 'personal' | 'project'): Promise<void> => {
				try {
					const parsedFile = await this.parseNew(uri, token);
					const name = parsedFile.header?.name;
					if (!name) {
						skippedMissingName++;
						this.logger.error(`[findAgentSkills] Agent skill file missing name attribute: ${uri}`);
						return;
					}

					const sanitizedName = this.truncateAgentSkillName(name, uri);

					// Check for duplicate names
					if (seenNames.has(sanitizedName)) {
						skippedDuplicateName++;
						this.logger.warn(`[findAgentSkills] Skipping duplicate agent skill name: ${sanitizedName} at ${uri}`);
						return;
					}

					seenNames.add(sanitizedName);
					const sanitizedDescription = this.truncateAgentSkillDescription(parsedFile.header?.description, uri);
					result.push({ uri, type: scopeType, name: sanitizedName, description: sanitizedDescription } satisfies IAgentSkill);

					// Track skill type
					skillTypes.set(skillType, (skillTypes.get(skillType) || 0) + 1);
				} catch (e) {
					skippedParseFailed++;
					this.logger.error(`[findAgentSkills] Failed to parse Agent skill file: ${uri}`, e instanceof Error ? e.message : String(e));
				}
			};

			const workspaceSkills = await this.fileLocator.findAgentSkillsInWorkspace(token);
			await Promise.all(workspaceSkills.map(({ uri, type }) => process(uri, type, 'project')));
			const userSkills = await this.fileLocator.findAgentSkillsInUserHome(token);
			await Promise.all(userSkills.map(({ uri, type }) => process(uri, type, 'personal')));

			// Send telemetry about skill usage
			type AgentSkillsFoundEvent = {
				totalSkillsFound: number;
				claudePersonal: number;
				claudeWorkspace: number;
				copilotPersonal: number;
				githubWorkspace: number;
				customPersonal: number;
				customWorkspace: number;
				skippedDuplicateName: number;
				skippedMissingName: number;
				skippedParseFailed: number;
			};

			type AgentSkillsFoundClassification = {
				totalSkillsFound: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of agent skills found.' };
				claudePersonal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of Claude personal skills.' };
				claudeWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of Claude workspace skills.' };
				copilotPersonal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of Copilot personal skills.' };
				githubWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of GitHub workspace skills.' };
				customPersonal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of custom personal skills.' };
				customWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of custom workspace skills.' };
				skippedDuplicateName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to duplicate names.' };
				skippedMissingName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to missing name attribute.' };
				skippedParseFailed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to parse failures.' };
				owner: 'pwang347';
				comment: 'Tracks agent skill usage, discovery, and skipped files.';
			};

			this.telemetryService.publicLog2<AgentSkillsFoundEvent, AgentSkillsFoundClassification>('agentSkillsFound', {
				totalSkillsFound: result.length,
				claudePersonal: skillTypes.get('claude-personal') ?? 0,
				claudeWorkspace: skillTypes.get('claude-workspace') ?? 0,
				copilotPersonal: skillTypes.get('copilot-personal') ?? 0,
				githubWorkspace: skillTypes.get('github-workspace') ?? 0,
				customPersonal: skillTypes.get('custom-personal') ?? 0,
				customWorkspace: skillTypes.get('custom-workspace') ?? 0,
				skippedDuplicateName,
				skippedMissingName,
				skippedParseFailed
			});

			return result;
		}
		return undefined;
	}
}

// helpers

class CachedPromise<T> extends Disposable {
	private cachedPromise: Promise<T> | undefined = undefined;
	private onDidUpdatePromiseEmitter: Emitter<void> | undefined = undefined;

	constructor(private readonly computeFn: (token: CancellationToken) => Promise<T>, private readonly getEvent: () => Event<void>, private readonly delay: number = 0) {
		super();
	}

	public get onDidChange(): Event<void> {
		if (!this.onDidUpdatePromiseEmitter) {
			const emitter = this.onDidUpdatePromiseEmitter = this._register(new Emitter<void>());
			const delayer = this._register(new Delayer<void>(this.delay));
			this._register(this.getEvent()(() => {
				this.cachedPromise = undefined;
				delayer.trigger(() => emitter.fire());
			}));
		}
		return this.onDidUpdatePromiseEmitter.event;
	}

	public get(token: CancellationToken): Promise<T> {
		if (this.cachedPromise !== undefined) {
			return this.cachedPromise;
		}
		const result = this.computeFn(token);
		if (!this.onDidUpdatePromiseEmitter) {
			return result; // only cache if there is an event listener
		}
		this.cachedPromise = result;
		this.onDidUpdatePromiseEmitter.fire();
		return result;
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
		};
		const onRemove = (languageId: string, uri: URI) => {
			const promptType = getPromptsTypeForLanguageId(languageId);
			if (promptType !== undefined) {
				this.listeners.get(uri)?.dispose();
				this.listeners.delete(uri);
				this.onDidPromptModelChange.fire({ uri, promptType });
			}
		};
		this._register(modelService.onModelAdded(model => onAdd(model)));
		this._register(modelService.onModelLanguageChanged(e => {
			onRemove(e.oldLanguageId, e.model.uri);
			onAdd(e.model);
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
		} else {
			return {
				storage: promptPath.storage
			};
		}
	}
}

