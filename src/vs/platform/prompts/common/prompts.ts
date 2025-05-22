/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { basename } from '../../../base/common/path.js';

/**
 * What the prompt is used for.
 */
export enum PromptsType {
	instructions = 'instructions',
	prompt = 'prompt',
	mode = 'mode'
}

export function isValidPromptType(type: string): type is PromptsType {
	return Object.values(PromptsType).includes(type as PromptsType);
}

/**
 * File extension for the reusable prompt files.
 */
export const PROMPT_FILE_EXTENSION = '.prompt.md';

/**
 * File extension for the reusable instruction files.
 */
export const INSTRUCTION_FILE_EXTENSION = '.instructions.md';

/**
 * File extension for the modes files.
 */
export const MODE_FILE_EXTENSION = '.chatmode.md';

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
export const PROMPT_LOCATIONS_CONFIG_KEY: string = 'chat.promptFilesLocations';

/**
 * Configuration key for the locations of instructions files.
 */
export const INSTRUCTIONS_LOCATIONS_CONFIG_KEY: string = 'chat.instructionsFilesLocations';

/**
 * Configuration key for the locations of mode files.
 */
export const MODE_LOCATIONS_CONFIG_KEY: string = 'chat.modeFilesLocations';

/**
 * Default reusable prompt files source folder.
 */
export const PROMPT_DEFAULT_SOURCE_FOLDER = '.github/prompts';

/**
 * Default reusable prompt files source folder.
 */
export const INSTRUCTIONS_DEFAULT_SOURCE_FOLDER = '.github/instructions';

/**
 * Default modes source folder.
 */
export const MODE_DEFAULT_SOURCE_FOLDER = '.github/chatmodes';

/**
 * Gets the prompt file type from the provided path.
 */
export function getPromptFileType(fileUri: URI): PromptsType | undefined {
	const filename = basename(fileUri.path);

	if (filename.endsWith(PROMPT_FILE_EXTENSION)) {
		return PromptsType.prompt;
	}

	if (filename.endsWith(INSTRUCTION_FILE_EXTENSION) || (filename === COPILOT_CUSTOM_INSTRUCTIONS_FILENAME)) {
		return PromptsType.instructions;
	}

	if (filename.endsWith(MODE_FILE_EXTENSION)) {
		return PromptsType.mode;
	}

	return undefined;
}

/**
 * Check if provided URI points to a file that with prompt file extension.
 */
export function isPromptOrInstructionsFile(fileUri: URI): boolean {
	return getPromptFileType(fileUri) !== undefined;
}


export function getPromptFileExtension(type: PromptsType): string {
	switch (type) {
		case PromptsType.instructions:
			return INSTRUCTION_FILE_EXTENSION;
		case PromptsType.prompt:
			return PROMPT_FILE_EXTENSION;
		case PromptsType.mode:
			return MODE_FILE_EXTENSION;
		default:
			throw new Error('Unknown prompt type');
	}
}

export function getPromptFileDefaultLocation(type: PromptsType): string {
	switch (type) {
		case PromptsType.instructions:
			return INSTRUCTIONS_DEFAULT_SOURCE_FOLDER;
		case PromptsType.prompt:
			return PROMPT_DEFAULT_SOURCE_FOLDER;
		case PromptsType.mode:
			return MODE_DEFAULT_SOURCE_FOLDER;
		default:
			throw new Error('Unknown prompt type');
	}
}

export function getPromptFileLocationsConfigKey(type: PromptsType): string {
	switch (type) {
		case PromptsType.instructions:
			return INSTRUCTIONS_LOCATIONS_CONFIG_KEY;
		case PromptsType.prompt:
			return PROMPT_LOCATIONS_CONFIG_KEY;
		case PromptsType.mode:
			return MODE_LOCATIONS_CONFIG_KEY;
		default:
			throw new Error('Unknown prompt type');
	}
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

	const extensions = [
		PROMPT_FILE_EXTENSION,
		INSTRUCTION_FILE_EXTENSION,
		MODE_FILE_EXTENSION,
	];

	for (const ext of extensions) {
		if (fileName.endsWith(ext)) {
			return basename(fileUri.path, ext);
		}
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
