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
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IFilesConfigurationService } from '../../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { IVariableReference } from '../../chatModes.js';
import { PromptsConfig } from '../config/config.js';
import { getCleanPromptName } from '../config/promptFileLocations.js';
import { PROMPT_LANGUAGE_ID, PromptsType, getPromptsTypeForLanguageId } from '../promptTypes.js';
import { PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { PromptFileParser, ParsedPromptFile, PromptHeaderAttributes } from '../promptFileParser.js';
import { IAgentInstructions, IAgentSource, IChatPromptSlashCommand, ICustomAgent, IExtensionPromptPath, ILocalPromptPath, IPromptPath, IPromptsService, IClaudeSkill, IUserPromptPath, PromptsStorage, ICustomAgentQueryOptions, IExternalCustomAgent, ExtensionAgentSourceType, CUSTOM_AGENTS_PROVIDER_ACTIVATION_EVENT } from './promptsService.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { Schemas } from '../../../../../../base/common/network.js';

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
		@IExtensionService private readonly extensionService: IExtensionService
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
	 * Registry of CustomAgentsProvider instances. Extensions can register providers via the proposed API.
	 */
	private readonly customAgentsProviders: Array<{
		extension: IExtensionDescription;
		onDidChangeCustomAgents?: Event<void>;
		provideCustomAgents: (options: ICustomAgentQueryOptions, token: CancellationToken) => Promise<IExternalCustomAgent[] | undefined>;
	}> = [];

	/**
	 * Registers a CustomAgentsProvider. This will be called by the extension host bridge when
	 * an extension registers a provider via vscode.chat.registerCustomAgentsProvider().
	 */
	public registerCustomAgentsProvider(extension: IExtensionDescription, provider: {
		onDidChangeCustomAgents?: Event<void>;
		provideCustomAgents: (options: ICustomAgentQueryOptions, token: CancellationToken) => Promise<IExternalCustomAgent[] | undefined>;
	}): IDisposable {
		const providerEntry = { extension, ...provider };
		this.customAgentsProviders.push(providerEntry);

		const disposables = new DisposableStore();

		// Listen to provider change events to rerun computeListPromptFiles
		if (provider.onDidChangeCustomAgents) {
			disposables.add(provider.onDidChangeCustomAgents(() => {
				this.cachedFileLocations[PromptsType.agent] = undefined;
				this.cachedCustomAgents.refresh();
			}));
		}

		// Invalidate agent cache when providers change
		this.cachedFileLocations[PromptsType.agent] = undefined;
		this.cachedCustomAgents.refresh();

		disposables.add({
			dispose: () => {
				const index = this.customAgentsProviders.findIndex((p) => p === providerEntry);
				if (index >= 0) {
					this.customAgentsProviders.splice(index, 1);
					this.cachedFileLocations[PromptsType.agent] = undefined;
					this.cachedCustomAgents.refresh();
				}
			}
		});

		return disposables;
	}

	private async listCustomAgentsFromProvider(token: CancellationToken): Promise<IPromptPath[]> {
		const result: IPromptPath[] = [];

		if (this.customAgentsProviders.length === 0) {
			return result;
		}

		// Activate extensions that might provide custom agents
		await this.extensionService.activateByEvent(CUSTOM_AGENTS_PROVIDER_ACTIVATION_EVENT);

		// Collect agents from all providers
		for (const providerEntry of this.customAgentsProviders) {
			try {
				const agents = await providerEntry.provideCustomAgents({}, token);
				if (!agents || token.isCancellationRequested) {
					continue;
				}

				for (const agent of agents) {
					if (!agent.isEditable) {
						try {
							await this.filesConfigService.updateReadonly(agent.uri, true);
						} catch (e) {
							const msg = e instanceof Error ? e.message : String(e);
							this.logger.error(`[listCustomAgentsFromProvider] Failed to make agent file readonly: ${agent.uri}`, msg);
						}
					}

					result.push({
						uri: agent.uri,
						name: agent.name,
						description: agent.description,
						storage: PromptsStorage.extension,
						type: PromptsType.agent,
						extension: providerEntry.extension,
						source: ExtensionAgentSourceType.provider
					} satisfies IExtensionPromptPath);
				}
			} catch (e) {
				this.logger.error(`[listCustomAgentsFromProvider] Failed to get custom agents from provider`, e instanceof Error ? e.message : String(e));
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

	private async getExtensionPromptFiles(type: PromptsType, token: CancellationToken): Promise<IPromptPath[]> {
		await this.extensionService.whenInstalledExtensionsRegistered();
		const contributedFiles = await Promise.all(this.contributedFiles[type].values());
		if (type === PromptsType.agent) {
			const providerAgents = await this.listCustomAgentsFromProvider(token);
			return [...contributedFiles, ...providerAgents];
		}
		return contributedFiles;
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
		const customAgents = await Promise.all(
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

	public registerContributedFile(type: PromptsType, name: string, description: string, uri: URI, extension: IExtensionDescription) {
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

	// Claude skills

	public async findClaudeSkills(token: CancellationToken): Promise<IClaudeSkill[] | undefined> {
		const useClaudeSkills = this.configurationService.getValue(PromptsConfig.USE_CLAUDE_SKILLS);
		if (useClaudeSkills) {
			const result: IClaudeSkill[] = [];
			const process = async (uri: URI, type: 'personal' | 'project'): Promise<void> => {
				try {
					const parsedFile = await this.parseNew(uri, token);
					const name = parsedFile.header?.name;
					if (name) {
						result.push({ uri, type, name, description: parsedFile.header?.description } satisfies IClaudeSkill);
					} else {
						this.logger.error(`[findClaudeSkills] Claude skill file missing name attribute: ${uri}`);
					}
				} catch (e) {
					this.logger.error(`[findClaudeSkills] Failed to parse Claude skill file: ${uri}`, e instanceof Error ? e.message : String(e));
				}
			};

			const workspaceSkills = await this.fileLocator.findClaudeSkillsInWorkspace(token);
			await Promise.all(workspaceSkills.map(uri => process(uri, 'project')));
			const userSkills = await this.fileLocator.findClaudeSkillsInUserHome(token);
			await Promise.all(userSkills.map(uri => process(uri, 'personal')));
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

