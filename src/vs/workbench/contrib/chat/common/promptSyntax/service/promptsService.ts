/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatMode } from '../../constants.js';
import { flatten, forEach } from './treeUtils.js';
import { localize } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IPromptFileReference } from '../parsers/types.js';
import { match } from '../../../../../../base/common/glob.js';
import { pick } from '../../../../../../base/common/arrays.js';
import { assert } from '../../../../../../base/common/assert.js';
import { basename } from '../../../../../../base/common/path.js';
import { FilePromptParser } from '../parsers/filePromptParser.js';
import { PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ObjectCache } from '../../../../../../base/common/objectCache.js';
import { TextModelPromptParser } from '../parsers/textModelPromptParser.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { PROMPT_FILE_EXTENSION } from '../../../../../../platform/prompts/common/constants.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { IChatPromptSlashCommand, TCombinedToolsMetadata, IMetadata, IPromptPath, IPromptsService, TPromptsStorage, TPromptsType } from './types.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { PROMPT_LANGUAGE_ID } from '../constants.js';

/**
 * Provides prompt services.
 */
export class PromptsService extends Disposable implements IPromptsService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Cache of text model content prompt parsers.
	 */
	private readonly cache: ObjectCache<TextModelPromptParser, ITextModel>;

	/**
	 * Prompt files locator utility.
	 */
	private readonly fileLocator: PromptFilesLocator;

	constructor(
		@IInstantiationService private readonly initService: IInstantiationService,
		@IUserDataProfileService private readonly userDataService: IUserDataProfileService,
		@ILabelService private readonly labelService: ILabelService,
		@IModelService private readonly modelService: IModelService,
	) {
		super();

		this.fileLocator = this.initService.createInstance(PromptFilesLocator);

		// the factory function below creates a new prompt parser object
		// for the provided model, if no active non-disposed parser exists
		this.cache = this._register(
			new ObjectCache((model) => {
				/**
				 * Note! When/if shared with "file" prompts, the `seenReferences` array below must be taken into account.
				 * Otherwise consumers will either see incorrect failing or incorrect successful results, based on their
				 * use case, timing of their calls to the {@link getSyntaxParserFor} function, and state of this service.
				 */
				const parser: TextModelPromptParser = initService.createInstance(
					TextModelPromptParser,
					model,
					[],
				);

				parser.start();

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
		const model = this.modelService.getModels().find(model => model.getLanguageId() === PROMPT_LANGUAGE_ID && getPromptCommandName(model.uri.path) === command);
		if (model) {
			return { uri: model.uri, storage: 'local', type: 'prompt' };
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

	/**
	 * TODO: @legomushroom
	 */
	public async findInstructionFilesFor(
		files: readonly URI[],
	): Promise<readonly URI[]> {
		const result: URI[] = [];

		// TODO: @legomushroom - record timing of the function
		const instructionFiles = await this.listPromptFiles('instructions');

		if (instructionFiles.length === 0) {
			return result;
		}

		const instructions = await this.getAllMetadata(
			instructionFiles.map(pick('uri')),
		);

		for (const instruction of instructions.flatMap(flatten)) {
			const { metadata, uri } = instruction;

			if (metadata.include === undefined) {
				continue;
			}

			// TODO: @legomushroom - return all "global" patterns even if files list is empty?
			for (const file of files) {
				if (match(metadata.include, file.fsPath)) {
					result.push(uri);

					continue;
				}
			}
		}

		return result;
	}

	/**
	 * TODO: @legomushroom
	 */
	public async getAllMetadata(
		files: readonly URI[],
	): Promise<IMetadata[]> {
		const metadata = await Promise.all(
			files.map(async (uri) => {
				const parser = this.initService.createInstance(
					FilePromptParser,
					uri,
					{ allowNonPromptFiles: true },
				).start();

				await parser.allSettled();

				return collectMetadata(parser);
			}),
		);

		return metadata;
	}

	/**
	 * Collect metadata from all headers of all attached prompt files,
	 * and computes resulting `chat mode` and `tools` metadata.
	 *
	 * The `tools` metadata is combined into a single list across all prompt files.
	 * On the other hand, the `chat mode` is computed as the single safest mode
	 * that will satisfy all prompt file attachments. For instance:
	 *
	 *   - `Ask`, `Ask`, `Ask` -> `Ask`
	 *   - `Ask`, `Ask`, `Edit` -> `Edit`
	 *   - `Agent`, `Ask`, `Edit` -> `Agent`
	 */
	// TODO: @legomushroom - update the description
	// TODO: @legomushroom - add unit tests
	public async getCombinedToolsMetadata(
		files: readonly URI[],
	): Promise<TCombinedToolsMetadata> {
		if (files.length === 0) {
			return {
				tools: undefined,
				mode: ChatMode.Ask,
			};
		}

		const filesMetadata = await this.getAllMetadata(files);

		const allTools = filesMetadata
			.map((fileMetadata) => {
				const result: string[] = [];

				let isFirst = true;
				let isRootInAgentMode = false;
				let hasTools = false;

				// TODO: @legomushroom
				let chatMode: ChatMode = leastPrivilegedChatMode();

				forEach(fileMetadata, (node) => {
					const { metadata } = node;
					const { mode, tools } = metadata;

					if (isFirst === true) {
						isFirst = false;

						if ((mode === ChatMode.Agent) || (tools !== undefined)) {
							isRootInAgentMode = true;

							chatMode = ChatMode.Agent;
						}
					}

					chatMode = morePrivilegedChatMode(
						chatMode,
						mode,
					);

					// if not in the agent mode, stop the search
					if (isRootInAgentMode === false) {
						return true;
					}

					if (tools !== undefined) {
						result.push(...tools);
						hasTools = true;
					}

					return false;
				});

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
		let resultingChatMode = leastPrivilegedChatMode();

		const result: string[] = [];
		for (const { tools, mode } of allTools) {
			resultingChatMode = morePrivilegedChatMode(
				resultingChatMode,
				mode,
			);
			if (tools !== undefined) {
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

export function getPromptCommandName(path: string) {
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
