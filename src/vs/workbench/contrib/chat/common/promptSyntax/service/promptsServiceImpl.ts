/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { getPromptsTypeForLanguageId, PROMPT_LANGUAGE_ID, PromptsType } from '../promptTypes.js';
import { type URI } from '../../../../../../base/common/uri.js';
import { basename } from '../../../../../../base/common/path.js';
import { PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../../base/common/event.js';
import { type ITextModel } from '../../../../../../editor/common/model.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import type { IChatPromptSlashCommand, ICustomChatMode, IPromptPath, IPromptsService, TPromptsStorage } from './promptsService.js';
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
	 * Lazily created event that is fired when the custom chat modes change.
	 */
	private onDidChangeCustomChatModesEvent: Event<void> | undefined;

	constructor(
		@ILogService public readonly logger: ILogService,
		@ILabelService private readonly labelService: ILabelService,
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataProfileService private readonly userDataService: IUserDataProfileService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
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
		if (!this.onDidChangeCustomChatModesEvent) {
			this.onDidChangeCustomChatModesEvent = this._register(this.fileLocator.createFilesUpdatedEvent(PromptsType.mode)).event;
			this._register(this.onDidChangeCustomChatModesEvent(() => {
				this.cachedCustomChatModes = undefined; // reset cached custom chat modes
			}));
		}
		return this.onDidChangeCustomChatModesEvent;
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
			this.fileLocator.listFiles(type, 'user', token)
				.then(withType('user', type)),
			this.fileLocator.listFiles(type, 'local', token)
				.then(withType('local', type)),
		]);

		return prompts.flat();
	}

	public getSourceFolders(type: PromptsType): readonly IPromptPath[] {
		if (!PromptsConfig.enabled(this.configurationService)) {
			return [];
		}

		const result: IPromptPath[] = [];

		for (const uri of this.fileLocator.getConfigBasedSourceFolders(type)) {
			result.push({ uri, storage: 'local', type });
		}
		const userHome = this.userDataService.currentProfile.promptsHome;
		result.push({ uri: userHome, storage: 'user', type });

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

		const files = await this.listPromptFiles(PromptsType.prompt, CancellationToken.None);
		const command = data.command;
		const result = files.find(file => getPromptCommandName(file.uri.path) === command);
		if (result) {
			return result.uri;
		}
		const textModel = this.modelService.getModels().find(model => model.getLanguageId() === PROMPT_LANGUAGE_ID && getPromptCommandName(model.uri.path) === command);
		if (textModel) {
			return textModel.uri;
		}
		return undefined;
	}

	public async findPromptSlashCommands(): Promise<IChatPromptSlashCommand[]> {
		const promptFiles = await this.listPromptFiles(PromptsType.prompt, CancellationToken.None);
		return promptFiles.map(promptPath => {
			const command = getPromptCommandName(promptPath.uri.path);
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
			if (!this.onDidChangeCustomChatModesEvent) {
				return customChatModes;
			}
			this.cachedCustomChatModes = customChatModes;
		}
		return this.cachedCustomChatModes;
	}

	private async computeCustomChatModes(token: CancellationToken): Promise<readonly ICustomChatMode[]> {
		const modeFiles = await this.listPromptFiles(PromptsType.mode, token);

		const customChatModes = await Promise.all(
			modeFiles.map(async ({ uri }): Promise<ICustomChatMode> => {
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

				const name = getCleanPromptName(uri);
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
}

export function getPromptCommandName(path: string): string {
	const name = basename(path, PROMPT_FILE_EXTENSION);
	return name;
}

/**
 * Utility to add a provided prompt `storage` and
 * `type` attributes to a prompt URI.
 */
function addType(storage: TPromptsStorage, type: PromptsType): (uri: URI) => IPromptPath {
	return (uri) => {
		return { uri, storage, type };
	};
}

/**
 * Utility to add a provided prompt `type` to a list of prompt URIs.
 */
function withType(storage: TPromptsStorage, type: PromptsType): (uris: readonly URI[]) => (readonly IPromptPath[]) {
	return (uris) => {
		return uris
			.map(addType(storage, type));
	};
}
