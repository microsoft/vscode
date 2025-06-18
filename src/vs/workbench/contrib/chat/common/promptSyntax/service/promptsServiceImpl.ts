/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { getPromptsTypeForLanguageId, PROMPT_LANGUAGE_ID, PromptsType } from '../promptTypes.js';
import { PromptParser } from '../parsers/promptParser.js';
import { match, splitGlobAware } from '../../../../../../base/common/glob.js';
import { type URI } from '../../../../../../base/common/uri.js';
import { type IPromptFileReference } from '../parsers/types.js';
import { assert } from '../../../../../../base/common/assert.js';
import { basename } from '../../../../../../base/common/path.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
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
import type { IChatPromptSlashCommand, ICustomChatMode, IMetadata, IPromptParserResult, IPromptPath, IPromptsService, TPromptsStorage } from './promptsService.js';
import { getCleanPromptName, PROMPT_FILE_EXTENSION } from '../config/promptFileLocations.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { PromptsConfig } from '../config/config.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';

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
					{ seenReferences: [] },
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
		if (command.match(/^[\w_\-\.]+$/)) {
			return { command, detail: localize('prompt.file.detail', 'Prompt file: {0}', command) };
		}
		return undefined;
	}

	public async resolvePromptSlashCommand(data: IChatPromptSlashCommand, token: CancellationToken): Promise<IPromptParserResult | undefined> {
		const promptUri = await this.getPromptPath(data);
		if (!promptUri) {
			return undefined;
		}
		return await this.parse(promptUri, token);
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
		const modeFiles = (await this.listPromptFiles(PromptsType.mode, token))
			.map(modeFile => modeFile.uri);

		const metadataList = await Promise.all(
			modeFiles.map(async (uri): Promise<ICustomChatMode> => {
				let parser: PromptParser | undefined;
				try {
					// Note! this can be (and should be) improved by using shared parser instances
					// 		 that the `getSyntaxParserFor` method provides for opened documents.
					parser = this.instantiationService.createInstance(
						PromptParser,
						uri,
						{ allowNonPromptFiles: true },
					).start(token);

					await parser.settled();

					const { metadata } = parser;
					const tools = (metadata && ('tools' in metadata))
						? metadata.tools
						: undefined;

					const body = await parser.getBody();
					return {
						uri: uri,
						name: getCleanPromptName(uri),
						description: metadata?.description,
						tools,
						body,
					};
				} finally {
					parser?.dispose();
				}
			}),
		);

		return metadataList;
	}

	public async parse(uri: URI, token: CancellationToken): Promise<IPromptParserResult> {
		let parser: PromptParser | undefined;
		try {
			parser = this.instantiationService.createInstance(PromptParser, uri, { allowNonPromptFiles: true }).start(token);
			await parser.settled();
			// make a copy, to avoid leaking the parser instance
			return {
				uri: parser.uri,
				metadata: parser.metadata,
				topError: parser.topError,
				allValidReferences: parser.allValidReferences.map(ref => ref.uri)
			};
		} finally {
			parser?.dispose();
		}
	}


	public async findInstructionFilesFor(files: readonly URI[], ignoreInstructions?: ResourceSet): Promise<readonly { uri: URI; reason: string }[]> {
		const instructionFiles = await this.listPromptFiles(PromptsType.instructions, CancellationToken.None);
		if (instructionFiles.length === 0) {
			this.logger.trace('[PromptsService#findInstructionFilesFor] No instruction files available.');
			return [];
		}
		this.logger.trace(`[PromptsService#findInstructionFilesFor] ${files.length} input files provided. ${files.map(file => file.toString()).join(', ')}`);
		this.logger.trace(`[PromptsService#findInstructionFilesFor] ${instructionFiles.length} instruction files available.`);

		const result: { uri: URI; reason: string }[] = [];
		const foundFiles = new ResourceSet();
		for (const instructionFile of instructionFiles) {
			const { metadata, uri } = await this.parse(instructionFile.uri, CancellationToken.None);

			if (metadata?.promptType !== PromptsType.instructions) {
				this.logger.trace(`[PromptsService#findInstructionFilesFor] Not an instruction file: ${uri}`);
				continue;
			}

			if (ignoreInstructions?.has(uri) || foundFiles.has(uri)) {
				// the instruction file is already part of the input or has already been processed
				this.logger.trace(`[PromptsService#findInstructionFilesFor] Skipping already processed instruction file: ${uri}`);
				continue;
			}


			const { applyTo } = metadata;
			if (applyTo === undefined) {
				continue;
			}

			const patterns = splitGlobAware(applyTo, ',');
			const patterMatches = (pattern: string): URI | true | false => {
				pattern = pattern.trim();
				if (pattern.length === 0) {
					// if glob pattern is empty, skip it
					return false;
				}
				if (pattern === '**' || pattern === '**/*' || pattern === '*') {
					// if glob pattern is one of the special wildcard values,
					// add the instructions file event if no files are attached
					return true;
				}
				if (!pattern.startsWith('/') && !pattern.startsWith('**/')) {
					// support relative glob patterns, e.g. `src/**/*.js`
					pattern = '**/' + pattern;
				}

				// match each attached file with each glob pattern and
				// add the instructions file if its rule matches the file
				for (const file of files) {
					// if the file is not a valid URI, skip it
					if (match(pattern, file.path)) {
						return file;
					}
				}
				return false;
			};


			let matches = false;
			for (const pattern of patterns) {
				const matchResult = patterMatches(pattern);
				if (matchResult !== false) {
					const reason = matchResult === true ?
						localize('instruction.file.reason.allFiles', 'Automatically attached as pattern is **') :
						localize('instruction.file.reason.specificFile', 'Automatically attached as pattern {0} matches {1}', applyTo, this.labelService.getUriLabel(matchResult, { relative: true }));

					result.push({ uri, reason });
					foundFiles.add(uri);
					this.logger.trace(`[PromptsService#findInstructionFilesFor] ${uri} selected: ${reason}`);
					matches = true;
					break;
				}
			}
			if (!matches) {
				this.logger.trace(`[PromptsService#findInstructionFilesFor]  ${uri} no match: pattern: ${applyTo}`);
			}
		}
		return result;
	}

	public async getAllMetadata(promptUris: readonly URI[]): Promise<IMetadata[]> {
		const metadata = await Promise.all(
			promptUris.map(async (uri) => {
				let parser: PromptParser | undefined;
				try {
					parser = this.instantiationService.createInstance(
						PromptParser,
						uri,
						{ allowNonPromptFiles: true },
					).start();

					await parser.allSettled();

					return collectMetadata(parser);
				} finally {
					parser?.dispose();
				}
			}),
		);

		return metadata;
	}
}

/**
 * Collect all metadata from prompt file references
 * into a single hierarchical tree structure.
 */
function collectMetadata(reference: Pick<IPromptFileReference, 'uri' | 'metadata' | 'references'>): IMetadata {
	const childMetadata = [];
	for (const child of reference.references) {
		if (child.errorCondition !== undefined) {
			continue;
		}

		childMetadata.push(collectMetadata(child));
	}

	const children = (childMetadata.length > 0)
		? childMetadata
		: undefined;

	return {
		uri: reference.uri,
		metadata: reference.metadata,
		children,
	};
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
