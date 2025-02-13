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
 * Create a prompt file at the provided location and with
 * the provided file content.
 *
 * @throws in the following cases:
 *  - if the prompt filename does not end with {@link PROMPT_FILE_EXTENSION}
 *  - if a folder or file with the same already name exists in the provided location
 */
export const createPromptFile = async (
	promptName: string,
	location: URI,
	content: string,
	fileService: IFileService,
): Promise<URI> => {
	const promptUri = URI.joinPath(location, promptName);

	assert(
		BasePromptParser.isPromptSnippet(promptUri),
		new InvalidPromptName(promptName),
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
