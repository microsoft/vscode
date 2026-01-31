/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
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
import { getCleanPromptName, IResolvedPromptFile, IResolvedPromptSourceFolder, PromptFileSource } from '../config/promptFileLocations.js';
import { PROMPT_LANGUAGE_ID, PromptsType, getPromptsTypeForLanguageId } from '../promptTypes.js';
import { PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { PromptFileParser, ParsedPromptFile, PromptHeaderAttributes } from '../promptFileParser.js';
import { IAgentInstructions, IAgentSource, IChatPromptSlashCommand, ICustomAgent, IExtensionPromptPath, ILocalPromptPath, IPromptPath, IPromptsService, IAgentSkill, IUserPromptPath, PromptsStorage, ExtensionAgentSourceType, CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT, INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT, IPromptFileContext, IPromptFileResource, PROMPT_FILE_PROVIDER_ACTIVATION_EVENT, SKILL_PROVIDER_ACTIVATION_EVENT, IPromptDiscoveryInfo, IPromptFileDiscoveryResult, ICustomAgentVisibility } from './promptsService.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { Schemas } from '../../../../../../base/common/network.js';

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
		[PromptsType.skill]: new ResourceMap<Promise<IExtensionPromptPath>>(),
	};

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
		@ITelemetryService private readonly telemetryService: ITelemetryService,
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
		providePromptFiles: (context: IPromptFileContext, token: CancellationToken) => Promise<IPromptFileResource[] | undefined>;
	}> = [];

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
				if (type === PromptsType.agent) {
					this.cachedFileLocations[PromptsType.agent] = undefined;
					this.cachedCustomAgents.refresh();
				} else if (type === PromptsType.instructions) {
					this.cachedFileLocations[PromptsType.instructions] = undefined;
				} else if (type === PromptsType.prompt) {
					this.cachedFileLocations[PromptsType.prompt] = undefined;
					this.cachedSlashCommands.refresh();
				} else if (type === PromptsType.skill) {
					this.cachedFileLocations[PromptsType.skill] = undefined;
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
		} else if (type === PromptsType.skill) {
			this.cachedFileLocations[PromptsType.skill] = undefined;
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
					} else if (type === PromptsType.skill) {
						this.cachedFileLocations[PromptsType.skill] = undefined;
					}
				}
			}
		});

		return disposables;
	}

	/**
	 * Shared helper to list prompt files from registered providers for a given type.
	 */
	private async listFromProviders(type: PromptsType, activationEvent: string, token: CancellationToken): Promise<IExtensionPromptPath[]> {
		const result: IExtensionPromptPath[] = [];

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
				if (!files || token.isCancellationRequested) {
					continue;
				}

				for (const file of files) {
					try {
						await this.filesConfigService.updateReadonly(file.uri, true);
					} catch (e) {
						const msg = e instanceof Error ? e.message : String(e);
						this.logger.error(`[listFromProviders] Failed to make file readonly: ${file.uri}`, msg);
					}
					result.push({
						uri: file.uri,
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

		return result;
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

	private async getExtensionPromptFiles(type: PromptsType, token: CancellationToken): Promise<IExtensionPromptPath[]> {
		await this.extensionService.whenInstalledExtensionsRegistered();
		const settledResults = await Promise.allSettled(this.contributedFiles[type].values());
		const contributedFiles = settledResults
			.filter((result): result is PromiseFulfilledResult<IExtensionPromptPath> => result.status === 'fulfilled')
			.map(result => result.value);

		const activationEvent = this.getProviderActivationEvent(type);
		const providerFiles = await this.listFromProviders(type, activationEvent, token);
		return [...contributedFiles, ...providerFiles];
	}

	private getProviderActivationEvent(type: PromptsType): string {
		switch (type) {
			case PromptsType.agent:
				return CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.instructions:
				return INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.prompt:
				return PROMPT_FILE_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.skill:
				return SKILL_PROVIDER_ACTIVATION_EVENT;
		}
	}

	public async getSourceFolders(type: PromptsType): Promise<readonly IPromptPath[]> {
		const result: IPromptPath[] = [];

		if (type === PromptsType.agent) {
			const folders = await this.fileLocator.getAgentSourceFolders();
			for (const uri of folders) {
				result.push({ uri, storage: PromptsStorage.local, type });
			}
		} else {
			for (const uri of await this.fileLocator.getConfigBasedSourceFolders(type)) {
				result.push({ uri, storage: PromptsStorage.local, type });
			}
		}

		if (type !== PromptsType.skill) {
			// no user source folders for skills
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
					return { uri, name, agentInstructions, source, visibility: { userInvokable: true, agentInvokable: true } };
				}
				const visibility = {
					userInvokable: ast.header.userInvokable !== false,
					agentInvokable: ast.header.infer === true || ast.header.disableModelInvocation !== true,
				} satisfies ICustomAgentVisibility;

				const { description, model, tools, handOffs, argumentHint, target, agents } = ast.header;
				return { uri, name, description, model, tools, handOffs, argumentHint, target, visibility, agents, agentInstructions, source };
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
		const skillFolderUri = dirname(uri);
		const folderName = basename(skillFolderUri);
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
		if (!useAgentSkills) {
			return undefined;
		}

		const { files, skillsBySource } = await this.computeSkillDiscoveryInfo(token);

		// Extract loaded skills
		const result: IAgentSkill[] = [];
		for (const file of files) {
			if (file.status === 'loaded' && file.name) {
				const sanitizedDescription = this.truncateAgentSkillDescription(file.description, file.uri);
				result.push({ uri: file.uri, storage: file.storage, name: file.name, description: sanitizedDescription });
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
			configPersonal: number;
			configWorkspace: number;
			extensionContribution: number;
			extensionAPI: number;
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
			configPersonal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of custom configured personal skills.' };
			configWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of custom configured workspace skills.' };
			extensionContribution: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of extension contributed skills.' };
			extensionAPI: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of extension API provided skills.' };
			skippedDuplicateName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to duplicate names.' };
			skippedMissingName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to missing name attribute.' };
			skippedMissingDescription: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to missing description attribute.' };
			skippedNameMismatch: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to name not matching folder name.' };
			skippedParseFailed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of skills skipped due to parse failures.' };
			owner: 'pwang347';
			comment: 'Tracks agent skill usage, discovery, and skipped files.';
		};

		this.telemetryService.publicLog2<AgentSkillsFoundEvent, AgentSkillsFoundClassification>('agentSkillsFound', {
			totalSkillsFound: result.length,
			claudePersonal: skillsBySource.get(PromptFileSource.ClaudePersonal) ?? 0,
			claudeWorkspace: skillsBySource.get(PromptFileSource.ClaudeWorkspace) ?? 0,
			copilotPersonal: skillsBySource.get(PromptFileSource.CopilotPersonal) ?? 0,
			githubWorkspace: skillsBySource.get(PromptFileSource.GitHubWorkspace) ?? 0,
			configWorkspace: skillsBySource.get(PromptFileSource.ConfigWorkspace) ?? 0,
			configPersonal: skillsBySource.get(PromptFileSource.ConfigPersonal) ?? 0,
			extensionContribution: skillsBySource.get(PromptFileSource.ExtensionContribution) ?? 0,
			extensionAPI: skillsBySource.get(PromptFileSource.ExtensionAPI) ?? 0,
			skippedDuplicateName,
			skippedMissingName,
			skippedMissingDescription,
			skippedNameMismatch,
			skippedParseFailed
		});

		return result;
	}

	public async getPromptDiscoveryInfo(type: PromptsType, token: CancellationToken): Promise<IPromptDiscoveryInfo> {
		const files: IPromptFileDiscoveryResult[] = [];

		if (type === PromptsType.skill) {
			return this.getSkillDiscoveryInfo(token);
		} else if (type === PromptsType.agent) {
			return this.getAgentDiscoveryInfo(token);
		} else if (type === PromptsType.prompt) {
			return this.getPromptSlashCommandDiscoveryInfo(token);
		} else if (type === PromptsType.instructions) {
			return this.getInstructionsDiscoveryInfo(token);
		}

		return { type, files };
	}

	private async getSkillDiscoveryInfo(token: CancellationToken): Promise<IPromptDiscoveryInfo> {
		const useAgentSkills = this.configurationService.getValue(PromptsConfig.USE_AGENT_SKILLS);

		if (!useAgentSkills) {
			// Skills disabled - list all files as skipped with 'disabled' reason
			const allFiles = await this.listPromptFiles(PromptsType.skill, token);
			const files: IPromptFileDiscoveryResult[] = allFiles.map(promptPath => ({
				uri: promptPath.uri,
				storage: promptPath.storage,
				status: 'skipped' as const,
				skipReason: 'disabled' as const,
				extensionId: promptPath.extension?.identifier?.value
			}));
			return { type: PromptsType.skill, files };
		}

		const { files } = await this.computeSkillDiscoveryInfo(token);
		return { type: PromptsType.skill, files };
	}

	/**
	 * Shared implementation for skill discovery used by both findAgentSkills and getSkillDiscoveryInfo.
	 * Returns the discovery results and a map of skill counts by source type for telemetry.
	 */
	private async computeSkillDiscoveryInfo(token: CancellationToken): Promise<{
		files: (IPromptFileDiscoveryResult & { description?: string; source?: PromptFileSource })[];
		skillsBySource: Map<PromptFileSource, number>;
	}> {
		const files: (IPromptFileDiscoveryResult & { description?: string; source?: PromptFileSource })[] = [];
		const skillsBySource = new Map<PromptFileSource, number>();
		const seenNames = new Set<string>();
		const nameToUri = new Map<string, URI>();

		// Collect all skills with their metadata for sorting
		const allSkills: Array<IResolvedPromptFile> = [];
		const discoveredSkills = await this.fileLocator.findAgentSkills(token);
		const extensionSkills = await this.getExtensionPromptFiles(PromptsType.skill, token);
		allSkills.push(...discoveredSkills, ...extensionSkills.map((extPath) => ({
			fileUri: extPath.uri,
			storage: extPath.storage,
			source: extPath.source === ExtensionAgentSourceType.contribution ? PromptFileSource.ExtensionContribution : PromptFileSource.ExtensionAPI
		})));

		const getPriority = (skill: IResolvedPromptFile | IExtensionPromptPath): number => {
			if (skill.storage === PromptsStorage.local) {
				return 0; // workspace
			}
			if (skill.storage === PromptsStorage.user) {
				return 1; // personal
			}
			if (skill.source === PromptFileSource.ExtensionAPI) {
				return 2;
			}
			if (skill.source === PromptFileSource.ExtensionContribution) {
				return 3;
			}
			return 4;
		};
		// Stable sort; we should keep order consistent to the order in the user's configuration object
		allSkills.sort((a, b) => getPriority(a) - getPriority(b));

		// Build map of URI to extension ID
		const extensionIdByUri = new Map<string, string>();
		for (const extSkill of extensionSkills) {
			extensionIdByUri.set(extSkill.uri.toString(), extSkill.extension.identifier.value);
		}

		for (const skill of allSkills) {
			const uri = skill.fileUri;
			const storage = skill.storage;
			const source = skill.source;
			const extensionId = extensionIdByUri.get(uri.toString());

			try {
				const parsedFile = await this.parseNew(uri, token);
				const name = parsedFile.header?.name;
				if (!name) {
					this.logger.error(`[computeSkillDiscoveryInfo] Agent skill file missing name attribute: ${uri}`);
					files.push({ uri, storage, status: 'skipped', skipReason: 'missing-name', extensionId, source });
					continue;
				}

				const sanitizedName = this.truncateAgentSkillName(name, uri);
				const skillFolderUri = dirname(uri);
				const folderName = basename(skillFolderUri);
				if (sanitizedName !== folderName) {
					this.logger.error(`[computeSkillDiscoveryInfo] Agent skill name "${sanitizedName}" does not match folder name "${folderName}": ${uri}`);
					files.push({ uri, storage, status: 'skipped', skipReason: 'name-mismatch', name: sanitizedName, extensionId, source });
					continue;
				}

				if (seenNames.has(sanitizedName)) {
					this.logger.warn(`[computeSkillDiscoveryInfo] Skipping duplicate agent skill name: ${sanitizedName} at ${uri}`);
					files.push({ uri, storage, status: 'skipped', skipReason: 'duplicate-name', name: sanitizedName, duplicateOf: nameToUri.get(sanitizedName), extensionId, source });
					continue;
				}

				const description = parsedFile.header?.description;
				if (!description) {
					this.logger.error(`[computeSkillDiscoveryInfo] Agent skill file missing description attribute: ${uri}`);
					files.push({ uri, storage, status: 'skipped', skipReason: 'missing-description', name: sanitizedName, extensionId, source });
					continue;
				}

				seenNames.add(sanitizedName);
				nameToUri.set(sanitizedName, uri);
				files.push({ uri, storage, status: 'loaded', name: sanitizedName, description, extensionId, source });

				// Track skill type
				skillsBySource.set(source, (skillsBySource.get(source) || 0) + 1);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				this.logger.error(`[computeSkillDiscoveryInfo] Failed to validate Agent skill file: ${uri}`, msg);
				files.push({
					uri,
					storage,
					status: 'skipped',
					skipReason: 'parse-error',
					errorMessage: msg,
					extensionId,
					source
				});
			}
		}

		return { files, skillsBySource };
	}

	private async getAgentDiscoveryInfo(token: CancellationToken): Promise<IPromptDiscoveryInfo> {
		const files: IPromptFileDiscoveryResult[] = [];
		const disabledAgents = this.getDisabledPromptFiles(PromptsType.agent);

		const agentFiles = await this.listPromptFiles(PromptsType.agent, token);
		for (const promptPath of agentFiles) {
			const uri = promptPath.uri;
			const storage = promptPath.storage;
			const extensionId = promptPath.extension?.identifier?.value;

			if (disabledAgents.has(uri)) {
				files.push({ uri, storage, status: 'skipped', skipReason: 'disabled', extensionId });
				continue;
			}

			try {
				const ast = await this.parseNew(uri, token);
				const name = ast.header?.name ?? promptPath.name ?? getCleanPromptName(uri);
				files.push({ uri, storage, status: 'loaded', name, extensionId });
			} catch (e) {
				files.push({
					uri,
					storage,
					status: 'skipped',
					skipReason: 'parse-error',
					errorMessage: e instanceof Error ? e.message : String(e),
					extensionId
				});
			}
		}


		return { type: PromptsType.agent, files };
	}

	private async getPromptSlashCommandDiscoveryInfo(token: CancellationToken): Promise<IPromptDiscoveryInfo> {
		const files: IPromptFileDiscoveryResult[] = [];

		const promptFiles = await this.listPromptFiles(PromptsType.prompt, token);
		for (const promptPath of promptFiles) {
			const uri = promptPath.uri;
			const storage = promptPath.storage;
			const extensionId = promptPath.extension?.identifier?.value;

			try {
				const parsedPromptFile = await this.parseNew(uri, token);
				const name = parsedPromptFile?.header?.name ?? promptPath.name ?? getCleanPromptName(uri);
				files.push({ uri, storage, status: 'loaded', name, extensionId });
			} catch (e) {
				files.push({
					uri,
					storage,
					status: 'skipped',
					skipReason: 'parse-error',
					errorMessage: e instanceof Error ? e.message : String(e),
					extensionId
				});
			}
		}

		return { type: PromptsType.prompt, files };
	}

	private async getInstructionsDiscoveryInfo(token: CancellationToken): Promise<IPromptDiscoveryInfo> {
		const files: IPromptFileDiscoveryResult[] = [];

		const instructionsFiles = await this.listPromptFiles(PromptsType.instructions, token);
		for (const promptPath of instructionsFiles) {
			const uri = promptPath.uri;
			const storage = promptPath.storage;
			const extensionId = promptPath.extension?.identifier?.value;

			try {
				const parsedPromptFile = await this.parseNew(uri, token);
				const name = parsedPromptFile?.header?.name ?? promptPath.name ?? getCleanPromptName(uri);
				files.push({ uri, storage, status: 'loaded', name, extensionId });
			} catch (e) {
				files.push({
					uri,
					storage,
					status: 'skipped',
					skipReason: 'parse-error',
					errorMessage: e instanceof Error ? e.message : String(e),
					extensionId
				});
			}
		}

		return { type: PromptsType.instructions, files };
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

