/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../../../base/common/uri.js';
import { assert } from '../../../../../../../../base/common/assert.js';
import { VSBuffer } from '../../../../../../../../base/common/buffer.js';
import { dirname } from '../../../../../../../../base/common/resources.js';
import { FolderExists, InvalidPromptName, PromptExists } from '../errors.js';
import { IFileService } from '../../../../../../../../platform/files/common/files.js';
import { PROMPT_FILE_EXTENSION } from '../../../../../common/promptSyntax/constants.js';
import { BasePromptParser } from '../../../../../common/promptSyntax/parsers/basePromptParser.js';

/**
 * Options for the {@link createPromptFile} utility.
 */
interface ICreatePromptFileOptions {
	/**
	 * Name of the prompt file including file extension.
	 * The file extension must be {@link PROMPT_FILE_EXTENSION}.
	 */
	readonly fileName: string;

	/**
	 * Destination folder of the prompt file.
	 */
	readonly folder: URI;

	/**
	 * Initial contents of the prompt file.
	 */
	readonly content: string;

	fileService: IFileService;
}

/**
 * Create a prompt file at the provided folder and with
 * the provided file content.
 *
 * @throws in the following cases:
 *  - if the prompt filename does not end with {@link PROMPT_FILE_EXTENSION}
 *  - if a folder or file with the same already name exists in the destination folder
 */
export const createPromptFile = async (
	options: ICreatePromptFileOptions,
): Promise<URI> => {
	const { fileName, folder, content, fileService } = options;

	const promptUri = URI.joinPath(folder, fileName);

	assert(
		BasePromptParser.isPromptSnippet(promptUri),
		new InvalidPromptName(fileName),
	);

	// if a folder or file with the same name exists, throw an error
	if (await fileService.exists(promptUri)) {
		const promptInfo = await fileService.resolve(promptUri);

		// throw appropriate error based on the type of the existing entity
		throw (promptInfo.isDirectory)
			? new FolderExists(promptUri.fsPath)
			: new PromptExists(promptUri.fsPath);
	}

	// ensure the parent folder of the prompt file exists
	await fileService.createFolder(dirname(promptUri));

	// create the prompt file with the provided text content
	await fileService.createFile(promptUri, VSBuffer.fromString(content));

	return promptUri;
};
