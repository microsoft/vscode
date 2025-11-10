/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { basename } from '../../../../../../base/common/path.js';
import { dirname, isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { type ITextModel } from '../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IFilesConfigurationService } from '../../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { IVariableReference } from '../../chatModes.js';
import { PromptsConfig } from '../config/config.js';
import { getCleanPromptName, PROMPT_FILE_EXTENSION } from '../config/promptFileLocations.js';
import { getPromptsTypeForLanguageId, PROMPT_LANGUAGE_ID, PromptsType, getLanguageIdForPromptsType } from '../promptTypes.js';
import { PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { PromptFileParser, ParsedPromptFile, PromptHeaderAttributes } from '../promptFileParser.js';
import { IAgentInstructions, IAgentSource, IChatPromptSlashCommand, ICustomAgent, IExtensionPromptPath, ILocalPromptPath, IPromptPath, IPromptsService, IUserPromptPath, PromptsStorage } from './promptsService.js';

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
	private cachedCustomAgents: Promise<readonly ICustomAgent[]> | undefined;

	/**
	 * Cache for parsed prompt files keyed by URI.
	 * The number in the returned tuple is textModel.getVersionId(), which is an internal VS Code counter that increments every time the text model's content changes.
	 */
	private parsedPromptFileCache = new ResourceMap<[number, ParsedPromptFile]>();

	/**
	 * Cache for parsed prompt files keyed by command name.
	 */
	private promptFileByCommandCache = new Map<string, { value: ParsedPromptFile | undefined; pendingPromise: Promise<ParsedPromptFile | undefined> | undefined }>();

	private onDidChangeParsedPromptFilesCacheEmitter = new Emitter<void>();

	/**
	 * Contributed files from extensions keyed by prompt type then name.
	 */
	private readonly contributedFiles = {
		[PromptsType.prompt]: new ResourceMap<Promise<IExtensionPromptPath>>(),
		[PromptsType.instructions]: new ResourceMap<Promise<IExtensionPromptPath>>(),
		[PromptsType.agent]: new ResourceMap<Promise<IExtensionPromptPath>>(),
	};

	/**
	 * Lazily created event that is fired when the custom agents change.
	 */
	private onDidChangeCustomAgentsEmitter: Emitter<void> | undefined;

	constructor(
		@ILogService public readonly logger: ILogService,
		@ILabelService private readonly labelService: ILabelService,
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataProfileService private readonly userDataService: IUserDataProfileService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IFilesConfigurationService private readonly filesConfigService: IFilesConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this.onDidChangeParsedPromptFilesCacheEmitter = this._register(new Emitter<void>());

		this.fileLocator = this._register(this.instantiationService.createInstance(PromptFilesLocator));

		const promptUpdateTracker = this._register(new UpdateTracker(this.fileLocator, PromptsType.prompt, this.modelService));
		this._register(promptUpdateTracker.onDidPromptChange((event) => {
			if (event.kind === 'fileSystem') {
				this.promptFileByCommandCache.clear();
			}
			else {
				// Clear cache for prompt files that match the changed URI
				const pendingDeletes: string[] = [];
				for (const [key, value] of this.promptFileByCommandCache) {
					if (isEqual(value.value?.uri, event.uri)) {
						pendingDeletes.push(key);
					}
				}

				for (const key of pendingDeletes) {
					this.promptFileByCommandCache.delete(key);
				}
			}

			this.onDidChangeParsedPromptFilesCacheEmitter.fire();
		}));

		this._register(this.modelService.onModelRemoved((model) => {
			this.parsedPromptFileCache.delete(model.uri);
		}));
	}

	/**
	 * Emitter for the custom agents change event.
	 */
	public get onDidChangeCustomAgents(): Event<void> {
		if (!this.onDidChangeCustomAgentsEmitter) {
			const emitter = this.onDidChangeCustomAgentsEmitter = this._register(new Emitter<void>());
			const updateTracker = this._register(new UpdateTracker(this.fileLocator, PromptsType.agent, this.modelService));
			this._register(updateTracker.onDidPromptChange((event) => {
				this.cachedCustomAgents = undefined; // reset cached custom agents
				emitter.fire();
			}));
		}
		return this.onDidChangeCustomAgentsEmitter.event;
	}

	public get onDidChangeParsedPromptFilesCache(): Event<void> {
		return this.onDidChangeParsedPromptFilesCacheEmitter.event;
	}

	public getPromptFileType(uri: URI): PromptsType | undefined {
		const model = this.modelService.getModel(uri);
		const languageId = model ? model.getLanguageId() : this.languageService.guessLanguageIdByFilepathOrFirstLine(uri);
		return languageId ? getPromptsTypeForLanguageId(languageId) : undefined;
	}

	public getParsedPromptFile(textModel: ITextModel): ParsedPromptFile {
		const cached = this.parsedPromptFileCache.get(textModel.uri);
		if (cached && cached[0] === textModel.getVersionId()) {
			return cached[1];
		}
		const ast = new PromptFileParser().parse(textModel.uri, textModel.getValue());
		if (!cached || cached[0] < textModel.getVersionId()) {
			this.parsedPromptFileCache.set(textModel.uri, [textModel.getVersionId(), ast]);
		}
		return ast;
	}

	public async listPromptFiles(type: PromptsType, token: CancellationToken): Promise<readonly IPromptPath[]> {
		const prompts = await Promise.all([
			this.fileLocator.listFiles(type, PromptsStorage.user, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.user, type } satisfies IUserPromptPath))),
			this.fileLocator.listFiles(type, PromptsStorage.local, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.local, type } satisfies ILocalPromptPath))),
			this.getExtensionContributions(type)
		]);

		return [...prompts.flat()];
	}

	public async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage, token: CancellationToken): Promise<readonly IPromptPath[]> {
		switch (storage) {
			case PromptsStorage.extension:
				return this.getExtensionContributions(type);
			case PromptsStorage.local:
				return this.fileLocator.listFiles(type, PromptsStorage.local, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.local, type } satisfies ILocalPromptPath)));
			case PromptsStorage.user:
				return this.fileLocator.listFiles(type, PromptsStorage.user, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.user, type } satisfies IUserPromptPath)));
			default:
				throw new Error(`[listPromptFilesForStorage] Unsupported prompt storage type: ${storage}`);
		}
	}

	private async getExtensionContributions(type: PromptsType): Promise<IPromptPath[]> {
		return Promise.all(this.contributedFiles[type].values());
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

	public asPromptSlashCommand(command: string): IChatPromptSlashCommand | undefined {
		if (command.match(/^[\p{L}\d_\-\.]+$/u)) {
			return { command, detail: localize('prompt.file.detail', 'Prompt file: {0}', command) };
		}
		return undefined;
	}

	public async resolvePromptSlashCommand(data: IChatPromptSlashCommand, token: CancellationToken): Promise<ParsedPromptFile | undefined> {
		const promptUri = data.promptPath?.uri ?? await this.getPromptPath(data.command);
		if (!promptUri) {
			return undefined;
		}

		try {
			return await this.parseNew(promptUri, token);
		} catch (error) {
			this.logger.error(`[resolvePromptSlashCommand] Failed to parse prompt file: ${promptUri}`, error);
			return undefined;
		}
	}

	private async populatePromptCommandCache(command: string): Promise<ParsedPromptFile | undefined> {
		let cache = this.promptFileByCommandCache.get(command);
		if (cache && cache.pendingPromise) {
			return cache.pendingPromise;
		}

		const newPromise = this.resolvePromptSlashCommand({ command, detail: '' }, CancellationToken.None);
		if (cache) {
			cache.pendingPromise = newPromise;
		}
		else {
			cache = { value: undefined, pendingPromise: newPromise };
			this.promptFileByCommandCache.set(command, cache);
		}

		const newValue = await newPromise.finally(() => cache.pendingPromise = undefined);

		// TODO: consider comparing the newValue and the old and only emit change event when there are value changes
		cache.value = newValue;
		this.onDidChangeParsedPromptFilesCacheEmitter.fire();

		return newValue;
	}

	public resolvePromptSlashCommandFromCache(command: string): ParsedPromptFile | undefined {
		const cache = this.promptFileByCommandCache.get(command);
		const value = cache?.value;
		if (value === undefined) {
			// kick off a async process to refresh the cache while we returns the current cached value
			void this.populatePromptCommandCache(command).catch((error) => { });
		}

		return value;
	}

	private async getPromptDetails(promptPath: IPromptPath): Promise<{ name: string; description?: string }> {
		const parsedPromptFile = await this.parseNew(promptPath.uri, CancellationToken.None).catch(() => undefined);
		return {
			name: parsedPromptFile?.header?.name ?? promptPath.name ?? getCleanPromptName(promptPath.uri),
			description: parsedPromptFile?.header?.description ?? promptPath.description
		};
	}

	private async getPromptPath(command: string): Promise<URI | undefined> {
		const promptPaths = await this.listPromptFiles(PromptsType.prompt, CancellationToken.None);
		for (const promptPath of promptPaths) {
			const details = await this.getPromptDetails(promptPath);
			if (details.name === command) {
				return promptPath.uri;
			}
		}
		const textModel = this.modelService.getModels().find(model => model.getLanguageId() === PROMPT_LANGUAGE_ID && getCommandNameFromURI(model.uri) === command);
		if (textModel) {
			return textModel.uri;
		}
		return undefined;
	}

	public async getPromptCommandName(uri: URI): Promise<string> {
		const promptPaths = await this.listPromptFiles(PromptsType.prompt, CancellationToken.None);
		let promptPath = promptPaths.find(promptPath => isEqual(promptPath.uri, uri));
		if (!promptPath) {
			promptPath = { uri, storage: PromptsStorage.local, type: PromptsType.prompt }; // make up a prompt path
		}
		const { name } = await this.getPromptDetails(promptPath);
		return name;
	}

	public async findPromptSlashCommands(): Promise<IChatPromptSlashCommand[]> {
		const promptFiles = await this.listPromptFiles(PromptsType.prompt, CancellationToken.None);
		return Promise.all(promptFiles.map(async promptPath => {
			const { name } = await this.getPromptDetails(promptPath);
			return {
				command: name,
				detail: localize('prompt.file.detail', 'Prompt file: {0}', this.labelService.getUriLabel(promptPath.uri, { relative: true })),
				promptPath
			};
		}));
	}

	public async getCustomAgents(token: CancellationToken): Promise<readonly ICustomAgent[]> {
		let customAgents = this.cachedCustomAgents;
		if (!customAgents) {
			customAgents = this.computeCustomAgents(token);
			if (this.onDidChangeCustomAgentsEmitter) {
				this.cachedCustomAgents = customAgents;
			}
		}
		const disabledAgents = this.getDisabledPromptFiles(PromptsType.agent);
		return (await customAgents).filter(agent => !disabledAgents.has(agent.uri));
	}

	private async computeCustomAgents(token: CancellationToken): Promise<readonly ICustomAgent[]> {
		const agentFiles = await this.listPromptFiles(PromptsType.agent, token);

		const customAgents = await Promise.all(
			agentFiles.map(async (promptPath): Promise<ICustomAgent> => {
				const uri = promptPath.uri;
				const ast = await this.parseNew(uri, token);

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
				const { description, model, tools, handOffs, argumentHint, target } = ast.header;
				return { uri, name, description, model, tools, handOffs, argumentHint, target, agentInstructions, source };
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
			return { uri, name, description, storage: PromptsStorage.extension, type, extension } satisfies IExtensionPromptPath;
		})();
		bucket.set(uri, entryPromise);

		const updateAgentsIfRequired = () => {
			if (type === PromptsType.agent) {
				this.cachedCustomAgents = undefined;
				this.onDidChangeCustomAgentsEmitter?.fire();
			}
		};
		updateAgentsIfRequired();
		return {
			dispose: () => {
				bucket.delete(uri);
				updateAgentsIfRequired();
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
			this.onDidChangeCustomAgentsEmitter?.fire();
		}
	}

}

function getCommandNameFromURI(uri: URI): string {
	return basename(uri.fsPath, PROMPT_FILE_EXTENSION);
}

export type UpdateKind = 'fileSystem' | 'textModel';

export interface IUpdateEvent {
	kind: UpdateKind;
	uri?: URI;
}

export class UpdateTracker extends Disposable {

	private static readonly PROMPT_UPDATE_DELAY_MS = 200;

	private readonly listeners = new ResourceMap<IDisposable>();
	private readonly onDidPromptModelChange: Emitter<IUpdateEvent>;

	public get onDidPromptChange(): Event<IUpdateEvent> {
		return this.onDidPromptModelChange.event;
	}

	constructor(
		fileLocator: PromptFilesLocator,
		promptType: PromptsType,
		@IModelService modelService: IModelService,
	) {
		super();
		this.onDidPromptModelChange = this._register(new Emitter<IUpdateEvent>());
		const delayer = this._register(new Delayer<void>(UpdateTracker.PROMPT_UPDATE_DELAY_MS));
		const trigger = (event: IUpdateEvent) => delayer.trigger(() => this.onDidPromptModelChange.fire(event));

		const filesUpdatedEventRegistration = this._register(fileLocator.createFilesUpdatedEvent(promptType));
		this._register(filesUpdatedEventRegistration.event(() => trigger({ kind: 'fileSystem' })));

		const onAdd = (model: ITextModel) => {
			if (model.getLanguageId() === getLanguageIdForPromptsType(promptType)) {
				this.listeners.set(model.uri, model.onDidChangeContent(() => trigger({ kind: 'textModel', uri: model.uri })));
			}
		};
		const onRemove = (languageId: string, uri: URI) => {
			if (languageId === getLanguageIdForPromptsType(promptType)) {
				this.listeners.get(uri)?.dispose();
				this.listeners.delete(uri);
				trigger({ kind: 'textModel', uri });
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
				extensionId: promptPath.extension.identifier
			};
		} else {
			return {
				storage: promptPath.storage
			};
		}
	}
}

