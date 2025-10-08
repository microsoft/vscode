/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { getPromptsTypeForLanguageId, MODE_LANGUAGE_ID, PROMPT_LANGUAGE_ID, PromptsType } from '../promptTypes.js';
import { type URI } from '../../../../../../base/common/uri.js';
import { basename } from '../../../../../../base/common/path.js';
import { PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { type ITextModel } from '../../../../../../editor/common/model.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { IChatPromptSlashCommand, ICustomChatMode, IExtensionPromptPath, ILocalPromptPath, IPromptPath, IPromptsService, IUserPromptPath, PromptsStorage } from './promptsService.js';
import { getCleanPromptName, PROMPT_FILE_EXTENSION } from '../config/promptFileLocations.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { PromptsConfig } from '../config/config.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { NewPromptsParser, ParsedPromptFile } from './newPromptsParser.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { IChatModeInstructions, IVariableReference } from '../../chatModes.js';
import { dirname, isEqual } from '../../../../../../base/common/resources.js';
import { IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { Delayer } from '../../../../../../base/common/async.js';

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
	 * Cached custom modes. Caching only happens if the `onDidChangeCustomChatModes` event is used.
	 */
	private cachedCustomChatModes: Promise<readonly ICustomChatMode[]> | undefined;


	private parsedPromptFileCache = new ResourceMap<[number, ParsedPromptFile]>();

	/**
	 * Contributed files from extensions keyed by prompt type then name.
	 */
	private readonly contributedFiles = {
		[PromptsType.prompt]: new ResourceMap<IExtensionPromptPath>(),
		[PromptsType.instructions]: new ResourceMap<IExtensionPromptPath>(),
		[PromptsType.mode]: new ResourceMap<IExtensionPromptPath>(),
	};

	/**
	 * Lazily created event that is fired when the custom chat modes change.
	 */
	private onDidChangeCustomChatModesEmitter: Emitter<void> | undefined;

	constructor(
		@ILogService public readonly logger: ILogService,
		@ILabelService private readonly labelService: ILabelService,
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataProfileService private readonly userDataService: IUserDataProfileService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		this.fileLocator = this._register(this.instantiationService.createInstance(PromptFilesLocator));

		this._register(this.modelService.onModelRemoved((model) => {
			this.parsedPromptFileCache.delete(model.uri);
		}));
	}

	/**
	 * Emitter for the custom chat modes change event.
	 */
	public get onDidChangeCustomChatModes(): Event<void> {
		if (!this.onDidChangeCustomChatModesEmitter) {
			const emitter = this.onDidChangeCustomChatModesEmitter = this._register(new Emitter<void>());
			const chatModelTracker = this._register(new ChatModeUpdateTracker(this.fileLocator, this.modelService));
			this._register(chatModelTracker.onDidChangeContent(() => {
				this.cachedCustomChatModes = undefined; // reset cached custom chat modes
				emitter.fire();
			}));
		}
		return this.onDidChangeCustomChatModesEmitter.event;
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
		const ast = new NewPromptsParser().parse(textModel.uri, textModel.getValue());
		if (!cached || cached[0] < textModel.getVersionId()) {
			this.parsedPromptFileCache.set(textModel.uri, [textModel.getVersionId(), ast]);
		}
		return ast;
	}

	public async listPromptFiles(type: PromptsType, token: CancellationToken): Promise<readonly IPromptPath[]> {
		if (!PromptsConfig.enabled(this.configurationService)) {
			return [];
		}

		const prompts = await Promise.all([
			this.fileLocator.listFiles(type, PromptsStorage.user, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.user, type } satisfies IUserPromptPath))),
			this.fileLocator.listFiles(type, PromptsStorage.local, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.local, type } satisfies ILocalPromptPath)))
		]);

		return [...prompts.flat(), ...this.contributedFiles[type].values()];
	}

	public async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage, token: CancellationToken): Promise<readonly IPromptPath[]> {
		if (!PromptsConfig.enabled(this.configurationService)) {
			return [];
		}

		switch (storage) {
			case PromptsStorage.extension:
				return Promise.resolve(Array.from(this.contributedFiles[type].values()));
			case PromptsStorage.local:
				return this.fileLocator.listFiles(type, PromptsStorage.local, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.local, type } satisfies ILocalPromptPath)));
			case PromptsStorage.user:
				return this.fileLocator.listFiles(type, PromptsStorage.user, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.user, type } satisfies IUserPromptPath)));
			default:
				throw new Error(`[listPromptFilesForStorage] Unsupported prompt storage type: ${storage}`);
		}
	}

	public getSourceFolders(type: PromptsType): readonly IPromptPath[] {
		if (!PromptsConfig.enabled(this.configurationService)) {
			return [];
		}

		const result: IPromptPath[] = [];

		for (const uri of this.fileLocator.getConfigBasedSourceFolders(type)) {
			result.push({ uri, storage: PromptsStorage.local, type });
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
		const promptUri = await this.getPromptPath(data);
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

	private async getPromptPath(data: IChatPromptSlashCommand): Promise<URI | undefined> {
		if (data.promptPath) {
			return data.promptPath.uri;
		}

		const promptPaths = await this.listPromptFiles(PromptsType.prompt, CancellationToken.None);
		const command = data.command;
		const result = promptPaths.find(promptPath => getCommandNameFromPromptPath(promptPath) === command);
		if (result) {
			return result.uri;
		}
		const textModel = this.modelService.getModels().find(model => model.getLanguageId() === PROMPT_LANGUAGE_ID && getCommandNameFromURI(model.uri) === command);
		if (textModel) {
			return textModel.uri;
		}
		return undefined;
	}

	public async getPromptCommandName(uri: URI): Promise<string> {
		const promptPaths = await this.listPromptFiles(PromptsType.prompt, CancellationToken.None);
		const promptPath = promptPaths.find(promptPath => isEqual(promptPath.uri, uri));
		if (!promptPath) {
			return getCommandNameFromURI(uri);
		}
		return getCommandNameFromPromptPath(promptPath);
	}

	public async findPromptSlashCommands(): Promise<IChatPromptSlashCommand[]> {
		const promptFiles = await this.listPromptFiles(PromptsType.prompt, CancellationToken.None);
		return promptFiles.map(promptPath => {
			const command = getCommandNameFromPromptPath(promptPath);
			return {
				command,
				detail: localize('prompt.file.detail', 'Prompt file: {0}', this.labelService.getUriLabel(promptPath.uri, { relative: true })),
				promptPath
			};
		});
	}

	public async getCustomChatModes(token: CancellationToken): Promise<readonly ICustomChatMode[]> {
		if (!this.cachedCustomChatModes) {
			const customChatModes = this.computeCustomChatModes(token);
			if (!this.onDidChangeCustomChatModesEmitter) {
				return customChatModes;
			}
			this.cachedCustomChatModes = customChatModes;
		}
		return this.cachedCustomChatModes;
	}

	private async computeCustomChatModes(token: CancellationToken): Promise<readonly ICustomChatMode[]> {
		const modeFiles = await this.listPromptFiles(PromptsType.mode, token);

		const customChatModes = await Promise.all(
			modeFiles.map(async ({ uri, name: modeName }): Promise<ICustomChatMode> => {
				const ast = await this.parseNew(uri, token);

				let metadata: any | undefined;
				if (ast.header) {
					const advanced = ast.header.getAttribute('advancedOptions');
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

				const modeInstructions = {
					content: ast.body?.getContent() ?? '',
					toolReferences,
					metadata,
				} satisfies IChatModeInstructions;

				const name = modeName ?? getCleanPromptName(uri);
				if (!ast.header) {
					return { uri, name, modeInstructions };
				}
				const { description, model, tools } = ast.header;
				return { uri, name, description, model, tools, modeInstructions };

			})
		);
		return customChatModes;
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
		return new NewPromptsParser().parse(uri, fileContent.value.toString());
	}

	public registerContributedFile(type: PromptsType, name: string, description: string, uri: URI, extension: IExtensionDescription) {
		const bucket = this.contributedFiles[type];
		if (bucket.has(uri)) {
			// keep first registration per extension (handler filters duplicates per extension already)
			return Disposable.None;
		}
		bucket.set(uri, { uri, name, description, storage: PromptsStorage.extension, type, extension } satisfies IExtensionPromptPath);

		const updateModesIfRequired = () => {
			if (type === PromptsType.mode) {
				this.cachedCustomChatModes = undefined;
				this.onDidChangeCustomChatModesEmitter?.fire();
			}
		};
		updateModesIfRequired();
		return {
			dispose: () => {
				bucket.delete(uri);
				updateModesIfRequired();
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
}

function getCommandNameFromPromptPath(promptPath: IPromptPath): string {
	return promptPath.name ?? getCommandNameFromURI(promptPath.uri);
}

function getCommandNameFromURI(uri: URI): string {
	return basename(uri.fsPath, PROMPT_FILE_EXTENSION);
}

export class ChatModeUpdateTracker extends Disposable {

	private static readonly CHAT_MODE_UPDATE_DELAY_MS = 200;

	private readonly listeners = new ResourceMap<IDisposable>();
	private readonly onDidChatModeModelChange: Emitter<void>;

	public get onDidChangeContent(): Event<void> {
		return this.onDidChatModeModelChange.event;
	}

	constructor(
		fileLocator: PromptFilesLocator,
		@IModelService modelService: IModelService,
	) {
		super();
		this.onDidChatModeModelChange = this._register(new Emitter<void>());
		const delayer = this._register(new Delayer<void>(ChatModeUpdateTracker.CHAT_MODE_UPDATE_DELAY_MS));
		const trigger = () => delayer.trigger(() => this.onDidChatModeModelChange.fire());

		const filesUpdatedEventRegistration = this._register(fileLocator.createFilesUpdatedEvent(PromptsType.mode));
		this._register(filesUpdatedEventRegistration.event(() => trigger()));

		const onAdd = (model: ITextModel) => {
			if (model.getLanguageId() === MODE_LANGUAGE_ID) {
				this.listeners.set(model.uri, model.onDidChangeContent(() => trigger()));
			}
		};
		const onRemove = (languageId: string, uri: URI) => {
			if (languageId === MODE_LANGUAGE_ID) {
				this.listeners.get(uri)?.dispose();
				this.listeners.delete(uri);
				trigger();
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
