/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { assert } from '../../../base/common/assert.js';
import { basename } from '../../../base/common/path.js';

/**
 * File extension for the reusable prompt files.
 */
export const PROMPT_FILE_EXTENSION = '.prompt.md';

/**
 * Check if provided path is a prompt file.
 */
export const isPromptFile = (
	fileUri: URI,
): boolean => {
	return fileUri
		.path
		.endsWith(PROMPT_FILE_EXTENSION);
};

/**
 * Gets clean prompt name without file extension.
 *
 * @throws If provided path is not a prompt file
 * 		   (does not end with {@link PROMPT_FILE_EXTENSION}).
 */
export const getCleanPromptName = (
	fileUri: URI,
): string => {
	assert(
		isPromptFile(fileUri),
		`Provided path '${fileUri.fsPath}' is not a prompt file.`,
	);

	return basename(fileUri.path, PROMPT_FILE_EXTENSION);
};
