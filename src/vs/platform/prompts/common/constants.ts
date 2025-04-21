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
 * File extension for the reusable instruction files.
 */
export const INSTRUCTION_FILE_EXTENSION = '.instructions.md';

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
 * Gets the prompt file type from the provided path.
 */
export function getPromptFileType(fileUri: URI): 'instructions' | 'prompt' | undefined {
	const filename = basename(fileUri.path);

	if (filename.endsWith(PROMPT_FILE_EXTENSION)) {
		return 'prompt';
	}

	if (filename.endsWith(INSTRUCTION_FILE_EXTENSION) || (filename === COPILOT_CUSTOM_INSTRUCTIONS_FILENAME)) {
		return 'instructions';
	}

	return undefined;
}

/**
 * Check if provided URI points to a file that with prompt file extension.
 */
export function isPromptOrInstructionsFile(fileUri: URI): boolean {
	return getPromptFileType(fileUri) !== undefined;
}


export function getPromptFileExtension(type: 'instructions' | 'prompt'): string {
	return type === 'instructions' ? INSTRUCTION_FILE_EXTENSION : PROMPT_FILE_EXTENSION;
}

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
 */
export const getCleanPromptName = (
	fileUri: URI,
): string => {
	const fileName = basename(fileUri.path);

	if (fileName.endsWith(PROMPT_FILE_EXTENSION)) {
		return basename(fileUri.path, PROMPT_FILE_EXTENSION);
	}

	if (fileName.endsWith(INSTRUCTION_FILE_EXTENSION)) {
		return basename(fileUri.path, INSTRUCTION_FILE_EXTENSION);
	}

	if (fileName === COPILOT_CUSTOM_INSTRUCTIONS_FILENAME) {
		return basename(fileUri.path, '.md');
	}

	// because we now rely on the `prompt` language ID that can be explicitly
	// set for any document in the editor, any file can be a "prompt" file, so
	// to account for that, we return the full file name including the file
	// extension for all other cases
	return basename(fileUri.path);
};
