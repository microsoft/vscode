/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { assert } from '../../../../../../base/common/assert.js';
import { basename } from '../../../../../../base/common/path.js';
import { PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ObjectCache } from '../../../../../../base/common/objectCache.js';
import { TextModelPromptParser } from '../parsers/textModelPromptParser.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { PROMPT_FILE_EXTENSION } from '../../../../../../platform/prompts/common/constants.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { IChatPromptSlashCommand, IPromptPath, IPromptsService, TPromptsStorage, TPromptsType } from './types.js';

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
		if (command.match(/^prompt:[\w_\-\.]+/)) {
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
		return files.find(file => getCommandName(file.uri.path) === command);
	}

	public async findPromptSlashCommands(): Promise<IChatPromptSlashCommand[]> {
		const promptFiles = await this.listPromptFiles('prompt');
		return promptFiles.map(promptPath => {
			const command = getCommandName(promptPath.uri.path);
			return {
				command,
				detail: localize('prompt.file.detail', 'Prompt file: {0}', this.labelService.getUriLabel(promptPath.uri, { relative: true })),
				promptPath
			};
		});
	}
}

function getCommandName(path: string) {
	const name = basename(path, PROMPT_FILE_EXTENSION);
	return `prompt:${name}`;
}


/**
 * Utility to add a provided prompt `type` to a prompt URI.
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
