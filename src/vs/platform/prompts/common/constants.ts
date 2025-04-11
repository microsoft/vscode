/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { basename } from '../../../base/common/path.js';

/**
 * File extension for the reusable prompt files.
 */
export const PROMPT_FILE_EXTENSION = '.prompt.md';

/**
 * Copilot custom instructions file name.
 */
export const COPILOT_CUSTOM_INSTRUCTIONS_FILENAME = 'copilot-instructions.md';

/**
 * Configuration key for the `reusable prompts` feature
 * (also known as `prompt files`, `prompt instructions`, etc.).
 */
export const CONFIG_KEY: string = 'chat.promptFiles';

/**
 * Configuration key for the locations of reusable prompt files.
 */
export const LOCATIONS_CONFIG_KEY: string = 'chat.promptFilesLocations';

/**
 * Default reusable prompt files source folder.
 */
export const DEFAULT_SOURCE_FOLDER = '.github/prompts';

/**
 * Check if provided URI points to a file that with prompt file extension.
 */
export const isPromptFile = (
	fileUri: URI,
): boolean => {
	const filename = basename(fileUri.path);

	const hasPromptFileExtension = filename.endsWith(PROMPT_FILE_EXTENSION);
	const isCustomInstructionsFile = (filename === COPILOT_CUSTOM_INSTRUCTIONS_FILENAME);

	return hasPromptFileExtension || isCustomInstructionsFile;
};

/**
 * Check whether provided URI belongs to an `untitled` document.
 */
export const isUntitled = (
	fileUri: URI,
): boolean => {
	return fileUri.scheme === 'untitled';
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
	// if an untitled document, use it's `path` component as the name
	if (isUntitled(fileUri)) {
		return fileUri.path;
	}

	// any file can be a prompt file if user selects the "prompt" language in
	// the editor, so in this case return the full file name with file extension
	if (isPromptFile(fileUri) === false) {
		return basename(fileUri.path);
	}

	// if a Copilot custom instructions file, remove `markdown` file extension
	// otherwise, remove the `prompt` file extension
	const fileExtension = (fileUri.path.endsWith(COPILOT_CUSTOM_INSTRUCTIONS_FILENAME))
		? '.md'
		: PROMPT_FILE_EXTENSION;

	return basename(fileUri.path, fileExtension);
};
