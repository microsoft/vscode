/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { getLanguageIdForPromptsType, getPromptsTypeForLanguageId, MODE_LANGUAGE_ID, PROMPT_LANGUAGE_ID, PromptsType } from '../promptTypes.js';
import { PromptParser } from '../parsers/promptParser.js';
import { type URI } from '../../../../../../base/common/uri.js';
import { assert } from '../../../../../../base/common/assert.js';
import { basename } from '../../../../../../base/common/path.js';
import { PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../../base/common/event.js';
import { type ITextModel } from '../../../../../../editor/common/model.js';
import { ObjectCache } from '../utils/objectCache.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { TextModelPromptParser } from '../parsers/textModelPromptParser.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import type { IChatPromptSlashCommand, ICustomChatMode, IPromptParserResult, IPromptPath, IPromptsService, TPromptsStorage } from './promptsService.js';
import { getCleanPromptName, PROMPT_FILE_EXTENSION } from '../config/promptFileLocations.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { PromptsConfig } from '../config/config.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { PositionOffsetTransformer } from '../../../../../../editor/common/core/text/positionToOffset.js';

/**
 * Provides prompt services.
 */
export class PromptsService extends Disposable implements IPromptsService {
	public declare readonly _serviceBrand: undefined;

	/**
	 * Cache of text model content prompt parsers.
	 */
	private readonly cache: ObjectCache<TextModelPromptParser, ITextModel>;

	/**
	 * Prompt files locator utility.
	 */
	private readonly fileLocator: PromptFilesLocator;

	/**
	 * Cached custom modes. Caching only happens if the `onDidChangeCustomChatModes` event is used.
	 */
	private cachedCustomChatModes: Promise<readonly ICustomChatMode[]> | undefined;

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
	) {
		super();

		this.fileLocator = this._register(this.instantiationService.createInstance(PromptFilesLocator));

		// the factory function below creates a new prompt parser object
		// for the provided model, if no active non-disposed parser exists
		this.cache = this._register(
			new ObjectCache((model) => {
				assert(
					model.isDisposed() === false,
					'Text model must not be disposed.',
				);

				/**
				 * Note! When/if shared with "file" prompts, the `seenReferences` array below must be taken into account.
				 * Otherwise consumers will either see incorrect failing or incorrect successful results, based on their
				 * use case, timing of their calls to the {@link getSyntaxParserFor} function, and state of this service.
				 */
				const parser: TextModelPromptParser = instantiationService.createInstance(
					TextModelPromptParser,
					model,
					{ allowNonPromptFiles: true, languageId: undefined, updateOnChange: true },
				).start();

				// this is a sanity check and the contract of the object cache,
				// we must return a non-disposed object from this factory function
				parser.assertNotDisposed(
					'Created prompt parser must not be disposed.',
				);

				return parser;
			})
		);
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


	/**
	 * @throws {Error} if:
	 * 	- the provided model is disposed
	 * 	- newly created parser is disposed immediately on initialization.
	 * 	  See factory function in the {@link constructor} for more info.
	 */
	public getSyntaxParserFor(model: ITextModel): TextModelPromptParser & { isDisposed: false } {
		assert(
			model.isDisposed() === false,
			'Cannot create a prompt syntax parser for a disposed model.',
		);

		return this.cache.get(model);
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

	public async resolvePromptSlashCommand(data: IChatPromptSlashCommand, token: CancellationToken): Promise<IPromptParserResult | undefined> {
		const promptUri = await this.getPromptPath(data);
		if (!promptUri) {
			return undefined;
		}
		try {
			return await this.parse(promptUri, PromptsType.prompt, token);
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

		const metadataList = await Promise.all(
			modeFiles.map(async ({ uri }): Promise<ICustomChatMode> => {
				let parser: PromptParser | undefined;
				try {
					// Note! this can be (and should be) improved by using shared parser instances
					// 		 that the `getSyntaxParserFor` method provides for opened documents.
					parser = this.instantiationService.createInstance(
						PromptParser,
						uri,
						{ allowNonPromptFiles: true, languageId: MODE_LANGUAGE_ID, updateOnChange: false },
					).start(token);

					const completed = await parser.settled();
					if (!completed) {
						throw new Error(localize('promptParser.notCompleted', "Prompt parser for {0} did not complete.", uri.toString()));
					}

					const body = await parser.getBody();
					const nHeaderLines = parser.header?.range.endLineNumber ?? 0;
					const transformer = new PositionOffsetTransformer(body);
					const variableReferences = parser.variableReferences.map(ref => {
						return {
							name: ref.name,
							range: transformer.getOffsetRange(ref.range.delta(-nHeaderLines))
						};
					}).sort((a, b) => b.range.start - a.range.start); // in reverse order

					const name = getCleanPromptName(uri);

					const metadata = parser.metadata;
					if (metadata?.promptType !== PromptsType.mode) {
						return { uri, name, body, variableReferences };
					}
					const { description, model, tools } = metadata;
					return { uri, name, description, model, tools, body, variableReferences };
				} finally {
					parser?.dispose();
				}
			})
		);

		return metadataList;
	}

	public async parse(uri: URI, type: PromptsType, token: CancellationToken): Promise<IPromptParserResult> {
		let parser: PromptParser | undefined;
		try {
			const languageId = getLanguageIdForPromptsType(type);
			parser = this.instantiationService.createInstance(PromptParser, uri, { allowNonPromptFiles: true, languageId, updateOnChange: false }).start(token);
			const completed = await parser.settled();
			if (!completed) {
				throw new Error(localize('promptParser.notCompleted', "Prompt parser for {0} did not complete.", uri.toString()));
			}
			const fullContent = await parser.getFullContent();
			const transformer = new PositionOffsetTransformer(fullContent);
			const variableReferences = parser.variableReferences.map(ref => {
				return {
					name: ref.name,
					range: transformer.getOffsetRange(ref.range)
				};
			}).sort((a, b) => b.range.start - a.range.start); // in reverse order
			// make a copy, to avoid leaking the parser instance
			return {
				uri: parser.uri,
				metadata: parser.metadata,
				topError: parser.topError,
				variableReferences,
				fileReferences: parser.references.map(ref => ref.uri)
			};
		} finally {
			parser?.dispose();
		}
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
