/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatMode } from '../../constants.js';
import { localize } from '../../../../../../nls.js';
import { PROMPT_LANGUAGE_ID } from '../constants.js';
import { flatten, forEach } from '../utils/treeUtils.js';
import { PromptParser } from '../parsers/promptParser.js';
import { match } from '../../../../../../base/common/glob.js';
import { pick } from '../../../../../../base/common/arrays.js';
import { type URI } from '../../../../../../base/common/uri.js';
import { type IPromptFileReference } from '../parsers/types.js';
import { assert } from '../../../../../../base/common/assert.js';
import { basename } from '../../../../../../base/common/path.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { type ITextModel } from '../../../../../../editor/common/model.js';
import { ObjectCache } from '../../../../../../base/common/objectCache.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { TextModelPromptParser } from '../parsers/textModelPromptParser.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { logTime, TLogFunction } from '../../../../../../base/common/decorators/logTime.js';
import { PROMPT_FILE_EXTENSION } from '../../../../../../platform/prompts/common/constants.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import type { IChatPromptSlashCommand, TCombinedToolsMetadata, IMetadata, IPromptPath, IPromptsService, TPromptsStorage, TPromptsType } from './types.js';

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
	 * Function used by the `@logTime` decorator to log
	 * execution time of some of the decorated methods.
	 */
	public logTime: TLogFunction;

	constructor(
		@ILogService public readonly logger: ILogService,
		@ILabelService private readonly labelService: ILabelService,
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService private readonly initService: IInstantiationService,
		@IUserDataProfileService private readonly userDataService: IUserDataProfileService,
	) {
		super();

		this.fileLocator = this.initService.createInstance(PromptFilesLocator);
		this.logTime = this.logger.trace.bind(this.logger);

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
				const parser: TextModelPromptParser = initService.createInstance(
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
	 * @throws {Error} if:
	 * 	- the provided model is disposed
	 * 	- newly created parser is disposed immediately on initialization.
	 * 	  See factory function in the {@link constructor} for more info.
	 */
	public getSyntaxParserFor(
		model: ITextModel,
	): TextModelPromptParser & { disposed: false } {
		assert(
			model.isDisposed() === false,
			'Cannot create a prompt syntax parser for a disposed model.',
		);

		return this.cache.get(model);
	}

	public async listPromptFiles(type: TPromptsType): Promise<readonly IPromptPath[]> {
		const userLocations = [this.userDataService.currentProfile.promptsHome];

		const prompts = await Promise.all([
			this.fileLocator.listFilesIn(userLocations, type)
				.then(withType('user', type)),
			this.fileLocator.listFiles(type)
				.then(withType('local', type)),
		]);

		return prompts.flat();
	}

	public getSourceFolders(type: TPromptsType): readonly IPromptPath[] {
		// sanity check to make sure we don't miss a new
		// prompt type that could be added in the future
		assert(
			type === 'prompt' || type === 'instructions',
			`Unknown prompt type '${type}'.`,
		);

		const result: IPromptPath[] = [];

		for (const uri of this.fileLocator.getConfigBasedSourceFolders(type)) {
			result.push({ uri, storage: 'local', type });
		}
		const userHome = this.userDataService.currentProfile.promptsHome;
		result.push({ uri: userHome, storage: 'user', type });

		return result;
	}

	public asPromptSlashCommand(command: string): IChatPromptSlashCommand | undefined {
		if (command.match(/^[\w_\-\.]+/)) {
			return { command, detail: localize('prompt.file.detail', 'Prompt file: {0}', command) };
		}
		return undefined;
	}

	public async resolvePromptSlashCommand(data: IChatPromptSlashCommand): Promise<IPromptPath | undefined> {
		if (data.promptPath) {
			return data.promptPath;
		}
		const files = await this.listPromptFiles('prompt');
		const command = data.command;
		const result = files.find(file => getPromptCommandName(file.uri.path) === command);
		if (result) {
			return result;
		}
		const textModel = this.modelService.getModels().find(model => model.getLanguageId() === PROMPT_LANGUAGE_ID && getPromptCommandName(model.uri.path) === command);
		if (textModel) {
			return { uri: textModel.uri, storage: 'local', type: 'prompt' };
		}
		return undefined;
	}

	public async findPromptSlashCommands(): Promise<IChatPromptSlashCommand[]> {
		const promptFiles = await this.listPromptFiles('prompt');
		return promptFiles.map(promptPath => {
			const command = getPromptCommandName(promptPath.uri.path);
			return {
				command,
				detail: localize('prompt.file.detail', 'Prompt file: {0}', this.labelService.getUriLabel(promptPath.uri, { relative: true })),
				promptPath
			};
		});
	}

	@logTime()
	public async findInstructionFilesFor(
		files: readonly URI[],
	): Promise<readonly URI[]> {
		const instructionFiles = await this.listPromptFiles('instructions');
		if (instructionFiles.length === 0) {
			return [];
		}

		const instructions = await this.getAllMetadata(
			instructionFiles.map(pick('uri')),
		);

		const foundFiles = new ResourceSet();
		for (const instruction of instructions.flatMap(flatten)) {
			const { metadata, uri } = instruction;
			const { applyTo } = metadata;

			if (applyTo === undefined) {
				continue;
			}

			// if glob pattern is one of the special wildcard values,
			// add the instructions file event if no files are attached
			if ((applyTo === '**') || (applyTo === '**/*')) {
				foundFiles.add(uri);

				continue;
			}

			// match each attached file with each glob pattern and
			// add the instructions file if its rule matches the file
			for (const file of files) {
				if (match(applyTo, file.fsPath)) {
					foundFiles.add(uri);
				}
			}
		}

		return [...foundFiles];
	}

	@logTime()
	public async getAllMetadata(
		promptUris: readonly URI[],
	): Promise<IMetadata[]> {
		const metadata = await Promise.all(
			promptUris.map(async (uri) => {
				let parser: PromptParser | undefined;
				try {
					parser = this.initService.createInstance(
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

	@logTime()
	public async getCombinedToolsMetadata(
		promptUris: readonly URI[],
	): Promise<TCombinedToolsMetadata | null> {
		if (promptUris.length === 0) {
			return null;
		}

		const filesMetadata = await this.getAllMetadata(promptUris);

		const allTools = filesMetadata
			.map((fileMetadata) => {
				const result: string[] = [];

				let isFirst = true;
				let isRootInAgentMode = false;
				let hasTools = false;

				let chatMode: ChatMode | undefined;

				forEach((node) => {
					const { metadata } = node;
					const { mode, tools } = metadata;

					if (isFirst === true) {
						isFirst = false;

						if ((mode === ChatMode.Agent) || (tools !== undefined)) {
							isRootInAgentMode = true;

							chatMode = ChatMode.Agent;
						}
					}

					chatMode ??= mode;

					// if both chat modes are set, pick the more privileged one
					if (chatMode && mode) {
						chatMode = morePrivilegedChatMode(
							chatMode,
							mode,
						);
					}

					if (isRootInAgentMode && tools !== undefined) {
						result.push(...tools);
						hasTools = true;
					}

					return false;
				}, fileMetadata);

				if (chatMode === ChatMode.Agent) {
					return {
						tools: (hasTools)
							? [...new Set(result)]
							: undefined,
						mode: ChatMode.Agent,
					};
				}

				return {
					mode: chatMode,
				};
			});

		let hasAnyTools = false;
		let resultingChatMode: ChatMode | undefined;

		const result: string[] = [];
		for (const { tools, mode } of allTools) {
			resultingChatMode ??= mode;

			// if both chat modes are set, pick the more privileged one
			if (resultingChatMode && mode) {
				resultingChatMode = morePrivilegedChatMode(
					resultingChatMode,
					mode,
				);
			}

			if (tools) {
				result.push(...tools);
				hasAnyTools = true;
			}
		}

		if (resultingChatMode === ChatMode.Agent) {
			return {
				tools: (hasAnyTools)
					? [...new Set(result)]
					: undefined,
				mode: resultingChatMode,
			};
		}

		return {
			tools: undefined,
			mode: resultingChatMode,
		};
	}
}

/**
 * Pick a more privileged chat mode between two provided ones.
 */
const morePrivilegedChatMode = (
	chatMode1: ChatMode,
	chatMode2: ChatMode,
): ChatMode => {
	// when modes equal, return one of them
	if (chatMode1 === chatMode2) {
		return chatMode1;
	}

	// when modes are different but one of them is 'agent', use 'agent'
	if ((chatMode1 === ChatMode.Agent) || (chatMode2 === ChatMode.Agent)) {
		return ChatMode.Agent;
	}

	// when modes are different, none of them is 'agent', but one of them
	// is 'edit', use 'edit'
	if ((chatMode1 === ChatMode.Edit) || (chatMode2 === ChatMode.Edit)) {
		return ChatMode.Edit;
	}

	throw new Error(
		[
			'Invalid logic encountered: ',
			`at this point modes '${chatMode1}' and '${chatMode2}' are different, but`,
			`both must have be equal to '${ChatMode.Ask}' at the same time.`,
		].join(' '),
	);
};

/**
 * Collect all metadata from prompt file references
 * into a single hierarchical tree structure.
 */
const collectMetadata = (
	reference: Pick<IPromptFileReference, 'uri' | 'metadata' | 'references'>,
): IMetadata => {
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
};

export function getPromptCommandName(path: string): string {
	const name = basename(path, PROMPT_FILE_EXTENSION);
	return name;
}

/**
 * Utility to add a provided prompt `storage` and
 * `type` attributes to a prompt URI.
 */
const addType = (
	storage: TPromptsStorage,
	type: TPromptsType,
): (uri: URI) => IPromptPath => {
	return (uri) => {
		return { uri, storage, type };
	};
};

/**
 * Utility to add a provided prompt `type` to a list of prompt URIs.
 */
const withType = (
	storage: TPromptsStorage,
	type: TPromptsType,
): (uris: readonly URI[]) => (readonly IPromptPath[]) => {
	return (uris) => {
		return uris
			.map(addType(storage, type));
	};
};
