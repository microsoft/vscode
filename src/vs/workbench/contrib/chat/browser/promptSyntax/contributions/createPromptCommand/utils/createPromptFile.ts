/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FolderExists, InvalidPromptName } from '../errors.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { assert } from '../../../../../../../../base/common/assert.js';
import { VSBuffer } from '../../../../../../../../base/common/buffer.js';
import { dirname } from '../../../../../../../../base/common/resources.js';
import { IFileService } from '../../../../../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { isPromptOrInstructionsFile, PROMPT_FILE_EXTENSION } from '../../../../../../../../platform/prompts/common/constants.js';

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
	openerService: IOpenerService;
}

/**
 * Create a prompt file at the provided folder and with
 * the provided file content.
 *
 * @throws in the following cases:
 *  - if the `fileName` does not end with {@link PROMPT_FILE_EXTENSION}
 *  - if a folder or file with the same already name exists in the destination folder
 */
export const createPromptFile = async (
	options: ICreatePromptFileOptions,
): Promise<URI> => {
	const { fileName, folder, content, fileService, openerService } = options;

	const promptUri = URI.joinPath(folder, fileName);

	assert(
		isPromptOrInstructionsFile(promptUri),
		new InvalidPromptName(fileName),
	);

	// if a folder or file with the same name exists, throw an error
	if (await fileService.exists(promptUri)) {
		const promptInfo = await fileService.resolve(promptUri);

		// if existing object is a folder, throw an error
		assert(
			!promptInfo.isDirectory,
			new FolderExists(promptUri.fsPath),
		);

		// prompt file already exists so open it
		await openerService.open(promptUri);

		return promptUri;
	}

	// ensure the parent folder of the prompt file exists
	await fileService.createFolder(dirname(promptUri));

	// create the prompt file with the provided text content
	await fileService.createFile(promptUri, VSBuffer.fromString(content));

	return promptUri;
};
